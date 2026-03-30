# DashboardClient Interactive Features — Complete Analysis

**File:** `/app/dashboard/DashboardClient.tsx` (5119 lines)
**Analysis Date:** 2026-03-30
**Status:** UNTESTED FEATURES IDENTIFIED

---

## Summary

Found **47 major interactive features/flows** across DashboardClient. Of these, **only 6-8 are partially tested** in `dashboard-buttons.test.tsx`. This means **~40 critical features lack test coverage**.

---

## CRITICAL UNTESTED FEATURES (Priority Order)

### 1. **Track Selection & Navigation**
- **Lines:** 232, 1144, 1149, 2665
- **User Action:** Click on track row to select
- **What Happens:**
  - Updates `selectedTrack` state
  - Loads cue points for that track via `getTrackCuePoints()`
  - Triggers play history logging
  - Logs mix compatibility when switching between tracks
  - Renders waveform & player controls for selected track
- **API Calls:** `getTrackCuePoints(trackId)`
- **Currently Tested:** NO
- **Priority:** CRITICAL — selection drives entire player experience

---

### 2. **Keyboard Shortcuts (Arrow Keys, Space, ?, Delete, etc.)**
- **Lines:** 1118–1173, 647–680
- **User Actions:**
  - `↑/↓` — Navigate tracks up/down
  - `Space` — Play/pause (in waveform context)
  - `?` — Toggle shortcuts modal
  - `Delete` — Delete selected track
  - `Escape` — Close modals (BPM tap, shortcuts)
  - `T` or `Space` — Tap tempo
  - `/` — Focus search
- **What Happens:**
  - Track navigation updates `selectedTrack`
  - Space toggles `isPlaying`
  - Delete calls `deleteTrack()` API + removes from state
  - Modals open/close
- **API Calls:** `deleteTrack(trackId)`
- **Currently Tested:** NO
- **Priority:** CRITICAL — keyboard nav is core UX for DJ workflow

---

### 3. **Play/Pause Toggle**
- **Lines:** 1176–1179, 2027
- **User Action:** Click play/pause button
- **What Happens:**
  - `togglePlay()` calls `wavesurferRef.current.play()` or `.pause()`
  - Updates `isPlaying` state
  - Syncs with loop regions if active
- **API Calls:** None (WaveSurfer internal)
- **Currently Tested:** Partial — tests check icon rendering but NOT the click handler or state change
- **Priority:** HIGH — playback is essential

---

### 4. **Skip Forward / Skip Back**
- **Lines:** 1184–1187, 2026, 2028
- **User Action:** Click skip forward/back buttons
- **What Happens:**
  - `skipBack()` seeks to previous cue point (or track start if none)
  - `skipForward()` seeks to next cue point
  - Updates `currentTime` state
  - Calls `wavesurferRef.current.seekTo()`
- **API Calls:** None
- **Currently Tested:** Partial — icons exist in tests but click handlers NOT tested
- **Priority:** HIGH

---

### 5. **Volume Control (Slider + Mute Button)**
- **Lines:** 1188–1193, 2064–2065
- **User Actions:**
  - Drag volume slider (0–1)
  - Click mute icon
- **What Happens:**
  - `onChange` on slider → updates `volume` state → calls `wavesurferRef.setVolume()`
  - Click mute → toggles `muted`, sets volume to 0 or restores previous level
  - Icon switches between `Volume2` (unmuted) and `VolumeX` (muted)
- **API Calls:** None
- **Currently Tested:** Partial — mute icon exists in tests, but slider interaction NOT tested
- **Priority:** HIGH

---

### 6. **Playback Rate Control (+/- buttons)**
- **Lines:** 2070–2072
- **User Actions:**
  - Click `-` button: decrease rate by 0.05 (min 0.5)
  - Click `+` button: increase rate by 0.05 (max 2.0)
  - Click rate display (1.00x): reset to 1.0
- **What Happens:**
  - Updates `playbackRate` state
  - Calls `wavesurferRef.setPlaybackRate(rate)`
- **API Calls:** None
- **Currently Tested:** NO
- **Priority:** MEDIUM-HIGH

---

