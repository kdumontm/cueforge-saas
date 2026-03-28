"""
CueForge Pro Cue Generator v3.0
State-of-the-art DJ cue point placement based on:
- Mixed In Key / Rekordbox cue strategies
- 4-bar grid quantization (all cues on downbeats)
- Energy-scored section selection
- Professional DJ workflow: INTRO → BUILD → DROP → BREAKDOWN → DROP2 → OUTRO

Cue Strategy (priority order):
  1. INTRO — first downbeat (always slot 0)
  2. DROP 1 — highest-scoring drop (most important cue)
  3. BUILD — steepest energy rise before main drop
  4. DROP 2/3 — secondary drops
  5. BREAKDOWN — lowest energy after first drop
  6. OUTRO — where energy permanently declines
  7. PHRASE — significant structural boundaries
  8. Fill remaining with drops/phrases

Color scheme (Rekordbox-compatible):
  red    = DROP      | orange = BUILD
  blue   = INTRO     | purple = OUTRO
  yellow = BREAKDOWN | green  = PHRASE
  cyan   = VOCAL     | pink   = LOOP
"""
from typing import Dict, List, Tuple
from sqlalchemy.orm import Session

from app.models import (
    Track, TrackAnalysis, CuePoint, CueRule, User, CUE_COLOR_RGB
)


CAMELOT_MAP = {
    "C":  "8B",  "Cm":  "5A",
    "C#": "3B",  "C#m": "12A",
    "D":  "10B", "Dm":  "7A",
    "D#": "5B",  "D#m": "2A",
    "E":  "12B", "Em":  "9A",
    "F":  "7B",  "Fm":  "4A",
    "F#": "2B",  "F#m": "11A",
    "G":  "9B",  "Gm":  "6A",
    "G#": "4B",  "G#m": "1A",
    "A":  "11B", "Am":  "8A",
    "A#": "6B",  "A#m": "3A",
    "B":  "1B",  "Bm":  "10A",
    "Db": "3B",  "Dbm": "12A",
    "Eb": "5B",  "Ebm": "2A",
    "Gb": "2B",  "Gbm": "11A",
    "Ab": "4B",  "Abm": "1A",
    "Bb": "6B",  "Bbm": "3A",
}


def key_to_camelot(key: str) -> str:
    return CAMELOT_MAP.get(key, "")


def get_compatible_keys(key: str) -> List[str]:
    camelot = CAMELOT_MAP.get(key, "")
    if not camelot:
        return []
    num = int(camelot[:-1])
    letter = camelot[-1]
    compatible_camelots = [
        camelot,
        f"{((num) % 12) + 1}{letter}",
        f"{((num - 2) % 12) + 1}{letter}",
        f"{num}{'A' if letter == 'B' else 'B'}",
    ]
    reverse_map = {}
    for k, v in CAMELOT_MAP.items():
        if v not in reverse_map:
            reverse_map[v] = k
    return [reverse_map[c] for c in compatible_camelots if c in reverse_map]


def compute_mix_compatibility(key1: str, bpm1: float, key2: str, bpm2: float) -> Dict:
    bpm_diff = abs(bpm1 - bpm2)
    bpm_ratio = min(bpm1, bpm2) / max(bpm1, bpm2) if max(bpm1, bpm2) > 0 else 0

    if bpm_diff <= 0.5:
        bpm_score = 50
    elif bpm_diff <= 2:
        bpm_score = 45
    elif bpm_ratio >= 0.97:
        bpm_score = 40
    elif bpm_ratio >= 0.94:
        bpm_score = 30
    elif abs(bpm1 - bpm2 * 2) < 3 or abs(bpm2 - bpm1 * 2) < 3:
        bpm_score = 35
    else:
        bpm_score = max(0, 25 - bpm_diff)

    camelot1 = CAMELOT_MAP.get(key1, "")
    camelot2 = CAMELOT_MAP.get(key2, "")
    if not camelot1 or not camelot2:
        key_score = 25
    elif camelot1 == camelot2:
        key_score = 50
    else:
        num1, letter1 = int(camelot1[:-1]), camelot1[-1]
        num2, letter2 = int(camelot2[:-1]), camelot2[-1]
        if letter1 == letter2:
            diff = min(abs(num1 - num2), 12 - abs(num1 - num2))
            if diff == 1:
                key_score = 45
            elif diff == 2:
                key_score = 30
            else:
                key_score = max(0, 20 - diff * 3)
        elif num1 == num2:
            key_score = 40
        else:
            key_score = 15

    total = bpm_score + key_score
    return {
        "total": total,
        "bpm_score": bpm_score,
        "key_score": key_score,
        "bpm_diff": round(bpm_diff, 1),
        "camelot1": camelot1,
        "camelot2": camelot2,
        "verdict": (
            "Perfect" if total >= 90 else
            "Great" if total >= 75 else
            "Good" if total >= 60 else
            "OK" if total >= 40 else
            "Risky"
        ),
    }


