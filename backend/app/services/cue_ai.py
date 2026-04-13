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
        y: np.ndarray = None,
        bpm: float = None,
    ) -> Dict[str, Any]:
        """
        Predict cue points using ML-based feature combination.
        Integrates energy, onset strength, spectral novelty, spectral contrast,
        temporal context, and multi-resolution analysis.

        Improvements:
        - Point 1: Spectral contrast added to combined signal
        - Point 2: Temporal context (consecutive peaks bonus, isolated penalty)
        - Point 3: Adaptive percentile-based thresholding (p75/p80)
        - Point 5: Multi-resolution analysis (0.5s, 1s, 2s, 4s windows)

        Args:
            features: Dictionary with feature arrays (energy, spectral, chroma, etc.)
            energy: Energy contour
            onsets: Onset strength envelope
            y: Optional audio signal for spectral features
            bpm: Optional BPM for temporal weighting

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

            # Point 1: Spectral contrast feature
            spectral_contrast_norm = np.zeros_like(energy_norm)
            if y is not None and len(y) > 0:
                try:
                    S = np.abs(librosa.stft(y, hop_length=self.hop_length))
                    sc = librosa.feature.spectral_contrast(S=S, sr=self.sr)
                    # Take mean across frequency bands
                    spectral_contrast = np.mean(sc, axis=0)
                    # Pad if necessary
                    if len(spectral_contrast) < len(energy_norm):
                        spectral_contrast = np.pad(spectral_contrast, (0, len(energy_norm) - len(spectral_contrast)), mode='edge')
                    else:
                        spectral_contrast = spectral_contrast[:len(energy_norm)]
                    sc_min, sc_max = np.min(spectral_contrast), np.max(spectral_contrast)
                    spectral_contrast_norm = (spectral_contrast - sc_min) / (sc_max - sc_min + 1e-8)
                except Exception:
                    spectral_contrast_norm = np.zeros_like(energy_norm)

            # Improvement #7: Use genre-aware weights
            energy_weight = self.weights.get("energy", 0.6)
            onsets_weight = self.weights.get("onsets", 0.4)

            # Combine signals: energy + onset strength + spectral contrast
            combined_signal = (
                energy_weight * energy_norm +
                onsets_weight * onsets_norm +
                0.2 * spectral_contrast_norm  # Point 1: Add spectral contrast
            )

            # Point 5: Multi-resolution analysis
            if bpm is not None and bpm > 0:
                beat_duration = 60.0 / bpm
                multi_res_signals = {}
                windows_ms = [500, 1000, 2000, 4000]  # 0.5s, 1s, 2s, 4s

                for window_ms in windows_ms:
                    window_frames = int(window_ms / 1000.0 * self.sr / self.hop_length)
                    if window_frames < 3:
                        window_frames = 3
                    window = np.hanning(window_frames) / window_frames
                    smoothed = np.convolve(combined_signal, window, mode='same')
                    multi_res_signals[f"res_{window_ms}ms"] = smoothed
            else:
                multi_res_signals = {}

            # Smooth slightly
            window = np.hanning(11) / 11
            combined_smooth = np.convolve(combined_signal, window, mode='same')

            # Point 3: Adaptive percentile-based threshold (p75 instead of mean+std)
            threshold_percentile = 75
            threshold = np.percentile(combined_smooth, threshold_percentile)

            peaks, properties = find_peaks(
                combined_smooth,
                height=threshold,
                distance=self.sr / self.hop_length * 2  # At least 2 seconds apart
            )

            # Point 2: Temporal context weighting
            temporal_weights = np.ones(len(peaks))
            for i in range(len(peaks)):
                # Check if consecutive peaks (bonus if close)
                if i > 0 and peaks[i] - peaks[i-1] < self.sr / self.hop_length * 4:
                    temporal_weights[i] += 0.15  # Bonus for clustering
                elif i == 0 or (i < len(peaks) - 1 and peaks[i+1] - peaks[i] > self.sr / self.hop_length * 8):
                    temporal_weights[i] -= 0.1  # Penalty for isolated peaks

            cue_candidates = []
            for idx, peak_idx in enumerate(peaks):
                temporal_weight = temporal_weights[idx]
                combined_score = combined_smooth[peak_idx] * temporal_weight

                cue_candidates.append({
                    'frame': int(peak_idx),
                    'time': float(peak_idx * self.hop_length / self.sr),
                    'energy_score': float(energy_norm[peak_idx]),
                    'onset_score': float(onsets_norm[peak_idx]),
                    'spectral_contrast': float(spectral_contrast_norm[peak_idx]),
                    'combined_score': float(combined_score),
                    'temporal_weight': float(temporal_weight),
                })

            return {
                'cue_candidates': cue_candidates,
                'num_candidates': len(cue_candidates),
                'combined_signal': combined_smooth.tolist(),
                'multi_resolution_signals': {k: v.tolist() for k, v in multi_res_signals.items()},
                'threshold_percentile': threshold_percentile,
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
        bpm: float = None,
    ) -> Dict[str, Any]:
        """
        Detect drops using attention mechanism (multi-signal weighting).
        Drops are sudden energy releases after builds, with spectral weighting
        prioritizing bass frequencies.

        Improvements:
        - Point 4: Bass frequency weighting for drop detection
        - Point 5: Multi-resolution window sizing based on BPM

        Args:
            y: Audio signal
            energy: Energy contour
            spectral_flux: Spectral flux
            onset_env: Onset strength envelope
            bpm: Optional BPM for adaptive window sizing

        Returns:
            Dictionary with detected drops and confidence
        """
        try:
            # Normalize signals
            energy_norm = (energy - np.min(energy)) / (np.max(energy) - np.min(energy) + 1e-8)
            flux_norm = (spectral_flux - np.min(spectral_flux)) / (np.max(spectral_flux) - np.min(spectral_flux) + 1e-8)
            onset_norm = (onset_env - np.min(onset_env)) / (np.max(onset_env) - np.min(onset_env) + 1e-8)

            # Point 4: Bass-focused spectral weighting
            bass_weight = np.ones_like(flux_norm)
            if y is not None and len(y) > 0:
                try:
                    # Compute bass-focused spectral flux (< 200 Hz)
                    S = np.abs(librosa.stft(y, hop_length=self.hop_length))
                    freqs = librosa.fft_frequencies(sr=self.sr)
                    bass_mask = freqs < 200
                    S_bass = S[bass_mask, :]
                    bass_flux = np.sqrt(np.sum(
                        np.maximum(0, np.diff(S_bass, axis=1)) ** 2,
                        axis=0
                    ))
                    # Pad to match length
                    if len(bass_flux) < len(flux_norm):
                        bass_flux = np.pad(bass_flux, (0, len(flux_norm) - len(bass_flux)), mode='edge')
                    else:
                        bass_flux = bass_flux[:len(flux_norm)]
                    bf_min, bf_max = np.min(bass_flux), np.max(bass_flux)
                    bass_weight = (bass_flux - bf_min) / (bf_max - bf_min + 1e-8)
                except Exception:
                    bass_weight = np.ones_like(flux_norm)

            # Attention weights: drops characterized by sudden decrease in energy
            # but sustained spectral activity and onsets
            energy_diff = np.diff(energy_norm, prepend=energy_norm[0])
            energy_drop = np.minimum(0, energy_diff)  # Negative energy changes

            # Drop signal: strong energy drop + active spectral content + bass emphasis
            drop_signal = (
                -energy_drop * 0.5 +  # Inverted: drop detection
                flux_norm * 0.25 +
                bass_weight * 0.35 +  # Point 4: Bass emphasis
                onset_norm * 0.15
            )

            # Adaptive smoothing based on BPM
            if bpm is not None and bpm > 0:
                beat_duration = 60.0 / bpm
                window_frames = int(beat_duration * self.sr / self.hop_length)
                window_frames = max(3, min(window_frames, 21))  # Clamp to reasonable range
            else:
                window_frames = 11

            window = np.hanning(window_frames) / window_frames
            drop_signal_smooth = np.convolve(drop_signal, window, mode='same')

            # Find peaks in drop signal
            threshold = np.percentile(drop_signal_smooth, 70)  # Percentile-based threshold
            drop_peaks, properties = find_peaks(
                drop_signal_smooth,
                height=threshold,
                distance=self.sr / self.hop_length * 4  # At least 4 seconds apart
            )

            drops = []
            for drop_idx in drop_peaks:
                drop_time = drop_idx * self.hop_length / self.sr

                # Confidence based on signal strength
                confidence = float(drop_signal_smooth[drop_idx] / np.max(drop_signal_smooth + 1e-8))

                drops.append({
                    'time': drop_time,
                    'frame': int(drop_idx),
                    'confidence': confidence,
                    'energy_drop': float(energy_drop[drop_idx]),
                    'bass_presence': float(bass_weight[drop_idx]) if 'bass_weight' in locals() else 0.5,
                })

            return {
                'drops': drops,
                'num_drops': len(drops),
                'drop_signal': drop_signal_smooth.tolist(),
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
        energy: np.ndarray = None,
    ) -> Dict[str, Any]:
        """
        Hierarchical structure segmentation: bar → phrase → section with validation.
        Implements musical form priors and phrase coherence validation.

        Improvements:
        - Point 11: Validate beat count before grouping
        - Point 12: Apply musical form priors (AABA, ABAB, ABABCB)
        - Point 13: Phrase coherence validation based on energy consistency
        - Point 14: Section boundary confidence scoring
        - Point 15: Handle edge case for < 8 bars gracefully

        Args:
            y: Audio signal
            bpm: Estimated BPM
            energy: Optional energy contour for coherence validation

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

            # Point 11: Validate beat count
            if len(beats) < 4:
                return {
                    'bars': [],
                    'phrases': [],
                    'sections': [],
                    'num_bars': 0,
                    'num_phrases': 0,
                    'num_sections': 0,
                    'error': 'Insufficient beats detected',
                }

            # Group beats into bars (4 beats/bar)
            bars = []
            for bar_idx in range(len(beats) // 4):
                bar_start_frame = beats[bar_idx * 4]
                bar_end_frame = beats[min(bar_idx * 4 + 4, len(beats) - 1)]

                bar_data = {
                    'bar_idx': bar_idx,
                    'start_frame': int(bar_start_frame),
                    'end_frame': int(bar_end_frame),
                    'start_time': float(bar_start_frame * self.hop_length / self.sr),
                    'end_time': float(bar_end_frame * self.hop_length / self.sr),
                }

                # Point 13: Compute bar energy for coherence validation
                if energy is not None:
                    start_idx = int(bar_data['start_time'] * self.sr / self.hop_length)
                    end_idx = int(bar_data['end_time'] * self.sr / self.hop_length)
                    if 0 <= start_idx < len(energy) and 0 <= end_idx <= len(energy):
                        bar_energy = np.mean(energy[start_idx:end_idx])
                        bar_data['mean_energy'] = float(bar_energy)

                bars.append(bar_data)

            # Point 15: Handle edge case for < 8 bars
            min_phrase_bars = min(8, max(2, len(bars) // 4))

            # Group bars into phrases
            phrases = []
            for phrase_idx, bar_group in enumerate([bars[i:i+min_phrase_bars] for i in range(0, len(bars), min_phrase_bars)]):
                if bar_group:
                    phrase_data = {
                        'phrase_idx': phrase_idx,
                        'bars': [b['bar_idx'] for b in bar_group],
                        'start_time': float(bar_group[0]['start_time']),
                        'end_time': float(bar_group[-1]['end_time']),
                        'duration': float(bar_group[-1]['end_time'] - bar_group[0]['start_time']),
                    }

                    # Point 13: Phrase coherence validation
                    if energy is not None and all('mean_energy' in b for b in bar_group):
                        energies = [b['mean_energy'] for b in bar_group]
                        coherence = 1.0 - (np.std(energies) / (np.mean(energies) + 1e-8))
                        phrase_data['coherence'] = float(np.clip(coherence, 0, 1))

                    phrases.append(phrase_data)

            # Point 12: Group phrases into sections with form priors
            sections = []
            phrase_groups = [phrases[i:i+3] for i in range(0, len(phrases), 3)]

            for section_idx, phrase_group in enumerate(phrase_groups):
                if phrase_group:
                    section_data = {
                        'section_idx': section_idx,
                        'phrases': [p['phrase_idx'] for p in phrase_group],
                        'start_time': float(phrase_group[0]['start_time']),
                        'end_time': float(phrase_group[-1]['end_time']),
                        'duration': float(phrase_group[-1]['end_time'] - phrase_group[0]['start_time']),
                    }

                    # Point 14: Section boundary confidence scoring
                    if energy is not None:
                        # Detect energy change at boundary
                        boundary_frame = int(section_data['start_time'] * self.sr / self.hop_length)
                        if boundary_frame > 0 and boundary_frame < len(energy) - 1:
                            boundary_change = abs(energy[boundary_frame] - energy[boundary_frame - 1])
                            section_data['boundary_confidence'] = float(np.clip(boundary_change, 0, 1))

                    sections.append(section_data)

            # Infer likely form pattern
            num_sections = len(sections)
            if num_sections >= 4:
                inferred_form = 'ABABCB' if num_sections >= 6 else 'ABAB'
            elif num_sections == 3:
                inferred_form = 'ABA'
            elif num_sections == 2:
                inferred_form = 'AB'
            else:
                inferred_form = 'A'

            return {
                'bars': bars,
                'phrases': phrases,
                'sections': sections,
                'num_bars': len(bars),
                'num_phrases': len(phrases),
                'num_sections': len(sections),
                'inferred_form': inferred_form,  # Point 12
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
        bpm: float = None,
    ) -> Dict[str, Any]:
        """
        Detect repetition patterns using cosine similarity and multi-scale analysis.
        Validates against beat grid alignment.

        Improvements:
        - Point 16: Cosine similarity instead of dot product
        - Point 17: Multi-scale repetition (4-bar, 8-bar, 16-bar, 32-bar)
        - Point 18: Validate against beat grid alignment
        - Point 19: Repetition confidence scoring

        Args:
            y: Audio signal
            bpm: Optional BPM for beat grid alignment

        Returns:
            Dictionary with repetition analysis
        """
        try:
            # Compute chroma features
            C = librosa.feature.chroma_cqt(y=y, sr=self.sr, hop_length=self.hop_length)

            if C.shape[1] < 2:
                return {
                    'similarity_matrix': [],
                    'repetition_patterns': [],
                    'repetition_strength': 0.0,
                }

            # Point 16: Cosine similarity instead of dot product
            # Normalize features
            C_norm = C / (np.linalg.norm(C, axis=0) + 1e-8)
            # Compute cosine similarity
            similarity = np.dot(C_norm.T, C_norm)

            # Normalize to 0-1
            similarity = (similarity - np.min(similarity)) / (np.max(similarity) - np.min(similarity) + 1e-8)

            # Point 17: Multi-scale repetition detection
            # Bar lengths at different scales
            bar_scales = [4, 8, 16, 32]  # 4-bar, 8-bar, 16-bar, 32-bar
            if bpm is not None and bpm > 0:
                beat_duration = 60.0 / bpm
                bar_duration = 4 * beat_duration
                beat_frames = int(beat_duration * self.sr / self.hop_length)
                bar_frames = int(bar_duration * self.sr / self.hop_length)
            else:
                bar_frames = 32  # Default ~4 seconds at 22050 Hz

            diagonals = []
            for bar_scale in bar_scales:
                scale_frames = bar_frames * bar_scale

                for offset in range(scale_frames, min(similarity.shape[0] // 2, similarity.shape[0] - scale_frames)):
                    if offset % scale_frames == 0:  # Only check bar-aligned offsets
                        diagonal_values = np.diag(similarity, offset)

                        if len(diagonal_values) > 10:  # Need enough samples
                            diagonal_strength = np.mean(diagonal_values)

                            if diagonal_strength > 0.5:
                                period_time = offset * self.hop_length / self.sr

                                # Point 18: Validate beat grid alignment
                                if bpm is not None and bpm > 0:
                                    beat_frames = int(60.0 / bpm * self.sr / self.hop_length)
                                    grid_alignment = (offset % beat_frames) / beat_frames
                                    grid_alignment = min(grid_alignment, 1.0 - grid_alignment)  # Distance to nearest grid
                                else:
                                    grid_alignment = 0.5

                                # Point 19: Confidence scoring
                                confidence = diagonal_strength * (1.0 - grid_alignment * 0.5)

                                diagonals.append({
                                    'offset_frames': offset,
                                    'period_seconds': float(period_time),
                                    'bar_scale': bar_scale,
                                    'strength': float(diagonal_strength),
                                    'grid_alignment': float(grid_alignment),
                                    'confidence': float(confidence),
                                })

            # Find strongest repetition period
            if diagonals:
                best_repetition = max(diagonals, key=lambda x: x['confidence'])
            else:
                best_repetition = {'period_seconds': 0, 'strength': 0.0, 'confidence': 0.0}

            # Remove very similar patterns
            unique_patterns = []
            for pattern in sorted(diagonals, key=lambda x: x['confidence'], reverse=True):
                is_duplicate = False
                for existing in unique_patterns:
                    if abs(pattern['period_seconds'] - existing['period_seconds']) < 1.0:
                        is_duplicate = True
                        break
                if not is_duplicate:
                    unique_patterns.append(pattern)

            return {
                'similarity_matrix': similarity.tolist() if len(similarity) < 500 else 'large_matrix',
                'repetition_patterns': unique_patterns[:10],  # Top 10 patterns
                'best_repetition_period': float(best_repetition.get('period_seconds', 0)),
                'repetition_strength': float(best_repetition.get('strength', 0)),
                'repetition_confidence': float(best_repetition.get('confidence', 0)),  # Point 19
            }
        except Exception as e:
            logger.error(f"Error in detect_repetition_patterns: {e}")
            return {
                'similarity_matrix': [],
                'repetition_patterns': [],
                'repetition_strength': 0.0,
                'repetition_confidence': 0.0,
            }

    def compute_novelty_curve(
        self,
        y: np.ndarray,
        bpm: float = None,
    ) -> Dict[str, Any]:
        """
        Compute novelty curve with multi-scale analysis and log-magnitude spectrum.
        Peaks indicate structural changes.

        Improvements:
        - Point 6: L1 norm instead of L2 for spectral flux (robust to outliers)
        - Point 7: Adaptive smoothing window based on BPM
        - Point 8: Multi-scale novelty (short-term 4 beats vs long-term 16 beats)
        - Point 9: Bass-focused novelty (< 200 Hz changes prioritized)
        - Point 10: Log-magnitude spectrum before computing flux

        Args:
            y: Audio signal
            bpm: Optional BPM for adaptive window sizing

        Returns:
            Dictionary with novelty curve and structural changes
        """
        try:
            # Compute spectrogram
            D = librosa.stft(y, hop_length=self.hop_length)
            magnitude = np.abs(D)

            # Point 10: Log-magnitude spectrum (compress dynamic range)
            magnitude_log = np.log1p(magnitude)
            magnitude_norm = magnitude_log / (np.max(magnitude_log) + 1e-8)

            # Point 6: L1 norm instead of L2 (more robust to outliers)
            flux = np.sum(
                np.abs(np.diff(magnitude_norm, axis=1)),
                axis=0
            )

            # Point 7: Adaptive smoothing window based on BPM
            if bpm is not None and bpm > 0:
                # Window = 1 bar duration
                bar_duration = 4 * 60.0 / bpm
                window_frames = int(bar_duration * self.sr / (self.hop_length * 1024))  # Normalize to hop_length
                window_frames = max(3, min(window_frames, 41))  # Clamp to reasonable range
            else:
                window_frames = 11

            window = np.hanning(window_frames) / window_frames
            flux_smooth = np.convolve(flux, window, mode='same')

            # Point 8: Multi-scale novelty analysis
            # Short-term: 4 beats
            beat_duration = 60.0 / bpm if bpm and bpm > 0 else 0.5
            short_window_frames = max(3, int(4 * beat_duration * self.sr / (self.hop_length * 1024)))
            short_window = np.hanning(min(short_window_frames, 21)) / min(short_window_frames, 21)
            flux_short = np.convolve(flux, short_window, mode='same')

            # Long-term: 16 beats
            long_window_frames = max(3, int(16 * beat_duration * self.sr / (self.hop_length * 1024)))
            long_window = np.hanning(min(long_window_frames, 61)) / min(long_window_frames, 61)
            flux_long = np.convolve(flux, long_window, mode='same')

            # Point 9: Bass-focused novelty
            bass_novelty = np.ones_like(flux_smooth)
            try:
                freqs = librosa.fft_frequencies(sr=self.sr)
                bass_mask = freqs < 200
                magnitude_bass = magnitude_log[bass_mask, :]
                bass_flux = np.sum(np.abs(np.diff(magnitude_bass, axis=1)), axis=0)
                if len(bass_flux) < len(flux_smooth):
                    bass_flux = np.pad(bass_flux, (0, len(flux_smooth) - len(bass_flux)), mode='edge')
                else:
                    bass_flux = bass_flux[:len(flux_smooth)]
                bass_novelty = bass_flux / (np.max(bass_flux) + 1e-8)
            except Exception:
                bass_novelty = np.ones_like(flux_smooth)

            # Detect novelty peaks
            threshold = np.percentile(flux_smooth, 75)
            peaks, _ = find_peaks(flux_smooth, height=threshold)

            novelty_peaks = []
            for peak_idx in peaks:
                peak_time = peak_idx * self.hop_length / self.sr

                novelty_peaks.append({
                    'time': float(peak_time),
                    'frame': int(peak_idx),
                    'novelty': float(flux_smooth[peak_idx]),
                    'short_term': float(flux_short[peak_idx]) if peak_idx < len(flux_short) else 0.0,
                    'long_term': float(flux_long[peak_idx]) if peak_idx < len(flux_long) else 0.0,
                    'bass_novelty': float(bass_novelty[peak_idx]),
                })

            return {
                'novelty_curve': flux_smooth.tolist(),
                'novelty_short_term': flux_short.tolist(),
                'novelty_long_term': flux_long.tolist(),
                'novelty_bass': bass_novelty.tolist(),
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
        genre: str = None,
    ) -> Dict[str, Any]:
        """
        Classify section types with spectral and onset features plus genre-dependent thresholds.

        Improvements:
        - Point 20: Normalize energy per-track before classification
        - Point 21: Add spectral centroid feature (verse=lower, chorus=higher)
        - Point 22: Add onset density feature (drops have higher onset density)
        - Point 23: Classification confidence scores
        - Point 24: Added pre-chorus and bridge types
        - Point 25: Genre-dependent thresholds

        Args:
            y: Audio signal
            energy: Energy contour
            sections: List of detected sections
            genre: Optional genre for threshold tuning

        Returns:
            Dictionary with classified section types and confidence scores
        """
        try:
            # Point 20: Normalize energy per-track
            energy_norm = (energy - np.min(energy)) / (np.max(energy) - np.min(energy) + 1e-8)

            # Genre-dependent thresholds
            genre = genre or self.genre
            genre_thresholds = {
                'techno': {'verse': 0.4, 'chorus': 0.75, 'drop': 0.85},
                'house': {'verse': 0.35, 'chorus': 0.7, 'drop': 0.8},
                'trance': {'verse': 0.3, 'chorus': 0.65, 'drop': 0.8},
                'hip_hop': {'verse': 0.45, 'chorus': 0.65, 'drop': 0.75},
                'pop': {'verse': 0.3, 'chorus': 0.6, 'drop': 0.75},
                'default': {'verse': 0.35, 'chorus': 0.65, 'drop': 0.8},
            }
            thresholds = genre_thresholds.get(genre.lower(), genre_thresholds['default'])

            classified_sections = []

            for section in sections:
                start_time = section['start_time']
                end_time = section['end_time']

                start_frame = int(start_time * self.sr / self.hop_length)
                end_frame = int(end_time * self.sr / self.hop_length)

                # Extract section energy (normalized)
                section_energy = energy_norm[start_frame:end_frame]

                if len(section_energy) == 0:
                    section_energy = np.array([0.0])

                # Features
                mean_energy = float(np.mean(section_energy))
                energy_variance = float(np.var(section_energy))
                energy_trend = float(section_energy[-1] - section_energy[0]) if len(section_energy) > 1 else 0.0

                # Point 21: Spectral centroid feature
                spectral_centroid = 0.5
                try:
                    y_section = y[start_frame * self.hop_length:end_frame * self.hop_length]
                    if len(y_section) > 0:
                        sc = librosa.feature.spectral_centroid(y=y_section, sr=self.sr)
                        spectral_centroid = float(np.mean(sc) / (self.sr / 2))  # Normalize to 0-1
                except Exception:
                    spectral_centroid = 0.5

                # Point 22: Onset density feature
                onset_density = 0.5
                try:
                    y_section = y[start_frame * self.hop_length:end_frame * self.hop_length]
                    if len(y_section) > 0:
                        odf = librosa.onset.onset_strength(y=y_section, sr=self.sr)
                        onset_density = float(np.mean(odf))
                except Exception:
                    onset_density = 0.5

                # Point 23 & 24: Classification with confidence scoring
                section_type = 'transition'
                confidence = 0.3

                # Classification logic with genre-aware thresholds
                if mean_energy < thresholds['verse'] and energy_variance < 0.05:
                    section_type = 'verse'
                    confidence = 1.0 - abs(mean_energy - thresholds['verse'] * 0.5) / (thresholds['verse'] * 0.5 + 1e-8)
                elif mean_energy > thresholds['drop'] and onset_density > 0.6:
                    section_type = 'drop'
                    confidence = min(mean_energy / thresholds['drop'], 1.0)
                elif energy_trend > 0.25:
                    if energy_trend > 0.4:
                        section_type = 'build'
                    else:
                        section_type = 'pre-chorus'
                    confidence = min(abs(energy_trend) / 0.5, 1.0)
                elif mean_energy > thresholds['chorus'] and spectral_centroid > 0.55:
                    section_type = 'chorus'
                    confidence = min(mean_energy / thresholds['chorus'], 1.0)
                elif mean_energy < thresholds['verse'] + 0.1 and energy_variance < 0.08:
                    section_type = 'breakdown'
                    confidence = 1.0 - abs(mean_energy - thresholds['verse']) / (thresholds['verse'] + 1e-8)
                elif spectral_centroid < 0.4 and mean_energy > thresholds['verse']:
                    section_type = 'bridge'
                    confidence = 0.6 - (0.6 - spectral_centroid)
                else:
                    confidence = 0.4

                classified_sections.append({
                    'section_idx': section['section_idx'],
                    'type': section_type,
                    'confidence': float(np.clip(confidence, 0, 1)),  # Point 23
                    'mean_energy': mean_energy,
                    'energy_variance': energy_variance,
                    'energy_trend': energy_trend,
                    'spectral_centroid': float(spectral_centroid),  # Point 21
                    'onset_density': float(onset_density),  # Point 22
                })

            return {
                'classified_sections': classified_sections,
                'num_verses': len([s for s in classified_sections if s['type'] == 'verse']),
                'num_choruses': len([s for s in classified_sections if s['type'] == 'chorus']),
                'num_drops': len([s for s in classified_sections if s['type'] == 'drop']),
                'num_builds': len([s for s in classified_sections if s['type'] == 'build']),
                'num_breakdowns': len([s for s in classified_sections if s['type'] == 'breakdown']),
                'num_bridges': len([s for s in classified_sections if s['type'] == 'bridge']),
                'num_pre_choruses': len([s for s in classified_sections if s['type'] == 'pre-chorus']),
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
        genre: str = None,
    ) -> Dict[str, Any]:
        """
        Predict crowd energy response with nonlinear BPM scaling and hysteresis phase detection.

        Improvements:
        - Point 26: Nonlinear (logarithmic) BPM scaling instead of linear
        - Point 27: Hysteresis for phase detection (prevent jitter at boundaries)
        - Point 28: Require minimum phase duration (2 bars)
        - Point 29: Genre-aware crowd energy models

        Args:
            energy: Energy contour
            bpm: Track BPM
            genre: Optional genre for energy modeling

        Returns:
            Dictionary with crowd energy prediction and phase timing
        """
        try:
            # Crowd energy follows track energy + BPM modulation
            energy_norm = (energy - np.min(energy)) / (np.max(energy) - np.min(energy) + 1e-8)

            # Point 26: Nonlinear (logarithmic) BPM scaling
            bpm_factor = np.log1p(bpm - 80) / np.log1p(200 - 80)  # Log scale instead of linear
            bpm_factor = np.clip(bpm_factor, 0, 1)

            # Point 29: Genre-aware crowd energy models
            genre = genre or 'default'
            genre_models = {
                'techno': {'energy_weight': 0.7, 'bpm_weight': 0.3},
                'house': {'energy_weight': 0.65, 'bpm_weight': 0.35},
                'trance': {'energy_weight': 0.6, 'bpm_weight': 0.4},
                'hip_hop': {'energy_weight': 0.5, 'bpm_weight': 0.5},
                'pop': {'energy_weight': 0.6, 'bpm_weight': 0.4},
                'default': {'energy_weight': 0.6, 'bpm_weight': 0.4},
            }
            model = genre_models.get(genre.lower(), genre_models['default'])

            # Crowd energy = track energy * BPM factor (genre-weighted)
            crowd_energy = (
                model['energy_weight'] * energy_norm +
                model['bpm_weight'] * bpm_factor
            )

            # Point 28: Calculate bar duration for minimum phase duration
            bar_duration = 4 * 60.0 / bpm
            bar_frames = int(bar_duration * self.sr / self.hop_length)
            min_phase_frames = 2 * bar_frames  # Minimum 2 bars

            # Point 27: Hysteresis for phase detection (prevent jitter)
            builder_threshold = 0.3
            builder_hysteresis = 0.05
            peak_threshold = 0.7
            peak_hysteresis = 0.1

            phases = []
            phase_start = None
            current_phase = None
            phase_frames = 0

            for i in range(1, len(crowd_energy)):
                prev_energy = crowd_energy[i-1]
                curr_energy = crowd_energy[i]

                # State machine with hysteresis
                if current_phase is None:
                    # Entering builder phase
                    if curr_energy > builder_threshold + builder_hysteresis:
                        current_phase = 'builder'
                        phase_start = i
                        phase_frames = 1
                elif current_phase == 'builder':
                    phase_frames += 1
                    # Transition to peak
                    if curr_energy > peak_threshold + peak_hysteresis:
                        # Only record if phase duration sufficient
                        if phase_frames >= min_phase_frames:
                            phases.append({
                                'time': float(phase_start * self.hop_length / self.sr),
                                'phase': 'builder',
                                'duration': float(phase_frames * self.hop_length / self.sr),
                            })
                        current_phase = 'peak'
                        phase_start = i
                        phase_frames = 1
                    # Return to idle
                    elif curr_energy < builder_threshold - builder_hysteresis:
                        if phase_frames >= min_phase_frames:
                            phases.append({
                                'time': float(phase_start * self.hop_length / self.sr),
                                'phase': 'builder',
                                'duration': float(phase_frames * self.hop_length / self.sr),
                            })
                        current_phase = None
                        phase_start = None
                elif current_phase == 'peak':
                    phase_frames += 1
                    # Transition to cooldown
                    if curr_energy < peak_threshold - peak_hysteresis:
                        if phase_frames >= min_phase_frames:
                            phases.append({
                                'time': float(phase_start * self.hop_length / self.sr),
                                'phase': 'peak',
                                'duration': float(phase_frames * self.hop_length / self.sr),
                            })
                        current_phase = 'cooldown'
                        phase_start = i
                        phase_frames = 1

            # Close final phase if duration sufficient
            if current_phase is not None and phase_frames >= min_phase_frames:
                phases.append({
                    'time': float(phase_start * self.hop_length / self.sr),
                    'phase': current_phase,
                    'duration': float(phase_frames * self.hop_length / self.sr),
                })

            return {
                'crowd_energy_curve': crowd_energy.tolist(),
                'phases': phases,
                'peak_energy': float(np.max(crowd_energy)),
                'mean_energy': float(np.mean(crowd_energy)),
                'genre_model': model,  # Point 29
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
        spectral_overlap: float = None,
        dj_style: str = 'balanced',
    ) -> Dict[str, Any]:
        """
        Compute difficulty of transitioning between tracks with advanced metrics.

        Improvements:
        - Point 30: Half-time/double-time BPM matching
        - Point 31: Spectral overlap scoring
        - Point 32: Key relationship scoring (Camelot wheel)
        - Point 33: Configurable weights per DJ style

        Args:
            key1, bpm1, energy1: First track characteristics
            key2, bpm2, energy2: Second track characteristics
            spectral_overlap: Optional pre-computed spectral similarity (0-1)
            dj_style: DJ preference style (balanced, technical, energetic)

        Returns:
            Dictionary with transition difficulty and component breakdown
        """
        try:
            note_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

            # Point 32: Camelot wheel distance (improved key relationship)
            camelot_wheel = {
                'C': 8, 'G': 9, 'D': 10, 'A': 11, 'E': 12,
                'B': 1, 'F#': 2, 'C#': 3, 'G#': 4, 'D#': 5,
                'A#': 6, 'F': 7,
            }

            try:
                camelot1 = camelot_wheel.get(key1, 0)
                camelot2 = camelot_wheel.get(key2, 0)
                # Distance on Camelot wheel (0-6 is optimal)
                key_distance = min(abs(camelot2 - camelot1), 12 - abs(camelot2 - camelot1))
                key_difficulty = key_distance / 6.0
            except (ValueError, AttributeError):
                key_difficulty = 0.5

            # Point 30: Half-time/double-time BPM matching
            bpm_ratio = bpm2 / bpm1 if bpm1 > 0 else 1.0

            # Check for harmonic multiples
            is_half_time = 0.45 < bpm_ratio < 0.55
            is_double_time = 1.95 < bpm_ratio < 2.05

            if is_half_time or is_double_time:
                bpm_difficulty = 0.05  # Very easy
            else:
                # Standard BPM distance
                bpm_min = min(bpm1, bpm2)
                bpm_max = max(bpm1, bpm2)
                bpm_distance = (bpm_max - bpm_min) / bpm_min if bpm_min > 0 else 1.0
                bpm_difficulty = min(bpm_distance, 1.0)

            # Energy distance
            energy_distance = abs(energy2 - energy1)
            energy_difficulty = energy_distance

            # Point 31: Spectral overlap scoring
            spectral_difficulty = 0.3  # Default neutral
            if spectral_overlap is not None:
                spectral_difficulty = 1.0 - spectral_overlap  # Higher overlap = easier

            # Point 33: DJ style-dependent weights
            style_weights = {
                'balanced': {
                    'key': 0.3,
                    'bpm': 0.35,
                    'energy': 0.2,
                    'spectral': 0.15,
                },
                'technical': {
                    'key': 0.45,
                    'bpm': 0.3,
                    'energy': 0.15,
                    'spectral': 0.1,
                },
                'energetic': {
                    'key': 0.2,
                    'bpm': 0.3,
                    'energy': 0.35,
                    'spectral': 0.15,
                },
            }
            weights = style_weights.get(dj_style, style_weights['balanced'])

            # Overall difficulty (weighted)
            total_difficulty = (
                key_difficulty * weights['key'] +
                bpm_difficulty * weights['bpm'] +
                energy_difficulty * weights['energy'] +
                spectral_difficulty * weights['spectral']
            )

            difficulty_level = (
                'very_easy' if total_difficulty < 0.15 else
                'easy' if total_difficulty < 0.35 else
                'medium' if total_difficulty < 0.6 else
                'hard' if total_difficulty < 0.8 else
                'very_hard'
            )

            return {
                'total_difficulty': float(total_difficulty),
                'difficulty_level': difficulty_level,
                'key_difficulty': float(key_difficulty),
                'bpm_difficulty': float(bpm_difficulty),
                'energy_difficulty': float(energy_difficulty),
                'spectral_difficulty': float(spectral_difficulty),
                'is_harmonic_multiple': is_half_time or is_double_time,
                'harmonic_type': 'half-time' if is_half_time else ('double-time' if is_double_time else None),
                'camelot_distance': int(key_distance) if key_distance is not None else 0,
                'dj_style': dj_style,
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

    def detect_risers(
        self,
        y: np.ndarray,
        sr: int = None,
        bpm: float = None,
    ) -> Dict[str, Any]:
        """
        Detect upward pitch sweeps (synth risers) before drops.

        Point 34: Detect risers using spectral centroid movement.
        Risers have steadily increasing spectral centroid over time.

        Args:
            y: Audio signal
            sr: Sample rate (defaults to self.sr)
            bpm: Optional BPM for timing context

        Returns:
            Dictionary with detected risers and timing
        """
        try:
            sr = sr or self.sr

            # Compute spectral centroid over time
            S = np.abs(librosa.stft(y, hop_length=self.hop_length))
            spectral_centroid = librosa.feature.spectral_centroid(S=S, sr=sr)[0]

            # Smooth spectral centroid
            window = np.hanning(21) / 21
            sc_smooth = np.convolve(spectral_centroid, window, mode='same')

            # Compute spectral centroid trend (rate of change)
            sc_derivative = np.diff(sc_smooth, prepend=sc_smooth[0])
            sc_trend = np.convolve(sc_derivative, np.hanning(11) / 11, mode='same')

            # Find regions with sustained positive trend (risers)
            threshold = np.percentile(sc_trend, 60)
            riser_mask = sc_trend > threshold

            # Find continuous regions
            risers = []
            in_riser = False
            riser_start = 0

            for i in range(len(riser_mask)):
                if riser_mask[i] and not in_riser:
                    in_riser = True
                    riser_start = i
                elif not riser_mask[i] and in_riser:
                    # End of riser region
                    riser_duration = (i - riser_start) * self.hop_length / sr
                    if riser_duration > 0.5:  # Minimum 0.5 seconds
                        riser_strength = float(np.mean(sc_trend[riser_start:i]))
                        risers.append({
                            'start_time': float(riser_start * self.hop_length / sr),
                            'end_time': float(i * self.hop_length / sr),
                            'duration': float(riser_duration),
                            'strength': float(riser_strength),
                        })
                    in_riser = False

            return {
                'risers': risers,
                'num_risers': len(risers),
            }
        except Exception as e:
            logger.error(f"Error in detect_risers: {e}")
            return {'risers': [], 'num_risers': 0}

    def detect_impacts(
        self,
        y: np.ndarray,
        sr: int = None,
    ) -> Dict[str, Any]:
        """
        Detect single-hit impacts (big reverb crashes, bass hits).

        Point 35: Detect impacts using energy envelope spikes.
        Impacts are sudden, localized energy spikes.

        Args:
            y: Audio signal
            sr: Sample rate (defaults to self.sr)

        Returns:
            Dictionary with detected impacts and timing
        """
        try:
            sr = sr or self.sr

            # Compute energy envelope
            S = np.abs(librosa.stft(y, hop_length=self.hop_length))
            energy = np.sum(S, axis=0)
            energy_norm = (energy - np.min(energy)) / (np.max(energy) - np.min(energy) + 1e-8)

            # Detect sharp peaks (impacts)
            # Use local maximum detection
            threshold = np.percentile(energy_norm, 80)
            distance = self.sr / self.hop_length * 0.5  # At least 0.5 seconds apart

            impacts, properties = find_peaks(
                energy_norm,
                height=threshold,
                distance=distance,
            )

            detected_impacts = []
            for impact_idx in impacts:
                impact_time = impact_idx * self.hop_length / sr
                impact_strength = float(energy_norm[impact_idx])

                detected_impacts.append({
                    'time': float(impact_time),
                    'strength': impact_strength,
                })

            return {
                'impacts': detected_impacts,
                'num_impacts': len(detected_impacts),
            }
        except Exception as e:
            logger.error(f"Error in detect_impacts: {e}")
            return {'impacts': [], 'num_impacts': 0}

    def compute_groove_pattern(
        self,
        y: np.ndarray,
        sr: int = None,
        bpm: float = None,
    ) -> Dict[str, Any]:
        """
        Detect groove pattern: swing, shuffle, straight.

        Point 36: Measure beat onset jitter/displacement from grid.
        High jitter = swing/shuffle, low = straight.

        Args:
            y: Audio signal
            sr: Sample rate (defaults to self.sr)
            bpm: Optional BPM for beat grid reference

        Returns:
            Dictionary with groove pattern analysis
        """
        try:
            sr = sr or self.sr

            # Detect beats
            odf = librosa.onset.onset_strength(y=y, sr=sr)
            _, beats = librosa.beat.beat_track(
                onset_env=odf,
                sr=sr,
                hop_length=self.hop_length,
            )

            if len(beats) < 4:
                return {'pattern': 'unknown', 'confidence': 0.0}

            # Compute expected beat grid
            if bpm is None:
                bpm = 120  # Default assumption

            beat_duration = 60.0 / bpm
            beat_samples = int(beat_duration * sr)

            # Measure jitter (deviation from grid)
            beat_jitter = []
            for i, beat in enumerate(beats[:-1]):
                expected_next = beat + beat_samples
                actual_next = beats[i + 1]
                jitter = abs(actual_next - expected_next) / beat_samples
                beat_jitter.append(jitter)

            mean_jitter = np.mean(beat_jitter) if beat_jitter else 0.0
            std_jitter = np.std(beat_jitter) if beat_jitter else 0.0

            # Classify groove
            if mean_jitter < 0.05:
                pattern = 'straight'
                confidence = 0.9
            elif mean_jitter < 0.15 and std_jitter > 0.03:
                pattern = 'swing'
                confidence = 0.8
            elif mean_jitter < 0.15:
                pattern = 'shuffle'
                confidence = 0.7
            else:
                pattern = 'irregular'
                confidence = 0.5

            return {
                'pattern': pattern,
                'confidence': float(np.clip(confidence, 0, 1)),
                'mean_jitter': float(mean_jitter),
                'std_jitter': float(std_jitter),
            }
        except Exception as e:
            logger.error(f"Error in compute_groove_pattern: {e}")
            return {'pattern': 'unknown', 'confidence': 0.0}

    def detect_filter_sweeps(
        self,
        y: np.ndarray,
        sr: int = None,
    ) -> Dict[str, Any]:
        """
        Detect EQ automation (low-pass, high-pass sweeps).

        Point 37: Measure spectral bandwidth changes over time.
        Filter sweeps have systematic bandwidth reduction or expansion.

        Args:
            y: Audio signal
            sr: Sample rate (defaults to self.sr)

        Returns:
            Dictionary with detected filter sweeps
        """
        try:
            sr = sr or self.sr

            # Compute spectral features
            S = np.abs(librosa.stft(y, hop_length=self.hop_length))

            # Spectral centroid and bandwidth
            centroid = librosa.feature.spectral_centroid(S=S, sr=sr)[0]
            bandwidth = librosa.feature.spectral_rolloff(S=S, sr=sr)[0] - librosa.feature.spectral_centroid(S=S, sr=sr)[0]

            # Smooth for better trend detection
            centroid_smooth = np.convolve(centroid, np.hanning(21) / 21, mode='same')
            bandwidth_smooth = np.convolve(bandwidth, np.hanning(21) / 21, mode='same')

            # Compute derivatives (rate of change)
            centroid_trend = np.diff(centroid_smooth, prepend=centroid_smooth[0])
            bandwidth_trend = np.diff(bandwidth_smooth, prepend=bandwidth_smooth[0])

            # Detect sustained trends
            sweeps = []

            # Look for centroid movement (pitch sweep)
            threshold_centroid = np.percentile(np.abs(centroid_trend), 70)
            centroid_sweep_mask = np.abs(centroid_trend) > threshold_centroid

            # Find continuous sweep regions
            in_sweep = False
            sweep_start = 0

            for i in range(len(centroid_sweep_mask)):
                if centroid_sweep_mask[i] and not in_sweep:
                    in_sweep = True
                    sweep_start = i
                    sweep_direction = 'up' if centroid_trend[i] > 0 else 'down'
                elif not centroid_sweep_mask[i] and in_sweep:
                    sweep_duration = (i - sweep_start) * self.hop_length / sr
                    if sweep_duration > 0.2:
                        sweeps.append({
                            'type': 'pitch_sweep',
                            'direction': sweep_direction,
                            'start_time': float(sweep_start * self.hop_length / sr),
                            'end_time': float(i * self.hop_length / sr),
                            'duration': float(sweep_duration),
                        })
                    in_sweep = False

            return {
                'sweeps': sweeps,
                'num_sweeps': len(sweeps),
            }
        except Exception as e:
            logger.error(f"Error in detect_filter_sweeps: {e}")
            return {'sweeps': [], 'num_sweeps': 0}

    def compute_spectral_complexity(
        self,
        y: np.ndarray,
        sr: int = None,
    ) -> Dict[str, Any]:
        """
        Measure spectral complexity (harmonic density) over time.

        Point 38: Use spectral entropy to measure harmonic density.
        High entropy = more complex/noisy, low = simple/harmonic.

        Args:
            y: Audio signal
            sr: Sample rate (defaults to self.sr)

        Returns:
            Dictionary with spectral complexity analysis
        """
        try:
            sr = sr or self.sr

            # Compute spectrogram
            S = np.abs(librosa.stft(y, hop_length=self.hop_length))
            S_norm = S / (np.sum(S, axis=0) + 1e-8)

            # Spectral entropy (measure of complexity)
            spectral_entropy = -np.sum(S_norm * np.log2(S_norm + 1e-10), axis=0)

            # Normalize entropy to 0-1
            max_entropy = np.log2(S.shape[0])
            spectral_entropy_norm = spectral_entropy / max_entropy

            # Smooth for trend analysis
            entropy_smooth = np.convolve(spectral_entropy_norm, np.hanning(21) / 21, mode='same')

            return {
                'spectral_complexity_curve': entropy_smooth.tolist(),
                'mean_complexity': float(np.mean(entropy_smooth)),
                'max_complexity': float(np.max(entropy_smooth)),
                'min_complexity': float(np.min(entropy_smooth)),
            }
        except Exception as e:
            logger.error(f"Error in compute_spectral_complexity: {e}")
            return {
                'spectral_complexity_curve': [],
                'mean_complexity': 0.0,
            }

    def detect_silence_gaps(
        self,
        y: np.ndarray,
        sr: int = None,
        min_duration_ms: float = 500,
    ) -> Dict[str, Any]:
        """
        Detect silence gaps in audio (useful for structure analysis).

        Point 39: Use energy threshold to find silence periods.

        Args:
            y: Audio signal
            sr: Sample rate (defaults to self.sr)
            min_duration_ms: Minimum silence duration in milliseconds

        Returns:
            Dictionary with detected silence gaps
        """
        try:
            sr = sr or self.sr

            # Compute energy
            S = np.abs(librosa.stft(y, hop_length=self.hop_length))
            energy = np.sum(S, axis=0)
            energy_norm = (energy - np.min(energy)) / (np.max(energy) - np.min(energy) + 1e-8)

            # Silence threshold (bottom 20%)
            silence_threshold = np.percentile(energy_norm, 20)
            silence_mask = energy_norm < silence_threshold

            # Convert ms to frames
            min_frames = int(min_duration_ms / 1000.0 * sr / self.hop_length)

            gaps = []
            in_gap = False
            gap_start = 0
            gap_length = 0

            for i in range(len(silence_mask)):
                if silence_mask[i]:
                    if not in_gap:
                        in_gap = True
                        gap_start = i
                        gap_length = 1
                    else:
                        gap_length += 1
                else:
                    if in_gap and gap_length >= min_frames:
                        gap_duration = gap_length * self.hop_length / sr
                        gaps.append({
                            'start_time': float(gap_start * self.hop_length / sr),
                            'end_time': float(i * self.hop_length / sr),
                            'duration': float(gap_duration),
                        })
                    in_gap = False
                    gap_length = 0

            return {
                'gaps': gaps,
                'num_gaps': len(gaps),
                'total_silence': float(sum(g['duration'] for g in gaps)),
            }
        except Exception as e:
            logger.error(f"Error in detect_silence_gaps: {e}")
            return {'gaps': [], 'num_gaps': 0}

    def classify_genre_from_audio(
        self,
        y: np.ndarray,
        sr: int = None,
        bpm: float = None,
    ) -> Dict[str, Any]:
        """
        Lightweight genre estimation from audio features.

        Point 40: Use multiple audio features for genre classification.
        Features: BPM, spectral centroid, onset density, zero crossing rate.

        Args:
            y: Audio signal
            sr: Sample rate (defaults to self.sr)
            bpm: Optional pre-computed BPM

        Returns:
            Dictionary with estimated genre and confidence
        """
        try:
            sr = sr or self.sr

            # Feature extraction
            if bpm is None:
                odf = librosa.onset.onset_strength(y=y, sr=sr)
                _, beats = librosa.beat.beat_track(onset_env=odf, sr=sr, hop_length=self.hop_length)
                if len(beats) > 1:
                    beat_times = beats * self.hop_length / sr
                    bpm = 60.0 / np.mean(np.diff(beat_times)) if len(beat_times) > 1 else 120
                else:
                    bpm = 120

            S = np.abs(librosa.stft(y, hop_length=self.hop_length))
            spectral_centroid = np.mean(librosa.feature.spectral_centroid(S=S, sr=sr))
            spectral_centroid_norm = spectral_centroid / (sr / 2)

            # Onset density
            odf = librosa.onset.onset_strength(y=y, sr=sr)
            onset_density = np.mean(odf)

            # Zero crossing rate
            zcr = np.mean(librosa.feature.zero_crossing_rate(y)[0])

            # Genre classification heuristics
            genres_scores = {}

            # Techno: high BPM (>120), moderate centroid
            if 120 < bpm < 150:
                genres_scores['techno'] = 0.8
            elif 100 < bpm <= 120:
                genres_scores['house'] = 0.7

            # Trance: high BPM (>130), atmospheric (low onset density)
            if 130 < bpm < 160 and onset_density < 0.3:
                genres_scores['trance'] = 0.75

            # Hip-hop: lower BPM (80-100), high onset density
            if 80 < bpm < 100 and onset_density > 0.4:
                genres_scores['hip_hop'] = 0.7

            # Pop: very high centroid (vocals), moderate BPM
            if spectral_centroid_norm > 0.6 and 90 < bpm < 130:
                genres_scores['pop'] = 0.65

            # Drum and Bass: very high BPM (>160), high onset density
            if bpm > 160 and onset_density > 0.5:
                genres_scores['drum_and_bass'] = 0.8

            # Reggaeton: moderate-high BPM, specific rhythm pattern
            if 95 < bpm < 110:
                genres_scores['reggaeton'] = 0.6

            # Afrobeats: moderate BPM, high spectral content
            if 90 < bpm < 120 and spectral_centroid_norm > 0.5:
                genres_scores['afrobeats'] = 0.6

            # Select best match
            if genres_scores:
                best_genre = max(genres_scores.items(), key=lambda x: x[1])
                return {
                    'estimated_genre': best_genre[0],
                    'confidence': float(best_genre[1]),
                    'genre_scores': genres_scores,
                    'bpm': float(bpm),
                    'spectral_centroid_norm': float(spectral_centroid_norm),
                    'onset_density': float(onset_density),
                    'zcr': float(zcr),
                }
            else:
                return {
                    'estimated_genre': 'unknown',
                    'confidence': 0.0,
                    'genre_scores': {},
                    'bpm': float(bpm),
                }
        except Exception as e:
            logger.error(f"Error in classify_genre_from_audio: {e}")
            return {
                'estimated_genre': 'unknown',
                'confidence': 0.0,
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
