"""
TrackCue — Serato Crate (.crate) + CSV export service.

Serato .crate format:
  - Binary format with UTF-16 encoded file paths
  - Header: "vrsn" + version string
  - Columns: "osrt" + "tvcn" blocks for column metadata
  - Tracks: "otrk" + "ptrk" blocks with file paths

Also generates Serato-compatible CSV for importing into Serato DJ Pro
via the "Import Tracks" feature.
"""

import struct
import io
import json
import os
from typing import List, Optional, Dict, Tuple
from pathlib import Path


# ── Serato .crate binary format ─────────────────────────────────────────

def _encode_utf16_field(tag: str, value: str) -> bytes:
    """Encode a Serato field: 4-byte tag + 4-byte length + UTF-16BE data."""
    encoded = value.encode('utf-16-be')
    return tag.encode('ascii') + struct.pack('>I', len(encoded)) + encoded


def _encode_track_entry(file_path: str) -> bytes:
    """Encode a single track entry (otrk block)."""
    ptrk = _encode_utf16_field('ptrk', file_path)
    return b'otrk' + struct.pack('>I', len(ptrk)) + ptrk


def _encode_column(name: str) -> bytes:
    """Encode a column definition (osrt block)."""
    tvcn = _encode_utf16_field('tvcn', name)
    return b'osrt' + struct.pack('>I', len(tvcn)) + tvcn


def _validate_track_format(track: dict, check_file_exists: bool = False) -> bool:
    """Validate that a track dict has required fields for Serato export.

    Args:
        track: Track dictionary to validate
        check_file_exists: If True, verify file path exists (default False for performance)

    Returns:
        True if valid, False otherwise
    """
    if not isinstance(track, dict):
        return False
    # At minimum, need a file_path or title
    if not track.get('file_path') and not track.get('title'):
        return False
    # BPM should be numeric if present
    if track.get('bpm') is not None:
        try:
            float(track.get('bpm'))
        except (ValueError, TypeError):
            return False
    # Optionally validate file path exists
    if check_file_exists and track.get('file_path'):
        file_path = track.get('file_path')
        try:
            if not os.path.exists(file_path):
                return False
        except (OSError, TypeError):
            return False
    return True


def generate_serato_crate(tracks: List[dict], crate_name: str = "TrackCue Export") -> bytes:
    """
    Generate a Serato .crate binary file.

    Each track dict should have:
      - file_path: str (path to audio file)
      - title: str
      - artist: str

    Returns: bytes of the .crate file
    """
    # Validate all tracks before generating
    valid_tracks = []
    for track in tracks:
        if not _validate_track_format(track):
            # Log warning but continue with other tracks
            continue
        valid_tracks.append(track)

    buf = io.BytesIO()

    # Version header
    version_str = "81.0"
    version_encoded = version_str.encode('utf-16-be')
    buf.write(b'vrsn')
    buf.write(struct.pack('>I', len(version_encoded)))
    buf.write(version_encoded)

    # Default columns
    for col_name in ['song', 'artist', 'bpm', 'key', 'genre']:
        buf.write(_encode_column(col_name))

    # Track entries
    for track in valid_tracks:
        path = track.get('file_path') or track.get('title', 'Unknown')
        buf.write(_encode_track_entry(path))

    return buf.getvalue()


# ── Serato CSV export ───────────────────────────────────────────────────

