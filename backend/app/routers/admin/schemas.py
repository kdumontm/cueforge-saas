"""
Pydantic schemas partagés par les routers admin.
"""
from typing import Optional
from pydantic import BaseModel


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
    section_type: str
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
    component_type: str
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


# ── Plan Features ──

class PlanFeatureCreate(BaseModel):
    plan_name: str
    feature_name: str
    is_enabled: bool = True
    label: Optional[str] = None
    display_mode: str = "locked"


class PlanFeatureUpdate(BaseModel):
    plan_name: Optional[str] = None
    feature_name: Optional[str] = None
    is_enabled: Optional[bool] = None
    label: Optional[str] = None
    display_mode: Optional[str] = None


class BulkFeatureUpdate(BaseModel):
    is_enabled: bool


class BulkDisplayModeUpdate(BaseModel):
    display_mode: str


# ── Users ──

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    subscription_plan: Optional[str] = None
    is_admin: Optional[bool] = None
    use_stem_separation: Optional[bool] = None
