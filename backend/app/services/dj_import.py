"""
CueForge — DJ Import Service

Multi-format DJ import with:
- Rekordbox XML import
- Serato markers import
- Traktor NML import
- VirtualDJ database import
- Engine DJ database import
- Conflict resolution
- Batch import with progress tracking
- Comprehensive validation
"""

import xml.etree.ElementTree as ET
import json
import sqlite3
import csv
from typing import List, Dict, Optional, Tuple, Callable
from enum import Enum
from datetime import datetime
from pathlib import Path


class ConflictResolution(Enum):
    """Strategy for resolving conflicts in metadata."""
    SKIP = "skip"              # Skip conflicting track
    MERGE = "merge"            # Merge metadata (CueForge + imported)
    OVERWRITE = "overwrite"    # Overwrite with imported data
    NEWEST = "newest"          # Keep newest timestamp
    KEEP_LOCAL = "keep_local"  # Keep CueForge data


class ImportFormat(Enum):
    """Supported import formats."""
    REKORDBOX_XML = "rekordbox_xml"
    SERATO_MARKERS = "serato_markers"
    TRAKTOR_NML = "traktor_nml"
    VIRTUALDJ_JSON = "virtualdj_json"
    ENGINE_DJ = "engine_dj"


def validate_rekordbox_xml(xml_path: str) -> Tuple[bool, str]:
    """Validate Rekordbox XML file format."""
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
        if root.tag != "DJ_PLAYLISTS":
            return False, "Not a valid Rekordbox XML (missing DJ_PLAYLISTS root)"
        return True, "Valid Rekordbox XML"
    except Exception as e:
        return False, f"Invalid XML: {str(e)}"


def validate_traktor_nml(xml_path: str) -> Tuple[bool, str]:
    """Validate Traktor NML file format."""
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
        if root.tag != "NML":
            return False, "Not a valid Traktor NML (missing NML root)"
        return True, "Valid Traktor NML"
    except Exception as e:
        return False, f"Invalid XML: {str(e)}"


def validate_json_format(json_path: str) -> Tuple[bool, str]:
    """Validate JSON file (VirtualDJ, etc.)."""
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return True, "Valid JSON"
    except json.JSONDecodeError as e:
        return False, f"Invalid JSON: {str(e)}"


def import_rekordbox_xml(xml_path: str) -> Dict:
    """
    Import Rekordbox XML export.

    Returns:
    {
        "format": "rekordbox_xml",
        "tracks": [
            {
                "title": str,
                "artist": str,
                "album": str,
                "genre": str,
                "bpm": float,
                "key": str,
                "file_path": str,
                "cue_points": [{"position_ms": float, "label": str, "type": str}],
                "loops": [{"start_ms": float, "end_ms": float}],
            }
        ],
        "import_count": int,
        "errors": []
    }
    """
    result = {
        "format": "rekordbox_xml",
        "tracks": [],
        "import_count": 0,
        "errors": [],
        "source": xml_path,
    }

    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()

        collection = root.find("COLLECTION")
        if collection is None:
            result["errors"].append("No COLLECTION element found")
            return result

        for track_el in collection.findall("TRACK"):
            track_data = {
                "title": track_el.get("Name", "Unknown"),
                "artist": track_el.get("Artist", ""),
                "album": track_el.get("Album", ""),
                "genre": track_el.get("Genre", ""),
                "file_path": track_el.get("Location", "").replace("file://localhost/", ""),
                "bpm": 0.0,
                "key": track_el.get("Tonality", ""),
                "cue_points": [],
                "loops": [],
                "metadata": {}
            }

            # BPM
            tempo = track_el.find("TEMPO")
            if tempo is not None:
                try:
                    track_data["bpm"] = float(tempo.get("Bpm", 0))
                except ValueError:
                    pass

            # Rating/energy
            rating = track_el.get("Rating", "0")
            if rating:
                try:
                    energy = int(rating) / 255.0
                    track_data["metadata"]["energy"] = energy
                except ValueError:
                    pass

            # Comments
            comment = track_el.get("Comments", "")
            if comment:
                track_data["metadata"]["comment"] = comment

            # Cue points
            for mark_el in track_el.findall("POSITION_MARK"):
                pos_s = mark_el.get("Start", "0")
                try:
                    pos_ms = float(pos_s) * 1000
                except ValueError:
                    pos_ms = 0

                mark_type = mark_el.get("Type", "0")
                name = mark_el.get("Name", "")

                if mark_type == "4":  # Loop
                    end_s = mark_el.get("End", "0")
                    try:
                        end_ms = float(end_s) * 1000
                    except ValueError:
                        end_ms = pos_ms

                    track_data["loops"].append({
                        "start_ms": pos_ms,
                        "end_ms": end_ms,
                        "label": name,
                    })
                else:  # Cue
                    track_data["cue_points"].append({
                        "position_ms": pos_ms,
                        "label": name,
                        "type": "cue",
                    })

            if track_data["file_path"]:
                result["tracks"].append(track_data)
                result["import_count"] += 1

    except Exception as e:
        result["errors"].append(f"Import failed: {str(e)}")

    return result


