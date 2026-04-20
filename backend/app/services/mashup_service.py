"""
CueForge Mashup Studio — Logique de compatibilité et suggestion de mashups.

Services pour :
- Analyser la compatibilité harmonique, BPM et énergie entre deux tracks
- Suggérer des partners de mashup basés sur des critères
- Scorer les combinaisons de manière cohérente et prévisible
"""

from typing import Optional, List, Tuple
import logging

from sqlalchemy.orm import Session, selectinload

from app.models.track import Track, TrackAnalysis
from app.schemas.mashup import CompatibilityScore, MashupFilters
from app.services import camelot

logger = logging.getLogger(__name__)


def compute_compatibility(track_a: Track, track_b: Track) -> CompatibilityScore:
    """
    Calcule le score de compatibilité entre deux tracks.

    Prend en compte :
    1. Harmonie (Camelot wheel) — 1.0 si clés identiques, 0.9 si ±1 wheel, 0.5 sinon
    2. BPM — tolère ±6% (~±5 BPM à 120), distance normalisée
    3. Énergie — différence absolue sur échelle 0-10

    Score global = 0.5*harmonic + 0.3*(1-bpm_delta_norm) + 0.2*(1-energy_delta/10)

    Args:
        track_a: Track source
        track_b: Track cible

    Returns:
        CompatibilityScore avec raisons en français
    """
    reasons: List[str] = []

    # ── Analyse harmonique ───────────────────────────────────────────────
    harmonic_score = 0.5
    key_a = track_a.camelot_code or track_a.key
    key_b = track_b.camelot_code or track_b.key

    if key_a and key_b:
        camelot_a = camelot.key_to_camelot(key_a) if not key_a else key_a
        camelot_b = camelot.key_to_camelot(key_b) if not key_b else key_b

        if camelot_a and camelot_b:
            if camelot_a == camelot_b:
                harmonic_score = 1.0
                reasons.append("Clés identiques (harmonie parfaite)")
            elif is_camelot_neighbor(camelot_a, camelot_b):
                harmonic_score = 0.9
                reasons.append("Clés voisines sur la wheel (très compatible)")
            else:
                harmonic_score = 0.5
                reasons.append("Clés non harmoniques")
        else:
            reasons.append("Clés non analysées (défaut 0.5)")
    else:
        reasons.append("Clés manquantes pour l'un ou les deux tracks")

    # ── Analyse BPM ─────────────────────────────────────────────────────
    bpm_delta_norm = 0.5
    bpm_a = track_a.bpm or 0
    bpm_b = track_b.bpm or 0

    if bpm_a > 0 and bpm_b > 0:
        bpm_ratio = bpm_b / bpm_a if bpm_a != 0 else 1.0
        bpm_percent_diff = abs(bpm_ratio - 1.0) * 100

        # Tolère ±6% (pitch shift raisonnable)
        if bpm_percent_diff <= 6.0:
            bpm_delta_norm = bpm_percent_diff / 6.0  # 0.0 si parfait, ~1.0 à ±6%
            reasons.append(f"BPM compatible ({bpm_a:.1f} → {bpm_b:.1f}, {bpm_percent_diff:.1f}%)")
        else:
            bpm_delta_norm = 1.0
            reasons.append(f"BPM écart important ({bpm_a:.1f} → {bpm_b:.1f}, {bpm_percent_diff:.1f}%)")
    else:
        reasons.append("BPM manquant pour l'un ou les deux tracks")

    # ── Analyse énergie ─────────────────────────────────────────────────
    energy_delta = 0.0
    energy_a = track_a.energy_level or 5
    energy_b = track_b.energy_level or 5

    energy_delta = abs(energy_a - energy_b)
    if energy_delta <= 2:
        reasons.append(f"Énergie proche ({energy_a} → {energy_b})")
    elif energy_delta <= 5:
        reasons.append(f"Énergie modérée ({energy_a} → {energy_b})")
    else:
        reasons.append(f"Énergie très différente ({energy_a} → {energy_b})")

    # ── Score global ────────────────────────────────────────────────────
    overall = (
        0.5 * harmonic_score +
        0.3 * (1.0 - bpm_delta_norm) +
        0.2 * (1.0 - energy_delta / 10.0)
    )
    overall = max(0.0, min(1.0, overall))

    return CompatibilityScore(
        harmonic=harmonic_score,
        bpm_delta=bpm_delta_norm,
        energy_delta=energy_delta,
        overall=overall,
        reasons=reasons
    )


def is_camelot_neighbor(camelot_a: str, camelot_b: str) -> bool:
    """
    Vérifie si deux codes Camelot sont voisins (compatibles pour un mix harmonique).

    Règles :
    - Même code → déjà géré ailleurs (retourne False ici)
    - Code ±1 sur la wheel (ex: 8A → 7A, 9A)
    - Switch A↔B au même numéro (ex: 8A ↔ 8B)

    Args:
        camelot_a: Code Camelot source (ex: "8A")
        camelot_b: Code Camelot cible (ex: "9A")

    Returns:
        True si voisins, False sinon
    """
    if not camelot_a or not camelot_b or camelot_a == camelot_b:
        return False

    # Parse : "8A" → (8, 'A')
    try:
        num_a, letter_a = int(camelot_a[:-1]), camelot_a[-1]
        num_b, letter_b = int(camelot_b[:-1]), camelot_b[-1]
    except (ValueError, IndexError):
        return False

    # Même numéro, lettre différente (A↔B) → compatible
    if num_a == num_b and letter_a != letter_b:
        return True

    # ±1 sur la wheel (wrap 1-12)
    neighbor_nums = {
        (num_a - 1 - 1) % 12 + 1,
        (num_a + 1 - 1) % 12 + 1,
    }
    if num_b in neighbor_nums and letter_a == letter_b:
        return True

    return False


def suggest_mashup_partners(
    db: Session,
    user_id: int,
    track_a: Track,
    filters: MashupFilters,
    limit: int = 20,
) -> List[Tuple[Track, CompatibilityScore]]:
    """
    Suggère des tracks compatibles pour un mashup avec track_a.

    Applique les filtres, calcule la compatibilité pour chacun,
    trie par score global décroissant.

    Args:
        db: Session SQLAlchemy
        user_id: ID utilisateur (pour filtrer sa library)
        track_a: Track source/référence
        filters: Critères de filtrage (énergie, BPM max delta, playlist)
        limit: Nombre max de suggestions

    Returns:
        Liste de (Track, CompatibilityScore) triée par overall desc
    """
    # Query base : tous les tracks de l'utilisateur sauf track_a
    query = (
        db.query(Track)
        .filter(Track.user_id == user_id)
        .filter(Track.id != track_a.id)
    )

    # Filtres optionnels
    if filters.energy_min is not None:
        query = query.filter(Track.energy_level >= filters.energy_min)
    if filters.energy_max is not None:
        query = query.filter(Track.energy_level <= filters.energy_max)
    if filters.playlist_id:
        # Si tu as une relation Library→Track, ajoute le filtre ici
        pass

    # Eager-load TrackAnalysis pour exposer beatgrid/downbeat_ms dans la réponse
    query = query.options(selectinload(Track.analysis))

    # Récupère les candidates
    candidates = query.all()

    # Calcule compatibilité pour chacun
    scored = [
        (track, compute_compatibility(track_a, track))
        for track in candidates
    ]

    # Filtre par score harmonique si required
    if filters.require_harmonic:
        scored = [
            (track, score)
            for track, score in scored
            if score.harmonic >= 0.8
        ]

    # Trie par overall desc
    scored.sort(key=lambda x: x[1].overall, reverse=True)

    return scored[:limit]
