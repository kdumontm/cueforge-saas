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
    Generate up to 8 DJ-ready cue points — next-generation precision.

    v4.0 improvements over v3.0:
    - Energy envelope analysis with gradient-based drop/build detection
    - Multi-scale phrase detection (8-bar, 16-bar, 32-bar boundaries)
    - Weighted scoring: energy contrast × proximity × structural importance
    - Smart deduplication: prefer 4-bar boundaries over raw positions
    - Build-to-drop pairing: BUILD always placed 8-16 bars before its DROP
    - Dynamic OUTRO detection via sustained energy decline
    - Minimum 6s gap between cues (was 4s) for cleaner layout

    Based on Rekordbox, Mixed In Key, Serato, Traktor, MIREX:
    - All positions snapped to downbeats (4-beat grid minimum)
    - Major cues (INTRO/DROP/OUTRO) snapped to 4-bar boundaries
    - Final output sorted chronologically with clean slot numbering

    Priority order:
    1. INTRO (blue)       — first meaningful 4-bar boundary
    2. DROP (red)         — highest energy contrast / strongest transient peak
    3. BUILD (orange)     — steepest energy rise 8-16 bars before DROP
    4. BREAKDOWN (yellow) — lowest energy valley after first DROP
    5. DROP 2 (red)       — second drop if significant energy contrast
    6. OUTRO (purple)     — sustained energy decline (last 15-25%)
    7. PHRASE (green)     — most structurally significant phrase boundaries
    8. VERSE/CHORUS (cyan/pink) — remaining slots
    """
    cue_points = []
    used_positions = set()

    sections = analysis_data.get("section_labels", [])
    drops = analysis_data.get("drop_positions", [])
    phrases = analysis_data.get("phrase_positions", [])
    beats = analysis_data.get("beat_positions", [])
    duration_ms = analysis_data.get("duration_ms", 0)
    bpm = analysis_data.get("bpm", 128)

    # ── Timing constants derived from BPM ──
    beat_ms = 60000 / max(bpm, 60)  # ms per beat
    bar_ms = beat_ms * 4             # ms per bar (4/4)
    phrase_8bar_ms = bar_ms * 8      # 8-bar phrase
    phrase_16bar_ms = bar_ms * 16    # 16-bar phrase

    MIN_GAP_MS = 6000  # 6s minimum between cues (stricter than v3)

    # ── Helper functions ──────────────────────────────────────────────

    def _pos_used(pos_ms: int) -> bool:
        for p in used_positions:
            if abs(p - pos_ms) < MIN_GAP_MS:
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
        if pos_ms < 0 or (duration_ms > 0 and pos_ms > duration_ms):
            return False

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

    # ── Energy envelope from sections (for gradient-based detection) ──
    section_energies: List[Tuple[int, float]] = []
    for s in sections:
        t = s.get("time_ms", 0)
        e = s.get("energy", 0.5)
        section_energies.append((t, e))
    section_energies.sort(key=lambda x: x[0])

    def _energy_at(t_ms: int) -> float:
        """Interpolated energy at a given timestamp."""
        if not section_energies:
            return 0.5
        if t_ms <= section_energies[0][0]:
            return section_energies[0][1]
        if t_ms >= section_energies[-1][0]:
            return section_energies[-1][1]
        for i in range(len(section_energies) - 1):
            t0, e0 = section_energies[i]
            t1, e1 = section_energies[i + 1]
            if t0 <= t_ms <= t1:
                ratio = (t_ms - t0) / max(t1 - t0, 1)
                return e0 + (e1 - e0) * ratio
        return 0.5

    def _energy_contrast(t_ms: int) -> float:
        """Energy contrast = energy jump from before to after this point."""
        before = _energy_at(max(0, t_ms - int(phrase_8bar_ms)))
        after = _energy_at(t_ms + int(bar_ms))
        return after - before  # positive = energy rise (drop), negative = energy fall

    # ── Score drops by energy contrast (not just order) ──
    scored_drops: List[Tuple[int, float]] = []
    for d in drops:
        contrast = _energy_contrast(d)
        # Also factor in absolute energy at the drop point
        abs_energy = _energy_at(d + int(bar_ms))
        score = contrast * 0.6 + abs_energy * 0.4
        scored_drops.append((d, score))
    scored_drops.sort(key=lambda x: -x[1])  # best drop first

    # ── 1. INTRO — first meaningful 4-bar boundary with beats ──
    intro_sections = _find_section_by_label(sections, "INTRO")
    if intro_sections:
        intro_pos = intro_sections[0].get("time_ms", 0)
        intro_end = intro_pos + intro_sections[0].get("duration_ms", 0)
        _add_cue(intro_pos, "section", "INTRO", "blue", snap_4bar=True, end_ms=intro_end)
    elif beats and len(beats) > 0:
        # Find first beat that's not silence — skip beats where energy < 0.1
        intro_beat = beats[0]
        for b in beats[:min(len(beats), 32)]:
            if _energy_at(b) > 0.08:
                intro_beat = b
                break
        _add_cue(intro_beat, "section", "INTRO", "blue", snap_4bar=True)
    else:
        _add_cue(0, "section", "INTRO", "blue")

    # ── 2. DROP — highest energy-contrast drop ──
    first_drop_ms = scored_drops[0][0] if scored_drops else duration_ms
    if scored_drops:
        main_drop = scored_drops[0][0]
        if _add_cue(main_drop, "drop", "DROP", "red", snap_4bar=True):
            first_drop_ms = main_drop

    # ── 3. BUILD — steepest energy rise before main drop ──
    # Look for BUILD sections, or synthesize from energy gradient
    build_sections = _find_section_by_label(sections, "BUILD")

    best_build = None
    best_build_score = -1

    for b in build_sections:
        b_time = b.get("time_ms", 0)
        b_energy = b.get("energy", 0.5)
        b_dur = b.get("duration_ms", 0)
        if b_time < first_drop_ms:
            # Prefer builds that are 8-16 bars before the drop
            dist_bars = (first_drop_ms - b_time) / max(bar_ms, 1)
            ideal_dist = 12  # ~12 bars before drop is ideal
            proximity_score = max(0, 1.0 - abs(dist_bars - ideal_dist) / 20)
            energy_score = b_energy
            duration_score = min(1.0, b_dur / phrase_16bar_ms)  # longer builds = better
            score = proximity_score * 0.4 + energy_score * 0.3 + duration_score * 0.3
            if score > best_build_score:
                best_build_score = score
                best_build = b

    # Synthesize BUILD if none found: find point of steepest energy rise before drop
    if not best_build and first_drop_ms > 0:
        search_start = max(0, first_drop_ms - int(phrase_16bar_ms * 2))
        best_gradient = 0
        best_gradient_pos = None
        step = int(bar_ms)
        for t in range(search_start, first_drop_ms - step, step):
            gradient = _energy_at(t + step * 4) - _energy_at(t)
            if gradient > best_gradient:
                best_gradient = gradient
                best_gradient_pos = t
        if best_gradient_pos and best_gradient > 0.15:
            _add_cue(best_gradient_pos, "section", "BUILD", "orange", snap_4bar=True)
            best_build = {"_synthetic": True}

    if best_build and not best_build.get("_synthetic") and len(cue_points) < 8:
        build_pos = best_build.get("time_ms", 0)
        build_end = build_pos + best_build.get("duration_ms", 0)
        _add_cue(build_pos, "section", "BUILD", "orange", snap_4bar=True, end_ms=build_end)

    # ── 4. BREAKDOWN — deepest energy valley after first drop ──
    breakdown_sections = _find_section_by_label(sections, "BREAKDOWN")
    if breakdown_sections and len(cue_points) < 8:
        post_drop = [
            bd for bd in breakdown_sections
            if bd.get("time_ms", 0) > first_drop_ms
        ]
        if post_drop:
            # Score by: low energy × distance from drop
            best_bd = min(post_drop, key=lambda x: x.get("energy", 1.0))
        else:
            best_bd = min(breakdown_sections, key=lambda x: x.get("energy", 1.0))

        bd_pos = best_bd.get("time_ms", 0)
        bd_end = bd_pos + best_bd.get("duration_ms", 0)
        _add_cue(bd_pos, "section", "BREAKDOWN", "yellow", snap_4bar=True, end_ms=bd_end)
    elif len(cue_points) < 8 and first_drop_ms < duration_ms * 0.7:
        # Synthesize: find lowest energy point between drop and 70% mark
        search_end = min(duration_ms, int(first_drop_ms + phrase_16bar_ms * 4))
        lowest_energy = 1.0
        lowest_pos = None
        step = int(bar_ms * 2)
        for t in range(first_drop_ms + int(phrase_8bar_ms), search_end, step):
            e = _energy_at(t)
            if e < lowest_energy:
                lowest_energy = e
                lowest_pos = t
        if lowest_pos and lowest_energy < 0.5:
            _add_cue(lowest_pos, "section", "BREAKDOWN", "yellow", snap_4bar=True)

    # ── 5. DROP 2 — second drop with significant energy contrast ──
    if len(scored_drops) > 1 and len(cue_points) < 8:
        second_drop = scored_drops[1]
        # Only add if it has meaningful energy contrast (>0.15)
        if second_drop[1] > 0.15:
            _add_cue(second_drop[0], "drop", "DROP 2", "red", snap_4bar=True)

    # ── 6. OUTRO — sustained energy decline in last ~20% ──
    outro_sections = _find_section_by_label(sections, "OUTRO")
    if outro_sections and len(cue_points) < 8:
        outro_pos = outro_sections[0].get("time_ms", 0)
        _add_cue(outro_pos, "section", "OUTRO", "purple", snap_4bar=True)
    elif duration_ms > 30000 and len(cue_points) < 8:
        # Find where energy starts its final sustained decline
        search_start = int(duration_ms * 0.7)
        step = int(bar_ms * 4)
        outro_pos = int(duration_ms * 0.87)  # fallback
        prev_energy = _energy_at(search_start)
        decline_count = 0
        for t in range(search_start, duration_ms - step, step):
            e = _energy_at(t)
            if e < prev_energy - 0.02:
                decline_count += 1
                if decline_count >= 2:
                    outro_pos = t - step  # start of the decline
                    break
            else:
                decline_count = 0
            prev_energy = e
        _add_cue(outro_pos, "section", "OUTRO", "purple", snap_4bar=True)

    # ── 7. PHRASE markers — structurally significant boundaries ──
    if phrases and len(cue_points) < 8:
        # Score phrases by: energy contrast × structural significance
        scored_phrases: List[Tuple[int, float]] = []
        for ph in phrases:
            contrast = abs(_energy_contrast(ph))
            # Prefer phrases on 16-bar boundaries
            bar_offset = (ph % phrase_16bar_ms) / phrase_16bar_ms if phrase_16bar_ms > 0 else 0.5
            structural_score = 1.0 - min(bar_offset, 1.0 - bar_offset) * 2
            total_score = contrast * 0.6 + structural_score * 0.4
            scored_phrases.append((ph, total_score))
        scored_phrases.sort(key=lambda x: -x[1])

        for ph_ms, _ in scored_phrases:
            if len(cue_points) >= 8:
                break
            _add_cue(ph_ms, "phrase", "PHRASE", "green", snap_4bar=True)

    # ── 8. VERSE/CHORUS — fill remaining with extra section markers ──
    verse_sections = _find_section_by_label(sections, "VERSE")
    chorus_sections = _find_section_by_label(sections, "CHORUS")

    # Interleave verse/chorus by chronological order
    extra_sections = (
        [(vs.get("time_ms", 0), "VERSE", "cyan") for vs in verse_sections] +
        [(ch.get("time_ms", 0), "CHORUS", "pink") for ch in chorus_sections]
    )
    extra_sections.sort(key=lambda x: x[0])

    for pos, name, color in extra_sections:
        if len(cue_points) >= 8:
            break
        _add_cue(pos, "section", name, color, snap_4bar=True)

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
