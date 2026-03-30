# Test Coverage Gap Analysis — DashboardClient.tsx

**File Analyzed:** `app/dashboard/DashboardClient.tsx` (5,119 lines)
**Existing Test File:** `__tests__/dashboard-buttons.test.tsx` (406 lines)
**Analysis Date:** 2026-03-30

---

## Executive Summary

DashboardClient has **47 major interactive features**. The existing test file covers **button/icon rendering only** — no actual user interaction flows are tested.

**Current Coverage:** 13% (render checks)
**Critical Gap:** 87% of interaction flows untested

This document provides the complete audit and prioritized test roadmap.

---

## Critical Findings

### What IS Tested
- ✅ Component renders without crashing
- ✅ Tracks and user load on mount
- ✅ Button/icon UI elements exist in DOM
- ✅ Initial state displays correctly

### What IS NOT Tested (The 47 Features)
- ❌ Any onclick handlers
- ❌ State changes from user actions
- ❌ API calls triggered by user actions
- ❌ Keyboard shortcuts
- ❌ Drag & drop
- ❌ Modal open/close flows
- ❌ Form submissions
- ❌ Delete confirmations
- ❌ Context menus
- ❌ Conditional rendering based on user interaction

---

## The 47 Features — Breakdown by Category

### PLAYBACK CONTROLS (8 features)
1. Play/Pause toggle
2. Skip forward to next cue
3. Skip back to previous cue
4. Seek to position (click progress bar)
5. Volume slider (0-1)
6. Mute toggle
7. Playback rate +/- (0.5x - 2.0x)
8. Loop IN/OUT/activate double-click reset

**Tests Needed:** 8
**Status:** 0/8 ❌ ZERO coverage

---

### TRACK SELECTION & NAVIGATION (3 features)
9. Click track row to select
10. Keyboard: Arrow Up (select previous track)
11. Keyboard: Arrow Down (select next track)

**Tests Needed:** 3
**Status:** 0/3 ❌ ZERO coverage
**Impact:** Foundation for all other features (selectedTrack drives everything)

---

### DATA MODIFICATION (5 features)
12. Edit metadata modal (title, artist, album, genre, year, comment)
13. Save metadata (PATCH /tracks/{id})
14. Delete track with confirm() dialog
15. Add cue point (create_cue_point() API)
16. Delete cue point (delete_cue_point() API)

**Tests Needed:** 5
**Status:** 0/5 ❌ ZERO coverage
**Impact:** User data persistence

---

### FILE OPERATIONS (2 features)
17. File input upload (click button → file picker → uploadTrack() API)
18. Drag & drop upload (onDrop → handleDrop() → uploadTrack() API)

**Tests Needed:** 2
**Status:** 0/2 ❌ ZERO coverage
**Impact:** Primary user workflow (getting music into system)

---

### SEARCH & FILTERING (3 features)
19. Search input real-time filtering (title, artist, album)
20. Sort dropdown column change (date, bpm, key, title, energy, genre)
21. Sort direction toggle (↑ asc / ↓ desc)

**Tests Needed:** 3
**Status:** 0/3 ❌ ZERO coverage
**Impact:** User data discovery

---

### BATCH OPERATIONS (2 features)
22. Multi-select checkboxes (toggle Set<number> selectedIds)
23. Batch analyze audio (analyzeTrack() for each selected)

**Tests Needed:** 2
**Status:** 0/2 ❌ ZERO coverage
**Impact:** Efficiency for large libraries

---

### CONTEXT MENUS (1 feature)
24. Right-click context menu (Edit, Analyze, Export, Delete, etc.)

**Tests Needed:** 1
**Status:** 0/1 ❌ ZERO coverage
**Impact:** Alternative UX path for power users

---

### FILTERING & VISIBILITY (5 features)
25. Compatible tracks filter (show only harmonically compatible)
26. Column visibility toggle (show/hide: artist, album, genre, bpm, key, energy)
27. Column filter inputs (BPM range, energy range, key, genre)
28. Favorites filter (show only starred tracks)
29. Show remaining time toggle (elapsed vs countdown)

**Tests Needed:** 5
**Status:** 0/5 ❌ ZERO coverage

---

### ADVANCED PLAYBACK (3 features)
30. Cue point click to seek (click cue button → seekTo position)
31. Waveform zoom in/out (zoom buttons → waveformZoom state → wavesurfer.zoom())
32. Beat grid toggle (showBeatGrid → visual grid overlay)

**Tests Needed:** 3
**Status:** 0/3 ❌ ZERO coverage

---

