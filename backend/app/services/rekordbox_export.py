"""
CueForge Rekordbox XML Export Service
Exports tracks, cue points, and analysis data to Rekordbox-compatible XML format.

Rekordbox XML format reference:
- DJ_PLAYLISTS > PRODUCT > COLLECTION > TRACK
- Each TRACK has POSITION_MARK entries for cue points
- Supports hot cues, memory cues, and loops
"""

import xml.etree.ElementTree as ET
from xml.dom import minidom
from typing import List, Dict, Optional, Callable
from datetime import datetime
import os
import math
import html


# Rekordbox color palette (ID to hex)
REKORDBOX_COLORS = {
    0: "#E13535",   # Red
    1: "#FF8C00",   # Orange
    2: "#E2D420",   # Yellow
    3: "#1DB954",   # Green
    4: "#21C8DE",   # Aqua
    5: "#2B7FFF",   # Blue
    6: "#A855F7",   # Purple
    7: "#FF69B4",   # Pink
}

CUE_TYPE_MAP = {
    "hot_cue": 0, "cue": 0, "drop": 0, "build": 0,
    "breakdown": 0, "intro": 0, "outro": 0, "verse": 0,
    "chorus": 0, "loop": 4, "memory": 0,
}


def _escape_xml_attr(text: str) -> str:
    """Escape special characters in XML attributes."""
    if not text:
        return ""
    return html.escape(str(text), quote=True)


def format_time_mmss(ms: float) -> str:
    """Convert milliseconds to seconds format for Rekordbox."""
    if ms is None or ms < 0:
        return "0.000"
    total_seconds = ms / 1000.0
    return f"{total_seconds:.3f}"


def key_to_rekordbox(key: str) -> int:
    """Convert musical key string to Rekordbox key ID."""
    KEY_MAP = {
        "C": 1, "Db": 2, "D": 3, "Eb": 4, "E": 5, "F": 6,
        "F#": 7, "Gb": 7, "G": 8, "Ab": 9, "A": 10, "Bb": 11, "B": 12,
        "Cm": 13, "Dbm": 14, "C#m": 14, "Dm": 15, "Ebm": 16, "D#m": 16,
        "Em": 17, "Fm": 18, "F#m": 19, "Gbm": 19, "Gm": 20, "Abm": 21,
        "G#m": 21, "Am": 22, "Bbm": 23, "A#m": 23, "Bm": 24,
    }
    if not key:
        return 0
    clean = key.strip().replace(" minor", "m").replace(" major", "")
    clean = clean.replace("min", "m").replace("maj", "")
    return KEY_MAP.get(clean, 0)


def open_key_notation_to_rekordbox(open_key: str) -> int:
    """Convert Open Key notation (1A, 1B, ..., 12A, 12B) to Rekordbox key ID."""
    OPEN_KEY_MAP = {
        # Camelot wheel: 1A-12B maps to Rekordbox key IDs
        "1A": 8, "1B": 7,   "2A": 3, "2B": 2,   "3A": 10, "3B": 9,   "4A": 5, "4B": 4,
        "5A": 12, "5B": 11, "6A": 6, "6B": 1,   "7A": 8, "7B": 7,    "8A": 3, "8B": 2,
        "9A": 10, "9B": 9,  "10A": 5, "10B": 4, "11A": 12, "11B": 11, "12A": 6, "12B": 1,
    }
    return OPEN_KEY_MAP.get(open_key, 0)


def calculate_beat_grid_offset(bpm: float, first_beat_ms: float) -> float:
    """Calculate beat grid offset (phase) in milliseconds."""
    if not bpm or bpm <= 0:
        return 0.0
    beat_length_ms = (60.0 / bpm) * 1000
    offset = first_beat_ms % beat_length_ms
    return offset


def loop_duration_in_beats(start_ms: float, end_ms: float, bpm: float) -> float:
    """Calculate loop duration in beats (with 2 decimal precision)."""
    if not bpm or bpm <= 0:
        return 0.0
    beat_length_ms = (60.0 / bpm) * 1000
    duration_ms = max(0, end_ms - start_ms)
    beats = duration_ms / beat_length_ms
    return round(beats, 2)

