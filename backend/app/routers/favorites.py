from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.favorite import Favorite
from app.models.track import Track
from app.models.user import User
from app.middleware.auth import get_current_user
from app.schemas.track import TrackListItemResponse  # legacy import, kept for compatibility
from app.routers.tracks import _track_to_dict_fast  # PERF Wave14

router = APIRouter()


@router.post("/api/v1/favorites/{track_id}")
async def toggle_favorite(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Toggle favorite status for a track. If already favorited, remove it. Otherwise, add it.
    """
    # Verify track exists and belongs to user
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == current_user.id,
    ).first()

    if not track:
        raise HTTPException(
            status_code=404,
            detail="Morceau non trouvé ou ne vous appartient pas."
        )

    # Check if already favorited
    favorite = db.query(Favorite).filter(
        Favorite.user_id == current_user.id,
        Favorite.track_id == track_id,
    ).first()

    if favorite:
        db.delete(favorite)
        db.commit()
        try:
            from app.services.cache_service import bump_user_version
            bump_user_version(current_user.id)
        except Exception:
            pass
        return {"is_favorite": False, "message": "Favori supprimé"}
    else:
        new_favorite = Favorite(user_id=current_user.id, track_id=track_id)
        db.add(new_favorite)
        db.commit()
        try:
            from app.services.cache_service import bump_user_version
            bump_user_version(current_user.id)
        except Exception:
            pass
        return {"is_favorite": True, "message": "Favori ajouté"}


@router.get("/api/v1/favorites")
async def get_favorites(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get all favorite tracks for the current user with full track details.

    ⚡ Requête unique via JOIN — évite N+1 et bug de visibilité d'index
    où `db.query(Favorite).filter(...).all()` retournait vide alors que
    le POST/check voyaient bien la row.

    PERF Wave6: Redis cache 15s (invalidation via bump_user_version sur fav add/remove).
    """
    # Cache lookup
    from app.services.cache_service import cache_get, cache_set, get_user_version
    _uver = get_user_version(current_user.id)
    _ckey = f"{current_user.id}:list:v{_uver}"
    _cached = cache_get("favorites", _ckey)
    if _cached is not None:
        return _cached

    from sqlalchemy.orm import selectinload
    from sqlalchemy import func
    from app.models.track import CuePoint

    # JOIN direct entre Favorite et Track pour garantir cohérence
    # PERF #1.3: plus de selectinload(cue_points) — on compte via un GROUP BY.
    rows = (
        db.query(Track, Favorite.created_at)
        .join(Favorite, Favorite.track_id == Track.id)
        .filter(
            Favorite.user_id == current_user.id,
            Track.user_id == current_user.id,
        )
        .options(
            selectinload(Track.analysis),
            selectinload(Track.track_tags),
        )
        .order_by(Favorite.created_at.desc())
        .all()
    )

    # Count cue_points en 1 query agrégée (au lieu de N selectinload)
    track_ids = [t.id for t, _ in rows]
    cue_counts_map = {}
    if track_ids:
        cue_rows = (
            db.query(CuePoint.track_id, func.count(CuePoint.id))
            .filter(CuePoint.track_id.in_(track_ids))
            .group_by(CuePoint.track_id)
            .all()
        )
        cue_counts_map = {tid: cnt for tid, cnt in cue_rows}

    # PERF Wave14: serializer Pydantic-free (même shape que /tracks)
    tracks_data = []
    for track, favorited_at in rows:
        track.cue_points_count = cue_counts_map.get(track.id, 0)
        item = _track_to_dict_fast(track)
        item['favorited_at'] = favorited_at.isoformat() if favorited_at else None
        tracks_data.append(item)

    response = {
        "tracks": tracks_data,
        "count": len(tracks_data),
    }
    try:
        cache_set("favorites", _ckey, response, ttl=15)
    except Exception:
        pass
    return response


@router.get("/api/v1/favorites/check/{track_id}")
async def check_favorite(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Check if a track is favorited by the current user.
    """
    favorite = db.query(Favorite).filter(
        Favorite.user_id == current_user.id,
        Favorite.track_id == track_id,
    ).first()

    return {"is_favorite": favorite is not None}


@router.delete("/api/v1/favorites/{track_id}")
async def remove_favorite(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Remove a track from favorites.
    """
    favorite = db.query(Favorite).filter(
        Favorite.user_id == current_user.id,
        Favorite.track_id == track_id,
    ).first()

    if not favorite:
        raise HTTPException(
            status_code=404,
            detail="Ce morceau n'est pas dans vos favoris."
        )

    db.delete(favorite)
    db.commit()
    try:
        from app.services.cache_service import bump_user_version
        bump_user_version(current_user.id)
    except Exception:
        pass
    return {"message": "Favori supprimé"}
