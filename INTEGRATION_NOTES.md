# TrackCue ML & Recommendation Services Integration Guide

## Overview

Four new services have been created (points 881-950):

1. **ml_learning.py** - ML learning, feedback collection, A/B testing
2. **ml_classifiers.py** - Audio classification (vocal style, era, mood, etc)
3. **recommendation_engine.py** - Track recommendations, set building, discovery
4. **artwork_service.py** - Color extraction, style classification, CDN optimization

## Quick Start Examples

### ML Learning - Track Corrections

```python
from app.services.ml_learning import (
    get_correction_learning, get_user_preferences, CorrectionType
)

# Store a DJ's BPM correction
learning = get_correction_learning()
learning.add_correction(
    track_id="spotify:abc123",
    correction_type=CorrectionType.BPM,
    original_value=120.0,
    corrected_value=122.5,
    user_id="user123"
)

# Get user's preferences
user_prefs = get_user_preferences("user123")
user_prefs.record_cue_placement("on_drops")
user_prefs.record_genre_interaction("tech house", action="play")
```

### ML Classifiers - Audio Analysis

```python
from app.services.ml_classifiers import (
    VocalStyleClassifier, MoodDetector, DanceabilityScoreML
)

# Classify vocal style
vocal = VocalStyleClassifier.classify(
    spectral_centroid=4200.0,
    zero_crossing_rate=0.14,
    spectral_rolloff=0.75,
    mfcc_mean=30.0
)
print(f"Vocal: {vocal.label} ({vocal.confidence:.2f})")

# Detect mood
mood = MoodDetector.detect(
    energy=0.75,
    spectral_centroid=3500.0,
    mode="major"
)
print(f"Mood: {mood.label} ({mood.confidence:.2f})")

# Calculate danceability
danceability = DanceabilityScoreML.score(
    bpm=125.0,
    beat_strength=0.85,
    groove_consistency=0.80,
    syncopation=0.45
)
print(f"Danceability: {danceability:.2f}")
```

### Recommendations - Next Track, Set Building

```python
from app.services.recommendation_engine import (
    Track, NextTrackRecommender, SetBuilder, TitleParser
)

# Create track objects
current_track = Track(
    id="track1",
    title="Get Lucky",
    artist="Daft Punk",
    bpm=126.0,
    key="8A",
    energy=0.85,
    danceability=0.90,
    genre="house",
    mood="euphoric",
    duration_sec=344
)

candidates = [
    Track("track2", "Lucky", "Artist2", 128.0, "8B", 0.82, 0.88, "tech house", "happy", 360),
    Track("track3", "Another", "Artist3", 122.0, "10A", 0.70, 0.75, "deep house", "chill", 400),
]

# Get next track recommendations
recommender = NextTrackRecommender()
recommendations = recommender.recommend(current_track, candidates, limit=5)
for rec in recommendations:
    print(f"{rec.track.title}: {rec.score:.2f} ({rec.reason})")

# Build a complete set
builder = SetBuilder()
set_plan = builder.build_set(current_track, candidates, target_duration_min=60)
print(f"Built set: {len(set_plan.tracks)} tracks, {set_plan.total_duration/60:.1f} min")

# Parse track title
parser = TitleParser()
parsed = parser.parse("Daft Punk feat. Pharrell - Get Lucky (Mark Ronson Remix)")
print(f"Parsed: {parsed['artist']} - {parsed['title']}, remix by {parsed['remix_artist']}")
```

### Artwork - Color Extraction & Optimization

```python
from app.services.artwork_service import (
    ArtworkColorExtractor, ArtworkStyleClassifier, Color
)

# Extract color palette (with image data)
palette = ArtworkColorExtractor.extract_palette(image_data, palette_size=4)
print(f"Primary color: {palette.primary.to_hex()}")
print(f"Suggested background: {palette.background_suggestion.to_hex()}")

# Classify style
style = ArtworkStyleClassifier.classify(image_data)
print(f"Style: {style['style']} ({style['confidence']:.2f})")

# Optimize for display context
from app.services.artwork_service import ArtworkBackgroundColorOptimizer
bg = ArtworkBackgroundColorOptimizer.get_optimal_background(
    palette.primary, design_context="player"
)
print(f"Player background: {bg['background']}, text: {bg['text_color']}")
```

