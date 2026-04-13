"""
AnalyticsService - Data & Analytics pour CueForge
Points 1881-1930: Tracking d'événements, funnels, cohort retention, engagement, etc.
"""

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from enum import Enum
import json
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from sqlalchemy.dialects.postgresql import UUID, JSONB
import uuid
import numpy as np
from dataclasses import dataclass


class EventType(str, Enum):
    """Types d'événements trackés"""
    TRACK_ANALYZED = "track_analyzed"
    EXPORT_DONE = "export_done"
    STEMS_GENERATED = "stems_generated"
    CUES_CREATED = "cues_created"
    SIGNUP = "signup"
    UPLOAD = "upload"
    ANALYZE = "analyze"
    EXPORT = "export"
    SUBSCRIPTION_UPGRADE = "subscription_upgrade"
    SUBSCRIPTION_DOWNGRADE = "subscription_downgrade"


@dataclass
class AnalyticsEvent:
    """Événement analytics"""
    user_id: str
    event_type: EventType
    properties: Dict[str, Any]
    timestamp: datetime = None
    session_id: str = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.utcnow()
        if self.session_id is None:
            self.session_id = str(uuid.uuid4())


@dataclass
class CoreWebVitals:
    """Core Web Vitals metrics"""
    lcp: float  # Largest Contentful Paint (ms)
    fid: float  # First Input Delay (ms)
    cls: float  # Cumulative Layout Shift (0-1)


