"""
Mix analysis service for seamless track transitions.
Points 741-760: Transition scoring, key paths, BPM feasibility,
energy matching, bass clash detection, vocal overlap, drum patterns, mix suggestions.
"""

import numpy as np
import librosa
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass


@dataclass
class TransitionScore:
    """Scoring for transition quality between two tracks."""
    overall_score: float      # 0-1, overall compatibility
    key_compatibility: float  # 0-1
    bpm_compatibility: float  # 0-1
    energy_compatibility: float
    details: Dict[str, float]


@dataclass
class KeyTransitionPath:
    """Optimal key transition path between tracks."""
    from_key: str
    to_key: str
    pivot_key: Optional[str]  # intermediate key if needed
    distance: int            # semitones
    difficulty: str          # 'easy', 'medium', 'hard'


@dataclass
class BpmTransitionFeasibility:
    """BPM transition analysis."""
    from_bpm: float
    to_bpm: float
    bpm_ratio: float         # to_bpm / from_bpm
    max_transition_bpm: float  # max achievable intermediate BPM
    feasible: bool           # within ±8%
    double_time_required: bool


@dataclass
class EnergyMatch:
    """Energy curve matching between tracks."""
    from_energy_curve: np.ndarray
    to_energy_curve: np.ndarray
    curve_similarity: float   # 0-1, cross-correlation
    best_alignment_time: float  # seconds


@dataclass
class FrequencyClash:
    """Bass frequency clash analysis."""
    clash_detected: bool
    clash_frequencies: List[float]  # Hz
    clash_severity: float    # 0-1
    recommendation: str      # EQ suggestion


@dataclass
class VocalOverlapPrediction:
    """Vocal overlap prediction."""
    from_track_has_vocal: bool
    to_track_has_vocal: bool
    overlap_predicted: bool
    overlap_duration: float  # seconds
    severity: str            # 'none', 'mild', 'severe'


@dataclass
class DrumPatternMatch:
    """Drum pattern compatibility."""
    from_drum_pattern: str
    to_drum_pattern: str
    pattern_similarity: float  # 0-1
    is_break_compatible: bool


@dataclass
class MixSuggestion:
    """Mix-in/out point and duration suggestions."""
    best_mix_in_point: float  # seconds
    best_mix_out_point: float  # seconds
    suggested_mix_duration: float  # seconds
    fade_in_duration: float
    fade_out_duration: float
    confidence: float        # 0-1


