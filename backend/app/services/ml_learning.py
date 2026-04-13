"""
ML Learning Service: Correction learning, user preferences, feedback collection,
A/B testing, model versioning, and online learning.

Points 881-900: Store DJ corrections and learn user preferences.
"""

import json
import logging
from typing import Optional, Dict, List, Any
from datetime import datetime, timedelta
from enum import Enum
import hashlib

logger = logging.getLogger(__name__)


class FeedbackType(str, Enum):
    """Types of feedback DJ can provide."""
    CORRECT = "correct"
    INCORRECT = "incorrect"
    PARTIAL = "partial"
    BETTER_ALTERNATIVE = "better_alternative"


class AnalysisQuality(str, Enum):
    """Quality ratings for analysis results."""
    EXCELLENT = "excellent"
    GOOD = "good"
    FAIR = "fair"
    POOR = "poor"


class CorrectionType(str, Enum):
    """Types of corrections DJs can make."""
    BPM = "bpm"
    KEY = "key"
    GENRE = "genre"
    CUE = "cue"
    ENERGY = "energy"
    MOOD = "mood"
    VOCAL_STYLE = "vocal_style"
    PRODUCTION_ERA = "production_era"


class ModelVersion:
    """Model version control: track pipeline configuration and performance."""

    def __init__(self, version_id: str, pipeline_config: Dict[str, Any],
                 created_at: datetime = None):
        self.version_id = version_id
        self.pipeline_config = pipeline_config
        self.created_at = created_at or datetime.utcnow()
        self.accuracy_metrics = {}
        self.correction_count = 0
        self.is_active = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "version_id": self.version_id,
            "pipeline_config": self.pipeline_config,
            "created_at": self.created_at.isoformat(),
            "accuracy_metrics": self.accuracy_metrics,
            "correction_count": self.correction_count,
            "is_active": self.is_active
        }


class CorrectionLearning:
    """Track BPM/cue/key/genre corrections and learn from them."""

    def __init__(self):
        self.corrections: Dict[str, List[Dict[str, Any]]] = {
            CorrectionType.BPM.value: [],
            CorrectionType.KEY.value: [],
            CorrectionType.GENRE.value: [],
            CorrectionType.CUE.value: [],
            CorrectionType.ENERGY.value: [],
            CorrectionType.MOOD.value: [],
        }
        self.correction_stats = {}

    def add_correction(self, track_id: str, correction_type: CorrectionType,
                      original_value: Any, corrected_value: Any,
                      user_id: str = None, confidence: float = 0.0) -> Dict[str, Any]:
        """Store a correction from a DJ."""
        correction = {
            "track_id": track_id,
            "type": correction_type.value,
            "original": original_value,
            "corrected": corrected_value,
            "user_id": user_id,
            "confidence": confidence,
            "timestamp": datetime.utcnow().isoformat(),
        }

        self.corrections[correction_type.value].append(correction)

        # Update stats
        key = f"{correction_type.value}_{original_value}_{corrected_value}"
        if key not in self.correction_stats:
            self.correction_stats[key] = {"count": 0, "users": set()}
        self.correction_stats[key]["count"] += 1
        if user_id:
            self.correction_stats[key]["users"].add(user_id)

        logger.info(f"Correction stored: {correction_type.value} on track {track_id}")
        return correction

    def get_common_corrections(self, correction_type: CorrectionType,
                              limit: int = 10) -> List[Dict[str, Any]]:
        """Get most common corrections for a type."""
        prefix = f"{correction_type.value}_"
        stats = [
            (k, v) for k, v in self.correction_stats.items()
            if k.startswith(prefix)
        ]
        stats.sort(key=lambda x: x[1]["count"], reverse=True)

        results = []
        for key, stat in stats[:limit]:
            parts = key.split("_", 3)
            results.append({
                "type": correction_type.value,
                "original": parts[1] if len(parts) > 1 else None,
                "corrected": parts[2] if len(parts) > 2 else None,
                "frequency": stat["count"],
                "unique_users": len(stat["users"])
            })
        return results

    def get_correction_confidence(self, original_value: Any) -> float:
        """Estimate confidence in original analysis based on correction history."""
        if not self.corrections[CorrectionType.BPM.value]:
            return 0.5

        bpm_corrections = self.corrections[CorrectionType.BPM.value]
        total = len(bpm_corrections)
        if total == 0:
            return 0.5

        # Simple heuristic: if many corrections, lower confidence
        return max(0.1, 1.0 - (total / 1000))


