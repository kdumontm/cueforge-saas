"""
Admin Router — Back-office API pour CueForge.

Endpoints regroupés :
  /admin/settings      → Config globale du site
  /admin/pages         → CRUD pages
  /admin/sections      → CRUD sections (dans une page)
  /admin/components    → CRUD composants (dans une section)
  /admin/media         → Upload / gestion des médias
  /admin/features      → Feature flags par plan
  /admin/users         → Gestion des utilisateurs

Tous les endpoints nécessitent is_admin == True.
"""
import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.cms import (
    SiteSettings, Page, Section, Component, MediaAsset,
)
from app.models.site_settings import PageConfig, PlanFeature
from app.middleware.admin import require_admin
from app.services.media_service import upload_media_file, delete_media_file

router = APIRouter(prefix="/admin", tags=["admin"])


# ═══════════════════════════════════════════════
# Pydantic Schemas
# ═══════════════════════════════════════════════

# ── Site Settings ──

class SiteSettingsUpdate(BaseModel):
    site_name: Optional[str] = None
    tagline: Optional[str] = None
    logo_url: Optional[str] = None
    favicon_url: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    accent_color: Optional[str] = None
    background_color: Optional[str] = None
    text_color: Optional[str] = None
    font_family: Optional[str] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    og_image_url: Optional[str] = None
    footer_text: Optional[str] = None
    twitter_url: Optional[str] = None
    instagram_url: Optional[str] = None
    discord_url: Optional[str] = None
    youtube_url: Optional[str] = None
    maintenance_mode: Optional[bool] = None
    maintenance_message: Optional[str] = None
    google_analytics_id: Optional[str] = None
    theme_config: Optional[dict] = None


# ── Pages ──

class PageCreate(BaseModel):
    name: str
    slug: str
    title: Optional[str] = None
    description: Optional[str] = None
    layout: str = "default"
    show_in_nav: bool = True
    nav_label: Optional[str] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    sort_order: int = 0


class PageUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    is_published: Optional[bool] = None
    layout: Optional[str] = None
    show_in_nav: Optional[bool] = None
    nav_label: Optional[str] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    og_image_url: Optional[str] = None
    sort_order: Optional[int] = None


# ── Sections ──

class SectionCreate(BaseModel):
    page_id: int
    name: str
    section_type: str  # hero / features / pricing / cta / …
    sort_order: int = 0
    is_visible: bool = True
    background_color: Optional[str] = None
    background_image_url: Optional[str] = None
    padding_top: Optional[str] = "py-16"
    padding_bottom: Optional[str] = "pb-16"
    max_width: Optional[str] = "max-w-7xl"
    custom_css_class: Optional[str] = None
    settings: Optional[dict] = None


class SectionUpdate(BaseModel):
    name: Optional[str] = None
    section_type: Optional[str] = None
    sort_order: Optional[int] = None
    is_visible: Optional[bool] = None
    background_color: Optional[str] = None
    background_image_url: Optional[str] = None
    padding_top: Optional[str] = None
    padding_bottom: Optional[str] = None
    max_width: Optional[str] = None
    custom_css_class: Optional[str] = None
    settings: Optional[dict] = None


# ── Components ──

class ComponentCreate(BaseModel):
    section_id: int
    component_type: str  # heading / text / image / button / card / …
    sort_order: int = 0
    is_visible: bool = True
    content: Optional[dict] = None
    custom_css_class: Optional[str] = None
    grid_column: Optional[str] = None


class ComponentUpdate(BaseModel):
    component_type: Optional[str] = None
    sort_order: Optional[int] = None
    is_visible: Optional[bool] = None
    content: Optional[dict] = None
    custom_css_class: Optional[str] = None
    grid_column: Optional[str] = None


# ── Plan Features (uses existing PlanFeature model from site_settings.py) ──

class PlanFeatureCreate(BaseModel):
    plan_name: str       # free / pro / unlimited
    feature_name: str    # module identifier
    is_enabled: bool = True
    label: Optional[str] = None


class PlanFeatureUpdate(BaseModel):
    plan_name: Optional[str] = None
    feature_name: Optional[str] = None
    is_enabled: Optional[bool] = None
    label: Optional[str] = None