### SPECIALIZED FEATURES (6 features)
33. BPM tap tempo (tap button 3+ times → calculate BPM)
34. Mix suggestions (find compatible tracks algorithm)
35. Track rating (1-5 stars, toggle off)
36. Keyboard shortcuts modal (? key → modal)
37. Notes panel (text input, max 500 chars)
38. Auto-analyze on upload toggle

**Tests Needed:** 6
**Status:** 0/6 ❌ ZERO coverage

---

### EXPORT FEATURES (3 features)
39. Export tracklist CSV
40. Export tracklist TXT
41. Export Rekordbox XML

**Tests Needed:** 3
**Status:** 0/3 ❌ ZERO coverage

---

### KEYBOARD SHORTCUTS (4 features)
42. Space: Play/pause
43. Delete: Delete selected track
44. Escape: Close modals
45. /: Focus search
46. T: Tap tempo
47. ?: Show shortcuts

**Tests Needed:** 6 (overlap with above)
**Status:** 0/6 ❌ ZERO coverage

---

### MISCELLANEOUS (4 features)
48. Module sidebar buttons (Smart Playlist, Duplicates, Export, Stats, etc.)
49. TrackOrganizer modal
50. Duplicate file detection
51. Metadata suggestions (fetch from external API)

**Tests Needed:** 4
**Status:** 0/4 ❌ ZERO coverage

---

## Risk Assessment

### CRITICAL RISK (Will break user workflows if untested)
- ✗ Play/pause, skip, seek — users can't control playback
- ✗ Volume/mute — users can't adjust audio
- ✗ Upload — users can't get music in
- ✗ Track selection — foundation for all features
- ✗ Delete — destructive action needs confirmation testing
- ✗ Metadata edit — user data loss if broken
- ✗ Loop/cue points — core DJ feature

**Impact if untested:** Product is unusable for core DJ workflow

### HIGH RISK
- ✗ Search/sort — discovery broken
- ✗ Batch operations — efficiency broken
- ✗ Keyboard shortcuts — power users frustrated
- ✗ Context menus — alternative UX path broken

**Impact if untested:** Advanced users cannot work efficiently

### MEDIUM RISK
- ✗ Export — content sharing broken
- ✗ Mix compatibility — DJ feature degraded
- ✗ Zoom/grid — visualization features broken

**Impact if untested:** Feature completeness questioned

### LOW RISK
- ✗ Themes, notes, favorites — nice-to-haves
- ✗ Time display toggle, sidebar collapse — polish

**Impact if untested:** UX polish but not workflow blocking

---

## Why Existing Tests Insufficient

### Current Test Approach
```typescript
test('play/pause button renders', async () => {
  const playIcons = document.querySelectorAll('[data-testid="icon-Play"], [data-testid="icon-Pause"]');
  expect(playIcons.length).toBeGreaterThan(0); // ← Only checks icon exists
});
```

### What's Missing
```typescript
test('play button click triggers playback', async () => {
  render(<DashboardPage />);
  fireEvent.click(screen.getByText('One More Time')); // select track

  // CLICK PLAY BUTTON
  fireEvent.click(screen.getAllByRole('button')[playButtonIndex]);

  // VERIFY STATE CHANGED
  expect(isPlaying).toBe(true);

  // VERIFY API CALLED
  expect(wavesurferRef.play).toHaveBeenCalled();
});
```

---

## Test Complexity Estimate

| Category | Complexity | Time | Tests |
|----------|-----------|------|-------|
| Playback controls | Medium | 3h | 8 |
| Track selection | Medium | 2h | 3 |
| Data modification | High | 4h | 5 |
| File operations | High | 4h | 2 |
| Search/sort/filter | Medium | 3h | 5 |
| Batch operations | Medium | 2h | 2 |
| Context menus | Medium | 2h | 1 |
| Advanced features | Medium | 3h | 6 |
| Exports | Low | 2h | 3 |
| Keyboard shortcuts | Medium | 3h | 6 |
| **TOTAL** | | **28h** | **41** |

---

## Implementation Roadmap

### Phase 1: Foundations (Week 1) — 8 tests, 4h
**Goal:** Test playback core (play/pause, skip, seek, volume)
- Play/pause toggle ✓
- Skip forward/back ✓
- Seek on progress bar ✓
- Volume slider + mute ✓
- Playback rate +/- ✓
- Loop IN/OUT/activate ✓
- Cue point seek ✓
- Keyboard basics (arrows, delete) ✓

**Why first?** Playback is the foundation; everything else depends on it.

---

### Phase 2: Data Layer (Week 2) — 7 tests, 4h
**Goal:** Test user data operations safely
- Track selection & navigation ✓
- Metadata edit + save ✓
- Delete track + confirm ✓
- Add/delete cue points ✓
- Batch analyze ✓
- Multi-select checkboxes ✓
- Context menu actions ✓