def generate_rekordbox_xml(
    tracks: List[Dict],
    playlist_name: str = "CueForge Export",
    progress_callback: Optional[Callable[[int, int], None]] = None
) -> str:
    """
    Generate a Rekordbox-compatible XML string from CueForge track data.

    Args:
        tracks: List of track dictionaries
        playlist_name: Name for the exported playlist
        progress_callback: Optional callback(current, total) for batch export progress
    """
    root = ET.Element("DJ_PLAYLISTS", Version="1.0.0")
    product = ET.SubElement(root, "PRODUCT", Name="CueForge", Version="3.0", Company="CueForge")
    collection = ET.SubElement(root, "COLLECTION", Entries=str(len(tracks)))

    for idx, track in enumerate(tracks):
        # Progress callback for batch export
        if progress_callback:
            progress_callback(idx + 1, len(tracks))

        analysis = track.get("analysis", {}) or {}
        bpm = analysis.get("bpm") or track.get("bpm") or 0
        key = analysis.get("key") or track.get("key") or ""
        genre = analysis.get("genre") or track.get("genre") or ""
        subgenre = analysis.get("subgenre") or ""
        duration_ms = track.get("duration_ms") or analysis.get("duration_ms") or 0
        duration_sec = duration_ms / 1000.0 if duration_ms else 0
        energy = analysis.get("energy") or 0
        confidence = track.get("confidence") or analysis.get("confidence") or 0

        # Build comments with metadata (rating, key, confidence)
        comments_parts = []
        if energy:
            comments_parts.append(f"Energy: {energy:.0%}")
        if confidence and confidence > 0:
            comments_parts.append(f"Confidence: {confidence:.0%}")
        track_comment = track.get("comment") or track.get("comments") or ""
        if track_comment:
            comments_parts.append(track_comment)
        final_comments = " | ".join(comments_parts)

        # Support Open Key notation if available
        open_key = track.get("open_key") or ""
        tonality_str = key
        if open_key:
            tonality_str = open_key

        # Escape special characters in strings
        title = _escape_xml_attr(track.get("title", "Unknown"))
        artist = _escape_xml_attr(track.get("artist", "Unknown"))
        album = _escape_xml_attr(track.get("album", ""))
        genre_str = f"{genre} / {subgenre}" if subgenre and subgenre != genre else genre
        genre_str = _escape_xml_attr(genre_str)

        # Use track.created_at if available, otherwise current date
        date_added = track.get("created_at") or track.get("date_added") or datetime.now().strftime("%Y-%m-%d")
        if isinstance(date_added, str):
            date_added = date_added.split("T")[0] if "T" in date_added else date_added
        else:
            date_added = date_added.strftime("%Y-%m-%d") if hasattr(date_added, "strftime") else str(date_added)

        track_attrs = {
            "TrackID": str(idx + 1),
            "Name": title,
            "Artist": artist,
            "Album": album,
            "Genre": genre_str,
            "Kind": "MP3 File",
            "TotalTime": str(int(duration_sec)),
            "AverageBpm": f"{bpm:.2f}" if bpm else "0.00",
            "Tonality": tonality_str,
            "Rating": str(min(255, int(energy * 255))) if energy else "0",
            "Comments": _escape_xml_attr(final_comments),
            "DateAdded": date_added,
        }

        # Add artwork if available
        artwork_url = track.get("artwork_url", "")
        if artwork_url:
            track_attrs["ArtworkPath"] = _escape_xml_attr(artwork_url)

        file_path = track.get("file_path") or track.get("original_filename") or ""
        if file_path:
            track_attrs["Location"] = f"file://localhost/{_escape_xml_attr(file_path)}"

        track_el = ET.SubElement(collection, "TRACK", **track_attrs)

        if bpm:
            ET.SubElement(track_el, "TEMPO", Inizio="0.000", Bpm=f"{bpm:.2f}", Metro="4/4", Battito="1")

        # Beat grid export (BPM + offset/phase information)
        beat_grid = track.get("beat_grid", {}) or {}
        first_beat_ms = beat_grid.get("first_beat_ms", 0)
        if bpm and first_beat_ms >= 0:
            offset = calculate_beat_grid_offset(bpm, first_beat_ms)
            ET.SubElement(track_el, "BEAT_GRID",
                Bpm=f"{bpm:.2f}",
                Offset=f"{offset:.3f}"
            )

        # Cue points as POSITION_MARK
        cue_points = track.get("cue_points", []) or []
        hot_cue_num = 0
        memory_cue_num = 0

        for cue_idx, cue in enumerate(cue_points):
            pos_ms = cue.get("position_ms") or cue.get("time") or 0
            end_ms = cue.get("end_position_ms") or 0
            label = _escape_xml_attr(cue.get("label") or cue.get("name") or f"Cue {cue_idx + 1}")
            cue_type = cue.get("type") or cue.get("cue_type") or "cue"
            confidence = cue.get("confidence") or 0
            # Only treat as loop if explicitly tagged as loop type — not just because end_ms exists
            is_loop = cue_type == "loop" and bool(end_ms and end_ms > pos_ms)
            is_memory = cue.get("is_memory") or (cue_type == "memory")

            mark_attrs = {
                "Name": label,
                "Type": "4" if is_loop else "0",
                "Start": format_time_mmss(pos_ms),
            }

            # Num: hot cue slot (0-7), memory cue, or -1 for loop
            if is_loop:
                mark_attrs["Num"] = "-1"
            elif is_memory:
                mark_attrs["Num"] = str(-100 - memory_cue_num)  # Memory cues use negative IDs
                memory_cue_num += 1
            else:
                mark_attrs["Num"] = str(hot_cue_num) if hot_cue_num < 8 else "-1"
                hot_cue_num += 1

            if is_loop:
                mark_attrs["End"] = format_time_mmss(end_ms)
                # Add loop duration in beats if available
                if bpm:
                    loop_beats = loop_duration_in_beats(pos_ms, end_ms, bpm)
                    if loop_beats > 0:
                        mark_attrs["LenBeats"] = f"{loop_beats:.2f}"

            # Use the actual color stored in DB (hex string); fall back to palette by index
            # Support color_rgb tuple format as well
            raw_color = cue.get("color") or cue.get("color_rgb") or ""
            if isinstance(raw_color, (list, tuple)) and len(raw_color) >= 3:
                r, g, b = raw_color[0], raw_color[1], raw_color[2]
            elif raw_color and isinstance(raw_color, str) and raw_color.startswith("#") and len(raw_color) >= 7:
                color_hex = raw_color[:7]
                r = int(color_hex[1:3], 16)
                g = int(color_hex[3:5], 16)
                b = int(color_hex[5:7], 16)
            else:
                color_idx = cue_idx % 8
                color_hex = REKORDBOX_COLORS.get(color_idx, "#E13535")
                r = int(color_hex[1:3], 16)
                g = int(color_hex[3:5], 16)
                b = int(color_hex[5:7], 16)
            mark_attrs["Red"] = str(r)
            mark_attrs["Green"] = str(g)
            mark_attrs["Blue"] = str(b)

            # Add confidence as comment if available
            if confidence > 0:
                mark_attrs["Comments"] = f"Confidence: {confidence:.0%}"

            ET.SubElement(track_el, "POSITION_MARK", **mark_attrs)

        # v4: Loop markers as separate POSITION_MARK entries (Type="4")
        loop_markers = track.get("loop_markers", []) or []
        for loop_idx, loop in enumerate(loop_markers):
            start_ms = loop.get("start_ms", 0)
            end_ms = loop.get("end_ms", 0)
            if end_ms <= start_ms:
                continue
            loop_name = _escape_xml_attr(loop.get("name", f"Loop {loop_idx + 1}"))
            loop_attrs = {
                "Name": loop_name,
                "Type": "4",        # Loop type in Rekordbox
                "Start": format_time_mmss(start_ms),
                "End": format_time_mmss(end_ms),
                "Num": "-1",
            }
            # Add loop duration in beats if BPM available
            if bpm:
                loop_beats = loop_duration_in_beats(start_ms, end_ms, bpm)
                if loop_beats > 0:
                    loop_attrs["LenBeats"] = f"{loop_beats:.2f}"

            # Color handling: support hex, RGB tuple, and named colors
            raw_color = loop.get("color", "green")
            if isinstance(raw_color, (list, tuple)) and len(raw_color) >= 3:
                r, g, b = raw_color[0], raw_color[1], raw_color[2]
            else:
                loop_colors = {
                    "green": "#1DB954", "red": "#E13535", "yellow": "#E2D420",
                    "cyan": "#21C8DE", "blue": "#2B7FFF", "purple": "#A855F7",
                    "orange": "#FF8C00", "pink": "#FF69B4",
                }
                hex_color = loop_colors.get(str(raw_color), "#1DB954")
                r = int(hex_color[1:3], 16)
                g = int(hex_color[3:5], 16)
                b = int(hex_color[5:7], 16)
            loop_attrs["Red"] = str(r)
            loop_attrs["Green"] = str(g)
            loop_attrs["Blue"] = str(b)

            ET.SubElement(track_el, "POSITION_MARK", **loop_attrs)

    # Playlists section
    playlists = ET.SubElement(root, "PLAYLISTS")
    root_node = ET.SubElement(playlists, "NODE", Type="0", Name="ROOT", Count="1")
    playlist_node = ET.SubElement(root_node, "NODE",
        Type="1", Name=playlist_name, KeyType="0", Entries=str(len(tracks)))
    for idx in range(len(tracks)):
        ET.SubElement(playlist_node, "TRACK", Key=str(idx + 1))

    # Pretty print with XML validation
    rough_string = ET.tostring(root, encoding="unicode", xml_declaration=False)
    xml_decl = '<?xml version="1.0" encoding="UTF-8"?>\n'
    try:
        dom = minidom.parseString(rough_string)
        pretty = dom.toprettyxml(indent="  ", encoding=None)
        lines = pretty.split("\n")
        if lines[0].startswith("<?xml"):
            lines = lines[1:]
        return xml_decl + "\n".join(lines)
    except Exception:
        return xml_decl + rough_string


