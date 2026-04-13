"""
CueForge — Traktor NML export service.

Generates Traktor DJ Pro compatible .nml (XML) collection files.
NML format is based on the Native Instruments collection XML schema.
"""

from typing import List, Optional, Dict, Tuple
from xml.etree.ElementTree import Element, SubElement, tostring
from xml.dom.minidom import parseString
import base64
import struct


# ── Traktor key mapping ─────────────────────────────────────────────────
# Traktor uses Open Key notation internally (mapped to integer KEY_VALUE)

MUSICAL_KEY_TO_TRAKTOR = {
    # Traktor Open Key: majors 0-11, minors 12-23
    "C major": 0,  "C": 0,   "Cm": 12,   "C minor": 12,
    "Db major": 1, "Db": 1,  "C#m": 13,  "C# minor": 13, "Dbm": 13, "Db minor": 13,
    "D major": 2,  "D": 2,   "Dm": 14,   "D minor": 14,
    "Eb major": 3, "Eb": 3,  "D#m": 15,  "D# minor": 15, "Ebm": 15, "Eb minor": 15,
    "E major": 4,  "E": 4,   "Em": 16,   "E minor": 16,
    "F major": 5,  "F": 5,   "Fm": 17,   "F minor": 17,
    "F# major": 6, "F#": 6,  "Gb major": 6, "F#m": 18, "F# minor": 18, "Gbm": 18, "Gb minor": 18,
    "G major": 7,  "G": 7,   "Gm": 19,   "G minor": 19,
    "Ab major": 8, "Ab": 8,  "G# major": 8, "G#m": 20, "G# minor": 20, "Abm": 20, "Ab minor": 20,
    "A major": 9,  "A": 9,   "Am": 21,   "A minor": 21,
    "Bb major": 10, "Bb": 10, "A# major": 10, "A#m": 22, "A# minor": 22, "Bbm": 22, "Bb minor": 22,
    "B major": 11, "B": 11,  "Bm": 23,   "B minor": 23,
    # Camelot notation support (Open Key wheel)
    "1A": 21, "1B": 11, "2A": 18, "2B": 6, "3A": 13, "3B": 1,
    "4A": 20, "4B": 8,  "5A": 15, "5B": 3, "6A": 19, "6B": 7,
    "7A": 14, "7B": 2,  "8A": 21, "8B": 0, "9A": 16, "9B": 4,
    "10A": 23, "10B": 5, "11A": 18, "11B": 9, "12A": 13, "12B": 4,
}

# Traktor cue type mapping
TRAKTOR_CUE_TYPES = {
    'hot_cue': 0,    # CUE
    'fade_in': 1,    # FADE_IN
    'fade_out': 2,   # FADE_OUT
    'load': 3,       # LOAD
    'loop': 4,       # LOOP
    'drop': 0,       # mapped to CUE
    'phrase': 0,     # mapped to CUE
    'section': 0,    # mapped to CUE
}


def _ms_to_seconds(ms: float) -> str:
    """Convert milliseconds to seconds string for Traktor."""
    return f"{ms / 1000:.6f}"


def _hex_to_traktor_color(hex_color: str) -> int:
    """Convert hex color to Traktor's integer color format (0xAARRGGBB with alpha)."""
    hex_color = (hex_color or '#22c55e').lstrip('#')
    try:
        r = int(hex_color[0:2], 16)
        g = int(hex_color[2:4], 16)
        b = int(hex_color[4:6], 16)
    except (ValueError, IndexError):
        r, g, b = 0x22, 0xC5, 0x5E  # green fallback
    return (0xFF << 24) | (r << 16) | (g << 8) | b


def _build_beat_grid_stripe(bpm: float, duration_ms: float, first_beat_ms: float = 0) -> str:
    """
    Build Traktor STRIPE (beat grid) data encoded as base64.
    Represents beat positions within a track at given BPM.

    Supports up to 8192 beats for long tracks (40+ minutes at typical tempos).
    """
    if not bpm or bpm <= 0:
        return ""

    beat_length_ms = (60.0 / bpm) * 1000
    stripe_data = bytearray()

    # Start from first beat
    current_ms = first_beat_ms
    beat_count = 0
    max_beats = 8192  # Increased from 2048 for long tracks

    while current_ms < duration_ms and beat_count < max_beats:
        # Encode beat position in Traktor stripe format (4 bytes, big-endian)
        pos_int = int(current_ms)
        stripe_data.extend(struct.pack('>I', pos_int))
        current_ms += beat_length_ms
        beat_count += 1

    return base64.b64encode(stripe_data).decode('ascii')


