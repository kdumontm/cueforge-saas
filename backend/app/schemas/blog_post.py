"""
Schemas — Blog Posts
"""
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime


class BlogPostCreate(BaseModel):
    """Schéma pour créer un article."""
    title: str
    slug: str
    excerpt: Optional[str] = None
    content: str
    author: Optional[str] = None
    cover_image_url: Optional[str] = None
    tags: List[str] = []
    published: bool = False
    published_at: Optional[datetime] = None


class BlogPostUpdate(BaseModel):
    """Schéma pour mettre à jour un article."""
    title: Optional[str] = None
    slug: Optional[str] = None
    excerpt: Optional[str] = None
    content: Optional[str] = None
    author: Optional[str] = None
    cover_image_url: Optional[str] = None
    tags: Optional[List[str]] = None
    published: Optional[bool] = None
    published_at: Optional[datetime] = None


class BlogPostResponse(BaseModel):
    """Réponse simplifiée d'un article (pour les listes)."""
    id: int
    title: str
    slug: str
    excerpt: Optional[str]
    author: Optional[str]
    cover_image_url: Optional[str]
    tags: List[str]
    published_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class BlogPostDetailResponse(BaseModel):
    """Réponse détaillée d'un article (avec le contenu complet)."""
    id: int
    title: str
    slug: str
    excerpt: Optional[str]
    content: str
    author: Optional[str]
    cover_image_url: Optional[str]
    tags: List[str]
    published: bool
    published_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
