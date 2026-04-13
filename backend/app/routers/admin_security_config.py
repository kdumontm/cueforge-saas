"""
Admin Security Config Router — Sécurité, sauvegardes, imports DJ, onboarding.

Endpoints:
  /admin/security/auth-config          → Auth configuration (JWT, tokens, passwords)
  /admin/security/oauth-config         → OAuth providers config
  /admin/security/rate-limit           → Rate limiting configuration
  /admin/security/cors                 → CORS configuration
  /admin/security/ip-rules             → IP whitelist/blacklist CRUD
  /admin/security/active-sessions      → Active sessions management
  /admin/security/audit-log            → Security audit log
  /admin/security/captcha              → CAPTCHA configuration
  /admin/security/2fa                  → 2FA global settings
  /admin/backup/list                   → List backups
  /admin/backup/create                 → Create manual backup
  /admin/backup/download/<id>          → Download backup
  /admin/backup/restore/<id>           → Restore from backup
  /admin/backup/config                 → Backup configuration
  /admin/import/rekordbox              → Import Rekordbox XML
  /admin/import/serato                 → Import Serato crates
  /admin/import/traktor                → Import Traktor NML
  /admin/import/virtualdj              → Import VirtualDJ database
  /admin/import/status/<id>            → Get import status
  /admin/import/history                → Import history
  /admin/import/mapping                → Import mapping configuration
  /admin/onboarding/steps              → CRUD onboarding steps
  /admin/onboarding/reorder            → Reorder steps
  /admin/onboarding/plan-config        → Per-plan onboarding config
  /admin/onboarding/funnel-stats       → Onboarding completion funnel
  /admin/onboarding/reset/<user_id>   → Reset user onboarding

Tous les endpoints nécessitent is_admin == True.
"""
from datetime import datetime, timedelta
from typing import Any, Optional, List, Dict
from enum import Enum
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, JSON, Text, func, and_, Index
from sqlalchemy.orm import Session, relationship

from app.database import get_db, Base
from app.models.user import User
from app.middleware.admin import require_admin

router = APIRouter(prefix="/admin", tags=["admin-security"])


# ═══════════════════════════════════════════════════════════════════════════
# SQLAlchemy Models
# ═══════════════════════════════════════════════════════════════════════════

class AdminConfig(Base):
    """Centralized admin configuration storage (JSON-based)."""
    __tablename__ = "admin_configs"

    id = Column(Integer, primary_key=True, index=True)
    config_key = Column(String(100), unique=True, index=True, nullable=False)  # auth, oauth, rate_limit, cors, captcha, 2fa, backup
    config_value = Column(JSON, nullable=False, default=dict)  # Stores all config as JSON
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class IPRule(Base):
    """IP whitelist/blacklist rules."""
    __tablename__ = "ip_rules"

    id = Column(Integer, primary_key=True, index=True)
    ip_address = Column(String(45), nullable=False, index=True)  # IPv4 or IPv6
    rule_type = Column(String(20), nullable=False)  # "whitelist" or "blacklist"
    reason = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    __table_args__ = (
        Index("ix_ip_rules_type_ip", "rule_type", "ip_address"),
    )


class ActiveSession(Base):
    """Track active user sessions."""
    __tablename__ = "active_sessions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    ip_address = Column(String(45), nullable=False)
    user_agent = Column(String(500), nullable=True)
    device_type = Column(String(50), nullable=True)  # "mobile", "desktop", "tablet"
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_active = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    user = relationship("User", foreign_keys=[user_id])


class SecurityAuditLog(Base):
    """Security audit log for tracking sensitive actions."""
    __tablename__ = "security_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)  # None for system events
    action = Column(String(100), nullable=False, index=True)  # "login_attempt", "password_change", "2fa_enable", etc.
    action_status = Column(String(20), nullable=False)  # "success", "failed", "blocked"
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(500), nullable=True)
    details = Column(JSON, nullable=True)  # Extra info (reason for failure, etc.)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    user = relationship("User", foreign_keys=[user_id])


class Backup(Base):
    """Backup metadata and configuration."""
    __tablename__ = "backups"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    backup_type = Column(String(20), nullable=False)  # "auto" or "manual"
    size_bytes = Column(Integer, nullable=False)
    status = Column(String(20), nullable=False, default="pending")  # "pending", "in_progress", "completed", "failed"
    file_path = Column(String(500), nullable=True)  # S3 or local path
    download_url = Column(String(1000), nullable=True)
    error_message = Column(Text, nullable=True)
    metadata = Column(JSON, nullable=True)  # {included_tables, compression, etc.}
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    creator = relationship("User", foreign_keys=[created_by])


