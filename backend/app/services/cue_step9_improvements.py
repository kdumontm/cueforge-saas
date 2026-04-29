"""
Étape 9 — Génération de cue points intelligente : 5 améliorations

A. Cues adaptés au genre
B. Nommage intelligent des cues
C. Couleurs sémantiques
D. Apprentissage cues community
E. Auto-snap au beat
"""
from typing import Dict, List, Optional, Tuple
import logging
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════
# A. STRATÉGIE DE GENRE — adapte le nombre et la densité de cues selon le style
# ═══════════════════════════════════════════════════════════════════════════

GENRE_STRATEGIES = {
    "techno": {
        "bars_per_phrase": 32,
        "target_n_cues": 8,
        "intro_outro_emphasis": True,
        "drop_priority": True,
        "min_gap_bars": 6,
    },
    "trance": {
        "bars_per_phrase": 32,
        "target_n_cues": 8,
        "intro_outro_emphasis": True,
        "drop_priority": True,
        "min_gap_bars": 8,
    },
    "house": {
        "bars_per_phrase": 16,
        "target_n_cues": 6,
        "intro_outro_emphasis": True,
        "drop_priority": True,
        "min_gap_bars": 5,
    },
    "deep_house": {
        "bars_per_phrase": 16,
        "target_n_cues": 6,
        "intro_outro_emphasis": True,
        "drop_priority": True,
        "min_gap_bars": 5,
    },
    "drum_and_bass": {
        "bars_per_phrase": 16,
        "target_n_cues": 7,
        "intro_outro_emphasis": True,
        "drop_priority": True,
        "min_gap_bars": 4,
    },
    "dnb": {
        "bars_per_phrase": 16,
        "target_n_cues": 7,
        "intro_outro_emphasis": True,
        "drop_priority": True,
        "min_gap_bars": 4,
    },
    "dubstep": {
        "bars_per_phrase": 16,
        "target_n_cues": 7,
        "intro_outro_emphasis": True,
        "drop_priority": True,
        "min_gap_bars": 6,
    },
    "hip_hop": {
        "bars_per_phrase": 8,
        "target_n_cues": 5,
        "intro_outro_emphasis": False,
        "drop_priority": False,
        "min_gap_bars": 4,
    },
    "trap": {
        "bars_per_phrase": 8,
        "target_n_cues": 6,
        "intro_outro_emphasis": False,
        "drop_priority": True,
        "min_gap_bars": 3,
    },
    "pop": {
        "bars_per_phrase": 8,
        "target_n_cues": 5,
        "intro_outro_emphasis": False,
        "drop_priority": False,
        "min_gap_bars": 4,
    },
    "rock": {
        "bars_per_phrase": 8,
        "target_n_cues": 5,
        "intro_outro_emphasis": False,
        "drop_priority": False,
        "min_gap_bars": 4,
    },
}


def get_genre_strategy(genre: Optional[str]) -> Dict:
    """
    Retourne la stratégie de placement de cues selon le genre.
    
    Utilise un fallback intelligent : si le genre exact ne match pas,
    essaie de matcher par clé partielle, sinon utilise la stratégie par défaut.
    """
    if not genre:
        return {
            "bars_per_phrase": 8,
            "target_n_cues": 6,
            "intro_outro_emphasis": True,
            "drop_priority": True,
            "min_gap_bars": 5,
        }
    
    g = genre.lower().strip()
    
    # Match exact
    if g in GENRE_STRATEGIES:
        return GENRE_STRATEGIES[g]
    
    # Match partiel (si le genre commence par une clé dans la table)
    for key in GENRE_STRATEGIES:
        if key in g:
            return GENRE_STRATEGIES[key]
    
    # Fallback: detecter EDM-like vs vocal-heavy par regex
    if any(x in g for x in ["techno", "house", "trance", "edm", "electronic", "drum", "dnb", "dubstep"]):
        return GENRE_STRATEGIES["house"]  # Standard EDM
    if any(x in g for x in ["pop", "rock", "indie", "hip", "rap"]):
        return GENRE_STRATEGIES["pop"]
    
    # Ultra fallback
    return {
        "bars_per_phrase": 8,
        "target_n_cues": 6,
        "intro_outro_emphasis": True,
        "drop_priority": True,
        "min_gap_bars": 5,
    }


# ═══════════════════════════════════════════════════════════════════════════
# B & C. NOMMAGE INTELLIGENT + COULEURS SÉMANTIQUES
# ═══════════════════════════════════════════════════════════════════════════

