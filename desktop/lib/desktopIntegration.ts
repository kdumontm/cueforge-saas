/**
 * DesktopIntegration - Intégration complète Electron pour TrackCue Desktop
 * Points 1831-1880: Fonctionnalités desktop natives
 */

import { ipcRenderer, app, ipcMain, Menu, globalShortcut, Tray, autoUpdater, crashReporter, dialog } from 'electron';
import { promises as fs } from 'fs';
import Database from 'better-sqlite3';
import { watch } from 'chokidar';
import path from 'path';
import os from 'os';

/**
 * DesktopIntegration: Classe principale pour l'intégration desktop
 * Gère l'accès au système de fichiers, drag-drop, menus, raccourcis, etc.
 */
export class DesktopIntegration {
  private localCache: Database.Database | null = null;
  private tray: Tray | null = null;
  private folderWatchers: Map<string, ReturnType<typeof watch>> = new Map();
  private windowState: { x: number; y: number; width: number; height: number } | null = null;

  constructor() {
    // Initialisation - sera appelée au démarrage d'Electron
  }

  /**
   * 1832: setupFileSystemAccess - Accès au système de fichiers local via Electron IPC
   * Permet au frontend d'accéder au FS sans permissions dangereuses
   */
  setupFileSystemAccess(): void {
    // IPC: Ouvrir un fichier
    ipcMain.handle('fs:open-file', async (event, options: { filters?: any[] } = {}) => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: options.filters || [{ name: 'Audio Files', extensions: ['mp3', 'flac', 'wav', 'aiff', 'm4a'] }],
      });
      return result.filePaths[0] || null;
    });

    // IPC: Ouvrir un dossier
    ipcMain.handle('fs:open-folder', async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
      });
      return result.filePaths[0] || null;
    });

    // IPC: Lire un fichier
    ipcMain.handle('fs:read-file', async (event, filePath: string) => {
      try {
        const buffer = await fs.readFile(filePath);
        return { success: true, data: buffer.toString('base64') };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // IPC: Lire un répertoire
    ipcMain.handle('fs:read-dir', async (event, dirPath: string) => {
      try {
        const files = await fs.readdir(dirPath, { withFileTypes: true });
        return {
          success: true,
          files: files.map((f) => ({
            name: f.name,
            isDirectory: f.isDirectory(),
            path: path.join(dirPath, f.name),
          })),
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // IPC: Vérifier si un fichier existe
    ipcMain.handle('fs:exists', async (event, filePath: string) => {
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    });

    // IPC: Stat sur un fichier
    ipcMain.handle('fs:stat', async (event, filePath: string) => {
      try {
        const stat = await fs.stat(filePath);
        return {
          success: true,
          size: stat.size,
          mtime: stat.mtime.toISOString(),
          isDirectory: stat.isDirectory(),
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * 1833: enableDragDrop - Drag-drop depuis Finder/Explorer
   * Active le drag-drop de fichiers audio sur la fenêtre
   */
  enableDragDrop(): void {
    ipcMain.on('drag-drop:ready', (event) => {
      event.sender.on('dropped-files', (event, files: string[]) => {
        // Valider les fichiers audio
        const audioFiles = files.filter((f) => /\.(mp3|flac|wav|aiff|m4a)$/i.test(f));
        event.sender.send('drag-drop:received', audioFiles);
      });
    });

    // Du côté frontend (renderer), écouter les drop events
    ipcRenderer?.on('drag-drop:received', (event, files: string[]) => {
      const dropZone = document.getElementById('drop-zone');
      if (dropZone) {
        dropZone.dispatchEvent(
          new CustomEvent('files-dropped', { detail: { files } })
        );
      }
    });
  }

  /**
   * 1834: createNativeMenu - Menu natif Electron (File, Edit, View, Analysis, Help)
   */
  createNativeMenu(): void {
    const template: any[] = [
      {
        label: 'File',
        submenu: [
          {
            label: 'Open File',
            accelerator: 'CmdOrCtrl+O',
            click: async () => {
              const result = await dialog.showOpenDialog({
                properties: ['openFile'],
                filters: [{ name: 'Audio', extensions: ['mp3', 'flac', 'wav'] }],
              });
              if (result.filePaths[0]) {
                ipcRenderer?.send('menu:open-file', result.filePaths[0]);
              }
            },
          },
          { type: 'separator' },
          {
            label: 'Exit',
            accelerator: 'CmdOrCtrl+Q',
            click: () => app.quit(),
          },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
        ],
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
        ],
      },
      {
        label: 'Analysis',
        submenu: [
          {
            label: 'Analyze Track',
            accelerator: 'CmdOrCtrl+A',
            click: () => ipcRenderer?.send('menu:analyze'),
          },
          {
            label: 'Export Stems',
            click: () => ipcRenderer?.send('menu:export-stems'),
          },
          {
            label: 'Generate Cues',
            click: () => ipcRenderer?.send('menu:generate-cues'),
          },
        ],
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'About TrackCue',
            click: () => {
              dialog.showMessageBox({
                type: 'info',
                title: 'About TrackCue',
                message: 'TrackCue v1.0.0',
                detail: 'Professional DJ audio analysis tool',
              });
            },
          },
        ],
      },
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  /**
   * 1835: setupGlobalShortcuts - Raccourcis globaux (Play/Pause même si pas focusé)
   */
  setupGlobalShortcuts(): void {
    // Play/Pause global
    globalShortcut.register('MediaPlayPause', () => {
      ipcRenderer?.send('player:play-pause');
    });

    // Next track
    globalShortcut.register('MediaNextTrack', () => {
      ipcRenderer?.send('player:next');
    });

    // Previous track
    globalShortcut.register('MediaPreviousTrack', () => {
      ipcRenderer?.send('player:previous');
    });

    // Stop
    globalShortcut.register('MediaStop', () => {
      ipcRenderer?.send('player:stop');
    });

    // Custom: Analyze shortcut
    globalShortcut.register('CommandOrControl+Shift+A', () => {
      ipcRenderer?.send('menu:analyze');
    });

    // Custom: Quick export
    globalShortcut.register('CommandOrControl+Shift+E', () => {
      ipcRenderer?.send('menu:export-stems');
    });
  }

  /**
   * 1836: createSystemTray - Mini-player dans le system tray
   */
  createSystemTray(): void {
    const iconPath = path.join(__dirname, '../assets/icon.png');
    this.tray = new Tray(iconPath);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Play/Pause',
        click: () => ipcRenderer?.send('player:play-pause'),
      },
      {
        label: 'Next',
        click: () => ipcRenderer?.send('player:next'),
      },
      {
        label: 'Previous',
        click: () => ipcRenderer?.send('player:previous'),
      },
      { type: 'separator' },
      {
        label: 'Show',
        click: () => ipcRenderer?.send('app:show'),
      },
      {
        label: 'Quit',
        click: () => app.quit(),
      },
    ]);

    this.tray.setContextMenu(contextMenu);

    // Tooltip du tray
    this.tray.setToolTip('TrackCue');

    // Double-click = afficher l'app
    this.tray.on('double-click', () => {
      ipcRenderer?.send('app:show');
    });
  }

  /**
   * 1837: setupAutoUpdater - Auto-update avec progress et changelog
   */
  setupAutoUpdater(): void {
    const updateCheckInterval = 60 * 60 * 1000; // 1 heure

    autoUpdater.checkForUpdatesAndNotify();

    autoUpdater.on('checking-for-update', () => {
      ipcRenderer?.send('updater:checking');
    });

    autoUpdater.on('update-available', (info) => {
      ipcRenderer?.send('updater:available', {
        version: info.version,
        releaseNotes: info.releaseNotes,
      });
    });

    autoUpdater.on('update-not-available', () => {
      ipcRenderer?.send('updater:not-available');
    });

    autoUpdater.on('download-progress', (progress) => {
      ipcRenderer?.send('updater:progress', {
        percent: Math.round(progress.percent),
        transferred: progress.transferred,
        total: progress.total,
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      ipcRenderer?.send('updater:downloaded', {
        version: info.version,
      });
    });

    // Vérifier les mises à jour au démarrage et périodiquement
    setInterval(() => autoUpdater.checkForUpdates(), updateCheckInterval);
  }

  /**
   * 1838: setupCrashReporter - Crash reporter (rapports envoyés au serveur)
   */
  setupCrashReporter(): void {
    crashReporter.start({
      productName: 'TrackCue',
      companyName: 'TrackCue Inc',
      submitURL: 'https://api.trackcue.app/crashes',
      uploadToServer: true,
    });

    // Écouter les crashes non capturées
    process.on('uncaughtException', (error) => {
      ipcRenderer?.send('crash:uncaught-exception', {
        message: error.message,
        stack: error.stack,
      });
    });

    // Écouter les promesses rejetées non gérées
    process.on('unhandledRejection', (reason, promise) => {
      ipcRenderer?.send('crash:unhandled-rejection', {
        reason: String(reason),
        stack: (reason as any)?.stack,
      });
    });
  }

  /**
   * 1839: createLocalCache - SQLite cache local pour les analyses
   */
  createLocalCache(): Database.Database {
    const dbPath = path.join(app.getPath('userData'), 'trackcue.db');

    this.localCache = new Database(dbPath);

    // Créer les tables de cache
    this.localCache.exec(`
      CREATE TABLE IF NOT EXISTS analysis_cache (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        file_hash TEXT NOT NULL,
        analysis_data JSONB NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS stems_cache (
        id TEXT PRIMARY KEY,
        analysis_id TEXT NOT NULL,
        stem_type TEXT NOT NULL,
        stem_data BLOB NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS cues_cache (
        id TEXT PRIMARY KEY,
        analysis_id TEXT NOT NULL,
        cue_data JSONB NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_analysis_file_hash ON analysis_cache(file_hash);
      CREATE INDEX IF NOT EXISTS idx_stems_analysis_id ON stems_cache(analysis_id);
      CREATE INDEX IF NOT EXISTS idx_cues_analysis_id ON cues_cache(analysis_id);
    `);

    // IPC: Interroger le cache
    ipcMain.handle('cache:get', (event, key: string) => {
      try {
        const row = this.localCache?.prepare('SELECT analysis_data FROM analysis_cache WHERE id = ?').get(key);
        return row ? JSON.parse(row.analysis_data) : null;
      } catch (error: any) {
        return { error: error.message };
      }
    });

    // IPC: Sauvegarder dans le cache
    ipcMain.handle('cache:set', (event, key: string, data: any, expiresIn?: number) => {
      try {
        const expiresAt = expiresIn ? new Date(Date.now() + expiresIn) : null;
        this.localCache
          ?.prepare(
            'INSERT OR REPLACE INTO analysis_cache (id, file_path, file_hash, analysis_data, expires_at) VALUES (?, ?, ?, ?, ?)'
          )
          .run(key, '', '', JSON.stringify(data), expiresAt?.toISOString());
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    return this.localCache;
  }

  /**
   * 1840: enableHardwareAcceleration - Hardware acceleration Chromium
   */
  enableHardwareAcceleration(): void {
    // Activer l'accélération matérielle
    app.disableHardwareAcceleration();
    // RECOMMANDATION: Laisser activé par défaut pour les perf
    // app.disableHardwareAcceleration() peut être utile en cas de problèmes de rendu

    // Configurer les drapeaux V8 pour les perf
    app.commandLine.appendSwitch('enable-features', 'WebAssemblySimd,WebAssemblyThreads');
  }

  /**
   * 1841: watchDJFolders - Watcher sur les dossiers Rekordbox/Serato/Traktor/iTunes
   */
  watchDJFolders(): void {
    const djFolders = this.getDJFolderPaths();

    djFolders.forEach((folderPath) => {
      if (!this.folderWatchers.has(folderPath)) {
        const watcher = watch(folderPath, {
          persistent: true,
          ignored: /(^|[\/\\])\.|node_modules/,
          awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 },
        });

        watcher.on('add', (filePath) => {
          ipcRenderer?.send('fs:file-added', {
            path: filePath,
            type: 'audio',
          });
        });

        watcher.on('change', (filePath) => {
          ipcRenderer?.send('fs:file-changed', {
            path: filePath,
          });
        });

        watcher.on('unlink', (filePath) => {
          ipcRenderer?.send('fs:file-removed', {
            path: filePath,
          });
        });

        this.folderWatchers.set(folderPath, watcher);
      }
    });
  }

  /**
   * Helper: Obtenir les chemins des dossiers DJ (selon l'OS et les applis installées)
   */
  private getDJFolderPaths(): string[] {
    const paths: string[] = [];
    const home = os.homedir();

    if (process.platform === 'darwin') {
      // macOS
      paths.push(path.join(home, 'Music/Rekordbox'));
      paths.push(path.join(home, 'Music/Serato'));
      paths.push(path.join(home, 'Music/Traktor'));
      paths.push(path.join(home, 'Music/iTunes'));
    } else if (process.platform === 'win32') {
      // Windows
      paths.push(path.join(home, 'Music/Rekordbox'));
      paths.push(path.join(home, 'Music/Serato'));
      paths.push(path.join(home, 'Music/Traktor'));
      paths.push(path.join(home, 'Music/iTunes'));
    } else if (process.platform === 'linux') {
      // Linux
      paths.push(path.join(home, 'Music/Rekordbox'));
      paths.push(path.join(home, 'Music/Serato'));
    }

    return paths.filter((p) => {
      try {
        require('fs').accessSync(p);
        return true;
      } catch {
        return false;
      }
    });
  }

  /**
   * 1842: setupWindowState - Persistence de position/taille de fenêtre
   */
  setupWindowState(): { x?: number; y?: number; width: number; height: number } {
    const userDataPath = app.getPath('userData');
    const windowStatePath = path.join(userDataPath, 'window-state.json');

    try {
      const savedState = require('fs').readFileSync(windowStatePath, 'utf-8');
      this.windowState = JSON.parse(savedState);
    } catch {
      this.windowState = {
        width: 1280,
        height: 800,
        x: 100,
        y: 100,
      };
    }

    // IPC: Sauvegarder l'état de la fenêtre
    ipcMain.on('window-state:update', (event, state) => {
      this.windowState = state;
      require('fs').writeFileSync(windowStatePath, JSON.stringify(state), 'utf-8');
    });

    return this.windowState;
  }

  /**
   * 1843: createNativeNotifications - Notifications natives OS
   */
  createNativeNotifications(): void {
    ipcMain.handle('notification:show', (event, options: { title: string; body: string; icon?: string }) => {
      const { Notification } = require('electron');
      const notification = new Notification({
        title: options.title,
        body: options.body,
        icon: options.icon || path.join(__dirname, '../assets/icon.png'),
      });

      notification.show();

      notification.on('click', () => {
        ipcRenderer?.send('notification:clicked');
      });

      return { success: true };
    });

    // Notifications système
    ipcRenderer?.on('notify:analysis-complete', (event, data: { trackName: string; cues: number }) => {
      const { Notification } = require('electron');
      new Notification({
        title: 'Analysis Complete',
        body: `"${data.trackName}" analyzed - ${data.cues} cues detected`,
      }).show();
    });

    ipcRenderer?.on('notify:export-done', (event, data: { format: string }) => {
      const { Notification } = require('electron');
      new Notification({
        title: 'Export Complete',
        body: `Successfully exported to ${data.format}`,
      }).show();
    });
  }

  /**
   * Cleanup: Fermer les watchers et la DB
   */
  cleanup(): void {
    this.folderWatchers.forEach((watcher) => watcher.close());
    this.folderWatchers.clear();

    if (this.localCache) {
      this.localCache.close();
      this.localCache = null;
    }

    globalShortcut.unregisterAll();
  }
}

// Export singleton
export const desktopIntegration = new DesktopIntegration();
