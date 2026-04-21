"""
Router for mix analysis endpoints.
Points 741-760: Transition scoring, key paths, BPM feasibility, energy matching.
"""

import logging
import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Dict, List, Optional
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.track import Track
from app.models.user import User
from app.middleware.auth import get_current_user
from app.services.mix_analysis import MixAnalyzer

logger = logging.getLogger(__name__)
router = APIRouter()


# Request/Response models
class TransitionScoreRequest(BaseModel):
    track_id_1: int
    track_id_2: int


class TransitionScoreResponse(BaseModel):
    overall_score: float
    key_compatibility: float
    bpm_compatibility: float
    energy_compatibility: float
    details: Dict[str, float]
    # 2026-04-21 QA : quand une des 2 tracks n'est pas encore analysée on retourne
    # quand même 200 avec analysis_pending=True (au lieu d'un 400 qui cassait le UI
    # Mix Studio en permanence). Le frontend affiche "Analyse en cours..." et peut
    # retry plus tard.
    analysis_pending: bool = False
    pending_track_ids: List[int] = []


class KeyPathRequest(BaseModel):
    from_key: str
    to_key: str


class KeyPathResponse(BaseModel):
    from_key: str
    to_key: str
    pivot_key: Optional[str]
    distance: int
    difficulty: str


class EnergyMatchRequest(BaseModel):
    track_id_1: int
    track_id_2: int


class EnergyMatchResponse(BaseModel):
    curve_similarity: float
    best_alignment_time: float


class SuggestNextRequest(BaseModel):
    current_track_id: int
    user_preferences: Optional[Dict[str, float]] = None


class SuggestNextResponse(BaseModel):
    suggested_track_id: int
    compatibility_score: float
    reason: str
    # v4 QA 2026-04-21 : enrichir la réponse pour le UI Mix Studio
    title: Optional[str] = None
    artist: Optional[str] = None
    bpm: Optional[float] = None
    key: Optional[str] = None
    camelot: Optional[str] = None


# Endpoints


