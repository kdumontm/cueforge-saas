"""
Fonctions de sérialisation partagées par les routers admin.
Chaque modèle a son _serialize_* pour éviter de dupliquer ce code.
"""
from app.models.cms import Page, Section, Component, MediaAsset
from app.models.site_settings import PlanFeature, FeatureLock


def serialize_page(page: Page, include_sections: bool = False) -> dict:
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
            serialize_section(s, include_components=True)
            for s in (page.sections or [])
        ]
    return data


def serialize_section(section: Section, include_components: bool = False) -> dict:
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
            serialize_component(c) for c in (section.components or [])
        ]
    return data


def serialize_component(comp: Component) -> dict:
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


def serialize_media(media: MediaAsset) -> dict:
    """Sérialise un MediaAsset en dict."""
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


def serialize_feature(f: PlanFeature) -> dict:
    """Sérialise un PlanFeature en dict."""
    return {
        "id": f.id,
        "plan_name": f.plan_name,
        "feature_name": f.feature_name,
        "is_enabled": f.is_enabled,
        "label": f.label,
        "display_mode": getattr(f, "display_mode", "locked") or "locked",
    }


def serialize_lock(lk: FeatureLock) -> dict:
    """Sérialise un FeatureLock en dict."""
    return {
        "id": lk.id,
        "feature_name": lk.feature_name,
        "label": lk.label,
        "is_locked": lk.is_locked,
        "locked_at": str(lk.locked_at) if lk.locked_at else None,
        "note": lk.note,
    }
