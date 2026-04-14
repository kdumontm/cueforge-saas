"""
TrackCue — Detailed CSV Export Service

Generates comprehensive CSV exports with all metadata, cue points, and analysis data.
Ideal for spreadsheet analysis, archival, and cross-platform compatibility.

Exports:
- Main tracks CSV (metadata + analysis)
- Detailed cues CSV (all cue points with metadata)
- Optional: loops CSV, stems CSV
"""

import csv
import io
from typing import List, Dict, Optional, Tuple


def generate_tracks_csv(tracks: List[Dict]) -> str:
    """
    Generate main tracks CSV with all metadata and analysis.

    Columns include:
    - Basic info: Title, Artist, Album, Genre, Label
    - Timing: Duration, BPM, Key
    - Analysis: Energy, Danceability, Valence, Acousticness, etc.
    - File info: Path, Format, Size
    - Ratings & Tags: Rating, Tags, Comments
    """
    output = io.StringIO()
    writer = csv.writer(output)

    # Header row
    headers = [
        "Index",
        "Title",
        "Artist",
        "Album",
        "Genre",
        "Subgenre",
        "Label",
        "ISRC",
        # Timing
        "Duration (MM:SS)",
        "Duration (ms)",
        "BPM",
        "Key",
        "Camelot Key",
        # Analysis
        "Energy",
        "Danceability",
        "Valence",
        "Acousticness",
        "Instrumentalness",
        "Loudness (dB)",
        "Tempo Range Min",
        "Tempo Range Max",
        # TrackCue specific
        "Cue Count",
        "Loop Count",
        "First Cue (ms)",
        "Last Cue (ms)",
        # File info
        "File Path",
        "File Format",
        "File Size (MB)",
        # Metadata
        "Date Added",
        "Last Played",
        "Play Count",
        "Rating (stars)",
        "Tags",
        "Comment",
        # Import status
        "Import Status",
        "Confidence",
    ]
    writer.writerow(headers)

    # Data rows
    for idx, track in enumerate(tracks):
        analysis = track.get("analysis", {}) or {}
        cue_points = track.get("cue_points", []) or []
        loop_markers = track.get("loop_markers", []) or []

        duration_ms = track.get("duration_ms", 0) or 0
        duration_sec = int(duration_ms / 1000)
        minutes = duration_sec // 60
        seconds = duration_sec % 60

        first_cue_ms = min([c.get("position_ms", 0) or 0 for c in cue_points], default=0)
        last_cue_ms = max([c.get("position_ms", 0) or 0 for c in cue_points], default=0)

        row = [
            idx + 1,
            track.get("title", ""),
            track.get("artist", ""),
            track.get("album", ""),
            track.get("genre", ""),
            analysis.get("subgenre", ""),
            track.get("label", ""),
            track.get("isrc", ""),
            f"{minutes}:{seconds:02d}",
            duration_ms,
            f"{analysis.get('bpm', 0):.2f}",
            track.get("key", ""),
            track.get("open_key", ""),
            f"{analysis.get('energy', 0):.2f}",
            f"{analysis.get('danceability', 0):.2f}",
            f"{analysis.get('valence', 0):.2f}",
            f"{analysis.get('acousticness', 0):.2f}",
            f"{analysis.get('instrumentalness', 0):.2f}",
            f"{analysis.get('loudness', 0):.2f}",
            f"{track.get('min_tempo', 0.8):.2f}",
            f"{track.get('max_tempo', 1.2):.2f}",
            len(cue_points),
            len(loop_markers),
            first_cue_ms if cue_points else "",
            last_cue_ms if cue_points else "",
            track.get("file_path", ""),
            track.get("file_format", ""),
            f"{track.get('file_size_mb', 0):.2f}",
            track.get("created_at", ""),
            track.get("last_played", ""),
            track.get("play_count", 0),
            f"{track.get('rating', 0):.1f}",
            "; ".join(track.get("tags", [])),
            track.get("comment", ""),
            track.get("import_status", "success"),
            f"{track.get('confidence', 0):.2f}",
        ]
        writer.writerow(row)

    return output.getvalue()


