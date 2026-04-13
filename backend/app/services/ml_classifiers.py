"""
ML Classifiers: Vocal style, production era, club vs radio, DJ tools,
crowd reaction, set position, danceability, mood, and arousal-valence mapping.

Points 891-900: Audio-based ML classification for genre, mood, style.
"""

import logging
from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass
import numpy as np
from enum import Enum

logger = logging.getLogger(__name__)


class VocalStyle(str, Enum):
    """Vocal style classifications."""
    RAP = "rap"
    SINGING = "singing"
    SPOKEN = "spoken"
    FX = "fx"
    INSTRUMENTAL = "instrumental"


class ProductionEra(str, Enum):
    """Production era classifications."""
    EIGHTIES = "1980s"
    NINETIES = "1990s"
    TWO_THOUSANDS = "2000s"
    TWO_THOUSANDS_TEN = "2010s"
    TWO_THOUSANDS_TWENTY = "2020s"


class ClubVsRadio(str, Enum):
    """Club vs Radio classification."""
    CLUB = "club"
    RADIO = "radio"
    HYBRID = "hybrid"


class DJToolType(str, Enum):
    """DJ-specific tool classifications."""
    INTRO = "intro"
    ACAPELLA = "acapella"
    FX = "fx"
    BREAK = "break"
    BUILDUP = "buildup"
    DROP = "drop"


class Mood(str, Enum):
    """Mood classifications."""
    HAPPY = "happy"
    SAD = "sad"
    ENERGETIC = "energetic"
    CHILL = "chill"
    DARK = "dark"
    EUPHORIC = "euphoric"


@dataclass
class ClassifierResult:
    """Result from a classifier."""
    label: str
    confidence: float
    alternatives: List[Tuple[str, float]] = None
    reasoning: str = None


class VocalStyleClassifier:
    """Classify vocal style: rap, singing, spoken, FX, instrumental."""

    @staticmethod
    def classify(spectral_centroid: float, zero_crossing_rate: float,
                spectral_rolloff: float, mfcc_mean: float) -> ClassifierResult:
        """
        Classify vocal style based on audio features.

        High zero_crossing_rate + high spectral_centroid: rap/spoken
        Low zero_crossing_rate + harmonics: singing
        Very high spectral_centroid: FX/effects
        Low energy in vocal bands: instrumental
        """
        features = {
            "spectral_centroid": spectral_centroid,
            "zero_crossing_rate": zero_crossing_rate,
            "spectral_rolloff": spectral_rolloff,
            "mfcc_mean": mfcc_mean,
        }

        # Simple decision tree
        if zero_crossing_rate > 0.15:
            # High ZCR suggests percussive/speech
            if spectral_centroid > 4000:
                return ClassifierResult(
                    VocalStyle.RAP.value,
                    0.8,
                    [(VocalStyle.SPOKEN.value, 0.15), (VocalStyle.FX.value, 0.05)],
                    "High zero-crossing rate + high spectral centroid"
                )
            else:
                return ClassifierResult(
                    VocalStyle.SPOKEN.value,
                    0.75,
                    [(VocalStyle.RAP.value, 0.2), (VocalStyle.INSTRUMENTAL.value, 0.05)],
                    "High zero-crossing rate, moderate spectral centroid"
                )
        elif spectral_centroid > 5000:
            return ClassifierResult(
                VocalStyle.FX.value,
                0.7,
                [(VocalStyle.RAP.value, 0.2), (VocalStyle.INSTRUMENTAL.value, 0.1)],
                "Very high spectral centroid"
            )
        elif spectral_rolloff > 0.8:
            return ClassifierResult(
                VocalStyle.SINGING.value,
                0.75,
                [(VocalStyle.INSTRUMENTAL.value, 0.2), (VocalStyle.SPOKEN.value, 0.05)],
                "High spectral rolloff + harmonic structure"
            )
        else:
            return ClassifierResult(
                VocalStyle.INSTRUMENTAL.value,
                0.85,
                [(VocalStyle.SINGING.value, 0.1), (VocalStyle.FX.value, 0.05)],
                "Low vocal indicators, instrumental characteristics"
            )


