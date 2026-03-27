from typing import Dict, List, Optional, Tuple
import gc
import librosa
import numpy as np
from scipy.cluster.hierarchy import linkage, fcluster
from scipy.spatial.distance import pdist
from sqlalchemy.orm import Session

from app.models import Track, TrackAnalysis
from app.database import SessionLocal

# Audio analysis constants
SR = 22050  # Sample rate
HOP_LENGTH = 512
MAX_DURATION = 90  # Max seconds to load (saves memory on Railway)


def detect_bpm_and_beats_from_y(y: np.ndarray, sr: int) -> Dict:
    """
    Detect BPM and beat positions from pre-loaded audio.
    """
    try:
        tempo, beats_frames = librosa.beat.beat_track(y=y, sr=sr)
        beats = librosa.frames_to_time(beats_frames, sr=sr).tolist()
        return {
            "bpm": float(tempo),
            "beats": beats
        }
    except Exception as e:
        raise Exception(f"Error detecting BPM and beats: {str(e)}")


def detect_drops_from_y(y: np.ndarray, sr: int, beats: List[float]) -> List[Dict]:
    """
    Detect drop points using RMS energy spike detection from pre-loaded audio.
    """
    try:
        rms = librosa.feature.rms(y=y)[0]
        rms_normalized = (rms - np.mean(rms)) / (np.std(rms) + 1e-8)

        threshold = 1.5
        peaks = np.where(rms_normalized > threshold)[0]
        peak_times = librosa.frames_to_time(peaks, sr=sr)

        drops = []
        for peak_time in peak_times:
            nearest_beat_idx = min(
                range(len(beats)),
                key=lambda i: abs(beats[i] - peak_time)
            )
            drops.append({
                "time": float(beats[nearest_beat_idx]),
                "beat_index": int(nearest_beat_idx)
            })

        seen = set()
        unique_drops = []
        for drop in drops:
            if drop["beat_index"] not in seen:
                unique_drops.append(drop)
                seen.add(drop["beat_index"])

        return unique_drops
    except Exception as e:
        raise Exception(f"Error detecting drops: {str(e)}")


def detect_sections_from_y(y: np.ndarray, sr: int) -> List[Dict]:
    """
    Detect sections using MFCC + chroma agglomerative segmentation from pre-loaded audio.
    """
    try:
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)

        features = np.vstack([mfcc, chroma])
        features = (features - features.mean(axis=1, keepdims=True)) / (features.std(axis=1, keepdims=True) + 1e-8)

        distances = pdist(features.T, metric='euclidean')
        Z = linkage(distances, method='ward')

        section_labels = fcluster(Z, t=10, criterion='maxclust')

        boundaries = [0]
        for i in range(1, len(section_labels)):
            if section_labels[i] != section_labels[i-1]:
                boundaries.append(i)
        boundaries.append(len(section_labels))

        boundary_times = librosa.frames_to_time(np.array(boundaries), sr=sr)

        dj_labels = ["INTRO", "BUILD", "DROP", "BREAKDOWN", "BUILD", "DROP", "OUTRO"]

        sections = []
        for i in range(len(boundary_times) - 1):
            start_time = float(boundary_times[i])
            end_time = float(boundary_times[i + 1])
            duration = end_time - start_time
            label = dj_labels[i % len(dj_labels)]
            sections.append({
                "time": start_time,
                "label": label,
                "duration": duration
            })

        # Free intermediate arrays
        del mfcc, chroma, features, distances, Z
        gc.collect()

        return sections
    except Exception as e:
        raise Exception(f"Error detecting sections: {str(e)}")


def detect_phrases(beats: List[float]) -> List[Dict]:
    """
    Detect 8-bar phrases from beats.
    """
    phrases = []
    bars_per_phrase = 32  # 8 bars * 4 beats per bar
    for i in range(0, len(beats) - bars_per_phrase, bars_per_phrase):
        start_beat = i
        end_beat = i + bars_per_phrase
        if end_beat <= len(beats):
            start_time = beats[start_beat]
            end_time = beats[end_beat - 1]
            duration = end_time - start_time
            phrases.append({
                "start_beat": start_beat,
                "end_beat": end_beat,
                "start_time": float(start_time),
                "duration": float(duration)
            })
    return phrases


