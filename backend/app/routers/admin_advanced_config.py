"""
Admin Advanced Config — White label, PWA, Accessibilité, Data cleanup,
Churn prevention, Multi-env, Desktop config, Notifications avancées.

~45 endpoints couvrant les derniers domaines du roadmap.
"""
import json
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, Float, func, or_, and_
from sqlalchemy.orm import Session

from app.database import get_db, Base
from app.middleware.admin import require_admin
from app.models.user import User
from app.models.subscription import Subscription

router = APIRouter(dependencies=[Depends(require_admin)])


# ═══════════════════════════════════════════════
#  MODÈLES
# ═══════════════════════════════════════════════

class AdminConfig(Base):
    __tablename__ = "admin_config"
    id = Column(Integer, primary_key=True, index=True)
    config_key = Column(String(200), unique=True, index=True, nullable=False)
    config_value = Column(Text, nullable=False, default="{}")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ChurnRisk(Base):
    __tablename__ = "churn_risks"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    risk_score = Column(Float, default=0.0)
    risk_factors = Column(Text, default="[]")
    last_activity = Column(DateTime, nullable=True)
    recommended_action = Column(String(200), nullable=True)
    status = Column(String(50), default="active")  # active, contacted, retained, churned
    computed_at = Column(DateTime, default=datetime.utcnow)


class DataCleanupJob(Base):
    __tablename__ = "data_cleanup_jobs"
    id = Column(Integer, primary_key=True, index=True)
    job_type = Column(String(100), nullable=False)
    description = Column(String(500), nullable=True)
    status = Column(String(50), default="pending")  # pending, running, completed, failed
    records_affected = Column(Integer, default=0)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    error_message = Column(Text, nullable=True)


# ═══════════════════════════════════════════════
#  HELPER: Config store
# ═══════════════════════════════════════════════

def _get_config(db: Session, key: str, default: dict = {}) -> dict:
    c = db.query(AdminConfig).filter(AdminConfig.config_key == key).first()
    if c: return json.loads(c.config_value)
    return default

def _set_config(db: Session, key: str, value: dict):
    c = db.query(AdminConfig).filter(AdminConfig.config_key == key).first()
    if not c:
        c = AdminConfig(config_key=key, config_value=json.dumps(value, ensure_ascii=False))
        db.add(c)
    else:
        c.config_value = json.dumps(value, ensure_ascii=False)
    db.commit()


# ═══════════════════════════════════════════════
#  WHITE LABEL
# ═══════════════════════════════════════════════

@router.get("/admin/white-label/config")
def get_white_label(db: Session = Depends(get_db)):
    return _get_config(db, "white_label", {
        "enabled": False, "custom_domain": "", "brand_name": "TrackCue",
        "logo_url": "", "favicon_url": "", "primary_color": "#6366f1",
        "hide_powered_by": False, "custom_login_bg": "",
        "support_email": "", "support_url": "",
        "custom_terms_url": "", "custom_privacy_url": "",
    })

@router.put("/admin/white-label/config")
def update_white_label(config: Dict[str, Any], db: Session = Depends(get_db)):
    _set_config(db, "white_label", config); return {"ok": True}


# ═══════════════════════════════════════════════
#  PWA CONFIGURATION
# ═══════════════════════════════════════════════

@router.get("/admin/pwa/config")
def get_pwa_config(db: Session = Depends(get_db)):
    return _get_config(db, "pwa", {
        "enabled": True, "name": "TrackCue", "short_name": "TrackCue",
        "description": "AI-Powered Cue Points for DJs",
        "theme_color": "#6366f1", "background_color": "#0f172a",
        "display": "standalone", "orientation": "portrait",
        "start_url": "/", "scope": "/",
        "icons": {"192": "", "512": ""},
        "offline_page": "/offline",
        "cache_strategy": "network-first",
        "push_notifications": True,
    })

@router.put("/admin/pwa/config")
def update_pwa_config(config: Dict[str, Any], db: Session = Depends(get_db)):
    _set_config(db, "pwa", config); return {"ok": True}


# ═══════════════════════════════════════════════
#  ACCESSIBILITÉ
# ═══════════════════════════════════════════════

@router.get("/admin/accessibility/config")
def get_accessibility(db: Session = Depends(get_db)):
    return _get_config(db, "accessibility", {
        "high_contrast_mode": False, "font_size_adjust": 1.0,
        "reduce_animations": False, "screen_reader_hints": True,
        "keyboard_navigation": True, "focus_indicators": True,
        "alt_text_required": True, "color_blind_friendly": False,
        "min_touch_target": 44, "skip_to_content": True,
        "aria_labels": True,
    })

