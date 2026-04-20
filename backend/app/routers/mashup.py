"""
CueForge Mashup Studio — Router FastAPI pour CRUD et suggestions.

Endpoints :
- GET /suggest — Suggestions de partners avec filtres
- POST / — Créer un mashup
- GET /{mashup_id} — Récupérer un mashup
- PATCH /{mashup_id} — Modifier un mashup
- DELETE /{mashup_id} — Supprimer un mashup
- POST /{mashup_id}/favorite — Marquer comme favori
- DELETE /{mashup_id}/favorite — Retirer des favoris
- GET /favorites/list — Lister les mashups favoris
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.models.track import Track
from app.models.mashup import Mashup, FavoriteMashup
from app.schemas.mashup import (
    MashupCreate, MashupUpdate, MashupOut,
    MashupSuggestionIn, MashupSuggestionOut, CompatibilityScore,
    MashupFilters,
)
from app.services import mashup_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/mashup", tags=["mashup"])


# ── Suggestions ──────────────────────────────────────────────────────────

@router.get("/suggest", response_model=List[MashupSuggestionOut])
async def suggest_mashup_partners(
    track_id: int = Query(..., description="ID du track source"),
    energy_min: Optional[int] = Query(None, ge=0, le=10),
    energy_max: Optional[int] = Query(None, ge=0, le=10),
    bpm_max_delta: Optional[float] = Query(None, gt=0.0),
    playlist_id: Optional[str] = Query(None),
    require_harmonic: bool = Query(True),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Suggère des tracks compatibles pour un mashup.

    Filtre la library de l'utilisateur par énergie/BPM et calcule
    les scores de compatibilité harmonique, BPM, énergie.

    Query params:
    - track_id: ID du track source
    - energy_min/max: Plage d'énergie (0-10)
    - bpm_max_delta: Tolérance % BPM (ex: 6.0 pour ±6%)
    - playlist_id: Filtrer par playlist (optionnel)
    - require_harmonic: Exiger score harmonique >= 0.8 (défaut: True)
    - limit: Nombre de suggestions (1-100, défaut: 20)
    """
    # Valide et charge track_a
    track_a = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == current_user.id,
    ).first()

    if not track_a:
        raise HTTPException(status_code=404, detail="Track source non trouvé")

    # Construit les filtres
    filters = MashupFilters(
        energy_min=energy_min,
        energy_max=energy_max,
        bpm_max_delta=bpm_max_delta,
        playlist_id=playlist_id,
        require_harmonic=require_harmonic,
    )

    # Suggère les partners
    suggestions = mashup_service.suggest_mashup_partners(
        db, current_user.id, track_a, filters, limit=limit
    )

    # Sérialise en réponse
    result = []
    for track, compat_score in suggestions:
        analysis = getattr(track, "analysis", None)
        result.append(
            MashupSuggestionOut(
                track_id=track.id,
                track_title=track.title or "Unknown",
                track_artist=track.artist or "Unknown",
                track_bpm=track.bpm,
                track_energy=track.energy_level,
                track_key=track.camelot_code or track.key,
                track_beatgrid=(analysis.beatgrid if analysis else None),
                track_downbeat_ms=(analysis.downbeat_ms if analysis else None),
                compatibility=compat_score,
            )
        )

    return result


# ── CRUD Mashup ──────────────────────────────────────────────────────────