class UserPreferenceModel:
    """Model user preferences: where they place cues, genre preferences, etc."""

    def __init__(self, user_id: str):
        self.user_id = user_id
        self.cue_preferences = {
            "on_drops": 0,
            "on_breaks": 0,
            "on_builds": 0,
            "custom_positions": 0,
        }
        self.genre_preferences = {}
        self.edit_patterns = []
        self.session_count = 0
        self.last_updated = datetime.utcnow()

    def record_cue_placement(self, position_type: str) -> None:
        """Record where user places cues."""
        if position_type in self.cue_preferences:
            self.cue_preferences[position_type] += 1
        self.last_updated = datetime.utcnow()

    def record_genre_interaction(self, genre: str, action: str = "play") -> None:
        """Record user interaction with genres."""
        if genre not in self.genre_preferences:
            self.genre_preferences[genre] = {"plays": 0, "edits": 0, "skips": 0}

        if action == "play":
            self.genre_preferences[genre]["plays"] += 1
        elif action == "edit":
            self.genre_preferences[genre]["edits"] += 1
        elif action == "skip":
            self.genre_preferences[genre]["skips"] += 1

    def get_preferred_genres(self, limit: int = 5) -> List[str]:
        """Get user's top genres by interaction."""
        if not self.genre_preferences:
            return []

        genres = []
        for genre, stats in self.genre_preferences.items():
            # Score = plays + 2*edits (edits show more engagement)
            score = stats["plays"] + stats["edits"] * 2
            genres.append((genre, score))

        genres.sort(key=lambda x: x[1], reverse=True)
        return [g[0] for g in genres[:limit]]

    def get_preferred_cue_position(self) -> str:
        """Get user's most common cue position."""
        max_type = max(self.cue_preferences,
                      key=self.cue_preferences.get)
        return max_type if self.cue_preferences[max_type] > 0 else "on_drops"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "user_id": self.user_id,
            "cue_preferences": self.cue_preferences,
            "genre_preferences": self.genre_preferences,
            "session_count": self.session_count,
            "last_updated": self.last_updated.isoformat()
        }


class FeedbackCollector:
    """Collect and aggregate DJ feedback on analysis quality."""

    def __init__(self):
        self.feedback_history: List[Dict[str, Any]] = []
        self.quality_scores: Dict[str, List[float]] = {
            "bpm": [],
            "key": [],
            "genre": [],
            "cues": [],
            "energy": [],
            "mood": [],
        }

    def submit_feedback(self, track_id: str, user_id: str,
                       quality_rating: AnalysisQuality,
                       feedback_text: str = None) -> Dict[str, Any]:
        """Submit quality feedback on analysis."""
        feedback = {
            "track_id": track_id,
            "user_id": user_id,
            "quality_rating": quality_rating.value,
            "feedback_text": feedback_text,
            "timestamp": datetime.utcnow().isoformat(),
        }
        self.feedback_history.append(feedback)

        # Map rating to numeric score
        rating_map = {
            AnalysisQuality.EXCELLENT.value: 1.0,
            AnalysisQuality.GOOD.value: 0.75,
            AnalysisQuality.FAIR.value: 0.5,
            AnalysisQuality.POOR.value: 0.25,
        }
        score = rating_map.get(quality_rating.value, 0.5)

        # Distribute score across all fields for now (refined later)
        for field in self.quality_scores:
            self.quality_scores[field].append(score)

        logger.info(f"Feedback submitted for track {track_id}: {quality_rating.value}")
        return feedback

    def submit_field_feedback(self, track_id: str, user_id: str,
                             field: str, rating: AnalysisQuality) -> None:
        """Submit feedback on a specific field (BPM, key, etc)."""
        if field in self.quality_scores:
            rating_map = {
                AnalysisQuality.EXCELLENT.value: 1.0,
                AnalysisQuality.GOOD.value: 0.75,
                AnalysisQuality.FAIR.value: 0.5,
                AnalysisQuality.POOR.value: 0.25,
            }
            score = rating_map.get(rating.value, 0.5)
            self.quality_scores[field].append(score)

    def get_field_quality_score(self, field: str) -> float:
        """Get average quality score for a field."""
        if field not in self.quality_scores or not self.quality_scores[field]:
            return 0.5

        scores = self.quality_scores[field]
        return sum(scores) / len(scores)

    def get_overall_quality(self) -> float:
        """Get overall analysis quality based on all feedback."""
        all_scores = []
        for scores in self.quality_scores.values():
            all_scores.extend(scores)

        if not all_scores:
            return 0.5
        return sum(all_scores) / len(all_scores)


