from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import os
import tempfile

from app.database import get_db
from app.models import User, Track
from app.middleware.auth import get_current_user
from app.services.rekordbox_exporter import export_rekordbox_xml

router = APIRouter(prefix="/export", tags=["export"])


@router.get("/{track_id}/rekordbox")
async def export_rekordbox(
    track_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> FileResponse:
    """
    Export track cues as Rekordbox XML.

    Args:
        track_id: Track ID
        user: Current user
        db: Database session

    Returns:
        XML file as FileResponse
    """
    # Verify track ownership
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == user.id
    ).first()

    if not track:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Track not found"
        )

    try:
        # Generate XML
        xml_content = export_rekordbox_xml(track_id, db)

        if not xml_content:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to generate XML"
            )

        # Create temporary file
        with tempfile.NamedTemporaryFile(
            mode='w',
            suffix='.xml',
            delete=False,
            encoding='utf-8'
        ) as tmp:
            tmp.write(xml_content)
            tmp_path = tmp.name

        # Return file
        filename = f"{track.title}.xml"
        return FileResponse(
            path=tmp_path,
            filename=filename,
            media_type="application/xml"
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error exporting: {str(e)}"
        )
