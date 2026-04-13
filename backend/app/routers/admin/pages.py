"""Router admin — CRUD des Pages."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.cms import Page
from app.middleware.admin import require_admin
from app.routers.admin.schemas import PageCreate, PageUpdate
from app.routers.admin.serializers import serialize_page

router = APIRouter(prefix="/admin", tags=["admin-pages"])


@router.get("/pages")
async def list_pages(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Liste toutes les pages (triées par sort_order)."""
    pages = db.query(Page).order_by(Page.sort_order, Page.id).all()
    return [serialize_page(p) for p in pages]


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
    return serialize_page(page, include_sections=True)


@router.post("/pages", status_code=201)
async def create_page(
    data: PageCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Crée une nouvelle page."""
    existing = db.query(Page).filter(Page.slug == data.slug).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Le slug '{data.slug}' existe déjà")

    page = Page(**data.model_dump(), created_by=admin.id)
    db.add(page)
    db.commit()
    db.refresh(page)
    return serialize_page(page)


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

    if "slug" in update_data and update_data["slug"] != page.slug:
        existing = db.query(Page).filter(Page.slug == update_data["slug"]).first()
        if existing:
            raise HTTPException(status_code=409, detail=f"Le slug '{update_data['slug']}' existe déjà")

    if "is_published" in update_data and update_data["is_published"] and not page.is_published:
        page.published_at = datetime.utcnow()

    for key, value in update_data.items():
        setattr(page, key, value)

    db.commit()
    db.refresh(page)
    return serialize_page(page)


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
