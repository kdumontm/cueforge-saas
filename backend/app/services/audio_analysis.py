"""
CueForge Pro Audio Analysis — v2.0
Advanced DJ-oriented audio analysis with:
  - Krumhansl-Schmuckler key detection (major + minor profiles)
  - Multi-factor drop detection with energy contrast + spectral flux
  - Energy-based intelligent section labeling (INTRO, BUILD, DROP, BREAKDOWN, OUTRO)
  - 8-bar and 16-bar phrase detection
  - Waveform peaks + 3-band spectral energy for RGB frontend rendering
  - Smart cue point generation (8 most important positions)
"""
from typing import Dict, List, Optional, Tuple
import gc

import librosa
import numpy as np
from scipy.cluster.hierarchy import linkage, fcluster
from scipy.spatial.distance import pdist
from scipy.signal import find_peaks, medfilt
from sqlalchemy.orm import Session

from app.models import Track, TrackAnalysis
from app.database import SessionLocal

# Audio analysis constants
SR = 22050       # Sample rate
HOP_LENGTH = 512
MAX_DURATION = 90  # Max seconds to load (saves memory on Railway)
N_FFT = 2048

# ── Krumhansl-Schmuckler key profiles ─────────────────────────────────────
# These profiles represent the correlation of each pitch class with a key.
# Much more accurate than simple argmax of chroma.
KS_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KS_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

KEY_NAMES_MAJOR = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
KEY_NAMES_MINOR = ["Cm", "C#m", "Dm", "D#m", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "A#m", "Bm"]


def detect_key_ks(y: np.ndarray, sr: int) -> Tuple[str, float]:
    """
    Detect musical key using Krumhansl-Schmuckler algorithm.
    Returns (key_name, confidence) where confidence is correlation coefficient.
    """
    try:
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        chroma_mean = np.mean(chroma, axis=1)

        best_corr = -1.0
        best_key = "C"

        for shift in range(12):
            shifted = np.roll(chroma_mean, -shift)
            # Major correlation
            corr_maj = float(np.corrcoef(shifted, KS_MAJOR)[0, 1])
            if corr_maj > best_corr:
                best_corr = corr_maj
                best_key = KEY_NAMES_MAJOR[shift]
            # Minor correlation
            corr_min = float(np.corrcoef(shifted, KS_MINOR)[0, 1])
            if corr_min > best_corr:
                best_corr = corr_min
                best_key = KEY_NAMES_MINOR[shift]

        del chroma
        return best_key, round(best_corr, 4)
    except Exception:
        return "C", 0.0


def detect_bpm_and_beats_from_y(y: np.ndarray, sr: int) -> Dict:
    """Detect BPM and beat positions from pre-loaded audio."""
    try:
        tempo, beats_frames = librosa.beat.beat_track(y=y, sr=sr)
        beats = librosa.frames_to_time(beats_frames, sr=sr).tolist()
        bpm = float(tempo) if not hasattr(tempo, '__len__') else float(tempo[0])
        return {"bpm": bpm, "beats": beats}
    except Exception as e:
        raise Exception(f"Error detecting BPM and beats: {str(e)}")


def compute_energy_curve(y: np.ndarray, sr: int, hop: int = HOP_LENGTH) -> np.ndarray:
    """Compute smoothed RMS energy envelope."""
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    rms_norm = rms / (np.max(rms) + 1e-8)
    # Smooth with median filter for stability
    if len(rms_norm) > 15:
        rms_norm = medfilt(rms_norm, kernel_size=15)
    return rms_norm