### 7. **Loop In / Loop Out / Loop Activate**
- **Lines:** 259–261, 328–338, 2091–2093
- **User Actions:**
  - Click "IN" button at current playhead position
  - Click "OUT" button at current playhead position
  - Click "LOOP" to activate (if both IN/OUT set)
  - Double-click "LOOP" to reset IN/OUT/active
- **What Happens:**
  - `setLoopIn()` / `setLoopOut()` capture `wavesurferRef.getCurrentTime()`
  - `setLoopActive()` toggles loop state
  - Creates/destroys waveform region via `loopRegionRef`
  - Player respects loop during playback via `handleTimeUpdate()`
- **API Calls:** None
- **Currently Tested:** NO
- **Priority:** CRITICAL — core DJ feature

---

### 8. **Cue Point Click (Seek to Cue)**
- **Lines:** 2056–2062
- **User Action:** Click on a cue point button in player
- **What Happens:**
  - Calculates position from `cue.position_ms`
  - Calls `wavesurferRef.seekTo(position / duration)`
  - Updates playhead to cue point
- **API Calls:** None
- **Currently Tested:** NO
- **Priority:** HIGH

---

### 9. **Waveform Zoom In/Out**
- **Lines:** 1847–1851, 1994–2005, 988–998
- **User Actions:**
  - Click "Zoom In" button → increases `waveformZoom`
  - Click "Zoom Out" button → decreases `waveformZoom`
- **What Happens:**
  - Updates `waveformZoom` state (1–10 range)
  - Calls `wavesurferRef.zoom(waveformZoom * 50)`
  - Waveform display re-renders at higher/lower detail
- **API Calls:** None
- **Currently Tested:** NO
- **Priority:** MEDIUM

---

### 10. **Metadata Edit Modal (Title, Artist, Album, Genre, Year, Comment)**
- **Lines:** 745–759, 1681–1724, 762–787
- **User Actions:**
  - Click track row menu → "Edit" option
  - Edit form opens: `setShowEditMeta(true)` + `setEditForm(track_data)`
  - Modify fields via `onChange` → updates `editForm` state
  - Click "Save" → calls `saveMetadata()` API
  - Click "Cancel" or backdrop → closes modal
- **What Happens:**
  - `onChange` updates `editForm` state for title, artist, album, genre, year, comment
  - `saveMetadata()` → PATCH `/tracks/:id` with form data
  - Response updates `selectedTrack` + `tracks[]` arrays
  - Toast shows success/error
- **API Calls:** `PATCH /api/v1/tracks/{id}` with metadata
- **Currently Tested:** NO
- **Priority:** CRITICAL — user-facing data modification

---

### 11. **Delete Track (with confirmation)**
- **Lines:** 1357–1366, 2898, 1506
- **User Actions:**
  - Right-click track → "Supprimer" (Delete) context menu
  - OR select track(s) → batch delete button
  - Browser confirm() dialog appears
  - Click OK to confirm deletion
- **What Happens:**
  - Shows `confirm('Supprimer ce morceau?')`
  - If confirmed: calls `deleteTrack(trackId)`
  - Removes track from `selectedTrack` if it was selected
  - Removes from `tracks[]` array
  - Shows success toast
- **API Calls:** `DELETE /api/v1/tracks/{id}`
- **Currently Tested:** NO
- **Priority:** CRITICAL — destructive action

---

### 12. **Drag & Drop Upload**
- **Lines:** 1261–1316, 1667
- **User Actions:**
  - Drag audio files into waveform area
  - `onDragEnter` → sets `dragOver = true` (visual feedback)
  - `onDragLeave` → sets `dragOver = false`
  - `onDrop` → triggers `handleDrop()`
- **What Happens:**
  - Extracts files from DragEvent
  - Calls `uploadTrack()` API for each file
  - Shows progress via `uploadProgress` state
  - On success: auto-analyzes if `autoAnalyze` enabled
  - Updates `tracks[]` array
  - Shows toast with result
- **API Calls:** `POST /api/v1/tracks/upload` (multipart/form-data)
- **Currently Tested:** NO
- **Priority:** CRITICAL — primary upload mechanism for DJs

---