class ProductionEraClassifier:
    """Classify production era: 80s, 90s, 2000s, 2010s, 2020s."""

    @staticmethod
    def classify(spectral_power_dist: Dict[str, float],
                bpm: float, brightness: float) -> ClassifierResult:
        """
        Classify production era based on spectral profile + BPM + brightness.

        1980s: More low/mid energy, lower brightness
        1990s: Warehouse house, 120-130 BPM, warm sound
        2000s: Progressive, 125-135 BPM, rich mids
        2010s: Dub step, trap, harsh highs, 140-180 BPM
        2020s: Modern deep/tech, full spectrum, 120-128 BPM
        """
        # Extract typical spectral bands
        low_energy = spectral_power_dist.get("low", 0.0)  # < 250 Hz
        mid_energy = spectral_power_dist.get("mid", 0.0)  # 250-2k Hz
        high_energy = spectral_power_dist.get("high", 0.0)  # > 2k Hz

        era_scores = {}

        # 1980s: low BPM, synth-heavy, warm
        if bpm < 130 and brightness < 0.4 and mid_energy > 0.35:
            era_scores[ProductionEra.EIGHTIES.value] = 0.75

        # 1990s: house, full spectrum
        if 120 <= bpm <= 135 and brightness < 0.5 and mid_energy > 0.3:
            era_scores[ProductionEra.NINETIES.value] = 0.8

        # 2000s: progressive, warm highs
        if 125 <= bpm <= 140 and brightness < 0.6 and mid_energy > 0.25:
            era_scores[ProductionEra.TWO_THOUSANDS.value] = 0.75

        # 2010s: dubstep/trap, very bright, fast
        if bpm > 135 and brightness > 0.6 and high_energy > 0.3:
            era_scores[ProductionEra.TWO_THOUSANDS_TEN.value] = 0.8

        # 2020s: modern deep/tech, balanced
        if 120 <= bpm <= 130 and 0.4 <= brightness <= 0.6:
            era_scores[ProductionEra.TWO_THOUSANDS_TWENTY.value] = 0.85

        if not era_scores:
            era_scores[ProductionEra.TWO_THOUSANDS_TWENTY.value] = 0.5

        # Get top result
        best_era = max(era_scores, key=era_scores.get)
        confidence = era_scores[best_era]
        alternatives = [(e, s) for e, s in era_scores.items() if e != best_era]
        alternatives.sort(key=lambda x: x[1], reverse=True)

        return ClassifierResult(
            best_era,
            confidence,
            alternatives[:2],
            f"BPM {bpm}, brightness {brightness:.2f}"
        )


class ClubVsRadioClassifier:
    """Classify if track is for club or radio play."""

    @staticmethod
    def classify(bpm: float, duration_sec: float, genre: str,
                energy: float) -> ClassifierResult:
        """
        Club: typically 120-135 BPM, 6+ min, high energy, electronic genres
        Radio: 3-4 min, moderate energy, pop/commercial
        """
        club_score = 0.5
        radio_score = 0.5

        # BPM indicators
        if 115 <= bpm <= 140:
            club_score += 0.15
        elif 85 <= bpm <= 110:
            radio_score += 0.15

        # Duration
        if duration_sec > 360:  # 6+ min
            club_score += 0.2
        elif duration_sec < 240:  # < 4 min
            radio_score += 0.2

        # Genre
        club_genres = ["techno", "house", "deep house", "tech house", "dnb", "drum and bass", "trance"]
        radio_genres = ["pop", "r&b", "hip-hop", "indie", "rock"]

        if any(g in genre.lower() for g in club_genres):
            club_score += 0.2
        if any(g in genre.lower() for g in radio_genres):
            radio_score += 0.2

        # Energy
        if energy > 0.7:
            club_score += 0.1
        elif energy < 0.4:
            radio_score += 0.1

        if club_score > radio_score:
            label = ClubVsRadio.CLUB.value
            conf = club_score / (club_score + radio_score)
        elif radio_score > club_score:
            label = ClubVsRadio.RADIO.value
            conf = radio_score / (club_score + radio_score)
        else:
            label = ClubVsRadio.HYBRID.value
            conf = 0.5

        return ClassifierResult(
            label,
            min(conf, 1.0),
            [],
            f"Club: {club_score:.2f}, Radio: {radio_score:.2f}"
        )


