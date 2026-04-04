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
        // Highlight active tab
        document.querySelectorAll('.settings-tab[data-stab]').forEach(t => {
          t.classList.remove('active');
          t.style.background = 'none';
          t.style.color = 'var(--text-secondary)';
        });
        tab.classList.add('active');
        tab.style.background = 'var(--bg-elevated)';
        tab.style.color = 'var(--text-primary)';

        // Show corresponding panel
        const panels = ['stabProfile', 'stabPassword', 'stabPrefs', 'stabUpdates'];
        panels.forEach(id => {
          const el = document.getElementById(id);
          if (el) el.style.display = 'none';
        });
        const panelId = 'stab' + tab.dataset.stab.charAt(0).toUpperCase() + tab.dataset.stab.slice(1);
        const panel = document.getElementById(panelId);
        if (panel) panel.style.display = 'block';
      });
    });

    // Set initial active tab style
    const firstTab = document.querySelector('.settings-tab[data-stab].active');
    if (firstTab) {
      firstTab.style.background = 'var(--bg-elevated)';
      firstTab.style.color = 'var(--text-primary)';
    }

    // Save profile
    document.getElementById('btnSaveProfile').addEventListener('click', () => this.saveProfile());

    // Change password
    document.getElementById('btnChangePassword').addEventListener('click', () => this.changePassword());

    // DJ Prefs
    DJPrefs.initUI();

    // Load profile immediately to populate name, email, plan
    this.loadProfile();
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

      const plan = this.profile.subscription_plan || this.profile.plan || 'free';
      const badge = document.getElementById('accountPlanBadge');
      badge.textContent = plan.charAt(0).toUpperCase() + plan.slice(1);
      badge.className = `plan-badge-lg plan-${plan}`;

      // Show admin nav if admin
      if (this.profile.is_admin) {
        const navAdmin = document.getElementById('navAdmin');
        if (navAdmin) navAdmin.style.display = '';
      }

      // Update sidebar user footer
      const sidebarUsername = document.getElementById('sidebarUsername');
      const sidebarPlan = document.getElementById('sidebarPlan');
      if (sidebarUsername) sidebarUsername.textContent = this.profile.name || this.profile.email;
      if (sidebarPlan) {
        const planDisplay = `Plan ${plan.charAt(0).toUpperCase() + plan.slice(1)}`;
        sidebarPlan.textContent = planDisplay;
      }

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
        document.querySelectorAll('.settings-tab[data-atab]').forEach(t => {
          t.classList.remove('active');
          t.style.background = 'none';
          t.style.color = 'var(--text-secondary)';
        });
        tab.classList.add('active');
        tab.style.background = 'var(--bg-elevated)';
        tab.style.color = 'var(--text-primary)';

        // Show corresponding panel
        const panels = ['atabDashboard', 'atabUsers', 'atabFeatures'];
        panels.forEach(id => {
          const el = document.getElementById(id);
          if (el) el.style.display = 'none';
        });
        const panelId = 'atab' + tab.dataset.atab.charAt(0).toUpperCase() + tab.dataset.atab.slice(1);
        const panel = document.getElementById(panelId);
        if (panel) panel.style.display = 'block';

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
      const cards = document.getElementById('adminStatCards');
      const distrib = document.getElementById('adminPlanDistrib');
      if (!cards || !distrib) {
        console.warn('Admin DOM not ready, retrying in 200ms...');
        setTimeout(() => this.loadDashboard(), 200);
        return;
      }
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
// UPDATE CHECKER (dans les préférences)
// ═══════════════════════════════════════════════════════════════════════════
const UpdateChecker = {
  init() {
    const btn = document.getElementById('btnCheckUpdates');
    if (!btn) return;
    btn.addEventListener('click', () => this.check());

    // Afficher la version actuelle
    this.loadVersion();
  },

  async loadVersion() {
    try {
      const version = await window.cueforge.getAppVersion();
      const label = document.getElementById('currentVersionLabel');
      if (label) label.textContent = `v${version}`;
    } catch (err) {
      console.warn('Could not get app version:', err);
      // Fallback: retry after DOM is fully ready
      setTimeout(async () => {
        try {
          const version = await window.cueforge.getAppVersion();
          const label = document.getElementById('currentVersionLabel');
          if (label) label.textContent = `v${version}`;
        } catch (e) {
          const label = document.getElementById('currentVersionLabel');
          if (label) label.textContent = 'v2.7.3';
        }
      }, 1000);
    }
  },

  async check() {
    const btn = document.getElementById('btnCheckUpdates');
    const result = document.getElementById('updateCheckResult');
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Vérification en cours…';
    result.style.display = 'none';

    try {
      const info = await window.cueforge.checkForUpdates();
      if (info && info.available) {
        result.style.background = 'rgba(37, 99, 235, 0.1)';
        result.style.border = '1px solid rgba(37, 99, 235, 0.3)';
        result.style.color = '#60a5fa';
        result.innerHTML = `🚀 <strong>Nouvelle version disponible : v${info.version}</strong><br><span style="font-size:12px;color:var(--text-muted)">Le téléchargement démarre automatiquement. Tu seras notifié quand elle sera prête.</span>`;
      } else {
        result.style.background = 'rgba(16, 185, 129, 0.1)';
        result.style.border = '1px solid rgba(16, 185, 129, 0.3)';
        result.style.color = '#10b981';
        result.innerHTML = `✅ <strong>Tu es à jour !</strong> (v${info?.version || '?'})`;
      }
    } catch (err) {
      result.style.background = 'rgba(239, 68, 68, 0.1)';
      result.style.border = '1px solid rgba(239, 68, 68, 0.3)';
      result.style.color = '#ef4444';
      result.innerHTML = `❌ Erreur de vérification : ${err.message}`;
    }

    result.style.display = 'block';
    btn.disabled = false;
    btn.innerHTML = '<span>🔍</span> Vérifier les mises à jour';
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════
function initSettingsAdmin() {
  // Injecter le HTML des settings dans le container
  const container = document.getElementById('settingsContent');
  if (container && !container.dataset.rendered) {
    container.dataset.rendered = 'true';
    container.innerHTML = `
      <!-- Settings Tabs -->
      <div style="display:flex;gap:8px;margin-bottom:20px;border-bottom:1px solid var(--border-subtle);padding-bottom:12px">
        <button class="settings-tab active" data-stab="profile" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;padding:8px 16px;font-size:13px;border-radius:6px;transition:all .2s">Profil</button>
        <button class="settings-tab" data-stab="password" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;padding:8px 16px;font-size:13px;border-radius:6px;transition:all .2s">Sécurité</button>
        <button class="settings-tab" data-stab="prefs" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;padding:8px 16px;font-size:13px;border-radius:6px;transition:all .2s">DJ Préférences</button>
        <button class="settings-tab" data-stab="updates" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;padding:8px 16px;font-size:13px;border-radius:6px;transition:all .2s">Mises à jour</button>
      </div>

      <!-- Profil -->
      <div id="stabProfile" class="active" style="display:block">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px">
          <div id="accountAvatar" style="width:56px;height:56px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:white">K</div>
          <div>
            <div id="accountName2" style="font-size:16px;font-weight:600;color:var(--text-primary)">—</div>
            <div id="accountEmail2" style="font-size:12px;color:var(--text-muted)">—</div>
            <span id="accountPlanBadge" class="plan-badge-lg plan-free" style="display:inline-block;margin-top:4px;padding:2px 10px;border-radius:4px;font-size:11px;font-weight:700">Free</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;max-width:400px">
          <label style="font-size:12px;color:var(--text-secondary)">Nom</label>
          <input id="settingsName" type="text" style="background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:6px;padding:8px 12px;color:var(--text-primary);font-size:13px" />
          <label style="font-size:12px;color:var(--text-secondary)">Email</label>
          <input id="settingsEmail" type="email" style="background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:6px;padding:8px 12px;color:var(--text-primary);font-size:13px" />
          <button id="btnSaveProfile" class="btn-save" style="align-self:flex-start;padding:8px 20px;background:var(--accent);color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;margin-top:8px">Sauvegarder</button>
        </div>
      </div>

      <!-- Sécurité -->
      <div id="stabPassword" style="display:none">
        <div style="display:flex;flex-direction:column;gap:12px;max-width:400px">
          <label style="font-size:12px;color:var(--text-secondary)">Mot de passe actuel</label>
          <input id="settingsCurrentPwd" type="password" style="background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:6px;padding:8px 12px;color:var(--text-primary);font-size:13px" />
          <label style="font-size:12px;color:var(--text-secondary)">Nouveau mot de passe</label>
          <input id="settingsNewPwd" type="password" style="background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:6px;padding:8px 12px;color:var(--text-primary);font-size:13px" />
          <label style="font-size:12px;color:var(--text-secondary)">Confirmer le mot de passe</label>
          <input id="settingsConfirmPwd" type="password" style="background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:6px;padding:8px 12px;color:var(--text-primary);font-size:13px" />
          <button id="btnChangePassword" class="btn-save" style="align-self:flex-start;padding:8px 20px;background:var(--accent);color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;margin-top:8px">Changer le mot de passe</button>
        </div>
      </div>

      <!-- DJ Préférences -->
      <div id="stabPrefs" style="display:none">
        <div style="display:flex;flex-direction:column;gap:16px;max-width:400px">
          <div>
            <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Format d'export par défaut</label>
            <select id="prefExportFormat" style="background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:6px;padding:8px 12px;color:var(--text-primary);font-size:13px;width:100%">
              <option value="rekordbox">Rekordbox XML</option>
              <option value="serato">Serato</option>
              <option value="traktor">Traktor NML</option>
            </select>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between">
            <label style="font-size:13px;color:var(--text-primary)">Auto-analyse à l'import</label>
            <input id="prefAutoAnalyze" type="checkbox" checked />
          </div>
          <div>
            <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Qualité d'analyse</label>
            <select id="prefAnalysisQuality" style="background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:6px;padding:8px 12px;color:var(--text-primary);font-size:13px;width:100%">
              <option value="fast">Rapide</option>
              <option value="balanced">Équilibré</option>
              <option value="high">Haute qualité</option>
            </select>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between">
            <label style="font-size:13px;color:var(--text-primary)">Afficher clés Camelot</label>
            <input id="prefCamelot" type="checkbox" checked />
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between">
            <label style="font-size:13px;color:var(--text-primary)">Afficher barres d'énergie</label>
            <input id="prefEnergyBars" type="checkbox" checked />
          </div>
          <div>
            <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px">Style de waveform</label>
            <select id="prefWaveformStyle" style="background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:6px;padding:8px 12px;color:var(--text-primary);font-size:13px;width:100%">
              <option value="gradient">Gradient 3 bandes</option>
              <option value="solid">Couleur unie</option>
              <option value="bars">Barres</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Mises à jour -->
      <div id="stabUpdates" style="display:none">
        <div style="max-width:500px">
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;padding:16px;background:var(--bg-card);border:1px solid var(--border-default);border-radius:10px">
            <div style="width:48px;height:48px;border-radius:12px;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:22px">🎵</div>
            <div style="flex:1">
              <div style="font-size:15px;font-weight:600;color:var(--text-primary)">CueForge Desktop</div>
              <div style="font-size:13px;color:var(--text-muted);margin-top:2px">Version actuelle : <strong id="currentVersionLabel" style="color:var(--accent-success)">…</strong></div>
            </div>
          </div>

          <button id="btnCheckUpdates" style="display:flex;align-items:center;gap:8px;padding:10px 20px;background:var(--accent);color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;transition:opacity .2s">
            <span>🔍</span> Vérifier les mises à jour
          </button>

          <div id="updateCheckResult" style="margin-top:16px;padding:14px 16px;border-radius:8px;font-size:13px;display:none"></div>
        </div>
      </div>
    `;
  }

  Settings.init();
  AdminPanel.init();
  UpdateChecker.init();

  // Load profile on init to show admin sidebar etc.
  Settings.loadProfile();
}

// ═══════════════════════════════════════════════════════════════════════════
// INJECT ADMIN HTML
// ═══════════════════════════════════════════════════════════════════════════
function initAdminContent() {
  const container = document.getElementById('adminContent');
  if (!container || container.dataset.rendered) return;
  container.dataset.rendered = 'true';
  container.innerHTML = `
    <div class="page-inner">
      <div class="page-title">Administration</div>
      <div class="page-desc">Gestion des utilisateurs, plans et features</div>

      <!-- Admin Tabs -->
      <div style="display:flex;gap:8px;margin-bottom:20px;border-bottom:1px solid var(--border-subtle);padding-bottom:12px">
        <button class="settings-tab active" data-atab="dashboard" style="background:var(--bg-elevated);border:none;color:var(--text-primary);cursor:pointer;padding:8px 16px;font-size:13px;border-radius:6px;transition:all .2s">Dashboard</button>
        <button class="settings-tab" data-atab="users" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;padding:8px 16px;font-size:13px;border-radius:6px;transition:all .2s">Utilisateurs</button>
        <button class="settings-tab" data-atab="features" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;padding:8px 16px;font-size:13px;border-radius:6px;transition:all .2s">Features</button>
      </div>

      <!-- Dashboard Panel -->
      <div id="atabDashboard" class="active">
        <div id="adminStatCards" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px"></div>
        <div id="adminPlanDistrib" style="background:var(--bg-card);border:1px solid var(--border-default);border-radius:10px;padding:16px"></div>
      </div>

      <!-- Users Panel -->
      <div id="atabUsers" style="display:none">
        <div style="display:flex;gap:8px;margin-bottom:16px;align-items:center">
          <input id="adminUserSearch" type="text" placeholder="Rechercher un email…" style="flex:1;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:6px;padding:8px 12px;color:var(--text-primary);font-size:13px" />
          <select id="adminUserPlanFilter" style="background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:6px;padding:8px 12px;color:var(--text-primary);font-size:13px">
            <option value="">Tous les plans</option>
            <option value="free">Free</option>
            <option value="pro">Pro</option>
            <option value="unlimited">Unlimited</option>
          </select>
          <button id="btnAdminRefreshUsers" style="padding:8px 16px;background:var(--accent);color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer">Actualiser</button>
        </div>
        <div id="adminUsersTableContainer"></div>
      </div>

      <!-- Features Panel -->
      <div id="atabFeatures" style="display:none">
        <div style="display:flex;gap:8px;margin-bottom:16px;align-items:center">
          <input id="adminNewFeatureName" type="text" placeholder="Nom de la feature…" style="flex:1;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:6px;padding:8px 12px;color:var(--text-primary);font-size:13px" />
          <button id="btnAdminAddFeature" style="padding:8px 16px;background:var(--accent);color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer">+ Ajouter</button>
        </div>
        <div id="adminFeaturesContainer"></div>
      </div>
    </div>
  `;
}

// Update ViewManager to handle settings/admin views
function onViewSwitch(view) {
  if (view === 'account') Settings.loadProfile();
  if (view === 'settings') {
    initSettingsAdmin();
    Settings.loadProfile();
  }
  if (view === 'admin') {
    initAdminContent();
    AdminPanel.init();
    AdminPanel.loadDashboard();
  }
}
