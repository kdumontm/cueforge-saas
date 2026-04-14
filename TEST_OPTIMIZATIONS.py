#!/usr/bin/env python3
"""
Test examples for TrackCue Cue Generator v5.0 optimizations.
Demonstrates usage of points 101-250.
"""

# ── Test 1: Priority queue (Point 104) ──
def test_priority_queue():
    """Build and select cue candidates by priority."""
    from backend.app.services.cue_generator import CueCandidate, _build_cue_priority_queue
    
    # Mock analysis data
    analysis_data = {
        "duration_ms": 300000,
        "bpm": 128,
        "drop_positions": [120000, 240000],
        "section_labels": [
            {"time_ms": 0, "label": "INTRO", "energy": 0.2},
            {"time_ms": 30000, "label": "BUILD", "energy": 0.6},
            {"time_ms": 120000, "label": "DROP", "energy": 1.0},
        ],
        "phrase_positions": [60000, 180000],
        "vocal_active_regions": [
            {"start_ms": 90000, "end_ms": 150000, "confidence": 0.9}
        ],
        "stem_analysis": True,
        "stem_validated_drops": [
            {"position_ms": 120000, "confidence": 0.95, "contrast": 0.8}
        ]
    }
    
    profile = {
        "min_drop_contrast": 0.15,
        "gap_bars": 6,
    }
    
    candidates = _build_cue_priority_queue(analysis_data, profile)
    print(f"✓ Priority queue: {len(candidates)} candidates")
    for c in sorted(candidates, key=lambda x: x.score, reverse=True)[:3]:
        print(f"  - {c.cue_type}: score={c.score:.2f} @ {c.pos_ms}ms")
    

# ── Test 2: Cue spacing (Point 108) ──
def test_cue_spacing():
    """Enforce minimum spacing between cues."""
    from backend.app.services.cue_generator import _enforce_cue_spacing
    
    cues = [
        {"position_ms": 10000, "cue_type": "intro", "confidence": 0.8},
        {"position_ms": 15000, "cue_type": "build", "confidence": 0.6},  # Too close!
        {"position_ms": 130000, "cue_type": "drop", "confidence": 0.95},
        {"position_ms": 135000, "cue_type": "breakdown", "confidence": 0.7},  # Too close!
    ]
    
    spaced = _enforce_cue_spacing(cues, bpm=128, min_bars=4.0)
    print(f"✓ Cue spacing: {len(cues)} → {len(spaced)} cues after enforcing 4-bar gap")
    for c in spaced:
        print(f"  - {c['cue_type']}: {c['position_ms']}ms (confidence: {c['confidence']})")


# ── Test 3: Validation (Points 181-200) ──
def test_validation():
    """Validate cue points."""
    from backend.app.services.cue_generator import _validate_cues_comprehensive
    
    cues = [
        {"position_ms": 0, "cue_type": "intro", "name": "INTRO", "confidence": 0.8},
        {"position_ms": 60000, "cue_type": "build", "name": "BUILD", "confidence": 0.7},
        {"position_ms": 120000, "cue_type": "drop", "name": "DROP", "confidence": 0.95},
        {"position_ms": 240000, "cue_type": "outro", "name": "OUTRO", "confidence": 0.75},
    ]
    
    validation = _validate_cues_comprehensive(cues, bpm=128, duration_ms=300000)
    print(f"✓ Cue validation: {'VALID' if validation['valid'] else 'INVALID'}")
    print(f"  - Score: {validation['score']:.2f}")
    print(f"  - Average confidence: {validation['avg_confidence']:.2f}")
    print(f"  - Type distribution: {validation['type_distribution']}")
    if validation['warnings']:
        print(f"  - Warnings: {validation['warnings']}")


# ── Test 4: DJ-specific enrichment (Points 201-250) ──
def test_dj_features():
    """Enrich cues with DJ-specific metadata."""
    from backend.app.services.cue_generator import _compute_dj_specific_features
    
    cues = [
        {"position_ms": 0, "cue_type": "intro", "name": "INTRO", "color": "#2B7FFF", "confidence": 0.8},
        {"position_ms": 120000, "cue_type": "drop", "name": "DROP", "color": "#E13535", "confidence": 0.95},
        {"position_ms": 240000, "cue_type": "outro", "name": "OUTRO", "color": "#A855F7", "confidence": 0.75},
    ]
    
    analysis_data = {
        "duration_ms": 300000,
        "bpm": 128,
    }
    
    enriched = _compute_dj_specific_features(cues, analysis_data)
    print(f"✓ DJ-specific enrichment: {len(enriched)} cues enriched")
    for c in enriched:
        print(f"  - {c['cue_type']}: note='{c.get('dj_note')}'")
        print(f"    hotcue_slot: {c.get('hotcue_slot')}")
        if c.get('export_formats'):
            print(f"    export formats: {list(c['export_formats'].keys())}")


# ── Test 5: Genre profiles (Points 156-165) ──
def test_genre_profiles():
    """Test extended genre profiles."""
    from backend.app.services.cue_generator import _get_extended_genre_profile
    
    genres = ["disco", "hardstyle", "ambient", "pop", "rock", "dnb"]
    for genre in genres:
        profile = _get_extended_genre_profile(genre)
        print(f"✓ {genre.upper()}: gap={profile['gap_bars']} bars, contrast={profile['min_drop_contrast']}")


# ── Test 6: Color palettes (Points 176-180) ──
def test_color_palettes():
    """Test multi-DJ color palettes."""
    from backend.app.services.cue_generator import _get_cue_color_palette
    
    for dj in ["rekordbox", "serato", "traktor"]:
        palette = _get_cue_color_palette(dj)
        drop_color = palette.get("drop", "N/A")
        print(f"✓ {dj.upper()}: drop color = {drop_color}")


# ── Test 7: Intelligent naming (Points 171-175) ──
def test_intelligent_naming():
    """Test intelligent cue naming."""
    from backend.app.services.cue_generator import _generate_intelligent_cue_name
    
    name1 = _generate_intelligent_cue_name("drop", 120000, bpm=128, energy=0.9, bar_number=64)
    name2 = _generate_intelligent_cue_name("build", 90000, bpm=128, energy=0.6, bar_number=48)
    name3 = _generate_intelligent_cue_name("intro", 0, bpm=128, energy=0.3, bar_number=0)
    
    print(f"✓ Intelligent naming:")
    print(f"  - {name1}")
    print(f"  - {name2}")
    print(f"  - {name3}")


if __name__ == "__main__":
    print("TrackCue Cue Generator v5.0 — Optimization Tests\n")
    
    # Note: These tests will fail without proper database/SQLAlchemy setup
    # They demonstrate the API usage patterns
    
    print("=== Point 104: Priority Queue ===")
    try:
        test_priority_queue()
    except ImportError:
        print("(Requires SQLAlchemy) Skipping...")
    
    print("\n=== Point 108: Cue Spacing ===")
    test_cue_spacing()
    
    print("\n=== Points 181-200: Validation ===")
    test_validation()
    
    print("\n=== Points 201-250: DJ Features ===")
    try:
        test_dj_features()
    except ImportError:
        print("(Requires SQLAlchemy) Skipping...")
    
    print("\n=== Points 156-165: Genre Profiles ===")
    test_genre_profiles()
    
    print("\n=== Points 176-180: Color Palettes ===")
    test_color_palettes()
    
    print("\n=== Points 171-175: Intelligent Naming ===")
    test_intelligent_naming()
    
    print("\n✓ All tests completed!")