class DJToolClassifier:
    """Classify DJ-specific tool types: intro, acapella, FX, break, etc."""

    @staticmethod
    def classify(duration_sec: float, spectral_variance: float,
                has_vocals: bool, energy_changes: float) -> ClassifierResult:
        """
        Intro: gradual buildup, low initial energy
        Acapella: vocals only, no drums/bass
        FX: high spectral variance, sound effects
        Break: sudden drop in energy, percussion-heavy
        Buildup: gradual energy increase
        Drop: sudden onset
        """
        scores = {}

        # Intro: long, gradual
        if duration_sec > 300 and energy_changes < 0.3:
            scores[DJToolType.INTRO.value] = 0.7

        # Acapella: vocals, no full mix
        if has_vocals and spectral_variance > 0.5:
            scores[DJToolType.ACAPELLA.value] = 0.8

        # FX: very high variance
        if spectral_variance > 0.7:
            scores[DJToolType.FX.value] = 0.75

        # Break: sudden energy drop
        if energy_changes > 0.6:
            scores[DJToolType.BREAK.value] = 0.7

        # Buildup: gradual energy increase
        if 0.3 < energy_changes < 0.6 and duration_sec > 120:
            scores[DJToolType.BUILDUP.value] = 0.65

        # Drop: sudden onset
        if energy_changes > 0.5 and duration_sec < 180:
            scores[DJToolType.DROP.value] = 0.7

        if not scores:
            scores[DJToolType.INTRO.value] = 0.5

        best_type = max(scores, key=scores.get)
        confidence = scores[best_type]

        return ClassifierResult(
            best_type,
            confidence,
            [(t, s) for t, s in scores.items() if t != best_type],
            f"Variance: {spectral_variance:.2f}, Changes: {energy_changes:.2f}"
        )


class CrowdReactionPredictor:
    """Predict crowd reaction: energy builder, peak time, cool down."""

    @staticmethod
    def predict(energy: float, bpm: float, danceability: float,
               mood: str = None) -> Dict[str, float]:
        """
        Predict crowd reaction probabilities.

        energy + danceability + uplifting mood → peak time
        gradual energy increase → builder
        low energy + chill mood → cool down
        """
        predictions = {
            "energy_builder": 0.0,
            "peak_time": 0.0,
            "cool_down": 0.0,
        }

        # Peak time: high energy + danceability + fast BPM
        if energy > 0.7 and danceability > 0.7 and bpm > 120:
            predictions["peak_time"] = min(0.95, 0.6 + (energy + danceability) / 4)

        # Energy builder: moderate-high energy, increasing
        elif 0.4 < energy <= 0.7 and danceability > 0.5:
            predictions["energy_builder"] = min(0.9, 0.4 + energy / 2)

        # Cool down: low energy, chill mood
        elif energy < 0.4 or (mood and mood.lower() in ["chill", "sad"]):
            predictions["cool_down"] = min(0.95, 0.6 + (0.5 - energy))

        # Normalize
        total = sum(predictions.values())
        if total > 0:
            for k in predictions:
                predictions[k] /= total
        else:
            predictions["peak_time"] = 0.33
            predictions["energy_builder"] = 0.33
            predictions["cool_down"] = 0.34

        return predictions


class SetPositionPredictor:
    """Predict best set position: opener, peak, closer."""

    @staticmethod
    def predict(energy: float, bpm: float, danceability: float,
               mood: str = None) -> Dict[str, float]:
        """
        Opener: moderate energy, build-up potential
        Peak: high energy, highly danceable, fast
        Closer: melancholic or euphoric, wind-down or crescendo
        """
        predictions = {
            "opener": 0.0,
            "peak": 0.0,
            "closer": 0.0,
        }

        # Opener: 0.4-0.6 energy, moderate BPM
        if 0.4 <= energy < 0.6 and 115 <= bpm <= 130:
            predictions["opener"] = min(0.9, 0.5 + (0.5 - abs(energy - 0.5)))

        # Peak: high energy, high danceability, fast
        if energy > 0.7 and danceability > 0.7 and bpm > 125:
            predictions["peak"] = min(0.95, 0.6 + (energy + danceability) / 4)

        # Closer: low energy + melancholic, or very high energy + euphoric
        if energy < 0.4 or (mood and mood.lower() in ["sad", "chill"]):
            predictions["closer"] = min(0.9, 0.6 + (0.5 - energy))
        elif energy > 0.8 and (mood and mood.lower() == "euphoric"):
            predictions["closer"] = 0.8

        # Normalize
        total = sum(predictions.values())
        if total > 0:
            for k in predictions:
                predictions[k] /= total
        else:
            predictions["opener"] = 0.33
            predictions["peak"] = 0.33
            predictions["closer"] = 0.34

        return predictions


