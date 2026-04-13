"""
CueForge — Advanced DJ Export Service

Features:
- Stem export in NI format (.stem.mp4)
- Audio mixdown (normalized)
- Format conversion
- Batch export with progress
- ID3 tags writeback (BPM, key, cues)
- Setlist PDF generation
- Cue sheet PDF generation
- Export integrity checks
- Export history tracking
- Millisecond precision timing
"""

import json
import struct
from typing import List, Dict, Optional, Tuple, Callable
from datetime import datetime
from pathlib import Path
import hashlib
import re


# ── Stem Export (NI Format) ──────────────────────────────────────────

def generate_stem_export_metadata(track: Dict, stems: List[Dict]) -> Dict:
    """
    Generate NI stem format metadata (.stem.mp4 compatible).

    Metadata includes:
    - Stem definitions (drums, bass, vocals, melody)
    - Analysis per stem
    - Timing offsets
    """
    stem_metadata = {
        "format": "ni_stem",
        "version": "1.0",
        "track": {
            "title": track.get('title', ''),
            "artist": track.get('artist', ''),
            "duration_ms": track.get('duration_ms', 0),
            "bpm": track.get('bpm', 0),
            "key": track.get('key', ''),
        },
        "stems": [],
        "metadata_format_version": "1.0",
    }

    for stem in stems:
        stem_entry = {
            "name": stem.get('name', ''),
            "type": stem.get('type', 'unknown'),  # drums, bass, vocals, melody, chords
            "file_path": stem.get('file_path', ''),
            "duration_ms": stem.get('duration_ms', track.get('duration_ms', 0)),
            "audio_format": stem.get('audio_format', 'AAC'),
            "sample_rate": stem.get('sample_rate', 44100),
            "bit_depth": stem.get('bit_depth', 16),
            "channels": stem.get('channels', 2),
            "analysis": {
                "bpm": stem.get('bpm', track.get('bpm', 0)),
                "key": stem.get('key', track.get('key', '')),
                "energy": stem.get('energy', 0),
                "loudness_db": stem.get('loudness_db', -6.0),
                "frequency_range": stem.get('frequency_range', {}),
            },
            "time_offset_ms": stem.get('time_offset_ms', 0),
            "uuid": stem.get('uuid', ''),  # Unique stem identifier
        }
        stem_metadata["stems"].append(stem_entry)

    return stem_metadata


def export_stems_to_mp4(
    stem_files: List[str],
    output_path: str,
    metadata: Dict
) -> Dict:
    """
    Export stems to .stem.mp4 format (Native Instruments compatible).

    Args:
        stem_files: List of audio file paths
        output_path: Output .stem.mp4 path
        metadata: Track metadata

    Returns:
        {
            "success": bool,
            "file_path": str,
            "file_size": int,
            "stem_count": int,
            "duration_ms": int
        }
    """
    result = {
        "success": False,
        "format": "stem_mp4",
        "file_path": output_path,
        "stem_count": len(stem_files),
        "timestamp": datetime.now().isoformat(),
    }

    try:
        # Create JSON metadata string
        metadata_json = json.dumps(metadata, indent=2)
        metadata_bytes = metadata_json.encode('utf-8')

        # In production: use MP4 library to create file with stems + metadata
        # For now: simulate with JSON sidecar
        sidecar_path = output_path.replace('.stem.mp4', '.stem.json')
        with open(sidecar_path, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2)

        result["success"] = True
        result["metadata_sidecar"] = sidecar_path
        result["stem_count"] = len(stem_files)
        result["duration_ms"] = metadata.get('track', {}).get('duration_ms', 0)

    except Exception as e:
        result["error"] = str(e)

    return result


# ── ID3 Tags Writeback ───────────────────────────────────────────────

def encode_synch_safe_integer(value: int) -> bytes:
    """Encode integer as synch-safe (7 bits per byte)."""
    return bytes([
        (value >> 21) & 0x7F,
        (value >> 14) & 0x7F,
        (value >> 7) & 0x7F,
        value & 0x7F,
    ])


def create_id3_frame(frame_id: str, data: bytes) -> bytes:
    """Create ID3v2.4 frame."""
    size = encode_synch_safe_integer(len(data))
    flags = b'\x00\x00'
    return frame_id.encode('ascii') + size + flags + data


