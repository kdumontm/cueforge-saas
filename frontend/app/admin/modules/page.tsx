"use client";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  ToggleLeft, Upload, Download, Search, Bell, Sun, ZoomIn,
  Music, Hash, Disc3, Sliders, ListMusic, BarChart2, Settings,
  Check, RotateCcw, ChevronLeft, LayoutDashboard, MonitorPlay,
  Play, SkipBack, SkipForward, Repeat, Clock, Gauge, Wand2,
  Piano, Waves, Sparkles, ScanLine, AlignJustify, Grid2x2,
  Filter, CheckSquare, FolderOpen, NotebookPen, Cpu, Flame,
  FlaskConical, History, BookOpen, Library, BrainCircuit,
  AlertCircle, Keyboard, Star, Mic2, Volume2, RefreshCw,
  X, EyeOff, Crosshair, Radio, Maximize2, Minimize2, GitBranch,
  GripVertical, Eye, Plus, Undo2, Redo2, Lock, Unlock,
  Copy, Layers, ChevronDown, ChevronRight, ZoomOut,
  Magnet, LayoutTemplate, PanelLeftClose, PanelRightClose,
  Move, ArrowUpDown, ArrowLeftRight, Trash2,
} from "lucide-react";
import Link from "next/link";

// ─── Constants ───────────────────────────────────────────────────────────────
const GRID = 8;
const MIN_W = 80;
const MIN_H = 36;
const HANDLE_SZ = 8;
const STORAGE_KEY = "cueforge_layout_v4";
const MAX_UNDO = 40;

// ─── Types ───────────────────────────────────────────────────────────────────
type ResizeEdge = "n"|"ne"|"e"|"se"|"s"|"sw"|"w"|"nw";
interface ModDef {
  id: string; label: string; icon: React.ElementType; color: string; category: string;
}
interface Mod {
  id: string; x: number; y: number; w: number; h: number;
  z: number; open: boolean; onCanvas: boolean; locked: boolean;
}
interface DragState {
  id: string; mode: "move"|ResizeEdge;
  startPx: number; startPy: number;
  origX: number; origY: number; origW: number; origH: number;
}
interface SnapLine { axis: "x"|"y"; pos: number; }

// ─── Categories ──────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: "toolbar", label: "Barre d'outils", icon: Layers },
  { id: "player", label: "Lecteur", icon: Play },
  { id: "library", label: "Bibliothèque", icon: Library },
  { id: "analysis", label: "Analyse", icon: BarChart2 },
  { id: "navigation", label: "Navigation", icon: FolderOpen },
  { id: "tools", label: "Outils avancés", icon: Wand2 },
];

// ─── Module definitions ──────────────────────────────────────────────────────
const DEFS: ModDef[] = [
  // Toolbar
  { id:"auto-analyse",    label:"Auto-analyse",    icon:ToggleLeft,   color:"#22c55e", category:"toolbar" },
  { id:"import",          label:"Import",           icon:Upload,       color:"#3b82f6", category:"toolbar" },
  { id:"export",          label:"Export",           icon:Download,     color:"#06b6d4", category:"toolbar" },
  { id:"search",          label:"Recherche",        icon:Search,       color:"#a855f7", category:"toolbar" },
  { id:"notifications",   label:"Notifs",           icon:Bell,         color:"#f59e0b", category:"toolbar" },
  { id:"theme",           label:"Thème",            icon:Sun,          color:"#eab308", category:"toolbar" },
  { id:"batch-actions",   label:"Actions groupées", icon:CheckSquare,  color:"#f59e0b", category:"toolbar" },
  { id:"view-list",       label:"Vue Liste",        icon:AlignJustify, color:"#6366f1", category:"toolbar" },
  { id:"view-grid",       label:"Vue Grille",       icon:Grid2x2,      color:"#6366f1", category:"toolbar" },
  { id:"refresh-library", label:"Rafraîchir",       icon:RefreshCw,    color:"#22c55e", category:"toolbar" },
  // Player
  { id:"track-player",    label:"Waveform",         icon:Disc3,        color:"#6366f1", category:"player" },
  { id:"controls-bar",    label:"Contrôles player", icon:Play,         color:"#22c55e", category:"player" },
  { id:"play-pause",      label:"Lecture / Pause",  icon:Play,         color:"#22c55e", category:"player" },
  { id:"prev-track",      label:"Track préc.",      icon:SkipBack,     color:"#6366f1", category:"player" },
  { id:"next-track",      label:"Track suiv.",      icon:SkipForward,  color:"#6366f1", category:"player" },
  { id:"loop-in",         label:"Loop IN",          icon:Crosshair,    color:"#ec4899", category:"player" },
  { id:"loop-out",        label:"Loop OUT",         icon:Crosshair,    color:"#ec4899", category:"player" },
  { id:"loop-toggle",     label:"Loop actif",       icon:Repeat,       color:"#f43f5e", category:"player" },
  { id:"playback-rate",   label:"Vitesse",          icon:Gauge,        color:"#8b5cf6", category:"player" },
  { id:"zoom-waveform",   label:"Zoom wave",        icon:ZoomIn,       color:"#06b6d4", category:"player" },
  { id:"volume",          label:"Volume",           icon:Volume2,      color:"#10b981", category:"player" },
  { id:"tap-tempo",       label:"Tap Tempo",        icon:Clock,        color:"#f97316", category:"player" },
  // Library
  { id:"track-list",      label:"Liste des tracks", icon:AlignJustify, color:"#475569", category:"library" },
  { id:"filter-panel",    label:"Filtres",          icon:Filter,       color:"#3b82f6", category:"library" },
  { id:"crate-digger",    label:"Crate Digger",     icon:FolderOpen,   color:"#f97316", category:"library" },
  { id:"favorites",       label:"Favoris",          icon:Star,         color:"#eab308", category:"library" },
  { id:"stats-library",   label:"Stats lib.",       icon:BarChart2,    color:"#64748b", category:"library" },
  { id:"settings-link",   label:"Réglages",         icon:Settings,     color:"#94a3b8", category:"library" },
  { id:"tab-playlists",   label:"Playlists",        icon:BookOpen,     color:"#a855f7", category:"library" },
  // Analysis
  { id:"bpm-display",     label:"BPM",              icon:Music,        color:"#f97316", category:"analysis" },
  { id:"key-display",     label:"Tonalité",         icon:Hash,         color:"#10b981", category:"analysis" },
  { id:"tab-cues",        label:"Cue Points",       icon:ListMusic,    color:"#14b8a6", category:"analysis" },
  { id:"tab-eq",          label:"EQ",               icon:Sliders,      color:"#8b5cf6", category:"analysis" },
  { id:"tab-beatgrid",    label:"BeatGrid",         icon:ScanLine,     color:"#f59e0b", category:"analysis" },
  { id:"tab-mix",         label:"Mix",              icon:Waves,        color:"#06b6d4", category:"analysis" },
  { id:"tab-stems",       label:"Stems",            icon:Mic2,         color:"#ec4899", category:"analysis" },
  { id:"tab-fx",          label:"FX",               icon:Sparkles,     color:"#f43f5e", category:"analysis" },
  { id:"tab-info",        label:"Info/Edit",        icon:NotebookPen,  color:"#3b82f6", category:"analysis" },
  { id:"analyze-badge",   label:"Badge analyser",   icon:AlertCircle,  color:"#f97316", category:"analysis" },
  // Navigation
  { id:"tab-history",     label:"Historique",       icon:History,       color:"#64748b", category:"navigation" },
  { id:"gig-prep",        label:"Gig Prep",         icon:Sparkles,     color:"#06b6d4", category:"navigation" },
  { id:"set-builder",     label:"Set Builder",      icon:Library,      color:"#14b8a6", category:"navigation" },
  // Tools
  { id:"harmonic-wheel",  label:"Roue harmo.",      icon:Piano,        color:"#22c55e", category:"tools" },
  { id:"energy-flow",     label:"Energy Flow",      icon:Flame,        color:"#ef4444", category:"tools" },
  { id:"quick-notes",     label:"Notes rapides",    icon:NotebookPen,  color:"#a855f7", category:"tools" },
  { id:"bpm-tap",         label:"BPM Tap",          icon:Clock,        color:"#06b6d4", category:"tools" },
  { id:"duplicate-finder",label:"Doublons",         icon:GitBranch,    color:"#f59e0b", category:"tools" },
  { id:"ai-analysis",     label:"Analyse IA",       icon:BrainCircuit, color:"#ec4899", category:"tools" },
];
const DEF_MAP = Object.fromEntries(DEFS.map(d => [d.id, d]));