SEMANTIC_COLORS = {
    "Intro": "blue",      # 2B7FFF
    "Build": "orange",    # FF8C00
    "Drop": "red",        # E13535
    "Break": "yellow",    # E2D420
    "Breakdown": "yellow",
    "Outro": "purple",    # A855F7
    "Vocal": "cyan",      # 21C8DE
    "Verse": "purple",
    "Chorus": "pink",     # FF69B4
    "Phrase": "green",    # 1DB954
    "Cue": "white",       # Fallback
}


def smart_name_for_cue(
    cue_position_ms: int,
    sections: Optional[List[Dict]] = None,
    drops: Optional[List[int]] = None,
    total_duration_ms: int = 0,
) -> str:
    """
    Devine le rôle d'un cue selon sa position relative aux sections détectées.
    Retourne 'Intro', 'Build', 'Drop', 'Break', 'Vocal', 'Outro' ou 'Cue'.
    """
    if not sections and not drops:
        return "Cue"
    
    # Quel est le pourcentage du morceau où on est ?
    pct = cue_position_ms / max(1, total_duration_ms) if total_duration_ms > 0 else 0.5
    
    # Match sur les sections nommées si dispo
    if sections:
        for s in sections:
            start_ms = s.get("start_ms") or s.get("time_ms", 0)
            end_ms = s.get("end_ms")
            if end_ms is None:
                end_ms = start_ms + 8000  # Estimation: 8s de section
            if start_ms <= cue_position_ms <= end_ms:
                label = (s.get("label") or "").lower()
                if "intro" in label:
                    return "Intro"
                if "outro" in label:
                    return "Outro"
                if "drop" in label:
                    return "Drop"
                if "build" in label or "rise" in label:
                    return "Build"
                if "break" in label or "breakdown" in label or "bridge" in label:
                    return "Break"
                if "verse" in label:
                    return "Verse"
                if "chorus" in label or "refrain" in label:
                    return "Chorus"
    
    # Match sur les drops
    if drops:
        for d_ms in drops:
            if abs(cue_position_ms - d_ms) < 2000:  # ±2s
                return "Drop"
    
    # Fallback selon position dans la timeline
    if pct < 0.10:
        return "Intro"
    if pct > 0.85:
        return "Outro"
    if pct < 0.30:
        return "Build"
    if pct > 0.60 and pct < 0.75:
        return "Break"
    
    return "Cue"


def color_for_name(name: str) -> str:
    """Retourne la couleur sémantique associée au nom du cue."""
    return SEMANTIC_COLORS.get(name, "white")


# ═══════════════════════════════════════════════════════════════════════════
# D. APPRENTISSAGE CUES COMMUNITY — lookup + persistence
# ═══════════════════════════════════════════════════════════════════════════

def get_community_cues_for_track(
    db: Session,
    chromaprint_hash: Optional[str],
    min_contributors: int = 2,
) -> List[Dict]:
    """
    Récupère les cues communautaires validés (≥ min_contributors users d'accord).
    Retourne une liste de dicts {position_ms, cue_type, color, name, confidence}.
    """
    if not chromaprint_hash:
        return []
    
    try:
        from app.models.community_cues import CommunityCue
        cues = (
            db.query(CommunityCue)
            .filter(
                CommunityCue.chromaprint_hash == chromaprint_hash,
                CommunityCue.contributors_count >= min_contributors,
            )
            .order_by(CommunityCue.position_ms)
            .all()
        )
        return [
            {
                "position_ms": c.position_ms,
                "cue_type": c.cue_type or "custom",
                "color": c.color or "white",
                "name": c.name or "Cue",
                "confidence": min(1.0, (c.contributors_count or 1) / 10.0),
            }
            for c in cues
        ]
    except Exception as e:
        logger.warning(f"Failed to fetch community cues: {e}")
        return []


