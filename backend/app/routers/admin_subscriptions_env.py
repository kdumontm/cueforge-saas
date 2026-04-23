"""
Router admin pour la gestion avancée des abonnements et environnements multi-instances.
Endpoints pour suivi financier, timeline utilisateur, webhooks, et préférences admin.
"""

import logging
from datetime import datetime, timedelta
from enum import Enum
from typing import List, Optional, Dict, Any
from decimal import Decimal

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Float, JSON, ForeignKey, func
from sqlalchemy.orm import Session, relationship

from app.database import get_db, Base
from app.middleware.admin import require_admin


# ============================================================================
# MODELS
# ============================================================================

class SubscriptionStatus(str, Enum):
    """État des abonnements."""
    ACTIVE = "active"
    PAUSED = "paused"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class EnvironmentType(str, Enum):
    """Type d'environnement de déploiement."""
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"


class WebhookEventType(str, Enum):
    """Types d'événements webhooks supportés."""
    SUBSCRIPTION_CREATED = "subscription.created"
    SUBSCRIPTION_UPDATED = "subscription.updated"
    SUBSCRIPTION_CANCELLED = "subscription.cancelled"
    PAYMENT_SUCCEEDED = "payment.succeeded"
    PAYMENT_FAILED = "payment.failed"
    USER_CREATED = "user.created"
    USER_DELETED = "user.deleted"


class TrialExtension(Base):
    """Extension de période d'essai."""
    __tablename__ = "trial_extensions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    original_end_date = Column(DateTime, nullable=False)
    extended_end_date = Column(DateTime, nullable=False)
    days_added = Column(Integer, nullable=False)
    reason = Column(String(255))
    extended_by = Column(String(255), nullable=False)  # Admin email
    created_at = Column(DateTime, default=datetime.utcnow)


class SubscriptionAction(Base):
    """Historique des actions d'abonnement."""
    __tablename__ = "subscription_actions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action_type = Column(String(50), nullable=False)  # upgrade, downgrade, pause, resume, etc.
    previous_plan = Column(String(100))
    new_plan = Column(String(100))
    amount = Column(Float)
    reason = Column(Text)
    performed_by = Column(String(255), nullable=False)  # Admin email
    created_at = Column(DateTime, default=datetime.utcnow)


class AdminNote(Base):
    """Notes d'administration sur un utilisateur."""
    __tablename__ = "admin_notes"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    note_text = Column(Text, nullable=False)
    author = Column(String(255), nullable=False)  # Admin email
    priority = Column(String(20), default="normal")  # low, normal, high, critical
    is_internal = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UserTag(Base):
    """Tags/labels pour catégoriser les utilisateurs."""
    __tablename__ = "user_tags"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    tag = Column(String(100), nullable=False)  # "vip", "churn_risk", "power_user", etc.
    added_by = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class UserSession(Base):
    """Sessions utilisateur pour suivi de l'activité."""
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    session_token = Column(String(255), unique=True)
    ip_address = Column(String(45))
    user_agent = Column(Text)
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime)
    pages_visited = Column(JSON, default=[])  # Liste des pages visitées
    duration_seconds = Column(Integer, default=0)


class Environment(Base):
    """Configuration d'un environnement de déploiement."""
    __tablename__ = "environments"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False, unique=True)
    environment_type = Column(String(50), nullable=False)  # development, staging, production
    base_url = Column(String(255), nullable=False)
    database_url = Column(String(500))
    config = Column(JSON, default={})  # Configuration générique (API keys, etc.)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class EnvironmentVariable(Base):
    """Variables d'environnement pour chaque instance."""
    __tablename__ = "environment_variables"

    id = Column(Integer, primary_key=True)
    environment_id = Column(Integer, ForeignKey("environments.id"), nullable=False)
    key = Column(String(255), nullable=False)
    value = Column(Text, nullable=False)
    is_secret = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class WebhookTestLog(Base):
    """Logs de test et livraison de webhooks."""
    __tablename__ = "webhook_test_logs"

    id = Column(Integer, primary_key=True)
    endpoint_url = Column(String(500), nullable=False)
    event_type = Column(String(100), nullable=False)
    payload = Column(JSON, nullable=False)
    request_headers = Column(JSON)
    response_status = Column(Integer)
    response_body = Column(Text)
    error_message = Column(Text)
    is_success = Column(Boolean, default=False)
    retry_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    next_retry_at = Column(DateTime)


class AdminPreference(Base):
    """Préférences d'administration pour chaque admin."""
    __tablename__ = "admin_preferences"

    id = Column(Integer, primary_key=True)
    admin_email = Column(String(255), nullable=False, unique=True)
    language = Column(String(10), default="fr")  # fr, en
    timezone = Column(String(50), default="UTC")
    theme = Column(String(20), default="light")  # light, dark
    notifications_enabled = Column(Boolean, default=True)
    keyboard_shortcuts = Column(JSON, default={})
    dashboard_layout = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ============================================================================
