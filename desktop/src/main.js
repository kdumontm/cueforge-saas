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
let db, licenseCheck, rekordboxExport, seratoExport;

function loadServices() {
  db           = require('../services/database');
  licenseCheck = require('../services/licenseCheck');
  rekordboxExport = require('../services/rekordboxExport');
  seratoExport    = require('../services/seratoExport');
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
      return { success: true, token: result.access_token };
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

  // ── Check for updates ─────────────────────────────────
  ipcMain.handle('check-for-updates', () => {
    autoUpdater.checkForUpdates();
  });

  // ── Installer la mise à jour téléchargée et redémarrer ──
  ipcMain.handle('install-update', () => {
    installAndRestart();
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
  autoUpdater.autoInstallOnAppQuit = false;

  // Mise à jour disponible → notifier le renderer (download démarre automatiquement)
  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes || '',
    });
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
function installAndRestart() {
  // 1. Bypasser le handler hide-on-close de macOS
  app.isQuitting = true;

  // 2. Détruire la fenêtre proprement pour libérer les locks
  if (mainWindow) {
    mainWindow.removeAllListeners('close');
    mainWindow.destroy();
    mainWindow = null;
  }

  // 3. Installer + relancer (isSilent=false pour macOS, isForceRunAfter=true)
  autoUpdater.quitAndInstall(false, true);

  // 4. Fallback : si quitAndInstall ne redémarre pas dans les 3s, forcer via app.relaunch
  setTimeout(() => {
    app.relaunch();
    app.exit(0);
  }, 3000);
}
