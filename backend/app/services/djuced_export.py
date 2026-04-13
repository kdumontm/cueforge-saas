"""
CueForge — DJUCED Export Service

Exports to DJUCED (mobile DJ app) compatible format.
DJUCED uses JSON-based metadata and supports cueing, loops, and smart mixing.

Compatibility: DJUCED 4.0+
"""

import json
from typing import List, Dict, Optional
from datetime import datetime


def generate_djuced_playlist(tracks: List[Dict], playlist_name: str = "CueForge Export") -> Dict:
    """
    Generate DJUCED-compatible playlist JSON.

    Args:
        tracks: List of track data
        playlist_name: Name for the playlist

    Returns:
        DJUCED playlist structure
    """
    playlist = {
        "format": "djuced_playlist",
        "version": "1.0",
        "playlist": {
            "name": playlist_name,
            "created": datetime.now().isoformat(),
            "track_count": len(tracks),
            "tracks": []
        }
    }

    for track_idx, track in enumerate(tracks):
        analysis = track.get("analysis", {}) or {}

        track_entry = {
            "index": track_idx,
            "title": track.get("title", "Unknown"),
            "artist": track.get("artist", "Unknown"),
            "album": track.get("album", ""),
            "genre": track.get("genre", ""),
            "duration_ms": track.get("duration_ms", 0),
            "bpm": analysis.get("bpm", 0),
            "key": track.get("key", ""),
            "energy": analysis.get("energy", 0),
            "file_path": track.get("file_path", ""),
            "cue_points": [],
            "loops": []
        }

        # Add cue points
        cue_points = track.get("cue_points", []) or []
        for cue_idx, cue in enumerate(cue_points):
            track_entry["cue_points"].append({
                "id": cue_idx,
                "position_ms": cue.get("position_ms", 0),
                "label": cue.get("label", f"Cue {cue_idx + 1}"),
                "type": cue.get("type", "cue"),
                "color": cue.get("color", "#FF0000"),
            })

        # Add loops
        loop_markers = track.get("loop_markers", []) or []
        for loop_idx, loop in enumerate(loop_markers):
            track_entry["loops"].append({
                "id": loop_idx,
                "start_ms": loop.get("start_ms", 0),
                "end_ms": loop.get("end_ms", 0),
                "name": loop.get("name", f"Loop {loop_idx + 1}"),
                "beats": loop.get("length_beats", 0),
            })

        playlist["playlist"]["tracks"].append(track_entry)

    return playlist


def export_tracks_to_djuced(
    tracks: List[Dict],
    output_path: Optional[str] = None,
    playlist_name: str = "CueForge Export"
) -> Dict:
    """
    Export tracks to DJUCED format.

    Args:
        tracks: List of track data
        output_path: Optional file path to save JSON
        playlist_name: Name for the exported playlist

    Returns:
        Export result with JSON content
    """
    djuced_data = generate_djuced_playlist(tracks, playlist_name)

    result = {
        "format": "djuced_json",
        "version": "1.0",
        "track_count": len(tracks),
        "data": djuced_data,
    }

    if output_path:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(djuced_data, f, indent=2, ensure_ascii=False)
        result["file_path"] = output_path

    return result
