"""
Admin – A/B Testing, Heatmaps, Session Replay, Email Workflows
"""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, Text, Boolean, Float, DateTime, JSON, ForeignKey, func
from datetime import datetime, timedelta
import json, random

from app.database import get_db, Base
from app.middleware.admin import require_admin

router = APIRouter()

# ── Models ────────────────────────────────────────────
class ABTest(Base):
    __tablename__ = "ab_tests"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, default="")
    status = Column(String(50), default="draft")  # draft, running, paused, completed
    test_type = Column(String(50), default="split")  # split, multivariate, bandit
    target_page = Column(String(500), default="")
    target_audience = Column(JSON, default=dict)
    variants = Column(JSON, default=list)  # [{id, name, weight, changes}]
    metrics = Column(JSON, default=list)  # ["conversion", "click", "revenue"]
    traffic_percentage = Column(Integer, default=100)
    min_sample_size = Column(Integer, default=1000)
    confidence_level = Column(Float, default=0.95)
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    winner_variant = Column(String(100), nullable=True)
    results = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ABTestEvent(Base):
    __tablename__ = "ab_test_events"
    id = Column(Integer, primary_key=True, index=True)
    test_id = Column(Integer, ForeignKey("ab_tests.id"))
    variant_id = Column(String(100))
    user_id = Column(Integer, nullable=True)
    session_id = Column(String(200))
    event_type = Column(String(50))  # impression, click, conversion
    # 'metadata' réservé SQLAlchemy Declarative
    extra_metadata = Column("meta", JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)

class HeatmapConfig(Base):
    __tablename__ = "heatmap_configs"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    page_url = Column(String(500), nullable=False)
    heatmap_type = Column(String(50), default="click")  # click, scroll, move, attention
    status = Column(String(50), default="active")
    sample_rate = Column(Float, default=0.1)
    data_retention_days = Column(Integer, default=30)
    filters = Column(JSON, default=dict)
    snapshot_url = Column(String(500), default="")
    total_sessions = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

class HeatmapData(Base):
    __tablename__ = "heatmap_data"
    id = Column(Integer, primary_key=True, index=True)
    config_id = Column(Integer, ForeignKey("heatmap_configs.id"))
    session_id = Column(String(200))
    user_id = Column(Integer, nullable=True)
    device_type = Column(String(50), default="desktop")
    viewport_width = Column(Integer, default=1920)
    viewport_height = Column(Integer, default=1080)
    points = Column(JSON, default=list)  # [{x, y, type, timestamp}]
    scroll_depth = Column(Float, default=0)
    time_on_page = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

class SessionRecording(Base):
    __tablename__ = "session_recordings"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(200), nullable=False)
    user_id = Column(Integer, nullable=True)
    user_email = Column(String(200), default="")
    device_type = Column(String(50), default="desktop")
    browser = Column(String(100), default="")
    os = Column(String(100), default="")
    country = Column(String(100), default="")
    pages_visited = Column(JSON, default=list)
    duration_seconds = Column(Integer, default=0)
    events_count = Column(Integer, default=0)
    has_errors = Column(Boolean, default=False)
    has_rage_clicks = Column(Boolean, default=False)
    has_dead_clicks = Column(Boolean, default=False)
    recording_url = Column(String(500), default="")
    events_data = Column(JSON, default=list)
    tags = Column(JSON, default=list)
    notes = Column(Text, default="")
    starred = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class EmailWorkflow(Base):
    __tablename__ = "email_workflows"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, default="")
    status = Column(String(50), default="draft")  # draft, active, paused, archived
    trigger_type = Column(String(100), default="event")  # event, segment, manual, schedule
    trigger_config = Column(JSON, default=dict)
    nodes = Column(JSON, default=list)  # [{id, type, config, position, connections}]
    stats = Column(JSON, default=dict)
    total_enrolled = Column(Integer, default=0)
    total_completed = Column(Integer, default=0)
    total_converted = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class EmailWorkflowEnrollment(Base):
    __tablename__ = "email_workflow_enrollments"
    id = Column(Integer, primary_key=True, index=True)
    workflow_id = Column(Integer, ForeignKey("email_workflows.id"))
    user_id = Column(Integer, nullable=False)
    current_node_id = Column(String(100), default="")
    status = Column(String(50), default="active")  # active, completed, exited, paused
    entered_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    history = Column(JSON, default=list)  # [{node_id, action, timestamp}]