// ─── Default layout ──────────────────────────────────────────────────────────
function makeDefault(): Mod[] {
  const ON: Mod[] = [
    { id:"auto-analyse",   x:200, y:8,   w:128, h:32,  z:10, open:true, onCanvas:true, locked:false },
    { id:"import",         x:336, y:8,   w:80,  h:32,  z:10, open:true, onCanvas:true, locked:false },
    { id:"export",         x:424, y:8,   w:80,  h:32,  z:10, open:true, onCanvas:true, locked:false },
    { id:"search",         x:536, y:8,   w:240, h:32,  z:10, open:true, onCanvas:true, locked:false },
    { id:"batch-actions",  x:808, y:8,   w:136, h:32,  z:10, open:true, onCanvas:true, locked:false },
    { id:"view-list",      x:952, y:8,   w:40,  h:32,  z:10, open:true, onCanvas:true, locked:false },
    { id:"view-grid",      x:1000,y:8,   w:40,  h:32,  z:10, open:true, onCanvas:true, locked:false },
    { id:"refresh-library",x:1048,y:8,   w:40,  h:32,  z:10, open:true, onCanvas:true, locked:false },
    { id:"notifications",  x:1296,y:8,   w:40,  h:32,  z:10, open:true, onCanvas:true, locked:false },
    { id:"theme",          x:1344,y:8,   w:40,  h:32,  z:10, open:true, onCanvas:true, locked:false },
    { id:"filter-panel",   x:0,   y:56,  w:200, h:200, z:5,  open:true, onCanvas:true, locked:false },
    { id:"crate-digger",   x:0,   y:264, w:200, h:120, z:5,  open:true, onCanvas:true, locked:false },
    { id:"harmonic-wheel", x:0,   y:392, w:200, h:176, z:5,  open:true, onCanvas:true, locked:false },
    { id:"stats-library",  x:0,   y:576, w:200, h:64,  z:5,  open:true, onCanvas:true, locked:false },
    { id:"favorites",      x:0,   y:648, w:200, h:48,  z:5,  open:true, onCanvas:true, locked:false },
    { id:"settings-link",  x:0,   y:704, w:200, h:48,  z:5,  open:true, onCanvas:true, locked:false },
    { id:"track-player",   x:208, y:56,  w:944, h:200, z:5,  open:true, onCanvas:true, locked:false },
    { id:"controls-bar",   x:208, y:264, w:944, h:56,  z:5,  open:true, onCanvas:true, locked:false },
    { id:"track-list",     x:208, y:328, w:944, h:424, z:5,  open:true, onCanvas:true, locked:false },
    { id:"bpm-display",    x:1160,y:56,  w:240, h:96,  z:5,  open:true, onCanvas:true, locked:false },
    { id:"key-display",    x:1160,y:160, w:240, h:96,  z:5,  open:true, onCanvas:true, locked:false },
    { id:"tab-cues",       x:1160,y:264, w:240, h:200, z:5,  open:true, onCanvas:true, locked:false },
    { id:"tab-eq",         x:1160,y:472, w:240, h:128, z:5,  open:true, onCanvas:true, locked:false },
    { id:"tab-info",       x:1160,y:608, w:240, h:144, z:5,  open:true, onCanvas:true, locked:false },
  ];
  const onIds = new Set(ON.map(m => m.id));
  const OFF: Mod[] = DEFS
    .filter(d => !onIds.has(d.id))
    .map(d => ({ id:d.id, x:0, y:0, w:160, h:56, z:1, open:false, onCanvas:false, locked:false }));
  return [...ON, ...OFF];
}

// ─── Preset layouts ──────────────────────────────────────────────────────────
const PRESETS = [
  { id: "default", label: "CueForge Standard", desc: "Layout par défaut avec sidebar + waveform + tracklist" },
  { id: "minimal", label: "Minimal DJ", desc: "Uniquement waveform, contrôles et liste" },
  { id: "analysis", label: "Mode Analyse", desc: "Focus sur BPM, tonalité, cues et EQ" },
  { id: "wide", label: "Écran large", desc: "Optimisé pour grands écrans, 3 colonnes" },
];

function applyPreset(presetId: string): Mod[] {
  if (presetId === "default") return makeDefault();
  if (presetId === "minimal") {
    const mods = makeDefault().map(m => ({ ...m, onCanvas: false }));
    const show = ["track-player","controls-bar","track-list","search","bpm-display","key-display"];
    return mods.map(m => {
      if (!show.includes(m.id)) return m;
      if (m.id === "track-player") return { ...m, onCanvas:true, x:0, y:0, w:1400, h:200, z:5, open:true };
      if (m.id === "controls-bar") return { ...m, onCanvas:true, x:0, y:208, w:1400, h:56, z:5, open:true };
      if (m.id === "track-list") return { ...m, onCanvas:true, x:0, y:272, w:1100, h:480, z:5, open:true };
      if (m.id === "search") return { ...m, onCanvas:true, x:400, y:0, w:600, h:32, z:10, open:true };
      if (m.id === "bpm-display") return { ...m, onCanvas:true, x:1108, y:272, w:292, h:200, z:5, open:true };
      if (m.id === "key-display") return { ...m, onCanvas:true, x:1108, y:480, w:292, h:200, z:5, open:true };
      return m;
    });
  }
  if (presetId === "analysis") {
    const mods = makeDefault().map(m => ({ ...m, onCanvas: false }));
    const configs: Record<string, Partial<Mod>> = {
      "track-player": { x:0, y:0, w:1400, h:160, z:5 },
      "controls-bar": { x:0, y:168, w:700, h:48, z:5 },
      "bpm-display":  { x:0, y:224, w:350, h:160, z:5 },
      "key-display":  { x:358, y:224, w:350, h:160, z:5 },
      "tab-cues":     { x:0, y:392, w:500, h:360, z:5 },
      "tab-eq":       { x:508, y:224, w:450, h:260, z:5 },
      "tab-beatgrid": { x:508, y:492, w:450, h:260, z:5 },
      "harmonic-wheel":{ x:716, y:224, w:250, h:260, z:5 },
      "tab-info":     { x:966, y:224, w:434, h:260, z:5 },
      "tab-stems":    { x:966, y:492, w:434, h:260, z:5 },
    };
    return mods.map(m => {
      const c = configs[m.id];
      if (!c) return m;
      return { ...m, onCanvas:true, open:true, ...c };
    });
  }
  return makeDefault();
}

// ─── Persistence ─────────────────────────────────────────────────────────────
function loadMods(): Mod[] {
  if (typeof window === "undefined") return makeDefault();
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return makeDefault();
    const parsed = JSON.parse(s);
    // Add locked field if missing (migration)
    return parsed.map((m: any) => ({ ...m, locked: m.locked ?? false }));
  } catch { return makeDefault(); }
}
function saveMods(mods: Mod[]) {
  if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(mods));
}

// ─── Snap to grid ────────────────────────────────────────────────────────────
function sg(v: number) { return Math.round(v / GRID) * GRID; }

// ─── Smart snap guides ───────────────────────────────────────────────────────
const SNAP_THRESHOLD = 6;
function calcSnapLines(dragId: string, dragRect: {x:number;y:number;w:number;h:number}, allMods: Mod[]): { lines: SnapLine[], snapX: number|null, snapY: number|null } {
  const lines: SnapLine[] = [];
  let snapX: number|null = null, snapY: number|null = null;
  const dc = { cx: dragRect.x + dragRect.w/2, cy: dragRect.y + dragRect.h/2, r: dragRect.x + dragRect.w, b: dragRect.y + dragRect.h };

  for (const m of allMods) {
    if (m.id === dragId || !m.onCanvas) continue;
    const mc = { cx: m.x + m.w/2, cy: m.y + m.h/2, r: m.x + m.w, b: m.y + m.h };

    // X alignments
    const xPairs: [number, number][] = [
      [dragRect.x, m.x], [dragRect.x, mc.r], [dc.r, m.x], [dc.r, mc.r], [dc.cx, mc.cx],
    ];
    for (const [dv, mv] of xPairs) {
      if (Math.abs(dv - mv) < SNAP_THRESHOLD && snapX === null) {
        snapX = mv - (dv - dragRect.x);
        lines.push({ axis: "x", pos: mv });
      }
    }
    // Y alignments
    const yPairs: [number, number][] = [
      [dragRect.y, m.y], [dragRect.y, mc.b], [dc.b, m.y], [dc.b, mc.b], [dc.cy, mc.cy],
    ];
    for (const [dv, mv] of yPairs) {
      if (Math.abs(dv - mv) < SNAP_THRESHOLD && snapY === null) {
        snapY = mv - (dv - dragRect.y);
        lines.push({ axis: "y", pos: mv });
      }
    }
  }
  return { lines, snapX, snapY };
}