### 13. **File Input Upload**
- **Lines:** 1734, 2136–2144, 1209–1260
- **User Actions:**
  - Click upload button (blue "Add" button)
  - File picker opens
  - Select one or more audio files
  - `onChange` → calls `handleFiles()`
- **What Happens:**
  - `handleFiles()` validates file types (only audio)
  - Checks for duplicates via `originalFilename`
  - Calls `uploadTrack()` for each file
  - Shows upload progress & toast
  - Auto-analyzes if enabled
- **API Calls:** `POST /api/v1/tracks/upload`
- **Currently Tested:** Partial — tests check upload button exists, but click + file handling NOT tested
- **Priority:** CRITICAL

---

### 14. **Search Input (Real-time filter)**
- **Lines:** 2189–2200, 249
- **User Action:** Type in search box
- **What Happens:**
  - `onChange` → updates `searchQuery` state
  - `filteredTracks` recalculates via `useMemo` (filters by title, artist, album)
  - Track list re-renders with only matching tracks
  - Clear (×) button resets search
- **API Calls:** None (client-side filtering)
- **Currently Tested:** Partial — search input existence checked, but NOT the filtering behavior or clearing
- **Priority:** HIGH

---

### 15. **Sort Dropdown & Direction Toggle**
- **Lines:** 2204–2214, 250, 370–373
- **User Actions:**
  - Change sort column (date, bpm, key, title, energy, genre, duration, rating)
  - Click sort direction toggle (↑ asc / ↓ desc)
- **What Happens:**
  - `onChange` → updates `sortBy` state
  - `setSortDir()` → toggles between 'asc'/'desc'
  - `useMemo` recalculates `filteredTracks` with new sort
  - Visual feedback: sort icon rotates, direction symbol updates
- **API Calls:** None (client-side sorting)
- **Currently Tested:** Partial — sort direction button exists, but click handler & actual sort order change NOT tested
- **Priority:** HIGH

---

### 16. **Batch Analyze (Audio & Metadata)**
- **Lines:** 1318–1341, 2152–2167
- **User Actions:**
  - Select multiple tracks via checkboxes
  - Click "Analyser audio" or "Analyser métadonnées" button
  - Progress bar shows: "Analyzing track X/Y..."
- **What Happens:**
  - Calls `analyzeTrack()` (audio) or `batchAnalyzeMetadata()` (metadata) for each selected track
  - Updates `batchProgress` state during processing
  - Calls `pollTrackUntilDone()` to wait for backend analysis
  - On completion: updates `selectedTrack` + `tracks[]`
  - Shows success toast
- **API Calls:** `POST /api/v1/tracks/{id}/analyze`, `GET /api/v1/tracks/{id}` (polling)
- **Currently Tested:** NO
- **Priority:** CRITICAL — core DJ feature (analysis is essential)

---

### 17. **Checkbox Selection (Multi-select)**
- **Lines:** 1195–1210, 234, 2665
- **User Actions:**
  - Click checkbox to toggle track selection
  - Shift+Click to range select
  - Select all / Clear selection buttons
- **What Happens:**
  - Toggles track ID in `selectedIds` Set
  - Shift+Click selects range from `lastClickedIdxRef` to current
  - Batch action buttons appear/disappear based on selection
- **API Calls:** None
- **Currently Tested:** Partial — checkbox icons exist, but click handlers & state changes NOT tested
- **Priority:** MEDIUM-HIGH

---

### 18. **Context Menu (Right-click)**
- **Lines:** 1317–1376, 251, 2665, 2789
- **User Actions:**
  - Right-click on track row
  - Menu appears at (x, y)
  - Click action: Edit, Analyze, Export, Delete, Add to Playlist, Tag
- **What Happens:**
  - `onContextMenu` → `setCtxMenu({x, y, track})`
  - Menu renders at absolute position
  - Click action → calls `handleCtxAction(action, track)`
  - Each action performs API call or state update
  - Menu closes on click or escape
- **API Calls:** Various (depends on action: analyze, delete, export)
- **Currently Tested:** Partial — menu icon exists, but context menu open/click actions NOT tested
- **Priority:** HIGH

---

