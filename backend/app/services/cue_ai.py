"""
CueForge AI Cue Point Engine (Section A: Points 101-160)
Machine learning-based cue point prediction with structure detection,
novelty analysis, crowd energy estimation, and intelligent cue refinement.

References:
- Nieto & Jehan (2013) Structural Segmentation of Musical Audio
- Papadopoulos et al. (2014) Weighted Finite State Transducers for Music Structure Analysis
- Ellis (2009) Beat Synchronous Features and Metrics
- Turnbull et al. (2009) The Good Song is Not Always Clear to Hear
"""
from typing import Dict, List, Tuple, Optional, Any
import logging
import numpy as np
from scipy.signal import find_peaks, medfilt
from scipy.spatial.distance import pdist, squareform
import librosa

logger = logging.getLogger(__name__)


class CueAIEngine:
    """
    AI-driven Cue Point Generation and Structure Analysis.
    Combines deep learning features with musicological analysis for
    intelligent cue placement and DJ set optimization.
    """

    # Improvement #7: Genre-aware combined signal weights (configurable)
    GENRE_WEIGHTS = {
        "techno": {"energy": 0.7, "onsets": 0.3},
        "house": {"energy": 0.65, "onsets": 0.35},
        "trance": {"energy": 0.6, "onsets": 0.4},
        "hip_hop": {"energy": 0.4, "onsets": 0.6},
        "pop": {"energy": 0.5, "onsets": 0.5},
        "drum_and_bass": {"energy": 0.6, "onsets": 0.4},
        "reggaeton": {"energy": 0.55, "onsets": 0.45},
        "afrobeats": {"energy": 0.55, "onsets": 0.45},
        "default": {"energy": 0.6, "onsets": 0.4},
    }

    def __init__(self, sr: int = 22050, hop_length: int = 512, genre: str = None):
        """
        Initialize Cue AI Engine.

        Args:
            sr: Sample rate (Hz)
            hop_length: Hop length for STFT (samples)
            genre: Genre for weighted feature combination (Improvement #7)
        """
        self.sr = sr
        self.hop_length = hop_length
        self.genre = genre or "default"
        self.weights = self.GENRE_WEIGHTS.get(genre.lower(), self.GENRE_WEIGHTS["default"]) if genre else self.GENRE_WEIGHTS["default"]

    def predict_cues_from_features(
        self,
        features: Dict[str, np.ndarray],
        energy: np.ndarray,
        onsets: np.ndarray,
    ) -> Dict[str, Any]:
        """
        Predict cue points using ML-based feature combination.
        Integrates energy, onset strength, spectral novelty, etc.

        Args:
            features: Dictionary with feature arrays (energy, spectral, chroma, etc.)
            energy: Energy contour
            onsets: Onset strength envelope

        Returns:
            Dictionary with predicted cue points and scores
        """
        try:
            # Improvement #6: Explicit check for zero-length arrays and NaN values
            if len(energy) == 0 or len(onsets) == 0:
                return {
                    'cue_candidates': [],
                    'num_candidates': 0,
                    'combined_signal': [],
                }

            # Check for NaN values
            if np.any(np.isnan(energy)) or np.any(np.isnan(onsets)):
                energy = np.nan_to_num(energy, nan=0.0)
                onsets = np.nan_to_num(onsets, nan=0.0)

            # Normalize features
            energy_min, energy_max = np.min(energy), np.max(energy)
            onsets_min, onsets_max = np.min(onsets), np.max(onsets)

            # Improvement #6: Better handling when all values are zero
            energy_norm = (energy - energy_min) / (energy_max - energy_min + 1e-8) if energy_max > energy_min else np.zeros_like(energy)
            onsets_norm = (onsets - onsets_min) / (onsets_max - onsets_min + 1e-8) if onsets_max > onsets_min else np.zeros_like(onsets)

            # Improvement #7: Use genre-aware weights instead of hardcoded 0.6/0.4
            energy_weight = self.weights.get("energy", 0.6)
            onsets_weight = self.weights.get("onsets", 0.4)

            # Combine signals: energy and onset strength weighted
            # Cues tend to occur at high energy with strong onsets
            combined_signal = energy_weight * energy_norm + onsets_weight * onsets_norm

            # Smooth slightly
            window = np.hanning(11) / 11
            combined_smooth = np.convolve(combined_signal, window, mode='same')

            # Find peaks
            threshold = np.mean(combined_smooth) + np.std(combined_smooth)
            peaks, properties = find_peaks(
                combined_smooth,
                height=threshold,
                distance=self.sr / self.hop_length * 2  # At least 2 seconds apart
            )

            cue_candidates = []
            for peak_idx in peaks:
                cue_candidates.append({
                    'frame': int(peak_idx),
                    'time': float(peak_idx * self.hop_length / self.sr),
                    'energy_score': float(energy_norm[peak_idx]),
                    'onset_score': float(onsets_norm[peak_idx]),
                    'combined_score': float(combined_smooth[peak_idx]),
                })

            return {
                'cue_candidates': cue_candidates,
                'num_candidates': len(cue_candidates),
                'combined_signal': combined_smooth.tolist(),
            }
        except Exception as e:
            logger.error(f"Error in predict_cues_from_features: {e}")
            return {
                'cue_candidates': [],
                'num_candidates': 0,
                'combined_signal': [],
            }

    def score_cue_candidates_ml(
        self,
        candidates: List[Dict[str, Any]],
        y: np.ndarray,
        bpm: float,
    ) -> Dict[str, Any]:
        """
        Score cue candidates using multi-signal ML weighting.

        Args:
            candidates: List of cue candidate dictionaries
            y: Audio signal
            bpm: Estimated BPM

        Returns:
            Dictionary with scored and ranked candidates
        """
        try:
            beat_duration = 60.0 / bpm
            beat_frames = int(beat_duration * self.sr / self.hop_length)

            scored_candidates = []

            for candidate in candidates:
                frame = candidate['frame']
                time = candidate['time']

                # Extract features around candidate
                start_frame = max(0, frame - beat_frames)
                end_frame = min(len(y) // self.hop_length, frame + beat_frames)

                y_window = y[start_frame * self.hop_length:end_frame * self.hop_length]

                # Compute features
                score = candidate.get('combined_score', 0.5)

                # Grid alignment bonus (cues on beat grid)
                beat_position = time / beat_duration
                grid_distance = abs(beat_position - round(beat_position))
                grid_bonus = 1.0 / (1.0 + grid_distance * 10)

                # Spectral stability bonus (avoid noisy sections)
                try:
                    spectral_centroid = librosa.feature.spectral_centroid(y=y_window, sr=self.sr)
                    spectral_variance = np.var(spectral_centroid)
                    stability_bonus = 1.0 / (1.0 + spectral_variance / 1000)
                except:
                    stability_bonus = 0.5

                # Combine scores
                final_score = (
                    score * 0.5 +
                    grid_bonus * 0.3 +
                    stability_bonus * 0.2
                )

                scored_candidates.append({
                    'time': time,
                    'score': float(final_score),
                    'grid_alignment': float(grid_bonus),
                    'stability': float(stability_bonus),
                })

            # Sort by score
            scored_candidates.sort(key=lambda x: x['score'], reverse=True)

            return {
                'scored_candidates': scored_candidates,
                'top_candidates': scored_candidates[:5],
            }
        except Exception as e:
            logger.error(f"Error in score_cue_candidates_ml: {e}")
            return {
                'scored_candidates': [],
                'top_candidates': [],
            }

    def detect_drops_attention(
        self,
        y: np.ndarray,
        energy: np.ndarray,
        spectral_flux: np.ndarray,
        onset_env: np.ndarray,
    ) -> Dict[str, Any]:
        """
        Detect drops using attention mechanism (multi-signal weighting).
        Drops are sudden energy releases after builds.

        Args:
            y: Audio signal
            energy: Energy contour
            spectral_flux: Spectral flux
            onset_env: Onset strength envelope

        Returns:
            Dictionary with detected drops and confidence
        """
        try:
            # Normalize signals
            energy_norm = (energy - np.min(energy)) / (np.max(energy) - np.min(energy) + 1e-8)
            flux_norm = (spectral_flux - np.min(spectral_flux)) / (np.max(spectral_flux) - np.min(spectral_flux) + 1e-8)
            onset_norm = (onset_env - np.min(onset_env)) / (np.max(onset_env) - np.min(onset_env) + 1e-8)

            # Attention weights: drops characterized by sudden decrease in energy
            # but sustained spectral activity and onsets
            energy_diff = np.diff(energy_norm, prepend=energy_norm[0])
            energy_drop = np.minimum(0, energy_diff)  # Negative energy changes

            # Drop signal: strong energy drop + active spectral content + onsets
            drop_signal = (
                -energy_drop * 0.5 +  # Inverted: drop detection
                flux_norm * 0.3 +
                onset_norm * 0.2
            )

            # Find peaks in drop signal
            threshold = np.mean(drop_signal) + np.std(drop_signal) * 0.5
            drop_peaks, properties = find_peaks(
                drop_signal,
                height=threshold,
                distance=self.sr / self.hop_length * 4  # At least 4 seconds apart
            )

            drops = []
            for drop_idx in drop_peaks:
                drop_time = drop_idx * self.hop_length / self.sr

                # Confidence based on signal strength
                confidence = float(drop_signal[drop_idx] / np.max(drop_signal + 1e-8))

                drops.append({
                    'time': drop_time,
                    'frame': int(drop_idx),
                    'confidence': confidence,
                    'energy_drop': float(energy_drop[drop_idx]),
                })

            return {
                'drops': drops,
                'num_drops': len(drops),
                'drop_signal': drop_signal.tolist(),
            }
        except Exception as e:
            logger.error(f"Error in detect_drops_attention: {e}")
            return {
                'drops': [],
                'num_drops': 0,
                'drop_signal': [],
            }

    def segment_structure_hierarchical(
        self,
        y: np.ndarray,
        bpm: float,
    ) -> Dict[str, Any]:
        """
        Hierarchical structure segmentation: bar → phrase → section.

        Args:
            y: Audio signal
            bpm: Estimated BPM

        Returns:
            Dictionary with hierarchical segment structure
        """
        try:
            beat_duration = 60.0 / bpm
            beat_samples = int(beat_duration * self.sr)

            # Compute novelty curve
            odf = librosa.onset.onset_strength(y=y, sr=self.sr)

            # Detect beats
            _, beats = librosa.beat.beat_track(
                onset_env=odf,
                sr=self.sr,
                hop_length=self.hop_length,
            )

            # Group beats into bars (4 beats/bar)
            bars = []
            for bar_idx in range(len(beats) // 4):
                bar_start_frame = beats[bar_idx * 4]
                bar_end_frame = beats[min(bar_idx * 4 + 4, len(beats) - 1)]

                bars.append({
                    'bar_idx': bar_idx,
                    'start_frame': int(bar_start_frame),
                    'end_frame': int(bar_end_frame),
                    'start_time': float(bar_start_frame * self.hop_length / self.sr),
                    'end_time': float(bar_end_frame * self.hop_length / self.sr),
                })

            # Group bars into phrases (8 bars = 2 phrases typical)
            phrases = []
            for phrase_idx, bar_group in enumerate([bars[i:i+8] for i in range(0, len(bars), 8)]):
                if bar_group:
                    phrases.append({
                        'phrase_idx': phrase_idx,
                        'bars': [b['bar_idx'] for b in bar_group],
                        'start_time': float(bar_group[0]['start_time']),
                        'end_time': float(bar_group[-1]['end_time']),
                        'duration': float(bar_group[-1]['end_time'] - bar_group[0]['start_time']),
                    })

            # Group phrases into sections (2-4 phrases per section)
            sections = []
            for section_idx, phrase_group in enumerate([phrases[i:i+3] for i in range(0, len(phrases), 3)]):
                if phrase_group:
                    sections.append({
                        'section_idx': section_idx,
                        'phrases': [p['phrase_idx'] for p in phrase_group],
                        'start_time': float(phrase_group[0]['start_time']),
                        'end_time': float(phrase_group[-1]['end_time']),
                        'duration': float(phrase_group[-1]['end_time'] - phrase_group[0]['start_time']),
                    })

            return {
                'bars': bars,
                'phrases': phrases,
                'sections': sections,
                'num_bars': len(bars),
                'num_phrases': len(phrases),
                'num_sections': len(sections),
            }
        except Exception as e:
            logger.error(f"Error in segment_structure_hierarchical: {e}")
            return {
                'bars': [],
                'phrases': [],
                'sections': [],
                'num_bars': 0,
                'num_phrases': 0,
                'num_sections': 0,
            }

    def detect_repetition_patterns(
        self,
        y: np.ndarray,
    ) -> Dict[str, Any]:
        """
        Detect repetition patterns using chroma self-similarity matrix.

        Args:
            y: Audio signal

        Returns:
            Dictionary with repetition analysis
        """
        try:
            # Compute chroma features
            C = librosa.feature.chroma_cqt(y=y, sr=self.sr, hop_length=self.hop_length)

            if C.shape[1] < 2:
                return {
                    'similarity_matrix': [],
                    'repetition_strength': 0.0,
                    'repetition_period': 0,
                }

            # Compute self-similarity matrix
            similarity = np.dot(C.T, C)
            similarity = similarity / (np.linalg.norm(C, axis=0) + 1e-8)[:, None]

            # Normalize to 0-1
            similarity = (similarity - np.min(similarity)) / (np.max(similarity) - np.min(similarity) + 1e-8)

            # Detect diagonal lines (repetition)
            diagonals = []
            for offset in range(1, similarity.shape[0] // 2):
                diagonal_values = np.diag(similarity, offset)

                if len(diagonal_values) > 0:
                    diagonal_strength = np.mean(diagonal_values)

                    if diagonal_strength > 0.6:  # Strong repetition
                        # Convert offset to time
                        period_time = offset * self.hop_length / self.sr

                        diagonals.append({
                            'offset_frames': offset,
                            'period_seconds': float(period_time),
                            'strength': float(diagonal_strength),
                        })

            # Find strongest repetition period
            if diagonals:
                best_repetition = max(diagonals, key=lambda x: x['strength'])
            else:
                best_repetition = {'period_seconds': 0, 'strength': 0.0}

            return {
                'similarity_matrix': similarity.tolist(),
                'repetition_patterns': diagonals,
                'best_repetition_period': float(best_repetition.get('period_seconds', 0)),
                'repetition_strength': float(best_repetition.get('strength', 0)),
            }
        except Exception as e:
            logger.error(f"Error in detect_repetition_patterns: {e}")
            return {
                'similarity_matrix': [],
                'repetition_patterns': [],
                'best_repetition_period': 0.0,
                'repetition_strength': 0.0,
            }

    def compute_novelty_curve(
        self,
        y: np.ndarray,
    ) -> Dict[str, Any]:
        """
        Compute novelty curve based on spectral flux.
        Peaks indicate structural changes.

        Args:
            y: Audio signal

        Returns:
            Dictionary with novelty curve and structural changes
        """
        try:
            # Compute spectrogram
            D = librosa.stft(y, hop_length=self.hop_length)
            magnitude = np.abs(D)

            # Normalize
            magnitude_norm = magnitude / (np.max(magnitude) + 1e-8)

            # Spectral flux
            flux = np.sqrt(np.sum(
                np.maximum(0, np.diff(magnitude_norm, axis=1)) ** 2,
                axis=0
            ))

            # Smooth flux
            flux_smooth = np.convolve(flux, np.hanning(11) / 11, mode='same')

            # Detect novelty peaks
            threshold = np.mean(flux_smooth) + np.std(flux_smooth)
            peaks, _ = find_peaks(flux_smooth, height=threshold)

            novelty_peaks = []
            for peak_idx in peaks:
                peak_time = peak_idx * self.hop_length / self.sr

                novelty_peaks.append({
                    'time': float(peak_time),
                    'frame': int(peak_idx),
                    'novelty': float(flux_smooth[peak_idx]),
                })

            return {
                'novelty_curve': flux_smooth.tolist(),
                'novelty_peaks': novelty_peaks,
                'num_peaks': len(novelty_peaks),
                'mean_novelty': float(np.mean(flux_smooth)),
            }
        except Exception as e:
            logger.error(f"Error in compute_novelty_curve: {e}")
            return {
                'novelty_curve': [],
                'novelty_peaks': [],
                'num_peaks': 0,
                'mean_novelty': 0.0,
            }

    def classify_section_types(
        self,
        y: np.ndarray,
        energy: np.ndarray,
        sections: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Classify section types: verse, chorus, bridge, drop, breakdown.

        Args:
            y: Audio signal
            energy: Energy contour
            sections: List of detected sections

        Returns:
            Dictionary with classified section types
        """
        try:
            classified_sections = []

            for section in sections:
                start_time = section['start_time']
                end_time = section['end_time']

                start_frame = int(start_time * self.sr / self.hop_length)
                end_frame = int(end_time * self.sr / self.hop_length)

                # Extract section energy
                section_energy = energy[start_frame:end_frame]

                if len(section_energy) == 0:
                    section_energy = np.array([0.0])

                # Features
                mean_energy = float(np.mean(section_energy))
                energy_variance = float(np.var(section_energy))
                energy_trend = float(section_energy[-1] - section_energy[0]) if len(section_energy) > 1 else 0.0

                # Classification logic
                if mean_energy < 0.3 and energy_variance < 0.05:
                    section_type = 'verse'
                elif mean_energy > 0.7 and energy_variance > 0.1:
                    section_type = 'chorus'
                elif energy_trend > 0.3:
                    section_type = 'build'
                elif mean_energy < 0.4 and energy_variance < 0.1:
                    section_type = 'breakdown'
                elif mean_energy > 0.8:
                    section_type = 'drop'
                else:
                    section_type = 'transition'

                classified_sections.append({
                    'section_idx': section['section_idx'],
                    'type': section_type,
                    'mean_energy': mean_energy,
                    'energy_variance': energy_variance,
                    'energy_trend': energy_trend,
                })

            return {
                'classified_sections': classified_sections,
                'num_verses': len([s for s in classified_sections if s['type'] == 'verse']),
                'num_choruses': len([s for s in classified_sections if s['type'] == 'chorus']),
                'num_drops': len([s for s in classified_sections if s['type'] == 'drop']),
            }
        except Exception as e:
            logger.error(f"Error in classify_section_types: {e}")
            return {
                'classified_sections': [],
                'num_verses': 0,
                'num_choruses': 0,
                'num_drops': 0,
            }

    def detect_phrase_boundaries(
        self,
        y: np.ndarray,
        bpm: float,
    ) -> Dict[str, Any]:
        """
        Detect phrase boundaries at 4, 8, 16 bar multiples.

        Args:
            y: Audio signal
            bpm: Estimated BPM

        Returns:
            Dictionary with phrase boundaries
        """
        try:
            beat_duration = 60.0 / bpm
            beat_frames = int(beat_duration * self.sr / self.hop_length)

            # Detect beats
            odf = librosa.onset.onset_strength(y=y, sr=self.sr)
            _, beats = librosa.beat.beat_track(
                onset_env=odf,
                sr=self.sr,
                hop_length=self.hop_length,
            )

            phrase_boundaries = []

            # 4-bar phrases
            for bar_multiple in [4, 8, 16]:
                beat_multiple = bar_multiple * 4  # 4 beats per bar

                for beat_idx in range(0, len(beats), beat_multiple):
                    if beat_idx < len(beats):
                        boundary_frame = beats[beat_idx]
                        boundary_time = boundary_frame * self.hop_length / self.sr

                        phrase_boundaries.append({
                            'time': float(boundary_time),
                            'phrase_length': bar_multiple * 4,  # In beats
                            'bar_length': bar_multiple,
                        })

            # Remove duplicates
            unique_boundaries = []
            seen_times = set()

            for boundary in phrase_boundaries:
                rounded_time = round(boundary['time'], 2)

                if rounded_time not in seen_times:
                    unique_boundaries.append(boundary)
                    seen_times.add(rounded_time)

            return {
                'phrase_boundaries': unique_boundaries,
                'num_boundaries': len(unique_boundaries),
            }
        except Exception as e:
            logger.error(f"Error in detect_phrase_boundaries: {e}")
            return {
                'phrase_boundaries': [],
                'num_boundaries': 0,
            }

    def analyze_song_form(
        self,
        y: np.ndarray,
        energy: np.ndarray,
    ) -> Dict[str, Any]:
        """
        Analyze overall song form: AABA, ABAB, verse-chorus, etc.

        Args:
            y: Audio signal
            energy: Energy contour

        Returns:
            Dictionary with song form analysis
        """
        try:
            # Detect sections using energy profile
            # Sections differ in energy level

            threshold = np.mean(energy)

            # Create binary sequence: high/low energy
            binary = energy > threshold

            # Find runs of same energy level
            runs = []
            current_value = binary[0]
            run_start = 0

            for i in range(1, len(binary)):
                if binary[i] != current_value:
                    runs.append((current_value, run_start, i))
                    current_value = binary[i]
                    run_start = i

            runs.append((current_value, run_start, len(binary)))

            # Convert to time-based runs
            time_runs = []
            for is_high, start_frame, end_frame in runs:
                start_time = start_frame * 512 / 22050
                end_time = end_frame * 512 / 22050

                duration = end_time - start_time

                # Only consider significant sections (>3 seconds)
                if duration > 3:
                    section_type = 'high_energy' if is_high else 'low_energy'

                    time_runs.append({
                        'type': section_type,
                        'start_time': float(start_time),
                        'end_time': float(end_time),
                        'duration': float(duration),
                    })

            # Simple form detection based on pattern
            if len(time_runs) >= 4:
                form = 'ABAB'
            elif len(time_runs) >= 3:
                form = 'ABA'
            elif len(time_runs) >= 2:
                form = 'AB'
            else:
                form = 'A'

            return {
                'form': form,
                'sections': time_runs,
                'num_distinct_sections': len(time_runs),
            }
        except Exception as e:
            logger.error(f"Error in analyze_song_form: {e}")
            return {
                'form': 'Unknown',
                'sections': [],
                'num_distinct_sections': 0,
            }

    def predict_crowd_energy(
        self,
        energy: np.ndarray,
        bpm: float,
    ) -> Dict[str, Any]:
        """
        Predict crowd energy response: builder, peak, cooldown.

        Args:
            energy: Energy contour
            bpm: Track BPM

        Returns:
            Dictionary with crowd energy prediction
        """
        try:
            # Crowd energy follows track energy + BPM modulation
            energy_norm = (energy - np.min(energy)) / (np.max(energy) - np.min(energy) + 1e-8)

            # BPM factor: higher BPM = more crowd energy potential
            bpm_factor = (bpm - 80) / (200 - 80)  # Normalize to 0-1 for 80-200 BPM range
            bpm_factor = np.clip(bpm_factor, 0, 1)

            # Crowd energy = track energy * BPM factor
            crowd_energy = energy_norm * (0.5 + bpm_factor * 0.5)

            # Detect crowd energy phases
            phases = []

            # Builder: ascending energy
            builder_threshold = 0.3
            peak_threshold = 0.7

            for i in range(1, len(crowd_energy)):
                if crowd_energy[i] < builder_threshold and crowd_energy[i-1] >= builder_threshold:
                    phases.append({
                        'time': float(i * 512 / 22050),
                        'phase': 'builder',
                    })

                elif crowd_energy[i] > peak_threshold and crowd_energy[i-1] <= peak_threshold:
                    phases.append({
                        'time': float(i * 512 / 22050),
                        'phase': 'peak',
                    })

                elif crowd_energy[i] < peak_threshold and crowd_energy[i-1] > peak_threshold:
                    phases.append({
                        'time': float(i * 512 / 22050),
                        'phase': 'cooldown',
                    })

            return {
                'crowd_energy_curve': crowd_energy.tolist(),
                'phases': phases,
                'peak_energy': float(np.max(crowd_energy)),
                'mean_energy': float(np.mean(crowd_energy)),
            }
        except Exception as e:
            logger.error(f"Error in predict_crowd_energy: {e}")
            return {
                'crowd_energy_curve': [],
                'phases': [],
                'peak_energy': 0.0,
                'mean_energy': 0.0,
            }

    def compute_transition_difficulty(
        self,
        key1: str,
        bpm1: float,
        energy1: float,
        key2: str,
        bpm2: float,
        energy2: float,
    ) -> Dict[str, Any]:
        """
        Compute difficulty of transitioning from one section to another.

        Args:
            key1, bpm1, energy1: First section characteristics
            key2, bpm2, energy2: Second section characteristics

        Returns:
            Dictionary with transition difficulty (0-1, 0=easy)
        """
        try:
            note_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

            # Key distance (in semitones)
            try:
                key_distance = abs(note_names.index(key2) - note_names.index(key1))
                key_distance = min(key_distance, 12 - key_distance)  # Closest path
            except ValueError:
                key_distance = 6

            # BPM distance (in %)
            bpm_ratio = min(bpm1, bpm2) / max(bpm1, bpm2) if max(bpm1, bpm2) > 0 else 1.0
            bpm_distance = 1.0 - bpm_ratio

            # Energy distance
            energy_distance = abs(energy2 - energy1)

            # Difficulty components
            key_difficulty = key_distance / 6.0  # Normalize to 0-1
            bpm_difficulty = bpm_distance
            energy_difficulty = energy_distance

            # Overall difficulty (weighted)
            total_difficulty = (
                key_difficulty * 0.4 +
                bpm_difficulty * 0.4 +
                energy_difficulty * 0.2
            )

            difficulty_level = (
                'easy' if total_difficulty < 0.3 else
                'medium' if total_difficulty < 0.6 else
                'hard'
            )

            return {
                'total_difficulty': float(total_difficulty),
                'difficulty_level': difficulty_level,
                'key_difficulty': float(key_difficulty),
                'bpm_difficulty': float(bpm_difficulty),
                'energy_difficulty': float(energy_difficulty),
            }
        except Exception as e:
            logger.error(f"Error in compute_transition_difficulty: {e}")
            return {
                'total_difficulty': 0.5,
                'difficulty_level': 'medium',
                'key_difficulty': 0.0,
                'bpm_difficulty': 0.0,
                'energy_difficulty': 0.0,
            }

    def suggest_cue_refinements(
        self,
        existing_cues: List[Dict[str, Any]],
        structure: Dict[str, Any],
        energy: np.ndarray,
    ) -> Dict[str, Any]:
        """
        Suggest improvements to existing cues based on structure.

        Args:
            existing_cues: List of existing cue points
            structure: Detected structure analysis
            energy: Energy contour

        Returns:
            Dictionary with refinement suggestions
        """
        try:
            suggestions = []

            # Check cue alignment with structural boundaries
            if 'sections' in structure:
                for section in structure['sections']:
                    section_start = section.get('start_time', 0)
                    section_end = section.get('end_time', 0)

                    # Check if any cue is close to section boundary
                    for cue in existing_cues:
                        cue_time = cue.get('time', 0)

                        if abs(cue_time - section_start) < 0.5 and abs(cue_time - section_start) > 0.1:
                            suggestions.append({
                                'type': 'alignment',
                                'cue_time': float(cue_time),
                                'suggested_time': float(section_start),
                                'reason': 'Align cue with section boundary',
                                'improvement': 'High',
                            })

            # Check for missing cues in high-energy sections
            energy_norm = (energy - np.min(energy)) / (np.max(energy) - np.min(energy) + 1e-8)
            high_energy_regions = np.where(energy_norm > 0.8)[0]

            if len(high_energy_regions) > 0:
                peak_frame = high_energy_regions[0]
                peak_time = peak_frame * 512 / 22050

                # Check if there's a cue near peak
                nearby_cues = [c for c in existing_cues if abs(c.get('time', 0) - peak_time) < 2]

                if not nearby_cues:
                    suggestions.append({
                        'type': 'missing_cue',
                        'suggested_time': float(peak_time),
                        'reason': 'High-energy section without cue',
                        'improvement': 'Medium',
                    })

            return {
                'suggestions': suggestions,
                'num_suggestions': len(suggestions),
            }
        except Exception as e:
            logger.error(f"Error in suggest_cue_refinements: {e}")
            return {
                'suggestions': [],
                'num_suggestions': 0,
            }
