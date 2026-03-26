from sqlalchemy import Column, Integer, String, Boolean
from app.database import Base


class PageConfig(Base):
    __tablename__ = "page_configs"

    id = Column(Integer, primary_key=True, index=True)
    page_name = Column(String(100), unique=True, nullable=False, index=True)
    is_enabled = Column(Boolean, default=True, nullable=False)
    label = Column(String(255), nullable=True)

    def __repr__(self):
        return f"<PageConfig {self.page_name} enabled={self.is_enabled}>"


# Default pages that can be toggled
DEFAULT_PAGES = [
    {"page_name": "pricing", "label": "Page Tarification", "is_enabled": True},
    {"page_name": "cgu", "label": "Conditions Générales d'Utilisation", "is_enabled": True},
]
