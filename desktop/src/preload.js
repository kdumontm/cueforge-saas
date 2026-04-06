'use strict';
// ─── CueForge Desktop — Preload Bridge (simplifié) ─────────────────────────
// Expose UNIQUEMENT les capacités locales au site web chargé dans Electron.
// Auth, API, BDD, admin, settings → tout est géré par le web, pas ici.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cueforge', {
  // ── Indicateur desktop ──────────────────────────────────────────────────
  isDesktop: true,
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // ── Fichiers locaux (disque de l'utilisateur) ───────────────────────────
  files: {
    openDialog:    ()            => ipcRenderer.invoke('open-file-dialog'),
    readBuffer:    (path)        => ipcRenderer.invoke('read-audio-buffer', path),
    readMetadata:  (path)        => ipcRenderer.invoke('read-metadata', path),
    revealInFinder:(path)        => ipcRenderer.invoke('reveal-in-finder', path),
    save:          (content, name, filters) => ipcRenderer.invoke('save-file', content, name, filters),
  },

  // ── Exports DJ (écriture fichier local) ─────────────────────────────────
  export: {
    rekordbox: (tracks, path) => ipcRenderer.invoke('export-rekordbox', tracks, path),
    serato:    (tracks, path) => ipcRenderer.invoke('export-serato', tracks, path),
  },

  // ── Auto-updater ────────────────────────────────────────────────────────
  updater: {
    check:        ()   => ipcRenderer.invoke('check-for-updates'),
    install:      ()   => ipcRenderer.invoke('install-update'),
    onAvailable:  (cb) => ipcRenderer.on('update-available',  (_, info) => cb(info)),
    onProgress:   (cb) => ipcRenderer.on('update-progress',   (_, data) => cb(data)),
    onDownloaded: (cb) => ipcRenderer.on('update-downloaded', (_, info) => cb(info)),
    onError:      (cb) => ipcRenderer.on('update-error',      (_, msg)  => cb(msg)),
  },

  // ── Séparation de stems (Demucs local — CPU/GPU de l'utilisateur) ────
  stems: {
    /** Vérifie si Python + Demucs sont installés */
    checkAvailable: ()        => ipcRenderer.invoke('check-demucs'),
    /** Lance Demucs sur un fichier audio, retourne les 4 stems */
    separate:       (filePath) => ipcRenderer.invoke('run-demucs', filePath),
    /** Lit un stem déjà séparé (ArrayBuffer) */
    readBuffer:     (stemPath) => ipcRenderer.invoke('read-stem-buffer', stemPath),
    /** Callback progression Demucs (0-100%) */
    onProgress:     (cb)       => ipcRenderer.on('demucs-progress', (_, pct) => cb(pct)),
  },

  // ── Connectivité (pour offline.html) ───────────────────────────────────
  checkOnline: async () => {
    try {
      const res = await fetch('https://cueforge-saas-production.up.railway.app/api/v1/health', {
        method: 'HEAD', mode: 'no-cors', cache: 'no-store',
      });
      return true;
    } catch {
      return false;
    }
  },
});