class DanceabilityScoreML:
    """ML-based danceability scoring."""

    @staticmethod
    def score(bpm: float, beat_strength: float, groove_consistency: float,
             syncopation: float) -> float:
        """
        Danceability = f(BPM, beat strength, groove, syncopation)

        Optimal BPM for dancing: 120-130 BPM (but wide range accepted)
        Strong beat: 0.7+
        Consistent groove: 0.6+
        Some syncopation: 0.3-0.7
        """
        score = 0.5

        # BPM scoring: optimal around 120-130
        if 100 <= bpm <= 140:
            bpm_score = 1.0 - abs(bpm - 120) / 100
            score += bpm_score * 0.25

        # Beat strength
        score += beat_strength * 0.25

        # Groove
        score += groove_consistency * 0.25

        # Syncopation (not too much, not too little)
        if 0.2 <= syncopation <= 0.8:
            score += 0.25
        else:
            score += syncopation * 0.15

        return min(1.0, max(0.0, score))


class MoodDetector:
    """Detect mood: happy, sad, energetic, chill, dark, euphoric."""

    @staticmethod
    def detect(energy: float, spectral_centroid: float,
              mode: Optional[str] = "major") -> ClassifierResult:
        """
        Happy: major key, moderate-high energy, bright timbre
        Sad: minor key, low energy, dark timbre
        Energetic: high energy, fast BPM, bright
        Chill: low-moderate energy, warm timbre
        Dark: low brightness, dark timbre, ominous
        Euphoric: very high energy, bright, major key
        """
        scores = {}

        # Happy
        if mode == "major" and energy > 0.5 and spectral_centroid > 3000:
            scores[Mood.HAPPY.value] = 0.8

        # Sad
        if mode == "minor" and energy < 0.4 and spectral_centroid < 2000:
            scores[Mood.SAD.value] = 0.8

        # Energetic
        if energy > 0.7 and spectral_centroid > 3500:
            scores[Mood.ENERGETIC.value] = 0.8

        # Chill
        if energy < 0.5 and spectral_centroid < 3000:
            scores[Mood.CHILL.value] = 0.8

        # Dark
        if spectral_centroid < 2000 and energy < 0.6:
            scores[Mood.DARK.value] = 0.75

        # Euphoric
        if energy > 0.85 and spectral_centroid > 4000:
            scores[Mood.EUPHORIC.value] = 0.85

        if not scores:
            scores[Mood.ENERGETIC.value] = 0.5

        best_mood = max(scores, key=scores.get)
        confidence = scores[best_mood]

        return ClassifierResult(
            best_mood,
            confidence,
            [(m, s) for m, s in scores.items() if m != best_mood],
            f"Energy: {energy:.2f}, Brightness: {spectral_centroid:.0f}, Mode: {mode}"
        )


class ArousalValenceMapper:
    """Map mood to arousal-valence space (psychology model)."""

    @staticmethod
    def map_to_arousal_valence(energy: float, mood: str) -> Dict[str, float]:
        """
        Arousal: low (calm) to high (excited) - maps to energy
        Valence: negative (sad) to positive (happy) - maps to mood optimism

        Returns: {"arousal": 0-1, "valence": 0-1}
        """
        mood_valence_map = {
            Mood.HAPPY.value: 0.9,
            Mood.EUPHORIC.value: 0.95,
            Mood.ENERGETIC.value: 0.8,
            Mood.CHILL.value: 0.6,
            Mood.DARK.value: 0.2,
            Mood.SAD.value: 0.1,
        }

        arousal = energy  # 0-1
        valence = mood_valence_map.get(mood, 0.5)

        return {
            "arousal": min(1.0, max(0.0, arousal)),
            "valence": min(1.0, max(0.0, valence)),
        }
