'use strict';
// ─── TrackCue Desktop — Main Process (simplifié) ───────────────────────────
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
const WEB_URL = 'https://exquisite-art-production-f4c6.up.railway.app';

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
    // Empêcher la navigation hors du site TrackCue
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
    tray.setToolTip('TrackCue');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Afficher TrackCue', click: () => mainWindow?.show() },
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

  // ── Stem separation (Demucs local — utilise le CPU/GPU de l'utilisateur) ──
  // Nécessite Python + demucs installés sur la machine de l'utilisateur.
  // Retourne les chemins des 4 stems (drums, bass, vocals, other) en WAV.

  ipcMain.handle('check-demucs', async () => {
    // Vérifier si Python + demucs sont installés
    const { exec } = require('child_process');
    return new Promise((resolve) => {
      exec('python3 -m demucs --help', { timeout: 10000 }, (err) => {
        if (!err) return resolve({ available: true, python: 'python3' });
        exec('python -m demucs --help', { timeout: 10000 }, (err2) => {
          resolve({ available: !err2, python: err2 ? null : 'python' });
        });
      });
    });
  });

  ipcMain.handle('run-demucs', async (_, filePath) => {
    const { exec } = require('child_process');
    const os = require('os');

    // Déterminer le dossier de sortie
    const outputDir = path.join(os.tmpdir(), 'trackcue-stems');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    // Trouver Python
    const python = await new Promise((resolve) => {
      exec('python3 --version', { timeout: 5000 }, (err) => {
        resolve(err ? 'python' : 'python3');
      });
    });

    // Lancer Demucs (htdemucs = modèle hybride rapide, 4 stems)
    // --two-stems ne sert pas ici, on veut les 4 stems complets
    const cmd = `${python} -m demucs --out "${outputDir}" -n htdemucs --mp3 "${filePath}"`;

    return new Promise((resolve, reject) => {
      const child = exec(cmd, {
        timeout: 20 * 60 * 1000, // 20 min max
        maxBuffer: 50 * 1024 * 1024,
      }, (err, stdout, stderr) => {
        if (err) {
          return reject(new Error(`Demucs failed: ${stderr || err.message}`));
        }

        // Demucs écrit dans outputDir/htdemucs/<basename>/
        const basename = path.parse(filePath).name;
        const stemDir = path.join(outputDir, 'htdemucs', basename);

        if (!fs.existsSync(stemDir)) {
          return reject(new Error(`Stem directory not found: ${stemDir}`));
        }

        // Lire les 4 stems
        const stems = {};
        for (const stem of ['drums', 'bass', 'vocals', 'other']) {
          // Demucs en mode --mp3 crée des .mp3, sinon .wav
          const mp3Path = path.join(stemDir, `${stem}.mp3`);
          const wavPath = path.join(stemDir, `${stem}.wav`);
          const stemPath = fs.existsSync(mp3Path) ? mp3Path : wavPath;

          if (fs.existsSync(stemPath)) {
            const buffer = fs.readFileSync(stemPath);
            stems[stem] = {
              path: stemPath,
              buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
            };
          }
        }

        resolve({
          stemDir,
          stems,
          model: 'htdemucs',
        });
      });

      // Envoyer la progression via IPC (Demucs écrit sur stderr)
      if (child.stderr) {
        child.stderr.on('data', (data) => {
          const match = data.toString().match(/(\d+)%/);
          if (match && mainWindow) {
            mainWindow.webContents.send('demucs-progress', parseInt(match[1]));
          }
        });
      }
    });
  });

  // Lire un stem déjà séparé (retourne l'ArrayBuffer)
  ipcMain.handle('read-stem-buffer', async (_, stemPath) => {
    if (!fs.existsSync(stemPath)) return null;
    const buffer = fs.readFileSync(stemPath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  });
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
  // Persister les données de session (localStorage, cookies) entre les redémarrages
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(true); // Autoriser toutes les permissions (notifications, etc.)
  });

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
