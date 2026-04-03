'use strict';
const {
  app, BrowserWindow, ipcMain, dialog, shell,
  nativeImage, Tray, Menu, session, webUtils,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

// ─── Services (lazy-loaded après app.ready) ─────────────
let db, licenseCheck, rekordboxExport, seratoExport, api, dataLayer;

function loadServices() {
  db           = require('../services/database');
  licenseCheck = require('../services/licenseCheck');
  rekordboxExport = require('../services/rekordboxExport');
  seratoExport    = require('../services/seratoExport');
  api             = require('../services/apiClient');
  dataLayer       = require('../services/dataLayer');
}

// ─── Window ────────────────────────────────────────────
let mainWindow = null;
let tray       = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0a0a',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    autoHideMenuBar: isWin,
    icon: isMac ? undefined : path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Autoriser drag & drop depuis le Finder / Explorateur
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('close', (e) => {
    if (isMac && !app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
  return mainWindow;
}

// ─── App lifecycle ─────────────────────────────────────
app.whenReady().then(() => {
  // ── Sur macOS, proposer de déplacer l'app dans /Applications ──
  // Sans ça, l'auto-updater ne peut pas remplacer le binaire
  if (isMac && !app.isInApplicationsFolder()) {
    const choice = dialog.showMessageBoxSync({
      type: 'question',
      buttons: ['Déplacer dans Applications', 'Continuer sans déplacer'],
      defaultId: 0,
      title: 'CueForge',
      message: 'CueForge doit être dans le dossier Applications',
      detail: 'Pour que les mises à jour automatiques fonctionnent, CueForge doit être dans /Applications.\n\nVoulez-vous le déplacer maintenant ?',
    });
    if (choice === 0) {
      try {
        app.moveToApplicationsFolder();
        return; // L'app redémarre depuis /Applications
      } catch (err) {
        console.error('Failed to move to Applications:', err);
      }
    }
  }

  loadServices();
  createWindow();
  createTray();
  setupIPC();
  setupAutoUpdater();
  setupDragAndDrop();

  app.on('activate', () => {
    if (mainWindow === null) createWindow();
    else mainWindow.show();
  });
});

app.on('before-quit', () => { app.isQuitting = true; });
app.on('window-all-closed', () => { if (!isMac) app.quit(); });

// ─── Tray ──────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  if (!fs.existsSync(iconPath)) return;

  const icon = nativeImage.createFromPath(iconPath);
  if (isMac) icon.setTemplateImage(true);
  tray = new Tray(icon);

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Ouvrir CueForge', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Quitter', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
  tray.setToolTip('CueForge');
  tray.on('click', () => mainWindow?.show());
}

// ─── IPC Handlers ──────────────────────────────────────
function setupIPC() {

  // ── Obtenir le chemin d'un fichier droppé ────────────
  ipcMain.handle('get-file-path', (e, file) => {
    try {
      // webUtils.getPathForFile n'est pas accessible depuis ipcMain
      // On utilise le path qui vient du preload via webUtils
      return null;
    } catch { return null; }
  });

  // ── Ouvrir dialogue de fichiers ──────────────────────
  ipcMain.handle('open-file-dialog', async () => {
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'flac', 'wav', 'm4a', 'aiff', 'ogg', 'opus', 'wma'] }],
    });
    return filePaths || [];
  });

  // ── Lire les métadonnées d'un fichier audio ──────────
  ipcMain.handle('read-metadata', async (e, filePath) => {
    try {
      const { parseFile } = require('music-metadata');
      const stat = fs.statSync(filePath);
      const meta = await parseFile(filePath, { duration: true, skipCovers: true });
      return {
        title:    meta.common.title   || null,
        artist:   meta.common.artist  || null,
        album:    meta.common.album   || null,
        bpm:      meta.common.bpm     || null,
        key:      meta.common.key     || null,
        duration: meta.format.duration || 0,
        format:   meta.format.container || path.extname(filePath).slice(1).toUpperCase(),
        fileSize: stat.size,
      };
    } catch (err) {
      return { error: err.message };
    }
  });

  // ── Sauvegarder un track en DB ───────────────────────
  ipcMain.handle('upsert-track', (e, data) => {
    return db.upsertTrack(data);
  });

  // ── Mettre à jour l'analyse d'un track ───────────────
  ipcMain.handle('update-analysis', (e, id, analysisData) => {
    db.updateAnalysis(id, analysisData);
    return db.getTrack(id);
  });

  // ── Récupérer tous les tracks ────────────────────────
  ipcMain.handle('get-tracks', () => {
    return db.getAllTracks();
  });

  // ── Rechercher des tracks ────────────────────────────
  ipcMain.handle('search-tracks', (e, query) => {
    return db.searchTracks(query);
  });

  // ── Supprimer un track ───────────────────────────────
  ipcMain.handle('delete-track', (e, id) => {
    db.deleteTrack(id);
    return true;
  });

  // ── Export Rekordbox ─────────────────────────────────
  ipcMain.handle('export-rekordbox', async (e, trackIds) => {
    const tracks = trackIds
      ? trackIds.map(id => db.getTrack(id)).filter(Boolean)
      : db.getAllTracks();

    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: 'CueForge_Rekordbox.xml',
      filters: [{ name: 'Rekordbox XML', extensions: ['xml'] }],
    });
    if (!filePath) return null;

    rekordboxExport.exportRekordbox(tracks, filePath);
    shell.showItemInFolder(filePath);
    return filePath;
  });

  // ── Export Serato ────────────────────────────────────
  ipcMain.handle('export-serato', async (e, trackIds) => {
    const tracks = trackIds
      ? trackIds.map(id => db.getTrack(id)).filter(Boolean)
      : db.getAllTracks();

    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: 'CueForge_Serato',
      properties: ['createDirectory'],
    });
    if (!filePath) return null;

    const result = seratoExport.exportSerato(tracks, filePath);
    shell.showItemInFolder(result.summaryPath);
    return result;
  });

  // ── Vérification licence (1 appel / 24h max) ─────────
  ipcMain.handle('verify-license', async () => {
    return await licenseCheck.verifyLicense();
  });

  // ── Login ─────────────────────────────────────────────
  ipcMain.handle('login', async (e, email, password) => {
    try {
      const result = await licenseCheck.login(email, password);
      // Récupérer le profil après login pour avoir les infos complètes
      let user = { email };
      try { user = await licenseCheck.getProfile(); } catch {}
      return { success: true, token: result.access_token, user };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ── Logout ────────────────────────────────────────────
  ipcMain.handle('logout', () => {
    licenseCheck.logout();
    return true;
  });

  // ── Ouvrir fichier dans le Finder ─────────────────────
  ipcMain.handle('reveal-in-finder', (e, filePath) => {
    shell.showItemInFolder(filePath);
  });

  // ── Lire un fichier audio comme ArrayBuffer ───────────
  // (pour l'analyse dans le renderer sans fetch file://)
  ipcMain.handle('read-audio-buffer', (e, filePath) => {
    try {
      const buffer = fs.readFileSync(filePath);
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    } catch (err) {
      throw new Error(`Cannot read file: ${err.message}`);
    }
  });

  // ── Infos utilisateur stockées ────────────────────────
  ipcMain.handle('get-stored-email', () => licenseCheck.getStoredEmail());

  // ── Profile / Settings ──────────────────────────────
  ipcMain.handle('get-profile', () => licenseCheck.getProfile());
  ipcMain.handle('update-profile', (e, data) => licenseCheck.updateProfile(data));
  ipcMain.handle('change-password', (e, current, newPwd) => licenseCheck.changePassword(current, newPwd));

  // ── Admin ───────────────────────────────────────────
  ipcMain.handle('get-admin-dashboard', () => licenseCheck.getAdminDashboard());
  ipcMain.handle('get-admin-users', (e, search, plan) => licenseCheck.getAdminUsers(search, plan));
  ipcMain.handle('update-admin-user', (e, userId, data) => licenseCheck.updateAdminUser(userId, data));
  ipcMain.handle('get-admin-features', () => licenseCheck.getAdminFeatures());
  ipcMain.handle('update-admin-feature', (e, id, data) => licenseCheck.updateAdminFeature(id, data));
  ipcMain.handle('create-admin-feature', (e, data) => licenseCheck.createAdminFeature(data));
  ipcMain.handle('delete-admin-feature', (e, id) => licenseCheck.deleteAdminFeature(id));

  // ── Sauvegarder un fichier texte (export M3U, CSV, JSON) ──
  ipcMain.handle('save-text-file', async (e, content, defaultName, filterName, ext) => {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName,
      filters: [{ name: filterName, extensions: [ext] }],
    });
    if (!filePath) return null;
    fs.writeFileSync(filePath, content, 'utf-8');
    shell.showItemInFolder(filePath);
    return filePath;
  });

  // ── Token / User (auto-login) ──────────────────────────
  ipcMain.handle('get-token', () => licenseCheck.getStoredToken());
  ipcMain.handle('get-user', async () => {
    try { return await licenseCheck.getProfile(); }
    catch { return null; }
  });

  // ── Version de l'app ───────────────────────────────────
  ipcMain.handle('get-app-version', () => app.getVersion());

  // ── Check for updates (retourne un résultat structuré) ──
  ipcMain.handle('check-for-updates', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      if (result && result.updateInfo) {
        const currentVersion = app.getVersion();
        const remoteVersion = result.updateInfo.version;
        // Comparer les versions — seulement signaler si la remote est plus récente
        const isNewer = remoteVersion !== currentVersion &&
          remoteVersion.localeCompare(currentVersion, undefined, { numeric: true }) > 0;
        return { available: isNewer, version: isNewer ? remoteVersion : currentVersion };
      }
      return { available: false, version: app.getVersion() };
    } catch (err) {
      return { available: false, error: err.message, version: app.getVersion() };
    }
  });

  // ── Installer la mise à jour téléchargée et redémarrer ──
  ipcMain.handle('install-update', () => {
    installAndRestart();
  });

  // ═══════════════════════════════════════════════════════════
  // ████  DATA LAYER — Hybride Local + Cloud  ████
  // ═══════════════════════════════════════════════════════════

  // ── Status & Sync ──
  ipcMain.handle('data-check-connectivity', () => dataLayer.checkConnectivity());
  ipcMain.handle('data-is-online', () => dataLayer.isOnline());
  ipcMain.handle('data-sync-status', () => dataLayer.sync.getStatus());
  ipcMain.handle('data-sync-push', () => dataLayer.sync.pushAll());
  ipcMain.handle('data-sync-pull', () => dataLayer.sync.pullAll());
  ipcMain.handle('data-sync-full', () => dataLayer.sync.fullSync());

  // ── Tracks hybrides ──
  ipcMain.handle('data-tracks-list', (e, page, limit) => dataLayer.tracks.list(page, limit));
  ipcMain.handle('data-tracks-get', (e, id) => dataLayer.tracks.get(id));
  ipcMain.handle('data-tracks-upload', (e, filePath) => dataLayer.tracks.upload(filePath));
  ipcMain.handle('data-tracks-update', (e, id, data) => dataLayer.tracks.update(id, data));
  ipcMain.handle('data-tracks-delete', (e, id) => dataLayer.tracks.delete(id));
  ipcMain.handle('data-tracks-analyze', (e, id) => dataLayer.tracks.analyze(id));
  ipcMain.handle('data-tracks-identify', (e, id) => dataLayer.tracks.identify(id));
  ipcMain.handle('data-tracks-spotify-lookup', (e, id) => dataLayer.tracks.spotifyLookup(id));
  ipcMain.handle('data-tracks-spotify-apply', (e, id) => dataLayer.tracks.spotifyApply(id));
  ipcMain.handle('data-tracks-compatible', (e, id, limit) => dataLayer.tracks.compatible(id, limit));
  ipcMain.handle('data-tracks-search', (e, query) => dataLayer.tracks.search(query));
  ipcMain.handle('data-tracks-clean-title', (e, id) => dataLayer.tracks.cleanTitle(id));
  ipcMain.handle('data-tracks-parse-remix', (e, id) => dataLayer.tracks.parseRemix(id));
  ipcMain.handle('data-tracks-detect-genre', (e, id) => dataLayer.tracks.detectGenre(id));
  ipcMain.handle('data-tracks-fix-tags', (e, id) => dataLayer.tracks.fixTags(id));
  ipcMain.handle('data-tracks-record-play', (e, id, ctx) => dataLayer.tracks.recordPlay(id, ctx));
  ipcMain.handle('data-tracks-audio-url', (e, id) => dataLayer.tracks.audioUrl(id));

  // ── Playlists hybrides ──
  ipcMain.handle('data-playlists-list', () => dataLayer.playlists.list());
  ipcMain.handle('data-playlists-get', (e, id) => dataLayer.playlists.get(id));
  ipcMain.handle('data-playlists-create', (e, data) => dataLayer.playlists.create(data));
  ipcMain.handle('data-playlists-delete', (e, id) => dataLayer.playlists.delete(id));
  ipcMain.handle('data-playlists-update', (e, id, data) => dataLayer.playlists.update(id, data));
  ipcMain.handle('data-playlists-add-tracks', (e, id, trackIds) => dataLayer.playlists.addTracks(id, trackIds));
  ipcMain.handle('data-playlists-remove-track', (e, id, trackId) => dataLayer.playlists.removeTrack(id, trackId));

  // ═══════════════════════════════════════════════════════════
  // ████  API REMOTE — Tracks (mêmes endpoints que le web)  ████
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('api-tracks-upload', (e, filePath) => api.tracks.upload(filePath));
  ipcMain.handle('api-tracks-list', (e, page, limit) => api.tracks.list(page, limit));
  ipcMain.handle('api-tracks-get', (e, id) => api.tracks.get(id));
  ipcMain.handle('api-tracks-update', (e, id, data) => api.tracks.update(id, data));
  ipcMain.handle('api-tracks-delete', (e, id) => api.tracks.delete(id));
  ipcMain.handle('api-tracks-audio-url', (e, id) => api.tracks.audioUrl(id));
  ipcMain.handle('api-tracks-analyze', (e, id) => api.tracks.analyze(id));
  ipcMain.handle('api-tracks-clean-title', (e, id) => api.tracks.cleanTitle(id));
  ipcMain.handle('api-tracks-parse-remix', (e, id) => api.tracks.parseRemix(id));
  ipcMain.handle('api-tracks-detect-genre', (e, id) => api.tracks.detectGenre(id));
  ipcMain.handle('api-tracks-identify', (e, id) => api.tracks.identify(id));
  ipcMain.handle('api-tracks-identify-search', (e, id) => api.tracks.identifySearch(id));
  ipcMain.handle('api-tracks-spotify-lookup', (e, id) => api.tracks.spotifyLookup(id));
  ipcMain.handle('api-tracks-spotify-apply', (e, id) => api.tracks.spotifyApply(id));
  ipcMain.handle('api-tracks-fix-tags', (e, id) => api.tracks.fixTags(id));
  ipcMain.handle('api-tracks-compatible', (e, id, limit) => api.tracks.compatible(id, limit));
  ipcMain.handle('api-tracks-record-play', (e, id, ctx) => api.tracks.recordPlay(id, ctx));
  ipcMain.handle('api-tracks-history', (e, id) => api.tracks.getHistory(id));
  ipcMain.handle('api-tracks-clear-history', () => api.tracks.clearHistory());
  ipcMain.handle('api-tracks-beatgrid', (e, id) => api.tracks.getBeatgrid(id));
  ipcMain.handle('api-tracks-update-beatgrid', (e, id, data) => api.tracks.updateBeatgrid(id, data));
  ipcMain.handle('api-tracks-update-metadata', (e, id, data) => api.tracks.updateMetadata(id, data));
  ipcMain.handle('api-tracks-categories', () => api.tracks.getCategories());
  ipcMain.handle('api-tracks-tags', () => api.tracks.getTags());

  // ═══════════════════════════════════════════════════════════
  // ████  API REMOTE — Cue Points  ████
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('api-cues-list', (e, trackId) => api.cues.list(trackId));
  ipcMain.handle('api-cues-create', (e, trackId, data) => api.cues.create(trackId, data));
  ipcMain.handle('api-cues-update', (e, cueId, data) => api.cues.update(cueId, data));
  ipcMain.handle('api-cues-delete', (e, cueId) => api.cues.delete(cueId));
  ipcMain.handle('api-cues-copy', (e, trackId, sourceId, includeLoops) => api.cues.copyCues(trackId, sourceId, includeLoops));
  ipcMain.handle('api-cues-generate', (e, trackId) => api.cues.generate(trackId));
  ipcMain.handle('api-cues-analysis', (e, trackId) => api.cues.getAnalysis(trackId));
  ipcMain.handle('api-cues-rules', (e, trackId) => api.cues.getRules(trackId));
  ipcMain.handle('api-cues-create-rule', (e, trackId, data) => api.cues.createRule(trackId, data));
  ipcMain.handle('api-cues-update-rule', (e, trackId, ruleId, data) => api.cues.updateRule(trackId, ruleId, data));
  ipcMain.handle('api-cues-delete-rule', (e, trackId, ruleId) => api.cues.deleteRule(trackId, ruleId));

  // ═══════════════════════════════════════════════════════════
  // ████  API REMOTE — Hot Cues  ████
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('api-hotcues-list', (e, trackId) => api.hotCues.list(trackId));
  ipcMain.handle('api-hotcues-create', (e, trackId, data) => api.hotCues.create(trackId, data));
  ipcMain.handle('api-hotcues-update', (e, trackId, cueId, data) => api.hotCues.update(trackId, cueId, data));
  ipcMain.handle('api-hotcues-delete', (e, trackId, cueId) => api.hotCues.delete(trackId, cueId));
  ipcMain.handle('api-hotcues-reorder', (e, trackId, items) => api.hotCues.reorder(trackId, items));

  // ═══════════════════════════════════════════════════════════
  // ████  API REMOTE — Loops  ████
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('api-loops-list', (e, trackId) => api.loops.list(trackId));
  ipcMain.handle('api-loops-create', (e, trackId, data) => api.loops.create(trackId, data));
  ipcMain.handle('api-loops-update', (e, loopId, data) => api.loops.update(loopId, data));
  ipcMain.handle('api-loops-delete', (e, loopId) => api.loops.delete(loopId));

  // ═══════════════════════════════════════════════════════════
  // ████  API REMOTE — Waveforms  ████
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('api-waveforms-get', (e, trackId) => api.waveforms.get(trackId));
  ipcMain.handle('api-waveforms-generate', (e, trackId) => api.waveforms.generate(trackId));
  ipcMain.handle('api-waveforms-regenerate', (e, trackId) => api.waveforms.regenerate(trackId));

  // ═══════════════════════════════════════════════════════════
  // ████  API REMOTE — Playlists  ████
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('api-playlists-list', (e, parentId) => api.playlists.list(parentId));
  ipcMain.handle('api-playlists-get', (e, id) => api.playlists.get(id));
  ipcMain.handle('api-playlists-create', (e, data) => api.playlists.create(data));
  ipcMain.handle('api-playlists-update', (e, id, data) => api.playlists.update(id, data));
  ipcMain.handle('api-playlists-delete', (e, id) => api.playlists.delete(id));
  ipcMain.handle('api-playlists-add-tracks', (e, id, trackIds) => api.playlists.addTracks(id, trackIds));
  ipcMain.handle('api-playlists-remove-track', (e, id, trackId) => api.playlists.removeTrack(id, trackId));
  ipcMain.handle('api-playlists-reorder', (e, id, items) => api.playlists.reorder(id, items));
  ipcMain.handle('api-playlists-duplicate', (e, id) => api.playlists.duplicate(id));

  // ═══════════════════════════════════════════════════════════
  // ████  API REMOTE — Smart Crates  ████
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('api-crates-list', () => api.crates.list());
  ipcMain.handle('api-crates-get', (e, id) => api.crates.get(id));
  ipcMain.handle('api-crates-create', (e, data) => api.crates.create(data));
  ipcMain.handle('api-crates-update', (e, id, data) => api.crates.update(id, data));
  ipcMain.handle('api-crates-delete', (e, id) => api.crates.delete(id));

  // ═══════════════════════════════════════════════════════════
  // ████  API REMOTE — DJ Sets  ████
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('api-sets-list', () => api.sets.list());
  ipcMain.handle('api-sets-get', (e, id) => api.sets.get(id));
  ipcMain.handle('api-sets-create', (e, data) => api.sets.create(data));
  ipcMain.handle('api-sets-update', (e, id, data) => api.sets.update(id, data));
  ipcMain.handle('api-sets-delete', (e, id) => api.sets.delete(id));
  ipcMain.handle('api-sets-add-track', (e, id, data) => api.sets.addTrack(id, data));
  ipcMain.handle('api-sets-remove-track', (e, id, trackId) => api.sets.removeTrack(id, trackId));
  ipcMain.handle('api-sets-reorder', (e, id, items) => api.sets.reorder(id, items));
  ipcMain.handle('api-sets-suggest-next', (e, id, limit) => api.sets.suggestNext(id, limit));
  ipcMain.handle('api-sets-stats', (e, id) => api.sets.getStats(id));

  // ═══════════════════════════════════════════════════════════
  // ████  API REMOTE — Analytics  ████
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('api-analytics', () => api.analytics.get());
  ipcMain.handle('api-analytics-play', (e, trackId) => api.analytics.recordPlay(trackId));

  // ═══════════════════════════════════════════════════════════
  // ████  API REMOTE — Export  ████
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('api-export-rekordbox', (e, trackId) => api.export.rekordbox(trackId));
  ipcMain.handle('api-export-rekordbox-json', (e, trackId) => api.export.rekordboxJson(trackId));
  ipcMain.handle('api-export-rekordbox-batch', (e, trackIds, name) => api.export.rekordboxBatch(trackIds, name));
  ipcMain.handle('api-export-rekordbox-all', (e, name) => api.export.rekordboxAll(name));
  ipcMain.handle('api-export-serato', (e, trackId) => api.export.serato(trackId));
  ipcMain.handle('api-export-playlist-m3u', (e, plId) => api.export.playlistM3u(plId));
  ipcMain.handle('api-export-set-rekordbox', (e, setId) => api.export.setRekordbox(setId));
  ipcMain.handle('api-export-set-m3u', (e, setId) => api.export.setM3u(setId));
  ipcMain.handle('api-export-all-formats', (e, trackId) => api.export.allFormats(trackId));

  // ═══════════════════════════════════════════════════════════
  // ████  API REMOTE — Import DJ  ████
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('api-import-rekordbox', (e, filePath) => api.import.rekordbox(filePath));
  ipcMain.handle('api-import-serato', (e, filePath) => api.import.serato(filePath));
  ipcMain.handle('api-import-traktor', (e, filePath) => api.import.traktor(filePath));

  // ═══════════════════════════════════════════════════════════
  // ████  API REMOTE — Advanced (Stems, Duplicates)  ████
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('api-stems-check', () => api.advanced.stemsCheck());
  ipcMain.handle('api-stems-start', (e, trackId) => api.advanced.stemsStart(trackId));
  ipcMain.handle('api-stems-status', (e, trackId) => api.advanced.stemsStatus(trackId));
  ipcMain.handle('api-stems-file', (e, trackId, stemName) => api.advanced.stemFile(trackId, stemName));
  ipcMain.handle('api-duplicates', (e, method, threshold) => api.advanced.duplicates(method, threshold));
  ipcMain.handle('api-auto-cues', (e, trackId, style) => api.advanced.autoCues(trackId, style));

  // ═══════════════════════════════════════════════════════════
  // ████  API REMOTE — Mix Analyzer  ████
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('api-mix-upload', (e, filePath) => api.mixAnalyzer.upload(filePath));
  ipcMain.handle('api-mix-status', (e, jobId) => api.mixAnalyzer.getStatus(jobId));

  // ═══════════════════════════════════════════════════════════
  // ████  API REMOTE — Billing  ████
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('api-billing-plans', () => api.billing.getPlans());
  ipcMain.handle('api-billing-current', () => api.billing.getCurrent());
  ipcMain.handle('api-billing-usage', () => api.billing.getUsage());
  ipcMain.handle('api-billing-subscribe', (e, planId, interval) => api.billing.subscribe(planId, interval));
  ipcMain.handle('api-billing-portal', () => api.billing.getPortalUrl());

  // ═══════════════════════════════════════════════════════════
  // ████  API REMOTE — Downloads  ████
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('api-downloads-info', () => api.downloads.getInfo());
  ipcMain.handle('api-downloads-config', () => api.downloads.getConfig());
  ipcMain.handle('api-downloads-update-config', (e, data) => api.downloads.updateConfig(data));

  // ── Fallback : télécharger le DMG et l'ouvrir ──
  ipcMain.handle('download-dmg-update', async (e, version) => {
    try {
      const dmgPath = await downloadAndOpenDMG(version);
      await shell.openPath(dmgPath);
      return { success: true, path: dmgPath };
    } catch (err) {
      // Dernier recours : ouvrir la page GitHub
      shell.openExternal(`https://github.com/kdumontm/cueforge-saas/releases/tag/v${version}`);
      return { success: false, error: err.message };
    }
  });
}

