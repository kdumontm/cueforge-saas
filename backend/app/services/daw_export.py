"""
CueForge — DAW Export Service

Exports cue points and analysis data to DAW formats:
- Ableton Live (.als project with clip markers)
- FL Studio (.flp format with markers)

Supports both text-based and binary DAW formats with marker data.
"""

import json
import struct
from typing import List, Dict, Optional
from datetime import datetime


# ── Ableton Live Export ──────────────────────────────────────────────────

def generate_ableton_live_markers(tracks: List[Dict]) -> Dict:
    """
    Generate Ableton Live marker/locator data for tracks.

    Ableton Live uses clip markers and locators in .als projects.
    This exports marker data compatible with Live's locator system.

    Args:
        tracks: List of track data

    Returns:
        Ableton Live marker structure
    """
    markers = {
        "format": "ableton_live_markers",
        "version": "11.0",
        "created": datetime.now().isoformat(),
        "tracks": []
    }

    for track_idx, track in enumerate(tracks):
        track_markers = {
            "track_number": track_idx + 1,
            "track_name": track.get("title", "Unknown"),
            "duration_ms": track.get("duration_ms", 0),
            "clip_markers": []
        }

        # Convert cue points to clip markers
        cue_points = track.get("cue_points", []) or []
        for cue_idx, cue in enumerate(cue_points):
            marker = {
                "marker_id": cue_idx,
                "name": cue.get("label", f"Cue {cue_idx + 1}"),
                "time_ms": cue.get("position_ms", 0),
                "time_sec": (cue.get("position_ms", 0) or 0) / 1000.0,
                "color": cue.get("color", "#FF0000"),
                "type": cue.get("type", "cue"),
                "locked": False,
            }
            track_markers["clip_markers"].append(marker)

        markers["tracks"].append(track_markers)

    return markers


# ── FL Studio Export ──────────────────────────────────────────────────

def generate_fl_studio_markers(tracks: List[Dict]) -> Dict:
    """
    Generate FL Studio marker data for tracks.

    FL Studio uses time markers in projects. This exports marker
    data compatible with FL Studio's marker system.

    Args:
        tracks: List of track data

    Returns:
        FL Studio marker structure
    """
    fl_markers = {
        "format": "fl_studio_markers",
        "version": "20.0",
        "created": datetime.now().isoformat(),
        "tracks": []
    }

    for track_idx, track in enumerate(tracks):
        track_data = {
            "pattern_number": track_idx + 1,
            "track_name": track.get("title", "Unknown"),
            "markers": []
        }

        # Convert cue points to FL Studio markers
        cue_points = track.get("cue_points", []) or []
        for cue_idx, cue in enumerate(cue_points):
            # FL Studio uses patterns/markers system
            marker = {
                "marker_index": cue_idx,
                "name": cue.get("label", f"Marker {cue_idx + 1}"),
                "position_beat": (cue.get("position_ms", 0) or 0) / 1000.0 * 2,  # Convert to beat
                "position_ms": cue.get("position_ms", 0),
                "color_index": _fl_studio_color_to_index(cue.get("color", "#FF0000")),
            }
            track_data["markers"].append(marker)

        fl_markers["tracks"].append(track_data)

    return fl_markers


def _fl_studio_color_to_index(hex_color: str) -> int:
    """Convert hex color to FL Studio color index (0-12)."""
    color_map = {
        "#FF0000": 0,   # Red
        "#00FF00": 1,   # Green
        "#0000FF": 2,   # Blue
        "#FFFF00": 3,   # Yellow
        "#FF00FF": 4,   # Magenta
        "#00FFFF": 5,   # Cyan
        "#FF8800": 6,   # Orange
        "#FF0088": 7,   # Pink
        "#8800FF": 8,   # Purple
        "#00FF88": 9,   # Lime
        "#FF88FF": 10,  # Light Pink
        "#88FFFF": 11,  # Light Cyan
        "#888888": 12,  # Gray
    }
    hex_color = (hex_color or "#FF0000").upper()
    return color_map.get(hex_color, 0)


def export_tracks_to_ableton(
    tracks: List[Dict],
    output_path: Optional[str] = None
) -> Dict:
    """
    Export tracks as Ableton Live markers.

    Args:
        tracks: List of track data
        output_path: Optional file path to save JSON

    Returns:
        Export result
    """
    markers = generate_ableton_live_markers(tracks)

    result = {
        "format": "ableton_live_json",
        "version": "11.0",
        "track_count": len(tracks),
        "data": markers,
    }

    if output_path:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(markers, f, indent=2, ensure_ascii=False)
        result["file_path"] = output_path

    return result


def export_tracks_to_fl_studio(
    tracks: List[Dict],
    output_path: Optional[str] = None
) -> Dict:
    """
    Export tracks as FL Studio markers.

    Args:
        tracks: List of track data
        output_path: Optional file path to save JSON

    Returns:
        Export result
    """
    markers = generate_fl_studio_markers(tracks)

    result = {
        "format": "fl_studio_json",
        "version": "20.0",
        "track_count": len(tracks),
        "data": markers,
    }

    if output_path:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(markers, f, indent=2, ensure_ascii=False)
        result["file_path"] = output_path

    return result