def export_tracks_to_rekordbox(
    tracks: List[Dict],
    output_path: str = None,
    progress_callback: Optional[Callable[[int, int], None]] = None
) -> Dict:
    """
    Export tracks to Rekordbox XML format.

    Args:
        tracks: List of track data from CueForge DB
        output_path: Optional file path to write XML to
        progress_callback: Optional callback(current, total) for progress tracking

    Returns:
        {
            "xml": str,
            "track_count": int,
            "cue_count": int,
            "loop_count": int,
            "format": "rekordbox_xml",
            "version": "1.0.0",
            "statistics": {...}
        }
    """
    xml_content = generate_rekordbox_xml(tracks, progress_callback=progress_callback)

    total_cues = sum(len(t.get("cue_points", []) or []) for t in tracks)
    total_loops = sum(len(t.get("loop_markers", []) or []) for t in tracks)
    total_errors = 0

    # Calculate statistics
    stats = {
        "tracks_exported": len(tracks),
        "cues_exported": total_cues,
        "loops_exported": total_loops,
        "markers_total": total_cues + total_loops,
        "export_errors": total_errors,
    }

    result = {
        "xml": xml_content,
        "track_count": len(tracks),
        "cue_count": total_cues,
        "loop_count": total_loops,
        "format": "rekordbox_xml",
        "version": "1.0.0",
        "statistics": stats,
    }

    if output_path:
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(xml_content)
        result["file_path"] = output_path

    return result
