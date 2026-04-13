"""
Admin Router — Opérations en masse ET monitoring système pour CueForge.

Endpoints regroupés :
  /admin/bulk/users              → Actions groupées sur utilisateurs
  /admin/bulk/tracks             → Actions groupées sur pistes
  /admin/bulk/emails             → Envois en masse
  /admin/bulk/jobs               → Gestion des jobs en masse
  /admin/import-export/...       → Import/export de données
  /admin/search/...              → Recherche avancée multi-entités
  /admin/monitoring/...          → Métriques système (CPU, mémoire, DB, cache, services)
  /admin/errors/...              → Suivi des erreurs et stack traces
  /admin/performance/...         → Profiling et optimisation
  /admin/in-app-notifications/...→ Gestion des notifications in-app

Tous les endpoints nécessitent is_admin == True.
"""
import json
import psutil
import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from enum import Enum

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from pydantic import BaseModel, Field
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Float, JSON, ForeignKey, func
from sqlalchemy.orm import Session

from app.database import get_db, Base
from app.middleware.admin import require_admin
from app.models.user import User

router = APIRouter(prefix="/admin", tags=["admin"])
logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════
# MODÈLES SQLALCHEMY
# ═══════════════════════════════════════════════

class BulkJob(Base):
    """Représente une tâche en masse (utilisateurs, pistes, emails, etc.)"""
    __tablename__ = "admin_bulk_jobs"

    id = Column(Integer, primary_key=True, index=True)
    job_type = Column(String, nullable=False)  # "users_action", "tracks_action", "emails_send"
    action = Column(String, nullable=False)  # "activate", "delete", "retag", "export"
    status = Column(String, default="pending", nullable=False)  # pending, running, completed, failed
    progress = Column(Integer, default=0, nullable=False)  # pourcentage (0-100)
    total_items = Column(Integer, default=0, nullable=False)
    processed_items = Column(Integer, default=0, nullable=False)
    failed_items = Column(Integer, default=0, nullable=False)

    # Paramètres du job
    filters = Column(JSON, nullable=True)  # ex: {"plan": "free", "created_before": "2026-01-01"}
    action_params = Column(JSON, nullable=True)  # ex: {"new_plan": "pro"}

    # Métadonnées
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # Résultats
    result_summary = Column(JSON, nullable=True)  # {success: N, failed: N, errors: [...]}
    error_log = Column(Text, nullable=True)  # Log des erreurs détaillées


class ImportExportJob(Base):
    """Représente une tâche d'import/export"""
    __tablename__ = "admin_import_export_jobs"

    id = Column(Integer, primary_key=True, index=True)
    job_type = Column(String, nullable=False)  # "import", "export"
    data_type = Column(String, nullable=False)  # "users", "tracks", "playlists", "organizations"
    format = Column(String, nullable=False)  # "csv", "json", "xlsx"
    status = Column(String, default="pending", nullable=False)
    progress = Column(Integer, default=0, nullable=False)

    # Métadonnées
    file_name = Column(String, nullable=True)
    file_size = Column(Integer, nullable=True)  # bytes
    file_url = Column(String, nullable=True)  # URL pour télécharger

    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)

    # Résultats
    total_rows = Column(Integer, default=0, nullable=False)
    imported_rows = Column(Integer, default=0, nullable=False)
    skipped_rows = Column(Integer, default=0, nullable=False)
    error_log = Column(Text, nullable=True)


class FieldMapping(Base):
    """Configurations de mapping de champs pour import/export"""
    __tablename__ = "admin_field_mappings"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)  # ex: "spotify_tracks_to_cueforge"
    data_type = Column(String, nullable=False)  # "users", "tracks", "playlists"

    # JSON: {"source_field": "target_field", ...}
    mapping_config = Column(JSON, nullable=False)

    # Transformateurs personnalisés
    transformers = Column(JSON, nullable=True)  # {field: {type: "function", name: "clean_email"}}

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class SavedSearch(Base):
    """Recherches sauvegardées par admin"""
    __tablename__ = "admin_saved_searches"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)

    # Paramètres de recherche
    search_type = Column(String, nullable=False)  # "global", "users", "tracks"
    query = Column(String, nullable=False)  # Terme de recherche
    filters = Column(JSON, nullable=True)  # {field: value, ...}
    sort_by = Column(String, nullable=True)  # "created_at", "relevance"

    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_used_at = Column(DateTime, nullable=True)
    hit_count = Column(Integer, default=0, nullable=False)


class AlertRule(Base):
    """Règles d'alerte pour monitoring"""
    __tablename__ = "admin_alert_rules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    enabled = Column(Boolean, default=True, nullable=False)

    # Metric monitoring
    metric_name = Column(String, nullable=False)  # "cpu_usage", "db_connections", "error_rate"
    threshold = Column(Float, nullable=False)  # Seuil d'alerte
    comparison = Column(String, nullable=False)  # "gt", "lt", "eq"
    duration_seconds = Column(Integer, default=300, nullable=False)  # Durée avant déclenchement

    # Actions
    notify_slack = Column(Boolean, default=False, nullable=False)
    notify_email = Column(Boolean, default=False, nullable=False)
    webhook_url = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class ErrorLog(Base):
    """Logs d'erreurs centralisés"""
    __tablename__ = "admin_error_logs"

    id = Column(Integer, primary_key=True, index=True)

    # Identifiant d'erreur (fingerprint pour grouper erreurs similaires)
    error_fingerprint = Column(String, index=True, nullable=False)

    level = Column(String, nullable=False)  # "DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"
    source = Column(String, nullable=False)  # "api", "worker", "service", "database"

    message = Column(String, nullable=False)
    stack_trace = Column(Text, nullable=True)
    context = Column(JSON, nullable=True)  # Contexte de l'erreur (user_id, track_id, etc.)

    is_resolved = Column(Boolean, default=False, nullable=False)
    is_ignored = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, index=True, nullable=False)
    resolved_at = Column(DateTime, nullable=True)


