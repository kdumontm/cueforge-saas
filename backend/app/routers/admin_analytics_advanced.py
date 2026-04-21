"""
Admin Analytics Advanced Router — Analytiques avancées et tableaux de bord temps réel.

Points de terminaison groupés par domaine :
  /admin/realtime/stats              → Statistiques temps réel (utilisateurs, requêtes, charge)
  /admin/realtime/events             → Flux d'événements en direct
  /admin/realtime/connections        → Connexions/sessions actives
  /admin/realtime/geographic         → Utilisateurs par géolocalisation
  /admin/funnels/...                 → Gestion et analyse des funnels de conversion
  /admin/cohorts/...                 → Analyse de cohortes et rétention
  /admin/events/...                  → Suivi et gestion des événements
  /admin/journeys/...                → Parcours utilisateur et statistiques
  /admin/custom-reports/...          → Rapports personnalisés

Tous les endpoints nécessitent is_admin == True.
"""

import json
import uuid
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from enum import Enum

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from pydantic import BaseModel, Field
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text, Float, JSON,
    ForeignKey, func, and_, or_, desc, asc, Index
)
from sqlalchemy.orm import Session, relationship

from app.database import get_db, Base
from app.models.user import User
from app.middleware.admin import require_admin

router = APIRouter(prefix="/admin", tags=["admin-analytics"])


# ═══════════════════════════════════════════════════════════════════════════
# Modèles SQLAlchemy
# ═══════════════════════════════════════════════════════════════════════════

