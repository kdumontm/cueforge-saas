"""
Admin CMS Avancé, Automatisation & Gamification.

~60 endpoints:
  /admin/cms/*            → Composants, templates pages, landing pages, versions, visibilité conditionnelle
  /admin/theme/*          → Config thème avancée, presets, dark mode, CSS custom
  /admin/automation/*     → Règles d'automatisation trigger→action
  /admin/gamification/*   → Badges, points, streaks, leaderboard
  /admin/seo/*            → Config SEO par page + sitemap
"""
import json
import uuid
from copy import deepcopy
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, Float, ForeignKey, func, or_
from sqlalchemy.orm import Session

from app.database import get_db, Base
from app.middleware.admin import require_admin
from app.models.user import User
from app.models.cms import Page, Section, Component, SiteSettings

router = APIRouter(dependencies=[Depends(require_admin)])


# ═══════════════════════════════════════════════
#  NOUVEAUX MODÈLES
# ═══════════════════════════════════════════════

class PageTemplate(Base):
    __tablename__ = "page_templates"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    components_json = Column(Text, default="[]")
    is_default = Column(Boolean, default=False)
    preview_image_url = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PageVersion(Base):
    __tablename__ = "page_versions"
    id = Column(Integer, primary_key=True, index=True)
    page_id = Column(Integer, ForeignKey("pages.id", ondelete="CASCADE"), nullable=False)
    version_number = Column(Integer, default=1)
    snapshot_json = Column(Text, nullable=False)
    created_by = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    note = Column(String(500), nullable=True)