# ── Users ──

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    subscription_plan: Optional[str] = None
    is_admin: Optional[bool] = None


# ═══════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════

def _serialize_page(page: Page, include_sections: bool = False) -> dict:
    """Sérialise une Page en dict."""
    data = {
        "id": page.id,
        "name": page.name,
        "slug": page.slug,
        "title": page.title,
        "description": page.description,
        "is_published": page.is_published,
        "is_system": page.is_system,
        "layout": page.layout,
        "show_in_nav": page.show_in_nav,
        "nav_label": page.nav_label,
        "sort_order": page.sort_order,
        "meta_title": page.meta_title,
        "meta_description": page.meta_description,
        "og_image_url": page.og_image_url,
        "created_at": page.created_at.isoformat() if page.created_at else None,
        "updated_at": page.updated_at.isoformat() if page.updated_at else None,
        "published_at": page.published_at.isoformat() if page.published_at else None,
    }
    if include_sections:
        data["sections"] = [
            _serialize_section(s, include_components=True)
            for s in (page.sections or [])
        ]
    return data


def _serialize_section(section: Section, include_components: bool = False) -> dict:
    """Sérialise une Section en dict."""
    data = {
        "id": section.id,
        "page_id": section.page_id,
        "name": section.name,
        "section_type": section.section_type,
        "sort_order": section.sort_order,
        "is_visible": section.is_visible,
        "background_color": section.background_color,
        "background_image_url": section.background_image_url,
        "padding_top": section.padding_top,
        "padding_bottom": section.padding_bottom,
        "max_width": section.max_width,
        "custom_css_class": section.custom_css_class,
        "settings": section.settings,
        "created_at": section.created_at.isoformat() if section.created_at else None,
        "updated_at": section.updated_at.isoformat() if section.updated_at else None,
    }
    if include_components:
        data["components"] = [
            _serialize_component(c) for c in (section.components or [])
        ]
    return data


def _serialize_component(comp: Component) -> dict:
    """Sérialise un Component en dict."""
    return {
        "id": comp.id,
        "section_id": comp.section_id,
        "component_type": comp.component_type,
        "sort_order": comp.sort_order,
        "is_visible": comp.is_visible,
        "content": comp.content,
        "custom_css_class": comp.custom_css_class,
        "grid_column": comp.grid_column,
        "created_at": comp.created_at.isoformat() if comp.created_at else None,
        "updated_at": comp.updated_at.isoformat() if comp.updated_at else None,
    }


def _serialize_media(media: MediaAsset) -> dict:
    return {
        "id": media.id,
        "filename": media.filename,
        "file_url": media.file_url,
        "file_size": media.file_size,
        "mime_type": media.mime_type,
        "width": media.width,
        "height": media.height,
        "alt_text": media.alt_text,
        "category": media.category,
        "tags": media.tags,
        "created_at": media.created_at.isoformat() if media.created_at else None,
    }


def _serialize_feature(f: PlanFeature) -> dict:
    return {
        "id": f.id,
        "plan_name": f.plan_name,
        "feature_name": f.feature_name,
        "is_enabled": f.is_enabled,
        "label": f.label,
    }


# ═══════════════════════════════════════════════
# SITE SETTINGS
# ═══════════════════════════════════════════════