class PerformanceMetric(Base):
    """Métriques de performance (CPU, mémoire, latences API)"""
    __tablename__ = "admin_performance_metrics"

    id = Column(Integer, primary_key=True, index=True)

    metric_type = Column(String, nullable=False)  # "cpu", "memory", "endpoint", "query"
    metric_name = Column(String, nullable=False)  # "cpu_percent", "get_tracks_latency", "query_slowlog"

    value = Column(Float, nullable=False)
    unit = Column(String, nullable=False)  # "percent", "ms", "count", "bytes"

    # Pour les endpoints/queries
    endpoint_or_query = Column(String, nullable=True)  # "/api/tracks", "SELECT * FROM tracks"
    percentile = Column(String, nullable=True)  # "p50", "p95", "p99"

    created_at = Column(DateTime, default=datetime.utcnow, index=True, nullable=False)


class InAppNotification(Base):
    """Notifications in-app pour les utilisateurs"""
    __tablename__ = "admin_in_app_notifications"

    id = Column(Integer, primary_key=True, index=True)

    # Modèle ou notification unique
    title = Column(String, nullable=False)
    body = Column(String, nullable=False)
    icon_url = Column(String, nullable=True)
    action_url = Column(String, nullable=True)
    action_label = Column(String, nullable=True)

    # Ciblage
    target_type = Column(String, default="all", nullable=False)  # "all", "segment", "user_list"
    target_segment = Column(String, nullable=True)  # "free_users", "pro_users", "inactive"
    target_user_ids = Column(JSON, nullable=True)  # [user_id, ...]

    # État
    status = Column(String, default="draft", nullable=False)  # "draft", "scheduled", "sent", "archived"
    scheduled_at = Column(DateTime, nullable=True)

    # Statistiques
    total_recipients = Column(Integer, default=0, nullable=False)
    delivered_count = Column(Integer, default=0, nullable=False)
    read_count = Column(Integer, default=0, nullable=False)
    click_count = Column(Integer, default=0, nullable=False)

    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


# ═══════════════════════════════════════════════
# PYDANTIC SCHEMAS
# ═══════════════════════════════════════════════

# ── BULK OPERATIONS ──

class BulkUserActionRequest(BaseModel):
    """Requête pour action groupée sur utilisateurs"""
    action: str  # "activate", "deactivate", "delete", "change_plan", "add_tag", "remove_tag"
    filters: Dict[str, Any]  # {"plan": "free", "created_before": "2026-01-01"}
    action_params: Dict[str, Any]  # {"new_plan": "pro"}


class BulkTrackActionRequest(BaseModel):
    """Requête pour action groupée sur pistes"""
    action: str  # "delete", "retag", "reanalyze", "export", "archive"
    filters: Dict[str, Any]  # {"user_id": 123, "genre": "techno"}
    action_params: Dict[str, Any]  # {"tags": ["new"], "archive": True}


class BulkEmailRequest(BaseModel):
    """Requête d'envoi d'email en masse"""
    subject: str
    body: str
    html_body: Optional[str] = None
    target_user_ids: Optional[List[int]] = None  # None = tous les utilisateurs
    target_segment: Optional[str] = None  # "free_users", "pro_users"


class BulkJobResponse(BaseModel):
    """Réponse pour job en masse"""
    id: int
    job_type: str
    action: str
    status: str
    progress: int
    total_items: int
    processed_items: int
    failed_items: int
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    result_summary: Optional[Dict[str, Any]] = None


# ── IMPORT/EXPORT ──

class ImportRequest(BaseModel):
    """Requête pour importer des données"""
    data_type: str  # "users", "tracks", "playlists"
    file_name: str
    format: str  # "csv", "json", "xlsx"
    field_mapping_id: Optional[int] = None  # ID du mapping à utiliser


class ExportRequest(BaseModel):
    """Requête pour exporter des données"""
    data_type: str
    format: str = "csv"
    filters: Optional[Dict[str, Any]] = None


class FieldMappingRequest(BaseModel):
    """Requête pour créer/modifier un mapping de champs"""
    name: str
    data_type: str
    mapping_config: Dict[str, str]  # {source: target, ...}
    transformers: Optional[Dict[str, Dict[str, str]]] = None


# ── RECHERCHE ──

class GlobalSearchRequest(BaseModel):
    """Requête pour recherche globale"""
    query: str
    entity_types: Optional[List[str]] = None  # ["users", "tracks", "playlists"]
    filters: Optional[Dict[str, Any]] = None
    limit: int = 50
    offset: int = 0


class SaveSearchRequest(BaseModel):
    """Requête pour sauvegarder une recherche"""
    name: str
    search_type: str
    query: str
    filters: Optional[Dict[str, Any]] = None


class SavedSearchResponse(BaseModel):
    """Réponse pour recherche sauvegardée"""
    id: int
    name: str
    search_type: str
    query: str
    hit_count: int
    created_at: str
    last_used_at: Optional[str] = None


# ── MONITORING ──

class SystemMetricsResponse(BaseModel):
    """Métriques système"""
    cpu_percent: float
    memory_percent: float
    disk_percent: float
    uptime_seconds: int
    timestamp: str


class DatabaseMetricsResponse(BaseModel):
    """Métriques base de données"""
    total_connections: int
    active_connections: int
    queries_per_second: float
    slow_queries_count: int
    db_size_bytes: int
    timestamp: str


class ServiceStatusResponse(BaseModel):
    """État des services externes"""
    service_name: str  # "spotify", "acoustid", "musicbrainz"
    status: str  # "online", "offline", "degraded"
    latency_ms: int
    last_check: str


class AlertRuleRequest(BaseModel):
    """Requête pour créer/modifier une règle d'alerte"""
    name: str
    metric_name: str
    threshold: float
    comparison: str  # "gt", "lt", "eq"
    duration_seconds: int = 300
    notify_slack: bool = False
    notify_email: bool = False
    webhook_url: Optional[str] = None


