"""
Admin – File Manager / CDN, Cron Jobs, Queue Monitoring, Dashboard Widgets
"""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, Text, Boolean, Float, DateTime, JSON, func
from datetime import datetime
import json

from app.database import get_db, Base
from app.middleware.admin import require_admin

router = APIRouter()

# ── Models ────────────────────────────────────────────
class ManagedFile(Base):
    __tablename__ = "admin_managed_files"
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(500), nullable=False)
    original_name = Column(String(500), default="")
    path = Column(String(1000), default="")
    url = Column(String(1000), default="")
    cdn_url = Column(String(1000), default="")
    mime_type = Column(String(100), default="")
    size_bytes = Column(Integer, default=0)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    folder = Column(String(500), default="/")
    tags = Column(JSON, default=list)
    # 'metadata' est un nom réservé par SQLAlchemy Declarative → utiliser file_metadata
    file_metadata = Column("meta", JSON, default=dict)
    uploaded_by = Column(Integer, nullable=True)
    is_public = Column(Boolean, default=True)
    download_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

class CDNConfig(Base):
    __tablename__ = "admin_cdn_config"
    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String(100), default="cloudflare")  # cloudflare, cloudfront, bunny
    domain = Column(String(500), default="")
    api_key = Column(String(500), default="")
    zone_id = Column(String(200), default="")
    cache_ttl = Column(Integer, default=86400)
    auto_minify = Column(Boolean, default=True)
    auto_webp = Column(Boolean, default=True)
    purge_on_deploy = Column(Boolean, default=True)
    config = Column(JSON, default=dict)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class CronJob(Base):
    __tablename__ = "admin_cron_jobs"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, default="")
    schedule = Column(String(100), nullable=False)  # cron expression
    command = Column(String(500), default="")
    job_type = Column(String(50), default="system")  # system, custom, maintenance
    status = Column(String(50), default="active")  # active, paused, disabled
    last_run = Column(DateTime, nullable=True)
    next_run = Column(DateTime, nullable=True)
    last_status = Column(String(50), default="")  # success, failed, running
    last_duration_ms = Column(Integer, default=0)
    last_error = Column(Text, default="")
    run_count = Column(Integer, default=0)
    fail_count = Column(Integer, default=0)
    timeout_seconds = Column(Integer, default=300)
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)
    config = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)

class CronJobLog(Base):
    __tablename__ = "admin_cron_job_logs"
    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, nullable=False)
    status = Column(String(50), default="running")
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    duration_ms = Column(Integer, default=0)
    output = Column(Text, default="")
    error = Column(Text, default="")
    records_processed = Column(Integer, default=0)

class QueueJob(Base):
    __tablename__ = "admin_queue_jobs"
    id = Column(Integer, primary_key=True, index=True)
    queue_name = Column(String(100), default="default")
    job_type = Column(String(100), nullable=False)
    payload = Column(JSON, default=dict)
    status = Column(String(50), default="pending")  # pending, processing, completed, failed, dead
    priority = Column(Integer, default=0)
    attempts = Column(Integer, default=0)
    max_attempts = Column(Integer, default=3)
    error_message = Column(Text, default="")
    scheduled_at = Column(DateTime, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class DashboardWidget(Base):
    __tablename__ = "admin_dashboard_widgets"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, default=0)  # 0 = default layout
    widget_type = Column(String(100), nullable=False)  # stats_card, chart, table, activity_feed, etc.
    title = Column(String(200), default="")
    config = Column(JSON, default=dict)  # {data_source, filters, display_options}
    position = Column(JSON, default=dict)  # {x, y, w, h} for grid layout
    is_visible = Column(Boolean, default=True)
    refresh_interval = Column(Integer, default=300)  # seconds
    created_at = Column(DateTime, default=datetime.utcnow)

# ── Serializers ───────────────────────────────────────
def _ser_file(f):
    return {
        "id": f.id, "filename": f.filename, "original_name": f.original_name,
        "path": f.path, "url": f.url, "cdn_url": f.cdn_url, "mime_type": f.mime_type,
        "size_bytes": f.size_bytes, "width": f.width, "height": f.height,
        "folder": f.folder, "tags": f.tags or [], "metadata": f.file_metadata or {},
        "is_public": f.is_public, "download_count": f.download_count,
        "created_at": f.created_at.isoformat() if f.created_at else None,
    }