@router.get("/settings")
async def get_site_settings(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Récupère la configuration globale du site."""
    settings = db.query(SiteSettings).first()
    if not settings:
        # Créer les settings par défaut
        settings = SiteSettings(id=1)
        db.add(settings)
        db.commit()
        db.refresh(settings)

    return {
        "id": settings.id,
        "site_name": settings.site_name,
        "tagline": settings.tagline,
        "logo_url": settings.logo_url,
        "favicon_url": settings.favicon_url,
        "primary_color": settings.primary_color,
        "secondary_color": settings.secondary_color,
        "accent_color": settings.accent_color,
        "background_color": settings.background_color,
        "text_color": settings.text_color,
        "font_family": settings.font_family,
        "meta_title": settings.meta_title,
        "meta_description": settings.meta_description,
        "og_image_url": settings.og_image_url,
        "footer_text": settings.footer_text,
        "twitter_url": settings.twitter_url,
        "instagram_url": settings.instagram_url,
        "discord_url": settings.discord_url,
        "youtube_url": settings.youtube_url,
        "maintenance_mode": settings.maintenance_mode,
        "maintenance_message": settings.maintenance_message,
        "google_analytics_id": settings.google_analytics_id,
        "theme_config": json.loads(settings.theme_config) if settings.theme_config else None,
        "updated_at": settings.updated_at.isoformat() if settings.updated_at else None,
    }


@router.put("/settings")
async def update_site_settings(
    data: SiteSettingsUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Met à jour la configuration globale du site."""
    settings = db.query(SiteSettings).first()
    if not settings:
        settings = SiteSettings(id=1)
        db.add(settings)

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key == "theme_config" and isinstance(value, dict):
            setattr(settings, key, json.dumps(value, ensure_ascii=False))
        else:
            setattr(settings, key, value)

    settings.updated_by = admin.id
    db.commit()
    db.refresh(settings)

    return {"message": "Settings mises à jour", "settings": await get_site_settings(db, admin)}


# ═══════════════════════════════════════════════
# PAGE CONFIGS (toggle pages on/off)
# ═══════════════════════════════════════════════

@router.get("/settings/pages")
async def list_page_configs(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Liste les page configs (pricing, cgu, etc.) avec leur statut on/off."""
    from app.models.site_settings import DEFAULT_PAGES
    configs = db.query(PageConfig).order_by(PageConfig.id).all()
    if not configs:
        for p in DEFAULT_PAGES:
            pc = PageConfig(**p)
            db.add(pc)
        db.commit()
        configs = db.query(PageConfig).order_by(PageConfig.id).all()
    return [{"id": c.id, "page_name": c.page_name, "label": c.label, "is_enabled": c.is_enabled} for c in configs]


@router.post("/settings/pages", status_code=201)
async def create_page_config(
    data: dict,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Crée une nouvelle page config."""
    existing = db.query(PageConfig).filter(PageConfig.page_name == data.get("page_name")).first()
    if existing:
        raise HTTPException(status_code=409, detail="Page config existe déjà")
    pc = PageConfig(
        page_name=data["page_name"],
        label=data.get("label", data["page_name"]),
        is_enabled=data.get("is_enabled", True),
    )
    db.add(pc)
    db.commit()
    db.refresh(pc)
    return {"id": pc.id, "page_name": pc.page_name, "label": pc.label, "is_enabled": pc.is_enabled}


@router.patch("/settings/pages/{page_name}")
async def toggle_page_config(
    page_name: str,
    data: dict,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Toggle une page on/off."""
    pc = db.query(PageConfig).filter(PageConfig.page_name == page_name).first()
    if not pc:
        raise HTTPException(status_code=404, detail="Page config non trouvée")
    if "is_enabled" in data:
        pc.is_enabled = data["is_enabled"]
    if "label" in data:
        pc.label = data["label"]
    db.commit()
    db.refresh(pc)
    return {"id": pc.id, "page_name": pc.page_name, "label": pc.label, "is_enabled": pc.is_enabled}


@router.delete("/settings/pages/{page_name}")
async def delete_page_config(
    page_name: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Supprime une page config."""
    pc = db.query(PageConfig).filter(PageConfig.page_name == page_name).first()
    if not pc:
        raise HTTPException(status_code=404, detail="Page config non trouvée")
    db.delete(pc)
    db.commit()
    return {"message": f"Page config '{page_name}' supprimée"}


# ═══════════════════════════════════════════════
# PAGES (CMS)
# ═══════════════════════════════════════════════

@router.get("/pages")
async def list_pages(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Liste toutes les pages (triées par sort_order)."""
    pages = db.query(Page).order_by(Page.sort_order, Page.id).all()
    return [_serialize_page(p) for p in pages]


@router.get("/pages/{page_id}")
async def get_page(
    page_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Récupère une page avec toutes ses sections et composants."""
    page = db.query(Page).filter(Page.id == page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page non trouvée")
    return _serialize_page(page, include_sections=True)


@router.post("/pages", status_code=201)
async def create_page(
    data: PageCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Crée une nouvelle page."""
    # Vérifier unicité du slug
    existing = db.query(Page).filter(Page.slug == data.slug).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Le slug '{data.slug}' existe déjà")

    page = Page(
        **data.model_dump(),
        created_by=admin.id,
    )
    db.add(page)
    db.commit()
    db.refresh(page)

    return _serialize_page(page)


@router.put("/pages/{page_id}")
async def update_page(
    page_id: int,
    data: PageUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Met à jour une page."""
    page = db.query(Page).filter(Page.id == page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page non trouvée")

    update_data = data.model_dump(exclude_unset=True)

    # Vérifier unicité du slug si modifié
    if "slug" in update_data and update_data["slug"] != page.slug:
        existing = db.query(Page).filter(Page.slug == update_data["slug"]).first()
        if existing:
            raise HTTPException(status_code=409, detail=f"Le slug '{update_data['slug']}' existe déjà")

    # Gérer publication
    if "is_published" in update_data and update_data["is_published"] and not page.is_published:
        page.published_at = datetime.utcnow()

    for key, value in update_data.items():
        setattr(page, key, value)

    db.commit()
    db.refresh(page)

    return _serialize_page(page)


@router.delete("/pages/{page_id}")
async def delete_page(
    page_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Supprime une page (sauf les pages système)."""
    page = db.query(Page).filter(Page.id == page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page non trouvée")
    if page.is_system:
        raise HTTPException(status_code=403, detail="Impossible de supprimer une page système")

    db.delete(page)
    db.commit()
    return {"message": f"Page '{page.name}' supprimée"}


@router.put("/pages/{page_id}/publish")
async def publish_page(
    page_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Publie ou dépublie une page."""
    page = db.query(Page).filter(Page.id == page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page non trouvée")

    page.is_published = not page.is_published
    if page.is_published:
        page.published_at = datetime.utcnow()
    db.commit()
    db.refresh(page)

    status = "publiée" if page.is_published else "dépubliée"
    return {"message": f"Page '{page.name}' {status}", "is_published": page.is_published}


# ═══════════════════════════════════════════════
# SECTIONS
# ═══════════════════════════════════════════════

@router.get("/pages/{page_id}/sections")
async def list_sections(
    page_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Liste les sections d'une page (triées par sort_order)."""
    page = db.query(Page).filter(Page.id == page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page non trouvée")

    sections = (
        db.query(Section)
        .filter(Section.page_id == page_id)
        .order_by(Section.sort_order)
        .all()
    )
    return [_serialize_section(s, include_components=True) for s in sections]


@router.post("/sections", status_code=201)
async def create_section(
    data: SectionCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Crée une nouvelle section dans une page."""
    page = db.query(Page).filter(Page.id == data.page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page non trouvée")

    section_data = data.model_dump(exclude={"settings"})
    section = Section(**section_data)

    if data.settings:
        section.settings = data.settings

    db.add(section)
    db.commit()
    db.refresh(section)

    return _serialize_section(section)


@router.put("/sections/{section_id}")
async def update_section(
    section_id: int,
    data: SectionUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Met à jour une section."""
    section = db.query(Section).filter(Section.id == section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section non trouvée")

    update_data = data.model_dump(exclude_unset=True)

    # Gérer settings séparément (c'est un dict → JSON)
    if "settings" in update_data:
        section.settings = update_data.pop("settings")

    for key, value in update_data.items():
        setattr(section, key, value)

    db.commit()
    db.refresh(section)

    return _serialize_section(section)


@router.delete("/sections/{section_id}")
async def delete_section(
    section_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Supprime une section et tous ses composants."""
    section = db.query(Section).filter(Section.id == section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section non trouvée")

    db.delete(section)
    db.commit()
    return {"message": f"Section '{section.name}' supprimée"}


@router.put("/sections/reorder")
async def reorder_sections(
    orders: list[dict],
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Réordonne les sections. Attend une liste de {id, sort_order}.
    Ex: [{"id": 1, "sort_order": 0}, {"id": 2, "sort_order": 1}]
    """
    for item in orders:
        section = db.query(Section).filter(Section.id == item["id"]).first()
        if section:
            section.sort_order = item["sort_order"]

    db.commit()
    return {"message": f"{len(orders)} sections réordonnées"}


# ═══════════════════════════════════════════════
# COMPONENTS
# ═══════════════════════════════════════════════

@router.post("/components", status_code=201)
async def create_component(
    data: ComponentCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Crée un composant dans une section."""
    section = db.query(Section).filter(Section.id == data.section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section non trouvée")

    comp_data = data.model_dump(exclude={"content"})
    comp = Component(**comp_data)

    if data.content:
        comp.content = data.content

    db.add(comp)
    db.commit()
    db.refresh(comp)

    return _serialize_component(comp)


@router.put("/components/{component_id}")
async def update_component(
    component_id: int,
    data: ComponentUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Met à jour un composant."""
    comp = db.query(Component).filter(Component.id == component_id).first()
    if not comp:
        raise HTTPException(status_code=404, detail="Composant non trouvé")

    update_data = data.model_dump(exclude_unset=True)

    if "content" in update_data:
        comp.content = update_data.pop("content")

    for key, value in update_data.items():
        setattr(comp, key, value)

    db.commit()
    db.refresh(comp)

    return _serialize_component(comp)


@router.delete("/components/{component_id}")
async def delete_component(
    component_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Supprime un composant."""
    comp = db.query(Component).filter(Component.id == component_id).first()
    if not comp:
        raise HTTPException(status_code=404, detail="Composant non trouvé")

    db.delete(comp)
    db.commit()
    return {"message": "Composant supprimé"}


@router.put("/components/reorder")
async def reorder_components(
    orders: list[dict],
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Réordonne les composants. Attend une liste de {id, sort_order}.
    Supporte aussi le déplacement entre sections via {id, sort_order, section_id}.
    """
    for item in orders:
        comp = db.query(Component).filter(Component.id == item["id"]).first()
        if comp:
            comp.sort_order = item["sort_order"]
            if "section_id" in item:
                comp.section_id = item["section_id"]

    db.commit()
    return {"message": f"{len(orders)} composants réordonnés"}


# ═══════════════════════════════════════════════
# MEDIA
# ═══════════════════════════════════════════════

@router.get("/media")
async def list_media(
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Liste tous les fichiers médias, optionnellement filtrés par catégorie."""
    query = db.query(MediaAsset).order_by(MediaAsset.created_at.desc())
    if category:
        query = query.filter(MediaAsset.category == category)
    return [_serialize_media(m) for m in query.all()]


@router.post("/media", status_code=201)
async def upload_media(
    file: UploadFile = File(...),
    category: str = Query(default="general"),
    alt_text: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Upload un fichier média."""
    result = await upload_media_file(file, category=category)

    media = MediaAsset(
        filename=result["filename"],
        stored_filename=result["stored_filename"],
        file_url=result["file_url"],
        file_size=result["file_size"],
        mime_type=result["mime_type"],
        alt_text=alt_text,
        category=category,
        uploaded_by=admin.id,
    )
    db.add(media)
    db.commit()
    db.refresh(media)

    return _serialize_media(media)


@router.put("/media/{media_id}")
async def update_media(
    media_id: int,
    alt_text: Optional[str] = None,
    category: Optional[str] = None,
    tags: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Met à jour les métadonnées d'un média."""
    media = db.query(MediaAsset).filter(MediaAsset.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Média non trouvé")

    if alt_text is not None:
        media.alt_text = alt_text
    if category is not None:
        media.category = category
    if tags is not None:
        media.tags = tags

    db.commit()
    db.refresh(media)

    return _serialize_media(media)


@router.delete("/media/{media_id}")
async def delete_media(
    media_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Supprime un fichier média (DB + fichier)."""
    media = db.query(MediaAsset).filter(MediaAsset.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Média non trouvé")

    # Supprimer le fichier physique
    delete_media_file(media.stored_filename)

    db.delete(media)
    db.commit()
    return {"message": f"Média '{media.filename}' supprimé"}


# ═══════════════════════════════════════════════
# PLAN FEATURES
# ═══════════════════════════════════════════════

@router.get("/features")
async def list_features(
    plan: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Liste toutes les features flags, optionnellement filtrées par plan."""
    query = db.query(PlanFeature).order_by(PlanFeature.plan_name, PlanFeature.id)
    if plan:
        query = query.filter(PlanFeature.plan_name == plan)
    return [_serialize_feature(f) for f in query.all()]


@router.post("/features", status_code=201)
async def create_feature(
    data: PlanFeatureCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Crée un feature flag."""
    existing = db.query(PlanFeature).filter(
        PlanFeature.plan_name == data.plan_name,
        PlanFeature.feature_name == data.feature_name,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Feature '{data.feature_name}' pour plan '{data.plan_name}' existe déjà")

    feature = PlanFeature(**data.model_dump())
    db.add(feature)
    db.commit()
    db.refresh(feature)

    return _serialize_feature(feature)


@router.put("/features/{feature_id}")
async def update_feature(
    feature_id: int,
    data: PlanFeatureUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Met à jour un feature flag."""
    feature = db.query(PlanFeature).filter(PlanFeature.id == feature_id).first()
    if not feature:
        raise HTTPException(status_code=404, detail="Feature non trouvée")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(feature, key, value)

    db.commit()
    db.refresh(feature)

    return _serialize_feature(feature)


@router.delete("/features/{feature_id}")
async def delete_feature(
    feature_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Supprime un feature flag."""
    feature = db.query(PlanFeature).filter(PlanFeature.id == feature_id).first()
    if not feature:
        raise HTTPException(status_code=404, detail="Feature non trouvée")

    db.delete(feature)
    db.commit()
    return {"message": f"Feature '{feature.feature_key}' supprimée"}


# ═══════════════════════════════════════════════
# USERS (Admin management)
# ═══════════════════════════════════════════════

@router.get("/users")
async def list_users(
    search: Optional[str] = None,
    plan: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Liste les utilisateurs avec filtres et pagination."""
    query = db.query(User).order_by(User.created_at.desc())

    if search:
        query = query.filter(
            (User.email.ilike(f"%{search}%")) | (User.name.ilike(f"%{search}%"))
        )
    if plan:
        query = query.filter(User.subscription_plan == plan)

    total = query.count()
    users = query.offset(skip).limit(limit).all()

    return {
        "total": total,
        "users": [
            {
                "id": u.id,
                "email": u.email,
                "name": u.name,
                "subscription_plan": u.subscription_plan,
                "is_admin": u.is_admin,
                "email_verified": u.email_verified,
                "oauth_provider": u.oauth_provider,
                "organization_id": u.organization_id,
                "org_role": u.org_role,
                "tracks_today": u.tracks_today,
                "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in users
        ],
    }


@router.get("/users/{user_id}")
async def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Récupère les détails d'un utilisateur."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "subscription_plan": user.subscription_plan,
        "is_admin": user.is_admin,
        "email_verified": user.email_verified,
        "oauth_provider": user.oauth_provider,
        "organization_id": user.organization_id,
        "org_role": user.org_role,
        "avatar_url": user.avatar_url,
        "tracks_today": user.tracks_today,
        "last_track_date": user.last_track_date.isoformat() if user.last_track_date else None,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Met à jour un utilisateur (plan, rôle admin, etc.)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    update_data = data.model_dump(exclude_unset=True)

    # Protection : un admin ne peut pas se retirer ses propres droits admin
    if "is_admin" in update_data and user.id == admin.id and not update_data["is_admin"]:
        raise HTTPException(
            status_code=400,
            detail="Impossible de retirer vos propres droits admin",
        )

    for key, value in update_data.items():
        setattr(user, key, value)

    db.commit()
    db.refresh(user)

    return {"message": f"Utilisateur {user.email} mis à jour"}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Supprime un utilisateur."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    # Protection : un admin ne peut pas se supprimer
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Impossible de supprimer votre propre compte")

    db.delete(user)
    db.commit()
    return {"message": f"Utilisateur {user.email} supprimé"}


# ═══════════════════════════════════════════════
# DASHBOARD / STATS (bonus)
# ═══════════════════════════════════════════════

@router.get("/dashboard")
async def admin_dashboard(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Stats rapides pour le dashboard admin."""
    from app.models.organization import Organization

    total_users = db.query(User).count()
    verified_users = db.query(User).filter(User.email_verified == True).count()
    admin_users = db.query(User).filter(User.is_admin == True).count()
    total_orgs = db.query(Organization).count()
    total_pages = db.query(Page).count()
    published_pages = db.query(Page).filter(Page.is_published == True).count()
    total_media = db.query(MediaAsset).count()

    # Répartition par plan
    plans = {}
    for plan_name in ("free", "pro", "unlimited", "enterprise"):
        plans[plan_name] = db.query(User).filter(User.subscription_plan == plan_name).count()

    return {
        "users": {
            "total": total_users,
            "verified": verified_users,
            "admins": admin_users,
            "by_plan": plans,
        },
        "organizations": total_orgs,
        "pages": {
            "total": total_pages,
            "published": published_pages,
        },
        "media": total_media,
    }


# ═══════════════════════════════════════════════
# PUBLIC ENDPOINTS (no admin required)
# Pour que le frontend puisse lire le contenu
# ═══════════════════════════════════════════════

public_router = APIRouter(prefix="/site", tags=["site"])


@public_router.get("/settings")
async def get_public_settings(db: Session = Depends(get_db)):
    """Config publique du site (thème, couleurs, branding)."""
    settings = db.query(SiteSettings).first()
    if not settings:
        return {
            "site_name": "CueForge",
            "tagline": "AI-Powered Cue Points for DJs",
            "primary_color": "#6366f1",
            "secondary_color": "#8b5cf6",
            "accent_color": "#06b6d4",
            "background_color": "#0f172a",
            "text_color": "#f8fafc",
            "font_family": "Inter",
            "maintenance_mode": False,
        }

    return {
        "site_name": settings.site_name,
        "tagline": settings.tagline,
        "logo_url": settings.logo_url,
        "favicon_url": settings.favicon_url,
        "primary_color": settings.primary_color,
        "secondary_color": settings.secondary_color,
        "accent_color": settings.accent_color,
        "background_color": settings.background_color,
        "text_color": settings.text_color,
        "font_family": settings.font_family,
        "meta_title": settings.meta_title,
        "meta_description": settings.meta_description,
        "og_image_url": settings.og_image_url,
        "footer_text": settings.footer_text,
        "twitter_url": settings.twitter_url,
        "instagram_url": settings.instagram_url,
        "discord_url": settings.discord_url,
        "youtube_url": settings.youtube_url,
        "maintenance_mode": settings.maintenance_mode,
        "maintenance_message": settings.maintenance_message,
        "theme_config": json.loads(settings.theme_config) if settings.theme_config else None,
    }


@public_router.get("/pages")
async def get_public_pages(db: Session = Depends(get_db)):
    """Liste des pages publiées (pour le menu de navigation)."""
    pages = (
        db.query(Page)
        .filter(Page.is_published == True, Page.show_in_nav == True)
        .order_by(Page.sort_order)
        .all()
    )
    return [
        {
            "slug": p.slug,
            "name": p.name,
            "nav_label": p.nav_label or p.name,
            "title": p.title,
        }
        for p in pages
    ]


@public_router.get("/pages/{slug}")
async def get_public_page(slug: str, db: Session = Depends(get_db)):
    """Récupère le contenu complet d'une page publiée."""
    page = db.query(Page).filter(Page.slug == slug, Page.is_published == True).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page non trouvée")

    return _serialize_page(page, include_sections=True)


@public_router.get("/features")
async def get_public_features(db: Session = Depends(get_db)):
    """Liste des features par plan pour la page pricing."""
    features = db.query(PlanFeature).filter(PlanFeature.is_enabled == True).all()
    return [_serialize_feature(f) for f in features]