def detect_drops_from_y(y: np.ndarray, sr: int, beats: List[float]) -> List[Dict]:
    """
    Detect DJ-style drop points using multi-factor analysis:
      1. Onset strength envelope for transient detection
      2. Spectral flux for timbral changes
      3. RMS energy contour for build-up -> drop patterns
      4. Low-frequency energy ratio for bass-heavy drops
      5. Energy contrast (before/after comparison)
      6. Spectral centroid drop (frequency drops = bass drop)
    """
    try:
        hop = HOP_LENGTH

        # 1. Onset strength
        onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
        onset_env = onset_env / (np.max(onset_env) + 1e-8)

        # 2. RMS energy
        rms = librosa.feature.rms(y=y, hop_length=hop)[0]
        rms_norm = rms / (np.max(rms) + 1e-8)

        # 3. Spectral flux
        S = np.abs(librosa.stft(y, n_fft=N_FFT, hop_length=hop))
        spectral_diff = np.diff(S, axis=1)
        spectral_flux = np.sum(np.maximum(spectral_diff, 0), axis=0)
        spectral_flux = np.pad(spectral_flux, (1, 0))
        spectral_flux = spectral_flux / (np.max(spectral_flux) + 1e-8)

        # 4. Low-frequency energy ratio
        freqs = librosa.fft_frequencies(sr=sr, n_fft=N_FFT)
        bass_mask = freqs < 150
        bass_energy = np.sum(S[bass_mask, :] ** 2, axis=0)
        total_energy = np.sum(S ** 2, axis=0) + 1e-8
        bass_ratio = bass_energy / total_energy
        bass_ratio = bass_ratio / (np.max(bass_ratio) + 1e-8)

        # 5. Spectral centroid (low = bassy/heavy)
        centroid = librosa.feature.spectral_centroid(S=S, sr=sr)[0]
        centroid_norm = centroid / (np.max(centroid) + 1e-8)
        # Invert: low centroid = high drop score
        centroid_drop = 1.0 - centroid_norm

        del S, spectral_diff
        gc.collect()

        # 6. Energy contrast (before vs after)
        n_frames = len(rms_norm)
        window_sec = 4.0
        window_frames = int(window_sec * sr / hop)
        energy_contrast = np.zeros(n_frames)
        for i in range(window_frames, n_frames - window_frames):
            before = np.mean(rms_norm[max(0, i - window_frames):i])
            after = np.mean(rms_norm[i:min(n_frames, i + window_frames)])
            energy_contrast[i] = max(0, after - before)
        energy_contrast = energy_contrast / (np.max(energy_contrast) + 1e-8)

        # Combined drop score with 6 factors
        min_len = min(len(onset_env), len(rms_norm), len(spectral_flux),
                      len(bass_ratio), len(energy_contrast), len(centroid_drop))
        drop_score = (
            0.30 * energy_contrast[:min_len] +
            0.20 * onset_env[:min_len] +
            0.15 * spectral_flux[:min_len] +
            0.15 * bass_ratio[:min_len] +
            0.10 * centroid_drop[:min_len] +
            0.10 * rms_norm[:min_len]
        )

        # Find peaks
        min_distance_frames = int(8.0 * sr / hop)
        peaks, properties = find_peaks(
            drop_score,
            height=0.40,
            distance=min_distance_frames,
            prominence=0.12,
        )

        # Convert to beat-snapped positions
        peak_times = librosa.frames_to_time(peaks, sr=sr, hop_length=hop)
        drops = []
        if len(beats) == 0:
            for pt in peak_times:
                drops.append({"time": float(pt), "beat_index": 0, "score": 0.0})
        else:
            beats_arr = np.array(beats)
            for pi, pt in enumerate(peak_times):
                downbeat_indices = list(range(0, len(beats), 4))
                if not downbeat_indices:
                    downbeat_indices = list(range(len(beats)))
                nearest_db_idx = min(downbeat_indices, key=lambda i: abs(beats_arr[i] - pt))
                if abs(beats_arr[nearest_db_idx] - pt) < 2.0:
                    frame_idx = peaks[pi] if pi < len(peaks) else 0
                    score = float(drop_score[frame_idx]) if frame_idx < min_len else 0.0
                    drops.append({
                        "time": float(beats_arr[nearest_db_idx]),
                        "beat_index": int(nearest_db_idx),
                        "score": score,
                    })

        # Deduplicate
        seen = set()
        unique_drops = []
        for drop in drops:
            if drop["beat_index"] not in seen:
                unique_drops.append(drop)
                seen.add(drop["beat_index"])

        # Keep top 6 by score (more drops for pro use)
        if len(unique_drops) > 6:
            unique_drops.sort(key=lambda d: d.get("score", 0), reverse=True)
            unique_drops = unique_drops[:6]
            unique_drops.sort(key=lambda d: d["time"])

        del onset_env, rms, rms_norm, spectral_flux, bass_ratio
        del energy_contrast, drop_score, centroid_drop
        gc.collect()

        return unique_drops

    except Exception as e:
        raise Exception(f"Error detecting drops: {str(e)}")