// ─── Drag & Drop (fichiers depuis Finder/Explorer) ─────
function setupDragAndDrop() {
  // Accepter les fichiers droppés sur la fenêtre
  app.on('open-file', (e, filePath) => {
    e.preventDefault();
    mainWindow?.webContents.send('files-dropped', [filePath]);
  });
}

// ─── Auto-updater ──────────────────────────────────────
function setupAutoUpdater() {
  // Téléchargement automatique dès qu'une mise à jour est trouvée
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // Mise à jour disponible → notifier le renderer seulement si version supérieure
  autoUpdater.on('update-available', (info) => {
    const currentVersion = app.getVersion();
    const remoteVersion = info.version;
    const isNewer = remoteVersion !== currentVersion &&
      remoteVersion.localeCompare(currentVersion, undefined, { numeric: true }) > 0;
    if (isNewer) {
      mainWindow?.webContents.send('update-available', {
        version: info.version,
        releaseNotes: info.releaseNotes || '',
      });
    } else {
      console.log(`[update] Ignoring same/older version: ${remoteVersion} (current: ${currentVersion})`);
    }
  });

  // Progression du téléchargement → envoyer le % au renderer
  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update-progress', {
      percent:      Math.floor(progress.percent),
      transferred:  progress.transferred,
      total:        progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  // Téléchargement terminé → notifier le renderer (ne pas installer automatiquement)
  autoUpdater.on('update-downloaded', (info) => {
    pendingUpdateVersion = info.version;
    mainWindow?.webContents.send('update-downloaded', { version: info.version });
  });

  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('update-error', err.message);
  });

  // Vérifier au démarrage (5s delay) + toutes les 4h
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);
}

