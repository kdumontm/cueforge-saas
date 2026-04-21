"""
Admin – RBAC Permissions, Audit Trail, Multi-langue i18n
"""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, Text, Boolean, Float, DateTime, JSON, ForeignKey, func
from datetime import datetime
import json

from app.database import get_db, Base
from app.middleware.admin import require_admin

router = APIRouter()

# ── Models ────────────────────────────────────────────
class Role(Base):
    __tablename__ = "admin_roles"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    display_name = Column(String(200), default="")
    description = Column(Text, default="")
    permissions = Column(JSON, default=list)  # ["users.read", "users.write", "tracks.delete", ...]
    is_system = Column(Boolean, default=False)  # built-in roles can't be deleted
    user_count = Column(Integer, default=0)
    color = Column(String(20), default="#6366f1")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class UserRole(Base):
    __tablename__ = "admin_user_roles"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False)
    role_id = Column(Integer, ForeignKey("admin_roles.id"))
    assigned_by = Column(Integer, nullable=True)
    assigned_at = Column(DateTime, default=datetime.utcnow)

class AuditLog(Base):
    __tablename__ = "admin_audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True)
    user_email = Column(String(200), default="")
    action = Column(String(100), nullable=False)  # create, update, delete, login, export, etc.
    resource_type = Column(String(100), default="")  # user, track, setting, role, etc.
    resource_id = Column(String(100), default="")
    details = Column(JSON, default=dict)  # {field: {old, new}} for changes
    ip_address = Column(String(50), default="")
    user_agent = Column(String(500), default="")
    severity = Column(String(20), default="info")  # info, warning, critical
    created_at = Column(DateTime, default=datetime.utcnow)