class AnalyticsService:
    """Service d'analytics pour CueForge"""

    def __init__(self, db: Session):
        self.db = db
        self._init_tables()

    def _init_tables(self) -> None:
        """Initialiser les tables analytics (si nécessaire)"""
        # Remarque: Avec Alembic, ces tables devraient être créées via migrations
        # Ici, on suppose qu'elles existent déjà
        pass

    # ============================================================================
    # 1882: track_event - Tracking d'événements basique
    # ============================================================================
    def track_event(self, event: AnalyticsEvent) -> Dict[str, Any]:
        """
        Tracker un événement utilisateur.

        Args:
            event: L'événement à tracker

        Returns:
            Confirmation de tracking avec ID d'événement
        """
        event_id = str(uuid.uuid4())

        # Sauvegarder en base de données
        # Hypothèse: une table analytics_events existe
        query = """
            INSERT INTO analytics_events
            (id, user_id, event_type, properties, session_id, created_at)
            VALUES (%s, %s, %s, %s, %s, %s)
        """
        self.db.execute(
            query,
            (
                event_id,
                event.user_id,
                event.event_type.value,
                json.dumps(event.properties),
                event.session_id,
                event.timestamp,
            ),
        )
        self.db.commit()

        return {
            "event_id": event_id,
            "tracked_at": datetime.utcnow().isoformat(),
            "event_type": event.event_type.value,
        }

    # ============================================================================
    # 1883: track_funnel - Funnel tracking (signup→upload→analyze→export)
    # ============================================================================
    def track_funnel(
        self, user_id: str, funnel_name: str, step: str, properties: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Tracker une étape d'un funnel.

        Args:
            user_id: ID utilisateur
            funnel_name: Nom du funnel (e.g., "signup_to_export")
            step: Étape du funnel (e.g., "signup", "upload", "analyze", "export")
            properties: Propriétés additionnelles

        Returns:
            Confirmation avec le statut du funnel
        """
        funnel_id = f"funnel_{user_id}_{funnel_name}"
        timestamp = datetime.utcnow()

        query = """
            INSERT INTO analytics_funnels
            (id, user_id, funnel_name, step, properties, step_timestamp)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (id, step) DO UPDATE SET
                step_timestamp = EXCLUDED.step_timestamp
        """
        self.db.execute(
            query,
            (funnel_id, user_id, funnel_name, step, json.dumps(properties or {}), timestamp),
        )
        self.db.commit()

        # Calculer la progression du funnel
        completion = self._calculate_funnel_completion(user_id, funnel_name)

        return {
            "funnel_id": funnel_id,
            "step": step,
            "completion_percent": completion,
            "tracked_at": timestamp.isoformat(),
        }

    def _calculate_funnel_completion(self, user_id: str, funnel_name: str) -> float:
        """Calculer le pourcentage de complétion du funnel"""
        # Hypothèse: funnel_steps est défini pour chaque funnel
        funnel_definitions = {
            "signup_to_export": ["signup", "upload", "analyze", "export"],
            "upload_to_analysis": ["upload", "analyze"],
        }

        if funnel_name not in funnel_definitions:
            return 0.0

        steps = funnel_definitions[funnel_name]
        query = f"""
            SELECT COUNT(DISTINCT step) as completed_steps
            FROM analytics_funnels
            WHERE user_id = %s AND funnel_name = %s AND step = ANY(%s)
        """
        result = self.db.execute(query, (user_id, funnel_name, steps)).fetchone()

        completed = result[0] if result else 0
        return (completed / len(steps)) * 100

    # ============================================================================
    # 1884: compute_cohort_retention - Rétention par cohorte (jour/semaine/mois)
    # ============================================================================
    def compute_cohort_retention(
        self, period: str = "week"  # "day", "week", "month"
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Calculer la rétention par cohorte.

        Args:
            period: Période de groupement ("day", "week", "month")

        Returns:
            Tableau de rétention (cohort_date -> [retention_day_0, 1, 2, ...])
        """
        if period == "day":
            delta = timedelta(days=1)
        elif period == "week":
            delta = timedelta(weeks=1)
        else:  # month
            delta = timedelta(days=30)

        # Récupérer les utilisateurs avec dates d'inscription
        query = """
            SELECT user_id, DATE_TRUNC(%s, created_at) as cohort_date
            FROM users
            WHERE created_at > NOW() - INTERVAL '90 days'
            GROUP BY user_id, DATE_TRUNC(%s, created_at)
        """
        period_sql = "day" if period == "day" else ("week" if period == "week" else "month")
        cohorts = self.db.execute(query, (period_sql, period_sql)).fetchall()

        retention_data = {}

        for user_id, cohort_date in cohorts:
            cohort_key = cohort_date.isoformat()
            if cohort_key not in retention_data:
                retention_data[cohort_key] = []

            # Compter les jours/semaines d'activité depuis la cohort
            activity_query = """
                SELECT COUNT(DISTINCT DATE_TRUNC(%s, created_at)) as active_periods
                FROM analytics_events
                WHERE user_id = %s AND created_at >= %s
            """
            result = self.db.execute(activity_query, (period_sql, user_id, cohort_date)).fetchone()
            active_periods = result[0] if result else 0
            retention_data[cohort_key].append(active_periods)

        # Calculer les pourcentages de rétention
        retention_percentages = {}
        for cohort_date, activity_counts in retention_data.items():
            cohort_size = len(activity_counts)
            if cohort_size > 0:
                retention_percentages[cohort_date] = {
                    "cohort_size": cohort_size,
                    "retention_curve": [
                        (count / cohort_size) * 100 if count > 0 else 0 for count in activity_counts
                    ],
                }

        return retention_percentages

    # ============================================================================
    # 1885: measure_feature_adoption - Adoption par feature
    # ============================================================================
    def measure_feature_adoption(self) -> Dict[str, Dict[str, Any]]:
        """
        Mesurer l'adoption des features (stems, cues, export, etc.).

        Returns:
            Adoption par feature avec stats
        """
        features = ["stems_generation", "cue_creation", "export_rekordbox", "export_serato", "stems_ai"]

        adoption_data = {}

        for feature in features:
            query = """
                SELECT COUNT(DISTINCT user_id) as adopters,
                       COUNT(*) as total_uses,
                       AVG(CAST(properties->>'duration' AS FLOAT)) as avg_processing_time
                FROM analytics_events
                WHERE event_type = %s
                  AND created_at > NOW() - INTERVAL '30 days'
            """
            result = self.db.execute(query, (feature,)).fetchone()

            total_users_query = "SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '30 days'"
            total_users = self.db.execute(total_users_query).fetchone()[0]

            adopters = result[0] if result else 0
            total_uses = result[1] if result else 0
            avg_time = result[2] if result else 0

            adoption_data[feature] = {
                "adopters": adopters,
                "adoption_rate_percent": (adopters / total_users * 100) if total_users > 0 else 0,
                "total_uses": total_uses,
                "avg_processing_time_ms": avg_time or 0,
            }

        return adoption_data

    # ============================================================================
    # 1886: compute_engagement_score - Score d'engagement par user
    # ============================================================================
    def compute_engagement_score(self, user_id: str) -> Dict[str, Any]:
        """
        Calculer un score d'engagement pour un utilisateur.
        Basé sur: événements, analyse, exports, sessions actives, etc.

        Args:
            user_id: ID utilisateur

        Returns:
            Score d'engagement (0-100) et breakdown
        """
        # Nombre d'événements cette semaine
        events_week = self.db.execute(
            """
            SELECT COUNT(*) FROM analytics_events
            WHERE user_id = %s AND created_at > NOW() - INTERVAL '7 days'
            """,
            (user_id,),
        ).fetchone()[0]

        # Nombre d'analyses cette semaine
        analyses_week = self.db.execute(
            """
            SELECT COUNT(*) FROM analytics_events
            WHERE user_id = %s AND event_type = %s
              AND created_at > NOW() - INTERVAL '7 days'
            """,
            (user_id, "track_analyzed"),
        ).fetchone()[0]

        # Exports cette semaine
        exports_week = self.db.execute(
            """
            SELECT COUNT(*) FROM analytics_events
            WHERE user_id = %s AND event_type = %s
              AND created_at > NOW() - INTERVAL '7 days'
            """,
            (user_id, "export_done"),
        ).fetchone()[0]

        # Jours actifs ce mois
        active_days = self.db.execute(
            """
            SELECT COUNT(DISTINCT DATE(created_at)) FROM analytics_events
            WHERE user_id = %s AND created_at > NOW() - INTERVAL '30 days'
            """,
            (user_id,),
        ).fetchone()[0]

        # Calcul du score: (0-100)
        score = min(
            100,
            (events_week * 5) + (analyses_week * 10) + (exports_week * 15) + (active_days * 2),
        )

        return {
            "engagement_score": score,
            "breakdown": {
                "events_week": events_week,
                "analyses_week": analyses_week,
                "exports_week": exports_week,
                "active_days_month": active_days,
            },
            "category": "high" if score > 70 else ("medium" if score > 30 else "low"),
        }

    # ============================================================================
    # 1887: track_core_web_vitals - LCP, FID, CLS tracking
    # ============================================================================
    def track_core_web_vitals(self, user_id: str, vitals: CoreWebVitals) -> Dict[str, Any]:
        """
        Tracker les Core Web Vitals (LCP, FID, CLS).

        Args:
            user_id: ID utilisateur
            vitals: CoreWebVitals object

        Returns:
            Confirmation avec statut
        """
        timestamp = datetime.utcnow()
        vitals_id = str(uuid.uuid4())

        query = """
            INSERT INTO core_web_vitals
            (id, user_id, lcp, fid, cls, created_at)
            VALUES (%s, %s, %s, %s, %s, %s)
        """
        self.db.execute(query, (vitals_id, user_id, vitals.lcp, vitals.fid, vitals.cls, timestamp))
        self.db.commit()

        # Évaluation des seuils
        lcp_status = "good" if vitals.lcp <= 2500 else ("needs_improvement" if vitals.lcp <= 4000 else "poor")
        fid_status = "good" if vitals.fid <= 100 else ("needs_improvement" if vitals.fid <= 300 else "poor")
        cls_status = "good" if vitals.cls <= 0.1 else ("needs_improvement" if vitals.cls <= 0.25 else "poor")

        return {
            "vitals_id": vitals_id,
            "lcp": {"value": vitals.lcp, "status": lcp_status},
            "fid": {"value": vitals.fid, "status": fid_status},
            "cls": {"value": vitals.cls, "status": cls_status},
            "tracked_at": timestamp.isoformat(),
        }

    # ============================================================================
    # 1888: compute_churn_risk - Prédiction de churn (ML simple)
    # ============================================================================
    def compute_churn_risk(self, user_id: str) -> Dict[str, Any]:
        """
        Prédire le risque de churn pour un utilisateur.
        Basé sur: inactivité, engagement déclinant, non-utilisation de features premium.

        Args:
            user_id: ID utilisateur

        Returns:
            Churn risk (0-100) et facteurs
        """
        now = datetime.utcnow()

        # Jours depuis dernière activité
        last_activity = self.db.execute(
            """
            SELECT MAX(created_at) FROM analytics_events WHERE user_id = %s
            """,
            (user_id,),
        ).fetchone()[0]

        days_inactive = (now - last_activity).days if last_activity else 999

        # Engagement score
        engagement = self.compute_engagement_score(user_id)["engagement_score"]

        # Fréquence d'utilisation: événements par mois
        monthly_events = self.db.execute(
            """
            SELECT COUNT(*) FROM analytics_events
            WHERE user_id = %s AND created_at > NOW() - INTERVAL '30 days'
            """,
            (user_id,),
        ).fetchone()[0]

        # Calcul du risque
        inactivity_risk = min(100, days_inactive * 5)  # 5 points par jour inactif
        engagement_risk = 100 - engagement  # Inverse du score d'engagement
        usage_risk = 0 if monthly_events > 5 else (50 if monthly_events > 0 else 100)

        churn_risk = (inactivity_risk * 0.5 + engagement_risk * 0.3 + usage_risk * 0.2)

        return {
            "churn_risk_score": min(100, churn_risk),
            "risk_category": "high" if churn_risk > 70 else ("medium" if churn_risk > 40 else "low"),
            "factors": {
                "days_inactive": days_inactive,
                "engagement_score": engagement,
                "monthly_events": monthly_events,
                "inactivity_risk": inactivity_risk,
                "engagement_risk": engagement_risk,
                "usage_risk": usage_risk,
            },
        }

    # ============================================================================
    # 1889: generate_usage_report - Rapport d'utilisation par user/plan
    # ============================================================================
    def generate_usage_report(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Générer un rapport d'utilisation.

        Args:
            user_id: ID utilisateur (None = rapport global)

        Returns:
            Rapport d'utilisation détaillé
        """
        if user_id:
            # Rapport utilisateur individuel
            return self._generate_user_report(user_id)
        else:
            # Rapport global par plan
            return self._generate_plan_report()

    def _generate_user_report(self, user_id: str) -> Dict[str, Any]:
        """Rapport pour un utilisateur spécifique"""
        query = """
            SELECT
                u.id, u.email, u.plan,
                COUNT(ae.id) as total_events,
                SUM(CASE WHEN ae.event_type = 'track_analyzed' THEN 1 ELSE 0 END) as tracks_analyzed,
                SUM(CASE WHEN ae.event_type = 'export_done' THEN 1 ELSE 0 END) as exports_done,
                SUM(CASE WHEN ae.event_type = 'stems_generated' THEN 1 ELSE 0 END) as stems_generated,
                SUM(CASE WHEN ae.event_type = 'cues_created' THEN 1 ELSE 0 END) as cues_created
            FROM users u
            LEFT JOIN analytics_events ae ON u.id = ae.user_id
            WHERE u.id = %s
            GROUP BY u.id, u.email, u.plan
        """
        result = self.db.execute(query, (user_id,)).fetchone()

        if not result:
            return {"error": "User not found"}

        return {
            "user_id": result[0],
            "email": result[1],
            "plan": result[2],
            "total_events": result[3] or 0,
            "tracks_analyzed": result[4] or 0,
            "exports_done": result[5] or 0,
            "stems_generated": result[6] or 0,
            "cues_created": result[7] or 0,
        }

    def _generate_plan_report(self) -> Dict[str, List[Dict[str, Any]]]:
        """Rapport global par plan"""
        query = """
            SELECT
                u.plan,
                COUNT(DISTINCT u.id) as active_users,
                AVG(ae_count.event_count) as avg_events_per_user,
                SUM(ae_count.event_count) as total_events
            FROM users u
            LEFT JOIN (
                SELECT user_id, COUNT(*) as event_count
                FROM analytics_events
                GROUP BY user_id
            ) ae_count ON u.id = ae_count.user_id
            GROUP BY u.plan
        """
        results = self.db.execute(query).fetchall()

        return {
            "by_plan": [
                {
                    "plan": r[0],
                    "active_users": r[1],
                    "avg_events_per_user": round(r[2] or 0, 2),
                    "total_events": r[3] or 0,
                }
                for r in results
            ]
        }

    # ============================================================================
    # 1890: track_conversion - Conversion free→pro→premium
    # ============================================================================
    def track_conversion(
        self, user_id: str, from_plan: str, to_plan: str, event_properties: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Tracker une conversion de plan.

        Args:
            user_id: ID utilisateur
            from_plan: Plan avant ("free", "pro", "premium")
            to_plan: Plan après
            event_properties: Propriétés additionnelles

        Returns:
            Confirmation de tracking
        """
        event = AnalyticsEvent(
            user_id=user_id,
            event_type=EventType.SUBSCRIPTION_UPGRADE if to_plan > from_plan else EventType.SUBSCRIPTION_DOWNGRADE,
            properties={
                "from_plan": from_plan,
                "to_plan": to_plan,
                **(event_properties or {}),
            },
        )

        return self.track_event(event)

    # ============================================================================
    # 1891: compute_ltv - Lifetime value estimation
    # ============================================================================
    def compute_ltv(self, user_id: str) -> Dict[str, Any]:
        """
        Estimer la Lifetime Value d'un utilisateur.
        Basé sur: plan, durée d'abonnement, fréquence d'utilisation, churn risk.

        Args:
            user_id: ID utilisateur

        Returns:
            LTV estimée et breakdown
        """
        # Récupérer les infos utilisateur
        user_query = """
            SELECT plan, created_at, subscription_start_date
            FROM users WHERE id = %s
        """
        user = self.db.execute(user_query, (user_id,)).fetchone()

        if not user:
            return {"error": "User not found"}

        plan, created_at, subscription_start_date = user

        # Plan pricing (en $/mois)
        plan_pricing = {"free": 0, "pro": 29, "premium": 99}
        monthly_revenue = plan_pricing.get(plan, 0)

        # Durée d'abonnement en mois
        sub_start = subscription_start_date or created_at
        months_as_customer = max(1, (datetime.utcnow() - sub_start).days / 30)

        # Churn risk → durée de vie estimée
        churn_data = self.compute_churn_risk(user_id)
        churn_risk = churn_data["churn_risk_score"]
        estimated_remaining_months = max(1, (100 - churn_risk) / 10)  # Formule simple

        # LTV = ARPU * Durée de vie moyenne
        ltv = monthly_revenue * (months_as_customer + estimated_remaining_months)

        return {
            "user_id": user_id,
            "plan": plan,
            "monthly_revenue": monthly_revenue,
            "months_as_customer": round(months_as_customer, 2),
            "estimated_remaining_months": round(estimated_remaining_months, 2),
            "ltv": round(ltv, 2),
            "churn_risk": churn_risk,
        }