# ── Serializers ───────────────────────────────────────
def _ser_test(t):
    return {
        "id": t.id, "name": t.name, "description": t.description, "status": t.status,
        "test_type": t.test_type, "target_page": t.target_page, "target_audience": t.target_audience,
        "variants": t.variants or [], "metrics": t.metrics or [], "traffic_percentage": t.traffic_percentage,
        "min_sample_size": t.min_sample_size, "confidence_level": t.confidence_level,
        "start_date": t.start_date.isoformat() if t.start_date else None,
        "end_date": t.end_date.isoformat() if t.end_date else None,
        "winner_variant": t.winner_variant, "results": t.results or {},
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }

def _ser_heatmap(h):
    return {
        "id": h.id, "name": h.name, "page_url": h.page_url, "heatmap_type": h.heatmap_type,
        "status": h.status, "sample_rate": h.sample_rate, "data_retention_days": h.data_retention_days,
        "filters": h.filters or {}, "snapshot_url": h.snapshot_url, "total_sessions": h.total_sessions,
        "created_at": h.created_at.isoformat() if h.created_at else None,
    }

def _ser_recording(r):
    return {
        "id": r.id, "session_id": r.session_id, "user_id": r.user_id, "user_email": r.user_email,
        "device_type": r.device_type, "browser": r.browser, "os": r.os, "country": r.country,
        "pages_visited": r.pages_visited or [], "duration_seconds": r.duration_seconds,
        "events_count": r.events_count, "has_errors": r.has_errors,
        "has_rage_clicks": r.has_rage_clicks, "has_dead_clicks": r.has_dead_clicks,
        "recording_url": r.recording_url, "tags": r.tags or [], "notes": r.notes,
        "starred": r.starred, "created_at": r.created_at.isoformat() if r.created_at else None,
    }

def _ser_workflow(w):
    return {
        "id": w.id, "name": w.name, "description": w.description, "status": w.status,
        "trigger_type": w.trigger_type, "trigger_config": w.trigger_config or {},
        "nodes": w.nodes or [], "stats": w.stats or {},
        "total_enrolled": w.total_enrolled, "total_completed": w.total_completed,
        "total_converted": w.total_converted,
        "created_at": w.created_at.isoformat() if w.created_at else None,
        "updated_at": w.updated_at.isoformat() if w.updated_at else None,
    }

# ═══════════════════════════════════════════════════════
# A/B TESTS
# ═══════════════════════════════════════════════════════
@router.get("/admin/ab-tests")
def list_ab_tests(status: str = None, skip: int = 0, limit: int = 50, db: Session = Depends(get_db), _=Depends(require_admin)):
    q = db.query(ABTest)
    if status:
        q = q.filter(ABTest.status == status)
    total = q.count()
    items = q.order_by(ABTest.created_at.desc()).offset(skip).limit(limit).all()
    return {"total": total, "items": [_ser_test(t) for t in items]}

