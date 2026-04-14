"""
Audio quality analysis service for TrackCue.
Points 781-800: Bitrate detection, spectral holes, phase coherence,
DC offset, peak normalization, multi-channel handling, file integrity,
ReplayGain, BPM tag writeback.
"""

import numpy as np
import librosa
import scipy.signal
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum


class AudioFormat(Enum):
    """Audio format types."""
    MP3 = "mp3"
    AAC = "aac"
    OGG = "ogg"
    FLAC = "flac"
    WAV = "wav"
    ALAC = "alac"
    UNKNOWN = "unknown"


class AudioQualityGrade(Enum):
    """Audio quality grades."""
    EXCELLENT = "excellent"
    GOOD = "good"
    FAIR = "fair"
    POOR = "poor"
    VERY_POOR = "very_poor"


@dataclass
class BitRateAnalysis:
    """Bitrate analysis results."""
    detected_bitrate_kbps: float
    expected_bitrate_kbps: Optional[float]  # From file metadata
    bitrate_type: str         # 'cbr', 'vbr', 'unknown'
    is_upsampled: bool        # Detected upsampled MP3
    detected_codec: str
    confidence: float         # 0-1


@dataclass
class SpectralHoleAnalysis:
    """Spectral hole detection (lossy artifacts)."""
    holes_detected: bool
    hole_frequencies: List[float]  # Hz where holes occur
    hole_severity: float      # 0-1
    spectral_completeness: float  # 0-1, how complete is spectrum


@dataclass
class PhaseCoherence:
    """Phase coherence measurement."""
    coherence_score: float    # 0-1
    phase_consistency: float  # 0-1
    stereo_correlation: float  # 0-1 (for stereo)
    is_phase_coherent: bool


@dataclass
class AudioNormalizationAnalysis:
    """Normalization analysis."""
    peak_level_db: float
    rms_level_db: float
    headroom_db: float        # Distance to clipping
    needs_normalization: bool
    recommended_gain_db: float


@dataclass
class MultiChannelAnalysis:
    """Multi-channel handling analysis."""
    channel_count: int
    is_mono: bool
    is_stereo: bool
    is_surround: bool
    channel_imbalance_db: float  # Difference between channels


@dataclass
class FileIntegrity:
    """File corruption/truncation detection."""
    is_valid: bool
    is_truncated: bool
    is_corrupt: bool
    error_message: Optional[str]
    file_size_bytes: int
    expected_duration_seconds: float
    actual_duration_seconds: float


@dataclass
class ReplayGainAnalysis:
    """ReplayGain measurement."""
    track_gain_db: float      # Loudness normalized to -14 LUFS
    track_peak: float         # Peak amplitude (0-1)
    album_gain_db: Optional[float]
    album_peak: Optional[float]
    lufs_measured: float


@dataclass
class QualityReport:
    """Comprehensive quality report."""
    overall_grade: AudioQualityGrade
    bitrate_analysis: BitRateAnalysis
    spectral_analysis: SpectralHoleAnalysis
    phase_analysis: PhaseCoherence
    normalization: AudioNormalizationAnalysis
    multi_channel: MultiChannelAnalysis
    file_integrity: FileIntegrity
    replaygain: ReplayGainAnalysis
    quality_score: float      # 0-100
    recommendations: List[str]


