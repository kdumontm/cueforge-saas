from typing import Dict, List, Optional, Tuple
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


def detect_bpm_and_beats(file_path: str) -> Dict:
    """
    Detect BPM and beat positions using librosa.

    Args:
        file_path: Path to audio file

    Returns:
        Dictionary with 'bpm' (float) and 'beats' (list of beat times in seconds)
    """
    try:
        y, sr = librosa.load(file_path, sr=SR)

        # Detect tempo and beat frames
        tempo, beats_frames = librosa.beat.beat_track(y=y, sr=sr)

        # Convert beat frames to time in seconds
        beats = librosa.frames_to_time(beats_frames, sr=sr).tolist()

        return {
            "bpm": float(tempo),
            "beats": beats
        }
    except Exception as e:
        raise Exception(f"Error detecting BPM and beats: {str(e)}")


def detect_drops(file_path: str, beats: List[float]) -> List[Dict]:
    """
    Detect drop points using RMS energy spike detection.

    Args:
        file_path: Path to audio file
        beats: List of beat times in seconds

    Returns:
        List of drop dicts with 'time' and 'beat_index'
    """
    try:
        y, sr = librosa.load(file_path, sr=SR)

        # Calculate RMS energy
        S = librosa.feature.melspectrogram(y=y, sr=sr)
        S_db = librosa.power_to_db(S, ref=np.max)
        rms = librosa.feature.rms(y=y)[0]

        # Normalize RMS
        rms_normalized = (rms - np.mean(rms)) / (np.std(rms) + 1e-8)

        # Find peaks (energy spikes)
        threshold = 1.5  # Standard deviations above mean
        peaks = np.where(rms_normalized > threshold)[0]

        # Convert frames to time
        peak_times = librosa.frames_to_time(peaks, sr=sr)

        drops = []
        for peak_time in peak_times:
            # Snap to nearest beat
            nearest_beat_idx = min(
                range(len(beats)),
                key=lambda i: abs(beats[i] - peak_time)
            )
            drops.append({
                "time": float(beats[nearest_beat_idx]),
                "beat_index": int(nearest_beat_idx)
            })

        # Remove duplicates
        seen = set()
        unique_drops = []
        for drop in drops:
            if drop["beat_index"] not in seen:
                unique_drops.append(drop)
                seen.add(drop["beat_index"])

        return unique_drops
    except Exception as e:
        raise Exception(f"Error detecting drops: {str(e)}")


def detect_sections(file_path: str) -> List[Dict]:
    """
    Detect sections using MFCC + chroma agglomerative segmentation.

    Args:
        file_path: Path to audio file

    Returns:
        List of section dicts with 'time', 'label', 'duration'
    """
    try:
        y, sr = librosa.load(file_path, sr=SR)

        # Extract features
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)

        # Combine features
        features = np.vstack([mfcc, chroma])

        # Normalize features
        features = (features - features.mean(axis=1, keepdims=True)) / (features.std(axis=1, keepdims=True) + 1e-8)

        # Compute similarity matrix and linkage
        distances = pdist(features.T, metric='euclidean')
        Z = linkage(distances, method='ward')

        # Cluster into sections (cut at distance threshold)
        section_labels = fcluster(Z, t=10, criterion='maxclust')

        # Find section boundaries
        boundaries = [0]
        for i in range(1, len(section_labels)):
            if section_labels[i] != section_labels[i-1]:
                boundaries.append(i)
        boundaries.append(len(section_labels))

        # Convert frame indices to time
        boundary_times = librosa.frames_to_time(np.array(boundaries), sr=sr)

        # DJ labels based on position in track
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

        return sections
    except Exception as e:
        raise Exception(f"Error detecting sections: {str(e)}")


def detect_phrases(beats: List[float]) -> List[Dict]:
    """
    Detect 8-bar phrases from beats.

    Args:
        beats: List of beat times in seconds

    Returns:
        List of phrase dicts with 'start_beat', 'end_beat', 'start_time', 'duration'
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


def analyze_track_background(track_id: int, db: Session) -> None:
    """
    Full pipeline analysis: detect BPM, beats, drops, sections, phrases.
    Updates Track status and creates TrackAnalysis record.

    Args:
        track_id: Track ID to analyze
        db: Database session
    """
    try:
        # Get track from database
        track = db.query(Track).filter(Track.id == track_id).first()
        if not track:
            return

        # Update status to analyzing
        track.status = "analyzing"
        db.commit()

        # Run analysis
        bpm_data = detect_bpm_and_beats(track.file_path)
        drops = detect_drops(track.file_path, bpm_data["beats"])
        sections = detect_sections(track.file_path)
        phrases = detect_phrases(bpm_data["beats"])

        # Create analysis record
        analysis = TrackAnalysis(
            track_id=track_id,
            bpm=bpm_data["bpm"],
            beats=bpm_data["beats"],
            drops=drops,
            sections=sections,
            phrases=phrases
        )
        db.add(analysis)

        # Update track status to completed
        track.status = "completed"
        db.commit()

    except Exception as e:
        # Update track status to error
        track = db.query(Track).filter(Track.id == track_id).first()
        if track:
            track.status = "error"
            db.commit()
        raise Exception(f"Background analysis failed: {str(e)}")



def analyze_audio(file_path: str) -> Dict:
    """
    Full audio analysis pipeline.
    Returns dict compatible with TrackAnalysis model fields.
    """
    y, sr_loaded = librosa.load(file_path, sr=SR)
    duration_ms = int(len(y) / sr_loaded * 1000)

    # BPM and beats
    bpm_data = detect_bpm_and_beats(file_path)
    bpm = bpm_data["bpm"]
    beats = bpm_data["beats"]
    beat_positions = [int(b * 1000) for b in beats]

    # Key detection
    try:
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr_loaded)
        key_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
        key_idx = int(np.argmax(np.mean(chroma, axis=1)))
        key = key_names[key_idx]
    except Exception:
        key = None

    # Energy (mean RMS)
    try:
        rms = librosa.feature.rms(y=y)[0]
        energy = round(float(np.mean(rms)), 4)
    except Exception:
        energy = None

    # Drops
    try:
        drops = detect_drops(file_path, beats)
        drop_positions = [int(d["time"] * 1000) for d in drops]
    except Exception:
        drop_positions = []

    # Sections
    try:
        sections = detect_sections(file_path)
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
