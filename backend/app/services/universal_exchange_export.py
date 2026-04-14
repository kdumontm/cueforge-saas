"""
TrackCue — Universal Exchange Format Export Service

Generates a comprehensive, format-agnostic JSON structure for maximum
interoperability between DJ software platforms.

The Universal Exchange Format (UEF) provides:
- Complete track metadata
- All cue point types (hot cues, loops, memory cues, etc.)
- Analysis data (BPM, key, energy, etc.)
- Format-specific hints for import into various DJ software
- Preservation of all TrackCue enhancements
"""

import json
from typing import List, Dict, Optional
from datetime import datetime


def generate_universal_exchange_format(
    tracks: List[Dict],
    include_analysis: bool = True,
    include_stems: bool = False
) -> Dict:
    """
    Generate universal exchange format JSON.

    Args:
        tracks: List of track data
        include_analysis: Include audio analysis data
        include_stems: Include stem data if available

    Returns:
        Universal exchange format structure
    """
    uef = {
        "format": "trackcue_universal_exchange",
        "version": "1.0",
        "specification": "https://trackcue.dev/uef/1.0",
        "created_at": datetime.now().isoformat(),
        "metadata": {
            "track_count": len(tracks),
            "cue_count": sum(len(t.get("cue_points", []) or []) for t in tracks),
            "loop_count": sum(len(t.get("loop_markers", []) or []) for t in tracks),
        },
        "tracks": []
    }

    for track_idx, track in enumerate(tracks):
        track_data = {
            "index": track_idx,
            # Basic metadata
            "metadata": {
                "title": track.get("title", "Unknown"),
                "artist": track.get("artist", "Unknown"),
                "album": track.get("album", ""),
                "genre": track.get("genre", ""),
                "label": track.get("label", ""),
                "isrc": track.get("isrc", ""),
                "bpm": track.get("bpm", 0),
                "key": track.get("key", ""),
                "duration_ms": track.get("duration_ms", 0),
            },
            # File information
            "file": {
                "path": track.get("file_path", ""),
                "original_filename": track.get("original_filename", ""),
                "format": track.get("file_format", "mp3"),
                "size_bytes": track.get("file_size_bytes", 0),
            },
            # Cue points (all types)
            "cue_points": [],
            # Loops
            "loops": [],
            # Stems data (optional)
            "stems": [],
        }

        # Add cue points with full metadata
        cue_points = track.get("cue_points", []) or []
        for cue_idx, cue in enumerate(cue_points):
            cue_data = {
                "id": cue.get("id", cue_idx),
                "position_ms": cue.get("position_ms", 0),
                "label": cue.get("label", f"Cue {cue_idx + 1}"),
                "type": cue.get("type", "cue"),  # hot_cue, loop, memory, cue, etc.
                "color": cue.get("color", "#FF0000"),
                "color_rgb": cue.get("color_rgb", (255, 0, 0)),
                "confidence": cue.get("confidence", 0.0),
                "hotcue_slot": cue.get("hotcue_slot", -1),
                "is_memory": cue.get("is_memory", False),
                "metadata": {
                    "created_at": cue.get("created_at", ""),
                    "updated_at": cue.get("updated_at", ""),
                }
            }

            # Add loop-specific data
            if cue.get("type") == "loop" or cue.get("end_position_ms"):
                cue_data["end_position_ms"] = cue.get("end_position_ms", 0)
                cue_data["loop_length_beats"] = cue.get("loop_length_beats", 0)

            track_data["cue_points"].append(cue_data)

        # Add dedicated loop markers
        loop_markers = track.get("loop_markers", []) or []
        for loop_idx, loop in enumerate(loop_markers):
            loop_data = {
                "id": loop.get("id", loop_idx),
                "start_ms": loop.get("start_ms", 0),
                "end_ms": loop.get("end_ms", 0),
                "name": loop.get("name", f"Loop {loop_idx + 1}"),
                "color": loop.get("color", "#00FF00"),
                "length_beats": loop.get("length_beats", 0),
                "locked": loop.get("locked", False),
            }
            track_data["loops"].append(loop_data)

        # Add analysis data if requested
        if include_analysis:
            analysis = track.get("analysis", {}) or {}
            track_data["analysis"] = {
                "bpm": analysis.get("bpm", 0),
                "key": track.get("key", ""),
                "energy": analysis.get("energy", 0),
                "danceability": analysis.get("danceability", 0),
                "valence": analysis.get("valence", 0),
                "acousticness": analysis.get("acousticness", 0),
                "instrumentalness": analysis.get("instrumentalness", 0),
                "loudness": analysis.get("loudness", 0),
                "genre": analysis.get("genre", ""),
                "subgenre": analysis.get("subgenre", ""),
            }

        # Add stems if requested
        if include_stems:
            stems = track.get("stems", []) or []
            for stem in stems:
                stem_data = {
                    "name": stem.get("name", ""),
                    "type": stem.get("type", ""),
                    "file_path": stem.get("file_path", ""),
                    "duration_ms": stem.get("duration_ms", 0),
                }
                track_data["stems"].append(stem_data)

        # Add format hints for compatibility
        track_data["format_hints"] = {
            "rekordbox": {
                "open_key": track.get("open_key", ""),
                "rating": track.get("rating", 0),
            },
            "serato": {
                "bpm_lock": track.get("bpm_lock", False),
            },
            "traktor": {
                "key_value": track.get("key_value", -1),
            },
            "engine_dj": {
                "camelot_key": track.get("camelot_key", ""),
            },
        }

        uef["tracks"].append(track_data)

    return uef


def export_tracks_to_universal_format(
    tracks: List[Dict],
    output_path: Optional[str] = None,
    include_analysis: bool = True,
    include_stems: bool = False
) -> Dict:
    """
    Export tracks to universal exchange format.

    Args:
        tracks: List of track data
        output_path: Optional file path to save JSON
        include_analysis: Include audio analysis data
        include_stems: Include stem data if available

    Returns:
        Export result with UEF data
    """
    uef_data = generate_universal_exchange_format(tracks, include_analysis, include_stems)

    result = {
        "format": "trackcue_universal_exchange_json",
        "version": "1.0",
        "track_count": len(tracks),
        "data": uef_data,
    }

    if output_path:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(uef_data, f, indent=2, ensure_ascii=False)
        result["file_path"] = output_path

    return result