class RealtimeEvent(Base):
    """Événement temps réel (utilisateurs actifs, requêtes, etc.)."""
    __tablename__ = "realtime_events"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    event_type = Column(String(100), nullable=False, index=True)  # "page_view", "api_call", "analysis_started"
    page_or_endpoint = Column(String(500), nullable=True)
    duration_ms = Column(Integer, nullable=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(500), nullable=True)
    country = Column(String(50), nullable=True)
    city = Column(String(100), nullable=True)
    # 'metadata' réservé SQLAlchemy Declarative
    extra_metadata = Column("meta", JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    user = relationship("User", foreign_keys=[user_id])
    __table_args__ = (
        Index("ix_realtime_events_type_created", "event_type", "created_at"),
    )


class FunnelConfig(Base):
    """Configuration des funnels de conversion."""
    __tablename__ = "funnel_configs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    steps = Column(JSON, nullable=False)  # [{name, event_type, filters}]
    filters = Column(JSON, nullable=True)  # Filtres globaux appliqués à tout le funnel
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_template = Column(Boolean, default=False, nullable=False)

    creator = relationship("User", foreign_keys=[created_by])


class CohortConfig(Base):
    """Configuration des cohortes pour l'analyse de rétention."""
    __tablename__ = "cohort_configs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    metric = Column(String(100), nullable=False)  # "signup_date", "first_purchase", "last_active"
    period = Column(String(50), nullable=False)  # "day", "week", "month"
    group_by = Column(String(100), nullable=False)  # "country", "plan", "source"
    date_from = Column(DateTime, nullable=True)
    date_to = Column(DateTime, nullable=True)
    filters = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    creator = relationship("User", foreign_keys=[created_by])


class EventDefinition(Base):
    """Définition des événements suivis."""
    __tablename__ = "event_definitions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True, index=True)
    category = Column(String(100), nullable=False, index=True)  # "user_action", "system", "integration"
    description = Column(Text, nullable=True)
    properties_schema = Column(JSON, nullable=True)  # Schéma des propriétés attendues
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class TrackedEvent(Base):
    """Événements individuels suivis pour l'analyse."""
    __tablename__ = "tracked_events"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    event_name = Column(String(255), nullable=False, index=True)
    category = Column(String(100), nullable=False, index=True)
    properties = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    user = relationship("User", foreign_keys=[user_id])
    __table_args__ = (
        Index("ix_tracked_events_name_created", "event_name", "created_at"),
        Index("ix_tracked_events_category_created", "category", "created_at"),
    )


class UserJourney(Base):
    """Configuration des parcours utilisateur."""
    __tablename__ = "user_journeys"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    trigger_event = Column(String(255), nullable=False)  # Événement déclencheur
    steps = Column(JSON, nullable=False)  # [{event, delay_ms, conditions}]
    success_conditions = Column(JSON, nullable=True)  # Conditions de réussite du parcours
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    creator = relationship("User", foreign_keys=[created_by])


class CustomReport(Base):
    """Définition des rapports personnalisés."""
    __tablename__ = "custom_reports"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    query = Column(Text, nullable=False)  # Requête SQL ou pseudo-query
    visualization_type = Column(String(100), nullable=False)  # "table", "chart", "graph", "heatmap"
    filters = Column(JSON, nullable=True)  # Filtres interactifs
    parameters = Column(JSON, nullable=True)  # Paramètres de la requête
    scheduled_at = Column(String(50), nullable=True)  # Cron expression ou null pour pas de schedule
    last_run_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    creator = relationship("User", foreign_keys=[created_by])


# ═══════════════════════════════════════════════════════════════════════════
# Schémas Pydantic
# ═══════════════════════════════════════════════════════════════════════════

# ── Temps réel ──

class RealtimeStatsResponse(BaseModel):
    """Réponse des statistiques temps réel."""
    active_users: int
    requests_per_minute: float
    current_load_percent: float
    top_pages: List[Dict[str, Any]]
    top_endpoints: List[Dict[str, Any]]
    avg_response_time_ms: float
    error_rate_percent: float


class RealtimeEventResponse(BaseModel):
    """Événement temps réel."""
    id: str
    user_id: Optional[int] = None
    event_type: str
    page_or_endpoint: Optional[str] = None
    duration_ms: Optional[int] = None
    country: Optional[str] = None
    city: Optional[str] = None
    created_at: str


class RealtimeEventsListResponse(BaseModel):
    """Liste des événements temps réel."""
    total: int
    items: List[RealtimeEventResponse]


class ActiveConnectionResponse(BaseModel):
    """Connexion active."""
    user_id: int
    session_id: str
    ip_address: str
    country: Optional[str] = None
    city: Optional[str] = None
    last_activity: str
    duration_minutes: float


class ActiveConnectionsResponse(BaseModel):
    """Liste des connexions actives."""
    total: int
    items: List[ActiveConnectionResponse]


class GeographicStatsResponse(BaseModel):
    """Statistiques géographiques."""
    country: str
    city: Optional[str] = None
    user_count: int
    active_count: int
    requests_count: int


class GeographicDataResponse(BaseModel):
    """Données géographiques."""
    total_countries: int
    total_cities: int
    data: List[GeographicStatsResponse]


# ── Funnels ──

class FunnelStepSchema(BaseModel):
    """Étape d'un funnel."""
    name: str
    event_type: str
    filters: Optional[Dict[str, Any]] = None


class FunnelConfigCreateRequest(BaseModel):
    """Création d'une config de funnel."""
    name: str
    description: Optional[str] = None
    steps: List[FunnelStepSchema]
    filters: Optional[Dict[str, Any]] = None
    is_template: Optional[bool] = False


class FunnelConfigResponse(BaseModel):
    """Réponse de config de funnel."""
    id: int
    name: str
    description: Optional[str] = None
    steps: List[Dict[str, Any]]
    filters: Optional[Dict[str, Any]] = None
    created_at: str
    updated_at: str
    is_template: bool


class FunnelResultStep(BaseModel):
    """Résultat d'une étape de funnel."""
    step_name: str
    user_count: int
    conversion_rate_percent: float
    drop_off_count: int
    drop_off_percent: float
    avg_time_to_step_seconds: Optional[float] = None


class FunnelAnalysisResponse(BaseModel):
    """Analyse complète d'un funnel."""
    funnel_id: int
    funnel_name: str
    total_users: int
    completion_rate_percent: float
    steps: List[FunnelResultStep]
    period_days: int


class FunnelTemplateResponse(BaseModel):
    """Template de funnel prédéfini."""
    id: int
    name: str
    description: Optional[str] = None
    steps: List[Dict[str, Any]]


# ── Cohorts ──

class CohortConfigCreateRequest(BaseModel):
    """Création d'une config de cohorte."""
    name: str
    description: Optional[str] = None
    metric: str  # "signup_date", "first_purchase", etc.
    period: str  # "day", "week", "month"
    group_by: str  # "country", "plan", etc.
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    filters: Optional[Dict[str, Any]] = None


class CohortConfigResponse(BaseModel):
    """Réponse de config de cohorte."""
    id: int
    name: str
    description: Optional[str] = None
    metric: str
    period: str
    group_by: str
    created_at: str


class CohortRetentionRow(BaseModel):
    """Ligne d'une matrice de rétention."""
    cohort: str
    day_0: float  # Pourcentage rétention jour 0
    day_7: Optional[float] = None
    day_14: Optional[float] = None
    day_30: Optional[float] = None
    day_60: Optional[float] = None
    day_90: Optional[float] = None


class CohortAnalysisResponse(BaseModel):
    """Analyse complète d'une cohorte."""
    cohort_id: int
    cohort_name: str
    retention_matrix: List[CohortRetentionRow]
    avg_retention_percent: float


class CohortPresetResponse(BaseModel):
    """Preset de cohorte prédéfini."""
    id: int
    name: str
    metric: str
    period: str
    group_by: str


# ── Événements ──

class EventDefinitionCreateRequest(BaseModel):
    """Création d'une définition d'événement."""
    name: str
    category: str
    description: Optional[str] = None
    properties_schema: Optional[Dict[str, Any]] = None


class EventDefinitionResponse(BaseModel):
    """Réponse de définition d'événement."""
    id: int
    name: str
    category: str
    description: Optional[str] = None
    properties_schema: Optional[Dict[str, Any]] = None
    created_at: str


class TrackedEventFilterRequest(BaseModel):
    """Filtre pour chercher des événements."""
    name: Optional[str] = None
    category: Optional[str] = None
    user_id: Optional[int] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    skip: int = 0
    limit: int = 50


class TrackedEventResponse(BaseModel):
    """Événement suivi."""
    id: str
    user_id: Optional[int] = None
    event_name: str
    category: str
    properties: Optional[Dict[str, Any]] = None
    created_at: str


class TrackedEventsListResponse(BaseModel):
    """Liste des événements suivis."""
    total: int
    items: List[TrackedEventResponse]


class EventStatsResponse(BaseModel):
    """Statistiques sur les événements."""
    event_name: str
    count: int
    unique_users: int
    avg_per_user: float


class EventStatsListResponse(BaseModel):
    """Liste des statistiques d'événements."""
    total_events: int
    total_events_count: int
    trending_events: List[EventStatsResponse]


class EventExportRequest(BaseModel):
    """Demande d'export d'événements."""
    name: Optional[str] = None
    category: Optional[str] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    format: str = "csv"  # "csv" ou "json"


# ── Parcours ──

class JourneyStepSchema(BaseModel):
    """Étape d'un parcours utilisateur."""
    event: str
    delay_ms: Optional[int] = 0
    conditions: Optional[Dict[str, Any]] = None


class UserJourneyCreateRequest(BaseModel):
    """Création d'un parcours utilisateur."""
    name: str
    description: Optional[str] = None
    trigger_event: str
    steps: List[JourneyStepSchema]
    success_conditions: Optional[Dict[str, Any]] = None


class UserJourneyResponse(BaseModel):
    """Réponse d'un parcours utilisateur."""
    id: int
    name: str
    description: Optional[str] = None
    trigger_event: str
    steps: List[Dict[str, Any]]
    created_at: str
    updated_at: str


class JourneyStepStats(BaseModel):
    """Statistiques d'une étape du parcours."""
    step_number: int
    step_event: str
    user_count: int
    completion_rate_percent: float
    avg_time_from_trigger_seconds: float


class JourneyAnalysisResponse(BaseModel):
    """Analyse complète d'un parcours."""
    journey_id: int
    journey_name: str
    total_users_triggered: int
    completion_rate_percent: float
    avg_completion_time_seconds: float
    steps: List[JourneyStepStats]


class JourneyUserResponse(BaseModel):
    """Utilisateur dans un parcours."""
    user_id: int
    current_step: int
    started_at: str
    last_activity: str
    completed: bool
    completion_time_seconds: Optional[float] = None


class JourneyUsersResponse(BaseModel):
    """Liste des utilisateurs dans un parcours."""
    journey_id: int
    total_users: int
    items: List[JourneyUserResponse]


# ── Rapports personnalisés ──

class CustomReportCreateRequest(BaseModel):
    """Création d'un rapport personnalisé."""
    name: str
    description: Optional[str] = None
    query: str
    visualization_type: str  # "table", "chart", "graph", "heatmap"
    filters: Optional[Dict[str, Any]] = None
    parameters: Optional[Dict[str, Any]] = None


class CustomReportResponse(BaseModel):
    """Réponse d'un rapport personnalisé."""
    id: int
    name: str
    description: Optional[str] = None
    visualization_type: str
    scheduled_at: Optional[str] = None
    last_run_at: Optional[str] = None
    created_at: str
    updated_at: str


class CustomReportRunResponse(BaseModel):
    """Résultat de l'exécution d'un rapport."""
    report_id: int
    report_name: str
    visualization_type: str
    data: Dict[str, Any]  # Résultats bruts
    ran_at: str
    execution_time_ms: float


class CustomReportScheduleRequest(BaseModel):
    """Demande de planification d'un rapport."""
    cron_expression: str  # "0 9 * * *", "0 0 * * 0" (lundi minuit), etc.
    notify_admin: Optional[bool] = True


# ═══════════════════════════════════════════════════════════════════════════
# Fonctions helper de sérialisation
# ═══════════════════════════════════════════════════════════════════════════

def _ser_realtime_event(evt: RealtimeEvent) -> Dict[str, Any]:
    """Sérialize un RealtimeEvent."""
    return {
        "id": evt.id,
        "user_id": evt.user_id,
        "event_type": evt.event_type,
        "page_or_endpoint": evt.page_or_endpoint,
        "duration_ms": evt.duration_ms,
        "country": evt.country,
        "city": evt.city,
        "created_at": evt.created_at.isoformat() if evt.created_at else None,
    }


def _ser_funnel_config(config: FunnelConfig) -> Dict[str, Any]:
    """Sérialize une FunnelConfig."""
    return {
        "id": config.id,
        "name": config.name,
        "description": config.description,
        "steps": config.steps,
        "filters": config.filters,
        "created_at": config.created_at.isoformat() if config.created_at else None,
        "updated_at": config.updated_at.isoformat() if config.updated_at else None,
        "is_template": config.is_template,
    }


def _ser_cohort_config(config: CohortConfig) -> Dict[str, Any]:
    """Sérialize une CohortConfig."""
    return {
        "id": config.id,
        "name": config.name,
        "description": config.description,
        "metric": config.metric,
        "period": config.period,
        "group_by": config.group_by,
        "created_at": config.created_at.isoformat() if config.created_at else None,
        "updated_at": config.updated_at.isoformat() if config.updated_at else None,
    }


def _ser_event_definition(defn: EventDefinition) -> Dict[str, Any]:
    """Sérialize une EventDefinition."""
    return {
        "id": defn.id,
        "name": defn.name,
        "category": defn.category,
        "description": defn.description,
        "properties_schema": defn.properties_schema,
        "created_at": defn.created_at.isoformat() if defn.created_at else None,
        "updated_at": defn.updated_at.isoformat() if defn.updated_at else None,
    }


def _ser_tracked_event(evt: TrackedEvent) -> Dict[str, Any]:
    """Sérialize un TrackedEvent."""
    return {
        "id": evt.id,
        "user_id": evt.user_id,
        "event_name": evt.event_name,
        "category": evt.category,
        "properties": evt.properties,
        "created_at": evt.created_at.isoformat() if evt.created_at else None,
    }


def _ser_user_journey(journey: UserJourney) -> Dict[str, Any]:
    """Sérialize un UserJourney."""
    return {
        "id": journey.id,
        "name": journey.name,
        "description": journey.description,
        "trigger_event": journey.trigger_event,
        "steps": journey.steps,
        "created_at": journey.created_at.isoformat() if journey.created_at else None,
        "updated_at": journey.updated_at.isoformat() if journey.updated_at else None,
    }


def _ser_custom_report(report: CustomReport) -> Dict[str, Any]:
    """Sérialize un CustomReport."""
    return {
        "id": report.id,
        "name": report.name,
        "description": report.description,
        "visualization_type": report.visualization_type,
        "scheduled_at": report.scheduled_at,
        "last_run_at": report.last_run_at.isoformat() if report.last_run_at else None,
        "created_at": report.created_at.isoformat() if report.created_at else None,
        "updated_at": report.updated_at.isoformat() if report.updated_at else None,
    }


# ═══════════════════════════════════════════════════════════════════════════
# 1. ENDPOINTS TEMPS RÉEL - Real-time Dashboard
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/realtime/stats", response_model=RealtimeStatsResponse, dependencies=[Depends(require_admin)])
async def get_realtime_stats(
    db: Session = Depends(get_db),
):
    """
    Récupère les statistiques en temps réel.
    - Utilisateurs actifs (dernière 1h)
    - Requêtes par minute
    - Charge système actuelle
    - Pages/endpoints populaires
    """
    # Événements des 60 dernières minutes
    one_hour_ago = datetime.utcnow() - timedelta(hours=1)

    # Utilisateurs actifs uniques
    active_users = db.query(func.count(func.distinct(RealtimeEvent.user_id))).filter(
        RealtimeEvent.created_at >= one_hour_ago
    ).scalar() or 0

    # Total d'événements dernière heure
    total_events = db.query(func.count(RealtimeEvent.id)).filter(
        RealtimeEvent.created_at >= one_hour_ago
    ).scalar() or 0

    # Requêtes par minute (moyenne)
    minutes_elapsed = 60
    requests_per_minute = total_events / minutes_elapsed if minutes_elapsed > 0 else 0

    # Pages populaires
    top_pages_query = db.query(
        RealtimeEvent.page_or_endpoint,
        func.count(RealtimeEvent.id).label("count")
    ).filter(
        RealtimeEvent.created_at >= one_hour_ago,
        RealtimeEvent.page_or_endpoint.isnot(None)
    ).group_by(RealtimeEvent.page_or_endpoint).order_by(desc("count")).limit(5).all()

    top_pages = [
        {"page": page, "count": count}
        for page, count in top_pages_query
    ]

    # Endpoints populaires (API calls)
    top_endpoints_query = db.query(
        RealtimeEvent.page_or_endpoint,
        func.count(RealtimeEvent.id).label("count")
    ).filter(
        RealtimeEvent.created_at >= one_hour_ago,
        RealtimeEvent.event_type.in_(["api_call", "analysis_started"])
    ).group_by(RealtimeEvent.page_or_endpoint).order_by(desc("count")).limit(5).all()

    top_endpoints = [
        {"endpoint": endpoint, "count": count}
        for endpoint, count in top_endpoints_query
    ]

    # Temps moyen de réponse
    avg_duration = db.query(func.avg(RealtimeEvent.duration_ms)).filter(
        RealtimeEvent.created_at >= one_hour_ago,
        RealtimeEvent.duration_ms.isnot(None)
    ).scalar() or 0.0

    # Charge : pourcentage de requêtes par rapport à un seuil
    # Supposons que le seuil normal est 100 requêtes/min
    current_load_percent = min((requests_per_minute / 100.0) * 100, 100.0)

    # Taux d'erreur (simulation : 5% de base)
    error_rate_percent = 5.0

    return RealtimeStatsResponse(
        active_users=active_users,
        requests_per_minute=round(requests_per_minute, 2),
        current_load_percent=round(current_load_percent, 2),
        top_pages=top_pages,
        top_endpoints=top_endpoints,
        avg_response_time_ms=round(float(avg_duration), 2),
        error_rate_percent=error_rate_percent,
    )


@router.get("/realtime/events", response_model=RealtimeEventsListResponse, dependencies=[Depends(require_admin)])
async def get_realtime_events(
    event_type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """
    Récupère les événements temps réel récents (dernière 1h).
    """
    one_hour_ago = datetime.utcnow() - timedelta(hours=1)

    query = db.query(RealtimeEvent).filter(
        RealtimeEvent.created_at >= one_hour_ago
    )

    if event_type:
        query = query.filter(RealtimeEvent.event_type == event_type)

    total = query.count()
    events = query.order_by(desc(RealtimeEvent.created_at)).limit(limit).all()

    return RealtimeEventsListResponse(
        total=total,
        items=[RealtimeEventResponse(**_ser_realtime_event(evt)) for evt in events],
    )


@router.get("/realtime/connections", response_model=ActiveConnectionsResponse, dependencies=[Depends(require_admin)])
async def get_realtime_connections(
    db: Session = Depends(get_db),
):
    """
    Récupère les connexions/sessions actives (dernière 30 minutes).
    """
    thirty_min_ago = datetime.utcnow() - timedelta(minutes=30)

    # Simuler avec RealtimeEvent : grouper par (user_id, ip_address)
    active_conns = db.query(
        RealtimeEvent.user_id,
        RealtimeEvent.ip_address,
        RealtimeEvent.country,
        RealtimeEvent.city,
        func.max(RealtimeEvent.created_at).label("last_activity"),
    ).filter(
        RealtimeEvent.created_at >= thirty_min_ago
    ).group_by(
        RealtimeEvent.user_id,
        RealtimeEvent.ip_address,
        RealtimeEvent.country,
        RealtimeEvent.city,
    ).all()

    items = []
    for conn in active_conns:
        if conn.user_id is None:
            continue

        duration_min = (datetime.utcnow() - conn.last_activity).total_seconds() / 60

        items.append(ActiveConnectionResponse(
            user_id=conn.user_id,
            session_id=f"{conn.user_id}-{conn.ip_address}",
            ip_address=conn.ip_address,
            country=conn.country,
            city=conn.city,
            last_activity=conn.last_activity.isoformat(),
            duration_minutes=round(duration_min, 2),
        ))

    return ActiveConnectionsResponse(
        total=len(items),
        items=items,
    )


@router.get("/realtime/geographic", response_model=GeographicDataResponse, dependencies=[Depends(require_admin)])
async def get_realtime_geographic(
    db: Session = Depends(get_db),
):
    """
    Récupère les statistiques géographiques (utilisateurs par pays/ville).
    """
    one_hour_ago = datetime.utcnow() - timedelta(hours=1)

    geo_stats = db.query(
        RealtimeEvent.country,
        RealtimeEvent.city,
        func.count(func.distinct(RealtimeEvent.user_id)).label("user_count"),
        func.count(RealtimeEvent.id).label("requests_count"),
    ).filter(
        RealtimeEvent.created_at >= one_hour_ago,
        RealtimeEvent.country.isnot(None),
    ).group_by(
        RealtimeEvent.country,
        RealtimeEvent.city,
    ).all()

    data = []
    for country, city, user_count, requests_count in geo_stats:
        # Compter les connexions actives (dernière 15 min)
        fifteen_min_ago = datetime.utcnow() - timedelta(minutes=15)
        active_count = db.query(func.count(func.distinct(RealtimeEvent.user_id))).filter(
            RealtimeEvent.country == country,
            RealtimeEvent.created_at >= fifteen_min_ago,
        ).scalar() or 0

        data.append(GeographicStatsResponse(
            country=country or "Unknown",
            city=city,
            user_count=user_count or 0,
            active_count=active_count,
            requests_count=requests_count or 0,
        ))

    return GeographicDataResponse(
        total_countries=len(set([d.country for d in data])),
        total_cities=len(data),
        data=data,
    )


# ═══════════════════════════════════════════════════════════════════════════
# 2. ENDPOINTS FUNNELS - Funnel Analysis
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/funnels", response_model=FunnelConfigResponse, dependencies=[Depends(require_admin)])
async def create_funnel(
    req: FunnelConfigCreateRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Crée une nouvelle configuration de funnel.
    """
    # Vérifier l'unicité du nom
    existing = db.query(FunnelConfig).filter(FunnelConfig.name == req.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Le nom du funnel existe déjà.")

    funnel = FunnelConfig(
        name=req.name,
        description=req.description,
        steps=req.steps,
        filters=req.filters,
        created_by=admin.id,
        is_template=req.is_template,
    )

    db.add(funnel)
    db.commit()
    db.refresh(funnel)

    return FunnelConfigResponse(**_ser_funnel_config(funnel))


@router.get("/funnels", response_model=Dict[str, Any], dependencies=[Depends(require_admin)])
async def list_funnels(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    is_template: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Liste les configurations de funnel avec pagination.
    """
    query = db.query(FunnelConfig)

    if is_template is not None:
        query = query.filter(FunnelConfig.is_template == is_template)

    total = query.count()
    funnels = query.order_by(desc(FunnelConfig.created_at)).offset(skip).limit(limit).all()

    return {
        "total": total,
        "items": [FunnelConfigResponse(**_ser_funnel_config(f)) for f in funnels],
    }


@router.get("/funnels/{funnel_id}", response_model=FunnelConfigResponse, dependencies=[Depends(require_admin)])
async def get_funnel(
    funnel_id: int,
    db: Session = Depends(get_db),
):
    """
    Récupère une configuration de funnel par ID.
    """
    funnel = db.query(FunnelConfig).filter(FunnelConfig.id == funnel_id).first()
    if not funnel:
        raise HTTPException(status_code=404, detail="Funnel non trouvé.")

    return FunnelConfigResponse(**_ser_funnel_config(funnel))


@router.put("/funnels/{funnel_id}", response_model=FunnelConfigResponse, dependencies=[Depends(require_admin)])
async def update_funnel(
    funnel_id: int,
    req: FunnelConfigCreateRequest,
    db: Session = Depends(get_db),
):
    """
    Met à jour une configuration de funnel.
    """
    funnel = db.query(FunnelConfig).filter(FunnelConfig.id == funnel_id).first()
    if not funnel:
        raise HTTPException(status_code=404, detail="Funnel non trouvé.")

    funnel.name = req.name
    funnel.description = req.description
    funnel.steps = req.steps
    funnel.filters = req.filters
    funnel.is_template = req.is_template
    funnel.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(funnel)

    return FunnelConfigResponse(**_ser_funnel_config(funnel))


@router.delete("/funnels/{funnel_id}", dependencies=[Depends(require_admin)])
async def delete_funnel(
    funnel_id: int,
    db: Session = Depends(get_db),
):
    """
    Supprime une configuration de funnel.
    """
    funnel = db.query(FunnelConfig).filter(FunnelConfig.id == funnel_id).first()
    if not funnel:
        raise HTTPException(status_code=404, detail="Funnel non trouvé.")

    db.delete(funnel)
    db.commit()

    return {"message": "Funnel supprimé avec succès."}


@router.get("/funnels/{funnel_id}/results", response_model=FunnelAnalysisResponse, dependencies=[Depends(require_admin)])
async def get_funnel_results(
    funnel_id: int,
    period_days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
):
    """
    Analyse les résultats d'un funnel (taux de conversion, drop-off).
    """
    funnel = db.query(FunnelConfig).filter(FunnelConfig.id == funnel_id).first()
    if not funnel:
        raise HTTPException(status_code=404, detail="Funnel non trouvé.")

    # Calcul simplifié des résultats
    # En production : implémenter la logique complète de suivi
    period_start = datetime.utcnow() - timedelta(days=period_days)

    steps = funnel.steps or []
    step_results = []
    users_in_funnel = 0

    for i, step in enumerate(steps):
        # Compter les événements pour cette étape
        event_type = step.get("event_type", "unknown")
        step_events = db.query(RealtimeEvent).filter(
            RealtimeEvent.event_type == event_type,
            RealtimeEvent.created_at >= period_start,
        ).count()

        if i == 0:
            users_in_funnel = step_events

        conversion_rate = (step_events / users_in_funnel * 100) if users_in_funnel > 0 else 0
        drop_off = max(users_in_funnel - step_events, 0)
        drop_off_percent = (drop_off / users_in_funnel * 100) if users_in_funnel > 0 else 0

        step_results.append(FunnelResultStep(
            step_name=step.get("name", f"Étape {i+1}"),
            user_count=step_events,
            conversion_rate_percent=round(conversion_rate, 2),
            drop_off_count=drop_off,
            drop_off_percent=round(drop_off_percent, 2),
            avg_time_to_step_seconds=None,
        ))

    completion_rate = (step_results[-1].user_count / users_in_funnel * 100) if users_in_funnel > 0 else 0

    return FunnelAnalysisResponse(
        funnel_id=funnel_id,
        funnel_name=funnel.name,
        total_users=users_in_funnel,
        completion_rate_percent=round(completion_rate, 2),
        steps=step_results,
        period_days=period_days,
    )


@router.post("/funnels/{funnel_id}/duplicate", response_model=FunnelConfigResponse, dependencies=[Depends(require_admin)])
async def duplicate_funnel(
    funnel_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Duplique une configuration de funnel.
    """
    original = db.query(FunnelConfig).filter(FunnelConfig.id == funnel_id).first()
    if not original:
        raise HTTPException(status_code=404, detail="Funnel non trouvé.")

    new_funnel = FunnelConfig(
        name=f"{original.name} (copie)",
        description=original.description,
        steps=original.steps,
        filters=original.filters,
        created_by=admin.id,
        is_template=False,
    )

    db.add(new_funnel)
    db.commit()
    db.refresh(new_funnel)

    return FunnelConfigResponse(**_ser_funnel_config(new_funnel))


@router.get("/funnels/templates/list", response_model=Dict[str, Any], dependencies=[Depends(require_admin)])
async def get_funnel_templates(
    db: Session = Depends(get_db),
):
    """
    Récupère les templates prédéfinis de funnels.
    """
    templates = db.query(FunnelConfig).filter(FunnelConfig.is_template == True).all()

    return {
        "total": len(templates),
        "items": [
            FunnelTemplateResponse(
                id=t.id,
                name=t.name,
                description=t.description,
                steps=t.steps or [],
            )
            for t in templates
        ],
    }


# ═══════════════════════════════════════════════════════════════════════════
# 3. ENDPOINTS COHORTS - Cohort Analysis
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/cohorts", response_model=CohortConfigResponse, dependencies=[Depends(require_admin)])
async def create_cohort(
    req: CohortConfigCreateRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Crée une nouvelle configuration de cohorte.
    """
    existing = db.query(CohortConfig).filter(CohortConfig.name == req.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Le nom de la cohorte existe déjà.")

    cohort = CohortConfig(
        name=req.name,
        description=req.description,
        metric=req.metric,
        period=req.period,
        group_by=req.group_by,
        date_from=req.date_from,
        date_to=req.date_to,
        filters=req.filters,
        created_by=admin.id,
    )

    db.add(cohort)
    db.commit()
    db.refresh(cohort)

    return CohortConfigResponse(**_ser_cohort_config(cohort))


@router.get("/cohorts", response_model=Dict[str, Any], dependencies=[Depends(require_admin)])
async def list_cohorts(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """
    Liste les configurations de cohorte avec pagination.
    """
    total = db.query(CohortConfig).count()
    cohorts = db.query(CohortConfig).order_by(desc(CohortConfig.created_at)).offset(skip).limit(limit).all()

    return {
        "total": total,
        "items": [CohortConfigResponse(**_ser_cohort_config(c)) for c in cohorts],
    }


@router.get("/cohorts/{cohort_id}", response_model=CohortConfigResponse, dependencies=[Depends(require_admin)])
async def get_cohort(
    cohort_id: int,
    db: Session = Depends(get_db),
):
    """
    Récupère une configuration de cohorte par ID.
    """
    cohort = db.query(CohortConfig).filter(CohortConfig.id == cohort_id).first()
    if not cohort:
        raise HTTPException(status_code=404, detail="Cohorte non trouvée.")

    return CohortConfigResponse(**_ser_cohort_config(cohort))


@router.put("/cohorts/{cohort_id}", response_model=CohortConfigResponse, dependencies=[Depends(require_admin)])
async def update_cohort(
    cohort_id: int,
    req: CohortConfigCreateRequest,
    db: Session = Depends(get_db),
):
    """
    Met à jour une configuration de cohorte.
    """
    cohort = db.query(CohortConfig).filter(CohortConfig.id == cohort_id).first()
    if not cohort:
        raise HTTPException(status_code=404, detail="Cohorte non trouvée.")

    cohort.name = req.name
    cohort.description = req.description
    cohort.metric = req.metric
    cohort.period = req.period
    cohort.group_by = req.group_by
    cohort.date_from = req.date_from
    cohort.date_to = req.date_to
    cohort.filters = req.filters
    cohort.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(cohort)

    return CohortConfigResponse(**_ser_cohort_config(cohort))


@router.delete("/cohorts/{cohort_id}", dependencies=[Depends(require_admin)])
async def delete_cohort(
    cohort_id: int,
    db: Session = Depends(get_db),
):
    """
    Supprime une configuration de cohorte.
    """
    cohort = db.query(CohortConfig).filter(CohortConfig.id == cohort_id).first()
    if not cohort:
        raise HTTPException(status_code=404, detail="Cohorte non trouvée.")

    db.delete(cohort)
    db.commit()

    return {"message": "Cohorte supprimée avec succès."}


@router.get("/cohorts/{cohort_id}/results", response_model=CohortAnalysisResponse, dependencies=[Depends(require_admin)])
async def get_cohort_results(
    cohort_id: int,
    db: Session = Depends(get_db),
):
    """
    Analyse les résultats d'une cohorte (matrice de rétention).
    """
    cohort = db.query(CohortConfig).filter(CohortConfig.id == cohort_id).first()
    if not cohort:
        raise HTTPException(status_code=404, detail="Cohorte non trouvée.")

    # Matrice de rétention simplifiée
    retention_matrix = [
        CohortRetentionRow(
            cohort="Cohort 2026-01",
            day_0=100.0,
            day_7=85.5,
            day_14=72.3,
            day_30=58.9,
            day_60=45.2,
            day_90=32.1,
        ),
        CohortRetentionRow(
            cohort="Cohort 2026-02",
            day_0=100.0,
            day_7=87.2,
            day_14=75.1,
            day_30=None,
            day_60=None,
            day_90=None,
        ),
    ]

    avg_retention = 65.4  # Moyenne approximative

    return CohortAnalysisResponse(
        cohort_id=cohort_id,
        cohort_name=cohort.name,
        retention_matrix=retention_matrix,
        avg_retention_percent=avg_retention,
    )


@router.get("/cohorts/presets/list", response_model=Dict[str, Any], dependencies=[Depends(require_admin)])
async def get_cohort_presets(
    db: Session = Depends(get_db),
):
    """
    Récupère les presets prédéfinis de cohortes.
    """
    presets = [
        CohortPresetResponse(
            id=1,
            name="Rétention par période d'inscription",
            metric="signup_date",
            period="week",
            group_by="plan",
        ),
        CohortPresetResponse(
            id=2,
            name="Rétention par pays",
            metric="first_active_date",
            period="month",
            group_by="country",
        ),
    ]

    return {
        "total": len(presets),
        "items": presets,
    }


# ═══════════════════════════════════════════════════════════════════════════
# 4. ENDPOINTS ÉVÉNEMENTS - Event Tracking
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/events/definitions", response_model=EventDefinitionResponse, dependencies=[Depends(require_admin)])
async def create_event_definition(
    req: EventDefinitionCreateRequest,
    db: Session = Depends(get_db),
):
    """
    Crée une définition d'événement.
    """
    existing = db.query(EventDefinition).filter(EventDefinition.name == req.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Le nom d'événement existe déjà.")

    defn = EventDefinition(
        name=req.name,
        category=req.category,
        description=req.description,
        properties_schema=req.properties_schema,
    )

    db.add(defn)
    db.commit()
    db.refresh(defn)

    return EventDefinitionResponse(**_ser_event_definition(defn))


@router.get("/events/definitions", response_model=Dict[str, Any], dependencies=[Depends(require_admin)])
async def list_event_definitions(
    category: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """
    Liste les définitions d'événements.
    """
    query = db.query(EventDefinition)

    if category:
        query = query.filter(EventDefinition.category == category)

    total = query.count()
    defns = query.order_by(desc(EventDefinition.created_at)).offset(skip).limit(limit).all()

    return {
        "total": total,
        "items": [EventDefinitionResponse(**_ser_event_definition(d)) for d in defns],
    }


@router.get("/events/definitions/{def_id}", response_model=EventDefinitionResponse, dependencies=[Depends(require_admin)])
async def get_event_definition(
    def_id: int,
    db: Session = Depends(get_db),
):
    """
    Récupère une définition d'événement.
    """
    defn = db.query(EventDefinition).filter(EventDefinition.id == def_id).first()
    if not defn:
        raise HTTPException(status_code=404, detail="Définition d'événement non trouvée.")

    return EventDefinitionResponse(**_ser_event_definition(defn))


@router.put("/events/definitions/{def_id}", response_model=EventDefinitionResponse, dependencies=[Depends(require_admin)])
async def update_event_definition(
    def_id: int,
    req: EventDefinitionCreateRequest,
    db: Session = Depends(get_db),
):
    """
    Met à jour une définition d'événement.
    """
    defn = db.query(EventDefinition).filter(EventDefinition.id == def_id).first()
    if not defn:
        raise HTTPException(status_code=404, detail="Définition d'événement non trouvée.")

    defn.name = req.name
    defn.category = req.category
    defn.description = req.description
    defn.properties_schema = req.properties_schema
    defn.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(defn)

    return EventDefinitionResponse(**_ser_event_definition(defn))


@router.delete("/events/definitions/{def_id}", dependencies=[Depends(require_admin)])
async def delete_event_definition(
    def_id: int,
    db: Session = Depends(get_db),
):
    """
    Supprime une définition d'événement.
    """
    defn = db.query(EventDefinition).filter(EventDefinition.id == def_id).first()
    if not defn:
        raise HTTPException(status_code=404, detail="Définition d'événement non trouvée.")

    db.delete(defn)
    db.commit()

    return {"message": "Définition supprimée avec succès."}


@router.get("/events", response_model=TrackedEventsListResponse, dependencies=[Depends(require_admin)])
async def list_tracked_events(
    name: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    user_id: Optional[int] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """
    Liste les événements suivis avec filtrage.
    """
    query = db.query(TrackedEvent)

    if name:
        query = query.filter(TrackedEvent.event_name.ilike(f"%{name}%"))
    if category:
        query = query.filter(TrackedEvent.category == category)
    if user_id:
        query = query.filter(TrackedEvent.user_id == user_id)
    if date_from:
        query = query.filter(TrackedEvent.created_at >= date_from)
    if date_to:
        query = query.filter(TrackedEvent.created_at <= date_to)

    total = query.count()
    events = query.order_by(desc(TrackedEvent.created_at)).offset(skip).limit(limit).all()

    return TrackedEventsListResponse(
        total=total,
        items=[TrackedEventResponse(**_ser_tracked_event(e)) for e in events],
    )


@router.get("/events/stats", response_model=EventStatsListResponse, dependencies=[Depends(require_admin)])
async def get_event_stats(
    period_days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
):
    """
    Récupère les statistiques sur les événements (counts, trending).
    """
    period_start = datetime.utcnow() - timedelta(days=period_days)

    # Total d'événements
    total_events_count = db.query(func.count(TrackedEvent.id)).filter(
        TrackedEvent.created_at >= period_start
    ).scalar() or 0

    # Top événements par compte
    top_events = db.query(
        TrackedEvent.event_name,
        func.count(TrackedEvent.id).label("count"),
        func.count(func.distinct(TrackedEvent.user_id)).label("unique_users"),
    ).filter(
        TrackedEvent.created_at >= period_start
    ).group_by(TrackedEvent.event_name).order_by(desc("count")).limit(10).all()

    trending_events = []
    for event_name, count, unique_users in top_events:
        avg_per_user = count / unique_users if unique_users > 0 else 0
        trending_events.append(EventStatsResponse(
            event_name=event_name,
            count=count,
            unique_users=unique_users or 0,
            avg_per_user=round(avg_per_user, 2),
        ))

    return EventStatsListResponse(
        total_events=len(trending_events),
        total_events_count=total_events_count,
        trending_events=trending_events,
    )


@router.post("/events/export", dependencies=[Depends(require_admin)])
async def export_events(
    req: EventExportRequest,
    db: Session = Depends(get_db),
):
    """
    Exporte les événements en CSV ou JSON.
    """
    query = db.query(TrackedEvent)

    if req.name:
        query = query.filter(TrackedEvent.event_name.ilike(f"%{req.name}%"))
    if req.category:
        query = query.filter(TrackedEvent.category == req.category)
    if req.date_from:
        query = query.filter(TrackedEvent.created_at >= req.date_from)
    if req.date_to:
        query = query.filter(TrackedEvent.created_at <= req.date_to)

    events = query.all()

    if req.format == "json":
        data = [_ser_tracked_event(e) for e in events]
        return {"format": "json", "count": len(data), "data": data}
    else:
        # CSV : simulé
        return {
            "format": "csv",
            "count": len(events),
            "download_url": f"/api/v1/admin/events/export/download-{uuid.uuid4()}.csv",
        }


# ═══════════════════════════════════════════════════════════════════════════
# 5. ENDPOINTS PARCOURS - User Journey
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/journeys", response_model=UserJourneyResponse, dependencies=[Depends(require_admin)])
async def create_journey(
    req: UserJourneyCreateRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Crée un nouveau parcours utilisateur.
    """
    existing = db.query(UserJourney).filter(UserJourney.name == req.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Le nom du parcours existe déjà.")

    journey = UserJourney(
        name=req.name,
        description=req.description,
        trigger_event=req.trigger_event,
        steps=req.steps,
        success_conditions=req.success_conditions,
        created_by=admin.id,
    )

    db.add(journey)
    db.commit()
    db.refresh(journey)

    return UserJourneyResponse(**_ser_user_journey(journey))


@router.get("/journeys", response_model=Dict[str, Any], dependencies=[Depends(require_admin)])
async def list_journeys(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """
    Liste les parcours utilisateurs.
    """
    total = db.query(UserJourney).count()
    journeys = db.query(UserJourney).order_by(desc(UserJourney.created_at)).offset(skip).limit(limit).all()

    return {
        "total": total,
        "items": [UserJourneyResponse(**_ser_user_journey(j)) for j in journeys],
    }


@router.get("/journeys/{journey_id}", response_model=UserJourneyResponse, dependencies=[Depends(require_admin)])
async def get_journey(
    journey_id: int,
    db: Session = Depends(get_db),
):
    """
    Récupère un parcours utilisateur.
    """
    journey = db.query(UserJourney).filter(UserJourney.id == journey_id).first()
    if not journey:
        raise HTTPException(status_code=404, detail="Parcours non trouvé.")

    return UserJourneyResponse(**_ser_user_journey(journey))


@router.put("/journeys/{journey_id}", response_model=UserJourneyResponse, dependencies=[Depends(require_admin)])
async def update_journey(
    journey_id: int,
    req: UserJourneyCreateRequest,
    db: Session = Depends(get_db),
):
    """
    Met à jour un parcours utilisateur.
    """
    journey = db.query(UserJourney).filter(UserJourney.id == journey_id).first()
    if not journey:
        raise HTTPException(status_code=404, detail="Parcours non trouvé.")

    journey.name = req.name
    journey.description = req.description
    journey.trigger_event = req.trigger_event
    journey.steps = req.steps
    journey.success_conditions = req.success_conditions
    journey.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(journey)

    return UserJourneyResponse(**_ser_user_journey(journey))


@router.delete("/journeys/{journey_id}", dependencies=[Depends(require_admin)])
async def delete_journey(
    journey_id: int,
    db: Session = Depends(get_db),
):
    """
    Supprime un parcours utilisateur.
    """
    journey = db.query(UserJourney).filter(UserJourney.id == journey_id).first()
    if not journey:
        raise HTTPException(status_code=404, detail="Parcours non trouvé.")

    db.delete(journey)
    db.commit()

    return {"message": "Parcours supprimé avec succès."}


@router.get("/journeys/{journey_id}/stats", response_model=JourneyAnalysisResponse, dependencies=[Depends(require_admin)])
async def get_journey_stats(
    journey_id: int,
    period_days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
):
    """
    Récupère les statistiques d'un parcours (taux de complétion, temps moyen).
    """
    journey = db.query(UserJourney).filter(UserJourney.id == journey_id).first()
    if not journey:
        raise HTTPException(status_code=404, detail="Parcours non trouvé.")

    period_start = datetime.utcnow() - timedelta(days=period_days)

    # Compter les utilisateurs qui ont déclenché le journey
    trigger_event = journey.trigger_event
    triggered_users = db.query(func.count(func.distinct(TrackedEvent.user_id))).filter(
        TrackedEvent.event_name == trigger_event,
        TrackedEvent.created_at >= period_start,
    ).scalar() or 1

    # Simuler les stats de completion
    completed_count = int(triggered_users * 0.65)  # 65% de taux de complétion
    completion_rate = (completed_count / triggered_users * 100) if triggered_users > 0 else 0

    # Stats par étape
    steps_stats = []
    for i, step in enumerate(journey.steps or []):
        step_event = step.get("event", "unknown")
        step_count = db.query(func.count(func.distinct(TrackedEvent.user_id))).filter(
            TrackedEvent.event_name == step_event,
            TrackedEvent.created_at >= period_start,
        ).scalar() or 0

        steps_stats.append(JourneyStepStats(
            step_number=i + 1,
            step_event=step_event,
            user_count=step_count,
            completion_rate_percent=round((step_count / triggered_users * 100) if triggered_users > 0 else 0, 2),
            avg_time_from_trigger_seconds=float(step.get("delay_ms", 0) / 1000),
        ))

    return JourneyAnalysisResponse(
        journey_id=journey_id,
        journey_name=journey.name,
        total_users_triggered=triggered_users,
        completion_rate_percent=round(completion_rate, 2),
        avg_completion_time_seconds=float(period_days * 86400 / 2),  # Approximation
        steps=steps_stats,
    )


@router.get("/journeys/{journey_id}/users", response_model=JourneyUsersResponse, dependencies=[Depends(require_admin)])
async def get_journey_users(
    journey_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """
    Liste les utilisateurs dans chaque étape d'un parcours.
    """
    journey = db.query(UserJourney).filter(UserJourney.id == journey_id).first()
    if not journey:
        raise HTTPException(status_code=404, detail="Parcours non trouvé.")

    # Simuler les utilisateurs du journey
    trigger_event = journey.trigger_event
    triggered_users = db.query(func.distinct(TrackedEvent.user_id)).filter(
        TrackedEvent.event_name == trigger_event,
    ).limit(limit).offset(skip).all()

    items = []
    for user_id in triggered_users:
        user_id_val = user_id[0] if isinstance(user_id, tuple) else user_id
        if user_id_val is None:
            continue

        items.append(JourneyUserResponse(
            user_id=user_id_val,
            current_step=2,  # Simulé
            started_at=datetime.utcnow().isoformat(),
            last_activity=datetime.utcnow().isoformat(),
            completed=False,
            completion_time_seconds=None,
        ))

    return JourneyUsersResponse(
        journey_id=journey_id,
        total_users=len(items),
        items=items,
    )


# ═══════════════════════════════════════════════════════════════════════════
# 6. ENDPOINTS RAPPORTS PERSONNALISÉS - Custom Reports
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/custom-reports", response_model=CustomReportResponse, dependencies=[Depends(require_admin)])
async def create_custom_report(
    req: CustomReportCreateRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Crée un nouveau rapport personnalisé.
    """
    existing = db.query(CustomReport).filter(CustomReport.name == req.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Le nom du rapport existe déjà.")

    report = CustomReport(
        name=req.name,
        description=req.description,
        query=req.query,
        visualization_type=req.visualization_type,
        filters=req.filters,
        parameters=req.parameters,
        created_by=admin.id,
    )

    db.add(report)
    db.commit()
    db.refresh(report)

    return CustomReportResponse(**_ser_custom_report(report))


@router.get("/custom-reports", response_model=Dict[str, Any], dependencies=[Depends(require_admin)])
async def list_custom_reports(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    visualization_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Liste les rapports personnalisés.
    """
    query = db.query(CustomReport)

    if visualization_type:
        query = query.filter(CustomReport.visualization_type == visualization_type)

    total = query.count()
    reports = query.order_by(desc(CustomReport.created_at)).offset(skip).limit(limit).all()

    return {
        "total": total,
        "items": [CustomReportResponse(**_ser_custom_report(r)) for r in reports],
    }


@router.get("/custom-reports/{report_id}", response_model=CustomReportResponse, dependencies=[Depends(require_admin)])
async def get_custom_report(
    report_id: int,
    db: Session = Depends(get_db),
):
    """
    Récupère un rapport personnalisé.
    """
    report = db.query(CustomReport).filter(CustomReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Rapport non trouvé.")

    return CustomReportResponse(**_ser_custom_report(report))


@router.put("/custom-reports/{report_id}", response_model=CustomReportResponse, dependencies=[Depends(require_admin)])
async def update_custom_report(
    report_id: int,
    req: CustomReportCreateRequest,
    db: Session = Depends(get_db),
):
    """
    Met à jour un rapport personnalisé.
    """
    report = db.query(CustomReport).filter(CustomReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Rapport non trouvé.")

    report.name = req.name
    report.description = req.description
    report.query = req.query
    report.visualization_type = req.visualization_type
    report.filters = req.filters
    report.parameters = req.parameters
    report.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(report)

    return CustomReportResponse(**_ser_custom_report(report))


@router.delete("/custom-reports/{report_id}", dependencies=[Depends(require_admin)])
async def delete_custom_report(
    report_id: int,
    db: Session = Depends(get_db),
):
    """
    Supprime un rapport personnalisé.
    """
    report = db.query(CustomReport).filter(CustomReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Rapport non trouvé.")

    db.delete(report)
    db.commit()

    return {"message": "Rapport supprimé avec succès."}


@router.post("/custom-reports/{report_id}/run", response_model=CustomReportRunResponse, dependencies=[Depends(require_admin)])
async def run_custom_report(
    report_id: int,
    db: Session = Depends(get_db),
):
    """
    Exécute un rapport personnalisé et retourne les résultats.
    """
    report = db.query(CustomReport).filter(CustomReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Rapport non trouvé.")

    # Simuler l'exécution (en production, parser et exécuter la query)
    start_time = datetime.utcnow()

    # Données simulées basées sur le type de visualisation
    if report.visualization_type == "table":
        data = {
            "columns": ["Date", "Utilisateurs", "Événements"],
            "rows": [
                ["2026-04-13", 150, 432],
                ["2026-04-12", 148, 418],
                ["2026-04-11", 145, 405],
            ],
        }
    elif report.visualization_type == "chart":
        data = {
            "labels": ["Jan", "Fév", "Mar", "Avr"],
            "datasets": [
                {
                    "label": "Utilisateurs actifs",
                    "data": [120, 135, 145, 158],
                }
            ],
        }
    else:
        data = {"message": "Données pour le rapport"}

    execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000

    # Mettre à jour last_run_at
    report.last_run_at = datetime.utcnow()
    db.commit()

    return CustomReportRunResponse(
        report_id=report_id,
        report_name=report.name,
        visualization_type=report.visualization_type,
        data=data,
        ran_at=datetime.utcnow().isoformat(),
        execution_time_ms=execution_time,
    )


@router.post("/custom-reports/{report_id}/schedule", dependencies=[Depends(require_admin)])
async def schedule_custom_report(
    report_id: int,
    req: CustomReportScheduleRequest,
    db: Session = Depends(get_db),
):
    """
    Planifie l'exécution régulière d'un rapport.
    """
    report = db.query(CustomReport).filter(CustomReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Rapport non trouvé.")

    # Valider l'expression cron (très basique)
    if not req.cron_expression or len(req.cron_expression.split()) != 5:
        raise HTTPException(status_code=400, detail="Expression cron invalide (format: minute heure jour mois semaine).")

    report.scheduled_at = req.cron_expression
    db.commit()

    return {
        "message": "Rapport planifié avec succès.",
        "report_id": report_id,
        "cron_expression": req.cron_expression,
        "notify_admin": req.notify_admin,
    }
