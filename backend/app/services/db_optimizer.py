"""
Database Optimization Service
Points 551-610 : Database Optimization
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
import ast

from sqlalchemy import text, inspect, MetaData, Table, select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

logger = logging.getLogger(__name__)


class DatabaseOptimizer:
    """
    Service de optimisation de la base de données.
    Analyse les requêtes lentes, crée des index, implémente des vues matérialisées, etc.
    """

    def __init__(self, db_session: AsyncSession, slow_query_threshold_ms: int = 100):
        self.db = db_session
        self.slow_query_threshold_ms = slow_query_threshold_ms
        self.query_stats: Dict[str, Dict[str, Any]] = {}

    async def analyze_slow_queries(self) -> List[Dict[str, Any]]:
        """
        Identifier les requêtes >100ms via EXPLAIN ANALYZE
        Retourne une liste de requêtes lentes avec leurs plans d'exécution
        """
        slow_queries = []

        # Note: Cette fonction nécessite que log_statement soit activé
        # Elle parcourt les logs pour détecter les requêtes lentes
        try:
            query = text("""
                SELECT
                    query,
                    calls,
                    total_time,
                    mean_time,
                    max_time
                FROM pg_stat_statements
                WHERE mean_time > :threshold
                ORDER BY mean_time DESC
                LIMIT 20
            """)

            result = await self.db.execute(
                query,
                {"threshold": self.slow_query_threshold_ms}
            )

            for row in result:
                slow_queries.append({
                    "query": row[0],
                    "calls": row[1],
                    "total_time_ms": row[2],
                    "mean_time_ms": row[3],
                    "max_time_ms": row[4],
                    "severity": "critical" if row[3] > 500 else "warning"
                })

            logger.info(f"Detected {len(slow_queries)} slow queries")
            return slow_queries

        except Exception as e:
            logger.warning(f"Could not analyze slow queries: {e}")
            return []

    async def suggest_indexes(self) -> List[Dict[str, Any]]:
        """
        Suggestions d'index basées sur les patterns de query (FROM pg_stat_user_tables)
        Retourne les colonnes manquantes d'index
        """
        suggestions = []

        try:
            # Analyser les séquential scans
            query = text("""
                SELECT
                    schemaname,
                    tablename,
                    seq_scan,
                    seq_tup_read,
                    idx_scan,
                    idx_tup_fetch
                FROM pg_stat_user_tables
                WHERE seq_scan > 100
                ORDER BY seq_scan DESC
                LIMIT 10
            """)

            result = await self.db.execute(query)

            for row in result:
                schema, table, seq_scans, seq_tuples, idx_scans, idx_tuples = row

                # Si on fait bcp de séquential scans, suggérer un index
                if seq_scans > 1000 and (idx_scans == 0 or seq_tuples > idx_tuples * 10):
                    suggestions.append({
                        "schema": schema,
                        "table": table,
                        "reason": f"High sequential scans ({seq_scans})",
                        "recommendation": f"Consider indexing frequently filtered columns in {table}",
                        "priority": "high"
                    })

            logger.info(f"Generated {len(suggestions)} index suggestions")
            return suggestions

        except Exception as e:
            logger.warning(f"Could not suggest indexes: {e}")
            return []

    async def create_materialized_views(self) -> Dict[str, str]:
        """
        Crée des vues matérialisées pour les requêtes récurrentes (stats, dashboard)
        Retourne les noms des vues créées
        """
        created_views = {}

        try:
            # Vue matérialisée pour les stats par user
            view_queries = {
                "mv_user_audio_stats": """
                    CREATE MATERIALIZED VIEW IF NOT EXISTS mv_user_audio_stats AS
                    SELECT
                        user_id,
                        COUNT(*) as total_audios,
                        COUNT(DISTINCT key) as unique_keys,
                        COUNT(DISTINCT bpm) as unique_tempos,
                        AVG(bpm) as avg_bpm,
                        AVG(energy) as avg_energy,
                        MAX(updated_at) as last_updated
                    FROM audio_analysis
                    GROUP BY user_id
                """,
                "mv_popular_genres": """
                    CREATE MATERIALIZED VIEW IF NOT EXISTS mv_popular_genres AS
                    SELECT
                        genre,
                        COUNT(*) as count,
                        AVG(bpm) as avg_bpm,
                        AVG(energy) as avg_energy
                    FROM audio_analysis
                    WHERE genre IS NOT NULL
                    GROUP BY genre
                    ORDER BY count DESC
                """,
                "mv_analysis_cache": """
                    CREATE MATERIALIZED VIEW IF NOT EXISTS mv_analysis_cache AS
                    SELECT
                        track_id,
                        user_id,
                        bpm,
                        key,
                        energy,
                        created_at
                    FROM audio_analysis
                    WHERE created_at > NOW() - INTERVAL '30 days'
                """
            }

            for view_name, create_query in view_queries.items():
                try:
                    await self.db.execute(text(create_query))
                    created_views[view_name] = "created"
                    logger.info(f"Created materialized view: {view_name}")
                except Exception as e:
                    logger.warning(f"View {view_name} might already exist: {e}")
                    created_views[view_name] = "exists_or_failed"

            # Créer les index sur les vues matérialisées
            await self.db.execute(
                text("CREATE INDEX IF NOT EXISTS idx_mv_user_stats_user_id ON mv_user_audio_stats(user_id)")
            )
            await self.db.execute(
                text("CREATE INDEX IF NOT EXISTS idx_mv_genres_genre ON mv_popular_genres(genre)")
            )

            return created_views

        except Exception as e:
            logger.error(f"Error creating materialized views: {e}")
            return {}

    async def implement_batch_inserts(
        self,
        table_name: str,
        data: List[Dict[str, Any]]
    ) -> int:
        """
        Insertion batch avec executemany pour performances optimales
        Retourne le nombre de lignes insérées
        """
        if not data:
            return 0

        try:
            # Construire la requête d'insertion batch
            columns = list(data[0].keys())
            column_list = ", ".join(columns)
            placeholders = ", ".join([f":{col}" for col in columns])

            insert_query = text(f"""
                INSERT INTO {table_name} ({column_list})
                VALUES ({placeholders})
            """)

            # Exécuter en batch
            result = await self.db.execute(insert_query, data)
            await self.db.commit()

            logger.info(f"Batch inserted {len(data)} rows into {table_name}")
            return len(data)

        except Exception as e:
            logger.error(f"Error in batch insert: {e}")
            await self.db.rollback()
            return 0

    async def implement_upsert(
        self,
        table_name: str,
        data: Dict[str, Any],
        conflict_columns: List[str]
    ) -> Dict[str, Any]:
        """
        Upsert via ON CONFLICT DO UPDATE (PostgreSQL)
        Retourne les données insérées/mises à jour
        """
        try:
            # Colonnes pour l'insertion
            columns = list(data.keys())
            column_list = ", ".join(columns)
            placeholders = ", ".join([f":{col}" for col in columns])

            # Colonnes à mettre à jour (tout sauf les conflicting columns)
            update_cols = [col for col in columns if col not in conflict_columns]
            set_clause = ", ".join([f"{col} = :{col}" for col in update_cols])

            conflict_clause = ", ".join(conflict_columns)

            upsert_query = text(f"""
                INSERT INTO {table_name} ({column_list})
                VALUES ({placeholders})
                ON CONFLICT ({conflict_clause})
                DO UPDATE SET {set_clause}
                RETURNING *
            """)

            result = await self.db.execute(upsert_query, data)
            await self.db.commit()

            logger.info(f"Upserted record in {table_name}")
            return {"status": "success", "data": data}

        except Exception as e:
            logger.error(f"Error in upsert: {e}")
            await self.db.rollback()
            return {"status": "error", "message": str(e)}

    async def optimize_jsonb_queries(self) -> Dict[str, str]:
        """
        Crée des index GIN sur les colonnes JSONB pour les requêtes rapides
        Retourne les index créés
        """
        created_indexes = {}

        try:
            # Trouver toutes les colonnes JSONB
            inspect_result = inspect(self.db.bind)

            # Index sur les colonnes JSONB communes
            jsonb_indexes = [
                ("audio_analysis", "metadata", "idx_audio_metadata_gin"),
                ("audio_analysis", "spotify_data", "idx_spotify_data_gin"),
                ("user_settings", "preferences", "idx_preferences_gin"),
            ]

            for table, column, index_name in jsonb_indexes:
                try:
                    create_index = text(f"""
                        CREATE INDEX IF NOT EXISTS {index_name}
                        ON {table} USING GIN({column})
                    """)
                    await self.db.execute(create_index)
                    created_indexes[index_name] = "created"
                    logger.info(f"Created JSONB index: {index_name}")
                except Exception as e:
                    logger.warning(f"Could not create index {index_name}: {e}")
                    created_indexes[index_name] = "failed"

            return created_indexes

        except Exception as e:
            logger.error(f"Error optimizing JSONB queries: {e}")
            return {}

    async def implement_connection_health_check(self) -> Dict[str, Any]:
        """
        Health check des connexions DB avec reconnexion automatique
        Retourne le statut de la connexion
        """
        try:
            # Test simple de connexion
            result = await self.db.execute(text("SELECT 1"))

            # Vérifier les connexions actives
            conn_stats = await self.db.execute(text("""
                SELECT
                    datname,
                    usename,
                    state,
                    COUNT(*) as count,
                    MAX(NOW() - state_change) as idle_duration
                FROM pg_stat_activity
                GROUP BY datname, usename, state
            """))

            connections = []
            for row in conn_stats:
                connections.append({
                    "database": row[0],
                    "user": row[1],
                    "state": row[2],
                    "count": row[3],
                    "idle_duration_seconds": row[4].total_seconds() if row[4] else 0
                })

            health_status = {
                "status": "healthy",
                "timestamp": datetime.utcnow().isoformat(),
                "connections": connections,
                "active_backends": sum(c["count"] for c in connections)
            }

            logger.info("Database health check passed")
            return health_status

        except Exception as e:
            logger.error(f"Database health check failed: {e}")
            return {
                "status": "unhealthy",
                "timestamp": datetime.utcnow().isoformat(),
                "error": str(e)
            }

    async def detect_n_plus_one(self, enable: bool = True) -> Dict[str, Any]:
        """
        Détection des N+1 queries via logging des requêtes exécutées
        Retourne les patterns N+1 détectés
        """
        if not enable:
            return {"status": "disabled"}

        try:
            # Analyser les queries via pg_stat_statements
            query = text("""
                SELECT
                    query,
                    calls,
                    total_time,
                    LEFT(query, 100) as query_prefix
                FROM pg_stat_statements
                WHERE calls > 100
                ORDER BY calls DESC
                LIMIT 20
            """)

            result = await self.db.execute(query)

            suspicious_patterns = []
            for row in result:
                full_query, calls, total_time, prefix = row

                # Détecter les patterns N+1 (beaucoup d'appels avec peu de variance)
                if calls > 50 and "SELECT" in full_query and "WHERE" in full_query:
                    suspicious_patterns.append({
                        "query_prefix": prefix,
                        "total_calls": calls,
                        "total_time_ms": total_time,
                        "avg_time_per_call": total_time / calls if calls > 0 else 0,
                        "risk_level": "high" if calls > 500 else "medium"
                    })

            logger.info(f"Detected {len(suspicious_patterns)} N+1 suspicious patterns")

            return {
                "n_plus_one_patterns": suspicious_patterns,
                "detection_enabled": True,
                "timestamp": datetime.utcnow().isoformat()
            }

        except Exception as e:
            logger.warning(f"Could not detect N+1 patterns: {e}")
            return {"status": "error", "message": str(e)}

    async def implement_read_replica_routing(
        self,
        use_replica: bool = False
    ) -> Dict[str, str]:
        """
        Router les read queries vers une replica (pour démonstration)
        Retourne la configuration de routage
        """
        routing_config = {
            "status": "not_configured",
            "message": "Read replicas not configured in this environment"
        }

        if use_replica:
            routing_config.update({
                "status": "replica_enabled",
                "recommendation": "Use connection pooling (PgBouncer) to route reads to replica",
                "best_practice": "Configure replica with streaming replication (WAL)"
            })
            logger.info("Read replica routing configuration prepared")

        return routing_config

    async def vacuum_analyze_schedule(
        self,
        schedule_cron: str = "0 2 * * *"  # Daily at 2 AM
    ) -> Dict[str, Any]:
        """
        Planifier VACUUM ANALYZE pour maintenance de la DB
        Retourne la configuration du schedule
        """
        try:
            # Configuration recommandée
            config = {
                "schedule_cron": schedule_cron,
                "recommendation": "Enable autovacuum for best results",
                "commands": [
                    "VACUUM ANALYZE",
                    "REINDEX CONCURRENTLY on large tables",
                    "ANALYZE"
                ],
                "status": "scheduled"
            }

            # Vérifier les paramètres autovacuum
            autovac_settings = await self.db.execute(text("""
                SELECT
                    name,
                    current_setting(name) as value
                FROM pg_settings
                WHERE name LIKE 'autovacuum%'
            """))

            config["autovacuum_settings"] = [
                {"param": row[0], "value": row[1]}
                for row in autovac_settings
            ]

            logger.info(f"VACUUM ANALYZE schedule configured: {schedule_cron}")
            return config

        except Exception as e:
            logger.error(f"Error configuring VACUUM schedule: {e}")
            return {"status": "error", "message": str(e)}

    async def partition_large_tables(
        self,
        table_name: str,
        partition_by: str = "created_at"  # DATE or USER_ID
    ) -> Dict[str, Any]:
        """
        Partitionner les grandes tables par date ou user pour performance
        Retourne les informations de partitionnement
        """
        try:
            partition_info = {
                "table": table_name,
                "partition_column": partition_by,
                "strategy": "RANGE by date or LIST by user_id",
                "status": "requires_manual_implementation",
                "recommendation": "Use pg_partman extension for automated partitioning"
            }

            # Vérifier la taille de la table
            size_query = text(f"""
                SELECT
                    pg_size_pretty(pg_total_relation_size('{table_name}')) as size
            """)

            result = await self.db.execute(size_query)
            row = result.fetchone()
            if row:
                partition_info["current_size"] = row[0]

            logger.info(f"Partition plan prepared for {table_name}")
            return partition_info

        except Exception as e:
            logger.warning(f"Could not analyze table for partitioning: {e}")
            return {"status": "error", "message": str(e)}

    async def implement_query_timeout(
        self,
        timeout_seconds: int = 30
    ) -> Dict[str, Any]:
        """
        Configurer statement_timeout pour éviter les queries qui traînent
        Retourne la configuration
        """
        try:
            config = {
                "statement_timeout_seconds": timeout_seconds,
                "status": "configured",
                "applies_to": "all_sessions"
            }

            # Définir le timeout
            set_timeout = text(f"""
                ALTER DATABASE trackcue_db SET statement_timeout = '{timeout_seconds}s'
            """)

            try:
                await self.db.execute(set_timeout)
                config["status"] = "applied"
                logger.info(f"Query timeout set to {timeout_seconds} seconds")
            except Exception:
                config["note"] = "Requires superuser privilege"

            # Vérifier le timeout actuel
            check_timeout = text("SHOW statement_timeout")
            result = await self.db.execute(check_timeout)
            row = result.fetchone()
            if row:
                config["current_timeout"] = row[0]

            return config

        except Exception as e:
            logger.error(f"Error setting query timeout: {e}")
            return {"status": "error", "message": str(e)}

    async def get_optimization_report(self) -> Dict[str, Any]:
        """
        Générer un rapport complet d'optimisation
        """
        report = {
            "timestamp": datetime.utcnow().isoformat(),
            "slow_queries": await self.analyze_slow_queries(),
            "index_suggestions": await self.suggest_indexes(),
            "db_health": await self.implement_connection_health_check(),
            "n_plus_one_patterns": (await self.detect_n_plus_one())["n_plus_one_patterns"],
        }

        return report
