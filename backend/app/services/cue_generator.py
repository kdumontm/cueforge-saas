"""
CueForge Pro Cue Generator v2.0
Generates intelligent, DJ-ready cue points from audio analysis data.

Cue Strategy:
  1. INTRO marker (always first)
  2. DROPs (from multi-factor analysis, max 3)
  3. BUILDs (energy rising sections before drops)
  4. BREAKDOWN (lowest energy after first drop)
  5. OUTRO marker (last section)
  6. VOCAL/PHRASE markers (remaining slots)

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


def _find_section_by_label(sections: List[Dict], label: str) -> List[Dict]:
    return [s for s in sections if s.get("label") == label]


def generate_cue_points(analysis_data: Dict) -> List[Dict]:
    cue_points = []
    used_positions = set()
    sections = analysis_data.get("section_labels", [])
    drops = analysis_data.get("drop_positions", [])
    phrases = analysis_data.get("phrase_positions", [])
    beats = analysis_data.get("beat_positions", [])
    duration_ms = analysis_data.get("duration_ms", 0)

    def _pos_used(pos_ms: int) -> bool:
        for p in used_positions:
            if abs(p - pos_ms) < 2000:
                return True
        return False

    def _add_cue(pos_ms: int, cue_type: str, name: str, color: str, number: int,
                 end_ms: int = None) -> bool:
        if _pos_used(pos_ms):
            return False
        cue_points.append({
            "position_ms": pos_ms,
            "end_position_ms": end_ms,
            "cue_type": cue_type,
            "name": name,
            "color": color,
            "number": number,
        })
        used_positions.add(pos_ms)
        return True

    number = 0

    # Slot 0: INTRO
    intro_sections = _find_section_by_label(sections, "INTRO")
    if intro_sections:
        intro_pos = intro_sections[0].get("time_ms", 0)
        intro_end = intro_pos + intro_sections[0].get("duration_ms", 0)
        _add_cue(intro_pos, "section", "INTRO", "blue", number, intro_end)
    elif beats and len(beats) > 0:
        _add_cue(beats[0], "section", "INTRO", "blue", number)
    else:
        _add_cue(0, "section", "INTRO", "blue", number)
    number += 1

    # Slots 1-3: DROPs
    drop_count = 0
    for drop_ms in drops:
        if number >= 4 or drop_count >= 3:
            break
        name = f"DROP {drop_count + 1}" if len(drops) > 1 else "DROP"
        if _add_cue(drop_ms, "drop", name, "red", number):
            drop_count += 1
            number += 1

    # Slot 4: BUILD
    build_sections = _find_section_by_label(sections, "BUILD")
    first_drop_ms = drops[0] if drops else duration_ms
    best_build = None
    for b in build_sections:
        b_time = b.get("time_ms", 0)
        if b_time < first_drop_ms:
            best_build = b
            break
    if not best_build and build_sections:
        best_build = build_sections[0]
    if best_build and number < 8:
        build_pos = best_build.get("time_ms", 0)
        build_end = build_pos + best_build.get("duration_ms", 0)
        if _add_cue(build_pos, "section", "BUILD", "orange", number, build_end):
            number += 1

    # Slot 5: BREAKDOWN
    breakdown_sections = _find_section_by_label(sections, "BREAKDOWN")
    if breakdown_sections and number < 8:
        best_bd = None
        for bd in breakdown_sections:
            if bd.get("time_ms", 0) > first_drop_ms:
                best_bd = bd
                break
        if not best_bd:
            best_bd = breakdown_sections[0]
        bd_pos = best_bd.get("time_ms", 0)
        bd_end = bd_pos + best_bd.get("duration_ms", 0)
        if _add_cue(bd_pos, "section", "BREAKDOWN", "yellow", number, bd_end):
            number += 1

    # Slot 6: OUTRO
    outro_sections = _find_section_by_label(sections, "OUTRO")
    if outro_sections and number < 8:
        outro_pos = outro_sections[-1].get("time_ms", 0)
        if _add_cue(outro_pos, "section", "OUTRO", "purple", number):
            number += 1
    elif duration_ms > 30000 and number < 8:
        outro_pos = int(duration_ms * 0.9)
        if beats:
            closest = min(beats, key=lambda b: abs(b - outro_pos))
            outro_pos = closest
        _add_cue(outro_pos, "section", "OUTRO", "purple", number)
        number += 1

    # Slot 7: Phrase
    if phrases and number < 8:
        for ph_ms in phrases:
            if _add_cue(ph_ms, "phrase", "PHRASE", "green", number):
                number += 1
                break

    # Fill remaining
    for drop_ms in drops[3:]:
        if number >= 8:
            break
        _add_cue(drop_ms, "drop", f"DROP {drop_count + 1}", "red", number)
        drop_count += 1
        number += 1
    for ph_ms in phrases:
        if number >= 8:
            break
        _add_cue(ph_ms, "phrase", "PHRASE", "green", number)
        number += 1

    return cue_points


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
    rules = db.query(CueRule).filter(CueRule.track_id == track_id, CueRule.is_active == True).all()
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
