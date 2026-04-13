"""
Stems & Source Separation avancée (points 211-270)

Module pour la séparation de sources audio hybride avec détection
d'artefacts, analyse de qualité et extraction de micro-stems.
"""

import numpy as np
from scipy import signal
from scipy.fft import fft, ifft
import librosa
import soundfile as sf
from typing import Dict, List, Tuple, Optional, Literal
from dataclasses import dataclass
from enum import Enum


class StemType(str, Enum):
    """Types de stems reconnus"""
    VOCALS = "vocals"
    DRUMS = "drums"
    BASS = "bass"
    OTHER = "other"
    KICK = "kick"
    SNARE = "snare"
    HIHAT = "hihat"
    LEAD_VOCAL = "lead_vocal"
    BACKING_VOCAL = "backing_vocal"


class VocalEmotion(str, Enum):
    """Classifications d'émotion vocale"""
    HAPPY = "happy"
    SAD = "sad"
    AGGRESSIVE = "aggressive"
    CHILL = "chill"
    NEUTRAL = "neutral"


@dataclass
class StemQualityMetrics:
    """Métriques de qualité d'un stem"""
    snr: float  # Signal-to-Noise Ratio en dB
    distortion: float  # % de distortion détectée
    bleed: float  # % de bleed inter-stems
    frequency_balance: Dict[str, float]  # Balance par bande (bass, mid, high)
    overall_score: float  # Score 0-100


@dataclass
class SeparationArtifact:
    """Artefact détecté post-séparation"""
    artifact_type: str  # "click", "distortion", "aliasing", "ringing"
    start_sample: int
    end_sample: int
    severity: float  # 0-1
    frequency_range: Optional[Tuple[float, float]] = None


@dataclass
class StemTransition:
    """Point de transition d'un stem (entrée/sortie)"""
    stem_type: str
    transition_type: Literal["enter", "exit"]
    sample_position: int
    confidence: float  # 0-1
    energy_change: float  # dB