class ABTestingFramework:
    """A/B testing framework for pipeline versions."""

    def __init__(self):
        self.tests: Dict[str, Dict[str, Any]] = {}
        self.variants: Dict[str, Dict[str, Any]] = {}

    def create_test(self, test_id: str, control_version: str,
                   treatment_version: str, split: float = 0.5) -> Dict[str, Any]:
        """Create an A/B test between two pipeline versions."""
        test = {
            "test_id": test_id,
            "control": control_version,
            "treatment": treatment_version,
            "split": split,
            "created_at": datetime.utcnow().isoformat(),
            "results": {"control": [], "treatment": []},
            "is_active": True,
        }
        self.tests[test_id] = test
        logger.info(f"A/B test created: {test_id}")
        return test

    def get_variant_for_user(self, test_id: str, user_id: str) -> str:
        """Deterministically assign user to control or treatment."""
        if test_id not in self.tests:
            return None

        # Hash user_id to get consistent assignment
        hash_val = int(hashlib.md5(f"{test_id}_{user_id}".encode()).hexdigest(), 16)
        test = self.tests[test_id]

        if (hash_val % 100) / 100 < test["split"]:
            return "control"
        return "treatment"

    def record_result(self, test_id: str, variant: str,
                     metric_value: float) -> None:
        """Record metric for a variant."""
        if test_id in self.tests:
            self.tests[test_id]["results"][variant].append(metric_value)

    def get_test_results(self, test_id: str) -> Dict[str, Any]:
        """Get results for a test."""
        if test_id not in self.tests:
            return {}

        test = self.tests[test_id]
        control_scores = test["results"]["control"]
        treatment_scores = test["results"]["treatment"]

        return {
            "test_id": test_id,
            "control_mean": sum(control_scores) / len(control_scores) if control_scores else 0,
            "treatment_mean": sum(treatment_scores) / len(treatment_scores) if treatment_scores else 0,
            "control_count": len(control_scores),
            "treatment_count": len(treatment_scores),
        }


class OnlineLearner:
    """Online learning: incrementally update model with corrections."""

    def __init__(self, learning_rate: float = 0.01):
        self.learning_rate = learning_rate
        self.model_state = {}
        self.update_count = 0

    def update_from_correction(self, correction_type: str,
                              original_value: float,
                              corrected_value: float) -> None:
        """Update model based on a single correction."""
        key = f"correction_{correction_type}"

        if key not in self.model_state:
            self.model_state[key] = {
                "sum_error": 0.0,
                "count": 0,
                "mean_error": 0.0,
            }

        # Calculate error
        error = corrected_value - original_value
        state = self.model_state[key]

        # Online mean update
        state["sum_error"] += error
        state["count"] += 1
        state["mean_error"] = state["sum_error"] / state["count"]

        self.update_count += 1

    def get_correction_factor(self, correction_type: str) -> float:
        """Get bias correction factor for a field."""
        key = f"correction_{correction_type}"
        if key not in self.model_state:
            return 0.0
        return self.model_state[key]["mean_error"]

    def get_model_state(self) -> Dict[str, Any]:
        """Export current model state."""
        return {
            "model_state": self.model_state,
            "update_count": self.update_count,
            "learning_rate": self.learning_rate,
        }


# ────────────────────────────────────────────────────────────────
# Singleton instance (in production, use database or cache)
# ────────────────────────────────────────────────────────────────

_correction_learning = CorrectionLearning()
_feedback_collector = FeedbackCollector()
_ab_testing = ABTestingFramework()
_online_learner = OnlineLearner()
_model_versions: Dict[str, ModelVersion] = {}
_user_preferences: Dict[str, UserPreferenceModel] = {}


def get_correction_learning() -> CorrectionLearning:
    """Get singleton correction learning instance."""
    return _correction_learning


def get_feedback_collector() -> FeedbackCollector:
    """Get singleton feedback collector."""
    return _feedback_collector


def get_ab_testing() -> ABTestingFramework:
    """Get singleton A/B testing framework."""
    return _ab_testing


def get_online_learner() -> OnlineLearner:
    """Get singleton online learner."""
    return _online_learner


def get_user_preferences(user_id: str) -> UserPreferenceModel:
    """Get or create user preference model."""
    if user_id not in _user_preferences:
        _user_preferences[user_id] = UserPreferenceModel(user_id)
    return _user_preferences[user_id]


def register_model_version(version_id: str,
                          pipeline_config: Dict[str, Any]) -> ModelVersion:
    """Register a new model version."""
    version = ModelVersion(version_id, pipeline_config)
    _model_versions[version_id] = version
    logger.info(f"Model version registered: {version_id}")
    return version


def get_model_version(version_id: str) -> Optional[ModelVersion]:
    """Get a specific model version."""
    return _model_versions.get(version_id)


def list_model_versions() -> List[Dict[str, Any]]:
    """List all model versions."""
    return [v.to_dict() for v in _model_versions.values()]
