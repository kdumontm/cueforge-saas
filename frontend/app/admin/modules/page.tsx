"use client";
import { useState, useRef, useCallback } from "react";
import {
  ToggleLeft, Upload, Download, Search, Bell, Sun, ZoomIn,
  Music, Hash, Disc3, Sliders, ListMusic, BarChart2, Settings,
  GripVertical, Check, RotateCcw, Eye, Layers, ChevronLeft,
  MonitorPlay, PanelLeft, PanelRight, Rows3, LayoutDashboard,
  Play, SkipBack, SkipForward, Repeat, Clock, Gauge, Wand2,
  Piano, Radio, Waves, Sparkles, ScanLine, AlignJustify, Grid2x2,
  Filter, CheckSquare, FolderOpen, NotebookPen, GitBranch,
  Crosshair, Cpu, Flame, FlaskConical, History, BookOpen,
  Library, BrainCircuit, AlertCircle, Keyboard, Star,
  Mic2, Volume2, ChevronDown, RefreshCw,
} from "lucide-react";
import Link from "next/link";

// ── Types ────────────────────────────────────────────────────────────────────
type Zone = "topbar" | "sidebar" | "right-panel" | "hidden";

type Category =
  | "topbar"
  | "player-controls"
  | "player-tabs"
  | "track-list"
  | "sidebar-tools"
  | "info-panel";

interface Module {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
  color: string;
  defaultZone: Zone;
  category: Category;
}

