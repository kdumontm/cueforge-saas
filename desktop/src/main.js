const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  Notification,
  ipcMain,
  shell,
  nativeImage,
  session,
  dialog,
  nativeTheme,
} = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');

// ─── Configuration ──────────────────────────────────────────
const PROD_URL = 'https://exquisite-art-production-f4c6.up.railway.app';
const APP_NAME = 'CueForge';
const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

const store = new Store({
  defaults: {
    windowBounds: { width: 1400, height: 900 },
    lastUrl: PROD_URL,
    offlineCache: true,
  },
});

let mainWindow = null;
let tray = null;
let isQuitting = false;

// ─── Single Instance Lock ───────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ─── Fenêtre principale ─────────────────────────────────────
function createMainWindow() {
  const { width, height } = store.get('windowBounds');

  const windowOpts = {
    width,
    height,
    minWidth: 900,
    minHeight: 600,
    title: APP_NAME,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a0a0a' : '#ffffff',
  };

  // Options spécifiques par OS
  if (isMac) {
    windowOpts.titleBarStyle = 'hiddenInset';
    windowOpts.trafficLightPosition = { x: 16, y: 16 };
  } else if (isWin) {
    windowOpts.autoHideMenuBar = true;
    windowOpts.icon = path.join(__dirname, '..', 'assets', 'icon.png');
  }

  mainWindow = new BrowserWindow({
    ...windowOpts,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
    show: false, // Afficher quand prêt
  });

  // Afficher quand le contenu est chargé
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Charger l'URL de production
  mainWindow.loadURL(PROD_URL);

  // Sauvegarder la taille de fenêtre
  mainWindow.on('resize', () => {
    const bounds = mainWindow.getBounds();
    store.set('windowBounds', { width: bounds.width, height: bounds.height });
  });

  // macOS : masquer au lieu de fermer (rester dans le Dock)
  // Windows : fermer normalement (pas de dock)
  mainWindow.on('close', (event) => {
    if (isMac && !isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Ouvrir les liens externes dans le navigateur par défaut
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') && !url.includes('cueforge')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Gérer la navigation — empêcher de quitter le site
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.includes('cueforge') && !url.includes('railway.app') && !url.includes('stripe.com')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  return mainWindow;
}

// ─── Menu Bar (Tray) ────────────────────────────────────────
function createTray() {
  // Créer une icône simple pour le tray (16x16 template)
  const trayIconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  let trayIcon;

  if (fs.existsSync(trayIconPath)) {
    trayIcon = nativeImage.createFromPath(trayIconPath);
    trayIcon = trayIcon.resize({ width: 18, height: 18 });
    if (isMac) trayIcon.setTemplateImage(true);
  } else {
    // Icône par défaut si le fichier n'existe pas encore
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip(APP_NAME);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Ouvrir CueForge',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Mes Tracks',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.loadURL(`${PROD_URL}/tracks`);
        }
      },
    },
    {
      label: 'Upload un fichier',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.loadURL(`${PROD_URL}/upload`);
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Mode hors-ligne',
      type: 'checkbox',
      checked: false,
      click: (menuItem) => {
        if (mainWindow) {
          mainWindow.webContents.send('offline-mode-toggle', menuItem.checked);
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quitter CueForge',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    }
  });
}

// ─── Menu App (macOS + Windows) ────────────────────────────
function createAppMenu() {
  const mod = isMac ? 'Cmd' : 'Ctrl'; // Raccourci adapté à l'OS

  const template = [
    // Menu app macOS uniquement
    ...(isMac
      ? [
          {
            label: APP_NAME,
            submenu: [
              { label: `À propos de ${APP_NAME}`, role: 'about' },
              { type: 'separator' },
              { label: 'Préférences…', accelerator: 'Cmd+,', click: () => {} },
              { type: 'separator' },
              { label: `Masquer ${APP_NAME}`, role: 'hide' },
              { label: 'Masquer les autres', role: 'hideOthers' },
              { label: 'Tout afficher', role: 'unhide' },
              { type: 'separator' },
              {
                label: `Quitter ${APP_NAME}`,
                accelerator: 'Cmd+Q',
                click: () => { isQuitting = true; app.quit(); },
              },
            ],
          },
        ]
      : []),
    {
      label: 'Édition',
      submenu: [
        { label: 'Annuler', accelerator: `${mod}+Z`, role: 'undo' },
        { label: 'Rétablir', accelerator: `Shift+${mod}+Z`, role: 'redo' },
        { type: 'separator' },
        { label: 'Couper', accelerator: `${mod}+X`, role: 'cut' },
        { label: 'Copier', accelerator: `${mod}+C`, role: 'copy' },
        { label: 'Coller', accelerator: `${mod}+V`, role: 'paste' },
        { label: 'Tout sélectionner', accelerator: `${mod}+A`, role: 'selectAll' },
      ],
    },
    {
      label: 'Présentation',
      submenu: [
        { label: 'Recharger', accelerator: `${mod}+R`, role: 'reload' },
        { label: 'Forcer le rechargement', accelerator: `Shift+${mod}+R`, role: 'forceReload' },
        { type: 'separator' },
        { label: 'Zoom avant', accelerator: `${mod}+Plus`, role: 'zoomIn' },
        { label: 'Zoom arrière', accelerator: `${mod}+-`, role: 'zoomOut' },
        { label: 'Taille réelle', accelerator: `${mod}+0`, role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Plein écran', accelerator: isMac ? 'Ctrl+Cmd+F' : 'F11', role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Fenêtre',
      submenu: [
        { label: 'Réduire', accelerator: `${mod}+M`, role: 'minimize' },
        { label: 'Zoom', role: 'zoom' },
        { type: 'separator' },
        { label: 'Fermer', accelerator: `${mod}+W`, role: 'close' },
      ],
    },
    {
      label: 'Navigation',
      submenu: [
        {
          label: 'Accueil',
          accelerator: `${mod}+1`,
          click: () => mainWindow && mainWindow.loadURL(PROD_URL),
        },
        {
          label: 'Mes Tracks',
          accelerator: `${mod}+2`,
          click: () => mainWindow && mainWindow.loadURL(`${PROD_URL}/tracks`),
        },
        {
          label: 'Upload',
          accelerator: `${mod}+3`,
          click: () => mainWindow && mainWindow.loadURL(`${PROD_URL}/upload`),
        },
        { type: 'separator' },
        {
          label: 'Précédent',
          accelerator: isMac ? 'Cmd+[' : 'Alt+Left',
          click: () => mainWindow && mainWindow.webContents.goBack(),
        },
        {
          label: 'Suivant',
          accelerator: isMac ? 'Cmd+]' : 'Alt+Right',
          click: () => mainWindow && mainWindow.webContents.goForward(),
        },
      ],
    },
    // Menu Quitter pour Windows
    ...(!isMac
      ? [
          {
            label: 'Fichier',
            submenu: [
              {
                label: 'Quitter',
                accelerator: 'Alt+F4',
                click: () => { isQuitting = true; app.quit(); },
              },
            ],
          },
        ]
      : []),
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ─── Drag & Drop depuis le Finder ───────────────────────────
function setupDragAndDrop() {
  ipcMain.handle('file-dropped', async (event, filePaths) => {
    const audioExtensions = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.aiff', '.wma'];
    const validFiles = filePaths.filter((fp) => {
      const ext = path.extname(fp).toLowerCase();
      return audioExtensions.includes(ext);
    });

    if (validFiles.length === 0) {
      return { success: false, message: 'Aucun fichier audio valide détecté.' };
    }

    return { success: true, files: validFiles };
  });

  // Permettre l'upload via l'API backend
  ipcMain.handle('upload-files', async (event, filePaths) => {
    const results = [];

    for (const filePath of filePaths) {
      try {
        const fileName = path.basename(filePath);
        const fileBuffer = fs.readFileSync(filePath);
        const fileSize = fs.statSync(filePath).size;

        results.push({
          path: filePath,
          name: fileName,
          size: fileSize,
          buffer: fileBuffer.toString('base64'),
          success: true,
        });
      } catch (err) {
        results.push({
          path: filePath,
          name: path.basename(filePath),
          success: false,
          error: err.message,
        });
      }
    }

    return results;
  });

  // Ouvrir un dialog de sélection de fichiers
  ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Fichiers Audio', extensions: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'aiff', 'wma'] },
      ],
    });

    if (result.canceled) return { canceled: true, files: [] };
    return { canceled: false, files: result.filePaths };
  });
}

// ─── Notifications macOS ────────────────────────────────────
function setupNotifications() {
  ipcMain.handle('show-notification', async (event, { title, body, silent }) => {
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: title || APP_NAME,
        body: body || '',
        silent: silent || false,
        icon: path.join(__dirname, '..', 'assets', 'icon.png'),
      });
      notification.show();

      notification.on('click', () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      });

      return { success: true };
    }
    return { success: false, message: 'Notifications non supportées' };
  });
}