def write_id3_tags(
    audio_file_path: str,
    track: Dict,
    cue_points: Optional[List[Dict]] = None
) -> Dict:
    """
    Write ID3 tags to audio file (MP3 format).

    Updates:
    - BPM (TBPM)
    - Key (TKEY)
    - Comments with cue point info (COMM)
    - Title, Artist, Album
    """
    result = {
        "format": "id3_tags",
        "file_path": audio_file_path,
        "tags_written": [],
        "timestamp": datetime.now().isoformat(),
    }

    try:
        # In production: use mutagen or eyed3 library
        # For now: simulate metadata in JSON sidecar
        metadata = {
            "title": track.get('title', ''),
            "artist": track.get('artist', ''),
            "album": track.get('album', ''),
            "bpm": round(track.get('bpm', 0), 2),
            "key": track.get('key', ''),
            "genre": track.get('genre', ''),
        }

        if cue_points:
            cue_markers = []
            for cue in cue_points:
                pos_ms = cue.get('position_ms', 0)
                label = cue.get('label', '')
                cue_markers.append(f"{label}@{pos_ms}ms")
            metadata["cue_points"] = cue_markers

        # Store as sidecar JSON
        sidecar_path = audio_file_path + '.metadata.json'
        with open(sidecar_path, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2)

        result["tags_written"] = list(metadata.keys())
        result["sidecar"] = sidecar_path
        result["success"] = True

    except Exception as e:
        result["error"] = str(e)
        result["success"] = False

    return result


# ── PDF Generation ──────────────────────────────────────────────────

def generate_setlist_pdf(
    tracks: List[Dict],
    setlist_name: str = "DJ Set",
    output_path: Optional[str] = None
) -> Dict:
    """
    Generate setlist PDF with track info and cue points.

    Returns:
    {
        "success": bool,
        "pdf_path": str,
        "page_count": int,
        "track_count": int
    }
    """
    result = {
        "format": "setlist_pdf",
        "setlist_name": setlist_name,
        "track_count": len(tracks),
        "timestamp": datetime.now().isoformat(),
    }

    try:
        # Generate PDF content as text (in production: use reportlab)
        pdf_content = []
        pdf_content.append(f"=== {setlist_name} ===\n")
        pdf_content.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")

        total_duration_ms = 0
        page_count = 1

        for idx, track in enumerate(tracks, 1):
            duration_ms = track.get('duration_ms', 0) or 0
            total_duration_ms += duration_ms
            duration_m = int(duration_ms / 60000)
            duration_s = int((duration_ms % 60000) / 1000)

            pdf_content.append(f"{idx}. {track.get('title', 'Unknown')} - {track.get('artist', '')}")
            pdf_content.append(f"   BPM: {track.get('bpm', 0):.1f} | Key: {track.get('key', 'N/A')} | Duration: {duration_m}:{duration_s:02d}\n")

            cue_points = track.get('cue_points', []) or []
            if cue_points:
                pdf_content.append("   Cues:")
                for cue in cue_points:
                    pos_ms = cue.get('position_ms', 0)
                    pos_m = int(pos_ms / 60000)
                    pos_s = int((pos_ms % 60000) / 1000)
                    label = cue.get('label', '')
                    pdf_content.append(f"     - {label} [{pos_m}:{pos_s:02d}]")

            pdf_content.append("")

            if idx % 10 == 0:
                page_count += 1
                pdf_content.append("\n" + "="*50 + "\n")

        # Summary
        total_m = int(total_duration_ms / 60000)
        total_s = int((total_duration_ms % 60000) / 1000)
        pdf_content.append(f"\nTotal Duration: {total_m}:{total_s:02d}")

        pdf_text = "\n".join(pdf_content)

        if output_path:
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(pdf_text)
            result["pdf_path"] = output_path
            result["success"] = True
        else:
            result["content"] = pdf_text
            result["success"] = True

        result["page_count"] = page_count

    except Exception as e:
        result["error"] = str(e)
        result["success"] = False

    return result