class ImportJob(Base):
    """Track DJ software imports."""
    __tablename__ = "import_jobs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    source = Column(String(50), nullable=False, index=True)  # "rekordbox", "serato", "traktor", "virtualdj"
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    total_tracks = Column(Integer, nullable=False, default=0)
    imported_tracks = Column(Integer, nullable=False, default=0)
    failed_tracks = Column(Integer, nullable=False, default=0)
    status = Column(String(20), nullable=False, default="pending")  # "pending", "in_progress", "completed", "failed"
    error_messages = Column(JSON, nullable=True)  # List of error messages
    mapping_config = Column(JSON, nullable=True)  # Field mapping used
    file_path = Column(String(500), nullable=True)
    progress_percent = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    user = relationship("User", foreign_keys=[user_id])


class OnboardingStep(Base):
    """Onboarding flow configuration."""
    __tablename__ = "onboarding_steps"

    id = Column(Integer, primary_key=True, index=True)
    step_order = Column(Integer, nullable=False)  # Display order
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    component = Column(String(100), nullable=False)  # React component name
    is_required = Column(Boolean, default=False, nullable=False)
    target_plan = Column(String(50), nullable=True)  # "free", "pro", "unlimited", or None for all
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    __table_args__ = (
        Index("ix_onboarding_steps_order", "step_order"),
        Index("ix_onboarding_steps_plan", "target_plan"),
    )


class OnboardingCompletion(Base):
    """Track onboarding completion per user."""
    __tablename__ = "onboarding_completions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    step_id = Column(Integer, ForeignKey("onboarding_steps.id"), nullable=False)
    completed_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", foreign_keys=[user_id])
    step = relationship("OnboardingStep", foreign_keys=[step_id])


# ═══════════════════════════════════════════════════════════════════════════
# Pydantic Schemas
# ═══════════════════════════════════════════════════════════════════════════

class AuthConfigSchema(BaseModel):
    jwt_secret: Optional[str] = None
    jwt_algorithm: Optional[str] = "HS256"
    token_expiry_minutes: Optional[int] = 1440  # 24h
    refresh_token_expiry_days: Optional[int] = 30
    password_min_length: Optional[int] = 8
    require_uppercase: Optional[bool] = True
    require_special_char: Optional[bool] = True
    require_number: Optional[bool] = True
    max_login_attempts: Optional[int] = 5
    lockout_duration_minutes: Optional[int] = 30


class OAuthProviderConfigSchema(BaseModel):
    provider: str  # "google", "apple", "facebook"
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    enabled: bool = False
    callback_url: Optional[str] = None


class RateLimitConfigSchema(BaseModel):
    global_rate_per_minute: Optional[int] = 60
    per_user_rate_per_minute: Optional[int] = 30
    burst_limit: Optional[int] = 100
    endpoint_overrides: Optional[Dict[str, int]] = None  # {"/api/v1/analyze": 10, ...}


class CORSConfigSchema(BaseModel):
    allowed_origins: Optional[List[str]] = None
    allowed_methods: Optional[List[str]] = None
    allowed_headers: Optional[List[str]] = None
    allow_credentials: Optional[bool] = True


class IPRuleSchema(BaseModel):
    ip_address: str
    rule_type: str  # "whitelist" or "blacklist"
    reason: Optional[str] = None


class ActiveSessionSchema(BaseModel):
    id: str
    user_id: int
    ip_address: str
    user_agent: Optional[str] = None
    device_type: Optional[str] = None
    created_at: str
    last_active: str


class SecurityAuditLogSchema(BaseModel):
    id: int
    user_id: Optional[int] = None
    action: str
    action_status: str
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    created_at: str


class CaptchaConfigSchema(BaseModel):
    provider: Optional[str] = None  # "recaptcha", "hcaptcha"
    site_key: Optional[str] = None
    secret_key: Optional[str] = None
    enabled: bool = False
    threshold: Optional[float] = 0.5  # For hCaptcha, confidence threshold


class TwoFAConfigSchema(BaseModel):
    enabled: bool = False
    required_for_admin: bool = True
    methods: Optional[List[str]] = None  # ["totp", "sms", "email"]