// ─── Mode Hybride / Cache Offline ───────────────────────────
function setupOfflineCache() {
  // Intercepter les requêtes pour mise en cache
  session.defaultSession.webRequest.onCompleted(
    { urls: ['*://exquisite-art-production-f4c6.up.railway.app/*'] },
    (details) => {
      if (details.statusCode === 200 && details.method === 'GET') {
        // Stocker les URLs consultées pour le cache
        const cachedUrls = store.get('cachedUrls', []);
        if (!cachedUrls.includes(details.url)) {
          cachedUrls.push(details.url);
          // Garder les 500 dernières URLs
          if (cachedUrls.length > 500) cachedUrls.shift();
          store.set('cachedUrls', cachedUrls);
        }
      }
    }
  );

  // Gérer les erreurs réseau — afficher la page offline
  ipcMain.handle('check-online', async () => {
    try {
      const { net } = require('electron');
      const request = net.request({ method: 'HEAD', url: PROD_URL });
      return new Promise((resolve) => {
        request.on('response', () => resolve(true));
        request.on('error', () => resolve(false));
        setTimeout(() => resolve(false), 5000);
        request.end();
      });
    } catch {
      return false;
    }
  });
}

// ─── Page Offline ───────────────────────────────────────────
function loadOfflinePage() {
  const offlinePath = path.join(__dirname, 'offline.html');
  if (fs.existsSync(offlinePath)) {
    mainWindow.loadFile(offlinePath);
  }
}