## Architecture

### ml_learning.py (~450 lines)
- **CorrectionLearning**: Store & learn from DJ corrections
- **UserPreferenceModel**: Track individual DJ preferences
- **FeedbackCollector**: Collect quality ratings on analysis
- **ABTestingFramework**: A/B test pipeline versions
- **ModelVersion**: Version control for pipeline configs
- **OnlineLearner**: Incremental model updates

### ml_classifiers.py (~510 lines)
- **VocalStyleClassifier**: rap, singing, spoken, fx, instrumental
- **ProductionEraClassifier**: 1980s-2020s classification
- **ClubVsRadioClassifier**: Venue suitability
- **DJToolClassifier**: intro, acapella, fx, break, buildup, drop
- **CrowdReactionPredictor**: energy builder, peak, cool down
- **SetPositionPredictor**: opener, peak, closer suggestions
- **DanceabilityScoreML**: ML-based danceability (0-1)
- **MoodDetector**: happy, sad, energetic, chill, dark, euphoric
- **ArousalValenceMapper**: Psychological arousal-valence space

### recommendation_engine.py (~650 lines)
- **NextTrackRecommender**: BPM/key/energy/genre compatible tracks
- **SetBuilder**: Automated set construction with energy arc
- **GenreFlowSuggestor**: Genre progression suggestions
- **EnergyArcPlanner**: Energy journey shapes (mountain, plateau, waves)
- **KeyJourneyPlanner**: Harmonic progression on Camelot wheel
- **MoodJourneyPlanner**: Mood transitions through set
- **SimilarTrackFinder**: Euclidean distance in feature space
- **DiscoveryMode**: Find never/rarely played tracks
- **CrateBuilder**: Auto-build themed crates
- **TitleParser**: Extract artist, remix, features from title
- **RemixArtistExtractor**: Extract remix artist from title

### artwork_service.py (~465 lines)
- **ArtworkColorExtractor**: Dominant color palette (4 colors)
- **ArtworkStyleClassifier**: minimalist, photo, abstract
- **ArtworkBackgroundColorOptimizer**: Context-aware colors
- **ArtworkCDNOptimizer**: Format/sizing suggestions (WebP, AVIF)
- **ArtworkBlurHashGenerator**: Progressive image loading
- **ArtworkService**: Orchestrate all artwork processing

## Integration Points

### In FastAPI routers (backend/app/routers/)

```python
from app.services.ml_learning import get_feedback_collector
from app.services.ml_classifiers import MoodDetector
from app.services.recommendation_engine import NextTrackRecommender

@router.post("/tracks/{track_id}/feedback")
async def submit_feedback(track_id: str, user_id: str, quality: str):
    collector = get_feedback_collector()
    feedback = collector.submit_feedback(
        track_id, user_id, quality_rating=quality
    )
    return feedback

@router.get("/tracks/{track_id}/recommendations")
async def get_recommendations(track_id: str, limit: int = 10):
    current = await db.get_track(track_id)
    candidates = await db.get_all_tracks()
    
    recommender = NextTrackRecommender()
    recs = recommender.recommend(current, candidates, limit=limit)
    return [{"track": r.track.id, "score": r.score} for r in recs]
```

## Testing

All services are syntactically valid and functionally tested:

```bash
# Validate syntax
python3 -m py_compile backend/app/services/ml_*.py
python3 -m py_compile backend/app/services/recommendation_engine.py
python3 -m py_compile backend/app/services/artwork_service.py

# Run basic functionality tests
python3 tests/ml_services_test.py
```

## Performance Notes

- **ml_learning**: In-memory (in production, use Redis or database)
- **ml_classifiers**: No external dependencies (pure computation)
- **recommendation_engine**: O(n) for set building, O(n) for recommendations
- **artwork_service**: Uses PIL stubs (integrate actual image processing)

## Future Enhancements

1. Integrate with actual image processing (PIL/Pillow)
2. Add scikit-learn classifiers for production-grade ML
3. Connect to PostgreSQL for persistent model state
4. Add Redis caching for expensive operations
5. Implement streaming/online updates from correction feedback
6. Add A/B test statistical significance testing

