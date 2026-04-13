"""
Endpoints publics du site — pas besoin d'être admin.
Utilisés par le frontend pour afficher le contenu.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.cms import SiteSettings, Page
from app.models.site_settings import PlanFeature, FeatureLock, DEFAULT_PLAN_FEATURES
from app.middleware.auth import get_current_user
from app.routers.admin.serializers import serialize_page, serialize_feature

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
    return serialize_page(page, include_sections=True)


@public_router.get("/features")
async def get_public_features(db: Session = Depends(get_db)):
    """Liste des features par plan pour la page pricing."""
    features = db.query(PlanFeature).filter(PlanFeature.is_enabled == True).all()
    return [serialize_feature(f) for f in features]


@public_router.get("/features/check")
async def check_user_features(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Retourne les features actives pour l'utilisateur connecté."""
    all_feature_names = [f["feature_name"] for f in DEFAULT_PLAN_FEATURES]

    if getattr(user, "is_admin", False):
        return {
            "features": {name: True for name in all_feature_names},
            "is_admin": True,
        }

    plan = getattr(user, "subscription_plan", "free") or "free"
    plan_features = db.query(PlanFeature).filter(PlanFeature.plan_name == plan).all()
    enabled_set = {f.feature_name for f in plan_features if f.is_enabled}

    return {
        "features": {name: (name in enabled_set) for name in all_feature_names},
        "is_admin": False,
    }


@public_router.get("/plan-features/{plan_name}")
async def get_plan_features_public(plan_name: str, db: Session = Depends(get_db)):
    """Retourne les features pour un plan donné (endpoint public)."""
    all_features = db.query(PlanFeature).filter(PlanFeature.plan_name == plan_name).all()
    result: dict[str, bool] = {}
    labels: dict[str, str] = {}
    display_modes: dict[str, str] = {}

    for f in all_features:
        result[f.feature_name] = f.is_enabled
        display_modes[f.feature_name] = getattr(f, "display_mode", "locked") or "locked"
        if f.label:
            labels[f.feature_name] = f.label

    return {"plan": plan_name, "features": result, "feature_labels": labels, "display_modes": display_modes}


@public_router.get("/feature-locks")
async def get_feature_locks_public(db: Session = Depends(get_db)):
    """Endpoint public pour vérifier les verrous."""
    locks = db.query(FeatureLock).filter(FeatureLock.is_locked == True).all()
    return {
        lk.feature_name: {
            "label": lk.label,
            "locked_at": str(lk.locked_at) if lk.locked_at else None,
            "note": lk.note,
        }
        for lk in locks
    }
