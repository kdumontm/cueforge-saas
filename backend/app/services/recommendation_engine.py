"""
Recommendation Engine: Next track suggestions, set building, energy planning,
key journeys, mood journeys, discovery, crate building, and title parsing.

Points 901-920: Recommendations based on audio features and user history.
"""

import logging
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass
from datetime import datetime
import math
import re

logger = logging.getLogger(__name__)


@dataclass
class Track:
    """Simple track representation for recommendations."""
    id: str
    title: str
    artist: str
    bpm: float
    key: str
    energy: float
    danceability: float
    genre: str
    mood: str
    duration_sec: float
    last_played: Optional[datetime] = None
    play_count: int = 0
    artwork_url: Optional[str] = None


@dataclass
class Recommendation:
    """Recommendation result with reason."""
    track: Track
    score: float
    reason: str
    similarity_metrics: Dict[str, float] = None


@dataclass
class SetPlan:
    """Complete set plan with energy arc."""
    tracks: List[Track]
    total_duration: float
    energy_arc: List[float]
    key_journey: List[str]
    mood_journey: List[str]


class NextTrackRecommender:
    """Recommend next track based on current track features."""

    @staticmethod
    def recommend(current_track: Track, candidate_tracks: List[Track],
                 limit: int = 10) -> List[Recommendation]:
        """
        Recommend next tracks based on:
        - BPM compatibility (within 5-10 BPM)
        - Key harmonic compatibility (Camelot wheel)
        - Energy continuity (smooth or energetic transition)
        - Genre flow
        """
        recommendations = []

        for track in candidate_tracks:
            score = 0.0
            metrics = {}

            # BPM compatibility: ±10 BPM
            bpm_diff = abs((track.analysis.bpm if track.analysis else 0) - current_(track.analysis.bpm if track.analysis else 0))
            if bpm_diff <= 10:
                bpm_score = 1.0 - (bpm_diff / 10) * 0.3
                score += bpm_score * 0.25
                metrics["bpm"] = bpm_score
            else:
                metrics["bpm"] = max(0, 1.0 - bpm_diff / 50)
                score += metrics["bpm"] * 0.1

            # Key compatibility
            key_score = NextTrackRecommender._key_compatibility(
                current_(track.analysis.key if track.analysis else ''), (track.analysis.key if track.analysis else '')
            )
            score += key_score * 0.25
            metrics["key"] = key_score

            # Energy flow
            energy_diff = abs((track.analysis.energy if track.analysis else 0) - current_(track.analysis.energy if track.analysis else 0))
            if energy_diff <= 0.15:
                energy_score = 1.0 - (energy_diff / 0.15) * 0.2
            else:
                energy_score = max(0.3, 1.0 - energy_diff)
            score += energy_score * 0.25
            metrics["energy"] = energy_score

            # Genre matching
            genre_score = 0.5
            if track.genre.lower() == current_track.genre.lower():
                genre_score = 1.0
            elif _genre_distance(current_track.genre, track.genre) < 2:
                genre_score = 0.8
            score += genre_score * 0.15
            metrics["genre"] = genre_score

            # Danceability
            dance_score = 0.5 if (track.analysis.danceability if track.analysis else 0) > 0.6 else (track.analysis.danceability if track.analysis else 0)
            score += dance_score * 0.1
            metrics["danceability"] = dance_score

            recommendations.append(Recommendation(
                track,
                score,
                f"BPM {(track.analysis.bpm if track.analysis else 0):.0f}, Key {(track.analysis.key if track.analysis else '')}, Energy {(track.analysis.energy if track.analysis else 0):.2f}",
                metrics
            ))

        recommendations.sort(key=lambda r: r.score, reverse=True)
        return recommendations[:limit]

    @staticmethod
    def _key_compatibility(key1: str, key2: str) -> float:
        """
        Score key compatibility using Camelot wheel.
        Same key: 1.0
        Adjacent on wheel: 0.9
        Opposite: 0.3
        """
        if key1 == key2:
            return 1.0

        # Simplified Camelot distances
        camelot_wheel = [
            "8B", "3B", "10B", "5B", "12B", "7B", "2B", "9B", "4B", "11B", "6B", "1B",
            "8A", "3A", "10A", "5A", "12A", "7A", "2A", "9A", "4A", "11A", "6A", "1A"
        ]

        if key1 not in camelot_wheel or key2 not in camelot_wheel:
            return 0.5

        idx1 = camelot_wheel.index(key1)
        idx2 = camelot_wheel.index(key2)
        distance = min(abs(idx1 - idx2), 24 - abs(idx1 - idx2))

        if distance <= 1:
            return 0.95
        elif distance == 12:  # Opposite
            return 0.3
        else:
            return max(0.2, 1.0 - distance / 24)