### 19. **Column Visibility Toggle (Show/Hide columns)**
- **Lines:** 431, 446, 2473–2475
- **User Actions:**
  - Click column settings button
  - Toggle checkboxes for: artist, album, genre, bpm, key, energy, duration
  - Selection saved to localStorage
- **What Happens:**
  - `toggleCol(colName)` → updates `visibleCols` state
  - localStorage updated on change
  - `gridTemplate` recalculates CSS grid
  - Hidden column cells get `min-width: 0` CSS rule
  - Track grid re-renders with visible columns only
- **API Calls:** None
- **Currently Tested:** NO
- **Priority:** MEDIUM

---

### 20. **Column Filter (Text/number filters)**
- **Lines:** 421–429, 2476–2489
- **User Actions:**
  - Click column filter button
  - Enter filter values: title, artist, genre, key, bpm range, energy range
  - Filters apply in real-time
- **What Happens:**
  - `onChange` → updates filter state (e.g., `colFilterTitle`, `colFilterBpmMin`)
  - `filteredTracks` recalculates via useMemo
  - Track list updates to show only matching rows
- **API Calls:** None
- **Currently Tested:** NO
- **Priority:** MEDIUM

---

### 21. **BPM Tap Tempo**
- **Lines:** 2283–2299, 2833–2862, 647–680
- **User Actions:**
  - Click "Tap" button to open tap tempo modal
  - Tap (click) button repeatedly to the beat (minimum 3 taps)
  - BPM calculated from inter-tap intervals
  - Apply to selected track or as template
- **What Happens:**
  - Modal opens: `setShowBpmTap(true)`
  - Each tap: captures timestamp in `bpmTapTimes[]`
  - Once ≥3 taps: calculates BPM from average interval
  - Click "Apply BPM" → updates `selectedTrack.analysis.bpm`
  - Keyboard: `Space` or `T` to tap, `Escape` to close
- **API Calls:** None (updates local state only; would need save to persist)
- **Currently Tested:** NO
- **Priority:** MEDIUM

---

### 22. **Compatible Tracks Filter**
- **Lines:** 1520–1532, 2264–2278, 350
- **User Actions:**
  - Click "Compatible" button in mix panel
  - Toggles `showCompatibleOnly` state
  - When toggled ON: shows only tracks harmonically compatible with selected track
- **What Happens:**
  - `isMixCompatible()` checks: BPM ratio within 6%, compatible Camelot keys
  - `filteredTracks` recalculates to exclude incompatible tracks
  - UI shows count of compatible tracks
  - Button visual feedback (green when active)
- **API Calls:** None
- **Currently Tested:** NO
- **Priority:** MEDIUM

---

### 23. **Export Tracklist (CSV & TXT)**
- **Lines:** 376–401, 2323–2324
- **User Actions:**
  - Click "Export CSV" button → downloads CSV file
  - Click "Copy TXT" button → generates TXT, copies to clipboard or downloads
- **What Happens:**
  - `handleExportTracklist(format)` generates CSV/TXT from `filteredTracks`
  - Creates Blob, generates download link
  - Triggers browser download (filename: `tracklist_YYYY-MM-DD.csv/.txt`)
  - Toast confirms export
- **API Calls:** None
- **Currently Tested:** NO (tests check buttons exist, but NOT the download behavior)
- **Priority:** MEDIUM

---

### 24. **Export Rekordbox (XML)**
- **Lines:** 788–862, 1346–1355
- **User Actions:**
  - Right-click track → "Export Rekordbox" OR use export module
  - OR batch export selected tracks
- **What Happens:**
  - Calls `exportRekordbox(trackId)` API
  - API returns XML in Rekordbox format (includes cue points, metadata)
  - Browser downloads `.xml` file
  - Toast shows success
- **API Calls:** `GET /api/v1/tracks/{id}/export-rekordbox`
- **Currently Tested:** NO
- **Priority:** MEDIUM

---

### 25. **Add Cue Point Modal**
- **Lines:** 339–343, varies
- **User Actions:**
  - Click "+" button in cues section OR shortcut
  - Modal opens: input name, position (ms), type, color
  - Click "Create" → calls `createCuePoint()` API
  - Click "Cancel" → closes modal
