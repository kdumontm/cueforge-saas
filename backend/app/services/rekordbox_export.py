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
from typing import List, Dict, Optional
from datetime import datetime
import os
import math


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

def generate_rekordbox_xml(tracks: List[Dict], playlist_name: str = "CueForge Export") -> str:
    """
    Generate a Rekordbox-compatible XML string from CueForge track data.
    """
    root = ET.Element("DJ_PLAYLISTS", Version="1.0.0")
    product = ET.SubElement(root, "PRODUCT", Name="CueForge", Version="3.0", Company="CueForge")
    collection = ET.SubElement(root, "COLLECTION", Entries=str(len(tracks)))

    for idx, track in enumerate(tracks):
        analysis = track.get("analysis", {}) or {}
        bpm = analysis.get("bpm") or track.get("bpm") or 0
        key = analysis.get("key") or track.get("key") or ""
        genre = analysis.get("genre") or track.get("genre") or ""
        subgenre = analysis.get("subgenre") or ""
        duration_ms = track.get("duration_ms") or analysis.get("duration_ms") or 0
        duration_sec = duration_ms / 1000.0 if duration_ms else 0
        energy = analysis.get("energy") or 0

        track_attrs = {
            "TrackID": str(idx + 1),
            "Name": track.get("title", "Unknown"),
            "Artist": track.get("artist", "Unknown"),
            "Album": track.get("album", ""),
            "Genre": f"{genre} / {subgenre}" if subgenre and subgenre != genre else genre,
            "Kind": "MP3 File",
            "TotalTime": str(int(duration_sec)),
            "AverageBpm": f"{bpm:.2f}" if bpm else "0.00",
            "Tonality": key,
            "Rating": str(min(255, int(energy * 255))) if energy else "0",
            "Comments": f"Energy: {energy:.0%}" if energy else "",
            "DateAdded": datetime.now().strftime("%Y-%m-%d"),
        }

        file_path = track.get("file_path") or track.get("original_filename") or ""
        if file_path:
            track_attrs["Location"] = f"file://localhost/{file_path}"

        track_el = ET.SubElement(collection, "TRACK", **track_attrs)

        if bpm:
            ET.SubElement(track_el, "TEMPO", Inizio="0.000", Bpm=f"{bpm:.2f}", Metro="4/4", Battito="1")

        # Cue points as POSITION_MARK
        cue_points = track.get("cue_points", []) or []
        hot_cue_num = 0

        for cue_idx, cue in enumerate(cue_points):
            pos_ms = cue.get("position_ms") or cue.get("time") or 0
            end_ms = cue.get("end_position_ms") or 0
            label = cue.get("label") or cue.get("name") or f"Cue {cue_idx + 1}"
            cue_type = cue.get("type") or cue.get("cue_type") or "cue"
            # Only treat as loop if explicitly tagged as loop type — not just because end_ms exists
            is_loop = cue_type == "loop" and bool(end_ms and end_ms > pos_ms)

            mark_attrs = {
                "Name": label,
                "Type": "4" if is_loop else "0",
                "Start": format_time_mmss(pos_ms),
                "Num": str(hot_cue_num) if not is_loop else "-1",
            }
            if is_loop:
                mark_attrs["End"] = format_time_mmss(end_ms)

            # Use the actual color stored in DB (hex string); fall back to palette by index
            raw_color = cue.get("color") or ""
            if raw_color and raw_color.startswith("#") and len(raw_color) >= 7:
                color_hex = raw_color[:7]
            else:
                color_idx = cue_idx % 8
                color_hex = REKORDBOX_COLORS.get(color_idx, "#E13535")
            r = int(color_hex[1:3], 16)
            g = int(color_hex[3:5], 16)
            b = int(color_hex[5:7], 16)
            mark_attrs["Red"] = str(r)
            mark_attrs["Green"] = str(g)
            mark_attrs["Blue"] = str(b)

            ET.SubElement(track_el, "POSITION_MARK", **mark_attrs)
            if not is_loop:
                hot_cue_num += 1

        # v4: Loop markers as POSITION_MARK Type="4"
        loop_markers = track.get("loop_markers", []) or []
        for loop_idx, loop in enumerate(loop_markers):
            start_ms = loop.get("start_ms", 0)
            end_ms = loop.get("end_ms", 0)
            if end_ms <= start_ms:
                continue
            loop_name = loop.get("name", f"Loop {loop_idx + 1}")
            loop_attrs = {
                "Name": loop_name,
                "Type": "4",        # Loop type in Rekordbox
                "Start": format_time_mmss(start_ms),
                "End": format_time_mmss(end_ms),
                "Num": "-1",
            }
            # Color
            color = loop.get("color", "green")
            loop_colors = {
                "green": "#1DB954", "red": "#E13535", "yellow": "#E2D420",
                "cyan": "#21C8DE", "blue": "#2B7FFF", "purple": "#A855F7",
                "orange": "#FF8C00", "pink": "#FF69B4",
            }
            hex_color = loop_colors.get(color, "#1DB954")
            loop_attrs["Red"] = str(int(hex_color[1:3], 16))
            loop_attrs["Green"] = str(int(hex_color[3:5], 16))
            loop_attrs["Blue"] = str(int(hex_color[5:7], 16))

            ET.SubElement(track_el, "POSITION_MARK", **loop_attrs)

        # v4: Artwork URL
        artwork = track.get("artwork_url", "")
        if artwork:
            track_el.set("ArtworkPath", artwork)

    # Playlists section
    playlists = ET.SubElement(root, "PLAYLISTS")
    root_node = ET.SubElement(playlists, "NODE", Type="0", Name="ROOT", Count="1")
    playlist_node = ET.SubElement(root_node, "NODE",
        Type="1", Name=playlist_name, KeyType="0", Entries=str(len(tracks)))
    for idx in range(len(tracks)):
        ET.SubElement(playlist_node, "TRACK", Key=str(idx + 1))

    # Pretty print
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


def export_tracks_to_rekordbox(tracks: List[Dict], output_path: str = None) -> Dict:
    """
    Export tracks to Rekordbox XML format.

    Args:
        tracks: List of track data from CueForge DB
        output_path: Optional file path to write XML to

    Returns:
        {"xml": str, "track_count": int, "cue_count": int}
    """
    xml_content = generate_rekordbox_xml(tracks)

    total_cues = sum(len(t.get("cue_points", []) or []) for t in tracks)

    result = {
        "xml": xml_content,
        "track_count": len(tracks),
        "cue_count": total_cues,
        "format": "rekordbox_xml",
        "version": "1.0.0",
    }

    if output_path:
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(xml_content)
        result["file_path"] = output_path

    return result
