"""
CueForge — Serato Crate (.crate) + CSV export service.

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
from typing import List, Optional


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


def _validate_track_format(track: dict) -> bool:
    """Validate that a track dict has required fields for Serato export."""
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
    return True


def generate_serato_crate(tracks: List[dict], crate_name: str = "CueForge Export") -> bytes:
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

    Cue points are encoded in a Comment field in Serato's internal format.
    """
    import csv
    import io as _io

    output = _io.StringIO()
    writer = csv.writer(output)

    # Header row
    writer.writerow([
        'Name', 'Artist', 'Album', 'Genre', 'BPM', 'Key',
        'Comment', 'Duration', 'Filename',
    ])

    for track in tracks:
        # Encode cue points as comment text for reference
        cue_comment = ""
        cue_points = track.get('cue_points', [])
        if cue_points:
            cue_parts = []
            for cp in cue_points:
                pos_s = (cp.get('position_ms', 0) or 0) / 1000
                label = cp.get('label') or cp.get('name', '')
                cue_parts.append(f"{label}@{pos_s:.2f}s")
            cue_comment = " | ".join(cue_parts)

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


def _hex_to_rgb(hex_color: str) -> tuple:
    """Convert hex color to RGB tuple."""
    hex_color = hex_color.lstrip('#')
    if len(hex_color) == 6:
        return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
    return SERATO_CUE_COLORS[0]


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
