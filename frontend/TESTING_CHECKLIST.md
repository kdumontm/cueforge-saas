# DashboardClient — Test Implementation Checklist

**Generated:** 2026-03-30
**Total Features:** 47 interactive features
**Currently Tested:** ~6-8 (13%)
**Untested:** ~39-41 (87%)

---

## Quick Reference: Feature Status

### ✅ ALREADY HAS TESTS (Render checks only)
- Upload button exists
- File input exists
- Search input exists
- Sort direction button visible
- Player controls visible (play/pause icons, skip icons, volume icon, zoom buttons)
- Loop buttons visible (IN, OUT, LOOP)
- Playback rate display visible (1.00x)
- Batch analyze button visible
- Waveform theme buttons visible
- Context menu icons visible
- Export buttons visible
- Sidebar module buttons visible

### ❌ CRITICAL — NO TESTS (Must implement immediately)

#### Playback Controls (8 tests needed)
- [ ] **Play/Pause Toggle** — Click button, verify wavesurferRef.play() called, isPlaying state changes
- [ ] **Skip Forward** — Click button, verify seekTo(nextCuePosition) called
- [ ] **Skip Back** — Click button, verify seekTo(prevCuePosition) called
- [ ] **Seek on Progress Bar** — Click at 50% of progress bar, verify seekTo() position correct
- [ ] **Volume Slider** — Drag slider, verify setVolume() called with correct value
- [ ] **Mute Toggle** — Click mute icon, verify volume = 0, icon changes
- [ ] **Playback Rate +/- buttons** — Click +, verify rate increases; click -, verify decreases; click display to reset to 1.0
- [ ] **Loop IN/OUT/LOOP** — Click IN at 10s, click OUT at 30s, click LOOP, verify loop region created and playback respects bounds

#### Track Selection & Navigation (3 tests needed)
- [ ] **Click Track Row** — Click track, verify selectedTrack updates, cue points load, waveform displays
- [ ] **Keyboard: Arrow Up/Down** — Press ↑/↓, verify selectedTrack changes to prev/next
- [ ] **Keyboard: Delete** — Press Delete on selected track, verify confirm dialog, then deleteTrack() API called

#### Data Modifications (5 tests needed)
- [ ] **Metadata Edit Modal** — Open modal, edit title/artist/album, click Save, verify PATCH API called, selectedTrack updated
- [ ] **Delete Track (with confirm)** — Right-click → Delete, confirm dialog, API called, track removed from state
- [ ] **Add Cue Point** — Click + button, enter name/position, click Create, verify createCuePoint() API, cue appears in list
- [ ] **Delete Cue Point** — Right-click cue, confirm delete, verify deleteCuePoint() API, cue removed
- [ ] **Bulk Genre Update** — Select 3 tracks, right-click → Update Genre, enter genre, click Update, verify PATCH called for each

#### Upload & Files (2 tests needed)
- [ ] **File Input Upload** — Click upload button, select file(s), verify uploadTrack() API, track added to list, toast shows success
- [ ] **Drag & Drop Upload** — Drag file into container, verify onDrop called, uploadTrack() API, track added to state

#### Search & Filter (3 tests needed)
- [ ] **Search Input** — Type in search box, verify filteredTracks filters by title/artist, count updates
- [ ] **Sort Order Change** — Change sort column to BPM, verify sortBy state changes, tracks re-sort by BPM value
- [ ] **Sort Direction** — Click direction toggle, verify sortDir changes asc→desc, tracks reverse order

#### Batch Operations (2 tests needed)
- [ ] **Multi-select Checkboxes** — Click 3 checkboxes, verify selectedIds Set contains 3 IDs, batch buttons visible
- [ ] **Batch Analyze Audio** — Select tracks, click Batch Analyze, verify analyzeTrack() called for each, progress updates, completion toast shown

#### Context Menu (1 test needed)
- [ ] **Context Menu Actions** — Right-click track, click "Analyze", verify analyzeTrack() API called

---

## MEDIUM PRIORITY (17 tests)

#### Advanced Playback
- [ ] **Cue Point Seek** — Click cue point button, verify seekTo() to cue.position_ms
- [ ] **Waveform Zoom In/Out** — Click zoom buttons, verify waveformZoom state, zoom multiplier applied

#### Filtering & Views
- [ ] **Show Compatible Only** — Click Compatible button, verify showCompatibleOnly = true, filteredTracks = compatible only
- [ ] **Column Visibility** — Toggle columns, verify visibleCols state, localStorage updated, grid columns show/hide
- [ ] **Column Filters** — Enter BPM min/max, verify colFilter state, filteredTracks updates, tracks outside range hidden
- [ ] **Favorites Toggle** — Star a track, click Favorites button, verify showFavoritesOnly = true, only favorited tracks shown