@router.put("/admin/accessibility/config")
def update_accessibility(config: Dict[str, Any], db: Session = Depends(get_db)):
    _set_config(db, "accessibility", config); return {"ok": True}


# ═══════════════════════════════════════════════
#  DESKTOP APP CONFIG
# ═══════════════════════════════════════════════

@router.get("/admin/desktop/config")
def get_desktop_config(db: Session = Depends(get_db)):
    return _get_config(db, "desktop_app", {
        "enabled": True, "auto_update": True,
        "update_channel": "stable",  # stable, beta, alpha
        "min_version": "1.0.0",
        "force_update_below": "0.9.0",
        "download_url_mac": "", "download_url_win": "", "download_url_linux": "",
        "changelog_url": "",
        "features": {"local_analysis": True, "offline_mode": True, "file_watcher": True, "system_tray": True},
    })

@router.put("/admin/desktop/config")
def update_desktop_config(config: Dict[str, Any], db: Session = Depends(get_db)):
    _set_config(db, "desktop_app", config); return {"ok": True}


# ═══════════════════════════════════════════════
#  MULTI-ENVIRONMENT
# ═══════════════════════════════════════════════

@router.get("/admin/environments")
def list_environments(db: Session = Depends(get_db)):
    return _get_config(db, "environments", {
        "environments": [
            {"name": "production", "url": "", "is_current": True, "db_url": "***", "last_deploy": None},
            {"name": "staging", "url": "", "is_current": False, "db_url": "***", "last_deploy": None},
        ],
        "feature_flags": {},
    })

@router.put("/admin/environments")
def update_environments(config: Dict[str, Any], db: Session = Depends(get_db)):
    _set_config(db, "environments", config); return {"ok": True}

@router.get("/admin/feature-flags")
def get_feature_flags(db: Session = Depends(get_db)):
    return _get_config(db, "feature_flags", {
        "new_upload_flow": {"enabled": True, "rollout_percent": 100, "description": "Nouveau flow d'upload"},
        "ai_cue_detection_v2": {"enabled": False, "rollout_percent": 0, "description": "Nouvelle IA de détection"},
        "social_features": {"enabled": False, "rollout_percent": 0, "description": "Features sociales"},
    })

@router.put("/admin/feature-flags")
def update_feature_flags(flags: Dict[str, Any], db: Session = Depends(get_db)):
    _set_config(db, "feature_flags", flags); return {"ok": True}

@router.put("/admin/feature-flags/{flag_name}/toggle")
def toggle_feature_flag(flag_name: str, db: Session = Depends(get_db)):
    flags = _get_config(db, "feature_flags", {})
    if flag_name not in flags: raise HTTPException(404, "Flag introuvable")
    flags[flag_name]["enabled"] = not flags[flag_name]["enabled"]
    _set_config(db, "feature_flags", flags)
    return {"ok": True, "enabled": flags[flag_name]["enabled"]}


# ═══════════════════════════════════════════════
#  CHURN PREVENTION
# ═══════════════════════════════════════════════

@router.get("/admin/churn/config")
def get_churn_config(db: Session = Depends(get_db)):
    return _get_config(db, "churn_prevention", {
        "enabled": True, "inactivity_threshold_days": 14,
        "risk_weights": {"no_login_7d": 20, "no_login_14d": 40, "no_tracks_30d": 30, "canceled_trial": 50, "support_ticket_unresolved": 15},
        "auto_actions": {"send_reengagement_email": True, "offer_discount": False, "notify_admin": True},
        "discount_coupon_code": "",
    })

@router.put("/admin/churn/config")
def update_churn_config(config: Dict[str, Any], db: Session = Depends(get_db)):
    _set_config(db, "churn_prevention", config); return {"ok": True}