def record_community_cue(
    db: Session,
    track,
    cue_position_ms: int,
    cue_type: Optional[str] = None,
    color: Optional[str] = None,
    name: Optional[str] = None,
) -> None:
    """
    Enregistre la position d'un cue placé par un user dans community_cues.
    Si une position similaire (±200ms) existe déjà, incrémente le compteur.
    """
    if not track or not hasattr(track, 'chromaprint_hash') or not track.chromaprint_hash:
        return
    
    try:
        from app.models.community_cues import CommunityCue
        
        # Cherche une position similaire (±200ms) pour ce chromaprint
        existing = (
            db.query(CommunityCue)
            .filter(
                CommunityCue.chromaprint_hash == track.chromaprint_hash,
                CommunityCue.position_ms >= cue_position_ms - 200,
                CommunityCue.position_ms <= cue_position_ms + 200,
            )
            .first()
        )
        
        if existing:
            # Incrémente le compteur et moyenne la position
            existing.contributors_count = (existing.contributors_count or 0) + 1
            existing.position_ms = int(
                (existing.position_ms * (existing.contributors_count - 1) + cue_position_ms)
                / existing.contributors_count
            )
            # Update metadata si pas encore défini
            if cue_type and not existing.cue_type:
                existing.cue_type = cue_type
            if color and not existing.color:
                existing.color = color
            if name and not existing.name:
                existing.name = name
        else:
            # Crée un nouveau cue communautaire
            cc = CommunityCue(
                chromaprint_hash=track.chromaprint_hash,
                position_ms=cue_position_ms,
                cue_type=cue_type,
                color=color,
                name=name,
            )
            db.add(cc)
        
        db.commit()
        logger.debug(f"[COMMUNITY-CUE] recorded at {cue_position_ms}ms for {track.chromaprint_hash}")
    except Exception as e:
        db.rollback()
        logger.warning(f"Failed to record community cue: {e}")


# ═══════════════════════════════════════════════════════════════════════════
# E. AUTO-SNAP AU BEAT — snap la position au beat le plus proche
# ═══════════════════════════════════════════════════════════════════════════

def snap_to_nearest_beat(
    position_ms: int,
    beat_positions_ms: List[int],
    window_ms: int = 200,
) -> int:
    """
    Snap position au beat le plus proche dans la fenêtre.
    Retourne la position originale si aucun beat dans la fenêtre.
    """
    if not beat_positions_ms:
        return position_ms
    
    closest = min(beat_positions_ms, key=lambda b: abs(b - position_ms))
    if abs(closest - position_ms) <= window_ms:
        return int(closest)
    
    return position_ms


# ═══════════════════════════════════════════════════════════════════════════
# INTEGRATION HELPER — applique tous les post-traitements étape 9
# ═══════════════════════════════════════════════════════════════════════════

def apply_step9_improvements(
    cue_points: List[Dict],
    analysis_data: Dict,
    sections: Optional[List[Dict]] = None,
    drops: Optional[List[int]] = None,
    beats: Optional[List[int]] = None,
    duration_ms: int = 0,
    genre: Optional[str] = None,
) -> List[Dict]:
    """
    Applique les 5 améliorations étape 9 aux cue points générés.
    
    A. Utilise la stratégie de genre pour valider le nombre de cues
    B+C. Applique le nommage intelligent + couleurs sémantiques
    E. Auto-snap au beat
    
    Args:
        cue_points: liste de cues générés
        analysis_data: données d'analyse
        sections: sections musicales détectées
        drops: positions des drops
        beats: positions des beats
        duration_ms: durée du track en ms
        genre: genre du track
    
    Returns:
        cue_points modifiés avec noms, couleurs et snap optimisés
    """
    if not cue_points:
        return cue_points
    
    # A. Valider le nombre de cues selon le genre
    strategy = get_genre_strategy(genre)
    target_n = strategy.get("target_n_cues", 6)
    if len(cue_points) > target_n * 1.5:  # Si trop de cues, keep only high-confidence ones
        logger.info(f"[STEP9-A] {len(cue_points)} cues > target {target_n}, filtering low-confidence")
        cue_points = sorted(cue_points, key=lambda c: c.get("confidence", 0.5), reverse=True)
        cue_points = cue_points[:int(target_n * 1.2)]
        cue_points = sorted(cue_points, key=lambda c: c["position_ms"])
    
    # B+C. Appliquer nommage intelligent + couleurs sémantiques
    for cp in cue_points:
        # Devine le nom si absent ou générique
        current_name = cp.get("name", "Cue")
        if current_name in ("Cue", "PHRASE", "SECTION", ""):
            smart_name = smart_name_for_cue(
                cp["position_ms"],
                sections=sections,
                drops=drops,
                total_duration_ms=duration_ms,
            )
            cp["name"] = smart_name
        
        # Applique la couleur sémantique
        cp["color"] = color_for_name(cp.get("name", "Cue"))
    
    # E. Auto-snap au beat (si beats disponibles)
    if beats and len(beats) > 4:
        beat_positions_ms = [int(b) if isinstance(b, (int, float)) else b for b in beats]
        snapped_count = 0
        for cp in cue_points:
            original_pos = cp["position_ms"]
            snapped_pos = snap_to_nearest_beat(original_pos, beat_positions_ms, window_ms=200)
            if snapped_pos != original_pos:
                cp["position_ms"] = snapped_pos
                snapped_count += 1
        if snapped_count > 0:
            logger.debug(f"[STEP9-E] {snapped_count}/{len(cue_points)} cues snappés au beat")
    
    return cue_points