- **What Happens:**
  - `setShowAddCue(true)` opens modal
  - Form inputs: `newCueName`, `newCuePos`, `newCueType`, `newCueColor`
  - On submit: calls `createCuePoint(trackId, {name, position_ms, ...})`
  - Updates `selectedTrack.cue_points[]`
  - Waveform regions update to show new cue
  - Toast confirms creation
- **API Calls:** `POST /api/v1/tracks/{id}/cue-points`
- **Currently Tested:** NO
- **Priority:** CRITICAL — core DJ feature

---

### 26. **Delete Cue Point**
- **Lines:** varies
- **User Actions:**
  - Right-click cue point button
  - OR click delete icon on cue point
  - Confirmation dialog appears
- **What Happens:**
  - Calls `deleteCuePoint(cueId)` API
  - Removes from `selectedTrack.cue_points[]`
  - Waveform region removed
  - Toast confirms deletion
- **API Calls:** `DELETE /api/v1/cue-points/{id}`
- **Currently Tested:** NO
- **Priority:** HIGH

---

### 27. **Cue Point Color Picker (Context menu)**
- **Lines:** 2080–2082
- **User Actions:**
  - Right-click on cue point button
  - Color picker appears at (x, y)
  - Click color to change cue point color
- **What Happens:**
  - `onContextMenu` → `setColorPickerCue(cueId)`
  - Color menu renders
  - Click color → updates `selectedTrack.cue_points[i].color`
  - Calls API to persist (if implemented)
  - Waveform region color updates
- **API Calls:** `PATCH /api/v1/cue-points/{id}` (if implemented)
- **Currently Tested:** NO
- **Priority:** MEDIUM

---

### 28. **Time Display Toggle (Current vs Remaining)**
- **Lines:** 1837
- **User Action:** Click time display (e.g., "1:23 / 5:00")
- **What Happens:**
  - Toggles `showRemainingTime` state
  - Display switches between elapsed time and remaining time countdown
  - Visual only (no API)
- **API Calls:** None
- **Currently Tested:** NO
- **Priority:** LOW

---

### 29. **Notes Toggle & Save**
- **Lines:** 1859, 1964
- **User Actions:**
  - Click "Notes" button to show/hide notes panel
  - Edit text in notes textarea
  - `onChange` saves to local `trackNotes` state
- **What Happens:**
  - `setShowNotes()` toggles panel visibility
  - Notes are stored in local state (not persisted to API)
  - Max 500 characters per track
- **API Calls:** None (local state only)
- **Currently Tested:** NO
- **Priority:** LOW

---

### 30. **Beat Grid Toggle**
- **Lines:** 1856, 581
- **User Action:** Click "Grid" button
- **What Happens:**
  - `setShowBeatGrid()` toggles grid visualization on waveform
  - Waveform renders beat lines at detected beat positions
  - Visual feedback: button highlights when active
- **API Calls:** None
- **Currently Tested:** NO
- **Priority:** LOW

---

### 31. **Keyboard Shortcuts Modal**
- **Lines:** 1862, 1132, 1158
- **User Actions:**
  - Click "?" button OR press `?` key
  - Modal opens showing all keyboard shortcuts
  - Click outside or Escape to close
- **What Happens:**
  - `setShowShortcuts()` toggles `showShortcuts` state
  - Modal renders with shortcut list
- **API Calls:** None
- **Currently Tested:** NO (partial — tests check modal exists)
- **Priority:** LOW

---

### 32. **Favorites Toggle (Show favorites only)**
- **Lines:** 409, 4018–4024
- **User Actions:**
  - Click star icon to favorite a track
  - Click "Favorites" button to filter to favorites only
- **What Happens:**
  - Star click toggles track ID in `favoriteIds` Set
  - Favorites button toggles `showFavoritesOnly`
  - `filteredTracks` recalculates to show only favorited tracks
- **API Calls:** None (local state only; not persisted)
- **Currently Tested:** NO
- **Priority:** MEDIUM

---

### 33. **Track Rating (1-5 stars)**
- **Lines:** 415–417
- **User Actions:**
  - Click on star rating in track row (1–5 stars)
  - Click again to toggle rating off (back to 0)
