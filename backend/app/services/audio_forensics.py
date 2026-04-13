"""
Audio Forensics & Quality (points 271-300)

Module pour l'analyse forensique audio: détection de re-encodage,
compression excessive, faux stéréo, audio généré par IA, et qualité globale.
"""

import numpy as np
from scipy import signal
from scipy.fft import fft, ifft
import librosa
from typing import Dict, Tuple, Optional, List
from dataclasses import dataclass
from enum import Enum


class AudioQualityGrade(str, Enum):
    """Grades de qualité audio"""
    A = "A"  # Excellent (>90)
    B = "B"  # Good (75-90)
    C = "C"  # Fair (60-75)
    D = "D"  # Poor (40-60)
    F = "F"  # Failed (<40)


@dataclass
class LossyTranscodingResult:
    """Résultat de détection de re-encodage"""
    is_likely_transcoded: bool
    generation_loss: int  # Nombre de fois encodé
    confidence: float  # 0-1
    indicators: List[str]  # ["MP3 artifacts", "Quantization noise", ...]


@dataclass
class SpectralArtifacts:
    """Artefacts spectraux détectés"""
    has_aliasing: bool
    aliasing_frequency: Optional[float]
    has_ringing: bool
    ringing_db: Optional[float]
    has_pre_echo: bool
    pre_echo_timing_ms: Optional[float]


@dataclass
class StereoAnalysis:
    """Analyse du champ stéréo"""
    width_percent: float  # 0-100, 100 = stéréo maximal
    correlation_lr: float  # -1 à 1
    phase_coherence: float  # 0-1
    frequency_bands_width: Dict[str, float]  # {band: width%}
    is_fake_stereo: bool


@dataclass
class ClippingEvent:
    """Événement de clipping détecté"""
    start_sample: int
    end_sample: int
    peak_level: float  # Niveau du pic
    duration_ms: float
    count_consecutive_clipped: int


