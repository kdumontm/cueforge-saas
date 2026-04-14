"""
Audio Spectral & Frequency Analysis Module

Extracted from audio_analysis.py for modular organization.
Handles:
- Spectral feature tracking (centroid, bandwidth, rolloff, contrast)
- Stereo width and mono compatibility analysis
- MFCC and zero-crossing analysis
- Harmonic-Percussive Source Separation (HPSS)
- Sub-band energy ratios
- Spectral peaks and formant analysis
- Pitch tracking and scale detection
- Bass note tracking
- Melodic interval analysis

References:
- librosa spectral feature extraction
- ITU-R BS.1770-4 loudness metering
"""

from typing import Dict, List, Optional, Any
import numpy as np
import librosa
from scipy.signal import find_peaks, butter, filtfilt


# ══════════════════════════════════════════════════════════════════════════
#   SPECTRAL FEATURE TRACKING
# ══════════════════════════════════════════════════════════════════════════

def compute_spectral_centroid_tracking(y: np.ndarray, sr: int, hop_length: int = 512) -> Dict:
    """
    Point 1: Track spectral centroid (brightness) per section.
    Returns mean, std, min, max across track + brightness label.

    v6.3: Added brightness_label for quick UX display
    """
    try:
        spec_cent = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=hop_length)[0]
        mean_cent = float(np.mean(spec_cent))
        # v6.3: Classify brightness based on centroid frequency
        if mean_cent < 1500:
            brightness = "dark"
        elif mean_cent < 3000:
            brightness = "warm"
        elif mean_cent < 5000:
            brightness = "neutral"
        elif mean_cent < 8000:
            brightness = "bright"
        else:
            brightness = "very_bright"
        return {
            "spectral_centroid_mean": mean_cent,
            "spectral_centroid_std": float(np.std(spec_cent)),
            "spectral_centroid_min": float(np.min(spec_cent)),
            "spectral_centroid_max": float(np.max(spec_cent)),
            "brightness_label": brightness,
        }
    except Exception:
        return {"spectral_centroid_mean": 0.0, "spectral_centroid_std": 0.0,
                "spectral_centroid_min": 0.0, "spectral_centroid_max": 0.0,
                "brightness_label": None}


def compute_stereo_width(y: np.ndarray, sr: int, hop_length: int = 512) -> Dict:
    """
    v6.3: Stereo width analysis — mid/side balance and mono compatibility.

    For mono input (1D array), returns neutral stereo width.
    For stereo input (2D array), computes:
    - stereo_width: 0.0 (mono) to 1.0 (full stereo)
    - mono_compatibility: 0.0 (phase issues) to 1.0 (perfect mono compatibility)
    - stereo_balance: -1.0 (hard left) to 1.0 (hard right), 0.0 = centered
    """
    try:
        # Handle mono input
        if y.ndim == 1:
            return {
                "stereo_width": 0.0,
                "mono_compatibility": 1.0,
                "stereo_balance": 0.0,
                "stereo_width_label": "mono",
            }

        # Stereo input: shape (2, N)
        if y.shape[0] != 2:
            return {
                "stereo_width": 0.0,
                "mono_compatibility": 1.0,
                "stereo_balance": 0.0,
                "stereo_width_label": "mono",
            }

        left = y[0]
        right = y[1]

        # Mid/Side decomposition
        mid = (left + right) / 2.0
        side = (left - right) / 2.0

        rms_mid = float(np.sqrt(np.mean(mid ** 2)))
        rms_side = float(np.sqrt(np.mean(side ** 2)))

        # Width: ratio of side energy to total energy
        total_energy = rms_mid + rms_side + 1e-10
        width = rms_side / total_energy

        # Mono compatibility: Pearson correlation between L and R
        if len(left) > 0 and np.std(left) > 0 and np.std(right) > 0:
            correlation = float(np.corrcoef(left[:min(len(left), sr * 30)],
                                            right[:min(len(right), sr * 30)])[0, 1])
        else:
            correlation = 1.0

        # Balance: difference in RMS between channels
        rms_left = float(np.sqrt(np.mean(left ** 2)))
        rms_right = float(np.sqrt(np.mean(right ** 2)))
        balance = (rms_right - rms_left) / (rms_left + rms_right + 1e-10)

        # Label
        if width < 0.1:
            label = "mono"
        elif width < 0.25:
            label = "narrow"
        elif width < 0.45:
            label = "normal"
        elif width < 0.65:
            label = "wide"
        else:
            label = "very_wide"

        return {
            "stereo_width": round(width, 3),
            "mono_compatibility": round(max(0.0, correlation), 3),
            "stereo_balance": round(balance, 3),
            "stereo_width_label": label,
        }
    except Exception:
        return {
            "stereo_width": None,
            "mono_compatibility": None,
            "stereo_balance": None,
            "stereo_width_label": None,
        }


