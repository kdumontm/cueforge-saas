"""Router admin — CRUD des Components."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.cms import Section, Component
from app.middleware.admin import require_admin
from app.routers.admin.schemas import ComponentCreate, ComponentUpdate
from app.routers.admin.serializers import serialize_component

router = APIRouter(prefix="/admin", tags=["admin-components"])


@router.post("/components", status_code=201)
async def create_component(
    data: ComponentCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Crée un composant dans une section."""
    section = db.query(Section).filter(Section.id == data.section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section non trouvée")

    comp_data = data.model_dump(exclude={"content"})
    comp = Component(**comp_data)

    if data.content:
        comp.content = data.content

    db.add(comp)
    db.commit()
    db.refresh(comp)
    return serialize_component(comp)


@router.put("/components/{component_id}")
async def update_component(
    component_id: int,
    data: ComponentUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Met à jour un composant."""
    comp = db.query(Component).filter(Component.id == component_id).first()
    if not comp:
        raise HTTPException(status_code=404, detail="Composant non trouvé")

    update_data = data.model_dump(exclude_unset=True)

    if "content" in update_data:
        comp.content = update_data.pop("content")

    for key, value in update_data.items():
        setattr(comp, key, value)

    db.commit()
    db.refresh(comp)
    return serialize_component(comp)


@router.delete("/components/{component_id}")
async def delete_component(
    component_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Supprime un composant."""
    comp = db.query(Component).filter(Component.id == component_id).first()
    if not comp:
        raise HTTPException(status_code=404, detail="Composant non trouvé")

    db.delete(comp)
    db.commit()
    return {"message": "Composant supprimé"}


@router.put("/components/reorder")
async def reorder_components(
    orders: list[dict],
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Réordonne les composants. Supporte le déplacement entre sections."""
    for item in orders:
        comp = db.query(Component).filter(Component.id == item["id"]).first()
        if comp:
            comp.sort_order = item["sort_order"]
            if "section_id" in item:
                comp.section_id = item["section_id"]

    db.commit()
    return {"message": f"{len(orders)} composants réordonnés"}
