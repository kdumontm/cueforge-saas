const { contextBridge, ipcRenderer } = require('electron');

// ─── Bridge sécurisé entre le renderer et le main process ───
contextBridge.exposeInMainWorld('cueforge', {
  // ── Drag & Drop ───────────────────────────────────────────
  onFilesDropped: (filePaths) => ipcRenderer.invoke('file-dropped', filePaths),
  uploadFiles: (filePaths) => ipcRenderer.invoke('upload-files', filePaths),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),

  // ── Notifications ─────────────────────────────────────────
  showNotification: ({ title, body, silent }) =>
    ipcRenderer.invoke('show-notification', { title, body, silent }),

  // ── Dock ──────────────────────────────────────────────────
  setDockBadge: (count) => ipcRenderer.invoke('set-dock-badge', count),
  dockBounce: () => ipcRenderer.invoke('dock-bounce'),

  // ── Connectivité ──────────────────────────────────────────
  checkOnline: () => ipcRenderer.invoke('check-online'),
  onOfflineModeToggle: (callback) => {
    ipcRenderer.on('offline-mode-toggle', (event, isOffline) => callback(isOffline));
  },

  // ── Mises à jour ──────────────────────────────────────────
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  onUpdateProgress: (callback) => {
    ipcRenderer.on('update-progress', (event, percent) => callback(percent));
  },

  // ── Info app ──────────────────────────────────────────────
  isDesktopApp: true,
  platform: process.platform,
  appVersion: require('../package.json').version,
});

// ─── Injecter le support Drag & Drop dans la page ───────────
window.addEventListener('DOMContentLoaded', () => {
  // Empêcher le comportement par défaut du navigateur pour le drag
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const files = [];
    for (const file of e.dataTransfer.files) {
      files.push(file.path);
    }

    if (files.length > 0) {
      // Vérifier les fichiers audio
      const result = await window.cueforge.onFilesDropped(files);

      if (result.success) {
        // Afficher une zone visuelle de drop
        showDropFeedback(result.files.length);

        // Envoyer à l'upload via l'API du site
        const uploadData = await window.cueforge.uploadFiles(result.files);
        triggerUpload(uploadData);
      } else {
        showDropError(result.message);
      }
    }
  });

  // Effet visuel quand on drag au-dessus de la fenêtre
  document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    showDropZone();
  });

  document.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null) {
      hideDropZone();
    }
  });
});

// ─── UI Helpers pour le Drag & Drop ─────────────────────────
function showDropZone() {
  let overlay = document.getElementById('cueforge-drop-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'cueforge-drop-overlay';
    overlay.innerHTML = `
      <div style="
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(139, 92, 246, 0.15);
        backdrop-filter: blur(4px);
        display: flex; align-items: center; justify-content: center;
        z-index: 99999;
        pointer-events: none;
        transition: opacity 0.2s;
      ">
        <div style="
          background: rgba(17, 17, 17, 0.95);
          border: 2px dashed #8b5cf6;
          border-radius: 20px;
          padding: 48px 64px;
          text-align: center;
          box-shadow: 0 25px 50px rgba(0,0,0,0.5);
        ">
          <div style="font-size: 48px; margin-bottom: 16px;">🎵</div>
          <div style="color: #fff; font-size: 20px; font-weight: 600; margin-bottom: 8px;">
            Déposez vos fichiers audio
          </div>
          <div style="color: #a1a1aa; font-size: 14px;">
            MP3, WAV, FLAC, AAC, OGG, M4A, AIFF
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'block';
}

function hideDropZone() {
  const overlay = document.getElementById('cueforge-drop-overlay');
  if (overlay) overlay.style.display = 'none';
}

function showDropFeedback(count) {
  hideDropZone();
  const msg = count === 1 ? '1 fichier en cours d\'upload...' : `${count} fichiers en cours d'upload...`;

  // Notification native
  window.cueforge.showNotification({
    title: 'CueForge',
    body: msg,
    silent: true,
  });
}

function showDropError(message) {
  hideDropZone();
  window.cueforge.showNotification({
    title: 'CueForge — Erreur',
    body: message,
    silent: false,
  });
}

// ─── Déclencher l'upload dans le site web ───────────────────
async function triggerUpload(uploadData) {
  // Créer des objets File à partir des données base64 et les injecter
  // dans l'input file du site ou via l'API directement
  const successFiles = uploadData.filter((f) => f.success);

  if (successFiles.length > 0) {
    // Méthode 1 : Naviguer vers la page upload avec les fichiers
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');

    for (const file of successFiles) {
      try {
        const binaryStr = atob(file.buffer);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const blob = new Blob([bytes]);
        const formData = new FormData();
        formData.append('file', blob, file.name);

        const apiUrl =
          document.querySelector('meta[name="api-url"]')?.content ||
          'https://cueforge-saas-production.up.railway.app/api/v1';

        const response = await fetch(`${apiUrl}/tracks/upload`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        if (response.ok) {
          window.cueforge.showNotification({
            title: 'Upload réussi',
            body: `${file.name} a été uploadé avec succès !`,
            silent: false,
          });
          window.cueforge.dockBounce();
        } else {
          window.cueforge.showNotification({
            title: 'Erreur d\'upload',
            body: `Échec pour ${file.name}`,
            silent: false,
          });
        }
      } catch (err) {
        console.error(`Erreur upload ${file.name}:`, err);
      }
    }
  }
}
