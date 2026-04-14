"""
TrackCue — Spotify DJ Export Service

Exports to Spotify DJ format with playlist and cue point markers.
Includes track positioning for DJ performances and mix annotations.

Compatibility: Spotify DJ, Spotify for Artists
"""

import json
from typing import List, Dict, Optional
from datetime import datetime


def generate_spotify_dj_playlist(tracks: List[Dict], playlist_name: str = "TrackCue Export") -> Dict:
    """
    Generate Spotify DJ-compatible playlist with markers.

    Args:
        tracks: List of track data (should include spotify_uri)
        playlist_name: Name for the playlist

    Returns:
        Spotify DJ playlist structure with markers
    """
    playlist = {
        "format": "spotify_dj_playlist",
        "version": "1.0",
        "metadata": {
            "name": playlist_name,
            "created_at": datetime.now().isoformat(),
            "track_count": len(tracks),
        },
        "tracks": []
    }

    for track_idx, track in enumerate(tracks):
        analysis = track.get("analysis", {}) or {}

        spotify_uri = track.get("spotify_uri") or f"spotify:track:trackcue_{track_idx}"

        track_entry = {
            "position": track_idx,
            "spotify_uri": spotify_uri,
            "track_name": track.get("title", "Unknown"),
            "artist_name": track.get("artist", "Unknown"),
            "album_name": track.get("album", ""),
            "duration_ms": track.get("duration_ms", 0),
            # Spotify audio features
            "audio_features": {
                "bpm": analysis.get("bpm", 0),
                "key": track.get("key", ""),
                "energy": analysis.get("energy", 0),
                "danceability": analysis.get("danceability", 0),
                "valence": analysis.get("valence", 0),
                "acousticness": analysis.get("acousticness", 0),
                "instrumentalness": analysis.get("instrumentalness", 0),
            },
            # DJ markers for mixing
            "dj_markers": []
        }

        # Add DJ markers from cue points
        cue_points = track.get("cue_points", []) or []
        for cue_idx, cue in enumerate(cue_points):
            marker = {
                "marker_id": cue_idx,
                "position_ms": cue.get("position_ms", 0),
                "label": cue.get("label", f"Marker {cue_idx + 1}"),
                "type": cue.get("type", "cue"),
                "tempo_bpm": analysis.get("bpm", 0),
            }
            track_entry["dj_markers"].append(marker)

        playlist["tracks"].append(track_entry)

    return playlist


def export_tracks_to_spotify_dj(
    tracks: List[Dict],
    output_path: Optional[str] = None,
    playlist_name: str = "TrackCue Export"
) -> Dict:
    """
    Export tracks to Spotify DJ format.

    Args:
        tracks: List of track data
        output_path: Optional file path to save JSON
        playlist_name: Name for the exported playlist

    Returns:
        Export result with Spotify DJ data
    """
    spotify_data = generate_spotify_dj_playlist(tracks, playlist_name)

    result = {
        "format": "spotify_dj_json",
        "version": "1.0",
        "track_count": len(tracks),
        "data": spotify_data,
    }

    if output_path:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(spotify_data, f, indent=2, ensure_ascii=False)
        result["file_path"] = output_path

    return result