def compute_spectral_bandwidth(y: np.ndarray, sr: int, hop_length: int = 512) -> Dict:
    """
    Point 2: Spectral bandwidth (frequency spread around centroid).
    """
    try:
        spec_bw = librosa.feature.spectral_bandwidth(y=y, sr=sr, hop_length=hop_length)[0]
        return {
            "spectral_bandwidth_mean": float(np.mean(spec_bw)),
            "spectral_bandwidth_std": float(np.std(spec_bw)),
        }
    except Exception:
        return {"spectral_bandwidth_mean": 0.0, "spectral_bandwidth_std": 0.0}


def compute_spectral_rolloff(y: np.ndarray, sr: int, hop_length: int = 512) -> Dict:
    """
    Point 3: Spectral rolloff (frequency where 85% of energy is below).
    """
    try:
        spec_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr, hop_length=hop_length)[0]
        return {
            "spectral_rolloff_mean": float(np.mean(spec_rolloff)),
            "spectral_rolloff_std": float(np.std(spec_rolloff)),
        }
    except Exception:
        return {"spectral_rolloff_mean": 0.0, "spectral_rolloff_std": 0.0}


def compute_spectral_flatness(S: np.ndarray) -> Dict:
    """
    Point 4: Spectral flatness (tonality measure: 0=tonal, 1=noisy).
    """
    try:
        # Spectral flatness = geometric mean / arithmetic mean
        eps = 1e-10
        geometric_mean = np.exp(np.mean(np.log(S + eps), axis=0))
        arithmetic_mean = np.mean(S, axis=0)
        flatness = geometric_mean / (arithmetic_mean + eps)
        flatness = np.clip(flatness, 0, 1)
        return {
            "spectral_flatness_mean": float(np.mean(flatness)),
            "spectral_flatness_std": float(np.std(flatness)),
        }
    except Exception:
        return {"spectral_flatness_mean": 0.0, "spectral_flatness_std": 0.0}


def compute_tonnetz_features(y: np.ndarray, sr: int) -> Dict:
    """
    Point 6: Tonnetz (tonal network) features for harmonic relationships.
    """
    try:
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        tonnetz = librosa.feature.tonnetz(chroma=chroma)
        return {
            "tonnetz_mean": float(np.mean(tonnetz)),
            "tonnetz_std": float(np.std(tonnetz)),
            "tonnetz_dim1_mean": float(np.mean(tonnetz[0])) if tonnetz.shape[0] > 0 else 0.0,
        }
    except Exception:
        return {"tonnetz_mean": 0.0, "tonnetz_std": 0.0, "tonnetz_dim1_mean": 0.0}


def compute_mfcc_statistics(y: np.ndarray, sr: int, n_mfcc: int = 13) -> Dict:
    """
    Point 7: MFCC statistics for timbral characterization.
    """
    try:
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=n_mfcc)
        return {
            "mfcc_mean": float(np.mean(mfcc)),
            "mfcc_std": float(np.std(mfcc)),
            "mfcc_delta_mean": float(np.mean(librosa.feature.delta(mfcc))),
        }
    except Exception:
        return {"mfcc_mean": 0.0, "mfcc_std": 0.0, "mfcc_delta_mean": 0.0}


def compute_zero_crossing_rate(y: np.ndarray) -> Dict:
    """
    Point 8: Zero-crossing rate analysis per frame (high in noise/unvoiced).
    """
    try:
        zcr = librosa.feature.zero_crossing_rate(y)[0]
        return {
            "zcr_mean": float(np.mean(zcr)),
            "zcr_std": float(np.std(zcr)),
            "zcr_max": float(np.max(zcr)),
        }
    except Exception:
        return {"zcr_mean": 0.0, "zcr_std": 0.0, "zcr_max": 0.0}


