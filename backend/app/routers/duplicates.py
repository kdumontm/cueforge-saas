import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.track import Track
from app.models.user import User
from app.middleware.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


def levenshtein_distance(s1: str, s2: str) -> int:
    """Calculate Levenshtein distance between two strings."""
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)

    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row

    return previous_row[-1]


def detect_duplicates(tracks: List[Track]) -> List[dict]:
    """
    Detect potential duplicates in a list of tracks.
    Returns list of duplicate pairs with confidence scores.
    """
    duplicates = []
    processed_pairs = set()

    for i, track_a in enumerate(tracks):
        for j, track_b in enumerate(tracks):
            if i >= j:
                continue

            pair_key = (min(track_a.id, track_b.id), max(track_a.id, track_b.id))
            if pair_key in processed_pairs:
                continue

            confidence = 0
            match_reasons = []

            # 1. Exact title + artist match (case-insensitive) → 100%
            if (
                (track_a.title or "").lower() == (track_b.title or "").lower()
                and (track_a.artist or "").lower() == (track_b.artist or "").lower()
            ):
                confidence = 100
                match_reasons.append("Titre et artiste identiques")
            else:
                # 2. Similar title + same artist → 80%
                title_dist = levenshtein_distance(
                    (track_a.title or "").lower(),
                    (track_b.title or "").lower()
                )
                if (
                    title_dist < 3
                    and (track_a.artist or "").lower() == (track_b.artist or "").lower()
                    and (track_a.artist or "").strip()
                ):
                    confidence = 80
                    match_reasons.append(f"Titre similaire (distance: {title_dist})")
                    match_reasons.append("Même artiste")

                # 3. Same duration (±2s) + same BPM (±1) + same artist → 70%
                if not confidence:
                    duration_match = (
                        track_a.duration and track_b.duration and
                        abs(track_a.duration - track_b.duration) <= 2
                    )
                    bpm_match = (
                        track_a.bpm and track_b.bpm and
                        abs(track_a.bpm - track_b.bpm) <= 1
                    )
                    artist_match = (
                        (track_a.artist or "").lower() == (track_b.artist or "").lower()
                        and (track_a.artist or "").strip()
                    )

                    if duration_match and bpm_match and artist_match:
                        confidence = 70
                        match_reasons.append(f"Durée: {track_a.duration}s ≈ {track_b.duration}s")
                        match_reasons.append(f"BPM: {track_a.bpm} ≈ {track_b.bpm}")
                        match_reasons.append("Même artiste")

            if confidence > 0:
                processed_pairs.add(pair_key)

                # Convert tracks to dict
                def track_to_dict(track):
                    return {
                        'id': track.id,
                        'title': track.title,
                        'artist': track.artist,
                        'album': track.album,
                        'bpm': getattr(track.analysis, 'bpm', None) if track.analysis else None,
                        'key': getattr(track.analysis, 'key', None) if track.analysis else None,
                        'duration': getattr(track.analysis, 'duration_ms', None) if track.analysis else None,
                        'genre': track.genre,
                        'artwork_url': track.artwork_url,
                        'year': track.year,
                    }

                duplicates.append({
                    "track_a": track_to_dict(track_a),
                    "track_b": track_to_dict(track_b),
                    "confidence": confidence,
                    "match_reasons": match_reasons,
                })

    # Sort by confidence (descending)
    duplicates.sort(key=lambda x: x["confidence"], reverse=True)
    return duplicates


@router.get("/api/v1/tracks/duplicates")
async def detect_track_duplicates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Detect potential duplicates in the user's track library.
    Returns array of duplicate pairs with confidence and match reasons.
    """
    from sqlalchemy.orm import joinedload

    # Get all tracks for the user
    tracks = db.query(Track).filter(Track.user_id == current_user.id).options(
        joinedload(Track.analysis)
    ).all()

    if not tracks:
        return {"duplicates": [], "count": 0}

    duplicates = detect_duplicates(tracks)

    return {
        "duplicates": duplicates,
        "count": len(duplicates),
    }


@router.post("/api/v1/tracks/merge")
async def merge_tracks(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Merge two tracks. Keep keep_id, optionally merge cues/tags from remove_id, then delete remove_id.
    Body: { keep_id: int, remove_id: int, merge_cues: bool, merge_tags: bool }
    """
    keep_id = body.get("keep_id")
    remove_id = body.get("remove_id")
    merge_cues = body.get("merge_cues", False)
    merge_tags = body.get("merge_tags", False)

    if not keep_id or not remove_id:
        raise HTTPException(status_code=400, detail="keep_id et remove_id requis")

    # Verify both tracks belong to user
    keep_track = db.query(Track).filter(
        Track.id == keep_id,
        Track.user_id == current_user.id,
    ).first()
    remove_track = db.query(Track).filter(
        Track.id == remove_id,
        Track.user_id == current_user.id,
    ).first()

    if not keep_track or not remove_track:
        raise HTTPException(status_code=404, detail="L'un des morceaux n'existe pas")

    if keep_id == remove_id:
        raise HTTPException(status_code=400, detail="Les IDs des morceaux doivent être différents")

    # Merge cues if requested
    if merge_cues:
        from app.models.track import CuePoint
        cues_to_merge = db.query(CuePoint).filter(
            CuePoint.track_id == remove_id
        ).all()
        for cue in cues_to_merge:
            cue.track_id = keep_id
        db.add_all(cues_to_merge)

    # Merge tags if requested
    if merge_tags:
        # Assuming there's a tags relationship or tags table
        try:
            from app.models.tag import TrackTag
            tags_to_merge = db.query(TrackTag).filter(
                TrackTag.track_id == remove_id
            ).all()
            for tag in tags_to_merge:
                # Check if tag already exists on keep_track
                existing = db.query(TrackTag).filter(
                    TrackTag.track_id == keep_id,
                    TrackTag.tag_id == tag.tag_id,
                ).first()
                if not existing:
                    tag.track_id = keep_id
                    db.add(tag)
        except ImportError:
            # Tag model doesn't exist, skip
            pass

    # Update playlists that contained remove_track
    try:
        from app.models.library import PlaylistTrack
        playlist_tracks = db.query(PlaylistTrack).filter(
            PlaylistTrack.track_id == remove_id
        ).all()
        for pt in playlist_tracks:
            # Check if keep_track is already in playlist
            existing = db.query(PlaylistTrack).filter(
                PlaylistTrack.playlist_id == pt.playlist_id,
                PlaylistTrack.track_id == keep_id,
            ).first()
            if not existing:
                pt.track_id = keep_id
                db.add(pt)
            else:
                db.delete(pt)
    except ImportError:
        # Playlist model doesn't exist, skip
        pass

    # Delete the remove_track
    db.delete(remove_track)
    db.commit()

    return {
        "message": f"Morceaux fusionnés. {remove_id} supprimé.",
        "keep_id": keep_id,
    }
