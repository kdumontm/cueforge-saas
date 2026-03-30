"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Shield, BarChart3, FileText, Settings, Image, Users, Zap,
  Plus, Trash2, Edit3, Eye, EyeOff, Save, X, Check, ChevronDown,
  ChevronUp, ChevronRight, Layers, LayoutGrid, Globe, Palette,
  Upload, Search, RefreshCw, Crown, Lock, Unlock, GripVertical,
  AlertTriangle, CheckCircle, Loader, ExternalLink, Copy,
  Sun, Moon, Disc3, ArrowUpDown, MoreHorizontal, type LucideIcon,
} from "lucide-react";

// ═══════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════
const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000") + "/api/v1";

// ═══════════════════════════════════════════════
// DESIGN SYSTEM (matches CueForge dark/light)
// ═══════════════════════════════════════════════
const themes = {
  dark: {
    bg: { base: "#08080f", surface: "#0f0f1a", card: "#151525", elevated: "#1c1c32", hover: "#22223a" },
    accent: { primary: "#2563eb", primaryHover: "#3b82f6", secondary: "#06b6d4", success: "#22c55e", warning: "#f59e0b", error: "#ef4444", pink: "#ec4899", purple: "#a855f7" },
    text: { primary: "#f1f5f9", secondary: "#94a3b8", muted: "#64748b", inverse: "#0f0f1a" },
    border: { subtle: "#1e293b", default: "#334155", accent: "#2563eb" },
  },
  light: {
    bg: { base: "#f8fafc", surface: "#ffffff", card: "#f1f5f9", elevated: "#e2e8f0", hover: "#cbd5e1" },
    accent: { primary: "#2563eb", primaryHover: "#1d4ed8", secondary: "#0891b2", success: "#16a34a", warning: "#d97706", error: "#dc2626", pink: "#db2777", purple: "#9333ea" },
    text: { primary: "#0f172a", secondary: "#475569", muted: "#94a3b8", inverse: "#f1f5f9" },
    border: { subtle: "#e2e8f0", default: "#cbd5e1", accent: "#2563eb" },
  },
};

let DS = { colors: themes.dark };

// ═══════════════════════════════════════════════
// API CLIENT
// ═══════════════════════════════════════════════
function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("cueforge_token");
}

async function api(path, opts = {}) {
  const token = getToken();
  const headers = { ...(opts.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (opts.body && !(opts.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

const adminApi = {
  // Dashboard
  dashboard: () => api("/admin/dashboard"),
  // Settings
  getSettings: () => api("/admin/settings"),
  updateSettings: (data) => api("/admin/settings", { method: "PUT", body: data }),
  // Page Configs (toggles on/off)
  listPageConfigs: () => api("/admin/settings/pages"),
  createPageConfig: (data) => api("/admin/settings/pages", { method: "POST", body: data }),
  togglePageConfig: (pageName, data) => api(`/admin/settings/pages/${pageName}`, { method: "PATCH", body: data }),
  deletePageConfig: (pageName) => api(`/admin/settings/pages/${pageName}`, { method: "DELETE" }),
  // Pages (CMS)
  listPages: () => api("/admin/pages"),
  getPage: (id) => api(`/admin/pages/${id}`),
  createPage: (data) => api("/admin/pages", { method: "POST", body: data }),
  updatePage: (id, data) => api(`/admin/pages/${id}`, { method: "PUT", body: data }),
  deletePage: (id) => api(`/admin/pages/${id}`, { method: "DELETE" }),
  publishPage: (id) => api(`/admin/pages/${id}/publish`, { method: "PUT" }),
  // Sections
  listSections: (pageId) => api(`/admin/pages/${pageId}/sections`),
  createSection: (data) => api("/admin/sections", { method: "POST", body: data }),
  updateSection: (id, data) => api(`/admin/sections/${id}`, { method: "PUT", body: data }),
  deleteSection: (id) => api(`/admin/sections/${id}`, { method: "DELETE" }),
  reorderSections: (orders) => api("/admin/sections/reorder", { method: "PUT", body: orders }),
  // Components
  createComponent: (data) => api("/admin/components", { method: "POST", body: data }),
  updateComponent: (id, data) => api(`/admin/components/${id}`, { method: "PUT", body: data }),
  deleteComponent: (id) => api(`/admin/components/${id}`, { method: "DELETE" }),
  reorderComponents: (orders) => api("/admin/components/reorder", { method: "PUT", body: orders }),
  // Media
  listMedia: (cat) => api(`/admin/media${cat ? `?category=${cat}` : ""}`),
  uploadMedia: (file, category, altText) => {
    const fd = new FormData();
    fd.append("file", file);
    return api(`/admin/media?category=${category || "general"}${altText ? `&alt_text=${encodeURIComponent(altText)}` : ""}`, { method: "POST", body: fd });
  },
  deleteMedia: (id) => api(`/admin/media/${id}`, { method: "DELETE" }),
  // Features
  listFeatures: (plan) => api(`/admin/features${plan ? `?plan=${plan}` : ""}`),
  createFeature: (data) => api("/admin/features", { method: "POST", body: data }),
  updateFeature: (id, data) => api(`/admin/features/${id}`, { method: "PUT", body: data }),
  deleteFeature: (id) => api(`/admin/features/${id}`, { method: "DELETE" }),
  // Users
  listUsers: (params) => {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.plan) q.set("plan", params.plan);
    if (params?.skip) q.set("skip", String(params.skip));
    if (params?.limit) q.set("limit", String(params.limit));
    return api(`/admin/users?${q.toString()}`);
  },
  updateUser: (id, data) => api(`/admin/users/${id}`, { method: "PUT", body: data }),
  deleteUser: (id) => api(`/admin/users/${id}`, { method: "DELETE" }),
};

// ═══════════════════════════════════════════════
// SHARED UI COMPONENTS
// ═══════════════════════════════════════════════
const mono = { fontFamily: "'JetBrains Mono', monospace" };

function Badge({ children, color, style: s }) {
  const c = color || DS.colors.accent.primary;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, ...mono, letterSpacing: "0.03em", background: c + "20", color: c, border: `1px solid ${c}30`, ...s }}>
      {children}
    </span>
  );
}

function Btn({ children, variant = "default", icon: Icon, onClick, style: s, small, disabled, loading }) {
  const styles = {
    primary: { background: DS.colors.accent.primary, color: "white", border: "none" },
    danger: { background: DS.colors.accent.error + "20", color: DS.colors.accent.error, border: `1px solid ${DS.colors.accent.error}30` },
    success: { background: DS.colors.accent.success + "20", color: DS.colors.accent.success, border: `1px solid ${DS.colors.accent.success}30` },
    warning: { background: DS.colors.accent.warning + "20", color: DS.colors.accent.warning, border: `1px solid ${DS.colors.accent.warning}30` },
    default: { background: DS.colors.bg.elevated, color: DS.colors.text.secondary, border: `1px solid ${DS.colors.border.subtle}` },
    ghost: { background: "transparent", color: DS.colors.text.muted, border: "none" },
  };
  return (
    <button onClick={onClick} disabled={disabled || loading} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: small ? "3px 8px" : "6px 14px", borderRadius: 7, fontSize: small ? 11 : 12, fontWeight: 500, cursor: disabled || loading ? "not-allowed" : "pointer", opacity: disabled || loading ? 0.5 : 1, transition: "all 0.15s", ...styles[variant], ...s }}>
      {loading ? <Loader size={small ? 11 : 13} style={{ animation: "spin 1s linear infinite" }} /> : Icon && <Icon size={small ? 11 : 13} />}
      {children}
    </button>
  );
}