def generate_serato_csv(tracks: List[dict]) -> str:
    """
    Generate a Serato-importable CSV file.

    Serato DJ Pro can import tracks from CSV with columns:
    Name, Artist, Album, Genre, BPM, Key, Comment, Filename

    Cue points are encoded in a Comment field with label@time format.
    Includes cue types and slot numbers for hot cues.
    """
    import csv
    import io as _io

    output = _io.StringIO()
    writer = csv.writer(output)

    # Header row (extended with cue type and color info)
    writer.writerow([
        'Name', 'Artist', 'Album', 'Genre', 'BPM', 'Key',
        'Comment', 'Duration', 'Filename', 'Cue Details',
    ])

    for track in tracks:
        # Encode cue points with type and slot information
        cue_comment = ""
        cue_details = ""
        cue_points = track.get('cue_points', [])
        if cue_points:
            cue_parts = []
            cue_detail_parts = []
            for cue_idx, cp in enumerate(cue_points):
                pos_s = (cp.get('position_ms', 0) or 0) / 1000
                label = cp.get('label') or cp.get('name', '')
                cue_type = cp.get('type') or cp.get('cue_type', 'cue')
                color = cp.get('color', '#FF0000')

                cue_parts.append(f"{label}@{pos_s:.2f}s")
                cue_detail_parts.append(f"#{cue_idx}:type={cue_type},color={color}")

            cue_comment = " | ".join(cue_parts)
            cue_details = " | ".join(cue_detail_parts)

        duration_s = (track.get('duration_ms', 0) or 0) / 1000
        minutes = int(duration_s // 60)
        seconds = int(duration_s % 60)

        writer.writerow([
            track.get('title', ''),
            track.get('artist', ''),
            track.get('album', ''),
            track.get('genre', ''),
            f"{track.get('bpm', 0):.1f}" if track.get('bpm') else '',
            track.get('key', ''),
            cue_comment,
            f"{minutes}:{seconds:02d}",
            track.get('file_path', ''),
            cue_details,
        ])

    return output.getvalue()


# ── Serato Markers V2 (cue points in binary) ───────────────────────────

SERATO_CUE_COLORS = [
    (0xCC, 0x00, 0x00),  # Red
    (0xCC, 0x88, 0x00),  # Orange
    (0xCC, 0xCC, 0x00),  # Yellow
    (0x00, 0xCC, 0x00),  # Green
    (0x00, 0xCC, 0xCC),  # Cyan
    (0x00, 0x00, 0xCC),  # Blue
    (0x88, 0x00, 0xCC),  # Purple
    (0xCC, 0x00, 0x88),  # Pink
]

# Serato palette 16 colors (extended)
SERATO_PALETTE_16 = [
    (0xFF, 0x00, 0x00),  # Red
    (0xFF, 0x80, 0x00),  # Orange
    (0xFF, 0xFF, 0x00),  # Yellow
    (0x00, 0xFF, 0x00),  # Green
    (0x00, 0xFF, 0xFF),  # Cyan
    (0x00, 0x00, 0xFF),  # Blue
    (0xFF, 0x00, 0xFF),  # Magenta
    (0xFF, 0x00, 0x80),  # Pink
    (0x80, 0x00, 0x00),  # Dark Red
    (0x80, 0x80, 0x00),  # Olive
    (0x00, 0x80, 0x00),  # Dark Green
    (0x00, 0x80, 0x80),  # Teal
    (0x00, 0x00, 0x80),  # Navy
    (0x80, 0x00, 0x80),  # Purple
    (0x80, 0x80, 0x80),  # Gray
    (0xFF, 0xFF, 0xFF),  # White
]


def _hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
    """Convert hex color to RGB tuple."""
    hex_color = (hex_color or '#CC0000').lstrip('#')
    if len(hex_color) == 6:
        return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
    return SERATO_CUE_COLORS[0]


def _snap_color_to_palette(rgb: Tuple[int, int, int], palette: List[Tuple[int, int, int]] = None) -> Tuple[int, int, int]:
    """Snap an RGB color to nearest palette color (Euclidean distance)."""
    if palette is None:
        palette = SERATO_PALETTE_16
    r, g, b = rgb
    min_dist = float('inf')
    closest = palette[0]
    for pr, pg, pb in palette:
        dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
        if dist < min_dist:
            min_dist = dist
            closest = (pr, pg, pb)
    return closest


def generate_serato_markers_v2(tracks: List[dict]) -> Dict:
    """
    Generate Serato DJ Markers V2 data with hot cues, loops, beat grid.

    Returns JSON-serializable dict with:
    - hot_cues: list of {track_id, position_ms, label, color_rgb, type}
    - loops: list of {track_id, start_ms, end_ms, label}
    - beat_grid: {track_id, bpm, first_beat_ms}
    - bpm_lock_flag: whether BPM is locked
    """
    markers_data = {
        "version": "2.0",
        "format": "serato_markers_v2",
        "hot_cues": [],
        "loops": [],
        "beat_grids": [],
    }

    for track_id, track in enumerate(tracks):
        bpm = track.get('bpm') or 0
        beat_grid = track.get('beat_grid', {}) or {}

        # Beat grid info
        if bpm > 0:
            markers_data["beat_grids"].append({
                "track_id": track_id,
                "bpm": round(bpm, 2),
                "first_beat_ms": beat_grid.get('first_beat_ms', 0),
                "bpm_locked": beat_grid.get('bpm_locked', False),
            })

        # Hot cues with color snapping to 16-color palette
        cue_points = track.get('cue_points', []) or []
        for cue_idx, cue in enumerate(cue_points):
            pos_ms = cue.get('position_ms') or cue.get('time') or 0
            label = cue.get('label') or cue.get('name', f'Cue {cue_idx + 1}')
            cue_type = cue.get('type') or cue.get('cue_type') or 'cue'

            if cue_type == 'loop':
                # Loop marker from cue point
                end_ms = cue.get('end_position_ms', 0)
                if end_ms > pos_ms:
                    markers_data["loops"].append({
                        "track_id": track_id,
                        "start_ms": round(pos_ms, 1),
                        "end_ms": round(end_ms, 1),
                        "label": label,
                    })
            else:
                # Hot cue with precise color
                color_hex = cue.get('color', '#CC0000')
                rgb = _hex_to_rgb(color_hex)
                snap_rgb = _snap_color_to_palette(rgb, SERATO_PALETTE_16)

                markers_data["hot_cues"].append({
                    "track_id": track_id,
                    "position_ms": round(pos_ms, 1),
                    "label": label,
                    "color_rgb": snap_rgb,
                    "color_hex": color_hex,
                    "type": cue_type,
                    "hotcue_num": min(cue_idx, 7),  # Serato supports 8 hot cues (0-7)
                })

        # Dedicated loop markers (separate from cue points)
        loop_markers = track.get('loop_markers', []) or []
        for loop_idx, loop in enumerate(loop_markers):
            start_ms = loop.get('start_ms', 0)
            end_ms = loop.get('end_ms', 0)
            if end_ms > start_ms:
                label = loop.get('name', f'Loop {loop_idx + 1}')
                markers_data["loops"].append({
                    "track_id": track_id,
                    "start_ms": round(start_ms, 1),
                    "end_ms": round(end_ms, 1),
                    "label": label,
                    "duration_beats": loop.get('length_beats', 0),
                })

    return markers_data


def generate_serato_markers_csv(tracks: List[dict]) -> str:
    """
    Generate a detailed CSV with Serato-style cue point data.
    Includes position, color, label for each cue across all tracks.
    """
    import csv
    import io as _io

    output = _io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        'Track Title', 'Artist', 'BPM', 'Key',
        'Cue #', 'Cue Name', 'Position (ms)', 'Position (mm:ss.ms)',
        'Color', 'Type',
    ])

    for track in tracks:
        cue_points = track.get('cue_points', [])
        if not cue_points:
            writer.writerow([
                track.get('title', ''), track.get('artist', ''),
                track.get('bpm', ''), track.get('key', ''),
                '', '', '', '', '', '',
            ])
            continue

        for i, cp in enumerate(cue_points):
            pos_ms = cp.get('position_ms', 0) or 0
            minutes = int(pos_ms / 60000)
            secs = (pos_ms % 60000) / 1000

            writer.writerow([
                track.get('title', ''),
                track.get('artist', ''),
                f"{track.get('bpm', 0):.1f}" if track.get('bpm') else '',
                track.get('key', ''),
                i + 1,
                cp.get('label') or cp.get('name', f'Cue {i+1}'),
                pos_ms,
                f"{minutes}:{secs:05.2f}",
                cp.get('color', '#CC0000'),
                cp.get('type', 'cue'),
            ])

    return output.getvalue()