@router.post("/mix/transition-score", response_model=TransitionScoreResponse)
async def score_transition(
    request: TransitionScoreRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Score transition quality between two tracks."""
    try:
        # Fetch tracks
        track1 = db.query(Track).filter(Track.id == request.track_id_1).first()
        track2 = db.query(Track).filter(Track.id == request.track_id_2).first()

        if not track1 or not track2:
            raise HTTPException(status_code=404, detail="Track not found")

        # Ownership check: user can only score transitions between their own tracks
        if track1.user_id != current_user.id or track2.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not your track")

        # Get analysis data
        analysis1 = track1.analysis
        analysis2 = track2.analysis

        # 2026-04-21 QA : si une des tracks n'a pas encore été analysée on retourne
        # un 200 avec analysis_pending=True plutôt qu'un 400 — le frontend Mix Studio
        # peut afficher "Analyse en cours…" et re-poller plus tard.
        if not analysis1 or not analysis2:
            pending_ids = []
            if not analysis1:
                pending_ids.append(track1.id)
            if not analysis2:
                pending_ids.append(track2.id)
            return TransitionScoreResponse(
                overall_score=0.0,
                key_compatibility=0.0,
                bpm_compatibility=0.0,
                energy_compatibility=0.0,
                details={},
                analysis_pending=True,
                pending_track_ids=pending_ids,
            )

        # Mock audio data (in production, load from file)
        y1 = np.zeros(44100 * 3)  # 3-second dummy
        y2 = np.zeros(44100 * 3)

        analyzer = MixAnalyzer(sr=44100)
        score = analyzer.analyze_transition(
            y1, y2,
            analysis1.bpm or 120.0,
            analysis2.bpm or 120.0,
            analysis1.key or "C",
            analysis2.key or "C"
        )

        return TransitionScoreResponse(
            overall_score=score.overall_score,
            key_compatibility=score.key_compatibility,
            bpm_compatibility=score.bpm_compatibility,
            energy_compatibility=score.energy_compatibility,
            details=score.details
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error scoring transition: {exc}")
        raise HTTPException(status_code=500, detail="Failed to score transition")


@router.get("/mix/key-path/{from_key}/{to_key}", response_model=KeyPathResponse)
async def get_key_path(
    from_key: str,
    to_key: str,
    current_user: User = Depends(get_current_user),
):
    """Get optimal key transition path between two keys."""
    try:
        analyzer = MixAnalyzer()
        path = analyzer.analyze_key_transition(from_key, to_key)

        return KeyPathResponse(
            from_key=path.from_key,
            to_key=path.to_key,
            pivot_key=path.pivot_key,
            distance=path.distance,
            difficulty=path.difficulty
        )
    except Exception as exc:
        logger.error(f"Error analyzing key path: {exc}")
        raise HTTPException(status_code=500, detail="Failed to analyze key path")


@router.post("/mix/energy-match", response_model=EnergyMatchResponse)
async def match_energy(
    request: EnergyMatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Match energy curves between two tracks."""
    try:
        # Fetch tracks
        track1 = db.query(Track).filter(Track.id == request.track_id_1).first()
        track2 = db.query(Track).filter(Track.id == request.track_id_2).first()

        if not track1 or not track2:
            raise HTTPException(status_code=404, detail="Track not found")

        # Mock audio data
        y1 = np.zeros(44100 * 3)
        y2 = np.zeros(44100 * 3)

        analyzer = MixAnalyzer(sr=44100)
        match = analyzer.analyze_energy_matching(y1, y2)

        return EnergyMatchResponse(
            curve_similarity=match.curve_similarity,
            best_alignment_time=match.best_alignment_time
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error matching energy: {exc}")
        raise HTTPException(status_code=500, detail="Failed to match energy")


@router.post("/mix/suggest-next", response_model=SuggestNextResponse)
async def suggest_next_track(
    request: SuggestNextRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Suggest next track based on current track and mix compatibility.

    v4 QA 2026-04-21 : remplace le mock score 0.75 par un vrai scoring multi-facteur
    (harmonic + BPM via transition_score) + enrichit la réponse avec titre/artiste/bpm/key
    pour que le UI Mix Studio affiche directement le suggestion sans re-fetch.
    """
    from sqlalchemy.orm import selectinload
    from app.models.analysis import Analysis
    from app.services.camelot import transition_score, key_to_camelot

    try:
        current_track = (
            db.query(Track)
            .options(selectinload(Track.analysis))
            .filter(Track.id == request.current_track_id)
            .first()
        )

        if not current_track:
            raise HTTPException(status_code=404, detail="Current track not found")

        # Only consider tracks owned by the current user AND analysed
        candidates = (
            db.query(Track)
            .options(selectinload(Track.analysis))
            .join(Analysis, Analysis.track_id == Track.id)
            .filter(
                Track.user_id == current_user.id,
                Track.id != request.current_track_id,
            )
            .limit(50)
            .all()
        )

        if not candidates:
            raise HTTPException(status_code=400, detail="Aucun autre morceau analysé dans votre bibliothèque.")

        # Si le track courant n'a pas d'analyse, on ne peut pas scorer : renvoyer le premier candidat
        cur_bpm = getattr(current_track.analysis, 'bpm', None) if current_track.analysis else None
        cur_key = getattr(current_track.analysis, 'key', None) if current_track.analysis else None

        if not cur_bpm or not cur_key:
            best = candidates[0]
            best_score_pct = 50.0
            reason = "Morceau courant non analysé — suggestion par défaut"
        else:
            # Score each candidate with the full multi-factor transition_score
            best = None
            best_score_pct = 0.0
            best_details = None
            for c in candidates:
                c_bpm = getattr(c.analysis, 'bpm', None) if c.analysis else None
                c_key = getattr(c.analysis, 'key', None) if c.analysis else None
                if not c_bpm or not c_key:
                    continue
                result = transition_score(cur_bpm, cur_key, c_bpm, c_key)
                score = result.get('overall_score', 0)
                if score > best_score_pct:
                    best_score_pct = score
                    best = c
                    best_details = result

            if best is None:
                # Fallback: first candidate, neutral score
                best = candidates[0]
                best_score_pct = 50.0
                reason = "Pas d'analyse disponible pour scorer — suggestion par défaut"
            else:
                rec = best_details.get('recommendation', 'possible') if best_details else 'possible'
                reason_map = {
                    'excellent': 'Compatibilité harmonique et BPM excellente',
                    'good': 'Bonne compatibilité harmonique et BPM',
                    'possible': 'Compatible avec transition maîtrisée',
                    'risky': 'Transition possible mais risquée',
                }
                reason = reason_map.get(rec, 'Compatible')

        best_bpm = getattr(best.analysis, 'bpm', None) if best.analysis else None
        best_key = getattr(best.analysis, 'key', None) if best.analysis else None

        return SuggestNextResponse(
            suggested_track_id=best.id,
            compatibility_score=round(best_score_pct / 100.0, 3),  # 0-1 range
            reason=reason,
            title=best.title,
            artist=best.artist,
            bpm=best_bpm,
            key=best_key,
            camelot=key_to_camelot(best_key) if best_key else None,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(f"Error suggesting next track for user={current_user.id} track={request.current_track_id}: {exc}")
        # v4 QA : expose l'erreur réelle en dev pour pouvoir diagnostiquer
        raise HTTPException(status_code=500, detail=f"Failed to suggest next track: {type(exc).__name__}: {str(exc)[:200]}")
