"""
TrackCue — VirtualDJ Export Service

VirtualDJ database export with:
- POI (Points of Interest): cue points, loops, hot cues
- Automix points (seamless mixing)
- Stem data support
- Compatible with VirtualDJ 2024+
"""

import json
import sqlite3
from typing import List, Dict, Optional, Tuple
from datetime import datetime
from pathlib import Path


# VirtualDJ color palette (ARGB format)
VIRTUALDJ_COLORS = {
    "red": 0xFFFF0000,
    "orange": 0xFFFF8800,
    "yellow": 0xFFFFFF00,
    "green": 0xFF00FF00,
    "cyan": 0xFF00FFFF,
    "blue": 0xFF0000FF,
    "magenta": 0xFFFF00FF,
    "pink": 0xFFFF0080,
    "white": 0xFFFFFFFF,
    "black": 0xFF000000,
}

# VirtualDJ POI type mapping
VIRTUALDJ_POI_TYPES = {
    "cue": 0,
    "hot_cue": 1,
    "loop": 2,
    "drop": 3,
    "build": 4,
    "breakdown": 5,
    "intro": 6,
    "outro": 7,
    "verse": 8,
    "chorus": 9,
}


def _hex_to_argb(hex_color: str) -> int:
    """Convert hex color to ARGB integer for VirtualDJ."""
    hex_color = (hex_color or '#FF0000').lstrip('#')
    if len(hex_color) == 6:
        r = int(hex_color[0:2], 16)
        g = int(hex_color[2:4], 16)
        b = int(hex_color[4:6], 16)
        return 0xFF000000 | (r << 16) | (g << 8) | b
    return 0xFFFF0000


def _ms_to_virtualdj_time(ms: float) -> float:
    """Convert milliseconds to VirtualDJ time format (seconds with ms precision)."""
    return round(ms / 1000.0, 3)


def generate_virtualdj_poi_database(tracks: List[Dict]) -> Dict:
    """
    Generate VirtualDJ POI (Points of Interest) database format.

    Returns dict with:
    - version: format version
    - tracks: list of {file_path, pois: [{time, type, color, label}]}
    """
    poi_db = {
        "version": "1.0",
        "format": "virtualdj_poi",
        "timestamp": datetime.now().isoformat(),
        "tracks": []
    }

    for track in tracks:
        file_path = track.get('file_path') or track.get('title', '')
        pois = []

        # Cue points as POI
        cue_points = track.get('cue_points', []) or []
        for cue_idx, cue in enumerate(cue_points):
            pos_ms = cue.get('position_ms') or cue.get('time') or 0
            label = cue.get('label') or cue.get('name', f'Cue {cue_idx + 1}')
            cue_type = cue.get('type') or cue.get('cue_type') or 'cue'
            color_hex = cue.get('color', '#FF0000')

            # Only add if not a loop (loops are separate)
            if cue_type != 'loop':
                poi_type = VIRTUALDJ_POI_TYPES.get(cue_type, 0)
                pois.append({
                    "time_ms": pos_ms,
                    "time_sec": _ms_to_virtualdj_time(pos_ms),
                    "type": poi_type,
                    "type_name": cue_type,
                    "label": label,
                    "color": _hex_to_argb(color_hex),
                    "color_hex": color_hex,
                })

        # Loop markers as POI
        loop_markers = track.get('loop_markers', []) or []
        for loop_idx, loop in enumerate(loop_markers):
            start_ms = loop.get('start_ms', 0)
            end_ms = loop.get('end_ms', 0)
            if end_ms <= start_ms:
                continue

            label = loop.get('name', f'Loop {loop_idx + 1}')
            color_hex = loop.get('color', '#00FF00')

            # Loop start marker
            pois.append({
                "time_ms": start_ms,
                "time_sec": _ms_to_virtualdj_time(start_ms),
                "type": VIRTUALDJ_POI_TYPES["loop"],
                "type_name": "loop_start",
                "label": f"{label} (start)",
                "color": _hex_to_argb(color_hex),
                "color_hex": color_hex,
                "duration_ms": end_ms - start_ms,
                "end_ms": end_ms,
                "end_sec": _ms_to_virtualdj_time(end_ms),
            })

            # v6.4: Loop end marker — VirtualDJ uses paired POIs for loops
            pois.append({
                "time_ms": end_ms,
                "time_sec": _ms_to_virtualdj_time(end_ms),
                "type": VIRTUALDJ_POI_TYPES["loop"],
                "type_name": "loop_end",
                "label": f"{label} (end)",
                "color": _hex_to_argb(color_hex),
                "color_hex": color_hex,
                "duration_ms": end_ms - start_ms,
                "start_ms": start_ms,
                "start_sec": _ms_to_virtualdj_time(start_ms),
            })

        # Sort POI by time
        pois.sort(key=lambda x: x['time_ms'])

        track_entry = {
            "file_path": file_path,
            "pois": pois,
            "poi_count": len(pois),
        }

        poi_db["tracks"].append(track_entry)

    return poi_db


