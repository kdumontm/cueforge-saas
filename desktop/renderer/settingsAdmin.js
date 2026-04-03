'use strict';
/**
 * CueForge — Settings & Admin Panel (Desktop)
 */

// ═══════════════════════════════════════════════════════════════════════════
// TOAST NOTIFICATION
// ═══════════════════════════════════════════════════════════════════════════
function showToast(msg, type = 'success') {
  let toast = document.getElementById('cfToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'cfToast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  requestAnimationFrame(() => toast.classList.add('show'));
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ═══════════════════════════════════════════════════════════════════════════
// DJ PREFERENCES (localStorage)
// ═══════════════════════════════════════════════════════════════════════════
const DJPrefs = {
  STORAGE_KEY: 'cueforge_dj_prefs',
  defaults: {
    exportFormat: 'rekordbox',
    autoAnalyze: true,
    analysisQuality: 'high',
    showCamelot: true,
    showEnergyBars: true,
    waveformStyle: 'gradient',
  },

  load() {
    try {
      return { ...this.defaults, ...JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '{}') };
    } catch { return { ...this.defaults }; }
  },

  save(prefs) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(prefs));
  },

  initUI() {
    const prefs = this.load();
    document.getElementById('prefExportFormat').value = prefs.exportFormat;
    document.getElementById('prefAutoAnalyze').checked = prefs.autoAnalyze;
    document.getElementById('prefAnalysisQuality').value = prefs.analysisQuality;
    document.getElementById('prefCamelot').checked = prefs.showCamelot;
    document.getElementById('prefEnergyBars').checked = prefs.showEnergyBars;
    document.getElementById('prefWaveformStyle').value = prefs.waveformStyle;

    // Auto-save on change
    const ids = ['prefExportFormat', 'prefAutoAnalyze', 'prefAnalysisQuality', 'prefCamelot', 'prefEnergyBars', 'prefWaveformStyle'];
    ids.forEach(id => {
      document.getElementById(id).addEventListener('change', () => {
        const p = {
          exportFormat: document.getElementById('prefExportFormat').value,
          autoAnalyze: document.getElementById('prefAutoAnalyze').checked,
          analysisQuality: document.getElementById('prefAnalysisQuality').value,
          showCamelot: document.getElementById('prefCamelot').checked,
          showEnergyBars: document.getElementById('prefEnergyBars').checked,
          waveformStyle: document.getElementById('prefWaveformStyle').value,
        };
        this.save(p);
        showToast('Préférences sauvegardées');
      });
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════════════
const Settings = {
  profile: null,

  init() {
    // Tab switching
    document.querySelectorAll('.settings-tab[data-stab]').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.settings-tab[data-stab]').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('[id^="stab"]').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panelId = 'stab' + tab.dataset.stab.charAt(0).toUpperCase() + tab.dataset.stab.slice(1);
        document.getElementById(panelId)?.classList.add('active');
      });
    });

    // Save profile
    document.getElementById('btnSaveProfile').addEventListener('click', () => this.saveProfile());

    // Change password
    document.getElementById('btnChangePassword').addEventListener('click', () => this.changePassword());

    // DJ Prefs
    DJPrefs.initUI();
  },

  async loadProfile() {
    try {
      this.profile = await window.cueforge.getProfile();
      document.getElementById('settingsName').value = this.profile.name || '';
      document.getElementById('settingsEmail').value = this.profile.email || '';

      // Account view
      const initial = (this.profile.name || this.profile.email || 'U')[0].toUpperCase();
      document.getElementById('accountAvatar').textContent = initial;
      document.getElementById('accountName2').textContent = this.profile.name || '—';
      document.getElementById('accountEmail2').textContent = this.profile.email || '—';

      const plan = this.profile.subscription_plan || 'free';
      const badge = document.getElementById('accountPlanBadge');
      badge.textContent = plan.charAt(0).toUpperCase() + plan.slice(1);
      badge.className = `plan-badge-lg plan-${plan}`;

      // Show admin sidebar if admin
      if (this.profile.is_admin) {
        document.getElementById('sidebarAdmin').style.display = '';
      }

      // Update sidebar account
      document.getElementById('accountEmail').textContent = this.profile.name || this.profile.email;
      document.getElementById('accountPlan').textContent = plan.charAt(0).toUpperCase() + plan.slice(1);

    } catch (err) {
      console.error('Failed to load profile:', err);
    }
  },

  async saveProfile() {
    const btn = document.getElementById('btnSaveProfile');
    btn.disabled = true;
    try {
      const data = {};
      const name = document.getElementById('settingsName').value.trim();
      const email = document.getElementById('settingsEmail').value.trim();
      if (name) data.name = name;
      if (email) data.email = email;
      await window.cueforge.updateProfile(data);
      showToast('Profil mis à jour');
      this.loadProfile();
    } catch (err) {
      showToast(err.message || 'Erreur', 'error');
    }
    btn.disabled = false;
  },

  async changePassword() {
    const current = document.getElementById('settingsCurrentPwd').value;
    const newPwd = document.getElementById('settingsNewPwd').value;
    const confirm = document.getElementById('settingsConfirmPwd').value;

    if (!current || !newPwd) {
      showToast('Remplis tous les champs', 'error');
      return;
    }
    if (newPwd !== confirm) {
      showToast('Les mots de passe ne correspondent pas', 'error');
      return;
    }
    if (newPwd.length < 8) {
      showToast('Minimum 8 caractères', 'error');
      return;
    }

    const btn = document.getElementById('btnChangePassword');
    btn.disabled = true;
    try {
      await window.cueforge.changePassword(current, newPwd);
      showToast('Mot de passe changé');
      document.getElementById('settingsCurrentPwd').value = '';
      document.getElementById('settingsNewPwd').value = '';
      document.getElementById('settingsConfirmPwd').value = '';
    } catch (err) {
      showToast(err.message || 'Erreur', 'error');
    }
    btn.disabled = false;
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN PANEL
// ═══════════════════════════════════════════════════════════════════════════
const AdminPanel = {
  users: [],
  features: [],

  init() {
    // Admin tab switching
    document.querySelectorAll('.settings-tab[data-atab]').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.settings-tab[data-atab]').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('[id^="atab"]').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panelId = 'atab' + tab.dataset.atab.charAt(0).toUpperCase() + tab.dataset.atab.slice(1);
        document.getElementById(panelId)?.classList.add('active');

        // Load data when switching tabs
        if (tab.dataset.atab === 'users') this.loadUsers();
        if (tab.dataset.atab === 'features') this.loadFeatures();
      });
    });

    // User search
    document.getElementById('btnAdminRefreshUsers').addEventListener('click', () => this.loadUsers());
    document.getElementById('adminUserSearch').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.loadUsers();
    });
    document.getElementById('adminUserPlanFilter').addEventListener('change', () => this.loadUsers());

    // Add feature
    document.getElementById('btnAdminAddFeature').addEventListener('click', () => this.addFeature());
    document.getElementById('adminNewFeatureName').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.addFeature();
    });
  },

  async loadDashboard() {
    try {
      const data = await window.cueforge.getAdminDashboard();
      const cards = document.getElementById('adminStatCards');
      const distrib = document.getElementById('adminPlanDistrib');

      const stats = data.stats || data;
      cards.innerHTML = `
        <div class="stat-card"><div class="stat-card-value">${stats.total_users || 0}</div><div class="stat-card-label">Utilisateurs</div></div>
        <div class="stat-card"><div class="stat-card-value">${stats.verified_users || stats.total_users || 0}</div><div class="stat-card-label">Vérifiés</div></div>
        <div class="stat-card"><div class="stat-card-value">${stats.admin_count || 0}</div><div class="stat-card-label">Admins</div></div>
        <div class="stat-card"><div class="stat-card-value">${stats.total_pages || 0}</div><div class="stat-card-label">Pages</div></div>
      `;

      // Plan distribution
      const plans = stats.plan_distribution || stats.plans || {};
      let distribHtml = '<div class="tool-card-title">Répartition des plans</div>';
      const planColors = { free: '#94a3b8', pro: '#60a5fa', unlimited: '#c084fc', enterprise: '#fbbf24' };
      const total = Object.values(plans).reduce((a, b) => a + b, 0) || 1;

      distribHtml += '<div style="display:flex;gap:4px;height:28px;border-radius:6px;overflow:hidden;margin:12px 0">';
      for (const [plan, count] of Object.entries(plans)) {
        const pct = Math.round(count / total * 100);
        if (pct > 0) {
          distribHtml += `<div style="width:${pct}%;background:${planColors[plan] || '#666'};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#000" title="${plan}: ${count}">${pct}%</div>`;
        }
      }
      distribHtml += '</div>';

      for (const [plan, count] of Object.entries(plans)) {
        distribHtml += `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;font-size:12px">
          <span style="width:10px;height:10px;border-radius:2px;background:${planColors[plan] || '#666'}"></span>
          <span style="color:#aaa;text-transform:capitalize">${plan}</span>
          <span style="color:#666;margin-left:auto">${count} utilisateur${count > 1 ? 's' : ''}</span>
        </div>`;
      }
      distrib.innerHTML = distribHtml;
    } catch (err) {
      document.getElementById('adminStatCards').innerHTML = `<div style="color:#ef4444;font-size:13px">Erreur: ${err.message}</div>`;
    }
  },

  async loadUsers() {
    const search = document.getElementById('adminUserSearch').value.trim();
    const plan = document.getElementById('adminUserPlanFilter').value;
    const container = document.getElementById('adminUsersTableContainer');

    container.innerHTML = '<div style="color:#888;font-size:13px;padding:20px;text-align:center">Chargement…</div>';

    try {
      const data = await window.cueforge.getAdminUsers(search, plan);
      this.users = Array.isArray(data) ? data : (data.users || []);
      this.renderUsers();
    } catch (err) {
      container.innerHTML = `<div style="color:#ef4444;font-size:13px">Erreur: ${err.message}</div>`;
    }
  },

  renderUsers() {
    const container = document.getElementById('adminUsersTableContainer');
    if (this.users.length === 0) {
      container.innerHTML = '<div style="color:#666;text-align:center;padding:20px">Aucun utilisateur trouvé.</div>';
      return;
    }

    const planBadge = (plan) => {
      const colors = { free: '#64748b', pro: '#3b82f6', unlimited: '#8b5cf6', enterprise: '#f59e0b' };
      return `<span class="admin-badge" style="background:${colors[plan] || '#333'}22;color:${colors[plan] || '#888'}">${plan}</span>`;
    };

    let html = `<table class="admin-table">
      <thead><tr>
        <th>Email</th><th>Nom</th><th>Plan</th><th>Admin</th><th>Vérifié</th><th>Dernier login</th><th>Actions</th>
      </tr></thead><tbody>`;

    this.users.forEach(u => {
      const lastLogin = u.last_login_at ? new Date(u.last_login_at).toLocaleDateString('fr') : '—';
      html += `<tr>
        <td>${u.email || '—'}</td>
        <td>${u.name || '—'}</td>
        <td>${planBadge(u.subscription_plan || u.plan || 'free')}</td>
        <td>${u.is_admin ? '👑' : '—'}</td>
        <td>${u.email_verified ? '✅' : '❌'}</td>
        <td style="color:#666">${lastLogin}</td>
        <td><button class="btn-save" style="padding:4px 10px;font-size:11px" onclick="AdminPanel.editUser(${u.id})">Éditer</button></td>
      </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
  },

  async editUser(userId) {
    const user = this.users.find(u => u.id === userId);
    if (!user) return;

    const newPlan = prompt(`Plan pour ${user.name || user.email} (free/pro/unlimited) :`, user.subscription_plan || user.plan || 'free');
    if (!newPlan || !['free', 'pro', 'unlimited'].includes(newPlan)) return;

    const isAdmin = confirm(`${user.name || user.email} est admin ?`);

    try {
      await window.cueforge.updateAdminUser(userId, {
        subscription_plan: newPlan,
        is_admin: isAdmin,
      });
      showToast('Utilisateur mis à jour');
      this.loadUsers();
    } catch (err) {
      showToast(err.message || 'Erreur', 'error');
    }
  },

  async loadFeatures() {
    const container = document.getElementById('adminFeaturesContainer');
    container.innerHTML = '<div style="color:#888;font-size:13px;text-align:center;padding:20px">Chargement…</div>';

    try {
      const data = await window.cueforge.getAdminFeatures();
      this.features = Array.isArray(data) ? data : (data.features || []);
      this.renderFeatures();
    } catch (err) {
      container.innerHTML = `<div style="color:#ef4444;font-size:13px">Erreur: ${err.message}</div>`;
    }
  },

  renderFeatures() {
    const container = document.getElementById('adminFeaturesContainer');
    if (this.features.length === 0) {
      container.innerHTML = '<div style="color:#666;text-align:center;padding:20px">Aucune feature.</div>';
      return;
    }

    const plans = ['free', 'pro', 'unlimited'];
    let html = '<div class="feature-grid">';
    html += '<div class="feature-grid-header feature-grid-name">Feature</div>';
    plans.forEach(p => {
      html += `<div class="feature-grid-header">${p}</div>`;
    });

    this.features.forEach(f => {
      html += `<div class="feature-grid-cell feature-grid-name">
        <span style="flex:1">${f.label || f.feature_name}</span>
        <span style="cursor:pointer;color:#555;font-size:14px" onclick="AdminPanel.deleteFeature(${f.id})" title="Supprimer">🗑</span>
      </div>`;
      plans.forEach(p => {
        const enabled = f.plans ? f.plans[p] : f.is_enabled;
        html += `<div class="feature-grid-cell">
          <label class="toggle-switch">
            <input type="checkbox" ${enabled ? 'checked' : ''} onchange="AdminPanel.toggleFeature(${f.id},'${p}',this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>`;
      });
    });

    html += '</div>';
    container.innerHTML = html;
  },

  async toggleFeature(id, plan, enabled) {
    try {
      await window.cueforge.updateAdminFeature(id, { plan, is_enabled: enabled });
    } catch (err) {
      showToast(err.message || 'Erreur', 'error');
      this.loadFeatures(); // Revert
    }
  },

  async addFeature() {
    const input = document.getElementById('adminNewFeatureName');
    const name = input.value.trim();
    if (!name) return;

    try {
      await window.cueforge.createAdminFeature({ feature_name: name, label: name });
      input.value = '';
      showToast('Feature ajoutée');
      this.loadFeatures();
    } catch (err) {
      showToast(err.message || 'Erreur', 'error');
    }
  },

  async deleteFeature(id) {
    if (!confirm('Supprimer cette feature ?')) return;
    try {
      await window.cueforge.deleteAdminFeature(id);
      showToast('Feature supprimée');
      this.loadFeatures();
    } catch (err) {
      showToast(err.message || 'Erreur', 'error');
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════
function initSettingsAdmin() {
  Settings.init();
  AdminPanel.init();

  // Load profile on init to show admin sidebar etc.
  Settings.loadProfile();
}

// Update ViewManager to handle settings/admin views
function onViewSwitch(view) {
  if (view === 'account') Settings.loadProfile();
  if (view === 'settings') Settings.loadProfile();
  if (view === 'admin') {
    AdminPanel.loadDashboard();
  }
}