// ─── Auto-Updater ──────────────────────────────────────────
function setupAutoUpdater() {
  // Configuration
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log(`Mise à jour disponible: v${info.version}`);
    if (mainWindow) {
      // Notifier l'utilisateur
      const notification = new Notification({
        title: 'Mise à jour CueForge disponible',
        body: `Version ${info.version} est disponible. Cliquez pour télécharger.`,
        icon: path.join(__dirname, '..', 'assets', 'icon.png'),
      });
      notification.on('click', () => {
        autoUpdater.downloadUpdate();
      });
      notification.show();

      // Aussi demander via dialog
      dialog
        .showMessageBox(mainWindow, {
          type: 'info',
          title: 'Mise à jour disponible',
          message: `CueForge v${info.version} est disponible.`,
          detail: 'Voulez-vous télécharger et installer la mise à jour ? L\'app redémarrera automatiquement.',
          buttons: ['Mettre à jour', 'Plus tard'],
          defaultId: 0,
        })
        .then(({ response }) => {
          if (response === 0) {
            autoUpdater.downloadUpdate();
          }
        });
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow) {
      mainWindow.setProgressBar(progress.percent / 100);
      mainWindow.webContents.send('update-progress', Math.round(progress.percent));
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`Mise à jour téléchargée: v${info.version}`);
    if (mainWindow) {
      mainWindow.setProgressBar(-1); // Retirer la barre de progression
    }

    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'Mise à jour prête',
        message: 'La mise à jour a été téléchargée.',
        detail: 'L\'application va redémarrer pour appliquer la mise à jour.',
        buttons: ['Redémarrer maintenant', 'Plus tard'],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 0) {
          isQuitting = true;
          autoUpdater.quitAndInstall();
        }
      });
  });

  autoUpdater.on('update-not-available', () => {
    console.log('Aucune mise à jour disponible.');
  });

  autoUpdater.on('error', (err) => {
    console.error('Erreur auto-update:', err.message);
  });

  // Vérifier les mises à jour au démarrage (après 5 secondes)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.log('Vérification MAJ échouée (pas grave):', err.message);
    });
  }, 5000);

  // Revérifier toutes les 4 heures
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 4 * 60 * 60 * 1000);
}

// IPC pour vérifier les mises à jour manuellement depuis le frontend
ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { available: !!result?.updateInfo, version: result?.updateInfo?.version };
  } catch (err) {
    return { available: false, error: err.message };
  }
});

// ─── App Ready ──────────────────────────────────────────────
app.whenReady().then(() => {
  createMainWindow();
  createTray();
  createAppMenu();
  setupDragAndDrop();
  setupNotifications();
  setupOfflineCache();
  setupAutoUpdater();

  // Gérer les erreurs de chargement (pas de réseau)
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.log(`Erreur de chargement: ${errorDescription} (${errorCode})`);
    if (errorCode === -106 || errorCode === -105 || errorCode === -102) {
      // Pas de réseau — charger la page offline
      loadOfflinePage();
    }
  });

  // Configurer le Service Worker pour le cache
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(true); // Autoriser les notifications, etc.
  });

  app.on('activate', () => {
    if (mainWindow === null) {
      createMainWindow();
    } else {
      mainWindow.show();
    }
  });
});

// ─── Dock badge (nombre de tracks en cours d'analyse) ───────
ipcMain.handle('set-dock-badge', async (event, count) => {
  if (process.platform === 'darwin') {
    app.dock.setBadge(count > 0 ? String(count) : '');
  }
});

ipcMain.handle('dock-bounce', async () => {
  if (process.platform === 'darwin') {
    app.dock.bounce('informational');
  }
});

// ─── Quitter proprement ─────────────────────────────────────
app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