class MixAnalyzer:
    """Analyze seamless track transitions and mixing compatibility."""

    def __init__(self, sr: int = 22050):
        self.sr = sr

    def analyze_transition(
        self,
        y1: np.ndarray,
        y2: np.ndarray,
        bpm1: float,
        bpm2: float,
        key1: str,
        key2: str
    ) -> TransitionScore:
        """Score compatibility between two tracks for mixing."""
        # Key compatibility
        key_compat = self._score_key_compatibility(key1, key2)

        # BPM compatibility
        bpm_compat = self._score_bpm_compatibility(bpm1, bpm2)

        # Energy compatibility
        energy1 = self._extract_energy_curve(y1)
        energy2 = self._extract_energy_curve(y2)
        energy_compat = self._score_energy_compatibility(energy1, energy2)

        # Overall weighted score
        overall = 0.4 * key_compat + 0.3 * bpm_compat + 0.3 * energy_compat

        details = {
            "key": key_compat,
            "bpm": bpm_compat,
            "energy": energy_compat
        }

        return TransitionScore(
            overall_score=float(np.clip(overall, 0, 1)),
            key_compatibility=float(key_compat),
            bpm_compatibility=float(bpm_compat),
            energy_compatibility=float(energy_compat),
            details=details
        )

    def analyze_key_transition(self, key1: str, key2: str) -> KeyTransitionPath:
        """Find optimal key transition path."""
        keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

        idx1 = keys.index(key1) if key1 in keys else 0
        idx2 = keys.index(key2) if key2 in keys else 0

        # Shortest distance (considering wrap-around)
        distance = min(abs(idx2 - idx1), 12 - abs(idx2 - idx1))

        # Difficulty classification
        if distance == 0:
            difficulty = "easy"
        elif distance in [1, 5, 7, 11]:  # Perfect fifth, fourth, minor 2nd
            difficulty = "easy"
        elif distance in [3, 9]:  # Minor/major 3rd
            difficulty = "medium"
        else:
            difficulty = "hard"

        pivot_key = None
        if distance > 5:  # Consider pivot key
            pivot_idx = (idx1 + 6) % 12
            pivot_key = keys[pivot_idx]

        return KeyTransitionPath(
            from_key=key1,
            to_key=key2,
            pivot_key=pivot_key,
            distance=distance,
            difficulty=difficulty
        )

    def analyze_bpm_transition(self, bpm1: float, bpm2: float) -> BpmTransitionFeasibility:
        """Check BPM transition feasibility (within ±8%)."""
        ratio = bpm2 / (bpm1 + 1e-6)

        # Maximum intermediate BPM
        max_intermediate = max(bpm1, bpm2) * 1.08

        # Check if within ±8% (no double-time needed)
        feasible = 0.92 <= ratio <= 1.08

        # If outside range, try double-time (ratio becomes ratio/2 or ratio*2)
        double_time_required = not feasible

        if double_time_required:
            if ratio > 1.08:
                ratio_double = ratio / 2
            else:
                ratio_double = ratio * 2

            feasible = 0.92 <= ratio_double <= 1.08

        return BpmTransitionFeasibility(
            from_bpm=bpm1,
            to_bpm=bpm2,
            bpm_ratio=float(ratio),
            max_transition_bpm=float(max_intermediate),
            feasible=feasible,
            double_time_required=double_time_required
        )

    def analyze_energy_matching(self, y1: np.ndarray, y2: np.ndarray) -> EnergyMatch:
        """Match energy curves between two tracks."""
        energy1 = self._extract_energy_curve(y1)
        energy2 = self._extract_energy_curve(y2)

        # Normalize to same length
        min_len = min(len(energy1), len(energy2))
        energy1_norm = energy1[:min_len]
        energy2_norm = energy2[:min_len]

        # Cross-correlation for best alignment
        if min_len > 1:
            correlation = np.correlate(energy1_norm - np.mean(energy1_norm),
                                      energy2_norm - np.mean(energy2_norm),
                                      mode='full')
            best_alignment_idx = np.argmax(np.abs(correlation))
            best_alignment_time = float(best_alignment_idx / self.sr)
            similarity = float(np.max(np.abs(correlation)) / (min_len + 1e-6))
        else:
            best_alignment_time = 0.0
            similarity = 0.0

        return EnergyMatch(
            from_energy_curve=energy1,
            to_energy_curve=energy2,
            curve_similarity=float(np.clip(similarity, 0, 1)),
            best_alignment_time=best_alignment_time
        )

    def analyze_bass_clash(self, y1: np.ndarray, y2: np.ndarray) -> FrequencyClash:
        """Detect bass frequency clashes."""
        # Extract bass regions
        bass1 = self._extract_bass_spectrum(y1)
        bass2 = self._extract_bass_spectrum(y2)

        # Find dominant bass frequencies
        freqs = np.fft.rfftfreq(len(bass1), 1/self.sr)
        freqs = freqs[:len(bass1)]

        # Peaks in bass spectrum
        peaks1 = self._find_spectral_peaks(bass1)
        peaks2 = self._find_spectral_peaks(bass2)

        # Frequency clash: overlapping dominant frequencies
        clash_detected = False
        clash_frequencies = []
        clash_severity = 0.0

        for f1 in peaks1:
            for f2 in peaks2:
                if abs(f1 - f2) < 20:  # Within 20 Hz
                    clash_detected = True
                    clash_frequencies.append((f1 + f2) / 2)
                    clash_severity = max(clash_severity, 0.5)

        recommendation = ""
        if clash_detected:
            if clash_severity > 0.7:
                recommendation = "Cut 2-4 dB at clash frequency in track 2"
            else:
                recommendation = "Light EQ adjustment may help"

        return FrequencyClash(
            clash_detected=clash_detected,
            clash_frequencies=clash_frequencies,
            clash_severity=float(np.clip(clash_severity, 0, 1)),
            recommendation=recommendation
        )

    def analyze_vocal_overlap(self, y1: np.ndarray, y2: np.ndarray) -> VocalOverlapPrediction:
        """Predict vocal overlap issues."""
        # Vocal detection: spectral centroid and MFCC variance
        vocal1 = self._detect_vocal_presence(y1)
        vocal2 = self._detect_vocal_presence(y2)

        # If both have vocals, predict overlap
        overlap_predicted = vocal1 and vocal2
        overlap_duration = 2.0  # Placeholder: 2 seconds

        if overlap_predicted:
            severity = "severe"
        elif vocal1 or vocal2:
            severity = "mild"
        else:
            severity = "none"

        return VocalOverlapPrediction(
            from_track_has_vocal=vocal1,
            to_track_has_vocal=vocal2,
            overlap_predicted=overlap_predicted,
            overlap_duration=overlap_duration,
            severity=severity
        )

    def analyze_drum_patterns(self, y1: np.ndarray, y2: np.ndarray) -> DrumPatternMatch:
        """Match drum patterns between tracks."""
        # Onset detection for drums
        onset_env1 = librosa.onset.onset_strength(y=y1, sr=self.sr)
        onset_env2 = librosa.onset.onset_strength(y=y2, sr=self.sr)

        # Pattern classification
        pattern1 = self._classify_drum_pattern(onset_env1)
        pattern2 = self._classify_drum_pattern(onset_env2)

        # Pattern similarity
        similarity = self._calculate_pattern_similarity(onset_env1, onset_env2)

        # Break compatibility
        is_break_compatible = self._check_break_compatibility(onset_env1, onset_env2)

        return DrumPatternMatch(
            from_drum_pattern=pattern1,
            to_drum_pattern=pattern2,
            pattern_similarity=float(similarity),
            is_break_compatible=is_break_compatible
        )

    def suggest_mix_points(self, y1: np.ndarray, y2: np.ndarray) -> MixSuggestion:
        """Suggest best mix-in/out points."""
        # Energy-based suggestion
        energy1 = self._extract_energy_curve(y1)
        energy2 = self._extract_energy_curve(y2)

        # Find energy peaks/troughs
        trough1_time = self._find_trough_time(energy1)
        peak2_time = self._find_peak_time(energy2)

        # Mix duration: typical 8-16 bars (adjust by tempo)
        suggested_duration = 8.0  # seconds placeholder

        fade_in = 2.0
        fade_out = 2.0

        confidence = 0.75

        return MixSuggestion(
            best_mix_in_point=float(trough1_time),
            best_mix_out_point=float(peak2_time),
            suggested_mix_duration=suggested_duration,
            fade_in_duration=fade_in,
            fade_out_duration=fade_out,
            confidence=confidence
        )

    # Helper methods

    def _score_key_compatibility(self, key1: str, key2: str) -> float:
        """Score key compatibility (0-1)."""
        keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

        idx1 = keys.index(key1) if key1 in keys else 0
        idx2 = keys.index(key2) if key2 in keys else 0

        distance = min(abs(idx2 - idx1), 12 - abs(idx2 - idx1))

        # Scoring: 0 distance = 1.0, 6 semitones (tritone) = 0.0
        compatibility = 1.0 - (distance / 6.0)
        return float(np.clip(compatibility, 0, 1))

    def _score_bpm_compatibility(self, bpm1: float, bpm2: float) -> float:
        """Score BPM compatibility."""
        ratio = bpm2 / (bpm1 + 1e-6)

        # Ideal ratio is 1.0 (same BPM)
        distance = abs(ratio - 1.0)

        # Allow ±8% variation
        if distance < 0.08:
            compatibility = 1.0
        else:
            # Penalize further deviation
            compatibility = max(0.0, 1.0 - distance)

        return float(compatibility)

    def _score_energy_compatibility(self, energy1: np.ndarray, energy2: np.ndarray) -> float:
        """Score energy curve compatibility."""
        if len(energy1) == 0 or len(energy2) == 0:
            return 0.5

        min_len = min(len(energy1), len(energy2))
        energy1_norm = energy1[:min_len]
        energy2_norm = energy2[:min_len]

        # Normalize to [0, 1]
        e1 = (energy1_norm - np.min(energy1_norm)) / (np.max(energy1_norm) - np.min(energy1_norm) + 1e-6)
        e2 = (energy2_norm - np.min(energy2_norm)) / (np.max(energy2_norm) - np.min(energy2_norm) + 1e-6)

        # Correlation
        correlation = np.corrcoef(e1, e2)[0, 1]
        if np.isnan(correlation):
            correlation = 0.5

        return float(np.clip((correlation + 1) / 2, 0, 1))

    def _extract_energy_curve(self, y: np.ndarray, n_frames: int = 128) -> np.ndarray:
        """Extract energy curve (RMS over time)."""
        frame_len = len(y) // n_frames
        if frame_len < 1:
            frame_len = 1

        energy = []
        for i in range(n_frames):
            segment = y[i * frame_len:(i+1) * frame_len]
            rms = np.sqrt(np.mean(segment**2))
            energy.append(rms)

        return np.array(energy)

    def _extract_bass_spectrum(self, y: np.ndarray, cutoff_hz: float = 250) -> np.ndarray:
        """Extract low-frequency spectrum (bass)."""
        S = np.abs(librosa.stft(y))
        freqs = librosa.fft_frequencies(sr=self.sr)

        bass_mask = freqs < cutoff_hz
        bass_spectrum = np.mean(S[bass_mask], axis=0)

        return bass_spectrum

    def _find_spectral_peaks(self, spectrum: np.ndarray, n_peaks: int = 3) -> List[float]:
        """Find dominant peaks in spectrum."""
        if len(spectrum) < n_peaks:
            return []

        peaks = np.argsort(spectrum)[-n_peaks:]
        return sorted(peaks.tolist())

    def _detect_vocal_presence(self, y: np.ndarray) -> bool:
        """Detect if track has vocals."""
        # MFCC-based heuristic
        mfcc = librosa.feature.mfcc(y=y, sr=self.sr, n_mfcc=13)
        mfcc_var = np.var(mfcc)

        # High MFCC variance suggests vocals
        vocal_threshold = 5.0
        return mfcc_var > vocal_threshold

    def _classify_drum_pattern(self, onset_env: np.ndarray) -> str:
        """Classify drum pattern type."""
        if len(onset_env) < 4:
            return "unknown"

        # Autocorrelation for periodicity
        autocorr = np.correlate(onset_env - np.mean(onset_env),
                               onset_env - np.mean(onset_env),
                               mode='same')

        # Peak in autocorrelation indicates pattern
        peaks = np.argsort(autocorr)[-3:]

        if len(peaks) > 1 and peaks[-1] - peaks[-2] > 100:
            return "4_on_the_floor"
        else:
            return "breakbeat"

    def _calculate_pattern_similarity(self, env1: np.ndarray, env2: np.ndarray) -> float:
        """Calculate drum pattern similarity."""
        min_len = min(len(env1), len(env2))
        if min_len < 2:
            return 0.5

        e1 = env1[:min_len]
        e2 = env2[:min_len]

        # Normalize
        e1 = (e1 - np.mean(e1)) / (np.std(e1) + 1e-6)
        e2 = (e2 - np.mean(e2)) / (np.std(e2) + 1e-6)

        # Correlation
        corr = np.corrcoef(e1, e2)[0, 1]
        if np.isnan(corr):
            corr = 0.5

        return float(np.clip((corr + 1) / 2, 0, 1))

    def _check_break_compatibility(self, env1: np.ndarray, env2: np.ndarray) -> bool:
        """Check if tracks are break-compatible."""
        # Simplified: check for similar sparsity in drum hits
        density1 = np.sum(env1 > np.mean(env1)) / len(env1) if len(env1) > 0 else 0
        density2 = np.sum(env2 > np.mean(env2)) / len(env2) if len(env2) > 0 else 0

        # Compatible if both dense or both sparse
        return abs(density1 - density2) < 0.3

    def _find_trough_time(self, energy: np.ndarray) -> float:
        """Find energy trough (quiet point)."""
        if len(energy) == 0:
            return 0.0

        trough_idx = np.argmin(energy)
        return float(trough_idx / len(energy) * (len(energy) / self.sr))

    def _find_peak_time(self, energy: np.ndarray) -> float:
        """Find energy peak (loud point)."""
        if len(energy) == 0:
            return 0.0

        peak_idx = np.argmax(energy)
        return float(peak_idx / len(energy) * (len(energy) / self.sr))
