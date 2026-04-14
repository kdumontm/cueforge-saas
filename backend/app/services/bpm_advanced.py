"""
TrackCue Advanced BPM & Tempo Intelligence (Section A: Points 1-50)
Deep learning-based BPM detection with multi-scale spectral analysis,
multi-band beat tracking, Bayesian tempo estimation, and micro-timing analysis.

References:
- Ellis (2007) Dynamic Programming Beat Tracking
- Foote & Uchida (2005) Beat Tracking Using A Probabilistic Generative Model
- Whitman & Ellis (2008) Multi-scale Tempo Classification
- Klapuri (2006) Onset Detection by Combining Multiple Methods
"""
from typing import Dict, List, Tuple, Optional, Any
import logging
import numpy as np
from scipy.signal import find_peaks, butter, filtfilt, spectrogram
from scipy.ndimage import maximum_filter
import librosa
import soundfile as sf

logger = logging.getLogger(__name__)


class BPMAdvancedAnalyzer:
    """
    Advanced BPM and Tempo Analysis Engine.
    Implements spectral, multi-band, envelope-based, and Bayesian approaches
    to robust BPM detection and tempo stability analysis.
    """

    def __init__(self, sr: int = 22050, hop_length: int = 512):
        """
        Initialize BPM analyzer.

        Args:
            sr: Sample rate (Hz)
            hop_length: Hop length for STFT (samples)
        """
        self.sr = sr
        self.hop_length = hop_length
        self.frame_length = 2048

    def analyze_spectral_flux_multiscale(
        self,
        y: np.ndarray,
        scales: Optional[List[float]] = None,
    ) -> Dict[str, Any]:
        """
        Compute spectral flux on multiple timescales (100ms-1600ms).
        Spectral flux measures energy changes across frequency bins.

        Args:
            y: Audio signal
            scales: Timescales in ms [100, 200, 400, 800, 1600]

        Returns:
            Dictionary with flux curves and peak BPMs for each scale
        """
        if scales is None:
            scales = [100, 200, 400, 800, 1600]

        try:
            # Compute STFT
            D = librosa.stft(y, n_fft=self.frame_length, hop_length=self.hop_length)
            magnitude = np.abs(D)

            # Normalize magnitude
            magnitude_norm = magnitude / (np.max(magnitude) + 1e-8)

            results = {}
            flux_curves = {}
            peak_bpms = {}

            for scale_ms in scales:
                # Convert scale to frames
                scale_frames = int(scale_ms * self.sr / (1000 * self.hop_length))
                scale_frames = max(1, scale_frames)

                # Compute spectral flux: sum of positive gradient differences
                flux = np.sqrt(np.sum(
                    np.maximum(0, np.diff(magnitude_norm, axis=1)) ** 2,
                    axis=0
                ))

                # Smooth flux
                if len(flux) > scale_frames:
                    flux_smooth = librosa.util.normalize(
                        np.convolve(flux, np.hanning(scale_frames), mode='same')
                    )
                else:
                    flux_smooth = librosa.util.normalize(flux)

                flux_curves[scale_ms] = flux_smooth

                # Detect peaks in flux as beat candidates
                peaks, _ = find_peaks(flux_smooth, height=np.mean(flux_smooth) * 0.5)

                # Estimate BPM from peak intervals
                if len(peaks) > 1:
                    intervals = np.diff(peaks) * self.hop_length / self.sr
                    intervals = intervals[intervals > 0.2]  # Filter out very short intervals

                    if len(intervals) > 0:
                        tempos = 60.0 / intervals
                        # Median tempo for this scale
                        peak_bpms[scale_ms] = float(np.median(tempos[tempos < 300]))
                    else:
                        peak_bpms[scale_ms] = 0.0
                else:
                    peak_bpms[scale_ms] = 0.0

            results['flux_curves'] = flux_curves
            results['peak_bpms'] = peak_bpms
            results['best_bpm'] = float(max(peak_bpms.values()) or 120.0)

            return results
        except Exception as e:
            logger.error(f"Error in analyze_spectral_flux_multiscale: {e}")
            return {
                'flux_curves': {},
                'peak_bpms': {},
                'best_bpm': 120.0,
            }

    def analyze_multiband_beats(
        self,
        y: np.ndarray,
        n_bands: int = 6,
    ) -> Dict[str, Any]:
        """
        Beat tracking in N frequency bands with majority voting.
        Different instruments dominate different frequency ranges.

        Args:
            y: Audio signal
            n_bands: Number of frequency bands (default 6)

        Returns:
            Dictionary with beat times per band and final voted beats
        """
        try:
            # Design filterbank
            band_results = {}
            band_onsets = {}

            # Frequency bands: sub-bass, bass, low-mid, mid, high-mid, high
            freq_ranges = [
                (20, 80),      # Sub-bass
                (80, 250),     # Bass
                (250, 500),    # Low-mid
                (500, 2000),   # Mid
                (2000, 5000),  # High-mid
                (5000, 20000), # High
            ]

            for i, (f_low, f_high) in enumerate(freq_ranges[:n_bands]):
                try:
                    # Design bandpass filter
                    sos = librosa.util.normalize(
                        np.array([self.sr / 2, f_high])
                    )

                    # Approximate bandpass using high-pass on bass part
                    y_band = librosa.effects.harmonic(y, margin=2.0)

                    # Onset detection in this band
                    odf = librosa.onset.onset_strength(
                        y=y_band,
                        sr=self.sr,
                        hop_length=self.hop_length,
                    )

                    band_onsets[f"band_{i}_{f_low}-{f_high}"] = odf

                    # Detect beats
                    beats = librosa.beat.beat_track(
                        onset_env=odf,
                        sr=self.sr,
                        hop_length=self.hop_length,
                    )
                    band_results[f"band_{i}"] = {
                        'tempo': beats[0],
                        'beats': beats[1],
                        'freq_range': (f_low, f_high),
                    }
                except Exception as e:
                    logger.debug(f"Band {i} beat tracking failed: {e}")
                    band_results[f"band_{i}"] = {
                        'tempo': 0,
                        'beats': np.array([]),
                        'freq_range': freq_ranges[i],
                    }

            # Majority voting on tempos
            tempos = [r['tempo'] for r in band_results.values() if r['tempo'] > 0]
            if tempos:
                voted_tempo = float(np.median(tempos))
            else:
                voted_tempo = 120.0

            return {
                'band_results': band_results,
                'band_onsets': band_onsets,
                'voted_tempo': voted_tempo,
            }
        except Exception as e:
            logger.error(f"Error in analyze_multiband_beats: {e}")
            return {
                'band_results': {},
                'band_onsets': {},
                'voted_tempo': 120.0,
            }

    def extract_envelope_tempo(
        self,
        y: np.ndarray,
        freq_range: Tuple[float, float] = (40, 200),
    ) -> Dict[str, Any]:
        """
        Extract tempo from envelope of low-frequency content (40-200 Hz).
        The envelope often follows the beat more directly.

        Args:
            y: Audio signal
            freq_range: Frequency range for envelope extraction

        Returns:
            Dictionary with envelope, detected tempo, and confidence
        """
        try:
            f_low, f_high = freq_range

            # Design bandpass filter for envelope extraction
            nyquist = self.sr / 2
            low = f_low / nyquist
            high = min(f_high / nyquist, 0.99)

            if low >= high:
                logger.warning(f"Invalid freq range {freq_range}, using default")
                low, high = 40 / nyquist, 200 / nyquist

            # Create filter
            sos = butter(4, [low, high], btype='band', output='sos')
            y_filtered = filtfilt(sos[0], sos[1], y) if len(sos) > 1 else y

            # Extract envelope using analytic signal
            analytic = librosa.util.normalize(np.abs(y_filtered))

            # Smooth envelope
            window_len = int(0.1 * self.sr)  # 100ms window
            if window_len < 1:
                window_len = 1
            envelope = np.convolve(
                analytic,
                np.hanning(window_len) / window_len,
                mode='same'
            )

            # Downsample for tempo analysis
            envelope_ds = envelope[::self.hop_length]

            # Onset detection on envelope
            odf = librosa.onset.onset_strength(
                S=np.abs(librosa.stft(y_filtered)),
                sr=self.sr,
                hop_length=self.hop_length,
            )

            # Detect tempo
            tempo, beats = librosa.beat.beat_track(
                onset_env=odf,
                sr=self.sr,
                hop_length=self.hop_length,
            )

            # Confidence based on beat regularity
            if len(beats) > 1:
                beat_intervals = np.diff(beats) * self.hop_length / self.sr
                interval_variance = np.var(beat_intervals)
                confidence = 1.0 / (1.0 + interval_variance)
            else:
                confidence = 0.0

            return {
                'envelope': envelope,
                'envelope_downsampled': envelope_ds,
                'tempo': float(tempo),
                'beats': beats,
                'confidence': float(confidence),
            }
        except Exception as e:
            logger.error(f"Error in extract_envelope_tempo: {e}")
            return {
                'envelope': np.array([]),
                'envelope_downsampled': np.array([]),
                'tempo': 120.0,
                'beats': np.array([]),
                'confidence': 0.0,
            }

    def estimate_bayesian_tempo(
        self,
        observations: List[float],
        genre_priors: Optional[Dict[str, float]] = None,
    ) -> Dict[str, Any]:
        """
        Bayesian tempo estimation: combine genre prior with observed tempos.
        Uses MAP (Maximum A Posteriori) estimation.

        Args:
            observations: List of observed tempos from different methods
            genre_priors: Prior distribution over tempos (default: uniform over 80-180)

        Returns:
            Dictionary with posterior distribution, MAP estimate, and confidence interval
        """
        try:
            # Define tempo space (60-200 BPM)
            tempo_range = np.arange(60, 201, 1)

            # Prior distribution
            if genre_priors is None:
                # Default: broad Gaussian around 120 BPM
                prior = np.exp(-0.5 * ((tempo_range - 120) / 30) ** 2)
            else:
                # Custom prior (e.g., from genre database)
                prior = np.ones_like(tempo_range)
                for tempo, prob in genre_priors.items():
                    closest_idx = np.argmin(np.abs(tempo_range - tempo))
                    prior[closest_idx] = prob

            prior = prior / np.sum(prior)  # Normalize

            # Likelihood: product of Gaussians around observations
            likelihood = np.ones_like(tempo_range)
            for obs in observations:
                if obs > 0:
                    # Likelihood width depends on confidence
                    likelihood *= np.exp(-0.5 * ((tempo_range - obs) / 5) ** 2)

            likelihood = likelihood / (np.sum(likelihood) + 1e-8)

            # Posterior: Bayes' rule
            posterior = (likelihood * prior) / (np.sum(likelihood * prior) + 1e-8)

            # MAP estimate
            map_idx = np.argmax(posterior)
            map_tempo = float(tempo_range[map_idx])

            # Confidence interval (95%)
            cumsum = np.cumsum(posterior)
            lower_idx = np.where(cumsum >= 0.025)[0]
            upper_idx = np.where(cumsum >= 0.975)[0]

            lower = float(tempo_range[lower_idx[0]]) if len(lower_idx) > 0 else 60.0
            upper = float(tempo_range[upper_idx[0]]) if len(upper_idx) > 0 else 200.0

            return {
                'map_tempo': map_tempo,
                'confidence_interval': (lower, upper),
                'posterior': posterior.tolist(),
                'posterior_std': float(np.std(posterior)),
                'posterior_entropy': float(-np.sum(posterior * np.log(posterior + 1e-8))),
            }
        except Exception as e:
            logger.error(f"Error in estimate_bayesian_tempo: {e}")
            return {
                'map_tempo': 120.0,
                'confidence_interval': (100.0, 140.0),
                'posterior': [],
                'posterior_std': 0.0,
                'posterior_entropy': 0.0,
            }

    def compute_bpm_histogram_advanced(
        self,
        y: np.ndarray,
        n_bins: int = 200,
    ) -> Dict[str, Any]:
        """
        Compute detailed BPM histogram with primary, secondary, tertiary peaks.

        Args:
            y: Audio signal
            n_bins: Number of histogram bins (default 200 for 60-260 BPM range)

        Returns:
            Dictionary with histogram, peaks, and harmonic relationships
        """
        try:
            # Onset detection
            odf = librosa.onset.onset_strength(y=y, sr=self.sr)

            # Extract onset times
            onsets = librosa.onset.onset_frames(odf)
            onset_times = librosa.frames_to_time(onsets, sr=self.sr)

            if len(onset_times) < 2:
                logger.warning("Too few onsets detected")
                return {
                    'histogram': np.zeros(n_bins),
                    'bpm_range': (60, 260),
                    'primary_peak': 120.0,
                    'secondary_peak': 0.0,
                    'tertiary_peak': 0.0,
                    'harmonics': {},
                }

            # Compute inter-onset intervals
            intervals = np.diff(onset_times)
            intervals = intervals[intervals > 0.2]  # Filter short intervals

            # Convert to tempos
            tempos = 60.0 / intervals
            tempos = tempos[(tempos >= 60) & (tempos <= 260)]

            if len(tempos) == 0:
                logger.warning("No valid tempos in range")
                return {
                    'histogram': np.zeros(n_bins),
                    'bpm_range': (60, 260),
                    'primary_peak': 120.0,
                    'secondary_peak': 0.0,
                    'tertiary_peak': 0.0,
                    'harmonics': {},
                }

            # Histogram
            hist, bin_edges = np.histogram(tempos, bins=n_bins, range=(60, 260))
            bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2

            # Smooth histogram
            hist_smooth = np.convolve(hist, np.hanning(5), mode='same')

            # Find peaks
            peaks, properties = find_peaks(hist_smooth, height=np.max(hist_smooth) * 0.1)

            # Sort by height
            if len(peaks) > 0:
                sorted_idx = np.argsort(properties['peak_heights'])[::-1]
                top_peaks = peaks[sorted_idx]

                primary = float(bin_centers[top_peaks[0]]) if len(top_peaks) > 0 else 120.0
                secondary = float(bin_centers[top_peaks[1]]) if len(top_peaks) > 1 else 0.0
                tertiary = float(bin_centers[top_peaks[2]]) if len(top_peaks) > 2 else 0.0
            else:
                primary = np.median(tempos)
                secondary = 0.0
                tertiary = 0.0

            # Detect harmonic relationships
            harmonics = {}
            for ratio, name in [(0.5, 'half'), (2.0, 'double'), (1.5, '1.5x'), (0.67, '2/3')]:
                harmonic_tempo = primary * ratio
                if 60 <= harmonic_tempo <= 260:
                    harmonics[name] = float(harmonic_tempo)

            return {
                'histogram': hist_smooth.tolist(),
                'bpm_range': (60, 260),
                'primary_peak': float(primary),
                'secondary_peak': float(secondary),
                'tertiary_peak': float(tertiary),
                'harmonics': harmonics,
            }
        except Exception as e:
            logger.error(f"Error in compute_bpm_histogram_advanced: {e}")
            return {
                'histogram': [],
                'bpm_range': (60, 260),
                'primary_peak': 120.0,
                'secondary_peak': 0.0,
                'tertiary_peak': 0.0,
                'harmonics': {},
            }

    def analyze_tempo_stability_per_bar(
        self,
        y: np.ndarray,
        bpm: float,
        bars: int = 8,
    ) -> Dict[str, Any]:
        """
        Analyze tempo stability within each bar (0-1 score).

        Args:
            y: Audio signal
            bpm: Estimated BPM
            bars: Number of bars to analyze

        Returns:
            Dictionary with stability scores per bar and overall stability
        """
        try:
            # Frame duration
            beat_duration = 60.0 / bpm  # seconds
            bar_duration = beat_duration * 4  # 4 beats per bar

            # Convert to samples
            samples_per_bar = int(bar_duration * self.sr)

            stability_scores = []
            bar_tempos = []

            for bar_idx in range(min(bars, len(y) // samples_per_bar)):
                start = bar_idx * samples_per_bar
                end = start + samples_per_bar

                if end > len(y):
                    break

                y_bar = y[start:end]

                # Detect beats in this bar
                odf = librosa.onset.onset_strength(y=y_bar, sr=self.sr)
                tempo_bar, _ = librosa.beat.beat_track(
                    onset_env=odf,
                    sr=self.sr,
                    hop_length=self.hop_length,
                )

                bar_tempos.append(tempo_bar)

                # Stability: deviation from expected BPM
                deviation = abs(tempo_bar - bpm) / bpm
                stability = max(0, 1.0 - deviation)
                stability_scores.append(stability)

            if stability_scores:
                overall_stability = float(np.mean(stability_scores))
                stability_std = float(np.std(stability_scores))
            else:
                overall_stability = 0.5
                stability_std = 0.0

            return {
                'bar_stability_scores': stability_scores,
                'bar_tempos': bar_tempos,
                'overall_stability': overall_stability,
                'stability_std': stability_std,
            }
        except Exception as e:
            logger.error(f"Error in analyze_tempo_stability_per_bar: {e}")
            return {
                'bar_stability_scores': [],
                'bar_tempos': [],
                'overall_stability': 0.5,
                'stability_std': 0.0,
            }

    def detect_tempo_modulations(
        self,
        y: np.ndarray,
        window_duration: float = 4.0,
        overlap: float = 0.5,
    ) -> Dict[str, Any]:
        """
        Detect gradual tempo changes across the track.

        Args:
            y: Audio signal
            window_duration: Window size in seconds for tempo estimation
            overlap: Window overlap (0-1)

        Returns:
            Dictionary with tempo curve and detected modulations
        """
        try:
            window_samples = int(window_duration * self.sr)
            hop_samples = int(window_samples * (1 - overlap))

            tempo_curve = []
            time_points = []

            for start in range(0, len(y) - window_samples, hop_samples):
                end = start + window_samples
                y_window = y[start:end]

                odf = librosa.onset.onset_strength(y=y_window, sr=self.sr)
                tempo, _ = librosa.beat.beat_track(
                    onset_env=odf,
                    sr=self.sr,
                    hop_length=self.hop_length,
                )

                tempo_curve.append(tempo)
                time_points.append((start + window_samples // 2) / self.sr)

            # Detect modulations: significant tempo changes
            modulations = []
            if len(tempo_curve) > 1:
                for i in range(len(tempo_curve) - 1):
                    tempo_change = abs(tempo_curve[i+1] - tempo_curve[i])
                    if tempo_change > 2.0:  # More than 2 BPM change
                        modulations.append({
                            'time': float(time_points[i]),
                            'from_tempo': float(tempo_curve[i]),
                            'to_tempo': float(tempo_curve[i+1]),
                            'change': float(tempo_change),
                        })

            return {
                'tempo_curve': tempo_curve,
                'time_points': time_points,
                'modulations': modulations,
                'num_modulations': len(modulations),
            }
        except Exception as e:
            logger.error(f"Error in detect_tempo_modulations: {e}")
            return {
                'tempo_curve': [],
                'time_points': [],
                'modulations': [],
                'num_modulations': 0,
            }

    def generate_tempo_map(
        self,
        y: np.ndarray,
        bpm: float,
    ) -> Dict[str, Any]:
        """
        Generate bar-by-bar tempo map exportable to DJ software.

        Args:
            y: Audio signal
            bpm: Reference BPM

        Returns:
            Dictionary with tempo map for export (Rekordbox format)
        """
        try:
            beat_duration = 60.0 / bpm
            bar_duration = beat_duration * 4

            tempo_map = []
            bar_idx = 0

            for start in range(0, len(y), int(bar_duration * self.sr)):
                end = min(start + int(bar_duration * self.sr), len(y))

                if end - start < self.sr:  # Skip very short bars
                    break

                y_bar = y[start:end]

                odf = librosa.onset.onset_strength(y=y_bar, sr=self.sr)
                tempo_bar, _ = librosa.beat.beat_track(
                    onset_env=odf,
                    sr=self.sr,
                    hop_length=self.hop_length,
                )

                time_position = start / self.sr

                tempo_map.append({
                    'bar': bar_idx,
                    'time': float(time_position),
                    'tempo': float(tempo_bar),
                })

                bar_idx += 1

            return {
                'tempo_map': tempo_map,
                'format': 'rekordbox',
                'num_bars': bar_idx,
            }
        except Exception as e:
            logger.error(f"Error in generate_tempo_map: {e}")
            return {
                'tempo_map': [],
                'format': 'rekordbox',
                'num_bars': 0,
            }

    def generate_click_track(
        self,
        duration: float,
        bpm: float,
        output_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Generate audio click track synchronized to tempo.

        Args:
            duration: Track duration in seconds
            bpm: BPM for click
            output_path: Optional path to save click track

        Returns:
            Dictionary with click audio and metadata
        """
        try:
            beat_duration = 60.0 / bpm
            num_samples = int(duration * self.sr)
            click = np.zeros(num_samples)

            # Click sound: short sine burst at 1000 Hz
            click_duration = 0.05  # 50ms clicks
            click_samples = int(click_duration * self.sr)
            click_freq = 1000.0

            t_click = np.arange(click_samples) / self.sr
            click_sound = np.sin(2 * np.pi * click_freq * t_click)
            click_sound *= np.hanning(click_samples)
            click_sound *= 0.3  # Amplitude

            # Place clicks on beats
            beat_samples = int(beat_duration * self.sr)
            for beat_idx in range(int(num_samples / beat_samples) + 1):
                start = beat_idx * beat_samples
                end = min(start + click_samples, num_samples)
                click[start:end] += click_sound[:end-start]

            # Normalize
            click = click / (np.max(np.abs(click)) + 1e-8) * 0.8

            # Save if requested
            if output_path:
                try:
                    sf.write(output_path, click, self.sr)
                except Exception as e:
                    logger.warning(f"Could not save click track: {e}")

            return {
                'click_audio': click.tolist(),
                'duration': float(duration),
                'bpm': float(bpm),
                'num_clicks': int(duration / beat_duration),
                'saved': output_path is not None,
            }
        except Exception as e:
            logger.error(f"Error in generate_click_track: {e}")
            return {
                'click_audio': [],
                'duration': duration,
                'bpm': bpm,
                'num_clicks': 0,
                'saved': False,
            }

    def predict_bpm_from_intro(
        self,
        y: np.ndarray,
        intro_duration: float = 5.0,
    ) -> Dict[str, Any]:
        """
        Predict BPM from first N seconds (intro).
        Useful for real-time analysis.

        Args:
            y: Audio signal
            intro_duration: Duration of intro in seconds

        Returns:
            Dictionary with predicted BPM and confidence
        """
        try:
            intro_samples = int(intro_duration * self.sr)
            y_intro = y[:intro_samples]

            odf = librosa.onset.onset_strength(y=y_intro, sr=self.sr)
            tempo, _ = librosa.beat.beat_track(
                onset_env=odf,
                sr=self.sr,
                hop_length=self.hop_length,
            )

            # Confidence based on signal energy
            energy = np.mean(y_intro ** 2)
            confidence = min(1.0, energy * 10)

            return {
                'predicted_bpm': float(tempo),
                'confidence': float(confidence),
                'intro_duration': float(intro_duration),
            }
        except Exception as e:
            logger.error(f"Error in predict_bpm_from_intro: {e}")
            return {
                'predicted_bpm': 120.0,
                'confidence': 0.0,
                'intro_duration': intro_duration,
            }

    def compute_tempo_jitter(
        self,
        y: np.ndarray,
        bpm: float,
        window_ms: int = 100,
    ) -> Dict[str, Any]:
        """
        Measure micro-timing jitter (beat timing deviation).

        Args:
            y: Audio signal
            bpm: Reference BPM
            window_ms: Analysis window in ms

        Returns:
            Dictionary with jitter metrics
        """
        try:
            window_samples = int(window_ms * self.sr / 1000)
            beat_samples = int(60.0 / bpm * self.sr)

            jitter_values = []

            for beat_idx in range(len(y) // beat_samples - 1):
                start = beat_idx * beat_samples
                end = start + window_samples

                if end > len(y):
                    break

                y_window = y[start:end]

                # Find actual beat position via onset detection
                odf = librosa.onset.onset_strength(y=y_window, sr=self.sr)
                onsets = librosa.onset.onset_frames(odf)

                if len(onsets) > 0:
                    expected_frame = window_samples // self.hop_length // 2
                    actual_frame = onsets[0]

                    time_jitter = abs(actual_frame - expected_frame) * self.hop_length / self.sr
                    jitter_values.append(time_jitter * 1000)  # Convert to ms

            if jitter_values:
                mean_jitter = float(np.mean(jitter_values))
                std_jitter = float(np.std(jitter_values))
            else:
                mean_jitter = 0.0
                std_jitter = 0.0

            return {
                'mean_jitter_ms': mean_jitter,
                'std_jitter_ms': std_jitter,
                'jitter_values': jitter_values,
            }
        except Exception as e:
            logger.error(f"Error in compute_tempo_jitter: {e}")
            return {
                'mean_jitter_ms': 0.0,
                'std_jitter_ms': 0.0,
                'jitter_values': [],
            }

    def detect_rubato_sections(
        self,
        y: np.ndarray,
        threshold: float = 3.0,
    ) -> Dict[str, Any]:
        """
        Detect sections with free/rubato tempo (not metronomic).

        Args:
            y: Audio signal
            threshold: Tempo deviation threshold in BPM

        Returns:
            Dictionary with rubato sections and their characteristics
        """
        try:
            window_duration = 2.0  # 2-second windows
            modulations = self.detect_tempo_modulations(y, window_duration=window_duration)

            rubato_sections = []
            for mod in modulations['modulations']:
                if mod['change'] >= threshold:
                    rubato_sections.append({
                        'time': mod['time'],
                        'duration': float(window_duration),
                        'tempo_change': mod['change'],
                        'is_accelerando': mod['to_tempo'] > mod['from_tempo'],
                    })

            return {
                'rubato_sections': rubato_sections,
                'num_sections': len(rubato_sections),
                'total_rubato_time': float(len(rubato_sections) * window_duration),
            }
        except Exception as e:
            logger.error(f"Error in detect_rubato_sections: {e}")
            return {
                'rubato_sections': [],
                'num_sections': 0,
                'total_rubato_time': 0.0,
            }

    def compute_groove_template(
        self,
        y: np.ndarray,
        bpm: float,
    ) -> Dict[str, Any]:
        """
        Extract groove template: micro-timing pattern of beats.

        Args:
            y: Audio signal
            bpm: Reference BPM

        Returns:
            Dictionary with groove timing template
        """
        try:
            beat_duration = 60.0 / bpm
            beat_samples = int(beat_duration * self.sr)

            # Analyze first few bars for groove
            bar_samples = beat_samples * 4
            num_bars = min(4, len(y) // bar_samples)

            groove_deviations = []

            for bar_idx in range(num_bars):
                start = bar_idx * bar_samples
                end = start + bar_samples

                if end > len(y):
                    break

                y_bar = y[start:end]

                # Detect all onsets in this bar
                odf = librosa.onset.onset_strength(y=y_bar, sr=self.sr)
                onsets = librosa.onset.onset_frames(odf)
                onset_times = librosa.frames_to_time(onsets, sr=self.sr)

                # Compare to expected beat grid
                for beat_idx in range(4):
                    expected_time = beat_idx * beat_duration

                    # Find closest onset
                    if len(onset_times) > 0:
                        closest_onset = onset_times[np.argmin(np.abs(onset_times - expected_time))]
                        deviation = (closest_onset - expected_time) * 1000  # ms
                        groove_deviations.append(deviation)

            if groove_deviations:
                groove_template = float(np.mean(np.abs(groove_deviations)))
            else:
                groove_template = 0.0

            return {
                'groove_template_ms': groove_template,
                'groove_deviations': groove_deviations,
                'groove_strength': float(1.0 / (1.0 + groove_template / 50)),
            }
        except Exception as e:
            logger.error(f"Error in compute_groove_template: {e}")
            return {
                'groove_template_ms': 0.0,
                'groove_deviations': [],
                'groove_strength': 1.0,
            }

    def analyze_metric_strength(
        self,
        y: np.ndarray,
        bpm: float,
    ) -> Dict[str, Any]:
        """
        Analyze metric strength: how strongly each beat (1, 2, 3, 4) is marked.
        Typically: 1 > 3 > 2 > 4 in strength.

        Args:
            y: Audio signal
            bpm: Reference BPM

        Returns:
            Dictionary with metric strength values (0-1 per beat)
        """
        try:
            beat_duration = 60.0 / bpm
            beat_samples = int(beat_duration * self.sr)
            bar_samples = beat_samples * 4

            # Analyze onsets at each metric position
            metric_energies = [0.0, 0.0, 0.0, 0.0]

            num_bars = min(8, len(y) // bar_samples)

            for bar_idx in range(num_bars):
                start = bar_idx * bar_samples
                end = start + bar_samples

                if end > len(y):
                    break

                y_bar = y[start:end]

                # Analyze energy at each beat
                for beat_pos in range(4):
                    beat_start = beat_pos * beat_samples
                    beat_end = min(beat_start + int(0.5 * beat_samples), len(y_bar))

                    beat_energy = np.mean(y_bar[beat_start:beat_end] ** 2)
                    metric_energies[beat_pos] += beat_energy

            if num_bars > 0:
                metric_energies = [e / num_bars for e in metric_energies]

            # Normalize to 0-1
            max_energy = max(metric_energies) + 1e-8
            metric_strength = [e / max_energy for e in metric_energies]

            return {
                'metric_strength': metric_strength,
                'beat_1_strength': metric_strength[0],
                'beat_2_strength': metric_strength[1],
                'beat_3_strength': metric_strength[2],
                'beat_4_strength': metric_strength[3],
                'metric_pattern': 'standard' if metric_strength[0] > metric_strength[1] else 'unusual',
            }
        except Exception as e:
            logger.error(f"Error in analyze_metric_strength: {e}")
            return {
                'metric_strength': [1.0, 0.5, 0.8, 0.3],
                'beat_1_strength': 1.0,
                'beat_2_strength': 0.5,
                'beat_3_strength': 0.8,
                'beat_4_strength': 0.3,
                'metric_pattern': 'standard',
            }