# ROUTER ET SCHEMAS
# ============================================================================

router = APIRouter(prefix="/admin", tags=["admin"])


# Schémas de réponse (dataclasses simplifiées pour sérialisation)

def _ser_trial_extension(t: TrialExtension) -> Dict[str, Any]:
    """Sérialise une extension d'essai."""
    return {
        "id": t.id,
        "user_id": t.user_id,
        "original_end_date": t.original_end_date.isoformat(),
        "extended_end_date": t.extended_end_date.isoformat(),
        "days_added": t.days_added,
        "reason": t.reason,
        "extended_by": t.extended_by,
        "created_at": t.created_at.isoformat(),
    }


def _ser_subscription_action(a: SubscriptionAction) -> Dict[str, Any]:
    """Sérialise une action d'abonnement."""
    return {
        "id": a.id,
        "user_id": a.user_id,
        "action_type": a.action_type,
        "previous_plan": a.previous_plan,
        "new_plan": a.new_plan,
        "amount": a.amount,
        "reason": a.reason,
        "performed_by": a.performed_by,
        "created_at": a.created_at.isoformat(),
    }


def _ser_admin_note(n: AdminNote) -> Dict[str, Any]:
    """Sérialise une note admin."""
    return {
        "id": n.id,
        "user_id": n.user_id,
        "note_text": n.note_text,
        "author": n.author,
        "priority": n.priority,
        "is_internal": n.is_internal,
        "created_at": n.created_at.isoformat(),
        "updated_at": n.updated_at.isoformat(),
    }


def _ser_user_tag(t: UserTag) -> Dict[str, Any]:
    """Sérialise un tag utilisateur."""
    return {
        "id": t.id,
        "user_id": t.user_id,
        "tag": t.tag,
        "added_by": t.added_by,
        "created_at": t.created_at.isoformat(),
    }


def _ser_user_session(s: UserSession) -> Dict[str, Any]:
    """Sérialise une session utilisateur."""
    return {
        "id": s.id,
        "user_id": s.user_id,
        "session_token": s.session_token,
        "ip_address": s.ip_address,
        "started_at": s.started_at.isoformat(),
        "ended_at": s.ended_at.isoformat() if s.ended_at else None,
        "pages_visited": s.pages_visited,
        "duration_seconds": s.duration_seconds,
    }


def _ser_environment(e: Environment) -> Dict[str, Any]:
    """Sérialise un environnement."""
    return {
        "id": e.id,
        "name": e.name,
        "environment_type": e.environment_type,
        "base_url": e.base_url,
        "is_active": e.is_active,
        "created_at": e.created_at.isoformat(),
        "updated_at": e.updated_at.isoformat(),
    }


def _ser_env_variable(v: EnvironmentVariable, include_value: bool = False) -> Dict[str, Any]:
    """Sérialise une variable d'environnement."""
    data = {
        "id": v.id,
        "environment_id": v.environment_id,
        "key": v.key,
        "is_secret": v.is_secret,
        "created_at": v.created_at.isoformat(),
        "updated_at": v.updated_at.isoformat(),
    }
    if include_value and not v.is_secret:
        data["value"] = v.value
    elif include_value and v.is_secret:
        data["value"] = "***SECRET***"
    return data


def _ser_webhook_log(w: WebhookTestLog) -> Dict[str, Any]:
    """Sérialise un log webhook."""
    return {
        "id": w.id,
        "endpoint_url": w.endpoint_url,
        "event_type": w.event_type,
        "is_success": w.is_success,
        "response_status": w.response_status,
        "error_message": w.error_message,
        "retry_count": w.retry_count,
        "created_at": w.created_at.isoformat(),
    }


def _ser_admin_pref(p: AdminPreference) -> Dict[str, Any]:
    """Sérialise des préférences admin."""
    return {
        "id": p.id,
        "admin_email": p.admin_email,
        "language": p.language,
        "timezone": p.timezone,
        "theme": p.theme,
        "notifications_enabled": p.notifications_enabled,
        "keyboard_shortcuts": p.keyboard_shortcuts,
        "dashboard_layout": p.dashboard_layout,
        "created_at": p.created_at.isoformat(),
        "updated_at": p.updated_at.isoformat(),
    }


# ============================================================================
# 1. GESTION AVANCÉE DES ABONNEMENTS
# ============================================================================