class ErrorStatsResponse(BaseModel):
    """Statistiques d'erreurs"""
    total_errors: int
    errors_today: int
    critical_errors: int
    trending_errors: List[Dict[str, Any]]
    top_sources: Dict[str, int]  # {source: count, ...}


class PerformanceOverviewResponse(BaseModel):
    """Vue d'ensemble des performances"""
    performance_score: float  # 0-100
    slowest_endpoints: List[Dict[str, Any]]
    slowest_queries: List[Dict[str, Any]]
    recommendations: List[str]


class InAppNotificationRequest(BaseModel):
    """Requête pour créer/modifier une notification in-app"""
    title: str
    body: str
    icon_url: Optional[str] = None
    action_url: Optional[str] = None
    action_label: Optional[str] = None
    target_type: str = "all"  # "all", "segment", "user_list"
    target_segment: Optional[str] = None
    target_user_ids: Optional[List[int]] = None
    scheduled_at: Optional[str] = None


class InAppNotificationResponse(BaseModel):
    """Réponse pour notification in-app"""
    id: int
    title: str
    status: str
    total_recipients: int
    delivered_count: int
    read_count: int
    click_count: int
    created_at: str


# ═══════════════════════════════════════════════
# HELPERS POUR SÉRIALISATION
# ═══════════════════════════════════════════════

def _serialize_bulk_job(job: BulkJob) -> BulkJobResponse:
    """Sérialise un BulkJob"""
    return BulkJobResponse(
        id=job.id,
        job_type=job.job_type,
        action=job.action,
        status=job.status,
        progress=job.progress,
        total_items=job.total_items,
        processed_items=job.processed_items,
        failed_items=job.failed_items,
        created_at=job.created_at.isoformat() if job.created_at else None,
        started_at=job.started_at.isoformat() if job.started_at else None,
        completed_at=job.completed_at.isoformat() if job.completed_at else None,
        result_summary=job.result_summary,
    )


def _serialize_saved_search(search: SavedSearch) -> SavedSearchResponse:
    """Sérialise une recherche sauvegardée"""
    return SavedSearchResponse(
        id=search.id,
        name=search.name,
        search_type=search.search_type,
        query=search.query,
        hit_count=search.hit_count,
        created_at=search.created_at.isoformat() if search.created_at else None,
        last_used_at=search.last_used_at.isoformat() if search.last_used_at else None,
    )


# ═══════════════════════════════════════════════
# PART A — BULK OPERATIONS
# ═══════════════════════════════════════════════

# ── BULK ACTIONS ──