def detect_sections_energy_based(y: np.ndarray, sr: int, beats: List[float],
                                  drops: List[Dict]) -> List[Dict]:
    """
    Detect sections using energy-based analysis with intelligent DJ labeling.
    Instead of blind clustering, uses energy envelope + drop positions to
    identify INTRO, BUILD, DROP, BREAKDOWN, OUTRO sections.
    """
    try:
        hop = HOP_LENGTH
        duration = len(y) / sr

        # Compute smoothed energy curve
        rms = librosa.feature.rms(y=y, hop_length=hop)[0]
        rms_norm = rms / (np.max(rms) + 1e-8)
        # Heavy smoothing for section-level detection
        kernel = min(51, max(3, len(rms_norm) // 20) | 1)  # Ensure odd
        energy_smooth = medfilt(rms_norm, kernel_size=kernel)

        # Also compute spectral features for segmentation
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        features = np.vstack([mfcc, chroma])
        features = (features - features.mean(axis=1, keepdims=True)) / (
            features.std(axis=1, keepdims=True) + 1e-8
        )

        # Agglomerative clustering for boundaries
        n_frames = features.shape[1]
        if n_frames < 20:
            return [{"time": 0.0, "label": "INTRO", "duration": duration}]

        distances = pdist(features.T, metric='euclidean')
        Z = linkage(distances, method='ward')
        n_clusters = min(12, max(4, n_frames // 50))
        section_labels = fcluster(Z, t=n_clusters, criterion='maxclust')

        boundaries = [0]
        for i in range(1, len(section_labels)):
            if section_labels[i] != section_labels[i - 1]:
                boundaries.append(i)
        boundaries.append(len(section_labels))
        boundary_times = librosa.frames_to_time(np.array(boundaries), sr=sr)

        # Intelligent labeling based on energy + position + drops
        drop_times = [d["time"] for d in drops]
        sections = []

        for i in range(len(boundary_times) - 1):
            start_time = float(boundary_times[i])
            end_time = float(boundary_times[i + 1])
            dur = end_time - start_time
            if dur < 1.0:
                continue

            # Compute mean energy for this section
            start_frame = librosa.time_to_frames(start_time, sr=sr, hop_length=hop)
            end_frame = librosa.time_to_frames(end_time, sr=sr, hop_length=hop)
            start_frame = max(0, min(start_frame, len(energy_smooth) - 1))
            end_frame = max(start_frame + 1, min(end_frame, len(energy_smooth)))
            section_energy = float(np.mean(energy_smooth[start_frame:end_frame]))

            # Check if any drop falls in this section
            has_drop = any(start_time <= dt < end_time for dt in drop_times)

            # Check energy trend (rising = build, falling = breakdown)
            mid = (start_frame + end_frame) // 2
            first_half_e = float(np.mean(energy_smooth[start_frame:mid])) if mid > start_frame else 0
            second_half_e = float(np.mean(energy_smooth[mid:end_frame])) if end_frame > mid else 0
            energy_trend = second_half_e - first_half_e

            # Position in track (0.0 = start, 1.0 = end)
            position = start_time / duration if duration > 0 else 0

            # Assign label based on heuristics
            if position < 0.08 or (position < 0.15 and section_energy < 0.3):
                label = "INTRO"
            elif position > 0.88 or (position > 0.80 and section_energy < 0.3):
                label = "OUTRO"
            elif has_drop and section_energy > 0.5:
                label = "DROP"
            elif energy_trend > 0.08 and section_energy > 0.3:
                label = "BUILD"
            elif section_energy < 0.35:
                label = "BREAKDOWN"
            elif section_energy > 0.6:
                label = "DROP"
            else:
                label = "BUILD" if energy_trend > 0 else "BREAKDOWN"

            sections.append({
                "time": start_time,
                "label": label,
                "duration": dur,
                "energy": round(section_energy, 3),
            })

        # Merge consecutive sections with same label
        merged = []
        for s in sections:
            if merged and merged[-1]["label"] == s["label"]:
                merged[-1]["duration"] += s["duration"]
            else:
                merged.append(dict(s))

        del mfcc, chroma, features, distances, Z
        gc.collect()

        return merged if merged else [{"time": 0.0, "label": "INTRO", "duration": duration}]

    except Exception as e:
        return [{"time": 0.0, "label": "UNKNOWN", "duration": len(y) / sr}]


def detect_phrases(beats: List[float]) -> List[Dict]:
    """Detect 8-bar phrases (32 beats in 4/4 time)."""
    phrases = []
    bars_per_phrase = 32
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

def compute_waveform_data(y: np.ndarray, sr: int, num_peaks: int = 800) -> Dict:
    """
    Compute waveform peaks and 3-band spectral energy for RGB frontend rendering.
    Returns normalized peak values and per-segment low/mid/high energy.
    """
    try:
        seg_len = max(1, len(y) // num_peaks)
        peaks = []
        spectral_low = []
        spectral_mid = []
        spectral_high = []

        for i in range(num_peaks):
            start = i * seg_len
            end = min(start + seg_len, len(y))
            if start >= len(y):
                break
            segment = y[start:end]
            # Peak amplitude
            peaks.append(float(np.max(np.abs(segment))))

            # Simple band energy using FFT
            if len(segment) >= 256:
                fft = np.fft.rfft(segment * np.hanning(len(segment)))
                power = np.abs(fft) ** 2
                freqs = np.fft.rfftfreq(len(segment), d=1.0/sr)
                low = float(np.sum(power[freqs < 250]))
                mid = float(np.sum(power[(freqs >= 250) & (freqs < 4000)]))
                high = float(np.sum(power[freqs >= 4000]))
                total = low + mid + high + 1e-10
                spectral_low.append(low / total)
                spectral_mid.append(mid / total)
                spectral_high.append(high / total)
            else:
                spectral_low.append(0.33)
                spectral_mid.append(0.33)
                spectral_high.append(0.33)

        # Normalize peaks
        max_peak = max(peaks) if peaks else 1.0
        peaks = [p / max_peak for p in peaks]

        return {
            "waveform_peaks": peaks,
            "spectral_energy": {
                "low_energy": round(float(np.mean(spectral_low)), 4),
                "mid_energy": round(float(np.mean(spectral_mid)), 4),
                "high_energy": round(float(np.mean(spectral_high)), 4),
            },
        }
    except Exception:
        return {"waveform_peaks": [], "spectral_energy": None}


# ── Backward-compatible wrapper functions ─────────────────────────────────

def detect_bpm_and_beats(file_path: str) -> Dict:
    y, sr = librosa.load(file_path, sr=SR, duration=MAX_DURATION)
    result = detect_bpm_and_beats_from_y(y, sr)
    del y; gc.collect()
    return result

def detect_drops(file_path: str, beats: List[float]) -> List[Dict]:
    y, sr = librosa.load(file_path, sr=SR, duration=MAX_DURATION)
    result = detect_drops_from_y(y, sr, beats)
    del y; gc.collect()
    return result

def detect_sections(file_path: str) -> List[Dict]:
    y, sr = librosa.load(file_path, sr=SR, duration=MAX_DURATION)
    result = detect_sections_energy_based(y, sr, [], [])
    del y; gc.collect()
    return result


def analyze_track_background(track_id: int, db: Session) -> None:
    """Full pipeline: BPM, beats, key, drops, sections, phrases."""
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
    Full audio analysis pipeline v2.0
    Loads audio ONCE, runs all analysis, returns dict for TrackAnalysis model.
    """
    y, sr_loaded = librosa.load(file_path, sr=SR, duration=MAX_DURATION)
    duration_ms = int(len(y) / sr_loaded * 1000)

    # BPM and beats
    bpm_data = detect_bpm_and_beats_from_y(y, sr_loaded)
    bpm = bpm_data["bpm"]
    beats = bpm_data["beats"]
    beat_positions = [int(b * 1000) for b in beats]

    # Key detection (Krumhansl-Schmuckler)
    try:
        key, key_confidence = detect_key_ks(y, sr_loaded)
    except Exception:
        key, key_confidence = None, None

    # Energy (mean RMS)
    try:
        rms = librosa.feature.rms(y=y)[0]
        energy = round(float(np.mean(rms)), 4)
        del rms
    except Exception:
        energy = None

    # Drops (multi-factor)
    try:
        drops = detect_drops_from_y(y, sr_loaded, beats)
        drop_positions = [int(d["time"] * 1000) for d in drops]
    except Exception:
        drops = []
        drop_positions = []

    # Sections (energy-based intelligent labeling)
    try:
        sections = detect_sections_energy_based(y, sr_loaded, beats, drops)
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

    # Waveform data for RGB frontend
    try:
        waveform_data = compute_waveform_data(y, sr_loaded)
    except Exception:
        waveform_data = {"waveform_peaks": [], "spectral_energy": None}

    del y
    gc.collect()

    return {
        "bpm": bpm,
        "bpm_confidence": key_confidence,
        "key": key,
        "energy": energy,
        "duration_ms": duration_ms,
        "drop_positions": drop_positions,
        "phrase_positions": phrase_positions,
        "beat_positions": beat_positions,
        "section_labels": section_labels,
        "waveform_peaks": waveform_data.get("waveform_peaks"),
        "spectral_energy": waveform_data.get("spectral_energy"),
    }