def _ser_cron(c):
    return {
        "id": c.id, "name": c.name, "description": c.description, "schedule": c.schedule,
        "command": c.command, "job_type": c.job_type, "status": c.status,
        "last_run": c.last_run.isoformat() if c.last_run else None,
        "next_run": c.next_run.isoformat() if c.next_run else None,
        "last_status": c.last_status, "last_duration_ms": c.last_duration_ms,
        "last_error": c.last_error, "run_count": c.run_count, "fail_count": c.fail_count,
        "timeout_seconds": c.timeout_seconds, "max_retries": c.max_retries,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }

def _ser_queue(q):
    return {
        "id": q.id, "queue_name": q.queue_name, "job_type": q.job_type,
        "payload": q.payload or {}, "status": q.status, "priority": q.priority,
        "attempts": q.attempts, "max_attempts": q.max_attempts, "error_message": q.error_message,
        "started_at": q.started_at.isoformat() if q.started_at else None,
        "completed_at": q.completed_at.isoformat() if q.completed_at else None,
        "created_at": q.created_at.isoformat() if q.created_at else None,
    }

def _ser_widget(w):
    return {
        "id": w.id, "widget_type": w.widget_type, "title": w.title,
        "config": w.config or {}, "position": w.position or {},
        "is_visible": w.is_visible, "refresh_interval": w.refresh_interval,
    }

# ═══════════════════════════════════════════════════════
# FILE MANAGER
# ═══════════════════════════════════════════════════════
@router.get("/admin/files")
def list_files(folder: str = None, mime_type: str = None, search: str = None, skip: int = 0, limit: int = 50, db: Session = Depends(get_db), _=Depends(require_admin)):
    q = db.query(ManagedFile)
    if folder:
        q = q.filter(ManagedFile.folder == folder)
    if mime_type:
        q = q.filter(ManagedFile.mime_type.ilike(f"%{mime_type}%"))
    if search:
        q = q.filter(ManagedFile.original_name.ilike(f"%{search}%"))
    total = q.count()
    items = q.order_by(ManagedFile.created_at.desc()).offset(skip).limit(limit).all()
    return {"total": total, "items": [_ser_file(f) for f in items]}