# Keep old API for backward compat (used by analyze_track_background)
def detect_bpm_and_beats(file_path: str) -> Dict:
    y, sr = librosa.load(file_path, sr=SR, duration=MAX_DURATION)
    result = detect_bpm_and_beats_from_y(y, sr)
    del y
    gc.collect()
    return result


def detect_drops(file_path: str, beats: List[float]) -> List[Dict]:
    y, sr = librosa.load(file_path, sr=SR, duration=MAX_DURATION)
    result = detect_drops_from_y(y, sr, beats)
    del y
    gc.collect()
    return result


def detect_sections(file_path: str) -> List[Dict]:
    y, sr = librosa.load(file_path, sr=SR, duration=MAX_DURATION)
    result = detect_sections_from_y(y, sr)
    del y
    gc.collect()
    return result


def analyze_track_background(track_id: int, db: Session) -> None:
    """
    Full pipeline analysis: detect BPM, beats, drops, sections, phrases.
    Updates Track status and creates TrackAnalysis record.
    """
    try:
        track = db.query(Track).filter(Track.id == track_id).first()
        if not track:
            return

        track.status = "analyzing"
        db.commit()

        bpm_data = detect_bpm_and_beats(track.file_path)
        drops = detect_drops(track.file_path, bpm_data["beats"])
        sections = detect_sections(track.file_path)
        phrases = detect_phrases(bpm_data["beats"])

        analysis = TrackAnalysis(
            track_id=track_id,
            bpm=bpm_data["bpm"],
            beats=bpm_data["beats"],
            drops=drops,
            sections=sections,
            phrases=phrases
        )
        db.add(analysis)

        track.status = "completed"
        db.commit()

    except Exception as e:
        track = db.query(Track).filter(Track.id == track_id).first()
        if track:
            track.status = "error"
            db.commit()
        raise Exception(f"Background analysis failed: {str(e)}")


def analyze_audio(file_path: str) -> Dict:
    """
    Full audio analysis pipeline. Loads audio ONCE to save memory.
    Returns dict compatible with TrackAnalysis model fields.
    """
    # Load audio once with duration limit
    y, sr_loaded = librosa.load(file_path, sr=SR, duration=MAX_DURATION)
    duration_ms = int(len(y) / sr_loaded * 1000)

    # BPM and beats (reuse loaded audio)
    bpm_data = detect_bpm_and_beats_from_y(y, sr_loaded)
    bpm = bpm_data["bpm"]
    beats = bpm_data["beats"]
    beat_positions = [int(b * 1000) for b in beats]

    # Key detection
    try:
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr_loaded)
        key_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
        key_idx = int(np.argmax(np.mean(chroma, axis=1)))
        key = key_names[key_idx]
        del chroma
    except Exception:
        key = None

    # Energy (mean RMS)
    try:
        rms = librosa.feature.rms(y=y)[0]
        energy = round(float(np.mean(rms)), 4)
        del rms
    except Exception:
        energy = None

    # Drops (reuse loaded audio)
    try:
        drops = detect_drops_from_y(y, sr_loaded, beats)
        drop_positions = [int(d["time"] * 1000) for d in drops]
    except Exception:
        drop_positions = []

    # Sections (reuse loaded audio)
    try:
        sections = detect_sections_from_y(y, sr_loaded)
        section_labels = [
            {
                "time_ms": int(s["time"] * 1000),
                "label": s["label"],
                "duration_ms": int(s["duration"] * 1000),
            }
            for s in sections
        ]
    except Exception:
        section_labels = []

    # Phrases
    try:
        phrases = detect_phrases(beats)
        phrase_positions = [int(p["start_time"] * 1000) for p in phrases]
    except Exception:
        phrase_positions = []

    # Free the large audio array
    del y
    gc.collect()

    return {
        "bpm": bpm,
        "bpm_confidence": None,
        "key": key,
        "energy": energy,
        "duration_ms": duration_ms,
        "drop_positions": drop_positions,
        "phrase_positions": phrase_positions,
        "beat_positions": beat_positions,
        "section_labels": section_labels,
    }
