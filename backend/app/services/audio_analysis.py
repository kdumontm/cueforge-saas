from typing import Dict, List, Optional, Tuple
import gc

import librosa
import numpy as np
from scipy.cluster.hierarchy import linkage, fcluster
from scipy.spatial.distance import pdist
from scipy.signal import find_peaks
from sqlalchemy.orm import Session

from app.models import Track, TrackAnalysis
from app.database import SessionLocal

# Audio analysis constants
SR = 22050       # Sample rate
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
    Detect DJ-style drop points using multi-factor analysis:
      1. Onset strength envelope for transient detection
      2. Spectral flux for timbral changes (e.g. bass drop)
      3. RMS energy contour for build-up â drop patterns
      4. Low-frequency energy ratio for bass-heavy drops

    A "drop" in DJ music = moment where energy suddenly increases after
    a breakdown/buildup, typically with heavy bass and percussion.
    """
    try:
        n_fft = 2048
        hop = HOP_LENGTH

        # ââ 1. Onset strength (percussive transient detection) ââââââââ
        onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
        onset_env = onset_env / (np.max(onset_env) + 1e-8)

        # ââ 2. RMS energy in frames ââââââââââââââââââââââââââââââââââ
        rms = librosa.feature.rms(y=y, hop_length=hop)[0]
        rms_norm = rms / (np.max(rms) + 1e-8)

        # ââ 3. Spectral flux (rate of spectral change) âââââââââââââââ
        S = np.abs(librosa.stft(y, n_fft=n_fft, hop_length=hop))
        spectral_diff = np.diff(S, axis=1)
        spectral_flux = np.sum(np.maximum(spectral_diff, 0), axis=0)
        spectral_flux = np.pad(spectral_flux, (1, 0))  # align with frames
        spectral_flux = spectral_flux / (np.max(spectral_flux) + 1e-8)

        # ââ 4. Low-frequency energy ratio (bass detection) âââââââââââ
        freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
        bass_mask = freqs < 150  # Below 150 Hz = bass
        bass_energy = np.sum(S[bass_mask, :] ** 2, axis=0)
        total_energy = np.sum(S ** 2, axis=0) + 1e-8
        bass_ratio = bass_energy / total_energy
        bass_ratio = bass_ratio / (np.max(bass_ratio) + 1e-8)

        # Free spectrogram memory
        del S, spectral_diff
        gc.collect()

        # ââ 5. Compute "drop score" per frame ââââââââââââââââââââââââ
        # Look for frames where energy was LOW before and HIGH after
        # Use a sliding window to compare energy before/after each point
        n_frames = len(rms_norm)
        window_sec = 4.0  # 4-second look-back/forward window
        window_frames = int(window_sec * sr / hop)

        energy_contrast = np.zeros(n_frames)
        for i in range(window_frames, n_frames - window_frames):
            before = np.mean(rms_norm[max(0, i - window_frames):i])
            after = np.mean(rms_norm[i:min(n_frames, i + window_frames)])
            # Drop = big increase from before to after
            energy_contrast[i] = max(0, after - before)

        energy_contrast = energy_contrast / (np.max(energy_contrast) + 1e-8)

        # ââ 6. Combined drop score âââââââââââââââââââââââââââââââââââ
        # Weight: energy contrast (most important), onset strength,
        # spectral flux, and bass ratio
        min_len = min(len(onset_env), len(rms_norm), len(spectral_flux),
                      len(bass_ratio), len(energy_contrast))
        drop_score = (
            0.40 * energy_contrast[:min_len] +
            0.20 * onset_env[:min_len] +
            0.20 * spectral_flux[:min_len] +
            0.20 * bass_ratio[:min_len]
        )

        # ââ 7. Find peaks in drop score ââââââââââââââââââââââââââââââ
        # Minimum 8 seconds between drops (typical DJ arrangement)
        min_distance_frames = int(8.0 * sr / hop)
        # Threshold: only strong peaks
        threshold = 0.45

        peaks, properties = find_peaks(
            drop_score,
            height=threshold,
            distance=min_distance_frames,
            prominence=0.15,
        )

        # ââ 8. Convert peaks to beat-snapped drop positions ââââââââââ
        peak_times = librosa.frames_to_time(peaks, sr=sr, hop_length=hop)

        drops = []
        if len(beats) == 0:
            # No beats detected, just use raw peak times
            for pt in peak_times:
                drops.append({"time": float(pt), "beat_index": 0})
        else:
            beats_arr = np.array(beats)
            for pt in peak_times:
                # Snap to nearest downbeat (every 4 beats for 4/4 time)
                downbeat_indices = list(range(0, len(beats), 4))
                if not downbeat_indices:
                    downbeat_indices = list(range(len(beats)))

                nearest_db_idx = min(
                    downbeat_indices,
                    key=lambda i: abs(beats_arr[i] - pt)
                )
                # Only keep if within 2 seconds of actual peak
                if abs(beats_arr[nearest_db_idx] - pt) < 2.0:
                    drops.append({
                        "time": float(beats_arr[nearest_db_idx]),
                     "beat_index": int(nearest_db_idx),
                    })

        # Deduplicate by beat index
        seen = set()
        unique_drops = []
        for drop in drops:
            if drop["beat_index"] not in seen:
                unique_drops.append(drop)
                seen.add(drop["beat_index"])

        # ââ 9. Limit to top 4 most prominent drops ââââââââââââââââââ
        # Sort by score and keep max 4
        if len(unique_drops) > 4:
            scored = []
            for d in unique_drops:
                frame_idx = librosa.time_to_frames(
                    d["time"], sr=sr, hop_length=hop
                )
                if frame_idx < min_len:
                    scored.append((d, drop_score[frame_idx]))
                else:
                    scored.append((d, 0.0))
            scored.sort(key=lambda x: x[1], reverse=True)
            unique_drops = [s[0] for s in scored[:4]]
            # Re-sort by time
            unique_drops.sort(key=lambda d: d["time"])

        del onset_env, rms, rms_norm, spectral_flux, bass_ratio
        del energy_contrast, drop_score
        gc.collect()

        return unique_drops

    except Exception as e:
        raise Exception(f"Error detecting drops: {str(e)}")


def detect_sections_from_y(y: np.ndarray, sr: int) -> List[Dict]:
    """
    Detect sections using MFCC + chroma agglomerative segmentation
    from pre-loaded audio.
    """
    try:
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        features = np.vstack([mfcc, chroma])
        features = (features - features.mean(axis=1, keepdims=True)) / (
            features.std(axis=1, keepdims=True) + 1e-8
        )

        distances = pdist(features.T, metric='euclidean')
        Z = linkage(distances, method='ward')
        section_labels = fcluster(Z, t=10, criterion='maxclust')

        boundaries = [0]
        for i in range(1, len(section_labels)):
            if section_labels[i] != section_labels[i - 1]:
                boundaries.append(i)
        boundaries.append(len(section_labels))

        boundary_times = librosa.frames_to_time(np.array(boundaries), sr=sr)

        dj_labels = [
            "INTRO", "BUILD", "DROP", "BREAKDOWN",
            "BUILD", "DROP", "OUTRO"
        ]

        sections = []
        for i in range(len(boundary_times) - 1):
            start_time = float(boundary_times[i])
            end_time = float(boundary_times[i + 1])
            duration = end_time - start_time
            label = dj_labels[i % len(dj_labels)]
            sections.append({
                "time": start_time,
                "label": label,
                "duration": duration,
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
                "duration": float(duration),
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
            phrases=phrases,
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
    Full audio analysis pipeline.
    Loads audio ONCE to save memory.
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
        key_names = [
            "C", "C#", "D", "D#", "E", "F",
            "F#", "G", "G#", "A", "A#", "B",
        ]
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

    # Drops (reuse loaded audio) - improved multi-factor detection
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