def generate_serato_waveform_data(track: Dict) -> Dict:
    """
    Generate Serato-compatible overview waveform data.

    Returns dict with waveform peaks suitable for Serato's display.
    """
    analysis = track.get('analysis', {}) or {}
    frequency_spectrum = analysis.get('frequency_spectrum', [])

    if not frequency_spectrum:
        return {"format": "serato_waveform", "peaks": []}

    # Take bass frequencies (0-1000Hz) for overview
    # Serato uses 512 or 1024 sample points
    peak_count = min(512, len(frequency_spectrum))
    peaks = [frequency_spectrum[i] if i < len(frequency_spectrum) else 0 for i in range(peak_count)]

    # Normalize to 0-255 range
    max_peak = max(peaks) if peaks else 1.0
    normalized = [min(255, int((p / max_peak) * 255)) if max_peak > 0 else 0 for p in peaks]

    return {
        "format": "serato_waveform",
        "peaks": normalized,
        "sample_count": len(normalized),
    }


# ── Serato DJ Pro v3 Format Extensions ──────────────────────────────────

SERATO_DJ_PRO_V3_COLORS = {
    # Serato DJ Pro v3 extended 32-color palette
    "red": (255, 0, 0),
    "dark_red": (160, 0, 0),
    "orange": (255, 128, 0),
    "yellow": (255, 255, 0),
    "lime": (128, 255, 0),
    "green": (0, 255, 0),
    "mint": (0, 255, 128),
    "cyan": (0, 255, 255),
    "light_blue": (0, 128, 255),
    "blue": (0, 0, 255),
    "dark_blue": (0, 0, 160),
    "purple": (128, 0, 255),
    "magenta": (255, 0, 255),
    "pink": (255, 0, 128),
    "white": (255, 255, 255),
    "light_gray": (192, 192, 192),
    "gray": (128, 128, 128),
    "dark_gray": (64, 64, 64),
    "black": (0, 0, 0),
}