// ─── Module content (rich previews) ──────────────────────────────────────────
function ModContent({ id, h }: { id:string; h:number }) {
  const contentH = Math.max(0, h - 36);

  if (id === "track-player") return (
    <div style={{ height: contentH, overflow:"hidden", padding:"4px 8px" }}>
      <div style={{ height: Math.max(24, contentH * 0.35), borderRadius:5, background:"rgba(0,0,0,0.3)", border:"1px solid rgba(255,255,255,0.05)", overflow:"hidden", position:"relative", marginBottom:4 }}>
        {Array.from({length:80}).map((_,i) => {
          const bh = 14 + Math.abs(Math.sin(i*0.6)*14 + Math.sin(i*0.2)*8);
          return <div key={i} style={{ position:"absolute", left:`${i/80*100}%`, bottom:"50%", width:"1.1%", height:`${bh}%`, background:i<24?"rgba(99,102,241,0.6)":"rgba(168,85,247,0.42)", transform:"translateY(50%)", borderRadius:1 }} />;
        })}
        <div style={{ position:"absolute", left:"30%", top:0, bottom:0, width:2, background:"#ec4899", opacity:0.9 }} />
      </div>
      {contentH > 80 && (
        <div style={{ height: Math.max(24, contentH * 0.55), borderRadius:5, background:"rgba(0,0,0,0.3)", border:"1px solid rgba(255,255,255,0.05)", overflow:"hidden", position:"relative" }}>
          {Array.from({length:100}).map((_,i) => {
            const bh = 10 + Math.abs(Math.sin(i*0.38)*24 + Math.sin(i*1.1)*14);
            return <div key={i} style={{ position:"absolute", left:`${i}%`, bottom:"50%", width:"0.85%", height:`${bh}%`, background:i<30?"rgba(99,102,241,0.65)":"rgba(168,85,247,0.45)", transform:"translateY(50%)", borderRadius:1 }} />;
          })}
          <div style={{ position:"absolute", left:"30%", top:0, bottom:0, width:2, background:"#ec4899", opacity:0.8 }} />
        </div>
      )}
    </div>
  );

  if (id === "controls-bar") return (
    <div style={{ height:contentH, display:"flex", alignItems:"center", justifyContent:"center", gap:10, padding:"0 12px" }}>
      {[{Icon:SkipBack,c:"#6366f1"},{Icon:Play,c:"#22c55e"},{Icon:SkipForward,c:"#6366f1"}].map(({Icon,c},i)=>(
        <div key={i} style={{ width:34,height:34,borderRadius:10,background:`${c}22`,border:`1.5px solid ${c}55`,display:"flex",alignItems:"center",justifyContent:"center" }}>
          <Icon size={15} color={c} />
        </div>
      ))}
      <div style={{ width:1,height:20,background:"rgba(255,255,255,0.1)" }} />
      {[{Icon:Crosshair,c:"#ec4899",l:"IN"},{Icon:Repeat,c:"#f43f5e",l:"LOOP"},{Icon:Crosshair,c:"#ec4899",l:"OUT"}].map(({Icon,c,l},i)=>(
        <div key={i} style={{ display:"flex",alignItems:"center",gap:4,padding:"4px 8px",borderRadius:7,background:`${c}15`,border:`1px solid ${c}33` }}>
          <Icon size={11} color={c} /><span style={{ fontSize:9,color:c,fontWeight:700 }}>{l}</span>
        </div>
      ))}
    </div>
  );

  if (id === "track-list") return (
    <div style={{ height:contentH, overflow:"hidden", padding:"4px 8px" }}>
      {[{n:"Acid Rain",bpm:128,key:"8A",d:"6:42",active:true},{n:"Solar Drift",bpm:132,key:"6B",d:"7:15"},{n:"Midnight Echo",bpm:124,key:"11A",d:"5:58"},{n:"Deep Signal",bpm:136,key:"3B",d:"8:02"},{n:"Phantom Bass",bpm:140,key:"1A",d:"6:28"},{n:"Techno Loop",bpm:138,key:"5A",d:"7:11"},{n:"Dark Matter",bpm:145,key:"2B",d:"5:44"},{n:"Resonance",bpm:126,key:"9A",d:"6:55"}].map((t,i)=>(
        <div key={i} style={{ display:"flex",alignItems:"center",gap:8,padding:"4px 6px",borderRadius:5,marginBottom:2,background:t.active?"rgba(99,102,241,0.1)":"transparent",border:t.active?"1px solid rgba(99,102,241,0.2)":"1px solid transparent" }}>
          <Disc3 size={10} color={t.active?"#6366f1":"#334155"} style={{ flexShrink:0 }} />
          <span style={{ flex:1,fontSize:10,color:t.active?"#e2e8f0":"#64748b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{t.n}</span>
          <span style={{ fontSize:9,color:"#f97316",fontVariantNumeric:"tabular-nums",flexShrink:0 }}>{t.bpm}</span>
          <span style={{ fontSize:9,color:"#10b981",width:22,textAlign:"right",flexShrink:0 }}>{t.key}</span>
          <span style={{ fontSize:9,color:"#334155",fontVariantNumeric:"tabular-nums",flexShrink:0 }}>{t.d}</span>
        </div>
      ))}
    </div>
  );

  if (id === "filter-panel") return (
    <div style={{ height:contentH, overflow:"hidden", padding:"6px 10px", display:"flex", flexDirection:"column", gap:10 }}>
      <div>
        <div style={{ fontSize:9,color:"#64748b",fontWeight:600,marginBottom:4 }}>BPM</div>
        <div style={{ display:"flex",alignItems:"center",gap:6 }}>
          <span style={{ fontSize:10,color:"#94a3b8" }}>110</span>
          <div style={{ flex:1,height:3,background:"rgba(255,255,255,0.08)",borderRadius:2,position:"relative" }}>
            <div style={{ position:"absolute",left:"15%",right:"20%",height:"100%",background:"#3b82f6",borderRadius:2 }} />
          </div>
          <span style={{ fontSize:10,color:"#94a3b8" }}>150</span>
        </div>
      </div>
      <div>
        <div style={{ fontSize:9,color:"#64748b",fontWeight:600,marginBottom:5 }}>Tonalité</div>
        <div style={{ display:"flex",gap:3,flexWrap:"wrap" }}>
          {["1A","2A","8A","8B","9A","9B"].map(k=>(
            <div key={k} style={{ padding:"2px 6px",borderRadius:4,background:k==="8A"?"rgba(16,185,129,0.2)":"rgba(255,255,255,0.04)",border:`1px solid ${k==="8A"?"#10b98155":"rgba(255,255,255,0.08)"}`,fontSize:9,color:k==="8A"?"#10b981":"#475569" }}>{k}</div>
          ))}
        </div>
      </div>
    </div>
  );

  if (id === "bpm-display") return (
    <div style={{ height:contentH,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center" }}>
      <div style={{ fontSize:Math.min(44,contentH-16),fontWeight:800,color:"#f97316",lineHeight:1,fontVariantNumeric:"tabular-nums" }}>128</div>
      <div style={{ fontSize:10,color:"#64748b",marginTop:2 }}>BPM</div>
    </div>
  );

  if (id === "key-display") return (
    <div style={{ height:contentH,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center" }}>
      <div style={{ fontSize:Math.min(40,contentH-16),fontWeight:800,color:"#10b981",lineHeight:1 }}>8A</div>
      <div style={{ fontSize:10,color:"#64748b",marginTop:2 }}>Do mineur</div>
    </div>
  );

  if (id === "tab-cues") {
    const cues = [{t:"0:12",p:4,c:"#f43f5e",n:"Intro",k:"I"},{t:"1:04",p:22,c:"#3b82f6",n:"Drop 1",k:"1"},{t:"2:16",p:48,c:"#22c55e",n:"Break",k:"B"},{t:"3:30",p:70,c:"#f59e0b",n:"Drop 2",k:"2"},{t:"4:45",p:92,c:"#a855f7",n:"Outro",k:"O"}];
    return (
      <div style={{ height:contentH,overflow:"hidden",padding:"6px 8px",display:"flex",flexDirection:"column",gap:6 }}>
        <div style={{ position:"relative",height:28,background:"rgba(255,255,255,0.03)",borderRadius:6,border:"1px solid rgba(255,255,255,0.06)",overflow:"hidden",flexShrink:0 }}>
          {cues.map((cue,i)=>(
            <div key={i} style={{ position:"absolute",left:`${cue.p}%`,top:0,bottom:0,width:2,background:cue.c,opacity:0.8 }}>
              <div style={{ position:"absolute",top:-1,left:-4,width:10,height:10,background:cue.c,borderRadius:"50%",border:"2px solid rgba(0,0,0,0.5)" }} />
            </div>
          ))}
        </div>
        <div style={{ flex:1,display:"flex",flexDirection:"column",gap:3,overflow:"hidden" }}>
          {cues.map((cue,i)=>(
            <div key={i} style={{ display:"flex",alignItems:"center",gap:6,padding:"3px 5px",borderRadius:6,background:`linear-gradient(90deg, ${cue.c}12, transparent 70%)`,borderLeft:`2px solid ${cue.c}` }}>
              <div style={{ width:18,height:18,borderRadius:4,background:`${cue.c}25`,border:`1px solid ${cue.c}50`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                <span style={{ fontSize:9,fontWeight:800,color:cue.c }}>{cue.k}</span>
              </div>
              <span style={{ fontSize:10,color:"#e2e8f0",fontVariantNumeric:"tabular-nums",width:30,flexShrink:0 }}>{cue.t}</span>
              <span style={{ fontSize:9,color:"#94a3b8",flex:1 }}>{cue.n}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (id === "tab-eq") return (
    <div style={{ height:contentH,padding:"6px 8px",display:"flex",flexDirection:"column",gap:8 }}>
      {[{l:"LOW",v:0.6,c:"#3b82f6"},{l:"MID",v:0.75,c:"#10b981"},{l:"HIGH",v:0.45,c:"#f97316"}].map(({l,v,c})=>(
        <div key={l} style={{ display:"flex",alignItems:"center",gap:8 }}>
          <span style={{ fontSize:9,fontWeight:700,color:"#64748b",width:28 }}>{l}</span>
          <div style={{ flex:1,height:4,background:"rgba(255,255,255,0.07)",borderRadius:2,position:"relative" }}>
            <div style={{ position:"absolute",left:0,width:`${v*100}%`,height:"100%",background:c,borderRadius:2 }} />
          </div>
          <span style={{ fontSize:9,color:c,width:26,textAlign:"right" }}>{Math.round(v*24-12)}dB</span>
        </div>
      ))}
    </div>
  );

  if (id === "harmonic-wheel") return (
    <div style={{ height:contentH,display:"flex",alignItems:"center",justifyContent:"center" }}>
      <div style={{ width:Math.min(120,contentH-12),height:Math.min(120,contentH-12),borderRadius:"50%",border:"2px solid rgba(34,197,94,0.3)",background:"conic-gradient(from 0deg, rgba(34,197,94,0.15),rgba(59,130,246,0.15),rgba(168,85,247,0.15),rgba(249,115,22,0.15),rgba(34,197,94,0.15))",display:"flex",alignItems:"center",justifyContent:"center" }}>
        <div style={{ width:"55%",height:"55%",borderRadius:"50%",background:"#07070f",border:"1.5px solid rgba(34,197,94,0.4)",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column" }}>
          <span style={{ fontSize:11,fontWeight:800,color:"#22c55e" }}>8A</span>
          <span style={{ fontSize:8,color:"#64748b" }}>Do min</span>
        </div>
      </div>
    </div>
  );

  if (id === "search") return (
    <div style={{ height:contentH,display:"flex",alignItems:"center",padding:"0 8px" }}>
      <div style={{ flex:1,height:26,borderRadius:7,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",display:"flex",alignItems:"center",gap:6,padding:"0 8px" }}>
        <Search size={11} color="#64748b" />
        <span style={{ fontSize:10,color:"#475569" }}>Rechercher…</span>
        <span style={{ marginLeft:"auto",fontSize:9,color:"#334155",background:"rgba(255,255,255,0.06)",padding:"1px 4px",borderRadius:4 }}>⌘K</span>
      </div>
    </div>
  );

  if (id === "crate-digger") return (
    <div style={{ height:contentH,overflow:"hidden",padding:"4px 8px",display:"flex",flexDirection:"column",gap:3 }}>
      {["📁 Mes tracks","📁 Achats récents","📁 Mix sets","📁 Samples"].map((f,i)=>(
        <div key={i} style={{ fontSize:10,color:i===0?"#f97316":"#64748b",padding:"3px 4px",borderRadius:4,background:i===0?"rgba(249,115,22,0.1)":"transparent" }}>{f}</div>
      ))}
    </div>
  );

  if (id === "tab-info") return (
    <div style={{ height:contentH,overflow:"hidden",padding:"4px 8px",display:"flex",flexDirection:"column",gap:5 }}>
      {[{k:"Titre",v:"Acid Rain"},{k:"Artiste",v:"Unknown Artist"},{k:"Album",v:"—"},{k:"Genre",v:"Techno"}].map(({k,v})=>(
        <div key={k} style={{ display:"flex",gap:6 }}>
          <span style={{ fontSize:9,color:"#475569",width:40,flexShrink:0 }}>{k}</span>
          <span style={{ fontSize:10,color:"#94a3b8" }}>{v}</span>
        </div>
      ))}
    </div>
  );

  if (id === "auto-analyse") return (
    <div style={{ height:contentH,display:"flex",alignItems:"center",justifyContent:"center",gap:8 }}>
      <div style={{ width:36,height:20,borderRadius:10,background:"rgba(34,197,94,0.25)",border:"1.5px solid rgba(34,197,94,0.5)",position:"relative" }}>
        <div style={{ position:"absolute",right:3,top:3,width:14,height:14,borderRadius:"50%",background:"#22c55e" }} />
      </div>
      <span style={{ fontSize:10,color:"#22c55e",fontWeight:600 }}>ON</span>
    </div>
  );

  const def = DEF_MAP[id];
  if (!def) return null;
  const Icon = def.icon;
  return (
    <div style={{ height:contentH,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:6 }}>
      <Icon size={20} color={def.color+"88"} />
      <span style={{ fontSize:9,color:"#334155" }}>{def.label}</span>
    </div>
  );
}

// ─── Resize handles ──────────────────────────────────────────────────────────
const RESIZE_HANDLES: { dir: ResizeEdge; style: React.CSSProperties; cursor: string }[] = [
  { dir:"n",  cursor:"ns-resize",   style:{ top:-4,    left:12,    right:12,   height:HANDLE_SZ } },
  { dir:"s",  cursor:"ns-resize",   style:{ bottom:-4, left:12,    right:12,   height:HANDLE_SZ } },
  { dir:"e",  cursor:"ew-resize",   style:{ right:-4,  top:12,     bottom:12,  width:HANDLE_SZ  } },
  { dir:"w",  cursor:"ew-resize",   style:{ left:-4,   top:12,     bottom:12,  width:HANDLE_SZ  } },
  { dir:"nw", cursor:"nwse-resize", style:{ top:-4,    left:-4,    width:12,   height:12 } },
  { dir:"ne", cursor:"nesw-resize", style:{ top:-4,    right:-4,   width:12,   height:12 } },
  { dir:"se", cursor:"nwse-resize", style:{ bottom:-4, right:-4,   width:12,   height:12 } },
  { dir:"sw", cursor:"nesw-resize", style:{ bottom:-4, left:-4,    width:12,   height:12 } },
];

// ─── Module card ─────────────────────────────────────────────────────────────
function ModCard({
  mod, isSelected, onPointerDownMove, onPointerDownResize, onSelect, maxZ,
}: {
  mod: Mod; isSelected: boolean; maxZ: number;
  onPointerDownMove: (e: React.PointerEvent, id:string) => void;
  onPointerDownResize: (e: React.PointerEvent, id:string, dir:ResizeEdge) => void;
  onSelect: (id:string) => void;
}) {
  const def = DEF_MAP[mod.id];
  if (!def) return null;
  const Icon = def.icon;

  return (
    <div
      style={{
        position:"absolute", left:mod.x, top:mod.y, width:mod.w, height:mod.h,
        zIndex: isSelected ? maxZ + 1 : mod.z,
        outline: isSelected ? `2px solid ${def.color}88` : "2px solid transparent",
        outlineOffset: 2,
        borderRadius: 10,
        transition: "outline 0.1s",
        opacity: mod.locked ? 0.7 : 1,
      }}
      onPointerDown={(e) => { e.stopPropagation(); onSelect(mod.id); }}
    >
      <div style={{
        width:"100%", height:"100%", borderRadius:10,
        background: "rgba(10,10,22,0.88)",
        border: `1.5px solid ${isSelected ? def.color+"44" : "rgba(255,255,255,0.08)"}`,
        backdropFilter:"blur(8px)",
        overflow:"hidden",
        display:"flex", flexDirection:"column",
        boxShadow: isSelected
          ? `0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px ${def.color}22`
          : "0 4px 16px rgba(0,0,0,0.4)",
      }}>
        {/* Header */}
        <div
          onPointerDown={(e) => { e.stopPropagation(); if (!mod.locked) onPointerDownMove(e, mod.id); }}
          style={{
            height:32, flexShrink:0,
            background: isSelected ? `${def.color}12` : "rgba(255,255,255,0.04)",
            borderBottom:"1px solid rgba(255,255,255,0.06)",
            display:"flex", alignItems:"center", gap:7, padding:"0 8px",
            cursor: mod.locked ? "not-allowed" : "grab", userSelect:"none",
          }}
        >
          {mod.locked
            ? <Lock size={10} color="#f59e0b" style={{ flexShrink:0 }} />
            : <GripVertical size={11} color="rgba(255,255,255,0.2)" style={{ flexShrink:0 }} />}
          <div style={{ width:20,height:20,borderRadius:5,background:`${def.color}22`,border:`1.5px solid ${def.color}44`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
            <Icon size={11} color={def.color} />
          </div>
          <span style={{ fontSize:10,fontWeight:700,color:"#e2e8f0",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{def.label}</span>
        </div>
        {mod.open && mod.h > 36 && (
          <div style={{ flex:1,overflow:"hidden" }}>
            <ModContent id={mod.id} h={mod.h} />
          </div>
        )}
      </div>

      {/* Resize handles */}
      {isSelected && !mod.locked && RESIZE_HANDLES.map(({ dir, style, cursor }) => (
        <div
          key={dir}
          onPointerDown={(e) => { e.stopPropagation(); onPointerDownResize(e, mod.id, dir); }}
          style={{ position:"absolute", ...style, cursor, background:def.color, borderRadius:3, border:`1px solid ${def.color}`, zIndex:20, opacity:0.8 }}
        />
      ))}
    </div>
  );
}

// ─── Background grid ─────────────────────────────────────────────────────────
function BgGrid() {
  return (
    <svg style={{ position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:0,opacity:0.25 }}>
      <defs>
        <pattern id="grid8" width={GRID*4} height={GRID*4} patternUnits="userSpaceOnUse">
          <path d={`M ${GRID*4} 0 L 0 0 0 ${GRID*4}`} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5"/>
        </pattern>
        <pattern id="grid64" width={GRID*8} height={GRID*8} patternUnits="userSpaceOnUse">
          <rect width={GRID*8} height={GRID*8} fill="url(#grid8)"/>
          <path d={`M ${GRID*8} 0 L 0 0 0 ${GRID*8}`} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid64)"/>
    </svg>
  );
}

// ─── Snap line overlay ───────────────────────────────────────────────────────
function SnapLineOverlay({ lines }: { lines: SnapLine[] }) {
  return (
    <>
      {lines.map((l, i) => (
        <div key={i} style={{
          position:"absolute",
          ...(l.axis === "x"
            ? { left: l.pos, top: 0, width: 1, height: "100%" }
            : { top: l.pos, left: 0, height: 1, width: "100%" }),
          background: "#ec4899",
          opacity: 0.6,
          pointerEvents: "none",
          zIndex: 999,
        }} />
      ))}
    </>
  );
}

// ─── Properties Panel ────────────────────────────────────────────────────────
function PropertiesPanel({
  mod, def, onUpdate, onToggleOpen, onRemove, onDuplicate, onToggleLock, onClose,
}: {
  mod: Mod; def: ModDef;
  onUpdate: (updates: Partial<Mod>) => void;
  onToggleOpen: () => void; onRemove: () => void;
  onDuplicate: () => void; onToggleLock: () => void; onClose: () => void;
}) {
  const Icon = def.icon;
  return (
    <div style={{ width:260, borderLeft:"1px solid rgba(255,255,255,0.07)", background:"rgba(0,0,0,0.5)", backdropFilter:"blur(12px)", display:"flex", flexDirection:"column", overflow:"hidden", flexShrink:0 }}>
      {/* Header */}
      <div style={{ padding:"12px 14px", borderBottom:"1px solid rgba(255,255,255,0.07)", display:"flex", alignItems:"center", gap:8 }}>
        <div style={{ width:28,height:28,borderRadius:7,background:`${def.color}22`,border:`1.5px solid ${def.color}44`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
          <Icon size={14} color={def.color} />
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:12,fontWeight:700,color:"#f1f5f9" }}>{def.label}</div>
          <div style={{ fontSize:9,color:"#475569" }}>{def.category}</div>
        </div>
        <button onClick={onClose} style={{ background:"none",border:"none",cursor:"pointer",color:"#475569",lineHeight:0 }}><X size={14}/></button>
      </div>

      {/* Position / Size */}
      <div style={{ padding:"14px", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10,display:"flex",alignItems:"center",gap:5 }}>
          <Move size={10}/> Position & Taille
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {([["X","x"],["Y","y"],["W","w"],["H","h"]] as const).map(([label,key])=>(
            <div key={key}>
              <label style={{ fontSize:9,color:"#475569",marginBottom:3,display:"block" }}>{label}</label>
              <input
                type="number"
                value={mod[key]}
                onChange={e => {
                  const v = parseInt(e.target.value) || 0;
                  onUpdate({ [key]: sg(v) });
                }}
                step={GRID}
                style={{ width:"100%",padding:"5px 8px",borderRadius:6,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:"#e2e8f0",fontSize:11,fontVariantNumeric:"tabular-nums",outline:"none" }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Display */}
      <div style={{ padding:"14px", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10,display:"flex",alignItems:"center",gap:5 }}>
          <Layers size={10}/> Affichage
        </div>
        <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
            <span style={{ fontSize:11,color:"#94a3b8" }}>Z-index</span>
            <input
              type="number"
              value={mod.z}
              onChange={e => onUpdate({ z: parseInt(e.target.value) || 1 })}
              style={{ width:60,padding:"4px 8px",borderRadius:5,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:"#e2e8f0",fontSize:11,textAlign:"center",outline:"none" }}
            />
          </div>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
            <span style={{ fontSize:11,color:"#94a3b8" }}>Contenu visible</span>
            <button onClick={onToggleOpen} style={{
              width:40,height:22,borderRadius:11,border:"none",cursor:"pointer",position:"relative",
              background:mod.open?"rgba(34,197,94,0.3)":"rgba(255,255,255,0.1)",
              transition:"background 0.2s",
            }}>
              <div style={{
                width:16,height:16,borderRadius:"50%",position:"absolute",top:3,
                left:mod.open?21:3,background:mod.open?"#22c55e":"#475569",
                transition:"left 0.2s",
              }} />
            </button>
          </div>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
            <span style={{ fontSize:11,color:"#94a3b8" }}>Verrouillé</span>
            <button onClick={onToggleLock} style={{
              width:40,height:22,borderRadius:11,border:"none",cursor:"pointer",position:"relative",
              background:mod.locked?"rgba(245,158,11,0.3)":"rgba(255,255,255,0.1)",
              transition:"background 0.2s",
            }}>
              <div style={{
                width:16,height:16,borderRadius:"50%",position:"absolute",top:3,
                left:mod.locked?21:3,background:mod.locked?"#f59e0b":"#475569",
                transition:"left 0.2s",
              }} />
            </button>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ padding:"14px", display:"flex", flexDirection:"column", gap:6 }}>
        <button onClick={onDuplicate} style={{ display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderRadius:7,background:"rgba(59,130,246,0.1)",border:"1px solid rgba(59,130,246,0.2)",color:"#3b82f6",fontSize:11,fontWeight:600,cursor:"pointer",width:"100%" }}>
          <Copy size={12}/> Dupliquer
        </button>
        <button onClick={onRemove} style={{ display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderRadius:7,background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",color:"#ef4444",fontSize:11,fontWeight:600,cursor:"pointer",width:"100%" }}>
          <Trash2 size={12}/> Retirer du canvas
        </button>
      </div>
    </div>
  );
}

// ─── Left Sidebar (Module Palette) ───────────────────────────────────────────
function ModulePalette({
  mods, searchQuery, setSearchQuery, expandedCats, toggleCat, addToCanvas,
}: {
  mods: Mod[];
  searchQuery: string; setSearchQuery: (v:string)=>void;
  expandedCats: Set<string>; toggleCat: (id:string)=>void;
  addToCanvas: (id:string)=>void;
}) {
  const offCanvas = useMemo(() => new Set(mods.filter(m => !m.onCanvas).map(m => m.id)), [mods]);
  const onCanvas = useMemo(() => new Set(mods.filter(m => m.onCanvas).map(m => m.id)), [mods]);

  const filteredDefs = useMemo(() => {
    if (!searchQuery.trim()) return DEFS;
    const q = searchQuery.toLowerCase();
    return DEFS.filter(d => d.label.toLowerCase().includes(q) || d.id.toLowerCase().includes(q) || d.category.toLowerCase().includes(q));
  }, [searchQuery]);

  const grouped = useMemo(() => {
    const map: Record<string, ModDef[]> = {};
    for (const d of filteredDefs) {
      if (!map[d.category]) map[d.category] = [];
      map[d.category].push(d);
    }
    return map;
  }, [filteredDefs]);

  return (
    <div style={{ width:240, borderRight:"1px solid rgba(255,255,255,0.07)", background:"rgba(0,0,0,0.5)", backdropFilter:"blur(12px)", display:"flex", flexDirection:"column", overflow:"hidden", flexShrink:0 }}>
      {/* Header */}
      <div style={{ padding:"12px 14px", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ fontSize:12,fontWeight:700,color:"#f1f5f9",marginBottom:10 }}>Modules</div>
        <div style={{ display:"flex",alignItems:"center",gap:6,padding:"0 8px",height:30,borderRadius:7,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)" }}>
          <Search size={12} color="#475569" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Rechercher..."
            style={{ flex:1,background:"none",border:"none",color:"#e2e8f0",fontSize:11,outline:"none" }}
          />
          {searchQuery && <button onClick={()=>setSearchQuery("")} style={{ background:"none",border:"none",cursor:"pointer",color:"#475569",lineHeight:0 }}><X size={11}/></button>}
        </div>
      </div>

      {/* Categories */}
      <div style={{ flex:1,overflowY:"auto",padding:"8px 0" }}>
        {CATEGORIES.map(cat => {
          const items = grouped[cat.id];
          if (!items || items.length === 0) return null;
          const isExpanded = expandedCats.has(cat.id);
          const CatIcon = cat.icon;
          const offCount = items.filter(d => offCanvas.has(d.id)).length;

          return (
            <div key={cat.id} style={{ marginBottom:2 }}>
              <button
                onClick={() => toggleCat(cat.id)}
                style={{ width:"100%",display:"flex",alignItems:"center",gap:8,padding:"7px 14px",background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:11,fontWeight:600,textAlign:"left" }}
              >
                {isExpanded ? <ChevronDown size={11}/> : <ChevronRight size={11}/>}
                <CatIcon size={12}/>
                <span style={{ flex:1 }}>{cat.label}</span>
                {offCount > 0 && <span style={{ fontSize:9,color:"#475569",background:"rgba(255,255,255,0.06)",padding:"1px 5px",borderRadius:8 }}>{offCount}</span>}
              </button>

              {isExpanded && (
                <div style={{ padding:"2px 10px 6px 32px" }}>
                  {items.map(d => {
                    const isOn = onCanvas.has(d.id);
                    const Icon = d.icon;
                    return (
                      <div
                        key={d.id}
                        style={{ display:"flex",alignItems:"center",gap:7,padding:"5px 8px",borderRadius:6,marginBottom:2,cursor:isOn?"default":"pointer",background:isOn?"rgba(255,255,255,0.02)":"transparent",opacity:isOn?0.5:1,transition:"all 0.15s" }}
                        onClick={() => !isOn && addToCanvas(d.id)}
                        onMouseEnter={e => { if(!isOn) (e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.06)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background=isOn?"rgba(255,255,255,0.02)":"transparent"; }}
                      >
                        <div style={{ width:22,height:22,borderRadius:5,background:`${d.color}18`,border:`1px solid ${d.color}33`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                          <Icon size={11} color={d.color} />
                        </div>
                        <span style={{ fontSize:10,color:isOn?"#475569":"#94a3b8",flex:1 }}>{d.label}</span>
                        {isOn
                          ? <Check size={10} color="#22c55e"/>
                          : <Plus size={10} color="#475569"/>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Stats */}
      <div style={{ padding:"10px 14px", borderTop:"1px solid rgba(255,255,255,0.07)", fontSize:9, color:"#334155" }}>
        {mods.filter(m=>m.onCanvas).length} / {DEFS.length} modules actifs
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function LayoutBuilderPage() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [mods, setMods] = useState<Mod[]>(loadMods);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [savedBanner, setSavedBanner] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapLines, setSnapLines] = useState<SnapLine[]>([]);
  const [zoom, setZoom] = useState(1);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(["toolbar","player","library"]));
  const [showPresets, setShowPresets] = useState(false);

  // Undo/redo
  const [undoStack, setUndoStack] = useState<Mod[][]>([]);
  const [redoStack, setRedoStack] = useState<Mod[][]>([]);

  const modsRef = useRef(mods);
  useEffect(() => { modsRef.current = mods; }, [mods]);

  const maxZ = Math.max(...mods.map(m => m.z), 1);

  const pushUndo = useCallback((prev: Mod[]) => {
    setUndoStack(s => [...s.slice(-MAX_UNDO), prev]);
    setRedoStack([]);
  }, []);

  const undo = useCallback(() => {
    setUndoStack(s => {
      if (s.length === 0) return s;
      const prev = s[s.length - 1];
      setRedoStack(r => [...r, modsRef.current]);
      setMods(prev);
      saveMods(prev);
      return s.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack(s => {
      if (s.length === 0) return s;
      const next = s[s.length - 1];
      setUndoStack(u => [...u, modsRef.current]);
      setMods(next);
      saveMods(next);
      return s.slice(0, -1);
    });
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selected && document.activeElement?.tagName !== "INPUT") {
          e.preventDefault();
          pushUndo(modsRef.current);
          setMods(p => { const u = p.map(m => m.id === selected ? {...m, onCanvas:false} : m); saveMods(u); return u; });
          setSelected(null);
        }
      }
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selected, undo, redo, pushUndo]);

  // Drag effect
  useEffect(() => {
    if (!drag) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const px = (e.clientX - rect.left) / zoom;
      const py = (e.clientY - rect.top) / zoom;
      const dx = px - drag.startPx;
      const dy = py - drag.startPy;

      setMods(prev => prev.map(m => {
        if (m.id !== drag.id) return m;
        const { origX:ox, origY:oy, origW:ow, origH:oh } = drag;
        let nx=ox, ny=oy, nw=ow, nh=oh;

        if (drag.mode === "move") {
          nx = sg(ox + dx); ny = sg(oy + dy);
          // Smart snap
          if (snapEnabled) {
            const { lines, snapX, snapY } = calcSnapLines(drag.id, { x:nx, y:ny, w:nw, h:nh }, prev);
            setSnapLines(lines);
            if (snapX !== null) nx = snapX;
            if (snapY !== null) ny = snapY;
          }
        } else {
          const d = drag.mode;
          if (d.includes("e")) { nw = Math.max(MIN_W, sg(ow + dx)); }
          if (d.includes("w")) { const nw2=Math.max(MIN_W,sg(ow-dx)); nx=sg(ox+ow-nw2); nw=nw2; }
          if (d.includes("s")) { nh = Math.max(MIN_H, sg(oh + dy)); }
          if (d.includes("n")) { const nh2=Math.max(MIN_H,sg(oh-dy)); ny=sg(oy+oh-nh2); nh=nh2; }
          setSnapLines([]);
        }
        return { ...m, x:nx, y:ny, w:nw, h:nh };
      }));
    };

    const onUp = () => {
      saveMods(modsRef.current);
      setDrag(null);
      setSnapLines([]);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, snapEnabled, zoom]);

  // Handlers
  const handleMove = useCallback((e: React.PointerEvent, id: string) => {
    e.preventDefault();
    const m = modsRef.current.find(x => x.id === id)!;
    if (m.locked) return;
    pushUndo(modsRef.current);
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    setMods(prev => prev.map(x => x.id===id ? {...x, z: maxZ+1} : x));
    setDrag({ id, mode:"move", startPx:(e.clientX - rect.left)/zoom, startPy:(e.clientY - rect.top)/zoom, origX:m.x, origY:m.y, origW:m.w, origH:m.h });
  }, [maxZ, pushUndo, zoom]);

  const handleResize = useCallback((e: React.PointerEvent, id: string, dir: ResizeEdge) => {
    e.preventDefault();
    const m = modsRef.current.find(x => x.id === id)!;
    if (m.locked) return;
    pushUndo(modsRef.current);
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    setDrag({ id, mode:dir, startPx:(e.clientX - rect.left)/zoom, startPy:(e.clientY - rect.top)/zoom, origX:m.x, origY:m.y, origW:m.w, origH:m.h });
  }, [pushUndo, zoom]);

  const handleSelect = useCallback((id: string) => {
    setSelected(id);
    setShowRightPanel(true);
    setMods(prev => prev.map(m => m.id===id ? {...m, z:maxZ+1} : m));
  }, [maxZ]);

  const toggleOpen = useCallback((id: string) => {
    pushUndo(modsRef.current);
    setMods(prev => { const u=prev.map(m => m.id===id ? {...m, open:!m.open} : m); saveMods(u); return u; });
  }, [pushUndo]);

  const toggleLock = useCallback((id: string) => {
    setMods(prev => { const u=prev.map(m => m.id===id ? {...m, locked:!m.locked} : m); saveMods(u); return u; });
  }, []);

  const removeFromCanvas = useCallback((id: string) => {
    pushUndo(modsRef.current);
    setMods(prev => { const u=prev.map(m => m.id===id ? {...m, onCanvas:false} : m); saveMods(u); return u; });
    setSelected(s => s===id ? null : s);
  }, [pushUndo]);

  const addToCanvas = useCallback((id: string) => {
    pushUndo(modsRef.current);
    const canvas = canvasRef.current;
    const cx = canvas ? (canvas.scrollLeft / zoom) + 250 : 250;
    const cy = canvas ? (canvas.scrollTop / zoom) + 100 : 100;
    setMods(prev => {
      const u = prev.map(m => m.id===id ? {...m, onCanvas:true, x:sg(cx), y:sg(cy), z:maxZ+1, open:true} : m);
      saveMods(u);
      return u;
    });
    setSelected(id);
    setShowRightPanel(true);
  }, [maxZ, pushUndo, zoom]);

  const duplicateModule = useCallback((id: string) => {
    // Can't truly duplicate (unique IDs), but we can offset
    pushUndo(modsRef.current);
    const m = modsRef.current.find(x => x.id === id);
    if (!m) return;
    setMods(prev => {
      const u = prev.map(x => x.id === id ? {...x, x: x.x + 24, y: x.y + 24} : x);
      saveMods(u);
      return u;
    });
  }, [pushUndo]);

  const updateMod = useCallback((id: string, updates: Partial<Mod>) => {
    pushUndo(modsRef.current);
    setMods(prev => { const u = prev.map(m => m.id===id ? {...m, ...updates} : m); saveMods(u); return u; });
  }, [pushUndo]);

  const handleSave = () => {
    saveMods(mods);
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 2500);
  };

  const handleReset = () => {
    pushUndo(mods);
    const d = makeDefault();
    setMods(d);
    saveMods(d);
    setSelected(null);
  };

  const handleApplyPreset = (presetId: string) => {
    pushUndo(mods);
    const p = applyPreset(presetId);
    setMods(p);
    saveMods(p);
    setSelected(null);
    setShowPresets(false);
  };

  const toggleCat = useCallback((id: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const onCanvas = mods.filter(m => m.onCanvas);
  const selectedMod = selected ? mods.find(m => m.id === selected) : null;
  const selectedDef = selected ? DEF_MAP[selected] : null;

  return (
    <div style={{ height:"100vh", display:"flex", flexDirection:"column", background:"#04040b", color:"#e2e8f0", fontFamily:"system-ui,-apple-system,sans-serif", overflow:"hidden", cursor: drag?.mode==="move" ? "grabbing" : "default" }}>

      {/* Header */}
      <div style={{ padding:"8px 16px", borderBottom:"1px solid rgba(255,255,255,0.07)", background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", gap:10, flexShrink:0, backdropFilter:"blur(12px)", zIndex:100 }}>
        <Link href="/admin" style={{ display:"flex",alignItems:"center",gap:4,color:"#64748b",textDecoration:"none",fontSize:11 }}>
          <ChevronLeft size={12}/> Admin
        </Link>
        <div style={{ width:1,height:12,background:"rgba(255,255,255,0.1)" }}/>
        <LayoutDashboard size={14} color="#3b82f6"/>
        <div>
          <div style={{ fontSize:13,fontWeight:700,color:"#f1f5f9",lineHeight:1.2 }}>Layout Builder</div>
          <div style={{ fontSize:9,color:"#334155" }}>Glisser · Redimensionner · Clic pour sélectionner · ⌘Z annuler</div>
        </div>

        {/* Toggle panels */}
        <div style={{ display:"flex",gap:4,marginLeft:10 }}>
          <button onClick={()=>setShowLeftPanel(p=>!p)} title="Palette" style={{ padding:"4px 8px",borderRadius:6,background:showLeftPanel?"rgba(59,130,246,0.15)":"rgba(255,255,255,0.04)",border:`1px solid ${showLeftPanel?"rgba(59,130,246,0.3)":"rgba(255,255,255,0.1)"}`,color:showLeftPanel?"#3b82f6":"#64748b",fontSize:10,cursor:"pointer",display:"flex",alignItems:"center",gap:4,lineHeight:0 }}>
            <PanelLeftClose size={11}/>
          </button>
          <button onClick={()=>setShowRightPanel(p=>!p)} title="Propriétés" style={{ padding:"4px 8px",borderRadius:6,background:showRightPanel?"rgba(59,130,246,0.15)":"rgba(255,255,255,0.04)",border:`1px solid ${showRightPanel?"rgba(59,130,246,0.3)":"rgba(255,255,255,0.1)"}`,color:showRightPanel?"#3b82f6":"#64748b",fontSize:10,cursor:"pointer",display:"flex",alignItems:"center",gap:4,lineHeight:0 }}>
            <PanelRightClose size={11}/>
          </button>
        </div>

        {/* Snap toggle */}
        <button onClick={()=>setSnapEnabled(p=>!p)} title="Smart guides" style={{ padding:"4px 8px",borderRadius:6,background:snapEnabled?"rgba(236,72,153,0.15)":"rgba(255,255,255,0.04)",border:`1px solid ${snapEnabled?"rgba(236,72,153,0.3)":"rgba(255,255,255,0.1)"}`,color:snapEnabled?"#ec4899":"#64748b",fontSize:10,cursor:"pointer",display:"flex",alignItems:"center",gap:4 }}>
          <Magnet size={11}/> Snap
        </button>

        {/* Zoom */}
        <div style={{ display:"flex",alignItems:"center",gap:4 }}>
          <button onClick={()=>setZoom(z=>Math.max(0.5,z-0.1))} style={{ padding:"3px 6px",borderRadius:5,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",color:"#64748b",cursor:"pointer",lineHeight:0 }}><ZoomOut size={12}/></button>
          <span style={{ fontSize:10,color:"#64748b",fontVariantNumeric:"tabular-nums",minWidth:36,textAlign:"center" }}>{Math.round(zoom*100)}%</span>
          <button onClick={()=>setZoom(z=>Math.min(2,z+0.1))} style={{ padding:"3px 6px",borderRadius:5,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",color:"#64748b",cursor:"pointer",lineHeight:0 }}><ZoomIn size={12}/></button>
          <button onClick={()=>setZoom(1)} style={{ padding:"3px 6px",borderRadius:5,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",color:"#475569",cursor:"pointer",fontSize:9 }}>1:1</button>
        </div>

        {/* Undo / Redo */}
        <div style={{ display:"flex",gap:3 }}>
          <button onClick={undo} disabled={undoStack.length===0} style={{ padding:"4px 7px",borderRadius:5,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",color:undoStack.length>0?"#94a3b8":"#1e1e30",cursor:undoStack.length>0?"pointer":"default",lineHeight:0 }}><Undo2 size={12}/></button>
          <button onClick={redo} disabled={redoStack.length===0} style={{ padding:"4px 7px",borderRadius:5,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",color:redoStack.length>0?"#94a3b8":"#1e1e30",cursor:redoStack.length>0?"pointer":"default",lineHeight:0 }}><Redo2 size={12}/></button>
        </div>

        {/* Presets */}
        <div style={{ position:"relative" }}>
          <button onClick={()=>setShowPresets(p=>!p)} style={{ display:"flex",alignItems:"center",gap:4,padding:"4px 9px",borderRadius:6,background:showPresets?"rgba(168,85,247,0.15)":"rgba(255,255,255,0.04)",border:`1px solid ${showPresets?"rgba(168,85,247,0.3)":"rgba(255,255,255,0.1)"}`,color:showPresets?"#a855f7":"#64748b",fontSize:10,cursor:"pointer" }}>
            <LayoutTemplate size={11}/> Presets
          </button>
          {showPresets && (
            <div style={{ position:"absolute",top:"100%",left:0,marginTop:6,background:"rgba(10,10,22,0.95)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:8,width:260,zIndex:999,backdropFilter:"blur(20px)",boxShadow:"0 12px 40px rgba(0,0,0,0.8)" }}>
              {PRESETS.map(p => (
                <button key={p.id} onClick={() => handleApplyPreset(p.id)} style={{ width:"100%",padding:"8px 10px",borderRadius:7,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",color:"#e2e8f0",fontSize:11,cursor:"pointer",textAlign:"left",marginBottom:4,display:"block" }}
                  onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.08)"}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.03)"}}
                >
                  <div style={{ fontWeight:700,marginBottom:2 }}>{p.label}</div>
                  <div style={{ fontSize:9,color:"#475569" }}>{p.desc}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginLeft:"auto",display:"flex",gap:7 }}>
          <button onClick={handleReset} style={{ display:"flex",alignItems:"center",gap:4,padding:"5px 10px",borderRadius:6,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",color:"#94a3b8",fontSize:11,cursor:"pointer" }}>
            <RotateCcw size={11}/> Reset
          </button>
          <button onClick={handleSave} style={{ display:"flex",alignItems:"center",gap:5,padding:"6px 14px",borderRadius:7,fontWeight:700,fontSize:11,cursor:"pointer",transition:"all 0.2s",background:savedBanner?"rgba(34,197,94,0.2)":"linear-gradient(135deg,#2563eb,#7c3aed)",border:savedBanner?"1px solid #22c55e66":"1px solid transparent",color:savedBanner?"#22c55e":"white",boxShadow:savedBanner?"none":"0 2px 12px rgba(37,99,235,0.4)" }}>
            {savedBanner ? <><Check size={12}/> Sauvegardé !</> : <><MonitorPlay size={12}/> Mettre en prod</>}
          </button>
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

        {/* Left Panel */}
        {showLeftPanel && (
          <ModulePalette
            mods={mods}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            expandedCats={expandedCats}
            toggleCat={toggleCat}
            addToCanvas={addToCanvas}
          />
        )}

        {/* Canvas */}
        <div
          ref={canvasRef}
          style={{ flex:1,overflow:"auto",position:"relative",background:"#05050e" }}
          onPointerDown={(e) => { if (e.target === canvasRef.current || (e.target as HTMLElement).hasAttribute("data-canvas")) setSelected(null); }}
          data-canvas="1"
        >
          <div style={{ position:"relative",minWidth:1400*zoom,minHeight:760*zoom,transform:`scale(${zoom})`,transformOrigin:"top left" }} data-canvas="1">
            <BgGrid/>

            {/* Zone hints */}
            <div style={{ position:"absolute",left:0,top:0,width:"100%",height:48,background:"rgba(59,130,246,0.03)",borderBottom:"1px dashed rgba(59,130,246,0.1)",pointerEvents:"none",zIndex:0 }}>
              <span style={{ position:"absolute",left:8,top:16,fontSize:8,color:"rgba(59,130,246,0.2)",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase" }}>Topbar</span>
            </div>
            <div style={{ position:"absolute",left:0,top:48,width:200,bottom:0,background:"rgba(168,85,247,0.02)",borderRight:"1px dashed rgba(168,85,247,0.08)",pointerEvents:"none",zIndex:0 }}>
              <span style={{ position:"absolute",left:8,top:12,fontSize:8,color:"rgba(168,85,247,0.2)",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase" }}>Sidebar</span>
            </div>
            <div style={{ position:"absolute",right:0,top:48,width:240,bottom:0,background:"rgba(6,182,212,0.02)",borderLeft:"1px dashed rgba(6,182,212,0.08)",pointerEvents:"none",zIndex:0 }}>
              <span style={{ position:"absolute",right:8,top:12,fontSize:8,color:"rgba(6,182,212,0.2)",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase" }}>Panneau droit</span>
            </div>

            {/* Logo */}
            <div style={{ position:"absolute",left:8,top:10,display:"flex",alignItems:"center",gap:7,pointerEvents:"none",zIndex:1 }}>
              <div style={{ width:26,height:26,borderRadius:7,background:"linear-gradient(135deg,#2563eb,#ec4899)",display:"flex",alignItems:"center",justifyContent:"center" }}>
                <Disc3 size={13} color="white"/>
              </div>
              <span style={{ fontSize:14,fontWeight:700,color:"rgba(255,255,255,0.5)" }}>CueForge</span>
            </div>

            {/* Snap lines */}
            {snapLines.length > 0 && <SnapLineOverlay lines={snapLines} />}

            {/* Modules */}
            {onCanvas.map(mod => (
              <ModCard
                key={mod.id} mod={mod}
                isSelected={selected === mod.id}
                maxZ={maxZ}
                onPointerDownMove={handleMove}
                onPointerDownResize={handleResize}
                onSelect={handleSelect}
              />
            ))}
          </div>
        </div>

        {/* Right Panel - Properties */}
        {showRightPanel && selectedMod && selectedDef && (
          <PropertiesPanel
            mod={selectedMod}
            def={selectedDef}
            onUpdate={(updates) => updateMod(selectedMod.id, updates)}
            onToggleOpen={() => toggleOpen(selectedMod.id)}
            onRemove={() => removeFromCanvas(selectedMod.id)}
            onDuplicate={() => duplicateModule(selectedMod.id)}
            onToggleLock={() => toggleLock(selectedMod.id)}
            onClose={() => setSelected(null)}
          />
        )}

        {/* Empty right panel */}
        {showRightPanel && !selectedMod && (
          <div style={{ width:260, borderLeft:"1px solid rgba(255,255,255,0.07)", background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <div style={{ textAlign:"center",padding:20 }}>
              <Crosshair size={24} color="#1e1e30" style={{ marginBottom:8 }}/>
              <div style={{ fontSize:11,color:"#334155" }}>Sélectionnez un module<br/>pour voir ses propriétés</div>
            </div>
          </div>
        )}
      </div>

      {/* Keyboard shortcuts hint */}
      <div style={{ padding:"4px 16px", borderTop:"1px solid rgba(255,255,255,0.05)", background:"rgba(0,0,0,0.3)", display:"flex", alignItems:"center", gap:16, fontSize:9, color:"#1e293b", flexShrink:0 }}>
        <span><kbd style={{ padding:"1px 4px",borderRadius:3,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.08)",fontSize:9 }}>⌘Z</kbd> Annuler</span>
        <span><kbd style={{ padding:"1px 4px",borderRadius:3,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.08)",fontSize:9 }}>⌘⇧Z</kbd> Refaire</span>
        <span><kbd style={{ padding:"1px 4px",borderRadius:3,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.08)",fontSize:9 }}>Suppr</kbd> Retirer</span>
        <span><kbd style={{ padding:"1px 4px",borderRadius:3,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.08)",fontSize:9 }}>Esc</kbd> Désélectionner</span>
        <span style={{ marginLeft:"auto" }}>{onCanvas.length} modules sur le canvas</span>
      </div>
    </div>
  );
}