class BackupSchema(BaseModel):
    id: str
    backup_type: str
    size_bytes: int
    status: str
    file_path: Optional[str] = None
    download_url: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    created_at: str
    created_by: Optional[int] = None


class BackupConfigSchema(BaseModel):
    auto_enabled: bool = True
    frequency: str = "daily"  # "hourly", "daily", "weekly"
    retention_days: int = 30
    include_media: bool = False


class ImportJobSchema(BaseModel):
    id: str
    source: str
    user_id: int
    total_tracks: int
    imported_tracks: int
    failed_tracks: int
    status: str
    error_messages: Optional[List[str]] = None
    progress_percent: int
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class ImportMappingConfigSchema(BaseModel):
    source: str  # "rekordbox", "serato", "traktor", "virtualdj"
    field_mappings: Optional[Dict[str, str]] = None  # {source_field: cueforge_field}


class OnboardingStepSchema(BaseModel):
    id: Optional[int] = None
    step_order: int
    title: str
    description: Optional[str] = None
    component: str
    is_required: bool = False
    target_plan: Optional[str] = None


class OnboardingFunnelSchema(BaseModel):
    step_id: int
    step_title: str
    total_users: int
    completed_users: int
    completion_rate: float


class PaginatedResponse(BaseModel):
    total: int
    items: List[Any]


# ═══════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════

def _serialize_active_session(session: ActiveSession) -> dict:
    """Serialize ActiveSession to dict."""
    return {
        "id": session.id,
        "user_id": session.user_id,
        "ip_address": session.ip_address,
        "user_agent": session.user_agent,
        "device_type": session.device_type,
        "created_at": session.created_at.isoformat(),
        "last_active": session.last_active.isoformat(),
    }


def _serialize_audit_log(log: SecurityAuditLog) -> dict:
    """Serialize SecurityAuditLog to dict."""
    return {
        "id": log.id,
        "user_id": log.user_id,
        "action": log.action,
        "action_status": log.action_status,
        "ip_address": log.ip_address,
        "user_agent": log.user_agent,
        "details": log.details,
        "created_at": log.created_at.isoformat(),
    }


def _serialize_backup(backup: Backup) -> dict:
    """Serialize Backup to dict."""
    return {
        "id": backup.id,
        "backup_type": backup.backup_type,
        "size_bytes": backup.size_bytes,
        "status": backup.status,
        "file_path": backup.file_path,
        "download_url": backup.download_url,
        "metadata": backup.metadata,
        "created_at": backup.created_at.isoformat(),
        "created_by": backup.created_by,
    }


def _serialize_import_job(job: ImportJob) -> dict:
    """Serialize ImportJob to dict."""
    return {
        "id": job.id,
        "source": job.source,
        "user_id": job.user_id,
        "total_tracks": job.total_tracks,
        "imported_tracks": job.imported_tracks,
        "failed_tracks": job.failed_tracks,
        "status": job.status,
        "error_messages": job.error_messages,
        "progress_percent": job.progress_percent,
        "created_at": job.created_at.isoformat(),
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    }


def _serialize_onboarding_step(step: OnboardingStep) -> dict:
    """Serialize OnboardingStep to dict."""
    return {
        "id": step.id,
        "step_order": step.step_order,
        "title": step.title,
        "description": step.description,
        "component": step.component,
        "is_required": step.is_required,
        "target_plan": step.target_plan,
        "created_at": step.created_at.isoformat(),
        "updated_at": step.updated_at.isoformat(),
    }


def _get_or_create_config(db: Session, key: str, default: dict = None) -> AdminConfig:
    """Get or create a config entry."""
    config = db.query(AdminConfig).filter_by(config_key=key).first()
    if not config:
        config = AdminConfig(
            config_key=key,
            config_value=default or {}
        )
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


# ═══════════════════════════════════════════════════════════════════════════
# Security Auth Config Endpoints
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/security/auth-config", dependencies=[Depends(require_admin)])
def get_auth_config(db: Session = Depends(get_db)):
    """Get JWT and authentication configuration."""
    config = _get_or_create_config(db, "auth", {
        "jwt_algorithm": "HS256",
        "token_expiry_minutes": 1440,
        "refresh_token_expiry_days": 30,
        "password_min_length": 8,
        "require_uppercase": True,
        "require_special_char": True,
        "require_number": True,
        "max_login_attempts": 5,
        "lockout_duration_minutes": 30,
    })
    return config.config_value