@router.get("/admin/churn/at-risk")
def list_at_risk_users(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    q = db.query(ChurnRisk).filter(ChurnRisk.status == "active").order_by(ChurnRisk.risk_score.desc())
    total = q.count(); items = q.offset(skip).limit(limit).all()
    results = []
    for cr in items:
        user = db.query(User).get(cr.user_id)
        results.append({
            "id": cr.id, "user_id": cr.user_id,
            "email": user.email if user else "—", "dj_name": getattr(user, "dj_name", None) if user else None,
            "risk_score": cr.risk_score, "risk_factors": json.loads(cr.risk_factors or "[]"),
            "last_activity": cr.last_activity.isoformat() if cr.last_activity else None,
            "recommended_action": cr.recommended_action, "status": cr.status,
        })
    return {"total": total, "items": results}

@router.post("/admin/churn/compute")
def compute_churn_risks(db: Session = Depends(get_db)):
    """Recalcule le score de churn pour tous les utilisateurs actifs."""
    config = _get_config(db, "churn_prevention", {})
    weights = config.get("risk_weights", {})
    now = datetime.utcnow()
    users = db.query(User).filter(User.is_active == True).all()
    count = 0
    for u in users:
        score = 0.0; factors = []
        last_login = getattr(u, "last_login", None)
        if last_login:
            days_since = (now - last_login).days
            if days_since >= 14: score += weights.get("no_login_14d", 40); factors.append(f"Inactif {days_since}j")
            elif days_since >= 7: score += weights.get("no_login_7d", 20); factors.append(f"Inactif {days_since}j")
        sub = db.query(Subscription).filter(Subscription.user_id == u.id).first()
        if sub and sub.status == "canceled": score += weights.get("canceled_trial", 50); factors.append("Abonnement annulé")
        if score > 0:
            existing = db.query(ChurnRisk).filter(ChurnRisk.user_id == u.id).first()
            if existing:
                existing.risk_score = min(score, 100); existing.risk_factors = json.dumps(factors)
                existing.last_activity = last_login; existing.computed_at = now
            else:
                db.add(ChurnRisk(user_id=u.id, risk_score=min(score, 100), risk_factors=json.dumps(factors), last_activity=last_login, recommended_action="Email de réengagement" if score < 50 else "Contact direct"))
            count += 1
    db.commit()
    return {"ok": True, "users_analyzed": len(users), "at_risk": count}

@router.put("/admin/churn/{risk_id}/status")
def update_churn_status(risk_id: int, status: str, db: Session = Depends(get_db)):
    cr = db.query(ChurnRisk).get(risk_id)
    if not cr: raise HTTPException(404); cr.status = status; db.commit(); return {"ok": True}

@router.get("/admin/churn/stats")
def churn_stats(db: Session = Depends(get_db)):
    total = db.query(func.count(ChurnRisk.id)).filter(ChurnRisk.status == "active").scalar() or 0
    high = db.query(func.count(ChurnRisk.id)).filter(ChurnRisk.status == "active", ChurnRisk.risk_score >= 60).scalar() or 0
    medium = db.query(func.count(ChurnRisk.id)).filter(ChurnRisk.status == "active", ChurnRisk.risk_score.between(30, 59)).scalar() or 0
    low = db.query(func.count(ChurnRisk.id)).filter(ChurnRisk.status == "active", ChurnRisk.risk_score < 30).scalar() or 0
    retained = db.query(func.count(ChurnRisk.id)).filter(ChurnRisk.status == "retained").scalar() or 0
    return {"total_at_risk": total, "high_risk": high, "medium_risk": medium, "low_risk": low, "retained": retained}


# ═══════════════════════════════════════════════
#  DATA CLEANUP
# ═══════════════════════════════════════════════

@router.get("/admin/data-cleanup/jobs")
def list_cleanup_jobs(db: Session = Depends(get_db)):
    items = db.query(DataCleanupJob).order_by(DataCleanupJob.created_at.desc()).limit(50).all()
    return {"items": [{"id": j.id, "job_type": j.job_type, "description": j.description, "status": j.status, "records_affected": j.records_affected, "started_at": j.started_at.isoformat() if j.started_at else None, "completed_at": j.completed_at.isoformat() if j.completed_at else None, "error_message": j.error_message} for j in items]}

@router.post("/admin/data-cleanup/run")
def run_cleanup(job_type: str, db: Session = Depends(get_db)):
    """Lance un job de nettoyage. Types: orphan_tracks, old_logs, expired_sessions, duplicate_users, unused_media."""
    job = DataCleanupJob(job_type=job_type, description=f"Nettoyage: {job_type}", status="running", started_at=datetime.utcnow())
    db.add(job); db.commit(); db.refresh(job)
    affected = 0
    try:
        if job_type == "old_logs":
            from app.models.activity_log import ActivityLog
            cutoff = datetime.utcnow() - timedelta(days=90)
            affected = db.query(ActivityLog).filter(ActivityLog.created_at < cutoff).delete()
        elif job_type == "expired_sessions":
            affected = 0  # Placeholder — nettoyer tokens expirés
        job.records_affected = affected; job.status = "completed"; job.completed_at = datetime.utcnow()
    except Exception as e:
        job.status = "failed"; job.error_message = str(e)
    db.commit()
    return {"ok": True, "job_id": job.id, "records_affected": affected}

@router.get("/admin/data-cleanup/available")
def available_cleanups():
    return {"types": [
        {"id": "orphan_tracks", "label": "Tracks orphelines", "description": "Tracks sans fichier audio associé"},
        {"id": "old_logs", "label": "Vieux logs (>90j)", "description": "Supprimer les logs d'activité anciens"},
        {"id": "expired_sessions", "label": "Sessions expirées", "description": "Nettoyer les sessions obsolètes"},
        {"id": "duplicate_users", "label": "Doublons utilisateurs", "description": "Détecter et fusionner les comptes en double"},
        {"id": "unused_media", "label": "Médias inutilisés", "description": "Supprimer les fichiers media non référencés"},
        {"id": "temp_files", "label": "Fichiers temporaires", "description": "Supprimer les fichiers d'upload temporaires"},
    ]}

@router.get("/admin/data-cleanup/storage-stats")
def storage_stats(db: Session = Depends(get_db)):
    from app.models.track import Track
    from app.models.cms import MediaAsset
    tracks_count = db.query(func.count(Track.id)).scalar() or 0
    media_count = db.query(func.count(MediaAsset.id)).scalar() or 0
    users_count = db.query(func.count(User.id)).scalar() or 0
    return {"tracks": tracks_count, "media_assets": media_count, "users": users_count, "estimated_storage_mb": tracks_count * 15 + media_count * 2}


# ═══════════════════════════════════════════════
#  ADVANCED NOTIFICATIONS CONFIG
# ═══════════════════════════════════════════════

@router.get("/admin/notifications/config")
def get_notif_config(db: Session = Depends(get_db)):
    return _get_config(db, "notifications", {
        "email": {"enabled": True, "provider": "smtp", "from_name": "TrackCue", "from_email": "noreply@trackcue.com"},
        "push": {"enabled": True, "vapid_public_key": "", "vapid_private_key": ""},
        "in_app": {"enabled": True, "max_unread": 50, "auto_dismiss_hours": 72},
        "slack_webhook": "",
        "discord_webhook": "",
    })

@router.put("/admin/notifications/config")
def update_notif_config(config: Dict[str, Any], db: Session = Depends(get_db)):
    _set_config(db, "notifications", config); return {"ok": True}


# ═══════════════════════════════════════════════
#  ADVANCED SEO CONFIG
# ═══════════════════════════════════════════════

@router.get("/admin/seo/global")
def get_global_seo(db: Session = Depends(get_db)):
    return _get_config(db, "seo_global", {
        "default_title_suffix": " | TrackCue",
        "default_description": "AI-powered cue point detection for DJs",
        "robots_txt": "User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: /sitemap.xml",
        "google_site_verification": "", "bing_site_verification": "",
        "structured_data": {"@type": "SoftwareApplication", "name": "TrackCue"},
        "open_graph": {"type": "website", "image": "", "locale": "fr_FR"},
    })

@router.put("/admin/seo/global")
def update_global_seo(config: Dict[str, Any], db: Session = Depends(get_db)):
    _set_config(db, "seo_global", config); return {"ok": True}


# ═══════════════════════════════════════════════
#  LEGAL / COMPLIANCE
# ═══════════════════════════════════════════════

@router.get("/admin/legal/config")
def get_legal_config(db: Session = Depends(get_db)):
    return _get_config(db, "legal", {
        "cookie_consent": {"enabled": True, "message": "Nous utilisons des cookies...", "accept_text": "Accepter", "reject_text": "Refuser"},
        "terms_url": "/terms", "privacy_url": "/privacy",
        "gdpr": {"enabled": True, "data_export": True, "data_deletion": True, "consent_log": True},
        "age_verification": {"enabled": False, "min_age": 13},
    })

@router.put("/admin/legal/config")
def update_legal_config(config: Dict[str, Any], db: Session = Depends(get_db)):
    _set_config(db, "legal", config); return {"ok": True}


# ═══════════════════════════════════════════════
#  INTEGRATIONS
# ═══════════════════════════════════════════════

@router.get("/admin/integrations")
def list_integrations(db: Session = Depends(get_db)):
    return _get_config(db, "integrations", {
        "stripe": {"connected": False, "publishable_key": "", "secret_key": "", "webhook_secret": ""},
        "google_analytics": {"enabled": False, "tracking_id": ""},
        "intercom": {"enabled": False, "app_id": ""},
        "crisp": {"enabled": False, "website_id": ""},
        "mixpanel": {"enabled": False, "token": ""},
        "sentry": {"enabled": False, "dsn": ""},
        "cloudflare": {"enabled": False, "zone_id": "", "api_token": ""},
        "s3": {"enabled": False, "bucket": "", "region": "", "access_key": "", "secret_key": ""},
    })

@router.put("/admin/integrations")
def update_integrations(config: Dict[str, Any], db: Session = Depends(get_db)):
    _set_config(db, "integrations", config); return {"ok": True}

@router.put("/admin/integrations/{provider}")
def update_single_integration(provider: str, config: Dict[str, Any], db: Session = Depends(get_db)):
    all_cfg = _get_config(db, "integrations", {})
    all_cfg[provider] = config
    _set_config(db, "integrations", all_cfg); return {"ok": True}