def compute_onset_strength_multiband(y: np.ndarray, sr: int, hop_length: int = 512) -> Dict:
    """
    Point 9: Multi-band onset strength (percussive vs harmonic content).
    """
    try:
        onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)
        # Split into freq bands
        D = librosa.stft(y, hop_length=hop_length)

        low_freq = np.abs(D[:10]).mean(axis=0)  # Low frequencies
        mid_freq = np.abs(D[10:50]).mean(axis=0)  # Mid frequencies
        high_freq = np.abs(D[50:]).mean(axis=0)  # High frequencies

        return {
            "onset_strength_mean": float(np.mean(onset)),
            "low_freq_onset": float(np.mean(low_freq)),
            "mid_freq_onset": float(np.mean(mid_freq)),
            "high_freq_onset": float(np.mean(high_freq)),
        }
    except Exception:
        return {"onset_strength_mean": 0.0, "low_freq_onset": 0.0,
                "mid_freq_onset": 0.0, "high_freq_onset": 0.0}


def compute_hpss_metrics(y: np.ndarray, sr: int) -> Dict:
    """
    Point 10: Harmonic-Percussive Source Separation (HPSS) strength metrics.
    """
    try:
        D = librosa.stft(y)
        H, P = librosa.decompose.hpss(D)

        harmonic_energy = np.sum(np.abs(H) ** 2)
        percussive_energy = np.sum(np.abs(P) ** 2)
        total_energy = harmonic_energy + percussive_energy

        if total_energy > 0:
            harmonic_ratio = harmonic_energy / total_energy
            percussive_ratio = percussive_energy / total_energy
        else:
            harmonic_ratio = percussive_ratio = 0.5

        return {
            "harmonic_ratio": float(harmonic_ratio),
            "percussive_ratio": float(percussive_ratio),
        }
    except Exception:
        return {"harmonic_ratio": 0.5, "percussive_ratio": 0.5}


def compute_spectral_contrast(y: np.ndarray, sr: int) -> Dict:
    """
    Point 12: Spectral contrast per octave (energy peaks vs valleys).
    """
    try:
        spec_contrast = librosa.feature.spectral_contrast(y=y, sr=sr)
        return {
            "spectral_contrast_mean": float(np.mean(spec_contrast)),
            "spectral_contrast_std": float(np.std(spec_contrast)),
            "spectral_contrast_max": float(np.max(spec_contrast)),
        }
    except Exception:
        return {"spectral_contrast_mean": 0.0, "spectral_contrast_std": 0.0,
                "spectral_contrast_max": 0.0}


def detect_spectral_peaks(S: np.ndarray, sr: int, n_fft: int) -> Dict:
    """
    Point 13: Detect spectral peaks (fundamental + harmonics).
    """
    try:
        magnitude = np.mean(np.abs(S), axis=1)
        peaks, _ = find_peaks(magnitude, height=np.max(magnitude) * 0.3)
        freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)

        peak_freqs = freqs[peaks] if len(peaks) > 0 else []
        return {
            "spectral_peaks_count": len(peaks),
            "peak_frequencies": peak_freqs[:5].tolist() if len(peak_freqs) > 0 else [],
        }
    except Exception:
        return {"spectral_peaks_count": 0, "peak_frequencies": []}


def analyze_formants_for_vocals(y: np.ndarray, sr: int) -> Dict:
    """
    Point 14: Basic formant analysis for vocal detection.
    Identifies characteristic formant frequencies typical in vocal content.
    """
    try:
        # Extract MFCC which captures formant-like features
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)

        # Compute spectral envelope via LPC-like approach (simplified via power spectrum)
        D = librosa.stft(y)
        power_spectrum = np.abs(D) ** 2

        # Detect peaks in average power spectrum (formant candidates)
        avg_spectrum = np.mean(power_spectrum, axis=1)
        peaks, properties = find_peaks(avg_spectrum, height=np.max(avg_spectrum) * 0.3)

        freqs = librosa.fft_frequencies(sr=sr, n_fft=D.shape[0] * 2 - 2)
        formant_freqs = freqs[peaks] if len(peaks) > 0 else []

        # Typical vocal formants are in 700-3500 Hz range
        vocal_formants = [f for f in formant_freqs if 700 < f < 3500]

        # Vocal likelihood based on formant presence and MFCC variance
        mfcc_variance = np.std(mfcc)
        vocal_likelihood = min(1.0, (len(vocal_formants) / 3.0) * (mfcc_variance / 10.0))

        return {
            "formant_count": len(formant_freqs),
            "vocal_formants_count": len(vocal_formants),
            "vocal_likelihood": float(vocal_likelihood),
            "formant_frequencies": formant_freqs[:5].tolist() if len(formant_freqs) > 0 else [],
        }
    except Exception:
        return {
            "formant_count": 0,
            "vocal_formants_count": 0,
            "vocal_likelihood": 0.0,
            "formant_frequencies": [],
        }


