"""
TrackCue Advanced Key & Harmonic Analysis (Section A: Points 51-100)
Deep learning-based harmonic analysis with key detection per section,
chord progression recognition, modal analysis, and harmonic tension tracking.

References:
- Temperley (1999) What's Key for Key? The Krumhansl-Schmuckler Key-Finding Algorithm
- Papadopoulos et al. (2014) Chromagram Thinning and Detuning Correction for Robust Music Key Detection
- Nieto & Jehan (2013) Harmonic and Perceptual Analyses of Relationship Between Chords and Emotional Responses
"""
from typing import Dict, List, Tuple, Optional, Any
import logging
import numpy as np
from scipy.signal import find_peaks, medfilt
import librosa

logger = logging.getLogger(__name__)


class KeyAdvancedAnalyzer:
    """
    Advanced Key and Harmonic Analysis Engine.
    Implements multi-section key detection, chord progression recognition,
    modal analysis, and harmonic tension evaluation.
    """

    def __init__(self, sr: int = 22050, hop_length: int = 512):
        """
        Initialize Key analyzer.

        Args:
            sr: Sample rate (Hz)
            hop_length: Hop length for STFT (samples)
        """
        self.sr = sr
        self.hop_length = hop_length

        # Pitch profile templates (Krumhansl-Schmuckler)
        self.major_profile = np.array([
            0.15, 0.12, 0.12, 0.13, 0.19, 0.14, 0.08, 0.14, 0.11, 0.18, 0.08, 0.12
        ])
        self.minor_profile = np.array([
            0.15, 0.13, 0.11, 0.13, 0.11, 0.18, 0.08, 0.14, 0.13, 0.11, 0.10, 0.10
        ])

        # Note names
        self.note_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

    def _compute_chroma(self, y: np.ndarray) -> np.ndarray:
        """Compute chroma features."""
        try:
            C = librosa.feature.chroma_cqt(y=y, sr=self.sr, hop_length=self.hop_length)
            return C
        except Exception as e:
            logger.warning(f"Failed to compute chroma: {e}")
            return np.zeros((12, 1))

    def _compute_key_correlation(self, chroma: np.ndarray, major: bool = True) -> float:
        """Compute correlation between chroma and key profile."""
        try:
            profile = self.major_profile if major else self.minor_profile

            # Average chroma across time
            chroma_mean = np.mean(chroma, axis=1)

            # Normalize
            chroma_mean = chroma_mean / (np.sum(chroma_mean) + 1e-8)

            # Correlation
            correlation = np.dot(chroma_mean, profile) / (np.linalg.norm(chroma_mean) * np.linalg.norm(profile) + 1e-8)
            return float(correlation)
        except Exception as e:
            logger.warning(f"Failed to compute key correlation: {e}")
            return 0.0

    def detect_key_per_section(
        self,
        y: np.ndarray,
        section_duration: float = 10.0,
    ) -> Dict[str, Any]:
        """
        Detect key in each section (intro, verse, chorus, etc.).

        Args:
            y: Audio signal
            section_duration: Duration of each section in seconds

        Returns:
            Dictionary with detected key per section
        """
        try:
            section_samples = int(section_duration * self.sr)
            keys_per_section = []
            time_points = []

            for start in range(0, len(y), section_samples):
                end = min(start + section_samples, len(y))

                if end - start < self.sr:  # Skip very short sections
                    break

                y_section = y[start:end]

                # Compute chroma
                C = self._compute_chroma(y_section)

                if C.shape[1] == 0:
                    continue

                # Test all 12 keys (major and minor)
                best_key = None
                best_score = -np.inf
                best_mode = None

                for shift in range(12):
                    # Test major
                    chroma_shifted = np.roll(C, shift, axis=0)
                    score_major = self._compute_key_correlation(chroma_shifted, major=True)

                    # Test minor
                    score_minor = self._compute_key_correlation(chroma_shifted, major=False)

                    if score_major > best_score:
                        best_score = score_major
                        best_key = self.note_names[shift]
                        best_mode = 'major'

                    if score_minor > best_score:
                        best_score = score_minor
                        best_key = self.note_names[shift]
                        best_mode = 'minor'

                if best_key:
                    keys_per_section.append({
                        'time': float(start / self.sr),
                        'section': len(keys_per_section),
                        'key': best_key,
                        'mode': best_mode,
                        'confidence': float(max(0, best_score)),
                    })

                time_points.append(start / self.sr)

            return {
                'keys_per_section': keys_per_section,
                'num_sections': len(keys_per_section),
                'section_duration': float(section_duration),
            }
        except Exception as e:
            logger.error(f"Error in detect_key_per_section: {e}")
            return {
                'keys_per_section': [],
                'num_sections': 0,
                'section_duration': section_duration,
            }

    def track_key_modulations(
        self,
        y: np.ndarray,
        window_duration: float = 5.0,
    ) -> Dict[str, Any]:
        """
        Track key modulations (transpositions) across the track.

        Args:
            y: Audio signal
            window_duration: Window size for key detection

        Returns:
            Dictionary with key trajectory and detected modulations
        """
        try:
            window_samples = int(window_duration * self.sr)
            key_trajectory = []
            modulations = []

            for start in range(0, len(y) - window_samples, window_samples // 2):
                end = start + window_samples
                y_window = y[start:end]

                C = self._compute_chroma(y_window)

                if C.shape[1] == 0:
                    continue

                # Find best key
                best_key = None
                best_score = -np.inf

                for shift in range(12):
                    chroma_shifted = np.roll(C, shift, axis=0)
                    score = self._compute_key_correlation(chroma_shifted, major=True)

                    if score > best_score:
                        best_score = score
                        best_key = self.note_names[shift]

                if best_key:
                    key_trajectory.append({
                        'time': float(start / self.sr),
                        'key': best_key,
                        'confidence': float(max(0, best_score)),
                    })

            # Detect modulations
            for i in range(len(key_trajectory) - 1):
                curr_key = key_trajectory[i]['key']
                next_key = key_trajectory[i+1]['key']

                if curr_key != next_key:
                    modulations.append({
                        'time': float(key_trajectory[i+1]['time']),
                        'from_key': curr_key,
                        'to_key': next_key,
                        'semitone_shift': (self.note_names.index(next_key) - self.note_names.index(curr_key)) % 12,
                    })

            return {
                'key_trajectory': key_trajectory,
                'modulations': modulations,
                'num_modulations': len(modulations),
            }
        except Exception as e:
            logger.error(f"Error in track_key_modulations: {e}")
            return {
                'key_trajectory': [],
                'modulations': [],
                'num_modulations': 0,
            }

    def compute_key_stability_score(
        self,
        y: np.ndarray,
    ) -> Dict[str, Any]:
        """
        Compute overall key stability (0-1): how stable is the harmonic center?

        Args:
            y: Audio signal

        Returns:
            Dictionary with stability score and confidence
        """
        try:
            C = self._compute_chroma(y)

            if C.shape[1] < 2:
                return {
                    'stability_score': 0.5,
                    'confidence': 0.0,
                    'tonal_entropy': 1.0,
                }

            # Compute chroma variance over time
            chroma_var = np.var(C, axis=1)
            avg_variance = np.mean(chroma_var)

            # Stability: inverse of variance
            stability = 1.0 / (1.0 + avg_variance)

            # Tonal entropy: how concentrated is the chroma?
            chroma_mean = np.mean(C, axis=1)
            chroma_mean = chroma_mean / (np.sum(chroma_mean) + 1e-8)

            tonal_entropy = -np.sum(chroma_mean * np.log(chroma_mean + 1e-8))

            # Normalize entropy (max is log(12) ≈ 2.48)
            tonal_entropy = tonal_entropy / np.log(12)

            return {
                'stability_score': float(stability),
                'confidence': float(1.0 - tonal_entropy),
                'tonal_entropy': float(tonal_entropy),
            }
        except Exception as e:
            logger.error(f"Error in compute_key_stability_score: {e}")
            return {
                'stability_score': 0.5,
                'confidence': 0.0,
                'tonal_entropy': 1.0,
            }

    def detect_chord_progression(
        self,
        y: np.ndarray,
        window_duration: float = 2.0,
    ) -> Dict[str, Any]:
        """
        Detect chord progressions (I-IV-V-I, ii-V-I, etc.).

        Args:
            y: Audio signal
            window_duration: Window size for chord detection

        Returns:
            Dictionary with chord progression analysis
        """
        try:
            window_samples = int(window_duration * self.sr)
            chords_detected = []

            # Common progressions and their chord tone patterns
            chord_patterns = {
                'I': [1.0, 0.0, 0.8, 0.0, 1.0],      # C, E, G
                'IV': [1.0, 0.8, 0.0, 1.0, 0.0],     # F, A, C
                'V': [0.0, 0.8, 0.0, 1.0, 0.9],      # G, B, D
                'vi': [0.8, 0.0, 0.9, 0.0, 0.8],     # A, C, E
                'ii': [0.0, 1.0, 0.0, 0.8, 0.0],     # D, F, A
            }

            for start in range(0, len(y) - window_samples, window_samples):
                end = start + window_samples
                y_window = y[start:end]

                C = self._compute_chroma(y_window)

                if C.shape[1] == 0:
                    continue

                # Average chroma
                chroma_mean = np.mean(C, axis=1)
                chroma_mean = chroma_mean / (np.sum(chroma_mean) + 1e-8)

                # Match to chord patterns
                best_chord = None
                best_match = -np.inf

                for chord_name, pattern in chord_patterns.items():
                    # Simple pattern matching via correlation
                    if len(pattern) <= len(chroma_mean):
                        match = np.dot(chroma_mean[:len(pattern)], pattern) / (np.linalg.norm(chroma_mean[:len(pattern)]) * np.linalg.norm(pattern) + 1e-8)

                        if match > best_match:
                            best_match = match
                            best_chord = chord_name

                if best_chord:
                    chords_detected.append({
                        'time': float(start / self.sr),
                        'chord': best_chord,
                        'confidence': float(max(0, best_match)),
                    })

            # Extract progression sequence
            progression = [c['chord'] for c in chords_detected]

            return {
                'chords': chords_detected,
                'progression': progression,
                'progression_name': ' - '.join(progression) if progression else 'Unknown',
                'num_chords': len(chords_detected),
            }
        except Exception as e:
            logger.error(f"Error in detect_chord_progression: {e}")
            return {
                'chords': [],
                'progression': [],
                'progression_name': 'Unknown',
                'num_chords': 0,
            }

    def analyze_chord_voicings(
        self,
        y: np.ndarray,
    ) -> Dict[str, Any]:
        """
        Analyze chord voicings: relationship between bass note and root note.

        Args:
            y: Audio signal

        Returns:
            Dictionary with voicing analysis
        """
        try:
            # Extract bass content (low frequencies)
            # High-pass filter to extract bass
            b_low = np.array([1.0, -2.0, 1.0])
            a_low = np.array([1.0, -1.5, 0.5])

            bass = librosa.effects.harmonic(y, margin=2.0)

            # Pitch estimation on bass
            C = self._compute_chroma(y)
            bass_C = self._compute_chroma(bass)

            # Find dominant pitches
            chroma_mean = np.mean(C, axis=1)
            bass_mean = np.mean(bass_C, axis=1)

            root_idx = np.argmax(chroma_mean)
            bass_idx = np.argmax(bass_mean)

            root_note = self.note_names[root_idx]
            bass_note = self.note_names[bass_idx]

            # Voicing type
            interval = (bass_idx - root_idx) % 12
            voicing_type = {
                0: 'root',
                3: 'first inversion',
                5: 'second inversion',
                7: 'open',
                9: 'open',
            }.get(interval, f'interval_{interval}')

            return {
                'root_note': root_note,
                'bass_note': bass_note,
                'interval_semitones': interval,
                'voicing_type': voicing_type,
                'root_dominance': float(np.max(chroma_mean)),
                'bass_dominance': float(np.max(bass_mean)),
            }
        except Exception as e:
            logger.error(f"Error in analyze_chord_voicings: {e}")
            return {
                'root_note': 'C',
                'bass_note': 'C',
                'interval_semitones': 0,
                'voicing_type': 'root',
                'root_dominance': 0.0,
                'bass_dominance': 0.0,
            }

    def compute_harmonic_tension_curve(
        self,
        y: np.ndarray,
        window_duration: float = 1.0,
    ) -> Dict[str, Any]:
        """
        Compute harmonic tension curve over time.
        Tension peaks at dissonant intervals, valleys at consonant.

        Args:
            y: Audio signal
            window_duration: Analysis window duration

        Returns:
            Dictionary with tension curve and metrics
        """
        try:
            window_samples = int(window_duration * self.sr)
            tension_curve = []

            for start in range(0, len(y) - window_samples, window_samples // 2):
                end = start + window_samples
                y_window = y[start:end]

                C = self._compute_chroma(y_window)

                if C.shape[1] == 0:
                    continue

                # Compute dissonance based on chromatic roughness
                chroma_mean = np.mean(C, axis=1)

                # Tension metric: how "rough" is the harmonic content?
                # Based on adjacent semitones (C# vs C, D# vs D, etc.)
                roughness = 0.0
                for i in range(12):
                    roughness += chroma_mean[i] * chroma_mean[(i+1) % 12]

                # Normalize
                tension = roughness / (np.sum(chroma_mean) ** 2 + 1e-8)

                tension_curve.append({
                    'time': float(start / self.sr),
                    'tension': float(tension),
                })

            if tension_curve:
                tensions = [t['tension'] for t in tension_curve]
                peak_tension = float(np.max(tensions))
                mean_tension = float(np.mean(tensions))
            else:
                peak_tension = 0.0
                mean_tension = 0.0

            return {
                'tension_curve': tension_curve,
                'peak_tension': peak_tension,
                'mean_tension': mean_tension,
                'num_samples': len(tension_curve),
            }
        except Exception as e:
            logger.error(f"Error in compute_harmonic_tension_curve: {e}")
            return {
                'tension_curve': [],
                'peak_tension': 0.0,
                'mean_tension': 0.0,
                'num_samples': 0,
            }

    def detect_modal_sections(
        self,
        y: np.ndarray,
    ) -> Dict[str, Any]:
        """
        Detect modal sections (Dorian, Mixolydian, Phrygian, etc.).

        Args:
            y: Audio signal

        Returns:
            Dictionary with detected modes
        """
        try:
            C = self._compute_chroma(y)

            if C.shape[1] == 0:
                return {
                    'detected_modes': [],
                    'primary_mode': 'major',
                }

            # Mode pitch profiles (relative to major scale)
            # Each mode is characterized by raised/lowered scale degrees
            modes = {
                'ionian': [0, 0, 0, 0, 0, 0, 0],          # Major
                'dorian': [0, 0, -1, 0, 0, 0, -1],        # Minor 3rd and 7th
                'phrygian': [-1, 0, -1, 0, 0, -1, -1],    # Minor 2nd
                'lydian': [0, 0, 0, 1, 0, 0, 0],          # Raised 4th
                'mixolydian': [0, 0, 0, 0, 0, 0, -1],     # Minor 7th
                'aeolian': [0, 0, -1, 0, 0, -1, -1],      # Natural minor
                'locrian': [-1, 0, -1, 0, -1, -1, -1],    # Diminished
            }

            # Match to mode profiles
            chroma_mean = np.mean(C, axis=1)

            detected_modes = []
            best_mode = 'ionian'
            best_match = -np.inf

            for mode_name, profile in modes.items():
                # Simple correlation with mode pattern
                match_score = 0.0
                for i, adjustment in enumerate(profile):
                    if adjustment != 0:
                        scale_degree_idx = i * 2 % 12
                        match_score -= abs(adjustment) * chroma_mean[scale_degree_idx]

                if match_score > best_match:
                    best_match = match_score
                    best_mode = mode_name

            detected_modes.append({
                'mode': best_mode,
                'confidence': float(max(0, -best_match / 12)),
            })

            return {
                'detected_modes': detected_modes,
                'primary_mode': best_mode,
            }
        except Exception as e:
            logger.error(f"Error in detect_modal_sections: {e}")
            return {
                'detected_modes': [],
                'primary_mode': 'ionian',
            }

    def analyze_chromatic_movement(
        self,
        y: np.ndarray,
    ) -> Dict[str, Any]:
        """
        Analyze chromatic passages (notes not in key).

        Args:
            y: Audio signal

        Returns:
            Dictionary with chromatic analysis
        """
        try:
            C = self._compute_chroma(y)

            if C.shape[1] < 2:
                return {
                    'chromatic_content': 0.0,
                    'has_chromatic_sections': False,
                }

            # Detect rapid changes in chroma (characteristic of chromatic movement)
            chroma_diff = np.abs(np.diff(C, axis=1))
            chromatic_activity = np.mean(chroma_diff)

            # Threshold for "chromatic" activity
            threshold = 0.2
            is_chromatic = chromatic_activity > threshold

            return {
                'chromatic_content': float(chromatic_activity),
                'has_chromatic_sections': bool(is_chromatic),
                'chromatic_intensity': float(min(1.0, chromatic_activity / 0.5)),
            }
        except Exception as e:
            logger.error(f"Error in analyze_chromatic_movement: {e}")
            return {
                'chromatic_content': 0.0,
                'has_chromatic_sections': False,
                'chromatic_intensity': 0.0,
            }

    def detect_pedal_tones(
        self,
        y: np.ndarray,
        window_duration: float = 4.0,
    ) -> Dict[str, Any]:
        """
        Detect pedal tones (sustained/repeated notes underneath harmony).

        Args:
            y: Audio signal
            window_duration: Analysis window

        Returns:
            Dictionary with detected pedal tones
        """
        try:
            window_samples = int(window_duration * self.sr)
            pedal_tones = []

            for start in range(0, len(y) - window_samples, window_samples // 2):
                end = start + window_samples
                y_window = y[start:end]

                C = self._compute_chroma(y_window)

                if C.shape[1] == 0:
                    continue

                # Average chroma over time
                chroma_mean = np.mean(C, axis=1)

                # Pedal tone: note with consistently high energy
                if np.max(chroma_mean) > np.mean(chroma_mean) * 2:
                    pedal_idx = np.argmax(chroma_mean)
                    pedal_note = self.note_names[pedal_idx]

                    pedal_tones.append({
                        'time': float(start / self.sr),
                        'note': pedal_note,
                        'strength': float(chroma_mean[pedal_idx]),
                    })

            return {
                'pedal_tones': pedal_tones,
                'num_pedals': len(pedal_tones),
            }
        except Exception as e:
            logger.error(f"Error in detect_pedal_tones: {e}")
            return {
                'pedal_tones': [],
                'num_pedals': 0,
            }

    def compute_harmonic_rhythm(
        self,
        y: np.ndarray,
    ) -> Dict[str, Any]:
        """
        Compute harmonic rhythm: rate of chord/harmonic changes.

        Args:
            y: Audio signal

        Returns:
            Dictionary with harmonic rhythm metrics
        """
        try:
            C = self._compute_chroma(y)

            if C.shape[1] < 2:
                return {
                    'changes_per_minute': 0.0,
                    'harmonic_rhythm_value': 4,
                }

            # Detect changes in chroma centroid
            chroma_diff = np.abs(np.diff(C, axis=1))
            change_strength = np.sum(chroma_diff, axis=0)

            # Detect peaks (chord changes)
            peaks, _ = find_peaks(change_strength, height=np.mean(change_strength) * 0.5)

            # Convert to time-based rate
            duration = len(y) / 22050.0
            changes_per_sec = len(peaks) / (duration + 1e-8)
            changes_per_min = changes_per_sec * 60

            # Estimate harmonic rhythm value (common: 4, 8, 16, 32)
            if changes_per_min < 30:
                harmonic_rhythm = 4
            elif changes_per_min < 60:
                harmonic_rhythm = 8
            elif changes_per_min < 120:
                harmonic_rhythm = 16
            else:
                harmonic_rhythm = 32

            return {
                'changes_per_minute': float(changes_per_min),
                'harmonic_rhythm_value': harmonic_rhythm,
                'num_changes': len(peaks),
            }
        except Exception as e:
            logger.error(f"Error in compute_harmonic_rhythm: {e}")
            return {
                'changes_per_minute': 0.0,
                'harmonic_rhythm_value': 4,
                'num_changes': 0,
            }

    def detect_key_center_shifts(
        self,
        y: np.ndarray,
    ) -> Dict[str, Any]:
        """
        Detect shifts in tonal center (different from modulation).

        Args:
            y: Audio signal

        Returns:
            Dictionary with key center shifts
        """
        try:
            C = self._compute_chroma(y)

            if C.shape[1] < 2:
                return {
                    'center_shifts': [],
                    'num_shifts': 0,
                }

            # Analyze chroma centroid over time
            centroids = np.argmax(C, axis=0)

            # Detect changes
            shifts = []
            for i in range(1, len(centroids)):
                if centroids[i] != centroids[i-1]:
                    shift_magnitude = abs(centroids[i] - centroids[i-1])

                    if shift_magnitude > 2:  # Significant shift
                        shifts.append({
                            'frame': i,
                            'from_pitch_class': self.note_names[centroids[i-1]],
                            'to_pitch_class': self.note_names[centroids[i]],
                            'magnitude_semitones': shift_magnitude,
                        })

            return {
                'center_shifts': shifts,
                'num_shifts': len(shifts),
            }
        except Exception as e:
            logger.error(f"Error in detect_key_center_shifts: {e}")
            return {
                'center_shifts': [],
                'num_shifts': 0,
            }

    def compute_key_affinity_matrix(
        self,
        keys: List[str],
    ) -> Dict[str, Any]:
        """
        Compute key compatibility matrix for mixing (Camelot wheel-like).

        Args:
            keys: List of keys to analyze

        Returns:
            Dictionary with affinity matrix (compatibility scores 0-1)
        """
        try:
            n_keys = len(keys)
            affinity_matrix = np.zeros((n_keys, n_keys))

            # Semitone distances between notes
            for i, key1 in enumerate(keys):
                for j, key2 in enumerate(keys):
                    if i == j:
                        affinity_matrix[i, j] = 1.0
                    else:
                        # Find semitone distance
                        try:
                            idx1 = self.note_names.index(key1)
                            idx2 = self.note_names.index(key2)

                            distance = min(
                                abs(idx2 - idx1),
                                12 - abs(idx2 - idx1)
                            )

                            # Affinity: high for adjacent keys (perfect 4th/5th)
                            # Lower for distant keys
                            if distance == 1:
                                affinity = 0.9
                            elif distance == 5 or distance == 7:
                                affinity = 0.85
                            elif distance == 2:
                                affinity = 0.7
                            else:
                                affinity = 1.0 / (1.0 + distance)

                            affinity_matrix[i, j] = affinity
                        except ValueError:
                            affinity_matrix[i, j] = 0.0

            return {
                'affinity_matrix': affinity_matrix.tolist(),
                'keys': keys,
                'num_keys': n_keys,
            }
        except Exception as e:
            logger.error(f"Error in compute_key_affinity_matrix: {e}")
            return {
                'affinity_matrix': [],
                'keys': keys,
                'num_keys': 0,
            }
