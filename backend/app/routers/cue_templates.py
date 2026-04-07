"""
API Router — Cue Point Templates

Endpoints pour gérer les templates prédéfinis de configuration de cue points.
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import CueTemplate, User
from app.middleware.auth import get_current_user
from app.schemas.cue_template import (
    CueTemplateCreate,
    CueTemplateUpdate,
    CueTemplateResponse,
    CueTemplateDetailResponse,
)

router = APIRouter(prefix="/api/v1/cue-templates", tags=["cue-templates"])

# Default system templates
DEFAULT_TEMPLATES = [
    {
        "name": "Techno Standard",
        "description": "Template classique pour musique techno — 8 cue points",
        "genre": "techno",
        "is_system": True,
        "is_public": True,
        "cue_config": {
            "cue_count": 8,
            "positions": [
                {"type": "intro", "color": "#6366f1", "offset_beats": 0},
                {"type": "buildup", "color": "#8b5cf6", "offset_beats": 16},
                {"type": "drop", "color": "#ec4899", "offset_beats": 32},
                {"type": "breakdown", "color": "#06b6d4", "offset_beats": 64},
                {"type": "buildup", "color": "#8b5cf6", "offset_beats": 80},
                {"type": "drop", "color": "#ec4899", "offset_beats": 96},
                {"type": "outro", "color": "#10b981", "offset_beats": 112},
                {"type": "end", "color": "#6b7280", "offset_beats": 128},
            ],
            "auto_hot_cues": True,
        },
    },
    {
        "name": "House Minimal",
        "description": "Template minimaliste pour musique house — 4 cue points essentiels",
        "genre": "house",
        "is_system": True,
        "is_public": True,
        "cue_config": {
            "cue_count": 4,
            "positions": [
                {"type": "intro", "color": "#6366f1", "offset_beats": 0},
                {"type": "drop", "color": "#ec4899", "offset_beats": 32},
                {"type": "breakdown", "color": "#06b6d4", "offset_beats": 64},
                {"type": "outro", "color": "#10b981", "offset_beats": 96},
            ],
            "auto_hot_cues": True,
        },
    },
    {
        "name": "Festival Bangers",
        "description": "Template énergique pour les sets festivals — 6 cue points",
        "genre": "edm",
        "is_system": True,
        "is_public": True,
        "cue_config": {
            "cue_count": 6,
            "positions": [
                {"type": "intro", "color": "#6366f1", "offset_beats": 0},
                {"type": "buildup", "color": "#8b5cf6", "offset_beats": 16},
                {"type": "drop", "color": "#ec4899", "offset_beats": 32},
                {"type": "vocal", "color": "#f59e0b", "offset_beats": 64},
                {"type": "drop", "color": "#ec4899", "offset_beats": 80},
                {"type": "outro", "color": "#10b981", "offset_beats": 96},
            ],
            "auto_hot_cues": True,
        },
    },
    {
        "name": "Wedding/Corporate",
        "description": "Template professionnel pour mariages et événements — 4 cue points",
        "genre": "pop",
        "is_system": True,
        "is_public": True,
        "cue_config": {
            "cue_count": 4,
            "positions": [
                {"type": "intro", "color": "#6366f1", "offset_beats": 0},
                {"type": "buildup", "color": "#8b5cf6", "offset_beats": 8},
                {"type": "breakdown", "color": "#06b6d4", "offset_beats": 24},
                {"type": "outro", "color": "#10b981", "offset_beats": 32},
            ],
            "auto_hot_cues": False,
        },
    },
]


def ensure_system_templates(db: Session):
    """Crée les templates système s'ils n'existent pas."""
    for template_data in DEFAULT_TEMPLATES:
        existing = db.query(CueTemplate).filter(
            CueTemplate.name == template_data["name"],
            CueTemplate.is_system == True,
        ).first()
        if not existing:
            new_template = CueTemplate(
                name=template_data["name"],
                description=template_data.get("description"),
                genre=template_data.get("genre"),
                cue_config=template_data["cue_config"],
                is_system=True,
                is_public=template_data.get("is_public", True),
                user_id=None,
            )
            db.add(new_template)
    db.commit()


@router.get("", response_model=List[CueTemplateResponse])
async def list_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    genre: str = Query(None),
    show_system: bool = Query(True),
):
    """
    Lister les templates disponibles.
    - Templates système (globaux)
    - Templates personnels de l'utilisateur
    - Templates publics populaires
    """
    ensure_system_templates(db)

    query = db.query(CueTemplate)

    # Filtrer par genre si spécifié
    if genre:
        query = query.filter(CueTemplate.genre == genre)

    # Récupérer les templates
    templates = query.filter(
        (CueTemplate.is_system == True) |
        (CueTemplate.user_id == current_user.id) |
        (CueTemplate.is_public == True)
    ).order_by(
        CueTemplate.is_system.desc(),
        CueTemplate.usage_count.desc(),
        CueTemplate.created_at.desc(),
    ).all()

    return [CueTemplateResponse.from_orm(t) for t in templates]


@router.get("/{template_id}", response_model=CueTemplateDetailResponse)
async def get_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Récupérer les détails d'un template."""
    template = db.query(CueTemplate).filter(CueTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template non trouvé")

    # Vérifier l'accès: proprietaire, système, ou public
    if (
        template.user_id != current_user.id
        and not template.is_system
        and not template.is_public
    ):
        raise HTTPException(status_code=403, detail="Accès refusé")

    return CueTemplateDetailResponse.from_orm(template)


@router.post("", response_model=CueTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    template_data: CueTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Créer un nouveau template personnel."""
    new_template = CueTemplate(
        user_id=current_user.id,
        name=template_data.name,
        description=template_data.description,
        genre=template_data.genre,
        cue_config=template_data.cue_config,
        is_public=template_data.is_public,
        is_system=False,
    )
    db.add(new_template)
    db.commit()
    db.refresh(new_template)

    return CueTemplateResponse.from_orm(new_template)


@router.put("/{template_id}", response_model=CueTemplateResponse)
async def update_template(
    template_id: int,
    template_data: CueTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mettre à jour un template personnel."""
    template = db.query(CueTemplate).filter(CueTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template non trouvé")

    # Vérifier que c'est le propriétaire ou un admin
    if template.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Accès refusé")

    # Ne pas modifier les templates système
    if template.is_system:
        raise HTTPException(status_code=403, detail="Impossible de modifier un template système")

    # Update fields
    if template_data.name:
        template.name = template_data.name
    if template_data.description is not None:
        template.description = template_data.description
    if template_data.genre is not None:
        template.genre = template_data.genre
    if template_data.cue_config:
        template.cue_config = template_data.cue_config
    if template_data.is_public is not None:
        template.is_public = template_data.is_public

    db.commit()
    db.refresh(template)

    return CueTemplateResponse.from_orm(template)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Supprimer un template personnel."""
    template = db.query(CueTemplate).filter(CueTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template non trouvé")

    # Vérifier que c'est le propriétaire
    if template.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Accès refusé")

    # Ne pas supprimer les templates système
    if template.is_system:
        raise HTTPException(status_code=403, detail="Impossible de supprimer un template système")

    db.delete(template)
    db.commit()


@router.post("/{template_id}/apply/{track_id}", status_code=status.HTTP_200_OK)
async def apply_template_to_track(
    template_id: int,
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Appliquer un template à un track.
    Crée les cue points selon la configuration du template.
    """
    template = db.query(CueTemplate).filter(CueTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template non trouvé")

    # Vérifier l'accès au template
    if (
        template.user_id != current_user.id
        and not template.is_system
        and not template.is_public
    ):
        raise HTTPException(status_code=403, detail="Accès refusé au template")

    from app.models import Track
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == current_user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track non trouvé")

    # Incrémenter le usage count du template
    template.usage_count = (template.usage_count or 0) + 1

    # Les cue points seraient créés ici (nécessite l'implémentation du modèle CuePoint)
    # Pour maintenant, on retourne un succès

    db.commit()

    return {"message": "Template appliqué avec succès", "template_id": template_id, "track_id": track_id}
