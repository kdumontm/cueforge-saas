"""
TrackCue — Mixxx Library Export Service

Exports tracks and cue data to Mixxx (open-source DJ software) SQLite database format.
Mixxx uses SQLite for library management and supports cue points, loops, and metadata.

Compatibility: Mixxx 2.3+
"""

import sqlite3
from typing import List, Dict, Optional
from datetime import datetime
from pathlib import Path
import json


def generate_mixxx_database(
    tracks: List[Dict],
    db_path: str,
) -> Dict:
    """
    Generate a Mixxx-compatible SQLite library database.

    Args:
        tracks: List of track data from TrackCue
        db_path: Path to output .db file

    Returns:
        {
            "format": "mixxx_sqlite",
            "db_path": str,
            "track_count": int,
            "cue_count": int,
            "success": bool
        }
    """
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # Create Mixxx library schema
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS library (
                id INTEGER PRIMARY KEY,
                artist TEXT,
                title TEXT,
                album TEXT,
                year INTEGER,
                genre TEXT,
                location TEXT UNIQUE,
                comment TEXT,
                duration INTEGER,
                bitrate INTEGER,
                samplerate INTEGER,
                bpm REAL,
                key TEXT,
                added_date TIMESTAMP,
                last_played TIMESTAMP,
                play_count INTEGER DEFAULT 0
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS cues (
                id INTEGER PRIMARY KEY,
                track_location TEXT,
                type TEXT,
                position REAL,
                label TEXT,
                color TEXT,
                FOREIGN KEY(track_location) REFERENCES library(location)
            )
        """)

        # Insert tracks
        total_cues = 0
        for track in tracks:
            file_path = track.get("file_path", "")
            try:
                cursor.execute("""
                    INSERT INTO library
                    (artist, title, album, genre, location, comment, duration, bpm, key, added_date)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    track.get("artist", "Unknown"),
                    track.get("title", "Unknown"),
                    track.get("album", ""),
                    track.get("genre", ""),
                    file_path,
                    track.get("comment", ""),
                    int((track.get("duration_ms", 0) or 0) / 1000),
                    track.get("bpm", 0),
                    track.get("key", ""),
                    datetime.now().isoformat()
                ))

                # Insert cue points
                cue_points = track.get("cue_points", []) or []
                for cue in cue_points:
                    cursor.execute("""
                        INSERT INTO cues
                        (track_location, type, position, label, color)
                        VALUES (?, ?, ?, ?, ?)
                    """, (
                        file_path,
                        cue.get("type", "cue"),
                        (cue.get("position_ms", 0) or 0) / 1000,
                        cue.get("label", ""),
                        cue.get("color", "#FF0000")
                    ))
                    total_cues += 1

            except sqlite3.IntegrityError:
                # Track already exists
                pass

        conn.commit()
        conn.close()

        return {
            "format": "mixxx_sqlite",
            "db_path": db_path,
            "track_count": len(tracks),
            "cue_count": total_cues,
            "success": True,
        }

    except Exception as e:
        return {
            "format": "mixxx_sqlite",
            "db_path": db_path,
            "error": str(e),
            "success": False,
        }


def export_tracks_to_mixxx(
    tracks: List[Dict],
    db_path: str,
) -> Dict:
    """
    Export tracks to Mixxx library format.

    Args:
        tracks: List of track data
        db_path: Path to output Mixxx database

    Returns:
        Export result with statistics
    """
    return generate_mixxx_database(tracks, db_path)
