"""Router admin — Upload et gestion des médias."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.cms import MediaAsset
from app.middleware.admin import require_admin
from app.services.media_service import upload_media_file, delete_media_file
from app.routers.admin.serializers import serialize_media

router = APIRouter(prefix="/admin", tags=["admin-media"])


@router.get("/media")
async def list_media(
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Liste tous les fichiers médias, optionnellement filtrés par catégorie."""
    query = db.query(MediaAsset).order_by(MediaAsset.created_at.desc())
    if category:
        query = query.filter(MediaAsset.category == category)
    return [serialize_media(m) for m in query.all()]


@router.post("/media", status_code=201)
async def upload_media(
    file: UploadFile = File(...),
    category: str = Query(default="general"),
    alt_text: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Upload un fichier média."""
    result = await upload_media_file(file, category=category)

    media = MediaAsset(
        filename=result["filename"],
        stored_filename=result["stored_filename"],
        file_url=result["file_url"],
        file_size=result["file_size"],
        mime_type=result["mime_type"],
        alt_text=alt_text,
        category=category,
        uploaded_by=admin.id,
    )
    db.add(media)
    db.commit()
    db.refresh(media)
    return serialize_media(media)


@router.put("/media/{media_id}")
async def update_media(
    media_id: int,
    alt_text: Optional[str] = None,
    category: Optional[str] = None,
    tags: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Met à jour les métadonnées d'un média."""
    media = db.query(MediaAsset).filter(MediaAsset.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Média non trouvé")

    if alt_text is not None:
        media.alt_text = alt_text
    if category is not None:
        media.category = category
    if tags is not None:
        media.tags = tags

    db.commit()
    db.refresh(media)
    return serialize_media(media)


@router.delete("/media/{media_id}")
async def delete_media(
    media_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Supprime un fichier média (DB + fichier)."""
    media = db.query(MediaAsset).filter(MediaAsset.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Média non trouvé")

    delete_media_file(media.stored_filename)
    db.delete(media)
    db.commit()
    return {"message": f"Média '{media.filename}' supprimé"}