def generate_serato_dj_pro_v3(tracks: List[dict]) -> Dict:
    """Generate Serato DJ Pro v3 format with extended features."""
    return {
        "version": "3.0",
        "format": "serato_dj_pro_v3",
        "tracks": [_format_serato_v3_track(t) for t in tracks],
        "timestamp": __import__('datetime').datetime.now().isoformat(),
    }


def _format_serato_v3_track(track: dict) -> Dict:
    """Format single track for Serato DJ Pro v3."""
    return {
        "title": track.get("title", ""),
        "artist": track.get("artist", ""),
        "bpm": track.get("bpm", 0),
        "key": track.get("key", ""),
        "file_path": track.get("file_path", ""),
        "cue_points": track.get("cue_points", []),
        "loops": track.get("loop_markers", []),
        "energy": track.get("analysis", {}).get("energy", 0),
    }


def generate_serato_flip_export(tracks: List[dict]) -> Dict:
    """Export Serato Flip (saved performances/effects chains)."""
    flip_data = {
        "version": "1.0",
        "format": "serato_flip",
        "performances": []
    }

    for track_idx, track in enumerate(tracks):
        perf = {
            "track_id": track_idx,
            "title": track.get("title", ""),
            "effects": track.get("effects", []),
            "saved_states": track.get("saved_performance_states", []),
        }
        flip_data["performances"].append(perf)

    return flip_data