// ─── Installer la mise à jour et redémarrer ────────────
let pendingUpdateVersion = null;

function installAndRestart() {
  console.log('[update] installAndRestart called');
  console.log('[update] app path:', app.getAppPath());
  console.log('[update] exe path:', app.getPath('exe'));
  if (isMac) {
    console.log('[update] isInApplicationsFolder:', app.isInApplicationsFolder());
  }

  // 1. Bypasser le handler hide-on-close de macOS
  app.isQuitting = true;

  // 2. Détruire la fenêtre proprement pour libérer les locks
  if (mainWindow) {
    mainWindow.removeAllListeners('close');
    mainWindow.destroy();
    mainWindow = null;
  }

  // 3. Essayer quitAndInstall, avec fallback vers téléchargement DMG
  setTimeout(() => {
    try {
      autoUpdater.quitAndInstall(false, true);
    } catch (err) {
      console.error('[update] quitAndInstall failed:', err);
      // Fallback : ouvrir la page de releases GitHub
      const version = pendingUpdateVersion || 'latest';
      shell.openExternal(`https://github.com/kdumontm/cueforge-saas/releases/tag/v${version}`);
      app.exit(0);
    }
  }, 1000);
}

// ─── Fallback : télécharger le DMG directement ─────────
async function downloadAndOpenDMG(version) {
  const { net } = require('electron');
  const os = require('os');
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const url = `https://github.com/kdumontm/cueforge-saas/releases/download/v${version}/CueForge-${version}-${arch}.dmg`;
  const dest = path.join(os.tmpdir(), `CueForge-${version}-${arch}.dmg`);

  console.log('[update] Downloading DMG from:', url);
  mainWindow?.webContents.send('update-progress', { percent: 0, transferred: 0, total: 0 });

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    require('https').get(url, { headers: { 'User-Agent': 'CueForge' } }, (response) => {
      // Handle redirects (GitHub uses 302)
      if (response.statusCode === 302 || response.statusCode === 301) {
        require('https').get(response.headers.location, (finalResp) => {
          const total = parseInt(finalResp.headers['content-length'] || '0', 10);
          let transferred = 0;
          finalResp.on('data', (chunk) => {
            transferred += chunk.length;
            const percent = total > 0 ? Math.floor(transferred / total * 100) : 0;
            mainWindow?.webContents.send('update-progress', { percent, transferred, total });
          });
          finalResp.pipe(file);
          file.on('finish', () => {
            file.close();
            console.log('[update] DMG downloaded to:', dest);
            resolve(dest);
          });
        }).on('error', reject);
      } else {
        const total = parseInt(response.headers['content-length'] || '0', 10);
        let transferred = 0;
        response.on('data', (chunk) => {
          transferred += chunk.length;
          const percent = total > 0 ? Math.floor(transferred / total * 100) : 0;
          mainWindow?.webContents.send('update-progress', { percent, transferred, total });
        });
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(dest);
        });
      }
    }).on('error', reject);
  });
}