function Card({ children, style: s }) {
  return <div style={{ background: DS.colors.bg.card, border: `1px solid ${DS.colors.border.subtle}`, borderRadius: 12, ...s }}>{children}</div>;
}

function Input({ label, value, onChange, type = "text", placeholder, multiline, style: s }) {
  const base = { width: "100%", padding: "8px 12px", borderRadius: 7, border: `1px solid ${DS.colors.border.default}`, background: DS.colors.bg.surface, color: DS.colors.text.primary, fontSize: 13, outline: "none", transition: "border 0.15s", ...s };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {label && <label style={{ fontSize: 11, fontWeight: 600, color: DS.colors.text.secondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>}
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} style={{ ...base, resize: "vertical" }} />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={base} />
      )}
    </div>
  );
}

function Select({ label, value, onChange, options, style: s }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {label && <label style={{ fontSize: 11, fontWeight: 600, color: DS.colors.text.secondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>}
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", padding: "8px 12px", borderRadius: 7, border: `1px solid ${DS.colors.border.default}`, background: DS.colors.bg.surface, color: DS.colors.text.primary, fontSize: 13, outline: "none", ...s }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Toggle({ on, onToggle, label }) {
  return (
    <div onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
      <div style={{ width: 36, height: 20, borderRadius: 10, background: on ? DS.colors.accent.primary : DS.colors.bg.hover, padding: 2, transition: "all 0.2s" }}>
        <div style={{ width: 16, height: 16, borderRadius: 8, background: "white", transform: on ? "translateX(16px)" : "translateX(0)", transition: "all 0.2s" }} />
      </div>
      {label && <span style={{ fontSize: 12, color: DS.colors.text.secondary }}>{label}</span>}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, sub }) {
  const c = color || DS.colors.accent.primary;
  return (
    <Card style={{ padding: 16, flex: 1, minWidth: 160 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: c + "18", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={16} color={c} />
        </div>
        <span style={{ fontSize: 11, color: DS.colors.text.muted, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: DS.colors.text.primary, ...mono }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: DS.colors.text.muted, marginTop: 4 }}>{sub}</div>}
    </Card>
  );
}

function SectionHeader({ title, count, icon: Icon, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${DS.colors.border.subtle}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {Icon && <Icon size={15} color={DS.colors.accent.primary} />}
        <div style={{ fontSize: 14, fontWeight: 600, color: DS.colors.text.primary }}>{title}</div>
        {count !== undefined && <Badge color={DS.colors.text.muted}>{count}</Badge>}
      </div>
      <div style={{ display: "flex", gap: 6 }}>{children}</div>
    </div>
  );
}

function Toast({ message, type = "success", onClose }) {
  const c = type === "error" ? DS.colors.accent.error : DS.colors.accent.success;
  const Icon = type === "error" ? AlertTriangle : CheckCircle;
  return (
    <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 1000, display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 10, background: DS.colors.bg.elevated, border: `1px solid ${c}40`, color: c, fontSize: 13, fontWeight: 500, boxShadow: `0 4px 20px ${DS.colors.bg.base}80`, animation: "slideIn 0.3s ease" }}>
      <Icon size={15} />
      {message}
      <button onClick={onClose} style={{ background: "none", border: "none", color: DS.colors.text.muted, cursor: "pointer", marginLeft: 8 }}><X size={13} /></button>
    </div>
  );
}

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <Card style={{ padding: 24, maxWidth: 400, width: "90%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <AlertTriangle size={20} color={DS.colors.accent.warning} />
          <span style={{ fontSize: 15, fontWeight: 600, color: DS.colors.text.primary }}>Confirmation</span>
        </div>
        <p style={{ fontSize: 13, color: DS.colors.text.secondary, marginBottom: 20, lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn onClick={onCancel}>Annuler</Btn>
          <Btn variant="danger" icon={Trash2} onClick={onConfirm}>Supprimer</Btn>
        </div>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════
// ADMIN SIDEBAR
// ═══════════════════════════════════════════════
const NAV_ITEMS = [
  { id: "dashboard", icon: BarChart3, label: "Dashboard" },
  { id: "page_toggles", icon: Globe, label: "Pages Actives" },
  { id: "pages", icon: Layers, label: "Pages CMS" },
  { id: "settings", icon: Settings, label: "Réglages site" },
  { id: "media", icon: Image, label: "Médias" },
  { id: "users", icon: Users, label: "Utilisateurs" },
  { id: "features", icon: Zap, label: "Features / Plans" },
];

function AdminSidebar({ active, onNavigate, theme, onThemeToggle, onLogout }: any) {
  return (
    <div style={{ width: 220, height: "100vh", background: DS.colors.bg.surface, borderRight: `1px solid ${DS.colors.border.subtle}`, display: "flex", flexDirection: "column", flexShrink: 0, position: "fixed", left: 0, top: 0, zIndex: 50 }}>
      {/* Logo */}
      <div style={{ padding: "16px 14px", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${DS.colors.border.subtle}` }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: `linear-gradient(135deg, ${DS.colors.accent.primary}, ${DS.colors.accent.pink})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Disc3 size={14} color="white" />
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: DS.colors.text.primary }}>CueForge</span>
        <Badge color={DS.colors.accent.warning} style={{ marginLeft: "auto", fontSize: 9, padding: "1px 5px" }}>ADMIN</Badge>
      </div>

      {/* Nav */}
      <nav style={{ padding: "8px 6px", flex: 1, overflowY: "auto" }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: DS.colors.text.muted, textTransform: "uppercase", letterSpacing: "0.08em", padding: "8px 10px 4px" }}>Back-office</div>
        {NAV_ITEMS.map(({ id, icon: I, label }) => {
          const a = active === id;
          return (
            <button key={id} onClick={() => onNavigate(id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13, fontWeight: a ? 600 : 400, color: a ? DS.colors.text.primary : DS.colors.text.secondary, background: a ? DS.colors.accent.primary + "18" : "transparent", textAlign: "left", marginBottom: 1, transition: "all 0.15s" }}>
              <I size={15} color={a ? DS.colors.accent.primary : DS.colors.text.muted} />
              {label}
              {a && <div style={{ marginLeft: "auto", width: 3, height: 14, borderRadius: 2, background: DS.colors.accent.primary }} />}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: "12px 14px", borderTop: `1px solid ${DS.colors.border.subtle}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={onThemeToggle} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: DS.colors.text.muted, fontSize: 11 }}>
          {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
          {theme === "dark" ? "Clair" : "Sombre"}
        </button>
        <a href="/dashboard" style={{ fontSize: 11, color: DS.colors.accent.secondary, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
          <ExternalLink size={11} /> App
        </a>
        {onLogout && (
          <button onClick={onLogout} style={{ background: "none", border: "none", cursor: "pointer", color: DS.colors.accent.error, fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
            <Lock size={11} /> Déco
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// DASHBOARD VIEW
// ═══════════════════════════════════════════════
function DashboardView() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.dashboard().then(setStats).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: DS.colors.text.muted }}><Loader size={20} style={{ animation: "spin 1s linear infinite" }} /> Chargement...</div>;
  if (!stats) return <div style={{ padding: 40, color: DS.colors.text.muted }}>Impossible de charger les stats.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: DS.colors.text.primary, margin: 0 }}>Dashboard</h2>

      {/* Stats cards */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <StatCard icon={Users} label="Utilisateurs" value={stats.users?.total || 0} color={DS.colors.accent.primary} sub={`${stats.users?.verified || 0} vérifiés`} />
        <StatCard icon={Crown} label="Admins" value={stats.users?.admins || 0} color={DS.colors.accent.warning} />
        <StatCard icon={FileText} label="Pages" value={stats.pages?.total || 0} color={DS.colors.accent.secondary} sub={`${stats.pages?.published || 0} publiées`} />
        <StatCard icon={Image} label="Médias" value={stats.media || 0} color={DS.colors.accent.pink} />
      </div>

      {/* Plan distribution */}
      {stats.users?.by_plan && (
        <Card style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: DS.colors.text.primary, marginBottom: 16 }}>Répartition par plan</div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {Object.entries(stats.users.by_plan).map(([plan, count]) => (
              <div key={plan} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Badge color={plan === "pro" ? DS.colors.accent.primary : plan === "unlimited" ? DS.colors.accent.purple : plan === "enterprise" ? DS.colors.accent.warning : DS.colors.text.muted}>
                  {plan.toUpperCase()}
                </Badge>
                <span style={{ fontSize: 16, fontWeight: 700, color: DS.colors.text.primary, ...mono }}>{count}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// PAGE TOGGLES VIEW (enable/disable site pages)
// ═══════════════════════════════════════════════
function PageTogglesView({ showToast }) {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newPage, setNewPage] = useState({ page_name: "", label: "" });

  const load = useCallback(() => {
    setLoading(true);
    adminApi.listPageConfigs().then(setConfigs).catch(() => showToast("Erreur chargement page configs", "error")).finally(() => setLoading(false));
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (pageName, currentState) => {
    try {
      await adminApi.togglePageConfig(pageName, { is_enabled: !currentState });
      setConfigs((prev) => prev.map((c) => c.page_name === pageName ? { ...c, is_enabled: !currentState } : c));
      showToast(`Page "${pageName}" ${!currentState ? "activée" : "désactivée"}`);
    } catch { showToast("Erreur toggle", "error"); }
  };

  const handleAdd = async () => {
    if (!newPage.page_name.trim()) return;
    try {
      const created = await adminApi.createPageConfig({ page_name: newPage.page_name.trim(), label: newPage.label.trim() || newPage.page_name.trim(), is_enabled: true });
      setConfigs((prev) => [...prev, created]);
      setNewPage({ page_name: "", label: "" });
      setShowAdd(false);
      showToast(`Page "${created.page_name}" ajoutée`);
    } catch { showToast("Erreur création", "error"); }
  };

  const handleDelete = async (pageName) => {
    try {
      await adminApi.deletePageConfig(pageName);
      setConfigs((prev) => prev.filter((c) => c.page_name !== pageName));
      showToast(`Page "${pageName}" supprimée`);
    } catch { showToast("Erreur suppression", "error"); }
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: DS.colors.text.muted }}><Loader size={20} style={{ animation: "spin 1s linear infinite" }} /> Chargement...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: DS.colors.text.primary, margin: 0 }}>Pages Actives</h2>
        <Btn icon={Plus} onClick={() => setShowAdd(true)}>Ajouter</Btn>
      </div>

      <Card>
        <SectionHeader title="Toutes les pages" count={configs.length} icon={Globe} />
        {configs.length === 0 ? (
          <div style={{ padding: "30px 20px", textAlign: "center", color: DS.colors.text.muted }}>Aucune page config. Ajoutez-en une !</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {configs.map((c) => (
              <div key={c.page_name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${DS.colors.border.subtle}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Globe size={16} color={c.is_enabled ? DS.colors.accent.success : DS.colors.text.muted} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: DS.colors.text.primary }}>{c.label || c.page_name}</div>
                    <div style={{ fontSize: 11, color: DS.colors.text.muted, fontFamily: "monospace" }}>/{c.page_name}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Toggle on={c.is_enabled} onToggle={() => handleToggle(c.page_name, c.is_enabled)} label="" />
                  <button onClick={() => handleDelete(c.page_name)} style={{ background: "none", border: "none", cursor: "pointer", color: DS.colors.text.muted, padding: 4 }} title="Supprimer">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {showAdd && (
        <Card style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: DS.colors.text.primary, marginBottom: 12 }}>Nouvelle page</div>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            <Input label="Slug (ex: pricing)" value={newPage.page_name} onChange={(v) => setNewPage({ ...newPage, page_name: v })} placeholder="pricing" />
            <Input label="Label" value={newPage.label} onChange={(v) => setNewPage({ ...newPage, label: v })} placeholder="Page Tarification" />
            <Btn icon={Check} onClick={handleAdd}>Créer</Btn>
            <Btn variant="ghost" icon={X} onClick={() => setShowAdd(false)}>Annuler</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════
// PAGES VIEW (CMS with sections & components)
// ═══════════════════════════════════════════════
function PagesView({ showToast }) {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPage, setSelectedPage] = useState(null);
  const [editingPage, setEditingPage] = useState(null);
  const [showCreatePage, setShowCreatePage] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const loadPages = useCallback(() => {
    setLoading(true);
    adminApi.listPages().then(setPages).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadPages(); }, [loadPages]);

  const handleCreatePage = async (data) => {
    try {
      await adminApi.createPage(data);
      showToast("Page créée");
      setShowCreatePage(false);
      loadPages();
    } catch (e) { showToast(e.message, "error"); }
  };

  const handleUpdatePage = async (id, data) => {
    try {
      await adminApi.updatePage(id, data);
      showToast("Page mise à jour");
      setEditingPage(null);
      loadPages();
    } catch (e) { showToast(e.message, "error"); }
  };

  const handleDeletePage = async (id) => {
    try {
      await adminApi.deletePage(id);
      showToast("Page supprimée");
      setConfirmDelete(null);
      if (selectedPage?.id === id) setSelectedPage(null);
      loadPages();
    } catch (e) { showToast(e.message, "error"); }
  };

  const handlePublish = async (id) => {
    try {
      const res = await adminApi.publishPage(id);
      showToast(res.message);
      loadPages();
    } catch (e) { showToast(e.message, "error"); }
  };

  // Page detail view
  if (selectedPage) {
    return <PageDetailView page={selectedPage} onBack={() => { setSelectedPage(null); loadPages(); }} showToast={showToast} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: DS.colors.text.primary, margin: 0 }}>Pages</h2>
        <Btn variant="primary" icon={Plus} onClick={() => setShowCreatePage(true)}>Nouvelle page</Btn>
      </div>

      {/* Create page form */}
      {showCreatePage && <PageForm onSave={handleCreatePage} onCancel={() => setShowCreatePage(false)} />}

      {/* Page list */}
      <Card>
        <SectionHeader title="Toutes les pages" count={pages.length} icon={FileText} />
        {loading ? (
          <div style={{ padding: 30, textAlign: "center", color: DS.colors.text.muted }}><Loader size={16} style={{ animation: "spin 1s linear infinite" }} /></div>
        ) : pages.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: DS.colors.text.muted }}>Aucune page. Créez la première !</div>
        ) : (
          <div>
            {pages.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: `1px solid ${DS.colors.border.subtle}`, transition: "background 0.1s" }}
                onMouseEnter={(e) => e.currentTarget.style.background = DS.colors.bg.hover}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setSelectedPage(p)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: DS.colors.text.primary }}>{p.name}</span>
                    <span style={{ fontSize: 11, color: DS.colors.text.muted, ...mono }}>/{p.slug}</span>
                    {p.is_system && <Badge color={DS.colors.accent.secondary}>Système</Badge>}
                  </div>
                  {p.title && <div style={{ fontSize: 12, color: DS.colors.text.secondary, marginTop: 2 }}>{p.title}</div>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Badge color={p.is_published ? DS.colors.accent.success : DS.colors.text.muted}>
                    {p.is_published ? "Publiée" : "Brouillon"}
                  </Badge>
                  <Btn small icon={p.is_published ? EyeOff : Eye} onClick={() => handlePublish(p.id)} variant={p.is_published ? "default" : "success"}>
                    {p.is_published ? "Dépublier" : "Publier"}
                  </Btn>
                  <Btn small icon={Edit3} onClick={() => setEditingPage(p)}>Éditer</Btn>
                  {!p.is_system && <Btn small icon={Trash2} variant="danger" onClick={() => setConfirmDelete(p)} />}
                  <Btn small icon={ChevronRight} onClick={() => setSelectedPage(p)}>Sections</Btn>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Edit page modal */}
      {editingPage && (
        <div style={{ position: "fixed", inset: 0, zIndex: 998, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <Card style={{ width: "90%", maxWidth: 600, maxHeight: "85vh", overflow: "auto" }}>
            <SectionHeader title={`Éditer : ${editingPage.name}`} icon={Edit3}>
              <Btn small icon={X} onClick={() => setEditingPage(null)} />
            </SectionHeader>
            <div style={{ padding: 20 }}>
              <PageForm page={editingPage} onSave={(data) => handleUpdatePage(editingPage.id, data)} onCancel={() => setEditingPage(null)} isEdit />
            </div>
          </Card>
        </div>
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <ConfirmModal
          message={`Supprimer la page "${confirmDelete.name}" ? Cette action est irréversible et supprimera toutes les sections et composants associés.`}
          onConfirm={() => handleDeletePage(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function PageForm({ page, onSave, onCancel, isEdit }) {
  const [form, setForm] = useState({
    name: page?.name || "",
    slug: page?.slug || "",
    title: page?.title || "",
    description: page?.description || "",
    layout: page?.layout || "default",
    show_in_nav: page?.show_in_nav ?? true,
    nav_label: page?.nav_label || "",
    meta_title: page?.meta_title || "",
    meta_description: page?.meta_description || "",
    sort_order: page?.sort_order || 0,
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Card style={{ padding: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Nom" value={form.name} onChange={(v) => { set("name", v); if (!isEdit) set("slug", v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")); }} placeholder="Ma page" />
        <Input label="Slug (URL)" value={form.slug} onChange={(v) => set("slug", v)} placeholder="ma-page" />
        <Input label="Titre" value={form.title} onChange={(v) => set("title", v)} placeholder="Titre affiché" />
        <Select label="Layout" value={form.layout} onChange={(v) => set("layout", v)} options={[
          { value: "default", label: "Default" }, { value: "full-width", label: "Full Width" }, { value: "sidebar", label: "Sidebar" },
        ]} />
        <Input label="Label navigation" value={form.nav_label} onChange={(v) => set("nav_label", v)} placeholder="(optionnel)" />
        <Input label="Ordre" value={form.sort_order} onChange={(v) => set("sort_order", parseInt(v) || 0)} type="number" />
        <div style={{ gridColumn: "span 2" }}>
          <Input label="Meta Title (SEO)" value={form.meta_title} onChange={(v) => set("meta_title", v)} placeholder="Title SEO" />
        </div>
        <div style={{ gridColumn: "span 2" }}>
          <Input label="Meta Description (SEO)" value={form.meta_description} onChange={(v) => set("meta_description", v)} multiline placeholder="Description SEO" />
        </div>
        <div style={{ gridColumn: "span 2" }}>
          <Toggle on={form.show_in_nav} onToggle={() => set("show_in_nav", !form.show_in_nav)} label="Afficher dans la navigation" />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        <Btn onClick={onCancel}>Annuler</Btn>
        <Btn variant="primary" icon={Save} onClick={() => onSave(form)}>{isEdit ? "Mettre à jour" : "Créer"}</Btn>
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════
// PAGE DETAIL (sections + components tree)
// ═══════════════════════════════════════════════
function PageDetailView({ page, onBack, showToast }) {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddSection, setShowAddSection] = useState(false);
  const [editingSection, setEditingSection] = useState(null);
  const [expandedSection, setExpandedSection] = useState(null);
  const [showAddComponent, setShowAddComponent] = useState(null);
  const [editingComponent, setEditingComponent] = useState(null);

  const loadSections = useCallback(() => {
    setLoading(true);
    adminApi.listSections(page.id).then(setSections).catch(() => {}).finally(() => setLoading(false));
  }, [page.id]);

  useEffect(() => { loadSections(); }, [loadSections]);

  const SECTION_TYPES = ["hero", "features", "pricing", "cta", "faq", "stats", "testimonials", "text", "image-text", "gallery", "custom"];
  const COMPONENT_TYPES = ["heading", "text", "image", "button", "card", "pricing-card", "feature-item", "testimonial", "faq-item", "divider", "spacer", "video", "icon", "stat", "custom-html"];

  const handleCreateSection = async (data) => {
    try {
      await adminApi.createSection({ ...data, page_id: page.id });
      showToast("Section créée");
      setShowAddSection(false);
      loadSections();
    } catch (e) { showToast(e.message, "error"); }
  };

  const handleDeleteSection = async (id) => {
    try {
      await adminApi.deleteSection(id);
      showToast("Section supprimée");
      loadSections();
    } catch (e) { showToast(e.message, "error"); }
  };

  const handleCreateComponent = async (sectionId, data) => {
    try {
      await adminApi.createComponent({ ...data, section_id: sectionId });
      showToast("Composant ajouté");
      setShowAddComponent(null);
      loadSections();
    } catch (e) { showToast(e.message, "error"); }
  };

  const handleDeleteComponent = async (id) => {
    try {
      await adminApi.deleteComponent(id);
      showToast("Composant supprimé");
      loadSections();
    } catch (e) { showToast(e.message, "error"); }
  };

  const handleUpdateComponent = async (id, data) => {
    try {
      await adminApi.updateComponent(id, data);
      showToast("Composant mis à jour");
      setEditingComponent(null);
      loadSections();
    } catch (e) { showToast(e.message, "error"); }
  };

  const handleUpdateSection = async (id, data) => {
    try {
      await adminApi.updateSection(id, data);
      showToast("Section mise à jour");
      setEditingSection(null);
      loadSections();
    } catch (e) { showToast(e.message, "error"); }
  };

  const moveSectionUp = async (idx) => {
    if (idx === 0) return;
    const orders = sections.map((s, i) => ({ id: s.id, sort_order: i }));
    [orders[idx].sort_order, orders[idx - 1].sort_order] = [orders[idx - 1].sort_order, orders[idx].sort_order];
    await adminApi.reorderSections(orders);
    loadSections();
  };

  const moveSectionDown = async (idx) => {
    if (idx === sections.length - 1) return;
    const orders = sections.map((s, i) => ({ id: s.id, sort_order: i }));
    [orders[idx].sort_order, orders[idx + 1].sort_order] = [orders[idx + 1].sort_order, orders[idx].sort_order];
    await adminApi.reorderSections(orders);
    loadSections();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Btn icon={ChevronDown} onClick={onBack} style={{ transform: "rotate(90deg)" }}>Retour</Btn>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: DS.colors.text.primary, margin: 0 }}>{page.name}</h2>
        <span style={{ fontSize: 12, color: DS.colors.text.muted, ...mono }}>/{page.slug}</span>
        <Badge color={page.is_published ? DS.colors.accent.success : DS.colors.text.muted}>
          {page.is_published ? "Publiée" : "Brouillon"}
        </Badge>
      </div>

      {/* Sections list */}
      <Card>
        <SectionHeader title="Sections" count={sections.length} icon={Layers}>
          <Btn small variant="primary" icon={Plus} onClick={() => setShowAddSection(true)}>Ajouter section</Btn>
        </SectionHeader>

        {loading ? (
          <div style={{ padding: 30, textAlign: "center", color: DS.colors.text.muted }}><Loader size={16} style={{ animation: "spin 1s linear infinite" }} /></div>
        ) : sections.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: DS.colors.text.muted }}>Aucune section. Ajoutez-en une !</div>
        ) : (
          sections.map((s, idx) => (
            <div key={s.id} style={{ borderBottom: `1px solid ${DS.colors.border.subtle}` }}>
              {/* Section header */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", cursor: "pointer", background: expandedSection === s.id ? DS.colors.bg.elevated : "transparent" }}
                onClick={() => setExpandedSection(expandedSection === s.id ? null : s.id)}>
                <GripVertical size={14} color={DS.colors.text.muted} />
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <Btn small icon={ChevronUp} variant="ghost" onClick={(e) => { e.stopPropagation(); moveSectionUp(idx); }} />
                  <Btn small icon={ChevronDown} variant="ghost" onClick={(e) => { e.stopPropagation(); moveSectionDown(idx); }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: DS.colors.text.primary }}>{s.name}</span>
                    <Badge color={DS.colors.accent.secondary}>{s.section_type}</Badge>
                    {!s.is_visible && <Badge color={DS.colors.text.muted}>Masquée</Badge>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                  <Btn small icon={Plus} onClick={() => setShowAddComponent(s.id)}>Composant</Btn>
                  <Btn small icon={Edit3} onClick={() => setEditingSection(s)} />
                  <Btn small icon={Trash2} variant="danger" onClick={() => handleDeleteSection(s.id)} />
                </div>
                {expandedSection === s.id ? <ChevronUp size={14} color={DS.colors.text.muted} /> : <ChevronDown size={14} color={DS.colors.text.muted} />}
              </div>

              {/* Components */}
              {expandedSection === s.id && (
                <div style={{ padding: "0 16px 12px 52px" }}>
                  {(s.components || []).length === 0 ? (
                    <div style={{ fontSize: 12, color: DS.colors.text.muted, padding: "8px 0" }}>Aucun composant dans cette section.</div>
                  ) : (
                    (s.components || []).map((c) => (
                      <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", marginBottom: 4, borderRadius: 6, background: DS.colors.bg.surface, border: `1px solid ${DS.colors.border.subtle}` }}>
                        <LayoutGrid size={12} color={DS.colors.text.muted} />
                        <Badge color={DS.colors.accent.purple}>{c.component_type}</Badge>
                        <span style={{ flex: 1, fontSize: 12, color: DS.colors.text.secondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.content?.text || c.content?.label || c.content?.src || JSON.stringify(c.content).slice(0, 60)}
                        </span>
                        {!c.is_visible && <EyeOff size={11} color={DS.colors.text.muted} />}
                        <Btn small icon={Edit3} variant="ghost" onClick={() => setEditingComponent(c)} />
                        <Btn small icon={Trash2} variant="ghost" onClick={() => handleDeleteComponent(c.id)} />
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </Card>

      {/* Add section form */}
      {showAddSection && (
        <SectionForm sectionTypes={SECTION_TYPES} onSave={handleCreateSection} onCancel={() => setShowAddSection(false)} />
      )}

      {/* Edit section modal */}
      {editingSection && (
        <div style={{ position: "fixed", inset: 0, zIndex: 998, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <Card style={{ width: "90%", maxWidth: 600, maxHeight: "85vh", overflow: "auto" }}>
            <SectionHeader title={`Éditer : ${editingSection.name}`} icon={Edit3}>
              <Btn small icon={X} onClick={() => setEditingSection(null)} />
            </SectionHeader>
            <div style={{ padding: 20 }}>
              <SectionForm section={editingSection} sectionTypes={SECTION_TYPES} onSave={(data) => handleUpdateSection(editingSection.id, data)} onCancel={() => setEditingSection(null)} isEdit />
            </div>
          </Card>
        </div>
      )}

      {/* Add component form */}
      {showAddComponent && (
        <ComponentForm componentTypes={COMPONENT_TYPES} onSave={(data) => handleCreateComponent(showAddComponent, data)} onCancel={() => setShowAddComponent(null)} />
      )}

      {/* Edit component modal */}
      {editingComponent && (
        <div style={{ position: "fixed", inset: 0, zIndex: 998, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <Card style={{ width: "90%", maxWidth: 600, maxHeight: "85vh", overflow: "auto" }}>
            <SectionHeader title={`Éditer composant`} icon={Edit3}>
              <Btn small icon={X} onClick={() => setEditingComponent(null)} />
            </SectionHeader>
            <div style={{ padding: 20 }}>
              <ComponentForm component={editingComponent} componentTypes={COMPONENT_TYPES} onSave={(data) => handleUpdateComponent(editingComponent.id, data)} onCancel={() => setEditingComponent(null)} isEdit />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function SectionForm({ section, sectionTypes, onSave, onCancel, isEdit }) {
  const [form, setForm] = useState({
    name: section?.name || "",
    section_type: section?.section_type || "hero",
    sort_order: section?.sort_order || 0,
    is_visible: section?.is_visible ?? true,
    background_color: section?.background_color || "",
    padding_top: section?.padding_top || "py-16",
    padding_bottom: section?.padding_bottom || "pb-16",
    max_width: section?.max_width || "max-w-7xl",
    custom_css_class: section?.custom_css_class || "",
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Card style={{ padding: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: DS.colors.text.primary, marginBottom: 12 }}>{isEdit ? "Modifier section" : "Nouvelle section"}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Nom" value={form.name} onChange={(v) => set("name", v)} placeholder="Hero principal" />
        <Select label="Type" value={form.section_type} onChange={(v) => set("section_type", v)} options={sectionTypes.map((t) => ({ value: t, label: t }))} />
        <Input label="Ordre" value={form.sort_order} onChange={(v) => set("sort_order", parseInt(v) || 0)} type="number" />
        <Input label="Couleur fond" value={form.background_color} onChange={(v) => set("background_color", v)} placeholder="#1a1a2e" />
        <Input label="Padding top" value={form.padding_top} onChange={(v) => set("padding_top", v)} placeholder="py-16" />
        <Input label="Padding bottom" value={form.padding_bottom} onChange={(v) => set("padding_bottom", v)} placeholder="pb-16" />
        <Input label="Max width" value={form.max_width} onChange={(v) => set("max_width", v)} placeholder="max-w-7xl" />
        <Input label="CSS class" value={form.custom_css_class} onChange={(v) => set("custom_css_class", v)} placeholder="(optionnel)" />
        <div style={{ gridColumn: "span 2" }}>
          <Toggle on={form.is_visible} onToggle={() => set("is_visible", !form.is_visible)} label="Visible" />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        <Btn onClick={onCancel}>Annuler</Btn>
        <Btn variant="primary" icon={Save} onClick={() => onSave(form)}>{isEdit ? "Mettre à jour" : "Créer"}</Btn>
      </div>
    </Card>
  );
}

function ComponentForm({ component, componentTypes, onSave, onCancel, isEdit }) {
  const [form, setForm] = useState({
    component_type: component?.component_type || "heading",
    sort_order: component?.sort_order || 0,
    is_visible: component?.is_visible ?? true,
    custom_css_class: component?.custom_css_class || "",
    grid_column: component?.grid_column || "",
  });
  const [contentStr, setContentStr] = useState(JSON.stringify(component?.content || {}, null, 2));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    try {
      const content = JSON.parse(contentStr);
      onSave({ ...form, content });
    } catch { onSave(form); }
  };

  return (
    <Card style={{ padding: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: DS.colors.text.primary, marginBottom: 12 }}>{isEdit ? "Modifier composant" : "Nouveau composant"}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Select label="Type" value={form.component_type} onChange={(v) => set("component_type", v)} options={componentTypes.map((t) => ({ value: t, label: t }))} />
        <Input label="Ordre" value={form.sort_order} onChange={(v) => set("sort_order", parseInt(v) || 0)} type="number" />
        <Input label="Grid column" value={form.grid_column} onChange={(v) => set("grid_column", v)} placeholder="col-span-6" />
        <Input label="CSS class" value={form.custom_css_class} onChange={(v) => set("custom_css_class", v)} placeholder="(optionnel)" />
        <div style={{ gridColumn: "span 2" }}>
          <Toggle on={form.is_visible} onToggle={() => set("is_visible", !form.is_visible)} label="Visible" />
        </div>
        <div style={{ gridColumn: "span 2" }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: DS.colors.text.secondary, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 }}>Contenu (JSON)</label>
          <textarea value={contentStr} onChange={(e) => setContentStr(e.target.value)} rows={6} style={{ width: "100%", padding: "8px 12px", borderRadius: 7, border: `1px solid ${DS.colors.border.default}`, background: DS.colors.bg.surface, color: DS.colors.text.primary, fontSize: 12, ...mono, resize: "vertical", outline: "none" }} />
          <div style={{ fontSize: 10, color: DS.colors.text.muted, marginTop: 4 }}>
            Ex heading: {`{"text": "Bienvenue", "level": "h1", "align": "center"}`}<br />
            Ex button: {`{"label": "Commencer", "href": "/register", "variant": "primary"}`}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        <Btn onClick={onCancel}>Annuler</Btn>
        <Btn variant="primary" icon={Save} onClick={handleSave}>{isEdit ? "Mettre à jour" : "Créer"}</Btn>
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════
// SETTINGS VIEW
// ═══════════════════════════════════════════════
function SettingsView({ showToast }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminApi.getSettings().then(setSettings).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await adminApi.updateSettings(settings);
      showToast("Réglages sauvegardés");
    } catch (e) { showToast(e.message, "error"); }
    setSaving(false);
  };

  const set = (k, v) => setSettings((s) => ({ ...s, [k]: v }));

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: DS.colors.text.muted }}><Loader size={20} style={{ animation: "spin 1s linear infinite" }} /></div>;
  if (!settings) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: DS.colors.text.primary, margin: 0 }}>Réglages du site</h2>
        <Btn variant="primary" icon={Save} onClick={handleSave} loading={saving}>Sauvegarder</Btn>
      </div>

      {/* Branding */}
      <Card style={{ padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: DS.colors.text.primary, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <Globe size={15} color={DS.colors.accent.primary} /> Branding
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Input label="Nom du site" value={settings.site_name || ""} onChange={(v) => set("site_name", v)} />
          <Input label="Tagline" value={settings.tagline || ""} onChange={(v) => set("tagline", v)} />
          <Input label="URL du logo" value={settings.logo_url || ""} onChange={(v) => set("logo_url", v)} placeholder="https://..." />
          <Input label="URL du favicon" value={settings.favicon_url || ""} onChange={(v) => set("favicon_url", v)} placeholder="https://..." />
          <Input label="Police" value={settings.font_family || ""} onChange={(v) => set("font_family", v)} />
        </div>
      </Card>

      {/* Colors */}
      <Card style={{ padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: DS.colors.text.primary, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <Palette size={15} color={DS.colors.accent.pink} /> Couleurs
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {["primary_color", "secondary_color", "accent_color", "background_color", "text_color"].map((k) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="color" value={settings[k] || "#000000"} onChange={(e) => set(k, e.target.value)} style={{ width: 32, height: 32, borderRadius: 6, border: `1px solid ${DS.colors.border.default}`, cursor: "pointer", padding: 0 }} />
              <div>
                <div style={{ fontSize: 11, color: DS.colors.text.muted, textTransform: "capitalize" }}>{k.replace(/_/g, " ")}</div>
                <div style={{ fontSize: 12, color: DS.colors.text.primary, ...mono }}>{settings[k]}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* SEO */}
      <Card style={{ padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: DS.colors.text.primary, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <Search size={15} color={DS.colors.accent.secondary} /> SEO
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
          <Input label="Meta Title" value={settings.meta_title || ""} onChange={(v) => set("meta_title", v)} />
          <Input label="Meta Description" value={settings.meta_description || ""} onChange={(v) => set("meta_description", v)} multiline />
          <Input label="OG Image URL" value={settings.og_image_url || ""} onChange={(v) => set("og_image_url", v)} placeholder="https://..." />
          <Input label="Google Analytics ID" value={settings.google_analytics_id || ""} onChange={(v) => set("google_analytics_id", v)} placeholder="G-XXXXXXXXXX" />
        </div>
      </Card>

      {/* Social */}
      <Card style={{ padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: DS.colors.text.primary, marginBottom: 16 }}>Réseaux sociaux & Footer</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Input label="Twitter URL" value={settings.twitter_url || ""} onChange={(v) => set("twitter_url", v)} />
          <Input label="Instagram URL" value={settings.instagram_url || ""} onChange={(v) => set("instagram_url", v)} />
          <Input label="Discord URL" value={settings.discord_url || ""} onChange={(v) => set("discord_url", v)} />
          <Input label="YouTube URL" value={settings.youtube_url || ""} onChange={(v) => set("youtube_url", v)} />
          <div style={{ gridColumn: "span 2" }}>
            <Input label="Texte de footer" value={settings.footer_text || ""} onChange={(v) => set("footer_text", v)} />
          </div>
        </div>
      </Card>

      {/* Maintenance */}
      <Card style={{ padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: DS.colors.text.primary, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={15} color={DS.colors.accent.error} /> Maintenance
        </div>
        <Toggle on={settings.maintenance_mode} onToggle={() => set("maintenance_mode", !settings.maintenance_mode)} label="Mode maintenance activé" />
        {settings.maintenance_mode && (
          <div style={{ marginTop: 12 }}>
            <Input label="Message maintenance" value={settings.maintenance_message || ""} onChange={(v) => set("maintenance_message", v)} multiline placeholder="Le site est en maintenance..." />
          </div>
        )}
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════
// MEDIA VIEW
// ═══════════════════════════════════════════════
function MediaView({ showToast }) {
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("");
  const [uploading, setUploading] = useState(false);

  const loadMedia = useCallback(() => {
    setLoading(true);
    adminApi.listMedia(category || null).then(setMedia).catch(() => {}).finally(() => setLoading(false));
  }, [category]);

  useEffect(() => { loadMedia(); }, [loadMedia]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await adminApi.uploadMedia(file, category || "general");
      showToast("Média uploadé");
      loadMedia();
    } catch (err) { showToast(err.message, "error"); }
    setUploading(false);
    e.target.value = "";
  };

  const handleDelete = async (id, filename) => {
    if (!confirm(`Supprimer "${filename}" ?`)) return;
    try {
      await adminApi.deleteMedia(id);
      showToast("Média supprimé");
      loadMedia();
    } catch (e) { showToast(e.message, "error"); }
  };

  const categories = ["", "general", "logo", "hero", "icon"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: DS.colors.text.primary, margin: 0 }}>Médias</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Select value={category} onChange={setCategory} options={categories.map((c) => ({ value: c, label: c || "Toutes" }))} style={{ width: 120 }} />
          <label style={{ display: "inline-flex" }}>
            <Btn variant="primary" icon={Upload} loading={uploading}>Upload</Btn>
            <input type="file" accept="image/*" onChange={handleUpload} style={{ display: "none" }} />
          </label>
        </div>
      </div>

      <Card>
        <SectionHeader title="Bibliothèque" count={media.length} icon={Image}>
          <Btn small icon={RefreshCw} onClick={loadMedia}>Rafraîchir</Btn>
        </SectionHeader>
        {loading ? (
          <div style={{ padding: 30, textAlign: "center", color: DS.colors.text.muted }}><Loader size={16} style={{ animation: "spin 1s linear infinite" }} /></div>
        ) : media.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: DS.colors.text.muted }}>Aucun média.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, padding: 16 }}>
            {media.map((m) => (
              <div key={m.id} style={{ background: DS.colors.bg.surface, borderRadius: 8, border: `1px solid ${DS.colors.border.subtle}`, overflow: "hidden" }}>
                <div style={{ width: "100%", height: 100, background: DS.colors.bg.elevated, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {m.mime_type?.startsWith("image/") ? (
                    <img src={m.file_url} alt={m.alt_text || m.filename} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <Image size={24} color={DS.colors.text.muted} />
                  )}
                </div>
                <div style={{ padding: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: DS.colors.text.primary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.filename}</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                    <Badge color={DS.colors.accent.secondary}>{m.category}</Badge>
                    <Btn small icon={Trash2} variant="ghost" onClick={() => handleDelete(m.id, m.filename)} />
                  </div>
                  {m.file_size && <div style={{ fontSize: 10, color: DS.colors.text.muted, marginTop: 2, ...mono }}>{(m.file_size / 1024).toFixed(1)} KB</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════
// USERS VIEW
// ═══════════════════════════════════════════════
function UsersView({ showToast }) {
  const [data, setData] = useState({ users: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [editingUser, setEditingUser] = useState(null);

  const loadUsers = useCallback(() => {
    setLoading(true);
    adminApi.listUsers({ search: search || undefined, plan: planFilter || undefined, limit: 50 })
      .then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [search, planFilter]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleUpdateUser = async (id, updates) => {
    try {
      await adminApi.updateUser(id, updates);
      showToast("Utilisateur mis à jour");
      setEditingUser(null);
      loadUsers();
    } catch (e) { showToast(e.message, "error"); }
  };

  const planColors = { free: DS.colors.text.muted, pro: DS.colors.accent.primary, unlimited: DS.colors.accent.purple, enterprise: DS.colors.accent.warning };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: DS.colors.text.primary, margin: 0 }}>Utilisateurs</h2>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <Input placeholder="Rechercher par email ou nom..." value={search} onChange={setSearch} />
        </div>
        <Select value={planFilter} onChange={setPlanFilter} options={[
          { value: "", label: "Tous les plans" }, { value: "free", label: "Free" }, { value: "pro", label: "Pro" }, { value: "unlimited", label: "Unlimited" }, { value: "enterprise", label: "Enterprise" },
        ]} style={{ width: 140 }} />
      </div>

      <Card>
        <SectionHeader title="Utilisateurs" count={data.total} icon={Users} />
        {loading ? (
          <div style={{ padding: 30, textAlign: "center", color: DS.colors.text.muted }}><Loader size={16} style={{ animation: "spin 1s linear infinite" }} /></div>
        ) : data.users.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: DS.colors.text.muted }}>Aucun utilisateur trouvé.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${DS.colors.border.subtle}` }}>
                  {["Email", "Nom", "Plan", "Admin", "Vérifié", "Tracks/jour", "Dernière connexion", "Actions"].map((h) => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: DS.colors.text.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: `1px solid ${DS.colors.border.subtle}` }}
                    onMouseEnter={(e) => e.currentTarget.style.background = DS.colors.bg.hover}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "8px 12px", color: DS.colors.text.primary }}>{u.email}</td>
                    <td style={{ padding: "8px 12px", color: DS.colors.text.secondary }}>{u.name || "—"}</td>
                    <td style={{ padding: "8px 12px" }}><Badge color={planColors[u.subscription_plan] || DS.colors.text.muted}>{(u.subscription_plan || "free").toUpperCase()}</Badge></td>
                    <td style={{ padding: "8px 12px" }}>{u.is_admin ? <Crown size={14} color={DS.colors.accent.warning} /> : "—"}</td>
                    <td style={{ padding: "8px 12px" }}>{u.email_verified ? <Check size={14} color={DS.colors.accent.success} /> : <X size={14} color={DS.colors.text.muted} />}</td>
                    <td style={{ padding: "8px 12px", ...mono }}>{u.tracks_today || 0}</td>
                    <td style={{ padding: "8px 12px", fontSize: 11, color: DS.colors.text.muted }}>{u.last_login_at ? new Date(u.last_login_at).toLocaleDateString("fr-FR") : "—"}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <Btn small icon={Edit3} onClick={() => setEditingUser(u)}>Éditer</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Edit user modal */}
      {editingUser && (
        <div style={{ position: "fixed", inset: 0, zIndex: 998, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <Card style={{ width: "90%", maxWidth: 500, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: DS.colors.text.primary }}>Éditer : {editingUser.email}</span>
              <Btn small icon={X} variant="ghost" onClick={() => setEditingUser(null)} />
            </div>
            <UserEditForm user={editingUser} onSave={(data) => handleUpdateUser(editingUser.id, data)} onCancel={() => setEditingUser(null)} />
          </Card>
        </div>
      )}
    </div>
  );
}

function UserEditForm({ user, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: user.name || "",
    email: user.email || "",
    subscription_plan: user.subscription_plan || "free",
    is_admin: user.is_admin || false,
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Input label="Nom" value={form.name} onChange={(v) => set("name", v)} />
      <Input label="Email" value={form.email} onChange={(v) => set("email", v)} />
      <Select label="Plan" value={form.subscription_plan} onChange={(v) => set("subscription_plan", v)} options={[
        { value: "free", label: "Free" }, { value: "pro", label: "Pro" }, { value: "unlimited", label: "Unlimited" }, { value: "enterprise", label: "Enterprise" },
      ]} />
      <Toggle on={form.is_admin} onToggle={() => set("is_admin", !form.is_admin)} label="Administrateur" />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn onClick={onCancel}>Annuler</Btn>
        <Btn variant="primary" icon={Save} onClick={() => onSave(form)}>Sauvegarder</Btn>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// FEATURES VIEW
// ═══════════════════════════════════════════════
function FeaturesView({ showToast }) {
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [planFilter, setPlanFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const loadFeatures = useCallback(() => {
    setLoading(true);
    adminApi.listFeatures(planFilter || null).then(setFeatures).catch(() => {}).finally(() => setLoading(false));
  }, [planFilter]);

  useEffect(() => { loadFeatures(); }, [loadFeatures]);

  const handleCreate = async (data) => {
    try {
      await adminApi.createFeature(data);
      showToast("Feature créée");
      setShowCreate(false);
      loadFeatures();
    } catch (e) { showToast(e.message, "error"); }
  };

  const handleToggle = async (f) => {
    try {
      await adminApi.updateFeature(f.id, { is_enabled: !f.is_enabled });
      showToast(`Feature ${f.is_enabled ? "désactivée" : "activée"}`);
      loadFeatures();
    } catch (e) { showToast(e.message, "error"); }
  };

  const handleDelete = async (f) => {
    if (!confirm(`Supprimer "${f.feature_name}" du plan ${f.plan_name} ?`)) return;
    try {
      await adminApi.deleteFeature(f.id);
      showToast("Feature supprimée");
      loadFeatures();
    } catch (e) { showToast(e.message, "error"); }
  };

  const plans = ["", "free", "pro", "unlimited", "enterprise"];
  const planColors = { free: DS.colors.text.muted, pro: DS.colors.accent.primary, unlimited: DS.colors.accent.purple, enterprise: DS.colors.accent.warning };

  // Group by plan
  const grouped = {};
  features.forEach((f) => {
    if (!grouped[f.plan_name]) grouped[f.plan_name] = [];
    grouped[f.plan_name].push(f);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: DS.colors.text.primary, margin: 0 }}>Features / Plans</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <Select value={planFilter} onChange={setPlanFilter} options={plans.map((p) => ({ value: p, label: p || "Tous" }))} style={{ width: 130 }} />
          <Btn variant="primary" icon={Plus} onClick={() => setShowCreate(true)}>Nouvelle feature</Btn>
        </div>
      </div>

      {showCreate && (
        <Card style={{ padding: 20 }}>
          <FeatureForm onSave={handleCreate} onCancel={() => setShowCreate(false)} />
        </Card>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: DS.colors.text.muted }}><Loader size={16} style={{ animation: "spin 1s linear infinite" }} /></div>
      ) : Object.keys(grouped).length === 0 ? (
        <Card style={{ padding: 30, textAlign: "center", color: DS.colors.text.muted }}>Aucune feature configurée.</Card>
      ) : (
        Object.entries(grouped).map(([plan, feats]) => (
          <Card key={plan}>
            <SectionHeader title={plan.toUpperCase()} count={feats.length} icon={Zap}>
              <Badge color={planColors[plan]}>{plan}</Badge>
            </SectionHeader>
            {feats.map((f) => (
              <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 16px", borderBottom: `1px solid ${DS.colors.border.subtle}` }}>
                <Toggle on={f.is_enabled} onToggle={() => handleToggle(f)} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: DS.colors.text.primary }}>{f.feature_name}</span>
                  {f.label && <span style={{ marginLeft: 8, fontSize: 11, color: DS.colors.text.muted }}>{f.label}</span>}
                </div>
                <Btn small icon={Trash2} variant="ghost" onClick={() => handleDelete(f)} />
              </div>
            ))}
          </Card>
        ))
      )}
    </div>
  );
}

function FeatureForm({ onSave, onCancel }) {
  const [form, setForm] = useState({ plan_name: "free", feature_name: "", is_enabled: true, label: "" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <Select label="Plan" value={form.plan_name} onChange={(v) => set("plan_name", v)} options={[
        { value: "free", label: "Free" }, { value: "pro", label: "Pro" }, { value: "unlimited", label: "Unlimited" }, { value: "enterprise", label: "Enterprise" },
      ]} />
      <Input label="Feature name" value={form.feature_name} onChange={(v) => set("feature_name", v)} placeholder="track_analysis" />
      <Input label="Label (optionnel)" value={form.label} onChange={(v) => set("label", v)} placeholder="Analyse de tracks" />
      <div style={{ display: "flex", alignItems: "end" }}>
        <Toggle on={form.is_enabled} onToggle={() => set("is_enabled", !form.is_enabled)} label="Activée" />
      </div>
      <div style={{ gridColumn: "span 2", display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Btn onClick={onCancel}>Annuler</Btn>
        <Btn variant="primary" icon={Save} onClick={() => onSave(form)}>Créer</Btn>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// ═══════════════════════════════════════════════
// LOGIN SCREEN
// ═══════════════════════════════════════════════
function AdminLoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Identifiants invalides");
      if (!data.user?.is_admin) throw new Error("Accès réservé aux administrateurs");
      localStorage.setItem("cueforge_token", data.access_token);
      if (data.refresh_token) localStorage.setItem("cueforge_refresh", data.refresh_token);
      onLogin();
    } catch (err: any) {
      setError(err.message || "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: themes.dark.bg.base }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', -apple-system, sans-serif; }
      `}</style>
      <form onSubmit={handleSubmit} style={{
        width: 380, padding: 32, borderRadius: 16,
        background: themes.dark.bg.surface, border: `1px solid ${themes.dark.border.subtle}`,
        display: "flex", flexDirection: "column", gap: 20,
      }}>
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 8 }}>
            <Disc3 size={28} color={themes.dark.accent.primary} />
            <span style={{ fontSize: 22, fontWeight: 700, color: themes.dark.text.primary }}>CueForge</span>
            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: `linear-gradient(135deg, ${themes.dark.accent.pink}, ${themes.dark.accent.purple})`, color: "#fff" }}>ADMIN</span>
          </div>
          <p style={{ fontSize: 13, color: themes.dark.text.muted }}>Connexion au back-office</p>
        </div>

        {error && (
          <div style={{ padding: "10px 14px", borderRadius: 8, background: `${themes.dark.accent.error}15`, border: `1px solid ${themes.dark.accent.error}30`, color: themes.dark.accent.error, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: themes.dark.text.secondary, marginBottom: 6 }}>Email ou nom d&apos;utilisateur</label>
          <input
            type="text" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="kenin ou kenin@cueforge.app"
            required autoFocus
            style={{
              width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${themes.dark.border.default}`,
              background: themes.dark.bg.card, color: themes.dark.text.primary, fontSize: 14, outline: "none",
            }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: themes.dark.text.secondary, marginBottom: 6 }}>Mot de passe</label>
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            style={{
              width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${themes.dark.border.default}`,
              background: themes.dark.bg.card, color: themes.dark.text.primary, fontSize: 14, outline: "none",
            }}
          />
        </div>

        <button type="submit" disabled={loading} style={{
          width: "100%", padding: "12px 0", borderRadius: 8, border: "none", cursor: loading ? "wait" : "pointer",
          background: `linear-gradient(135deg, ${themes.dark.accent.primary}, ${themes.dark.accent.purple})`,
          color: "#fff", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          opacity: loading ? 0.7 : 1,
        }}>
          {loading ? <Loader size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Shield size={16} />}
          {loading ? "Connexion..." : "Se connecter"}
        </button>
      </form>
    </div>
  );
}

// ═══════════════════════════════════════════════
// MAIN ADMIN APP
// ═══════════════════════════════════════════════
export default function AdminPage() {
  const [activePage, setActivePage] = useState("dashboard");
  const [theme, setTheme] = useState("dark");
  const [toast, setToast] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Check if already logged in
  useEffect(() => {
    const token = getToken();
    if (token) {
      // Verify token is still valid by calling dashboard
      api("/admin/dashboard").then(() => {
        setIsAuthenticated(true);
      }).catch(() => {
        localStorage.removeItem("cueforge_token");
        setIsAuthenticated(false);
      }).finally(() => setCheckingAuth(false));
    } else {
      setCheckingAuth(false);
    }
  }, []);

  // Apply theme
  DS.colors = themes[theme];

  const showToast = (message: string, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const toggleTheme = () => setTheme((t) => t === "dark" ? "light" : "dark");

  const handleLogout = () => {
    localStorage.removeItem("cueforge_token");
    localStorage.removeItem("cueforge_refresh");
    setIsAuthenticated(false);
  };

  if (checkingAuth) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: themes.dark.bg.base }}>
        <Loader size={24} style={{ animation: "spin 1s linear infinite", color: themes.dark.accent.primary }} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AdminLoginScreen onLogin={() => setIsAuthenticated(true)} />;
  }

  const renderPage = () => {
    switch (activePage) {
      case "dashboard": return <DashboardView />;
      case "page_toggles": return <PageTogglesView showToast={showToast} />;
      case "pages": return <PagesView showToast={showToast} />;
      case "settings": return <SettingsView showToast={showToast} />;
      case "media": return <MediaView showToast={showToast} />;
      case "users": return <UsersView showToast={showToast} />;
      case "features": return <FeaturesView showToast={showToast} />;
      default: return <DashboardView />;
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: DS.colors.bg.base, color: DS.colors.text.primary }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', -apple-system, sans-serif; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${DS.colors.border.default}; border-radius: 3px; }
        ::selection { background: ${DS.colors.accent.primary}40; }
      `}</style>

      <AdminSidebar active={activePage} onNavigate={setActivePage} theme={theme} onThemeToggle={toggleTheme} onLogout={handleLogout} />

      <main style={{ flex: 1, marginLeft: 220, padding: "24px 32px", minHeight: "100vh" }}>
        {renderPage()}
      </main>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