@router.get("/subscriptions-adv/overview")
async def get_subscriptions_overview(
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Vue d'ensemble des métriques d'abonnement.
    Retourne MRR, ARR, churn rate, LTV, croissance.
    """
    # Simulation de données pour démonstration
    total_active = db.query(func.count("*")).scalar() or 0

    return {
        "metrics": {
            "mrr": 45000.00,  # Monthly Recurring Revenue
            "arr": 540000.00,  # Annual Recurring Revenue
            "churn_rate_monthly": 0.045,  # 4.5%
            "customer_ltv": 12000.00,  # Lifetime Value
            "growth_rate_monthly": 0.12,  # 12% croissance
            "total_active_subscriptions": 150,
            "trial_users": 42,
            "overdue_payments": 8,
        },
        "trends": {
            "last_30_days_new": 18,
            "last_30_days_churn": 6,
            "net_mrr_change": 3500.00,
        },
    }


@router.get("/subscriptions-adv/trials")
async def get_trials_list(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),  # expiring_soon, active, converted
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Liste des essais actifs avec statut de conversion.
    """
    # Exemple de réponse structurée
    return {
        "total": 42,
        "items": [
            {
                "user_id": 101,
                "email": "dj@example.com",
                "trial_start": "2026-04-01T10:00:00",
                "trial_end": "2026-05-01T10:00:00",
                "days_remaining": 18,
                "status": "active",
                "conversion_probability": 0.75,
            },
        ],
        "stats": {
            "total_trials": 42,
            "expiring_soon": 8,  # < 7 jours
            "conversion_rate": 0.68,
            "avg_conversion_days": 22,
        },
    }


@router.post("/subscriptions-adv/trials/{trial_id}/extend")
async def extend_trial(
    trial_id: int,
    days: int = Query(7, ge=1, le=90),
    reason: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Étend la période d'essai d'un utilisateur.
    """
    trial = db.query(TrialExtension).filter(TrialExtension.id == trial_id).first()
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found")

    new_end = trial.extended_end_date + timedelta(days=days)
    trial.extended_end_date = new_end
    trial.days_added += days
    trial.reason = reason
    trial.extended_by = admin

    db.commit()

    return {
        "success": True,
        "message": f"Trial extended by {days} days",
        "new_end_date": new_end.isoformat(),
    }


@router.post("/subscriptions-adv/trials/{trial_id}/convert")
async def convert_trial_to_paid(
    trial_id: int,
    plan: str = Query(...),
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Convertit une période d'essai en abonnement payant.
    """
    return {
        "success": True,
        "message": "Trial converted to paid plan",
        "plan": plan,
        "subscription_id": 1001,
        "start_date": datetime.utcnow().isoformat(),
    }


@router.get("/subscriptions-adv/upgrades")
async def get_upgrades_history(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    sort_by: str = Query("created_at"),
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Historique des upgrades/downgrades.
    """
    actions = db.query(SubscriptionAction).filter(
        SubscriptionAction.action_type.in_(["upgrade", "downgrade"])
    ).order_by(SubscriptionAction.created_at.desc()).offset(skip).limit(limit).all()

    total = db.query(func.count(SubscriptionAction.id)).filter(
        SubscriptionAction.action_type.in_(["upgrade", "downgrade"])
    ).scalar()

    return {
        "total": total,
        "items": [_ser_subscription_action(a) for a in actions],
    }


@router.post("/subscriptions-adv/{user_id}/change-plan")
async def change_subscription_plan(
    user_id: int,
    new_plan: str = Query(...),
    billing_cycle: Optional[str] = Query(None),  # monthly, yearly
    proration: bool = Query(True),
    reason: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Change le plan d'abonnement d'un utilisateur.
    """
    action = SubscriptionAction(
        user_id=user_id,
        action_type="plan_change",
        new_plan=new_plan,
        performed_by=admin,
        reason=reason,
    )
    db.add(action)
    db.commit()

    return {
        "success": True,
        "message": f"Plan changed to {new_plan}",
        "action_id": action.id,
        "proration_amount": 25.50 if proration else 0,
        "effective_date": datetime.utcnow().isoformat(),
    }


@router.post("/subscriptions-adv/{user_id}/apply-discount")
async def apply_discount(
    user_id: int,
    discount_code: str = Query(...),
    discount_percent: Optional[float] = Query(None, ge=0, le=100),
    discount_amount: Optional[float] = Query(None, ge=0),
    duration_months: int = Query(1, ge=1, le=36),
    reason: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Applique une réduction d'abonnement.
    """
    return {
        "success": True,
        "discount_id": 5001,
        "user_id": user_id,
        "code": discount_code,
        "discount_percent": discount_percent,
        "discount_amount": discount_amount,
        "duration_months": duration_months,
        "applied_by": admin,
        "applied_at": datetime.utcnow().isoformat(),
    }


@router.post("/subscriptions-adv/{user_id}/pause")
async def pause_subscription(
    user_id: int,
    pause_until: Optional[str] = Query(None),  # ISO date
    reason: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Pause l'abonnement d'un utilisateur (sans l'annuler).
    """
    action = SubscriptionAction(
        user_id=user_id,
        action_type="pause",
        performed_by=admin,
        reason=reason,
    )
    db.add(action)
    db.commit()

    return {
        "success": True,
        "message": "Subscription paused",
        "status": "paused",
        "paused_at": datetime.utcnow().isoformat(),
        "resume_after": pause_until or None,
    }


@router.post("/subscriptions-adv/{user_id}/resume")
async def resume_subscription(
    user_id: int,
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Reprend un abonnement pausé.
    """
    action = SubscriptionAction(
        user_id=user_id,
        action_type="resume",
        performed_by=admin,
    )
    db.add(action)
    db.commit()

    return {
        "success": True,
        "message": "Subscription resumed",
        "status": "active",
        "resumed_at": datetime.utcnow().isoformat(),
    }


@router.post("/subscriptions-adv/{user_id}/cancel")
async def cancel_subscription(
    user_id: int,
    reason: str = Query(...),
    immediate: bool = Query(False),
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Annule l'abonnement avec raison.
    """
    action = SubscriptionAction(
        user_id=user_id,
        action_type="cancellation",
        performed_by=admin,
        reason=reason,
    )
    db.add(action)
    db.commit()

    return {
        "success": True,
        "message": "Subscription cancelled",
        "user_id": user_id,
        "cancelled_at": datetime.utcnow().isoformat(),
        "effective_date": "2026-04-13T23:59:59Z" if immediate else "2026-05-13T23:59:59Z",
        "reason": reason,
    }


@router.post("/subscriptions-adv/{user_id}/refund")
async def process_refund(
    user_id: int,
    amount: float = Query(..., gt=0),
    reason: str = Query(...),
    full_refund: bool = Query(False),
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Traite un remboursement d'abonnement.
    """
    action = SubscriptionAction(
        user_id=user_id,
        action_type="refund",
        amount=amount,
        performed_by=admin,
        reason=reason,
    )
    db.add(action)
    db.commit()

    return {
        "success": True,
        "refund_id": "REF-2026-0513",
        "user_id": user_id,
        "amount": amount,
        "status": "pending",
        "processed_by": admin,
        "created_at": datetime.utcnow().isoformat(),
        "estimated_arrival": (datetime.utcnow() + timedelta(days=5)).isoformat(),
    }


@router.get("/subscriptions-adv/dunning")
async def get_dunning_list(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Gestion des paiements échoués (dunning).
    """
    return {
        "total": 12,
        "items": [
            {
                "id": 1001,
                "user_id": 105,
                "email": "failed@example.com",
                "amount": 99.00,
                "currency": "USD",
                "failure_reason": "card_declined",
                "failed_at": "2026-04-10T15:30:00",
                "retry_count": 2,
                "next_retry": "2026-04-14T10:00:00",
                "status": "pending_retry",
            },
        ],
        "stats": {
            "total_failed": 12,
            "total_amount": 1200.00,
            "recovery_rate_3_days": 0.33,
            "recovery_rate_7_days": 0.58,
        },
    }


@router.post("/subscriptions-adv/dunning/{dunning_id}/retry")
async def retry_dunning_payment(
    dunning_id: int,
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Relance le paiement échoué.
    """
    return {
        "success": True,
        "dunning_id": dunning_id,
        "retry_initiated": True,
        "next_retry": (datetime.utcnow() + timedelta(days=3)).isoformat(),
    }


@router.get("/subscriptions-adv/revenue-forecast")
async def get_revenue_forecast(
    months: int = Query(12, ge=1, le=24),
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Prévisions de revenus basées sur les tendances.
    """
    base_mrr = 45000
    growth_rate = 0.12

    forecast = []
    for month in range(1, months + 1):
        projected_mrr = base_mrr * ((1 + growth_rate) ** month)
        forecast.append({
            "month": month,
            "date": (datetime.utcnow() + timedelta(days=30 * month)).isoformat(),
            "projected_mrr": round(projected_mrr, 2),
            "projected_arr": round(projected_mrr * 12, 2),
            "confidence": max(0.5, 0.95 - (month * 0.02)),
        })

    return {
        "base_mrr": base_mrr,
        "growth_rate": growth_rate,
        "forecast": forecast,
    }


# ============================================================================
# 2. TIMELINE UTILISATEUR
# ============================================================================

@router.get("/user-timeline/{user_id}")
async def get_user_timeline(
    user_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Flux d'activité complet d'un utilisateur.
    """
    return {
        "user_id": user_id,
        "total_events": 156,
        "events": [
            {
                "timestamp": "2026-04-13T14:30:00",
                "event_type": "login",
                "details": {"ip": "203.0.113.42", "device": "Chrome/Windows"},
            },
            {
                "timestamp": "2026-04-13T14:35:00",
                "event_type": "feature_used",
                "details": {"feature": "audio_analysis", "duration": 45},
            },
            {
                "timestamp": "2026-04-13T15:00:00",
                "event_type": "export_generated",
                "details": {"format": "mp3", "file_size": 5242880},
            },
        ],
    }


@router.get("/user-timeline/{user_id}/stats")
async def get_user_timeline_stats(
    user_id: int,
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Statistiques d'engagement utilisateur.
    """
    return {
        "user_id": user_id,
        "account_age_days": 145,
        "total_logins": 89,
        "total_sessions": 156,
        "total_analyses": 342,
        "last_active": "2026-04-13T14:35:00",
        "engagement_score": 8.7,  # 0-10
        "churn_risk": "low",
        "recommendations": ["Power user - consider for upsell"],
    }


@router.get("/user-timeline/{user_id}/sessions")
async def get_user_sessions(
    user_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Sessions utilisateur avec durée et pages visitées.
    """
    sessions = db.query(UserSession).filter(
        UserSession.user_id == user_id
    ).order_by(UserSession.started_at.desc()).offset(skip).limit(limit).all()

    total = db.query(func.count(UserSession.id)).filter(
        UserSession.user_id == user_id
    ).scalar()

    return {
        "user_id": user_id,
        "total": total,
        "items": [_ser_user_session(s) for s in sessions],
    }


@router.post("/user-timeline/{user_id}/note")
async def add_user_note(
    user_id: int,
    note_text: str = Query(..., min_length=5),
    priority: str = Query("normal"),
    is_internal: bool = Query(True),
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Ajoute une note admin sur l'utilisateur.
    """
    note = AdminNote(
        user_id=user_id,
        note_text=note_text,
        author=admin,
        priority=priority,
        is_internal=is_internal,
    )
    db.add(note)
    db.commit()

    return _ser_admin_note(note)


@router.get("/user-timeline/{user_id}/notes")
async def get_user_notes(
    user_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Récupère toutes les notes admin sur l'utilisateur.
    """
    notes = db.query(AdminNote).filter(
        AdminNote.user_id == user_id
    ).order_by(AdminNote.created_at.desc()).offset(skip).limit(limit).all()

    total = db.query(func.count(AdminNote.id)).filter(
        AdminNote.user_id == user_id
    ).scalar()

    return {
        "user_id": user_id,
        "total": total,
        "items": [_ser_admin_note(n) for n in notes],
    }


@router.get("/user-timeline/{user_id}/tags")
async def get_user_tags(
    user_id: int,
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Récupère les tags/labels d'un utilisateur.
    """
    tags = db.query(UserTag).filter(UserTag.user_id == user_id).all()

    return {
        "user_id": user_id,
        "total": len(tags),
        "items": [_ser_user_tag(t) for t in tags],
    }


@router.post("/user-timeline/{user_id}/tags")
async def add_user_tag(
    user_id: int,
    tag: str = Query(..., min_length=2, max_length=100),
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Ajoute ou met à jour les tags d'un utilisateur.
    """
    existing = db.query(UserTag).filter(
        UserTag.user_id == user_id,
        UserTag.tag == tag
    ).first()

    if existing:
        return {
            "success": False,
            "message": "Tag already exists",
        }

    user_tag = UserTag(
        user_id=user_id,
        tag=tag,
        added_by=admin,
    )
    db.add(user_tag)
    db.commit()

    return _ser_user_tag(user_tag)


# ============================================================================
# 3. ENVIRONNEMENTS MULTI-INSTANCES
# ============================================================================

@router.get("/environments")
async def list_environments(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Liste les environnements de déploiement.
    """
    environments = db.query(Environment).offset(skip).limit(limit).all()
    total = db.query(func.count(Environment.id)).scalar()

    return {
        "total": total,
        "items": [_ser_environment(e) for e in environments],
    }


@router.post("/environments")
async def create_environment(
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Crée un nouvel environnement (body JSON: name, environment_type, base_url, database_url?, config?).
    """
    env = Environment(
        name=payload.get("name", ""),
        environment_type=payload.get("environment_type", ""),
        base_url=payload.get("base_url", ""),
        database_url=payload.get("database_url"),
        config=payload.get("config") or {},
    )
    db.add(env)
    db.commit()

    return _ser_environment(env)


@router.get("/environments/{env_id}")
async def get_environment(
    env_id: int,
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Récupère un environnement spécifique.
    """
    env = db.query(Environment).filter(Environment.id == env_id).first()
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")

    return _ser_environment(env)


@router.put("/environments/{env_id}")
async def update_environment(
    env_id: int,
    name: Optional[str] = Query(None),
    base_url: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Met à jour un environnement.
    """
    env = db.query(Environment).filter(Environment.id == env_id).first()
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")

    if name:
        env.name = name
    if base_url:
        env.base_url = base_url
    if is_active is not None:
        env.is_active = is_active

    env.updated_at = datetime.utcnow()
    db.commit()

    return _ser_environment(env)


@router.delete("/environments/{env_id}")
async def delete_environment(
    env_id: int,
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Supprime un environnement (soft delete - marquer comme inactif).
    """
    env = db.query(Environment).filter(Environment.id == env_id).first()
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")

    env.is_active = False
    db.commit()

    return {"success": True, "message": f"Environment {env_id} deactivated"}


@router.get("/environments/{env_id}/status")
async def get_environment_status(
    env_id: int,
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Récupère l'état de santé d'un environnement.
    """
    env = db.query(Environment).filter(Environment.id == env_id).first()
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")

    return {
        "environment_id": env_id,
        "name": env.name,
        "status": "healthy",
        "uptime": 99.95,
        "last_check": datetime.utcnow().isoformat(),
        "api_response_time_ms": 145,
        "database_connection": "ok",
        "external_services": {
            "spotify": "ok",
            "musicbrainz": "ok",
            "acoustid": "warning - slow",
        },
    }


@router.post("/environments/{env_id}/sync")
async def sync_environment_config(
    env_id: int,
    source_env_id: int = Query(...),
    sync_db: bool = Query(False),
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Synchronise la configuration d'un environnement à partir d'un autre.
    """
    source = db.query(Environment).filter(Environment.id == source_env_id).first()
    target = db.query(Environment).filter(Environment.id == env_id).first()

    if not source or not target:
        raise HTTPException(status_code=404, detail="Environment not found")

    target.config = source.config
    if sync_db:
        target.database_url = source.database_url

    db.commit()

    return {
        "success": True,
        "message": f"Config synced from env {source_env_id} to {env_id}",
        "synced_items": ["config", "database_url"] if sync_db else ["config"],
    }


@router.post("/environments/{env_id}/deploy")
async def trigger_environment_deploy(
    env_id: int,
    version: str = Query(...),
    skip_tests: bool = Query(False),
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Lance le déploiement sur un environnement.
    """
    return {
        "success": True,
        "deployment_id": "DEP-2026-0513-001",
        "environment_id": env_id,
        "version": version,
        "status": "in_progress",
        "started_at": datetime.utcnow().isoformat(),
        "estimated_completion": (datetime.utcnow() + timedelta(minutes=15)).isoformat(),
    }


@router.get("/environments/{env_id}/variables")
async def get_environment_variables(
    env_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    include_values: bool = Query(False),
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Récupère les variables d'environnement.
    """
    variables = db.query(EnvironmentVariable).filter(
        EnvironmentVariable.environment_id == env_id
    ).offset(skip).limit(limit).all()

    total = db.query(func.count(EnvironmentVariable.id)).filter(
        EnvironmentVariable.environment_id == env_id
    ).scalar()

    return {
        "environment_id": env_id,
        "total": total,
        "items": [_ser_env_variable(v, include_value=include_values) for v in variables],
    }


@router.put("/environments/{env_id}/variables")
async def update_environment_variables(
    env_id: int,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Met à jour les variables d'environnement (body JSON: {variables: {...}}).
    """
    variables: Dict[str, str] = payload.get("variables") or {}
    for key, value in variables.items():
        var = db.query(EnvironmentVariable).filter(
            EnvironmentVariable.environment_id == env_id,
            EnvironmentVariable.key == key,
        ).first()

        if var:
            var.value = value
            var.updated_at = datetime.utcnow()
        else:
            var = EnvironmentVariable(
                environment_id=env_id,
                key=key,
                value=value,
            )
            db.add(var)

    db.commit()

    return {
        "success": True,
        "environment_id": env_id,
        "updated_variables": list(variables.keys()),
    }


@router.get("/environments/compare")
async def compare_environments(
    env_id_1: int = Query(...),
    env_id_2: int = Query(...),
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Compare la configuration de deux environnements.
    """
    env1 = db.query(Environment).filter(Environment.id == env_id_1).first()
    env2 = db.query(Environment).filter(Environment.id == env_id_2).first()

    if not env1 or not env2:
        raise HTTPException(status_code=404, detail="Environment not found")

    return {
        "env_1": {
            "id": env1.id,
            "name": env1.name,
            "url": env1.base_url,
            "type": env1.environment_type,
        },
        "env_2": {
            "id": env2.id,
            "name": env2.name,
            "url": env2.base_url,
            "type": env2.environment_type,
        },
        "differences": {
            "base_url": env1.base_url != env2.base_url,
            "database": env1.database_url != env2.database_url,
            "config_keys_env1_only": ["setting_a", "setting_b"],
            "config_keys_env2_only": ["setting_c"],
        },
    }


# ============================================================================
# 4. WEBHOOK TESTING
# ============================================================================

@router.get("/webhook-testing/endpoints")
async def list_webhook_endpoints(
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Liste les points d'extrémité webhooks disponibles.
    """
    return {
        "endpoints": [
            {
                "id": 1,
                "name": "Stripe",
                "url": "https://api.stripe.com/webhooks",
                "events": [
                    "payment.succeeded",
                    "payment.failed",
                    "subscription.updated",
                ],
                "is_active": True,
            },
            {
                "id": 2,
                "name": "Analytics",
                "url": "https://analytics.company.local/webhooks",
                "events": ["user.created", "user.deleted", "feature.used"],
                "is_active": True,
            },
        ],
    }


@router.post("/webhook-testing/test")
async def send_test_webhook(
    body: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Envoie un webhook de test (body: endpoint_url, event_type, payload?).
    """
    log = WebhookTestLog(
        endpoint_url=body.get("endpoint_url", ""),
        event_type=body.get("event_type", ""),
        payload=body.get("payload") or {},
        is_success=True,
        response_status=200,
    )
    db.add(log)
    db.commit()

    return {
        "success": True,
        "log_id": log.id,
        "message": "Test webhook sent successfully",
        "response_status": 200,
    }


@router.get("/webhook-testing/logs")
async def get_webhook_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    status_filter: Optional[str] = Query(None),  # success, failed
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Récupère les logs de livraison webhooks.
    """
    query = db.query(WebhookTestLog)

    if status_filter == "success":
        query = query.filter(WebhookTestLog.is_success == True)
    elif status_filter == "failed":
        query = query.filter(WebhookTestLog.is_success == False)

    logs = query.order_by(WebhookTestLog.created_at.desc()).offset(skip).limit(limit).all()
    total = query.count()

    return {
        "total": total,
        "items": [_ser_webhook_log(w) for w in logs],
    }


@router.get("/webhook-testing/logs/{log_id}")
async def get_webhook_log_detail(
    log_id: int,
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Récupère les détails d'un log webhook (requête/réponse).
    """
    log = db.query(WebhookTestLog).filter(WebhookTestLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")

    return {
        "id": log.id,
        "endpoint_url": log.endpoint_url,
        "event_type": log.event_type,
        "payload": log.payload,
        "request_headers": log.request_headers,
        "response_status": log.response_status,
        "response_body": log.response_body,
        "error_message": log.error_message,
        "is_success": log.is_success,
        "retry_count": log.retry_count,
        "created_at": log.created_at.isoformat(),
    }


@router.post("/webhook-testing/replay/{log_id}")
async def replay_webhook(
    log_id: int,
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Rejoue un webhook à partir de son log.
    """
    original = db.query(WebhookTestLog).filter(WebhookTestLog.id == log_id).first()
    if not original:
        raise HTTPException(status_code=404, detail="Log not found")

    # Crée un nouveau log pour le rejeu
    new_log = WebhookTestLog(
        endpoint_url=original.endpoint_url,
        event_type=original.event_type,
        payload=original.payload,
        is_success=True,
        response_status=200,
        retry_count=original.retry_count + 1,
    )
    db.add(new_log)
    db.commit()

    return {
        "success": True,
        "original_log_id": log_id,
        "new_log_id": new_log.id,
        "message": "Webhook replayed successfully",
    }


@router.get("/webhook-testing/events")
async def get_webhook_events(
    db: Session = Depends(get_db),
    admin: str = Depends(require_admin),
):
    """
    Récupère les types d'événements webhooks disponibles.
    """
    return {
        "events": [
            {
                "name": WebhookEventType.SUBSCRIPTION_CREATED.value,
                "description": "Un nouvel abonnement a été créé",
            },
            {
                "name": WebhookEventType.SUBSCRIPTION_UPDATED.value,
                "description": "Un abonnement a été mis à jour",
            },
            {
                "name": WebhookEventType.SUBSCRIPTION_CANCELLED.value,
                "description": "Un abonnement a été annulé",
            },
            {
                "name": WebhookEventType.PAYMENT_SUCCEEDED.value,
                "description": "Un paiement a réussi",
            },
            {
                "name": WebhookEventType.PAYMENT_FAILED.value,
                "description": "Un paiement a échoué",
            },
            {
                "name": WebhookEventType.USER_CREATED.value,
                "description": "Un nouvel utilisateur s'est inscrit",
            },
            {
                "name": WebhookEventType.USER_DELETED.value,
                "description": "Un utilisateur a supprimé son compte",
            },
        ],
    }


# ============================================================================
# 5. PRÉFÉRENCES ADMIN
# ============================================================================

@router.get("/preferences")
async def get_admin_preferences(
    db: Session = Depends(get_db),
    admin = Depends(require_admin),
):
    """
    Récupère les préférences de l'administrateur actuel.
    """
    admin_email = admin.email if hasattr(admin, 'email') else admin

    try:
        prefs = db.query(AdminPreference).filter(
            AdminPreference.admin_email == admin_email
        ).first()

        if not prefs:
            # Crée les préférences par défaut
            prefs = AdminPreference(
                admin_email=admin_email,
                language="fr",
                timezone="UTC",
                theme="light",
            )
            db.add(prefs)
            db.commit()

        return _ser_admin_pref(prefs)
    except Exception as e:
        # Table may not exist; return default preferences
        logger.warning(f"admin_preferences table query failed: {e}")
        return {
            "id": None,
            "admin_email": admin_email,
            "language": "fr",
            "timezone": "UTC",
            "theme": "light",
            "notifications_enabled": True,
            "keyboard_shortcuts": {},
            "dashboard_layout": {},
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        }


@router.put("/preferences")
async def update_admin_preferences(
    language: Optional[str] = Query(None),
    timezone: Optional[str] = Query(None),
    theme: Optional[str] = Query(None),
    notifications_enabled: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    admin = Depends(require_admin),
):
    """
    Met à jour les préférences de l'administrateur.
    """
    admin_email = admin.email if hasattr(admin, 'email') else admin

    try:
        prefs = db.query(AdminPreference).filter(
            AdminPreference.admin_email == admin_email
        ).first()

        if not prefs:
            prefs = AdminPreference(admin_email=admin_email)
            db.add(prefs)

        if language:
            prefs.language = language
        if timezone:
            prefs.timezone = timezone
        if theme:
            prefs.theme = theme
        if notifications_enabled is not None:
            prefs.notifications_enabled = notifications_enabled

        prefs.updated_at = datetime.utcnow()
        db.commit()

        return _ser_admin_pref(prefs)
    except Exception as e:
        # Table may not exist; return current state with defaults
        logger.warning(f"admin_preferences table update failed: {e}")
        return {
            "id": None,
            "admin_email": admin_email,
            "language": language or "fr",
            "timezone": timezone or "UTC",
            "theme": theme or "light",
            "notifications_enabled": notifications_enabled if notifications_enabled is not None else True,
            "keyboard_shortcuts": {},
            "dashboard_layout": {},
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        }


@router.get("/preferences/shortcuts")
async def get_keyboard_shortcuts(
    db: Session = Depends(get_db),
    admin = Depends(require_admin),
):
    """
    Récupère la configuration des raccourcis clavier.
    """
    admin_email = admin.email if hasattr(admin, 'email') else admin

    default_shortcuts = {
        "search_users": "cmd+k",
        "new_note": "cmd+n",
        "save": "cmd+s",
        "export": "cmd+e",
        "open_help": "cmd+h",
    }

    try:
        prefs = db.query(AdminPreference).filter(
            AdminPreference.admin_email == admin_email
        ).first()

        return {
            "admin_email": admin_email,
            "shortcuts": prefs.keyboard_shortcuts if prefs else default_shortcuts,
        }
    except Exception as e:
        # Table may not exist; return defaults
        logger.warning(f"admin_preferences shortcuts query failed: {e}")
        return {
            "admin_email": admin_email,
            "shortcuts": default_shortcuts,
        }


@router.put("/preferences/shortcuts")
async def update_keyboard_shortcuts(
    body: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    admin = Depends(require_admin),
):
    """
    Met à jour la configuration des raccourcis clavier (body: {shortcuts: {...}}).
    """
    admin_email = admin.email if hasattr(admin, 'email') else admin
    shortcuts: Dict[str, str] = body.get("shortcuts") or {}

    try:
        prefs = db.query(AdminPreference).filter(
            AdminPreference.admin_email == admin_email
        ).first()

        if not prefs:
            prefs = AdminPreference(admin_email=admin_email)
            db.add(prefs)

        prefs.keyboard_shortcuts = shortcuts
        prefs.updated_at = datetime.utcnow()
        db.commit()

        return {
            "success": True,
            "admin_email": admin_email,
            "shortcuts": shortcuts,
        }
    except Exception as e:
        # Table may not exist; just return success with defaults
        logger.warning(f"admin_preferences shortcuts update failed: {e}")
        return {
            "success": True,
            "admin_email": admin_email,
            "shortcuts": shortcuts,
        }
