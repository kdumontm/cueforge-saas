"""Router admin — Configuration globale du site (SiteSettings)."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.cms import SiteSettings
from app.middleware.admin import require_admin
from app.routers.admin.schemas import SiteSettingsUpdate

router = APIRouter(prefix="/admin", tags=["admin-settings"])


@router.get("/settings")
async def get_site_settings(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Récupère la configuration globale du site."""
    settings = db.query(SiteSettings).first()
    if not settings:
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
        setattr(settings, key, value)

    settings.updated_by = admin.id
    db.commit()
    db.refresh(settings)

    return {"message": "Settings mises à jour", "settings": await get_site_settings(db, admin)}
