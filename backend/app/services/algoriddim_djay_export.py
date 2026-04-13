"""
CueForge — Algoriddim djay Pro Export Service

Exports to Algoriddim djay Pro (iOS/Android) compatible format.
djay Pro uses JSON playlists and supports Spotify integration, cueing, and smart mixing.

Compatibility: djay Pro 5.0+
"""

import json
from typing import List, Dict, Optional
from datetime import datetime


def generate_djay_pro_playlist(tracks: List[Dict], playlist_name: str = "CueForge Export") -> Dict:
    """
    Generate djay Pro-compatible playlist.

    Args:
        tracks: List of track data
        playlist_name: Name for the playlist

    Returns:
        djay Pro playlist structure
    """
    playlist = {
        "playlist_name": playlist_name,
        "created_at": datetime.now().isoformat(),
        "version": "1.0",
        "track_count": len(tracks),
        "tracks": []
    }

    for track_idx, track in enumerate(tracks):
        analysis = track.get("analysis", {}) or {}

        # djay Pro track entry
        track_entry = {
            "track_id": track_idx,
            "title": track.get("title", ""),
            "artist": track.get("artist", ""),
            "album": track.get("album", ""),
            "duration_ms": track.get("duration_ms", 0),
            "bpm": analysis.get("bpm", 0),
            "key": track.get("key", ""),
            # Spotify integration
            "spotify_uri": track.get("spotify_uri", ""),
            "artwork_url": track.get("artwork_url", ""),
            # Local file
            "local_file_path": track.get("file_path", ""),
            # Analysis metadata for smart mixing
            "energy": analysis.get("energy", 0),
            "danceability": analysis.get("danceability", 0),
            "acousticness": analysis.get("acousticness", 0),
            "instrumentalness": analysis.get("instrumentalness", 0),
            "valence": analysis.get("valence", 0),
            # Cue points for djay (up to 8 hot cues)
            "hot_cues": [],
        }

        # Add hot cues (djay supports 8 max)
        cue_points = track.get("cue_points", []) or []
        for cue_idx, cue in enumerate(cue_points[:8]):  # Limit to 8
            track_entry["hot_cues"].append({
                "index": cue_idx,
                "position_ms": cue.get("position_ms", 0),
                "label": cue.get("label", f"Cue {cue_idx + 1}"),
                "color": cue.get("color", "#FF0000"),
            })

        playlist["tracks"].append(track_entry)

    return playlist


def export_tracks_to_djay_pro(
    tracks: List[Dict],
    output_path: Optional[str] = None,
    playlist_name: str = "CueForge Export"
) -> Dict:
    """
    Export tracks to djay Pro format.

    Args:
        tracks: List of track data
        output_path: Optional file path to save JSON
        playlist_name: Name for the exported playlist

    Returns:
        Export result with JSON content
    """
    djay_data = generate_djay_pro_playlist(tracks, playlist_name)

    result = {
        "format": "djay_pro_json",
        "version": "1.0",
        "track_count": len(tracks),
        "data": djay_data,
    }

    if output_path:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(djay_data, f, indent=2, ensure_ascii=False)
        result["file_path"] = output_path

    return result