@router.put("/security/auth-config", dependencies=[Depends(require_admin)])
def update_auth_config(
    config: AuthConfigSchema,
    db: Session = Depends(get_db)
):
    """Update JWT and authentication configuration."""
    db_config = _get_or_create_config(db, "auth")
    updates = config.dict(exclude_unset=True)
    db_config.config_value.update(updates)
    db_config.updated_at = datetime.utcnow()
    db.add(db_config)
    db.commit()
    return {"status": "updated", "config": db_config.config_value}


# ═══════════════════════════════════════════════════════════════════════════
# OAuth Config Endpoints
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/security/oauth-config", dependencies=[Depends(require_admin)])
def get_oauth_config(db: Session = Depends(get_db)):
    """Get OAuth providers configuration."""
    config = _get_or_create_config(db, "oauth", {
        "providers": {
            "google": {"enabled": False, "client_id": None, "client_secret": None, "callback_url": None},
            "apple": {"enabled": False, "client_id": None, "client_secret": None, "callback_url": None},
            "facebook": {"enabled": False, "client_id": None, "client_secret": None, "callback_url": None},
        }
    })
    return config.config_value


@router.put("/security/oauth-config", dependencies=[Depends(require_admin)])
def update_oauth_provider(
    provider: OAuthProviderConfigSchema,
    db: Session = Depends(get_db)
):
    """Update OAuth provider configuration."""
    db_config = _get_or_create_config(db, "oauth", {"providers": {}})
    provider_data = provider.dict(exclude_unset=True)
    provider_name = provider.provider.lower()
    db_config.config_value["providers"][provider_name] = provider_data
    db_config.updated_at = datetime.utcnow()
    db.add(db_config)
    db.commit()
    return {"status": "updated", "provider": provider_name}


# ═══════════════════════════════════════════════════════════════════════════
# Rate Limit Config Endpoints
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/security/rate-limit", dependencies=[Depends(require_admin)])
def get_rate_limit_config(db: Session = Depends(get_db)):
    """Get rate limiting configuration."""
    config = _get_or_create_config(db, "rate_limit", {
        "global_rate_per_minute": 60,
        "per_user_rate_per_minute": 30,
        "burst_limit": 100,
        "endpoint_overrides": {}
    })
    return config.config_value


@router.put("/security/rate-limit", dependencies=[Depends(require_admin)])
def update_rate_limit_config(
    config: RateLimitConfigSchema,
    db: Session = Depends(get_db)
):
    """Update rate limiting configuration."""
    db_config = _get_or_create_config(db, "rate_limit")
    updates = config.dict(exclude_unset=True)
    db_config.config_value.update(updates)
    db_config.updated_at = datetime.utcnow()
    db.add(db_config)
    db.commit()
    return {"status": "updated", "config": db_config.config_value}


# ═══════════════════════════════════════════════════════════════════════════
# CORS Config Endpoints
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/security/cors", dependencies=[Depends(require_admin)])
def get_cors_config(db: Session = Depends(get_db)):
    """Get CORS configuration."""
    config = _get_or_create_config(db, "cors", {
        "allowed_origins": ["http://localhost:3000", "http://localhost:8000"],
        "allowed_methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allowed_headers": ["Content-Type", "Authorization"],
        "allow_credentials": True
    })
    return config.config_value


@router.put("/security/cors", dependencies=[Depends(require_admin)])
def update_cors_config(
    config: CORSConfigSchema,
    db: Session = Depends(get_db)
):
    """Update CORS configuration."""
    db_config = _get_or_create_config(db, "cors")
    updates = config.dict(exclude_unset=True)
    db_config.config_value.update(updates)
    db_config.updated_at = datetime.utcnow()
    db.add(db_config)
    db.commit()
    return {"status": "updated", "config": db_config.config_value}


# ═══════════════════════════════════════════════════════════════════════════
# IP Rules Endpoints
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/security/ip-rules", dependencies=[Depends(require_admin)])
def list_ip_rules(
    rule_type: Optional[str] = Query(None),
    skip: int = Query(0),
    limit: int = Query(50),
    db: Session = Depends(get_db)
):
    """List IP whitelist/blacklist rules."""
    query = db.query(IPRule)
    if rule_type:
        query = query.filter_by(rule_type=rule_type)

    total = query.count()
    items = [
        {
            "id": rule.id,
            "ip_address": rule.ip_address,
            "rule_type": rule.rule_type,
            "reason": rule.reason,
            "created_at": rule.created_at.isoformat(),
        }
        for rule in query.offset(skip).limit(limit).all()
    ]
    return {"total": total, "items": items}