# ══════════════════════════════════════════════════════════════════════════
#   4-BAR GRID QUANTIZATION
# ══════════════════════════════════════════════════════════════════════════

def _snap_to_downbeat(pos_ms: int, beats: List[int]) -> int:
    """
    Snap a position to the nearest downbeat (every 4 beats = 1 bar).
    Professional DJ cue points ALWAYS land on a downbeat.
    Falls back to nearest beat if no downbeat within range.
    """
    if not beats:
        return pos_ms

    # Build downbeat list (every 4th beat = bar boundary)
    downbeats = [beats[i] for i in range(0, len(beats), 4)]
    if not downbeats:
        return pos_ms

    nearest_db = min(downbeats, key=lambda b: abs(b - pos_ms))

    # Snap to downbeat if within 3 seconds
    if abs(nearest_db - pos_ms) < 3000:
        return nearest_db

    # Fallback: snap to nearest beat
    nearest_beat = min(beats, key=lambda b: abs(b - pos_ms))
    if abs(nearest_beat - pos_ms) < 1500:
        return nearest_beat

    return pos_ms


def _snap_to_4bar_boundary(pos_ms: int, beats: List[int]) -> int:
    """
    Snap to nearest 4-bar boundary (every 16 beats in 4/4).
    Used for major section cues (INTRO, OUTRO, DROP).
    """
    if not beats:
        return pos_ms

    # 4-bar boundaries = every 16 beats
    boundaries_16 = [beats[i] for i in range(0, len(beats), 16)]
    if not boundaries_16:
        return _snap_to_downbeat(pos_ms, beats)

    nearest = min(boundaries_16, key=lambda b: abs(b - pos_ms))
    if abs(nearest - pos_ms) < 5000:  # 5 second tolerance for 4-bar snap
        return nearest

    # Fallback to regular downbeat
    return _snap_to_downbeat(pos_ms, beats)


# ══════════════════════════════════════════════════════════════════════════
#   SECTION HELPERS
# ══════════════════════════════════════════════════════════════════════════

def _find_section_by_label(sections: List[Dict], label: str) -> List[Dict]:
    return [s for s in sections if s.get("label") == label]


# ══════════════════════════════════════════════════════════════════════════
#   MAIN CUE POINT GENERATOR — v3.0
# ══════════════════════════════════════════════════════════════════════════

