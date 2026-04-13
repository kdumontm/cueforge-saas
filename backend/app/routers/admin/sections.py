"""Router admin — CRUD des Sections."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.cms import Page, Section
from app.middleware.admin import require_admin
from app.routers.admin.schemas import SectionCreate, SectionUpdate
from app.routers.admin.serializers import serialize_section

router = APIRouter(prefix="/admin", tags=["admin-sections"])


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
    return [serialize_section(s, include_components=True) for s in sections]


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
    return serialize_section(section)


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

    if "settings" in update_data:
        section.settings = update_data.pop("settings")

    for key, value in update_data.items():
        setattr(section, key, value)

    db.commit()
    db.refresh(section)
    return serialize_section(section)


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
    """Réordonne les sections. Attend une liste de {id, sort_order}."""
    for item in orders:
        section = db.query(Section).filter(Section.id == item["id"]).first()
        if section:
            section.sort_order = item["sort_order"]

    db.commit()
    return {"message": f"{len(orders)} sections réordonnées"}