#### Specialized Features
- [ ] **BPM Tap Tempo** — Click Tap button, tap 5 times, verify BPM calculated, matches expected value ±2
- [ ] **Mix Suggestions** — Select track with analysis, click Find Mixes, verify compatible tracks listed, click suggestion selects it
- [ ] **Track Rating** — Click 3-star rating, verify trackRatings state = 3, click again = 0 (toggle off)
- [ ] **Time Display Toggle** — Click time display, verify showRemainingTime toggles, display switches from elapsed to countdown
- [ ] **Notes Panel** — Click Notes button, verify panel shows, type text, verify trackNotes state updates (max 500 chars)
- [ ] **Beat Grid Toggle** — Click Grid button, verify showBeatGrid toggles, button highlights when on

#### Exports
- [ ] **Export CSV** — Click Export CSV, verify file download with correct headers, content matches filtered tracks
- [ ] **Export TXT** — Click Copy TXT, verify text generated, file downloaded with numbered tracklist
- [ ] **Export Rekordbox** — Click Export Rekordbox, verify API called, XML file downloaded with cue points

#### Module Interactions
- [ ] **Module Toggle (sidebar)** — Click Smart Playlist button, verify setShowSmartPlaylist(true), activeModule updates, previous module closes
- [ ] **TrackOrganizer Modal** — Click Organize, verify modal opens with track data, click Close, verify modal closes

---

## LOW PRIORITY (11 tests)

#### Polish & UX
- [ ] **Keyboard: Space (Play/Pause)** — Press Space in waveform context, verify togglePlay() called
- [ ] **Keyboard: ? (Shortcuts)** — Press ?, verify shortcuts modal opens
- [ ] **Keyboard: / (Focus Search)** — Press /, verify search input focused
- [ ] **Keyboard: Escape (Close Modals)** — Press Escape in BPM tap modal, verify modal closes
- [ ] **Waveform Theme Color** — Click color button, verify waveformTheme state, waveform re-renders with new color
- [ ] **Sidebar Collapse** — Click collapse button on module group, verify group collapses, state updates
- [ ] **Duplicate Detection** — Try upload file with same filename as existing, verify toast "Duplicate detected"
- [ ] **Auto-Analyze Toggle** — Upload file with autoAnalyze=true, verify analyzeTrack() called automatically post-upload
- [ ] **Play History & Mix Log** — Select track A then B, verify playHistory array updated, mixLog shows transition score
- [ ] **Metadata Suggestions** — Right-click track → Get Metadata, verify API called, suggestions populate form fields
- [ ] **Plan Feature Toggle (admin)** — Toggle feature in admin panel, verify PATCH API, planFeatures state updates

---

## Implementation Order (Recommended)

### Week 1 — Playback Foundation (8 tests)
1. Play/Pause toggle
2. Skip forward/back
3. Seek on progress bar
4. Volume slider + mute
5. Playback rate control
6. Loop IN/OUT/LOOP
7. Cue point seek
8. Keyboard: arrow keys + delete

### Week 2 — Data Operations (7 tests)
9. Track selection
10. Metadata edit + save
11. Delete track + confirm
12. Add/delete cue point
13. File upload (input + drag-drop)
14. Multi-select + batch analyze
15. Context menu

### Week 3 — Search & Sort (5 tests)
16. Search filtering
17. Sort column change
18. Sort direction toggle
19. Compatible tracks filter
20. Column visibility

### Week 4 — Advanced (10 tests)
21. BPM tap tempo
22. Export CSV/TXT/Rekordbox
23. Bulk genre update
24. Mix suggestions
25. Column filters
26. Waveform zoom
27. Favorites toggle
28. Rating system
29. Module toggle
30. Beat grid toggle

### Week 5+ — Polish (11 tests)
31–41. All LOW priority items

---

## Test File Structure

```
__tests__/
├── dashboard-buttons.test.tsx          ← existing, basic render tests
├── dashboard-playback.test.tsx         ← NEW: play/pause, skip, volume, seek
├── dashboard-selection.test.tsx        ← NEW: track selection, keyboard nav
├── dashboard-data-edit.test.tsx        ← NEW: metadata, cue points, delete
├── dashboard-upload.test.tsx           ← NEW: file input, drag-drop
├── dashboard-search-sort.test.tsx      ← NEW: search, sort, filter
├── dashboard-batch.test.tsx            ← NEW: multi-select, batch analyze
├── dashboard-advanced.test.tsx         ← NEW: loop, BPM tap, exports, etc.
└── dashboard-context-menu.test.tsx     ← NEW: right-click actions
```