def import_traktor_nml(xml_path: str) -> Dict:
    """
    Import Traktor NML export.

    Similar structure to Rekordbox import.
    """
    result = {
        "format": "traktor_nml",
        "tracks": [],
        "import_count": 0,
        "errors": [],
        "source": xml_path,
    }

    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()

        collection = root.find("COLLECTION")
        if collection is None:
            result["errors"].append("No COLLECTION element found")
            return result

        for entry_el in collection.findall("ENTRY"):
            track_data = {
                "title": entry_el.get("TITLE", "Unknown"),
                "artist": entry_el.get("ARTIST", ""),
                "file_path": "",
                "bpm": 0.0,
                "key": "",
                "cue_points": [],
                "loops": [],
                "metadata": {}
            }

            # Location
            location = entry_el.find("LOCATION")
            if location is not None:
                directory = location.get("DIR", "/").replace("/:","")
                filename = location.get("FILE", "")
                track_data["file_path"] = directory + "/" + filename

            # Album
            album = entry_el.find("ALBUM")
            if album is not None:
                track_data["album"] = album.get("TITLE", "")

            # Info
            info = entry_el.find("INFO")
            if info is not None:
                if info.get("GENRE"):
                    track_data["genre"] = info.get("GENRE")
                if info.get("COMMENT"):
                    track_data["metadata"]["comment"] = info.get("COMMENT")
                if info.get("LABEL"):
                    track_data["metadata"]["label"] = info.get("LABEL")

            # BPM
            tempo = entry_el.find("TEMPO")
            if tempo is not None:
                try:
                    track_data["bpm"] = float(tempo.get("BPM", 0))
                except ValueError:
                    pass

            # Musical key
            key_el = entry_el.find("MUSICAL_KEY")
            if key_el is not None:
                key_val = key_el.get("VALUE", "")
                if key_val:
                    # Map Traktor key value back to notation
                    traktor_to_key = {
                        "0": "C", "1": "Db", "2": "D", "3": "Eb", "4": "E", "5": "F",
                        "6": "F#", "7": "G", "8": "Ab", "9": "A", "10": "Bb", "11": "B",
                        "12": "Cm", "13": "C#m", "14": "Dm", "15": "D#m", "16": "Em",
                        "17": "Fm", "18": "F#m", "19": "Gm", "20": "G#m", "21": "Am",
                        "22": "A#m", "23": "Bm",
                    }
                    track_data["key"] = traktor_to_key.get(key_val, "")

            # CUE_V2 (cue points)
            for cue_el in entry_el.findall("CUE_V2"):
                start_s = cue_el.get("START", "0")
                try:
                    pos_ms = float(start_s) * 1000
                except ValueError:
                    pos_ms = 0

                cue_type_str = cue_el.get("TYPE", "0")
                cue_name = cue_el.get("NAME", "Cue")

                # Check if loop
                len_s = cue_el.get("LEN", "0")
                try:
                    len_val = float(len_s)
                    if len_val > 0:
                        # Loop
                        end_ms = pos_ms + (len_val * 1000)
                        track_data["loops"].append({
                            "start_ms": pos_ms,
                            "end_ms": end_ms,
                            "label": cue_name,
                        })
                    else:
                        # Regular cue
                        track_data["cue_points"].append({
                            "position_ms": pos_ms,
                            "label": cue_name,
                            "type": "cue",
                        })
                except ValueError:
                    track_data["cue_points"].append({
                        "position_ms": pos_ms,
                        "label": cue_name,
                        "type": "cue",
                    })

            if track_data["file_path"]:
                result["tracks"].append(track_data)
                result["import_count"] += 1

    except Exception as e:
        result["errors"].append(f"Import failed: {str(e)}")

    return result


def import_serato_markers_csv(csv_path: str) -> Dict:
    """
    Import Serato markers from CSV export.
    """
    result = {
        "format": "serato_markers_csv",
        "tracks": [],
        "import_count": 0,
        "errors": [],
        "source": csv_path,
    }

    tracks_map = {}

    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                title = row.get('Track Title', '')

                if title not in tracks_map:
                    tracks_map[title] = {
                        "title": title,
                        "artist": row.get('Artist', ''),
                        "bpm": 0.0,
                        "key": row.get('Key', ''),
                        "cue_points": [],
                        "loops": [],
                        "metadata": {}
                    }

                # Parse BPM
                try:
                    tracks_map[title]["bpm"] = float(row.get('BPM', 0) or 0)
                except ValueError:
                    pass

                # Parse cue point if present
                if row.get('Position (ms)'):
                    try:
                        pos_ms = float(row.get('Position (ms)', 0))
                        cue_name = row.get('Cue Name', '')
                        tracks_map[title]["cue_points"].append({
                            "position_ms": pos_ms,
                            "label": cue_name,
                            "type": row.get('Type', 'cue'),
                        })
                    except ValueError:
                        pass

        result["tracks"] = list(tracks_map.values())
        result["import_count"] = len(result["tracks"])

    except Exception as e:
        result["errors"].append(f"Import failed: {str(e)}")

    return result