// ── Tous les modules / boutons de l'interface ─────────────────────────────────
const ALL_MODULES: Module[] = [
  // ── Barre du haut ──────────────────────────────────────────────────────────
  { id: "auto-analyse",     label: "Auto-analyse",      icon: ToggleLeft,    description: "Toggle analyse automatique",         color: "#22c55e", defaultZone: "topbar",       category: "topbar" },
  { id: "import",           label: "Import",             icon: Upload,        description: "Importer des tracks",                color: "#3b82f6", defaultZone: "topbar",       category: "topbar" },
  { id: "export",           label: "Export",             icon: Download,      description: "Exporter les données",               color: "#06b6d4", defaultZone: "topbar",       category: "topbar" },
  { id: "search",           label: "Recherche",          icon: Search,        description: "Barre de recherche globale ⌘K",      color: "#a855f7", defaultZone: "topbar",       category: "topbar" },
  { id: "notifications",   label: "Notifications",      icon: Bell,          description: "Centre de notifications",            color: "#f59e0b", defaultZone: "topbar",       category: "topbar" },
  { id: "theme",            label: "Thème clair/sombre", icon: Sun,           description: "Basculer mode clair/sombre",         color: "#eab308", defaultZone: "topbar",       category: "topbar" },
  { id: "analyze-badge",    label: "Badge à analyser",   icon: AlertCircle,   description: "Lancer l'analyse des tracks en attente", color: "#f97316", defaultZone: "topbar",  category: "topbar" },
  { id: "keyboard-shortcuts",label: "Raccourcis clavier",icon: Keyboard,      description: "Afficher les raccourcis clavier",    color: "#64748b", defaultZone: "hidden",       category: "topbar" },

  // ── Contrôles du lecteur ───────────────────────────────────────────────────
  { id: "play-pause",       label: "Lecture / Pause",    icon: Play,          description: "Démarrer ou mettre en pause",        color: "#22c55e", defaultZone: "right-panel",  category: "player-controls" },
  { id: "prev-track",       label: "Track précédent",    icon: SkipBack,      description: "Aller à la track précédente",        color: "#6366f1", defaultZone: "right-panel",  category: "player-controls" },
  { id: "next-track",       label: "Track suivant",      icon: SkipForward,   description: "Aller à la track suivante",          color: "#6366f1", defaultZone: "right-panel",  category: "player-controls" },
  { id: "loop-in",          label: "Loop IN",            icon: Crosshair,     description: "Marquer le point de début de loop",  color: "#ec4899", defaultZone: "right-panel",  category: "player-controls" },
  { id: "loop-out",         label: "Loop OUT",           icon: Crosshair,     description: "Marquer le point de fin de loop",    color: "#ec4899", defaultZone: "right-panel",  category: "player-controls" },
  { id: "loop-toggle",      label: "Activer Loop",       icon: Repeat,        description: "Activer/désactiver la boucle",       color: "#f43f5e", defaultZone: "right-panel",  category: "player-controls" },
  { id: "tap-tempo",        label: "Tap Tempo",          icon: Clock,         description: "Calculer le BPM par tap",            color: "#f97316", defaultZone: "right-panel",  category: "player-controls" },
  { id: "playback-rate",    label: "Vitesse lecture",    icon: Gauge,         description: "Changer la vitesse de lecture (0.5×–2×)", color: "#8b5cf6", defaultZone: "right-panel", category: "player-controls" },
  { id: "zoom-waveform",    label: "Zoom waveform",      icon: ZoomIn,        description: "Niveaux de zoom du waveform",        color: "#06b6d4", defaultZone: "right-panel",  category: "player-controls" },
  { id: "volume",           label: "Volume",             icon: Volume2,       description: "Contrôle du volume",                 color: "#10b981", defaultZone: "right-panel",  category: "player-controls" },
  { id: "import-player",    label: "Import (lecteur)",   icon: Upload,        description: "Charger une track dans le lecteur",  color: "#3b82f6", defaultZone: "right-panel",  category: "player-controls" },

  // ── Onglets du lecteur ─────────────────────────────────────────────────────
  { id: "tab-info",         label: "Onglet Info/Edit",   icon: NotebookPen,   description: "Métadonnées et édition",             color: "#3b82f6", defaultZone: "right-panel",  category: "player-tabs" },
  { id: "tab-cues",         label: "Onglet Cue Points",  icon: ListMusic,     description: "Points de repère",                  color: "#14b8a6", defaultZone: "right-panel",  category: "player-tabs" },
  { id: "tab-eq",           label: "Onglet EQ",          icon: Sliders,       description: "Égaliseur 3 bandes",                 color: "#8b5cf6", defaultZone: "right-panel",  category: "player-tabs" },
  { id: "tab-beatgrid",     label: "Onglet BeatGrid",    icon: ScanLine,      description: "Grille de beat / BPM",              color: "#f59e0b", defaultZone: "right-panel",  category: "player-tabs" },
  { id: "tab-mix",          label: "Onglet Mix",         icon: Waves,         description: "Compatibilité harmonique pour le mix", color: "#06b6d4", defaultZone: "right-panel", category: "player-tabs" },
  { id: "tab-stems",        label: "Onglet Stems",       icon: Mic2,          description: "Séparation des stems audio",         color: "#ec4899", defaultZone: "hidden",       category: "player-tabs" },
  { id: "tab-fx",           label: "Onglet FX",          icon: Sparkles,      description: "Effets audio",                       color: "#f43f5e", defaultZone: "hidden",       category: "player-tabs" },
  { id: "tab-history",      label: "Onglet Historique",  icon: History,       description: "Historique de lecture",              color: "#64748b", defaultZone: "hidden",       category: "player-tabs" },
  { id: "tab-playlists",    label: "Onglet Playlists",   icon: BookOpen,      description: "Gérer les playlists",               color: "#a855f7", defaultZone: "hidden",       category: "player-tabs" },
  { id: "tab-stats",        label: "Onglet Stats track", icon: BarChart2,     description: "Statistiques de la track",           color: "#94a3b8", defaultZone: "hidden",       category: "player-tabs" },

  // ── Liste des tracks ───────────────────────────────────────────────────────
  { id: "filter-panel",     label: "Panneau filtres",    icon: Filter,        description: "Filtres par BPM, tonalité, énergie…", color: "#3b82f6", defaultZone: "sidebar",     category: "track-list" },
  { id: "batch-actions",    label: "Actions groupées",   icon: CheckSquare,   description: "Sélection multiple et actions en lot", color: "#f59e0b", defaultZone: "topbar",     category: "track-list" },
  { id: "view-list",        label: "Vue Liste",          icon: AlignJustify,  description: "Afficher les tracks en liste",       color: "#6366f1", defaultZone: "topbar",       category: "track-list" },
  { id: "view-grid",        label: "Vue Grille",         icon: Grid2x2,       description: "Afficher les tracks en grille",      color: "#6366f1", defaultZone: "topbar",       category: "track-list" },
  { id: "refresh-library",  label: "Rafraîchir",         icon: RefreshCw,     description: "Recharger la bibliothèque",          color: "#22c55e", defaultZone: "topbar",       category: "track-list" },

  // ── Outils sidebar ─────────────────────────────────────────────────────────
  { id: "crate-digger",     label: "Crate Digger",       icon: FolderOpen,    description: "Explorer les dossiers de musique",   color: "#f97316", defaultZone: "sidebar",      category: "sidebar-tools" },
  { id: "harmonic-wheel",   label: "Roue harmonique",    icon: Piano,         description: "Compatibilité Camelot/tonalités",    color: "#22c55e", defaultZone: "sidebar",      category: "sidebar-tools" },
  { id: "energy-flow",      label: "Energy Flow",        icon: Flame,         description: "Visualisation énergie du set",       color: "#ef4444", defaultZone: "sidebar",      category: "sidebar-tools" },
  { id: "quick-notes",      label: "Notes rapides",      icon: NotebookPen,   description: "Bloc-notes intégré",                 color: "#a855f7", defaultZone: "sidebar",      category: "sidebar-tools" },
  { id: "bpm-tap",          label: "BPM Tap Tempo",      icon: Clock,         description: "Calculer le BPM par tap (sidebar)",  color: "#06b6d4", defaultZone: "sidebar",      category: "sidebar-tools" },
  { id: "set-builder",      label: "Set Builder",        icon: Library,       description: "Construire un set de DJ",            color: "#14b8a6", defaultZone: "sidebar",      category: "sidebar-tools" },
  { id: "duplicate-finder", label: "Doublons",           icon: GitBranch,     description: "Détecter les tracks en double",      color: "#f59e0b", defaultZone: "hidden",       category: "sidebar-tools" },
  { id: "metadata-enrich",  label: "Enrichir métadonnées",icon: Wand2,        description: "Compléter les infos via API",        color: "#8b5cf6", defaultZone: "hidden",       category: "sidebar-tools" },
  { id: "ai-analysis",      label: "Analyse IA",         icon: BrainCircuit,  description: "Analyse avancée par IA",             color: "#ec4899", defaultZone: "hidden",       category: "sidebar-tools" },
  { id: "stems-separator",  label: "Séparateur Stems",   icon: FlaskConical,  description: "Séparer vocals/instru/drums/bass",   color: "#f43f5e", defaultZone: "hidden",       category: "sidebar-tools" },
  { id: "radio-mode",       label: "Mode Radio",         icon: Radio,         description: "Lecture automatique enchaînée",      color: "#3b82f6", defaultZone: "hidden",       category: "sidebar-tools" },
  { id: "cpu-monitor",      label: "Monitor CPU",        icon: Cpu,           description: "Surveiller les performances",        color: "#64748b", defaultZone: "hidden",       category: "sidebar-tools" },

  // ── Panneau infos ──────────────────────────────────────────────────────────
  { id: "bpm-display",      label: "BPM",                icon: Music,         description: "Affichage du BPM analysé",           color: "#f97316", defaultZone: "right-panel",  category: "info-panel" },
  { id: "key-display",      label: "Tonalité",           icon: Hash,          description: "Clé musicale (Camelot)",             color: "#10b981", defaultZone: "right-panel",  category: "info-panel" },
  { id: "track-player",     label: "Lecteur waveform",   icon: Disc3,         description: "Waveform + minimap",                 color: "#6366f1", defaultZone: "right-panel",  category: "info-panel" },
  { id: "stats-library",    label: "Stats bibliothèque", icon: BarChart2,     description: "Chiffres globaux de la lib",         color: "#64748b", defaultZone: "sidebar",      category: "info-panel" },
  { id: "favorites",        label: "Favoris",            icon: Star,          description: "Accès rapide aux favoris",           color: "#eab308", defaultZone: "sidebar",      category: "info-panel" },
  { id: "gig-prep",         label: "Gig Prep",           icon: Sparkles,      description: "Préparer une setlist pour un gig",   color: "#06b6d4", defaultZone: "hidden",       category: "info-panel" },
  { id: "settings-link",    label: "Réglages",           icon: Settings,      description: "Lien vers les paramètres",           color: "#94a3b8", defaultZone: "sidebar",      category: "info-panel" },
  { id: "camelot-wheel",    label: "Roue Camelot",       icon: ChevronDown,   description: "Visualisation Camelot interactif",   color: "#22c55e", defaultZone: "hidden",       category: "info-panel" },
];

