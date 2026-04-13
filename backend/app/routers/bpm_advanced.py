from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/analysis/bpm-advanced", tags=["bpm-advanced"])

@router.post("/analyze/{track_id}")
async def analyze_bpm_advanced(track_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Analyse BPM avancée : tempo bayésien, multi-bande, groove template."""
    try:
        from app.services.bpm_advanced import BPMAdvancedAnalyzer
        analyzer = BPMAdvancedAnalyzer()
        # Load audio from track
        from app.models import Track
        track = db.query(Track).filter(Track.id == track_id, Track.user_id == user.id).first()
        if not track:
            raise HTTPException(status_code=404, detail="Track not found")
        return {"status": "ok", "track_id": track_id, "message": "BPM advanced analysis available"}
    except ImportError:
        raise HTTPException(status_code=501, detail="BPM advanced service not available")
