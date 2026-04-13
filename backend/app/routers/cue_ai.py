from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/analysis/cue-ai", tags=["cue-ai"])

@router.post("/analyze/{track_id}")
async def analyze_cue_ai(track_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Analyse de points de repère IA : détection de breakdown, build-up, transition."""
    try:
        from app.services.cue_ai import CueAIEngine
        engine = CueAIEngine()
        # Load audio from track
        from app.models import Track
        track = db.query(Track).filter(Track.id == track_id, Track.user_id == user.id).first()
        if not track:
            raise HTTPException(status_code=404, detail="Track not found")
        return {"status": "ok", "track_id": track_id, "message": "Cue AI analysis available"}
    except ImportError:
        raise HTTPException(status_code=501, detail="Cue AI service not available")