class Translation(Base):
    __tablename__ = "admin_translations"
    id = Column(Integer, primary_key=True, index=True)
    locale = Column(String(10), nullable=False)  # fr, en, es, de, ...
    namespace = Column(String(100), default="common")  # common, admin, auth, tracks, ...
    key = Column(String(500), nullable=False)
    value = Column(Text, default="")
    is_reviewed = Column(Boolean, default=False)
    updated_by = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Locale(Base):
    __tablename__ = "admin_locales"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(10), unique=True, nullable=False)
    name = Column(String(100), nullable=False)
    native_name = Column(String(100), default="")
    is_default = Column(Boolean, default=False)
    is_enabled = Column(Boolean, default=True)
    direction = Column(String(5), default="ltr")  # ltr, rtl
    completion_percentage = Column(Float, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

# ── Serializers ───────────────────────────────────────
def _ser_role(r):
    return {
        "id": r.id, "name": r.name, "display_name": r.display_name, "description": r.description,
        "permissions": r.permissions or [], "is_system": r.is_system, "user_count": r.user_count,
        "color": r.color, "created_at": r.created_at.isoformat() if r.created_at else None,
    }

def _ser_audit(a):
    return {
        "id": a.id, "user_id": a.user_id, "user_email": a.user_email, "action": a.action,
        "resource_type": a.resource_type, "resource_id": a.resource_id, "details": a.details or {},
        "ip_address": a.ip_address, "severity": a.severity,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }

def _ser_translation(t):
    return {
        "id": t.id, "locale": t.locale, "namespace": t.namespace, "key": t.key,
        "value": t.value, "is_reviewed": t.is_reviewed,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }

def _ser_locale(l):
    return {
        "id": l.id, "code": l.code, "name": l.name, "native_name": l.native_name,
        "is_default": l.is_default, "is_enabled": l.is_enabled, "direction": l.direction,
        "completion_percentage": l.completion_percentage,
    }

# ═══════════════════════════════════════════════════════
# RBAC – ROLES
# ═══════════════════════════════════════════════════════
@router.get("/admin/roles")
def list_roles(skip: int = 0, limit: int = 50, db: Session = Depends(get_db), _=Depends(require_admin)):
    q = db.query(Role)
    total = q.count()
    items = q.order_by(Role.name).offset(skip).limit(limit).all()
    return {"total": total, "items": [_ser_role(r) for r in items]}

@router.post("/admin/roles")
def create_role(data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    role = Role(
        name=data.get("name", ""), display_name=data.get("display_name", ""),
        description=data.get("description", ""), permissions=data.get("permissions", []),
        color=data.get("color", "#6366f1"),
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    return _ser_role(role)

@router.get("/admin/roles/{role_id}")
def get_role(role_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(404, "Rôle non trouvé")
    return _ser_role(role)

@router.put("/admin/roles/{role_id}")
def update_role(role_id: int, data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(404)
    if role.is_system and "name" in data:
        raise HTTPException(400, "Impossible de renommer un rôle système")
    for k in ["name", "display_name", "description", "permissions", "color"]:
        if k in data:
            setattr(role, k, data[k])
    db.commit()
    db.refresh(role)
    return _ser_role(role)

@router.delete("/admin/roles/{role_id}")
def delete_role(role_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(404)
    if role.is_system:
        raise HTTPException(400, "Impossible de supprimer un rôle système")
    db.query(UserRole).filter(UserRole.role_id == role_id).delete()
    db.delete(role)
    db.commit()
    return {"ok": True}

@router.get("/admin/roles/{role_id}/users")
def get_role_users(role_id: int, skip: int = 0, limit: int = 50, db: Session = Depends(get_db), _=Depends(require_admin)):
    assignments = db.query(UserRole).filter(UserRole.role_id == role_id).offset(skip).limit(limit).all()
    return {"items": [{"user_id": a.user_id, "assigned_at": a.assigned_at.isoformat() if a.assigned_at else None} for a in assignments]}

@router.post("/admin/roles/{role_id}/users")
def assign_role(role_id: int, data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    user_id = data.get("user_id")
    if not user_id:
        raise HTTPException(400, "user_id requis")
    existing = db.query(UserRole).filter(UserRole.role_id == role_id, UserRole.user_id == user_id).first()
    if existing:
        raise HTTPException(400, "Rôle déjà assigné")
    ur = UserRole(user_id=user_id, role_id=role_id)
    db.add(ur)
    role = db.query(Role).filter(Role.id == role_id).first()
    if role:
        role.user_count = (role.user_count or 0) + 1
    db.commit()
    return {"ok": True}

@router.delete("/admin/roles/{role_id}/users/{user_id}")
def revoke_role(role_id: int, user_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    ur = db.query(UserRole).filter(UserRole.role_id == role_id, UserRole.user_id == user_id).first()
    if not ur:
        raise HTTPException(404)
    db.delete(ur)
    role = db.query(Role).filter(Role.id == role_id).first()
    if role and role.user_count > 0:
        role.user_count -= 1
    db.commit()
    return {"ok": True}

@router.get("/admin/permissions")
def list_permissions(_=Depends(require_admin)):
    """Liste toutes les permissions disponibles groupées par catégorie."""
    return {
        "users": ["users.read", "users.write", "users.delete", "users.export", "users.impersonate"],
        "tracks": ["tracks.read", "tracks.write", "tracks.delete", "tracks.analyze"],
        "playlists": ["playlists.read", "playlists.write", "playlists.delete"],
        "djsets": ["djsets.read", "djsets.write", "djsets.delete"],
        "subscriptions": ["subscriptions.read", "subscriptions.write", "subscriptions.refund"],
        "content": ["content.read", "content.write", "content.publish", "content.delete"],
        "settings": ["settings.read", "settings.write"],
        "security": ["security.read", "security.write", "security.audit"],
        "analytics": ["analytics.read", "analytics.export"],
        "email": ["email.read", "email.send", "email.templates"],
        "billing": ["billing.read", "billing.write", "billing.refund"],
        "api": ["api.keys.manage", "api.webhooks.manage"],
        "admin": ["admin.roles.manage", "admin.settings", "admin.backups", "admin.super"],
    }

# ═══════════════════════════════════════════════════════
# AUDIT TRAIL
# ═══════════════════════════════════════════════════════
@router.get("/admin/audit-logs")
def list_audit_logs(
    action: str = None, resource_type: str = None, user_id: int = None,
    severity: str = None, search: str = None,
    date_from: str = None, date_to: str = None,
    skip: int = 0, limit: int = 50,
    db: Session = Depends(get_db), _=Depends(require_admin)
):
    q = db.query(AuditLog)
    if action:
        q = q.filter(AuditLog.action == action)
    if resource_type:
        q = q.filter(AuditLog.resource_type == resource_type)
    if user_id:
        q = q.filter(AuditLog.user_id == user_id)
    if severity:
        q = q.filter(AuditLog.severity == severity)
    if search:
        q = q.filter(AuditLog.user_email.ilike(f"%{search}%"))
    if date_from:
        q = q.filter(AuditLog.created_at >= date_from)
    if date_to:
        q = q.filter(AuditLog.created_at <= date_to)
    total = q.count()
    items = q.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit).all()
    return {"total": total, "items": [_ser_audit(a) for a in items]}

@router.get("/admin/audit-logs/{log_id}")
def get_audit_log(log_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    log = db.query(AuditLog).filter(AuditLog.id == log_id).first()
    if not log:
        raise HTTPException(404)
    return _ser_audit(log)

@router.get("/admin/audit-logs/stats/overview")
def audit_stats(db: Session = Depends(get_db), _=Depends(require_admin)):
    total = db.query(AuditLog).count()
    today = datetime.utcnow().replace(hour=0, minute=0, second=0)
    today_count = db.query(AuditLog).filter(AuditLog.created_at >= today).count()
    critical = db.query(AuditLog).filter(AuditLog.severity == "critical").count()
    by_action = db.query(AuditLog.action, func.count()).group_by(AuditLog.action).all()
    return {
        "total": total, "today": today_count, "critical": critical,
        "by_action": {a: c for a, c in by_action},
    }

@router.get("/admin/audit-logs/actions")
def audit_actions(_=Depends(require_admin)):
    return ["create", "update", "delete", "login", "logout", "export", "import", "role_assign", "role_revoke", "settings_change", "backup", "restore", "impersonate"]

@router.get("/admin/audit-logs/resource-types")
def audit_resource_types(_=Depends(require_admin)):
    return ["user", "track", "playlist", "djset", "subscription", "page", "setting", "role", "email_template", "workflow", "backup", "api_key", "webhook"]

@router.delete("/admin/audit-logs/cleanup")
def cleanup_audit_logs(days: int = 90, db: Session = Depends(get_db), _=Depends(require_admin)):
    cutoff = datetime.utcnow() - __import__("datetime").timedelta(days=days)
    count = db.query(AuditLog).filter(AuditLog.created_at < cutoff).delete()
    db.commit()
    return {"deleted": count}

@router.get("/admin/audit-logs/export")
def export_audit_logs(
    date_from: str = None, date_to: str = None, format: str = "json",
    db: Session = Depends(get_db), _=Depends(require_admin)
):
    q = db.query(AuditLog)
    if date_from:
        q = q.filter(AuditLog.created_at >= date_from)
    if date_to:
        q = q.filter(AuditLog.created_at <= date_to)
    logs = q.order_by(AuditLog.created_at.desc()).limit(10000).all()
    return {"format": format, "count": len(logs), "data": [_ser_audit(a) for a in logs]}

# ═══════════════════════════════════════════════════════
# I18N – LOCALES
# ═══════════════════════════════════════════════════════
@router.get("/admin/locales")
def list_locales(db: Session = Depends(get_db), _=Depends(require_admin)):
    locales = db.query(Locale).order_by(Locale.is_default.desc(), Locale.name).all()
    return {"items": [_ser_locale(l) for l in locales]}

@router.post("/admin/locales")
def create_locale(data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    loc = Locale(
        code=data.get("code", ""), name=data.get("name", ""),
        native_name=data.get("native_name", ""), direction=data.get("direction", "ltr"),
    )
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return _ser_locale(loc)

@router.put("/admin/locales/{locale_id}")
def update_locale(locale_id: int, data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    loc = db.query(Locale).filter(Locale.id == locale_id).first()
    if not loc:
        raise HTTPException(404)
    for k in ["name", "native_name", "is_enabled", "direction"]:
        if k in data:
            setattr(loc, k, data[k])
    db.commit()
    db.refresh(loc)
    return _ser_locale(loc)

@router.delete("/admin/locales/{locale_id}")
def delete_locale(locale_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    loc = db.query(Locale).filter(Locale.id == locale_id).first()
    if not loc:
        raise HTTPException(404)
    if loc.is_default:
        raise HTTPException(400, "Impossible de supprimer la locale par défaut")
    db.query(Translation).filter(Translation.locale == loc.code).delete()
    db.delete(loc)
    db.commit()
    return {"ok": True}

@router.post("/admin/locales/{locale_id}/set-default")
def set_default_locale(locale_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    db.query(Locale).update({Locale.is_default: False})
    loc = db.query(Locale).filter(Locale.id == locale_id).first()
    if not loc:
        raise HTTPException(404)
    loc.is_default = True
    db.commit()
    return _ser_locale(loc)

# ═══════════════════════════════════════════════════════
# I18N – TRANSLATIONS
# ═══════════════════════════════════════════════════════
@router.get("/admin/translations")
def list_translations(
    locale: str = None, namespace: str = None, search: str = None,
    is_reviewed: bool = None, skip: int = 0, limit: int = 100,
    db: Session = Depends(get_db), _=Depends(require_admin)
):
    q = db.query(Translation)
    if locale:
        q = q.filter(Translation.locale == locale)
    if namespace:
        q = q.filter(Translation.namespace == namespace)
    if search:
        q = q.filter((Translation.key.ilike(f"%{search}%")) | (Translation.value.ilike(f"%{search}%")))
    if is_reviewed is not None:
        q = q.filter(Translation.is_reviewed == is_reviewed)
    total = q.count()
    items = q.order_by(Translation.namespace, Translation.key).offset(skip).limit(limit).all()
    return {"total": total, "items": [_ser_translation(t) for t in items]}

@router.post("/admin/translations")
def create_translation(data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    t = Translation(
        locale=data.get("locale", "fr"), namespace=data.get("namespace", "common"),
        key=data.get("key", ""), value=data.get("value", ""),
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _ser_translation(t)

@router.put("/admin/translations/{translation_id}")
def update_translation(translation_id: int, data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    t = db.query(Translation).filter(Translation.id == translation_id).first()
    if not t:
        raise HTTPException(404)
    for k in ["value", "is_reviewed"]:
        if k in data:
            setattr(t, k, data[k])
    db.commit()
    db.refresh(t)
    return _ser_translation(t)

@router.delete("/admin/translations/{translation_id}")
def delete_translation(translation_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    t = db.query(Translation).filter(Translation.id == translation_id).first()
    if not t:
        raise HTTPException(404)
    db.delete(t)
    db.commit()
    return {"ok": True}

@router.post("/admin/translations/bulk")
def bulk_update_translations(data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    """data = {translations: [{locale, namespace, key, value}]}"""
    items = data.get("translations", [])
    updated = 0
    for item in items:
        existing = db.query(Translation).filter(
            Translation.locale == item.get("locale"),
            Translation.namespace == item.get("namespace", "common"),
            Translation.key == item.get("key"),
        ).first()
        if existing:
            existing.value = item.get("value", "")
        else:
            db.add(Translation(
                locale=item.get("locale"), namespace=item.get("namespace", "common"),
                key=item.get("key", ""), value=item.get("value", ""),
            ))
        updated += 1
    db.commit()
    return {"updated": updated}

@router.get("/admin/translations/export/{locale}")
def export_translations(locale: str, namespace: str = None, db: Session = Depends(get_db), _=Depends(require_admin)):
    q = db.query(Translation).filter(Translation.locale == locale)
    if namespace:
        q = q.filter(Translation.namespace == namespace)
    translations = q.all()
    result = {}
    for t in translations:
        ns = t.namespace or "common"
        if ns not in result:
            result[ns] = {}
        result[ns][t.key] = t.value
    return result

@router.post("/admin/translations/import")
def import_translations(data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    """data = {locale, namespace, translations: {key: value}}"""
    locale = data.get("locale", "fr")
    namespace = data.get("namespace", "common")
    translations = data.get("translations", {})
    imported = 0
    for key, value in translations.items():
        existing = db.query(Translation).filter(
            Translation.locale == locale, Translation.namespace == namespace, Translation.key == key
        ).first()
        if existing:
            existing.value = value
        else:
            db.add(Translation(locale=locale, namespace=namespace, key=key, value=value))
        imported += 1
    db.commit()
    return {"imported": imported}

@router.get("/admin/translations/namespaces")
def translation_namespaces(db: Session = Depends(get_db), _=Depends(require_admin)):
    ns = db.query(Translation.namespace).distinct().all()
    return [n[0] for n in ns] if ns else ["common", "admin", "auth", "tracks", "playlists", "djsets", "settings", "email"]

@router.get("/admin/translations/stats")
def translation_stats(db: Session = Depends(get_db), _=Depends(require_admin)):
    locales = db.query(Locale).all()
    default_locale = next((l for l in locales if l.is_default), None)
    default_code = default_locale.code if default_locale else "fr"
    default_count = db.query(Translation).filter(Translation.locale == default_code).count()
    stats = []
    for loc in locales:
        count = db.query(Translation).filter(Translation.locale == loc.code).count()
        reviewed = db.query(Translation).filter(Translation.locale == loc.code, Translation.is_reviewed == True).count()
        stats.append({
            "locale": loc.code, "name": loc.name, "total": count,
            "reviewed": reviewed, "completion": round(count / max(default_count, 1) * 100, 1),
        })
    return {"default_locale": default_code, "default_count": default_count, "locales": stats}
