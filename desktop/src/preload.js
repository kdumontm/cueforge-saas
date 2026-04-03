'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('cueforge', {
  // ── Fichiers locaux ──────────────────────────────────────
  getFilePath:      (file) => webUtils.getPathForFile(file),
  openFileDialog:   ()     => ipcRenderer.invoke('open-file-dialog'),
  readMetadata:     (p)    => ipcRenderer.invoke('read-metadata', p),
  readAudioBuffer:  (p)    => ipcRenderer.invoke('read-audio-buffer', p),
  revealInFinder:   (p)    => ipcRenderer.invoke('reveal-in-finder', p),
  saveTextFile: (content, name, filter, ext) => ipcRenderer.invoke('save-text-file', content, name, filter, ext),

  // ── DB locale (legacy — sera remplacé progressivement) ───
  upsertTrack:      (d)    => ipcRenderer.invoke('upsert-track', d),
  updateAnalysis:   (id, d)=> ipcRenderer.invoke('update-analysis', id, d),
  getTracks:        ()     => ipcRenderer.invoke('get-tracks'),
  searchTracks:     (q)    => ipcRenderer.invoke('search-tracks', q),
  deleteTrack:      (id)   => ipcRenderer.invoke('delete-track', id),
  exportRekordbox:  (ids)  => ipcRenderer.invoke('export-rekordbox', ids),
  exportSerato:     (ids)  => ipcRenderer.invoke('export-serato', ids),

  // ── Auth (licenseCheck) ──────────────────────────────────
  verifyLicense:    ()     => ipcRenderer.invoke('verify-license'),
  login:   (email, pwd)    => ipcRenderer.invoke('login', email, pwd),
  logout:           ()     => ipcRenderer.invoke('logout'),
  getStoredEmail:   ()     => ipcRenderer.invoke('get-stored-email'),
  getToken:         ()     => ipcRenderer.invoke('get-token'),
  getUser:          ()     => ipcRenderer.invoke('get-user'),

  // ── Profile / Settings ───────────────────────────────────
  getProfile:       ()          => ipcRenderer.invoke('get-profile'),
  updateProfile:    (data)      => ipcRenderer.invoke('update-profile', data),
  changePassword:   (cur, newP) => ipcRenderer.invoke('change-password', cur, newP),

  // ── Admin ────────────────────────────────────────────────
  getAdminDashboard: ()           => ipcRenderer.invoke('get-admin-dashboard'),
  getAdminUsers:     (s, p)       => ipcRenderer.invoke('get-admin-users', s, p),
  updateAdminUser:   (id, data)   => ipcRenderer.invoke('update-admin-user', id, data),
  getAdminFeatures:  ()           => ipcRenderer.invoke('get-admin-features'),
  updateAdminFeature:(id, data)   => ipcRenderer.invoke('update-admin-feature', id, data),
  createAdminFeature:(data)       => ipcRenderer.invoke('create-admin-feature', data),
  deleteAdminFeature:(id)         => ipcRenderer.invoke('delete-admin-feature', id),

  // ── Events (drag & drop, mise à jour) ────────────────────
  onFilesDropped:     (cb) => ipcRenderer.on('files-dropped',    (_, files) => cb(files)),
  onUpdateAvailable:  (cb) => ipcRenderer.on('update-available',  (_, info)  => cb(info)),
  onUpdateProgress:   (cb) => ipcRenderer.on('update-progress',   (_, data)  => cb(data)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', (_, info)  => cb(info)),
  onUpdateError:      (cb) => ipcRenderer.on('update-error',      (_, msg)   => cb(msg)),
  checkForUpdates:    ()   => ipcRenderer.invoke('check-for-updates'),
  installUpdate:      ()   => ipcRenderer.invoke('install-update'),
  downloadDmgUpdate:  (v)  => ipcRenderer.invoke('download-dmg-update', v),
  getAppVersion:      ()   => ipcRenderer.invoke('get-app-version'),

  // ═══════════════════════════════════════════════════════════
  // ████  API REMOTE — Mêmes endpoints que le web  ████
  // ═══════════════════════════════════════════════════════════

  api: {
    // ── Tracks ──────────────────────────────────────────────
    tracks: {
      upload:          (filePath)      => ipcRenderer.invoke('api-tracks-upload', filePath),
      list:            (page, limit)   => ipcRenderer.invoke('api-tracks-list', page, limit),
      get:             (id)            => ipcRenderer.invoke('api-tracks-get', id),
      update:          (id, data)      => ipcRenderer.invoke('api-tracks-update', id, data),
      delete:          (id)            => ipcRenderer.invoke('api-tracks-delete', id),
      audioUrl:        (id)            => ipcRenderer.invoke('api-tracks-audio-url', id),
      analyze:         (id)            => ipcRenderer.invoke('api-tracks-analyze', id),
      cleanTitle:      (id)            => ipcRenderer.invoke('api-tracks-clean-title', id),
      parseRemix:      (id)            => ipcRenderer.invoke('api-tracks-parse-remix', id),
      detectGenre:     (id)            => ipcRenderer.invoke('api-tracks-detect-genre', id),
      identify:        (id)            => ipcRenderer.invoke('api-tracks-identify', id),
      identifySearch:  (id)            => ipcRenderer.invoke('api-tracks-identify-search', id),
      spotifyLookup:   (id)            => ipcRenderer.invoke('api-tracks-spotify-lookup', id),
      spotifyApply:    (id)            => ipcRenderer.invoke('api-tracks-spotify-apply', id),
      fixTags:         (id)            => ipcRenderer.invoke('api-tracks-fix-tags', id),
      compatible:      (id, limit)     => ipcRenderer.invoke('api-tracks-compatible', id, limit),
      recordPlay:      (id, ctx)       => ipcRenderer.invoke('api-tracks-record-play', id, ctx),
      getHistory:      (id)            => ipcRenderer.invoke('api-tracks-history', id),
      clearHistory:    ()              => ipcRenderer.invoke('api-tracks-clear-history'),
      getBeatgrid:     (id)            => ipcRenderer.invoke('api-tracks-beatgrid', id),
      updateBeatgrid:  (id, data)      => ipcRenderer.invoke('api-tracks-update-beatgrid', id, data),
      updateMetadata:  (id, data)      => ipcRenderer.invoke('api-tracks-update-metadata', id, data),
      getCategories:   ()              => ipcRenderer.invoke('api-tracks-categories'),
      getTags:         ()              => ipcRenderer.invoke('api-tracks-tags'),
    },

    // ── Cue Points ──────────────────────────────────────────
    cues: {
      list:        (trackId)                      => ipcRenderer.invoke('api-cues-list', trackId),
      create:      (trackId, data)                => ipcRenderer.invoke('api-cues-create', trackId, data),
      update:      (cueId, data)                  => ipcRenderer.invoke('api-cues-update', cueId, data),
      delete:      (cueId)                        => ipcRenderer.invoke('api-cues-delete', cueId),
      copyCues:    (trackId, sourceId, loops)      => ipcRenderer.invoke('api-cues-copy', trackId, sourceId, loops),
      generate:    (trackId)                      => ipcRenderer.invoke('api-cues-generate', trackId),
      getAnalysis: (trackId)                      => ipcRenderer.invoke('api-cues-analysis', trackId),
      getRules:    (trackId)                      => ipcRenderer.invoke('api-cues-rules', trackId),
      createRule:  (trackId, data)                => ipcRenderer.invoke('api-cues-create-rule', trackId, data),
      updateRule:  (trackId, ruleId, data)        => ipcRenderer.invoke('api-cues-update-rule', trackId, ruleId, data),
      deleteRule:  (trackId, ruleId)              => ipcRenderer.invoke('api-cues-delete-rule', trackId, ruleId),
    },

    // ── Hot Cues ────────────────────────────────────────────
    hotCues: {
      list:    (trackId)                => ipcRenderer.invoke('api-hotcues-list', trackId),
      create:  (trackId, data)          => ipcRenderer.invoke('api-hotcues-create', trackId, data),
      update:  (trackId, cueId, data)   => ipcRenderer.invoke('api-hotcues-update', trackId, cueId, data),
      delete:  (trackId, cueId)         => ipcRenderer.invoke('api-hotcues-delete', trackId, cueId),
      reorder: (trackId, items)         => ipcRenderer.invoke('api-hotcues-reorder', trackId, items),
    },

    // ── Loops ───────────────────────────────────────────────
    loops: {
      list:    (trackId)        => ipcRenderer.invoke('api-loops-list', trackId),
      create:  (trackId, data)  => ipcRenderer.invoke('api-loops-create', trackId, data),
      update:  (loopId, data)   => ipcRenderer.invoke('api-loops-update', loopId, data),
      delete:  (loopId)         => ipcRenderer.invoke('api-loops-delete', loopId),
    },

    // ── Waveforms ───────────────────────────────────────────
    waveforms: {
      get:        (trackId) => ipcRenderer.invoke('api-waveforms-get', trackId),
      generate:   (trackId) => ipcRenderer.invoke('api-waveforms-generate', trackId),
      regenerate: (trackId) => ipcRenderer.invoke('api-waveforms-regenerate', trackId),
    },

    // ── Playlists ───────────────────────────────────────────
    playlists: {
      list:        (parentId)          => ipcRenderer.invoke('api-playlists-list', parentId),
      get:         (id)                => ipcRenderer.invoke('api-playlists-get', id),
      create:      (data)              => ipcRenderer.invoke('api-playlists-create', data),
      update:      (id, data)          => ipcRenderer.invoke('api-playlists-update', id, data),
      delete:      (id)                => ipcRenderer.invoke('api-playlists-delete', id),
      addTracks:   (id, trackIds)      => ipcRenderer.invoke('api-playlists-add-tracks', id, trackIds),
      removeTrack: (id, trackId)       => ipcRenderer.invoke('api-playlists-remove-track', id, trackId),
      reorder:     (id, items)         => ipcRenderer.invoke('api-playlists-reorder', id, items),
      duplicate:   (id)                => ipcRenderer.invoke('api-playlists-duplicate', id),
    },

    // ── Smart Crates ────────────────────────────────────────
    crates: {
      list:   ()           => ipcRenderer.invoke('api-crates-list'),
      get:    (id)         => ipcRenderer.invoke('api-crates-get', id),
      create: (data)       => ipcRenderer.invoke('api-crates-create', data),
      update: (id, data)   => ipcRenderer.invoke('api-crates-update', id, data),
      delete: (id)         => ipcRenderer.invoke('api-crates-delete', id),
    },

    // ── DJ Sets ─────────────────────────────────────────────
    sets: {
      list:        ()              => ipcRenderer.invoke('api-sets-list'),
      get:         (id)            => ipcRenderer.invoke('api-sets-get', id),
      create:      (data)          => ipcRenderer.invoke('api-sets-create', data),
      update:      (id, data)      => ipcRenderer.invoke('api-sets-update', id, data),
      delete:      (id)            => ipcRenderer.invoke('api-sets-delete', id),
      addTrack:    (id, data)      => ipcRenderer.invoke('api-sets-add-track', id, data),
      removeTrack: (id, trackId)   => ipcRenderer.invoke('api-sets-remove-track', id, trackId),
      reorder:     (id, items)     => ipcRenderer.invoke('api-sets-reorder', id, items),
      suggestNext: (id, limit)     => ipcRenderer.invoke('api-sets-suggest-next', id, limit),
      getStats:    (id)            => ipcRenderer.invoke('api-sets-stats', id),
    },

    // ── Analytics ───────────────────────────────────────────
    analytics: {
      get:        ()         => ipcRenderer.invoke('api-analytics'),
      recordPlay: (trackId)  => ipcRenderer.invoke('api-analytics-play', trackId),
    },

    // ── Export ───────────────────────────────────────────────
    export: {
      rekordbox:       (trackId)          => ipcRenderer.invoke('api-export-rekordbox', trackId),
      rekordboxJson:   (trackId)          => ipcRenderer.invoke('api-export-rekordbox-json', trackId),
      rekordboxBatch:  (trackIds, name)   => ipcRenderer.invoke('api-export-rekordbox-batch', trackIds, name),
      rekordboxAll:    (name)             => ipcRenderer.invoke('api-export-rekordbox-all', name),
      serato:          (trackId)          => ipcRenderer.invoke('api-export-serato', trackId),
      playlistM3u:     (plId)             => ipcRenderer.invoke('api-export-playlist-m3u', plId),
      setRekordbox:    (setId)            => ipcRenderer.invoke('api-export-set-rekordbox', setId),
      setM3u:          (setId)            => ipcRenderer.invoke('api-export-set-m3u', setId),
      allFormats:      (trackId)          => ipcRenderer.invoke('api-export-all-formats', trackId),
    },

    // ── Import DJ ───────────────────────────────────────────
    import: {
      rekordbox: (filePath) => ipcRenderer.invoke('api-import-rekordbox', filePath),
      serato:    (filePath) => ipcRenderer.invoke('api-import-serato', filePath),
      traktor:   (filePath) => ipcRenderer.invoke('api-import-traktor', filePath),
    },

    // ── Advanced (Stems, Duplicates) ────────────────────────
    advanced: {
      stemsCheck:  ()                    => ipcRenderer.invoke('api-stems-check'),
      stemsStart:  (trackId)             => ipcRenderer.invoke('api-stems-start', trackId),
      stemsStatus: (trackId)             => ipcRenderer.invoke('api-stems-status', trackId),
      stemFile:    (trackId, stemName)   => ipcRenderer.invoke('api-stems-file', trackId, stemName),
      duplicates:  (method, threshold)   => ipcRenderer.invoke('api-duplicates', method, threshold),
      autoCues:    (trackId, style)      => ipcRenderer.invoke('api-auto-cues', trackId, style),
    },

    // ── Mix Analyzer ────────────────────────────────────────
    mixAnalyzer: {
      upload:    (filePath) => ipcRenderer.invoke('api-mix-upload', filePath),
      getStatus: (jobId)    => ipcRenderer.invoke('api-mix-status', jobId),
    },

    // ── Billing ─────────────────────────────────────────────
    billing: {
      getPlans:    ()                    => ipcRenderer.invoke('api-billing-plans'),
      getCurrent:  ()                    => ipcRenderer.invoke('api-billing-current'),
      getUsage:    ()                    => ipcRenderer.invoke('api-billing-usage'),
      subscribe:   (planId, interval)    => ipcRenderer.invoke('api-billing-subscribe', planId, interval),
      getPortalUrl:()                    => ipcRenderer.invoke('api-billing-portal'),
    },

    // ── Downloads ───────────────────────────────────────────
    downloads: {
      getInfo:      ()       => ipcRenderer.invoke('api-downloads-info'),
      getConfig:    ()       => ipcRenderer.invoke('api-downloads-config'),
      updateConfig: (data)   => ipcRenderer.invoke('api-downloads-update-config', data),
    },
  },
});
