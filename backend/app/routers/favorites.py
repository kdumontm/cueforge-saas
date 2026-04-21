from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.favorite import Favorite
from app.models.track import Track
from app.models.user import User
from app.middleware.auth import get_current_user

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
        return {"is_favorite": False, "message": "Favori supprimé"}
    else:
        new_favorite = Favorite(user_id=current_user.id, track_id=track_id)
        db.add(new_favorite)
        db.commit()
        return {"is_favorite": True, "message": "Favori ajouté"}


@router.get("/api/v1/favorites")
async def get_favorites(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get all favorite tracks for the current user with full track details.
    """
    from sqlalchemy.orm import selectinload

    favorites = db.query(Favorite).filter(
        Favorite.user_id == current_user.id
    ).all()

    # Get associated tracks
    track_ids = [fav.track_id for fav in favorites]
    if not track_ids:
        return {"tracks": [], "count": 0}

    # ⚡ OPTIM: Utilise selectinload pour eviter N+1 sur analysis/cue_points/track_tags
    tracks = db.query(Track).filter(
        Track.id.in_(track_ids),
        Track.user_id == current_user.id,
    ).options(
        selectinload(Track.analysis),
        selectinload(Track.cue_points),
        selectinload(Track.track_tags),
    ).all()

    # Convert to dict representation
    tracks_data = []
    for track in tracks:
        track_dict = {
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
        tracks_data.append(track_dict)

    return {
        "tracks": tracks_data,
        "count": len(tracks_data)
    }


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
    return {"message": "Favori supprimé"}
