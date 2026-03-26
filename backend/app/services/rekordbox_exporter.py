from typing import Optional
from xml.etree.ElementTree import Element, SubElement, tostring
from sqlalchemy.orm import Session

from app.models import Track, CuePoint, TrackAnalysis


def export_rekordbox_xml(track_id: int, db: Session) -> Optional[str]:
    """
    Export track cues to Rekordbox 6 XML format.

    Args:
        track_id: Track ID to export
        db: Database session

    Returns:
        XML string or None if track not found
    """
    # Get track and cue points
    track = db.query(Track).filter(Track.id == track_id).first()
    if not track:
        return None

    cue_points = db.query(CuePoint).filter(
        CuePoint.track_id == track_id
    ).order_by(CuePoint.time).all()

    # Get BPM from analysis if available
    analysis = db.query(TrackAnalysis).filter(
        TrackAnalysis.track_id == track_id
    ).first()
    bpm = analysis.bpm if analysis else 120.0

    # Create root DJ_PLAYLISTS element
    dj_playlists = Element("DJ_PLAYLISTS", Version="1.0.0")

    # Add PRODUCT element
    product = SubElement(dj_playlists, "PRODUCT", Company="Rekordbox", Name="rekordbox", Version="6.0.0")

    # Add COLLECTION element
    collection = SubElement(dj_playlists, "COLLECTION", Entries=str(1))

    # Add TRACK element
    track_elem = SubElement(collection, "TRACK", TrackID=str(track_id), Name=track.title)
    SubElement(track_elem, "DURATION", Value=str(int(track.duration or 0)))
    SubElement(track_elem, "TEMPO", Inizio="0.0", Value=str(int(bpm)))

    # Add CUE_POINTS (POSITION_MARK elements)
    for i, cue in enumerate(cue_points):
        # Convert time to milliseconds
        time_ms = int(cue.time * 1000)

        cue_elem = SubElement(
            track_elem,
            "POSITION_MARK",
            {"Num": str(i), "Name": cue.label, "Type": "0", "Start": str(time_ms)}
        )
        SubElement(cue_elem, "COMMENTS", Value=cue.label)

        # Add color if available
        if cue.color:
            SubElement(cue_elem, "COLOR", Value=cue.color)

    # Add PLAYLISTS element
    playlists = SubElement(dj_playlists, "PLAYLISTS", Entries=str(0))

    # Convert to string
    xml_str = tostring(dj_playlists, encoding='unicode')

    # Add XML declaration
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + xml_str
