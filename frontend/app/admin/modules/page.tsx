"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import {
  ToggleLeft, Upload, Download, Search, Bell, Sun, ZoomIn,
  Music, Hash, Disc3, Sliders, ListMusic, BarChart2, Settings,
  Check, RotateCcw, ChevronLeft, LayoutDashboard,
  Play, SkipBack, SkipForward, Repeat, Clock, Gauge, Wand2,
  Piano, Waves, Sparkles, ScanLine, AlignJustify, Grid2x2,
  Filter, CheckSquare, FolderOpen, NotebookPen,
  Cpu, Flame, FlaskConical, History, BookOpen,
  Library, BrainCircuit, AlertCircle, Keyboard, Star,
  Mic2, Volume2, RefreshCw, X, EyeOff, Crosshair, Radio,
  GripVertical, Maximize2, Minimize2, MonitorPlay, Eye,
  Moon, GitBranch,
} from "lucide-react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────
type Zone = "topbar" | "sidebar" | "right-panel" | "float-br" | "float-bl" | "hidden";
type ModSize = "sm" | "md" | "lg";

interface ModDef {
  id: string; label: string; icon: React.ElementType;
  color: string; category: string; defaultZone: Zone;
}
interface ModConfig {
  id: string; zone: Zone; order: number;
  size: ModSize; expanded: boolean;
}
interface DragState {
  id: string; ghostX: number; ghostY: number;
  offsetX: number; offsetY: number;
  targetZone: Zone | null; targetIndex: number;
}

