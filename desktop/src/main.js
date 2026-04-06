'use strict';
// ─── CueForge Desktop — Main Process (simplifié) ───────────────────────────
// L'app charge le site web directement. Electron est juste une coquille qui
// expose les ressources locales (fichiers, exports DJ, auto-updater).
// Auth, API, BDD, admin, settings, sécu → tout est géré par le web.

const {
  app, BrowserWindow, ipcMain, dialog, shell,
  nativeImage, Tray, Menu, session,
} = require('electron');
const path = require('path');
const fs   = require('fs');
const { autoUpdater } = require('electron-updater');

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

// ── URL du site web ─────────────────────────────────────────────────────────
const WEB_URL = 'https://cueforge-saas-production.up.railway.app';

// ── Services locaux (exports DJ uniquement) ─────────────────────────────────
let rekordboxExport, seratoExport;

function loadServices() {
  rekordboxExport = require('../services/rekordboxExport');
  seratoExport    = require('../services/seratoExport');
}

// ── Window ──────────────────────────────────────────────────────────────────
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

  // ── Charger le site web ───────────────────────────────────────────────────
  mainWindow.loadURL(WEB_URL + '/dashboard').catch(() => {
    // Pas de réseau → fallback offline
    mainWindow.loadFile(path.join(__dirname, 'offline.html'));
  });

  // Drag & drop depuis le Finder / Explorateur
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Empêcher la navigation hors du site CueForge
    if (!url.startsWith(WEB_URL) && !url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Ouvrir les liens externes dans le navigateur
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Tray (macOS) ────────────────────────────────────────────────────────────
function createTray() {
  if (!isMac) return;
  try {
    const iconPath = path.join(__dirname, '../assets/trayTemplate.png');
    if (!fs.existsSync(iconPath)) return;
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.resize({ width: 18, height: 18 }));
    tray.setToolTip('CueForge');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Afficher CueForge', click: () => mainWindow?.show() },
      { type: 'separator' },
      { label: 'Quitter', click: () => app.quit() },
    ]));
  } catch { /* silently ignore tray errors */ }
}

// ═════════════════════════════════════════════════════════════════════════════
// ████  IPC HANDLERS — Uniquement les ressources locales  ████
// ═════════════════════════════════════════════════════════════════════════════

function setupIPC() {
  // ── Fichiers locaux ─────────────────────────────────────────────────────
  ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: 'Audio', extensions: ['mp3', 'flac', 'wav', 'm4a', 'aiff', 'ogg', 'opus', 'wma'] }],
      properties: ['openFile', 'multiSelections'],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('read-audio-buffer', async (_, filePath) => {
    const buffer = fs.readFileSync(filePath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  });

  ipcMain.handle('read-metadata', async (_, filePath) => {
    const mm = require('music-metadata');
    const metadata = await mm.parseFile(filePath);
    return {
      title:    metadata.common.title || null,
      artist:   metadata.common.artist || null,
      album:    metadata.common.album || null,
      genre:    metadata.common.genre?.[0] || null,
      year:     metadata.common.year || null,
      duration: metadata.format.duration || null,
      format:   metadata.format.codec || null,
      bitrate:  metadata.format.bitrate || null,
      sampleRate: metadata.format.sampleRate || null,
    };
  });

  ipcMain.handle('reveal-in-finder', (_, filePath) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle('save-file', async (_, content, defaultName, filters) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName,
      filters: filters || [{ name: 'All Files', extensions: ['*'] }],
    });
    if (!result.canceled && result.filePath) {
      fs.writeFileSync(result.filePath, content);
      return result.filePath;
    }
    return null;
  });

  // ── Exports DJ (fichiers locaux) ────────────────────────────────────────
  ipcMain.handle('export-rekordbox', async (_, tracks, outputPath) => {
    return rekordboxExport.exportRekordbox(tracks, outputPath);
  });

  ipcMain.handle('export-serato', async (_, tracks, outputPath) => {
    return seratoExport.exportSerato(tracks, outputPath);
  });

  // ── App info ────────────────────────────────────────────────────────────
  ipcMain.handle('get-app-version', () => app.getVersion());
}

// ═════════════════════════════════════════════════════════════════════════════
// ████  AUTO-UPDATER  ████
// ═════════════════════════════════════════════════════════════════════════════

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.allowPrerelease = false;

  ipcMain.handle('check-for-updates', () => {
    autoUpdater.checkForUpdates().catch(() => {});
  });

  ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall(false, true);
  });

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-available', info);
  });

  autoUpdater.on('download-progress', (data) => {
    mainWindow?.webContents.send('update-progress', data);
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update-downloaded', info);
  });

  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('update-error', err?.message || 'Update error');
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// ████  APP LIFECYCLE  ████
// ═════════════════════════════════════════════════════════════════════════════

app.whenReady().then(() => {
  loadServices();
  setupIPC();
  setupAutoUpdater();
  createWindow();
  createTray();

  // Vérifier les mises à jour après 5s
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);

  app.on('activate', () => {
    if (!mainWindow) createWindow();
    else mainWindow.show();
  });
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});

// macOS : re-show window quand on clique sur l'icône du dock
app.on('before-quit', () => {
  if (tray) { tray.destroy(); tray = null; }
});