def _build_waveform_stripe(analysis: Dict) -> str:
    """
    Build Traktor WAVEFORM STRIPE data from frequency spectrum.
    Encodes waveform peaks for visual display.
    """
    frequency_spectrum = analysis.get('frequency_spectrum', [])
    if not frequency_spectrum:
        return ""

    waveform_data = bytearray()

    # Take 512 samples at even intervals
    sample_count = min(512, len(frequency_spectrum))
    step = max(1, len(frequency_spectrum) // sample_count)

    for i in range(0, len(frequency_spectrum), step):
        if len(waveform_data) >= 512:
            break
        peak = int(frequency_spectrum[i] * 255) if frequency_spectrum[i] else 0
        peak = min(255, max(0, peak))
        waveform_data.append(peak)

    # Pad to 512 bytes if needed
    while len(waveform_data) < 512:
        waveform_data.append(0)

    return base64.b64encode(waveform_data).decode('ascii')


def _build_remix_deck_entry(track: dict, remix_idx: int) -> dict:
    """Build Traktor Remix Deck specific entry."""
    return {
        "remix_deck_id": remix_idx,
        "track_title": track.get("title", ""),
        "sample_slots": 8,
        "effects_enabled": track.get("remix_effects_enabled", True),
    }


def _build_flux_mode_markers(cue_points: List[dict]) -> List[dict]:
    """Build Traktor Flux mode markers from cue points."""
    flux_markers = []
    for cue in cue_points:
        if cue.get("type") == "phrase" or cue.get("label", "").lower() in ["intro", "outro", "verse", "chorus", "drop"]:
            flux_markers.append({
                "position_ms": cue.get("position_ms", 0),
                "label": cue.get("label", ""),
                "type": "phrase_marker",
            })
    return flux_markers


def _build_macro_micro_grid(bpm: float, duration_ms: float) -> dict:
    """Build Traktor macro/micro grid data."""
    if not bpm or bpm <= 0:
        return {}

    beat_length_ms = (60.0 / bpm) * 1000
    # Macro: 4-beat grid, Micro: beat grid
    return {
        "bpm": bpm,
        "beat_length_ms": beat_length_ms,
        "macro_beat": beat_length_ms * 4,  # 4-beat grid
        "micro_beat": beat_length_ms,      # 1-beat grid
    }


def _export_traktor_favorites(tracks: List[dict]) -> List[dict]:
    """Export favorited tracks."""
    return [
        {
            "title": t.get("title", ""),
            "artist": t.get("artist", ""),
            "rating": t.get("rating", 0),
            "is_favorite": t.get("is_favorite", False),
        }
        for t in tracks if t.get("is_favorite", False)
    ]


def _build_browser_node_tree(tracks: List[dict]) -> dict:
    """Build Traktor browser node tree structure."""
    # Group tracks by genre/artist hierarchy
    tree = {"root": {"genres": {}, "artists": {}}}

    for track in tracks:
        genre = track.get("genre", "Other")
        artist = track.get("artist", "Unknown")

        if genre not in tree["root"]["genres"]:
            tree["root"]["genres"][genre] = []
        tree["root"]["genres"][genre].append(track.get("title", ""))

        if artist not in tree["root"]["artists"]:
            tree["root"]["artists"][artist] = []
        tree["root"]["artists"][artist].append(track.get("title", ""))

    return tree


def _export_effect_snapshot(track: dict, effect_idx: int = 0) -> dict:
    """Export effect snapshot/preset."""
    effects = track.get("effects", [])
    if effect_idx < len(effects):
        effect = effects[effect_idx]
        return {
            "name": effect.get("name", f"Effect {effect_idx}"),
            "type": effect.get("type", ""),
            "parameters": effect.get("parameters", {}),
            "enabled": effect.get("enabled", True),
        }
    return {}


def _build_prefader_listen_markers(cue_points: List[dict]) -> List[dict]:
    """Build pre-fader listen (PFL) markers."""
    return [
        {
            "position_ms": cue.get("position_ms", 0),
            "label": cue.get("label", "") + " (PFL)",
            "pfl_enabled": True,
        }
        for cue in cue_points if cue.get("type") in ["hot_cue", "cue"]
    ]


def _export_elastique_timestretch_settings(track: dict) -> dict:
    """Export Elastique timestretch settings."""
    analysis = track.get("analysis", {}) or {}
    return {
        "enabled": track.get("timestretch_enabled", False),
        "mode": track.get("timestretch_mode", "neutral"),  # neutral, conservative, smooth
        "quality": track.get("timestretch_quality", "high"),  # fast, standard, high
        "tempo_range": {
            "min": track.get("min_tempo", 0.8),  # 80% of original
            "max": track.get("max_tempo", 1.2),  # 120% of original
        },
    }


def generate_traktor_nml(
    tracks: List[dict],
    collection_name: str = "CueForge Export",
    version: str = "35",
    include_remix: bool = False,
    include_favorites: bool = False,
) -> str:
    """
    Generate a Traktor-compatible .nml XML file compatible with Traktor 3.5+.

    Each track dict should have:
      - title, artist, album, genre, bpm, key, duration_ms, file_path
      - cue_points: list of {position_ms, label/name, color, type, end_position_ms}
      - loop_markers: list of {start_ms, end_ms, name, color, number}
      - analysis: dict with extra data

    Supports:
      - Cue names and colors (hex format converted to ARGB)
      - Beat grid with phase information
      - Extended stripe data (8192 beats)
      - Memory markers and loops

    Returns: XML string
    """
    nml = Element('NML', VERSION="35")  # Updated to Traktor 3.5 version

    # HEAD section
    head = SubElement(nml, 'HEAD', COMPANY="www.native-instruments.com", PROGRAM="Traktor Pro 3")

    # MUSICFOLDERS (empty placeholder)
    SubElement(nml, 'MUSICFOLDERS')

    # COLLECTION
    collection = SubElement(nml, 'COLLECTION', ENTRIES=str(len(tracks)))

    for track in tracks:
        bpm = track.get('bpm', 0) or 0
        key = track.get('key', '')
        duration_s = (track.get('duration_ms', 0) or 0) / 1000
        title = track.get('title', 'Unknown')
        artist = track.get('artist', '')
        file_path = track.get('file_path', '')

        entry = SubElement(collection, 'ENTRY',
            MODIFIED_DATE="",
            MODIFIED_TIME="0",
            AUDIO_ID="",
            TITLE=title,
            ARTIST=artist,
        )

        # ALBUM
        if track.get('album'):
            SubElement(entry, 'ALBUM', TITLE=track['album'])

        # LOCATION
        # Traktor uses volume + dir + file format
        dir_parts = file_path.rsplit('/', 1) if '/' in file_path else file_path.rsplit('\\', 1)
        if len(dir_parts) == 2:
            directory = dir_parts[0] + '/'
            filename = dir_parts[1]
        else:
            directory = '/'
            filename = file_path

        SubElement(entry, 'LOCATION',
            DIR=directory.replace('/', '/:'),
            FILE=filename,
            VOLUME="",
            VOLUMEID="",
        )

        # INFO with detailed comments
        info_attrs = {}
        if track.get('genre'):
            info_attrs['GENRE'] = track['genre']
        if track.get('label'):
            info_attrs['LABEL'] = track['label']

        # Build detailed comment from track metadata
        comment_parts = []
        track_comment = track.get('comment') or track.get('comments') or ""
        if track_comment:
            comment_parts.append(track_comment)

        analysis = track.get('analysis', {}) or {}
        energy = analysis.get('energy', 0)
        if energy:
            comment_parts.append(f"Energy: {energy:.0%}")

        danceability = analysis.get('danceability', 0)
        if danceability:
            comment_parts.append(f"Danceability: {danceability:.0%}")

        if comment_parts:
            info_attrs['COMMENT'] = " | ".join(comment_parts)

        info_attrs['PLAYTIME'] = str(int(duration_s))
        info_attrs['PLAYTIME_FLOAT'] = f"{duration_s:.6f}"
        info_attrs['IMPORT_DATE'] = ""
        SubElement(entry, 'INFO', **info_attrs)

        # TEMPO
        tempo_attrs = {
            'BPM': f"{bpm:.6f}" if bpm else "0.000000",
            'BPM_QUALITY': "100.000000",
        }
        SubElement(entry, 'TEMPO', **tempo_attrs)

        # BEAT GRID (BPM + offset/phase)
        beat_grid = track.get('beat_grid', {}) or {}
        if bpm and bpm > 0:
            first_beat_ms = beat_grid.get('first_beat_ms', 0)
            duration_ms = track.get('duration_ms', 0) or 0

            beat_grid_el = SubElement(entry, 'BEAT_GRID')
            beat_grid_el.set('BPM', f"{bpm:.6f}")

            # Add beat positions as BEAT entries
            beat_length_ms = (60.0 / bpm) * 1000
            beat_ms = first_beat_ms
            beat_num = 0

            while beat_ms < duration_ms and beat_num < 256:  # Limit to reasonable count
                beat_el = SubElement(beat_grid_el, 'BEAT')
                beat_el.set('NUM', str(beat_num))
                beat_el.set('MS', f"{beat_ms:.1f}")
                beat_ms += beat_length_ms
                beat_num += 1

        # MUSICAL_KEY with Open Key support
        if key:
            key_value = MUSICAL_KEY_TO_TRAKTOR.get(key, -1)
            if key_value >= 0:
                SubElement(entry, 'MUSICAL_KEY', VALUE=str(key_value))

        # STRIPE (beat grid visualization)
        stripe_data = _build_beat_grid_stripe(bpm, track.get('duration_ms', 0) or 0,
                                              beat_grid.get('first_beat_ms', 0))
        if stripe_data:
            SubElement(entry, 'STRIPE', DATA=stripe_data)

        # WAVEFORM (visual overview)
        waveform_data = _build_waveform_stripe(analysis)
        if waveform_data:
            SubElement(entry, 'WAVEFORM', DATA=waveform_data)

        # CUE_V2 entries (cue points with names and colors)
        cue_points = track.get('cue_points', [])
        for i, cp in enumerate(cue_points):
            pos_ms = cp.get('position_ms', 0) or 0
            cue_type_str = cp.get('type') or cp.get('cue_type', 'hot_cue')
            cue_type = TRAKTOR_CUE_TYPES.get(cue_type_str, 0)
            name = cp.get('label') or cp.get('name', f'Cue {i+1}')
            color = _hex_to_traktor_color(cp.get('color'))

            cue_attrs = {
                'NAME': name,
                'DISPL_ORDER': str(i),
                'TYPE': str(cue_type),
                'START': _ms_to_seconds(pos_ms),
                'LEN': "0.000000",
                'REPEATS': "-1",
                'HOTCUE': str(i),
                'COLOR': str(color),  # ARGB color format
            }

            # Loop: set LEN to duration
            end_ms = cp.get('end_position_ms')
            if cue_type == 4 and end_ms:  # LOOP type
                cue_attrs['LEN'] = _ms_to_seconds(end_ms - pos_ms)

            SubElement(entry, 'CUE_V2', **cue_attrs)

        # Loop markers (separate ENTRY elements if needed)
        loop_markers = track.get('loop_markers', []) or []
        for loop_idx, loop in enumerate(loop_markers):
            start_ms = loop.get('start_ms', 0)
            end_ms = loop.get('end_ms', 0)
            if end_ms <= start_ms:
                continue

            loop_name = loop.get('name', f'Loop {loop_idx + 1}')
            loop_color = _hex_to_traktor_color(loop.get('color', '#00FF00'))
            loop_duration = _ms_to_seconds(end_ms - start_ms)

            loop_attrs = {
                'NAME': loop_name,
                'DISPL_ORDER': str(len(cue_points) + loop_idx),
                'TYPE': '4',  # LOOP type
                'START': _ms_to_seconds(start_ms),
                'LEN': loop_duration,
                'REPEATS': '-1',
                'HOTCUE': str(loop_idx),
                'COLOR': str(loop_color),
            }

            SubElement(entry, 'CUE_V2', **loop_attrs)

        # LOUDNESS (placeholder)
        SubElement(entry, 'LOUDNESS',
            PEAK_DB="0.000000",
            PERCEIVED_DB="0.000000",
            ANALYZED_DB="0.000000",
        )

    # SETS (empty)
    SubElement(nml, 'SETS', ENTRIES="0")

    # PLAYLISTS with one playlist
    playlists = SubElement(nml, 'PLAYLISTS')
    root_node = SubElement(playlists, 'NODE', TYPE="FOLDER", NAME="$ROOT")
    playlist_node = SubElement(root_node, 'SUBNODES', COUNT="1")
    pl_entry = SubElement(playlist_node, 'NODE', TYPE="PLAYLIST", NAME=collection_name)
    pl_sub = SubElement(pl_entry, 'PLAYLIST', ENTRIES=str(len(tracks)), TYPE="LIST", UUID="")

    for i, track in enumerate(tracks):
        file_path = track.get('file_path', '')
        dir_parts = file_path.rsplit('/', 1) if '/' in file_path else file_path.rsplit('\\', 1)
        if len(dir_parts) == 2:
            directory = dir_parts[0] + '/'
            filename = dir_parts[1]
        else:
            directory = '/'
            filename = file_path

        entry_el = SubElement(pl_sub, 'ENTRY')
        SubElement(entry_el, 'PRIMARYKEY', TYPE="TRACK", KEY=f"{directory}{filename}")

    # Pretty-print XML
    raw_xml = tostring(nml, encoding='unicode')
    try:
        pretty = parseString(raw_xml).toprettyxml(indent="  ", encoding="UTF-8")
        return pretty.decode('utf-8')
    except Exception:
        return f'<?xml version="1.0" encoding="UTF-8"?>\n{raw_xml}'