def generate_virtualdj_automix_data(tracks: List[Dict]) -> Dict:
    """
    Generate VirtualDJ automix points (seamless mixing sections).

    Automix points mark sections suitable for smooth transitions/mixing.
    """
    automix_data = {
        "version": "1.0",
        "format": "virtualdj_automix",
        "tracks": []
    }

    for track in tracks:
        file_path = track.get('file_path') or track.get('title', '')
        duration_ms = track.get('duration_ms', 0) or 0
        bpm = track.get('bpm', 0) or 0

        automix_sections = []

        # Analyze cue points for automix markers
        cue_points = track.get('cue_points', []) or []
        relevant_cues = [c for c in cue_points if c.get('type') in ['intro', 'outro', 'drop', 'build']]

        if relevant_cues:
            # Create automix sections between key points
            for i in range(len(relevant_cues) - 1):
                start_ms = relevant_cues[i].get('position_ms', 0) or 0
                end_ms = relevant_cues[i + 1].get('position_ms', 0) or 0

                if end_ms > start_ms:
                    duration = end_ms - start_ms

                    # Calculate recommended mixing window (10-20 seconds ideal)
                    mixing_duration_ms = min(20000, max(5000, duration // 4))

                    automix_sections.append({
                        "start_ms": start_ms,
                        "end_ms": end_ms,
                        "mixing_duration_ms": mixing_duration_ms,
                        "mixing_start_ms": max(0, start_ms + mixing_duration_ms),
                        "mixing_end_ms": min(end_ms, end_ms - (mixing_duration_ms // 2)),
                        "priority": "high",
                    })
        else:
            # Default automix: break track into 3 sections (intro, middle, outro)
            third = duration_ms // 3

            automix_sections = [
                {
                    "start_ms": 0,
                    "end_ms": third,
                    "label": "intro",
                    "mixing_duration_ms": 8000,
                    "priority": "medium",
                },
                {
                    "start_ms": third,
                    "end_ms": 2 * third,
                    "label": "middle",
                    "mixing_duration_ms": 10000,
                    "priority": "low",
                },
                {
                    "start_ms": 2 * third,
                    "end_ms": duration_ms,
                    "label": "outro",
                    "mixing_duration_ms": 8000,
                    "priority": "high",
                },
            ]

        track_automix = {
            "file_path": file_path,
            "sections": automix_sections,
            "section_count": len(automix_sections),
        }

        automix_data["tracks"].append(track_automix)

    return automix_data


def generate_virtualdj_stem_metadata(track: Dict) -> Dict:
    """
    Generate VirtualDJ stem data metadata.

    Stem tracks support (NI format .stem.mp4) includes metadata for
    individual stems (drums, bass, vocals, etc.)
    """
    stems = track.get('stems', []) or []

    if not stems:
        return {"format": "virtualdj_stem", "stems": []}

    stem_data = {
        "format": "virtualdj_stem",
        "stem_count": len(stems),
        "stems": []
    }

    for stem in stems:
        stem_entry = {
            "name": stem.get('name', ''),
            "type": stem.get('type', 'unknown'),  # drums, bass, vocals, melody, etc.
            "file_path": stem.get('file_path', ''),
            "duration_ms": stem.get('duration_ms', 0),
            "analysis": {
                "bpm": stem.get('bpm', 0),
                "key": stem.get('key', ''),
                "energy": stem.get('energy', 0),
            }
        }
        stem_data["stems"].append(stem_entry)

    return stem_data


def export_tracks_to_virtualdj(
    tracks: List[Dict],
    output_path: Optional[str] = None,
    include_automix: bool = True,
    include_stems: bool = True
) -> Dict:
    """
    Export tracks to VirtualDJ compatible format.

    Args:
        tracks: List of track data
        output_path: Optional path to save JSON export
        include_automix: Include automix section data
        include_stems: Include stem metadata

    Returns:
        {
            "format": "virtualdj_export",
            "poi_database": {...},
            "automix_data": {...},
            "stem_data": {...}
        }
    """
    result = {
        "format": "virtualdj_export",
        "version": "1.0",
        "timestamp": datetime.now().isoformat(),
        "track_count": len(tracks),
    }

    # POI database (always included)
    result["poi_database"] = generate_virtualdj_poi_database(tracks)

    # Automix sections
    if include_automix:
        result["automix_data"] = generate_virtualdj_automix_data(tracks)

    # Stem metadata
    if include_stems:
        result["stem_data"] = {
            "format": "virtualdj_stem",
            "tracks": []
        }
        for track in tracks:
            stem_meta = generate_virtualdj_stem_metadata(track)
            if stem_meta.get('stems'):
                result["stem_data"]["tracks"].append({
                    "file_path": track.get('file_path', ''),
                    "stem_metadata": stem_meta
                })

    # Save to file if requested
    if output_path:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        result["file_path"] = output_path

    return result


def generate_virtualdj_sqlite_db(
    tracks: List[Dict],
    db_path: str
) -> Dict:
    """
    Generate VirtualDJ SQLite database compatible format.

    Creates database with tracks and POI data compatible with VirtualDJ database.
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Create tables
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tracks (
            id INTEGER PRIMARY KEY,
            filepath TEXT UNIQUE,
            title TEXT,
            artist TEXT,
            album TEXT,
            bpm REAL,
            key TEXT,
            duration_ms INTEGER,
            genre TEXT,
            label TEXT,
            created_at TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS pois (
            id INTEGER PRIMARY KEY,
            track_id INTEGER,
            time_ms REAL,
            type INTEGER,
            label TEXT,
            color INTEGER,
            FOREIGN KEY(track_id) REFERENCES tracks(id)
        )
    """)

    # Insert tracks
    for idx, track in enumerate(tracks):
        file_path = track.get('file_path', '')

        try:
            cursor.execute("""
                INSERT INTO tracks (filepath, title, artist, album, bpm, key, duration_ms, genre, label, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                file_path,
                track.get('title', ''),
                track.get('artist', ''),
                track.get('album', ''),
                track.get('bpm', 0),
                track.get('key', ''),
                track.get('duration_ms', 0),
                track.get('genre', ''),
                track.get('label', ''),
                datetime.now().isoformat()
            ))

            track_id = cursor.lastrowid

            # Insert POI
            cue_points = track.get('cue_points', []) or []
            for cue_idx, cue in enumerate(cue_points):
                if cue.get('type') != 'loop':
                    pos_ms = cue.get('position_ms', 0) or 0
                    poi_type = VIRTUALDJ_POI_TYPES.get(cue.get('type', 'cue'), 0)
                    label = cue.get('label') or cue.get('name', f'Cue {cue_idx + 1}')
                    color = _hex_to_argb(cue.get('color', '#FF0000'))

                    cursor.execute("""
                        INSERT INTO pois (track_id, time_ms, type, label, color)
                        VALUES (?, ?, ?, ?, ?)
                    """, (track_id, pos_ms, poi_type, label, color))

        except sqlite3.IntegrityError:
            # Track already exists, update it
            cursor.execute("""
                UPDATE tracks SET title=?, artist=?, bpm=? WHERE filepath=?
            """, (
                track.get('title', ''),
                track.get('artist', ''),
                track.get('bpm', 0),
                file_path
            ))

    conn.commit()
    conn.close()

    return {
        "format": "virtualdj_sqlite",
        "db_path": db_path,
        "track_count": len(tracks),
        "success": True
    }