def generate_cue_points(analysis_data: Dict) -> List[Dict]:
    """
    Generate up to 8 DJ-ready cue points using professional strategies.

    Based on research into Rekordbox, Mixed In Key, Serato, and MIREX:
    - All positions snapped to downbeats (4-beat grid minimum)
    - Major cues (INTRO/DROP/OUTRO) snapped to 4-bar boundaries when possible
    - Energy-scored section selection for BUILD and BREAKDOWN
    - Minimum 4-second gap between any two cue points
    - Final output sorted chronologically with clean slot numbering

    Priority order:
    1. INTRO (blue)     — first meaningful downbeat
    2. DROP (red)       — highest energy contrast point (main drop only)
    3. BUILD (orange)   — steepest energy rise before main drop
    4. BREAKDOWN (yellow) — lowest energy section after first drop
    5. OUTRO (purple)   — start of final energy decline
    6. DROP 2 (red)     — second drop if exists
    7. PHRASE (green)    — significant structural boundary
    8. VERSE/CHORUS     — additional section markers if slots remain
    """
    cue_points = []
    used_positions = set()

    sections = analysis_data.get("section_labels", [])
    drops = analysis_data.get("drop_positions", [])
    phrases = analysis_data.get("phrase_positions", [])
    beats = analysis_data.get("beat_positions", [])
    duration_ms = analysis_data.get("duration_ms", 0)

    # ── Helper functions ──────────────────────────────────────────────

    def _pos_used(pos_ms: int) -> bool:
        """Check if position is too close to an existing cue (4s minimum)."""
        for p in used_positions:
            if abs(p - pos_ms) < 4000:
                return True
        return False

    def _add_cue(
        pos_ms: int,
        cue_type: str,
        name: str,
        color: str,
        snap_4bar: bool = False,
        end_ms: int = None,
    ) -> bool:
        """Add a cue point with downbeat snapping and collision check."""
        if snap_4bar:
            snapped = _snap_to_4bar_boundary(pos_ms, beats)
        else:
            snapped = _snap_to_downbeat(pos_ms, beats)

        if _pos_used(snapped):
            return False

        slot = len(cue_points)
        cue_points.append({
            "position_ms": snapped,
            "end_position_ms": end_ms,
            "cue_type": cue_type,
            "name": name,
            "color": color,
            "number": slot,
        })
        used_positions.add(snapped)
        return True

    # ── 1. INTRO ──────────────────────────────────────────────────────
    intro_sections = _find_section_by_label(sections, "INTRO")
    if intro_sections:
        intro_pos = intro_sections[0].get("time_ms", 0)
        intro_end = intro_pos + intro_sections[0].get("duration_ms", 0)
        _add_cue(intro_pos, "section", "INTRO", "blue", snap_4bar=True, end_ms=intro_end)
    elif beats and len(beats) > 0:
        _add_cue(beats[0], "section", "INTRO", "blue", snap_4bar=True)
    else:
        _add_cue(0, "section", "INTRO", "blue")

    # ── 2. DROP (main drop only — highest energy contrast) ───────────
    drop_count = 0
    first_drop_ms = drops[0] if drops else duration_ms
    if drops:
        if _add_cue(drops[0], "drop", "DROP", "red", snap_4bar=True):
            drop_count = 1

    # ── 3. BUILD (best one before the main drop) ─────────────────────
    build_sections = _find_section_by_label(sections, "BUILD")

    # Score builds: proximity to drop × energy level
    best_build = None
    best_build_score = -1
    for b in build_sections:
        b_time = b.get("time_ms", 0)
        b_energy = b.get("energy", 0.5)
        if b_time < first_drop_ms:
            proximity = 1.0 - (first_drop_ms - b_time) / max(first_drop_ms, 1)
            score = proximity * 0.5 + b_energy * 0.5
            if score > best_build_score:
                best_build_score = score
                best_build = b

    if not best_build and build_sections:
        best_build = max(build_sections, key=lambda b: b.get("energy", 0))

    if best_build and len(cue_points) < 8:
        build_pos = best_build.get("time_ms", 0)
        build_end = build_pos + best_build.get("duration_ms", 0)
        _add_cue(build_pos, "section", "BUILD", "orange", end_ms=build_end)

    # ── 4. BREAKDOWN (lowest energy after first drop) ────────────────
    breakdown_sections = _find_section_by_label(sections, "BREAKDOWN")
    if breakdown_sections and len(cue_points) < 8:
        post_drop = [
            bd for bd in breakdown_sections
            if bd.get("time_ms", 0) > first_drop_ms
        ]
        if post_drop:
            best_bd = min(post_drop, key=lambda x: x.get("energy", 1.0))
        else:
            best_bd = min(breakdown_sections, key=lambda x: x.get("energy", 1.0))

        bd_pos = best_bd.get("time_ms", 0)
        bd_end = bd_pos + best_bd.get("duration_ms", 0)
        _add_cue(bd_pos, "section", "BREAKDOWN", "yellow", end_ms=bd_end)

    # ── 5. OUTRO ─────────────────────────────────────────────────────
    outro_sections = _find_section_by_label(sections, "OUTRO")
    if outro_sections and len(cue_points) < 8:
        outro_pos = outro_sections[0].get("time_ms", 0)
        _add_cue(outro_pos, "section", "OUTRO", "purple", snap_4bar=True)
    elif duration_ms > 30000 and len(cue_points) < 8:
        outro_pos = int(duration_ms * 0.87)
        _add_cue(outro_pos, "section", "OUTRO", "purple", snap_4bar=True)

    # ── 6. DROP 2 (second drop if it exists and we have room) ───────
    if len(drops) > 1 and len(cue_points) < 8:
        _add_cue(drops[1], "drop", "DROP 2", "red", snap_4bar=True)
        drop_count = 2

    # ── 7. PHRASE markers (remaining slots) ────────────────────
    if phrases and len(cue_points) < 8:
        mid_track = duration_ms / 2
        sorted_phrases = sorted(phrases, key=lambda p: abs(p - mid_track))
        for ph_ms in sorted_phrases:
            if len(cue_points) >= 8:
                break
            _add_cue(ph_ms, "phrase", "PHRASE", "green")

    # ── 8. Fill remaining with extra section markers ─────────────
    # Add VERSE/CHORUS sections if we still have room
    verse_sections = _find_section_by_label(sections, "VERSE")
    chorus_sections = _find_section_by_label(sections, "CHORUS")
    for vs in verse_sections:
        if len(cue_points) >= 8:
            break
        vs_pos = vs.get("time_ms", 0)
        _add_cue(vs_pos, "section", "VERSE", "cyan")
    for ch in chorus_sections:
        if len(cue_points) >= 8:
            break
        ch_pos = ch.get("time_ms", 0)
        _add_cue(ch_pos, "section", "CHORUS", "pink")

    # ── Sort chronologically and reassign slot numbers ───────────────
    cue_points.sort(key=lambda c: c["position_ms"])
    for i, cp in enumerate(cue_points):
        cp["number"] = i

    return cue_points


