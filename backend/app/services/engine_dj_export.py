"""
CueForge — Engine DJ Export Service

Exports tracks and cue data to Engine DJ (Denon/InMusic ecosystem) format.
Engine DJ uses a proprietary database format with XML-based metadata.

Supports:
- Track metadata and file paths
- Cue points (hot cues, memory cues, loops)
- Beat grid with BPM and phase
- Musical key in camelot notation
- Color-coded markers
- Artwork/album art

Compatibility: Engine DJ 1.6+
"""

import xml.etree.ElementTree as ET
from xml.dom import minidom
from typing import List, Dict, Optional, Callable
from datetime import datetime
import html
import json


# Engine DJ color palette (RGB format, mapped from standard DJ software)
ENGINE_DJ_COLORS = {
    "red": (255, 0, 0),
    "orange": (255, 136, 0),
    "yellow": (255, 255, 0),
    "green": (0, 255, 0),
    "cyan": (0, 255, 255),
    "blue": (0, 0, 255),
    "magenta": (255, 0, 255),
    "pink": (255, 0, 128),
    "purple": (168, 85, 247),
    "white": (255, 255, 255),
    "black": (0, 0, 0),
}

# Engine DJ cue type mapping
ENGINE_DJ_CUE_TYPES = {
    "hot_cue": 1,
    "cue": 0,
    "loop": 2,
    "drop": 3,
    "build": 4,
    "breakdown": 5,
    "intro": 6,
    "outro": 7,
    "verse": 8,
    "chorus": 9,
    "memory": 10,
}

# Camelot key notation mapping for Engine DJ
CAMELOT_TO_MUSICKEY = {
    "1A": "C major", "1B": "G minor",
    "2A": "G major", "2B": "D minor",
    "3A": "D major", "3B": "A minor",
    "4A": "A major", "4B": "E minor",
    "5A": "E major", "5B": "B minor",
    "6A": "B major", "6B": "F# minor",
    "7A": "F# major", "7B": "C# minor",
    "8A": "C# major", "8B": "G# minor",
    "9A": "G# major", "9B": "D# minor",
    "10A": "D# major", "10B": "A# minor",
    "11A": "A# major", "11B": "F minor",
    "12A": "F major", "12B": "C minor",
}


def _escape_xml_attr(text: str) -> str:
    """Escape special characters in XML attributes."""
    if not text:
        return ""
    return html.escape(str(text), quote=True)


def _hex_to_rgb(hex_color: str) -> tuple:
    """Convert hex color to RGB tuple for Engine DJ."""
    hex_color = (hex_color or "#FF0000").lstrip("#")
    try:
        if len(hex_color) == 6:
            r = int(hex_color[0:2], 16)
            g = int(hex_color[2:4], 16)
            b = int(hex_color[4:6], 16)
            return (r, g, b)
    except (ValueError, IndexError):
        pass
    return (255, 0, 0)  # Red fallback


def _format_time_ms(ms: float) -> int:
    """Convert milliseconds to Engine DJ time format (integer milliseconds)."""
    return int(ms) if ms else 0