- **What Happens:**
  - `setRating(trackId, rating)` updates `trackRatings` state
  - Visual: star gets filled/unfilled
  - Local state only (not persisted to API)
- **API Calls:** None
- **Currently Tested:** NO
- **Priority:** MEDIUM

---

### 34. **Module Toggle (Sidebar buttons)**
- **Lines:** 1774
- **User Actions:**
  - Click module button (Smart Playlist, Duplicates, Export, Stats, etc.)
  - Module view opens/closes
  - Multiple modules cannot be open simultaneously
- **What Happens:**
  - Click → `setActiveModule()` to toggle
  - If opening: sets corresponding `setShow*` state (e.g., `setShowSmartPlaylist(true)`)
  - All other module displays close
  - Button highlights when active
- **API Calls:** Varies by module
- **Currently Tested:** NO
- **Priority:** MEDIUM

---

### 35. **Bulk Genre Update**
- **Lines:** 411–412, 484–507, 4262–4297
- **User Actions:**
  - Select multiple tracks
  - Right-click → "Mettre à jour le genre" or use bulk edit
  - Modal opens
  - Enter genre name
  - Click "Update" → applies to all selected tracks
- **What Happens:**
  - `setShowBulkGenre(true)` opens modal
  - `onChange` updates `bulkGenreValue`
  - Click "Update" → calls `bulkUpdateGenre()`
  - Loops through `selectedIds` and calls PATCH `/tracks/{id}` for each
  - Updates `tracks[]` array with responses
  - Toast shows "X updated"
  - Modal closes, selection clears
- **API Calls:** `PATCH /api/v1/tracks/{id}` (multiple, in loop)
- **Currently Tested:** NO
- **Priority:** MEDIUM

---

### 36. **Plan Feature Toggle (Admin only)**
- **Lines:** 297–310, 629
- **User Actions:** (admin only)
  - Click "Plan Admin" module
  - Toggle feature enabled/disabled for each plan
  - Click "Reset Features" button
- **What Happens:**
  - `togglePlanFeature(plan, feature, enabled)` → PATCH admin API
  - Updates `planFeatures` state
  - Displays "enabled/disabled" feedback
  - `resetPlanFeatures()` → POST admin API → resets all to defaults
- **API Calls:** `PATCH /api/v1/admin/plan-features/{plan}/{feature}`, `POST /api/v1/admin/plan-features/reset`
- **Currently Tested:** NO
- **Priority:** LOW (admin-only feature)

---

### 37. **TrackOrganizer Modal**
- **Lines:** 255, 1434–1449
- **User Actions:**
  - Click "Organize" option in context menu or sidebar
  - Modal opens with organizer UI (mocked in tests)
  - Perform organization actions
  - Click "Close" → modal closes
- **What Happens:**
  - `setOrganizerTrack(track)` opens modal
  - TrackOrganizer component receives track data
  - On close: `setOrganizerTrack(null)`
- **API Calls:** Depends on TrackOrganizer implementation
- **Currently Tested:** Partial — component renders but user interactions NOT tested
- **Priority:** MEDIUM

---

### 38. **Re-analyze Single Track**
- **Lines:** 725–787
- **User Actions:**
  - Right-click track → "Re-analyser"
  - Calls `reanalyzeTrack(trackId)`
- **What Happens:**
  - Shows loading state
  - Calls `analyzeTrack(trackId)` API
  - Calls `pollTrackUntilDone(trackId)` to wait for completion
  - Refreshes `selectedTrack` with new analysis data
  - Shows success toast
- **API Calls:** `POST /api/v1/tracks/{id}/analyze`, `GET /api/v1/tracks/{id}` (polling)
- **Currently Tested:** NO
- **Priority:** MEDIUM

---

### 39. **Auto-Analyze Toggle (On upload)**
- **Lines:** 414
- **User Actions:**
  - Toggle auto-analyze option (usually in settings)
  - When enabled: newly uploaded tracks are automatically analyzed
- **What Happens:**
  - If `autoAnalyze` is true after upload
  - Calls `analyzeTrack()` for each uploaded track
  - Shows progress + toast
  - Updates tracks with analysis data