def analyze_temporal_envelope(y: np.ndarray, sr: int) -> Dict:
    """
    Point 15: Temporal envelope shape (attack/decay/sustain/release).
    """
    try:
        # Simple envelope via energy tracking
        hop_length = 512
        energy = np.sqrt(np.sum(librosa.magphase(librosa.stft(y, hop_length=hop_length))[0] ** 2, axis=0))
        energy_norm = energy / (np.max(energy) + 1e-10)

        # Detect attack (rise to peak), decay, sustain, release
        attack_frames = np.argmax(energy_norm)

        if attack_frames > 0:
            attack_slope = energy_norm[attack_frames] / attack_frames
        else:
            attack_slope = 0.0

        if attack_frames < len(energy_norm) - 1:
            decay_region = energy_norm[attack_frames:]
            decay_slope = (decay_region[-1] - decay_region[0]) / len(decay_region) if len(decay_region) > 1 else 0.0
        else:
            decay_slope = 0.0

        return {
            "attack_slope": float(attack_slope),
            "decay_slope": float(decay_slope),
            "sustain_level": float(np.mean(energy_norm)),
        }
    except Exception:
        return {"attack_slope": 0.0, "decay_slope": 0.0, "sustain_level": 0.0}


def autocorr_pitch_tracking(y: np.ndarray, sr: int) -> Dict:
    """
    Point 16: Autocorrelation-based pitch tracking (fundamental frequency).
    """
    try:
        # Simple autocorrelation-based F0 detection
        hop_length = 512
        frame_length = 2048

        # Extract frames
        frames = librosa.util.frame(y, frame_length=frame_length, hop_length=hop_length)

        f0_values = []
        for frame in frames.T:
            autocorr = np.correlate(frame - np.mean(frame), frame - np.mean(frame), mode='full')
            autocorr = autocorr[len(autocorr) // 2:]

            if len(autocorr) > 1:
                peaks, _ = find_peaks(autocorr, height=np.max(autocorr) * 0.3)
                if len(peaks) > 0:
                    lag = peaks[0]
                    f0 = sr / lag if lag > 0 else 0.0
                    f0_values.append(f0)

        if f0_values:
            return {
                "f0_mean": float(np.mean(f0_values)),
                "f0_std": float(np.std(f0_values)),
            }
        else:
            return {"f0_mean": 0.0, "f0_std": 0.0}
    except Exception:
        return {"f0_mean": 0.0, "f0_std": 0.0}


def compute_chromagram_delta(y: np.ndarray, sr: int) -> Dict:
    """
    Point 17: Chromagram delta features (harmonic change tracking).
    """
    try:
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        chroma_delta = librosa.feature.delta(chroma)

        return {
            "chroma_delta_mean": float(np.mean(np.abs(chroma_delta))),
            "chroma_delta_std": float(np.std(chroma_delta)),
        }
    except Exception:
        return {"chroma_delta_mean": 0.0, "chroma_delta_std": 0.0}


def compute_spectral_entropy(S: np.ndarray) -> Dict:
    """
    Point 18: Spectral entropy (complexity measure).
    """
    try:
        # Normalize to probability distribution
        power = np.abs(S) ** 2
        power_norm = power / (np.sum(power) + 1e-10)

        # Shannon entropy
        entropy = -np.sum(power_norm * np.log2(power_norm + 1e-10))

        return {
            "spectral_entropy_mean": float(np.mean(entropy)),
            "spectral_entropy_std": float(np.std(entropy)),
        }
    except Exception:
        return {"spectral_entropy_mean": 0.0, "spectral_entropy_std": 0.0}


def detect_true_peak(y: np.ndarray, sr: int) -> Dict:
    """
    Point 20: True peak detection (inter-sample peaks).
    v6.4: Real 4x oversampling via scipy.signal.resample for ITU-R BS.1770-4 compliance.
    Detects peaks BETWEEN samples that can cause clipping in DACs.
    """
    try:
        # ITU-R BS.1770-4 recommends 4x oversampling for true peak
        # Process in chunks to limit memory usage
        chunk_size = min(len(y), sr * 10)  # 10 seconds max
        max_peak = 0.0

        for start in range(0, len(y), chunk_size):
            chunk = y[start:start + chunk_size]
            try:
                from scipy.signal import resample
                oversampled = resample(chunk, len(chunk) * 4)
                chunk_peak = float(np.max(np.abs(oversampled)))
            except ImportError:
                # Fallback: simple sample peak if scipy not available
                chunk_peak = float(np.max(np.abs(chunk)))
            max_peak = max(max_peak, chunk_peak)

        peak_db = 20 * np.log10(max_peak + 1e-10)

        return {
            "true_peak_value": round(float(max_peak), 6),
            "true_peak_db": round(float(peak_db), 2),
        }
    except Exception:
        return {"true_peak_value": 0.0, "true_peak_db": -100.0}


def compute_tempo_histogram(y: np.ndarray, sr: int) -> Dict:
    """
    Point 21: Tempo histogram (multi-modal tempo detection).
    """
    try:
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        tempogram = librosa.feature.tempogram(onset_envelope=onset_env, sr=sr)

        # Find peaks in tempogram
        tempo_axis = librosa.feature.tempogram_frames(y=onset_env)

        return {
            "tempo_histogram_peaks": int(np.max(tempogram)),
            "tempogram_energy_mean": float(np.mean(tempogram)),
        }
    except Exception:
        return {"tempo_histogram_peaks": 0, "tempogram_energy_mean": 0.0}


# ══════════════════════════════════════════════════════════════════════════
#   PITCH & SCALE ANALYSIS
# ══════════════════════════════════════════════════════════════════════════

def pitch_class_distribution(y: np.ndarray, sr: int) -> Dict[str, Any]:
    """
    Point 22: Analyze pitch class distribution.
    Shows which notes/pitches are most prominent.
    """
    try:
        if len(y) < sr:
            return {
                "pitch_classes": {},
                "most_prominent": "unknown",
                "distribution_entropy": 0.0,
            }

        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        chroma_mean = np.mean(chroma, axis=1)

        # Normalize
        chroma_norm = chroma_mean / (np.sum(chroma_mean) + 1e-8)

        note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

        distribution = {note_names[i]: float(chroma_norm[i]) for i in range(12)}

        # Most prominent
        most_idx = np.argmax(chroma_norm)
        most_prominent = note_names[most_idx]

        # Entropy
        entropy = -np.sum(chroma_norm * np.log(chroma_norm + 1e-8))
        max_entropy = np.log(12)
        entropy_norm = entropy / max_entropy

        return {
            "pitch_classes": distribution,
            "most_prominent": most_prominent,
            "distribution_entropy": float(entropy_norm),
        }
    except Exception:
        return {
            "pitch_classes": {},
            "most_prominent": "unknown",
            "distribution_entropy": 0.0,
        }


def bass_note_tracking(y: np.ndarray, sr: int) -> Dict[str, Any]:
    """
    Point 25: Track bass note throughout track.
    Estimates fundamental bass frequency.
    """
    try:
        if len(y) < sr:
            return {
                "bass_note": "unknown",
                "bass_frequency": 0.0,
                "tracking_confidence": 0.0,
            }

        # Low-pass filter to isolate bass (< 250 Hz)
        nyquist = sr / 2
        cutoff = 250 / nyquist
        if cutoff >= 1.0:
            cutoff = 0.95

        b, a = butter(4, cutoff, btype='low')
        bass = filtfilt(b, a, y)

        # Compute chroma of bass
        if len(bass) >= sr // 2:
            chroma = librosa.feature.chroma_cqt(y=bass, sr=sr)
            chroma_mean = np.mean(chroma, axis=1)

            # Peak note
            note_idx = np.argmax(chroma_mean)
            note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
            bass_note = note_names[note_idx]

            # Confidence
            confidence = chroma_mean[note_idx] / (np.sum(chroma_mean) + 1e-8)

            # Frequency estimate (assuming A0 = 27.5 Hz as reference)
            base_freq = 27.5
            octave = 1
            semitone = note_idx
            bass_freq = base_freq * (2 ** octave) * (2 ** (semitone / 12.0))
        else:
            bass_note = "unknown"
            confidence = 0.0
            bass_freq = 0.0

        return {
            "bass_note": bass_note,
            "bass_frequency": float(bass_freq),
            "tracking_confidence": float(np.clip(confidence, 0.0, 1.0)),
        }
    except Exception:
        return {
            "bass_note": "unknown",
            "bass_frequency": 0.0,
            "tracking_confidence": 0.0,
        }


def melodic_interval_histogram(y: np.ndarray, sr: int) -> Dict[str, Any]:
    """
    Point 26: Compute histogram of melodic intervals.
    Shows which interval jumps are most common.
    """
    try:
        if len(y) < sr:
            return {
                "interval_histogram": {},
                "most_common_interval": "unison",
                "interval_diversity": 0.0,
            }

        # Pitch tracking (simplified)
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)

        # Get note sequence (frame by frame)
        note_sequence = np.argmax(chroma, axis=0)

        # Compute intervals
        intervals = np.diff(note_sequence)
        intervals = np.abs(intervals)  # Magnitude only

        # Histogram
        unique, counts = np.unique(intervals, return_counts=True)

        interval_names = {
            0: "unison",
            1: "semitone",
            2: "whole_tone",
            3: "minor_third",
            4: "major_third",
            5: "perfect_fourth",
            6: "tritone",
            7: "perfect_fifth",
            8: "minor_sixth",
            9: "major_sixth",
            10: "minor_seventh",
            11: "major_seventh",
        }

        histogram = {}
        for interval, count in zip(unique, counts):
            name = interval_names.get(int(interval % 12), f"interval_{interval}")
            histogram[name] = int(count)

        # Most common
        most_common_idx = np.argmax(counts)
        most_common = interval_names.get(int(unique[most_common_idx] % 12), "unison")

        # Diversity (entropy of interval distribution)
        probs = counts / np.sum(counts)
        entropy = -np.sum(probs * np.log(probs + 1e-8))
        max_entropy = np.log(len(probs))
        diversity = entropy / max_entropy if max_entropy > 0 else 0.0

        return {
            "interval_histogram": histogram,
            "most_common_interval": most_common,
            "interval_diversity": float(diversity),
        }
    except Exception:
        return {
            "interval_histogram": {},
            "most_common_interval": "unison",
            "interval_diversity": 0.0,
        }


