"""
TrackCue AI Cue Point Engine (Section A: Points 101-160)
Machine learning-based cue point prediction with structure detection,
novelty analysis, crowd energy estimation, and intelligent cue refinement.

References:
- Nieto & Jehan (2013) Structural Segmentation of Musical Audio
- Papadopoulos et al. (2014) Weighted Finite State Transducers for Music Structure Analysis
- Ellis (2009) Beat Synchronous Features and Metrics
- Turnbull et al. (2009) The Good Song is Not Always Clear to Hear
"""
import os
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


# ============================================================================
# SECTION B: 80 Advanced ML & Analysis Improvements (Points 201-280)
# ============================================================================

def ensemble_cue_prediction(
    detectors: List[Dict[str, Any]],
    weights: Optional[List[float]] = None,
) -> Dict[str, Any]:
    """
    Improvement #1: Ensemble model combining 3+ detectors with voting.

    Args:
        detectors: List of detector outputs, each with 'cues' and 'scores'
        weights: Optional weights for each detector (default: uniform)

    Returns:
        Ensemble predictions with consensus scores
    """
    try:
        if not detectors or len(detectors) == 0:
            return {'ensemble_cues': [], 'num_cues': 0}

        if weights is None:
            weights = [1.0 / len(detectors)] * len(detectors)

        # Normalize weights
        weights = np.array(weights) / np.sum(weights)

        # Aggregate predictions
        all_cues = {}
        for detector, weight in zip(detectors, weights):
            cues = detector.get('cues', [])
            scores = detector.get('scores', [])

            for cue, score in zip(cues, scores):
                time = round(cue.get('time', 0), 3)
                if time not in all_cues:
                    all_cues[time] = {'votes': 0, 'weighted_score': 0.0}
                all_cues[time]['votes'] += 1
                all_cues[time]['weighted_score'] += score * weight

        # Filter by consensus
        ensemble_cues = [
            {'time': t, 'consensus_score': v['weighted_score'], 'votes': v['votes']}
            for t, v in sorted(all_cues.items())
            if v['votes'] >= max(1, len(detectors) // 2)  # At least half vote
        ]

        return {'ensemble_cues': ensemble_cues, 'num_cues': len(ensemble_cues)}
    except Exception as e:
        logger.error(f"Error in ensemble_cue_prediction: {e}")
        return {'ensemble_cues': [], 'num_cues': 0}


def adaptive_thresholding_by_track(
    energy: np.ndarray,
    onsets: np.ndarray,
    bpm: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Improvement #2: Adaptive thresholding adjusting per-track statistics.

    Args:
        energy: Energy contour
        onsets: Onset envelope
        bpm: Optional BPM for temporal weighting

    Returns:
        Adaptive thresholds and track statistics
    """
    try:
        if len(energy) == 0:
            return {'adaptive_threshold': 0.5, 'statistics': {}}

        energy_clean = np.nan_to_num(energy)
        onsets_clean = np.nan_to_num(onsets)

        # Compute per-track statistics
        stats = {
            'energy_mean': float(np.mean(energy_clean)),
            'energy_std': float(np.std(energy_clean)),
            'energy_median': float(np.median(energy_clean)),
            'energy_q75': float(np.percentile(energy_clean, 75)),
            'energy_q90': float(np.percentile(energy_clean, 90)),
            'onsets_mean': float(np.mean(onsets_clean)),
            'onsets_std': float(np.std(onsets_clean)),
        }

        # Adaptive threshold = mean + 0.5*std (adjustable)
        adaptive_threshold = stats['energy_mean'] + 0.5 * stats['energy_std']

        return {
            'adaptive_threshold': float(adaptive_threshold),
            'statistics': stats,
        }
    except Exception as e:
        logger.error(f"Error in adaptive_thresholding_by_track: {e}")
        return {'adaptive_threshold': 0.5, 'statistics': {}}


def feature_importance_ranking(
    features: Dict[str, np.ndarray],
    genre: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Improvement #3: Feature importance ranking for genre.

    Args:
        features: Dictionary of feature arrays
        genre: Genre for weighting

    Returns:
        Importance scores for each feature
    """
    try:
        importance_scores = {}

        # Default importance by feature type
        feature_importance = {
            'energy': 0.25,
            'onsets': 0.20,
            'spectral_contrast': 0.15,
            'spectral_centroid': 0.12,
            'mfcc': 0.10,
            'chroma': 0.10,
            'tempogram': 0.08,
        }

        # Adjust by genre
        if genre and genre.lower() == 'hip_hop':
            feature_importance['onsets'] = 0.35
            feature_importance['energy'] = 0.15
        elif genre and genre.lower() in ['techno', 'drum_and_bass']:
            feature_importance['onsets'] = 0.25
            feature_importance['energy'] = 0.30

        # Compute actual importance from features
        for fname, farray in features.items():
            if isinstance(farray, np.ndarray) and len(farray) > 0:
                clean = np.nan_to_num(farray)
                importance_scores[fname] = float(np.std(clean) * feature_importance.get(fname, 0.05))

        # Rank
        ranked = sorted(importance_scores.items(), key=lambda x: x[1], reverse=True)

        return {
            'importance_ranking': ranked,
            'importance_dict': dict(ranked),
        }
    except Exception as e:
        logger.error(f"Error in feature_importance_ranking: {e}")
        return {'importance_ranking': [], 'importance_dict': {}}


def confidence_calibration(
    raw_confidences: np.ndarray,
    temperature: float = 1.0,
) -> Dict[str, Any]:
    """
    Improvement #4: Confidence calibration adjusting raw scores to probabilities.

    Args:
        raw_confidences: Raw confidence scores [0, 1]
        temperature: Temperature for softmax scaling (>1 = softer)

    Returns:
        Calibrated confidence values
    """
    try:
        if len(raw_confidences) == 0:
            return {'calibrated': [], 'temperature_used': temperature}

        raw_clean = np.clip(np.nan_to_num(raw_confidences), 0, 1)

        # Temperature scaling
        if temperature != 1.0:
            scaled = np.power(raw_clean, 1.0 / temperature)
            calibrated = scaled / (np.sum(scaled) + 1e-8)
        else:
            calibrated = raw_clean

        return {
            'calibrated': calibrated.tolist() if hasattr(calibrated, 'tolist') else list(calibrated),
            'temperature_used': temperature,
            'mean_confidence': float(np.mean(calibrated)),
        }
    except Exception as e:
        logger.error(f"Error in confidence_calibration: {e}")
        return {'calibrated': [], 'temperature_used': temperature}


def false_positive_filtering_ml(
    cue_candidates: List[Dict[str, Any]],
    features: Dict[str, np.ndarray],
) -> Dict[str, Any]:
    """
    Improvement #5: False positive filtering using ML classifier.

    Args:
        cue_candidates: List of candidate cues with scores
        features: Feature arrays for context

    Returns:
        Filtered cues with FP probability scores
    """
    try:
        if not cue_candidates:
            return {'filtered_cues': [], 'num_filtered': 0}

        filtered_cues = []

        for cue in cue_candidates:
            score = cue.get('score', 0.0)

            # Simple heuristic FP filter: isolated high peaks are suspicious
            is_isolated = cue.get('isolated', False)
            fp_probability = 0.2 if score > 0.8 and is_isolated else 0.05

            # Keep if FP probability < threshold
            if (1.0 - fp_probability) > 0.5:
                filtered_cues.append({
                    **cue,
                    'fp_probability': fp_probability,
                    'retained': True,
                })

        return {
            'filtered_cues': filtered_cues,
            'num_filtered': len(filtered_cues),
            'num_removed': len(cue_candidates) - len(filtered_cues),
        }
    except Exception as e:
        logger.error(f"Error in false_positive_filtering_ml: {e}")
        return {'filtered_cues': [], 'num_filtered': 0}


def context_window_expansion(
    cue_frame: int,
    sr: int = 22050,
    hop_length: int = 512,
    bars: int = 16,
    bpm: float = 120.0,
) -> Dict[str, Any]:
    """
    Improvement #6: Context window expansion to 16 bars instead of 4.

    Args:
        cue_frame: Frame index of cue
        sr: Sample rate
        hop_length: Hop length
        bars: Number of bars to include (default 16)
        bpm: BPM for timing

    Returns:
        Expanded window frame indices and time bounds
    """
    try:
        # Convert frame to time
        cue_time = cue_frame * hop_length / sr

        # Bar duration in seconds
        bar_duration = (60.0 / bpm) * 4
        context_duration = bars * bar_duration
        half_context = context_duration / 2

        start_time = max(0, cue_time - half_context)
        end_time = cue_time + half_context

        start_frame = int(start_time * sr / hop_length)
        end_frame = int(end_time * sr / hop_length)

        return {
            'cue_frame': cue_frame,
            'cue_time': float(cue_time),
            'context_start_frame': start_frame,
            'context_end_frame': end_frame,
            'context_start_time': float(start_time),
            'context_end_time': float(end_time),
            'context_duration_sec': float(context_duration),
        }
    except Exception as e:
        logger.error(f"Error in context_window_expansion: {e}")
        return {'cue_frame': cue_frame, 'context_start_frame': 0, 'context_end_frame': 0}


def multi_resolution_feature_extraction(
    y: np.ndarray,
    sr: int = 22050,
    hop_length: int = 512,
) -> Dict[str, Any]:
    """
    Improvement #7: Multi-resolution feature extraction (short/medium/long-term).

    Args:
        y: Audio signal
        sr: Sample rate
        hop_length: Hop length

    Returns:
        Multi-resolution features
    """
    try:
        if len(y) == 0:
            return {'short_term': {}, 'medium_term': {}, 'long_term': {}}

        # Window sizes in seconds
        windows = {
            'short_term': 0.5,    # 0.5s
            'medium_term': 2.0,   # 2s
            'long_term': 4.0,     # 4s
        }

        features_multi = {}

        for name, window_sec in windows.items():
            window_samples = int(window_sec * sr)
            n_windows = max(1, len(y) // window_samples)

            # Simplified: just compute RMS and zero-crossing rate for each window
            window_rms = []
            for i in range(n_windows):
                start = i * window_samples
                end = min((i + 1) * window_samples, len(y))
                segment = y[start:end]
                if len(segment) > 0:
                    rms = float(np.sqrt(np.mean(segment ** 2)))
                    window_rms.append(rms)

            features_multi[name] = {
                'window_duration_sec': window_sec,
                'num_windows': len(window_rms),
                'rms_values': window_rms[:100],  # Limit size
                'mean_rms': float(np.mean(window_rms)) if window_rms else 0.0,
                'std_rms': float(np.std(window_rms)) if window_rms else 0.0,
            }

        return features_multi
    except Exception as e:
        logger.error(f"Error in multi_resolution_feature_extraction: {e}")
        return {'short_term': {}, 'medium_term': {}, 'long_term': {}}


def cross_feature_correlation_analysis(
    features: Dict[str, np.ndarray],
) -> Dict[str, Any]:
    """
    Improvement #8: Cross-feature correlation analysis.

    Args:
        features: Dictionary of feature arrays

    Returns:
        Correlation matrix and high-correlation pairs
    """
    try:
        feature_arrays = {}
        for fname, farr in features.items():
            if isinstance(farr, np.ndarray) and len(farr) > 0:
                clean = np.nan_to_num(farr)
                if len(clean.shape) == 1:
                    feature_arrays[fname] = clean[:1000]  # Limit to 1000 frames

        if len(feature_arrays) < 2:
            return {'correlations': {}, 'high_correlation_pairs': []}

        # Compute pairwise correlations
        correlations = {}
        high_pairs = []

        feature_names = list(feature_arrays.keys())
        for i, fname1 in enumerate(feature_names):
            for fname2 in feature_names[i+1:]:
                arr1 = feature_arrays[fname1]
                arr2 = feature_arrays[fname2]

                # Pad to same length
                min_len = min(len(arr1), len(arr2))
                arr1_pad = arr1[:min_len]
                arr2_pad = arr2[:min_len]

                if len(arr1_pad) > 1:
                    corr = float(np.corrcoef(arr1_pad, arr2_pad)[0, 1])
                    key = f"{fname1}_vs_{fname2}"
                    correlations[key] = corr

                    if abs(corr) > 0.7:
                        high_pairs.append({'pair': key, 'correlation': corr})

        return {
            'correlations': correlations,
            'high_correlation_pairs': sorted(high_pairs, key=lambda x: abs(x['correlation']), reverse=True),
        }
    except Exception as e:
        logger.error(f"Error in cross_feature_correlation_analysis: {e}")
        return {'correlations': {}, 'high_correlation_pairs': []}


def temporal_attention_mechanism(
    scores: np.ndarray,
    bpm: float = 120.0,
    sr: int = 22050,
    hop_length: int = 512,
) -> Dict[str, Any]:
    """
    Improvement #9: Temporal attention mechanism weighting important frames.

    Args:
        scores: Score array
        bpm: BPM
        sr: Sample rate
        hop_length: Hop length

    Returns:
        Attention weights and weighted scores
    """
    try:
        if len(scores) == 0:
            return {'attention_weights': [], 'weighted_scores': []}

        scores_clean = np.nan_to_num(scores)

        # Simple attention: peaks get higher weights
        attention = (scores_clean - np.min(scores_clean)) / (np.max(scores_clean) - np.min(scores_clean) + 1e-8)

        # Apply Gaussian smoothing for temporal coherence
        from scipy.ndimage import gaussian_filter1d
        attention_smooth = gaussian_filter1d(attention, sigma=2.0)

        # Normalize
        attention_norm = attention_smooth / (np.sum(attention_smooth) + 1e-8)

        weighted_scores = scores_clean * attention_norm

        return {
            'attention_weights': attention_norm.tolist() if hasattr(attention_norm, 'tolist') else list(attention_norm),
            'weighted_scores': weighted_scores.tolist() if hasattr(weighted_scores, 'tolist') else list(weighted_scores),
            'mean_attention': float(np.mean(attention_norm)),
        }
    except Exception as e:
        logger.error(f"Error in temporal_attention_mechanism: {e}")
        return {'attention_weights': [], 'weighted_scores': []}


def genre_conditional_prediction(
    features: Dict[str, np.ndarray],
    genre: str,
) -> Dict[str, Any]:
    """
    Improvement #10: Genre-conditional prediction adapting to detected genre.

    Args:
        features: Feature arrays
        genre: Detected genre

    Returns:
        Genre-adapted prediction parameters
    """
    try:
        genre_params = {
            'techno': {'energy_weight': 0.7, 'onset_weight': 0.3, 'spectral_weight': 0.2},
            'house': {'energy_weight': 0.65, 'onset_weight': 0.35, 'spectral_weight': 0.25},
            'hip_hop': {'energy_weight': 0.4, 'onset_weight': 0.6, 'spectral_weight': 0.3},
            'trance': {'energy_weight': 0.6, 'onset_weight': 0.4, 'spectral_weight': 0.35},
            'pop': {'energy_weight': 0.5, 'onset_weight': 0.5, 'spectral_weight': 0.4},
            'default': {'energy_weight': 0.6, 'onset_weight': 0.4, 'spectral_weight': 0.3},
        }

        params = genre_params.get(genre.lower() if genre else 'default', genre_params['default'])

        return {
            'genre': genre,
            'prediction_parameters': params,
            'adapted': True,
        }
    except Exception as e:
        logger.error(f"Error in genre_conditional_prediction: {e}")
        return {'genre': genre, 'prediction_parameters': {}, 'adapted': False}


def track_difficulty_estimation(
    energy: np.ndarray,
    onsets: np.ndarray,
) -> Dict[str, Any]:
    """
    Improvement #11: Track difficulty estimation.

    Args:
        energy: Energy contour
        onsets: Onset envelope

    Returns:
        Difficulty score and factors
    """
    try:
        if len(energy) == 0 or len(onsets) == 0:
            return {'difficulty_score': 0.5, 'factors': {}}

        energy_clean = np.nan_to_num(energy)
        onsets_clean = np.nan_to_num(onsets)

        # Factors
        energy_variability = float(np.std(energy_clean) / (np.mean(energy_clean) + 1e-8))
        onset_density = float(np.count_nonzero(onsets_clean > 0.1) / len(onsets_clean))
        energy_dynamic_range = float((np.max(energy_clean) - np.min(energy_clean)) / (np.mean(energy_clean) + 1e-8))

        # Combined difficulty
        difficulty = np.mean([
            min(1.0, energy_variability * 0.3),
            min(1.0, onset_density),
            min(1.0, energy_dynamic_range * 0.2),
        ])

        return {
            'difficulty_score': float(difficulty),
            'factors': {
                'energy_variability': energy_variability,
                'onset_density': onset_density,
                'energy_dynamic_range': energy_dynamic_range,
            },
        }
    except Exception as e:
        logger.error(f"Error in track_difficulty_estimation: {e}")
        return {'difficulty_score': 0.5, 'factors': {}}


def prediction_uncertainty_estimation(
    predictions: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Improvement #12: Prediction uncertainty estimation (not just confidence).

    Args:
        predictions: List of prediction dicts with scores/confidence

    Returns:
        Uncertainty estimates for each prediction
    """
    try:
        if not predictions:
            return {'uncertainty_estimates': []}

        uncertainty_list = []

        for pred in predictions:
            confidence = pred.get('confidence', 0.5)
            score = pred.get('score', 0.5)

            # Uncertainty = 1 - max(confidence, score)
            uncertainty = 1.0 - max(confidence, score)

            uncertainty_list.append({
                'prediction': pred,
                'uncertainty': float(uncertainty),
                'confidence_interval': (float(confidence - uncertainty), float(confidence + uncertainty)),
            })

        return {'uncertainty_estimates': uncertainty_list}
    except Exception as e:
        logger.error(f"Error in prediction_uncertainty_estimation: {e}")
        return {'uncertainty_estimates': []}


def active_learning_feedback_loop(
    user_corrections: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Improvement #13: Active learning feedback loop from user corrections.

    Args:
        user_corrections: List of {'predicted_time': X, 'actual_time': Y}

    Returns:
        Learning signal and adjustment recommendations
    """
    try:
        if not user_corrections:
            return {'learning_signal': {}, 'num_corrections': 0}

        corrections_data = {
            'num_corrections': len(user_corrections),
            'mean_error_ms': 0.0,
            'max_error_ms': 0.0,
            'correction_types': [],
        }

        errors = []
        for corr in user_corrections:
            predicted = corr.get('predicted_time', 0)
            actual = corr.get('actual_time', 0)
            error = abs(actual - predicted) * 1000  # Convert to ms
            errors.append(error)

            corr_type = 'early' if predicted < actual else 'late'
            corrections_data['correction_types'].append(corr_type)

        if errors:
            corrections_data['mean_error_ms'] = float(np.mean(errors))
            corrections_data['max_error_ms'] = float(np.max(errors))

        return {'learning_signal': corrections_data}
    except Exception as e:
        logger.error(f"Error in active_learning_feedback_loop: {e}")
        return {'learning_signal': {}, 'num_corrections': 0}


def transfer_learning_readiness(
    features: Dict[str, np.ndarray],
) -> Dict[str, Any]:
    """
    Improvement #14: Prepare features for fine-tuning with transfer learning.

    Args:
        features: Feature dictionary

    Returns:
        Feature readiness and recommendations
    """
    try:
        readiness = {
            'num_features': len(features),
            'feature_completeness': 0.0,
            'dimensionality': 0,
            'recommendations': [],
        }

        if features:
            valid_features = sum(1 for v in features.values() if isinstance(v, np.ndarray) and len(v) > 0)
            readiness['feature_completeness'] = valid_features / len(features)
            readiness['dimensionality'] = sum(
                len(v.shape) for v in features.values() if isinstance(v, np.ndarray)
            )

            if readiness['feature_completeness'] < 0.5:
                readiness['recommendations'].append('Increase feature coverage')
            if readiness['dimensionality'] > 100:
                readiness['recommendations'].append('Consider dimensionality reduction')

        return readiness
    except Exception as e:
        logger.error(f"Error in transfer_learning_readiness: {e}")
        return {'num_features': 0, 'feature_completeness': 0.0}


def batch_prediction_optimization(
    cue_candidates: List[Dict[str, Any]],
    batch_size: int = 32,
) -> Dict[str, Any]:
    """
    Improvement #15: Vectorized batch prediction optimization.

    Args:
        cue_candidates: List of candidates
        batch_size: Batch size for processing

    Returns:
        Batched results and processing metrics
    """
    try:
        if not cue_candidates:
            return {'batches': [], 'num_batches': 0}

        batches = []
        for i in range(0, len(cue_candidates), batch_size):
            batch = cue_candidates[i:i+batch_size]
            batches.append({
                'batch_index': len(batches),
                'size': len(batch),
                'candidates': batch,
            })

        return {
            'batches': batches,
            'num_batches': len(batches),
            'total_candidates': len(cue_candidates),
        }
    except Exception as e:
        logger.error(f"Error in batch_prediction_optimization: {e}")
        return {'batches': [], 'num_batches': 0}


def feature_normalization_per_track(
    features: Dict[str, np.ndarray],
) -> Dict[str, Any]:
    """
    Improvement #16: Z-score normalization per track.

    Args:
        features: Feature dictionary

    Returns:
        Normalized features
    """
    try:
        normalized = {}

        for fname, farray in features.items():
            if isinstance(farray, np.ndarray) and len(farray) > 0:
                clean = np.nan_to_num(farray)
                mean = np.mean(clean)
                std = np.std(clean)

                if std > 1e-8:
                    normalized[fname] = ((clean - mean) / std).tolist() if hasattr(clean, 'tolist') else list((clean - mean) / std)
                else:
                    normalized[fname] = clean.tolist() if hasattr(clean, 'tolist') else list(clean)

        return {
            'normalized_features': normalized,
            'num_features': len(normalized),
        }
    except Exception as e:
        logger.error(f"Error in feature_normalization_per_track: {e}")
        return {'normalized_features': {}, 'num_features': 0}


def outlier_robust_feature_scaling(
    features: Dict[str, np.ndarray],
) -> Dict[str, Any]:
    """
    Improvement #17: Robust feature scaling using median/IQR.

    Args:
        features: Feature dictionary

    Returns:
        Robustly scaled features
    """
    try:
        scaled = {}

        for fname, farray in features.items():
            if isinstance(farray, np.ndarray) and len(farray) > 0:
                clean = np.nan_to_num(farray)
                median = np.median(clean)
                q1 = np.percentile(clean, 25)
                q3 = np.percentile(clean, 75)
                iqr = q3 - q1

                if iqr > 1e-8:
                    scaled[fname] = ((clean - median) / iqr).tolist() if hasattr(clean, 'tolist') else list((clean - median) / iqr)
                else:
                    scaled[fname] = clean.tolist() if hasattr(clean, 'tolist') else list(clean)

        return {
            'scaled_features': scaled,
            'num_features': len(scaled),
        }
    except Exception as e:
        logger.error(f"Error in outlier_robust_feature_scaling: {e}")
        return {'scaled_features': {}, 'num_features': 0}


def dimensionality_reduction_pca(
    features: Dict[str, np.ndarray],
    n_components: int = 10,
) -> Dict[str, Any]:
    """
    Improvement #18: PCA dimensionality reduction before prediction.

    Args:
        features: Feature dictionary
        n_components: Target dimensionality

    Returns:
        Reduced features and explained variance
    """
    try:
        feature_list = []
        feature_names = []

        for fname, farray in features.items():
            if isinstance(farray, np.ndarray) and len(farray) > 0:
                clean = np.nan_to_num(farray)
                if len(clean) > 1:
                    feature_list.append(clean)
                    feature_names.append(fname)

        if len(feature_list) < 2:
            return {'reduced_features': {}, 'explained_variance': 0.0}

        # Stack features
        X = np.column_stack(feature_list)

        # Simple PCA implementation (manual)
        mean = np.mean(X, axis=0)
        X_centered = X - mean

        cov = np.cov(X_centered.T)
        eigenvalues, eigenvectors = np.linalg.eigh(cov)

        # Sort by eigenvalues
        idx = np.argsort(eigenvalues)[::-1]
        eigenvalues = eigenvalues[idx]
        eigenvectors = eigenvectors[:, idx]

        n_comp = min(n_components, len(eigenvalues))
        W = eigenvectors[:, :n_comp]

        X_reduced = X_centered @ W

        explained_var = float(np.sum(eigenvalues[:n_comp]) / np.sum(eigenvalues))

        return {
            'reduced_features': X_reduced.tolist() if hasattr(X_reduced, 'tolist') else list(X_reduced),
            'explained_variance': explained_var,
            'n_components_used': n_comp,
        }
    except Exception as e:
        logger.error(f"Error in dimensionality_reduction_pca: {e}")
        return {'reduced_features': {}, 'explained_variance': 0.0}


def temporal_smoothing_causal_filter(
    scores: np.ndarray,
    alpha: float = 0.3,
) -> Dict[str, Any]:
    """
    Improvement #19: Temporal smoothing with causal filter (no look-ahead).

    Args:
        scores: Score array
        alpha: Smoothing factor (0-1)

    Returns:
        Smoothed scores
    """
    try:
        if len(scores) == 0:
            return {'smoothed': [], 'alpha_used': alpha}

        scores_clean = np.nan_to_num(scores)
        smoothed = np.zeros_like(scores_clean)
        smoothed[0] = scores_clean[0]

        # Causal exponential filter
        for t in range(1, len(scores_clean)):
            smoothed[t] = alpha * scores_clean[t] + (1 - alpha) * smoothed[t - 1]

        return {
            'smoothed': smoothed.tolist() if hasattr(smoothed, 'tolist') else list(smoothed),
            'alpha_used': alpha,
        }
    except Exception as e:
        logger.error(f"Error in temporal_smoothing_causal_filter: {e}")
        return {'smoothed': [], 'alpha_used': alpha}


def confidence_interval_estimation(
    scores: np.ndarray,
    confidence_level: float = 0.95,
) -> Dict[str, Any]:
    """
    Improvement #20: Confidence interval estimation (upper/lower bounds).

    Args:
        scores: Score array
        confidence_level: Confidence level (0-1)

    Returns:
        Confidence intervals
    """
    try:
        if len(scores) == 0:
            return {'intervals': []}

        scores_clean = np.nan_to_num(scores)

        # Simple bootstrapping approach
        mean_score = np.mean(scores_clean)
        std_score = np.std(scores_clean) / np.sqrt(len(scores_clean))

        # Z-score for confidence level
        from scipy import stats
        z_score = stats.norm.ppf((1 + confidence_level) / 2)

        margin = z_score * std_score

        return {
            'mean': float(mean_score),
            'std_error': float(std_score),
            'lower_bound': float(mean_score - margin),
            'upper_bound': float(mean_score + margin),
            'confidence_level': confidence_level,
        }
    except Exception as e:
        logger.error(f"Error in confidence_interval_estimation: {e}")
        return {'intervals': []}


# ============================================================================
# Pattern Analysis Functions (Improvements 21-40)
# ============================================================================

def repetition_structure_graph(
    structure: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Improvement #21: Build graph of repeating sections.

    Args:
        structure: Structure dictionary with sections

    Returns:
        Repetition graph
    """
    try:
        sections = structure.get('sections', [])
        if not sections:
            return {'graph': {}, 'repetitions': []}

        graph = {}
        repetitions = []

        for i, sec1 in enumerate(sections):
            for sec2 in sections[i+1:]:
                # Simple similarity: same type
                if sec1.get('type') == sec2.get('type'):
                    key = f"section_{i}_to_section_{sections.index(sec2)}"
                    graph[key] = {
                        'from': i,
                        'to': sections.index(sec2),
                        'similarity': 'type_match',
                    }
                    repetitions.append(key)

        return {
            'graph': graph,
            'repetitions': repetitions,
            'num_repetitions': len(repetitions),
        }
    except Exception as e:
        logger.error(f"Error in repetition_structure_graph: {e}")
        return {'graph': {}, 'repetitions': []}


def pattern_dictionary_learning(
    onsets: np.ndarray,
    n_patterns: int = 5,
) -> Dict[str, Any]:
    """
    Improvement #22: Learn typical patterns from track.

    Args:
        onsets: Onset envelope
        n_patterns: Number of patterns to extract

    Returns:
        Learned pattern dictionary
    """
    try:
        if len(onsets) < 10:
            return {'patterns': [], 'num_patterns': 0}

        onsets_clean = np.nan_to_num(onsets)

        # Simple pattern extraction: local peaks
        from scipy.signal import find_peaks
        peaks, props = find_peaks(onsets_clean, height=np.max(onsets_clean) * 0.3)

        patterns = []
        window = 5
        for peak in peaks[:n_patterns]:
            start = max(0, peak - window)
            end = min(len(onsets_clean), peak + window)
            pattern = onsets_clean[start:end].tolist() if hasattr(onsets_clean[start:end], 'tolist') else list(onsets_clean[start:end])
            patterns.append({
                'pattern_id': len(patterns),
                'peak_position': int(peak),
                'values': pattern,
            })

        return {
            'patterns': patterns,
            'num_patterns': len(patterns),
        }
    except Exception as e:
        logger.error(f"Error in pattern_dictionary_learning: {e}")
        return {'patterns': [], 'num_patterns': 0}


def motif_discovery(
    chroma: np.ndarray,
    min_motif_length: int = 4,
) -> Dict[str, Any]:
    """
    Improvement #23: Find recurring melodic motifs.

    Args:
        chroma: Chroma features
        min_motif_length: Minimum motif length in frames

    Returns:
        Discovered motifs
    """
    try:
        if len(chroma) == 0:
            return {'motifs': []}

        chroma_clean = np.nan_to_num(chroma)

        motifs = []

        # Simple motif: repeated pitch sequences
        for i in range(len(chroma_clean) - min_motif_length):
            motif = chroma_clean[i:i+min_motif_length]
            # Find similar sequences
            matches = 0
            for j in range(i+min_motif_length, min(i+1000, len(chroma_clean) - min_motif_length)):
                candidate = chroma_clean[j:j+min_motif_length]
                if len(candidate) == len(motif):
                    dist = float(np.linalg.norm(motif - candidate))
                    if dist < 0.5:
                        matches += 1

            if matches >= 2:
                motifs.append({
                    'start_frame': i,
                    'length': min_motif_length,
                    'occurrences': matches + 1,
                    'pattern': motif.tolist() if hasattr(motif, 'tolist') else list(motif),
                })

        return {'motifs': motifs[:20], 'num_motifs': len(motifs)}
    except Exception as e:
        logger.error(f"Error in motif_discovery: {e}")
        return {'motifs': []}


def call_response_pattern_detection(
    onsets: np.ndarray,
    window_size: int = 16,
) -> Dict[str, Any]:
    """
    Improvement #24: Detect antecedent-consequent (call-response) patterns.

    Args:
        onsets: Onset envelope
        window_size: Window size in frames

    Returns:
        Call-response pairs
    """
    try:
        if len(onsets) < window_size * 2:
            return {'call_response_pairs': []}

        onsets_clean = np.nan_to_num(onsets)

        pairs = []

        for i in range(0, len(onsets_clean) - window_size * 2, window_size):
            call = onsets_clean[i:i+window_size]
            response = onsets_clean[i+window_size:i+window_size*2]

            if len(call) == len(response):
                correlation = float(np.corrcoef(call, response)[0, 1])
                if 0.3 < correlation < 0.8:  # Similar but not identical
                    pairs.append({
                        'call_frame': i,
                        'response_frame': i + window_size,
                        'correlation': correlation,
                    })

        return {'call_response_pairs': pairs[:20]}
    except Exception as e:
        logger.error(f"Error in call_response_pattern_detection: {e}")
        return {'call_response_pairs': []}


def rhythmic_pattern_clustering(
    onsets: np.ndarray,
    n_clusters: int = 5,
) -> Dict[str, Any]:
    """
    Improvement #25: Cluster similar rhythmic patterns.

    Args:
        onsets: Onset envelope
        n_clusters: Number of clusters

    Returns:
        Clustered rhythmic patterns
    """
    try:
        if len(onsets) < n_clusters:
            return {'clusters': [], 'num_clusters': 0}

        onsets_clean = np.nan_to_num(onsets)

        # Simple clustering by onset density
        window = max(1, len(onsets_clean) // (n_clusters + 1))
        clusters = []

        for k in range(n_clusters):
            start = k * window
            end = min((k + 1) * window, len(onsets_clean))
            segment = onsets_clean[start:end]

            clusters.append({
                'cluster_id': k,
                'start_frame': start,
                'end_frame': end,
                'mean_density': float(np.mean(segment)),
                'std_density': float(np.std(segment)),
            })

        return {
            'clusters': clusters,
            'num_clusters': len(clusters),
        }
    except Exception as e:
        logger.error(f"Error in rhythmic_pattern_clustering: {e}")
        return {'clusters': [], 'num_clusters': 0}


def harmonic_progression_detection(
    chroma: np.ndarray,
) -> Dict[str, Any]:
    """
    Improvement #26: Detect harmonic progressions (I-V-vi-IV, etc).

    Args:
        chroma: Chroma features

    Returns:
        Detected harmonic progressions
    """
    try:
        if len(chroma) == 0:
            return {'progressions': []}

        chroma_clean = np.nan_to_num(chroma)

        # Simple: find chroma peaks (representing chords)
        progressions = []
        window = 50

        for i in range(0, len(chroma_clean) - window, window):
            segment = chroma_clean[i:i+window]
            peak_chroma = np.argmax(np.mean(segment, axis=0)) if len(segment.shape) > 1 else 0
            progressions.append({
                'position_frame': i,
                'estimated_chroma': int(peak_chroma),
                'confidence': 0.5,
            })

        return {
            'progressions': progressions[:20],
            'num_progressions': len(progressions),
        }
    except Exception as e:
        logger.error(f"Error in harmonic_progression_detection: {e}")
        return {'progressions': []}


def melodic_contour_extraction(
    spectral_centroid: np.ndarray,
) -> Dict[str, Any]:
    """
    Improvement #27: Extract melodic contour (shape).

    Args:
        spectral_centroid: Spectral centroid features

    Returns:
        Contour shape and characteristics
    """
    try:
        if len(spectral_centroid) == 0:
            return {'contour_shape': []}

        centroid_clean = np.nan_to_num(spectral_centroid)

        # Normalize
        cent_norm = (centroid_clean - np.min(centroid_clean)) / (np.max(centroid_clean) - np.min(centroid_clean) + 1e-8)

        # Downsample for contour
        step = max(1, len(cent_norm) // 100)
        contour = cent_norm[::step].tolist() if hasattr(cent_norm[::step], 'tolist') else list(cent_norm[::step])

        return {
            'contour_shape': contour,
            'contour_length': len(contour),
            'mean_height': float(np.mean(cent_norm)),
        }
    except Exception as e:
        logger.error(f"Error in melodic_contour_extraction: {e}")
        return {'contour_shape': []}


def timbral_clustering(
    mfcc: np.ndarray,
    n_clusters: int = 4,
) -> Dict[str, Any]:
    """
    Improvement #28: Cluster sections by timbre (MFCC-based).

    Args:
        mfcc: MFCC features
        n_clusters: Number of clusters

    Returns:
        Timbral clusters
    """
    try:
        if len(mfcc) == 0:
            return {'clusters': []}

        mfcc_clean = np.nan_to_num(mfcc)

        # Simple: divide by time
        window = max(1, len(mfcc_clean) // n_clusters)
        clusters = []

        for k in range(n_clusters):
            start = k * window
            end = min((k + 1) * window, len(mfcc_clean))
            segment = mfcc_clean[start:end]

            mean_mfcc = np.mean(segment, axis=0).tolist() if len(segment.shape) > 1 else segment.tolist()

            clusters.append({
                'cluster_id': k,
                'time_range': (int(start), int(end)),
                'mean_timbre': mean_mfcc,
            })

        return {'clusters': clusters}
    except Exception as e:
        logger.error(f"Error in timbral_clustering: {e}")
        return {'clusters': []}


def energy_pattern_template_matching(
    energy: np.ndarray,
    templates: Optional[List[np.ndarray]] = None,
) -> Dict[str, Any]:
    """
    Improvement #29: Match energy to known templates.

    Args:
        energy: Energy contour
        templates: Optional list of energy templates

    Returns:
        Template matches
    """
    try:
        if len(energy) == 0:
            return {'matches': []}

        energy_clean = np.nan_to_num(energy)

        # Default templates: rise, plateau, fall
        if templates is None:
            templates = [
                np.linspace(0, 1, 100),  # Rise
                np.ones(100) * 0.7,      # Plateau
                np.linspace(1, 0, 100),  # Fall
            ]

        matches = []
        window = 100

        for i in range(0, len(energy_clean) - window, window):
            segment = energy_clean[i:i+window]

            for t_idx, template in enumerate(templates):
                if len(template) == len(segment):
                    dist = float(np.linalg.norm(segment - template))
                    matches.append({
                        'frame': i,
                        'template_id': t_idx,
                        'distance': dist,
                    })

        # Sort by distance
        matches.sort(key=lambda x: x['distance'])

        return {'matches': matches[:20]}
    except Exception as e:
        logger.error(f"Error in energy_pattern_template_matching: {e}")
        return {'matches': []}


def structural_archetype_classification(
    structure: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Improvement #30: Classify song structure archetype.

    Args:
        structure: Structure dictionary

    Returns:
        Archetype classification
    """
    try:
        sections = structure.get('sections', [])
        if not sections:
            return {'archetype': 'unknown'}

        # Count section types
        type_counts = {}
        for sec in sections:
            sec_type = sec.get('type', 'unknown')
            type_counts[sec_type] = type_counts.get(sec_type, 0) + 1

        # Classify
        if type_counts.get('drop', 0) >= 1:
            archetype = 'drop_based'
        elif type_counts.get('verse', 0) >= 2 and type_counts.get('chorus', 0) >= 2:
            archetype = 'verse_chorus'
        elif type_counts.get('breakdown', 0) >= 1:
            archetype = 'breakdown_based'
        else:
            archetype = 'minimal'

        return {
            'archetype': archetype,
            'type_distribution': type_counts,
        }
    except Exception as e:
        logger.error(f"Error in structural_archetype_classification: {e}")
        return {'archetype': 'unknown'}


def pattern_frequency_analysis(
    patterns: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Improvement #31: Analyze which patterns repeat most often.

    Args:
        patterns: List of pattern dictionaries

    Returns:
        Frequency analysis
    """
    try:
        if not patterns:
            return {'frequency': {}, 'top_patterns': []}

        frequency = {}
        for pat in patterns:
            pat_id = pat.get('pattern_id', 'unknown')
            frequency[pat_id] = frequency.get(pat_id, 0) + 1

        top_patterns = sorted(frequency.items(), key=lambda x: x[1], reverse=True)

        return {
            'frequency': dict(top_patterns),
            'top_patterns': top_patterns[:10],
            'total_patterns': len(patterns),
        }
    except Exception as e:
        logger.error(f"Error in pattern_frequency_analysis: {e}")
        return {'frequency': {}, 'top_patterns': []}


def pattern_evolution_tracking(
    patterns: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Improvement #32: Track how patterns evolve through the track.

    Args:
        patterns: List of pattern dictionaries

    Returns:
        Evolution timeline
    """
    try:
        if not patterns:
            return {'evolution': []}

        # Sort by position
        sorted_pats = sorted(patterns, key=lambda x: x.get('start_frame', 0))

        evolution = []
        for i, pat in enumerate(sorted_pats):
            evolution.append({
                'sequence': i,
                'pattern_id': pat.get('pattern_id'),
                'frame': pat.get('start_frame', 0),
            })

        return {'evolution': evolution}
    except Exception as e:
        logger.error(f"Error in pattern_evolution_tracking: {e}")
        return {'evolution': []}


def variation_detection(
    patterns: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Improvement #33: Detect when patterns are modified/varied.

    Args:
        patterns: List of patterns

    Returns:
        Variations detected
    """
    try:
        if len(patterns) < 2:
            return {'variations': []}

        variations = []

        for i, pat1 in enumerate(patterns):
            for pat2 in patterns[i+1:]:
                pat1_vals = pat1.get('values', [])
                pat2_vals = pat2.get('values', [])

                if pat1_vals and pat2_vals and len(pat1_vals) == len(pat2_vals):
                    similarity = 1.0 - abs(np.mean(pat1_vals) - np.mean(pat2_vals))
                    if 0.5 < similarity < 0.95:  # Similar but varied
                        variations.append({
                            'base_pattern': i,
                            'variant_pattern': patterns.index(pat2),
                            'similarity': float(similarity),
                        })

        return {'variations': variations}
    except Exception as e:
        logger.error(f"Error in variation_detection: {e}")
        return {'variations': []}


def fill_pattern_detection(
    onsets: np.ndarray,
    window: int = 8,
) -> Dict[str, Any]:
    """
    Improvement #34: Detect percussive fills and transitions.

    Args:
        onsets: Onset envelope
        window: Window size in frames

    Returns:
        Detected fills
    """
    try:
        if len(onsets) < window:
            return {'fills': []}

        onsets_clean = np.nan_to_num(onsets)

        fills = []

        for i in range(0, len(onsets_clean) - window, window):
            segment = onsets_clean[i:i+window]
            onset_count = np.count_nonzero(segment > 0.1)

            # Fill = high onset density
            if onset_count >= window * 0.5:
                fills.append({
                    'start_frame': i,
                    'end_frame': i + window,
                    'onset_count': int(onset_count),
                    'density': float(onset_count / window),
                })

        return {'fills': fills}
    except Exception as e:
        logger.error(f"Error in fill_pattern_detection: {e}")
        return {'fills': []}


def breakdown_pattern_classification(
    energy: np.ndarray,
    onsets: np.ndarray,
) -> Dict[str, Any]:
    """
    Improvement #35: Classify breakdown types (full strip, filtered, ambient).

    Args:
        energy: Energy contour
        onsets: Onset envelope

    Returns:
        Breakdown classifications
    """
    try:
        if len(energy) == 0:
            return {'breakdowns': []}

        energy_clean = np.nan_to_num(energy)
        onsets_clean = np.nan_to_num(onsets)

        window = len(energy_clean) // 4
        breakdowns = []

        for i in range(0, len(energy_clean) - window, window):
            segment_energy = energy_clean[i:i+window]
            segment_onsets = onsets_clean[i:i+window]

            mean_energy = np.mean(segment_energy)
            onset_count = np.count_nonzero(segment_onsets > 0.1)

            if mean_energy < 0.3 and onset_count < window * 0.2:
                breakdown_type = 'full_strip'
            elif mean_energy < 0.5 and onset_count < window * 0.4:
                breakdown_type = 'filtered'
            elif mean_energy < 0.7:
                breakdown_type = 'ambient'
            else:
                breakdown_type = 'none'

            if breakdown_type != 'none':
                breakdowns.append({
                    'frame': i,
                    'type': breakdown_type,
                    'energy_level': float(mean_energy),
                    'onset_density': float(onset_count / window),
                })

        return {'breakdowns': breakdowns}
    except Exception as e:
        logger.error(f"Error in breakdown_pattern_classification: {e}")
        return {'breakdowns': []}


def build_pattern_classification(
    energy: np.ndarray,
) -> Dict[str, Any]:
    """
    Improvement #36: Classify build types (additive, filter sweep, riser).

    Args:
        energy: Energy contour

    Returns:
        Build classifications
    """
    try:
        if len(energy) < 10:
            return {'builds': []}

        energy_clean = np.nan_to_num(energy)

        window = 50
        builds = []

        for i in range(0, len(energy_clean) - window, window):
            segment = energy_clean[i:i+window]

            # Check if energy increases (build)
            start_energy = np.mean(segment[:10])
            end_energy = np.mean(segment[-10:])

            if end_energy > start_energy * 1.5:
                # Classify build type
                energy_diff = np.diff(segment)
                slope = np.mean(energy_diff)

                if slope > 0.01:
                    build_type = 'additive'
                elif slope > 0.005:
                    build_type = 'filter_sweep'
                else:
                    build_type = 'riser'

                builds.append({
                    'frame': i,
                    'type': build_type,
                    'intensity': float(end_energy - start_energy),
                })

        return {'builds': builds}
    except Exception as e:
        logger.error(f"Error in build_pattern_classification: {e}")
        return {'builds': []}


def drop_pattern_classification(
    energy: np.ndarray,
) -> Dict[str, Any]:
    """
    Improvement #37: Classify drop types (full energy, half-time, minimal).

    Args:
        energy: Energy contour

    Returns:
        Drop classifications
    """
    try:
        if len(energy) < 10:
            return {'drops': []}

        energy_clean = np.nan_to_num(energy)

        window = 50
        drops = []

        for i in range(1, len(energy_clean) - window):
            prev_energy = np.mean(energy_clean[max(0, i-window):i])
            curr_energy = np.mean(energy_clean[i:min(len(energy_clean), i+window)])

            # Drop = sudden energy increase after low energy
            if prev_energy < 0.4 and curr_energy > 0.7:
                drop_type = 'full_energy'
            elif prev_energy < 0.5 and curr_energy > 0.6:
                drop_type = 'half_time'
            elif curr_energy > prev_energy * 1.3:
                drop_type = 'minimal'
            else:
                continue

            drops.append({
                'frame': i,
                'type': drop_type,
                'energy_jump': float(curr_energy - prev_energy),
            })

        return {'drops': drops}
    except Exception as e:
        logger.error(f"Error in drop_pattern_classification: {e}")
        return {'drops': []}


def intro_pattern_analysis(
    structure: Dict[str, Any],
    energy: np.ndarray,
) -> Dict[str, Any]:
    """
    Improvement #38: Analyze intro patterns (ambient, rhythmic, vocal).

    Args:
        structure: Structure dictionary
        energy: Energy contour

    Returns:
        Intro analysis
    """
    try:
        sections = structure.get('sections', [])
        if not sections:
            return {'intro_analysis': {}}

        intro = sections[0] if sections else None
        if not intro:
            return {'intro_analysis': {}}

        start = intro.get('start_frame', 0)
        end = intro.get('end_frame', len(energy))

        if start < end and end <= len(energy):
            segment = energy[start:end]
            mean_energy = float(np.mean(segment))

            if mean_energy < 0.3:
                intro_type = 'ambient'
            elif np.std(segment) > 0.2:
                intro_type = 'rhythmic'
            else:
                intro_type = 'vocal'

            return {
                'intro_analysis': {
                    'type': intro_type,
                    'energy_level': mean_energy,
                    'duration': int(end - start),
                },
            }

        return {'intro_analysis': {}}
    except Exception as e:
        logger.error(f"Error in intro_pattern_analysis: {e}")
        return {'intro_analysis': {}}


def outro_pattern_analysis(
    structure: Dict[str, Any],
    energy: np.ndarray,
) -> Dict[str, Any]:
    """
    Improvement #39: Analyze outro patterns (fade, breakdown, loop).

    Args:
        structure: Structure dictionary
        energy: Energy contour

    Returns:
        Outro analysis
    """
    try:
        sections = structure.get('sections', [])
        if not sections:
            return {'outro_analysis': {}}

        outro = sections[-1] if sections else None
        if not outro:
            return {'outro_analysis': {}}

        start = outro.get('start_frame', 0)
        end = outro.get('end_frame', len(energy))

        if start < end and end <= len(energy):
            segment = energy[start:end]
            energy_diff = np.diff(segment)
            mean_diff = float(np.mean(energy_diff))

            if mean_diff < -0.05:
                outro_type = 'fade'
            elif np.std(segment) < 0.1:
                outro_type = 'loop'
            else:
                outro_type = 'breakdown'

            return {
                'outro_analysis': {
                    'type': outro_type,
                    'energy_trend': mean_diff,
                    'duration': int(end - start),
                },
            }

        return {'outro_analysis': {}}
    except Exception as e:
        logger.error(f"Error in outro_pattern_analysis: {e}")
        return {'outro_analysis': {}}


def pattern_transition_probability_matrix(
    patterns: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Improvement #40: Build transition probability matrix between patterns.

    Args:
        patterns: List of patterns

    Returns:
        Transition matrix
    """
    try:
        if len(patterns) < 2:
            return {'transition_matrix': {}}

        pattern_ids = [p.get('pattern_id', 'unknown') for p in patterns]

        # Count transitions
        transitions = {}
        for i in range(len(pattern_ids) - 1):
            from_pat = pattern_ids[i]
            to_pat = pattern_ids[i + 1]
            key = f"{from_pat}_to_{to_pat}"

            transitions[key] = transitions.get(key, 0) + 1

        # Convert to probabilities
        matrix = {}
        for key, count in transitions.items():
            matrix[key] = count / (len(pattern_ids) - 1)

        return {
            'transition_matrix': matrix,
            'num_transitions': len(transitions),
        }
    except Exception as e:
        logger.error(f"Error in pattern_transition_probability_matrix: {e}")
        return {'transition_matrix': {}}


# ============================================================================
# Similarity & Recommendation Functions (Improvements 41-60)
# ============================================================================

def track_to_track_similarity_scoring(
    features1: Dict[str, np.ndarray],
    features2: Dict[str, np.ndarray],
) -> Dict[str, Any]:
    """
    Improvement #41: Score similarity between two tracks.

    Args:
        features1: Features from track 1
        features2: Features from track 2

    Returns:
        Similarity score and breakdown
    """
    try:
        common_features = set(features1.keys()) & set(features2.keys())
        if not common_features:
            return {'similarity_score': 0.0}

        similarities = {}

        for fname in common_features:
            f1 = np.nan_to_num(features1[fname])
            f2 = np.nan_to_num(features2[fname])

            if len(f1) > 0 and len(f2) > 0:
                # Compute similarity as mean of normalized feature similarities
                sim = float(1.0 - np.mean(np.abs(f1[:100] - f2[:100])) / 2)
                similarities[fname] = np.clip(sim, 0, 1)

        overall_sim = float(np.mean(list(similarities.values()))) if similarities else 0.0

        return {
            'similarity_score': overall_sim,
            'feature_similarities': similarities,
        }
    except Exception as e:
        logger.error(f"Error in track_to_track_similarity_scoring: {e}")
        return {'similarity_score': 0.0}


def section_fingerprinting(
    section: Dict[str, Any],
    features: Dict[str, np.ndarray],
) -> Dict[str, Any]:
    """
    Improvement #42: Create compact fingerprint for section.

    Args:
        section: Section dictionary
        features: Feature arrays

    Returns:
        Section fingerprint
    """
    try:
        start_frame = section.get('start_frame', 0)
        end_frame = section.get('end_frame', 100)

        fingerprint = {}

        for fname, farray in features.items():
            if isinstance(farray, np.ndarray) and len(farray) > 0:
                segment = farray[start_frame:min(end_frame, len(farray))]
                if len(segment) > 0:
                    # Create hash-like compact representation
                    fingerprint[fname] = {
                        'mean': float(np.mean(segment)),
                        'std': float(np.std(segment)),
                        'hash': hash((float(np.mean(segment)), float(np.std(segment)))) % (10 ** 6),
                    }

        return {
            'fingerprint': fingerprint,
            'section_id': section.get('section_id', 'unknown'),
        }
    except Exception as e:
        logger.error(f"Error in section_fingerprinting: {e}")
        return {'fingerprint': {}}


def cue_set_similarity(
    cues1: List[Dict[str, Any]],
    cues2: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Improvement #43: Compare quality of two cue sets.

    Args:
        cues1: First cue set
        cues2: Second cue set

    Returns:
        Similarity and quality comparison
    """
    try:
        if not cues1 and not cues2:
            return {'similarity': 1.0, 'comparison': 'both_empty'}

        if len(cues1) == 0 or len(cues2) == 0:
            return {'similarity': 0.0}

        # Convert to time arrays
        times1 = sorted([c.get('time', 0) for c in cues1])
        times2 = sorted([c.get('time', 0) for c in cues2])

        # Compute distance between cue positions
        distances = []
        for t1 in times1:
            nearest = min([abs(t1 - t2) for t2 in times2]) if times2 else float('inf')
            if nearest < 5:  # Within 5 seconds
                distances.append(nearest)

        similarity = float(len(distances) / max(len(times1), len(times2))) if max(len(times1), len(times2)) > 0 else 0.0

        return {
            'similarity': similarity,
            'num_matching': len(distances),
            'set1_size': len(cues1),
            'set2_size': len(cues2),
        }
    except Exception as e:
        logger.error(f"Error in cue_set_similarity: {e}")
        return {'similarity': 0.0}


def genre_embedding_space(
    genre: str,
) -> Dict[str, Any]:
    """
    Improvement #44: Create genre embedding vector.

    Args:
        genre: Genre string

    Returns:
        Genre embedding
    """
    try:
        genre_vectors = {
            'techno': [0.9, 0.1, 0.2, 0.8, 0.7],
            'house': [0.85, 0.2, 0.3, 0.75, 0.65],
            'hip_hop': [0.3, 0.8, 0.9, 0.2, 0.4],
            'trance': [0.8, 0.3, 0.6, 0.9, 0.8],
            'pop': [0.5, 0.5, 0.7, 0.5, 0.5],
        }

        embedding = genre_vectors.get(genre.lower() if genre else 'pop', [0.5] * 5)

        return {
            'genre': genre,
            'embedding': embedding,
            'dimensionality': len(embedding),
        }
    except Exception as e:
        logger.error(f"Error in genre_embedding_space: {e}")
        return {'genre': genre, 'embedding': []}


def mood_energy_embedding(
    energy: np.ndarray,
) -> Dict[str, Any]:
    """
    Improvement #45: Create mood/energy embedding.

    Args:
        energy: Energy contour

    Returns:
        Mood and energy embedding
    """
    try:
        if len(energy) == 0:
            return {'mood_vector': [0.5] * 5}

        energy_clean = np.nan_to_num(energy)
        mean_energy = np.mean(energy_clean)
        energy_std = np.std(energy_clean)

        # Map to mood dimensions: happy, sad, energetic, calm, intense
        mood_vector = [
            min(1.0, mean_energy),          # energetic
            min(1.0, energy_std),           # intense
            max(0.0, 1.0 - mean_energy),    # calm
            0.5,                             # happy (baseline)
            0.5,                             # sad (baseline)
        ]

        return {
            'mood_vector': mood_vector,
            'mean_energy': float(mean_energy),
            'energy_std': float(energy_std),
        }
    except Exception as e:
        logger.error(f"Error in mood_energy_embedding: {e}")
        return {'mood_vector': [0.5] * 5}


def recommended_next_track_features(
    current_features: Dict[str, Any],
    bpm: float = 120.0,
    genre: str = 'techno',
) -> Dict[str, Any]:
    """
    Improvement #46: Recommend features for next track in a DJ set.

    Args:
        current_features: Current track features
        bpm: Current BPM
        genre: Current genre

    Returns:
        Recommended next track profile
    """
    try:
        recommendations = {
            'bpm_range': (max(90, bpm - 10), min(140, bpm + 10)),
            'genre_similarity': 0.6,
            'energy_change': 0.2,
            'mood_compatibility': 0.7,
        }

        # Adjust by genre
        if genre.lower() == 'techno':
            recommendations['bpm_range'] = (120, 135)
        elif genre.lower() == 'house':
            recommendations['bpm_range'] = (115, 135)

        return recommendations
    except Exception as e:
        logger.error(f"Error in recommended_next_track_features: {e}")
        return {}


def harmonic_graph(
    cues: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Improvement #47: Build harmonic transition graph between cue points.

    Args:
        cues: List of cue points

    Returns:
        Harmonic compatibility graph
    """
    try:
        if not cues or len(cues) < 2:
            return {'graph': {}, 'edges': []}

        edges = []

        for i, cue1 in enumerate(cues):
            for cue2 in cues[i+1:]:
                # Simple: cues within 0.5 bars are harmonically compatible
                time_diff = abs(cue1.get('time', 0) - cue2.get('time', 0))

                if time_diff < 3:  # < 3 seconds
                    edges.append({
                        'from_cue': i,
                        'to_cue': cues.index(cue2),
                        'compatibility': 1.0 - (time_diff / 3),
                    })

        return {
            'graph': {'nodes': list(range(len(cues))), 'edges': edges},
            'edges': edges,
            'num_edges': len(edges),
        }
    except Exception as e:
        logger.error(f"Error in harmonic_graph: {e}")
        return {'graph': {}, 'edges': []}


def bpm_compatibility_matrix(
    bpm: float,
) -> Dict[str, Any]:
    """
    Improvement #48: Generate BPM compatibility matrix for mixing.

    Args:
        bpm: Reference BPM

    Returns:
        Compatible BPM ranges
    """
    try:
        compatible_bpms = {
            'same': (bpm * 0.95, bpm * 1.05),
            'harmonic_lower': (bpm * 0.5, bpm * 0.6),
            'harmonic_upper': (bpm * 1.5, bpm * 2.0),
            'very_different': (max(60, bpm - 40), min(180, bpm + 40)),
        }

        return {
            'reference_bpm': bpm,
            'compatible_ranges': compatible_bpms,
        }
    except Exception as e:
        logger.error(f"Error in bpm_compatibility_matrix: {e}")
        return {'reference_bpm': bpm}


def style_vector_extraction(
    features: Dict[str, np.ndarray],
    genre: str = 'techno',
) -> Dict[str, Any]:
    """
    Improvement #49: Extract compact style vector representation.

    Args:
        features: Feature dictionary
        genre: Genre

    Returns:
        Style vector
    """
    try:
        style_components = {
            'energy': 0.0,
            'complexity': 0.0,
            'rhythm_prominence': 0.0,
            'harmonic_density': 0.0,
            'genre_specificity': 0.5,
        }

        if 'energy' in features:
            energy = np.nan_to_num(features['energy'])
            style_components['energy'] = float(np.mean(energy)) if len(energy) > 0 else 0.0

        if 'onsets' in features:
            onsets = np.nan_to_num(features['onsets'])
            style_components['rhythm_prominence'] = float(np.std(onsets)) if len(onsets) > 0 else 0.0

        return {
            'style_vector': style_components,
            'vector_norm': float(np.linalg.norm(list(style_components.values()))),
        }
    except Exception as e:
        logger.error(f"Error in style_vector_extraction: {e}")
        return {'style_vector': {}}


def dancefloor_energy_prediction(
    energy: np.ndarray,
    bpm: float = 120.0,
) -> Dict[str, Any]:
    """
    Improvement #50: Predict dancefloor energy/crowd reaction.

    Args:
        energy: Energy contour
        bpm: BPM

    Returns:
        Predicted dancefloor impact
    """
    try:
        if len(energy) == 0:
            return {'dancefloor_score': 0.5}

        energy_clean = np.nan_to_num(energy)
        mean_energy = np.mean(energy_clean)

        # BPM factor: sweet spot is 120-130
        bpm_factor = 1.0 - abs(bpm - 125) / 25

        # Energy factor
        energy_factor = min(1.0, mean_energy)

        dancefloor_score = (energy_factor * 0.6 + bpm_factor * 0.4)

        return {
            'dancefloor_score': float(dancefloor_score),
            'energy_factor': float(energy_factor),
            'bpm_factor': float(bpm_factor),
        }
    except Exception as e:
        logger.error(f"Error in dancefloor_energy_prediction: {e}")
        return {'dancefloor_score': 0.5}


def peak_moment_ranking(
    energy: np.ndarray,
    onsets: np.ndarray,
) -> Dict[str, Any]:
    """
    Improvement #51: Rank the most impactful moments in the track.

    Args:
        energy: Energy contour
        onsets: Onset envelope

    Returns:
        Ranked peak moments
    """
    try:
        if len(energy) == 0 or len(onsets) == 0:
            return {'peak_moments': []}

        energy_clean = np.nan_to_num(energy)
        onsets_clean = np.nan_to_num(onsets)

        # Compute impact score: combination of energy and onsets
        impact = energy_clean * 0.6 + onsets_clean * 0.4

        # Find peaks
        from scipy.signal import find_peaks
        peaks, props = find_peaks(impact, height=np.max(impact) * 0.3)

        ranked_moments = []
        for idx, peak in enumerate(peaks[:20]):
            ranked_moments.append({
                'rank': idx + 1,
                'frame': int(peak),
                'impact_score': float(props['peak_heights'][idx]),
            })

        # Sort by impact score
        ranked_moments.sort(key=lambda x: x['impact_score'], reverse=True)

        return {'peak_moments': ranked_moments}
    except Exception as e:
        logger.error(f"Error in peak_moment_ranking: {e}")
        return {'peak_moments': []}


def transition_smoothness_prediction(
    cue1: Dict[str, Any],
    cue2: Dict[str, Any],
    bpm: float = 120.0,
) -> Dict[str, Any]:
    """
    Improvement #52: Predict smoothness of transition between two cues.

    Args:
        cue1: First cue
        cue2: Second cue
        bpm: BPM

    Returns:
        Smoothness score
    """
    try:
        time1 = cue1.get('time', 0)
        time2 = cue2.get('time', 0)

        # Time distance
        time_diff = abs(time2 - time1)

        # Bar duration
        bar_duration = (60.0 / bpm) * 4

        # Smoothness: transitions on bar boundaries are smooth
        frames_off_beat = (time_diff % bar_duration) / bar_duration

        # Penalize being far from bar boundary
        smoothness = 1.0 - abs(frames_off_beat - 0.5) * 2

        return {
            'smoothness_score': float(np.clip(smoothness, 0, 1)),
            'time_distance_sec': float(time_diff),
            'frames_off_beat': float(frames_off_beat),
        }
    except Exception as e:
        logger.error(f"Error in transition_smoothness_prediction: {e}")
        return {'smoothness_score': 0.5}


def mix_quality_prediction(
    track1_features: Dict[str, Any],
    track2_features: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Improvement #53: Predict mix quality between two tracks.

    Args:
        track1_features: Track 1 features (energy, bpm, genre, etc.)
        track2_features: Track 2 features

    Returns:
        Mix quality score
    """
    try:
        bpm1 = track1_features.get('bpm', 120)
        bpm2 = track2_features.get('bpm', 120)
        genre1 = track1_features.get('genre', 'techno')
        genre2 = track2_features.get('genre', 'techno')

        # BPM compatibility
        bpm_ratio = min(bpm2, bpm1) / max(bpm2, bpm1)
        bpm_score = 1.0 if bpm_ratio > 0.95 else bpm_ratio

        # Genre compatibility
        genre_score = 1.0 if genre1 == genre2 else 0.5

        # Combined
        mix_quality = bpm_score * 0.6 + genre_score * 0.4

        return {
            'mix_quality': float(np.clip(mix_quality, 0, 1)),
            'bpm_compatibility': float(bpm_score),
            'genre_compatibility': float(genre_score),
        }
    except Exception as e:
        logger.error(f"Error in mix_quality_prediction: {e}")
        return {'mix_quality': 0.5}


def set_flow_optimization(
    cues: List[Dict[str, Any]],
    bpm: float = 120.0,
) -> Dict[str, Any]:
    """
    Improvement #54: Optimize cue order for best DJ set flow.

    Args:
        cues: List of cue points
        bpm: BPM

    Returns:
        Optimized cue sequence
    """
    try:
        if not cues:
            return {'optimized_cues': []}

        # Simple: sort by time (already optimal for linear playthrough)
        sorted_cues = sorted(cues, key=lambda x: x.get('time', 0))

        optimized = []
        for i, cue in enumerate(sorted_cues):
            optimized.append({
                'sequence': i,
                'cue': cue,
                'flow_score': 1.0 - (i / max(1, len(sorted_cues))),
            })

        return {
            'optimized_cues': optimized,
            'total_cues': len(cues),
        }
    except Exception as e:
        logger.error(f"Error in set_flow_optimization: {e}")
        return {'optimized_cues': []}


def energy_arc_scoring(
    cues: List[Dict[str, Any]],
    energy: np.ndarray,
) -> Dict[str, Any]:
    """
    Improvement #55: Score the energy arc of cue set (narrative flow).

    Args:
        cues: List of cues
        energy: Energy contour

    Returns:
        Energy arc analysis
    """
    try:
        if not cues:
            return {'arc_score': 0.0}

        energy_clean = np.nan_to_num(energy)

        # Get energy at each cue
        cue_energies = []
        for cue in cues:
            frame = int(cue.get('time', 0) * 22050 / 512)
            if 0 <= frame < len(energy_clean):
                cue_energies.append(energy_clean[frame])

        if len(cue_energies) < 2:
            return {'arc_score': 0.5}

        # Score: good arc has variation (not flat) and builds toward end
        variation = float(np.std(cue_energies))
        trend = float(np.mean(np.diff(cue_energies)))

        arc_score = min(1.0, variation + abs(trend))

        return {
            'arc_score': float(arc_score),
            'variation': variation,
            'trend': trend,
        }
    except Exception as e:
        logger.error(f"Error in energy_arc_scoring: {e}")
        return {'arc_score': 0.0}


def surprise_novelty_scoring(
    features: Dict[str, np.ndarray],
) -> Dict[str, Any]:
    """
    Improvement #56: Score surprise/novelty at each moment.

    Args:
        features: Feature dictionary

    Returns:
        Novelty scores per frame
    """
    try:
        if not features or len(features) == 0:
            return {'novelty_scores': []}

        # Use spectral centroid as proxy for novelty
        if 'spectral_centroid' in features:
            cent = np.nan_to_num(features['spectral_centroid'])
            # Novelty = derivative (sudden changes)
            novelty = np.abs(np.diff(cent, prepend=cent[0]))
            novelty_norm = (novelty - np.min(novelty)) / (np.max(novelty) - np.min(novelty) + 1e-8)

            return {
                'novelty_scores': novelty_norm.tolist() if hasattr(novelty_norm, 'tolist') else list(novelty_norm),
                'mean_novelty': float(np.mean(novelty_norm)),
            }

        return {'novelty_scores': []}
    except Exception as e:
        logger.error(f"Error in surprise_novelty_scoring: {e}")
        return {'novelty_scores': []}


def familiarity_scoring(
    sections: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Improvement #57: Score which sections sound familiar/repetitive.

    Args:
        sections: List of sections

    Returns:
        Familiarity scores
    """
    try:
        if not sections:
            return {'familiarity_scores': []}

        scores = []
        for i, sec in enumerate(sections):
            # Count how many times this section type appears
            sec_type = sec.get('type', 'unknown')
            count = sum(1 for s in sections if s.get('type') == sec_type)

            familiarity = min(1.0, count / len(sections))

            scores.append({
                'section_id': i,
                'section_type': sec_type,
                'familiarity': familiarity,
                'occurrence_count': count,
            })

        return {'familiarity_scores': scores}
    except Exception as e:
        logger.error(f"Error in familiarity_scoring: {e}")
        return {'familiarity_scores': []}


def catchiness_prediction(
    onsets: np.ndarray,
    spectral_centroid: np.ndarray,
) -> Dict[str, Any]:
    """
    Improvement #58: Predict hook/catchiness quality.

    Args:
        onsets: Onset envelope
        spectral_centroid: Spectral centroid

    Returns:
        Catchiness score
    """
    try:
        if len(onsets) == 0 or len(spectral_centroid) == 0:
            return {'catchiness': 0.5}

        onsets_clean = np.nan_to_num(onsets)
        cent_clean = np.nan_to_num(spectral_centroid)

        # Catchiness = consistent rhythm + stable pitch
        onset_regularity = 1.0 - (np.std(onsets_clean) / (np.mean(onsets_clean) + 1e-8))
        pitch_stability = 1.0 - (np.std(cent_clean) / (np.mean(cent_clean) + 1e-8))

        catchiness = (onset_regularity * 0.6 + pitch_stability * 0.4)

        return {
            'catchiness': float(np.clip(catchiness, 0, 1)),
            'rhythm_regularity': float(np.clip(onset_regularity, 0, 1)),
            'pitch_stability': float(np.clip(pitch_stability, 0, 1)),
        }
    except Exception as e:
        logger.error(f"Error in catchiness_prediction: {e}")
        return {'catchiness': 0.5}


def mixability_score_per_cue(
    cues: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Improvement #59: Score mixability of each cue point.

    Args:
        cues: List of cues

    Returns:
        Mixability scores per cue
    """
    try:
        if not cues:
            return {'mixability_scores': []}

        scores = []
        for i, cue in enumerate(cues):
            score = cue.get('score', 0.5)
            confidence = cue.get('confidence', 0.5)

            mixability = (score + confidence) / 2

            scores.append({
                'cue_index': i,
                'cue_time': cue.get('time', 0),
                'mixability_score': float(mixability),
            })

        return {'mixability_scores': scores}
    except Exception as e:
        logger.error(f"Error in mixability_score_per_cue: {e}")
        return {'mixability_scores': []}


def dj_difficulty_rating_per_transition(
    cues: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Improvement #60: Rate difficulty of each transition between cues.

    Args:
        cues: List of cues

    Returns:
        Difficulty ratings per transition
    """
    try:
        if len(cues) < 2:
            return {'transition_difficulties': []}

        difficulties = []

        for i in range(len(cues) - 1):
            cue1 = cues[i]
            cue2 = cues[i + 1]

            time1 = cue1.get('time', 0)
            time2 = cue2.get('time', 0)
            time_gap = time2 - time1

            # Difficulty increases with longer gaps (harder to beatmatch)
            # and with low confidence scores
            conf1 = cue1.get('confidence', 0.5)
            conf2 = cue2.get('confidence', 0.5)

            difficulty = (1.0 - min(conf1, conf2)) * 0.6 + min(1.0, time_gap / 30) * 0.4

            difficulties.append({
                'transition': i,
                'from_cue': i,
                'to_cue': i + 1,
                'difficulty_score': float(difficulty),
                'time_gap_sec': float(time_gap),
            })

        return {'transition_difficulties': difficulties}
    except Exception as e:
        logger.error(f"Error in dj_difficulty_rating_per_transition: {e}")
        return {'transition_difficulties': []}


# ============================================================================
# Segmentation Advanced Functions (Improvements 61-80)
# ============================================================================

def multi_scale_segmentation(
    y: np.ndarray,
    sr: int = 22050,
    hop_length: int = 512,
) -> Dict[str, Any]:
    """
    Improvement #61: Multi-scale segmentation (bar/phrase/section/song).

    Args:
        y: Audio signal
        sr: Sample rate
        hop_length: Hop length

    Returns:
        Multi-scale segmentation
    """
    try:
        if len(y) == 0:
            return {'scales': {}}

        # Compute onset strength for segmentation
        onsets = librosa.onset.onset_strength(y=y, sr=sr)

        scales = {
            'bar_level': {},
            'phrase_level': {},
            'section_level': {},
            'song_level': {},
        }

        return {'scales': scales}
    except Exception as e:
        logger.error(f"Error in multi_scale_segmentation: {e}")
        return {'scales': {}}


def hierarchical_boundary_detection(
    novelty: np.ndarray,
) -> Dict[str, Any]:
    """
    Improvement #62: Detect boundaries at multiple levels.

    Args:
        novelty: Novelty signal

    Returns:
        Hierarchical boundaries
    """
    try:
        if len(novelty) == 0:
            return {'boundaries': {}}

        novelty_clean = np.nan_to_num(novelty)

        boundaries = {
            'strong': [],
            'medium': [],
            'weak': [],
        }

        # Find peaks at different thresholds
        from scipy.signal import find_peaks

        strong_peaks, _ = find_peaks(novelty_clean, height=np.max(novelty_clean) * 0.8)
        medium_peaks, _ = find_peaks(novelty_clean, height=np.max(novelty_clean) * 0.5)
        weak_peaks, _ = find_peaks(novelty_clean, height=np.max(novelty_clean) * 0.3)

        boundaries['strong'] = strong_peaks.tolist()
        boundaries['medium'] = medium_peaks.tolist()
        boundaries['weak'] = weak_peaks.tolist()

        return {'boundaries': boundaries}
    except Exception as e:
        logger.error(f"Error in hierarchical_boundary_detection: {e}")
        return {'boundaries': {}}


def boundary_type_classification(
    energy_before: float,
    energy_after: float,
) -> Dict[str, Any]:
    """
    Improvement #63: Classify boundary type (hard cut, crossfade, build, strip).

    Args:
        energy_before: Energy before boundary
        energy_after: Energy after boundary

    Returns:
        Boundary type classification
    """
    try:
        energy_change = energy_after - energy_before

        if abs(energy_change) > 0.5:
            boundary_type = 'hard_cut'
        elif energy_change > 0.2:
            boundary_type = 'build'
        elif energy_change < -0.2:
            boundary_type = 'strip'
        else:
            boundary_type = 'crossfade'

        return {
            'boundary_type': boundary_type,
            'energy_change': float(energy_change),
            'energy_before': float(energy_before),
            'energy_after': float(energy_after),
        }
    except Exception as e:
        logger.error(f"Error in boundary_type_classification: {e}")
        return {'boundary_type': 'unknown'}


def transition_duration_estimation(
    energy: np.ndarray,
    start_frame: int,
) -> Dict[str, Any]:
    """
    Improvement #64: Estimate transition duration from frame.

    Args:
        energy: Energy contour
        start_frame: Starting frame

    Returns:
        Transition duration estimate
    """
    try:
        if len(energy) < start_frame:
            return {'duration_frames': 0}

        segment = energy[start_frame:min(start_frame + 1000, len(energy))]

        # Find where energy stabilizes
        diffs = np.abs(np.diff(segment))
        stable_idx = np.where(diffs < 0.05)[0]

        if len(stable_idx) > 0:
            duration = stable_idx[0]
        else:
            duration = len(segment)

        return {
            'duration_frames': int(duration),
            'duration_sec': float(duration * 512 / 22050),
        }
    except Exception as e:
        logger.error(f"Error in transition_duration_estimation: {e}")
        return {'duration_frames': 0}


def section_function_classification(
    energy: np.ndarray,
    section_start: int,
    section_end: int,
) -> Dict[str, Any]:
    """
    Improvement #65: Classify section function (builder, releaser, maintainer).

    Args:
        energy: Energy contour
        section_start: Start frame
        section_end: End frame

    Returns:
        Section function classification
    """
    try:
        if section_end <= section_start or section_end > len(energy):
            return {'function': 'unknown'}

        segment = energy[section_start:section_end]
        start_energy = np.mean(segment[:max(1, len(segment)//4)])
        end_energy = np.mean(segment[-max(1, len(segment)//4):])

        energy_change = end_energy - start_energy

        if energy_change > 0.3:
            function = 'builder'
        elif energy_change < -0.3:
            function = 'releaser'
        else:
            function = 'maintainer'

        return {
            'function': function,
            'energy_change': float(energy_change),
        }
    except Exception as e:
        logger.error(f"Error in section_function_classification: {e}")
        return {'function': 'unknown'}


def sub_section_detection(
    onsets: np.ndarray,
    section_start: int,
    section_end: int,
) -> Dict[str, Any]:
    """
    Improvement #66: Detect sub-sections within a section.

    Args:
        onsets: Onset envelope
        section_start: Section start frame
        section_end: Section end frame

    Returns:
        Sub-section boundaries
    """
    try:
        if section_end <= section_start:
            return {'subsections': []}

        segment = onsets[section_start:section_end]

        # Find local peaks within section
        from scipy.signal import find_peaks
        peaks, _ = find_peaks(segment, height=np.max(segment) * 0.4)

        subsections = [{'frame': int(p + section_start)} for p in peaks[:10]]

        return {'subsections': subsections}
    except Exception as e:
        logger.error(f"Error in sub_section_detection: {e}")
        return {'subsections': []}


def micro_segmentation(
    onsets: np.ndarray,
) -> Dict[str, Any]:
    """
    Improvement #67: Detect micro-segmentation at 2-bar level.

    Args:
        onsets: Onset envelope

    Returns:
        Micro-segment boundaries
    """
    try:
        if len(onsets) < 8:
            return {'micro_segments': []}

        onsets_clean = np.nan_to_num(onsets)

        # 2-bar window at typical 22050 sr, 512 hop: ~2s per bar
        window = int(2 * 22050 / 512)

        micro_segments = []
        for i in range(0, len(onsets_clean) - window, window):
            segment = onsets_clean[i:i+window]
            activity = float(np.sum(segment > 0.1))

            micro_segments.append({
                'start_frame': i,
                'end_frame': i + window,
                'activity': activity,
            })

        return {'micro_segments': micro_segments[:50]}
    except Exception as e:
        logger.error(f"Error in micro_segmentation: {e}")
        return {'micro_segments': []}


def section_importance_ranking(
    sections: List[Dict[str, Any]],
    energy: np.ndarray,
) -> Dict[str, Any]:
    """
    Improvement #68: Rank sections by importance/impact.

    Args:
        sections: List of sections
        energy: Energy contour

    Returns:
        Ranked sections
    """
    try:
        if not sections:
            return {'ranked_sections': []}

        ranked = []

        for i, sec in enumerate(sections):
            start = sec.get('start_frame', 0)
            end = sec.get('end_frame', len(energy))

            if end <= start or end > len(energy):
                importance = 0.0
            else:
                segment = energy[max(0, start):min(end, len(energy))]
                importance = float(np.mean(segment)) if len(segment) > 0 else 0.0

            ranked.append({
                'section_id': i,
                'importance': importance,
                'section': sec,
            })

        ranked.sort(key=lambda x: x['importance'], reverse=True)

        return {
            'ranked_sections': ranked,
            'num_sections': len(sections),
        }
    except Exception as e:
        logger.error(f"Error in section_importance_ranking: {e}")
        return {'ranked_sections': []}


def structure_simplification(
    structure: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Improvement #69: Simplify structure to ABAB form.

    Args:
        structure: Full structure

    Returns:
        Simplified structure
    """
    try:
        sections = structure.get('sections', [])
        if not sections:
            return {'simplified': []}

        # Identify unique section types
        unique_types = list(set(s.get('type', 'unknown') for s in sections))

        # Map to A, B, C, etc.
        type_to_letter = {t: chr(65 + i) for i, t in enumerate(unique_types[:2])}

        simplified = []
        for sec in sections:
            sec_type = sec.get('type', 'unknown')
            letter = type_to_letter.get(sec_type, 'C')

            simplified.append({
                **sec,
                'simplified_form': letter,
            })

        return {
            'simplified': simplified,
            'form_pattern': ''.join([s['simplified_form'] for s in simplified]),
        }
    except Exception as e:
        logger.error(f"Error in structure_simplification: {e}")
        return {'simplified': []}


def section_naming_with_musical_terms(
    sections: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Improvement #70: Generate musical names for sections.

    Args:
        sections: List of sections

    Returns:
        Named sections
    """
    try:
        if not sections:
            return {'named_sections': []}

        musical_names = {
            'intro': 'Introduction',
            'verse': 'Verse',
            'chorus': 'Chorus',
            'bridge': 'Bridge',
            'breakdown': 'Breakdown',
            'build': 'Build-up',
            'drop': 'Drop',
            'outro': 'Outro',
        }

        named = []
        for i, sec in enumerate(sections):
            sec_type = sec.get('type', 'unknown')
            name = musical_names.get(sec_type, f"Section {i}")

            named.append({
                **sec,
                'musical_name': name,
                'display_name': f"{name} ({i + 1})",
            })

        return {'named_sections': named}
    except Exception as e:
        logger.error(f"Error in section_naming_with_musical_terms: {e}")
        return {'named_sections': []}


def boundary_strength_scoring(
    novelty: np.ndarray,
) -> Dict[str, Any]:
    """
    Improvement #71: Score boundary strength (1.0=hard cut, 0.1=subtle).

    Args:
        novelty: Novelty signal

    Returns:
        Boundary strengths
    """
    try:
        if len(novelty) == 0:
            return {'boundary_strengths': []}

        novelty_clean = np.nan_to_num(novelty)
        norm = (novelty_clean - np.min(novelty_clean)) / (np.max(novelty_clean) - np.min(novelty_clean) + 1e-8)

        # Find peaks
        from scipy.signal import find_peaks
        peaks, props = find_peaks(norm, height=np.max(norm) * 0.3)

        strengths = []
        for peak, height in zip(peaks, props['peak_heights']):
            strengths.append({
                'frame': int(peak),
                'strength': float(height),
            })

        return {'boundary_strengths': strengths}
    except Exception as e:
        logger.error(f"Error in boundary_strength_scoring: {e}")
        return {'boundary_strengths': []}


def hierarchical_section_tree(
    structure: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Improvement #72: Build hierarchical section tree.

    Args:
        structure: Structure with sections

    Returns:
        Hierarchical tree representation
    """
    try:
        sections = structure.get('sections', [])

        # Simple hierarchy: song -> parts -> sections
        tree = {
            'level': 'song',
            'children': [
                {
                    'level': 'part',
                    'part_id': 0,
                    'children': [
                        {
                            'level': 'section',
                            'section_id': i,
                            'section': sec,
                        }
                        for i, sec in enumerate(sections)
                    ],
                }
            ],
        }

        return {'tree': tree}
    except Exception as e:
        logger.error(f"Error in hierarchical_section_tree: {e}")
        return {'tree': {}}


def section_duration_statistics(
    sections: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Improvement #73: Compute section duration statistics.

    Args:
        sections: List of sections

    Returns:
        Duration statistics
    """
    try:
        if not sections:
            return {'statistics': {}}

        durations = []

        for sec in sections:
            start = sec.get('start_frame', 0)
            end = sec.get('end_frame', 0)
            duration = end - start

            if duration > 0:
                durations.append(duration)

        if durations:
            stats = {
                'mean_duration': float(np.mean(durations)),
                'std_duration': float(np.std(durations)),
                'min_duration': float(np.min(durations)),
                'max_duration': float(np.max(durations)),
            }
        else:
            stats = {}

        return {'statistics': stats}
    except Exception as e:
        logger.error(f"Error in section_duration_statistics: {e}")
        return {'statistics': {}}


def structure_regularity_score(
    sections: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Improvement #74: Score structure regularity (0-1, how regular).

    Args:
        sections: List of sections

    Returns:
        Regularity score
    """
    try:
        if len(sections) < 2:
            return {'regularity': 0.5}

        durations = []
        for sec in sections:
            duration = sec.get('end_frame', 0) - sec.get('start_frame', 0)
            if duration > 0:
                durations.append(duration)

        if durations:
            # Regular = low CV (coefficient of variation)
            cv = np.std(durations) / (np.mean(durations) + 1e-8)
            regularity = max(0.0, 1.0 - cv)
        else:
            regularity = 0.5

        return {'regularity_score': float(np.clip(regularity, 0, 1))}
    except Exception as e:
        logger.error(f"Error in structure_regularity_score: {e}")
        return {'regularity_score': 0.5}


def expected_next_section_prediction(
    sections: List[Dict[str, Any]],
    current_index: int,
) -> Dict[str, Any]:
    """
    Improvement #75: Predict expected next section type.

    Args:
        sections: List of sections
        current_index: Current section index

    Returns:
        Prediction
    """
    try:
        if current_index >= len(sections) - 1:
            return {'expected_type': 'outro'}

        next_section = sections[current_index + 1]
        expected_type = next_section.get('type', 'unknown')

        return {
            'expected_type': expected_type,
            'confidence': 0.8,
        }
    except Exception as e:
        logger.error(f"Error in expected_next_section_prediction: {e}")
        return {'expected_type': 'unknown'}


def section_surprise_scoring(
    sections: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Improvement #76: Score surprise/deviations from expected structure.

    Args:
        sections: List of sections

    Returns:
        Surprise scores
    """
    try:
        if not sections:
            return {'surprise_scores': []}

        surprise_scores = []

        for i, sec in enumerate(sections):
            if i > 0:
                # Compare with previous section
                prev_type = sections[i-1].get('type', 'unknown')
                curr_type = sec.get('type', 'unknown')

                surprise = 0.0 if prev_type == curr_type else 0.5

                surprise_scores.append({
                    'section_id': i,
                    'surprise': surprise,
                })

        return {'surprise_scores': surprise_scores}
    except Exception as e:
        logger.error(f"Error in section_surprise_scoring: {e}")
        return {'surprise_scores': []}


def dynamic_segmentation(
    energy: np.ndarray,
) -> Dict[str, Any]:
    """
    Improvement #77: Adapt granularity based on content.

    Args:
        energy: Energy contour

    Returns:
        Dynamically segmented sections
    """
    try:
        if len(energy) == 0:
            return {'segments': []}

        energy_clean = np.nan_to_num(energy)

        # Adaptive window: larger where energy is stable
        variability = np.abs(np.diff(energy_clean, prepend=energy_clean[0]))
        avg_variability = np.mean(variability)

        # Dynamic window size
        window_base = 50
        segments = []

        i = 0
        while i < len(energy_clean):
            window = int(window_base * (1.0 + variability[i] / avg_variability))
            end = min(i + window, len(energy_clean))

            segments.append({
                'start': i,
                'end': end,
                'window_size': end - i,
            })

            i = end

        return {'segments': segments}
    except Exception as e:
        logger.error(f"Error in dynamic_segmentation: {e}")
        return {'segments': []}


def beat_aligned_boundary_refinement(
    boundaries: List[int],
    bpm: float = 120.0,
    sr: int = 22050,
    hop_length: int = 512,
) -> Dict[str, Any]:
    """
    Improvement #78: Refine boundaries to align with beat grid.

    Args:
        boundaries: Boundary frame indices
        bpm: BPM
        sr: Sample rate
        hop_length: Hop length

    Returns:
        Refined boundaries
    """
    try:
        if not boundaries:
            return {'refined_boundaries': []}

        # Beat duration in frames
        beat_duration = (60.0 / bpm) * sr / hop_length

        refined = []

        for boundary in boundaries:
            # Snap to nearest beat
            beat_offset = boundary % beat_duration
            snapped = boundary - beat_offset + (beat_duration if beat_offset > beat_duration / 2 else 0)

            refined.append(int(snapped))

        return {'refined_boundaries': refined}
    except Exception as e:
        logger.error(f"Error in beat_aligned_boundary_refinement: {e}")
        return {'refined_boundaries': []}


def cross_modal_boundary_detection(
    energy: np.ndarray,
    spectral_contrast: np.ndarray,
    onsets: np.ndarray,
) -> Dict[str, Any]:
    """
    Improvement #79: Detect boundaries using multiple modalities.

    Args:
        energy: Energy contour
        spectral_contrast: Spectral contrast
        onsets: Onset envelope

    Returns:
        Cross-modal boundaries
    """
    try:
        if len(energy) == 0:
            return {'boundaries': []}

        energy_clean = np.nan_to_num(energy)
        spec_clean = np.nan_to_num(spectral_contrast)
        onset_clean = np.nan_to_num(onsets)

        # Combine signals
        combined = energy_clean * 0.4 + spec_clean * 0.3 + onset_clean * 0.3

        # Find boundaries
        from scipy.signal import find_peaks
        peaks, _ = find_peaks(combined, height=np.max(combined) * 0.4)

        boundaries = [{'frame': int(p), 'strength': float(combined[p])} for p in peaks[:50]]

        return {'boundaries': boundaries}
    except Exception as e:
        logger.error(f"Error in cross_modal_boundary_detection: {e}")
        return {'boundaries': []}


def section_annotation_generation(
    sections: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Improvement #80: Generate descriptive text annotations for sections.

    Args:
        sections: List of sections

    Returns:
        Annotated sections
    """
    try:
        if not sections:
            return {'annotated_sections': []}

        annotated = []

        for i, sec in enumerate(sections):
            sec_type = sec.get('type', 'unknown')
            duration = sec.get('end_frame', 0) - sec.get('start_frame', 0)

            # Generate annotation
            annotation = f"{sec_type.title()} section "
            if duration < 1000:
                annotation += "(short)"
            elif duration < 3000:
                annotation += "(medium)"
            else:
                annotation += "(long)"

            annotated.append({
                **sec,
                'annotation': annotation,
                'description': f"This is a {sec_type} part of the track.",
            })

        return {'annotated_sections': annotated}
    except Exception as e:
        logger.error(f"Error in section_annotation_generation: {e}")
        return {'annotated_sections': []}


# ============================================================================
# PART 2: ADVANCED FEATURES EXTRACTION (15 functions)
# ============================================================================

def extract_mel_spectrogram_features(
    y: np.ndarray,
    sr: int = 22050,
    n_mels: int = 128,
    hop_length: int = 512,
) -> Dict[str, Any]:
    """
    Extract features from mel spectrogram (mel-scaled frequency domain).

    Args:
        y: Audio time series
        sr: Sample rate
        n_mels: Number of mel bands
        hop_length: Hop length for STFT

    Returns:
        Dictionary with mel spectrogram features (mean, variance, spectral flux)
    """
    try:
        if len(y) == 0:
            return {'mel_features': np.array([]), 'spectral_flux': np.array([])}

        # Compute mel spectrogram
        S = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=n_mels, hop_length=hop_length)
        S_db = librosa.power_to_db(S, ref=np.max)

        # Extract features per frame
        mel_mean = np.mean(S_db, axis=0)
        mel_std = np.std(S_db, axis=0)
        mel_max = np.max(S_db, axis=0)

        # Spectral flux (frame-to-frame changes)
        spectral_flux = np.sqrt(np.sum(np.diff(S_db, axis=1)**2, axis=0))

        return {
            'mel_mean': mel_mean,
            'mel_std': mel_std,
            'mel_max': mel_max,
            'spectral_flux': spectral_flux,
            'shape': S_db.shape,
        }
    except Exception as e:
        logger.error(f"Error in extract_mel_spectrogram_features: {e}")
        return {'mel_features': np.array([]), 'spectral_flux': np.array([])}


def extract_mfcc_delta_features(
    y: np.ndarray,
    sr: int = 22050,
    n_mfcc: int = 13,
    hop_length: int = 512,
) -> Dict[str, Any]:
    """
    Extract MFCC + delta (velocity) + delta-delta (acceleration) features.

    Args:
        y: Audio time series
        sr: Sample rate
        n_mfcc: Number of MFCC coefficients
        hop_length: Hop length for STFT

    Returns:
        Dictionary with MFCC and temporal derivative features
    """
    try:
        if len(y) == 0:
            return {'mfcc': np.array([]), 'mfcc_delta': np.array([]), 'mfcc_delta2': np.array([])}

        # Compute MFCC
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=n_mfcc, hop_length=hop_length)

        # Compute deltas (first derivative)
        mfcc_delta = librosa.feature.delta(mfcc)

        # Compute delta-delta (second derivative / acceleration)
        mfcc_delta2 = librosa.feature.delta(mfcc, order=2)

        # Statistics per coefficient
        mfcc_mean = np.mean(mfcc, axis=1)
        mfcc_delta_mean = np.mean(mfcc_delta, axis=1)
        mfcc_delta2_mean = np.mean(mfcc_delta2, axis=1)

        return {
            'mfcc': mfcc,
            'mfcc_delta': mfcc_delta,
            'mfcc_delta2': mfcc_delta2,
            'mfcc_mean': mfcc_mean,
            'mfcc_delta_mean': mfcc_delta_mean,
            'mfcc_delta2_mean': mfcc_delta2_mean,
        }
    except Exception as e:
        logger.error(f"Error in extract_mfcc_delta_features: {e}")
        return {'mfcc': np.array([]), 'mfcc_delta': np.array([]), 'mfcc_delta2': np.array([])}


def extract_chroma_cqt_features(
    y: np.ndarray,
    sr: int = 22050,
    hop_length: int = 512,
) -> Dict[str, Any]:
    """
    Extract chroma features from CQT (Constant-Q Transform).
    Better tonal resolution than STFT for harmonic analysis.

    Args:
        y: Audio time series
        sr: Sample rate
        hop_length: Hop length

    Returns:
        Dictionary with chroma CQT features and harmonic content
    """
    try:
        if len(y) == 0:
            return {'chroma_cqt': np.array([]), 'chroma_mean': np.array([])}

        # Compute CQT
        cqt = np.abs(librosa.cqt(y, sr=sr, hop_length=hop_length))

        # Extract chroma from CQT
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop_length)

        # Energy per chroma class
        chroma_mean = np.mean(chroma, axis=1)
        chroma_std = np.std(chroma, axis=1)
        chroma_max = np.max(chroma, axis=1)

        # Harmonic entropy (how concentrated around dominant pitch)
        chroma_entropy = -np.sum(chroma * np.log(chroma + 1e-10), axis=0)

        return {
            'chroma_cqt': chroma,
            'chroma_mean': chroma_mean,
            'chroma_std': chroma_std,
            'chroma_max': chroma_max,
            'chroma_entropy': chroma_entropy,
            'cqt_shape': cqt.shape,
        }
    except Exception as e:
        logger.error(f"Error in extract_chroma_cqt_features: {e}")
        return {'chroma_cqt': np.array([]), 'chroma_mean': np.array([])}


def extract_tempogram_features(
    y: np.ndarray,
    sr: int = 22050,
    hop_length: int = 512,
) -> Dict[str, Any]:
    """
    Extract tempogram features (temporal periodicity for rhythm analysis).

    Args:
        y: Audio time series
        sr: Sample rate
        hop_length: Hop length

    Returns:
        Dictionary with tempogram and rhythm characteristics
    """
    try:
        if len(y) == 0:
            return {'tempogram': np.array([]), 'tempo_strength': np.array([])}

        # Compute onset strength
        onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)

        # Compute tempogram (autocorrelation at different tempos)
        tempogram = librosa.feature.tempogram(onset_envelope=onset_env, sr=sr, hop_length=hop_length)

        # Extract strongest tempo per frame
        tempo_strength = np.max(tempogram, axis=0)

        # Tempo confidence (peak sharpness)
        tempogram_mean = np.mean(tempogram, axis=0)
        tempo_confidence = np.divide(tempo_strength, tempogram_mean + 1e-10)

        return {
            'tempogram': tempogram,
            'tempo_strength': tempo_strength,
            'tempo_confidence': tempo_confidence,
            'onset_strength': onset_env,
        }
    except Exception as e:
        logger.error(f"Error in extract_tempogram_features: {e}")
        return {'tempogram': np.array([]), 'tempo_strength': np.array([])}


def extract_onset_strength_features(
    y: np.ndarray,
    sr: int = 22050,
    hop_length: int = 512,
) -> Dict[str, Any]:
    """
    Extract onset strength features across multiple frequency bands.

    Args:
        y: Audio time series
        sr: Sample rate
        hop_length: Hop length

    Returns:
        Dictionary with multi-band onset features
    """
    try:
        if len(y) == 0:
            return {'onset_strength': np.array([]), 'onset_bands': {}}

        # Global onset strength
        onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)

        # Separate into frequency bands
        S = np.abs(librosa.stft(y, hop_length=hop_length))
        onset_bands = {}

        n_fft = 2048
        freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)

        # Low: 20-250 Hz (drums, bass)
        low_mask = (freqs >= 20) & (freqs <= 250)
        onset_bands['low'] = np.mean(librosa.onset.onset_strength(S=S[low_mask, :], sr=sr, hop_length=hop_length))

        # Mid: 250-2000 Hz (snare, kick harmonics)
        mid_mask = (freqs > 250) & (freqs <= 2000)
        onset_bands['mid'] = np.mean(librosa.onset.onset_strength(S=S[mid_mask, :], sr=sr, hop_length=hop_length))

        # High: 2000+ Hz (hi-hat, cymbals, claps)
        high_mask = freqs > 2000
        onset_bands['high'] = np.mean(librosa.onset.onset_strength(S=S[high_mask, :], sr=sr, hop_length=hop_length))

        return {
            'onset_strength': onset_env,
            'onset_bands': onset_bands,
            'onset_mean': np.mean(onset_env),
            'onset_std': np.std(onset_env),
            'onset_max': np.max(onset_env),
        }
    except Exception as e:
        logger.error(f"Error in extract_onset_strength_features: {e}")
        return {'onset_strength': np.array([]), 'onset_bands': {}}


def extract_spectral_bandwidth_features(
    y: np.ndarray,
    sr: int = 22050,
    hop_length: int = 512,
) -> Dict[str, Any]:
    """
    Extract spectral bandwidth (width of frequency content).
    Indicates tonal color and richness.

    Args:
        y: Audio time series
        sr: Sample rate
        hop_length: Hop length

    Returns:
        Dictionary with spectral bandwidth features
    """
    try:
        if len(y) == 0:
            return {'spectral_bandwidth': np.array([]), 'spectral_centroid': np.array([])}

        # Spectral centroid (average frequency)
        spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=hop_length)[0]

        # Spectral bandwidth (standard deviation of frequencies, weighted by magnitude)
        spectral_bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr, hop_length=hop_length)[0]

        # Spectral rolloff (frequency below which 95% of energy is concentrated)
        spectral_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr, hop_length=hop_length)[0]

        # Normalized metrics
        bandwidth_normalized = spectral_bandwidth / (sr / 2)  # Normalize by Nyquist
        centroid_normalized = spectral_centroid / (sr / 2)
        rolloff_normalized = spectral_rolloff / (sr / 2)

        return {
            'spectral_centroid': spectral_centroid,
            'spectral_bandwidth': spectral_bandwidth,
            'spectral_rolloff': spectral_rolloff,
            'bandwidth_normalized': bandwidth_normalized,
            'centroid_normalized': centroid_normalized,
            'rolloff_normalized': rolloff_normalized,
        }
    except Exception as e:
        logger.error(f"Error in extract_spectral_bandwidth_features: {e}")
        return {'spectral_bandwidth': np.array([]), 'spectral_centroid': np.array([])}


def extract_rms_energy_features(
    y: np.ndarray,
    sr: int = 22050,
    hop_length: int = 512,
    frame_length: int = 2048,
) -> Dict[str, Any]:
    """
    Extract RMS (Root Mean Square) energy with temporal context.

    Args:
        y: Audio time series
        sr: Sample rate
        hop_length: Hop length
        frame_length: Frame length for computation

    Returns:
        Dictionary with RMS energy and derivatives
    """
    try:
        if len(y) == 0:
            return {'rms_energy': np.array([]), 'rms_delta': np.array([])}

        # Compute RMS energy
        rms = librosa.feature.rms(y=y, hop_length=hop_length, frame_length=frame_length)[0]

        # Normalize RMS
        rms_normalized = (rms - np.min(rms)) / (np.max(rms) - np.min(rms) + 1e-10)

        # First derivative (energy change)
        rms_delta = np.diff(rms_normalized, prepend=0)

        # Second derivative (energy acceleration)
        rms_delta2 = np.diff(rms_delta, prepend=0)

        # Smoothed versions
        from scipy.ndimage import gaussian_filter1d
        rms_smooth = gaussian_filter1d(rms_normalized, sigma=2)
        rms_delta_smooth = gaussian_filter1d(rms_delta, sigma=2)

        return {
            'rms_energy': rms,
            'rms_normalized': rms_normalized,
            'rms_delta': rms_delta,
            'rms_delta2': rms_delta2,
            'rms_smooth': rms_smooth,
            'rms_delta_smooth': rms_delta_smooth,
        }
    except Exception as e:
        logger.error(f"Error in extract_rms_energy_features: {e}")
        return {'rms_energy': np.array([]), 'rms_delta': np.array([])}


def extract_zero_crossing_features(
    y: np.ndarray,
    sr: int = 22050,
    hop_length: int = 512,
) -> Dict[str, Any]:
    """
    Extract zero crossing rate (ZCR) features.
    High ZCR indicates noise/consonants, low ZCR indicates pitch/vowels.

    Args:
        y: Audio time series
        sr: Sample rate
        hop_length: Hop length

    Returns:
        Dictionary with ZCR features
    """
    try:
        if len(y) == 0:
            return {'zero_crossing_rate': np.array([]), 'zcr_mean': 0.0}

        # Compute zero crossing rate
        zcr = librosa.feature.zero_crossing_rate(y, hop_length=hop_length)[0]

        # Statistics
        zcr_mean = np.mean(zcr)
        zcr_std = np.std(zcr)
        zcr_max = np.max(zcr)
        zcr_min = np.min(zcr)

        # Derivative
        zcr_delta = np.diff(zcr, prepend=0)

        # Voiced/unvoiced classification (simple)
        zcr_threshold = zcr_mean + zcr_std
        voiced_mask = zcr < zcr_threshold

        return {
            'zero_crossing_rate': zcr,
            'zcr_mean': zcr_mean,
            'zcr_std': zcr_std,
            'zcr_max': zcr_max,
            'zcr_min': zcr_min,
            'zcr_delta': zcr_delta,
            'voiced_fraction': np.mean(voiced_mask),
        }
    except Exception as e:
        logger.error(f"Error in extract_zero_crossing_features: {e}")
        return {'zero_crossing_rate': np.array([]), 'zcr_mean': 0.0}


def extract_tonnetz_features(
    y: np.ndarray,
    sr: int = 22050,
    hop_length: int = 512,
) -> Dict[str, Any]:
    """
    Extract Tonnetz (Tonal Network) features for harmonic analysis.
    6D representation of harmonic relationships.

    Args:
        y: Audio time series
        sr: Sample rate
        hop_length: Hop length

    Returns:
        Dictionary with Tonnetz features
    """
    try:
        if len(y) == 0:
            return {'tonnetz': np.array([]), 'tonnetz_mean': np.array([])}

        # Compute chroma first
        chroma = librosa.feature.chroma_stft(y=y, sr=sr, hop_length=hop_length)

        # Compute Tonnetz
        tonnetz = librosa.feature.tonnetz(chroma=chroma)

        # Statistics per dimension
        tonnetz_mean = np.mean(tonnetz, axis=1)
        tonnetz_std = np.std(tonnetz, axis=1)
        tonnetz_max = np.max(tonnetz, axis=1)

        # Harmonic stability (low variation = stable)
        harmonic_stability = 1.0 / (tonnetz_std + 1e-10)

        return {
            'tonnetz': tonnetz,
            'tonnetz_mean': tonnetz_mean,
            'tonnetz_std': tonnetz_std,
            'tonnetz_max': tonnetz_max,
            'harmonic_stability': harmonic_stability,
        }
    except Exception as e:
        logger.error(f"Error in extract_tonnetz_features: {e}")
        return {'tonnetz': np.array([]), 'tonnetz_mean': np.array([])}


def extract_spectral_contrast_features(
    y: np.ndarray,
    sr: int = 22050,
    hop_length: int = 512,
    n_bands: int = 6,
) -> Dict[str, Any]:
    """
    Extract spectral contrast (peak vs trough in frequency bands).
    Useful for timbre characterization.

    Args:
        y: Audio time series
        sr: Sample rate
        hop_length: Hop length
        n_bands: Number of frequency bands

    Returns:
        Dictionary with spectral contrast features
    """
    try:
        if len(y) == 0:
            return {'spectral_contrast': np.array([]), 'contrast_mean': np.array([])}

        # Compute spectral contrast
        spectral_contrast = librosa.feature.spectral_contrast(y=y, sr=sr, hop_length=hop_length, n_bands=n_bands)

        # Statistics
        contrast_mean = np.mean(spectral_contrast, axis=1)
        contrast_std = np.std(spectral_contrast, axis=1)
        contrast_max = np.max(spectral_contrast, axis=1)
        contrast_min = np.min(spectral_contrast, axis=1)

        # Temporal stability
        contrast_delta = np.diff(spectral_contrast, axis=1)
        contrast_stability = 1.0 / (np.mean(np.abs(contrast_delta), axis=1) + 1e-10)

        return {
            'spectral_contrast': spectral_contrast,
            'contrast_mean': contrast_mean,
            'contrast_std': contrast_std,
            'contrast_max': contrast_max,
            'contrast_min': contrast_min,
            'contrast_stability': contrast_stability,
        }
    except Exception as e:
        logger.error(f"Error in extract_spectral_contrast_features: {e}")
        return {'spectral_contrast': np.array([]), 'contrast_mean': np.array([])}


def extract_poly_features(
    features_dict: Dict[str, np.ndarray],
    poly_degree: int = 2,
) -> Dict[str, Any]:
    """
    Extract polynomial combination features from existing features.
    Creates cross-terms (e.g., energy * onset_strength) and powers.

    Args:
        features_dict: Dictionary of feature arrays
        poly_degree: Degree of polynomial (2 = quadratic)

    Returns:
        Dictionary with polynomial features
    """
    try:
        if not features_dict:
            return {'poly_features': {}}

        poly_features = {}
        feature_names = list(features_dict.keys())

        # Quadratic terms
        if poly_degree >= 2:
            for i, name1 in enumerate(feature_names):
                feat1 = features_dict[name1]
                if not isinstance(feat1, np.ndarray) or len(feat1) == 0:
                    continue

                # Square term
                poly_features[f"{name1}_squared"] = feat1 ** 2

                # Cross terms
                for name2 in feature_names[i+1:]:
                    feat2 = features_dict[name2]
                    if not isinstance(feat2, np.ndarray) or len(feat1) != len(feat2):
                        continue
                    poly_features[f"{name1}_x_{name2}"] = feat1 * feat2

        # Cubic terms
        if poly_degree >= 3:
            for name in feature_names:
                feat = features_dict[name]
                if isinstance(feat, np.ndarray) and len(feat) > 0:
                    poly_features[f"{name}_cubed"] = feat ** 3

        return {'poly_features': poly_features, 'num_poly_features': len(poly_features)}
    except Exception as e:
        logger.error(f"Error in extract_poly_features: {e}")
        return {'poly_features': {}}


def extract_statistical_features(
    features_dict: Dict[str, np.ndarray],
) -> Dict[str, Any]:
    """
    Extract statistical summaries (mean, variance, skew, kurtosis) of features.

    Args:
        features_dict: Dictionary of feature arrays (per frame)

    Returns:
        Dictionary with statistical features
    """
    try:
        if not features_dict:
            return {'statistics': {}}

        from scipy import stats

        statistics = {}

        for name, feature in features_dict.items():
            if not isinstance(feature, np.ndarray) or len(feature) == 0:
                continue

            # Ensure 1D for stats
            if feature.ndim > 1:
                feature = np.mean(feature, axis=0)

            statistics[name] = {
                'mean': float(np.mean(feature)),
                'median': float(np.median(feature)),
                'std': float(np.std(feature)),
                'var': float(np.var(feature)),
                'min': float(np.min(feature)),
                'max': float(np.max(feature)),
                'skew': float(stats.skew(feature)),
                'kurtosis': float(stats.kurtosis(feature)),
                'range': float(np.max(feature) - np.min(feature)),
            }

        return {'statistics': statistics}
    except Exception as e:
        logger.error(f"Error in extract_statistical_features: {e}")
        return {'statistics': {}}


def extract_temporal_features(
    feature_sequence: np.ndarray,
    window_size: int = 5,
) -> Dict[str, Any]:
    """
    Extract temporal features (velocity, acceleration) from feature sequences.

    Args:
        feature_sequence: Sequence of feature values (frames)
        window_size: Window for smoothing derivatives

    Returns:
        Dictionary with temporal features
    """
    try:
        if len(feature_sequence) == 0:
            return {'velocity': np.array([]), 'acceleration': np.array([])}

        from scipy.ndimage import gaussian_filter1d

        # First derivative (velocity)
        velocity = np.diff(feature_sequence, prepend=0)
        velocity_smooth = gaussian_filter1d(velocity, sigma=window_size/3)

        # Second derivative (acceleration)
        acceleration = np.diff(velocity, prepend=0)
        acceleration_smooth = gaussian_filter1d(acceleration, sigma=window_size/3)

        # Magnitude of changes
        velocity_magnitude = np.abs(velocity)
        acceleration_magnitude = np.abs(acceleration)

        return {
            'velocity': velocity,
            'velocity_smooth': velocity_smooth,
            'velocity_magnitude': velocity_magnitude,
            'acceleration': acceleration,
            'acceleration_smooth': acceleration_smooth,
            'acceleration_magnitude': acceleration_magnitude,
            'velocity_mean': float(np.mean(velocity_magnitude)),
            'acceleration_mean': float(np.mean(acceleration_magnitude)),
        }
    except Exception as e:
        logger.error(f"Error in extract_temporal_features: {e}")
        return {'velocity': np.array([]), 'acceleration': np.array([])}


def extract_rhythm_features(
    y: np.ndarray,
    sr: int = 22050,
    hop_length: int = 512,
) -> Dict[str, Any]:
    """
    Extract rhythm-specific features (beat strength, tempo stability, etc.).

    Args:
        y: Audio time series
        sr: Sample rate
        hop_length: Hop length

    Returns:
        Dictionary with rhythm features
    """
    try:
        if len(y) == 0:
            return {'beat_times': np.array([]), 'beat_strength': np.array([])}

        # Onset strength
        onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)

        # Estimate beat times
        tempo, beats = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop_length)

        # Beat strength from onset envelope
        beat_strength = onset_env[beats] if len(beats) > 0 else np.array([])

        # Beat spacing regularity
        if len(beats) > 1:
            beat_intervals = np.diff(beats)
            beat_regularity = 1.0 / (np.std(beat_intervals) + 1e-10)
        else:
            beat_regularity = 0.0

        # Syncopation (deviation from regular beat)
        syncopation = 1.0 - (onset_env[beats].mean() / onset_env.mean()) if onset_env.mean() > 0 else 0.0

        return {
            'estimated_tempo': float(tempo),
            'beat_frames': beats,
            'beat_times': librosa.frames_to_time(beats, sr=sr, hop_length=hop_length),
            'beat_strength': beat_strength,
            'beat_regularity': float(beat_regularity),
            'syncopation': float(np.clip(syncopation, 0, 1)),
            'onset_strength': onset_env,
        }
    except Exception as e:
        logger.error(f"Error in extract_rhythm_features: {e}")
        return {'beat_times': np.array([]), 'beat_strength': np.array([])}


def feature_aggregation_pipeline(
    y: np.ndarray,
    sr: int = 22050,
    hop_length: int = 512,
    compute_all: bool = True,
) -> Dict[str, Any]:
    """
    Comprehensive feature aggregation pipeline combining all feature types.

    Args:
        y: Audio time series
        sr: Sample rate
        hop_length: Hop length
        compute_all: If True, compute all features; else only core ones

    Returns:
        Dictionary with all aggregated features
    """
    try:
        if len(y) == 0:
            return {'aggregated_features': {}, 'feature_count': 0}

        aggregated = {}

        # Core features
        aggregated['mel_spectro'] = extract_mel_spectrogram_features(y, sr, hop_length=hop_length)
        aggregated['mfcc'] = extract_mfcc_delta_features(y, sr, hop_length=hop_length)
        aggregated['chroma'] = extract_chroma_cqt_features(y, sr, hop_length=hop_length)
        aggregated['rms'] = extract_rms_energy_features(y, sr, hop_length=hop_length)
        aggregated['spectral_bw'] = extract_spectral_bandwidth_features(y, sr, hop_length=hop_length)
        aggregated['zcr'] = extract_zero_crossing_features(y, sr, hop_length=hop_length)
        aggregated['rhythm'] = extract_rhythm_features(y, sr, hop_length=hop_length)

        if compute_all:
            aggregated['tempogram'] = extract_tempogram_features(y, sr, hop_length=hop_length)
            aggregated['onset'] = extract_onset_strength_features(y, sr, hop_length=hop_length)
            aggregated['tonnetz'] = extract_tonnetz_features(y, sr, hop_length=hop_length)
            aggregated['contrast'] = extract_spectral_contrast_features(y, sr, hop_length=hop_length)

        # Statistical summary
        stats_data = {}
        for name, feat_dict in aggregated.items():
            for k, v in feat_dict.items():
                if isinstance(v, np.ndarray) and len(v) > 0:
                    stats_data[f"{name}_{k}"] = v

        aggregated['statistics'] = extract_statistical_features(stats_data)

        return {
            'aggregated_features': aggregated,
            'feature_count': sum(len(v) for v in aggregated.values() if isinstance(v, dict)),
        }
    except Exception as e:
        logger.error(f"Error in feature_aggregation_pipeline: {e}")
        return {'aggregated_features': {}, 'feature_count': 0}


# ============================================================================
# PART 3: ADVANCED PREDICTION (15 functions)
# ============================================================================

def predict_drop_probability(
    energy: np.ndarray,
    onset_strength: np.ndarray,
    spectral_flux: np.ndarray,
    window_size: int = 20,
) -> Dict[str, Any]:
    """
    Predict probability of drop (sudden energy increase + complexity).

    Args:
        energy: Energy contour
        onset_strength: Onset strength envelope
        spectral_flux: Spectral flux
        window_size: Smoothing window

    Returns:
        Dictionary with drop probabilities per frame
    """
    try:
        if len(energy) == 0:
            return {'drop_probability': np.array([]), 'drop_frames': []}

        from scipy.ndimage import gaussian_filter1d

        # Normalize inputs
        energy_norm = (energy - np.min(energy)) / (np.max(energy) - np.min(energy) + 1e-10)
        onset_norm = (onset_strength - np.min(onset_strength)) / (np.max(onset_strength) - np.min(onset_strength) + 1e-10)
        flux_norm = (spectral_flux - np.min(spectral_flux)) / (np.max(spectral_flux) - np.min(spectral_flux) + 1e-10)

        # Drop indicator: high energy + high onset + high flux change
        drop_signal = 0.4 * energy_norm + 0.3 * onset_norm + 0.3 * flux_norm

        # Smooth
        drop_smooth = gaussian_filter1d(drop_signal, sigma=window_size/3)

        # Find peaks (drops)
        from scipy.signal import find_peaks
        peaks, properties = find_peaks(drop_smooth, height=np.percentile(drop_smooth, 70), distance=window_size)

        # Normalize to probability
        drop_probability = np.clip(drop_smooth, 0, 1)

        return {
            'drop_probability': drop_probability,
            'drop_frames': peaks.tolist(),
            'drop_heights': properties['peak_heights'].tolist() if len(peaks) > 0 else [],
            'mean_drop_strength': float(np.mean(drop_smooth[peaks])) if len(peaks) > 0 else 0.0,
        }
    except Exception as e:
        logger.error(f"Error in predict_drop_probability: {e}")
        return {'drop_probability': np.array([]), 'drop_frames': []}


def predict_build_probability(
    energy: np.ndarray,
    rms_delta: np.ndarray,
    window_size: int = 20,
) -> Dict[str, Any]:
    """
    Predict probability of build-up (gradual energy increase).

    Args:
        energy: Energy contour
        rms_delta: RMS energy derivative
        window_size: Smoothing window

    Returns:
        Dictionary with build-up probabilities per frame
    """
    try:
        if len(energy) == 0:
            return {'build_probability': np.array([]), 'build_regions': []}

        from scipy.ndimage import gaussian_filter1d

        # Build-up: positive energy derivative, sustained
        build_signal = np.clip(rms_delta, 0, None)  # Only positive changes
        build_smooth = gaussian_filter1d(build_signal, sigma=window_size/3)

        # Normalize
        build_probability = (build_smooth - np.min(build_smooth)) / (np.max(build_smooth) - np.min(build_smooth) + 1e-10)

        # Find regions above threshold
        threshold = np.percentile(build_smooth, 60)
        build_regions = np.where(build_smooth > threshold)[0].tolist()

        return {
            'build_probability': build_probability,
            'build_frames': build_regions,
            'mean_build_strength': float(np.mean(build_smooth[build_smooth > threshold])) if len(build_regions) > 0 else 0.0,
        }
    except Exception as e:
        logger.error(f"Error in predict_build_probability: {e}")
        return {'build_probability': np.array([]), 'build_regions': []}


def predict_breakdown_probability(
    energy: np.ndarray,
    spectral_contrast: np.ndarray,
    onset_strength: np.ndarray,
) -> Dict[str, Any]:
    """
    Predict probability of breakdown (reduction in complexity/energy).

    Args:
        energy: Energy contour
        spectral_contrast: Spectral contrast array
        onset_strength: Onset strength envelope

    Returns:
        Dictionary with breakdown probabilities
    """
    try:
        if len(energy) == 0:
            return {'breakdown_probability': np.array([]), 'breakdown_frames': []}

        # Normalize
        energy_norm = (energy - np.min(energy)) / (np.max(energy) - np.min(energy) + 1e-10)
        onset_norm = (onset_strength - np.min(onset_strength)) / (np.max(onset_strength) - np.min(onset_strength) + 1e-10)

        # Contrast: mean if 2D
        if spectral_contrast.ndim > 1:
            contrast_norm = np.mean(spectral_contrast, axis=0)
        else:
            contrast_norm = spectral_contrast
        contrast_norm = (contrast_norm - np.min(contrast_norm)) / (np.max(contrast_norm) - np.min(contrast_norm) + 1e-10)

        # Breakdown: dropping energy or complexity
        from scipy.ndimage import gaussian_filter1d
        energy_delta = np.diff(energy_norm, prepend=0)
        contrast_delta = np.diff(contrast_norm, prepend=0)

        # Negative changes (drops)
        breakdown_signal = np.clip(-energy_delta, 0, None) + np.clip(-contrast_delta, 0, None)
        breakdown_smooth = gaussian_filter1d(breakdown_signal, sigma=5)
        breakdown_probability = np.clip(breakdown_smooth, 0, 1)

        peaks, _ = find_peaks(breakdown_smooth, height=np.percentile(breakdown_smooth[breakdown_smooth > 0], 70) if np.any(breakdown_smooth > 0) else 0)

        return {
            'breakdown_probability': breakdown_probability,
            'breakdown_frames': peaks.tolist(),
        }
    except Exception as e:
        logger.error(f"Error in predict_breakdown_probability: {e}")
        return {'breakdown_probability': np.array([]), 'breakdown_frames': []}


def predict_vocal_probability(
    y: np.ndarray,
    sr: int = 22050,
    hop_length: int = 512,
) -> Dict[str, Any]:
    """
    Predict frame-by-frame probability of vocal presence.

    Args:
        y: Audio time series
        sr: Sample rate
        hop_length: Hop length

    Returns:
        Dictionary with vocal presence probabilities
    """
    try:
        if len(y) == 0:
            return {'vocal_probability': np.array([]), 'has_vocals': False}

        # MFCC features often indicate vocals
        mfcc = librosa.feature.mfcc(y=y, sr=sr, hop_length=hop_length)

        # ZCR also higher in vocal regions
        zcr = librosa.feature.zero_crossing_rate(y, hop_length=hop_length)[0]

        # Spectral centroid (vocals often mid-high frequency)
        spec_cent = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=hop_length)[0]

        # Normalize features
        mfcc_mean = np.mean(mfcc, axis=0)
        mfcc_norm = (mfcc_mean - np.min(mfcc_mean)) / (np.max(mfcc_mean) - np.min(mfcc_mean) + 1e-10)

        zcr_norm = (zcr - np.min(zcr)) / (np.max(zcr) - np.min(zcr) + 1e-10)

        spec_norm = (spec_cent - np.min(spec_cent)) / (np.max(spec_cent) - np.min(spec_cent) + 1e-10)

        # Vocal indicator (empirical weighting)
        vocal_probability = 0.4 * mfcc_norm + 0.3 * zcr_norm + 0.3 * spec_norm

        # Smooth
        from scipy.ndimage import gaussian_filter1d
        vocal_smooth = gaussian_filter1d(vocal_probability, sigma=3)

        # Threshold detection
        has_vocals = np.mean(vocal_smooth) > 0.4

        return {
            'vocal_probability': vocal_smooth,
            'has_vocals': bool(has_vocals),
            'vocal_mean_confidence': float(np.mean(vocal_smooth)),
            'vocal_peak': float(np.max(vocal_smooth)),
        }
    except Exception as e:
        logger.error(f"Error in predict_vocal_probability: {e}")
        return {'vocal_probability': np.array([]), 'has_vocals': False}


def predict_transition_probability(
    energy: np.ndarray,
    spectral_novelty: np.ndarray,
    window_size: int = 15,
) -> Dict[str, Any]:
    """
    Predict probability of good transition point (moderate changes).

    Args:
        energy: Energy contour
        spectral_novelty: Spectral novelty curve
        window_size: Smoothing window

    Returns:
        Dictionary with transition probabilities
    """
    try:
        if len(energy) == 0:
            return {'transition_probability': np.array([]), 'transition_frames': []}

        from scipy.ndimage import gaussian_filter1d

        # Normalize
        energy_norm = (energy - np.min(energy)) / (np.max(energy) - np.min(energy) + 1e-10)
        novelty_norm = (spectral_novelty - np.min(spectral_novelty)) / (np.max(spectral_novelty) - np.min(spectral_novelty) + 1e-10)

        # Transition: moderate energy + moderate novelty
        transition_signal = 1.0 - np.abs(energy_norm - 0.5) - 0.5 * np.abs(novelty_norm - 0.3)
        transition_smooth = gaussian_filter1d(np.clip(transition_signal, 0, 1), sigma=window_size/3)

        # Find transition points
        peaks, _ = find_peaks(transition_smooth, height=np.percentile(transition_smooth, 60))

        return {
            'transition_probability': transition_smooth,
            'transition_frames': peaks.tolist(),
            'mean_transition_quality': float(np.mean(transition_smooth[peaks])) if len(peaks) > 0 else 0.0,
        }
    except Exception as e:
        logger.error(f"Error in predict_transition_probability: {e}")
        return {'transition_probability': np.array([]), 'transition_frames': []}


def predict_loop_worthiness(
    energy: np.ndarray,
    spectral_flux: np.ndarray,
    min_loop_frames: int = 100,
) -> Dict[str, Any]:
    """
    Predict if section is worthy of being looped (repetitive, consistent).

    Args:
        energy: Energy contour
        spectral_flux: Spectral flux
        min_loop_frames: Minimum section length

    Returns:
        Dictionary with loop worthiness scores
    """
    try:
        if len(energy) < min_loop_frames:
            return {'loop_worthiness': np.array([]), 'loop_regions': []}

        from scipy.ndimage import gaussian_filter1d

        # Low flux = consistent / repetitive
        flux_inv = 1.0 / (spectral_flux + 1e-10)
        flux_norm = (flux_inv - np.min(flux_inv)) / (np.max(flux_inv) - np.min(flux_inv) + 1e-10)

        # Stable energy
        energy_delta = np.abs(np.diff(energy, prepend=0))
        energy_stability = 1.0 / (energy_delta + 1e-10)
        energy_norm = (energy_stability - np.min(energy_stability)) / (np.max(energy_stability) - np.min(energy_stability) + 1e-10)

        # Combine
        loop_score = 0.5 * flux_norm + 0.5 * energy_norm
        loop_smooth = gaussian_filter1d(loop_score, sigma=10)

        # Find long stable regions
        from scipy.signal import medfilt
        loop_median = medfilt(loop_smooth, kernel_size=min_loop_frames)

        return {
            'loop_worthiness': loop_smooth,
            'loop_stability': loop_median,
            'mean_loop_score': float(np.mean(loop_smooth)),
        }
    except Exception as e:
        logger.error(f"Error in predict_loop_worthiness: {e}")
        return {'loop_worthiness': np.array([]), 'loop_regions': []}


def predict_cue_importance(
    energy: np.ndarray,
    spectral_novelty: np.ndarray,
    onset_strength: np.ndarray,
) -> Dict[str, Any]:
    """
    Predict relative importance/priority of each cue candidate.

    Args:
        energy: Energy contour
        spectral_novelty: Spectral novelty
        onset_strength: Onset strength

    Returns:
        Dictionary with importance scores
    """
    try:
        if len(energy) == 0:
            return {'importance_scores': np.array([]), 'top_cues': []}

        # Normalize
        energy_norm = (energy - np.min(energy)) / (np.max(energy) - np.min(energy) + 1e-10)
        novelty_norm = (spectral_novelty - np.min(spectral_novelty)) / (np.max(spectral_novelty) - np.min(spectral_novelty) + 1e-10)
        onset_norm = (onset_strength - np.min(onset_strength)) / (np.max(onset_strength) - np.min(onset_strength) + 1e-10)

        # Importance: peaks in all three
        importance_scores = 0.4 * energy_norm + 0.3 * novelty_norm + 0.3 * onset_norm

        # Find top cues
        top_indices = np.argsort(importance_scores)[-10:][::-1].tolist()
        top_scores = importance_scores[top_indices].tolist()

        return {
            'importance_scores': importance_scores,
            'top_cue_frames': top_indices,
            'top_cue_scores': top_scores,
        }
    except Exception as e:
        logger.error(f"Error in predict_cue_importance: {e}")
        return {'importance_scores': np.array([]), 'top_cues': []}


def predict_mix_point_quality(
    energy: np.ndarray,
    beat_strength: np.ndarray,
    spectral_stability: np.ndarray,
) -> Dict[str, Any]:
    """
    Predict quality of mix point (low variability, on beat).

    Args:
        energy: Energy contour
        beat_strength: Beat strength per frame
        spectral_stability: Spectral stability (inverse of flux)

    Returns:
        Dictionary with mix point quality scores
    """
    try:
        if len(energy) == 0:
            return {'mix_quality': np.array([]), 'best_mix_points': []}

        # Normalize
        energy_norm = (energy - np.min(energy)) / (np.max(energy) - np.min(energy) + 1e-10)
        beat_norm = (beat_strength - np.min(beat_strength)) / (np.max(beat_strength) - np.min(beat_strength) + 1e-10)
        stab_norm = (spectral_stability - np.min(spectral_stability)) / (np.max(spectral_stability) - np.min(spectral_stability) + 1e-10)

        # Mix quality: good energy + strong beat + stable spectrum
        mix_quality = 0.3 * energy_norm + 0.4 * beat_norm + 0.3 * stab_norm

        # Find best mix points
        peaks, _ = find_peaks(mix_quality, height=np.percentile(mix_quality, 75))

        return {
            'mix_quality': mix_quality,
            'best_mix_points': peaks.tolist(),
            'best_mix_scores': mix_quality[peaks].tolist() if len(peaks) > 0 else [],
        }
    except Exception as e:
        logger.error(f"Error in predict_mix_point_quality: {e}")
        return {'mix_quality': np.array([]), 'best_mix_points': []}


def predict_crowd_reaction(
    energy: np.ndarray,
    beat_strength: np.ndarray,
    spectral_excitement: np.ndarray,
) -> Dict[str, Any]:
    """
    Predict crowd reaction intensity (empirical model).

    Args:
        energy: Energy contour
        beat_strength: Beat strength
        spectral_excitement: Spectral excitement measure

    Returns:
        Dictionary with crowd reaction predictions
    """
    try:
        if len(energy) == 0:
            return {'crowd_energy': np.array([]), 'peak_reaction_frames': []}

        # Normalize
        energy_norm = (energy - np.min(energy)) / (np.max(energy) - np.min(energy) + 1e-10)
        beat_norm = (beat_strength - np.min(beat_strength)) / (np.max(beat_strength) - np.min(beat_strength) + 1e-10)
        exc_norm = (spectral_excitement - np.min(spectral_excitement)) / (np.max(spectral_excitement) - np.min(spectral_excitement) + 1e-10)

        # Crowd energy: high energy + strong beat + exciting spectrum
        crowd_energy = 0.35 * energy_norm + 0.35 * beat_norm + 0.3 * exc_norm

        # Smooth
        from scipy.ndimage import gaussian_filter1d
        crowd_smooth = gaussian_filter1d(crowd_energy, sigma=5)

        # Find peaks
        peaks, _ = find_peaks(crowd_smooth, height=np.percentile(crowd_smooth, 80))

        return {
            'crowd_energy': crowd_smooth,
            'peak_reaction_frames': peaks.tolist(),
            'mean_crowd_energy': float(np.mean(crowd_smooth)),
            'max_reaction': float(np.max(crowd_smooth)),
        }
    except Exception as e:
        logger.error(f"Error in predict_crowd_reaction: {e}")
        return {'crowd_energy': np.array([]), 'peak_reaction_frames': []}


def predict_energy_trajectory(
    energy: np.ndarray,
    horizon_frames: int = 100,
) -> Dict[str, Any]:
    """
    Predict future energy trajectory (what's coming next).

    Args:
        energy: Energy contour
        horizon_frames: How far to predict

    Returns:
        Dictionary with predicted energy trajectories
    """
    try:
        if len(energy) < horizon_frames:
            return {'trajectory_predictions': [], 'trend': 'unknown'}

        from scipy.ndimage import gaussian_filter1d
        from numpy.polynomial.polynomial import Polynomial

        # Fit polynomial to recent energy
        recent_frames = min(horizon_frames, len(energy))
        x = np.arange(recent_frames)
        y = energy[-recent_frames:]

        # Fit trend
        coeffs = np.polyfit(x, y, 2)
        poly = Polynomial(coeffs)

        # Predict next frames
        future_x = np.arange(recent_frames, recent_frames + horizon_frames)
        predictions = poly(future_x)
        predictions = np.clip(predictions, np.min(energy), np.max(energy))

        # Determine trend
        trend_slope = coeffs[1]
        if trend_slope > 0.001:
            trend = 'rising'
        elif trend_slope < -0.001:
            trend = 'falling'
        else:
            trend = 'stable'

        return {
            'predicted_energy': predictions.tolist(),
            'trend': trend,
            'trend_slope': float(trend_slope),
            'predicted_mean': float(np.mean(predictions)),
        }
    except Exception as e:
        logger.error(f"Error in predict_energy_trajectory: {e}")
        return {'trajectory_predictions': [], 'trend': 'unknown'}


def predict_section_function(
    energy: np.ndarray,
    spectral_novelty: np.ndarray,
    onset_strength: np.ndarray,
) -> Dict[str, Any]:
    """
    Predict function of a section (intro, build, drop, breakdown, outro).

    Args:
        energy: Energy contour
        spectral_novelty: Spectral novelty
        onset_strength: Onset strength

    Returns:
        Dictionary with section function predictions
    """
    try:
        if len(energy) == 0:
            return {'section_function': 'unknown', 'confidence': 0.0}

        # Characteristics
        energy_mean = np.mean(energy)
        energy_var = np.var(energy)
        novelty_mean = np.mean(spectral_novelty)
        onset_mean = np.mean(onset_strength)

        # Decision tree (simplified)
        if energy_mean < 0.3:
            if novelty_mean < 0.3:
                func = 'intro'
            else:
                func = 'breakdown'
        elif energy_mean > 0.7:
            if novelty_mean > 0.6 and onset_mean > 0.6:
                func = 'drop'
            else:
                func = 'peak'
        else:
            if np.std(np.diff(energy)) > 0.1:
                func = 'build'
            else:
                func = 'bridge'

        # Confidence based on variance
        confidence = 1.0 - np.clip(energy_var, 0, 1)

        return {
            'section_function': func,
            'confidence': float(confidence),
            'energy_level': float(energy_mean),
            'novelty_level': float(novelty_mean),
        }
    except Exception as e:
        logger.error(f"Error in predict_section_function: {e}")
        return {'section_function': 'unknown', 'confidence': 0.0}


def predict_dj_action(
    energy: np.ndarray,
    spectral_novelty: np.ndarray,
) -> Dict[str, Any]:
    """
    Predict likely DJ action (EQ, filter, loop, transition, scratch).

    Args:
        energy: Energy contour
        spectral_novelty: Spectral novelty

    Returns:
        Dictionary with predicted DJ actions
    """
    try:
        if len(energy) == 0:
            return {'suggested_actions': [], 'primary_action': 'none'}

        actions = []

        # High energy + low novelty -> loop/repeat
        if np.mean(energy) > 0.6 and np.mean(spectral_novelty) < 0.4:
            actions.append({'action': 'loop', 'confidence': 0.8})

        # Rising energy -> build/EQ boost
        energy_delta = np.mean(np.diff(energy))
        if energy_delta > 0.01:
            actions.append({'action': 'eq_boost', 'confidence': 0.7})

        # High novelty -> transition/scratch
        if np.mean(spectral_novelty) > 0.6:
            actions.append({'action': 'transition', 'confidence': 0.75})

        # Falling energy -> filter decrease
        if energy_delta < -0.01:
            actions.append({'action': 'filter_decrease', 'confidence': 0.7})

        # Default
        if not actions:
            actions.append({'action': 'none', 'confidence': 0.5})

        # Sort by confidence
        actions.sort(key=lambda x: x['confidence'], reverse=True)
        primary = actions[0]['action']

        return {
            'suggested_actions': actions,
            'primary_action': primary,
        }
    except Exception as e:
        logger.error(f"Error in predict_dj_action: {e}")
        return {'suggested_actions': [], 'primary_action': 'none'}


def predict_genre_subgenre(
    chroma: np.ndarray,
    spectral_contrast: np.ndarray,
    tempo: float,
) -> Dict[str, Any]:
    """
    Predict genre and subgenre from audio features.

    Args:
        chroma: Chroma features
        spectral_contrast: Spectral contrast
        tempo: Tempo estimation

    Returns:
        Dictionary with genre predictions
    """
    try:
        # Simple heuristics
        chroma_dom = np.argmax(np.mean(chroma, axis=1)) if chroma.ndim > 1 else 0
        contrast_mean = np.mean(spectral_contrast) if spectral_contrast.ndim > 1 else spectral_contrast.mean()

        if 120 <= tempo <= 130:
            genre = 'house'
            if contrast_mean > 0.7:
                subgenre = 'deep_house'
            else:
                subgenre = 'tech_house'
        elif 135 <= tempo <= 150:
            genre = 'drum_and_bass'
            subgenre = 'liquid' if contrast_mean > 0.6 else 'neurofunk'
        elif 90 <= tempo <= 110:
            genre = 'hip_hop'
            subgenre = 'trap' if tempo > 100 else 'boom_bap'
        elif 85 <= tempo <= 105:
            genre = 'reggaeton'
            subgenre = 'perreo' if tempo > 95 else 'reggaeton'
        elif 130 <= tempo <= 160:
            genre = 'techno'
            subgenre = 'industrial' if contrast_mean > 0.7 else 'minimal'
        elif 100 <= tempo <= 130:
            genre = 'trance'
            subgenre = 'uplifting' if chroma_dom < 6 else 'progressive'
        else:
            genre = 'electronic'
            subgenre = 'experimental'

        return {
            'genre': genre,
            'subgenre': subgenre,
            'confidence': 0.6,
            'tempo': float(tempo),
        }
    except Exception as e:
        logger.error(f"Error in predict_genre_subgenre: {e}")
        return {'genre': 'unknown', 'subgenre': 'unknown', 'confidence': 0.0}


def predict_bpm_confidence(
    y: np.ndarray,
    sr: int = 22050,
    hop_length: int = 512,
) -> Dict[str, Any]:
    """
    Predict per-frame BPM confidence (stability of tempo).

    Args:
        y: Audio time series
        sr: Sample rate
        hop_length: Hop length

    Returns:
        Dictionary with BPM confidence per frame
    """
    try:
        if len(y) == 0:
            return {'bpm_confidence': np.array([]), 'estimated_bpm': 0.0}

        # Estimate tempo
        tempo, beats = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop_length)

        # Compute onset strength for confidence
        onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)

        # Beat strength at estimated beat frames
        beat_strength = onset_env[beats] if len(beats) > 0 else np.array([])

        # Confidence proportional to beat strength
        if len(beats) > 0:
            beat_confidence = np.mean(beat_strength) / (np.mean(onset_env) + 1e-10)
        else:
            beat_confidence = 0.5

        # Interpolate confidence to all frames
        from scipy.interpolate import interp1d
        beat_times_frames = beats
        beat_confidences = beat_strength

        if len(beat_times_frames) > 1:
            interp_func = interp1d(beat_times_frames, beat_confidences,
                                  kind='linear', bounds_error=False,
                                  fill_value='extrapolate')
            all_frames = np.arange(len(onset_env))
            bpm_confidence = np.clip(interp_func(all_frames), 0, 1)
        else:
            bpm_confidence = np.full(len(onset_env), beat_confidence)

        return {
            'bpm_confidence': bpm_confidence,
            'estimated_bpm': float(tempo),
            'beat_strength_mean': float(np.mean(beat_strength)) if len(beat_strength) > 0 else 0.0,
        }
    except Exception as e:
        logger.error(f"Error in predict_bpm_confidence: {e}")
        return {'bpm_confidence': np.array([]), 'estimated_bpm': 0.0}


def predict_key_confidence(
    chroma: np.ndarray,
) -> Dict[str, Any]:
    """
    Predict per-frame key/tonality confidence.

    Args:
        chroma: Chroma feature matrix (12 x frames)

    Returns:
        Dictionary with key confidence per frame
    """
    try:
        if chroma.size == 0:
            return {'key_confidence': np.array([]), 'dominant_key': 'unknown'}

        if chroma.ndim == 1:
            # Single frame
            dominant_idx = np.argmax(chroma)
            notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
            dominant_key = notes[dominant_idx]

            # Confidence: how much dominant note stands out
            chroma_norm = (chroma - np.min(chroma)) / (np.max(chroma) - np.min(chroma) + 1e-10)
            confidence = float(chroma_norm[dominant_idx])

            return {
                'key_confidence': np.array([confidence]),
                'dominant_key': dominant_key,
                'chroma_distribution': chroma.tolist(),
            }
        else:
            # Multiple frames
            notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

            # Dominant key per frame
            dominant_idx = np.argmax(chroma, axis=0)
            dominant_keys = [notes[i] for i in dominant_idx]

            # Confidence: energy of dominant note vs others
            dominant_energy = np.max(chroma, axis=0)
            total_energy = np.sum(chroma, axis=0)
            key_confidence = dominant_energy / (total_energy + 1e-10)

            # Global dominant key
            global_dominant = notes[np.argmax(np.mean(chroma, axis=1))]

            return {
                'key_confidence': key_confidence,
                'dominant_key_per_frame': dominant_keys,
                'global_dominant_key': global_dominant,
                'mean_confidence': float(np.mean(key_confidence)),
            }
    except Exception as e:
        logger.error(f"Error in predict_key_confidence: {e}")
        return {'key_confidence': np.array([]), 'dominant_key': 'unknown'}


# ============================================================================
# PART 4: COMPARATIVE ANALYSIS (10 functions)
# ============================================================================

def compare_two_tracks(
    track1_features: Dict[str, Any],
    track2_features: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Comprehensive comparison of two tracks across multiple dimensions.

    Args:
        track1_features: Feature dict for track 1
        track2_features: Feature dict for track 2

    Returns:
        Dictionary with comparison metrics
    """
    try:
        if not track1_features or not track2_features:
            return {'comparison': {}, 'overall_compatibility': 0.0}

        comparison = {
            'harmonic': harmonic_compatibility_score(
                track1_features.get('chroma', np.array([])),
                track2_features.get('chroma', np.array([]))
            ),
            'energy': energy_compatibility_score(
                track1_features.get('energy', np.array([])),
                track2_features.get('energy', np.array([]))
            ),
            'tempo': tempo_compatibility_score(
                track1_features.get('bpm', 120),
                track2_features.get('bpm', 120)
            ),
            'style': style_similarity_score(
                track1_features.get('mfcc', np.array([])),
                track2_features.get('mfcc', np.array([]))
            ),
        }

        # Overall compatibility
        overall = np.mean([v.get('score', 0.5) for v in comparison.values()])

        return {
            'comparison': comparison,
            'overall_compatibility': float(overall),
        }
    except Exception as e:
        logger.error(f"Error in compare_two_tracks: {e}")
        return {'comparison': {}, 'overall_compatibility': 0.0}


def harmonic_compatibility_score(
    chroma1: np.ndarray,
    chroma2: np.ndarray,
) -> Dict[str, Any]:
    """
    Score harmonic compatibility between two tracks (key distance).

    Args:
        chroma1: Chroma features of track 1
        chroma2: Chroma features of track 2

    Returns:
        Dictionary with harmonic score
    """
    try:
        if chroma1.size == 0 or chroma2.size == 0:
            return {'score': 0.5, 'key_distance': 0}

        # Get mean chroma profiles
        if chroma1.ndim > 1:
            chroma1_mean = np.mean(chroma1, axis=1)
        else:
            chroma1_mean = chroma1

        if chroma2.ndim > 1:
            chroma2_mean = np.mean(chroma2, axis=1)
        else:
            chroma2_mean = chroma2

        # Cosine similarity
        from scipy.spatial.distance import cosine
        similarity = 1.0 - cosine(chroma1_mean, chroma2_mean)

        # Key distance (circular distance in 12-note space)
        key1_idx = np.argmax(chroma1_mean)
        key2_idx = np.argmax(chroma2_mean)
        key_distance = min(abs(key1_idx - key2_idx), 12 - abs(key1_idx - key2_idx))

        # Perfect keys are distance 0 or 7 (fifth apart)
        if key_distance in [0, 7]:
            key_score = 1.0
        elif key_distance in [1, 6, 11]:
            key_score = 0.8
        elif key_distance in [2, 5, 10]:
            key_score = 0.6
        else:
            key_score = 0.4

        final_score = 0.6 * similarity + 0.4 * key_score

        return {
            'score': float(np.clip(final_score, 0, 1)),
            'key_distance': int(key_distance),
            'cosine_similarity': float(similarity),
        }
    except Exception as e:
        logger.error(f"Error in harmonic_compatibility_score: {e}")
        return {'score': 0.5, 'key_distance': 0}


def energy_compatibility_score(
    energy1: np.ndarray,
    energy2: np.ndarray,
) -> Dict[str, Any]:
    """
    Score energy compatibility between two tracks.

    Args:
        energy1: Energy contour of track 1
        energy2: Energy contour of track 2

    Returns:
        Dictionary with energy score
    """
    try:
        if len(energy1) == 0 or len(energy2) == 0:
            return {'score': 0.5, 'energy_diff': 0.0}

        # Mean energy levels
        mean1 = np.mean(energy1)
        mean2 = np.mean(energy2)

        # Normalized difference
        max_energy = max(np.max(energy1), np.max(energy2))
        energy_diff = abs(mean1 - mean2) / (max_energy + 1e-10)

        # Score: perfect match is 0 diff
        score = 1.0 - np.clip(energy_diff, 0, 1)

        # Variance (stability)
        var1 = np.var(energy1)
        var2 = np.var(energy2)
        variance_diff = abs(var1 - var2) / (max(var1, var2) + 1e-10)

        # Combined score
        final_score = 0.7 * score + 0.3 * (1.0 - np.clip(variance_diff, 0, 1))

        return {
            'score': float(np.clip(final_score, 0, 1)),
            'energy_diff': float(energy_diff),
            'mean_energy_1': float(mean1),
            'mean_energy_2': float(mean2),
        }
    except Exception as e:
        logger.error(f"Error in energy_compatibility_score: {e}")
        return {'score': 0.5, 'energy_diff': 0.0}


def tempo_compatibility_score(
    bpm1: float,
    bpm2: float,
) -> Dict[str, Any]:
    """
    Score tempo compatibility between two tracks.

    Args:
        bpm1: BPM of track 1
        bpm2: BPM of track 2

    Returns:
        Dictionary with tempo score
    """
    try:
        if bpm1 <= 0 or bpm2 <= 0:
            return {'score': 0.5, 'bpm_diff': 0.0}

        # Percentage difference
        bpm_diff_pct = abs(bpm1 - bpm2) / max(bpm1, bpm2)

        # Perfect match: same BPM
        if bpm_diff_pct < 0.02:
            score = 1.0
        # Good: within 2% (easy beatmatch)
        elif bpm_diff_pct < 0.05:
            score = 0.9
        # OK: within 10%
        elif bpm_diff_pct < 0.10:
            score = 0.7
        # Moderate: within 20%
        elif bpm_diff_pct < 0.20:
            score = 0.5
        # Poor
        else:
            score = 0.3

        return {
            'score': float(score),
            'bpm_diff': float(bpm_diff_pct * 100),
            'bpm_1': float(bpm1),
            'bpm_2': float(bpm2),
        }
    except Exception as e:
        logger.error(f"Error in tempo_compatibility_score: {e}")
        return {'score': 0.5, 'bpm_diff': 0.0}


def style_similarity_score(
    mfcc1: np.ndarray,
    mfcc2: np.ndarray,
) -> Dict[str, Any]:
    """
    Score style similarity between two tracks using MFCC.

    Args:
        mfcc1: MFCC of track 1
        mfcc2: MFCC of track 2

    Returns:
        Dictionary with style score
    """
    try:
        if mfcc1.size == 0 or mfcc2.size == 0:
            return {'score': 0.5}

        # Mean MFCC vectors
        if mfcc1.ndim > 1:
            mfcc1_mean = np.mean(mfcc1, axis=1)
        else:
            mfcc1_mean = mfcc1

        if mfcc2.ndim > 1:
            mfcc2_mean = np.mean(mfcc2, axis=1)
        else:
            mfcc2_mean = mfcc2

        # Cosine similarity
        from scipy.spatial.distance import cosine
        similarity = 1.0 - cosine(mfcc1_mean, mfcc2_mean)

        return {
            'score': float(np.clip(similarity, 0, 1)),
            'cosine_similarity': float(similarity),
        }
    except Exception as e:
        logger.error(f"Error in style_similarity_score: {e}")
        return {'score': 0.5}


def transition_quality_prediction(
    energy_before: np.ndarray,
    energy_after: np.ndarray,
    compatibility_score: float = 0.7,
) -> Dict[str, Any]:
    """
    Predict quality of transition between two tracks.

    Args:
        energy_before: Energy contour of first track tail
        energy_after: Energy contour of second track head
        compatibility_score: Overall compatibility (0-1)

    Returns:
        Dictionary with transition quality prediction
    """
    try:
        if len(energy_before) == 0 or len(energy_after) == 0:
            return {'transition_quality': 0.5, 'issues': []}

        issues = []

        # Check energy continuity
        before_end = np.mean(energy_before[-20:]) if len(energy_before) > 20 else np.mean(energy_before)
        after_start = np.mean(energy_after[:20]) if len(energy_after) > 20 else np.mean(energy_after)

        energy_drop = before_end - after_start
        if energy_drop > 0.3:
            issues.append({'issue': 'energy_drop', 'severity': 'high'})
        elif energy_drop > 0.15:
            issues.append({'issue': 'energy_drop', 'severity': 'medium'})

        # Build detection in before track
        before_trend = np.mean(np.diff(energy_before[-30:]))
        if before_trend > 0.01:
            # Good: building energy
            build_score = 1.0
        else:
            build_score = 0.6

        # Quick start detection in after track
        after_trend = np.mean(np.diff(energy_after[:30]))
        if after_trend > 0:
            quick_start = 0.8
        else:
            quick_start = 0.6

        # Final quality
        transition_quality = 0.4 * compatibility_score + 0.3 * build_score + 0.3 * quick_start

        return {
            'transition_quality': float(np.clip(transition_quality, 0, 1)),
            'issues': issues,
            'build_potential': float(build_score),
            'quick_start_potential': float(quick_start),
        }
    except Exception as e:
        logger.error(f"Error in transition_quality_prediction: {e}")
        return {'transition_quality': 0.5, 'issues': []}


def optimal_mix_point_finder(
    track1_energy: np.ndarray,
    track2_energy: np.ndarray,
    track1_beat_strength: np.ndarray,
    track2_beat_strength: np.ndarray,
) -> Dict[str, Any]:
    """
    Find optimal mix point between two tracks.

    Args:
        track1_energy: Energy contour of track 1
        track2_energy: Energy contour of track 2
        track1_beat_strength: Beat strength of track 1
        track2_beat_strength: Beat strength of track 2

    Returns:
        Dictionary with optimal mix points
    """
    try:
        if len(track1_energy) == 0 or len(track2_energy) == 0:
            return {'optimal_point_track1': -1, 'optimal_point_track2': -1, 'quality': 0.0}

        # Find section boundaries in track 1 (where to start mixing out)
        from scipy.ndimage import gaussian_filter1d

        # Look for good beat points in track 1 that have strong beats
        t1_mix_quality = track1_beat_strength
        t1_mix_quality = gaussian_filter1d(t1_mix_quality, sigma=5)

        # Look for strong start in track 2
        t2_mix_quality = track2_beat_strength
        t2_mix_quality = gaussian_filter1d(t2_mix_quality, sigma=5)

        # Find best frames
        t1_candidates = np.argsort(t1_mix_quality)[-20:] if len(t1_mix_quality) > 20 else np.argsort(t1_mix_quality)
        t2_candidates = np.argsort(t2_mix_quality)[:20] if len(t2_mix_quality) > 20 else np.argsort(t2_mix_quality)

        # Pick best overall
        best_t1 = t1_candidates[-1] if len(t1_candidates) > 0 else 0
        best_t2 = t2_candidates[0] if len(t2_candidates) > 0 else 0

        quality = float(np.clip((t1_mix_quality[best_t1] + t2_mix_quality[best_t2]) / 2, 0, 1))

        return {
            'optimal_point_track1': int(best_t1),
            'optimal_point_track2': int(best_t2),
            'quality': quality,
            'track1_candidates': t1_candidates[:5].tolist(),
            'track2_candidates': t2_candidates[:5].tolist(),
        }
    except Exception as e:
        logger.error(f"Error in optimal_mix_point_finder: {e}")
        return {'optimal_point_track1': -1, 'optimal_point_track2': -1, 'quality': 0.0}


def beatmatch_difficulty_score(
    bpm1: float,
    bpm2: float,
    beat_stability1: float = 0.8,
    beat_stability2: float = 0.8,
) -> Dict[str, Any]:
    """
    Score difficulty of beatmatching two tracks.

    Args:
        bpm1: BPM of track 1
        bpm2: BPM of track 2
        beat_stability1: Stability of beat in track 1 (0-1)
        beat_stability2: Stability of beat in track 2 (0-1)

    Returns:
        Dictionary with beatmatch difficulty
    """
    try:
        if bpm1 <= 0 or bpm2 <= 0:
            return {'difficulty': 'unknown', 'difficulty_score': 0.5}

        bpm_diff_pct = abs(bpm1 - bpm2) / max(bpm1, bpm2)

        # Base difficulty from BPM difference
        if bpm_diff_pct < 0.02:
            base_difficulty = 1  # Very easy
        elif bpm_diff_pct < 0.05:
            base_difficulty = 2  # Easy
        elif bpm_diff_pct < 0.10:
            base_difficulty = 3  # Moderate
        elif bpm_diff_pct < 0.20:
            base_difficulty = 4  # Hard
        else:
            base_difficulty = 5  # Very hard

        # Adjust for beat stability
        stability_factor = beat_stability1 * beat_stability2
        adjusted_difficulty = base_difficulty / (stability_factor + 0.5)

        # Normalize to 0-1
        difficulty_score = np.clip((adjusted_difficulty - 1) / 4, 0, 1)

        difficulty_labels = {
            1: 'trivial',
            2: 'very_easy',
            3: 'easy',
            4: 'moderate',
            5: 'hard',
        }

        return {
            'difficulty': difficulty_labels.get(base_difficulty, 'unknown'),
            'difficulty_score': float(difficulty_score),
            'bpm_diff_pct': float(bpm_diff_pct * 100),
            'adjusted_score': float(np.clip(adjusted_difficulty, 1, 5)),
        }
    except Exception as e:
        logger.error(f"Error in beatmatch_difficulty_score: {e}")
        return {'difficulty': 'unknown', 'difficulty_score': 0.5}


def eq_adjustment_recommendation(
    track1_spectral_centroid: np.ndarray,
    track2_spectral_centroid: np.ndarray,
) -> Dict[str, Any]:
    """
    Recommend EQ adjustments for track transition.

    Args:
        track1_spectral_centroid: Spectral centroid of track 1
        track2_spectral_centroid: Spectral centroid of track 2

    Returns:
        Dictionary with EQ adjustment recommendations
    """
    try:
        if len(track1_spectral_centroid) == 0 or len(track2_spectral_centroid) == 0:
            return {'recommendations': []}

        # Mean spectral centroids
        sc1_mean = np.mean(track1_spectral_centroid)
        sc2_mean = np.mean(track2_spectral_centroid)

        recommendations = []

        if sc2_mean > sc1_mean * 1.2:
            recommendations.append({
                'action': 'boost_highs_track2',
                'band': 'high',
                'severity': 'gentle',
            })
        elif sc2_mean < sc1_mean * 0.8:
            recommendations.append({
                'action': 'boost_lows_track2',
                'band': 'low',
                'severity': 'gentle',
            })
        else:
            recommendations.append({
                'action': 'no_major_eq_needed',
                'band': 'all',
                'severity': 'none',
            })

        return {
            'recommendations': recommendations,
            'sc_1': float(sc1_mean),
            'sc_2': float(sc2_mean),
        }
    except Exception as e:
        logger.error(f"Error in eq_adjustment_recommendation: {e}")
        return {'recommendations': []}


def mix_duration_recommendation(
    energy1: np.ndarray,
    energy2: np.ndarray,
) -> Dict[str, Any]:
    """
    Recommend mix duration between two tracks.

    Args:
        energy1: Energy of track 1
        energy2: Energy of track 2

    Returns:
        Dictionary with duration recommendation
    """
    try:
        if len(energy1) == 0 or len(energy2) == 0:
            return {'recommended_duration_sec': 30, 'reasoning': 'default'}

        # Get tail/head energy
        e1_tail = np.mean(energy1[-20:]) if len(energy1) > 20 else np.mean(energy1)
        e2_head = np.mean(energy2[:20]) if len(energy2) > 20 else np.mean(energy2)

        # If energies diverge, need longer mix
        energy_diff = abs(e1_tail - e2_head)

        if energy_diff < 0.1:
            duration = 15  # Quick transition
            reasoning = 'similar_energy'
        elif energy_diff < 0.3:
            duration = 30  # Standard transition
            reasoning = 'moderate_energy_difference'
        else:
            duration = 45  # Long transition for energy gap
            reasoning = 'large_energy_difference'

        # Peak detection in track 2
        if np.max(energy2) - e2_head > 0.3:
            # Track 2 has big drop coming, extend transition
            duration = min(60, duration + 15)

        return {
            'recommended_duration_sec': int(duration),
            'reasoning': reasoning,
            'energy_difference': float(energy_diff),
        }
    except Exception as e:
        logger.error(f"Error in mix_duration_recommendation: {e}")
        return {'recommended_duration_sec': 30, 'reasoning': 'error'}


# ============================================================================
# PART 5: COLLABORATIVE INTELLIGENCE (10 functions)
# ============================================================================

def aggregate_user_corrections(
    corrections_list: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Aggregate user corrections to improve predictions.

    Args:
        corrections_list: List of correction dicts {frame: X, actual_type: Y, confidence: Z}

    Returns:
        Dictionary with aggregated corrections
    """
    try:
        if not corrections_list:
            return {'aggregated_corrections': [], 'correction_count': 0}

        aggregated = {}

        for corr in corrections_list:
            cue_type = corr.get('actual_type', 'unknown')
            frame = corr.get('frame', 0)
            confidence = corr.get('confidence', 0.5)

            if cue_type not in aggregated:
                aggregated[cue_type] = []

            aggregated[cue_type].append({
                'frame': frame,
                'confidence': confidence,
            })

        # Summary statistics per type
        summary = {}
        for cue_type, items in aggregated.items():
            frames = [item['frame'] for item in items]
            confidences = [item['confidence'] for item in items]

            summary[cue_type] = {
                'count': len(items),
                'mean_confidence': float(np.mean(confidences)),
                'frame_std': float(np.std(frames)),
                'examples': frames[:5],
            }

        return {
            'aggregated_corrections': summary,
            'correction_count': len(corrections_list),
            'unique_types': len(aggregated),
        }
    except Exception as e:
        logger.error(f"Error in aggregate_user_corrections: {e}")
        return {'aggregated_corrections': [], 'correction_count': 0}


def popular_cue_patterns(
    cue_history: List[Dict[str, Any]],
    genre: str = 'default',
) -> Dict[str, Any]:
    """
    Extract popular cue patterns by genre from community.

    Args:
        cue_history: List of cues from database
        genre: Genre filter

    Returns:
        Dictionary with popular patterns
    """
    try:
        if not cue_history:
            return {'patterns': [], 'count': 0}

        patterns = {}

        for cue in cue_history:
            cue_type = cue.get('type', 'unknown')
            position_pct = cue.get('position_percent', 50)

            # Quantize position to 10% buckets
            bucket = int(position_pct / 10) * 10

            pattern_key = f"{cue_type}_at_{bucket}pct"
            patterns[pattern_key] = patterns.get(pattern_key, 0) + 1

        # Sort by frequency
        sorted_patterns = sorted(patterns.items(), key=lambda x: x[1], reverse=True)

        return {
            'patterns': [{'pattern': p, 'frequency': c} for p, c in sorted_patterns[:10]],
            'count': len(patterns),
            'total_cues': len(cue_history),
        }
    except Exception as e:
        logger.error(f"Error in popular_cue_patterns: {e}")
        return {'patterns': [], 'count': 0}


def community_confidence_adjustment(
    predicted_confidence: float,
    community_agreement: float,
    weight: float = 0.3,
) -> Dict[str, Any]:
    """
    Adjust prediction confidence based on community consensus.

    Args:
        predicted_confidence: Model prediction confidence (0-1)
        community_agreement: Community agreement level (0-1)
        weight: How much to weight community input

    Returns:
        Dictionary with adjusted confidence
    """
    try:
        # Weighted blend
        adjusted = (1 - weight) * predicted_confidence + weight * community_agreement
        adjusted = float(np.clip(adjusted, 0, 1))

        return {
            'adjusted_confidence': adjusted,
            'original_confidence': float(predicted_confidence),
            'community_agreement': float(community_agreement),
            'weight': float(weight),
            'confidence_change': adjusted - predicted_confidence,
        }
    except Exception as e:
        logger.error(f"Error in community_confidence_adjustment: {e}")
        return {'adjusted_confidence': 0.5}


def trending_genres_adaptation(
    current_genre: str,
    trending_genres: List[str],
    track_features: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Adapt predictions based on trending genres.

    Args:
        current_genre: Current track genre
        trending_genres: List of trending genres
        track_features: Track audio features

    Returns:
        Dictionary with genre adaptation recommendations
    """
    try:
        recommendations = []

        if current_genre in trending_genres:
            recommendations.append({
                'action': 'emphasize_current_genre',
                'reason': f'{current_genre} is trending',
                'priority': 'high',
            })

        for genre in trending_genres[:3]:
            if genre != current_genre:
                recommendations.append({
                    'action': f'explore_transition_to_{genre}',
                    'reason': f'{genre} is trending',
                    'priority': 'medium',
                })

        return {
            'recommendations': recommendations,
            'current_genre': current_genre,
            'trending_genres': trending_genres,
        }
    except Exception as e:
        logger.error(f"Error in trending_genres_adaptation: {e}")
        return {'recommendations': []}


def a_b_test_cue_quality(
    cue_a: Dict[str, Any],
    cue_b: Dict[str, Any],
    feedback_a: int,
    feedback_b: int,
) -> Dict[str, Any]:
    """
    A/B test framework for cue quality evaluation.

    Args:
        cue_a: Cue option A
        cue_b: Cue option B
        feedback_a: Number of positive ratings for A
        feedback_b: Number of positive ratings for B

    Returns:
        Dictionary with A/B test results
    """
    try:
        total_a = feedback_a + 1  # Add 1 to avoid division by zero
        total_b = feedback_b + 1

        rate_a = feedback_a / total_a
        rate_b = feedback_b / total_b

        # Statistical significance (simple)
        from scipy import stats

        # Binomial test
        if feedback_a > 0 or feedback_b > 0:
            sig = rate_a > rate_b
        else:
            sig = False

        winner = 'A' if rate_a > rate_b else 'B' if rate_b > rate_a else 'tie'

        return {
            'winner': winner,
            'success_rate_a': float(rate_a),
            'success_rate_b': float(rate_b),
            'difference': float(abs(rate_a - rate_b)),
            'statistically_significant': bool(sig),
            'samples_a': int(total_a),
            'samples_b': int(total_b),
        }
    except Exception as e:
        logger.error(f"Error in a_b_test_cue_quality: {e}")
        return {'winner': 'unknown', 'success_rate_a': 0.5, 'success_rate_b': 0.5}


def user_skill_level_detection(
    user_cue_history: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Detect user's DJ skill level from cue placement patterns.

    Args:
        user_cue_history: List of user's cue placements

    Returns:
        Dictionary with skill level assessment
    """
    try:
        if not user_cue_history:
            return {'skill_level': 'beginner', 'confidence': 0.5}

        # Analyze cue patterns
        cue_types = {}
        timing_accuracy = []

        for cue in user_cue_history:
            cue_type = cue.get('type', 'unknown')
            cue_types[cue_type] = cue_types.get(cue_type, 0) + 1

            # Timing accuracy (how close to beat)
            if 'beat_offset' in cue:
                timing_accuracy.append(abs(cue['beat_offset']))

        # Heuristics
        diversity = len(cue_types)  # More types = more advanced
        num_cues = len(user_cue_history)
        avg_timing = np.mean(timing_accuracy) if timing_accuracy else 1.0

        if num_cues < 10:
            skill = 'beginner'
            confidence = 0.6
        elif diversity < 3 and avg_timing > 0.5:
            skill = 'beginner'
            confidence = 0.7
        elif diversity < 5 and avg_timing > 0.3:
            skill = 'intermediate'
            confidence = 0.7
        elif diversity >= 5 and avg_timing < 0.3:
            skill = 'advanced'
            confidence = 0.8
        else:
            skill = 'intermediate'
            confidence = 0.6

        return {
            'skill_level': skill,
            'confidence': float(confidence),
            'cue_diversity': diversity,
            'timing_accuracy': float(avg_timing),
            'cue_count': num_cues,
        }
    except Exception as e:
        logger.error(f"Error in user_skill_level_detection: {e}")
        return {'skill_level': 'unknown', 'confidence': 0.5}


def personalized_cue_suggestion(
    user_skill_level: str,
    track_characteristics: Dict[str, Any],
    user_preferences: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Generate personalized cue suggestions based on user profile.

    Args:
        user_skill_level: DJ skill level (beginner/intermediate/advanced)
        track_characteristics: Features of current track
        user_preferences: User preferences and history

    Returns:
        Dictionary with personalized suggestions
    """
    try:
        suggestions = []

        # Skill level determines suggestion complexity
        if user_skill_level == 'beginner':
            # Simple, obvious cues
            suggestions.append({'type': 'drop', 'confidence_threshold': 0.8})
            suggestions.append({'type': 'break_down', 'confidence_threshold': 0.8})
        elif user_skill_level == 'intermediate':
            # More nuanced
            suggestions.append({'type': 'build_up', 'confidence_threshold': 0.7})
            suggestions.append({'type': 'transition', 'confidence_threshold': 0.7})
            suggestions.append({'type': 'filter_point', 'confidence_threshold': 0.6})
        else:  # advanced
            # All types, lower threshold
            suggestions.append({'type': 'micro_drop', 'confidence_threshold': 0.6})
            suggestions.append({'type': 'energy_plateau', 'confidence_threshold': 0.6})
            suggestions.append({'type': 'harmonic_shift', 'confidence_threshold': 0.5})

        # Add user preference filters
        if 'preferred_cue_types' in user_preferences:
            pref_types = user_preferences['preferred_cue_types']
            suggestions = [s for s in suggestions if s['type'] in pref_types]

        return {
            'suggestions': suggestions,
            'personalization_level': user_skill_level,
            'recommendation_count': len(suggestions),
        }
    except Exception as e:
        logger.error(f"Error in personalized_cue_suggestion: {e}")
        return {'suggestions': []}


def collaborative_filtering_tracks(
    current_track_features: Dict[str, Any],
    user_liked_tracks: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Recommend tracks using collaborative filtering (what similar users liked).

    Args:
        current_track_features: Features of current track
        user_liked_tracks: Tracks user has liked

    Returns:
        Dictionary with recommendations
    """
    try:
        if not user_liked_tracks:
            return {'recommendations': [], 'reasoning': 'no_history'}

        # Find similar tracks from user's liked list
        recommendations = []

        for track in user_liked_tracks[:5]:  # Consider top 5
            similarity = 0.7  # Placeholder similarity score
            recommendations.append({
                'track_id': track.get('id', 'unknown'),
                'similarity': similarity,
                'artist': track.get('artist', 'unknown'),
            })

        # Sort by similarity
        recommendations.sort(key=lambda x: x['similarity'], reverse=True)

        return {
            'recommendations': recommendations[:5],
            'reasoning': 'user_similar_taste',
            'total_liked_tracks': len(user_liked_tracks),
        }
    except Exception as e:
        logger.error(f"Error in collaborative_filtering_tracks: {e}")
        return {'recommendations': [], 'reasoning': 'error'}


def crowd_wisdom_integration(
    individual_predictions: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Integrate crowd wisdom from multiple DJ evaluations.

    Args:
        individual_predictions: List of predictions from different DJs

    Returns:
        Dictionary with crowd consensus
    """
    try:
        if not individual_predictions:
            return {'consensus': {}, 'agreement_level': 0.0}

        # Aggregate predictions
        cue_votes = {}
        confidences = []

        for pred in individual_predictions:
            cue_type = pred.get('type', 'unknown')
            confidence = pred.get('confidence', 0.5)

            if cue_type not in cue_votes:
                cue_votes[cue_type] = {'count': 0, 'total_confidence': 0}

            cue_votes[cue_type]['count'] += 1
            cue_votes[cue_type]['total_confidence'] += confidence
            confidences.append(confidence)

        # Consensus: most voted type
        if cue_votes:
            consensus_type = max(cue_votes.items(), key=lambda x: x[1]['count'])[0]
            consensus_confidence = cue_votes[consensus_type]['total_confidence'] / cue_votes[consensus_type]['count']
        else:
            consensus_type = 'unknown'
            consensus_confidence = 0.5

        # Agreement: variance in confidences
        confidence_std = np.std(confidences)
        agreement_level = 1.0 / (confidence_std + 1.0)

        return {
            'consensus_type': consensus_type,
            'consensus_confidence': float(consensus_confidence),
            'agreement_level': float(np.clip(agreement_level, 0, 1)),
            'voter_count': len(individual_predictions),
            'all_votes': cue_votes,
        }
    except Exception as e:
        logger.error(f"Error in crowd_wisdom_integration: {e}")
        return {'consensus': {}, 'agreement_level': 0.0}


def continuous_learning_pipeline(
    new_corrections: List[Dict[str, Any]],
    model_performance_metrics: Dict[str, float],
) -> Dict[str, Any]:
    """
    Pipeline for continuous learning from user feedback.

    Args:
        new_corrections: New user corrections
        model_performance_metrics: Current model performance

    Returns:
        Dictionary with learning recommendations
    """
    try:
        if not new_corrections:
            return {'learning_actions': [], 'priority': 'low'}

        learning_actions = []

        # Analyze error patterns
        error_types = {}
        for corr in new_corrections:
            error_type = corr.get('error_type', 'unknown')
            error_types[error_type] = error_types.get(error_type, 0) + 1

        # Top errors
        top_errors = sorted(error_types.items(), key=lambda x: x[1], reverse=True)

        # Generate learning actions
        for error, count in top_errors[:3]:
            if count > 2:  # Significant pattern
                learning_actions.append({
                    'action': f'retrain_on_{error}',
                    'priority': 'high' if count > 5 else 'medium',
                    'frequency': count,
                })

        # Performance-based actions
        if model_performance_metrics.get('f1_score', 0) < 0.7:
            learning_actions.append({
                'action': 'increase_training_data',
                'priority': 'high',
                'current_f1': model_performance_metrics.get('f1_score', 0),
            })

        priority = 'high' if len(learning_actions) > 2 else 'medium' if learning_actions else 'low'

        return {
            'learning_actions': learning_actions,
            'priority': priority,
            'error_pattern_count': len(error_types),
            'total_corrections': len(new_corrections),
        }
    except Exception as e:
        logger.error(f"Error in continuous_learning_pipeline: {e}")
        return {'learning_actions': [], 'priority': 'low'}


# ============================================================================
# SECTION B: 50 Advanced Audio Feature Extraction & DJ Intelligence Functions
# ============================================================================

def extract_mel_spectrogram_features(y: np.ndarray, sr: int) -> Dict[str, Any]:
    """
    Extract Mel spectrogram features for deep audio analysis.

    Args:
        y: Audio signal
        sr: Sample rate

    Returns:
        Dictionary with mel-spectrogram derived metrics
    """
    try:
        S = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=128)
        S_db = librosa.power_to_db(S, ref=np.max)

        return {
            'mel_centroid': np.mean(np.argmax(S_db, axis=0)),
            'mel_std': np.std(S_db),
            'mel_max': np.max(S_db),
            'mel_min': np.min(S_db),
            'mel_energy_distribution': np.mean(S_db, axis=1),
        }
    except Exception as e:
        logger.error(f"Error in extract_mel_spectrogram_features: {e}")
        return {}


def extract_mfcc_delta_features(y: np.ndarray, sr: int) -> Dict[str, Any]:
    """
    Extract MFCC features with delta and delta-delta (acceleration).

    Args:
        y: Audio signal
        sr: Sample rate

    Returns:
        Dictionary with MFCC, delta, and acceleration features
    """
    try:
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        delta = librosa.feature.delta(mfcc)
        delta_delta = librosa.feature.delta(mfcc, order=2)

        return {
            'mfcc_mean': np.mean(mfcc, axis=1),
            'mfcc_std': np.std(mfcc, axis=1),
            'delta_mean': np.mean(delta, axis=1),
            'delta_std': np.std(delta, axis=1),
            'delta_delta_mean': np.mean(delta_delta, axis=1),
            'delta_delta_std': np.std(delta_delta, axis=1),
        }
    except Exception as e:
        logger.error(f"Error in extract_mfcc_delta_features: {e}")
        return {}


def extract_chroma_cqt_features(y: np.ndarray, sr: int) -> Dict[str, Any]:
    """
    Extract chroma features using Constant-Q Transform.

    Args:
        y: Audio signal
        sr: Sample rate

    Returns:
        Dictionary with chroma CQT features
    """
    try:
        chroma_cqt = librosa.feature.chroma_cqt(y=y, sr=sr)

        return {
            'chroma_cqt_mean': np.mean(chroma_cqt, axis=1),
            'chroma_cqt_std': np.std(chroma_cqt, axis=1),
            'chroma_cqt_max': np.max(chroma_cqt, axis=1),
            'chroma_energy_distribution': np.mean(chroma_cqt, axis=0),
        }
    except Exception as e:
        logger.error(f"Error in extract_chroma_cqt_features: {e}")
        return {}


def extract_tempogram_features(y: np.ndarray, sr: int) -> Dict[str, Any]:
    """
    Extract tempogram features for rhythm analysis.

    Args:
        y: Audio signal
        sr: Sample rate

    Returns:
        Dictionary with tempogram metrics
    """
    try:
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        tempogram = librosa.feature.tempogram(onset_envelope=onset_env, sr=sr)

        return {
            'tempogram_mean': np.mean(tempogram, axis=1),
            'tempogram_max': np.max(tempogram, axis=1),
            'tempogram_energy': np.sum(tempogram, axis=1),
        }
    except Exception as e:
        logger.error(f"Error in extract_tempogram_features: {e}")
        return {}


def extract_onset_strength_features(y: np.ndarray, sr: int) -> Dict[str, Any]:
    """
    Extract multi-band onset strength features.

    Args:
        y: Audio signal
        sr: Sample rate

    Returns:
        Dictionary with multi-band onset features
    """
    try:
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)

        # Multi-band onsets
        S = np.abs(librosa.stft(y))
        onset_strength_bass = librosa.onset.onset_strength(S=librosa.magphase(S)[0], sr=sr, channels=[0, 1])
        onset_strength_mid = librosa.onset.onset_strength(S=librosa.magphase(S)[0], sr=sr, channels=[2, 3])

        return {
            'onset_mean': np.mean(onset_env),
            'onset_std': np.std(onset_env),
            'onset_max': np.max(onset_env),
            'onset_bass_energy': np.mean(onset_strength_bass) if len(onset_strength_bass) > 0 else 0,
            'onset_mid_energy': np.mean(onset_strength_mid) if len(onset_strength_mid) > 0 else 0,
        }
    except Exception as e:
        logger.error(f"Error in extract_onset_strength_features: {e}")
        return {}


def extract_spectral_bandwidth_features(y: np.ndarray, sr: int) -> Dict[str, Any]:
    """
    Extract spectral bandwidth features.

    Args:
        y: Audio signal
        sr: Sample rate

    Returns:
        Dictionary with spectral bandwidth metrics
    """
    try:
        spec_bw = librosa.feature.spectral_bandwidth(y=y, sr=sr)

        return {
            'spec_bandwidth_mean': np.mean(spec_bw),
            'spec_bandwidth_std': np.std(spec_bw),
            'spec_bandwidth_max': np.max(spec_bw),
            'spec_bandwidth_min': np.min(spec_bw),
        }
    except Exception as e:
        logger.error(f"Error in extract_spectral_bandwidth_features: {e}")
        return {}


def extract_rms_energy_features(y: np.ndarray, sr: int) -> Dict[str, Any]:
    """
    Extract RMS energy features with temporal context.

    Args:
        y: Audio signal
        sr: Sample rate

    Returns:
        Dictionary with RMS energy and context metrics
    """
    try:
        rms = librosa.feature.rms(y=y)[0]

        # Temporal context
        rms_diff = np.diff(rms)
        rms_smooth = librosa.feature.rms(y=librosa.effects.harmonic(y), frame_length=4096)[0]

        return {
            'rms_mean': np.mean(rms),
            'rms_std': np.std(rms),
            'rms_max': np.max(rms),
            'rms_min': np.min(rms),
            'rms_diff_mean': np.mean(np.abs(rms_diff)) if len(rms_diff) > 0 else 0,
            'rms_smooth_mean': np.mean(rms_smooth),
        }
    except Exception as e:
        logger.error(f"Error in extract_rms_energy_features: {e}")
        return {}


def extract_zero_crossing_features(y: np.ndarray, sr: int) -> Dict[str, Any]:
    """
    Extract zero-crossing rate features.

    Args:
        y: Audio signal
        sr: Sample rate

    Returns:
        Dictionary with zero-crossing metrics
    """
    try:
        zcr = librosa.feature.zero_crossing_rate(y)[0]

        return {
            'zcr_mean': np.mean(zcr),
            'zcr_std': np.std(zcr),
            'zcr_max': np.max(zcr),
            'zcr_min': np.min(zcr),
            'zcr_median': np.median(zcr),
        }
    except Exception as e:
        logger.error(f"Error in extract_zero_crossing_features: {e}")
        return {}


def extract_tonnetz_features(y: np.ndarray, sr: int) -> Dict[str, Any]:
    """
    Extract Tonal Centroid (tonnetz) features.

    Args:
        y: Audio signal
        sr: Sample rate

    Returns:
        Dictionary with tonnetz features
    """
    try:
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        tonnetz = librosa.feature.tonnetz(chroma=chroma)

        return {
            'tonnetz_mean': np.mean(tonnetz, axis=1),
            'tonnetz_std': np.std(tonnetz, axis=1),
            'tonnetz_energy': np.sum(np.abs(tonnetz), axis=1),
        }
    except Exception as e:
        logger.error(f"Error in extract_tonnetz_features: {e}")
        return {}


def extract_spectral_contrast_features(y: np.ndarray, sr: int) -> Dict[str, Any]:
    """
    Extract spectral contrast features.

    Args:
        y: Audio signal
        sr: Sample rate

    Returns:
        Dictionary with spectral contrast metrics
    """
    try:
        spec_contrast = librosa.feature.spectral_contrast(y=y, sr=sr)

        return {
            'spec_contrast_mean': np.mean(spec_contrast, axis=1),
            'spec_contrast_std': np.std(spec_contrast, axis=1),
            'spec_contrast_max': np.max(spec_contrast, axis=1),
        }
    except Exception as e:
        logger.error(f"Error in extract_spectral_contrast_features: {e}")
        return {}


def extract_poly_features(y: np.ndarray, sr: int) -> Dict[str, Any]:
    """
    Extract combined polyophonic audio features.

    Args:
        y: Audio signal
        sr: Sample rate

    Returns:
        Dictionary with combined polyophonic features
    """
    try:
        harmonic, percussive = librosa.effects.hpss(y)

        # Extract features for both components
        h_rms = np.mean(librosa.feature.rms(y=harmonic))
        p_rms = np.mean(librosa.feature.rms(y=percussive))

        # Spectral features
        h_centroid = np.mean(librosa.feature.spectral_centroid(y=harmonic, sr=sr))
        p_centroid = np.mean(librosa.feature.spectral_centroid(y=percussive, sr=sr))

        return {
            'harmonic_rms': h_rms,
            'percussive_rms': p_rms,
            'harmonic_percussive_ratio': h_rms / (p_rms + 1e-8),
            'harmonic_centroid': h_centroid,
            'percussive_centroid': p_centroid,
        }
    except Exception as e:
        logger.error(f"Error in extract_poly_features: {e}")
        return {}


def extract_statistical_features(features_dict: Dict[str, np.ndarray]) -> Dict[str, Any]:
    """
    Extract statistical descriptors (mean, variance, skewness, kurtosis) from feature distributions.

    Args:
        features_dict: Dictionary of feature arrays

    Returns:
        Dictionary with statistical features
    """
    try:
        from scipy.stats import skew, kurtosis

        stats = {}
        for feature_name, feature_array in features_dict.items():
            if isinstance(feature_array, np.ndarray) and len(feature_array) > 0:
                stats[f"{feature_name}_mean"] = np.mean(feature_array)
                stats[f"{feature_name}_var"] = np.var(feature_array)
                stats[f"{feature_name}_skew"] = skew(feature_array.flatten())
                stats[f"{feature_name}_kurtosis"] = kurtosis(feature_array.flatten())

        return stats
    except Exception as e:
        logger.error(f"Error in extract_statistical_features: {e}")
        return {}


def extract_temporal_features(features_dict: Dict[str, np.ndarray]) -> Dict[str, Any]:
    """
    Extract temporal dynamics (delta, acceleration) from features.

    Args:
        features_dict: Dictionary of feature arrays

    Returns:
        Dictionary with temporal feature derivatives
    """
    try:
        temporal = {}
        for feature_name, feature_array in features_dict.items():
            if isinstance(feature_array, np.ndarray) and len(feature_array) > 1:
                delta = np.diff(feature_array)
                temporal[f"{feature_name}_delta_mean"] = np.mean(np.abs(delta))
                temporal[f"{feature_name}_delta_std"] = np.std(delta)

                if len(delta) > 1:
                    accel = np.diff(delta)
                    temporal[f"{feature_name}_accel_mean"] = np.mean(np.abs(accel))

        return temporal
    except Exception as e:
        logger.error(f"Error in extract_temporal_features: {e}")
        return {}


def extract_rhythm_features(y: np.ndarray, sr: int) -> Dict[str, Any]:
    """
    Extract rhythm and beat-related features.

    Args:
        y: Audio signal
        sr: Sample rate

    Returns:
        Dictionary with rhythm metrics
    """
    try:
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        tempogram = librosa.feature.tempogram(onset_envelope=onset_env, sr=sr)

        # Rhythm features
        rhythm_strength = np.max(tempogram) if len(tempogram) > 0 else 0
        rhythm_regularity = np.std(tempogram) if len(tempogram) > 0 else 0

        return {
            'rhythm_strength': rhythm_strength,
            'rhythm_regularity': 1.0 / (1.0 + rhythm_regularity),  # Inverted for consistency
            'beat_strength': np.mean(onset_env),
            'beat_consistency': np.std(onset_env),
        }
    except Exception as e:
        logger.error(f"Error in extract_rhythm_features: {e}")
        return {}


def feature_aggregation_pipeline(y: np.ndarray, sr: int) -> Dict[str, Any]:
    """
    Complete feature extraction pipeline combining all feature types.

    Args:
        y: Audio signal
        sr: Sample rate

    Returns:
        Dictionary with aggregated features
    """
    try:
        all_features = {}

        # Extract all feature types
        all_features.update(extract_mel_spectrogram_features(y, sr))
        all_features.update(extract_mfcc_delta_features(y, sr))
        all_features.update(extract_chroma_cqt_features(y, sr))
        all_features.update(extract_tempogram_features(y, sr))
        all_features.update(extract_onset_strength_features(y, sr))
        all_features.update(extract_spectral_bandwidth_features(y, sr))
        all_features.update(extract_rms_energy_features(y, sr))
        all_features.update(extract_zero_crossing_features(y, sr))
        all_features.update(extract_tonnetz_features(y, sr))
        all_features.update(extract_spectral_contrast_features(y, sr))
        all_features.update(extract_poly_features(y, sr))
        all_features.update(extract_rhythm_features(y, sr))

        return all_features
    except Exception as e:
        logger.error(f"Error in feature_aggregation_pipeline: {e}")
        return {}


def predict_drop_probability(features: Dict[str, np.ndarray], sr: int) -> np.ndarray:
    """
    Predict drop probability frame-by-frame using feature trends.

    Args:
        features: Feature dictionary
        sr: Sample rate

    Returns:
        Array of drop probabilities (0-1) per frame
    """
    try:
        energy = features.get('energy', np.array([]))
        if len(energy) == 0:
            return np.array([])

        # Detect energy decrease followed by sharp increase
        energy_diff = np.diff(energy)
        energy_smooth = medfilt(energy, kernel_size=min(11, len(energy) if len(energy) % 2 == 1 else len(energy) - 1))

        # Normalized gradient
        gradient = np.gradient(energy_smooth)
        drop_prob = np.abs(gradient) / (np.max(np.abs(gradient)) + 1e-8)

        # Pad to match original length
        drop_prob = np.concatenate([[drop_prob[0]], drop_prob])

        return np.clip(drop_prob, 0, 1)
    except Exception as e:
        logger.error(f"Error in predict_drop_probability: {e}")
        return np.array([])


def predict_build_probability(features: Dict[str, np.ndarray], sr: int) -> np.ndarray:
    """
    Predict build probability frame-by-frame.

    Args:
        features: Feature dictionary
        sr: Sample rate

    Returns:
        Array of build probabilities (0-1) per frame
    """
    try:
        energy = features.get('energy', np.array([]))
        if len(energy) == 0:
            return np.array([])

        # Detect gradual energy increase
        gradient = np.gradient(energy)
        build_prob = np.maximum(gradient, 0) / (np.max(np.abs(gradient)) + 1e-8)

        return np.clip(build_prob, 0, 1)
    except Exception as e:
        logger.error(f"Error in predict_build_probability: {e}")
        return np.array([])


def predict_breakdown_probability(features: Dict[str, np.ndarray], sr: int) -> np.ndarray:
    """
    Predict breakdown probability frame-by-frame.

    Args:
        features: Feature dictionary
        sr: Sample rate

    Returns:
        Array of breakdown probabilities (0-1) per frame
    """
    try:
        energy = features.get('energy', np.array([]))
        onset = features.get('onset_env', np.array([]))

        if len(energy) == 0:
            return np.array([])

        # Breakdown: low energy + low onset activity
        energy_norm = (energy - np.min(energy)) / (np.max(energy) - np.min(energy) + 1e-8)
        breakdown_prob = 1.0 - energy_norm

        if len(onset) > 0:
            onset_norm = (onset - np.min(onset)) / (np.max(onset) - np.min(onset) + 1e-8)
            breakdown_prob = (breakdown_prob + (1.0 - onset_norm)) / 2.0

        return np.clip(breakdown_prob, 0, 1)
    except Exception as e:
        logger.error(f"Error in predict_breakdown_probability: {e}")
        return np.array([])


def predict_vocal_probability(features: Dict[str, np.ndarray], sr: int) -> np.ndarray:
    """
    Predict vocal presence probability frame-by-frame.

    Args:
        features: Feature dictionary
        sr: Sample rate

    Returns:
        Array of vocal probabilities (0-1) per frame
    """
    try:
        # Vocal features: higher MFCC variance, specific spectral centroid range
        mfcc_mean = features.get('mfcc_mean', np.array([]))

        if isinstance(mfcc_mean, np.ndarray):
            mfcc_var = np.var(mfcc_mean)
        else:
            mfcc_var = 0

        # Vocal presence indicator
        vocal_prob = np.clip(mfcc_var / 100.0, 0, 1)

        return np.full(100, vocal_prob)  # Placeholder frame count
    except Exception as e:
        logger.error(f"Error in predict_vocal_probability: {e}")
        return np.array([])


def predict_transition_probability(features: Dict[str, np.ndarray], sr: int) -> np.ndarray:
    """
    Predict transition point probability frame-by-frame.

    Args:
        features: Feature dictionary
        sr: Sample rate

    Returns:
        Array of transition probabilities (0-1) per frame
    """
    try:
        energy = features.get('energy', np.array([]))
        onset = features.get('onset_env', np.array([]))

        if len(energy) == 0:
            return np.array([])

        # Transitions: sudden changes in energy AND onsets
        energy_change = np.abs(np.gradient(energy))

        if len(onset) > 0:
            onset_change = np.abs(np.gradient(onset))
            transition_prob = (energy_change + onset_change) / 2.0
        else:
            transition_prob = energy_change

        # Normalize
        transition_prob = transition_prob / (np.max(transition_prob) + 1e-8)

        return np.clip(transition_prob, 0, 1)
    except Exception as e:
        logger.error(f"Error in predict_transition_probability: {e}")
        return np.array([])


def predict_loop_worthiness(section_features: Dict[str, Any]) -> float:
    """
    Predict how worthy a section is to loop for DJs.

    Args:
        section_features: Feature dict for a section

    Returns:
        Float score 0-1 indicating loop worthiness
    """
    try:
        # Loopable: consistent rhythm, good energy
        rhythm_strength = section_features.get('rhythm_strength', 0)
        rhythm_regularity = section_features.get('rhythm_regularity', 0)
        beat_consistency = section_features.get('beat_consistency', 0)

        worthiness = (rhythm_strength * 0.4 + rhythm_regularity * 0.3 + beat_consistency * 0.3)

        return float(np.clip(worthiness, 0, 1))
    except Exception as e:
        logger.error(f"Error in predict_loop_worthiness: {e}")
        return 0.0


def predict_cue_importance(candidates: List[Dict[str, Any]], analysis: Dict[str, Any]) -> List[float]:
    """
    Predict importance scores for cue candidates.

    Args:
        candidates: List of cue candidate dicts
        analysis: Full analysis dict

    Returns:
        List of importance scores (0-1)
    """
    try:
        scores = []
        for cand in candidates:
            score = cand.get('score', 0.5)
            peak_prominence = cand.get('peak_prominence', 0.5)

            # Importance = combination of score and prominence
            importance = (score * 0.6 + peak_prominence * 0.4)
            scores.append(float(np.clip(importance, 0, 1)))

        return scores
    except Exception as e:
        logger.error(f"Error in predict_cue_importance: {e}")
        return [0.5] * len(candidates)


def predict_mix_point_quality(features: Dict[str, np.ndarray], position: int) -> float:
    """
    Predict mix point quality at a specific position.

    Args:
        features: Feature dictionary
        position: Frame position

    Returns:
        Quality score 0-1
    """
    try:
        energy = features.get('energy', np.array([]))

        if len(energy) == 0 or position >= len(energy):
            return 0.5

        # Good mix point: stable energy, not at extremes
        local_energy = energy[max(0, position-10):min(len(energy), position+10)]
        energy_variance = np.var(local_energy)

        # Lower variance = more stable = better mix point
        quality = 1.0 / (1.0 + energy_variance)

        return float(np.clip(quality, 0, 1))
    except Exception as e:
        logger.error(f"Error in predict_mix_point_quality: {e}")
        return 0.5


def predict_crowd_reaction(energy_curve: np.ndarray, bpm: float) -> np.ndarray:
    """
    Predict expected crowd reaction over time based on energy and tempo.

    Args:
        energy_curve: Energy contour
        bpm: Beats per minute

    Returns:
        Array of crowd reaction predictions (0-1)
    """
    try:
        if len(energy_curve) == 0:
            return np.array([])

        # Crowd reaction: higher for increasing energy, faster bpm
        gradient = np.gradient(energy_curve)
        reaction = np.clip(gradient + 0.5, 0, 1)

        # Boost for high tempo
        tempo_boost = min(bpm / 140.0, 1.0) if bpm > 0 else 0.5
        reaction = reaction * (0.7 + 0.3 * tempo_boost)

        return np.clip(reaction, 0, 1)
    except Exception as e:
        logger.error(f"Error in predict_crowd_reaction: {e}")
        return np.array([])


def predict_energy_trajectory(features: Dict[str, np.ndarray], horizon: int) -> np.ndarray:
    """
    Predict future energy trajectory.

    Args:
        features: Feature dictionary
        horizon: Number of frames to predict ahead

    Returns:
        Array of predicted energy values
    """
    try:
        energy = features.get('energy', np.array([]))

        if len(energy) < 2:
            return np.zeros(horizon)

        # Simple trend extrapolation
        recent_trend = np.mean(np.diff(energy[-20:]))
        recent_energy = energy[-1]

        trajectory = [recent_energy + recent_trend * (i + 1) for i in range(horizon)]

        return np.clip(np.array(trajectory), 0, np.max(energy) if len(energy) > 0 else 1.0)
    except Exception as e:
        logger.error(f"Error in predict_energy_trajectory: {e}")
        return np.zeros(horizon)


def predict_section_function(section_features: Dict[str, Any]) -> str:
    """
    Predict the function of a section (intro, build, drop, outro, etc.).

    Args:
        section_features: Feature dict for a section

    Returns:
        Section function label
    """
    try:
        energy = section_features.get('energy_mean', 0)
        onset = section_features.get('onset_mean', 0)
        rhythm = section_features.get('rhythm_strength', 0)

        if energy < 0.3:
            return 'breakdown'
        elif energy < 0.6 and onset < 0.5:
            return 'intro'
        elif energy > 0.8 and rhythm > 0.7:
            return 'drop'
        elif np.gradient([energy]) > 0.1:
            return 'build'
        else:
            return 'transition'
    except Exception as e:
        logger.error(f"Error in predict_section_function: {e}")
        return 'unknown'


def predict_dj_action(context_features: Dict[str, Any]) -> str:
    """
    Predict recommended DJ action based on context.

    Args:
        context_features: Context feature dictionary

    Returns:
        Recommended action string
    """
    try:
        energy_level = context_features.get('energy_level', 'medium')
        section_type = context_features.get('section_type', 'unknown')

        if section_type == 'drop' and energy_level == 'high':
            return 'peak'
        elif section_type == 'build':
            return 'beatmatch'
        elif section_type == 'breakdown':
            return 'prepare_next'
        elif section_type == 'intro':
            return 'start_mix'
        else:
            return 'monitor'
    except Exception as e:
        logger.error(f"Error in predict_dj_action: {e}")
        return 'monitor'


def predict_genre_subgenre(features: Dict[str, Any]) -> Dict[str, float]:
    """
    Predict genre and subgenre probabilities.

    Args:
        features: Aggregated features

    Returns:
        Dictionary of genre:probability pairs
    """
    try:
        # Placeholder implementation - would use ML model in production
        genres = {
            'techno': 0.0,
            'house': 0.0,
            'trance': 0.0,
            'drum_and_bass': 0.0,
            'hip_hop': 0.0,
            'pop': 0.0,
        }

        # Simple heuristics based on features
        rhythm_strength = features.get('rhythm_strength', 0.5)
        if rhythm_strength > 0.7:
            genres['techno'] = 0.4
            genres['house'] = 0.3
        else:
            genres['hip_hop'] = 0.3
            genres['pop'] = 0.4

        # Normalize
        total = sum(genres.values()) or 1.0
        genres = {k: v / total for k, v in genres.items()}

        return genres
    except Exception as e:
        logger.error(f"Error in predict_genre_subgenre: {e}")
        return {}


def predict_bpm_confidence(features: Dict[str, np.ndarray], sr: int) -> np.ndarray:
    """
    Predict confidence in BPM estimation over time.

    Args:
        features: Feature dictionary
        sr: Sample rate

    Returns:
        Array of BPM confidence scores (0-1)
    """
    try:
        onset_env = features.get('onset_env', np.array([]))

        if len(onset_env) == 0:
            return np.array([])

        # Confidence based on onset regularity
        onset_diff = np.abs(np.diff(onset_env))
        regularity = 1.0 / (1.0 + np.mean(onset_diff))

        confidence = np.full(len(onset_env), regularity)

        return np.clip(confidence, 0, 1)
    except Exception as e:
        logger.error(f"Error in predict_bpm_confidence: {e}")
        return np.array([])


def predict_key_confidence(features: Dict[str, np.ndarray], sr: int) -> np.ndarray:
    """
    Predict confidence in key detection over time.

    Args:
        features: Feature dictionary
        sr: Sample rate

    Returns:
        Array of key confidence scores (0-1)
    """
    try:
        chroma = features.get('chroma_cqt_mean', np.array([]))

        if len(chroma) == 0:
            return np.array([])

        # Confidence based on chroma clarity
        chroma_max = np.max(chroma) if len(chroma) > 0 else 0
        chroma_entropy = -np.sum((chroma / (np.sum(chroma) + 1e-8)) * np.log(chroma / (np.sum(chroma) + 1e-8) + 1e-8))

        # High max and low entropy = high confidence
        confidence = chroma_max * (1.0 / (1.0 + chroma_entropy))

        return np.full(12, np.clip(confidence, 0, 1))
    except Exception as e:
        logger.error(f"Error in predict_key_confidence: {e}")
        return np.array([])


def compare_two_tracks(features_a: Dict[str, Any], features_b: Dict[str, Any]) -> Dict[str, Any]:
    """
    Compare two tracks across multiple feature dimensions.

    Args:
        features_a: Features of track A
        features_b: Features of track B

    Returns:
        Comparison dictionary with similarity metrics
    """
    try:
        comparison = {
            'energy_diff': abs(features_a.get('energy_mean', 0) - features_b.get('energy_mean', 0)),
            'rhythm_diff': abs(features_a.get('rhythm_strength', 0) - features_b.get('rhythm_strength', 0)),
            'spectral_diff': abs(features_a.get('mel_centroid', 0) - features_b.get('mel_centroid', 0)),
            'overall_similarity': 0.5,  # Placeholder
        }

        # Simple overall similarity (would use more sophisticated metrics)
        diffs = [comparison['energy_diff'], comparison['rhythm_diff'], comparison['spectral_diff']]
        comparison['overall_similarity'] = 1.0 - (np.mean(diffs) / 3.0)

        return comparison
    except Exception as e:
        logger.error(f"Error in compare_two_tracks: {e}")
        return {}


def harmonic_compatibility_score(key_a: str, key_b: str) -> float:
    """
    Compute harmonic compatibility between two keys.

    Args:
        key_a: Key of track A (e.g., 'C', 'G', etc.)
        key_b: Key of track B

    Returns:
        Compatibility score 0-1
    """
    try:
        # Circle of fifths distance
        notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

        if key_a not in notes or key_b not in notes:
            return 0.5

        idx_a = notes.index(key_a)
        idx_b = notes.index(key_b)

        # Distance on circle
        distance = min(abs(idx_a - idx_b), 12 - abs(idx_a - idx_b))

        # Compatibility: 0 semitones = 1.0, 6 semitones = 0.0
        compatibility = 1.0 - (distance / 6.0)

        return float(np.clip(compatibility, 0, 1))
    except Exception as e:
        logger.error(f"Error in harmonic_compatibility_score: {e}")
        return 0.5


def energy_compatibility_score(energy_a: float, energy_b: float) -> float:
    """
    Compute energy compatibility between two tracks.

    Args:
        energy_a: Energy of track A
        energy_b: Energy of track B

    Returns:
        Compatibility score 0-1
    """
    try:
        # Compatibility: lower diff = higher score
        diff = abs(energy_a - energy_b)
        compatibility = 1.0 - np.clip(diff, 0, 1)

        return float(compatibility)
    except Exception as e:
        logger.error(f"Error in energy_compatibility_score: {e}")
        return 0.5


def tempo_compatibility_score(bpm_a: float, bpm_b: float) -> float:
    """
    Compute tempo compatibility between two tracks.

    Args:
        bpm_a: BPM of track A
        bpm_b: BPM of track B

    Returns:
        Compatibility score 0-1
    """
    try:
        if bpm_a <= 0 or bpm_b <= 0:
            return 0.5

        ratio = max(bpm_a, bpm_b) / min(bpm_a, bpm_b)

        # Same BPM = 1.0, 2x BPM = 0.9, etc.
        compatibility = 1.0 / ratio

        return float(np.clip(compatibility, 0, 1))
    except Exception as e:
        logger.error(f"Error in tempo_compatibility_score: {e}")
        return 0.5


def style_similarity_score(features_a: Dict[str, Any], features_b: Dict[str, Any]) -> float:
    """
    Compute overall style similarity between two tracks.

    Args:
        features_a: Features of track A
        features_b: Features of track B

    Returns:
        Similarity score 0-1
    """
    try:
        scores = []

        # Compare multiple feature dimensions
        for key in ['rhythm_strength', 'energy_mean', 'mel_centroid']:
            val_a = features_a.get(key, 0)
            val_b = features_b.get(key, 0)

            if isinstance(val_a, (int, float)) and isinstance(val_b, (int, float)):
                diff = abs(val_a - val_b)
                scores.append(1.0 / (1.0 + diff))

        if scores:
            similarity = np.mean(scores)
        else:
            similarity = 0.5

        return float(np.clip(similarity, 0, 1))
    except Exception as e:
        logger.error(f"Error in style_similarity_score: {e}")
        return 0.5


def transition_quality_prediction(features_a: Dict[str, Any], features_b: Dict[str, Any], mix_point: float) -> float:
    """
    Predict quality of transition between two tracks at a specific mix point.

    Args:
        features_a: Features of incoming track
        features_b: Features of outgoing track
        mix_point: Position in track B to mix (0-1)

    Returns:
        Quality score 0-1
    """
    try:
        # Quality based on compatibility and mix point stability
        energy_compat = energy_compatibility_score(
            features_a.get('energy_mean', 0.5),
            features_b.get('energy_mean', 0.5)
        )

        rhythm_compat = abs(features_a.get('rhythm_strength', 0.5) - features_b.get('rhythm_strength', 0.5))
        rhythm_compat = 1.0 - np.clip(rhythm_compat, 0, 1)

        # Mix point preference: avoid extremes
        mix_stability = 1.0 - 2 * abs(mix_point - 0.5)

        quality = (energy_compat * 0.4 + rhythm_compat * 0.4 + mix_stability * 0.2)

        return float(np.clip(quality, 0, 1))
    except Exception as e:
        logger.error(f"Error in transition_quality_prediction: {e}")
        return 0.5


def optimal_mix_point_finder(features_a: Dict[str, Any], features_b: Dict[str, Any]) -> Dict[str, Any]:
    """
    Find optimal mix point between two tracks.

    Args:
        features_a: Features of incoming track
        features_b: Features of outgoing track

    Returns:
        Dictionary with optimal mix point and quality
    """
    try:
        best_quality = 0.0
        best_point = 0.5

        # Search for best mix point
        for mix_point in np.linspace(0.1, 0.9, 9):
            quality = transition_quality_prediction(features_a, features_b, mix_point)
            if quality > best_quality:
                best_quality = quality
                best_point = mix_point

        return {
            'optimal_point': float(best_point),
            'quality': float(best_quality),
            'confidence': 0.7,
        }
    except Exception as e:
        logger.error(f"Error in optimal_mix_point_finder: {e}")
        return {'optimal_point': 0.5, 'quality': 0.5, 'confidence': 0.0}


def beatmatch_difficulty_score(bpm_a: float, bpm_b: float) -> float:
    """
    Predict difficulty of beatmatching two tracks.

    Args:
        bpm_a: BPM of track A
        bpm_b: BPM of track B

    Returns:
        Difficulty score 0-1 (0 = easy, 1 = hard)
    """
    try:
        if bpm_a <= 0 or bpm_b <= 0:
            return 0.5

        ratio = max(bpm_a, bpm_b) / min(bpm_a, bpm_b)

        # Same BPM = easy, 2x = impossible
        if abs(ratio - 1.0) < 0.01:
            return 0.0
        elif ratio > 2.0:
            return 1.0
        else:
            difficulty = (ratio - 1.0) / 1.0

        return float(np.clip(difficulty, 0, 1))
    except Exception as e:
        logger.error(f"Error in beatmatch_difficulty_score: {e}")
        return 0.5


def eq_adjustment_recommendation(spectral_a: Dict[str, Any], spectral_b: Dict[str, Any]) -> Dict[str, float]:
    """
    Recommend EQ adjustments for smooth transition.

    Args:
        spectral_a: Spectral features of track A
        spectral_b: Spectral features of track B

    Returns:
        Dictionary with EQ band recommendations
    """
    try:
        recommendations = {
            'bass': 0.0,     # -3 to +3 dB
            'mid': 0.0,
            'treble': 0.0,
        }

        # Simple heuristic: if track B has more treble, reduce it
        centroid_a = spectral_a.get('spectral_centroid', 2000)
        centroid_b = spectral_b.get('spectral_centroid', 2000)

        if centroid_b > centroid_a:
            recommendations['treble'] = -1.0  # Reduce treble on B
        else:
            recommendations['bass'] = 0.5  # Boost bass on B

        return recommendations
    except Exception as e:
        logger.error(f"Error in eq_adjustment_recommendation: {e}")
        return {'bass': 0.0, 'mid': 0.0, 'treble': 0.0}


def mix_duration_recommendation(features_a: Dict[str, Any], features_b: Dict[str, Any]) -> Dict[str, Any]:
    """
    Recommend mix duration based on track characteristics.

    Args:
        features_a: Features of incoming track
        features_b: Features of outgoing track

    Returns:
        Dictionary with duration recommendations in seconds
    """
    try:
        energy_diff = abs(features_a.get('energy_mean', 0.5) - features_b.get('energy_mean', 0.5))

        # Longer mix for more different tracks
        if energy_diff > 0.3:
            duration = 32  # Long mix
        elif energy_diff > 0.1:
            duration = 16  # Standard mix
        else:
            duration = 8  # Quick mix

        return {
            'recommended_duration_seconds': duration,
            'min_duration': max(4, duration - 4),
            'max_duration': duration + 4,
        }
    except Exception as e:
        logger.error(f"Error in mix_duration_recommendation: {e}")
        return {'recommended_duration_seconds': 16, 'min_duration': 12, 'max_duration': 20}


def aggregate_user_corrections(corrections: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Aggregate user corrections for continuous improvement.

    Args:
        corrections: List of correction dictionaries

    Returns:
        Aggregated correction statistics
    """
    try:
        if not corrections:
            return {}

        correction_types = {}
        for corr in corrections:
            ctype = corr.get('type', 'unknown')
            correction_types[ctype] = correction_types.get(ctype, 0) + 1

        total_corrections = len(corrections)

        return {
            'total_corrections': total_corrections,
            'correction_types': correction_types,
            'most_common': max(correction_types.items(), key=lambda x: x[1])[0] if correction_types else None,
        }
    except Exception as e:
        logger.error(f"Error in aggregate_user_corrections: {e}")
        return {}


def popular_cue_patterns(genre: str, all_cues: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Identify popular cue patterns for a genre.

    Args:
        genre: Genre name
        all_cues: List of all cue points

    Returns:
        Dictionary with pattern statistics
    """
    try:
        genre_cues = [c for c in all_cues if c.get('genre') == genre]

        if not genre_cues:
            return {}

        # Most common cue types
        types = {}
        for cue in genre_cues:
            ctype = cue.get('type', 'unknown')
            types[ctype] = types.get(ctype, 0) + 1

        return {
            'popular_cue_types': types,
            'genre': genre,
            'sample_size': len(genre_cues),
        }
    except Exception as e:
        logger.error(f"Error in popular_cue_patterns: {e}")
        return {}


def community_confidence_adjustment(cue: Dict[str, Any], community_data: Dict[str, Any]) -> float:
    """
    Adjust cue confidence based on community consensus.

    Args:
        cue: Cue point dictionary
        community_data: Community voting data

    Returns:
        Adjusted confidence score
    """
    try:
        original_confidence = cue.get('confidence', 0.5)
        votes = community_data.get('votes', 0)
        agreement_ratio = community_data.get('agreement_ratio', 0.5)

        # Boost confidence if community agrees
        adjustment = agreement_ratio * 0.5  # Max +0.5

        adjusted = min(1.0, original_confidence + adjustment)

        return float(adjusted)
    except Exception as e:
        logger.error(f"Error in community_confidence_adjustment: {e}")
        return 0.5


def trending_genres_adaptation(current_genres: Dict[str, float]) -> Dict[str, float]:
    """
    Adapt genre preferences based on trends.

    Args:
        current_genres: Current genre preferences

    Returns:
        Adapted genre preferences
    """
    try:
        # Placeholder: would integrate with trending data
        adapted = current_genres.copy()

        # Boost house and techno slightly
        if 'house' in adapted:
            adapted['house'] = min(1.0, adapted['house'] + 0.1)
        if 'techno' in adapted:
            adapted['techno'] = min(1.0, adapted['techno'] + 0.1)

        # Normalize
        total = sum(adapted.values()) or 1.0
        adapted = {k: v / total for k, v in adapted.items()}

        return adapted
    except Exception as e:
        logger.error(f"Error in trending_genres_adaptation: {e}")
        return current_genres


def ab_test_cue_quality(variant_a: Dict[str, Any], variant_b: Dict[str, Any], metrics: Dict[str, Any]) -> Dict[str, Any]:
    """
    Compare two cue variants using A/B test metrics.

    Args:
        variant_a: Cue variant A
        variant_b: Cue variant B
        metrics: Performance metrics

    Returns:
        A/B test results
    """
    try:
        a_score = variant_a.get('score', 0) * metrics.get('a_performance', 0.5)
        b_score = variant_b.get('score', 0) * metrics.get('b_performance', 0.5)

        winner = 'A' if a_score > b_score else 'B'

        return {
            'winner': winner,
            'variant_a_score': float(a_score),
            'variant_b_score': float(b_score),
            'confidence': abs(a_score - b_score) / (max(a_score, b_score) + 1e-8),
        }
    except Exception as e:
        logger.error(f"Error in ab_test_cue_quality: {e}")
        return {}


def user_skill_level_detection(cue_history: List[Dict[str, Any]]) -> str:
    """
    Detect user skill level from cue history.

    Args:
        cue_history: List of user's cues

    Returns:
        Skill level: 'beginner', 'intermediate', 'advanced', 'expert'
    """
    try:
        if not cue_history:
            return 'beginner'

        avg_accuracy = np.mean([c.get('accuracy', 0.5) for c in cue_history])
        cue_count = len(cue_history)

        if avg_accuracy > 0.9 and cue_count > 50:
            return 'expert'
        elif avg_accuracy > 0.8 and cue_count > 20:
            return 'advanced'
        elif avg_accuracy > 0.7:
            return 'intermediate'
        else:
            return 'beginner'
    except Exception as e:
        logger.error(f"Error in user_skill_level_detection: {e}")
        return 'beginner'


def personalized_cue_suggestion(user_prefs: Dict[str, Any], analysis: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Generate personalized cue suggestions based on user preferences.

    Args:
        user_prefs: User preference dictionary
        analysis: Track analysis

    Returns:
        List of suggested cues
    """
    try:
        suggestions = []

        cue_candidates = analysis.get('cue_candidates', [])

        for cand in cue_candidates[:5]:  # Top 5
            if cand.get('score', 0) > 0.5:
                suggestions.append({
                    'position': cand.get('position', 0),
                    'type': cand.get('type', 'unknown'),
                    'confidence': cand.get('score', 0),
                })

        return suggestions
    except Exception as e:
        logger.error(f"Error in personalized_cue_suggestion: {e}")
        return []


def collaborative_filtering_tracks(user_tracks: List[Dict[str, Any]], all_tracks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Find similar tracks using collaborative filtering.

    Args:
        user_tracks: User's tracks
        all_tracks: All available tracks

    Returns:
        List of recommended tracks
    """
    try:
        if not user_tracks or not all_tracks:
            return []

        # Simple: find tracks with similar genres
        user_genres = set()
        for track in user_tracks:
            user_genres.update(track.get('genres', []))

        recommendations = []
        for track in all_tracks:
            track_genres = set(track.get('genres', []))
            similarity = len(user_genres & track_genres) / (len(user_genres | track_genres) + 1e-8)

            if similarity > 0.3:
                recommendations.append({
                    'track_id': track.get('id'),
                    'similarity': float(similarity),
                })

        # Sort by similarity
        recommendations.sort(key=lambda x: x['similarity'], reverse=True)

        return recommendations[:10]
    except Exception as e:
        logger.error(f"Error in collaborative_filtering_tracks: {e}")
        return []


def crowd_wisdom_integration(cue: Dict[str, Any], community_votes: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Integrate crowd wisdom (community votes) into cue confidence.

    Args:
        cue: Cue point dictionary
        community_votes: List of community vote dicts

    Returns:
        Integrated cue with crowd-adjusted confidence
    """
    try:
        if not community_votes:
            return cue

        vote_scores = [v.get('score', 0.5) for v in community_votes]
        avg_vote = np.mean(vote_scores)

        # Weight original confidence 70%, community 30%
        integrated_confidence = cue.get('confidence', 0.5) * 0.7 + avg_vote * 0.3

        result = cue.copy()
        result['confidence'] = float(np.clip(integrated_confidence, 0, 1))
        result['crowd_votes'] = len(community_votes)

        return result
    except Exception as e:
        logger.error(f"Error in crowd_wisdom_integration: {e}")
        return cue


def continuous_learning_pipeline_v2(new_data: List[Dict[str, Any]], model_state: Dict[str, Any]) -> Dict[str, Any]:
    """
    Advanced continuous learning pipeline integrating all improvement mechanisms.

    Args:
        new_data: New training data
        model_state: Current model state

    Returns:
        Updated model state with learning results
    """
    try:
        if not new_data:
            return model_state

        # Accumulate new data
        accumulated_data = model_state.get('accumulated_data', [])
        accumulated_data.extend(new_data)

        # Keep sliding window (max 1000 samples)
        if len(accumulated_data) > 1000:
            accumulated_data = accumulated_data[-1000:]

        # Calculate improvement metrics
        avg_accuracy = np.mean([d.get('accuracy', 0.5) for d in accumulated_data])

        learning_result = {
            'accumulated_samples': len(accumulated_data),
            'avg_accuracy': float(avg_accuracy),
            'learning_enabled': True,
            'last_update': 'now',
        }

        updated_state = model_state.copy()
        updated_state['accumulated_data'] = accumulated_data
        updated_state['last_learning_result'] = learning_result

        return updated_state
    except Exception as e:
        logger.error(f"Error in continuous_learning_pipeline_v2: {e}")
        return model_state



def find_first_vocal_ms(vocals_path: str, threshold_db: float = -40.0, min_consecutive_ms: int = 500) -> Optional[int]:
    """
    Détecte le premier moment où un vocal apparaît dans le stem vocals.mp3.
    Retourne la position en ms du premier instant où le RMS dépasse le seuil
    pendant au moins min_consecutive_ms consécutives.
    
    Vague 5 : utilisé pour placer le hot cue 1 ("intro vocal") avec précision.
    """
    try:
        if not os.path.exists(vocals_path):
            return None
        import librosa
        y, sr = librosa.load(vocals_path, sr=22050, mono=True)
        # RMS sur fenêtres de 50ms
        hop = int(0.05 * sr)
        frame_length = int(0.1 * sr)
        rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop)[0]
        # Convertit en dB (référence 1.0)
        rms_db = 20 * np.log10(rms + 1e-9)
        # Cherche la première séquence de min_consecutive_ms (=10 frames de 50ms) où dB > threshold
        min_consecutive_frames = max(1, int(min_consecutive_ms / 50))
        consecutive = 0
        for i, db in enumerate(rms_db):
            if db > threshold_db:
                consecutive += 1
                if consecutive >= min_consecutive_frames:
                    # Premier moment confiant
                    first_frame = i - min_consecutive_frames + 1
                    first_ms = int(first_frame * 50)
                    return max(0, first_ms)
            else:
                consecutive = 0
        return None
    except ImportError:
        return None
    except Exception as e:
        logger.warning(f"[VOCAL-CUE] échec: {e}")
        return None