class VisibilityRule(Base):
    __tablename__ = "visibility_rules"
    id = Column(Integer, primary_key=True, index=True)
    target_type = Column(String(50), nullable=False)  # component, section, page
    target_id = Column(Integer, nullable=False)
    condition_type = Column(String(50), nullable=False)  # plan, role, segment, date_range, logged_in
    condition_value = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ContentBlock(Base):
    __tablename__ = "content_blocks"
    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(100), unique=True, index=True, nullable=False)
    name = Column(String(200), nullable=False)
    block_type = Column(String(50), default="header")  # header, footer, sidebar, banner
    content_json = Column(Text, default="{}")
    is_active = Column(Boolean, default=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ThemePreset(Base):
    __tablename__ = "theme_presets"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(String(500), nullable=True)
    config_json = Column(Text, nullable=False, default="{}")
    is_default = Column(Boolean, default=False)
    preview_image_url = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class AutomationRule(Base):
    __tablename__ = "automation_rules"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    trigger_type = Column(String(100), nullable=False)
    conditions_json = Column(Text, default="[]")
    actions_json = Column(Text, default="[]")
    is_active = Column(Boolean, default=True)
    run_count = Column(Integer, default=0)
    last_run = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AutomationLog(Base):
    __tablename__ = "automation_logs"
    id = Column(Integer, primary_key=True, index=True)
    rule_id = Column(Integer, ForeignKey("automation_rules.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, nullable=True)
    trigger_event = Column(String(100), nullable=True)
    actions_executed = Column(Text, default="[]")
    result = Column(String(50), default="success")
    error_message = Column(Text, nullable=True)
    executed_at = Column(DateTime, default=datetime.utcnow)


class Badge(Base):
    __tablename__ = "badges"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    slug = Column(String(200), unique=True, index=True)
    icon_url = Column(String(500), nullable=True)
    description = Column(Text, nullable=True)
    criteria_type = Column(String(100), nullable=False)  # tracks_uploaded, cuepoints_created, playlists_shared, streak_days, custom
    criteria_value = Column(Integer, default=1)
    xp_reward = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class UserBadge(Base):
    __tablename__ = "user_badges"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    badge_id = Column(Integer, ForeignKey("badges.id"), nullable=False)
    awarded_at = Column(DateTime, default=datetime.utcnow)
    awarded_by = Column(String(50), default="system")  # system, admin


class GamificationConfig(Base):
    __tablename__ = "gamification_config"
    id = Column(Integer, primary_key=True, index=True)
    config_key = Column(String(100), unique=True, nullable=False)
    config_value = Column(Text, nullable=False, default="{}")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ═══════════════════════════════════════════════
#  HELPERS SERIALIZATION
# ═══════════════════════════════════════════════

def _ser_page_tpl(t: PageTemplate) -> dict:
    return {
        "id": t.id, "name": t.name, "description": t.description,
        "components": json.loads(t.components_json or "[]"),
        "is_default": t.is_default,
        "preview_image_url": t.preview_image_url,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }

def _ser_version(v: PageVersion) -> dict:
    return {
        "id": v.id, "page_id": v.page_id, "version_number": v.version_number,
        "created_by": v.created_by, "note": v.note,
        "created_at": v.created_at.isoformat() if v.created_at else None,
    }

def _ser_vis_rule(r: VisibilityRule) -> dict:
    return {
        "id": r.id, "target_type": r.target_type, "target_id": r.target_id,
        "condition_type": r.condition_type, "condition_value": r.condition_value,
        "is_active": r.is_active,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }

def _ser_block(b: ContentBlock) -> dict:
    return {
        "id": b.id, "slug": b.slug, "name": b.name, "block_type": b.block_type,
        "content": json.loads(b.content_json or "{}"),
        "is_active": b.is_active,
        "updated_at": b.updated_at.isoformat() if b.updated_at else None,
    }

def _ser_preset(p: ThemePreset) -> dict:
    return {
        "id": p.id, "name": p.name, "description": p.description,
        "config": json.loads(p.config_json or "{}"),
        "is_default": p.is_default,
        "preview_image_url": p.preview_image_url,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }

def _ser_rule(r: AutomationRule) -> dict:
    return {
        "id": r.id, "name": r.name, "trigger_type": r.trigger_type,
        "conditions": json.loads(r.conditions_json or "[]"),
        "actions": json.loads(r.actions_json or "[]"),
        "is_active": r.is_active, "run_count": r.run_count,
        "last_run": r.last_run.isoformat() if r.last_run else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }

def _ser_auto_log(l: AutomationLog) -> dict:
    return {
        "id": l.id, "rule_id": l.rule_id, "user_id": l.user_id,
        "trigger_event": l.trigger_event,
        "actions_executed": json.loads(l.actions_executed or "[]"),
        "result": l.result, "error_message": l.error_message,
        "executed_at": l.executed_at.isoformat() if l.executed_at else None,
    }

def _ser_badge(b: Badge) -> dict:
    return {
        "id": b.id, "name": b.name, "slug": b.slug,
        "icon_url": b.icon_url, "description": b.description,
        "criteria_type": b.criteria_type, "criteria_value": b.criteria_value,
        "xp_reward": b.xp_reward, "is_active": b.is_active,
        "created_at": b.created_at.isoformat() if b.created_at else None,
    }


# ═══════════════════════════════════════════════
#  CMS — PAGE TEMPLATES
# ═══════════════════════════════════════════════

class PageTplCreate(BaseModel):
    name: str
    description: Optional[str] = None
    components: List[Dict[str, Any]] = []
    is_default: bool = False

class PageTplUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    components: Optional[List[Dict[str, Any]]] = None
    is_default: Optional[bool] = None


@router.get("/admin/cms/page-templates")
def list_page_templates(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    q = db.query(PageTemplate)
    total = q.count()
    items = q.order_by(PageTemplate.name).offset(skip).limit(limit).all()
    return {"total": total, "items": [_ser_page_tpl(t) for t in items]}


@router.post("/admin/cms/page-templates")
def create_page_template(body: PageTplCreate, db: Session = Depends(get_db)):
    t = PageTemplate(
        name=body.name, description=body.description,
        components_json=json.dumps(body.components),
        is_default=body.is_default,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _ser_page_tpl(t)


@router.put("/admin/cms/page-templates/{tpl_id}")
def update_page_template(tpl_id: int, body: PageTplUpdate, db: Session = Depends(get_db)):
    t = db.query(PageTemplate).get(tpl_id)
    if not t:
        raise HTTPException(404, "Template introuvable")
    for f, v in body.dict(exclude_unset=True).items():
        if f == "components":
            t.components_json = json.dumps(v)
        else:
            setattr(t, f, v)
    db.commit()
    db.refresh(t)
    return _ser_page_tpl(t)


@router.delete("/admin/cms/page-templates/{tpl_id}")
def delete_page_template(tpl_id: int, db: Session = Depends(get_db)):
    t = db.query(PageTemplate).get(tpl_id)
    if not t:
        raise HTTPException(404, "Template introuvable")
    db.delete(t)
    db.commit()
    return {"ok": True}


@router.post("/admin/cms/page-templates/{tpl_id}/duplicate")
def duplicate_page_template(tpl_id: int, db: Session = Depends(get_db)):
    t = db.query(PageTemplate).get(tpl_id)
    if not t:
        raise HTTPException(404, "Template introuvable")
    dup = PageTemplate(
        name=f"{t.name} (copie)", description=t.description,
        components_json=t.components_json, is_default=False,
    )
    db.add(dup)
    db.commit()
    db.refresh(dup)
    return _ser_page_tpl(dup)


# ═══════════════════════════════════════════════
#  CMS — LANDING PAGES (uses existing Page model)
# ═══════════════════════════════════════════════

@router.get("/admin/cms/landing-pages")
def list_landing_pages(
    skip: int = 0, limit: int = 50,
    search: Optional[str] = None,
    is_published: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Page)
    if search:
        q = q.filter(or_(Page.name.ilike(f"%{search}%"), Page.slug.ilike(f"%{search}%")))
    if is_published is not None:
        q = q.filter(Page.is_published == is_published)
    total = q.count()
    items = q.order_by(Page.sort_order).offset(skip).limit(limit).all()
    return {"total": total, "items": [{
        "id": p.id, "name": p.name, "slug": p.slug, "title": p.title,
        "is_published": p.is_published, "is_system": p.is_system,
        "layout": p.layout, "sort_order": p.sort_order,
        "meta_title": p.meta_title, "meta_description": p.meta_description,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        "sections_count": len(p.sections) if p.sections else 0,
    } for p in items]}


@router.post("/admin/cms/landing-pages/{page_id}/duplicate")
def duplicate_landing_page(page_id: int, db: Session = Depends(get_db)):
    p = db.query(Page).get(page_id)
    if not p:
        raise HTTPException(404, "Page introuvable")
    new_slug = f"{p.slug}-copy-{uuid.uuid4().hex[:6]}"
    dup = Page(
        name=f"{p.name} (copie)", slug=new_slug, title=p.title,
        description=p.description, is_published=False, is_system=False,
        layout=p.layout, meta_title=p.meta_title, meta_description=p.meta_description,
    )
    db.add(dup)
    db.flush()
    for sec in p.sections:
        new_sec = Section(
            page_id=dup.id, name=sec.name, section_type=sec.section_type,
            sort_order=sec.sort_order, is_visible=sec.is_visible,
            background_color=sec.background_color, settings_json=sec.settings_json,
        )
        db.add(new_sec)
        db.flush()
        for comp in sec.components:
            new_comp = Component(
                section_id=new_sec.id, component_type=comp.component_type,
                sort_order=comp.sort_order, is_visible=comp.is_visible,
                content_json=comp.content_json,
            )
            db.add(new_comp)
    db.commit()
    db.refresh(dup)
    return {"id": dup.id, "name": dup.name, "slug": dup.slug}


# ═══════════════════════════════════════════════
#  CMS — PAGE VERSIONS
# ═══════════════════════════════════════════════

@router.get("/admin/cms/pages/{page_id}/versions")
def list_page_versions(page_id: int, db: Session = Depends(get_db)):
    versions = db.query(PageVersion).filter(PageVersion.page_id == page_id)\
        .order_by(PageVersion.version_number.desc()).all()
    return {"items": [_ser_version(v) for v in versions]}


@router.post("/admin/cms/pages/{page_id}/versions")
def create_page_version(page_id: int, note: Optional[str] = None, db: Session = Depends(get_db)):
    page = db.query(Page).get(page_id)
    if not page:
        raise HTTPException(404, "Page introuvable")
    last_ver = db.query(func.max(PageVersion.version_number))\
        .filter(PageVersion.page_id == page_id).scalar() or 0
    sections_data = []
    for sec in page.sections:
        comps = [{"type": c.component_type, "content": c.content, "order": c.sort_order}
                 for c in sec.components]
        sections_data.append({
            "name": sec.name, "type": sec.section_type, "order": sec.sort_order,
            "settings": sec.settings, "components": comps,
        })
    snapshot = {"title": page.title, "slug": page.slug, "sections": sections_data}
    v = PageVersion(
        page_id=page_id, version_number=last_ver + 1,
        snapshot_json=json.dumps(snapshot, ensure_ascii=False),
        note=note,
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return _ser_version(v)


@router.post("/admin/cms/pages/{page_id}/versions/{version_id}/restore")
def restore_page_version(page_id: int, version_id: int, db: Session = Depends(get_db)):
    v = db.query(PageVersion).filter(
        PageVersion.id == version_id, PageVersion.page_id == page_id
    ).first()
    if not v:
        raise HTTPException(404, "Version introuvable")
    return {"ok": True, "message": f"Version {v.version_number} restaurée", "snapshot": json.loads(v.snapshot_json)}


# ═══════════════════════════════════════════════
#  CMS — VISIBILITY RULES
# ═══════════════════════════════════════════════

class VisRuleCreate(BaseModel):
    target_type: str
    target_id: int
    condition_type: str
    condition_value: str

@router.get("/admin/cms/visibility-rules")
def list_visibility_rules(
    target_type: Optional[str] = None,
    target_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(VisibilityRule)
    if target_type:
        q = q.filter(VisibilityRule.target_type == target_type)
    if target_id:
        q = q.filter(VisibilityRule.target_id == target_id)
    items = q.all()
    return {"total": len(items), "items": [_ser_vis_rule(r) for r in items]}


@router.post("/admin/cms/visibility-rules")
def create_visibility_rule(body: VisRuleCreate, db: Session = Depends(get_db)):
    r = VisibilityRule(
        target_type=body.target_type, target_id=body.target_id,
        condition_type=body.condition_type, condition_value=body.condition_value,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return _ser_vis_rule(r)


@router.delete("/admin/cms/visibility-rules/{rule_id}")
def delete_visibility_rule(rule_id: int, db: Session = Depends(get_db)):
    r = db.query(VisibilityRule).get(rule_id)
    if not r:
        raise HTTPException(404, "Règle introuvable")
    db.delete(r)
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════
#  CMS — CONTENT BLOCKS (header, footer, sidebar)
# ═══════════════════════════════════════════════

class BlockUpdate(BaseModel):
    name: Optional[str] = None
    content: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


@router.get("/admin/cms/content-blocks")
def list_content_blocks(db: Session = Depends(get_db)):
    items = db.query(ContentBlock).order_by(ContentBlock.block_type).all()
    return {"items": [_ser_block(b) for b in items]}


@router.post("/admin/cms/content-blocks")
def create_content_block(slug: str, name: str, block_type: str = "header",
                          content: Dict[str, Any] = {}, db: Session = Depends(get_db)):
    if db.query(ContentBlock).filter(ContentBlock.slug == slug).first():
        raise HTTPException(400, "Slug déjà utilisé")
    b = ContentBlock(slug=slug, name=name, block_type=block_type,
                     content_json=json.dumps(content, ensure_ascii=False))
    db.add(b)
    db.commit()
    db.refresh(b)
    return _ser_block(b)


@router.put("/admin/cms/content-blocks/{block_id}")
def update_content_block(block_id: int, body: BlockUpdate, db: Session = Depends(get_db)):
    b = db.query(ContentBlock).get(block_id)
    if not b:
        raise HTTPException(404, "Bloc introuvable")
    if body.name is not None:
        b.name = body.name
    if body.content is not None:
        b.content_json = json.dumps(body.content, ensure_ascii=False)
    if body.is_active is not None:
        b.is_active = body.is_active
    db.commit()
    db.refresh(b)
    return _ser_block(b)


@router.delete("/admin/cms/content-blocks/{block_id}")
def delete_content_block(block_id: int, db: Session = Depends(get_db)):
    b = db.query(ContentBlock).get(block_id)
    if not b:
        raise HTTPException(404, "Bloc introuvable")
    db.delete(b)
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════
#  CMS — SEO PER PAGE
# ═══════════════════════════════════════════════

class SeoUpdate(BaseModel):
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    og_image_url: Optional[str] = None

@router.put("/admin/cms/pages/{page_id}/seo")
def update_page_seo(page_id: int, body: SeoUpdate, db: Session = Depends(get_db)):
    p = db.query(Page).get(page_id)
    if not p:
        raise HTTPException(404, "Page introuvable")
    if body.meta_title is not None:
        p.meta_title = body.meta_title
    if body.meta_description is not None:
        p.meta_description = body.meta_description
    if body.og_image_url is not None:
        p.og_image_url = body.og_image_url
    db.commit()
    return {"ok": True}


@router.get("/admin/cms/sitemap-config")
def get_sitemap_config(db: Session = Depends(get_db)):
    pages = db.query(Page).filter(Page.is_published == True).order_by(Page.sort_order).all()
    return {"pages": [{"slug": p.slug, "title": p.name, "updated": p.updated_at.isoformat() if p.updated_at else None} for p in pages]}


# ═══════════════════════════════════════════════
#  THEME — CONFIGURATION AVANCÉE
# ═══════════════════════════════════════════════

@router.get("/admin/theme/config")
def get_theme_config(db: Session = Depends(get_db)):
    s = db.query(SiteSettings).first()
    if not s:
        return {"colors": {}, "typography": {}, "theme_config": {}}
    return {
        "colors": {
            "primary": s.primary_color, "secondary": s.secondary_color,
            "accent": s.accent_color, "background": s.background_color,
            "text": s.text_color,
        },
        "typography": {"font_family": s.font_family},
        "theme_config": json.loads(s.theme_config or "{}"),
        "branding": {
            "site_name": s.site_name, "tagline": s.tagline,
            "logo_url": s.logo_url, "favicon_url": s.favicon_url,
        },
    }


class ThemeConfigUpdate(BaseModel):
    colors: Optional[Dict[str, str]] = None
    typography: Optional[Dict[str, str]] = None
    theme_config: Optional[Dict[str, Any]] = None
    branding: Optional[Dict[str, str]] = None


@router.put("/admin/theme/config")
def update_theme_config(body: ThemeConfigUpdate, db: Session = Depends(get_db)):
    s = db.query(SiteSettings).first()
    if not s:
        s = SiteSettings(id=1)
        db.add(s)
    if body.colors:
        for k, v in body.colors.items():
            col = f"{k}_color"
            if hasattr(s, col):
                setattr(s, col, v)
    if body.typography:
        if "font_family" in body.typography:
            s.font_family = body.typography["font_family"]
    if body.theme_config is not None:
        s.theme_config = json.dumps(body.theme_config, ensure_ascii=False)
    if body.branding:
        for k in ["site_name", "tagline", "logo_url", "favicon_url"]:
            if k in body.branding:
                setattr(s, k, body.branding[k])
    db.commit()
    return {"ok": True}


@router.get("/admin/theme/button-styles")
def get_button_styles(db: Session = Depends(get_db)):
    cfg = db.query(GamificationConfig).filter(GamificationConfig.config_key == "button_styles").first()
    if cfg:
        return json.loads(cfg.config_value)
    return {"primary": {"bg": "#6366f1", "text": "#fff", "border_radius": "8px"},
            "secondary": {"bg": "transparent", "text": "#6366f1", "border": "1px solid #6366f1"},
            "ghost": {"bg": "transparent", "text": "#94a3b8"},
            "danger": {"bg": "#ef4444", "text": "#fff"}}


@router.put("/admin/theme/button-styles")
def update_button_styles(styles: Dict[str, Any], db: Session = Depends(get_db)):
    cfg = db.query(GamificationConfig).filter(GamificationConfig.config_key == "button_styles").first()
    if not cfg:
        cfg = GamificationConfig(config_key="button_styles", config_value=json.dumps(styles))
        db.add(cfg)
    else:
        cfg.config_value = json.dumps(styles)
    db.commit()
    return {"ok": True}


@router.get("/admin/theme/card-styles")
def get_card_styles(db: Session = Depends(get_db)):
    cfg = db.query(GamificationConfig).filter(GamificationConfig.config_key == "card_styles").first()
    return json.loads(cfg.config_value) if cfg else {"bg": "#1e293b", "border": "1px solid #334155", "border_radius": "12px", "shadow": "0 4px 6px rgba(0,0,0,0.3)", "padding": "1.5rem"}


@router.put("/admin/theme/card-styles")
def update_card_styles(styles: Dict[str, Any], db: Session = Depends(get_db)):
    cfg = db.query(GamificationConfig).filter(GamificationConfig.config_key == "card_styles").first()
    if not cfg:
        cfg = GamificationConfig(config_key="card_styles", config_value=json.dumps(styles))
        db.add(cfg)
    else:
        cfg.config_value = json.dumps(styles)
    db.commit()
    return {"ok": True}


@router.get("/admin/theme/animation-config")
def get_animation_config(db: Session = Depends(get_db)):
    cfg = db.query(GamificationConfig).filter(GamificationConfig.config_key == "animation_config").first()
    return json.loads(cfg.config_value) if cfg else {
        "transition_duration": "200ms", "easing": "ease-out",
        "enable_animations": True, "page_transition": "fade",
    }


@router.put("/admin/theme/animation-config")
def update_animation_config(config: Dict[str, Any], db: Session = Depends(get_db)):
    cfg = db.query(GamificationConfig).filter(GamificationConfig.config_key == "animation_config").first()
    if not cfg:
        cfg = GamificationConfig(config_key="animation_config", config_value=json.dumps(config))
        db.add(cfg)
    else:
        cfg.config_value = json.dumps(config)
    db.commit()
    return {"ok": True}


@router.get("/admin/theme/responsive-breakpoints")
def get_responsive_breakpoints(db: Session = Depends(get_db)):
    cfg = db.query(GamificationConfig).filter(GamificationConfig.config_key == "breakpoints").first()
    return json.loads(cfg.config_value) if cfg else {"sm": 640, "md": 768, "lg": 1024, "xl": 1280, "2xl": 1536}


@router.put("/admin/theme/responsive-breakpoints")
def update_responsive_breakpoints(breakpoints: Dict[str, int], db: Session = Depends(get_db)):
    cfg = db.query(GamificationConfig).filter(GamificationConfig.config_key == "breakpoints").first()
    if not cfg:
        cfg = GamificationConfig(config_key="breakpoints", config_value=json.dumps(breakpoints))
        db.add(cfg)
    else:
        cfg.config_value = json.dumps(breakpoints)
    db.commit()
    return {"ok": True}


@router.get("/admin/theme/dark-mode")
def get_dark_mode_config(db: Session = Depends(get_db)):
    cfg = db.query(GamificationConfig).filter(GamificationConfig.config_key == "dark_mode").first()
    return json.loads(cfg.config_value) if cfg else {"enabled": True, "auto_detect": True, "colors_override": {}}


@router.put("/admin/theme/dark-mode")
def update_dark_mode_config(config: Dict[str, Any], db: Session = Depends(get_db)):
    cfg = db.query(GamificationConfig).filter(GamificationConfig.config_key == "dark_mode").first()
    if not cfg:
        cfg = GamificationConfig(config_key="dark_mode", config_value=json.dumps(config))
        db.add(cfg)
    else:
        cfg.config_value = json.dumps(config)
    db.commit()
    return {"ok": True}


@router.get("/admin/theme/css-overrides")
def get_css_overrides(db: Session = Depends(get_db)):
    cfg = db.query(GamificationConfig).filter(GamificationConfig.config_key == "css_overrides").first()
    return {"css": cfg.config_value if cfg else ""}


@router.put("/admin/theme/css-overrides")
def update_css_overrides(css: str, db: Session = Depends(get_db)):
    cfg = db.query(GamificationConfig).filter(GamificationConfig.config_key == "css_overrides").first()
    if not cfg:
        cfg = GamificationConfig(config_key="css_overrides", config_value=css)
        db.add(cfg)
    else:
        cfg.config_value = css
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════
#  THEME PRESETS
# ═══════════════════════════════════════════════

class PresetCreate(BaseModel):
    name: str
    description: Optional[str] = None
    config: Dict[str, Any] = {}

@router.get("/admin/theme/presets")
def list_theme_presets(db: Session = Depends(get_db)):
    items = db.query(ThemePreset).order_by(ThemePreset.name).all()
    return {"items": [_ser_preset(p) for p in items]}


@router.post("/admin/theme/presets")
def create_theme_preset(body: PresetCreate, db: Session = Depends(get_db)):
    p = ThemePreset(name=body.name, description=body.description,
                    config_json=json.dumps(body.config, ensure_ascii=False))
    db.add(p)
    db.commit()
    db.refresh(p)
    return _ser_preset(p)


@router.put("/admin/theme/presets/{preset_id}")
def update_theme_preset(preset_id: int, body: PresetCreate, db: Session = Depends(get_db)):
    p = db.query(ThemePreset).get(preset_id)
    if not p:
        raise HTTPException(404, "Preset introuvable")
    p.name = body.name
    p.description = body.description
    p.config_json = json.dumps(body.config, ensure_ascii=False)
    db.commit()
    db.refresh(p)
    return _ser_preset(p)


@router.delete("/admin/theme/presets/{preset_id}")
def delete_theme_preset(preset_id: int, db: Session = Depends(get_db)):
    p = db.query(ThemePreset).get(preset_id)
    if not p:
        raise HTTPException(404, "Preset introuvable")
    db.delete(p)
    db.commit()
    return {"ok": True}


@router.post("/admin/theme/presets/{preset_id}/apply")
def apply_theme_preset(preset_id: int, db: Session = Depends(get_db)):
    p = db.query(ThemePreset).get(preset_id)
    if not p:
        raise HTTPException(404, "Preset introuvable")
    config = json.loads(p.config_json or "{}")
    s = db.query(SiteSettings).first()
    if not s:
        s = SiteSettings(id=1)
        db.add(s)
    if "colors" in config:
        for k, v in config["colors"].items():
            col = f"{k}_color"
            if hasattr(s, col):
                setattr(s, col, v)
    if "typography" in config and "font_family" in config["typography"]:
        s.font_family = config["typography"]["font_family"]
    if "theme_config" in config:
        s.theme_config = json.dumps(config["theme_config"], ensure_ascii=False)
    db.commit()
    return {"ok": True, "message": f"Preset '{p.name}' appliqué"}


@router.get("/admin/theme/export")
def export_theme(db: Session = Depends(get_db)):
    s = db.query(SiteSettings).first()
    if not s:
        return {}
    return {
        "colors": {"primary": s.primary_color, "secondary": s.secondary_color,
                    "accent": s.accent_color, "background": s.background_color, "text": s.text_color},
        "typography": {"font_family": s.font_family},
        "branding": {"site_name": s.site_name, "tagline": s.tagline, "logo_url": s.logo_url},
        "theme_config": json.loads(s.theme_config or "{}"),
    }


@router.post("/admin/theme/import")
def import_theme(theme_data: Dict[str, Any], db: Session = Depends(get_db)):
    s = db.query(SiteSettings).first()
    if not s:
        s = SiteSettings(id=1)
        db.add(s)
    if "colors" in theme_data:
        for k, v in theme_data["colors"].items():
            col = f"{k}_color"
            if hasattr(s, col):
                setattr(s, col, v)
    if "typography" in theme_data and "font_family" in theme_data["typography"]:
        s.font_family = theme_data["typography"]["font_family"]
    if "branding" in theme_data:
        for k in ["site_name", "tagline", "logo_url"]:
            if k in theme_data["branding"]:
                setattr(s, k, theme_data["branding"][k])
    if "theme_config" in theme_data:
        s.theme_config = json.dumps(theme_data["theme_config"], ensure_ascii=False)
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════
#  AUTOMATION RULES
# ═══════════════════════════════════════════════

class RuleCreate(BaseModel):
    name: str
    trigger_type: str
    conditions: List[Dict[str, Any]] = []
    actions: List[Dict[str, Any]] = []
    is_active: bool = True

class RuleUpdate(BaseModel):
    name: Optional[str] = None
    trigger_type: Optional[str] = None
    conditions: Optional[List[Dict[str, Any]]] = None
    actions: Optional[List[Dict[str, Any]]] = None
    is_active: Optional[bool] = None


@router.get("/admin/automation/triggers")
def list_triggers():
    return {"triggers": [
        {"id": "user_signup", "label": "Inscription", "description": "Quand un utilisateur s'inscrit"},
        {"id": "subscription_change", "label": "Changement d'abonnement", "description": "Upgrade, downgrade ou annulation"},
        {"id": "track_upload", "label": "Upload de track", "description": "Quand une track est uploadée"},
        {"id": "inactivity", "label": "Inactivité", "description": "Pas d'activité depuis N jours"},
        {"id": "cuepoint_created", "label": "Cue point créé", "description": "Quand un cue point est détecté"},
        {"id": "trial_ending", "label": "Fin d'essai", "description": "N jours avant la fin de l'essai"},
        {"id": "custom_event", "label": "Événement custom", "description": "Événement déclenché manuellement"},
    ]}


@router.get("/admin/automation/actions")
def list_actions():
    return {"actions": [
        {"id": "send_email", "label": "Envoyer un email", "params": ["template_id"]},
        {"id": "send_notification", "label": "Notification in-app", "params": ["title", "message"]},
        {"id": "add_tag", "label": "Ajouter un tag", "params": ["tag"]},
        {"id": "remove_tag", "label": "Retirer un tag", "params": ["tag"]},
        {"id": "webhook", "label": "Appeler un webhook", "params": ["url", "method"]},
        {"id": "update_field", "label": "Modifier un champ utilisateur", "params": ["field", "value"]},
    ]}


@router.get("/admin/automation/rules")
def list_automation_rules(
    skip: int = 0, limit: int = 50,
    is_active: Optional[bool] = None,
    trigger_type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(AutomationRule)
    if is_active is not None:
        q = q.filter(AutomationRule.is_active == is_active)
    if trigger_type:
        q = q.filter(AutomationRule.trigger_type == trigger_type)
    total = q.count()
    items = q.order_by(AutomationRule.created_at.desc()).offset(skip).limit(limit).all()
    return {"total": total, "items": [_ser_rule(r) for r in items]}


@router.post("/admin/automation/rules")
def create_automation_rule(body: RuleCreate, db: Session = Depends(get_db)):
    r = AutomationRule(
        name=body.name, trigger_type=body.trigger_type,
        conditions_json=json.dumps(body.conditions),
        actions_json=json.dumps(body.actions),
        is_active=body.is_active,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return _ser_rule(r)


@router.get("/admin/automation/rules/{rule_id}")
def get_automation_rule(rule_id: int, db: Session = Depends(get_db)):
    r = db.query(AutomationRule).get(rule_id)
    if not r:
        raise HTTPException(404, "Règle introuvable")
    return _ser_rule(r)


@router.put("/admin/automation/rules/{rule_id}")
def update_automation_rule(rule_id: int, body: RuleUpdate, db: Session = Depends(get_db)):
    r = db.query(AutomationRule).get(rule_id)
    if not r:
        raise HTTPException(404, "Règle introuvable")
    for f, v in body.dict(exclude_unset=True).items():
        if f in ("conditions", "actions"):
            setattr(r, f"{f}_json", json.dumps(v))
        else:
            setattr(r, f, v)
    db.commit()
    db.refresh(r)
    return _ser_rule(r)


@router.delete("/admin/automation/rules/{rule_id}")
def delete_automation_rule(rule_id: int, db: Session = Depends(get_db)):
    r = db.query(AutomationRule).get(rule_id)
    if not r:
        raise HTTPException(404, "Règle introuvable")
    db.delete(r)
    db.commit()
    return {"ok": True}


@router.post("/admin/automation/rules/{rule_id}/toggle")
def toggle_automation_rule(rule_id: int, db: Session = Depends(get_db)):
    r = db.query(AutomationRule).get(rule_id)
    if not r:
        raise HTTPException(404, "Règle introuvable")
    r.is_active = not r.is_active
    db.commit()
    return {"ok": True, "is_active": r.is_active}


@router.post("/admin/automation/rules/{rule_id}/test")
def test_automation_rule(rule_id: int, db: Session = Depends(get_db)):
    r = db.query(AutomationRule).get(rule_id)
    if not r:
        raise HTTPException(404, "Règle introuvable")
    actions = json.loads(r.actions_json or "[]")
    return {
        "ok": True, "dry_run": True,
        "would_execute": actions,
        "message": f"Dry run: {len(actions)} action(s) seraient exécutées",
    }


@router.post("/admin/automation/rules/{rule_id}/duplicate")
def duplicate_automation_rule(rule_id: int, db: Session = Depends(get_db)):
    r = db.query(AutomationRule).get(rule_id)
    if not r:
        raise HTTPException(404, "Règle introuvable")
    dup = AutomationRule(
        name=f"{r.name} (copie)", trigger_type=r.trigger_type,
        conditions_json=r.conditions_json, actions_json=r.actions_json,
        is_active=False,
    )
    db.add(dup)
    db.commit()
    db.refresh(dup)
    return _ser_rule(dup)


@router.get("/admin/automation/logs")
def list_automation_logs(
    skip: int = 0, limit: int = 100,
    rule_id: Optional[int] = None,
    result: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(AutomationLog)
    if rule_id:
        q = q.filter(AutomationLog.rule_id == rule_id)
    if result:
        q = q.filter(AutomationLog.result == result)
    total = q.count()
    items = q.order_by(AutomationLog.executed_at.desc()).offset(skip).limit(limit).all()
    return {"total": total, "items": [_ser_auto_log(l) for l in items]}


# ═══════════════════════════════════════════════
#  GAMIFICATION — BADGES
# ═══════════════════════════════════════════════

class BadgeCreate(BaseModel):
    name: str
    slug: Optional[str] = None
    icon_url: Optional[str] = None
    description: Optional[str] = None
    criteria_type: str
    criteria_value: int = 1
    xp_reward: int = 0

class BadgeUpdate(BaseModel):
    name: Optional[str] = None
    icon_url: Optional[str] = None
    description: Optional[str] = None
    criteria_type: Optional[str] = None
    criteria_value: Optional[int] = None
    xp_reward: Optional[int] = None
    is_active: Optional[bool] = None


@router.get("/admin/gamification/badges")
def list_badges(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    q = db.query(Badge)
    total = q.count()
    items = q.order_by(Badge.name).offset(skip).limit(limit).all()
    return {"total": total, "items": [_ser_badge(b) for b in items]}


@router.post("/admin/gamification/badges")
def create_badge(body: BadgeCreate, db: Session = Depends(get_db)):
    slug = body.slug or body.name.lower().replace(" ", "-")
    if db.query(Badge).filter(Badge.slug == slug).first():
        raise HTTPException(400, "Slug déjà utilisé")
    b = Badge(
        name=body.name, slug=slug, icon_url=body.icon_url,
        description=body.description, criteria_type=body.criteria_type,
        criteria_value=body.criteria_value, xp_reward=body.xp_reward,
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    return _ser_badge(b)


@router.put("/admin/gamification/badges/{badge_id}")
def update_badge(badge_id: int, body: BadgeUpdate, db: Session = Depends(get_db)):
    b = db.query(Badge).get(badge_id)
    if not b:
        raise HTTPException(404, "Badge introuvable")
    for f, v in body.dict(exclude_unset=True).items():
        setattr(b, f, v)
    db.commit()
    db.refresh(b)
    return _ser_badge(b)


@router.delete("/admin/gamification/badges/{badge_id}")
def delete_badge(badge_id: int, db: Session = Depends(get_db)):
    b = db.query(Badge).get(badge_id)
    if not b:
        raise HTTPException(404, "Badge introuvable")
    db.query(UserBadge).filter(UserBadge.badge_id == badge_id).delete()
    db.delete(b)
    db.commit()
    return {"ok": True}


@router.post("/admin/gamification/badges/{badge_id}/award")
def award_badge(badge_id: int, user_id: int, db: Session = Depends(get_db)):
    b = db.query(Badge).get(badge_id)
    if not b:
        raise HTTPException(404, "Badge introuvable")
    existing = db.query(UserBadge).filter(
        UserBadge.badge_id == badge_id, UserBadge.user_id == user_id
    ).first()
    if existing:
        raise HTTPException(400, "L'utilisateur a déjà ce badge")
    ub = UserBadge(user_id=user_id, badge_id=badge_id, awarded_by="admin")
    db.add(ub)
    db.commit()
    return {"ok": True}


@router.delete("/admin/gamification/badges/{badge_id}/revoke/{user_id}")
def revoke_badge(badge_id: int, user_id: int, db: Session = Depends(get_db)):
    ub = db.query(UserBadge).filter(
        UserBadge.badge_id == badge_id, UserBadge.user_id == user_id
    ).first()
    if not ub:
        raise HTTPException(404, "Badge non attribué à cet utilisateur")
    db.delete(ub)
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════
#  GAMIFICATION — POINTS CONFIG
# ═══════════════════════════════════════════════

@router.get("/admin/gamification/points-config")
def get_points_config(db: Session = Depends(get_db)):
    cfg = db.query(GamificationConfig).filter(GamificationConfig.config_key == "points_config").first()
    if cfg:
        return json.loads(cfg.config_value)
    return {
        "upload_track": 10, "create_cuepoint": 5, "share_playlist": 15,
        "daily_login": 2, "refer_friend": 50, "complete_profile": 20,
    }


@router.put("/admin/gamification/points-config")
def update_points_config(config: Dict[str, int], db: Session = Depends(get_db)):
    cfg = db.query(GamificationConfig).filter(GamificationConfig.config_key == "points_config").first()
    if not cfg:
        cfg = GamificationConfig(config_key="points_config", config_value=json.dumps(config))
        db.add(cfg)
    else:
        cfg.config_value = json.dumps(config)
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════
#  GAMIFICATION — STREAKS
# ═══════════════════════════════════════════════

@router.get("/admin/gamification/streak-config")
def get_streak_config(db: Session = Depends(get_db)):
    cfg = db.query(GamificationConfig).filter(GamificationConfig.config_key == "streak_config").first()
    if cfg:
        return json.loads(cfg.config_value)
    return {
        "required_action": "daily_login", "reset_hours": 48,
        "milestones": [7, 30, 90, 365],
    }


@router.put("/admin/gamification/streak-config")
def update_streak_config(config: Dict[str, Any], db: Session = Depends(get_db)):
    cfg = db.query(GamificationConfig).filter(GamificationConfig.config_key == "streak_config").first()
    if not cfg:
        cfg = GamificationConfig(config_key="streak_config", config_value=json.dumps(config))
        db.add(cfg)
    else:
        cfg.config_value = json.dumps(config)
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════
#  GAMIFICATION — LEADERBOARD & USER DETAILS
# ═══════════════════════════════════════════════

@router.get("/admin/gamification/leaderboard")
def get_leaderboard(limit: int = 20, db: Session = Depends(get_db)):
    # Top users by badge count
    from sqlalchemy import desc
    top = db.query(
        UserBadge.user_id, func.count(UserBadge.id).label("badge_count")
    ).group_by(UserBadge.user_id).order_by(desc("badge_count")).limit(limit).all()

    results = []
    for user_id, badge_count in top:
        user = db.query(User).get(user_id)
        if user:
            results.append({
                "user_id": user_id,
                "email": user.email,
                "dj_name": getattr(user, "dj_name", None),
                "badge_count": badge_count,
            })
    return {"items": results}


@router.get("/admin/gamification/users/{user_id}")
def get_user_gamification(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).get(user_id)
    if not user:
        raise HTTPException(404, "Utilisateur introuvable")
    badges = db.query(UserBadge).filter(UserBadge.user_id == user_id).all()
    badge_details = []
    for ub in badges:
        b = db.query(Badge).get(ub.badge_id)
        if b:
            badge_details.append({
                "badge": _ser_badge(b),
                "awarded_at": ub.awarded_at.isoformat() if ub.awarded_at else None,
                "awarded_by": ub.awarded_by,
            })
    return {
        "user_id": user_id,
        "email": user.email,
        "badges": badge_details,
        "badge_count": len(badge_details),
    }