@router.post("/admin/files")
def create_file(data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    f = ManagedFile(
        filename=data.get("filename", ""), original_name=data.get("original_name", ""),
        path=data.get("path", ""), url=data.get("url", ""), cdn_url=data.get("cdn_url", ""),
        mime_type=data.get("mime_type", ""), size_bytes=data.get("size_bytes", 0),
        width=data.get("width"), height=data.get("height"),
        folder=data.get("folder", "/"), tags=data.get("tags", []),
        file_metadata=data.get("metadata", {}), is_public=data.get("is_public", True),
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return _ser_file(f)

@router.put("/admin/files/{file_id}")
def update_file(file_id: int, data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    f = db.query(ManagedFile).filter(ManagedFile.id == file_id).first()
    if not f:
        raise HTTPException(404)
    for k in ["original_name", "folder", "tags", "is_public"]:
        if k in data:
            setattr(f, k, data[k])
    # metadata → file_metadata (nom réservé SQLAlchemy)
    if "metadata" in data:
        f.file_metadata = data["metadata"]
    db.commit()
    db.refresh(f)
    return _ser_file(f)

@router.delete("/admin/files/{file_id}")
def delete_file(file_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    f = db.query(ManagedFile).filter(ManagedFile.id == file_id).first()
    if not f:
        raise HTTPException(404)
    db.delete(f)
    db.commit()
    return {"ok": True}

@router.post("/admin/files/bulk-delete")
def bulk_delete_files(data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    ids = data.get("ids", [])
    deleted = db.query(ManagedFile).filter(ManagedFile.id.in_(ids)).delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted}

@router.post("/admin/files/{file_id}/move")
def move_file(file_id: int, data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    f = db.query(ManagedFile).filter(ManagedFile.id == file_id).first()
    if not f:
        raise HTTPException(404)
    f.folder = data.get("folder", "/")
    db.commit()
    return _ser_file(f)

@router.get("/admin/files/folders")
def list_folders(db: Session = Depends(get_db), _=Depends(require_admin)):
    folders = db.query(ManagedFile.folder).distinct().all()
    return sorted(set(f[0] for f in folders if f[0]))

@router.get("/admin/files/stats")
def file_stats(db: Session = Depends(get_db), _=Depends(require_admin)):
    total = db.query(ManagedFile).count()
    total_size = db.query(func.sum(ManagedFile.size_bytes)).scalar() or 0
    by_type = db.query(ManagedFile.mime_type, func.count(), func.sum(ManagedFile.size_bytes)).group_by(ManagedFile.mime_type).all()
    return {
        "total_files": total, "total_size_bytes": total_size,
        "by_type": [{"mime_type": t, "count": c, "size_bytes": s or 0} for t, c, s in by_type],
    }

# CDN
@router.get("/admin/cdn/config")
def get_cdn_config(db: Session = Depends(get_db), _=Depends(require_admin)):
    c = db.query(CDNConfig).first()
    if not c:
        return {"provider": "none", "domain": "", "cache_ttl": 86400}
    return {
        "provider": c.provider, "domain": c.domain, "zone_id": c.zone_id,
        "cache_ttl": c.cache_ttl, "auto_minify": c.auto_minify, "auto_webp": c.auto_webp,
        "purge_on_deploy": c.purge_on_deploy, "config": c.config or {},
    }

@router.put("/admin/cdn/config")
def update_cdn_config(data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    c = db.query(CDNConfig).first()
    if not c:
        c = CDNConfig()
        db.add(c)
    for k in ["provider", "domain", "api_key", "zone_id", "cache_ttl", "auto_minify", "auto_webp", "purge_on_deploy", "config"]:
        if k in data:
            setattr(c, k, data[k])
    db.commit()
    return {"ok": True}

@router.post("/admin/cdn/purge")
def purge_cdn_cache(data: dict = None, _=Depends(require_admin)):
    urls = (data or {}).get("urls", [])
    return {"purged": True, "urls": urls, "message": "Cache purgé" if not urls else f"{len(urls)} URLs purgées"}

# ═══════════════════════════════════════════════════════
# CRON JOBS
# ═══════════════════════════════════════════════════════
@router.get("/admin/cron-jobs")
def list_cron_jobs(status: str = None, skip: int = 0, limit: int = 50, db: Session = Depends(get_db), _=Depends(require_admin)):
    q = db.query(CronJob)
    if status:
        q = q.filter(CronJob.status == status)
    total = q.count()
    items = q.order_by(CronJob.name).offset(skip).limit(limit).all()
    return {"total": total, "items": [_ser_cron(c) for c in items]}

@router.post("/admin/cron-jobs")
def create_cron_job(data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    c = CronJob(
        name=data.get("name", ""), description=data.get("description", ""),
        schedule=data.get("schedule", "0 * * * *"), command=data.get("command", ""),
        job_type=data.get("job_type", "custom"), timeout_seconds=data.get("timeout_seconds", 300),
        max_retries=data.get("max_retries", 3), config=data.get("config", {}),
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _ser_cron(c)

@router.put("/admin/cron-jobs/{job_id}")
def update_cron_job(job_id: int, data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    c = db.query(CronJob).filter(CronJob.id == job_id).first()
    if not c:
        raise HTTPException(404)
    for k in ["name", "description", "schedule", "command", "status", "timeout_seconds", "max_retries", "config"]:
        if k in data:
            setattr(c, k, data[k])
    db.commit()
    db.refresh(c)
    return _ser_cron(c)

@router.delete("/admin/cron-jobs/{job_id}")
def delete_cron_job(job_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    c = db.query(CronJob).filter(CronJob.id == job_id).first()
    if not c:
        raise HTTPException(404)
    db.delete(c)
    db.commit()
    return {"ok": True}

@router.post("/admin/cron-jobs/{job_id}/run")
def run_cron_job(job_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    c = db.query(CronJob).filter(CronJob.id == job_id).first()
    if not c:
        raise HTTPException(404)
    log = CronJobLog(job_id=job_id, status="running")
    db.add(log)
    c.last_run = datetime.utcnow()
    c.last_status = "running"
    c.run_count = (c.run_count or 0) + 1
    db.commit()
    return {"message": f"Job '{c.name}' lancé", "log_id": log.id}

@router.post("/admin/cron-jobs/{job_id}/toggle")
def toggle_cron_job(job_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    c = db.query(CronJob).filter(CronJob.id == job_id).first()
    if not c:
        raise HTTPException(404)
    c.status = "paused" if c.status == "active" else "active"
    db.commit()
    return _ser_cron(c)

@router.get("/admin/cron-jobs/{job_id}/logs")
def get_cron_logs(job_id: int, skip: int = 0, limit: int = 50, db: Session = Depends(get_db), _=Depends(require_admin)):
    q = db.query(CronJobLog).filter(CronJobLog.job_id == job_id)
    total = q.count()
    items = q.order_by(CronJobLog.started_at.desc()).offset(skip).limit(limit).all()
    return {"total": total, "items": [{
        "id": l.id, "status": l.status, "started_at": l.started_at.isoformat() if l.started_at else None,
        "completed_at": l.completed_at.isoformat() if l.completed_at else None,
        "duration_ms": l.duration_ms, "output": l.output, "error": l.error, "records_processed": l.records_processed,
    } for l in items]}

@router.get("/admin/cron-jobs/stats")
def cron_stats(db: Session = Depends(get_db), _=Depends(require_admin)):
    total = db.query(CronJob).count()
    active = db.query(CronJob).filter(CronJob.status == "active").count()
    failed = db.query(CronJob).filter(CronJob.last_status == "failed").count()
    return {"total": total, "active": active, "failed_last_run": failed}

# ═══════════════════════════════════════════════════════
# QUEUE MONITORING
# ═══════════════════════════════════════════════════════
@router.get("/admin/queues")
def list_queues(db: Session = Depends(get_db), _=Depends(require_admin)):
    queues = db.query(QueueJob.queue_name, func.count(), func.count().filter(QueueJob.status == "pending"), func.count().filter(QueueJob.status == "processing"), func.count().filter(QueueJob.status == "failed")).group_by(QueueJob.queue_name).all()
    return [{"name": q, "total": t, "pending": p, "processing": pr, "failed": f} for q, t, p, pr, f in queues]

@router.get("/admin/queues/jobs")
def list_queue_jobs(queue: str = None, status: str = None, skip: int = 0, limit: int = 50, db: Session = Depends(get_db), _=Depends(require_admin)):
    q = db.query(QueueJob)
    if queue:
        q = q.filter(QueueJob.queue_name == queue)
    if status:
        q = q.filter(QueueJob.status == status)
    total = q.count()
    items = q.order_by(QueueJob.created_at.desc()).offset(skip).limit(limit).all()
    return {"total": total, "items": [_ser_queue(j) for j in items]}

@router.post("/admin/queues/jobs/{job_id}/retry")
def retry_queue_job(job_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    j = db.query(QueueJob).filter(QueueJob.id == job_id).first()
    if not j:
        raise HTTPException(404)
    j.status = "pending"
    j.attempts = 0
    j.error_message = ""
    db.commit()
    return _ser_queue(j)

@router.delete("/admin/queues/jobs/{job_id}")
def delete_queue_job(job_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    j = db.query(QueueJob).filter(QueueJob.id == job_id).first()
    if not j:
        raise HTTPException(404)
    db.delete(j)
    db.commit()
    return {"ok": True}

@router.post("/admin/queues/purge-dead")
def purge_dead_jobs(db: Session = Depends(get_db), _=Depends(require_admin)):
    count = db.query(QueueJob).filter(QueueJob.status == "dead").delete()
    db.commit()
    return {"purged": count}

@router.post("/admin/queues/pause")
def pause_queue(db: Session = Depends(get_db), _=Depends(require_admin)):
    """Pause all pending jobs across queues (sets status='paused')."""
    count = db.query(QueueJob).filter(QueueJob.status == "pending").update({"status": "paused"}, synchronize_session=False)
    db.commit()
    return {"paused": count, "status": "ok"}

@router.post("/admin/queues/resume")
def resume_queue(db: Session = Depends(get_db), _=Depends(require_admin)):
    """Resume all paused jobs (sets status back to 'pending')."""
    count = db.query(QueueJob).filter(QueueJob.status == "paused").update({"status": "pending"}, synchronize_session=False)
    db.commit()
    return {"resumed": count, "status": "ok"}

@router.post("/admin/queues/retry-failed")
def retry_failed_jobs(db: Session = Depends(get_db), _=Depends(require_admin)):
    """Requeue all failed jobs (resets attempts + status to pending)."""
    failed = db.query(QueueJob).filter(QueueJob.status == "failed").all()
    for j in failed:
        j.status = "pending"
        j.attempts = 0
        j.error_message = ""
    db.commit()
    return {"retried": len(failed), "status": "ok"}

@router.get("/admin/queues/stats")
def queue_stats(db: Session = Depends(get_db), _=Depends(require_admin)):
    total = db.query(QueueJob).count()
    pending = db.query(QueueJob).filter(QueueJob.status == "pending").count()
    processing = db.query(QueueJob).filter(QueueJob.status == "processing").count()
    failed = db.query(QueueJob).filter(QueueJob.status == "failed").count()
    dead = db.query(QueueJob).filter(QueueJob.status == "dead").count()
    return {"total": total, "pending": pending, "processing": processing, "failed": failed, "dead": dead}

# ═══════════════════════════════════════════════════════
# DASHBOARD WIDGETS (drag & drop)
# ═══════════════════════════════════════════════════════
@router.get("/admin/dashboard-widgets")
def list_widgets(user_id: int = 0, db: Session = Depends(get_db), _=Depends(require_admin)):
    items = db.query(DashboardWidget).filter(DashboardWidget.user_id == user_id).order_by(DashboardWidget.id).all()
    return {"items": [_ser_widget(w) for w in items]}

@router.post("/admin/dashboard-widgets")
def create_widget(data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    w = DashboardWidget(
        widget_type=data.get("widget_type", "stats_card"), title=data.get("title", ""),
        config=data.get("config", {}), position=data.get("position", {"x": 0, "y": 0, "w": 4, "h": 2}),
        refresh_interval=data.get("refresh_interval", 300),
    )
    db.add(w)
    db.commit()
    db.refresh(w)
    return _ser_widget(w)

@router.put("/admin/dashboard-widgets/{widget_id}")
def update_widget(widget_id: int, data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    w = db.query(DashboardWidget).filter(DashboardWidget.id == widget_id).first()
    if not w:
        raise HTTPException(404)
    for k in ["title", "config", "position", "is_visible", "refresh_interval"]:
        if k in data:
            setattr(w, k, data[k])
    db.commit()
    db.refresh(w)
    return _ser_widget(w)

@router.delete("/admin/dashboard-widgets/{widget_id}")
def delete_widget(widget_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    w = db.query(DashboardWidget).filter(DashboardWidget.id == widget_id).first()
    if not w:
        raise HTTPException(404)
    db.delete(w)
    db.commit()
    return {"ok": True}

@router.put("/admin/dashboard-widgets/layout")
def update_layout(data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    """data = {widgets: [{id, position: {x, y, w, h}}]}"""
    for item in data.get("widgets", []):
        w = db.query(DashboardWidget).filter(DashboardWidget.id == item.get("id")).first()
        if w:
            w.position = item.get("position", w.position)
    db.commit()
    return {"ok": True}

@router.post("/admin/dashboard-widgets/reset")
def reset_layout(db: Session = Depends(get_db), _=Depends(require_admin)):
    db.query(DashboardWidget).filter(DashboardWidget.user_id == 0).delete()
    defaults = [
        {"widget_type": "stats_card", "title": "Utilisateurs actifs", "config": {"metric": "active_users"}, "position": {"x": 0, "y": 0, "w": 3, "h": 2}},
        {"widget_type": "stats_card", "title": "MRR", "config": {"metric": "mrr"}, "position": {"x": 3, "y": 0, "w": 3, "h": 2}},
        {"widget_type": "stats_card", "title": "Pistes analysées", "config": {"metric": "tracks_analyzed"}, "position": {"x": 6, "y": 0, "w": 3, "h": 2}},
        {"widget_type": "stats_card", "title": "Taux de churn", "config": {"metric": "churn_rate"}, "position": {"x": 9, "y": 0, "w": 3, "h": 2}},
        {"widget_type": "chart", "title": "Inscriptions (30j)", "config": {"type": "line", "metric": "signups_30d"}, "position": {"x": 0, "y": 2, "w": 6, "h": 4}},
        {"widget_type": "chart", "title": "Revenue (30j)", "config": {"type": "bar", "metric": "revenue_30d"}, "position": {"x": 6, "y": 2, "w": 6, "h": 4}},
        {"widget_type": "activity_feed", "title": "Activité récente", "config": {"limit": 10}, "position": {"x": 0, "y": 6, "w": 6, "h": 4}},
        {"widget_type": "table", "title": "Top utilisateurs", "config": {"metric": "top_users"}, "position": {"x": 6, "y": 6, "w": 6, "h": 4}},
    ]
    for d in defaults:
        db.add(DashboardWidget(**d))
    db.commit()
    return {"ok": True, "message": "Layout réinitialisé"}

@router.get("/admin/dashboard-widgets/types")
def widget_types(_=Depends(require_admin)):
    return [
        {"id": "stats_card", "label": "Carte statistique", "description": "Métrique unique avec tendance"},
        {"id": "chart", "label": "Graphique", "description": "Line, bar, area, pie chart"},
        {"id": "table", "label": "Tableau", "description": "Tableau de données dynamique"},
        {"id": "activity_feed", "label": "Flux d'activité", "description": "Dernières actions"},
        {"id": "map", "label": "Carte géographique", "description": "Distribution géographique"},
        {"id": "funnel", "label": "Entonnoir", "description": "Conversion par étapes"},
        {"id": "heatmap", "label": "Heatmap", "description": "Activité par heure/jour"},
        {"id": "progress", "label": "Jauge de progression", "description": "Objectifs et KPIs"},
        {"id": "text", "label": "Texte / Notes", "description": "Widget texte libre"},
    ]
