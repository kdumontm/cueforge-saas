"""Compare two tracks for compatibility."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models.track import Track
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/tracks", tags=["compare"])


def camelot_compatible(key_a: Optional[str], key_b: Optional[str]) -> bool:
    """
    Check if two keys are harmonically compatible using Camelot wheel rules.
    Compatible keys: same key, +1 semitone, relative minor/major
    """
    if not key_a or not key_b:
        return True

    key_a = key_a.upper().strip()
    key_b = key_b.upper().strip()

    if key_a == key_b:
        return True

    # Camelot wheel compatibility: same position or adjacent
    camelot_map = {
        '1A': ['1A', '12A', '2A', '1B', '12B'],
        '1B': ['1B', '12B', '2B', '1A', '12A'],
        '2A': ['2A', '1A', '3A', '2B', '1B'],
        '2B': ['2B', '1B', '3B', '2A', '1A'],
        '3A': ['3A', '2A', '4A', '3B', '2B'],
        '3B': ['3B', '2B', '4B', '3A', '2A'],
        '4A': ['4A', '3A', '5A', '4B', '3B'],
        '4B': ['4B', '3B', '5B', '4A', '3A'],
        '5A': ['5A', '4A', '6A', '5B', '4B'],
        '5B': ['5B', '4B', '6B', '5A', '4A'],
        '6A': ['6A', '5A', '7A', '6B', '5B'],
        '6B': ['6B', '5B', '7B', '6A', '5A'],
        '7A': ['7A', '6A', '8A', '7B', '6B'],
        '7B': ['7B', '6B', '8B', '7A', '6A'],
        '8A': ['8A', '7A', '9A', '8B', '7B'],
        '8B': ['8B', '7B', '9B', '8A', '7A'],
        '9A': ['9A', '8A', '10A', '9B', '8B'],
        '9B': ['9B', '8B', '10B', '9A', '8A'],
        '10A': ['10A', '9A', '11A', '10B', '9B'],
        '10B': ['10B', '9B', '11B', '10A', '9B'],
        '11A': ['11A', '10A', '12A', '11B', '10B'],
        '11B': ['11B', '10B', '12B', '11A', '10A'],
        '12A': ['12A', '11A', '1A', '12B', '11B'],
        '12B': ['12B', '11B', '1B', '12A', '11A'],
    }

    return key_b in camelot_map.get(key_a, [])


def calculate_compatibility_score(
    bpm_a: Optional[int],
    bpm_b: Optional[int],
    key_a: Optional[str],
    key_b: Optional[str],
    energy_a: Optional[int],
    energy_b: Optional[int],
) -> tuple[int, int, bool, int]:
    """
    Calculate compatibility score (0-100) between two tracks.
    Returns: (score, bpm_diff, key_compatible, energy_diff)

    Logic:
    - BPM: 100% if same, -10% per BPM diff (max -50%)
    - Key: +30% if compatible, 0% otherwise
    - Energy: +20% if diff < 2
    """
    score = 0
    bpm_diff = 0
    key_compatible = False
    energy_diff = 0

    # BPM compatibility (0-50 points max)
    if bpm_a and bpm_b:
        bpm_diff = abs(bpm_a - bpm_b)
        if bpm_diff == 0:
            bpm_score = 50
        else:
            # -10% per BPM, capped at -50%
            bpm_score = max(0, 50 - (bpm_diff * 10))
        score += bpm_score

    # Key compatibility (0-30 points)
    key_compatible = camelot_compatible(key_a, key_b)
    if key_compatible:
        score += 30

    # Energy compatibility (0-20 points)
    if energy_a is not None and energy_b is not None:
        energy_diff = abs(energy_a - energy_b)
        if energy_diff < 2:
            score += 20
        elif energy_diff < 10:
            score += 10

    return score, bpm_diff, key_compatible, energy_diff


def generate_transition_tips(
    bpm_diff: int,
    key_compatible: bool,
    energy_diff: int,
    title_a: str,
    title_b: str,
) -> List[str]:
    """Generate transition tips based on compatibility metrics."""
    tips = []

    if bpm_diff > 0:
        pct = (bpm_diff / 120) * 100  # Rough estimate
        if bpm_diff < 3:
            tips.append(f"Écart BPM faible — transition facile")
        elif bpm_diff < 6:
            tips.append(f"Tempo différent de {bpm_diff} BPM — utilise le tempo change")
        else:
            tips.append(f"Écart BPM important ({bpm_diff} BPM) — utilise le pitch bend")

    if not key_compatible:
        tips.append(f"Tonalités incompatibles — prépare un bon accrochage (break, pause)")
    else:
        tips.append(f"Tonalités harmoniques compatibles — transition mixée possible")

    if energy_diff > 5:
        tips.append(f"Différence d'énergie notable — attention au flow du set")

    return tips


@router.get("/compare")
async def compare_tracks(
    track_a: int,
    track_b: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    Compare two tracks by ID and return compatibility metrics.
    GET /api/v1/tracks/compare?track_a={id}&track_b={id}
    """
    # Fetch both tracks
    track_a_obj = db.query(Track).filter(
        Track.id == track_a,
        Track.user_id == current_user.id
    ).first()
    track_b_obj = db.query(Track).filter(
        Track.id == track_b,
        Track.user_id == current_user.id
    ).first()

    if not track_a_obj or not track_b_obj:
        raise HTTPException(status_code=404, detail="One or both tracks not found")

    # Raccourcis vers les analyses
    analysis_a = track_a_obj.analysis
    analysis_b = track_b_obj.analysis

    bpm_a = analysis_a.bpm if analysis_a else None
    bpm_b = analysis_b.bpm if analysis_b else None
    key_a = analysis_a.key if analysis_a else None
    key_b = analysis_b.key if analysis_b else None
    energy_a = analysis_a.energy if analysis_a else None
    energy_b = analysis_b.energy if analysis_b else None

    # Calculate compatibility
    score, bpm_diff, key_compatible, energy_diff = calculate_compatibility_score(
        bpm_a, bpm_b, key_a, key_b, energy_a, energy_b,
    )

    # Generate tips
    tips = generate_transition_tips(
        bpm_diff,
        key_compatible,
        energy_diff,
        track_a_obj.title,
        track_b_obj.title,
    )

    # Build response
    return {
        "track_a_details": {
            "id": track_a_obj.id,
            "title": track_a_obj.title,
            "artist": track_a_obj.artist,
            "album": track_a_obj.album,
            "bpm": bpm_a,
            "key": key_a,
            "energy": energy_a,
            "genre": track_a_obj.genre,
            "duration": analysis_a.duration_ms if analysis_a else None,
            "cue_points": [{"name": cp.name, "position_ms": cp.position_ms, "cue_type": cp.cue_type}
                          for cp in track_a_obj.cue_points] if track_a_obj.cue_points else [],
        },
        "track_b_details": {
            "id": track_b_obj.id,
            "title": track_b_obj.title,
            "artist": track_b_obj.artist,
            "album": track_b_obj.album,
            "bpm": bpm_b,
            "key": key_b,
            "energy": energy_b,
            "genre": track_b_obj.genre,
            "duration": analysis_b.duration_ms if analysis_b else None,
            "cue_points": [{"name": cp.name, "position_ms": cp.position_ms, "cue_type": cp.cue_type}
                          for cp in track_b_obj.cue_points] if track_b_obj.cue_points else [],
        },
        "compatibility_score": score,
        "bpm_diff": bpm_diff,
        "key_compatible": key_compatible,
        "energy_diff": energy_diff,
        "transition_tips": tips,
    }
