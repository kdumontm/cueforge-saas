'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('cueforge', {
  getFilePath:      (file) => webUtils.getPathForFile(file),
  openFileDialog:   ()     => ipcRenderer.invoke('open-file-dialog'),
  readMetadata:     (p)    => ipcRenderer.invoke('read-metadata', p),
  readAudioBuffer:  (p)    => ipcRenderer.invoke('read-audio-buffer', p),
  revealInFinder:   (p)    => ipcRenderer.invoke('reveal-in-finder', p),
  upsertTrack:      (d)    => ipcRenderer.invoke('upsert-track', d),
  updateAnalysis:   (id, d)=> ipcRenderer.invoke('update-analysis', id, d),
  getTracks:        ()     => ipcRenderer.invoke('get-tracks'),
  searchTracks:     (q)    => ipcRenderer.invoke('search-tracks', q),
  deleteTrack:      (id)   => ipcRenderer.invoke('delete-track', id),
  exportRekordbox:  (ids)  => ipcRenderer.invoke('export-rekordbox', ids),
  exportSerato:     (ids)  => ipcRenderer.invoke('export-serato', ids),
  verifyLicense:    ()     => ipcRenderer.invoke('verify-license'),
  login:   (email, pwd)    => ipcRenderer.invoke('login', email, pwd),
  logout:           ()     => ipcRenderer.invoke('logout'),
  getStoredEmail:   ()     => ipcRenderer.invoke('get-stored-email'),
  saveTextFile: (content, name, filter, ext) => ipcRenderer.invoke('save-text-file', content, name, filter, ext),
  // Profile / Settings
  getProfile:       ()          => ipcRenderer.invoke('get-profile'),
  updateProfile:    (data)      => ipcRenderer.invoke('update-profile', data),
  changePassword:   (cur, newP) => ipcRenderer.invoke('change-password', cur, newP),
  // Admin
  getAdminDashboard: ()           => ipcRenderer.invoke('get-admin-dashboard'),
  getAdminUsers:     (s, p)       => ipcRenderer.invoke('get-admin-users', s, p),
  updateAdminUser:   (id, data)   => ipcRenderer.invoke('update-admin-user', id, data),
  getAdminFeatures:  ()           => ipcRenderer.invoke('get-admin-features'),
  updateAdminFeature:(id, data)   => ipcRenderer.invoke('update-admin-feature', id, data),
  createAdminFeature:(data)       => ipcRenderer.invoke('create-admin-feature', data),
  deleteAdminFeature:(id)         => ipcRenderer.invoke('delete-admin-feature', id),
  onFilesDropped:     (cb) => ipcRenderer.on('files-dropped',    (_, files) => cb(files)),
  // ── Mise à jour automatique ──────────────────────────────
  onUpdateAvailable:  (cb) => ipcRenderer.on('update-available',  (_, info)  => cb(info)),
  onUpdateProgress:   (cb) => ipcRenderer.on('update-progress',   (_, data)  => cb(data)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', (_, info)  => cb(info)),
  onUpdateError:      (cb) => ipcRenderer.on('update-error',      (_, msg)   => cb(msg)),
  checkForUpdates:    ()   => ipcRenderer.invoke('check-for-updates'),
  installUpdate:      ()   => ipcRenderer.invoke('install-update'),
});
