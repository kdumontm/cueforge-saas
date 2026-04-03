'use strict';
// Vérification de licence via Railway — 1 appel par jour max (usage minimal serveur)

const API_URL = 'https://cueforge-saas-production.up.railway.app/api/v1';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h en ms
const OFFLINE_GRACE = 7 * 24 * 60 * 60 * 1000; // 7j offline grace period

const { getSetting, setSetting } = require('./database');

async function login(email, password) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: email, password }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Identifiants incorrects');
  }
  const data = await res.json();
  setSetting('auth_token', data.access_token);
  setSetting('auth_email', email);
  setSetting('license_cache', null); // reset cache on new login
  return data;
}

function logout() {
  setSetting('auth_token', null);
  setSetting('license_cache', null);
}

async function verifyLicense() {
  // 1. Check local cache
  const cache = getSetting('license_cache');
  const now = Date.now();

  if (cache && (now - cache.timestamp) < CACHE_TTL) {
    return { valid: cache.valid, plan: cache.plan, email: cache.email, fromCache: true };
  }

  // 2. Try online verification
  const token = getSetting('auth_token');
  if (!token) {
    // Check if there's an old valid cache within grace period
    if (cache && (now - cache.timestamp) < OFFLINE_GRACE && cache.valid) {
      return { valid: true, plan: cache.plan, email: cache.email, fromCache: true, offline: true };
    }
    return { valid: false, reason: 'not_logged_in' };
  }

  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 401) {
      // Token expired — force re-login
      setSetting('auth_token', null);
      if (cache && (now - cache.timestamp) < OFFLINE_GRACE && cache.valid) {
        return { valid: true, plan: cache.plan, email: cache.email, fromCache: true, offline: true, tokenExpired: true };
      }
      return { valid: false, reason: 'token_expired' };
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const user = await res.json();
    const plan = user.plan || 'free';
    const valid = true; // any logged-in user can use the app

    // Update cache
    setSetting('license_cache', { valid, plan, email: user.email, timestamp: now });
    return { valid, plan, email: user.email };

  } catch (err) {
    // Network error — use grace period
    if (cache && (now - cache.timestamp) < OFFLINE_GRACE && cache.valid) {
      return { valid: true, plan: cache.plan, email: cache.email, fromCache: true, offline: true };
    }
    return { valid: false, reason: 'network_error', message: err.message };
  }
}

function getStoredToken() {
  return getSetting('auth_token');
}

function getStoredEmail() {
  return getSetting('auth_email');
}

// ─── API helpers (profile, password, admin) ────────────────────────────────

async function _authFetch(endpoint, options = {}) {
  const token = getSetting('auth_token');
  if (!token) throw new Error('Non connecté');
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Erreur ${res.status}`);
  }
  return res.json();
}

async function getProfile() {
  return _authFetch('/auth/me');
}

async function updateProfile(data) {
  return _authFetch('/auth/me', { method: 'PUT', body: JSON.stringify(data) });
}

async function changePassword(currentPassword, newPassword) {
  return _authFetch('/auth/me', {
    method: 'PUT',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

async function getAdminDashboard() {
  return _authFetch('/admin/dashboard');
}

async function getAdminUsers(search, plan) {
  let qs = '';
  const params = [];
  if (search) params.push(`search=${encodeURIComponent(search)}`);
  if (plan && plan !== 'all') params.push(`plan=${encodeURIComponent(plan)}`);
  if (params.length) qs = '?' + params.join('&');
  return _authFetch(`/admin/users${qs}`);
}

async function updateAdminUser(userId, data) {
  return _authFetch(`/admin/users/${userId}`, { method: 'PUT', body: JSON.stringify(data) });
}

async function getAdminFeatures() {
  return _authFetch('/admin/features');
}

async function updateAdminFeature(featureId, data) {
  return _authFetch(`/admin/features/${featureId}`, { method: 'PUT', body: JSON.stringify(data) });
}

async function createAdminFeature(data) {
  return _authFetch('/admin/features', { method: 'POST', body: JSON.stringify(data) });
}

async function deleteAdminFeature(featureId) {
  return _authFetch(`/admin/features/${featureId}`, { method: 'DELETE' });
}

module.exports = {
  login, logout, verifyLicense, getStoredToken, getStoredEmail,
  getProfile, updateProfile, changePassword,
  getAdminDashboard, getAdminUsers, updateAdminUser,
  getAdminFeatures, updateAdminFeature, createAdminFeature, deleteAdminFeature,
};
