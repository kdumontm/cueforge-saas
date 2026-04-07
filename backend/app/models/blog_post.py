"""
BlogPost Model — Articles de blog et contenu marketing
"""
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime,
    ForeignKey, JSON, Index,
)
from sqlalchemy.orm import relationship

from app.database import Base


class BlogPost(Base):
    """Article de blog publié."""

    __tablename__ = "blog_posts"

    id = Column(Integer, primary_key=True, index=True)

    # Content
    title = Column(String(255), nullable=False)
    slug = Column(String(255), unique=True, nullable=False, index=True)
    excerpt = Column(Text, nullable=True)
    content = Column(Text, nullable=False)  # Markdown content

    # Metadata
    author = Column(String(255), nullable=True)
    cover_image_url = Column(String, nullable=True)
    tags = Column(JSON, default=list, nullable=False)  # ["tag1", "tag2", ...]

    # Publishing
    published = Column(Boolean, default=False, nullable=False, index=True)
    published_at = Column(DateTime, nullable=True, index=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('ix_blog_post_published_at', 'published', 'published_at'),
    )
