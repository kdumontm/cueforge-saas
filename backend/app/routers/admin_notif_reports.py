"""
Admin – Push Notifications, SMS, Export PDF, Rapports automatiques, User Impersonation, API Usage
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
class PushNotification(Base):
    __tablename__ = "admin_push_notifications"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    body = Column(Text, default="")
    icon_url = Column(String(500), default="")
    action_url = Column(String(500), default="")
    target_type = Column(String(50), default="all")  # all, segment, user
    target_id = Column(String(100), default="")
    channel = Column(String(50), default="push")  # push, sms, both
    status = Column(String(50), default="draft")  # draft, scheduled, sent, cancelled
    scheduled_at = Column(DateTime, nullable=True)
    sent_at = Column(DateTime, nullable=True)
    total_sent = Column(Integer, default=0)
    total_delivered = Column(Integer, default=0)
    total_clicked = Column(Integer, default=0)
    metadata = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)

class SMSTemplate(Base):
    __tablename__ = "admin_sms_templates"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    body = Column(Text, default="")
    variables = Column(JSON, default=list)
    category = Column(String(100), default="general")
    is_active = Column(Boolean, default=True)
    sent_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

class ScheduledReport(Base):
    __tablename__ = "admin_scheduled_reports"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, default="")
    report_type = Column(String(100), default="custom")  # revenue, users, tracks, churn, custom
    format = Column(String(20), default="pdf")  # pdf, csv, xlsx
    schedule = Column(String(100), default="weekly")  # daily, weekly, monthly, quarterly
    recipients = Column(JSON, default=list)  # emails
    filters = Column(JSON, default=dict)
    sections = Column(JSON, default=list)  # [{type, title, config}]
    is_active = Column(Boolean, default=True)
    last_generated = Column(DateTime, nullable=True)
    last_file_url = Column(String(500), default="")
    created_at = Column(DateTime, default=datetime.utcnow)

class ReportGeneration(Base):
    __tablename__ = "admin_report_generations"
    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, nullable=True)
    report_type = Column(String(100), default="")
    format = Column(String(20), default="pdf")
    status = Column(String(50), default="generating")  # generating, completed, failed
    file_url = Column(String(500), default="")
    file_size_bytes = Column(Integer, default=0)
    error = Column(Text, default="")
    requested_by = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

class ImpersonationLog(Base):
    __tablename__ = "admin_impersonation_logs"
    id = Column(Integer, primary_key=True, index=True)
    admin_user_id = Column(Integer, nullable=False)
    target_user_id = Column(Integer, nullable=False)
    target_email = Column(String(200), default="")
    reason = Column(Text, default="")
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
    actions_taken = Column(JSON, default=list)
    ip_address = Column(String(50), default="")

class APIUsageLog(Base):
    __tablename__ = "admin_api_usage_logs"
    id = Column(Integer, primary_key=True, index=True)
    api_key_id = Column(Integer, nullable=True)
    endpoint = Column(String(500), default="")
    method = Column(String(10), default="GET")
    status_code = Column(Integer, default=200)
    response_time_ms = Column(Integer, default=0)
    request_size_bytes = Column(Integer, default=0)
    response_size_bytes = Column(Integer, default=0)
    ip_address = Column(String(50), default="")
    user_agent = Column(String(500), default="")
    created_at = Column(DateTime, default=datetime.utcnow)

# ── Serializers ───────────────────────────────────────
def _ser_notif(n):
    return {
        "id": n.id, "title": n.title, "body": n.body, "icon_url": n.icon_url,
        "action_url": n.action_url, "target_type": n.target_type, "target_id": n.target_id,
        "channel": n.channel, "status": n.status,
        "scheduled_at": n.scheduled_at.isoformat() if n.scheduled_at else None,
        "sent_at": n.sent_at.isoformat() if n.sent_at else None,
        "total_sent": n.total_sent, "total_delivered": n.total_delivered,
        "total_clicked": n.total_clicked,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }

def _ser_sms(s):
    return {
        "id": s.id, "name": s.name, "body": s.body, "variables": s.variables or [],
        "category": s.category, "is_active": s.is_active, "sent_count": s.sent_count,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }

def _ser_report(r):
    return {
        "id": r.id, "name": r.name, "description": r.description,
        "report_type": r.report_type, "format": r.format, "schedule": r.schedule,
        "recipients": r.recipients or [], "filters": r.filters or {},
        "sections": r.sections or [], "is_active": r.is_active,
        "last_generated": r.last_generated.isoformat() if r.last_generated else None,
        "last_file_url": r.last_file_url,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }

# ═══════════════════════════════════════════════════════
# PUSH NOTIFICATIONS
# ═══════════════════════════════════════════════════════
@router.get("/admin/push-notifications")
def list_push(status: str = None, skip: int = 0, limit: int = 50, db: Session = Depends(get_db), _=Depends(require_admin)):
    q = db.query(PushNotification)
    if status:
        q = q.filter(PushNotification.status == status)
    total = q.count()
    items = q.order_by(PushNotification.created_at.desc()).offset(skip).limit(limit).all()
    return {"total": total, "items": [_ser_notif(n) for n in items]}

@router.post("/admin/push-notifications")
def create_push(data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    n = PushNotification(
        title=data.get("title", ""), body=data.get("body", ""),
        icon_url=data.get("icon_url", ""), action_url=data.get("action_url", ""),
        target_type=data.get("target_type", "all"), target_id=data.get("target_id", ""),
        channel=data.get("channel", "push"),
        scheduled_at=data.get("scheduled_at"),
    )
    db.add(n)
    db.commit()
    db.refresh(n)
    return _ser_notif(n)

@router.put("/admin/push-notifications/{notif_id}")
def update_push(notif_id: int, data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    n = db.query(PushNotification).filter(PushNotification.id == notif_id).first()
    if not n:
        raise HTTPException(404)
    for k in ["title", "body", "icon_url", "action_url", "target_type", "target_id", "channel", "scheduled_at"]:
        if k in data:
            setattr(n, k, data[k])
    db.commit()
    db.refresh(n)
    return _ser_notif(n)

@router.delete("/admin/push-notifications/{notif_id}")
def delete_push(notif_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    n = db.query(PushNotification).filter(PushNotification.id == notif_id).first()
    if not n:
        raise HTTPException(404)
    db.delete(n)
    db.commit()
    return {"ok": True}

@router.post("/admin/push-notifications/{notif_id}/send")
def send_push(notif_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    n = db.query(PushNotification).filter(PushNotification.id == notif_id).first()
    if not n:
        raise HTTPException(404)
    n.status = "sent"
    n.sent_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "message": "Notification envoyée"}

@router.get("/admin/push-notifications/stats")
def push_stats(db: Session = Depends(get_db), _=Depends(require_admin)):
    total = db.query(PushNotification).count()
    sent = db.query(PushNotification).filter(PushNotification.status == "sent").count()
    total_delivered = db.query(func.sum(PushNotification.total_delivered)).scalar() or 0
    total_clicked = db.query(func.sum(PushNotification.total_clicked)).scalar() or 0
    return {"total": total, "sent": sent, "total_delivered": total_delivered, "total_clicked": total_clicked, "ctr": round(total_clicked / max(total_delivered, 1) * 100, 2)}

@router.get("/admin/push-notifications/config")
def get_push_config(db: Session = Depends(get_db), _=Depends(require_admin)):
    from app.routers.admin_advanced_config import _get_config
    return _get_config(db, "push_notification_config", {
        "firebase_enabled": False, "firebase_server_key": "", "firebase_project_id": "",
        "apns_enabled": False, "apns_key_id": "", "apns_team_id": "",
        "sms_provider": "twilio", "sms_enabled": False, "twilio_sid": "", "twilio_auth_token": "", "twilio_from_number": "",
    })

@router.put("/admin/push-notifications/config")
def update_push_config(data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    from app.routers.admin_advanced_config import _set_config
    _set_config(db, "push_notification_config", data)
    return data

# ═══════════════════════════════════════════════════════
# SMS TEMPLATES
# ═══════════════════════════════════════════════════════
@router.get("/admin/sms-templates")
def list_sms(skip: int = 0, limit: int = 50, db: Session = Depends(get_db), _=Depends(require_admin)):
    q = db.query(SMSTemplate)
    total = q.count()
    items = q.order_by(SMSTemplate.created_at.desc()).offset(skip).limit(limit).all()
    return {"total": total, "items": [_ser_sms(s) for s in items]}

@router.post("/admin/sms-templates")
def create_sms(data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    s = SMSTemplate(
        name=data.get("name", ""), body=data.get("body", ""),
        variables=data.get("variables", []), category=data.get("category", "general"),
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return _ser_sms(s)

@router.put("/admin/sms-templates/{template_id}")
def update_sms(template_id: int, data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    s = db.query(SMSTemplate).filter(SMSTemplate.id == template_id).first()
    if not s:
        raise HTTPException(404)
    for k in ["name", "body", "variables", "category", "is_active"]:
        if k in data:
            setattr(s, k, data[k])
    db.commit()
    db.refresh(s)
    return _ser_sms(s)

@router.delete("/admin/sms-templates/{template_id}")
def delete_sms(template_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    s = db.query(SMSTemplate).filter(SMSTemplate.id == template_id).first()
    if not s:
        raise HTTPException(404)
    db.delete(s)
    db.commit()
    return {"ok": True}

# ═══════════════════════════════════════════════════════
# SCHEDULED REPORTS & EXPORT PDF
# ═══════════════════════════════════════════════════════
@router.get("/admin/scheduled-reports")
def list_reports(skip: int = 0, limit: int = 50, db: Session = Depends(get_db), _=Depends(require_admin)):
    q = db.query(ScheduledReport)
    total = q.count()
    items = q.order_by(ScheduledReport.created_at.desc()).offset(skip).limit(limit).all()
    return {"total": total, "items": [_ser_report(r) for r in items]}

@router.post("/admin/scheduled-reports")
def create_report(data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = ScheduledReport(
        name=data.get("name", ""), description=data.get("description", ""),
        report_type=data.get("report_type", "custom"), format=data.get("format", "pdf"),
        schedule=data.get("schedule", "weekly"), recipients=data.get("recipients", []),
        filters=data.get("filters", {}), sections=data.get("sections", []),
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return _ser_report(r)

@router.put("/admin/scheduled-reports/{report_id}")
def update_report(report_id: int, data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.query(ScheduledReport).filter(ScheduledReport.id == report_id).first()
    if not r:
        raise HTTPException(404)
    for k in ["name", "description", "report_type", "format", "schedule", "recipients", "filters", "sections", "is_active"]:
        if k in data:
            setattr(r, k, data[k])
    db.commit()
    db.refresh(r)
    return _ser_report(r)

@router.delete("/admin/scheduled-reports/{report_id}")
def delete_report(report_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.query(ScheduledReport).filter(ScheduledReport.id == report_id).first()
    if not r:
        raise HTTPException(404)
    db.delete(r)
    db.commit()
    return {"ok": True}

@router.post("/admin/scheduled-reports/{report_id}/generate")
def generate_report(report_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.query(ScheduledReport).filter(ScheduledReport.id == report_id).first()
    if not r:
        raise HTTPException(404)
    gen = ReportGeneration(report_id=report_id, report_type=r.report_type, format=r.format)
    db.add(gen)
    r.last_generated = datetime.utcnow()
    db.commit()
    return {"ok": True, "generation_id": gen.id, "message": "Génération du rapport lancée"}

@router.post("/admin/reports/generate-now")
def generate_adhoc_report(data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    gen = ReportGeneration(
        report_type=data.get("report_type", "custom"), format=data.get("format", "pdf"),
    )
    db.add(gen)
    db.commit()
    return {"ok": True, "generation_id": gen.id}

@router.get("/admin/reports/generations")
def list_generations(skip: int = 0, limit: int = 50, db: Session = Depends(get_db), _=Depends(require_admin)):
    q = db.query(ReportGeneration)
    total = q.count()
    items = q.order_by(ReportGeneration.created_at.desc()).offset(skip).limit(limit).all()
    return {"total": total, "items": [{
        "id": g.id, "report_id": g.report_id, "report_type": g.report_type,
        "format": g.format, "status": g.status, "file_url": g.file_url,
        "file_size_bytes": g.file_size_bytes, "error": g.error,
        "created_at": g.created_at.isoformat() if g.created_at else None,
        "completed_at": g.completed_at.isoformat() if g.completed_at else None,
    } for g in items]}

@router.get("/admin/reports/types")
def report_types(_=Depends(require_admin)):
    return [
        {"id": "revenue", "label": "Revenue & MRR", "sections": ["mrr_chart", "plan_breakdown", "churn_analysis"]},
        {"id": "users", "label": "Utilisateurs", "sections": ["growth_chart", "retention_cohort", "top_users"]},
        {"id": "tracks", "label": "Pistes & Analyses", "sections": ["upload_stats", "genre_distribution", "top_tracks"]},
        {"id": "churn", "label": "Churn & Rétention", "sections": ["churn_rate", "at_risk_users", "win_back"]},
        {"id": "activity", "label": "Activité", "sections": ["dau_mau", "feature_usage", "session_duration"]},
        {"id": "custom", "label": "Personnalisé", "sections": []},
    ]

# ═══════════════════════════════════════════════════════
# USER IMPERSONATION
# ═══════════════════════════════════════════════════════
@router.post("/admin/impersonate/{user_id}")
def start_impersonation(user_id: int, data: dict = None, db: Session = Depends(get_db), _=Depends(require_admin)):
    log = ImpersonationLog(
        admin_user_id=0,  # would be set from actual auth
        target_user_id=user_id,
        reason=(data or {}).get("reason", ""),
    )
    db.add(log)
    db.commit()
    return {"ok": True, "impersonation_id": log.id, "message": f"Impersonation de l'utilisateur {user_id} commencée"}

@router.post("/admin/impersonate/{impersonation_id}/end")
def end_impersonation(impersonation_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    log = db.query(ImpersonationLog).filter(ImpersonationLog.id == impersonation_id).first()
    if not log:
        raise HTTPException(404)
    log.ended_at = datetime.utcnow()
    db.commit()
    return {"ok": True}

@router.get("/admin/impersonation-logs")
def list_impersonations(skip: int = 0, limit: int = 50, db: Session = Depends(get_db), _=Depends(require_admin)):
    q = db.query(ImpersonationLog)
    total = q.count()
    items = q.order_by(ImpersonationLog.started_at.desc()).offset(skip).limit(limit).all()
    return {"total": total, "items": [{
        "id": i.id, "admin_user_id": i.admin_user_id, "target_user_id": i.target_user_id,
        "target_email": i.target_email, "reason": i.reason,
        "started_at": i.started_at.isoformat() if i.started_at else None,
        "ended_at": i.ended_at.isoformat() if i.ended_at else None,
        "actions_taken": i.actions_taken or [],
    } for i in items]}

# ═══════════════════════════════════════════════════════
# API USAGE MONITORING
# ═══════════════════════════════════════════════════════
@router.get("/admin/api-usage")
def api_usage(endpoint: str = None, method: str = None, skip: int = 0, limit: int = 50, db: Session = Depends(get_db), _=Depends(require_admin)):
    q = db.query(APIUsageLog)
    if endpoint:
        q = q.filter(APIUsageLog.endpoint.ilike(f"%{endpoint}%"))
    if method:
        q = q.filter(APIUsageLog.method == method)
    total = q.count()
    items = q.order_by(APIUsageLog.created_at.desc()).offset(skip).limit(limit).all()
    return {"total": total, "items": [{
        "id": a.id, "endpoint": a.endpoint, "method": a.method, "status_code": a.status_code,
        "response_time_ms": a.response_time_ms, "created_at": a.created_at.isoformat() if a.created_at else None,
    } for a in items]}

@router.get("/admin/api-usage/stats")
def api_usage_stats(db: Session = Depends(get_db), _=Depends(require_admin)):
    total = db.query(APIUsageLog).count()
    avg_response = db.query(func.avg(APIUsageLog.response_time_ms)).scalar() or 0
    errors = db.query(APIUsageLog).filter(APIUsageLog.status_code >= 400).count()
    top_endpoints = db.query(APIUsageLog.endpoint, func.count()).group_by(APIUsageLog.endpoint).order_by(func.count().desc()).limit(10).all()
    return {
        "total_requests": total, "avg_response_time_ms": round(avg_response, 1),
        "error_count": errors, "error_rate": round(errors / max(total, 1) * 100, 2),
        "top_endpoints": [{"endpoint": e, "count": c} for e, c in top_endpoints],
    }

@router.get("/admin/api-usage/rate-limits")
def api_rate_limits(db: Session = Depends(get_db), _=Depends(require_admin)):
    from app.routers.admin_advanced_config import _get_config
    return _get_config(db, "api_rate_limits", {
        "global_rpm": 1000, "per_key_rpm": 100, "burst_limit": 50,
        "rate_limit_by": "api_key", "throttle_response_code": 429,
    })

@router.put("/admin/api-usage/rate-limits")
def update_rate_limits(data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    from app.routers.admin_advanced_config import _set_config
    _set_config(db, "api_rate_limits", data)
    return data