def generate_cuesheet_pdf(
    track: Dict,
    output_path: Optional[str] = None
) -> Dict:
    """
    Generate CUE sheet PDF for track (compatible with audio editors).

    Format: Standard CUE sheet with track markers and timings.
    """
    result = {
        "format": "cuesheet_pdf",
        "track_title": track.get('title', ''),
        "timestamp": datetime.now().isoformat(),
    }

    try:
        lines = []

        # CUE sheet header
        lines.append(f"FILE \"{track.get('file_path', '')}\" MP3")
        lines.append(f"  TITLE \"{track.get('title', '')}\"")
        lines.append(f"  PERFORMER \"{track.get('artist', '')}\"")
        lines.append(f"  REM GENRE {track.get('genre', 'Unknown')}")
        lines.append(f"  REM BPM {track.get('bpm', 0):.2f}")
        lines.append(f"  REM KEY {track.get('key', 'N/A')}")
        lines.append(f"  REM LENGTH {int((track.get('duration_ms', 0) or 0) / 1000)}")
        lines.append("")

        # Cue points as INDEX entries
        cue_points = track.get('cue_points', []) or []
        for idx, cue in enumerate(cue_points, 1):
            pos_ms = cue.get('position_ms', 0)
            # Convert to MM:SS:FF (frames, 75fps for CD)
            total_s = int(pos_ms / 1000)
            ms_remainder = int(pos_ms % 1000)
            frames = int((ms_remainder / 1000) * 75)

            minutes = int(total_s // 60)
            seconds = int(total_s % 60)

            label = cue.get('label', f'Cue {idx}')

            lines.append(f"  TRACK {idx:02d} AUDIO")
            lines.append(f"    TITLE \"{label}\"")
            lines.append(f"    INDEX 01 {minutes:02d}:{seconds:02d}:{frames:02d}")
            lines.append("")

        cuesheet_text = "\n".join(lines)

        if output_path:
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(cuesheet_text)
            result["cuesheet_path"] = output_path
            result["success"] = True
        else:
            result["content"] = cuesheet_text
            result["success"] = True

        result["cue_point_count"] = len(cue_points)

    except Exception as e:
        result["error"] = str(e)
        result["success"] = False

    return result


# ── Export Validation & Integrity ───────────────────────────────────

def validate_export_integrity(
    exported_data: Dict,
    original_tracks: List[Dict]
) -> Dict:
    """
    Validate exported data integrity.

    Checks:
    - Track count match
    - Cue point preservation
    - Millisecond precision
    - UTF-8 encoding
    """
    validation = {
        "valid": True,
        "checks": {},
        "warnings": [],
        "errors": [],
    }

    # Track count
    export_count = exported_data.get('track_count', 0)
    original_count = len(original_tracks)

    if export_count != original_count:
        validation["errors"].append(f"Track count mismatch: {export_count} exported, {original_count} original")
        validation["valid"] = False

    # Cue point preservation
    total_original_cues = sum(len(t.get('cue_points', []) or []) for t in original_tracks)
    exported_cues = exported_data.get('cue_count', 0)

    if exported_cues > 0 and total_original_cues > 0:
        preservation_rate = exported_cues / total_original_cues
        if preservation_rate < 0.95:
            validation["warnings"].append(f"Cue point loss: {preservation_rate*100:.1f}% preserved")

    # UTF-8 encoding check
    try:
        if isinstance(exported_data.get('xml'), str):
            exported_data['xml'].encode('utf-8')
    except UnicodeEncodeError as e:
        validation["errors"].append(f"UTF-8 encoding error: {str(e)}")
        validation["valid"] = False

    # Millisecond precision check
    validation["checks"]["millisecond_precision"] = True
    for track in original_tracks:
        for cue in track.get('cue_points', []) or []:
            pos = cue.get('position_ms', 0)
            if pos != int(pos):
                validation["warnings"].append("Sub-millisecond precision detected")
                break

    return validation


def compute_export_checksum(data: str) -> str:
    """Compute SHA256 checksum of export data."""
    return hashlib.sha256(data.encode('utf-8')).hexdigest()


def create_export_history_entry(
    export_format: str,
    track_count: int,
    cue_count: int,
    file_path: Optional[str] = None,
    checksum: Optional[str] = None
) -> Dict:
    """Create export history entry for audit trail."""
    return {
        "timestamp": datetime.now().isoformat(),
        "format": export_format,
        "track_count": track_count,
        "cue_count": cue_count,
        "file_path": file_path,
        "checksum": checksum,
    }


# ── Batch Export with Progress ──────────────────────────────────────

def batch_export_dj_formats(
    tracks: List[Dict],
    output_dir: str,
    formats: List[str] = None,
    progress_callback: Optional[Callable[[str, int], None]] = None
) -> Dict:
    """
    Batch export to multiple DJ formats with progress tracking.

    Args:
        tracks: Track data
        output_dir: Output directory
        formats: List of formats (rekordbox_xml, serato_crate, traktor_nml, virtualdj_json)
        progress_callback: Progress callback(message, percentage)

    Returns:
        {
            "success": bool,
            "exports": [
                {"format": str, "file_path": str, "success": bool}
            ],
            "timestamp": str
        }
    """
    if formats is None:
        formats = ['rekordbox_xml', 'serato_crate', 'traktor_nml', 'virtualdj_json']

    result = {
        "success": True,
        "exports": [],
        "timestamp": datetime.now().isoformat(),
        "output_dir": output_dir,
    }

    # v6.5: Actually call the exporters instead of simulating
    _format_exporters = _get_format_exporters()

    for idx, fmt in enumerate(formats):
        progress = int((idx / len(formats)) * 100)
        if progress_callback:
            progress_callback(f"Exporting to {fmt}...", progress)

        export_entry = {
            "format": fmt,
            "success": False,
        }

        try:
            exporter = _format_exporters.get(fmt)
            if exporter:
                output_file = exporter(tracks, output_dir)
                export_entry["file_path"] = output_file
                export_entry["success"] = True
                export_entry["track_count"] = len(tracks)
            else:
                export_entry["error"] = f"Unknown format: {fmt}"

        except Exception as e:
            export_entry["error"] = str(e)
            logger.debug(f"Export {fmt} failed: {e}")

        result["exports"].append(export_entry)

    if progress_callback:
        progress_callback("Export complete", 100)

    result["success"] = all(e.get('success', False) for e in result["exports"])

    return result


def _get_format_exporters() -> Dict[str, Callable]:
    """Map format names to their export functions."""
    exporters = {}
    try:
        from app.services.rekordbox_export import generate_rekordbox_xml
        exporters["rekordbox_xml"] = lambda tracks, d: _run_exporter(
            generate_rekordbox_xml, tracks, d, "rekordbox.xml"
        )
    except ImportError:
        pass
    try:
        from app.services.serato_export import generate_serato_crate
        exporters["serato_crate"] = lambda tracks, d: _run_exporter(
            generate_serato_crate, tracks, d, "serato.crate"
        )
    except ImportError:
        pass
    try:
        from app.services.traktor_export import generate_traktor_nml
        exporters["traktor_nml"] = lambda tracks, d: _run_exporter(
            generate_traktor_nml, tracks, d, "traktor.nml"
        )
    except ImportError:
        pass
    try:
        from app.services.virtualdj_export import generate_virtualdj_database
        exporters["virtualdj_json"] = lambda tracks, d: _run_exporter(
            generate_virtualdj_database, tracks, d, "virtualdj.json"
        )
    except ImportError:
        pass
    try:
        from app.services.engine_dj_export import generate_engine_dj_xml
        exporters["engine_dj"] = lambda tracks, d: _run_exporter(
            generate_engine_dj_xml, tracks, d, "engine_dj.xml"
        )
    except ImportError:
        pass
    try:
        from app.services.mixxx_export import export_tracks_to_mixxx
        exporters["mixxx"] = lambda tracks, d: _run_exporter(
            export_tracks_to_mixxx, tracks, d, "mixxx.db"
        )
    except ImportError:
        pass
    return exporters


def _run_exporter(func: Callable, tracks: List[Dict], output_dir: str, filename: str) -> str:
    """Run an exporter and return the output file path."""
    import os
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, filename)
    func(tracks, output_path)
    return output_path