- **API Calls:** `POST /api/v1/tracks/{id}/analyze`
- **Currently Tested:** NO
- **Priority:** MEDIUM

---

### 40. **Play History & Mix Log**
- **Lines:** 354–355, 455–464
- **User Actions:**
  - Select tracks (auto-logged on selection)
  - View play history panel
  - View mix transition scores
- **What Happens:**
  - On track selection: adds to `playHistory` array (last 50)
  - When switching tracks: logs mix transition in `mixLog` (last 100)
  - Calculates `mixScore()` between previous & current track
  - Stores: fromId, toId, score, timestamp
  - No API persistence (local state only)
- **API Calls:** None
- **Currently Tested:** NO
- **Priority:** LOW

---

### 41. **Sidebar Collapse/Expand**
- **Lines:** 1770
- **User Actions:**
  - Click collapse button on sidebar module groups
  - Group collapses/expands
- **What Happens:**
  - `setSidebarCollapsed(prev => ({...prev, [groupId]: !prev[groupId]}))`
  - Group modules hide/show
  - State likely not persisted (local only)
- **API Calls:** None
- **Currently Tested:** NO
- **Priority:** LOW

---

### 42. **Progress Bar Scrubbing (Seek)**
- **Lines:** 1943–1946
- **User Actions:**
  - Click on progress bar at any position
  - Dragging progress handle (if implemented)
- **What Happens:**
  - `onClick` calculates position: `(clickX / barWidth) * duration`
  - Calls `wavesurferRef.seekTo(normalizedPosition)`
  - Updates `currentTime` state
  - Playhead jumps to clicked position
- **API Calls:** None
- **Currently Tested:** NO
- **Priority:** HIGH

---

### 43. **Mix Suggestions (based on compatibility)**
- **Lines:** 686, 1520–1532, 2269–2306
- **User Actions:**
  - Click "Find Mixes" or similar in mix panel
  - Algorithm finds best harmonically compatible tracks
  - Click a suggestion to select that track
- **What Happens:**
  - Calculates `mixScore()` for all non-selected tracks vs current
  - Filters to top matches (score >= threshold)
  - Renders clickable list of compatible tracks
  - Click suggestion → `setSelectedTrack(compatibleTrack)`
- **API Calls:** None (all client-side calculation)
- **Currently Tested:** NO
- **Priority:** MEDIUM

---

### 44. **Waveform Theme Color Selector**
- **Lines:** 1869–1871, 256
- **User Actions:**
  - Click colored circle button to select waveform theme
  - 6+ theme options (purple, cyan, green, orange, red, etc.)
- **What Happens:**
  - `setWaveformTheme(key)` updates theme
  - Waveform re-renders with new color palette
  - Button highlights (scale, ring) when active
  - Theme likely not persisted
- **API Calls:** None
- **Currently Tested:** Partial — theme buttons exist, but click handlers NOT tested
- **Priority:** LOW

---

### 45. **Main Container Click (Deselect context menu)**
- **Lines:** 1666–1667
- **User Actions:**
  - Click anywhere in main waveform area
  - If context menu open: closes it
- **What Happens:**
  - Main container has `onClick={() => setCtxMenu(null)}`
  - Context menu disappears
  - Prevents accidental menu interaction
- **API Calls:** None
- **Currently Tested:** NO (partial; context menu rendering exists)
- **Priority:** LOW

---

### 46. **Metadata Suggestions (from Last.fm, MusicBrainz, etc.)**
- **Lines:** 252–254
- **User Actions:**
  - Right-click track → "Get Metadata"
  - OR in metadata editor: click "Fetch suggestions"
  - API fetches external metadata
  - Accept suggested values in form
- **What Happens:**
  - Calls external metadata API (Last.fm, MusicBrainz, etc.)
  - Sets `metadataSuggestions` state
  - Shows suggestions in metadata modal
  - User can accept/reject each field
  - Click save → merges accepted suggestions + edits
- **API Calls:** `POST /api/v1/tracks/{id}/fetch-metadata` or similar
- **Currently Tested:** NO
- **Priority:** MEDIUM

---

