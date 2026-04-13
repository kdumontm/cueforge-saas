"""
Admin Segments, Formulaires, Changelog & Status Page.

~50 endpoints:
  /admin/segments/*      → Segments utilisateurs & cohortes
  /admin/forms/*         → Builder formulaires, NPS, churn survey
  /admin/changelog/*     → Changelog public
  /admin/status-page/*   → Page de statut des services
"""
import json
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, Float, ForeignKey, func, or_
from sqlalchemy.orm import Session

from app.database import get_db, Base
from app.middleware.admin import require_admin
from app.models.user import User

router = APIRouter(dependencies=[Depends(require_admin)])


# ═══════════════════════════════════════════════
#  MODÈLES
# ═══════════════════════════════════════════════

class UserSegment(Base):
    __tablename__ = "user_segments"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    rules_json = Column(Text, default="[]")  # [{field, operator, value}]
    color = Column(String(20), default="#6366f1")
    user_count = Column(Integer, default=0)
    is_dynamic = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SegmentMember(Base):
    __tablename__ = "segment_members"
    id = Column(Integer, primary_key=True, index=True)
    segment_id = Column(Integer, ForeignKey("user_segments.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    added_at = Column(DateTime, default=datetime.utcnow)


class FormDefinition(Base):
    __tablename__ = "form_definitions"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    slug = Column(String(200), unique=True, index=True)
    form_type = Column(String(50), default="survey")  # survey, nps, churn, feedback, contact
    fields_json = Column(Text, default="[]")  # [{type, label, name, required, options}]
    settings_json = Column(Text, default="{}")  # {submit_text, redirect_url, notify_email}
    is_active = Column(Boolean, default=True)
    responses_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class FormResponse(Base):
    __tablename__ = "form_responses"
    id = Column(Integer, primary_key=True, index=True)
    form_id = Column(Integer, ForeignKey("form_definitions.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, nullable=True)
    data_json = Column(Text, nullable=False, default="{}")
    submitted_at = Column(DateTime, default=datetime.utcnow)
    ip_address = Column(String(50), nullable=True)


class ChangelogEntry(Base):
    __tablename__ = "changelog_entries"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(300), nullable=False)
    content = Column(Text, nullable=False)
    version = Column(String(50), nullable=True)
    category = Column(String(50), default="feature")  # feature, improvement, bugfix, breaking
    is_published = Column(Boolean, default=False)
    published_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StatusService(Base):
    __tablename__ = "status_services"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(String(500), nullable=True)
    status = Column(String(50), default="operational")  # operational, degraded, partial_outage, major_outage, maintenance
    url_check = Column(String(500), nullable=True)
    sort_order = Column(Integer, default=0)
    is_visible = Column(Boolean, default=True)
    last_checked = Column(DateTime, nullable=True)
    uptime_percent = Column(Float, default=100.0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StatusIncident(Base):
    __tablename__ = "status_incidents"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(300), nullable=False)
    description = Column(Text, nullable=True)
    severity = Column(String(50), default="minor")  # minor, major, critical
    status = Column(String(50), default="investigating")  # investigating, identified, monitoring, resolved
    affected_services = Column(Text, default="[]")
    updates_json = Column(Text, default="[]")  # [{timestamp, message, status}]
    started_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# ═══════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════

def _ser_segment(s: UserSegment) -> dict:
    return {"id": s.id, "name": s.name, "description": s.description, "rules": json.loads(s.rules_json or "[]"),
            "color": s.color, "user_count": s.user_count, "is_dynamic": s.is_dynamic,
            "created_at": s.created_at.isoformat() if s.created_at else None, "updated_at": s.updated_at.isoformat() if s.updated_at else None}

def _ser_form(f: FormDefinition) -> dict:
    return {"id": f.id, "name": f.name, "slug": f.slug, "form_type": f.form_type,
            "fields": json.loads(f.fields_json or "[]"), "settings": json.loads(f.settings_json or "{}"),
            "is_active": f.is_active, "responses_count": f.responses_count,
            "created_at": f.created_at.isoformat() if f.created_at else None}

def _ser_response(r: FormResponse) -> dict:
    return {"id": r.id, "form_id": r.form_id, "user_id": r.user_id,
            "data": json.loads(r.data_json or "{}"), "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None}

def _ser_changelog(c: ChangelogEntry) -> dict:
    return {"id": c.id, "title": c.title, "content": c.content, "version": c.version,
            "category": c.category, "is_published": c.is_published,
            "published_at": c.published_at.isoformat() if c.published_at else None,
            "created_at": c.created_at.isoformat() if c.created_at else None}

def _ser_service(s: StatusService) -> dict:
    return {"id": s.id, "name": s.name, "description": s.description, "status": s.status,
            "url_check": s.url_check, "sort_order": s.sort_order, "is_visible": s.is_visible,
            "uptime_percent": s.uptime_percent, "last_checked": s.last_checked.isoformat() if s.last_checked else None}

def _ser_incident(i: StatusIncident) -> dict:
    return {"id": i.id, "title": i.title, "description": i.description, "severity": i.severity,
            "status": i.status, "affected_services": json.loads(i.affected_services or "[]"),
            "updates": json.loads(i.updates_json or "[]"),
            "started_at": i.started_at.isoformat() if i.started_at else None,
            "resolved_at": i.resolved_at.isoformat() if i.resolved_at else None}


# ═══════════════════════════════════════════════
#  SEGMENTS
# ═══════════════════════════════════════════════

class SegmentCreate(BaseModel):
    name: str; description: Optional[str] = None; rules: List[Dict[str, Any]] = []; color: str = "#6366f1"; is_dynamic: bool = True

class SegmentUpdate(BaseModel):
    name: Optional[str] = None; description: Optional[str] = None; rules: Optional[List[Dict[str, Any]]] = None; color: Optional[str] = None

@router.get("/admin/segments")
def list_segments(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    q = db.query(UserSegment); total = q.count()
    items = q.order_by(UserSegment.name).offset(skip).limit(limit).all()
    return {"total": total, "items": [_ser_segment(s) for s in items]}

@router.post("/admin/segments")
def create_segment(body: SegmentCreate, db: Session = Depends(get_db)):
    s = UserSegment(name=body.name, description=body.description, rules_json=json.dumps(body.rules), color=body.color, is_dynamic=body.is_dynamic)
    db.add(s); db.commit(); db.refresh(s); return _ser_segment(s)

@router.get("/admin/segments/{seg_id}")
def get_segment(seg_id: int, db: Session = Depends(get_db)):
    s = db.query(UserSegment).get(seg_id)
    if not s: raise HTTPException(404, "Segment introuvable")
    return _ser_segment(s)

@router.put("/admin/segments/{seg_id}")
def update_segment(seg_id: int, body: SegmentUpdate, db: Session = Depends(get_db)):
    s = db.query(UserSegment).get(seg_id)
    if not s: raise HTTPException(404, "Segment introuvable")
    for f, v in body.dict(exclude_unset=True).items():
        if f == "rules": s.rules_json = json.dumps(v)
        else: setattr(s, f, v)
    db.commit(); db.refresh(s); return _ser_segment(s)

@router.delete("/admin/segments/{seg_id}")
def delete_segment(seg_id: int, db: Session = Depends(get_db)):
    s = db.query(UserSegment).get(seg_id)
    if not s: raise HTTPException(404, "Segment introuvable")
    db.query(SegmentMember).filter(SegmentMember.segment_id == seg_id).delete()
    db.delete(s); db.commit(); return {"ok": True}

@router.post("/admin/segments/{seg_id}/refresh")
def refresh_segment(seg_id: int, db: Session = Depends(get_db)):
    s = db.query(UserSegment).get(seg_id)
    if not s: raise HTTPException(404, "Segment introuvable")
    rules = json.loads(s.rules_json or "[]")
    q = db.query(User)
    for rule in rules:
        field = rule.get("field", ""); op = rule.get("operator", "eq"); val = rule.get("value", "")
        if hasattr(User, field):
            col = getattr(User, field)
            if op == "eq": q = q.filter(col == val)
            elif op == "neq": q = q.filter(col != val)
            elif op == "contains": q = q.filter(col.ilike(f"%{val}%"))
            elif op == "gt": q = q.filter(col > val)
            elif op == "lt": q = q.filter(col < val)
    users = q.all()
    db.query(SegmentMember).filter(SegmentMember.segment_id == seg_id).delete()
    for u in users:
        db.add(SegmentMember(segment_id=seg_id, user_id=u.id))
    s.user_count = len(users)
    db.commit(); return {"ok": True, "user_count": len(users)}

@router.get("/admin/segments/{seg_id}/members")
def segment_members(seg_id: int, skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    members = db.query(SegmentMember).filter(SegmentMember.segment_id == seg_id).offset(skip).limit(limit).all()
    result = []
    for m in members:
        u = db.query(User).get(m.user_id)
        if u: result.append({"user_id": u.id, "email": u.email, "dj_name": getattr(u, "dj_name", None), "added_at": m.added_at.isoformat() if m.added_at else None})
    return {"items": result}

@router.post("/admin/segments/{seg_id}/add-user")
def add_user_to_segment(seg_id: int, user_id: int, db: Session = Depends(get_db)):
    existing = db.query(SegmentMember).filter(SegmentMember.segment_id == seg_id, SegmentMember.user_id == user_id).first()
    if existing: raise HTTPException(400, "Utilisateur déjà dans le segment")
    db.add(SegmentMember(segment_id=seg_id, user_id=user_id))
    seg = db.query(UserSegment).get(seg_id)
    if seg: seg.user_count = (seg.user_count or 0) + 1
    db.commit(); return {"ok": True}

@router.get("/admin/segments/operators")
def segment_operators():
    return {"operators": [
        {"id": "eq", "label": "Égal à"}, {"id": "neq", "label": "Différent de"},
        {"id": "contains", "label": "Contient"}, {"id": "gt", "label": "Supérieur à"},
        {"id": "lt", "label": "Inférieur à"}, {"id": "is_null", "label": "Est vide"},
        {"id": "is_not_null", "label": "N'est pas vide"},
    ]}

@router.get("/admin/segments/available-fields")
def segment_fields():
    return {"fields": ["email", "plan", "status", "created_at", "last_login", "dj_name", "country", "is_verified", "track_count"]}


# ═══════════════════════════════════════════════
#  FORMULAIRES
# ═══════════════════════════════════════════════

class FormCreate(BaseModel):
    name: str; slug: Optional[str] = None; form_type: str = "survey"
    fields: List[Dict[str, Any]] = []; settings: Dict[str, Any] = {}

class FormUpdate(BaseModel):
    name: Optional[str] = None; fields: Optional[List[Dict[str, Any]]] = None
    settings: Optional[Dict[str, Any]] = None; is_active: Optional[bool] = None

@router.get("/admin/forms")
def list_forms(skip: int = 0, limit: int = 50, form_type: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(FormDefinition)
    if form_type: q = q.filter(FormDefinition.form_type == form_type)
    total = q.count(); items = q.order_by(FormDefinition.created_at.desc()).offset(skip).limit(limit).all()
    return {"total": total, "items": [_ser_form(f) for f in items]}

@router.post("/admin/forms")
def create_form(body: FormCreate, db: Session = Depends(get_db)):
    slug = body.slug or body.name.lower().replace(" ", "-").replace("'", "")
    if db.query(FormDefinition).filter(FormDefinition.slug == slug).first(): raise HTTPException(400, "Slug déjà utilisé")
    f = FormDefinition(name=body.name, slug=slug, form_type=body.form_type, fields_json=json.dumps(body.fields), settings_json=json.dumps(body.settings))
    db.add(f); db.commit(); db.refresh(f); return _ser_form(f)

@router.get("/admin/forms/{form_id}")
def get_form(form_id: int, db: Session = Depends(get_db)):
    f = db.query(FormDefinition).get(form_id)
    if not f: raise HTTPException(404, "Formulaire introuvable")
    return _ser_form(f)

@router.put("/admin/forms/{form_id}")
def update_form(form_id: int, body: FormUpdate, db: Session = Depends(get_db)):
    f = db.query(FormDefinition).get(form_id)
    if not f: raise HTTPException(404, "Formulaire introuvable")
    for k, v in body.dict(exclude_unset=True).items():
        if k == "fields": f.fields_json = json.dumps(v)
        elif k == "settings": f.settings_json = json.dumps(v)
        else: setattr(f, k, v)
    db.commit(); db.refresh(f); return _ser_form(f)

@router.delete("/admin/forms/{form_id}")
def delete_form(form_id: int, db: Session = Depends(get_db)):
    f = db.query(FormDefinition).get(form_id)
    if not f: raise HTTPException(404, "Formulaire introuvable")
    db.query(FormResponse).filter(FormResponse.form_id == form_id).delete()
    db.delete(f); db.commit(); return {"ok": True}

@router.post("/admin/forms/{form_id}/duplicate")
def duplicate_form(form_id: int, db: Session = Depends(get_db)):
    f = db.query(FormDefinition).get(form_id)
    if not f: raise HTTPException(404, "Formulaire introuvable")
    dup = FormDefinition(name=f"{f.name} (copie)", slug=f"{f.slug}-copy-{uuid.uuid4().hex[:6]}", form_type=f.form_type, fields_json=f.fields_json, settings_json=f.settings_json)
    db.add(dup); db.commit(); db.refresh(dup); return _ser_form(dup)

@router.get("/admin/forms/{form_id}/responses")
def list_form_responses(form_id: int, skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    q = db.query(FormResponse).filter(FormResponse.form_id == form_id)
    total = q.count(); items = q.order_by(FormResponse.submitted_at.desc()).offset(skip).limit(limit).all()
    return {"total": total, "items": [_ser_response(r) for r in items]}

@router.get("/admin/forms/{form_id}/stats")
def form_stats(form_id: int, db: Session = Depends(get_db)):
    f = db.query(FormDefinition).get(form_id)
    if not f: raise HTTPException(404)
    total = db.query(func.count(FormResponse.id)).filter(FormResponse.form_id == form_id).scalar() or 0
    last_7d = db.query(func.count(FormResponse.id)).filter(FormResponse.form_id == form_id, FormResponse.submitted_at >= datetime.utcnow() - timedelta(days=7)).scalar() or 0
    if f.form_type == "nps":
        responses = db.query(FormResponse).filter(FormResponse.form_id == form_id).all()
        scores = [json.loads(r.data_json or "{}").get("score", 0) for r in responses]
        promoters = len([s for s in scores if s >= 9])
        detractors = len([s for s in scores if s <= 6])
        nps = round((promoters - detractors) / max(len(scores), 1) * 100) if scores else 0
        return {"total": total, "last_7d": last_7d, "nps_score": nps, "promoters": promoters, "detractors": detractors}
    return {"total": total, "last_7d": last_7d}

@router.get("/admin/forms/field-types")
def form_field_types():
    return {"types": [
        {"id": "text", "label": "Texte court"}, {"id": "textarea", "label": "Texte long"},
        {"id": "email", "label": "Email"}, {"id": "number", "label": "Nombre"},
        {"id": "select", "label": "Liste déroulante"}, {"id": "radio", "label": "Choix unique"},
        {"id": "checkbox", "label": "Cases à cocher"}, {"id": "rating", "label": "Note (1-5)"},
        {"id": "nps", "label": "NPS (0-10)"}, {"id": "date", "label": "Date"},
    ]}


# ═══════════════════════════════════════════════
#  CHANGELOG
# ═══════════════════════════════════════════════

class ChangelogCreate(BaseModel):
    title: str; content: str; version: Optional[str] = None; category: str = "feature"

class ChangelogUpdate(BaseModel):
    title: Optional[str] = None; content: Optional[str] = None; version: Optional[str] = None
    category: Optional[str] = None; is_published: Optional[bool] = None

@router.get("/admin/changelog")
def list_changelog(skip: int = 0, limit: int = 50, category: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(ChangelogEntry)
    if category: q = q.filter(ChangelogEntry.category == category)
    total = q.count(); items = q.order_by(ChangelogEntry.created_at.desc()).offset(skip).limit(limit).all()
    return {"total": total, "items": [_ser_changelog(c) for c in items]}

@router.post("/admin/changelog")
def create_changelog(body: ChangelogCreate, db: Session = Depends(get_db)):
    c = ChangelogEntry(title=body.title, content=body.content, version=body.version, category=body.category)
    db.add(c); db.commit(); db.refresh(c); return _ser_changelog(c)

@router.get("/admin/changelog/{entry_id}")
def get_changelog(entry_id: int, db: Session = Depends(get_db)):
    c = db.query(ChangelogEntry).get(entry_id)
    if not c: raise HTTPException(404, "Entrée introuvable")
    return _ser_changelog(c)

@router.put("/admin/changelog/{entry_id}")
def update_changelog(entry_id: int, body: ChangelogUpdate, db: Session = Depends(get_db)):
    c = db.query(ChangelogEntry).get(entry_id)
    if not c: raise HTTPException(404, "Entrée introuvable")
    for f, v in body.dict(exclude_unset=True).items():
        setattr(c, f, v)
    if body.is_published and not c.published_at: c.published_at = datetime.utcnow()
    db.commit(); db.refresh(c); return _ser_changelog(c)

@router.delete("/admin/changelog/{entry_id}")
def delete_changelog(entry_id: int, db: Session = Depends(get_db)):
    c = db.query(ChangelogEntry).get(entry_id)
    if not c: raise HTTPException(404); db.delete(c); db.commit(); return {"ok": True}

@router.post("/admin/changelog/{entry_id}/publish")
def publish_changelog(entry_id: int, db: Session = Depends(get_db)):
    c = db.query(ChangelogEntry).get(entry_id)
    if not c: raise HTTPException(404)
    c.is_published = True; c.published_at = datetime.utcnow()
    db.commit(); return {"ok": True}


# ═══════════════════════════════════════════════
#  STATUS PAGE
# ═══════════════════════════════════════════════

class ServiceCreate(BaseModel):
    name: str; description: Optional[str] = None; url_check: Optional[str] = None; sort_order: int = 0

class ServiceUpdate(BaseModel):
    name: Optional[str] = None; description: Optional[str] = None; status: Optional[str] = None
    url_check: Optional[str] = None; sort_order: Optional[int] = None; is_visible: Optional[bool] = None

@router.get("/admin/status-page/services")
def list_status_services(db: Session = Depends(get_db)):
    items = db.query(StatusService).order_by(StatusService.sort_order).all()
    return {"items": [_ser_service(s) for s in items]}

@router.post("/admin/status-page/services")
def create_status_service(body: ServiceCreate, db: Session = Depends(get_db)):
    s = StatusService(name=body.name, description=body.description, url_check=body.url_check, sort_order=body.sort_order)
    db.add(s); db.commit(); db.refresh(s); return _ser_service(s)

@router.put("/admin/status-page/services/{svc_id}")
def update_status_service(svc_id: int, body: ServiceUpdate, db: Session = Depends(get_db)):
    s = db.query(StatusService).get(svc_id)
    if not s: raise HTTPException(404)
    for f, v in body.dict(exclude_unset=True).items(): setattr(s, f, v)
    db.commit(); db.refresh(s); return _ser_service(s)

@router.delete("/admin/status-page/services/{svc_id}")
def delete_status_service(svc_id: int, db: Session = Depends(get_db)):
    s = db.query(StatusService).get(svc_id)
    if not s: raise HTTPException(404); db.delete(s); db.commit(); return {"ok": True}

@router.get("/admin/status-page/overview")
def status_overview(db: Session = Depends(get_db)):
    services = db.query(StatusService).filter(StatusService.is_visible == True).order_by(StatusService.sort_order).all()
    incidents = db.query(StatusIncident).filter(StatusIncident.status != "resolved").order_by(StatusIncident.created_at.desc()).all()
    all_ok = all(s.status == "operational" for s in services)
    return {"overall": "operational" if all_ok else "degraded", "services": [_ser_service(s) for s in services], "active_incidents": [_ser_incident(i) for i in incidents]}

class IncidentCreate(BaseModel):
    title: str; description: Optional[str] = None; severity: str = "minor"; affected_services: List[int] = []

class IncidentUpdate(BaseModel):
    title: Optional[str] = None; description: Optional[str] = None; severity: Optional[str] = None; status: Optional[str] = None

@router.get("/admin/status-page/incidents")
def list_incidents(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    q = db.query(StatusIncident); total = q.count()
    items = q.order_by(StatusIncident.created_at.desc()).offset(skip).limit(limit).all()
    return {"total": total, "items": [_ser_incident(i) for i in items]}

@router.post("/admin/status-page/incidents")
def create_incident(body: IncidentCreate, db: Session = Depends(get_db)):
    i = StatusIncident(title=body.title, description=body.description, severity=body.severity, affected_services=json.dumps(body.affected_services))
    db.add(i); db.commit(); db.refresh(i)
    for svc_id in body.affected_services:
        svc = db.query(StatusService).get(svc_id)
        if svc: svc.status = "degraded" if body.severity == "minor" else "major_outage"
    db.commit(); return _ser_incident(i)

@router.put("/admin/status-page/incidents/{inc_id}")
def update_incident(inc_id: int, body: IncidentUpdate, db: Session = Depends(get_db)):
    i = db.query(StatusIncident).get(inc_id)
    if not i: raise HTTPException(404)
    for f, v in body.dict(exclude_unset=True).items(): setattr(i, f, v)
    if body.status == "resolved": i.resolved_at = datetime.utcnow()
    db.commit(); db.refresh(i); return _ser_incident(i)

@router.post("/admin/status-page/incidents/{inc_id}/update")
def add_incident_update(inc_id: int, message: str, status: Optional[str] = None, db: Session = Depends(get_db)):
    i = db.query(StatusIncident).get(inc_id)
    if not i: raise HTTPException(404)
    updates = json.loads(i.updates_json or "[]")
    updates.append({"timestamp": datetime.utcnow().isoformat(), "message": message, "status": status or i.status})
    i.updates_json = json.dumps(updates)
    if status: i.status = status
    if status == "resolved": i.resolved_at = datetime.utcnow()
    db.commit(); return _ser_incident(i)

@router.delete("/admin/status-page/incidents/{inc_id}")
def delete_incident(inc_id: int, db: Session = Depends(get_db)):
    i = db.query(StatusIncident).get(inc_id)
    if not i: raise HTTPException(404); db.delete(i); db.commit(); return {"ok": True}