class StemsHybridEngine:
    """
    Moteur de séparation hybride avec gestion du chevauchement,
    réduction du bleed et détection d'artefacts.
    """

    def __init__(self, sr: int = 44100, chunk_duration: float = 10.0,
                 overlap_duration: float = 2.0):
        """
        Initialise le moteur de séparation.

        Args:
            sr: Sample rate (Hz)
            chunk_duration: Durée des chunks en secondes
            overlap_duration: Durée du chevauchement en secondes
        """
        self.sr = sr
        self.chunk_duration = chunk_duration
        self.overlap_duration = overlap_duration
        self.chunk_samples = int(chunk_duration * sr)
        self.overlap_samples = int(overlap_duration * sr)

    def separate_with_overlap(
        self,
        audio: np.ndarray,
        model_fn,
        crossfade_curve: str = "hann"
    ) -> Dict[str, np.ndarray]:
        """
        Séparation par chunks avec chevauchement et crossfade.

        Divise l'audio en chunks de 10s avec 2s de chevauchement,
        traite chaque chunk, puis les recombine avec crossfade.

        Args:
            audio: Signal audio mono (samples,)
            model_fn: Fonction de séparation (audio -> {stem: ndarray})
            crossfade_curve: Type de courbe de crossfade ("hann", "hamming", etc.)

        Returns:
            Dict {stem_name: separated_audio}
        """
        num_samples = len(audio)
        stride = self.chunk_samples - self.overlap_samples

        # Genère les chunks avec chevauchement
        chunks = []
        positions = []
        pos = 0
        while pos < num_samples:
            chunk_end = min(pos + self.chunk_samples, num_samples)
            chunk = audio[pos:chunk_end]

            # Padding si dernier chunk est trop court
            if len(chunk) < self.chunk_samples:
                chunk = np.pad(chunk, (0, self.chunk_samples - len(chunk)), 'reflect')

            chunks.append(chunk)
            positions.append(pos)

            if chunk_end == num_samples:
                break
            pos += stride

        # Séparation de chaque chunk
        separated_chunks = []
        for chunk in chunks:
            stem_dict = model_fn(chunk)
            separated_chunks.append(stem_dict)

        # Reconstruction avec crossfade
        result = {}
        window = signal.get_window(crossfade_curve, self.overlap_samples * 2)
        fade_in = window[:self.overlap_samples]
        fade_out = window[self.overlap_samples:]

        for stem_name in separated_chunks[0].keys():
            output = np.zeros(num_samples)

            for i, (chunk_data, pos) in enumerate(zip(separated_chunks, positions)):
                stem_audio = chunk_data[stem_name]
                chunk_len = min(self.chunk_samples, num_samples - pos)
                stem_audio = stem_audio[:chunk_len]

                if i == 0:
                    # Premier chunk
                    output[pos:pos + chunk_len] = stem_audio
                else:
                    # Crossfade avec le chunk précédent
                    overlap_start = pos
                    overlap_end = min(pos + self.overlap_samples, num_samples)
                    overlap_len = overlap_end - overlap_start

                    # Fenêtrage avec fade_out du chunk précédent et fade_in du courant
                    output[overlap_start:overlap_end] *= fade_out[:overlap_len]
                    output[overlap_start:overlap_end] += stem_audio[:overlap_len] * fade_in[:overlap_len]
                    output[overlap_end:pos + chunk_len] = stem_audio[overlap_len:chunk_len]

            result[stem_name] = output

        return result

    def ensemble_separation(
        self,
        audio: np.ndarray,
        model_fns: List,
        weights: Optional[List[float]] = None
    ) -> Dict[str, np.ndarray]:
        """
        Ensemble de 2+ modèles avec moyenne pondérée.

        Combine les résultats de plusieurs modèles de séparation
        avec des poids pour améliorer la qualité.

        Args:
            audio: Signal audio mono
            model_fns: Liste de fonctions de séparation
            weights: Poids pour chaque modèle (somme = 1)

        Returns:
            Dict {stem_name: weighted_average}
        """
        if weights is None:
            weights = [1.0 / len(model_fns)] * len(model_fns)
        else:
            weights = np.array(weights)
            weights /= weights.sum()

        separations = []
        for model_fn in model_fns:
            sep = model_fn(audio)
            separations.append(sep)

        # Moyenne pondérée
        result = {}
        for stem_name in separations[0].keys():
            weighted_sum = np.zeros_like(separations[0][stem_name])
            for sep, w in zip(separations, weights):
                weighted_sum += sep[stem_name] * w
            result[stem_name] = weighted_sum

        return result

    def reduce_stem_bleed(
        self,
        stem: np.ndarray,
        reference_stems: Dict[str, np.ndarray],
        bleed_threshold: float = 0.1
    ) -> np.ndarray:
        """
        Réduction du bleed inter-stems par filtrage adaptatif.

        Utilise des filtres adaptatifs pour réduire la contamination
        d'autres stems dans le stem courant.

        Args:
            stem: Stem à traiter
            reference_stems: Dict des autres stems
            bleed_threshold: Seuil de détection de bleed (0-1)

        Returns:
            Stem avec bleed réduit
        """
        output = stem.copy()

        for ref_name, ref_stem in reference_stems.items():
            # Corrélation croisée en fréquence
            stem_fft = np.abs(fft(stem))
            ref_fft = np.abs(fft(ref_stem))

            # Compute cross-correlation magnitude
            correlation = (stem_fft * ref_fft) / (np.linalg.norm(stem_fft) * np.linalg.norm(ref_fft) + 1e-8)

            # Mask pour les fréquences où bleed est important
            bleed_mask = correlation > bleed_threshold

            # Filtre adaptatif : soustrait une version filtrée du ref_stem
            if bleed_mask.any():
                adaptation_gain = 0.5  # Gain conservateur
                filtered_ref = ref_stem * adaptation_gain

                # Soustraction spectrale
                output_fft = fft(output)
                ref_fft_filtered = fft(filtered_ref)

                # Soustraction masquée
                output_fft[bleed_mask] -= ref_fft_filtered[bleed_mask] * 0.3
                output = np.real(ifft(output_fft))

        return output

    def detect_separation_artifacts(
        self,
        stem: np.ndarray,
        sr: int = 44100
    ) -> List[SeparationArtifact]:
        """
        Détection d'artefacts post-séparation.

        Identifie clics, distortion, aliasing, ringing via analyse spectrale
        et détection d'impulsions.

        Args:
            stem: Stem à analyser
            sr: Sample rate

        Returns:
            Liste des artefacts détectés
        """
        artifacts = []

        # 1. Détection de clics (impulsions courtes haute-énergie)
        # Calcule la dérivée énergétique
        window_size = int(0.01 * sr)  # 10ms
        energy = np.array([np.sum(stem[i:i+window_size]**2)
                           for i in range(0, len(stem) - window_size, window_size)])
        energy_smooth = signal.savgol_filter(energy, 5, 2)
        energy_diff = np.abs(np.diff(energy_smooth))

        click_threshold = np.median(energy_diff) + 2 * np.std(energy_diff)
        click_positions = np.where(energy_diff > click_threshold)[0]

        for pos in click_positions:
            sample_pos = pos * window_size
            artifacts.append(SeparationArtifact(
                artifact_type="click",
                start_sample=sample_pos,
                end_sample=sample_pos + window_size,
                severity=min(1.0, energy_diff[pos] / click_threshold)
            ))

        # 2. Détection de distortion (THD > seuil)
        stft = librosa.stft(stem)
        magnitude = np.abs(stft)

        # Calcule THD par frame
        fundamental = magnitude[0, :]
        harmonics = magnitude[1:, :]
        thd = np.sqrt(np.sum(harmonics**2, axis=0)) / (fundamental + 1e-8)

        distortion_threshold = 0.3
        distorted_frames = np.where(thd > distortion_threshold)[0]

        for frame_idx in distorted_frames[:10]:  # Top 10 frames
            sample_pos = librosa.frames_to_samples(frame_idx, hop_length=512)
            artifacts.append(SeparationArtifact(
                artifact_type="distortion",
                start_sample=sample_pos,
                end_sample=sample_pos + 512,
                severity=min(1.0, thd[frame_idx] / distortion_threshold)
            ))

        # 3. Détection de ringing (oscillations post-transition)
        # Filtre adaptatif pour détecter ringing post-événement
        diff = np.diff(stem)
        ringing_mask = (np.abs(diff) > np.percentile(np.abs(diff), 95)) & \
                       (np.abs(np.diff(diff)) > np.percentile(np.abs(np.diff(diff)), 80))
        ringing_positions = np.where(ringing_mask)[0]

        for pos in ringing_positions[:5]:
            artifacts.append(SeparationArtifact(
                artifact_type="ringing",
                start_sample=pos,
                end_sample=pos + int(0.1 * sr),
                severity=0.5
            ))

        return artifacts

    def compute_stem_quality_score(
        self,
        stem: np.ndarray,
        reference: np.ndarray,
        sr: int = 44100
    ) -> StemQualityMetrics:
        """
        Calcule score de qualité complet pour un stem.

        Comprend SNR, distortion, bleed et balance fréquentielle.

        Args:
            stem: Stem à évaluer
            reference: Signal de référence (original ou mélange)
            sr: Sample rate

        Returns:
            StemQualityMetrics
        """
        # 1. SNR (Signal-to-Noise Ratio)
        # Bruit = différence entre reference et stem
        noise = reference - stem
        signal_power = np.mean(stem**2)
        noise_power = np.mean(noise**2)
        snr = 10 * np.log10(signal_power / (noise_power + 1e-10))
        snr = np.clip(snr, -20, 60)  # Clipping pour robustesse

        # 2. Distortion (THD)
        stft = librosa.stft(stem)
        magnitude = np.abs(stft)
        fundamental = magnitude[0, :]
        harmonics = magnitude[1:, :]
        thd = np.sqrt(np.sum(harmonics**2, axis=0)) / (fundamental + 1e-8)
        distortion_percent = np.mean(thd) * 100
        distortion_percent = min(100, distortion_percent)

        # 3. Bleed (cross-correlation avec le bruit)
        correlation = np.abs(np.correlate(stem, noise, mode='same').max()) / \
                      (np.linalg.norm(stem) * np.linalg.norm(noise) + 1e-10)
        bleed_percent = correlation * 100

        # 4. Balance fréquentielle
        freq_bands = {
            'bass': (0, 250),
            'mid': (250, 2000),
            'high': (2000, sr//2)
        }

        magnitude_db = librosa.power_to_db(magnitude)
        freqs = librosa.fft_frequencies(sr=sr)

        frequency_balance = {}
        for band_name, (low_freq, high_freq) in freq_bands.items():
            mask = (freqs >= low_freq) & (freqs < high_freq)
            avg_db = np.mean(magnitude_db[mask, :]) if mask.any() else -np.inf
            frequency_balance[band_name] = float(avg_db)

        # 5. Score global (0-100)
        snr_component = (snr + 20) / 80 * 100  # Normalisé -20 à 60 dB
        distortion_component = (100 - distortion_percent) / 100 * 100
        bleed_component = (100 - bleed_percent) / 100 * 100

        overall_score = 0.5 * snr_component + 0.3 * distortion_component + 0.2 * bleed_component
        overall_score = np.clip(overall_score, 0, 100)

        return StemQualityMetrics(
            snr=float(snr),
            distortion=float(distortion_percent),
            bleed=float(bleed_percent),
            frequency_balance=frequency_balance,
            overall_score=float(overall_score)
        )

    def extract_micro_stems(
        self,
        drum_stem: np.ndarray,
        sr: int = 44100
    ) -> Dict[str, np.ndarray]:
        """
        Extraction de micro-stems (kick, snare, hihat) depuis drum stem.

        Utilise classification par bandes de fréquence et analyse temporelle.

        Args:
            drum_stem: Stem drums
            sr: Sample rate

        Returns:
            Dict {stem_type: audio}
        """
        # STFT pour analyse fréquence-temps
        S = librosa.stft(drum_stem)
        magnitude = np.abs(S)
        freqs = librosa.fft_frequencies(sr=sr)

        # Définition des bandes fréquentielles
        # Kick : 20-150 Hz
        # Snare : 150-2000 Hz
        # HiHat : 2000-12000 Hz
        kick_mask = (freqs >= 20) & (freqs <= 150)
        snare_mask = (freqs > 150) & (freqs <= 2000)
        hihat_mask = (freqs > 2000) & (freqs <= 12000)

        kick_spec = magnitude.copy()
        kick_spec[~kick_mask, :] = 0

        snare_spec = magnitude.copy()
        snare_spec[~snare_mask, :] = 0

        hihat_spec = magnitude.copy()
        hihat_spec[~hihat_mask, :] = 0

        # Reconstruction temporelle (inverse STFT)
        phase = np.angle(S)

        kick = librosa.istft(kick_spec * np.exp(1j * phase))
        snare = librosa.istft(snare_spec * np.exp(1j * phase))
        hihat = librosa.istft(hihat_spec * np.exp(1j * phase))

        return {
            "kick": kick,
            "snare": snare,
            "hihat": hihat
        }

    def estimate_reverb_from_stems(
        self,
        other_stem: np.ndarray,
        sr: int = 44100,
        reverb_time_estimate: float = 2.0
    ) -> Dict[str, float]:
        """
        Estimation du reverb à partir du stem "other".

        Analyse la décroissance de l'énergie pour estimer RT60,
        ratio dry/wet, et paramètres de salle.

        Args:
            other_stem: Stem "other" (contient bruit, réverbération)
            sr: Sample rate
            reverb_time_estimate: Estimation du RT60 en secondes

        Returns:
            Dict avec paramètres de reverb estimés
        """
        # Calcule l'enveloppe énergétique
        window_size = int(0.05 * sr)  # 50ms
        frames = []
        for i in range(0, len(other_stem) - window_size, window_size):
            frame_energy = np.sum(other_stem[i:i+window_size]**2)
            frames.append(frame_energy)

        energy_db = 10 * np.log10(np.array(frames) + 1e-10)

        # Fit linéaire pour estimer la décroissance
        x = np.arange(len(energy_db))
        z = np.polyfit(x, energy_db, 1)
        decay_slope = z[0]  # dB par frame

        # RT60 = temps pour -60dB (slope * frames_for_60db = -60)
        frames_for_60db = 60 / (-decay_slope + 1e-8)
        estimated_rt60 = frames_for_60db * window_size / sr

        # Ratio dry/wet (approximation via correlation)
        # Calcule autocorrélation
        autocorr = np.correlate(other_stem, other_stem, mode='full')
        autocorr = autocorr[len(autocorr)//2:]
        autocorr /= autocorr[0]

        # Dry signal serait plus corrélé à lui-même
        # Wet (reverb) introduit du décalage
        wet_ratio = 1.0 - np.mean(autocorr[:int(0.1*sr)])
        dry_ratio = 1.0 - wet_ratio

        return {
            "estimated_rt60": float(estimated_rt60),
            "decay_slope_db_per_frame": float(decay_slope),
            "dry_ratio": float(dry_ratio),
            "wet_ratio": float(wet_ratio),
            "reverb_type": "plate" if estimated_rt60 > 2.0 else "room"
        }

    def detect_vocal_emotion(
        self,
        vocal_stem: np.ndarray,
        sr: int = 44100
    ) -> Tuple[VocalEmotion, float]:
        """
        Classification d'émotion vocale.

        Utilise features de pitch, vibrato, spectral centroid, etc.

        Args:
            vocal_stem: Stem vocals
            sr: Sample rate

        Returns:
            (VocalEmotion, confidence 0-1)
        """
        # 1. Extrait le pitch et vibrato
        f0 = librosa.yin(vocal_stem, fmin=80, fmax=400, sr=sr)
        f0_voiced = f0[f0 > 0]

        if len(f0_voiced) == 0:
            return VocalEmotion.NEUTRAL, 0.5

        # Vibrato = variance dans le pitch
        vibrato = np.std(f0_voiced)

        # 2. Centroid spectral (brightness)
        S = librosa.stft(vocal_stem)
        freqs = librosa.fft_frequencies(sr=sr)
        magnitude = np.abs(S)
        spectral_centroid = np.average(freqs, weights=np.mean(magnitude, axis=1))

        # 3. Zero-crossing rate (brightness approximatif)
        zcr = librosa.feature.zero_crossing_rate(vocal_stem)[0]
        mean_zcr = np.mean(zcr)

        # 4. Energy dynamic (variation d'amplitude)
        rms = librosa.feature.rms(y=vocal_stem)[0]
        energy_dynamic = np.std(rms) / (np.mean(rms) + 1e-8)

        # Classification heuristique
        features = {
            'vibrato': vibrato,
            'spectral_centroid': spectral_centroid,
            'zcr': mean_zcr,
            'energy_dynamic': energy_dynamic
        }

        # Happy : centroid élevé, vibrato modéré, dynamique élevée
        happy_score = (spectral_centroid / 5000) * 0.4 + \
                      min(1, vibrato / 30) * 0.3 + \
                      energy_dynamic * 0.3

        # Aggressive : centroid très élevé, énergie stable et forte
        aggressive_score = (spectral_centroid / 8000) * 0.5 + \
                           (1 - energy_dynamic) * 0.5

        # Sad : centroid bas, vibrato minimal, dynamique basse
        sad_score = (1 - spectral_centroid / 3000) * 0.5 + \
                    (1 - vibrato / 20) * 0.3 + \
                    (1 - energy_dynamic) * 0.2

        # Chill : centroid bas-moyen, vibrato absent, dynamique basse
        chill_score = (1 - spectral_centroid / 4000) * 0.4 + \
                      (1 - mean_zcr) * 0.3 + \
                      (1 - energy_dynamic) * 0.3

        scores = {
            VocalEmotion.HAPPY: np.clip(happy_score, 0, 1),
            VocalEmotion.AGGRESSIVE: np.clip(aggressive_score, 0, 1),
            VocalEmotion.SAD: np.clip(sad_score, 0, 1),
            VocalEmotion.CHILL: np.clip(chill_score, 0, 1),
            VocalEmotion.NEUTRAL: 0.5
        }

        best_emotion = max(scores.items(), key=lambda x: x[1])
        return best_emotion[0], float(best_emotion[1])

    def separate_backing_vocals(
        self,
        vocal_stem: np.ndarray,
        sr: int = 44100
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Séparation backing vocals vs lead.

        Utilise l'analyse de pitch : lead = plus de variation, backing = plus stable.

        Args:
            vocal_stem: Stem vocals
            sr: Sample rate

        Returns:
            (lead_vocal, backing_vocal)
        """
        # Analyse spectro-temporelle
        S = librosa.stft(vocal_stem)
        magnitude = np.abs(S)
        phase = np.angle(S)

        # Calcule la stabilité spectrale par frame
        spectral_diff = np.abs(np.diff(magnitude, axis=1))
        stability = 1.0 / (np.mean(spectral_diff, axis=0) + 0.1)

        # Lead vocal : variation spectrale plus élevée
        # Backing vocal : plus stable
        stability_threshold = np.median(stability)

        # Masque adaptatif
        lead_mask = stability < stability_threshold
        backing_mask = stability >= stability_threshold

        # Reconstruction
        lead_spec = magnitude.copy()
        lead_spec[:, backing_mask] *= 0.5  # Réduit backing dans lead

        backing_spec = magnitude.copy()
        backing_spec[:, lead_mask] *= 0.3  # Réduit lead dans backing

        lead = librosa.istft(lead_spec * np.exp(1j * phase))
        backing = librosa.istft(backing_spec * np.exp(1j * phase))

        return lead, backing

    def compute_stem_energy_envelope(
        self,
        stem: np.ndarray,
        sr: int = 44100,
        beat_duration: float = 0.5
    ) -> np.ndarray:
        """
        Enveloppe d'énergie par stem par beat.

        Calcule l'énergie RMS lissée par beat (par défaut tous les 0.5s).

        Args:
            stem: Stem audio
            sr: Sample rate
            beat_duration: Durée d'un beat en secondes

        Returns:
            Enveloppe d'énergie (1D array)
        """
        beat_samples = int(beat_duration * sr)
        envelope = []

        for i in range(0, len(stem), beat_samples):
            frame = stem[i:i + beat_samples]
            if len(frame) == 0:
                break
            rms = np.sqrt(np.mean(frame**2))
            envelope.append(rms)

        # Lissage avec filtre Savitzky-Golay
        if len(envelope) > 5:
            envelope = signal.savgol_filter(envelope,
                                           min(5, len(envelope) if len(envelope) % 2 == 1 else len(envelope) - 1),
                                           2)

        return np.array(envelope)

    def detect_stem_transition_points(
        self,
        stems_dict: Dict[str, np.ndarray],
        sr: int = 44100,
        energy_threshold: float = 0.1
    ) -> List[StemTransition]:
        """
        Détection des points de transition (entrée/sortie) des stems.

        Identifie où un stem entre ou sort dans la composition.

        Args:
            stems_dict: Dict {stem_name: audio}
            sr: Sample rate
            energy_threshold: Seuil relatif d'énergie pour transition

        Returns:
            Liste des transitions triées par position
        """
        transitions = []
        frame_length = int(0.05 * sr)  # 50ms frames

        for stem_name, stem in stems_dict.items():
            # Calcule l'énergie par frame
            energy = []
            for i in range(0, len(stem), frame_length):
                frame = stem[i:i + frame_length]
                if len(frame) == 0:
                    break
                e = np.sum(frame**2)
                energy.append(e)

            energy = np.array(energy)
            if len(energy) < 2:
                continue

            # Lissage
            energy_smooth = signal.savgol_filter(energy,
                                                min(5, len(energy) if len(energy) % 2 == 1 else len(energy) - 1),
                                                2)

            # Détection de transitions (grandes sauts)
            energy_diff = np.abs(np.diff(energy_smooth))
            mean_diff = np.mean(energy_diff)
            transition_threshold = mean_diff + energy_threshold * np.std(energy_diff)

            transition_frames = np.where(energy_diff > transition_threshold)[0]

            for frame_idx in transition_frames:
                sample_pos = frame_idx * frame_length

                # Détermine entrée vs sortie
                energy_before = energy_smooth[frame_idx]
                energy_after = energy_smooth[min(frame_idx + 1, len(energy_smooth) - 1)]

                is_enter = energy_after > energy_before
                transition_type = "enter" if is_enter else "exit"

                change_magnitude = np.abs(energy_after - energy_before) / (energy_before + 1e-8)
                confidence = min(1.0, change_magnitude)

                transitions.append(StemTransition(
                    stem_type=stem_name,
                    transition_type=transition_type,
                    sample_position=sample_pos,
                    confidence=confidence,
                    energy_change=10 * np.log10(energy_after / (energy_before + 1e-8))
                ))

        # Trie par position
        transitions.sort(key=lambda t: t.sample_position)
        return transitions

    def analyze_stem_frequency_balance(
        self,
        stem: np.ndarray,
        sr: int = 44100
    ) -> Dict[str, float]:
        """
        Analyse la balance fréquentielle d'un stem.

        Calcule la distribution d'énergie par bande de fréquence.

        Args:
            stem: Stem audio
            sr: Sample rate

        Returns:
            Dict {frequency_band: energy_dB}
        """
        S = librosa.stft(stem)
        magnitude_db = librosa.power_to_db(np.abs(S))
        freqs = librosa.fft_frequencies(sr=sr)

        # Bandes standard
        bands = {
            'sub-bass': (0, 60),
            'bass': (60, 250),
            'low-mid': (250, 500),
            'mid': (500, 2000),
            'high-mid': (2000, 4000),
            'presence': (4000, 6000),
            'brilliance': (6000, sr//2)
        }

        balance = {}
        for band_name, (low_freq, high_freq) in bands.items():
            mask = (freqs >= low_freq) & (freqs < high_freq)
            if mask.any():
                avg_db = np.mean(magnitude_db[mask, :])
                balance[band_name] = float(avg_db)
            else:
                balance[band_name] = -np.inf

        return balance