### 47. **Duplicate Detection**
- **Lines:** 1222, 618
- **User Actions:**
  - Upload file with same `original_filename` as existing track
  - System detects duplicate
  - Toast shows: "Duplicate detected: filename already exists"
  - Upload is rejected (not added to state)
- **What Happens:**
  - `handleFiles()` checks if `originalFilename` already in library
  - If match found: shows error toast, skips that file
  - Other files in batch continue processing
- **API Calls:** None (local library check)
- **Currently Tested:** NO
- **Priority:** MEDIUM

---

## Tests Currently Passing

From `/dashboard-buttons.test.tsx`:
1. ✅ Initial load: tracks + user fetched
2. ✅ Track titles display
3. ✅ Upload button exists
4. ✅ File input exists
5. ✅ Search input exists
6. ✅ Sort direction toggle visible
7. ✅ Player controls visible (play/pause, skip buttons, volume, zoom)
8. ✅ Loop controls visible (IN, OUT, LOOP buttons)
9. ✅ Playback rate display visible
10. ✅ Batch analyze button visible (when selected)
11. ✅ Waveform theme buttons visible
12. ✅ Context menu icons visible
13. ✅ Export buttons visible
14. ✅ Sidebar module buttons visible

---

## Critical Gaps (Must Have Tests)

1. **User Interaction Handlers** — All click/change handlers are NOT tested
   - Play/pause toggle
   - Skip forward/back
   - Volume slider + mute
   - Seek on progress bar
   - Playback rate +/-

2. **Delete & Confirmation** — No test for delete flow + confirm dialog

3. **Keyboard Shortcuts** — No test for arrow keys, space, delete, ?, /

4. **Loop Feature** — IN/OUT/LOOP buttons not tested

5. **Upload & Drag-Drop** — File handling not tested

6. **Metadata Edit** — Modal form + save not tested

7. **Cue Point Operations** — Create/delete/color change not tested

8. **Search & Filter** — Real-time filtering not tested

9. **Sort** — Sort order changes not tested

10. **Batch Operations** — Multi-select + batch analyze not tested

---

## Recommended Test Priorities

### Phase 1 (Critical — Core Playback)
- [ ] Play/Pause toggle
- [ ] Skip forward/back
- [ ] Volume slider + mute
- [ ] Seek on progress bar
- [ ] Playback rate control
- [ ] Loop IN/OUT/LOOP activation
- [ ] Cue point seek
- [ ] Keyboard shortcuts (arrows, space, delete)

### Phase 2 (High — Data Operations)
- [ ] Track selection + navigation
- [ ] Metadata edit modal + save
- [ ] Delete track + confirmation
- [ ] Cue point add/delete
- [ ] Batch analyze
- [ ] Multi-select checkboxes

### Phase 3 (Medium — Advanced Features)
- [ ] Drag & drop upload
- [ ] File input upload
- [ ] Search + filter behavior
- [ ] Sort order changes
- [ ] Column visibility toggle
- [ ] Export CSV/TXT/Rekordbox
- [ ] BPM tap tempo
- [ ] Mix compatibility filter
- [ ] Context menu actions

### Phase 4 (Low — Polish)
- [ ] Waveform zoom
- [ ] Beat grid toggle
- [ ] Notes panel
- [ ] Shortcuts modal
- [ ] Favorites toggle
- [ ] Track rating
- [ ] Time display toggle
- [ ] Sidebar collapse
- [ ] Waveform theme color

---

## Test Implementation Strategy

1. **Unit Tests** — Individual functions (`togglePlay`, `skipBack`, etc.)
2. **Integration Tests** — Feature flows (upload → analyze → select → play)
3. **E2E Tests** — Full user journeys (keyboard nav + playback + cue editing)
4. **Mock Strategy** — WaveSurfer, File APIs, drag/drop events already mocked in existing tests

---

## File Locations

- **Component:** `/sessions/kind-pensive-lovelace/cueforge-saas/frontend/app/dashboard/DashboardClient.tsx`
- **Existing Tests:** `/sessions/kind-pensive-lovelace/cueforge-saas/frontend/__tests__/dashboard-buttons.test.tsx`
- **Test Strategy Skill:** Could use `cueforge-tests:write-tests` skill to scaffold new tests