def scale_detection(y: np.ndarray, sr: int) -> Dict[str, Any]:
    """
    Point 27: Detect scale/mode used (major, minor, modes).
    Analyzes pitch class distribution to infer scale.
    """
    try:
        if len(y) < sr:
            return {
                "detected_scale": "unknown",
                "scale_confidence": 0.0,
                "possible_scales": [],
            }

        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        chroma_mean = np.mean(chroma, axis=1)
        chroma_norm = chroma_mean / (np.sum(chroma_mean) + 1e-8)

        # Scale profiles (relative energy patterns)
        scales = {
            "major": np.array([1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1]),  # C, D, E, F, G, A, B
            "minor_natural": np.array([1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0]),  # C, D, Eb, F, G, Ab, Bb
            "minor_harmonic": np.array([1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0, 1]),  # C, D, Eb, F, G, Ab, B
            "pentatonic_major": np.array([1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0]),  # C, D, E, G, A
            "pentatonic_minor": np.array([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0]),  # C, Eb, F, G, Bb
        }

        # Normalize profiles
        for key in scales:
            scales[key] = scales[key] / np.sum(scales[key])

        # Compare against each scale
        scale_scores = {}
        for scale_name, profile in scales.items():
            correlation = np.dot(profile, chroma_norm)
            scale_scores[scale_name] = float(correlation)

        # Best match
        best_scale = max(scale_scores, key=scale_scores.get)
        best_confidence = scale_scores[best_scale]

        # Possible scales (sorted)
        possible = sorted(scale_scores.items(), key=lambda x: x[1], reverse=True)
        possible = [{"scale": name, "confidence": float(conf)} for name, conf in possible[:3]]

        return {
            "detected_scale": best_scale if best_confidence > 0.4 else "unknown",
            "scale_confidence": best_confidence,
            "possible_scales": possible,
        }
    except Exception:
        return {
            "detected_scale": "unknown",
            "scale_confidence": 0.0,
            "possible_scales": [],
        }