class SetBuilder:
    """Automatically build a complete set."""

    @staticmethod
    def build_set(seed_track: Track, available_tracks: List[Track],
                 target_duration_min: int = 60) -> SetPlan:
        """
        Build a set with:
        - Smooth energy arc (build -> peak -> cool down)
        - Harmonic progression (Camelot wheel)
        - Genre flow
        - Target duration
        """
        set_tracks = [seed_track]
        current_track = seed_track
        total_duration = seed_track.duration_sec
        used_ids = {seed_track.id}

        # Phase 1: Build (0-20 min): increase energy gradually
        build_duration = target_duration_min * 0.33 * 60
        build_candidates = [t for t in available_tracks
                           if t.id not in used_ids
                           and (t.analysis.bpm if t.analysis else 0) >= current_(track.analysis.bpm if track.analysis else 0) - 5
                           and (t.analysis.energy if t.analysis else 0) >= current_(track.analysis.energy if track.analysis else 0) - 0.1
                           and t.duration_sec <= build_duration - total_duration]

        while build_candidates and total_duration < build_duration:
            next_track = build_candidates[0]
            set_tracks.append(next_track)
            used_ids.add(next_track.id)
            total_duration += next_track.duration_sec
            current_track = next_track

            build_candidates = [t for t in available_tracks
                               if t.id not in used_ids
                               and (t.analysis.energy if t.analysis else 0) >= current_(track.analysis.energy if track.analysis else 0) - 0.05]

        # Phase 2: Peak (20-45 min): maintain high energy
        peak_duration = target_duration_min * 0.33 * 60
        peak_candidates = [t for t in available_tracks
                          if t.id not in used_ids
                          and (t.analysis.energy if t.analysis else 0) >= 0.7
                          and t.danceability >= 0.7]

        while peak_candidates and total_duration < build_duration + peak_duration:
            next_track = peak_candidates[0]
            set_tracks.append(next_track)
            used_ids.add(next_track.id)
            total_duration += next_track.duration_sec
            current_track = next_track
            peak_candidates.pop(0)

        # Phase 3: Cool down (45-60 min): decrease energy
        remaining_candidates = [t for t in available_tracks
                               if t.id not in used_ids
                               and total_duration + t.duration_sec <= target_duration_min * 60]

        while remaining_candidates and len(set_tracks) < 15:
            next_track = remaining_candidates[0]
            set_tracks.append(next_track)
            used_ids.add(next_track.id)
            total_duration += next_track.duration_sec
            remaining_candidates.pop(0)

        # Build energy and mood arcs
        energy_arc = [(t.analysis.energy if t.analysis else 0) for t in set_tracks]
        key_journey = [t.key for t in set_tracks]
        mood_journey = [t.mood for t in set_tracks]

        return SetPlan(
            set_tracks,
            total_duration,
            energy_arc,
            key_journey,
            mood_journey
        )


class GenreFlowSuggestor:
    """Suggest genre flow: deep house → tech house → techno."""

    @staticmethod
    def suggest_flow(start_genre: str, available_genres: List[str],
                    length: int = 5) -> List[str]:
        """
        Suggest a smooth genre progression.

        Flow graph: deep house → tech house → house → techno → minimal
        """
        flow_graph = {
            "deep house": ["tech house", "house", "deep tech"],
            "tech house": ["house", "techno", "deep house"],
            "house": ["tech house", "techno", "disco"],
            "techno": ["minimal", "industrial", "tech house"],
            "minimal": ["techno", "ambient"],
            "drum and bass": ["liquid funk", "dnb", "neurofunk"],
            "trance": ["progressive trance", "house", "tech trance"],
        }

        flow = [start_genre]
        current = start_genre

        for _ in range(length - 1):
            neighbors = flow_graph.get(current.lower(), [])
            next_genre = None

            for neighbor in neighbors:
                if neighbor in available_genres and neighbor not in flow:
                    next_genre = neighbor
                    break

            if not next_genre and available_genres:
                next_genre = available_genres[0]

            if next_genre:
                flow.append(next_genre)
                current = next_genre
            else:
                break

        return flow


