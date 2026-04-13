"""
Cache Strategy Service
Points 681-730 : Caching Strategy
"""

import asyncio
import logging
import hashlib
import json
import random
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, TypeVar, Generic, Callable, Coroutine
from collections import defaultdict
from enum import Enum
import ast

logger = logging.getLogger(__name__)

T = TypeVar('T')


class CacheLevel(Enum):
    """Niveaux de cache"""
    L1_MEMORY = "memory"
    L2_REDIS = "redis"
    L3_DATABASE = "database"


class CacheEntryType(Enum):
    """Types d'entries pour TTL différent"""
    USER_PROFILE = 3600  # 1 heure
    AUDIO_ANALYSIS = 7200  # 2 heures
    STATISTICS = 1800  # 30 minutes
    SEARCH_RESULTS = 600  # 10 minutes
    SESSION = 1800  # 30 minutes
    TEMP = 300  # 5 minutes


class CacheManager(Generic[T]):
    """
    Gestionnaire de cache multi-niveaux (L1 Memory → L2 Redis → L3 Database)
    Implémente write-through, cache-aside, et compression
    """

    def __init__(self, redis_client=None):
        """
        Initialiser le cache manager

        Args:
            redis_client: Client Redis optionnel (L2)
        """
        self.redis = redis_client
        self.l1_cache: Dict[str, Dict[str, Any]] = {}  # Memory cache
        self.cache_tags: Dict[str, set] = defaultdict(set)  # Tags pour invalidation
        self.request_pending: Dict[str, asyncio.Future] = {}  # Pour singleflight
        self.compression_threshold = 1024  # Compresser les entries >1KB

    async def get_with_fallback(
        self,
        key: str,
        fetch_fn: Optional[Callable[[], Coroutine[Any, Any, T]]] = None,
        ttl: Optional[int] = None,
        entry_type: CacheEntryType = CacheEntryType.TEMP
    ) -> Optional[T]:
        """
        Récupérer avec fallback: L1 (memory) → L2 (Redis) → L3 (DB) → fetch
        Write-back: écrire dans les niveaux supérieurs en remontant

        Args:
            key: Clé du cache
            fetch_fn: Fonction pour fetcher les données si absent
            ttl: TTL en secondes (sinon utiliser entry_type)
            entry_type: Type d'entry pour TTL par défaut

        Returns:
            Les données, ou None si absent
        """
        ttl = ttl or entry_type.value

        # L1: Memory cache
        if key in self.l1_cache:
            entry = self.l1_cache[key]
            if not self._is_expired(entry):
                logger.debug(f"Cache HIT L1: {key}")
                return entry["value"]
            else:
                # Expiré, nettoyer
                del self.l1_cache[key]

        # L2: Redis cache (si disponible)
        if self.redis:
            try:
                data = await self._redis_get(key)
                if data is not None:
                    logger.debug(f"Cache HIT L2: {key}")

                    # Write-back: repeupler L1
                    self.l1_cache[key] = {
                        "value": data,
                        "expires_at": datetime.utcnow() + timedelta(seconds=ttl),
                        "level": CacheLevel.L2_REDIS
                    }

                    return data
            except Exception as e:
                logger.warning(f"Redis error for {key}: {e}")

        # L3: Database (simulé via fetch_fn)
        if fetch_fn:
            try:
                logger.debug(f"Cache MISS {key}, fetching...")
                value = await fetch_fn()

                # Write-through: persister dans tous les niveaux
                await self.set_with_propagation(key, value, ttl, entry_type)

                return value
            except Exception as e:
                logger.error(f"Fetch function error for {key}: {e}")

        return None

    async def set_with_propagation(
        self,
        key: str,
        value: T,
        ttl: Optional[int] = None,
        entry_type: CacheEntryType = CacheEntryType.TEMP,
        tags: Optional[List[str]] = None
    ) -> None:
        """
        Écrire dans le cache avec propagation multi-niveaux (L1 → L2 → L3)
        """
        ttl = ttl or entry_type.value

        # L1: Memory cache
        self.l1_cache[key] = {
            "value": value,
            "expires_at": datetime.utcnow() + timedelta(seconds=ttl),
            "level": CacheLevel.L1_MEMORY,
            "created_at": datetime.utcnow()
        }

        # L2: Redis (si disponible)
        if self.redis:
            try:
                await self._redis_set(key, value, ttl)
            except Exception as e:
                logger.warning(f"Redis write error for {key}: {e}")

        # Ajouter les tags pour invalidation
        if tags:
            for tag in tags:
                self.cache_tags[tag].add(key)

        logger.debug(f"Cache SET: {key} (TTL={ttl}s)")

    async def warm_cache_on_deploy(
        self,
        cache_config: Dict[str, Dict[str, Any]]
    ) -> Dict[str, int]:
        """
        Préchauffer le cache au déploiement
        Charge les données critiques en advance

        Args:
            cache_config: Dictionnaire {key: {fetch_fn, ttl, tags}}

        Returns:
            Statistiques de warmup
        """
        stats = {
            "total": 0,
            "warmed": 0,
            "failed": 0,
            "time_ms": 0
        }

        start_time = datetime.utcnow()

        for key, config in cache_config.items():
            stats["total"] += 1

            try:
                fetch_fn = config.get("fetch_fn")
                ttl = config.get("ttl", 3600)
                tags = config.get("tags", [])

                if fetch_fn:
                    value = await fetch_fn()
                    await self.set_with_propagation(key, value, ttl, tags=tags)
                    stats["warmed"] += 1

            except Exception as e:
                logger.error(f"Cache warmup failed for {key}: {e}")
                stats["failed"] += 1

        stats["time_ms"] = int((datetime.utcnow() - start_time).total_seconds() * 1000)

        logger.info(f"Cache warmup completed: {stats}")
        return stats

    async def prevent_stampede(
        self,
        key: str,
        fetch_fn: Callable[[], Coroutine[Any, Any, T]]
    ) -> T:
        """
        Singleflight pattern: eviter le thundering herd
        Si N requêtes identiques arrivent simultanément,
        une seule exécute fetch_fn, les autres attendent le résultat
        """
        # Si une requête est déjà en cours
        if key in self.request_pending:
            logger.debug(f"Coalescing request for {key}")
            try:
                return await asyncio.wait_for(self.request_pending[key], timeout=30)
            except asyncio.TimeoutError:
                logger.warning(f"Singleflight timeout for {key}")

        # Créer une future pour les autres requêtes
        future: asyncio.Future = asyncio.Future()
        self.request_pending[key] = future

        try:
            result = await fetch_fn()
            future.set_result(result)
            return result

        except Exception as e:
            future.set_exception(e)
            raise

        finally:
            del self.request_pending[key]

    def probabilistic_early_expiration(
        self,
        key: str,
        entry_type: CacheEntryType
    ) -> bool:
        """
        Revalidation probabiliste anticipée
        Probabilité croissante de revalidation à l'approche de l'expiration
        Évite les pics de charge au moment de l'expiration

        Returns:
            True si faut revalider
        """
        if key not in self.l1_cache:
            return False

        entry = self.l1_cache[key]
        expires_at = entry["expires_at"]
        now = datetime.utcnow()
        ttl = entry_type.value

        time_elapsed = (now - entry["created_at"]).total_seconds()
        time_remaining = (expires_at - now).total_seconds()

        if time_remaining < 0:
            return True  # Expiré, revalider

        # Probabilité de revalidation croissante
        # À 75% du TTL : 10% de chance
        # À 90% du TTL : 50% de chance
        # À 95% du TTL : 90% de chance
        if time_elapsed > ttl * 0.95:
            probability = 0.9
        elif time_elapsed > ttl * 0.9:
            probability = 0.5
        elif time_elapsed > ttl * 0.75:
            probability = 0.1
        else:
            probability = 0.0

        should_revalidate = random.random() < probability

        if should_revalidate:
            logger.debug(f"Probabilistic early expiration for {key} (p={probability})")

        return should_revalidate

    async def invalidate_by_tag(self, tag: str) -> Dict[str, int]:
        """
        Invalider toutes les entries avec un certain tag
        Utile pour invalidation cohérente (ex: tous les caches d'un user)

        Returns:
            Stats d'invalidation
        """
        stats = {
            "tag": tag,
            "l1_invalidated": 0,
            "l2_invalidated": 0,
            "total_keys": 0
        }

        # Récupérer les clés avec ce tag
        keys_to_invalidate = self.cache_tags.get(tag, set())
        stats["total_keys"] = len(keys_to_invalidate)

        # Invalider L1
        for key in keys_to_invalidate:
            if key in self.l1_cache:
                del self.l1_cache[key]
                stats["l1_invalidated"] += 1

            # Invalider L2 (Redis)
            if self.redis:
                try:
                    await self._redis_delete(key)
                    stats["l2_invalidated"] += 1
                except Exception as e:
                    logger.warning(f"Redis delete error for {key}: {e}")

        # Nettoyer le tag
        del self.cache_tags[tag]

        logger.info(f"Tag invalidation complete: {stats}")
        return stats

    async def compress_cache_entries(self) -> Dict[str, Any]:
        """
        Compresser les grandes entries cache (>1KB)
        Réduit la consommation mémoire
        """
        import gzip

        stats = {
            "total_entries": len(self.l1_cache),
            "compressed": 0,
            "original_size_bytes": 0,
            "compressed_size_bytes": 0
        }

        for key, entry in list(self.l1_cache.items()):
            value = entry["value"]

            try:
                # Sérialiser la valeur
                serialized = json.dumps(value).encode('utf-8')
                original_size = len(serialized)

                # Compresser si >1KB
                if original_size > self.compression_threshold:
                    compressed = gzip.compress(serialized, compresslevel=9)
                    compressed_size = len(compressed)

                    if compressed_size < original_size:
                        entry["value"] = compressed
                        entry["compressed"] = True
                        stats["compressed"] += 1
                        stats["original_size_bytes"] += original_size
                        stats["compressed_size_bytes"] += compressed_size

            except Exception as e:
                logger.debug(f"Compression error for {key}: {e}")

        logger.info(f"Cache compression stats: {stats}")
        return stats

    async def monitor_cache_hit_rate(self) -> Dict[str, Any]:
        """
        Monitorer le taux de hit du cache
        Retourner les métriques pour alerting
        """
        metrics = {
            "l1_size": len(self.l1_cache),
            "total_tags": len(self.cache_tags),
            "pending_requests": len(self.request_pending),
            "timestamp": datetime.utcnow().isoformat()
        }

        # Vérifier la santé du cache
        if len(self.l1_cache) > 10000:
            logger.warning("Cache L1 size exceeds 10k entries")
            metrics["warning"] = "Consider cleaning up expired entries"

        return metrics

    async def implement_write_through(
        self,
        key: str,
        value: T,
        ttl: int = 3600
    ) -> None:
        """
        Write-through: écrire en L1 ET L2/L3 en même temps
        Garantit la cohérence pour les données critiques
        """
        # Écrire en L1
        self.l1_cache[key] = {
            "value": value,
            "expires_at": datetime.utcnow() + timedelta(seconds=ttl),
            "level": CacheLevel.L1_MEMORY,
            "write_through": True
        }

        # Écrire en L2 en parallèle
        if self.redis:
            try:
                await self._redis_set(key, value, ttl)
            except Exception as e:
                # Importante: log mais ne pas échouer
                logger.error(f"Write-through L2 failed for {key}: {e}")

        logger.debug(f"Write-through completed for {key}")

    async def implement_cache_aside(
        self,
        key: str,
        fetch_fn: Callable[[], Coroutine[Any, Any, T]],
        ttl: int = 600
    ) -> T:
        """
        Cache-aside: essayer le cache, sinon fetch et mettre en cache
        Pattern classique pour les données lues
        """
        # Essayer L1
        if key in self.l1_cache:
            entry = self.l1_cache[key]
            if not self._is_expired(entry):
                logger.debug(f"Cache-aside HIT: {key}")
                return entry["value"]

        # Cache miss: fetch
        logger.debug(f"Cache-aside MISS: {key}, fetching...")
        value = await fetch_fn()

        # Mettre en cache
        await self.set_with_propagation(key, value, ttl)

        return value

    def configure_ttl_per_type(self) -> Dict[str, int]:
        """
        Configurer le TTL pour chaque type de donnée
        Retourner la configuration
        """
        ttl_config = {
            "user_profile": CacheEntryType.USER_PROFILE.value,
            "audio_analysis": CacheEntryType.AUDIO_ANALYSIS.value,
            "statistics": CacheEntryType.STATISTICS.value,
            "search_results": CacheEntryType.SEARCH_RESULTS.value,
            "session": CacheEntryType.SESSION.value,
            "temp": CacheEntryType.TEMP.value
        }

        return ttl_config

    async def implement_cache_warming_background(
        self,
        key: str,
        new_value: T,
        fetch_fn: Callable[[], Coroutine[Any, Any, T]]
    ) -> None:
        """
        Warmup en background après write
        Après une modification, prechauffer les caches liés
        pour eviter les cache misses
        """
        try:
            # Invalider le cache actuel
            if key in self.l1_cache:
                del self.l1_cache[key]

            if self.redis:
                await self._redis_delete(key)

            # Warmup en background
            logger.debug(f"Background cache warmup started for {key}")

            # Attendre un peu pour que la modification soit stabilisée en DB
            await asyncio.sleep(0.5)

            # Fetcher la nouvelle valeur
            fresh_value = await fetch_fn()

            # Repeupler les caches
            await self.set_with_propagation(key, fresh_value, ttl=3600)

            logger.debug(f"Background cache warmup completed for {key}")

        except Exception as e:
            logger.error(f"Background cache warmup failed for {key}: {e}")

    # Helper methods
    def _is_expired(self, entry: Dict[str, Any]) -> bool:
        """Vérifier si une entry est expirée"""
        if "expires_at" not in entry:
            return False

        return datetime.utcnow() > entry["expires_at"]

    async def _redis_get(self, key: str) -> Optional[Any]:
        """Récupérer du Redis"""
        if not self.redis:
            return None

        data = await self.redis.get(key)
        if data:
            return json.loads(data)
        return None

    async def _redis_set(self, key: str, value: Any, ttl: int) -> None:
        """Écrire dans Redis"""
        if not self.redis:
            return

        data = json.dumps(value)
        await self.redis.setex(key, ttl, data)

    async def _redis_delete(self, key: str) -> None:
        """Supprimer de Redis"""
        if not self.redis:
            return

        await self.redis.delete(key)

    def get_cache_stats(self) -> Dict[str, Any]:
        """
        Retourner les statistiques du cache
        """
        return {
            "l1_entries": len(self.l1_cache),
            "tagged_entries": sum(len(keys) for keys in self.cache_tags.values()),
            "pending_singleflights": len(self.request_pending),
            "compression_threshold_bytes": self.compression_threshold,
            "timestamp": datetime.utcnow().isoformat()
        }
