"""
CMS Models — Back-office visuel pour CueForge.

Architecture :
  SiteSettings  → config globale du site (thème, couleurs, logo, meta)
  Page          → pages du site (landing, pricing, features, about…)
  Section       → blocs ordonnés au sein d’une page (hero, features grid, CTA…)
  Component     → éléments au sein d’une section (texte, image, bouton, card…)
  MediaAsset    → fichiers uploadés (images, logos)

Note : PlanFeature et PageConfig restent dans models/site_settings.py

Le contenu de chaque Component est stocké en JSON dans `content_json`,
ce qui permet au frontend d’afficher n’importe quel type de composant
sans changer le schéma de la DB.
"""
from datetime import datetime
import json

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime,
    ForeignKey, Text,
)
from sqlalchemy.orm import relationship

from app.database import Base


# ─────────────────────────────────────────────
# Site Settings (singleton-like, row id=1)
# ─────────────────────────────────────────────

class SiteSettings(Base):
    """Configuration globale du site — thème, couleurs, SEO par défaut."""

    __tablename__ = "site_settings"

    id = Column(Integer, primary_key=True, default=1)

    # Branding
    site_name = Column(String, default="CueForge", nullable=False)
    tagline = Column(String, default="AI-Powered Cue Points for DJs", nullable=True)
    logo_url = Column(String, nullable=True)
    favicon_url = Column(String, nullable=True)

    # Theme / Couleurs
    primary_color = Column(String, default="#6366f1", nullable=False)
    secondary_color = Column(String, default="#8b5cf6", nullable=False)
    accent_color = Column(String, default="#06b6d4", nullable=False)
    background_color = Column(String, default="#0f172a", nullable=False)
    text_color = Column(String, default="#f8fafc", nullable=False)
    font_family = Column(String, default="Inter", nullable=False)

    # SEO global
    meta_title = Column(String, default="CueForge — Smart Cue Points for DJs", nullable=True)
    meta_description = Column(Text, nullable=True)
    og_image_url = Column(String, nullable=True)

    # Footer / Social
    footer_text = Column(String, nullable=True)
    twitter_url = Column(String, nullable=True)
    instagram_url = Column(String, nullable=True)
    discord_url = Column(String, nullable=True)
    youtube_url = Column(String, nullable=True)

    # Maintenance
    maintenance_mode = Column(Boolean, default=False, nullable=False)
    maintenance_message = Column(Text, nullable=True)

    # Analytics
    google_analytics_id = Column(String, nullable=True)

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)


# ─────────────────────────────────────────────
# Pages
# ─────────────────────────────────────────────

class Page(Base):
    """Page administrable du site."""

    __tablename__ = "pages"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, index=True, nullable=False)
    title = Column(String, nullable=True)
    description = Column(Text, nullable=True)

    is_published = Column(Boolean, default=False, nullable=False)
    is_system = Column(Boolean, default=False, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)

    layout = Column(String, default="default", nullable=False)

    show_in_nav = Column(Boolean, default=True, nullable=False)
    nav_label = Column(String, nullable=True)

    meta_title = Column(String, nullable=True)
    meta_description = Column(Text, nullable=True)
    og_image_url = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    published_at = Column(DateTime, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    sections = relationship(
        "Section",
        back_populates="page",
        cascade="all, delete-orphan",
        order_by="Section.sort_order",
    )


# ─────────────────────────────────────────────
# Sections
# ─────────────────────────────────────────────

class Section(Base):
    """Bloc / section au sein d'une page."""

    __tablename__ = "sections"

    id = Column(Integer, primary_key=True, index=True)
    page_id = Column(Integer, ForeignKey("pages.id", ondelete="CASCADE"), nullable=False)

    name = Column(String, nullable=False)
    section_type = Column(String, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)

    is_visible = Column(Boolean, default=True, nullable=False)

    background_color = Column(String, nullable=True)
    background_image_url = Column(String, nullable=True)
    padding_top = Column(String, default="py-16", nullable=True)
    padding_bottom = Column(String, default="pb-16", nullable=True)
    max_width = Column(String, default="max-w-7xl", nullable=True)
    custom_css_class = Column(String, nullable=True)

    settings_json = Column(Text, default="{}", nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    page = relationship("Page", back_populates="sections")
    components = relationship(
        "Component",
        back_populates="section",
        cascade="all, delete-orphan",
        order_by="Component.sort_order",
    )

    @property
    def settings(self) -> dict:
        try:
            return json.loads(self.settings_json or "{}")
        except (json.JSONDecodeError, TypeError):
            return {}

    @settings.setter
    def settings(self, value: dict):
        self.settings_json = json.dumps(value, ensure_ascii=False)


# ─────────────────────────────────────────────
# Components
# ─────────────────────────────────────────────

class Component(Base):
    """Element individuel au sein d'une section. Contenu en JSON."""

    __tablename__ = "components"

    id = Column(Integer, primary_key=True, index=True)
    section_id = Column(Integer, ForeignKey("sections.id", ondelete="CASCADE"), nullable=False)

    component_type = Column(String, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)

    is_visible = Column(Boolean, default=True, nullable=False)

    content_json = Column(Text, default="{}", nullable=False)

    custom_css_class = Column(String, nullable=True)
    grid_column = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    section = relationship("Section", back_populates="components")

    @property
    def content(self) -> dict:
        try:
            return json.loads(self.content_json or "{}")
        except (json.JSONDecodeError, TypeError):
            return {}

    @content.setter
    def content(self, value: dict):
        self.content_json = json.dumps(value, ensure_ascii=False)


# ─────────────────────────────────────────────
# Media Assets
# ─────────────────────────────────────────────

class MediaAsset(Base):
    """Fichier media uploade (images, logos, etc.)."""

    __tablename__ = "media_assets"

    id = Column(Integer, primary_key=True, index=True)

    filename = Column(String, nullable=False)
    stored_filename = Column(String, nullable=False)
    file_url = Column(String, nullable=False)
    file_size = Column(Integer, nullable=True)
    mime_type = Column(String, nullable=True)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)

    alt_text = Column(String, nullable=True)
    category = Column(String, default="general", nullable=False)
    tags = Column(String, nullable=True)

    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