# ══════════════════════════════════════════════════════════════════════════
#   RULE-BASED SYSTEM (for user custom rules)
# ══════════════════════════════════════════════════════════════════════════

def _apply_drop_cue(track, analysis, cue_points, slot):
    if not analysis.drops:
        return cue_points, slot
    for drop in analysis.drops:
        if slot >= 8:
            break
        cue = CuePoint(
            track_id=track.id,
            time=drop["time"],
            label=f"DROP {len([c for c in cue_points if 'DROP' in (c.label or '')]) + 1}",
            hot_cue_slot=slot,
            color=CUE_COLOR_RGB.get("red", "#FF0000"),
        )
        cue_points.append(cue)
        slot += 1
    return cue_points, slot


def _apply_section_cue(track, analysis, cue_points, slot):
    if not analysis.sections:
        return cue_points, slot
    color_map = {
        "INTRO": CUE_COLOR_RGB.get("blue", "#0000FF"),
        "BUILD": CUE_COLOR_RGB.get("green", "#00FF00"),
        "DROP": CUE_COLOR_RGB.get("red", "#FF0000"),
        "BREAKDOWN": CUE_COLOR_RGB.get("yellow", "#FFFF00"),
        "OUTRO": CUE_COLOR_RGB.get("purple", "#800080"),
    }
    for section in analysis.sections:
        if slot >= 8:
            break
        color = color_map.get(section["label"], CUE_COLOR_RGB.get("white", "#FFFFFF"))
        cue = CuePoint(
            track_id=track.id,
            time=section["time"],
            label=section["label"],
            hot_cue_slot=slot,
            color=color,
        )
        cue_points.append(cue)
        slot += 1
    return cue_points, slot


def _apply_phrase_cue(track, analysis, cue_points, slot):
    if not analysis.phrases:
        return cue_points, slot
    for i, phrase in enumerate(analysis.phrases):
        if slot >= 8:
            break
        cue = CuePoint(
            track_id=track.id,
            time=phrase["start_time"],
            label=f"PHRASE {i + 1}",
            hot_cue_slot=slot,
            color=CUE_COLOR_RGB.get("cyan", "#00FFFF"),
        )
        cue_points.append(cue)
        slot += 1
    return cue_points, slot


def _apply_beat_cue(track, analysis, cue_points, slot, beat_interval=4):
    if not analysis.beats:
        return cue_points, slot
    for i, beat_time in enumerate(analysis.beats):
        if i % beat_interval != 0:
            continue
        if slot >= 8:
            break
        cue = CuePoint(
            track_id=track.id,
            time=float(beat_time),
            label=f"BEAT {i}",
            hot_cue_slot=slot,
            color=CUE_COLOR_RGB.get("white", "#FFFFFF"),
        )
        cue_points.append(cue)
        slot += 1
    return cue_points, slot


def _apply_manual_cue(track, cue_points, slot):
    return cue_points, slot


def apply_rules_to_track(track_id: int, user_id: int, db: Session) -> None:
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == user_id).first()
    if not track:
        return
    analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track_id).first()
    if not analysis:
        return
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return

    plan = user.subscription_plan
    max_cues = 64 if plan == "pro" else 8

    rules = db.query(CueRule).filter(
        CueRule.track_id == track_id, CueRule.is_active == True
    ).all()

    cue_points = []
    slot = 0

    for rule in rules:
        if len(cue_points) >= max_cues:
            break
        if rule.rule_type == "drop":
            cue_points, slot = _apply_drop_cue(track, analysis, cue_points, slot)
        elif rule.rule_type == "section":
            cue_points, slot = _apply_section_cue(track, analysis, cue_points, slot)
        elif rule.rule_type == "phrase":
            cue_points, slot = _apply_phrase_cue(track, analysis, cue_points, slot)
        elif rule.rule_type == "beat":
            cue_points, slot = _apply_beat_cue(track, analysis, cue_points, slot)
        elif rule.rule_type == "manual":
            cue_points, slot = _apply_manual_cue(track, cue_points, slot)

    for cue in cue_points:
        db.add(cue)
    db.commit()
