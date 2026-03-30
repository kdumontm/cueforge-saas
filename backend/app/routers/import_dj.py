"""
CueForge v2 — DJ Library Import router (Phase 2).

Import from Rekordbox XML, Serato crate, and Traktor NML.
Endpoints:
  POST /import/rekordbox    — import Rekordbox XML collection
  POST /import/serato       — import Serato crate file
  POST /import/traktor      — import Traktor NML collection
"""

import logging
from typing import Optional, List
from xml.etree import ElementTree as ET
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.track import Track, TrackAnalysis, CuePoint
from app.models.user import User
from app.middleware.auth import get_current_user
from app.services.camelot import key_to_camelot

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/import", tags=["import"])


# ── Schemas ─────────────────────────────────────────────────────────────────

class ImportResult(BaseModel):
    status: str
    imported: int = 0
    skipped: int = 0
    errors: List[str] = []
    details: List[dict] = []


# ── Rekordbox XML Import ────────────────────────────────────────────────────

def _parse_rekordbox_key(key_attr: Optional[str]) -> Optional[str]:
    """Convert Rekordbox key number to musical key string."""
    if not key_attr:
        return None
    # Rekordbox uses numerical key IDs, but also exports text keys
    # If it's already text, return as-is
    return key_attr


@router.post("/rekordbox", response_model=ImportResult)
async def import_rekordbox(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Import tracks and cue points from a Rekordbox XML file."""
    if not file.filename or not file.filename.lower().endswith(".xml"):
        raise HTTPException(status_code=400, detail="File must be .xml")

    content = await file.read()
    try:
        tree = ET.parse(BytesIO(content))
        root = tree.getroot()
    except ET.ParseError as e:
        raise HTTPException(status_code=400, detail=f"Invalid XML: {e}")

    collection = root.find(".//COLLECTION")
    if collection is None:
        raise HTTPException(status_code=400, detail="No COLLECTION element found in XML")

    imported = 0
    skipped = 0
    errors = []
    details = []

    for track_el in collection.findall("TRACK"):
        try:
            name = track_el.get("Name", "")
            artist = track_el.get("Artist", "")
            album = track_el.get("Album", "")
            genre = track_el.get("Genre", "")
            bpm_str = track_el.get("AverageBpm", "0")
            key_str = track_el.get("Tonality", "")
            duration_str = track_el.get("TotalTime", "0")
            location = track_el.get("Location", "")

            bpm = float(bpm_str) if bpm_str else None
            duration_ms = int(float(duration_str) * 1000) if duration_str else None

            # Check for duplicate by title + artist
            existing = db.query(Track).filter(
                Track.user_id == current_user.id,
                Track.title == name,
                Track.artist == artist,
            ).first()
            if existing:
                skipped += 1
                continue

            # Create track
            track = Track(
                user_id=current_user.id,
                filename=location.split("/")[-1] if location else f"{name}.mp3",
                original_filename=location.split("/")[-1] if location else name,
                title=name,
                artist=artist,
                album=album,
                genre=genre,
                camelot_code=key_to_camelot(key_str) if key_str else None,
                status="completed",
            )
            db.add(track)
            db.flush()

            # Create analysis
            if bpm or key_str or duration_ms:
                analysis = TrackAnalysis(
                    track_id=track.id,
                    bpm=bpm,
                    key=key_str,
                    duration_ms=duration_ms,
                )
                db.add(analysis)

            # Import cue points
            for pos_el in track_el.findall("POSITION_MARK"):
                pos_name = pos_el.get("Name", "")
                pos_type = pos_el.get("Type", "0")
                pos_start = pos_el.get("Start", "0")
                pos_num = pos_el.get("Num", None)

                position_ms = int(float(pos_start) * 1000) if pos_start else 0
                cue_type = "hot_cue" if pos_type == "0" else "memory"

                cue = CuePoint(
                    track_id=track.id,
                    position_ms=position_ms,
                    cue_type=cue_type,
                    name=pos_name or f"Cue {pos_num or ''}".strip(),
                    number=int(pos_num) if pos_num else None,
                )
                db.add(cue)

            imported += 1
            details.append({"title": name, "artist": artist, "status": "imported"})

        except Exception as e:
            errors.append(f"Error importing track: {e}")
            logger.warning(f"Rekordbox import error: {e}")

    db.commit()
    return ImportResult(
        status="ok",
        imported=imported,
        skipped=skipped,
        errors=errors,
        details=details,
    )


# ── Serato Import (stub — crate file parsing) ──────────────────────────────

@router.post("/serato", response_model=ImportResult)
async def import_serato(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Import tracks from a Serato crate file (.crate).

    Note: Full Serato binary parsing is complex — this is a basic implementation
    that handles the most common crate format.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    content = await file.read()

    # Serato .crate files are binary with embedded file paths
    # Basic extraction of file paths from the binary data
    imported = 0
    errors = []
    details = []

    try:
        # Extract UTF-16 encoded paths from Serato crate binary
        text = content.decode("utf-16-be", errors="ignore")
        paths = [p.strip() for p in text.split("\x00") if "/" in p and "." in p]

        for path in paths:
            filename = path.split("/")[-1]
            name = filename.rsplit(".", 1)[0] if "." in filename else filename

            existing = db.query(Track).filter(
                Track.user_id == current_user.id,
                Track.original_filename == filename,
            ).first()
            if existing:
                continue

            track = Track(
                user_id=current_user.id,
                filename=filename,
                original_filename=filename,
                title=name,
                status="pending",
            )
            db.add(track)
            imported += 1
            details.append({"filename": filename, "status": "imported"})

    except Exception as e:
        errors.append(f"Serato parsing error: {e}")

    db.commit()
    return ImportResult(
        status="ok",
        imported=imported,
        skipped=0,
        errors=errors,
        details=details,
    )


# ── Traktor NML Import ─────────────────────────────────────────────────────

@router.post("/traktor", response_model=ImportResult)
async def import_traktor(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Import tracks from a Traktor NML collection file."""
    if not file.filename or not file.filename.lower().endswith(".nml"):
        raise HTTPException(status_code=400, detail="File must be .nml")

    content = await file.read()
    try:
        tree = ET.parse(BytesIO(content))
        root = tree.getroot()
    except ET.ParseError as e:
        raise HTTPException(status_code=400, detail=f"Invalid NML: {e}")

    collection = root.find(".//COLLECTION")
    if collection is None:
        raise HTTPException(status_code=400, detail="No COLLECTION element found")

    imported = 0
    skipped = 0
    errors = []
    details = []

    for entry in collection.findall("ENTRY"):
        try:
            title = entry.get("TITLE", "")
            artist = entry.get("ARTIST", "")

            # Get BPM from TEMPO element
            tempo_el = entry.find("TEMPO")
            bpm = float(tempo_el.get("BPM", "0")) if tempo_el is not None else None

            # Get key from MUSICAL_KEY element
            key_el = entry.find("MUSICAL_KEY")
            key_str = key_el.get("VALUE", "") if key_el is not None else ""

            # Get file location
            location_el = entry.find("LOCATION")
            filename = ""
            if location_el is not None:
                filename = location_el.get("FILE", "")

            # Check duplicate
            existing = db.query(Track).filter(
                Track.user_id == current_user.id,
                Track.title == title,
                Track.artist == artist,
            ).first()
            if existing:
                skipped += 1
                continue

            track = Track(
                user_id=current_user.id,
                filename=filename or f"{title}.mp3",
                original_filename=filename or title,
                title=title,
                artist=artist,
                camelot_code=key_to_camelot(key_str) if key_str else None,
                status="completed",
            )
            db.add(track)
            db.flush()

            if bpm or key_str:
                analysis = TrackAnalysis(
                    track_id=track.id,
                    bpm=bpm,
                    key=key_str,
                )
                db.add(analysis)

            # Import cue points from CUE_V2 elements
            for cue_el in entry.findall("CUE_V2"):
                cue_name = cue_el.get("NAME", "")
                cue_start = cue_el.get("START", "0")
                cue_type_val = cue_el.get("TYPE", "0")

                position_ms = int(float(cue_start)) if cue_start else 0
                cue_type = "hot_cue" if cue_type_val == "0" else "memory"

                cue = CuePoint(
                    track_id=track.id,
                    position_ms=position_ms,
                    cue_type=cue_type,
                    name=cue_name or "Cue",
                )
                db.add(cue)

            imported += 1
            details.append({"title": title, "artist": artist, "status": "imported"})

        except Exception as e:
            errors.append(f"Error importing: {e}")

    db.commit()
    return ImportResult(
        status="ok",
        imported=imported,
        skipped=skipped,
        errors=errors,
        details=details,
    )