def generate_engine_dj_xml(
    tracks: List[Dict],
    progress_callback: Optional[Callable[[int, int], None]] = None
) -> str:
    """
    Generate Engine DJ compatible XML metadata.

    Args:
        tracks: List of track dictionaries
        progress_callback: Optional callback(current, total) for batch export progress

    Returns:
        XML string containing track collection
    """
    root = ET.Element("Collection")
    root.set("Version", "1.0")

    for idx, track in enumerate(tracks):
        if progress_callback:
            progress_callback(idx + 1, len(tracks))

        analysis = track.get("analysis", {}) or {}
        bpm = analysis.get("bpm") or track.get("bpm") or 0
        key = track.get("key") or analysis.get("key") or ""
        camelot_key = track.get("open_key") or ""
        genre = analysis.get("genre") or track.get("genre") or ""
        duration_ms = track.get("duration_ms") or analysis.get("duration_ms") or 0
        energy = analysis.get("energy") or 0

        # Build track element
        track_el = ET.SubElement(root, "Track")
        track_el.set("ID", str(idx + 1))

        # Basic metadata
        title = _escape_xml_attr(track.get("title", "Unknown"))
        artist = _escape_xml_attr(track.get("artist", "Unknown"))
        album = _escape_xml_attr(track.get("album", ""))

        metadata = ET.SubElement(track_el, "Metadata")
        ET.SubElement(metadata, "Title").text = title
        ET.SubElement(metadata, "Artist").text = artist
        ET.SubElement(metadata, "Album").text = album
        ET.SubElement(metadata, "Genre").text = _escape_xml_attr(genre)
        ET.SubElement(metadata, "Duration").text = str(int(duration_ms // 1000))

        # File information
        file_path = track.get("file_path") or track.get("original_filename") or ""
        if file_path:
            file_info = ET.SubElement(track_el, "FileInfo")
            ET.SubElement(file_info, "Path").text = _escape_xml_attr(file_path)
            ET.SubElement(file_info, "RelativePath").text = _escape_xml_attr(
                file_path.replace("\\", "/").split("/")[-1]
            )

        # Artwork
        artwork_url = track.get("artwork_url", "")
        if artwork_url:
            ET.SubElement(metadata, "ArtworkURL").text = _escape_xml_attr(artwork_url)

        # Analysis data
        analysis_el = ET.SubElement(track_el, "Analysis")
        if bpm:
            ET.SubElement(analysis_el, "BPM").text = f"{bpm:.2f}"
        if key or camelot_key:
            if camelot_key:
                music_key = CAMELOT_TO_MUSICKEY.get(camelot_key, key)
            else:
                music_key = key
            ET.SubElement(analysis_el, "MusicalKey").text = _escape_xml_attr(music_key)
            ET.SubElement(analysis_el, "CamelotKey").text = _escape_xml_attr(camelot_key)

        if energy:
            energy_val = int(energy * 100)
            ET.SubElement(analysis_el, "Energy").text = str(energy_val)

        # Beat grid
        beat_grid = track.get("beat_grid", {}) or {}
        first_beat_ms = beat_grid.get("first_beat_ms", 0)
        if bpm and first_beat_ms >= 0:
            beat_grid_el = ET.SubElement(analysis_el, "BeatGrid")
            beat_grid_el.set("BPM", f"{bpm:.2f}")
            beat_grid_el.set("FirstBeat", str(_format_time_ms(first_beat_ms)))
            # Calculate beat grid grid/phase
            if bpm > 0:
                beat_length_ms = (60.0 / bpm) * 1000
                phase = first_beat_ms % beat_length_ms
                beat_grid_el.set("Phase", f"{phase:.1f}")

        # Cue points and memory cues
        cue_points = track.get("cue_points", []) or []
        hot_cue_num = 0
        memory_cue_num = 0

        for cue_idx, cue in enumerate(cue_points):
            pos_ms = cue.get("position_ms") or cue.get("time") or 0
            end_ms = cue.get("end_position_ms") or 0
            label = _escape_xml_attr(cue.get("label") or cue.get("name") or f"Cue {cue_idx + 1}")
            cue_type = cue.get("type") or cue.get("cue_type") or "cue"
            is_memory = cue.get("is_memory") or (cue_type == "memory")
            is_loop = cue_type == "loop" and bool(end_ms and end_ms > pos_ms)

            cue_el = ET.SubElement(track_el, "Cue")
            cue_el.set("ID", str(cue_idx + 1))
            cue_el.set("Type", str(ENGINE_DJ_CUE_TYPES.get(cue_type, 0)))

            ET.SubElement(cue_el, "Name").text = label
            ET.SubElement(cue_el, "Position").text = str(_format_time_ms(pos_ms))

            if is_loop and end_ms:
                ET.SubElement(cue_el, "End").text = str(_format_time_ms(end_ms))
                ET.SubElement(cue_el, "Duration").text = str(_format_time_ms(end_ms - pos_ms))

            if is_memory:
                cue_el.set("Memory", "true")

            # Color
            raw_color = cue.get("color") or cue.get("color_rgb") or ""
            if isinstance(raw_color, (list, tuple)) and len(raw_color) >= 3:
                r, g, b = raw_color[0], raw_color[1], raw_color[2]
            elif raw_color:
                r, g, b = _hex_to_rgb(str(raw_color))
            else:
                r, g, b = ENGINE_DJ_COLORS.get("red", (255, 0, 0))

            color_el = ET.SubElement(cue_el, "Color")
            color_el.set("R", str(r))
            color_el.set("G", str(g))
            color_el.set("B", str(b))

        # Loop markers (separate from cue points)
        loop_markers = track.get("loop_markers", []) or []
        for loop_idx, loop in enumerate(loop_markers):
            start_ms = loop.get("start_ms", 0)
            end_ms = loop.get("end_ms", 0)
            if end_ms <= start_ms:
                continue

            loop_el = ET.SubElement(track_el, "Loop")
            loop_el.set("ID", str(len(cue_points) + loop_idx + 1))

            loop_name = _escape_xml_attr(loop.get("name", f"Loop {loop_idx + 1}"))
            ET.SubElement(loop_el, "Name").text = loop_name
            ET.SubElement(loop_el, "Start").text = str(_format_time_ms(start_ms))
            ET.SubElement(loop_el, "End").text = str(_format_time_ms(end_ms))
            ET.SubElement(loop_el, "Duration").text = str(_format_time_ms(end_ms - start_ms))

            # Loop color
            raw_color = loop.get("color", "green")
            if isinstance(raw_color, (list, tuple)) and len(raw_color) >= 3:
                r, g, b = raw_color[0], raw_color[1], raw_color[2]
            else:
                r, g, b = ENGINE_DJ_COLORS.get(str(raw_color), (0, 255, 0))

            color_el = ET.SubElement(loop_el, "Color")
            color_el.set("R", str(r))
            color_el.set("G", str(g))
            color_el.set("B", str(b))

    # Pretty print XML
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


def export_tracks_to_engine_dj(
    tracks: List[Dict],
    output_path: Optional[str] = None,
    progress_callback: Optional[Callable[[int, int], None]] = None
) -> Dict:
    """
    Export tracks to Engine DJ format.

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
            "format": "engine_dj_xml",
            "version": "1.0",
            "statistics": {...}
        }
    """
    xml_content = generate_engine_dj_xml(tracks, progress_callback=progress_callback)

    total_cues = sum(len(t.get("cue_points", []) or []) for t in tracks)
    total_loops = sum(len(t.get("loop_markers", []) or []) for t in tracks)

    stats = {
        "tracks_exported": len(tracks),
        "cues_exported": total_cues,
        "loops_exported": total_loops,
        "markers_total": total_cues + total_loops,
    }

    result = {
        "xml": xml_content,
        "track_count": len(tracks),
        "cue_count": total_cues,
        "loop_count": total_loops,
        "format": "engine_dj_xml",
        "version": "1.0",
        "statistics": stats,
    }

    if output_path:
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(xml_content)
        result["file_path"] = output_path

    return result