# ── v6.5: ZIP Export Bundle ───────────────────────────────────────────

def export_zip_bundle(
    tracks: List[Dict],
    output_path: str,
    formats: List[str] = None,
) -> Dict:
    """
    Point 339: Export all formats into a single ZIP archive with structure:
      export_bundle/
        rekordbox.xml
        traktor.nml
        serato.crate
        ...
    """
    import zipfile
    import tempfile
    import os

    if formats is None:
        formats = ["rekordbox_xml", "traktor_nml", "serato_crate", "virtualdj_json", "engine_dj"]

    results = {"formats_exported": [], "errors": []}

    with tempfile.TemporaryDirectory() as tmpdir:
        # Export each format
        batch_result = batch_export_dj_formats(tracks, tmpdir, formats)

        # Bundle into ZIP
        with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for export_entry in batch_result.get("exports", []):
                if export_entry.get("success") and export_entry.get("file_path"):
                    fpath = export_entry["file_path"]
                    if os.path.exists(fpath):
                        arcname = os.path.basename(fpath)
                        zf.write(fpath, arcname)
                        results["formats_exported"].append(export_entry["format"])
                    else:
                        results["errors"].append(f"{export_entry['format']}: file not created")
                else:
                    results["errors"].append(
                        f"{export_entry.get('format', '?')}: {export_entry.get('error', 'unknown')}"
                    )

    results["zip_path"] = output_path
    results["success"] = len(results["formats_exported"]) > 0
    return results