class AudioQualityAnalyzer:
    """Comprehensive audio quality analysis."""

    def __init__(self, sr: int = 22050, n_fft: int = 2048):
        self.sr = sr
        self.n_fft = n_fft

    def analyze_bitrate(self, y: np.ndarray, file_size_bytes: Optional[int] = None) -> BitRateAnalysis:
        """Detect effective bitrate and detect upsampled content."""
        duration = len(y) / self.sr

        # Estimated bitrate from file size
        detected_bitrate = None
        if file_size_bytes:
            detected_bitrate = (file_size_bytes * 8) / (duration * 1000)

        # Detect upsampling: spectral energy drop above original Nyquist
        S = np.abs(librosa.stft(y, n_fft=self.n_fft))
        freqs = librosa.fft_frequencies(sr=self.sr, n_fft=self.n_fft)

        # Energy in high frequencies
        high_freq_mask = freqs > 11025  # Original MP3 cutoff
        if np.any(high_freq_mask):
            high_freq_energy = np.mean(S[high_freq_mask])
        else:
            high_freq_energy = 0

        mid_freq_mask = (freqs > 8000) & (freqs < 11000)
        mid_freq_energy = np.mean(S[mid_freq_mask]) if np.any(mid_freq_mask) else 1

        # Upsampling indicator: abrupt energy drop
        is_upsampled = high_freq_energy < 0.1 * mid_freq_energy

        # Bitrate type
        bitrate_type = "unknown"
        if detected_bitrate:
            if detected_bitrate in [128, 192, 256, 320]:
                bitrate_type = "cbr"
            else:
                bitrate_type = "vbr"

        confidence = 0.7 if file_size_bytes else 0.4

        return BitRateAnalysis(
            detected_bitrate_kbps=detected_bitrate or 192.0,
            expected_bitrate_kbps=detected_bitrate,
            bitrate_type=bitrate_type,
            is_upsampled=is_upsampled,
            detected_codec="mp3" if is_upsampled else "unknown",
            confidence=confidence
        )

    def analyze_spectral_holes(self, y: np.ndarray) -> SpectralHoleAnalysis:
        """Detect spectral holes from lossy encoding."""
        S = np.abs(librosa.stft(y, n_fft=self.n_fft))
        freqs = librosa.fft_frequencies(sr=self.sr, n_fft=self.n_fft)

        # Average spectrum
        avg_spectrum = np.mean(S, axis=1)

        # Smooth spectrum to find natural trends
        smoothed = scipy.signal.savgol_filter(avg_spectrum, window_length=min(51, len(avg_spectrum) // 2 + 1), polyorder=3)

        # Find holes: significant dips
        deviation = avg_spectrum - smoothed
        holes = deviation < -np.std(avg_spectrum) * 0.5

        hole_frequencies = freqs[holes].tolist() if np.any(holes) else []

        # Spectral completeness
        spectral_range = np.max(avg_spectrum) - np.min(avg_spectrum)
        spectral_completeness = 1.0 - (np.count_nonzero(holes) / len(holes) if len(holes) > 0 else 0)

        hole_severity = float(np.sum(np.abs(deviation[holes])) / np.sum(avg_spectrum)) if len(hole_frequencies) > 0 else 0

        return SpectralHoleAnalysis(
            holes_detected=len(hole_frequencies) > 0,
            hole_frequencies=hole_frequencies,
            hole_severity=float(np.clip(hole_severity, 0, 1)),
            spectral_completeness=float(np.clip(spectral_completeness, 0, 1))
        )

    def analyze_phase_coherence(self, y: np.ndarray) -> PhaseCoherence:
        """Check phase coherence."""
        # Phase from STFT
        D = librosa.stft(y, n_fft=self.n_fft)
        phase = np.angle(D)

        # Phase coherence: consistency across frames
        phase_diff = np.diff(phase, axis=1)

        # High coherence = consistent phase changes
        phase_consistency = 1.0 / (1.0 + np.std(phase_diff))

        # Stereo correlation (placeholder for mono)
        stereo_correlation = 1.0

        # Overall coherence score
        coherence_score = float(np.clip(phase_consistency, 0, 1))

        is_phase_coherent = coherence_score > 0.6

        return PhaseCoherence(
            coherence_score=coherence_score,
            phase_consistency=float(np.clip(phase_consistency, 0, 1)),
            stereo_correlation=stereo_correlation,
            is_phase_coherent=is_phase_coherent
        )

    def remove_dc_offset(self, y: np.ndarray) -> np.ndarray:
        """Remove DC offset from audio."""
        dc_offset = np.mean(y)
        return y - dc_offset

    def analyze_normalization(self, y: np.ndarray) -> AudioNormalizationAnalysis:
        """Analyze peak and RMS levels, suggest normalization."""
        y_cleaned = self.remove_dc_offset(y)

        peak_level = float(20 * np.log10(np.max(np.abs(y_cleaned)) + 1e-6))
        rms_level = float(20 * np.log10(np.sqrt(np.mean(y_cleaned**2)) + 1e-6))

        headroom = float(-0.3 - peak_level)  # Target: -0.3 dB peak

        needs_normalization = peak_level > -1.0 or headroom < 0.5

        recommended_gain = max(0, -0.3 - peak_level)

        return AudioNormalizationAnalysis(
            peak_level_db=peak_level,
            rms_level_db=rms_level,
            headroom_db=headroom,
            needs_normalization=needs_normalization,
            recommended_gain_db=float(recommended_gain)
        )

    def analyze_multi_channel(self, y: np.ndarray, channel_count: int = 1) -> MultiChannelAnalysis:
        """Analyze multi-channel audio."""
        is_mono = channel_count == 1
        is_stereo = channel_count == 2
        is_surround = channel_count > 2

        channel_imbalance = 0.0  # Placeholder

        return MultiChannelAnalysis(
            channel_count=channel_count,
            is_mono=is_mono,
            is_stereo=is_stereo,
            is_surround=is_surround,
            channel_imbalance_db=channel_imbalance
        )

    def check_file_integrity(
        self,
        y: np.ndarray,
        file_size_bytes: Optional[int] = None,
        expected_duration_seconds: Optional[float] = None
    ) -> FileIntegrity:
        """Detect file corruption/truncation."""
        actual_duration = len(y) / self.sr

        is_valid = True
        is_truncated = False
        is_corrupt = False
        error_message = None

        # Check for extreme values
        if np.max(np.abs(y)) > 10:
            is_corrupt = True
            error_message = "Extreme amplitude values detected"

        # Check for NaN/Inf
        if np.any(np.isnan(y)) or np.any(np.isinf(y)):
            is_corrupt = True
            error_message = "NaN or Inf values in audio"

        # Check duration mismatch
        if expected_duration_seconds and abs(actual_duration - expected_duration_seconds) > 1.0:
            is_truncated = True
            error_message = f"Duration mismatch: expected {expected_duration_seconds}s, got {actual_duration}s"

        if is_corrupt or is_truncated:
            is_valid = False

        return FileIntegrity(
            is_valid=is_valid,
            is_truncated=is_truncated,
            is_corrupt=is_corrupt,
            error_message=error_message,
            file_size_bytes=file_size_bytes or len(y) * 2,
            expected_duration_seconds=expected_duration_seconds or actual_duration,
            actual_duration_seconds=actual_duration
        )

    def measure_replaygain(self, y: np.ndarray, target_lufs: float = -14.0) -> ReplayGainAnalysis:
        """Measure ReplayGain (loudness normalization)."""
        # LUFS measurement (simplified)
        # True LUFS uses weighted filtering
        S = np.abs(librosa.stft(y))
        freqs = librosa.fft_frequencies(sr=self.sr)

        # A-weighting (simplified)
        a_weight = self._a_weighting(freqs)
        weighted_S = S * a_weight[:, np.newaxis]

        # Loudness in LUFS
        loudness = -0.691 + 10 * np.log10(np.mean(weighted_S**2) + 1e-10)

        # ReplayGain: loudness relative to target
        track_gain = float(target_lufs - loudness)

        # Peak measurement
        track_peak = float(np.max(np.abs(y)))

        return ReplayGainAnalysis(
            track_gain_db=track_gain,
            track_peak=track_peak,
            album_gain_db=None,
            album_peak=None,
            lufs_measured=float(loudness)
        )

    def write_replaygain_tags(self, y: np.ndarray, metadata: Dict[str, str]) -> Dict[str, str]:
        """Add ReplayGain tags to metadata."""
        rg = self.measure_replaygain(y)

        metadata["REPLAYGAIN_TRACK_GAIN"] = f"{rg.track_gain_db:.2f} dB"
        metadata["REPLAYGAIN_TRACK_PEAK"] = f"{rg.track_peak:.6f}"
        metadata["REPLAYGAIN_REFERENCE_LOUDNESS"] = "89.0 dB SPL"

        return metadata

    def write_bpm_tags(self, bpm: float, metadata: Dict[str, str]) -> Dict[str, str]:
        """Add BPM tag to metadata (for Mutagen/ID3)."""
        metadata["BPM"] = str(int(round(bpm)))
        metadata["TBPM"] = str(int(round(bpm)))  # ID3v2 frame

        return metadata

    def generate_quality_report(
        self,
        y: np.ndarray,
        file_size_bytes: Optional[int] = None,
        channel_count: int = 1
    ) -> QualityReport:
        """Generate comprehensive quality report."""
        # Run all analyses
        bitrate_analysis = self.analyze_bitrate(y, file_size_bytes)
        spectral_analysis = self.analyze_spectral_holes(y)
        phase_analysis = self.analyze_phase_coherence(y)
        normalization = self.analyze_normalization(y)
        multi_channel = self.analyze_multi_channel(y, channel_count)
        file_integrity = self.check_file_integrity(y, file_size_bytes)
        replaygain = self.measure_replaygain(y)

        # Calculate overall score
        score = 0.0
        score += (100 if bitrate_analysis.detected_bitrate_kbps >= 192 else 50) * 0.2
        score += spectral_analysis.spectral_completeness * 100 * 0.2
        score += phase_analysis.coherence_score * 100 * 0.2
        score += (100 if not normalization.needs_normalization else 70) * 0.2
        score += (100 if file_integrity.is_valid else 0) * 0.2

        # Grade
        if score >= 85:
            grade = AudioQualityGrade.EXCELLENT
        elif score >= 70:
            grade = AudioQualityGrade.GOOD
        elif score >= 55:
            grade = AudioQualityGrade.FAIR
        elif score >= 40:
            grade = AudioQualityGrade.POOR
        else:
            grade = AudioQualityGrade.VERY_POOR

        # Recommendations
        recommendations = []
        if bitrate_analysis.is_upsampled:
            recommendations.append("Detected upsampled MP3 - original quality may be lower")
        if spectral_analysis.holes_detected:
            recommendations.append("Spectral holes detected - lossy encoding artifacts present")
        if not phase_analysis.is_phase_coherent:
            recommendations.append("Phase coherence issues - may indicate encoding problems")
        if normalization.needs_normalization:
            recommendations.append(f"Peak normalization recommended: {normalization.recommended_gain_db:.1f} dB gain")
        if not file_integrity.is_valid:
            recommendations.append(f"File integrity issue: {file_integrity.error_message}")

        return QualityReport(
            overall_grade=grade,
            bitrate_analysis=bitrate_analysis,
            spectral_analysis=spectral_analysis,
            phase_analysis=phase_analysis,
            normalization=normalization,
            multi_channel=multi_channel,
            file_integrity=file_integrity,
            replaygain=replaygain,
            quality_score=float(score),
            recommendations=recommendations
        )

    # Helper methods

    def _a_weighting(self, freqs: np.ndarray) -> np.ndarray:
        """A-weighting curve for loudness measurement."""
        # Simplified A-weighting
        f_sq = freqs**2

        numerator = (12194.2**2) * f_sq**2
        denominator = ((f_sq + 20.6**2) *
                      np.sqrt((f_sq + 107.7**2) * (f_sq + 737.9**2)) *
                      (f_sq + 12194.2**2))

        a_weight = numerator / (denominator + 1e-10)
        a_weight = a_weight / np.max(a_weight)  # Normalize

        return a_weight