// ── Module definitions ─────────────────────────────────────────────────────────
const MODS: ModDef[] = [
  { id: "auto-analyse",     label: "Auto-analyse",       icon: ToggleLeft,   color: "#22c55e", category: "topbar",          defaultZone: "topbar" },
  { id: "import",           label: "Import",              icon: Upload,       color: "#3b82f6", category: "topbar",          defaultZone: "topbar" },
  { id: "export",           label: "Export",              icon: Download,     color: "#06b6d4", category: "topbar",          defaultZone: "topbar" },
  { id: "search",           label: "Recherche",           icon: Search,       color: "#a855f7", category: "topbar",          defaultZone: "topbar" },
  { id: "notifications",    label: "Notifications",       icon: Bell,         color: "#f59e0b", category: "topbar",          defaultZone: "topbar" },
  { id: "theme",            label: "Thème",               icon: Sun,          color: "#eab308", category: "topbar",          defaultZone: "topbar" },
  { id: "analyze-badge",    label: "Badge analyser",      icon: AlertCircle,  color: "#f97316", category: "topbar",          defaultZone: "topbar" },
  { id: "keyboard-shortcuts",label: "Raccourcis",         icon: Keyboard,     color: "#64748b", category: "topbar",          defaultZone: "hidden" },
  { id: "play-pause",       label: "Lecture/Pause",       icon: Play,         color: "#22c55e", category: "player-controls", defaultZone: "right-panel" },
  { id: "prev-track",       label: "Préc.",               icon: SkipBack,     color: "#6366f1", category: "player-controls", defaultZone: "right-panel" },
  { id: "next-track",       label: "Suiv.",               icon: SkipForward,  color: "#6366f1", category: "player-controls", defaultZone: "right-panel" },
  { id: "loop-in",          label: "Loop IN",             icon: Crosshair,    color: "#ec4899", category: "player-controls", defaultZone: "right-panel" },
  { id: "loop-out",         label: "Loop OUT",            icon: Crosshair,    color: "#ec4899", category: "player-controls", defaultZone: "right-panel" },
  { id: "loop-toggle",      label: "Loop actif",          icon: Repeat,       color: "#f43f5e", category: "player-controls", defaultZone: "right-panel" },
  { id: "tap-tempo",        label: "Tap Tempo",           icon: Clock,        color: "#f97316", category: "player-controls", defaultZone: "right-panel" },
  { id: "playback-rate",    label: "Vitesse",             icon: Gauge,        color: "#8b5cf6", category: "player-controls", defaultZone: "right-panel" },
  { id: "zoom-waveform",    label: "Zoom wave",           icon: ZoomIn,       color: "#06b6d4", category: "player-controls", defaultZone: "right-panel" },
  { id: "volume",           label: "Volume",              icon: Volume2,      color: "#10b981", category: "player-controls", defaultZone: "right-panel" },
  { id: "tab-info",         label: "Info/Edit",           icon: NotebookPen,  color: "#3b82f6", category: "player-tabs",     defaultZone: "right-panel" },
  { id: "tab-cues",         label: "Cue Points",          icon: ListMusic,    color: "#14b8a6", category: "player-tabs",     defaultZone: "right-panel" },
  { id: "tab-eq",           label: "EQ",                  icon: Sliders,      color: "#8b5cf6", category: "player-tabs",     defaultZone: "right-panel" },
  { id: "tab-beatgrid",     label: "BeatGrid",            icon: ScanLine,     color: "#f59e0b", category: "player-tabs",     defaultZone: "right-panel" },
  { id: "tab-mix",          label: "Mix",                 icon: Waves,        color: "#06b6d4", category: "player-tabs",     defaultZone: "right-panel" },
  { id: "tab-stems",        label: "Stems",               icon: Mic2,         color: "#ec4899", category: "player-tabs",     defaultZone: "hidden" },
  { id: "tab-fx",           label: "FX",                  icon: Sparkles,     color: "#f43f5e", category: "player-tabs",     defaultZone: "hidden" },
  { id: "tab-history",      label: "Historique",          icon: History,      color: "#64748b", category: "player-tabs",     defaultZone: "hidden" },
  { id: "tab-playlists",    label: "Playlists",           icon: BookOpen,     color: "#a855f7", category: "player-tabs",     defaultZone: "hidden" },
  { id: "tab-stats",        label: "Stats track",         icon: BarChart2,    color: "#94a3b8", category: "player-tabs",     defaultZone: "hidden" },
  { id: "filter-panel",     label: "Filtres",             icon: Filter,       color: "#3b82f6", category: "track-list",      defaultZone: "sidebar" },
  { id: "batch-actions",    label: "Actions groupées",    icon: CheckSquare,  color: "#f59e0b", category: "track-list",      defaultZone: "topbar" },
  { id: "view-list",        label: "Vue Liste",           icon: AlignJustify, color: "#6366f1", category: "track-list",      defaultZone: "topbar" },
  { id: "view-grid",        label: "Vue Grille",          icon: Grid2x2,      color: "#6366f1", category: "track-list",      defaultZone: "topbar" },
  { id: "refresh-library",  label: "Rafraîchir",          icon: RefreshCw,    color: "#22c55e", category: "track-list",      defaultZone: "topbar" },
  { id: "crate-digger",     label: "Crate Digger",        icon: FolderOpen,   color: "#f97316", category: "sidebar-tools",   defaultZone: "sidebar" },
  { id: "harmonic-wheel",   label: "Roue harmo.",         icon: Piano,        color: "#22c55e", category: "sidebar-tools",   defaultZone: "sidebar" },
  { id: "energy-flow",      label: "Energy Flow",         icon: Flame,        color: "#ef4444", category: "sidebar-tools",   defaultZone: "sidebar" },
  { id: "quick-notes",      label: "Notes rapides",       icon: NotebookPen,  color: "#a855f7", category: "sidebar-tools",   defaultZone: "sidebar" },
  { id: "bpm-tap",          label: "BPM Tap",             icon: Clock,        color: "#06b6d4", category: "sidebar-tools",   defaultZone: "sidebar" },
  { id: "set-builder",      label: "Set Builder",         icon: Library,      color: "#14b8a6", category: "sidebar-tools",   defaultZone: "sidebar" },
  { id: "duplicate-finder", label: "Doublons",            icon: GitBranch,    color: "#f59e0b", category: "sidebar-tools",   defaultZone: "hidden" },
  { id: "metadata-enrich",  label: "Enrichir méta",       icon: Wand2,        color: "#8b5cf6", category: "sidebar-tools",   defaultZone: "hidden" },
  { id: "ai-analysis",      label: "Analyse IA",          icon: BrainCircuit, color: "#ec4899", category: "sidebar-tools",   defaultZone: "hidden" },
  { id: "stems-separator",  label: "Séparer Stems",       icon: FlaskConical, color: "#f43f5e", category: "sidebar-tools",   defaultZone: "hidden" },
  { id: "radio-mode",       label: "Mode Radio",          icon: Radio,        color: "#3b82f6", category: "sidebar-tools",   defaultZone: "hidden" },
  { id: "cpu-monitor",      label: "Monitor CPU",         icon: Cpu,          color: "#64748b", category: "sidebar-tools",   defaultZone: "hidden" },
  { id: "bpm-display",      label: "BPM",                 icon: Music,        color: "#f97316", category: "info-panel",      defaultZone: "right-panel" },
  { id: "key-display",      label: "Tonalité",            icon: Hash,         color: "#10b981", category: "info-panel",      defaultZone: "right-panel" },
  { id: "track-player",     label: "Lecteur wave",        icon: Disc3,        color: "#6366f1", category: "info-panel",      defaultZone: "right-panel" },
  { id: "stats-library",    label: "Stats lib.",          icon: BarChart2,    color: "#64748b", category: "info-panel",      defaultZone: "sidebar" },
  { id: "favorites",        label: "Favoris",             icon: Star,         color: "#eab308", category: "info-panel",      defaultZone: "sidebar" },
  { id: "gig-prep",         label: "Gig Prep",            icon: Sparkles,     color: "#06b6d4", category: "info-panel",      defaultZone: "hidden" },
  { id: "settings-link",    label: "Réglages",            icon: Settings,     color: "#94a3b8", category: "info-panel",      defaultZone: "sidebar" },
];

const MOD_MAP = Object.fromEntries(MODS.map(m => [m.id, m]));

// ── Persistence ────────────────────────────────────────────────────────────────
const STORAGE_KEY = "cueforge_module_layout_v2";

function buildDefault(): ModConfig[] {
  return MODS.map((m, i) => ({
    id: m.id, zone: m.defaultZone, order: i,
    size: "md" as ModSize, expanded: false,
  }));
}

function loadConfigs(): ModConfig[] {
  if (typeof window === "undefined") return buildDefault();
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? JSON.parse(s) : buildDefault();
  } catch { return buildDefault(); }
}

