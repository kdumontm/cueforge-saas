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


def _build_engine_library_database(tracks: List[Dict]) -> Dict:
    """Build Engine DJ library database structure (SQLite-compatible)."""
    # Engine DJ uses SQLite database with specific schema
    return {
        "version": "3.0",
        "format": "engine_dj_sqlite",
        "tables": {
            "Tracks": [
                {
                    "id": idx,
                    "title": t.get("title", ""),
                    "artist": t.get("artist", ""),
                    "album": t.get("album", ""),
                    "file_path": t.get("file_path", ""),
                    "duration_ms": t.get("duration_ms", 0),
                }
                for idx, t in enumerate(tracks)
            ],
            "Cues": [],
        }
    }


def _export_sc6000_features(track: Dict) -> Dict:
    """Export SC6000/LC6000 specific features."""
    return {
        "hot_cue_slots": 8,
        "pad_controls": 16,
        "jog_wheel_modes": ["vinyl", "cdj", "relative"],
        "browser_search": track.get("searchable_text", ""),
    }


def _generate_smart_crate(tracks: List[Dict], criteria: Dict) -> Dict:
    """Generate Engine DJ smart crate based on criteria."""
    # Filter tracks by energy, key, BPM range, etc.
    filtered = []

    for track in tracks:
        analysis = track.get("analysis", {}) or {}

        # Check energy range
        energy = analysis.get("energy", 0.5)
        if "energy_range" in criteria:
            min_e, max_e = criteria["energy_range"]
            if not (min_e <= energy <= max_e):
                continue

        # Check BPM range
        bpm = analysis.get("bpm", 0)
        if "bpm_range" in criteria:
            min_bpm, max_bpm = criteria["bpm_range"]
            if not (min_bpm <= bpm <= max_bpm):
                continue

        # Check key compatibility
        if "key" in criteria and track.get("key") != criteria["key"]:
            continue

        filtered.append(track)

    return {
        "name": criteria.get("name", "Smart Crate"),
        "criteria": criteria,
        "track_count": len(filtered),
        "tracks": filtered,
    }


def _export_engine_performance_data(track: Dict) -> Dict:
    """Export Engine DJ performance data."""
    analysis = track.get("analysis", {}) or {}
    return {
        "energy": analysis.get("energy", 0),
        "danceability": analysis.get("danceability", 0),
        "key": track.get("key", ""),
        "bpm": analysis.get("bpm", 0),
        "perceived_loudness": analysis.get("loudness", 0),
    }


def _export_engine_lighting_midi_map(track: Dict) -> Dict:
    """Export Engine Lighting MIDI map for SC display."""
    return {
        "format": "engine_lighting_midi",
        "pad_assignments": [
            {
                "pad_num": idx,
                "trigger": f"hot_cue_{idx + 1}",
                "led_color": ENGINE_DJ_COLORS.get("blue", (0, 0, 255)),
            }
            for idx in range(8)
        ],
    }


def _export_soundswitch_integration(track: Dict) -> Dict:
    """Export SoundSwitch integration markers."""
    # SoundSwitch is a DJTT utility for beat-synced lighting
    return {
        "format": "soundswitch",
        "lighting_cues": [
            {
                "position_ms": cue.get("position_ms", 0),
                "trigger": cue.get("label", ""),
                "intensity": 100,
            }
            for cue in track.get("cue_points", [])
        ],
    }


def _export_engine_key_display_format(key: str) -> str:
    """Export key in Engine DJ display format."""
    # Engine DJ supports both camelot and musical notation
    CAMELOT_MAP = {
        "C": "8B", "Db": "3B", "D": "10B", "Eb": "5B", "E": "12B", "F": "7B",
        "F#": "2B", "G": "9B", "Ab": "4B", "A": "11B", "Bb": "6B", "B": "1B",
        "Cm": "5A", "Dbm": "12A", "Dm": "7A", "Ebm": "2A", "Em": "9A",
    }
    clean_key = key.strip().replace("minor", "m").replace("major", "").strip()
    return CAMELOT_MAP.get(clean_key, key)


def _export_3band_eq_colors(track: Dict) -> Dict:
    """Export 3-band EQ color assignments for Engine DJ."""
    return {
        "low_freq": {
            "color": ENGINE_DJ_COLORS.get("blue", (0, 0, 255)),
            "hz": 100,
        },
        "mid_freq": {
            "color": ENGINE_DJ_COLORS.get("green", (0, 255, 0)),
            "hz": 1000,
        },
        "high_freq": {
            "color": ENGINE_DJ_COLORS.get("red", (255, 0, 0)),
            "hz": 10000,
        },
    }


def _export_drive_format_compatibility(tracks: List[Dict]) -> Dict:
    """Check drive format compatibility."""
    return {
        "format": "drive_format_compatibility",
        "supported_formats": ["FAT32", "exFAT", "HFS+"],
        "recommended": "exFAT",
        "total_tracks": len(tracks),
        "estimated_size_mb": sum(t.get("file_size_mb", 5) for t in tracks),
    }


def _export_engine_flex_fx_markers(cue_points: List[Dict]) -> Dict:
    """Export Flex FX markers for effect triggering."""
    return {
        "format": "engine_flex_fx",
        "fx_triggers": [
            {
                "position_ms": cue.get("position_ms", 0),
                "label": cue.get("label", ""),
                "fx_type": "reverb",  # Could be extended
            }
            for cue in cue_points if cue.get("type") in ["drop", "build"]
        ],
    }


def _export_streaming_service_markers(track: Dict) -> Dict:
    """Export markers for streaming service integration."""
    return {
        "format": "streaming_service_markers",
        "spotify_uri": track.get("spotify_uri", ""),
        "apple_music_id": track.get("apple_music_id", ""),
        "streaming_ready": bool(track.get("file_path", "")),
    }


def _export_local_network_sync_format(tracks: List[Dict]) -> Dict:
    """Export data in local network sync format for Engine hardware."""
    return {
        "format": "engine_local_sync",
        "version": "3.0",
        "sync_timestamp": __import__('datetime').datetime.now().isoformat(),
        "tracks_count": len(tracks),
        "checksum": __import__('hashlib').md5(str(tracks).encode()).hexdigest(),
    }


def export_tracks_to_engine_dj(
    tracks: List[Dict],
    output_path: Optional[str] = None,
    progress_callback: Optional[Callable[[int, int], None]] = None,
    include_sqlite: bool = False,
    sc_model: str = "SC6000",
    include_flex_fx: bool = True,
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