---

## Mock Setup Already in Place (from existing tests)

These are already properly mocked in `dashboard-buttons.test.tsx` and can be reused:

✅ WaveSurfer.js (play, pause, stop, seekTo, getDuration, getCurrentTime, setVolume, setPlaybackRate, zoom)
✅ WaveSurfer regions plugin (addRegion, clearRegions, getRegions)
✅ File APIs (fetch, FileReader, Blob, URL.createObjectURL)
✅ Lucide React icons (as simple spans)
✅ All API functions (listTracks, uploadTrack, analyzeTrack, deleteTrack, createCuePoint, etc.)
✅ OfflineAudioContext (for RGB waveform calculation)
✅ localStorage (for token + column visibility)
✅ Router (next/navigation)

### Additional Mocks Needed

For new tests:
- `HTMLElement.click()` for file input triggering
- `window.URL.createObjectURL()` confirm it works with Blob
- `confirm()` dialog simulation
- Keyboard events (KeyboardEvent with key codes)
- Drag & Drop events (DragEvent, DataTransfer)
- Audio waveform data generation (already mocked but may need tuning)

---

## Code References for Test Writers

### Play/Pause Test Example
```typescript
test('togglePlay calls wavesurferRef.play() when not playing', () => {
  render(<DashboardPage />);
  // Select a track
  fireEvent.click(screen.getByText('One More Time'));
  // Click play button
  fireEvent.click(screen.getByRole('button', {hidden: true})); // play button
  // Verify wavesurferRef.play() was called
  expect(wavesurfer.play).toHaveBeenCalled();
  // Verify isPlaying state changed
  expect(screen.getByText('Pause')).toBeInTheDocument(); // icon changed
});
```

### Metadata Edit Test Example
```typescript
test('metadata edit modal saves changes', async () => {
  render(<DashboardPage />);
  await waitFor(() => expect(mockListTracks).toHaveBeenCalled());

  // Right-click track → Edit
  fireEvent.contextMenu(screen.getByText('One More Time'));
  fireEvent.click(screen.getByText('Edit'));

  // Edit form appears
  const titleInput = screen.getByDisplayValue('One More Time');
  fireEvent.change(titleInput, {target: {value: 'New Title'}});

  // Click Save
  fireEvent.click(screen.getByText('Save'));

  // Verify PATCH API called
  await waitFor(() => {
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/tracks/1'),
      expect.objectContaining({method: 'PATCH'})
    );
  });
});
```

---

## Success Criteria

- ✅ All play/pause/seek/volume interactions trigger correct WaveSurfer methods
- ✅ All data edits trigger correct API calls (PATCH, POST, DELETE)
- ✅ All state changes (isPlaying, selectedTrack, selectedIds, etc.) verified after user actions
- ✅ All confirmations (delete, bulk) are tested
- ✅ All keyboard shortcuts work as documented
- ✅ All toast notifications appear for success/error
- ✅ Test coverage >80% for interactive features
- ✅ No unhandled promise rejections in test output
- ✅ All mocks reset between tests (already in setup)

---

## Known Challenges

1. **WaveSurfer mocking** — Already solved in existing tests; reuse the mock setup
2. **Keyboard events** — Use `fireEvent.keyDown()` or `userEvent.keyboard()`
3. **Drag & Drop** — Mock DragEvent; already have structure in existing tests
4. **File input** — Mock File objects; can use existing pattern
5. **Timing** — Use `waitFor()` for async operations (already done)
6. **Modal clicks** — Ensure `e.stopPropagation()` doesn't interfere; use `screen.getByRole()` to target modal content
7. **Context menu position** — Test state (x, y) updates, not visual positioning

---

## Questions for Implementation

1. Should cue point color changes trigger API saves, or are they local-only?
2. Should favorites + ratings persist to API, or stay local?
3. Should track notes persist to API, or stay local?
4. Should BPM tap results auto-save to track analysis, or just show value?
5. Should bulk genre update show individual item failures or just total count?
6. Should loop regions auto-save, or are they session-only?

(These should be clarified in API contracts before writing tests)

---

## Related Skills

- `cueforge-tests:write-tests` — Use to scaffold test files
- `cueforge-tests:validate-flow` — Use to validate test flows
- `cueforge-tests:run-tests` — Use to execute tests and check coverage
- `engineering:testing-strategy` — Use for broader test strategy review