class AudioForensicsAnalyzer:
    """
    Analyseur forensique pour qualité et intégrité audio.
    """

    def __init__(self, sr: int = 44100):
        """
        Initialise l'analyseur.

        Args:
            sr: Sample rate (Hz)
        """
        self.sr = sr

    def detect_lossy_transcoding(
        self,
        audio: np.ndarray,
        sr: int = 44100
    ) -> LossyTranscodingResult:
        """
        Détection de re-encodage lossy (MP3→WAV→MP3, etc.).

        Cherche les artefacts spécifiques du codage MP3 et autres
        compressions lossy.

        Args:
            audio: Signal audio
            sr: Sample rate

        Returns:
            LossyTranscodingResult
        """
        indicators = []

        # 1. Détection de "spectral artifacts" typiques du MP3
        # MP3 utilise MDCT (Modified Discrete Cosine Transform)
        # qui crée des artefacts spécifiques aux transitions
        S = librosa.stft(audio)
        magnitude = np.abs(S)

        # Calcule la régularité spectrale (MP3 = moins régulier)
        spectral_flux = np.sqrt(np.sum(np.diff(magnitude, axis=1)**2, axis=0))
        spectral_flux_mean = np.mean(spectral_flux)

        # MP3 typiquement > 0.15 de flux spectral irrégulier
        mp3_spectral_threshold = 0.15
        if spectral_flux_mean > mp3_spectral_threshold:
            indicators.append("MP3 spectral artifacts")

        # 2. Détection de "quantization noise"
        # Signal quantifié = énergie de bruit accrue dans certaines bandes
        magnitude_db = librosa.power_to_db(magnitude)
        freqs = librosa.fft_frequencies(sr=sr)

        # Bandes où le bruit de quantification est visible
        noise_bands = []
        for low_freq, high_freq in [(20, 100), (100, 500), (500, 2000)]:
            mask = (freqs >= low_freq) & (freqs < high_freq)
            if mask.any():
                band_energy = np.mean(magnitude_db[mask, :])
                if band_energy > -40:  # Seuil détectant la quantification
                    noise_bands.append((low_freq, high_freq))

        if len(noise_bands) > 0:
            indicators.append("Quantization noise detected")

        # 3. Détection de "block boundaries" (MDCT blocks)
        # MP3 traite par blocs de 576 samples
        # Cherche des discontinuités tous les ~13ms
        frame_size = int(0.013 * sr)  # ~13ms pour MP3
        energy_by_block = []

        for i in range(0, len(audio) - frame_size, frame_size):
            block_energy = np.sum(audio[i:i+frame_size]**2)
            energy_by_block.append(block_energy)

        if len(energy_by_block) > 2:
            energy_diff = np.abs(np.diff(energy_by_block))
            block_discontinuity = np.mean(energy_diff) / (np.mean(energy_by_block) + 1e-10)

            if block_discontinuity > 0.3:
                indicators.append("Block structure detected (MP3/AAC)")

        # 4. Estimation du nombre de générations (passes)
        # Plus d'artefacts = plus de passes
        artifact_count = len(indicators)
        generation_loss = artifact_count

        # Score de confiance basé sur le nombre d'indicateurs
        confidence = min(1.0, artifact_count / 3.0)

        # Détermine si transcoding probable
        is_likely_transcoded = len(indicators) >= 2

        return LossyTranscodingResult(
            is_likely_transcoded=is_likely_transcoded,
            generation_loss=generation_loss,
            confidence=confidence,
            indicators=indicators
        )

    def estimate_generation_loss(
        self,
        audio: np.ndarray,
        sr: int = 44100
    ) -> int:
        """
        Estime le nombre de fois qu'un audio a été réencodé.

        Plus l'audio a été réencodé, plus les artefacts s'accumulent.

        Args:
            audio: Signal audio
            sr: Sample rate

        Returns:
            Nombre estimé de générations (1 = original, 2+ = re-encodé)
        """
        transcoding_result = self.detect_lossy_transcoding(audio, sr)
        return transcoding_result.generation_loss

    def detect_loudness_war(
        self,
        audio: np.ndarray
    ) -> Dict[str, float]:
        """
        Détection de compression excessive (loudness war).

        Calcule des métriques comme le crest factor, dynamic range, etc.

        Args:
            audio: Signal audio

        Returns:
            Dict avec métriques de compression
        """
        # 1. Crest Factor = Peak / RMS
        peak = np.max(np.abs(audio))
        rms = np.sqrt(np.mean(audio**2))
        crest_factor = peak / (rms + 1e-10)

        # Crest factor normal : 4-12 dB (environ 1.6-4.0 linéaire)
        # Compressed : < 4 dB (< 1.6 linéaire)
        is_heavily_compressed = crest_factor < 2.0

        # 2. Dynamic Range (différence entre peak et "noise floor")
        # Bruit floor estimé via FFT
        S = librosa.stft(audio)
        magnitude_db = librosa.power_to_db(np.abs(S))
        noise_floor_db = np.percentile(magnitude_db, 5)
        peak_db = librosa.power_to_db(peak**2)
        dynamic_range = peak_db - noise_floor_db

        # Normal : >50 dB, Compressed : <30 dB
        dynamic_range_percent = np.clip((dynamic_range / 60) * 100, 0, 100)

        # 3. LUFS (Loudness Units relative to Full Scale)
        # Approximation : intégration de la puissance pondérée
        loudness_frame = np.array([np.sum(audio[i:i+2048]**2)
                                   for i in range(0, len(audio) - 2048, 2048)])
        loudness_integrated = -0.691 + 10 * np.log10(np.mean(loudness_frame) + 1e-10)

        # 4. Ratio True Peak / RMS (mesure plus fine)
        inter_sample_peaks = []
        for i in range(1, len(audio) - 1):
            interpolated = (audio[i-1] + audio[i] + audio[i+1]) / 3
            inter_sample_peaks.append(np.abs(interpolated))

        true_peak = np.max(inter_sample_peaks) if inter_sample_peaks else peak
        true_peak_ratio = true_peak / (rms + 1e-10)

        # 5. Compression Score (0-100 où 100 = très compressé)
        compression_score = 0.0
        if is_heavily_compressed:
            compression_score += 40
        compression_score += (100 - dynamic_range_percent) * 0.3
        if np.abs(loudness_integrated) > 7:  # Très fort
            compression_score += 30

        return {
            'crest_factor': float(crest_factor),
            'crest_factor_db': float(20 * np.log10(crest_factor)),
            'dynamic_range_db': float(dynamic_range),
            'is_heavily_compressed': is_heavily_compressed,
            'loudness_integrated_lufs': float(loudness_integrated),
            'true_peak_ratio': float(true_peak_ratio),
            'compression_score': float(np.clip(compression_score, 0, 100))
        }

    def detect_fake_stereo(
        self,
        audio_stereo: np.ndarray
    ) -> bool:
        """
        Détection du faux stéréo (mono élargi).

        Vérifie si le stéréo est vrai ou just une version mono
        décalée/traitée.

        Args:
            audio_stereo: Audio stéréo (channels, samples)

        Returns:
            True si faux stéréo détecté
        """
        if audio_stereo.shape[0] != 2:
            return False

        left, right = audio_stereo[0, :], audio_stereo[1, :]

        # 1. Corrélation croisée (mono = corrélation ~1)
        correlation = np.correlate(left - np.mean(left),
                                   right - np.mean(right),
                                   mode='same')
        max_correlation = np.max(correlation) / (np.linalg.norm(left) * np.linalg.norm(right) + 1e-10)

        # Faux stéréo : corrélation très élevée (> 0.8)
        if max_correlation > 0.85:
            return True

        # 2. Analyse spectrale L-R
        S_left = librosa.stft(left)
        S_right = librosa.stft(right)

        # Différence spectrale (vrai stéréo = différence notable)
        spectral_difference = np.abs(S_left - S_right)
        spectral_difference_ratio = np.mean(spectral_difference) / (np.mean(np.abs(S_left)) + 1e-10)

        # Faux stéréo : ratio < 0.2 (peu de différence)
        if spectral_difference_ratio < 0.15:
            return True

        # 3. Mid-Side analysis
        mid = (left + right) / 2
        side = (left - right) / 2

        side_energy = np.sum(side**2)
        mid_energy = np.sum(mid**2)
        side_ratio = side_energy / (mid_energy + side_energy + 1e-10)

        # Faux stéréo : peu d'énergie en side (< 0.1)
        if side_ratio < 0.1:
            return True

        return False

    def detect_ai_generated(
        self,
        audio: np.ndarray,
        sr: int = 44100
    ) -> Tuple[bool, float, List[str]]:
        """
        Heuristiques pour détecter l'audio généré par IA.

        Cherche des patterns spectraux typiques des modèles d'IA
        (parfois trop lisses, patterns répétitifs, etc.).

        Args:
            audio: Signal audio
            sr: Sample rate

        Returns:
            (is_ai_generated, confidence 0-1, indicators)
        """
        indicators = []

        # 1. Régularité spectrale anormale (IA = trop régulier/lisse)
        S = librosa.stft(audio)
        magnitude = np.abs(S)
        magnitude_db = librosa.power_to_db(magnitude)

        # Calcule la "spectral smoothness"
        freq_diff = np.abs(np.diff(magnitude_db, axis=0))
        spectral_smoothness = np.mean(freq_diff)

        # Audio naturel : 0.5-2.0 dB variation par bin
        # IA générée : peut être < 0.3 (trop lisse) ou > 2.5 (trop bruitée)
        if spectral_smoothness < 0.3 or spectral_smoothness > 2.5:
            indicators.append("Abnormal spectral smoothness")

        # 2. Absence de "micro-variations" naturelles
        # Calcule la variance temporelle de la magnitude par frame
        frame_variance = np.var(magnitude, axis=0)
        temporal_coherence = np.mean(frame_variance)

        # Audio naturel : > 0.01, IA : peut être < 0.005
        if temporal_coherence < 0.005:
            indicators.append("Unusually coherent temporal structure")

        # 3. Patterns répétitifs / autocorrélation anormale
        window_size = int(0.5 * sr)  # 500ms
        if len(audio) > window_size * 2:
            chunk1 = audio[:window_size]
            chunk2 = audio[window_size:2*window_size]

            cross_corr = np.correlate(chunk1 - np.mean(chunk1),
                                     chunk2 - np.mean(chunk2),
                                     mode='same')
            max_xcorr = np.max(np.abs(cross_corr)) / (np.linalg.norm(chunk1) * np.linalg.norm(chunk2) + 1e-10)

            # Haute corrélation entre chunks = pattern répétitif (typique IA)
            if max_xcorr > 0.7:
                indicators.append("Repetitive temporal patterns")

        # 4. Distribution anormale des harmoniques
        # IA peut avoir des harmoniques trop réguliers/synthétiques
        freqs = librosa.fft_frequencies(sr=sr)
        for frame_idx in range(0, magnitude.shape[1], max(1, magnitude.shape[1] // 10)):
            frame_spectrum = magnitude[:, frame_idx]

            # Cherche les pics
            peaks, _ = signal.find_peaks(frame_spectrum, height=np.max(frame_spectrum) * 0.5)

            if len(peaks) > 5:
                # Calcule la régularité des espacements de pics
                peak_freqs = freqs[peaks]
                peak_spacing = np.diff(peak_freqs)

                if len(peak_spacing) > 1:
                    spacing_variation = np.std(peak_spacing) / (np.mean(peak_spacing) + 1e-10)

                    # Très régulier (spacing variation < 0.2) = possible IA
                    if spacing_variation < 0.15:
                        indicators.append("Overly regular harmonic spacing")
                        break

        # 5. Phase coherence anormale
        # Audio naturel a plus de phase aléatoire
        phase = np.angle(S)
        phase_diff = np.abs(np.diff(phase, axis=1))
        phase_coherence = np.mean(np.cos(phase_diff))

        # Très cohérent (> 0.9) = peut être IA
        if phase_coherence > 0.85:
            indicators.append("Abnormal phase coherence")

        # Score de confiance
        confidence = min(1.0, len(indicators) / 3.0)
        is_ai_generated = len(indicators) >= 2

        return is_ai_generated, confidence, indicators

    def analyze_encoding_chain(
        self,
        audio: np.ndarray,
        sr: int = 44100
    ) -> Dict[str, any]:
        """
        Reconstruction de la chaîne d'encodage probable.

        Identifie les étapes d'encodage traversées.

        Args:
            audio: Signal audio
            sr: Sample rate

        Returns:
            Dict avec chaîne probable et étapes
        """
        chain = []
        analysis = {}

        # Détecte lossy transcoding
        transcoding = self.detect_lossy_transcoding(audio, sr)
        analysis['lossy_transcoding'] = transcoding.is_likely_transcoded
        analysis['generation_count'] = transcoding.generation_loss

        if transcoding.is_likely_transcoded:
            # Identifie le type de codec
            if "MP3 spectral artifacts" in transcoding.indicators:
                chain.append("MP3 (or AAC)")
            if "Block structure detected" in transcoding.indicators:
                chain.append("MDCT-based codec (MP3/AAC/Opus)")

        # Detecte la compression
        loudness = self.detect_loudness_war(audio)
        analysis['dynamic_range_db'] = loudness['dynamic_range_db']
        analysis['compression_score'] = loudness['compression_score']

        if loudness['is_heavily_compressed']:
            chain.append("Heavy multiband compression")
            chain.append("Possible limiting/brickwall compression")

        # Détecte le faux stéréo
        # Assume mono si stéréo simple
        analysis['likely_original_format'] = "stereo"

        # Reconstruction du workflow probable
        likely_workflow = [
            "Original recording",
            " → Master/Mixdown" if len(chain) > 0 else "",
            " → " + " → ".join(chain) if chain else "",
            " → Distribution format" if len(chain) > 0 else ""
        ]

        analysis['likely_encoding_chain'] = "".join(likely_workflow).strip()

        return analysis

    def detect_spectral_artifacts(
        self,
        audio: np.ndarray,
        sr: int = 44100
    ) -> SpectralArtifacts:
        """
        Détection d'artefacts spectraux.

        Identifie aliasing, ringing, pre-echo, etc.

        Args:
            audio: Signal audio
            sr: Sample rate

        Returns:
            SpectralArtifacts
        """
        # 1. Détection d'aliasing
        # Aliasing = énergie au-delà de Nyquist ou patterns anormaux
        S = librosa.stft(audio)
        magnitude = np.abs(S)
        freqs = librosa.fft_frequencies(sr=sr)

        # Cherche l'énergie proche de Nyquist (> sr/2)
        nyquist_freq = sr / 2
        nyquist_bin = np.argmin(np.abs(freqs - nyquist_freq * 0.95))

        nyquist_energy = np.mean(magnitude[nyquist_bin:, :])
        total_energy = np.mean(magnitude)
        alias_ratio = nyquist_energy / (total_energy + 1e-10)

        has_aliasing = alias_ratio > 0.1
        aliasing_freq = nyquist_freq * 0.95 if has_aliasing else None

        # 2. Détection de ringing (oscillations post-transition)
        # Ringing = energie importante avec dérivée première forte
        diff = np.diff(audio)
        ringing_mask = (np.abs(diff) > np.percentile(np.abs(diff), 90)) & \
                       (np.abs(np.diff(diff)) > np.percentile(np.abs(np.diff(diff)), 85))
        has_ringing = np.sum(ringing_mask) > len(audio) * 0.01

        ringing_db = None
        if has_ringing:
            ringing_energy = np.sum(diff[ringing_mask]**2) / np.sum(diff**2)
            ringing_db = 10 * np.log10(ringing_energy)

        # 3. Détection de pre-echo
        # Pre-echo = énergie avant un pic (artifact du codage)
        energy_by_frame = np.array([np.sum(audio[i:i+512]**2)
                                    for i in range(0, len(audio) - 512, 512)])

        peaks, _ = signal.find_peaks(energy_by_frame, height=np.max(energy_by_frame) * 0.7)

        has_pre_echo = False
        pre_echo_timing = None

        for peak in peaks:
            if peak > 1:
                # Vérifie energy before peak
                energy_before = energy_by_frame[peak-1]
                energy_at = energy_by_frame[peak]

                if energy_before > energy_at * 0.5:  # Significant energy before peak
                    has_pre_echo = True
                    pre_echo_timing = (1 / peak) * 512 / sr * 1000  # en ms
                    break

        return SpectralArtifacts(
            has_aliasing=has_aliasing,
            aliasing_frequency=aliasing_freq,
            has_ringing=has_ringing,
            ringing_db=ringing_db,
            has_pre_echo=has_pre_echo,
            pre_echo_timing_ms=pre_echo_timing
        )

    def compute_true_peak(self, audio: np.ndarray) -> float:
        """
        Calcule le true peak (inter-sample peak).

        Plus précis que le simple max() car tient compte de l'interpolation.

        Args:
            audio: Signal audio

        Returns:
            True peak value (0-1 pour audio normalisé)
        """
        # Interpolation via fit polynomial local
        true_peaks = []

        for i in range(1, len(audio) - 1):
            # Fit une parabole local
            x = np.array([-1, 0, 1])
            y = np.array([audio[i-1], audio[i], audio[i+1]])

            # Coefficients de la parabole
            coeffs = np.polyfit(x, y, 2)
            # Vertex de la parabole = -b/(2a)
            vertex = -coeffs[1] / (2 * coeffs[0])

            if -1 < vertex < 1:
                # Evaluate la parabole au vertex
                peak_value = coeffs[0] * vertex**2 + coeffs[1] * vertex + coeffs[2]
                true_peaks.append(np.abs(peak_value))

        if true_peaks:
            return float(np.max(true_peaks))
        return float(np.max(np.abs(audio)))

    def detect_clipping_events(
        self,
        audio: np.ndarray,
        sr: int = 44100,
        threshold: float = 0.99
    ) -> List[ClippingEvent]:
        """
        Détecte et localise les événements de clipping.

        Args:
            audio: Signal audio
            sr: Sample rate
            threshold: Seuil de détection (0-1)

        Returns:
            Liste des événements de clipping
        """
        events = []

        # Normalise l'audio à [-1, 1]
        audio_normalized = audio / (np.max(np.abs(audio)) + 1e-10)

        # Cherche les samples qui dépassent le seuil
        clipped_mask = np.abs(audio_normalized) > threshold

        if not np.any(clipped_mask):
            return events

        # Groupe les clipped samples consécutifs
        clipped_indices = np.where(clipped_mask)[0]
        groups = []
        current_group = [clipped_indices[0]]

        for idx in clipped_indices[1:]:
            if idx == current_group[-1] + 1:
                current_group.append(idx)
            else:
                groups.append(current_group)
                current_group = [idx]
        groups.append(current_group)

        # Crée des événements pour chaque groupe
        for group in groups:
            start_sample = group[0]
            end_sample = group[-1]
            duration_ms = (end_sample - start_sample) / sr * 1000

            peak_level = np.max(np.abs(audio_normalized[group]))

            events.append(ClippingEvent(
                start_sample=start_sample,
                end_sample=end_sample,
                peak_level=float(peak_level),
                duration_ms=float(duration_ms),
                count_consecutive_clipped=len(group)
            ))

        return events

    def analyze_stereo_field(
        self,
        audio_stereo: np.ndarray,
        sr: int = 44100
    ) -> StereoAnalysis:
        """
        Analyse complète du champ stéréo.

        Largeur, corrélation, cohérence de phase par bande.

        Args:
            audio_stereo: Audio stéréo (2, samples)
            sr: Sample rate

        Returns:
            StereoAnalysis
        """
        if audio_stereo.shape[0] != 2:
            # Mono
            return StereoAnalysis(
                width_percent=0.0,
                correlation_lr=1.0,
                phase_coherence=1.0,
                frequency_bands_width={},
                is_fake_stereo=False
            )

        left, right = audio_stereo[0, :], audio_stereo[1, :]

        # Mid-Side encoding
        mid = (left + right) / 2
        side = (left - right) / 2

        mid_energy = np.sum(mid**2)
        side_energy = np.sum(side**2)
        total_energy = mid_energy + side_energy

        # Largeur stéréo = proportion d'énergie en side
        width_percent = 100 * side_energy / (total_energy + 1e-10)

        # Corrélation L-R
        correlation = np.dot(left - np.mean(left), right - np.mean(right)) / \
                     (np.linalg.norm(left - np.mean(left)) * np.linalg.norm(right - np.mean(right)) + 1e-10)

        # Cohérence de phase
        S_left = librosa.stft(left)
        S_right = librosa.stft(right)
        phase_diff = np.angle(S_left) - np.angle(S_right)
        phase_coherence = np.mean(np.cos(phase_diff))

        # Largeur par bande fréquence
        freqs = librosa.fft_frequencies(sr=sr)
        magnitude_left = np.abs(S_left)
        magnitude_right = np.abs(S_right)

        bands = {
            'bass': (0, 250),
            'mid': (250, 2000),
            'high': (2000, sr//2)
        }

        frequency_bands_width = {}
        for band_name, (low_freq, high_freq) in bands.items():
            mask = (freqs >= low_freq) & (freqs < high_freq)
            if mask.any():
                left_energy = np.mean(magnitude_left[mask, :]**2)
                right_energy = np.mean(magnitude_right[mask, :]**2)
                mid_energy_band = (left_energy + right_energy) / 2
                side_energy_band = (left_energy - right_energy)**2 / 4

                band_width = 100 * side_energy_band / (mid_energy_band + side_energy_band + 1e-10)
                frequency_bands_width[band_name] = float(band_width)

        is_fake = self.detect_fake_stereo(audio_stereo)

        return StereoAnalysis(
            width_percent=float(width_percent),
            correlation_lr=float(correlation),
            phase_coherence=float(phase_coherence),
            frequency_bands_width=frequency_bands_width,
            is_fake_stereo=is_fake
        )

    def detect_silence_gaps(
        self,
        audio: np.ndarray,
        sr: int = 44100,
        threshold_db: float = -60.0,
        min_gap_duration: float = 0.5
    ) -> List[Tuple[int, int]]:
        """
        Détecte les gaps de silence internes (pas juste début/fin).

        Args:
            audio: Signal audio
            sr: Sample rate
            threshold_db: Seuil en dB
            min_gap_duration: Durée minimale en secondes

        Returns:
            Liste de (start_sample, end_sample) pour chaque gap
        """
        gaps = []

        # Calcule l'énergie par frame
        frame_length = int(0.05 * sr)  # 50ms
        energy = []

        for i in range(0, len(audio), frame_length):
            frame = audio[i:i+frame_length]
            if len(frame) == 0:
                break
            e = np.sum(frame**2)
            energy.append(e)

        energy = np.array(energy)
        energy_db = 10 * np.log10(energy + 1e-10)

        # Cherche les frames silencieux
        silence_mask = energy_db < threshold_db

        # Groupe les frames silencieux consécutifs
        silence_frames = np.where(silence_mask)[0]

        if len(silence_frames) < 2:
            return gaps

        groups = []
        current_group = [silence_frames[0]]

        for frame_idx in silence_frames[1:]:
            if frame_idx == current_group[-1] + 1:
                current_group.append(frame_idx)
            else:
                groups.append(current_group)
                current_group = [frame_idx]
        groups.append(current_group)

        # Crée des gaps pour les groupes suffisamment longs
        min_gap_frames = int(min_gap_duration / 0.05)

        for group in groups:
            if len(group) >= min_gap_frames:
                start_sample = group[0] * frame_length
                end_sample = group[-1] * frame_length
                gaps.append((start_sample, end_sample))

        return gaps

    def compute_audio_quality_grade(
        self,
        audio: np.ndarray,
        sr: int = 44100
    ) -> Tuple[AudioQualityGrade, float]:
        """
        Calcule une note globale de qualité audio (A/B/C/D/F).

        Args:
            audio: Signal audio
            sr: Sample rate

        Returns:
            (Grade, score 0-100)
        """
        score = 100.0

        # 1. Détecte lossy transcoding (-15 points par génération)
        transcoding = self.detect_lossy_transcoding(audio, sr)
        score -= transcoding.generation_loss * 15

        # 2. Détecte loudness war (-20 points si compression excessive)
        loudness = self.detect_loudness_war(audio)
        if loudness['is_heavily_compressed']:
            score -= 20

        # 3. Clipping events (-10 points par événement)
        clipping = self.detect_clipping_events(audio, sr)
        score -= min(30, len(clipping) * 10)

        # 4. Artefacts spectraux (-5 points each)
        artifacts = self.detect_spectral_artifacts(audio, sr)
        if artifacts.has_aliasing:
            score -= 5
        if artifacts.has_ringing:
            score -= 5
        if artifacts.has_pre_echo:
            score -= 5

        # 5. AI generated (-25 points)
        is_ai, confidence, _ = self.detect_ai_generated(audio, sr)
        if is_ai and confidence > 0.7:
            score -= 25
        elif is_ai:
            score -= 10

        # 6. Dynamic range penalty (si trop faible)
        if loudness['dynamic_range_db'] < 6:
            score -= 15
        elif loudness['dynamic_range_db'] < 12:
            score -= 5

        score = np.clip(score, 0, 100)

        # Détermine le grade
        if score >= 90:
            grade = AudioQualityGrade.A
        elif score >= 75:
            grade = AudioQualityGrade.B
        elif score >= 60:
            grade = AudioQualityGrade.C
        elif score >= 40:
            grade = AudioQualityGrade.D
        else:
            grade = AudioQualityGrade.F

        return grade, float(score)