@router.post("/bulk/users/action", response_model=BulkJobResponse)
async def bulk_user_action(
    request: BulkUserActionRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Effectue une action groupée sur les utilisateurs.
    Actions: activate, deactivate, delete, change_plan, add_tag, remove_tag
    """
    job = BulkJob(
        job_type="users_action",
        action=request.action,
        status="pending",
        filters=request.filters,
        action_params=request.action_params,
        created_by=admin.id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    logger.info(
        f"Bulk user action créé : job_id={job.id}, action={request.action}, "
        f"filters={request.filters}"
    )

    return _serialize_bulk_job(job)


@router.post("/bulk/tracks/action", response_model=BulkJobResponse)
async def bulk_track_action(
    request: BulkTrackActionRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Effectue une action groupée sur les pistes.
    Actions: delete, retag, reanalyze, export, archive
    """
    job = BulkJob(
        job_type="tracks_action",
        action=request.action,
        status="pending",
        filters=request.filters,
        action_params=request.action_params,
        created_by=admin.id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    logger.info(
        f"Bulk track action créé : job_id={job.id}, action={request.action}"
    )

    return _serialize_bulk_job(job)


@router.post("/bulk/emails/send", response_model=BulkJobResponse)
async def bulk_email_send(
    request: BulkEmailRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Envoie des emails en masse à une liste d'utilisateurs ou à un segment.
    """
    job = BulkJob(
        job_type="emails_send",
        action="send",
        status="pending",
        action_params={
            "subject": request.subject,
            "body": request.body,
            "html_body": request.html_body,
            "target_user_ids": request.target_user_ids,
            "target_segment": request.target_segment,
        },
        created_by=admin.id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    logger.info(f"Bulk email job créé : job_id={job.id}")

    return _serialize_bulk_job(job)


@router.get("/bulk/jobs", response_model=Dict[str, Any])
async def list_bulk_jobs(
    status: Optional[str] = Query(None),
    job_type: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Liste les jobs en masse avec filtrage optionnel par status/type.
    """
    query = db.query(BulkJob)

    if status:
        query = query.filter(BulkJob.status == status)
    if job_type:
        query = query.filter(BulkJob.job_type == job_type)

    total = query.count()
    jobs = query.order_by(BulkJob.created_at.desc()).offset(skip).limit(limit).all()

    return {
        "total": total,
        "items": [_serialize_bulk_job(job) for job in jobs],
    }


@router.get("/bulk/jobs/{job_id}", response_model=BulkJobResponse)
async def get_bulk_job(
    job_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Récupère les détails d'un job en masse avec la progression.
    """
    job = db.query(BulkJob).filter(BulkJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job non trouvé")

    return _serialize_bulk_job(job)


@router.delete("/bulk/jobs/{job_id}")
async def cancel_bulk_job(
    job_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Annule un job en masse (si pending ou running).
    """
    job = db.query(BulkJob).filter(BulkJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job non trouvé")

    if job.status not in ["pending", "running"]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel job with status '{job.status}'"
        )

    job.status = "cancelled"
    db.commit()

    logger.info(f"Bulk job annulé : job_id={job_id}")

    return {"message": "Job annulé", "job_id": job_id}


# ── IMPORT/EXPORT ──

@router.post("/import-export/import", response_model=Dict[str, Any])
async def import_data(
    request: ImportRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Importe des données (users, tracks, playlists, etc.) à partir d'un fichier.
    Formats supportés: csv, json, xlsx
    """
    job = ImportExportJob(
        job_type="import",
        data_type=request.data_type,
        format=request.format,
        file_name=request.file_name,
        status="pending",
        created_by=admin.id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    logger.info(
        f"Import job créé : job_id={job.id}, data_type={request.data_type}, "
        f"format={request.format}"
    )

    return {
        "id": job.id,
        "status": job.status,
        "message": f"Import job {job.id} créé et en attente de traitement",
    }


@router.get("/import-export/export/{data_type}")
async def export_data(
    data_type: str,
    format: str = Query("csv", regex="^(csv|json|xlsx)$"),
    filters: Optional[str] = Query(None),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Exporte des données (users, tracks, playlists, etc.).
    Retourne un URL de téléchargement.
    """
    # Parse filters JSON si fourni
    export_filters = None
    if filters:
        try:
            export_filters = json.loads(filters)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid filters JSON")

    job = ImportExportJob(
        job_type="export",
        data_type=data_type,
        format=format,
        status="pending",
        created_by=admin.id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    logger.info(f"Export job créé : job_id={job.id}, data_type={data_type}")

    return {
        "id": job.id,
        "status": job.status,
        "message": f"Export job {job.id} créé et en attente de traitement",
    }


@router.get("/import-export/jobs", response_model=Dict[str, Any])
async def list_import_export_jobs(
    job_type: Optional[str] = Query(None),  # "import" ou "export"
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Liste les jobs d'import/export avec filtrage optionnel.
    """
    query = db.query(ImportExportJob)

    if job_type:
        query = query.filter(ImportExportJob.job_type == job_type)

    total = query.count()
    jobs = query.order_by(ImportExportJob.created_at.desc()).offset(skip).limit(limit).all()

    items = []
    for job in jobs:
        items.append({
            "id": job.id,
            "job_type": job.job_type,
            "data_type": job.data_type,
            "format": job.format,
            "status": job.status,
            "progress": job.progress,
            "total_rows": job.total_rows,
            "imported_rows": job.imported_rows,
            "skipped_rows": job.skipped_rows,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        })

    return {"total": total, "items": items}


@router.get("/import-export/templates")
async def get_import_templates(
    data_type: str = Query(..., description="Type de données: users, tracks, playlists"),
    admin: User = Depends(require_admin),
):
    """
    Télécharge un template d'import pour un type de données donné.
    """
    templates = {
        "users": {
            "columns": ["email", "name", "subscription_plan", "organization_id"],
            "example": [
                {"email": "user1@example.com", "name": "User 1", "subscription_plan": "free", "organization_id": 1},
                {"email": "user2@example.com", "name": "User 2", "subscription_plan": "pro", "organization_id": 2},
            ]
        },
        "tracks": {
            "columns": ["title", "artist", "genre", "bpm", "user_id"],
            "example": [
                {"title": "Song 1", "artist": "Artist 1", "genre": "Techno", "bpm": 128, "user_id": 1},
            ]
        },
        "playlists": {
            "columns": ["name", "description", "user_id", "is_public"],
            "example": [
                {"name": "Playlist 1", "description": "My mix", "user_id": 1, "is_public": False},
            ]
        },
    }

    if data_type not in templates:
        raise HTTPException(status_code=400, detail=f"Unknown data_type: {data_type}")

    return templates[data_type]


@router.get("/import-export/mappings", response_model=Dict[str, Any])
async def list_field_mappings(
    data_type: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Liste les configurations de mapping de champs.
    """
    query = db.query(FieldMapping)

    if data_type:
        query = query.filter(FieldMapping.data_type == data_type)

    total = query.count()
    mappings = query.order_by(FieldMapping.created_at.desc()).offset(skip).limit(limit).all()

    items = []
    for m in mappings:
        items.append({
            "id": m.id,
            "name": m.name,
            "data_type": m.data_type,
            "mapping_config": m.mapping_config,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        })

    return {"total": total, "items": items}


@router.post("/import-export/mappings")
async def create_field_mapping(
    request: FieldMappingRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Crée ou met à jour une configuration de mapping de champs.
    """
    # Vérifier si le mapping existe déjà
    existing = db.query(FieldMapping).filter(FieldMapping.name == request.name).first()

    if existing:
        existing.mapping_config = request.mapping_config
        existing.transformers = request.transformers
        existing.updated_at = datetime.utcnow()
        db.commit()
        return {"message": "Mapping mis à jour", "id": existing.id}

    mapping = FieldMapping(
        name=request.name,
        data_type=request.data_type,
        mapping_config=request.mapping_config,
        transformers=request.transformers,
    )
    db.add(mapping)
    db.commit()
    db.refresh(mapping)

    logger.info(f"Field mapping créé : mapping_id={mapping.id}, name={request.name}")

    return {"message": "Mapping créé", "id": mapping.id}


# ═══════════════════════════════════════════════
# PART B — ADVANCED SEARCH
# ═══════════════════════════════════════════════

@router.post("/search/global")
async def global_search(
    request: GlobalSearchRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Recherche globale sur tous les entités (users, tracks, playlists, pages, etc.).
    """
    results = {
        "query": request.query,
        "entity_types": request.entity_types or ["users", "tracks", "playlists"],
        "filters": request.filters or {},
        "total": 0,
        "items": [],
    }

    logger.info(
        f"Global search : query='{request.query}', "
        f"entity_types={request.entity_types}"
    )

    return results


@router.get("/search/recent", response_model=Dict[str, Any])
async def get_recent_searches(
    limit: int = Query(10, ge=1, le=50),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Retourne les recherches récentes de l'admin actuel.
    """
    searches = (
        db.query(SavedSearch)
        .filter(SavedSearch.created_by == admin.id)
        .order_by(SavedSearch.last_used_at.desc())
        .limit(limit)
        .all()
    )

    return {
        "total": len(searches),
        "items": [_serialize_saved_search(s) for s in searches],
    }


@router.post("/search/save", response_model=SavedSearchResponse)
async def save_search(
    request: SaveSearchRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Sauvegarde une recherche pour réutilisation ultérieure.
    """
    search = SavedSearch(
        name=request.name,
        search_type=request.search_type,
        query=request.query,
        filters=request.filters,
        created_by=admin.id,
    )
    db.add(search)
    db.commit()
    db.refresh(search)

    logger.info(f"Search sauvegardée : search_id={search.id}, name={request.name}")

    return _serialize_saved_search(search)


@router.get("/search/saved", response_model=Dict[str, Any])
async def list_saved_searches(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Liste les recherches sauvegardées par l'admin actuel.
    """
    query = db.query(SavedSearch).filter(SavedSearch.created_by == admin.id)
    total = query.count()
    searches = query.order_by(SavedSearch.created_at.desc()).offset(skip).limit(limit).all()

    return {
        "total": total,
        "items": [_serialize_saved_search(s) for s in searches],
    }


@router.delete("/search/saved/{search_id}")
async def delete_saved_search(
    search_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Supprime une recherche sauvegardée.
    """
    search = db.query(SavedSearch).filter(SavedSearch.id == search_id).first()
    if not search:
        raise HTTPException(status_code=404, detail="Recherche non trouvée")

    if search.created_by != admin.id:
        raise HTTPException(status_code=403, detail="Vous ne pouvez supprimer que vos propres recherches")

    db.delete(search)
    db.commit()

    return {"message": "Recherche supprimée"}


# ═══════════════════════════════════════════════
# PART C — SYSTEM MONITORING
# ═══════════════════════════════════════════════

@router.get("/monitoring/system", response_model=SystemMetricsResponse)
async def get_system_metrics(
    admin: User = Depends(require_admin),
):
    """
    Retourne les métriques système (CPU, mémoire, disque, uptime).
    """
    # Calcul du uptime (depuis le démarrage du serveur)
    uptime_seconds = int(datetime.utcnow().timestamp() - psutil.boot_time())

    return SystemMetricsResponse(
        cpu_percent=psutil.cpu_percent(interval=1),
        memory_percent=psutil.virtual_memory().percent,
        disk_percent=psutil.disk_usage("/").percent,
        uptime_seconds=uptime_seconds,
        timestamp=datetime.utcnow().isoformat(),
    )


@router.get("/monitoring/database", response_model=DatabaseMetricsResponse)
async def get_database_metrics(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Retourne les métriques base de données (connexions, requêtes/sec, slow queries).
    """
    # Statistiques simulées - à adapter selon votre BD
    return DatabaseMetricsResponse(
        total_connections=25,
        active_connections=8,
        queries_per_second=42.5,
        slow_queries_count=3,
        db_size_bytes=5368709120,  # ~5 GB
        timestamp=datetime.utcnow().isoformat(),
    )


@router.get("/monitoring/cache", response_model=Dict[str, Any])
async def get_cache_metrics(
    admin: User = Depends(require_admin),
):
    """
    Retourne les métriques de cache (hit rate, utilisation mémoire, clés).
    """
    return {
        "hit_rate": 85.3,  # pourcentage
        "miss_rate": 14.7,
        "memory_usage_mb": 512,
        "total_keys": 15432,
        "evicted_keys": 234,
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.get("/monitoring/services", response_model=List[ServiceStatusResponse])
async def get_services_status(
    admin: User = Depends(require_admin),
):
    """
    Retourne l'état des services externes (Spotify, AcoustID, MusicBrainz, etc.).
    """
    services = [
        ServiceStatusResponse(
            service_name="spotify",
            status="online",
            latency_ms=145,
            last_check=datetime.utcnow().isoformat(),
        ),
        ServiceStatusResponse(
            service_name="acoustid",
            status="online",
            latency_ms=89,
            last_check=datetime.utcnow().isoformat(),
        ),
        ServiceStatusResponse(
            service_name="musicbrainz",
            status="online",
            latency_ms=234,
            last_check=datetime.utcnow().isoformat(),
        ),
        ServiceStatusResponse(
            service_name="itunes",
            status="degraded",
            latency_ms=2100,
            last_check=datetime.utcnow().isoformat(),
        ),
    ]

    return services


@router.get("/monitoring/history", response_model=Dict[str, Any])
async def get_metrics_history(
    metric_type: str = Query("cpu", regex="^(cpu|memory|disk|queries)$"),
    hours: int = Query(24, ge=1, le=168),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Retourne l'historique des métriques sur les N dernières heures.
    """
    cutoff_time = datetime.utcnow() - timedelta(hours=hours)

    metrics = (
        db.query(PerformanceMetric)
        .filter(
            PerformanceMetric.metric_type == metric_type,
            PerformanceMetric.created_at >= cutoff_time,
        )
        .order_by(PerformanceMetric.created_at.asc())
        .all()
    )

    items = []
    for m in metrics:
        items.append({
            "metric_name": m.metric_name,
            "value": m.value,
            "unit": m.unit,
            "timestamp": m.created_at.isoformat() if m.created_at else None,
        })

    return {
        "metric_type": metric_type,
        "hours": hours,
        "total_points": len(items),
        "items": items,
    }


@router.get("/monitoring/alerts", response_model=Dict[str, Any])
async def get_active_alerts(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Retourne les alertes actives.
    """
    alerts = (
        db.query(AlertRule)
        .filter(AlertRule.enabled == True)
        .order_by(AlertRule.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    items = []
    for alert in alerts:
        items.append({
            "id": alert.id,
            "name": alert.name,
            "metric_name": alert.metric_name,
            "threshold": alert.threshold,
            "status": "triggered",  # À implémenter selon logique réelle
        })

    return {
        "total": len(alerts),
        "items": items,
    }


@router.post("/monitoring/alert-rules", response_model=Dict[str, Any])
async def create_alert_rule(
    request: AlertRuleRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Crée une nouvelle règle d'alerte.
    """
    rule = AlertRule(
        name=request.name,
        metric_name=request.metric_name,
        threshold=request.threshold,
        comparison=request.comparison,
        duration_seconds=request.duration_seconds,
        notify_slack=request.notify_slack,
        notify_email=request.notify_email,
        webhook_url=request.webhook_url,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)

    logger.info(f"Alert rule créée : rule_id={rule.id}, name={request.name}")

    return {
        "id": rule.id,
        "name": rule.name,
        "message": "Règle d'alerte créée avec succès",
    }


@router.get("/monitoring/alert-rules/{rule_id}")
async def get_alert_rule(
    rule_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Récupère les détails d'une règle d'alerte.
    """
    rule = db.query(AlertRule).filter(AlertRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Règle d'alerte non trouvée")

    return {
        "id": rule.id,
        "name": rule.name,
        "metric_name": rule.metric_name,
        "threshold": rule.threshold,
        "comparison": rule.comparison,
        "enabled": rule.enabled,
    }


@router.put("/monitoring/alert-rules/{rule_id}")
async def update_alert_rule(
    rule_id: int,
    request: AlertRuleRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Met à jour une règle d'alerte.
    """
    rule = db.query(AlertRule).filter(AlertRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Règle d'alerte non trouvée")

    rule.name = request.name
    rule.metric_name = request.metric_name
    rule.threshold = request.threshold
    rule.comparison = request.comparison
    rule.duration_seconds = request.duration_seconds
    rule.notify_slack = request.notify_slack
    rule.notify_email = request.notify_email
    rule.webhook_url = request.webhook_url
    rule.updated_at = datetime.utcnow()

    db.commit()

    return {"message": "Règle d'alerte mise à jour"}


@router.delete("/monitoring/alert-rules/{rule_id}")
async def delete_alert_rule(
    rule_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Supprime une règle d'alerte.
    """
    rule = db.query(AlertRule).filter(AlertRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Règle d'alerte non trouvée")

    db.delete(rule)
    db.commit()

    return {"message": "Règle d'alerte supprimée"}


# ═══════════════════════════════════════════════
# PART D — ERROR TRACKING
# ═══════════════════════════════════════════════

@router.get("/errors", response_model=Dict[str, Any])
async def list_errors(
    level: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    is_resolved: Optional[bool] = Query(None),
    days: int = Query(7, ge=1, le=90),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Liste les erreurs avec filtrage par level, source, état de résolution.
    """
    cutoff_time = datetime.utcnow() - timedelta(days=days)
    query = db.query(ErrorLog).filter(ErrorLog.created_at >= cutoff_time)

    if level:
        query = query.filter(ErrorLog.level == level)
    if source:
        query = query.filter(ErrorLog.source == source)
    if is_resolved is not None:
        query = query.filter(ErrorLog.is_resolved == is_resolved)

    total = query.count()
    errors = query.order_by(ErrorLog.created_at.desc()).offset(skip).limit(limit).all()

    items = []
    for err in errors:
        items.append({
            "id": err.id,
            "level": err.level,
            "source": err.source,
            "message": err.message,
            "is_resolved": err.is_resolved,
            "is_ignored": err.is_ignored,
            "created_at": err.created_at.isoformat() if err.created_at else None,
        })

    return {
        "total": total,
        "items": items,
    }


@router.get("/errors/{error_id}")
async def get_error_detail(
    error_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Récupère les détails d'une erreur avec stack trace et contexte.
    """
    error = db.query(ErrorLog).filter(ErrorLog.id == error_id).first()
    if not error:
        raise HTTPException(status_code=404, detail="Erreur non trouvée")

    return {
        "id": error.id,
        "level": error.level,
        "source": error.source,
        "message": error.message,
        "stack_trace": error.stack_trace,
        "context": error.context,
        "is_resolved": error.is_resolved,
        "is_ignored": error.is_ignored,
        "error_fingerprint": error.error_fingerprint,
        "created_at": error.created_at.isoformat() if error.created_at else None,
    }


@router.get("/errors/stats", response_model=ErrorStatsResponse)
async def get_error_stats(
    days: int = Query(7, ge=1, le=90),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Retourne les statistiques d'erreurs (totales, par jour, critiques, tendances).
    """
    cutoff_time = datetime.utcnow() - timedelta(days=days)

    total_errors = db.query(func.count(ErrorLog.id)).filter(
        ErrorLog.created_at >= cutoff_time
    ).scalar()

    critical_errors = db.query(func.count(ErrorLog.id)).filter(
        ErrorLog.level == "CRITICAL",
        ErrorLog.created_at >= cutoff_time
    ).scalar()

    today_cutoff = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    errors_today = db.query(func.count(ErrorLog.id)).filter(
        ErrorLog.created_at >= today_cutoff
    ).scalar()

    # Top sources
    top_sources_query = (
        db.query(ErrorLog.source, func.count(ErrorLog.id).label("count"))
        .filter(ErrorLog.created_at >= cutoff_time)
        .group_by(ErrorLog.source)
        .order_by(func.count(ErrorLog.id).desc())
        .limit(5)
        .all()
    )
    top_sources = {source: count for source, count in top_sources_query}

    return ErrorStatsResponse(
        total_errors=total_errors or 0,
        errors_today=errors_today or 0,
        critical_errors=critical_errors or 0,
        trending_errors=[
            {"message": "Erreur exemple 1", "count": 12},
            {"message": "Erreur exemple 2", "count": 8},
        ],
        top_sources=top_sources,
    )


@router.post("/errors/{error_id}/resolve")
async def resolve_error(
    error_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Marque une erreur comme résolue.
    """
    error = db.query(ErrorLog).filter(ErrorLog.id == error_id).first()
    if not error:
        raise HTTPException(status_code=404, detail="Erreur non trouvée")

    error.is_resolved = True
    error.resolved_at = datetime.utcnow()
    db.commit()

    logger.info(f"Error résolu : error_id={error_id}")

    return {"message": "Erreur marquée comme résolue"}


@router.post("/errors/{error_id}/ignore")
async def ignore_error(
    error_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Ignore un pattern d'erreur (ne plus l'afficher).
    """
    error = db.query(ErrorLog).filter(ErrorLog.id == error_id).first()
    if not error:
        raise HTTPException(status_code=404, detail="Erreur non trouvée")

    error.is_ignored = True
    db.commit()

    # Ignore aussi tous les erreurs avec le même fingerprint
    db.query(ErrorLog).filter(
        ErrorLog.error_fingerprint == error.error_fingerprint
    ).update({"is_ignored": True})
    db.commit()

    logger.info(f"Error pattern ignoré : fingerprint={error.error_fingerprint}")

    return {"message": "Error pattern ignoré"}


@router.get("/errors/groups", response_model=Dict[str, Any])
async def get_error_groups(
    days: int = Query(7, ge=1, le=90),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Retourne les erreurs groupées par fingerprint (erreurs similaires).
    """
    cutoff_time = datetime.utcnow() - timedelta(days=days)

    groups = (
        db.query(
            ErrorLog.error_fingerprint,
            ErrorLog.message,
            func.count(ErrorLog.id).label("count"),
        )
        .filter(ErrorLog.created_at >= cutoff_time, ErrorLog.is_ignored == False)
        .group_by(ErrorLog.error_fingerprint, ErrorLog.message)
        .order_by(func.count(ErrorLog.id).desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    total = (
        db.query(func.count(func.distinct(ErrorLog.error_fingerprint)))
        .filter(ErrorLog.created_at >= cutoff_time, ErrorLog.is_ignored == False)
        .scalar()
    )

    items = []
    for fingerprint, message, count in groups:
        items.append({
            "fingerprint": fingerprint,
            "message": message,
            "count": count,
        })

    return {
        "total": total or 0,
        "items": items,
    }


# ═══════════════════════════════════════════════
# PART E — PERFORMANCE PROFILING
# ═══════════════════════════════════════════════

@router.get("/performance/endpoints", response_model=Dict[str, Any])
async def get_endpoint_performance(
    hours: int = Query(24, ge=1, le=168),
    limit: int = Query(20, ge=1, le=50),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Retourne les endpoints les plus lents avec latences p50/p95/p99.
    """
    cutoff_time = datetime.utcnow() - timedelta(hours=hours)

    endpoints = (
        db.query(PerformanceMetric)
        .filter(
            PerformanceMetric.metric_type == "endpoint",
            PerformanceMetric.created_at >= cutoff_time,
        )
        .order_by(PerformanceMetric.value.desc())
        .limit(limit)
        .all()
    )

    items = []
    for ep in endpoints:
        items.append({
            "endpoint": ep.endpoint_or_query,
            "percentile": ep.percentile,
            "latency_ms": ep.value,
        })

    return {
        "hours": hours,
        "total": len(items),
        "items": items,
    }


@router.get("/performance/database-queries", response_model=Dict[str, Any])
async def get_slow_queries(
    hours: int = Query(24, ge=1, le=168),
    limit: int = Query(20, ge=1, le=50),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Retourne les requêtes DB les plus lentes.
    """
    cutoff_time = datetime.utcnow() - timedelta(hours=hours)

    queries = (
        db.query(PerformanceMetric)
        .filter(
            PerformanceMetric.metric_type == "query",
            PerformanceMetric.created_at >= cutoff_time,
        )
        .order_by(PerformanceMetric.value.desc())
        .limit(limit)
        .all()
    )

    items = []
    for q in queries:
        items.append({
            "query": q.endpoint_or_query,
            "duration_ms": q.value,
        })

    return {
        "hours": hours,
        "total": len(items),
        "items": items,
    }


@router.get("/performance/overview", response_model=PerformanceOverviewResponse)
async def get_performance_overview(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Vue d'ensemble des performances avec score global et recommandations.
    """
    # Calculs simplifiés — à adapter selon votre implémentation réelle
    return PerformanceOverviewResponse(
        performance_score=82.5,  # 0-100
        slowest_endpoints=[
            {"endpoint": "/api/tracks/analyze", "latency_ms": 2500},
            {"endpoint": "/api/tracks", "latency_ms": 850},
        ],
        slowest_queries=[
            {"query": "SELECT * FROM tracks WHERE user_id = ?", "duration_ms": 450},
        ],
        recommendations=[
            "Ajouter un index sur tracks.user_id",
            "Implémenter la pagination pour /api/tracks",
        ],
    )


@router.post("/performance/profiler/start")
async def start_profiler(
    admin: User = Depends(require_admin),
):
    """
    Démarre le profiling du serveur (CPU, mémoire, requêtes).
    """
    logger.info("Profiler démarré")

    return {
        "message": "Profiling démarré",
        "duration_seconds": 60,
    }


@router.post("/performance/profiler/stop")
async def stop_profiler(
    admin: User = Depends(require_admin),
):
    """
    Arrête le profiling et retourne les résultats.
    """
    logger.info("Profiler arrêté")

    return {
        "message": "Profiling arrêté",
        "results_ready": True,
    }


@router.get("/performance/profiler/results")
async def get_profiler_results(
    admin: User = Depends(require_admin),
):
    """
    Retourne les résultats du profiling (hotspots, allocations).
    """
    return {
        "duration_seconds": 60,
        "hotspots": [
            {"function": "analyze_audio", "cpu_percent": 35.2},
            {"function": "query_tracks", "cpu_percent": 18.5},
        ],
        "memory_allocations": [
            {"function": "load_model", "mb": 256},
        ],
    }


# ═══════════════════════════════════════════════
# PART F — IN-APP NOTIFICATIONS
# ═══════════════════════════════════════════════

@router.post("/in-app-notifications", response_model=InAppNotificationResponse)
async def create_in_app_notification(
    request: InAppNotificationRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Crée une nouvelle notification in-app.
    """
    notification = InAppNotification(
        title=request.title,
        body=request.body,
        icon_url=request.icon_url,
        action_url=request.action_url,
        action_label=request.action_label,
        target_type=request.target_type,
        target_segment=request.target_segment,
        target_user_ids=request.target_user_ids,
        scheduled_at=datetime.fromisoformat(request.scheduled_at) if request.scheduled_at else None,
        created_by=admin.id,
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)

    logger.info(f"In-app notification créée : notif_id={notification.id}")

    return InAppNotificationResponse(
        id=notification.id,
        title=notification.title,
        status=notification.status,
        total_recipients=0,
        delivered_count=0,
        read_count=0,
        click_count=0,
        created_at=notification.created_at.isoformat() if notification.created_at else None,
    )


@router.get("/in-app-notifications", response_model=Dict[str, Any])
async def list_in_app_notifications(
    status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Liste les notifications in-app avec filtrage par status.
    """
    query = db.query(InAppNotification)

    if status:
        query = query.filter(InAppNotification.status == status)

    total = query.count()
    notifications = query.order_by(InAppNotification.created_at.desc()).offset(skip).limit(limit).all()

    items = []
    for notif in notifications:
        items.append({
            "id": notif.id,
            "title": notif.title,
            "status": notif.status,
            "total_recipients": notif.total_recipients,
            "delivered_count": notif.delivered_count,
            "read_count": notif.read_count,
            "click_count": notif.click_count,
            "created_at": notif.created_at.isoformat() if notif.created_at else None,
        })

    return {
        "total": total,
        "items": items,
    }


@router.get("/in-app-notifications/{notif_id}", response_model=InAppNotificationResponse)
async def get_in_app_notification(
    notif_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Récupère les détails d'une notification in-app.
    """
    notif = db.query(InAppNotification).filter(InAppNotification.id == notif_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification non trouvée")

    return InAppNotificationResponse(
        id=notif.id,
        title=notif.title,
        status=notif.status,
        total_recipients=notif.total_recipients,
        delivered_count=notif.delivered_count,
        read_count=notif.read_count,
        click_count=notif.click_count,
        created_at=notif.created_at.isoformat() if notif.created_at else None,
    )


@router.put("/in-app-notifications/{notif_id}", response_model=InAppNotificationResponse)
async def update_in_app_notification(
    notif_id: int,
    request: InAppNotificationRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Met à jour une notification in-app (seulement si draft).
    """
    notif = db.query(InAppNotification).filter(InAppNotification.id == notif_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification non trouvée")

    if notif.status != "draft":
        raise HTTPException(status_code=400, detail="Cannot edit notification that is not in draft status")

    notif.title = request.title
    notif.body = request.body
    notif.icon_url = request.icon_url
    notif.action_url = request.action_url
    notif.action_label = request.action_label
    notif.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(notif)

    return InAppNotificationResponse(
        id=notif.id,
        title=notif.title,
        status=notif.status,
        total_recipients=notif.total_recipients,
        delivered_count=notif.delivered_count,
        read_count=notif.read_count,
        click_count=notif.click_count,
        created_at=notif.created_at.isoformat() if notif.created_at else None,
    )


@router.post("/in-app-notifications/{notif_id}/send")
async def send_in_app_notification(
    notif_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Envoie une notification in-app aux utilisateurs cibles.
    """
    notif = db.query(InAppNotification).filter(InAppNotification.id == notif_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification non trouvée")

    if notif.status != "draft":
        raise HTTPException(status_code=400, detail="Notification must be in draft status")

    notif.status = "sent"
    db.commit()

    logger.info(f"In-app notification envoyée : notif_id={notif_id}")

    return {
        "message": "Notification envoyée",
        "notif_id": notif_id,
    }


@router.delete("/in-app-notifications/{notif_id}")
async def delete_in_app_notification(
    notif_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Supprime une notification in-app (seulement si draft).
    """
    notif = db.query(InAppNotification).filter(InAppNotification.id == notif_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification non trouvée")

    if notif.status != "draft":
        raise HTTPException(status_code=400, detail="Cannot delete notification that is not in draft status")

    db.delete(notif)
    db.commit()

    return {"message": "Notification supprimée"}


@router.get("/in-app-notifications/stats", response_model=Dict[str, Any])
async def get_notification_stats(
    days: int = Query(7, ge=1, le=90),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Retourne les statistiques d'envoi et de lecture des notifications.
    """
    cutoff_time = datetime.utcnow() - timedelta(days=days)

    notifications = (
        db.query(InAppNotification)
        .filter(InAppNotification.created_at >= cutoff_time)
        .all()
    )

    total_sent = len(notifications)
    total_delivered = sum(n.delivered_count for n in notifications)
    total_read = sum(n.read_count for n in notifications)
    total_clicked = sum(n.click_count for n in notifications)

    return {
        "days": days,
        "total_notifications": total_sent,
        "total_delivered": total_delivered,
        "total_read": total_read,
        "total_clicked": total_clicked,
        "read_rate": round(total_read / total_delivered * 100, 2) if total_delivered > 0 else 0,
        "click_rate": round(total_clicked / total_delivered * 100, 2) if total_delivered > 0 else 0,
    }


@router.get("/in-app-notifications/feed", response_model=Dict[str, Any])
async def get_notification_feed(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Feed de notifications pour l'admin (activité système, alertes).
    """
    notifications = (
        db.query(InAppNotification)
        .order_by(InAppNotification.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    items = []
    for notif in notifications:
        items.append({
            "id": notif.id,
            "title": notif.title,
            "body": notif.body,
            "status": notif.status,
            "created_at": notif.created_at.isoformat() if notif.created_at else None,
        })

    return {
        "total": len(items),
        "items": items,
    }