@router.post("/", response_model=MashupOut, status_code=201)
async def create_mashup(
    body: MashupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Crée un nouveau mashup pour l'utilisateur actuel."""

    # Vérifie que les deux tracks appartiennent à l'utilisateur
    track_a = db.query(Track).filter(
        Track.id == body.track_a_id,
        Track.user_id == current_user.id,
    ).first()
    track_b = db.query(Track).filter(
        Track.id == body.track_b_id,
        Track.user_id == current_user.id,
    ).first()

    if not track_a or not track_b:
        raise HTTPException(
            status_code=404,
            detail="L'un ou les deux tracks n'existent pas ou n'appartiennent pas à l'utilisateur"
        )

    if track_a.id == track_b.id:
        raise HTTPException(
            status_code=400,
            detail="Les deux tracks doivent être différents"
        )

    # Vérifie unicité (user, track_a, track_b)
    existing = db.query(Mashup).filter(
        Mashup.user_id == current_user.id,
        Mashup.track_a_id == body.track_a_id,
        Mashup.track_b_id == body.track_b_id,
    ).first()

    if existing:
        raise HTTPException(
            status_code=409,
            detail="Ce mashup existe déjà"
        )

    # Crée le mashup
    mashup = Mashup(
        user_id=current_user.id,
        track_a_id=body.track_a_id,
        track_b_id=body.track_b_id,
        pitch_semitones=body.pitch_semitones,
        loop_a_in=body.loop_a_in,
        loop_a_out=body.loop_a_out,
        loop_b_in=body.loop_b_in,
        loop_b_out=body.loop_b_out,
        rating=body.rating,
        notes=body.notes,
    )
    db.add(mashup)
    db.commit()
    db.refresh(mashup)

    return MashupOut.model_validate(mashup)


@router.get("/{mashup_id}", response_model=MashupOut)
async def get_mashup(
    mashup_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Récupère un mashup spécifique (ownership check)."""

    mashup = db.query(Mashup).filter(
        Mashup.id == mashup_id,
        Mashup.user_id == current_user.id,
    ).first()

    if not mashup:
        raise HTTPException(status_code=404, detail="Mashup non trouvé")

    return MashupOut.model_validate(mashup)


@router.patch("/{mashup_id}", response_model=MashupOut)
async def update_mashup(
    mashup_id: int,
    body: MashupUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Modifie un mashup existant."""

    mashup = db.query(Mashup).filter(
        Mashup.id == mashup_id,
        Mashup.user_id == current_user.id,
    ).first()

    if not mashup:
        raise HTTPException(status_code=404, detail="Mashup non trouvé")

    # Update champs optionnels
    if body.pitch_semitones is not None:
        mashup.pitch_semitones = body.pitch_semitones
    if body.loop_a_in is not None:
        mashup.loop_a_in = body.loop_a_in
    if body.loop_a_out is not None:
        mashup.loop_a_out = body.loop_a_out
    if body.loop_b_in is not None:
        mashup.loop_b_in = body.loop_b_in
    if body.loop_b_out is not None:
        mashup.loop_b_out = body.loop_b_out
    if body.rating is not None:
        mashup.rating = body.rating
    if body.notes is not None:
        mashup.notes = body.notes

    db.commit()
    db.refresh(mashup)

    return MashupOut.model_validate(mashup)


@router.delete("/{mashup_id}", status_code=204)
async def delete_mashup(
    mashup_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Supprime un mashup (hard delete)."""

    mashup = db.query(Mashup).filter(
        Mashup.id == mashup_id,
        Mashup.user_id == current_user.id,
    ).first()

    if not mashup:
        raise HTTPException(status_code=404, detail="Mashup non trouvé")

    db.delete(mashup)
    db.commit()

    return None


# ── Favoris ──────────────────────────────────────────────────────────────

@router.post("/{mashup_id}/favorite", response_model=dict, status_code=201)
async def favorite_mashup(
    mashup_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ajoute un mashup aux favoris de l'utilisateur."""

    # Vérifie que le mashup existe et appartient à l'utilisateur
    mashup = db.query(Mashup).filter(
        Mashup.id == mashup_id,
        Mashup.user_id == current_user.id,
    ).first()

    if not mashup:
        raise HTTPException(status_code=404, detail="Mashup non trouvé")

    # Vérifie unicité du favori
    existing = db.query(FavoriteMashup).filter(
        FavoriteMashup.user_id == current_user.id,
        FavoriteMashup.mashup_id == mashup_id,
    ).first()

    if existing:
        raise HTTPException(
            status_code=409,
            detail="Ce mashup est déjà dans vos favoris"
        )

    # Crée le favori
    fav = FavoriteMashup(
        user_id=current_user.id,
        mashup_id=mashup_id,
    )
    db.add(fav)
    db.commit()

    return {"id": fav.id, "message": "Mashup ajouté aux favoris"}


@router.delete("/{mashup_id}/favorite", status_code=204)
async def unfavorite_mashup(
    mashup_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retire un mashup des favoris de l'utilisateur."""

    fav = db.query(FavoriteMashup).filter(
        FavoriteMashup.user_id == current_user.id,
        FavoriteMashup.mashup_id == mashup_id,
    ).first()

    if not fav:
        raise HTTPException(status_code=404, detail="Favori non trouvé")

    db.delete(fav)
    db.commit()

    return None


@router.get("/favorites/list", response_model=List[MashupOut])
async def list_favorite_mashups(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Liste les mashups favoris de l'utilisateur (paginé)."""

    favs = (
        db.query(FavoriteMashup)
        .filter(FavoriteMashup.user_id == current_user.id)
        .order_by(FavoriteMashup.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    mashups = [fav.mashup for fav in favs]
    return [MashupOut.model_validate(m) for m in mashups]