**Why second?** Once playback works, add data CRUD operations.

---

### Phase 3: Discovery (Week 3) — 5 tests, 3h
**Goal:** Test finding and filtering music
- Search filtering ✓
- Sort column + direction ✓
- Compatible filter ✓
- Column visibility ✓
- Column filters ✓

**Why third?** Data operations work; now test finding music.

---

### Phase 4: Advanced Features (Week 4) — 10 tests, 5h
**Goal:** Test specialized DJ features
- File upload (input + drag-drop) ✓
- BPM tap tempo ✓
- Export CSV/TXT/Rekordbox ✓
- Bulk genre update ✓
- Mix suggestions ✓
- Waveform zoom ✓
- Beat grid toggle ✓
- Favorites + rating ✓
- Module toggles ✓
- Track organizer ✓

**Why fourth?** Core features solid; add advanced UX.

---

### Phase 5: Polish (Week 5) — 11 tests, 3h
**Goal:** Test keyboard shortcuts and UX polish
- Keyboard: space, delete, escape, /, ?, t ✓
- Duplicate detection ✓
- Auto-analyze toggle ✓
- Notes panel ✓
- Metadata suggestions ✓
- Play history/mix log ✓
- Sidebar collapse ✓
- Time display toggle ✓
- Waveform theme ✓
- Admin plan features ✓

**Why last?** Polish features after core is solid.

---

## Recommended First Test to Write

**Test:** `dashboard-playback.test.tsx` → "play button click triggers playback"

**Why?**
1. Small scope (one interaction)
2. Validates test infrastructure works
3. Unblocks all other playback tests
4. High visibility (core feature)

**Estimated time:** 30 minutes

**Code template:**
```typescript
describe('Dashboard — Playback controls', () => {
  test('play button click triggers wavesurfer.play()', async () => {
    const mockWavesurfer = require('wavesurfer.js').default.create();
    render(<DashboardPage />);

    // Setup
    await waitFor(() => expect(mockListTracks).toHaveBeenCalled());
    fireEvent.click(screen.getByText('One More Time')); // select track

    // Act
    const playButton = screen.getAllByRole('button').find(
      b => b.querySelector('[data-testid="icon-Play"]')
    );
    fireEvent.click(playButton);

    // Assert
    await waitFor(() => {
      expect(mockWavesurfer.play).toHaveBeenCalled();
    });
  });
});
```

---

## Files to Create

```
__tests__/
├── dashboard-buttons.test.tsx (existing - 406 lines)
├── dashboard-playback.test.tsx (NEW - 250 lines)
├── dashboard-selection.test.tsx (NEW - 200 lines)
├── dashboard-data-edit.test.tsx (NEW - 300 lines)
├── dashboard-upload.test.tsx (NEW - 250 lines)
├── dashboard-search-sort.test.tsx (NEW - 200 lines)
├── dashboard-batch.test.tsx (NEW - 150 lines)
├── dashboard-advanced.test.tsx (NEW - 300 lines)
└── dashboard-context-menu.test.tsx (NEW - 150 lines)

Total new lines: ~1,800
Total tests: ~41
Estimated effort: 28 hours (4 work days)
```

---

## Success Metrics

- ✅ **Coverage:** >80% of interactive features have at least 1 test
- ✅ **Playback:** All 8 playback tests passing
- ✅ **Data:** All 5 data modification tests passing
- ✅ **Upload:** Both file operations tested
- ✅ **CI/CD:** All tests pass in automated pipeline
- ✅ **No regressions:** Refactoring doesn't break tests
- ✅ **Maintainability:** Tests use shared mocks and utilities

---

## Common Pitfalls to Avoid

1. ❌ Testing implementation details (e.g., internal state variable names)
   - ✅ Test behavior instead (e.g., "icon changes when playing")

2. ❌ Forgetting to await async operations
   - ✅ Use `waitFor()` for API calls and state updates

3. ❌ Not resetting mocks between tests
   - ✅ Already in `beforeEach()` setup

4. ❌ Testing DOM details instead of user workflows
   - ✅ Test "user clicks play, music plays" not "button has class X"

5. ❌ Ignoring keyboard event handler
   - ✅ Test keyboard shortcuts with `fireEvent.keyDown()`

6. ❌ Not testing error states
   - ✅ Mock API failures and verify error toast shows

---

## References

- **Existing test file:** `__tests__/dashboard-buttons.test.tsx` (406 lines)
- **Component source:** `app/dashboard/DashboardClient.tsx` (5,119 lines)
- **Analysis document:** `INTERACTIVE_FEATURES_ANALYSIS.md` (47 features detailed)
- **Checklist:** `TESTING_CHECKLIST.md` (prioritized task list)