// ── Catégories ────────────────────────────────────────────────────────────────
const CATEGORIES: Record<Category, { label: string; color: string }> = {
  "topbar":          { label: "Barre du haut",       color: "#3b82f6" },
  "player-controls": { label: "Contrôles lecteur",   color: "#22c55e" },
  "player-tabs":     { label: "Onglets lecteur",     color: "#8b5cf6" },
  "track-list":      { label: "Liste des tracks",    color: "#f59e0b" },
  "sidebar-tools":   { label: "Outils sidebar",      color: "#f97316" },
  "info-panel":      { label: "Panneau infos",       color: "#06b6d4" },
};

const ZONE_META: Record<Zone, { label: string; icon: React.ElementType; color: string; bg: string; border: string; description: string }> = {
  topbar:        { label: "Barre du haut",  icon: Rows3,      color: "#3b82f6", bg: "rgba(59,130,246,0.08)",  border: "rgba(59,130,246,0.3)",  description: "Visible en permanence en haut de l'écran" },
  sidebar:       { label: "Sidebar",        icon: PanelLeft,  color: "#a855f7", bg: "rgba(168,85,247,0.08)",  border: "rgba(168,85,247,0.3)",  description: "Panneau de navigation à gauche" },
  "right-panel": { label: "Panneau droit",  icon: PanelRight, color: "#06b6d4", bg: "rgba(6,182,212,0.08)",   border: "rgba(6,182,212,0.3)",   description: "Panneau latéral droit (infos + contrôles)" },
  hidden:        { label: "Masqués",        icon: Eye,        color: "#64748b", bg: "rgba(100,116,139,0.06)", border: "rgba(100,116,139,0.2)", description: "Modules désactivés, non visibles" },
};