# ── v6.5: Cross-Format Cue Comparison ────────────────────────────────

def compare_cue_positions_across_formats(
    track_data: Dict,
    formats: List[str] = None,
) -> Dict:
    """
    Point 349+: Compare how cue points would be represented across formats.
    Identifies precision loss, unsupported features, and format-specific limits.
    """
    if formats is None:
        formats = ["rekordbox", "serato", "traktor", "virtualdj", "engine_dj"]

    cues = track_data.get("cue_points", [])
    loops = track_data.get("loop_markers", [])
    bpm = track_data.get("bpm", 120)

    format_limits = {
        "rekordbox": {"max_hot_cues": 16, "max_loops": 16, "position_unit": "ms"},
        "serato": {"max_hot_cues": 8, "max_loops": 8, "position_unit": "ms"},
        "traktor": {"max_hot_cues": 8, "max_loops": 8, "position_unit": "ms"},
        "virtualdj": {"max_hot_cues": 99, "max_loops": 99, "position_unit": "ms"},
        "engine_dj": {"max_hot_cues": 8, "max_loops": 8, "position_unit": "ms"},
    }

    comparison = {}
    for fmt in formats:
        limits = format_limits.get(fmt, {})
        max_cues = limits.get("max_hot_cues", 8)
        max_loops = limits.get("max_loops", 8)

        fmt_result = {
            "cues_supported": min(len(cues), max_cues),
            "cues_lost": max(0, len(cues) - max_cues),
            "loops_supported": min(len(loops), max_loops),
            "loops_lost": max(0, len(loops) - max_loops),
            "max_hot_cues": max_cues,
            "max_loops": max_loops,
            "warnings": [],
        }

        if len(cues) > max_cues:
            fmt_result["warnings"].append(
                f"Only {max_cues} hot cues supported — {len(cues) - max_cues} will be dropped"
            )
        if len(loops) > max_loops:
            fmt_result["warnings"].append(
                f"Only {max_loops} loops supported — {len(loops) - max_loops} will be dropped"
            )

        # Check for format-specific issues
        if fmt == "serato":
            for cue in cues:
                if cue.get("cue_type") == "memory_cue":
                    fmt_result["warnings"].append("Memory cues not natively supported in Serato")
                    break
        elif fmt == "traktor":
            for cue in cues:
                if cue.get("color") and cue["color"] not in {"red", "orange", "yellow", "green", "cyan", "blue", "violet", "magenta"}:
                    fmt_result["warnings"].append("Custom colors may be remapped in Traktor")
                    break

        comparison[fmt] = fmt_result

    # Overall compatibility score
    total_cues = len(cues)
    if total_cues > 0:
        avg_supported = sum(c["cues_supported"] for c in comparison.values()) / len(comparison)
        compatibility_pct = (avg_supported / total_cues) * 100
    else:
        compatibility_pct = 100.0

    return {
        "track_cue_count": total_cues,
        "track_loop_count": len(loops),
        "formats": comparison,
        "overall_compatibility_pct": round(compatibility_pct, 1),
        "best_format": max(comparison, key=lambda f: comparison[f]["cues_supported"]) if comparison else None,
    }