@router.post("/admin/ab-tests")
def create_ab_test(data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    test = ABTest(
        name=data.get("name", ""), description=data.get("description", ""),
        test_type=data.get("test_type", "split"), target_page=data.get("target_page", ""),
        target_audience=data.get("target_audience", {}),
        variants=data.get("variants", [{"id": "control", "name": "Contrôle", "weight": 50, "changes": {}}, {"id": "variant_a", "name": "Variante A", "weight": 50, "changes": {}}]),
        metrics=data.get("metrics", ["conversion"]),
        traffic_percentage=data.get("traffic_percentage", 100),
        min_sample_size=data.get("min_sample_size", 1000),
        confidence_level=data.get("confidence_level", 0.95),
    )
    db.add(test)
    db.commit()
    db.refresh(test)
    return _ser_test(test)

@router.get("/admin/ab-tests/{test_id}")
def get_ab_test(test_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    test = db.query(ABTest).filter(ABTest.id == test_id).first()
    if not test:
        raise HTTPException(404, "Test non trouvé")
    return _ser_test(test)

@router.put("/admin/ab-tests/{test_id}")
def update_ab_test(test_id: int, data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    test = db.query(ABTest).filter(ABTest.id == test_id).first()
    if not test:
        raise HTTPException(404, "Test non trouvé")
    for k in ["name", "description", "test_type", "target_page", "target_audience", "variants", "metrics", "traffic_percentage", "min_sample_size", "confidence_level"]:
        if k in data:
            setattr(test, k, data[k])
    db.commit()
    db.refresh(test)
    return _ser_test(test)

@router.delete("/admin/ab-tests/{test_id}")
def delete_ab_test(test_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    test = db.query(ABTest).filter(ABTest.id == test_id).first()
    if not test:
        raise HTTPException(404, "Test non trouvé")
    db.delete(test)
    db.commit()
    return {"ok": True}

@router.post("/admin/ab-tests/{test_id}/start")
def start_ab_test(test_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    test = db.query(ABTest).filter(ABTest.id == test_id).first()
    if not test:
        raise HTTPException(404, "Test non trouvé")
    test.status = "running"
    test.start_date = datetime.utcnow()
    db.commit()
    return _ser_test(test)

@router.post("/admin/ab-tests/{test_id}/stop")
def stop_ab_test(test_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    test = db.query(ABTest).filter(ABTest.id == test_id).first()
    if not test:
        raise HTTPException(404, "Test non trouvé")
    test.status = "completed"
    test.end_date = datetime.utcnow()
    db.commit()
    return _ser_test(test)

@router.post("/admin/ab-tests/{test_id}/pause")
def pause_ab_test(test_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    test = db.query(ABTest).filter(ABTest.id == test_id).first()
    if not test:
        raise HTTPException(404)
    test.status = "paused"
    db.commit()
    return _ser_test(test)

@router.get("/admin/ab-tests/{test_id}/results")
def get_ab_test_results(test_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    test = db.query(ABTest).filter(ABTest.id == test_id).first()
    if not test:
        raise HTTPException(404)
    variants = test.variants or []
    results = {}
    for v in variants:
        vid = v.get("id", "")
        impressions = db.query(ABTestEvent).filter(ABTestEvent.test_id == test_id, ABTestEvent.variant_id == vid, ABTestEvent.event_type == "impression").count()
        conversions = db.query(ABTestEvent).filter(ABTestEvent.test_id == test_id, ABTestEvent.variant_id == vid, ABTestEvent.event_type == "conversion").count()
        results[vid] = {
            "name": v.get("name", vid), "impressions": impressions, "conversions": conversions,
            "conversion_rate": round(conversions / max(impressions, 1) * 100, 2),
        }
    return {"test_id": test_id, "status": test.status, "variants": results}

@router.post("/admin/ab-tests/{test_id}/duplicate")
def duplicate_ab_test(test_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    test = db.query(ABTest).filter(ABTest.id == test_id).first()
    if not test:
        raise HTTPException(404)
    new = ABTest(
        name=f"{test.name} (copie)", description=test.description, test_type=test.test_type,
        target_page=test.target_page, target_audience=test.target_audience, variants=test.variants,
        metrics=test.metrics, traffic_percentage=test.traffic_percentage,
        min_sample_size=test.min_sample_size, confidence_level=test.confidence_level,
    )
    db.add(new)
    db.commit()
    db.refresh(new)
    return _ser_test(new)

@router.get("/admin/ab-tests/stats/overview")
def ab_tests_overview(db: Session = Depends(get_db), _=Depends(require_admin)):
    total = db.query(ABTest).count()
    running = db.query(ABTest).filter(ABTest.status == "running").count()
    completed = db.query(ABTest).filter(ABTest.status == "completed").count()
    draft = db.query(ABTest).filter(ABTest.status == "draft").count()
    return {"total": total, "running": running, "completed": completed, "draft": draft}

# ═══════════════════════════════════════════════════════
# HEATMAPS
# ═══════════════════════════════════════════════════════
@router.get("/admin/heatmaps")
def list_heatmaps(skip: int = 0, limit: int = 50, db: Session = Depends(get_db), _=Depends(require_admin)):
    q = db.query(HeatmapConfig)
    total = q.count()
    items = q.order_by(HeatmapConfig.created_at.desc()).offset(skip).limit(limit).all()
    return {"total": total, "items": [_ser_heatmap(h) for h in items]}

@router.post("/admin/heatmaps")
def create_heatmap(data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    h = HeatmapConfig(
        name=data.get("name", ""), page_url=data.get("page_url", ""),
        heatmap_type=data.get("heatmap_type", "click"), sample_rate=data.get("sample_rate", 0.1),
        data_retention_days=data.get("data_retention_days", 30), filters=data.get("filters", {}),
    )
    db.add(h)
    db.commit()
    db.refresh(h)
    return _ser_heatmap(h)

@router.put("/admin/heatmaps/{heatmap_id}")
def update_heatmap(heatmap_id: int, data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    h = db.query(HeatmapConfig).filter(HeatmapConfig.id == heatmap_id).first()
    if not h:
        raise HTTPException(404)
    for k in ["name", "page_url", "heatmap_type", "status", "sample_rate", "data_retention_days", "filters"]:
        if k in data:
            setattr(h, k, data[k])
    db.commit()
    db.refresh(h)
    return _ser_heatmap(h)

@router.delete("/admin/heatmaps/{heatmap_id}")
def delete_heatmap(heatmap_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    h = db.query(HeatmapConfig).filter(HeatmapConfig.id == heatmap_id).first()
    if not h:
        raise HTTPException(404)
    db.delete(h)
    db.commit()
    return {"ok": True}

@router.get("/admin/heatmaps/{heatmap_id}/data")
def get_heatmap_data(heatmap_id: int, device: str = None, db: Session = Depends(get_db), _=Depends(require_admin)):
    q = db.query(HeatmapData).filter(HeatmapData.config_id == heatmap_id)
    if device:
        q = q.filter(HeatmapData.device_type == device)
    data = q.order_by(HeatmapData.created_at.desc()).limit(500).all()
    all_points = []
    for d in data:
        all_points.extend(d.points or [])
    avg_scroll = sum(d.scroll_depth for d in data) / max(len(data), 1)
    avg_time = sum(d.time_on_page for d in data) / max(len(data), 1)
    return {"heatmap_id": heatmap_id, "sessions": len(data), "points": len(all_points), "avg_scroll_depth": round(avg_scroll, 2), "avg_time_on_page": round(avg_time, 1)}

@router.get("/admin/heatmaps/types")
def heatmap_types(_=Depends(require_admin)):
    return [
        {"id": "click", "label": "Clics", "description": "Zones cliquées par les utilisateurs"},
        {"id": "scroll", "label": "Défilement", "description": "Profondeur de scroll"},
        {"id": "move", "label": "Mouvement", "description": "Mouvements de souris"},
        {"id": "attention", "label": "Attention", "description": "Zones regardées le plus longtemps"},
    ]

# ═══════════════════════════════════════════════════════
# SESSION RECORDINGS
# ═══════════════════════════════════════════════════════
@router.get("/admin/session-recordings")
def list_recordings(
    device: str = None, has_errors: bool = None, has_rage_clicks: bool = None,
    starred: bool = None, min_duration: int = None, search: str = None,
    skip: int = 0, limit: int = 50, db: Session = Depends(get_db), _=Depends(require_admin)
):
    q = db.query(SessionRecording)
    if device:
        q = q.filter(SessionRecording.device_type == device)
    if has_errors is not None:
        q = q.filter(SessionRecording.has_errors == has_errors)
    if has_rage_clicks is not None:
        q = q.filter(SessionRecording.has_rage_clicks == has_rage_clicks)
    if starred is not None:
        q = q.filter(SessionRecording.starred == starred)
    if min_duration:
        q = q.filter(SessionRecording.duration_seconds >= min_duration)
    if search:
        q = q.filter(SessionRecording.user_email.ilike(f"%{search}%"))
    total = q.count()
    items = q.order_by(SessionRecording.created_at.desc()).offset(skip).limit(limit).all()
    return {"total": total, "items": [_ser_recording(r) for r in items]}

@router.get("/admin/session-recordings/{recording_id}")
def get_recording(recording_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.query(SessionRecording).filter(SessionRecording.id == recording_id).first()
    if not r:
        raise HTTPException(404)
    data = _ser_recording(r)
    data["events_data"] = r.events_data or []
    return data

@router.put("/admin/session-recordings/{recording_id}")
def update_recording(recording_id: int, data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.query(SessionRecording).filter(SessionRecording.id == recording_id).first()
    if not r:
        raise HTTPException(404)
    for k in ["tags", "notes", "starred"]:
        if k in data:
            setattr(r, k, data[k])
    db.commit()
    db.refresh(r)
    return _ser_recording(r)

@router.delete("/admin/session-recordings/{recording_id}")
def delete_recording(recording_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.query(SessionRecording).filter(SessionRecording.id == recording_id).first()
    if not r:
        raise HTTPException(404)
    db.delete(r)
    db.commit()
    return {"ok": True}

@router.get("/admin/session-recordings/stats/overview")
def recordings_overview(db: Session = Depends(get_db), _=Depends(require_admin)):
    total = db.query(SessionRecording).count()
    with_errors = db.query(SessionRecording).filter(SessionRecording.has_errors == True).count()
    with_rage = db.query(SessionRecording).filter(SessionRecording.has_rage_clicks == True).count()
    avg_duration = db.query(func.avg(SessionRecording.duration_seconds)).scalar() or 0
    return {"total": total, "with_errors": with_errors, "with_rage_clicks": with_rage, "avg_duration_seconds": round(avg_duration, 1)}

@router.get("/admin/session-recordings/config")
def get_recording_config(db: Session = Depends(get_db), _=Depends(require_admin)):
    from app.routers.admin_advanced_config import _get_config
    return _get_config(db, "session_recording_config", {
        "enabled": False, "sample_rate": 0.05, "max_duration_minutes": 30,
        "record_inputs": False, "mask_sensitive": True, "excluded_pages": [],
    })

@router.put("/admin/session-recordings/config")
def update_recording_config(data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    from app.routers.admin_advanced_config import _set_config
    _set_config(db, "session_recording_config", data)
    return data

# ═══════════════════════════════════════════════════════
# EMAIL WORKFLOWS (Visual Builder)
# ═══════════════════════════════════════════════════════
@router.get("/admin/email-workflows")
def list_workflows(status: str = None, skip: int = 0, limit: int = 50, db: Session = Depends(get_db), _=Depends(require_admin)):
    q = db.query(EmailWorkflow)
    if status:
        q = q.filter(EmailWorkflow.status == status)
    total = q.count()
    items = q.order_by(EmailWorkflow.created_at.desc()).offset(skip).limit(limit).all()
    return {"total": total, "items": [_ser_workflow(w) for w in items]}

@router.post("/admin/email-workflows")
def create_workflow(data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    w = EmailWorkflow(
        name=data.get("name", ""), description=data.get("description", ""),
        trigger_type=data.get("trigger_type", "event"), trigger_config=data.get("trigger_config", {}),
        nodes=data.get("nodes", []),
    )
    db.add(w)
    db.commit()
    db.refresh(w)
    return _ser_workflow(w)

@router.get("/admin/email-workflows/{workflow_id}")
def get_workflow(workflow_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    w = db.query(EmailWorkflow).filter(EmailWorkflow.id == workflow_id).first()
    if not w:
        raise HTTPException(404)
    return _ser_workflow(w)

@router.put("/admin/email-workflows/{workflow_id}")
def update_workflow(workflow_id: int, data: dict, db: Session = Depends(get_db), _=Depends(require_admin)):
    w = db.query(EmailWorkflow).filter(EmailWorkflow.id == workflow_id).first()
    if not w:
        raise HTTPException(404)
    for k in ["name", "description", "trigger_type", "trigger_config", "nodes"]:
        if k in data:
            setattr(w, k, data[k])
    db.commit()
    db.refresh(w)
    return _ser_workflow(w)

@router.delete("/admin/email-workflows/{workflow_id}")
def delete_workflow(workflow_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    w = db.query(EmailWorkflow).filter(EmailWorkflow.id == workflow_id).first()
    if not w:
        raise HTTPException(404)
    db.delete(w)
    db.commit()
    return {"ok": True}

@router.post("/admin/email-workflows/{workflow_id}/activate")
def activate_workflow(workflow_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    w = db.query(EmailWorkflow).filter(EmailWorkflow.id == workflow_id).first()
    if not w:
        raise HTTPException(404)
    w.status = "active"
    db.commit()
    return _ser_workflow(w)

@router.post("/admin/email-workflows/{workflow_id}/pause")
def pause_workflow(workflow_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    w = db.query(EmailWorkflow).filter(EmailWorkflow.id == workflow_id).first()
    if not w:
        raise HTTPException(404)
    w.status = "paused"
    db.commit()
    return _ser_workflow(w)

@router.post("/admin/email-workflows/{workflow_id}/duplicate")
def duplicate_workflow(workflow_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    w = db.query(EmailWorkflow).filter(EmailWorkflow.id == workflow_id).first()
    if not w:
        raise HTTPException(404)
    new = EmailWorkflow(
        name=f"{w.name} (copie)", description=w.description, trigger_type=w.trigger_type,
        trigger_config=w.trigger_config, nodes=w.nodes,
    )
    db.add(new)
    db.commit()
    db.refresh(new)
    return _ser_workflow(new)

@router.get("/admin/email-workflows/{workflow_id}/enrollments")
def workflow_enrollments(workflow_id: int, status: str = None, skip: int = 0, limit: int = 50, db: Session = Depends(get_db), _=Depends(require_admin)):
    q = db.query(EmailWorkflowEnrollment).filter(EmailWorkflowEnrollment.workflow_id == workflow_id)
    if status:
        q = q.filter(EmailWorkflowEnrollment.status == status)
    total = q.count()
    items = q.order_by(EmailWorkflowEnrollment.entered_at.desc()).offset(skip).limit(limit).all()
    return {"total": total, "items": [{
        "id": e.id, "user_id": e.user_id, "current_node_id": e.current_node_id,
        "status": e.status, "entered_at": e.entered_at.isoformat() if e.entered_at else None,
        "completed_at": e.completed_at.isoformat() if e.completed_at else None,
        "history": e.history or [],
    } for e in items]}

@router.get("/admin/email-workflows/{workflow_id}/stats")
def workflow_stats(workflow_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    w = db.query(EmailWorkflow).filter(EmailWorkflow.id == workflow_id).first()
    if not w:
        raise HTTPException(404)
    total = db.query(EmailWorkflowEnrollment).filter(EmailWorkflowEnrollment.workflow_id == workflow_id).count()
    active = db.query(EmailWorkflowEnrollment).filter(EmailWorkflowEnrollment.workflow_id == workflow_id, EmailWorkflowEnrollment.status == "active").count()
    completed = db.query(EmailWorkflowEnrollment).filter(EmailWorkflowEnrollment.workflow_id == workflow_id, EmailWorkflowEnrollment.status == "completed").count()
    return {"total_enrolled": total, "active": active, "completed": completed, "completion_rate": round(completed / max(total, 1) * 100, 2)}

@router.get("/admin/email-workflows/node-types")
def workflow_node_types(_=Depends(require_admin)):
    return [
        {"id": "send_email", "label": "Envoyer un email", "category": "action", "icon": "mail"},
        {"id": "wait", "label": "Attendre", "category": "timing", "icon": "clock"},
        {"id": "condition", "label": "Condition", "category": "logic", "icon": "git-branch"},
        {"id": "split", "label": "A/B Split", "category": "logic", "icon": "split"},
        {"id": "webhook", "label": "Webhook", "category": "action", "icon": "webhook"},
        {"id": "update_contact", "label": "Mettre à jour le contact", "category": "action", "icon": "user-edit"},
        {"id": "add_tag", "label": "Ajouter un tag", "category": "action", "icon": "tag"},
        {"id": "remove_tag", "label": "Retirer un tag", "category": "action", "icon": "tag-x"},
        {"id": "move_to_segment", "label": "Déplacer vers segment", "category": "action", "icon": "users"},
        {"id": "notify_team", "label": "Notifier l'équipe", "category": "action", "icon": "bell"},
        {"id": "goal", "label": "Objectif atteint", "category": "logic", "icon": "target"},
        {"id": "exit", "label": "Sortie", "category": "logic", "icon": "log-out"},
    ]

@router.get("/admin/email-workflows/trigger-types")
def workflow_trigger_types(_=Depends(require_admin)):
    return [
        {"id": "user_signup", "label": "Inscription utilisateur"},
        {"id": "subscription_created", "label": "Nouvel abonnement"},
        {"id": "subscription_cancelled", "label": "Abonnement annulé"},
        {"id": "trial_started", "label": "Début d'essai"},
        {"id": "trial_ending", "label": "Fin d'essai proche"},
        {"id": "inactivity", "label": "Inactivité"},
        {"id": "segment_entered", "label": "Entrée dans un segment"},
        {"id": "tag_added", "label": "Tag ajouté"},
        {"id": "manual", "label": "Déclenchement manuel"},
        {"id": "schedule", "label": "Planifié"},
        {"id": "track_uploaded", "label": "Piste uploadée"},
        {"id": "analysis_complete", "label": "Analyse terminée"},
    ]
