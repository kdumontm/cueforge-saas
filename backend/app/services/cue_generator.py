from typing import Dict, List, Tuple
from sqlalchemy.orm import Session

from app.models import (
    Track, TrackAnalysis, CuePoint, CueRule, User, CUE_COLOR_RGB
)


def _apply_drop_cue(
    track: Track,
    analysis: TrackAnalysis,
    cue_points: List[CuePoint],
    slot: int
) -> Tuple[List[CuePoint], int]:
    """
    Apply drop detection rule to create cue points.

    Args:
        track: Track object
        analysis: TrackAnalysis object with drops
        cue_points: Current list of cue points
        slot: Current hot cue slot

    Returns:
        Updated cue_points list and next slot
    """
    if not analysis.drops:
        return cue_points, slot

    for drop in analysis.drops:
        if slot >= 8:
            break

        cue = CuePoint(
            track_id=track.id,
            time=drop["time"],
            label=f"DROP {len([c for c in cue_points if 'DROP' in c.label]) + 1}",
            hot_cue_slot=slot,
            color=CUE_COLOR_RGB["red"]
        )
        cue_points.append(cue)
        slot += 1

    return cue_points, slot


def _apply_section_cue(
    track: Track,
    analysis: TrackAnalysis,
    cue_points: List[CuePoint],
    slot: int
) -> Tuple[List[CuePoint], int]:
    """
    Apply section detection rule to create cue points.

    Args:
        track: Track object
        analysis: TrackAnalysis object with sections
        cue_points: Current list of cue points
        slot: Current hot cue slot

    Returns:
        Updated cue_points list and next slot
    """
    if not analysis.sections:
        return cue_points, slot

    color_map = {
        "INTRO": CUE_COLOR_RGB["blue"],
        "BUILD": CUE_COLOR_RGB["green"],
        "DROP": CUE_COLOR_RGB["red"],
        "BREAKDOWN": CUE_COLOR_RGB["yellow"],
        "OUTRO": CUE_COLOR_RGB["purple"]
    }

    for section in analysis.sections:
        if slot >= 8:
            break

        color = color_map.get(section["label"], CUE_COLOR_RGB["white"])

        cue = CuePoint(
            track_id=track.id,
            time=section["time"],
            label=section["label"],
            hot_cue_slot=slot,
            color=color
        )
        cue_points.append(cue)
        slot += 1

    return cue_points, slot


def _apply_phrase_cue(
    track: Track,
    analysis: TrackAnalysis,
    cue_points: List[CuePoint],
    slot: int
) -> Tuple[List[CuePoint], int]:
    """
    Apply phrase detection rule to create cue points.

    Args:
        track: Track object
        analysis: TrackAnalysis object with phrases
        cue_points: Current list of cue points
        slot: Current hot cue slot

    Returns:
        Updated cue_points list and next slot
    """
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
            color=CUE_COLOR_RGB["cyan"]
        )
        cue_points.append(cue)
        slot += 1

    return cue_points, slot


def _apply_beat_cue(
    track: Track,
    analysis: TrackAnalysis,
    cue_points: List[CuePoint],
    slot: int,
    beat_interval: int = 4
) -> Tuple[List[CuePoint], int]:
    """
    Apply beat grid rule to create cue points.

    Args:
        track: Track object
        analysis: TrackAnalysis object with beats
        cue_points: Current list of cue points
        slot: Current hot cue slot
        beat_interval: Mark every N beats

    Returns:
        Updated cue_points list and next slot
    """
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
            color=CUE_COLOR_RGB["white"]
        )
        cue_points.append(cue)
        slot += 1

    return cue_points, slot


def _apply_manual_cue(
    track: Track,
    cue_points: List[CuePoint],
    slot: int
) -> Tuple[List[CuePoint], int]:
    """
    Apply manual cue points created by user.

    Args:
        track: Track object
        cue_points: Current list of cue points
        slot: Current hot cue slot

    Returns:
        Updated cue_points list and next slot
    """
    # Manual cues already exist in track, just preserve them
    return cue_points, slot


def apply_rules_to_track(track_id: int, user_id: int, db: Session) -> None:
    """
    Apply all active rules to generate cue points.
    Respects plan limits (8 free / 64 pro).

    Args:
        track_id: Track to generate cues for
        user_id: User ID (for plan limits)
        db: Database session
    """
    # Get track and analysis
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == user_id
    ).first()

    if not track:
        return

    analysis = db.query(TrackAnalysis).filter(
        TrackAnalysis.track_id == track_id
    ).first()

    if not analysis:
        return

    # Get user plan
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return

    plan = user.subscription_plan
    max_cues = 64 if plan == "pro" else 8

    # Get active rules
    rules = db.query(CueRule).filter(CueRule.track_id == track_id, CueRule.is_active == True).all()

    # Generate cue points
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

    # Save cue points
    for cue in cue_points:
        db.add(cue)

    db.commit()