class EnergyArcPlanner:
    """Plan energy arc for a set."""

    @staticmethod
    def plan_arc(duration_min: int = 60, shape: str = "mountain") -> List[float]:
        """
        Plan energy arc.

        Shapes:
        - mountain: 0 → 1 → 0 (build → peak → cool down)
        - plateau: 0 → 0.5 → 1 → 1 → 0 (intro → maintain → peak → cool down)
        - waves: oscillate between 0.5-1 (multiple peaks)
        """
        steps = max(5, duration_min // 5)
        arc = []

        if shape == "mountain":
            # Build to peak at 2/3, then cool down
            peak_idx = int(steps * 0.66)
            for i in range(steps):
                if i <= peak_idx:
                    arc.append(i / peak_idx)
                else:
                    arc.append(1.0 - (i - peak_idx) / (steps - peak_idx))

        elif shape == "plateau":
            # Intro, maintain, peak, cool
            intro_end = int(steps * 0.2)
            maintain_end = int(steps * 0.6)
            peak_end = int(steps * 0.8)

            for i in range(steps):
                if i < intro_end:
                    arc.append(0.3 + 0.2 * (i / intro_end))
                elif i < maintain_end:
                    arc.append(0.5)
                elif i < peak_end:
                    arc.append(0.5 + 0.5 * (i - maintain_end) / (peak_end - maintain_end))
                else:
                    arc.append(1.0 - 0.5 * (i - peak_end) / (steps - peak_end))

        elif shape == "waves":
            # Multiple peaks
            for i in range(steps):
                wave = 0.5 + 0.4 * math.sin(2 * math.pi * i / (steps / 3))
                arc.append(max(0.3, min(1.0, wave)))

        return [min(1.0, max(0.0, v)) for v in arc]


class KeyJourneyPlanner:
    """Plan harmonic key progression using Camelot wheel."""

    @staticmethod
    def plan_journey(start_key: str, length: int = 5) -> List[str]:
        """
        Plan optimal key journey on Camelot wheel.
        Move along the wheel to create harmonic tension and release.
        """
        camelot_wheel = [
            "8B", "3B", "10B", "5B", "12B", "7B", "2B", "9B", "4B", "11B", "6B", "1B",
            "8A", "3A", "10A", "5A", "12A", "7A", "2A", "9A", "4A", "11A", "6A", "1A"
        ]

        if start_key not in camelot_wheel:
            return [start_key] * length

        journey = [start_key]
        current_idx = camelot_wheel.index(start_key)

        for _ in range(length - 1):
            # Move +1 or +5 positions on wheel (harmonic moves)
            move = 1 if len(journey) % 2 == 0 else 5
            current_idx = (current_idx + move) % len(camelot_wheel)
            journey.append(camelot_wheel[current_idx])

        return journey


class MoodJourneyPlanner:
    """Plan mood progression through a set."""

    @staticmethod
    def plan_journey(start_mood: str, length: int = 5) -> List[str]:
        """
        Plan mood progression: happy → euphoric → energetic → chill → happy
        """
        mood_transitions = {
            "happy": ["euphoric", "energetic"],
            "euphoric": ["energetic", "chill"],
            "energetic": ["chill", "dark"],
            "chill": ["happy", "sad"],
            "dark": ["sad", "energetic"],
            "sad": ["chill", "happy"],
        }

        journey = [start_mood]
        current = start_mood

        for _ in range(length - 1):
            options = mood_transitions.get(current, ["happy"])
            next_mood = options[0]  # Simple: always take first option
            journey.append(next_mood)
            current = next_mood

        return journey


class SimilarTrackFinder:
    """Find similar tracks using Euclidean distance in feature space."""

    @staticmethod
    def find_similar(query_track: Track, candidate_tracks: List[Track],
                    limit: int = 10,
                    weights: Dict[str, float] = None) -> List[Recommendation]:
        """
        Find similar tracks using Euclidean distance.

        Features: BPM, energy, danceability, mood (encoded)
        Weights: relative importance of each feature
        """
        if weights is None:
            weights = {
                "bpm": 0.25,
                "energy": 0.25,
                "danceability": 0.2,
                "genre": 0.2,
                "key": 0.1,
            }

        recommendations = []

        for track in candidate_tracks:
            if track.id == query_track.id:
                continue

            # Normalize BPM (scale to 0-1)
            bpm_dist = abs((track.analysis.bpm if track.analysis else 0) - query_(track.analysis.bpm if track.analysis else 0)) / 200
            energy_dist = abs((track.analysis.energy if track.analysis else 0) - query_(track.analysis.energy if track.analysis else 0))
            dance_dist = abs((track.analysis.danceability if track.analysis else 0) - query_(track.analysis.danceability if track.analysis else 0))

            # Genre distance (0 if same, 1 if very different)
            genre_dist = 0 if track.genre == query_track.genre else 1

            # Key distance (using Camelot wheel)
            key_dist = SimilarTrackFinder._key_distance(query_(track.analysis.key if track.analysis else ''), (track.analysis.key if track.analysis else ''))

            # Euclidean distance
            distance = math.sqrt(
                (bpm_dist * weights["bpm"]) ** 2 +
                (energy_dist * weights["energy"]) ** 2 +
                (dance_dist * weights["danceability"]) ** 2 +
                (genre_dist * weights["genre"]) ** 2 +
                (key_dist * weights["key"]) ** 2
            )

            score = 1.0 / (1.0 + distance)  # Convert distance to similarity

            recommendations.append(Recommendation(
                track,
                score,
                f"Similar: BPM {(track.analysis.bpm if track.analysis else 0):.0f}, Energy {(track.analysis.energy if track.analysis else 0):.2f}, Key {(track.analysis.key if track.analysis else '')}",
                {
                    "bpm_dist": bpm_dist,
                    "energy_dist": energy_dist,
                    "dance_dist": dance_dist,
                    "genre_dist": genre_dist,
                    "key_dist": key_dist,
                }
            ))

        recommendations.sort(key=lambda r: r.score, reverse=True)
        return recommendations[:limit]

    @staticmethod
    def _key_distance(key1: str, key2: str) -> float:
        """Distance between two keys on Camelot wheel (0-1)."""
        camelot_wheel = [
            "8B", "3B", "10B", "5B", "12B", "7B", "2B", "9B", "4B", "11B", "6B", "1B",
            "8A", "3A", "10A", "5A", "12A", "7A", "2A", "9A", "4A", "11A", "6A", "1A"
        ]

        if key1 not in camelot_wheel or key2 not in camelot_wheel:
            return 0.5

        idx1 = camelot_wheel.index(key1)
        idx2 = camelot_wheel.index(key2)
        distance = min(abs(idx1 - idx2), 24 - abs(idx1 - idx2))

        return distance / 12  # Normalize to 0-1


class DiscoveryMode:
    """Recommend tracks user has never or rarely played."""

    @staticmethod
    def get_discovery_tracks(available_tracks: List[Track],
                            user_history: List[str],
                            limit: int = 10) -> List[Track]:
        """
        Filter tracks:
        1. Never played
        2. Rarely played (< 2 times)
        3. Not played in last 3 months
        """
        candidate_tracks = []

        for track in available_tracks:
            if track.id in user_history:
                if track.play_count < 2:
                    candidate_tracks.append((track, "rarely_played"))
                elif track.last_played and (datetime.now() - track.last_played).days > 90:
                    candidate_tracks.append((track, "not_recent"))
            else:
                candidate_tracks.append((track, "never_played"))

        # Sort by discovery potential (never > rarely > not recent)
        priority = {"never_played": 0, "rarely_played": 1, "not_recent": 2}
        candidate_tracks.sort(key=lambda x: (priority.get(x[1], 3), x[0].play_count))

        return [t[0] for t in candidate_tracks[:limit]]


class CrateBuilder:
    """Automatically build thematic crates."""

    @staticmethod
    def build_crate(theme: str, available_tracks: List[Track],
                   size: int = 20) -> List[Track]:
        """
        Build crate by theme:
        - Genre crate (all tracks of genre)
        - Mood crate (all uplifting tracks)
        - Era crate (all 2000s tracks)
        - Energy crate (all high-energy tracks)
        """
        filtered = []

        if theme.startswith("genre:"):
            genre = theme.replace("genre:", "").lower()
            filtered = [t for t in available_tracks if t.genre.lower() == genre]

        elif theme.startswith("mood:"):
            mood = theme.replace("mood:", "").lower()
            filtered = [t for t in available_tracks if t.mood.lower() == mood]

        elif theme.startswith("energy:"):
            energy_level = theme.replace("energy:", "").lower()
            if energy_level == "high":
                filtered = [t for t in available_tracks if (t.analysis.energy if t.analysis else 0) >= 0.7]
            elif energy_level == "medium":
                filtered = [t for t in available_tracks if 0.4 <= (t.analysis.energy if t.analysis else 0) < 0.7]
            elif energy_level == "low":
                filtered = [t for t in available_tracks if (t.analysis.energy if t.analysis else 0) < 0.4]

        elif theme.startswith("bpm:"):
            bpm_range = theme.replace("bpm:", "").lower()
            if bpm_range == "slow":
                filtered = [t for t in available_tracks if (t.analysis.bpm if t.analysis else 0) < 100]
            elif bpm_range == "medium":
                filtered = [t for t in available_tracks if 100 <= (t.analysis.bpm if t.analysis else 0) < 130]
            elif bpm_range == "fast":
                filtered = [t for t in available_tracks if (t.analysis.bpm if t.analysis else 0) >= 130]

        else:
            # Default: genre search
            filtered = [t for t in available_tracks if theme.lower() in t.genre.lower()]

        return filtered[:size]


class TitleParser:
    """Parse track title to extract artist, featuring, remix, version."""

    @staticmethod
    def parse(title: str) -> Dict[str, str]:
        """
        Parse title like:
        "Artist - Title (Remix) [Version]"
        "Artist feat. Other - Title"

        Returns: {
            "title": "Title",
            "artist": "Artist",
            "featuring": ["Other"],
            "remix_artist": "Remix Artist" or None,
            "version": "Version" or None,
        }
        """
        result = {
            "title": title,
            "artist": "",
            "featuring": [],
            "remix_artist": None,
            "version": None,
        }

        # Extract version [Version], (Version), or Version suffix
        version_match = re.search(r'\[([^\]]+)\]|\(([^\)]+?)\s+(?:Remix|Version|Mix|Edit)\)|(\w+\s+Remix|Mix|Edit|Version)$', title)
        if version_match:
            result["version"] = version_match.group(1) or version_match.group(2) or version_match.group(3)
            title = re.sub(r'\[[^\]]+\]|\(([^\)]+?)\s+(?:Remix|Version|Mix|Edit)\)', '', title)

        # Extract remix artist
        remix_match = re.search(r'\(([^)]+?)\s+Remix\)', title)
        if remix_match:
            result["remix_artist"] = remix_match.group(1)
            title = re.sub(r'\([^)]+?\s+Remix\)', '', title)

        # Extract featuring
        feat_match = re.findall(r'feat\.?\s+([^,\-\(\)]+)', title)
        if feat_match:
            result["featuring"] = [f.strip() for f in feat_match]
            title = re.sub(r'feat\.?\s+[^,\-\(\)]+', '', title)

        # Split artist and title on " - "
        if " - " in title:
            parts = title.split(" - ", 1)
            result["artist"] = parts[0].strip()
            result["title"] = parts[1].strip()
        else:
            result["title"] = title.strip()

        return result


class RemixArtistExtractor:
    """Extract remix artist from title."""

    @staticmethod
    def extract(title: str) -> Optional[str]:
        """
        Extract remix artist from patterns like:
        "Title (Artist Remix)"
        "Title [Artist Remix]"
        "Title - Artist Remix"
        """
        patterns = [
            r'\(([^)]+?)\s+(?:Remix|Mix|Edit|Rework)\)',
            r'\[([^\]]+?)\s+(?:Remix|Mix|Edit|Rework)\]',
            r'-\s+([^\-]+?)\s+(?:Remix|Mix|Edit|Rework)',
        ]

        for pattern in patterns:
            match = re.search(pattern, title)
            if match:
                return match.group(1).strip()

        return None


# Helper functions
def _genre_distance(genre1: str, genre2: str) -> int:
    """Simple genre distance heuristic."""
    if genre1 == genre2:
        return 0

    similar_pairs = [
        ("deep house", "tech house"),
        ("techno", "minimal"),
        ("house", "tech house"),
        ("drum and bass", "liquid funk"),
    ]

    for g1, g2 in similar_pairs:
        if (genre1.lower() == g1 and genre2.lower() == g2) or \
           (genre1.lower() == g2 and genre2.lower() == g1):
            return 1

    return 2