def generate_serato_saved_loops(tracks: List[dict]) -> Dict:
    """Export Serato Saved Loops data."""
    loops_data = {
        "version": "1.0",
        "format": "serato_saved_loops",
        "loops_by_track": {}
    }

    for track in tracks:
        track_title = track.get("title", "unknown")
        loop_markers = track.get("loop_markers", [])

        loops_data["loops_by_track"][track_title] = [
            {
                "start_ms": lm.get("start_ms", 0),
                "end_ms": lm.get("end_ms", 0),
                "name": lm.get("name", ""),
                "locked": lm.get("locked", False),
                "beats": lm.get("length_beats", 0),
            }
            for lm in loop_markers
        ]

    return loops_data


def generate_serato_crate_hierarchy(crates: List[Dict]) -> Dict:
    """Export Serato crate hierarchy (sub-crates)."""
    def build_crate_tree(crate):
        return {
            "name": crate.get("name", ""),
            "track_ids": crate.get("track_ids", []),
            "children": [build_crate_tree(c) for c in crate.get("children", [])],
        }

    return {
        "version": "1.0",
        "format": "serato_crate_hierarchy",
        "crates": [build_crate_tree(c) for c in crates],
    }


def _calculate_bpm_lock_flag(track: dict) -> bool:
    """Determine if BPM should be locked based on confidence."""
    bpm_confidence = track.get("analysis", {}).get("bpm_confidence", 0)
    return bpm_confidence > 0.85


def _generate_beatgrid_anchor(bpm: float, first_beat_ms: float) -> Dict:
    """Generate Serato beatgrid anchor point."""
    return {
        "bpm": bpm,
        "position_ms": first_beat_ms,
        "beat_number": 1,
        "locked": True,
    }


def _snap_to_serato_palette_32(rgb: Tuple[int, int, int]) -> Tuple[int, int, int]:
    """Snap RGB color to nearest in Serato's 32-color palette."""
    palette = list(SERATO_DJ_PRO_V3_COLORS.values())
    r, g, b = rgb
    min_dist = float('inf')
    closest = palette[0]

    for pr, pg, pb in palette:
        dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
        if dist < min_dist:
            min_dist = dist
            closest = (pr, pg, pb)

    return closest


def _serato_key_notation(key: str) -> str:
    """Convert key to Serato notation format."""
    # Serato uses musical notation with m suffix for minor
    key_clean = key.strip().replace("major", "").replace("minor", "m").strip()
    return key_clean


def _detect_file_path_os(file_path: str) -> str:
    """Detect OS from file path (Windows/Mac/Linux)."""
    if "\\" in file_path:
        return "windows"
    elif ":" in file_path and "/" not in file_path.split(":")[0]:
        return "macos"
    else:
        return "unix"


def _export_serato_database_structure() -> Dict:
    """Export Serato _Serato_ folder structure (database format)."""
    return {
        "format": "serato_database",
        "folders": {
            "_Serato_": {
                "Autosave": "backup files",
                "Backups": "library backups",
                "History": "performance history",
                "Logs": "debug logs",
            }
        }
    }


def _calculate_auto_gain(track: dict) -> float:
    """Calculate auto-gain value from energy level."""
    energy = track.get("analysis", {}).get("energy", 0.5)
    # Map energy (0-1) to gain adjustment (-6 to +6 dB)
    return -6.0 + (energy * 12.0)


def generate_serato_stem_colors(tracks: List[dict]) -> Dict:
    """Export Serato Stem track colors and assignments."""
    stem_data = {
        "version": "1.0",
        "format": "serato_stem_colors",
        "tracks": []
    }

    for track in tracks:
        stems = track.get("stems", [])
        track_stem = {
            "title": track.get("title", ""),
            "stem_assignments": [
                {
                    "stem_name": stem.get("name", ""),
                    "color": stem.get("color", "#FF0000"),
                    "muted": stem.get("muted", False),
                    "solo": stem.get("solo", False),
                }
                for stem in stems
            ]
        }
        stem_data["tracks"].append(track_stem)

    return stem_data