@router.post("/security/ip-rules", dependencies=[Depends(require_admin)])
def create_ip_rule(
    rule: IPRuleSchema,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Create a new IP rule."""
    if rule.rule_type not in ["whitelist", "blacklist"]:
        raise HTTPException(status_code=400, detail="rule_type must be 'whitelist' or 'blacklist'")

    db_rule = IPRule(
        ip_address=rule.ip_address,
        rule_type=rule.rule_type,
        reason=rule.reason,
        created_by=admin.id
    )
    db.add(db_rule)
    db.commit()
    db.refresh(db_rule)
    return {
        "id": db_rule.id,
        "ip_address": db_rule.ip_address,
        "rule_type": db_rule.rule_type,
        "reason": db_rule.reason,
        "created_at": db_rule.created_at.isoformat(),
    }


@router.delete("/security/ip-rules/{rule_id}", dependencies=[Depends(require_admin)])
def delete_ip_rule(rule_id: int, db: Session = Depends(get_db)):
    """Delete an IP rule."""
    rule = db.query(IPRule).filter_by(id=rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    db.delete(rule)
    db.commit()
    return {"status": "deleted"}


# ═══════════════════════════════════════════════════════════════════════════
# Active Sessions Endpoints
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/security/active-sessions", dependencies=[Depends(require_admin)])
def list_active_sessions(
    user_id: Optional[int] = Query(None),
    skip: int = Query(0),
    limit: int = Query(50),
    db: Session = Depends(get_db)
):
    """List active user sessions."""
    query = db.query(ActiveSession).order_by(ActiveSession.last_active.desc())
    if user_id:
        query = query.filter_by(user_id=user_id)

    total = query.count()
    items = [_serialize_active_session(session) for session in query.offset(skip).limit(limit).all()]
    return {"total": total, "items": items}


@router.delete("/security/active-sessions/{session_id}", dependencies=[Depends(require_admin)])
def force_logout_session(session_id: str, db: Session = Depends(get_db)):
    """Force logout a specific session."""
    session = db.query(ActiveSession).filter_by(id=session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    user_id = session.user_id
    db.delete(session)
    db.commit()
    return {"status": "logged_out", "user_id": user_id}


@router.post("/security/active-sessions/force-logout-user/{user_id}", dependencies=[Depends(require_admin)])
def force_logout_user(user_id: int, db: Session = Depends(get_db)):
    """Force logout all sessions for a user."""
    user = db.query(User).filter_by(id=user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    sessions = db.query(ActiveSession).filter_by(user_id=user_id).all()
    count = len(sessions)
    for session in sessions:
        db.delete(session)
    db.commit()
    return {"status": "logged_out", "sessions_terminated": count}


# ═══════════════════════════════════════════════════════════════════════════
# Security Audit Log Endpoints
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/security/audit-log", dependencies=[Depends(require_admin)])
def list_audit_logs(
    action: Optional[str] = Query(None),
    user_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    days: int = Query(7),
    skip: int = Query(0),
    limit: int = Query(50),
    db: Session = Depends(get_db)
):
    """List security audit logs with filtering."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    query = db.query(SecurityAuditLog).filter(SecurityAuditLog.created_at >= cutoff)

    if action:
        query = query.filter_by(action=action)
    if user_id:
        query = query.filter_by(user_id=user_id)
    if status:
        query = query.filter_by(action_status=status)

    total = query.count()
    query = query.order_by(SecurityAuditLog.created_at.desc())
    items = [_serialize_audit_log(log) for log in query.offset(skip).limit(limit).all()]
    return {"total": total, "items": items}


@router.post("/security/audit-log", dependencies=[Depends(require_admin)])
def create_audit_log(
    action: str,
    action_status: str = "success",
    user_id: Optional[int] = None,
    ip_address: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    db: Session = Depends(get_db)
):
    """Create an audit log entry (for manual logging)."""
    log = SecurityAuditLog(
        action=action,
        action_status=action_status,
        user_id=user_id,
        ip_address=ip_address,
        details=details
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return _serialize_audit_log(log)


# ═══════════════════════════════════════════════════════════════════════════
# CAPTCHA Config Endpoints
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/security/captcha", dependencies=[Depends(require_admin)])
def get_captcha_config(db: Session = Depends(get_db)):
    """Get CAPTCHA configuration."""
    config = _get_or_create_config(db, "captcha", {
        "provider": None,
        "site_key": None,
        "secret_key": None,
        "enabled": False,
        "threshold": 0.5
    })
    return config.config_value


@router.put("/security/captcha", dependencies=[Depends(require_admin)])
def update_captcha_config(
    config: CaptchaConfigSchema,
    db: Session = Depends(get_db)
):
    """Update CAPTCHA configuration."""
    db_config = _get_or_create_config(db, "captcha")
    updates = config.dict(exclude_unset=True)
    db_config.config_value.update(updates)
    db_config.updated_at = datetime.utcnow()
    db.add(db_config)
    db.commit()
    return {"status": "updated", "config": db_config.config_value}


# ═══════════════════════════════════════════════════════════════════════════
# 2FA Config Endpoints
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/security/2fa", dependencies=[Depends(require_admin)])
def get_2fa_config(db: Session = Depends(get_db)):
    """Get 2FA global configuration."""
    config = _get_or_create_config(db, "2fa", {
        "enabled": False,
        "required_for_admin": True,
        "methods": ["totp"]
    })
    return config.config_value


@router.put("/security/2fa", dependencies=[Depends(require_admin)])
def update_2fa_config(
    config: TwoFAConfigSchema,
    db: Session = Depends(get_db)
):
    """Update 2FA global configuration."""
    db_config = _get_or_create_config(db, "2fa")
    updates = config.dict(exclude_unset=True)
    db_config.config_value.update(updates)
    db_config.updated_at = datetime.utcnow()
    db.add(db_config)
    db.commit()
    return {"status": "updated", "config": db_config.config_value}


# ═══════════════════════════════════════════════════════════════════════════
# Backup Endpoints
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/backup/list", dependencies=[Depends(require_admin)])
def list_backups(
    backup_type: Optional[str] = Query(None),
    skip: int = Query(0),
    limit: int = Query(20),
    db: Session = Depends(get_db)
):
    """List all backups."""
    query = db.query(Backup).order_by(Backup.created_at.desc())
    if backup_type:
        query = query.filter_by(backup_type=backup_type)

    total = query.count()
    items = [_serialize_backup(backup) for backup in query.offset(skip).limit(limit).all()]
    return {"total": total, "items": items}


@router.post("/backup/create", dependencies=[Depends(require_admin)])
def create_manual_backup(
    include_media: bool = False,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Create a manual backup."""
    backup = Backup(
        backup_type="manual",
        size_bytes=0,
        status="pending",
        metadata={"include_media": include_media},
        created_by=admin.id
    )
    db.add(backup)
    db.commit()
    db.refresh(backup)
    return {
        "id": backup.id,
        "status": "pending",
        "message": "Backup création en cours..."
    }


@router.get("/backup/download/{backup_id}", dependencies=[Depends(require_admin)])
def download_backup(backup_id: str, db: Session = Depends(get_db)):
    """Get download URL for a backup."""
    backup = db.query(Backup).filter_by(id=backup_id).first()
    if not backup:
        raise HTTPException(status_code=404, detail="Backup not found")

    if backup.status != "completed":
        raise HTTPException(status_code=400, detail="Backup not ready for download")

    return {
        "download_url": backup.download_url,
        "size_bytes": backup.size_bytes,
        "created_at": backup.created_at.isoformat()
    }


@router.post("/backup/restore/{backup_id}", dependencies=[Depends(require_admin)])
def restore_from_backup(backup_id: str, db: Session = Depends(get_db)):
    """Restore database from backup."""
    backup = db.query(Backup).filter_by(id=backup_id).first()
    if not backup:
        raise HTTPException(status_code=404, detail="Backup not found")

    if backup.status != "completed":
        raise HTTPException(status_code=400, detail="Backup not ready for restore")

    # TODO: Implement actual restore logic
    return {
        "status": "restore_started",
        "backup_id": backup_id,
        "message": "Restauration en cours..."
    }


@router.get("/backup/config", dependencies=[Depends(require_admin)])
def get_backup_config(db: Session = Depends(get_db)):
    """Get backup configuration."""
    config = _get_or_create_config(db, "backup", {
        "auto_enabled": True,
        "frequency": "daily",
        "retention_days": 30,
        "include_media": False
    })
    return config.config_value


@router.put("/backup/config", dependencies=[Depends(require_admin)])
def update_backup_config(
    config: BackupConfigSchema,
    db: Session = Depends(get_db)
):
    """Update backup configuration."""
    db_config = _get_or_create_config(db, "backup")
    updates = config.dict(exclude_unset=True)
    db_config.config_value.update(updates)
    db_config.updated_at = datetime.utcnow()
    db.add(db_config)
    db.commit()
    return {"status": "updated", "config": db_config.config_value}


# ═══════════════════════════════════════════════════════════════════════════
# Import DJ Software Endpoints
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/import/rekordbox", dependencies=[Depends(require_admin)])
def import_rekordbox(
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Start Rekordbox XML import."""
    user = db.query(User).filter_by(id=user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    job = ImportJob(
        source="rekordbox",
        user_id=user_id,
        status="pending"
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return _serialize_import_job(job)


@router.post("/import/serato", dependencies=[Depends(require_admin)])
def import_serato(
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Start Serato crates import."""
    user = db.query(User).filter_by(id=user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    job = ImportJob(
        source="serato",
        user_id=user_id,
        status="pending"
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return _serialize_import_job(job)


@router.post("/import/traktor", dependencies=[Depends(require_admin)])
def import_traktor(
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Start Traktor NML import."""
    user = db.query(User).filter_by(id=user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    job = ImportJob(
        source="traktor",
        user_id=user_id,
        status="pending"
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return _serialize_import_job(job)


@router.post("/import/virtualdj", dependencies=[Depends(require_admin)])
def import_virtualdj(
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Start VirtualDJ database import."""
    user = db.query(User).filter_by(id=user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    job = ImportJob(
        source="virtualdj",
        user_id=user_id,
        status="pending"
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return _serialize_import_job(job)


@router.get("/import/status/{import_id}", dependencies=[Depends(require_admin)])
def get_import_status(import_id: str, db: Session = Depends(get_db)):
    """Get import job status."""
    job = db.query(ImportJob).filter_by(id=import_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Import job not found")

    return _serialize_import_job(job)


@router.get("/import/history", dependencies=[Depends(require_admin)])
def list_import_history(
    user_id: Optional[int] = Query(None),
    source: Optional[str] = Query(None),
    skip: int = Query(0),
    limit: int = Query(50),
    db: Session = Depends(get_db)
):
    """List import history."""
    query = db.query(ImportJob).order_by(ImportJob.created_at.desc())
    if user_id:
        query = query.filter_by(user_id=user_id)
    if source:
        query = query.filter_by(source=source)

    total = query.count()
    items = [_serialize_import_job(job) for job in query.offset(skip).limit(limit).all()]
    return {"total": total, "items": items}


@router.get("/import/mapping", dependencies=[Depends(require_admin)])
def get_import_mapping_config(db: Session = Depends(get_db)):
    """Get import field mapping configurations."""
    config = _get_or_create_config(db, "import_mappings", {
        "rekordbox": {},
        "serato": {},
        "traktor": {},
        "virtualdj": {}
    })
    return config.config_value


@router.put("/import/mapping", dependencies=[Depends(require_admin)])
def update_import_mapping_config(
    config: ImportMappingConfigSchema,
    db: Session = Depends(get_db)
):
    """Update import field mapping configuration."""
    db_config = _get_or_create_config(db, "import_mappings", {
        "rekordbox": {},
        "serato": {},
        "traktor": {},
        "virtualdj": {}
    })
    source = config.source.lower()
    if source in db_config.config_value:
        db_config.config_value[source] = config.field_mappings or {}

    db_config.updated_at = datetime.utcnow()
    db.add(db_config)
    db.commit()
    return {"status": "updated", "source": source}


# ═══════════════════════════════════════════════════════════════════════════
# Onboarding Endpoints
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/onboarding/steps", dependencies=[Depends(require_admin)])
def list_onboarding_steps(
    target_plan: Optional[str] = Query(None),
    skip: int = Query(0),
    limit: int = Query(100),
    db: Session = Depends(get_db)
):
    """List onboarding steps."""
    query = db.query(OnboardingStep).order_by(OnboardingStep.step_order)
    if target_plan:
        query = query.filter(
            (OnboardingStep.target_plan == target_plan) |
            (OnboardingStep.target_plan == None)
        )

    total = query.count()
    items = [_serialize_onboarding_step(step) for step in query.offset(skip).limit(limit).all()]
    return {"total": total, "items": items}


@router.post("/onboarding/steps", dependencies=[Depends(require_admin)])
def create_onboarding_step(
    step: OnboardingStepSchema,
    db: Session = Depends(get_db)
):
    """Create a new onboarding step."""
    db_step = OnboardingStep(
        step_order=step.step_order,
        title=step.title,
        description=step.description,
        component=step.component,
        is_required=step.is_required,
        target_plan=step.target_plan
    )
    db.add(db_step)
    db.commit()
    db.refresh(db_step)
    return _serialize_onboarding_step(db_step)


@router.put("/onboarding/steps/{step_id}", dependencies=[Depends(require_admin)])
def update_onboarding_step(
    step_id: int,
    step: OnboardingStepSchema,
    db: Session = Depends(get_db)
):
    """Update an onboarding step."""
    db_step = db.query(OnboardingStep).filter_by(id=step_id).first()
    if not db_step:
        raise HTTPException(status_code=404, detail="Step not found")

    updates = step.dict(exclude_unset=True, exclude={"id"})
    for key, value in updates.items():
        setattr(db_step, key, value)

    db_step.updated_at = datetime.utcnow()
    db.add(db_step)
    db.commit()
    db.refresh(db_step)
    return _serialize_onboarding_step(db_step)


@router.delete("/onboarding/steps/{step_id}", dependencies=[Depends(require_admin)])
def delete_onboarding_step(step_id: int, db: Session = Depends(get_db)):
    """Delete an onboarding step."""
    db_step = db.query(OnboardingStep).filter_by(id=step_id).first()
    if not db_step:
        raise HTTPException(status_code=404, detail="Step not found")

    db.delete(db_step)
    db.commit()
    return {"status": "deleted"}


@router.post("/onboarding/reorder", dependencies=[Depends(require_admin)])
def reorder_onboarding_steps(
    step_ids: List[int] = Body(...),
    db: Session = Depends(get_db)
):
    """Reorder onboarding steps."""
    for order, step_id in enumerate(step_ids):
        step = db.query(OnboardingStep).filter_by(id=step_id).first()
        if step:
            step.step_order = order
            step.updated_at = datetime.utcnow()
            db.add(step)

    db.commit()
    return {"status": "reordered", "count": len(step_ids)}


@router.get("/onboarding/plan-config", dependencies=[Depends(require_admin)])
def get_onboarding_plan_config(db: Session = Depends(get_db)):
    """Get per-plan onboarding configuration."""
    config = _get_or_create_config(db, "onboarding_plans", {
        "free": {"enabled": True, "required": True},
        "pro": {"enabled": True, "required": False},
        "unlimited": {"enabled": False, "required": False}
    })
    return config.config_value


@router.put("/onboarding/plan-config", dependencies=[Depends(require_admin)])
def update_onboarding_plan_config(
    config: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """Update per-plan onboarding configuration."""
    db_config = _get_or_create_config(db, "onboarding_plans")
    db_config.config_value.update(config)
    db_config.updated_at = datetime.utcnow()
    db.add(db_config)
    db.commit()
    return {"status": "updated", "config": db_config.config_value}


@router.get("/onboarding/funnel-stats", dependencies=[Depends(require_admin)])
def get_onboarding_funnel_stats(db: Session = Depends(get_db)):
    """Get onboarding completion funnel statistics."""
    steps = db.query(OnboardingStep).order_by(OnboardingStep.step_order).all()
    stats = []

    for step in steps:
        total_users = db.query(User).count()
        completed = db.query(OnboardingCompletion).filter_by(step_id=step.id).count()
        completion_rate = (completed / total_users * 100) if total_users > 0 else 0

        stats.append({
            "step_id": step.id,
            "step_title": step.title,
            "total_users": total_users,
            "completed_users": completed,
            "completion_rate": round(completion_rate, 2)
        })

    return {"steps": stats}


@router.post("/onboarding/reset/{user_id}", dependencies=[Depends(require_admin)])
def reset_user_onboarding(user_id: int, db: Session = Depends(get_db)):
    """Reset onboarding for a user."""
    user = db.query(User).filter_by(id=user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Clear completions
    completions = db.query(OnboardingCompletion).filter_by(user_id=user_id).all()
    for completion in completions:
        db.delete(completion)

    # Reset user flag
    user.onboarding_completed = False
    db.add(user)
    db.commit()

    return {"status": "reset", "user_id": user_id}