const STORAGE_KEY = "cueforge_module_layout";

function loadLayout(): Record<string, Zone> {
  if (typeof window === "undefined") return {};
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch { return {}; }
}

function saveLayout(layout: Record<string, Zone>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
}

// ── ModuleCard ────────────────────────────────────────────────────────────────
function ModuleCard({
  module, onDragStart, onDragEnd, isDragging,
}: {
  module: Module;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}) {
  const Icon = module.icon;
  const catMeta = CATEGORIES[module.category];
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, module.id)}
      onDragEnd={onDragEnd}
      className="group select-none"
      style={{ opacity: isDragging ? 0.35 : 1, transition: "opacity 0.15s" }}
    >
      <div
        style={{
          background: "rgba(255,255,255,0.04)",
          border: `1.5px solid rgba(255,255,255,0.09)`,
          borderRadius: 10,
          padding: "8px 10px",
          cursor: "grab",
          display: "flex",
          alignItems: "center",
          gap: 8,
          transition: "all 0.15s",
          userSelect: "none",
        }}
        className="hover:border-white/20 hover:bg-white/[0.07] active:cursor-grabbing"
      >
        <GripVertical size={12} color="rgba(255,255,255,0.2)" style={{ flexShrink: 0 }} />
        <div style={{
          width: 26, height: 26, borderRadius: 7, flexShrink: 0,
          background: `${module.color}22`,
          border: `1.5px solid ${module.color}55`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={13} color={module.color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0", lineHeight: 1.2 }}>{module.label}</div>
          <div style={{ fontSize: 9.5, color: "#475569", marginTop: 1, lineHeight: 1.3 }}>{module.description}</div>
        </div>
        <div style={{
          fontSize: 9, fontWeight: 600, color: catMeta.color,
          background: `${catMeta.color}18`, border: `1px solid ${catMeta.color}30`,
          borderRadius: 20, padding: "1px 6px", flexShrink: 0, whiteSpace: "nowrap",
        }}>
          {catMeta.label}
        </div>
      </div>
    </div>
  );
}

// ── DropZone ──────────────────────────────────────────────────────────────────
function DropZone({
  zone, modules, isOver,
  onDragOver, onDragLeave, onDrop, onDragStart, onDragEnd, draggingId,
}: {
  zone: Zone; modules: Module[]; isOver: boolean;
  onDragOver: (e: React.DragEvent, zone: Zone) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, zone: Zone) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  draggingId: string | null;
}) {
  const meta = ZONE_META[zone];
  const ZoneIcon = meta.icon;

  return (
    <div
      onDragOver={(e) => onDragOver(e, zone)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, zone)}
      style={{
        background: isOver ? meta.bg.replace("0.08", "0.15").replace("0.06", "0.12") : meta.bg,
        border: `2px dashed ${isOver ? meta.color : meta.border}`,
        borderRadius: 16,
        padding: 14,
        minHeight: 200,
        transition: "all 0.15s",
        boxShadow: isOver ? `0 0 0 1px ${meta.color}40` : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{
          width: 26, height: 26, borderRadius: 8,
          background: `${meta.color}22`, border: `1.5px solid ${meta.color}55`,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <ZoneIcon size={12} color={meta.color} />
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>{meta.label}</div>
          <div style={{ fontSize: 10, color: "#64748b" }}>{meta.description}</div>
        </div>
        <div style={{
          marginLeft: "auto", fontSize: 10, fontWeight: 600,
          color: meta.color, background: `${meta.color}18`,
          border: `1px solid ${meta.color}33`, borderRadius: 20, padding: "2px 8px",
        }}>
          {modules.length}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {modules.map((m) => (
          <ModuleCard
            key={m.id}
            module={m}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            isDragging={draggingId === m.id}
          />
        ))}
        {modules.length === 0 && (
          <div style={{
            textAlign: "center", padding: "18px 0",
            color: isOver ? meta.color : "#475569",
            fontSize: 11, fontStyle: "italic",
            transition: "color 0.15s",
          }}>
            {isOver ? "⬇ Déposer ici" : "Glisse un module ici"}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function ModulesAdminPage() {
  const [layout, setLayout] = useState<Record<string, Zone>>(() => {
    const saved = loadLayout();
    const result: Record<string, Zone> = {};
    for (const m of ALL_MODULES) {
      result[m.id] = saved[m.id] ?? m.defaultZone;
    }
    return result;
  });

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overZone, setOverZone] = useState<Zone | null>(null);
  const [saved, setSaved] = useState(false);
  const [activeCategory, setActiveCategory] = useState<Category | "all">("all");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const modulesByZone = (zone: Zone) =>
    ALL_MODULES.filter((m) => layout[m.id] === zone);

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("moduleId", id);
    setDraggingId(id);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setOverZone(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, zone: Zone) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverZone(zone);
  }, []);

  const handleDragLeave = useCallback(() => setOverZone(null), []);

  const handleDrop = useCallback((e: React.DragEvent, zone: Zone) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("moduleId");
    if (!id) return;
    setLayout((prev) => ({ ...prev, [id]: zone }));
    setDraggingId(null);
    setOverZone(null);
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setLayout((prev) => {
        saveLayout(prev);
        return prev;
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 400);
  }, []);

  const handleReset = () => {
    const defaults: Record<string, Zone> = {};
    for (const m of ALL_MODULES) defaults[m.id] = m.defaultZone;
    setLayout(defaults);
    saveLayout(defaults);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSave = () => {
    saveLayout(layout);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const zones: Zone[] = ["topbar", "sidebar", "right-panel", "hidden"];

  // Filtrer les modules par catégorie pour l'aperçu
  const filteredModules = (zone: Zone) =>
    modulesByZone(zone).filter(
      (m) => activeCategory === "all" || m.category === activeCategory
    );

  return (
    <div style={{ minHeight: "100vh", background: "#08080f", color: "#e2e8f0", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Header */}
      <div style={{
        padding: "18px 28px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        background: "rgba(255,255,255,0.02)",
        display: "flex", alignItems: "center", gap: 14,
        position: "sticky", top: 0, zIndex: 10,
        backdropFilter: "blur(12px)",
      }}>
        <Link href="/admin" style={{ display: "flex", alignItems: "center", gap: 6, color: "#64748b", textDecoration: "none", fontSize: 12 }}>
          <ChevronLeft size={14} /> Admin
        </Link>
        <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.1)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(59,130,246,0.15)", border: "1.5px solid rgba(59,130,246,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <LayoutDashboard size={14} color="#3b82f6" />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9" }}>Disposition des modules</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>{ALL_MODULES.length} éléments — glisse pour personnaliser l'interface</div>
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            onClick={handleReset}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", fontSize: 11, cursor: "pointer" }}
          >
            <RotateCcw size={12} /> Réinitialiser
          </button>
          <button
            onClick={handleSave}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, background: saved ? "rgba(34,197,94,0.15)" : "rgba(59,130,246,0.15)", border: `1px solid ${saved ? "rgba(34,197,94,0.35)" : "rgba(59,130,246,0.35)"}`, color: saved ? "#22c55e" : "#3b82f6", fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}
          >
            {saved ? <><Check size={12} /> Sauvegardé</> : <><MonitorPlay size={12} /> Sauvegarder</>}
          </button>
        </div>
      </div>

      <div style={{ padding: "24px 28px", maxWidth: 1300, margin: "0 auto" }}>

        {/* Info banner */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
          background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.2)",
          borderRadius: 10, marginBottom: 20,
        }}>
          <Layers size={15} color="#3b82f6" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            <strong style={{ color: "#e2e8f0" }}>Glisse-dépose</strong> les {ALL_MODULES.length} modules entre les zones. Les modules <strong style={{ color: "#e2e8f0" }}>masqués</strong> n'apparaissent nulle part dans l'interface.
          </span>
        </div>

        {/* Filtre par catégorie */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
          <button
            onClick={() => setActiveCategory("all")}
            style={{
              padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600,
              cursor: "pointer", transition: "all 0.15s",
              background: activeCategory === "all" ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${activeCategory === "all" ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.08)"}`,
              color: activeCategory === "all" ? "#f1f5f9" : "#64748b",
            }}
          >
            Tous ({ALL_MODULES.length})
          </button>
          {(Object.entries(CATEGORIES) as [Category, { label: string; color: string }][]).map(([cat, meta]) => {
            const count = ALL_MODULES.filter(m => m.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                  cursor: "pointer", transition: "all 0.15s",
                  background: activeCategory === cat ? `${meta.color}22` : "rgba(255,255,255,0.04)",
                  border: `1px solid ${activeCategory === cat ? meta.color + "55" : "rgba(255,255,255,0.08)"}`,
                  color: activeCategory === cat ? meta.color : "#64748b",
                }}
              >
                {meta.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Aperçu visuel */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Aperçu en direct</div>
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" }}>
            {/* TopBar preview */}
            <div style={{ background: "rgba(59,130,246,0.07)", borderBottom: "1px solid rgba(59,130,246,0.15)", padding: "7px 14px", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", minHeight: 36 }}>
              <span style={{ fontSize: 9, color: "#3b82f6", fontWeight: 700, marginRight: 4, flexShrink: 0 }}>TOPBAR</span>
              {modulesByZone("topbar").map((m) => {
                const Icon = m.icon;
                return (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 5, background: `${m.color}18`, border: `1px solid ${m.color}40`, fontSize: 9, color: m.color }}>
                    <Icon size={9} />{m.label}
                  </div>
                );
              })}
              {modulesByZone("topbar").length === 0 && <span style={{ fontSize: 9, color: "#475569", fontStyle: "italic" }}>vide</span>}
            </div>
            <div style={{ display: "flex", minHeight: 80 }}>
              {/* Sidebar */}
              <div style={{ width: 130, background: "rgba(168,85,247,0.05)", borderRight: "1px solid rgba(168,85,247,0.12)", padding: "10px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 9, color: "#a855f7", fontWeight: 700, marginBottom: 2 }}>SIDEBAR</span>
                {modulesByZone("sidebar").map((m) => {
                  const Icon = m.icon;
                  return (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 6px", borderRadius: 5, background: `${m.color}15`, fontSize: 9, color: m.color }}>
                      <Icon size={9} />{m.label}
                    </div>
                  );
                })}
                {modulesByZone("sidebar").length === 0 && <span style={{ fontSize: 9, color: "#475569", fontStyle: "italic" }}>vide</span>}
              </div>
              {/* Main */}
              <div style={{ flex: 1, padding: "10px 12px" }}>
                <span style={{ fontSize: 9, color: "#475569" }}>Zone principale</span>
              </div>
              {/* Right panel */}
              <div style={{ width: 140, background: "rgba(6,182,212,0.05)", borderLeft: "1px solid rgba(6,182,212,0.12)", padding: "10px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 9, color: "#06b6d4", fontWeight: 700, marginBottom: 2 }}>DROITE</span>
                {modulesByZone("right-panel").map((m) => {
                  const Icon = m.icon;
                  return (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 6px", borderRadius: 5, background: `${m.color}15`, fontSize: 9, color: m.color }}>
                      <Icon size={9} />{m.label}
                    </div>
                  );
                })}
                {modulesByZone("right-panel").length === 0 && <span style={{ fontSize: 9, color: "#475569", fontStyle: "italic" }}>vide</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Drop zones grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {zones.map((zone) => (
            <DropZone
              key={zone}
              zone={zone}
              modules={
                activeCategory === "all"
                  ? modulesByZone(zone)
                  : modulesByZone(zone).filter(m => m.category === activeCategory)
              }
              isOver={overZone === zone}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              draggingId={draggingId}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
