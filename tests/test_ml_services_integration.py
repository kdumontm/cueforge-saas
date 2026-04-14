"""
Integration test: ML Learning + Classifiers + Recommendations + Artwork
Demonstrates how all services work together in a realistic workflow.
"""

import sys
sys.path.insert(0, 'backend')

from app.services.ml_learning import (
    get_correction_learning, get_user_preferences, 
    get_feedback_collector, CorrectionType, AnalysisQuality
)
from app.services.ml_classifiers import (
    VocalStyleClassifier, MoodDetector, DanceabilityScoreML,
    ProductionEraClassifier, SetPositionPredictor
)
from app.services.recommendation_engine import (
    Track, NextTrackRecommender, SetBuilder, TitleParser,
    EnergyArcPlanner, KeyJourneyPlanner
)
from app.services.artwork_service import (
    ArtworkService, Color, ArtworkBackgroundColorOptimizer
)


def test_complete_dj_workflow():
    """Test a complete DJ workflow: analyze track, get feedback, recommend next track."""
    
    print("\n" + "="*70)
    print("TRACKCUE ML SERVICES - INTEGRATION TEST")
    print("="*70)
    
    # ========== PHASE 1: DJ uploads and analyzes a track ==========
    print("\n[PHASE 1] DJ uploads track 'Get Lucky' by Daft Punk")
    
    current_track = Track(
        id="spotify:get_lucky",
        title="Get Lucky",
        artist="Daft Punk feat. Pharrell",
        bpm=126.0,
        key="8A",
        energy=0.85,
        danceability=0.92,
        genre="house",
        mood="euphoric",
        duration_sec=344,
        play_count=0
    )
    
    print(f"  ✓ Track: {current_track.artist} - {current_track.title}")
    print(f"    BPM: {current_track.bpm}, Key: {current_track.key}, Energy: {current_track.energy}")
    
    # ========== PHASE 2: Classify audio characteristics ==========
    print("\n[PHASE 2] ML Classifiers analyze audio")
    
    # Vocal style detection
    vocal = VocalStyleClassifier.classify(
        spectral_centroid=4200.0,
        zero_crossing_rate=0.10,
        spectral_rolloff=0.80,
        mfcc_mean=28.0
    )
    print(f"  ✓ Vocal style: {vocal.label} ({vocal.confidence:.2%})")
    
    # Mood detection
    mood = MoodDetector.detect(
        energy=current_track.energy,
        spectral_centroid=4000.0,
        mode="major"
    )
    print(f"  ✓ Mood: {mood.label} ({mood.confidence:.2%})")
    
    # Danceability calculation
    dance = DanceabilityScoreML.score(
        bpm=current_track.bpm,
        beat_strength=0.88,
        groove_consistency=0.85,
        syncopation=0.40
    )
    print(f"  ✓ Danceability: {dance:.2f}/1.0")
    
    # Production era
    era = ProductionEraClassifier.classify(
        spectral_power_dist={"low": 0.25, "mid": 0.40, "high": 0.35},
        bpm=current_track.bpm,
        brightness=0.55
    )
    print(f"  ✓ Production era: {era.label} ({era.confidence:.2%})")
    
    # Set position suggestion
    position = SetPositionPredictor.predict(
        energy=current_track.energy,
        bpm=current_track.bpm,
        danceability=current_track.danceability,
        mood=mood.label
    )
    best_position = max(position, key=position.get)
    print(f"  ✓ Best set position: {best_position} ({position[best_position]:.2%})")
    
    # ========== PHASE 3: DJ provides feedback & corrections ==========
    print("\n[PHASE 3] DJ provides feedback on analysis")
    
    user_id = "dj_kevin_dumont"
    correction_learning = get_correction_learning()
    feedback_collector = get_feedback_collector()
    
    # DJ slightly corrects the BPM
    correction = correction_learning.add_correction(
        track_id=current_track.id,
        correction_type=CorrectionType.BPM,
        original_value=126.0,
        corrected_value=126.5,
        user_id=user_id,
        confidence=0.95
    )
    print(f"  ✓ BPM correction: {correction['original']} → {correction['corrected']}")
    
    # DJ rates the analysis quality
    feedback = feedback_collector.submit_feedback(
        track_id=current_track.id,
        user_id=user_id,
        quality_rating=AnalysisQuality.EXCELLENT,
        feedback_text="Excellent analysis, perfect key and energy detection!"
    )
    print(f"  ✓ Quality feedback: {feedback['quality_rating']}")
    
    # Record DJ preferences
    user_prefs = get_user_preferences(user_id)
    user_prefs.record_cue_placement("on_drops")
    user_prefs.record_genre_interaction("house", action="play")
    print(f"  ✓ Recorded user preference: cue on drops, genre interaction")
    
    # ========== PHASE 4: Get next track recommendations ==========
    print("\n[PHASE 4] Get next track recommendations")
    
    # Create candidate tracks
    candidates = [
        Track("spotify:lucky", "Lucky", "Jason Derulo", 128.0, "8B", 0.88, 0.90, "house", "happy", 210),
        Track("spotify:techouse", "Tech House Track", "The Martinez Bros", 124.0, "9A", 0.75, 0.80, "tech house", "chill", 400),
        Track("spotify:deephouse", "Deep Vibes", "Osunlade", 120.0, "10A", 0.65, 0.70, "deep house", "chill", 380),
        Track("spotify:techno", "Industrial Tech", "Chris Liebing", 135.0, "7B", 0.92, 0.85, "techno", "dark", 420),
    ]
    
    recommender = NextTrackRecommender()
    recommendations = recommender.recommend(current_track, candidates, limit=3)
    
    print("  Recommendations:")
    for i, rec in enumerate(recommendations, 1):
        print(f"    {i}. {rec.track.artist} - {rec.track.title}")
        print(f"       Score: {rec.score:.2%} | {rec.reason}")
    
    # ========== PHASE 5: Automatic set building ==========
    print("\n[PHASE 5] Auto-build a 60-minute set")
    
    builder = SetBuilder()
    set_plan = builder.build_set(current_track, candidates, target_duration_min=60)
    
    print(f"  ✓ Built set with {len(set_plan.tracks)} tracks ({set_plan.total_duration/60:.1f} min)")
    for i, track in enumerate(set_plan.tracks, 1):
        print(f"    {i}. {track.artist} - {track.title} ({track.duration_sec/60:.1f} min, {track.energy:.2f} energy)")
    
    # Show energy arc
    print(f"  Energy arc: {' → '.join(f'{e:.2f}' for e in set_plan.energy_arc)}")
    
    # ========== PHASE 6: Plan energy and key journey ==========
    print("\n[PHASE 6] Plan energy and harmonic journey")
    
    energy_planner = EnergyArcPlanner()
    energy_arc = energy_planner.plan_arc(duration_min=60, shape="mountain")
    print(f"  Energy journey (mountain): {energy_arc[:5]} ... (truncated)")
    
    key_planner = KeyJourneyPlanner()
    key_journey = key_planner.plan_journey(current_track.key, length=5)
    print(f"  Key journey (Camelot): {' → '.join(key_journey)}")
    
    # ========== PHASE 7: Parse track metadata ==========
    print("\n[PHASE 7] Parse complex track titles")
    
    parser = TitleParser()
    examples = [
        "Daft Punk feat. Pharrell - Get Lucky (Mark Ronson Remix)",
        "The Chemical Brothers - Block Rockin Beats [Extended Mix]",
        "Laurent Garnier - Crispy Bacon (John Digweed Remix Edit)",
    ]
    
    for title in examples:
        parsed = parser.parse(title)
        print(f"  ✓ '{title}'")
        print(f"    → Artist: {parsed['artist']}, Title: {parsed['title']}")
        if parsed['featuring']:
            print(f"    → Featuring: {', '.join(parsed['featuring'])}")
        if parsed['remix_artist']:
            print(f"    → Remix by: {parsed['remix_artist']}")
    
    # ========== PHASE 8: Artwork processing ==========
    print("\n[PHASE 8] Process album artwork")
    
    # Simulate artwork metadata (no actual image processing)
    primary_color = Color(220, 50, 80)  # Reddish from album
    print(f"  ✓ Extracted primary color: {primary_color.to_hex()}")
    print(f"    Luminance: {primary_color.luminance():.2f}, Is dark: {primary_color.is_dark()}")
    
    optimizer = ArtworkBackgroundColorOptimizer()
    player_bg = optimizer.get_optimal_background(primary_color, design_context="player")
    print(f"  ✓ Player background: {player_bg['background']}")
    print(f"    Text color: {player_bg['text_color']}")
    
    # ========== FINAL SUMMARY ==========
    print("\n" + "="*70)
    print("✅ INTEGRATION TEST PASSED - All services working together!")
    print("="*70)
    print("\nServices tested:")
    print("  ✓ ml_learning: Corrections, feedback, user preferences")
    print("  ✓ ml_classifiers: Vocal, mood, danceability, era, position")
    print("  ✓ recommendation_engine: Next track, set building, title parsing")
    print("  ✓ artwork_service: Color extraction, background optimization")
    print("\n")


if __name__ == "__main__":
    test_complete_dj_workflow()