function saveConfigs(configs: ModConfig[]) {
  if (typeof window !== "undefined")
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function getZoneMods(configs: ModConfig[], zone: Zone) {
  return configs.filter(c => c.zone === zone).sort((a, b) => a.order - b.order);
}

function applyDragPreview(configs: ModConfig[], drag: DragState): ModConfig[] {
  if (!drag.targetZone) return configs;
  const dragged = configs.find(c => c.id === drag.id);
  if (!dragged) return configs;

  // Build new zone without dragged item
  const zoneItems = configs
    .filter(c => c.zone === drag.targetZone && c.id !== drag.id)
    .sort((a, b) => a.order - b.order);

  const inserted = [
    ...zoneItems.slice(0, drag.targetIndex),
    { ...dragged, zone: drag.targetZone },
    ...zoneItems.slice(drag.targetIndex),
  ].map((c, i) => ({ ...c, order: i }));

  return configs.map(c => {
    const found = inserted.find(x => x.id === c.id);
    if (found) return found;
    if (c.id === drag.id && drag.targetZone !== c.zone) return { ...c, zone: drag.targetZone! };
    return c;
  });
}

// ── Constants ──────────────────────────────────────────────────────────────────
const ZONE_COLORS: Record<Zone, string> = {
  topbar: "#3b82f6", sidebar: "#a855f7",
  "right-panel": "#06b6d4", "float-br": "#22c55e",
  "float-bl": "#f59e0b", hidden: "#64748b",
};
const ZONE_LABELS: Record<Zone, string> = {
  topbar: "Topbar", sidebar: "Sidebar",
  "right-panel": "Droite", "float-br": "Float ↘",
  "float-bl": "Float ↙", hidden: "Masqué",
};

// ── MiniContent (expanded previews) ───────────────────────────────────────────
function MiniContent({ id, expanded }: { id: string; expanded: boolean }) {
  if (!expanded) return null;
  const base: React.CSSProperties = { marginTop: 8, fontSize: 10, color: "#64748b" };

  if (id === "bpm-display") return (
    <div style={base}>
      <div style={{ fontSize: 26, fontWeight: 800, color: "#f97316", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>128</div>
      <div style={{ fontSize: 9 }}>BPM analysé</div>
    </div>
  );
  if (id === "key-display") return (
    <div style={base}>
      <div style={{ fontSize: 26, fontWeight: 800, color: "#10b981", lineHeight: 1 }}>8A</div>
      <div style={{ fontSize: 9 }}>Do mineur</div>
    </div>
  );
  if (id === "tab-eq") return (
    <div style={{ ...base, display: "flex", gap: 7, alignItems: "flex-end", height: 30 }}>
      {[0.45, 0.75, 0.55].map((v, i) => (
        <div key={i} style={{ width: 14, borderRadius: 3, background: `linear-gradient(to top, #8b5cf6, #8b5cf688)`, height: `${v * 100}%`, flexShrink: 0 }} />
      ))}
    </div>
  );
  if (id === "tab-cues") return (
    <div style={{ ...base, display: "flex", flexDirection: "column", gap: 4 }}>
      {[{ t: "0:12", c: "#f43f5e" }, { t: "1:04", c: "#3b82f6" }, { t: "2:16", c: "#22c55e" }].map((cue, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: cue.c }} />
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{cue.t}</span>
        </div>
      ))}
    </div>
  );
  if (id === "harmonic-wheel") return (
    <div style={{ ...base, display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 4 }}>
      <div style={{ width: 46, height: 46, borderRadius: "50%", border: "2px solid #22c55e44", background: "conic-gradient(#22c55e22, #3b82f622, #a855f722, #22c55e22)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#08080f", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#22c55e", fontWeight: 700 }}>8A</div>
      </div>
    </div>
  );
  if (id === "track-player") return (
    <div style={base}>
      <div style={{ height: 24, background: "linear-gradient(90deg, #6366f120, #6366f140)", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 9, color: "#6366f1" }}>▶ waveform</span>
      </div>
    </div>
  );
  return null;
}

// ── Module card (in sidebar / right panel) ─────────────────────────────────────
function ModCard({
  config, isDragging, isSelected, zone,
  onPointerDown, onSelect, onToggleExpand, onRemove, onSizeChange,
}: {
  config: ModConfig; isDragging: boolean; isSelected: boolean; zone: Zone;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onRemove: (id: string) => void;
  onSizeChange: (id: string, size: ModSize) => void;
}) {
  const def = MOD_MAP[config.id];
  if (!def) return null;
  const Icon = def.icon;

  if (zone === "topbar") {
    return (
      <div
        data-mod-id={config.id}
        onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, config.id); }}
        onClick={(e) => { e.stopPropagation(); onSelect(config.id); }}
        style={{
          display: "flex", alignItems: "center", gap: 5, padding: "4px 9px",
          borderRadius: 7, flexShrink: 0, cursor: "grab",
          background: isSelected ? `${def.color}22` : "rgba(255,255,255,0.06)",
          border: `1.5px solid ${isSelected ? def.color + "77" : "rgba(255,255,255,0.1)"}`,
          opacity: isDragging ? 0.35 : 1, transition: "all 0.12s", userSelect: "none",
          boxShadow: isSelected ? `0 0 0 2px ${def.color}33` : "none",
        }}
      >
        <Icon size={12} color={def.color} />
        <span style={{ fontSize: 11, color: "#e2e8f0", fontWeight: 500 }}>{def.label}</span>
        {isSelected && (
          <button onClick={(e) => { e.stopPropagation(); onRemove(config.id); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: "0 0 0 2px", lineHeight: 0 }}>
            <X size={9} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      data-mod-id={config.id}
      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, config.id); }}
      onClick={(e) => { e.stopPropagation(); onSelect(config.id); }}
      style={{
        background: isSelected ? `${def.color}12` : "rgba(255,255,255,0.04)",
        border: `1.5px solid ${isSelected ? def.color + "66" : "rgba(255,255,255,0.08)"}`,
        borderRadius: 9, padding: "7px 9px",
        cursor: "grab", opacity: isDragging ? 0.35 : 1,
        transition: "all 0.12s", userSelect: "none",
        boxShadow: isSelected ? `0 0 0 2px ${def.color}33` : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, background: `${def.color}22`, border: `1.5px solid ${def.color}44`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={12} color={def.color} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0", flex: 1 }}>{def.label}</span>
        {isSelected ? (
          <div style={{ display: "flex", gap: 3 }}>
            <button onClick={(e) => { e.stopPropagation(); onToggleExpand(config.id); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: config.expanded ? def.color : "#64748b", lineHeight: 0 }}>
              {config.expanded ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); onRemove(config.id); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", lineHeight: 0 }}>
              <X size={11} />
            </button>
          </div>
        ) : (
          <GripVertical size={10} color="rgba(255,255,255,0.15)" />
        )}
      </div>
      {isSelected && (
        <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
          {(["sm", "md", "lg"] as ModSize[]).map(s => (
            <button key={s} onClick={(e) => { e.stopPropagation(); onSizeChange(config.id, s); }}
              style={{
                padding: "1px 7px", borderRadius: 4, fontSize: 9, fontWeight: 700, cursor: "pointer",
                background: config.size === s ? `${def.color}30` : "rgba(255,255,255,0.04)",
                border: `1px solid ${config.size === s ? def.color + "66" : "rgba(255,255,255,0.1)"}`,
                color: config.size === s ? def.color : "#475569",
              }}>{s.toUpperCase()}</button>
          ))}
        </div>
      )}
      <MiniContent id={config.id} expanded={config.expanded} />
    </div>
  );
}

// ── Drop placeholder ───────────────────────────────────────────────────────────
function DropPlaceholder({ zone }: { zone: Zone }) {
  const color = ZONE_COLORS[zone];
  const isTop = zone === "topbar";
  return (
    <div style={{
      background: `${color}10`, border: `2px dashed ${color}88`, borderRadius: 8,
      ...(isTop ? { width: 80, height: 30, flexShrink: 0 } : { height: 36 }),
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{ width: 16, height: 2, background: `${color}88`, borderRadius: 1 }} />
    </div>
  );
}

// ── Floating panel ─────────────────────────────────────────────────────────────
function FloatPanel({ config, isDragging, isSelected, onPointerDown, onSelect, onToggleExpand, onRemove }: {
  config: ModConfig; isDragging: boolean; isSelected: boolean;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const def = MOD_MAP[config.id];
  if (!def) return null;
  const Icon = def.icon;
  return (
    <div
      data-mod-id={config.id}
      style={{
        background: "#0d0d1e", border: `1.5px solid ${isSelected ? def.color + "88" : "rgba(255,255,255,0.12)"}`,
        borderRadius: 11, padding: 10, minWidth: 130,
        boxShadow: `0 8px 28px rgba(0,0,0,0.7)${isSelected ? `, 0 0 0 2px ${def.color}33` : ""}`,
        opacity: isDragging ? 0.4 : 1, transition: "all 0.12s", userSelect: "none",
      }}
      onClick={(e) => { e.stopPropagation(); onSelect(config.id); }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}
        onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, config.id); }}
        style={{ display: "flex", alignItems: "center", gap: 7, cursor: "grab" } as React.CSSProperties}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: `${def.color}22`, border: `1.5px solid ${def.color}55`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={13} color={def.color} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#f1f5f9", flex: 1 }}>{def.label}</span>
        <button onClick={(e) => { e.stopPropagation(); onToggleExpand(config.id); }}
          style={{ background: "none", border: "none", cursor: "pointer", color: config.expanded ? def.color : "#475569", lineHeight: 0, padding: 1 }}>
          {config.expanded ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
        </button>
        <button onClick={(e) => { e.stopPropagation(); onRemove(config.id); }}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", lineHeight: 0, padding: 1 }}>
          <X size={11} />
        </button>
      </div>
      <MiniContent id={config.id} expanded={config.expanded} />
    </div>
  );
}

// ── Ghost cursor element ───────────────────────────────────────────────────────
function CursorGhost({ drag }: { drag: DragState }) {
  const def = MOD_MAP[drag.id];
  if (!def) return null;
  const Icon = def.icon;
  return (
    <div style={{
      position: "fixed", left: drag.ghostX, top: drag.ghostY, zIndex: 9999,
      pointerEvents: "none", transform: "rotate(1.5deg) scale(0.94)",
      background: "#1a1a2e", border: `2px solid ${def.color}88`,
      borderRadius: 10, padding: "6px 11px",
      display: "flex", alignItems: "center", gap: 8,
      boxShadow: `0 14px 44px rgba(0,0,0,0.8), 0 0 0 1px ${def.color}33`,
      minWidth: 110, userSelect: "none",
    }}>
      <div style={{ width: 24, height: 24, borderRadius: 6, background: `${def.color}22`, border: `1.5px solid ${def.color}55`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={12} color={def.color} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: "#f1f5f9" }}>{def.label}</span>
    </div>
  );
}

// ── Zone render helper ─────────────────────────────────────────────────────────
function ZoneItems({
  zone, configs, dragState, selected,
  onPointerDown, onSelect, onToggleExpand, onRemove, onSizeChange,
}: {
  zone: Zone; configs: ModConfig[]; dragState: DragState | null; selected: string | null;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onRemove: (id: string) => void;
  onSizeChange: (id: string, size: ModSize) => void;
}) {
  const items = getZoneMods(configs, zone);
  const placeholderIdx = dragState?.targetZone === zone ? dragState.targetIndex : -1;
  const color = ZONE_COLORS[zone];
  const result: React.ReactNode[] = [];

  items.forEach((c, i) => {
    if (i === placeholderIdx) result.push(<DropPlaceholder key={`ph-${i}`} zone={zone} />);
    result.push(
      <ModCard
        key={c.id} config={c} zone={zone}
        isDragging={dragState?.id === c.id}
        isSelected={selected === c.id}
        onPointerDown={onPointerDown} onSelect={onSelect}
        onToggleExpand={onToggleExpand} onRemove={onRemove} onSizeChange={onSizeChange}
      />
    );
  });
  if (items.length === placeholderIdx) result.push(<DropPlaceholder key="ph-end" zone={zone} />);
  return <>{result}</>;
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function LayoutBuilderPage() {
  const [configs, setConfigs] = useState<ModConfig[]>(loadConfigs);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [savedBanner, setSavedBanner] = useState(false);

  // Live preview during drag
  const liveConfigs = dragState ? applyDragPreview(configs, dragState) : configs;

  // Pointer move / up listeners
  useEffect(() => {
    if (!dragState) return;

    const onMove = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const zoneEl = el?.closest("[data-zone]") as HTMLElement | null;
      const targetZone = (zoneEl?.dataset.zone as Zone) ?? null;

      let targetIndex = 0;
      if (targetZone && zoneEl) {
        const children = Array.from(zoneEl.querySelectorAll("[data-mod-id]")) as HTMLElement[];
        for (let i = 0; i < children.length; i++) {
          const r = children[i].getBoundingClientRect();
          const isTop = targetZone === "topbar";
          const mid = isTop ? (r.left + r.right) / 2 : (r.top + r.bottom) / 2;
          if ((isTop ? e.clientX : e.clientY) > mid) targetIndex = i + 1;
        }
      }

      setDragState(prev => prev ? {
        ...prev,
        ghostX: e.clientX - prev.offsetX,
        ghostY: e.clientY - prev.offsetY,
        targetZone,
        targetIndex,
      } : null);
    };

    const onUp = () => {
      setDragState(prev => {
        if (prev?.targetZone) {
          const preview = applyDragPreview(configs, { ...prev, targetZone: prev.targetZone });
          // Rebuild proper orders per zone
          const zones: Zone[] = ["topbar", "sidebar", "right-panel", "float-br", "float-bl", "hidden"];
          const result: ModConfig[] = [];
          for (const z of zones) {
            getZoneMods(preview, z).forEach((c, i) => result.push({ ...c, zone: z, order: i }));
          }
          setConfigs(result);
          saveConfigs(result);
        }
        return null;
      });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragState, configs]);

  const handlePointerDown = useCallback((e: React.PointerEvent, id: string) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setSelected(id);
    setDragState({
      id, ghostX: rect.left, ghostY: rect.top,
      offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top,
      targetZone: null, targetIndex: 0,
    });
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setConfigs(prev => { const u = prev.map(c => c.id === id ? { ...c, expanded: !c.expanded } : c); saveConfigs(u); return u; });
  }, []);

  const removeModule = useCallback((id: string) => {
    setConfigs(prev => { const u = prev.map(c => c.id === id ? { ...c, zone: "hidden" as Zone } : c); saveConfigs(u); return u; });
    setSelected(s => s === id ? null : s);
  }, []);

  const changeSize = useCallback((id: string, size: ModSize) => {
    setConfigs(prev => { const u = prev.map(c => c.id === id ? { ...c, size } : c); saveConfigs(u); return u; });
  }, []);

  const moveToZone = useCallback((id: string, zone: Zone) => {
    setConfigs(prev => {
      const existingCount = prev.filter(c => c.zone === zone).length;
      const u = prev.map(c => c.id === id ? { ...c, zone, order: existingCount } : c);
      saveConfigs(u);
      return u;
    });
  }, []);

  const handleReset = () => {
    const d = buildDefault(); setConfigs(d); saveConfigs(d); setSelected(null);
  };

  const handleSave = () => {
    saveConfigs(configs);
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 2500);
  };

  const selectedCfg = selected ? configs.find(c => c.id === selected) : null;
  const selectedDef = selected ? MOD_MAP[selected] : null;

  const commonZoneProps = {
    configs: liveConfigs, dragState,
    selected, onPointerDown: handlePointerDown, onSelect: setSelected,
    onToggleExpand: toggleExpand, onRemove: removeModule, onSizeChange: changeSize,
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#05050d", color: "#e2e8f0", fontFamily: "system-ui, -apple-system, sans-serif", overflow: "hidden", cursor: dragState ? "grabbing" : "default" }}>

      {/* ─── Header ─── */}
      <div style={{ padding: "9px 18px", borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", gap: 12, flexShrink: 0, backdropFilter: "blur(10px)", zIndex: 20 }}>
        <Link href="/admin" style={{ display: "flex", alignItems: "center", gap: 5, color: "#64748b", textDecoration: "none", fontSize: 11 }}>
          <ChevronLeft size={13} /> Admin
        </Link>
        <div style={{ width: 1, height: 13, background: "rgba(255,255,255,0.1)" }} />
        <div style={{ width: 26, height: 26, borderRadius: 7, background: "rgba(59,130,246,0.15)", border: "1.5px solid rgba(59,130,246,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <LayoutDashboard size={13} color="#3b82f6" />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9", lineHeight: 1.2 }}>Layout Builder</div>
          <div style={{ fontSize: 10, color: "#475569" }}>Click-hold pour déplacer · Clic pour options</div>
        </div>

        {/* Zone legend */}
        <div style={{ display: "flex", gap: 10, marginLeft: 18, flexWrap: "wrap" }}>
          {(Object.entries(ZONE_COLORS) as [Zone, string][]).filter(([z]) => z !== "hidden").map(([zone, color]) => (
            <div key={zone} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#475569" }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
              {ZONE_LABELS[zone]}
            </div>
          ))}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 7, alignItems: "center" }}>
          <button onClick={handleReset} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 7, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", fontSize: 11, cursor: "pointer" }}>
            <RotateCcw size={11} /> Reset
          </button>
          <button onClick={handleSave} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 16px", borderRadius: 7, fontWeight: 700, fontSize: 12, cursor: "pointer", transition: "all 0.2s", background: savedBanner ? "rgba(34,197,94,0.2)" : "linear-gradient(135deg, #2563eb, #7c3aed)", border: savedBanner ? "1px solid #22c55e66" : "1px solid transparent", color: savedBanner ? "#22c55e" : "white", boxShadow: savedBanner ? "none" : "0 2px 14px rgba(37,99,235,0.4)" }}>
            {savedBanner ? <><Check size={13} /> Sauvegardé !</> : <><MonitorPlay size={13} /> Mettre en prod</>}
          </button>
        </div>
      </div>

      {/* ─── Canvas : CueForge UI preview ─── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }} onClick={(e) => { if ((e.target as HTMLElement).hasAttribute("data-canvas")) setSelected(null); }}>

        {/* ── TopBar zone ── */}
        <div
          data-zone="topbar"
          style={{
            background: "rgba(8,8,20,0.98)", borderBottom: "1px solid rgba(255,255,255,0.08)",
            padding: "0 14px", height: 46,
            display: "flex", alignItems: "center", gap: 7, flexShrink: 0,
            outline: dragState?.targetZone === "topbar" ? `2px solid ${ZONE_COLORS.topbar}55` : "2px solid transparent",
            transition: "outline 0.1s",
          }}
        >
          {/* CueForge logo (static) */}
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0, marginRight: 6 }}>
            <div style={{ width: 24, height: 24, borderRadius: 6, background: "linear-gradient(135deg, #2563eb, #ec4899)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Disc3 size={12} color="white" />
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>CueForge</span>
          </div>
          <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />

          {/* TopBar modules */}
          <ZoneItems zone="topbar" {...commonZoneProps} />

          {getZoneMods(liveConfigs, "topbar").length === 0 && !dragState && (
            <span style={{ fontSize: 10, color: "#1e293b", fontStyle: "italic" }}>Glisse des modules ici</span>
          )}
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }} data-canvas="1">

          {/* ── Sidebar ── */}
          <div
            data-zone="sidebar"
            style={{
              width: 188, flexShrink: 0, background: "rgba(9,9,22,0.98)",
              borderRight: "1px solid rgba(255,255,255,0.07)",
              display: "flex", flexDirection: "column", overflowY: "auto",
              outline: dragState?.targetZone === "sidebar" ? `2px solid ${ZONE_COLORS.sidebar}55` : "2px solid transparent",
              transition: "outline 0.1s",
            }}
          >
            <div style={{ padding: "10px 7px", display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#1e293b", textTransform: "uppercase", letterSpacing: "0.08em", padding: "2px 4px 5px" }}>Sidebar</div>
              <ZoneItems zone="sidebar" {...commonZoneProps} />
              {getZoneMods(liveConfigs, "sidebar").length === 0 && !dragState && (
                <div style={{ fontSize: 10, color: "#1e293b", fontStyle: "italic", textAlign: "center", paddingTop: 10 }}>Glisse ici</div>
              )}
            </div>
          </div>

          {/* ── Main content (static mock) ── */}
          <div data-canvas="1" style={{ flex: 1, background: "#07070f", overflow: "hidden", position: "relative" }}>
            {/* Overview waveform */}
            <div style={{ margin: "10px 12px 5px", height: 44, background: "rgba(255,255,255,0.02)", borderRadius: 7, border: "1px solid rgba(255,255,255,0.05)", overflow: "hidden", position: "relative", flexShrink: 0 }}>
              {Array.from({ length: 72 }).map((_, i) => {
                const h = 18 + Math.abs(Math.sin(i * 0.62) * 18 + Math.sin(i * 0.2) * 8);
                return <div key={i} style={{ position: "absolute", left: `${i / 72 * 100}%`, bottom: "50%", width: "1.1%", height: `${h}%`, background: i < 22 ? "rgba(99,102,241,0.55)" : "rgba(168,85,247,0.4)", transform: "translateY(50%)", borderRadius: 1 }} />;
              })}
              <div style={{ position: "absolute", left: "30%", top: 0, bottom: 0, width: 2, background: "#ec4899", opacity: 0.9 }} />
            </div>
            {/* Detail waveform */}
            <div style={{ margin: "0 12px 8px", height: 64, background: "rgba(255,255,255,0.02)", borderRadius: 7, border: "1px solid rgba(255,255,255,0.05)", overflow: "hidden", position: "relative", flexShrink: 0 }}>
              {Array.from({ length: 96 }).map((_, i) => {
                const h = 12 + Math.abs(Math.sin(i * 0.38) * 24 + Math.sin(i * 1.1) * 14);
                return <div key={i} style={{ position: "absolute", left: `${i / 96 * 100}%`, bottom: "50%", width: "0.85%", height: `${h}%`, background: i < 29 ? "rgba(99,102,241,0.6)" : "rgba(168,85,247,0.45)", transform: "translateY(50%)", borderRadius: 1 }} />;
              })}
              <div style={{ position: "absolute", left: "30%", top: 0, bottom: 0, width: 2, background: "#ec4899", opacity: 0.75 }} />
            </div>
            {/* Track list mock */}
            <div style={{ padding: "0 12px" }} data-canvas="1">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: "#1e293b", fontWeight: 600 }}>Bibliothèque</span>
                <span style={{ fontSize: 9, color: "#1a2535" }}>247 tracks</span>
              </div>
              {[
                { n: "Acid Rain",       bpm: 128, key: "8A",  d: "6:42" },
                { n: "Solar Drift",     bpm: 132, key: "6B",  d: "7:15" },
                { n: "Midnight Echo",   bpm: 124, key: "11A", d: "5:58" },
                { n: "Deep Signal",     bpm: 136, key: "3B",  d: "8:02" },
                { n: "Phantom Bass",    bpm: 140, key: "1A",  d: "6:28" },
              ].map((t, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 7px", borderRadius: 6, marginBottom: 2, background: i === 0 ? "rgba(99,102,241,0.08)" : "transparent", border: i === 0 ? "1px solid rgba(99,102,241,0.15)" : "1px solid transparent" }}>
                  <Disc3 size={11} color={i === 0 ? "#6366f1" : "#334155"} />
                  <span style={{ flex: 1, fontSize: 11, color: i === 0 ? "#e2e8f0" : "#64748b" }}>{t.n}</span>
                  <span style={{ fontSize: 10, color: "#f97316", fontVariantNumeric: "tabular-nums" }}>{t.bpm}</span>
                  <span style={{ fontSize: 10, color: "#10b981", width: 22, textAlign: "right" }}>{t.key}</span>
                  <span style={{ fontSize: 10, color: "#334155", fontVariantNumeric: "tabular-nums" }}>{t.d}</span>
                </div>
              ))}
            </div>

            {/* Float BR zone */}
            <div
              data-zone="float-br"
              style={{
                position: "absolute", bottom: 12, right: 12,
                display: "flex", flexDirection: "column", gap: 7, zIndex: 10,
                outline: dragState?.targetZone === "float-br" ? `2px dashed ${ZONE_COLORS["float-br"]}77` : "2px dashed transparent",
                borderRadius: 12, padding: 6, minWidth: 120, minHeight: 40,
                background: dragState?.targetZone === "float-br" ? `${ZONE_COLORS["float-br"]}08` : "transparent",
                transition: "all 0.1s",
              }}
            >
              {getZoneMods(liveConfigs, "float-br").length === 0 && dragState && (
                <div style={{ fontSize: 9, color: ZONE_COLORS["float-br"], textAlign: "center" }}>Float ↘</div>
              )}
              <ZoneItems zone="float-br" {...commonZoneProps} />
            </div>

            {/* Float BL zone */}
            <div
              data-zone="float-bl"
              style={{
                position: "absolute", bottom: 12, left: 12,
                display: "flex", flexDirection: "column", gap: 7, zIndex: 10,
                outline: dragState?.targetZone === "float-bl" ? `2px dashed ${ZONE_COLORS["float-bl"]}77` : "2px dashed transparent",
                borderRadius: 12, padding: 6, minWidth: 120, minHeight: 40,
                background: dragState?.targetZone === "float-bl" ? `${ZONE_COLORS["float-bl"]}08` : "transparent",
                transition: "all 0.1s",
              }}
            >
              {getZoneMods(liveConfigs, "float-bl").length === 0 && dragState && (
                <div style={{ fontSize: 9, color: ZONE_COLORS["float-bl"], textAlign: "center" }}>Float ↙</div>
              )}
              <ZoneItems zone="float-bl" {...commonZoneProps} />
            </div>
          </div>

          {/* ── Right Panel ── */}
          <div
            data-zone="right-panel"
            style={{
              width: 214, flexShrink: 0, background: "rgba(9,9,22,0.98)",
              borderLeft: "1px solid rgba(255,255,255,0.07)",
              display: "flex", flexDirection: "column", overflowY: "auto",
              outline: dragState?.targetZone === "right-panel" ? `2px solid ${ZONE_COLORS["right-panel"]}55` : "2px solid transparent",
              transition: "outline 0.1s",
            }}
          >
            <div style={{ padding: "10px 7px", display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#1e293b", textTransform: "uppercase", letterSpacing: "0.08em", padding: "2px 4px 5px" }}>Panneau droit</div>
              <ZoneItems zone="right-panel" {...commonZoneProps} />
              {getZoneMods(liveConfigs, "right-panel").length === 0 && !dragState && (
                <div style={{ fontSize: 10, color: "#1e293b", fontStyle: "italic", textAlign: "center", paddingTop: 10 }}>Glisse ici</div>
              )}
            </div>
          </div>
        </div>

        {/* ── Hidden palette ── */}
        <div
          data-zone="hidden"
          style={{
            background: "rgba(255,255,255,0.02)",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            padding: "7px 14px 8px", flexShrink: 0,
            outline: dragState?.targetZone === "hidden" ? `2px solid ${ZONE_COLORS.hidden}44` : "2px solid transparent",
            transition: "outline 0.1s",
          }}
        >
          <div style={{ fontSize: 9, color: "#334155", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
            <EyeOff size={10} /> Masqués — glisse ici pour désactiver
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {getZoneMods(liveConfigs, "hidden").map(c => {
              const def = MOD_MAP[c.id];
              if (!def) return null;
              const Icon = def.icon;
              return (
                <div key={c.id} data-mod-id={c.id}
                  onPointerDown={(e) => handlePointerDown(e, c.id)}
                  onClick={(e) => { e.stopPropagation(); setSelected(c.id); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 4, padding: "3px 8px",
                    borderRadius: 5, background: "rgba(255,255,255,0.03)",
                    border: `1px solid ${selected === c.id ? def.color + "55" : "rgba(255,255,255,0.07)"}`,
                    cursor: "grab", fontSize: 10, color: "#475569",
                    opacity: dragState?.id === c.id ? 0.35 : 1, userSelect: "none",
                  }}
                >
                  <Icon size={9} color={def.color} />
                  {def.label}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Ghost ── */}
        {dragState && <CursorGhost drag={dragState} />}

        {/* ── Selection action bar ── */}
        {selected && !dragState && selectedCfg && selectedDef && (() => {
          const Icon = selectedDef.icon;
          return (
            <div style={{
              position: "absolute", bottom: 72, left: "50%", transform: "translateX(-50%)",
              background: "rgba(10,10,24,0.96)", border: `1.5px solid ${selectedDef.color}66`,
              borderRadius: 12, padding: "8px 14px",
              display: "flex", alignItems: "center", gap: 10,
              boxShadow: `0 8px 36px rgba(0,0,0,0.7), 0 0 0 1px ${selectedDef.color}18`,
              zIndex: 50, backdropFilter: "blur(16px)", whiteSpace: "nowrap",
            }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: `${selectedDef.color}22`, border: `1.5px solid ${selectedDef.color}55`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={13} color={selectedDef.color} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#f1f5f9" }}>{selectedDef.label}</span>
              <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.1)" }} />

              {/* Move to zone */}
              <div style={{ display: "flex", gap: 4 }}>
                {(["topbar", "sidebar", "right-panel", "float-br", "float-bl", "hidden"] as Zone[]).map(z => (
                  <button key={z} onClick={() => moveToZone(selected, z)} style={{
                    padding: "3px 9px", borderRadius: 6, fontSize: 9.5, fontWeight: 600, cursor: "pointer",
                    background: selectedCfg.zone === z ? `${ZONE_COLORS[z]}28` : "rgba(255,255,255,0.04)",
                    border: `1px solid ${selectedCfg.zone === z ? ZONE_COLORS[z] + "77" : "rgba(255,255,255,0.08)"}`,
                    color: selectedCfg.zone === z ? ZONE_COLORS[z] : "#475569",
                    transition: "all 0.12s",
                  }}>
                    {ZONE_LABELS[z]}
                  </button>
                ))}
              </div>
              <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.1)" }} />

              {/* Expand toggle */}
              <button onClick={() => toggleExpand(selected)} style={{
                display: "flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 6,
                background: selectedCfg.expanded ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${selectedCfg.expanded ? "#22c55e55" : "rgba(255,255,255,0.1)"}`,
                color: selectedCfg.expanded ? "#22c55e" : "#64748b",
                fontSize: 10, fontWeight: 600, cursor: "pointer",
              }}>
                {selectedCfg.expanded ? <Minimize2 size={10} /> : <Maximize2 size={10} />}
                {selectedCfg.expanded ? "Ouvert" : "Compact"}
              </button>

              {/* Size */}
              <div style={{ display: "flex", gap: 3 }}>
                {(["sm", "md", "lg"] as ModSize[]).map(s => (
                  <button key={s} onClick={() => changeSize(selected, s)} style={{
                    padding: "3px 7px", borderRadius: 5, fontSize: 9, fontWeight: 700, cursor: "pointer",
                    background: selectedCfg.size === s ? `${selectedDef.color}28` : "rgba(255,255,255,0.04)",
                    border: `1px solid ${selectedCfg.size === s ? selectedDef.color + "66" : "rgba(255,255,255,0.08)"}`,
                    color: selectedCfg.size === s ? selectedDef.color : "#475569",
                  }}>{s.toUpperCase()}</button>
                ))}
              </div>

              <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", padding: 2, marginLeft: 2, lineHeight: 0 }}>
                <X size={13} />
              </button>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