def import_virtualdj_json(json_path: str) -> Dict:
    """
    Import VirtualDJ POI database JSON export.
    """
    result = {
        "format": "virtualdj_json",
        "tracks": [],
        "import_count": 0,
        "errors": [],
        "source": json_path,
    }

    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        tracks = data.get('tracks', [])
        for track_data in tracks:
            file_path = track_data.get('file_path', '')

            track = {
                "title": Path(file_path).stem if file_path else "Unknown",
                "file_path": file_path,
                "bpm": 0.0,
                "cue_points": [],
                "loops": [],
                "metadata": {}
            }

            # Process POIs
            pois = track_data.get('pois', [])
            for poi in pois:
                pos_ms = poi.get('time_ms', 0)
                label = poi.get('label', '')
                poi_type = poi.get('type_name', 'cue')

                if 'loop' in poi_type.lower():
                    # Loop
                    end_ms = poi.get('end_ms', pos_ms + 1000)
                    track["loops"].append({
                        "start_ms": pos_ms,
                        "end_ms": end_ms,
                        "label": label,
                    })
                else:
                    # Cue point
                    track["cue_points"].append({
                        "position_ms": pos_ms,
                        "label": label,
                        "type": poi_type,
                    })

            if file_path:
                result["tracks"].append(track)
                result["import_count"] += 1

    except Exception as e:
        result["errors"].append(f"Import failed: {str(e)}")

    return result


def batch_import_dj_format(
    file_path: str,
    format_hint: Optional[str] = None,
    progress_callback: Optional[Callable[[str, int], None]] = None
) -> Dict:
    """
    Auto-detect and import from DJ format with progress tracking.

    Args:
        file_path: Path to export file
        format_hint: Optional format hint (rekordbox_xml, traktor_nml, etc.)
        progress_callback: Optional callback(message, percentage)

    Returns:
        Import result with metadata and track count
    """
    if progress_callback:
        progress_callback("Validating file...", 10)

    # Determine format
    detected_format = format_hint

    if not detected_format:
        if file_path.endswith('.xml'):
            # Check XML type
            is_valid, msg = validate_rekordbox_xml(file_path)
            if is_valid:
                detected_format = ImportFormat.REKORDBOX_XML.value
            else:
                is_valid, msg = validate_traktor_nml(file_path)
                if is_valid:
                    detected_format = ImportFormat.TRAKTOR_NML.value
        elif file_path.endswith('.json'):
            detected_format = ImportFormat.VIRTUALDJ_JSON.value
        elif file_path.endswith('.csv'):
            detected_format = ImportFormat.SERATO_MARKERS.value

    if not detected_format:
        return {"error": "Could not detect file format"}

    if progress_callback:
        progress_callback(f"Importing from {detected_format}...", 30)

    # Import
    if detected_format == ImportFormat.REKORDBOX_XML.value:
        result = import_rekordbox_xml(file_path)
    elif detected_format == ImportFormat.TRAKTOR_NML.value:
        result = import_traktor_nml(file_path)
    elif detected_format == ImportFormat.SERATO_MARKERS.value:
        result = import_serato_markers_csv(file_path)
    elif detected_format == ImportFormat.VIRTUALDJ_JSON.value:
        result = import_virtualdj_json(file_path)
    else:
        return {"error": f"Format not supported: {detected_format}"}

    if progress_callback:
        progress_callback(f"Imported {result['import_count']} tracks", 90)

    result["timestamp"] = datetime.now().isoformat()
    result["detected_format"] = detected_format

    return result


def merge_track_metadata(
    local_track: Dict,
    imported_track: Dict,
    strategy: ConflictResolution = ConflictResolution.MERGE
) -> Dict:
    """
    Merge local and imported track metadata.

    Handles conflict resolution based on strategy.
    """
    if strategy == ConflictResolution.OVERWRITE:
        return imported_track.copy()

    if strategy == ConflictResolution.KEEP_LOCAL:
        # Only merge cue points and loops, keep all other local data
        merged = local_track.copy()
        merged["cue_points"] = imported_track.get("cue_points", [])
        merged["loops"] = imported_track.get("loops", [])
        return merged

    # Default: MERGE
    merged = local_track.copy()

    # Merge cue points (deduplicate by position)
    local_cues = {cp.get('position_ms'): cp for cp in local_track.get('cue_points', [])}
    for cp in imported_track.get('cue_points', []):
        pos = cp.get('position_ms')
        if pos not in local_cues:
            local_cues[pos] = cp

    merged["cue_points"] = list(local_cues.values())
    merged["loops"] = imported_track.get("loops", [])

    # Merge metadata
    if not merged.get('bpm') and imported_track.get('bpm'):
        merged['bpm'] = imported_track['bpm']

    if not merged.get('key') and imported_track.get('key'):
        merged['key'] = imported_track['key']

    return merged