def generate_cues_csv(tracks: List[Dict]) -> str:
    """
    Generate detailed cues CSV with all cue point information.

    One row per cue point across all tracks.
    """
    output = io.StringIO()
    writer = csv.writer(output)

    headers = [
        "Track Index",
        "Track Title",
        "Artist",
        "Track Duration (ms)",
        "Track BPM",
        "Track Key",
        "Cue Index",
        "Cue Label",
        "Cue Type",
        "Position (ms)",
        "Position (MM:SS.MS)",
        "End Position (ms)",
        "Duration (ms)",
        "Color (Hex)",
        "Color (RGB)",
        "Confidence",
        "Is Memory",
        "Hotcue Slot",
        "Loop Beats",
        "Created At",
        "Updated At",
    ]
    writer.writerow(headers)

    for track_idx, track in enumerate(tracks):
        cue_points = track.get("cue_points", []) or []

        for cue_idx, cue in enumerate(cue_points):
            pos_ms = cue.get("position_ms", 0) or 0
            minutes = int(pos_ms / 60000)
            seconds = (pos_ms % 60000) / 1000

            end_ms = cue.get("end_position_ms", 0) or 0
            duration = end_ms - pos_ms if end_ms > pos_ms else 0

            color_hex = cue.get("color", "#FF0000")
            color_rgb = cue.get("color_rgb", (255, 0, 0))
            rgb_str = f"({color_rgb[0]}, {color_rgb[1]}, {color_rgb[2]})"

            row = [
                track_idx + 1,
                track.get("title", ""),
                track.get("artist", ""),
                track.get("duration_ms", 0),
                track.get("bpm", 0),
                track.get("key", ""),
                cue_idx + 1,
                cue.get("label", f"Cue {cue_idx + 1}"),
                cue.get("type", "cue"),
                pos_ms,
                f"{minutes}:{seconds:05.2f}",
                end_ms if end_ms > 0 else "",
                duration if duration > 0 else "",
                color_hex,
                rgb_str,
                f"{cue.get('confidence', 0):.2f}",
                cue.get("is_memory", False),
                cue.get("hotcue_slot", -1),
                f"{cue.get('loop_length_beats', 0):.2f}",
                cue.get("created_at", ""),
                cue.get("updated_at", ""),
            ]
            writer.writerow(row)

    return output.getvalue()


def generate_loops_csv(tracks: List[Dict]) -> str:
    """Generate detailed loops CSV."""
    output = io.StringIO()
    writer = csv.writer(output)

    headers = [
        "Track Index",
        "Track Title",
        "Artist",
        "Loop Index",
        "Loop Name",
        "Start (ms)",
        "End (ms)",
        "Duration (ms)",
        "Duration (beats)",
        "Duration (MM:SS)",
        "Color",
        "Locked",
    ]
    writer.writerow(headers)

    for track_idx, track in enumerate(tracks):
        loops = track.get("loop_markers", []) or []

        for loop_idx, loop in enumerate(loops):
            start_ms = loop.get("start_ms", 0)
            end_ms = loop.get("end_ms", 0)
            duration_ms = end_ms - start_ms

            duration_sec = int(duration_ms / 1000)
            minutes = duration_sec // 60
            seconds = duration_sec % 60

            row = [
                track_idx + 1,
                track.get("title", ""),
                track.get("artist", ""),
                loop_idx + 1,
                loop.get("name", f"Loop {loop_idx + 1}"),
                start_ms,
                end_ms,
                duration_ms,
                f"{loop.get('length_beats', 0):.2f}",
                f"{minutes}:{seconds:02d}",
                loop.get("color", "#00FF00"),
                loop.get("locked", False),
            ]
            writer.writerow(row)

    return output.getvalue()


def export_tracks_to_csv(
    tracks: List[Dict],
    output_dir: Optional[str] = None,
    include_cues: bool = True,
    include_loops: bool = True
) -> Dict:
    """
    Export tracks to comprehensive CSV format.

    Args:
        tracks: List of track data
        output_dir: Optional directory to save CSV files
        include_cues: Generate detailed cues CSV
        include_loops: Generate detailed loops CSV

    Returns:
        Dict with CSV content and file paths
    """
    result = {
        "format": "csv_detailed",
        "version": "1.0",
        "track_count": len(tracks),
        "files": {}
    }

    # Main tracks CSV (always generated)
    tracks_csv = generate_tracks_csv(tracks)
    result["files"]["tracks"] = {
        "filename": "tracks.csv",
        "content": tracks_csv,
    }

    # Cues CSV
    if include_cues:
        cues_csv = generate_cues_csv(tracks)
        result["files"]["cues"] = {
            "filename": "cues.csv",
            "content": cues_csv,
        }

    # Loops CSV
    if include_loops:
        loops_csv = generate_loops_csv(tracks)
        result["files"]["loops"] = {
            "filename": "loops.csv",
            "content": loops_csv,
        }

    # Save to files if directory specified
    if output_dir:
        import os
        os.makedirs(output_dir, exist_ok=True)

        for file_type, file_data in result["files"].items():
            file_path = os.path.join(output_dir, file_data["filename"])
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(file_data["content"])
            file_data["path"] = file_path

    return result
