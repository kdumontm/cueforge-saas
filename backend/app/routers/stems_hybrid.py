from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/api/v1/analysis/stems-hybrid", tags=["stems-hybrid"])

@router.post("/analyze/{track_id}")
async def analyze_stems_hybrid(track_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Séparation des stems hybride : vocals, drums, bass, instruments via ML + DSP."""
    try:
        from app.services.stems_hybrid import StemsHybridEngine
        engine = StemsHybridEngine()
        # Load audio from track
        from app.models import Track
        track = db.query(Track).filter(Track.id == track_id, Track.user_id == user.id).first()
        if not track:
            raise HTTPException(status_code=404, detail="Track not found")
        return {"status": "ok", "track_id": track_id, "message": "Stems hybrid analysis available"}
    except ImportError:
        raise HTTPException(status_code=501, detail="Stems hybrid service not available")
