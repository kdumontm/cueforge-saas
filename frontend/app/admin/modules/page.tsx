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
  AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter,
  AlignStartVertical, AlignEndVertical, AlignStartHorizontal, AlignEndHorizontal,
  AlignHorizontalSpaceAround, AlignVerticalSpaceAround,
  Save, FolderOpen as FolderIcon, MoreHorizontal, Grip, ChevronUp,
} from "lucide-react";
import Link from "next/link";

// ─── Constants ───────────────────────────────────────────────────────────────
const GRID = 8;
const MIN_W = 80;
const MIN_H = 36;
const HANDLE_SZ = 8;
const STORAGE_KEY = "cueforge_layout_v5";
const LAYOUTS_KEY = "cueforge_saved_layouts";
const MAX_UNDO = 50;

// ─── Types ───────────────────────────────────────────────────────────────────
type ResizeEdge = "n"|"ne"|"e"|"se"|"s"|"sw"|"w"|"nw";
type RightTab = "properties" | "layers";
interface ModDef { id:string; label:string; icon:React.ElementType; color:string; category:string; desc?:string; }
interface Mod {
  id:string; x:number; y:number; w:number; h:number;
  z:number; open:boolean; onCanvas:boolean; locked:boolean;
  opacity?:number;
}
interface DragState {
  id:string; mode:"move"|ResizeEdge;
  startPx:number; startPy:number;
  origX:number; origY:number; origW:number; origH:number;
  multiOffsets?: Array<{id:string;dx:number;dy:number}>;
}
interface SnapLine { axis:"x"|"y"; pos:number; }
interface SavedLayout { id:string; name:string; mods:Mod[]; date:string; }
interface ContextMenu { x:number; y:number; modId:string|null; }

// ─── Categories ──────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id:"toolbar",    label:"Barre d'outils",  icon:Layers },
  { id:"player",     label:"Lecteur",          icon:Play },
  { id:"library",    label:"Bibliothèque",     icon:Library },
  { id:"analysis",   label:"Analyse",          icon:BarChart2 },
  { id:"navigation", label:"Navigation",       icon:FolderOpen },
  { id:"tools",      label:"Outils avancés",   icon:Wand2 },
];

// ─── Module definitions ──────────────────────────────────────────────────────
const DEFS: ModDef[] = [
  { id:"auto-analyse",    label:"Auto-analyse",    icon:ToggleLeft,   color:"#22c55e", category:"toolbar", desc:"Active l'analyse auto à l'import" },
  { id:"import",          label:"Import",           icon:Upload,       color:"#3b82f6", category:"toolbar", desc:"Importer des fichiers audio" },
  { id:"export",          label:"Export",           icon:Download,     color:"#06b6d4", category:"toolbar", desc:"Exporter playlists et données" },
  { id:"search",          label:"Recherche",        icon:Search,       color:"#a855f7", category:"toolbar", desc:"Barre de recherche globale" },
  { id:"notifications",   label:"Notifs",           icon:Bell,         color:"#f59e0b", category:"toolbar", desc:"Centre de notifications" },
  { id:"theme",           label:"Thème",            icon:Sun,          color:"#eab308", category:"toolbar", desc:"Toggle dark/light mode" },
  { id:"batch-actions",   label:"Actions groupées", icon:CheckSquare,  color:"#f59e0b", category:"toolbar", desc:"Sélection multiple + actions" },
  { id:"view-list",       label:"Vue Liste",        icon:AlignJustify, color:"#6366f1", category:"toolbar", desc:"Affichage en liste" },
  { id:"view-grid",       label:"Vue Grille",       icon:Grid2x2,      color:"#6366f1", category:"toolbar", desc:"Affichage en grille" },
  { id:"refresh-library", label:"Rafraîchir",       icon:RefreshCw,    color:"#22c55e", category:"toolbar", desc:"Rafraîchir la bibliothèque" },
  { id:"track-player",    label:"Waveform",         icon:Disc3,        color:"#6366f1", category:"player", desc:"Affichage de la waveform" },
  { id:"controls-bar",    label:"Contrôles player", icon:Play,         color:"#22c55e", category:"player", desc:"Play, pause, skip, loop…" },
  { id:"play-pause",      label:"Lecture / Pause",  icon:Play,         color:"#22c55e", category:"player", desc:"Bouton play/pause seul" },
  { id:"prev-track",      label:"Track préc.",      icon:SkipBack,     color:"#6366f1", category:"player", desc:"Piste précédente" },
  { id:"next-track",      label:"Track suiv.",      icon:SkipForward,  color:"#6366f1", category:"player", desc:"Piste suivante" },
  { id:"loop-in",         label:"Loop IN",          icon:Crosshair,    color:"#ec4899", category:"player", desc:"Point d'entrée de boucle" },
  { id:"loop-out",        label:"Loop OUT",         icon:Crosshair,    color:"#ec4899", category:"player", desc:"Point de sortie de boucle" },
  { id:"loop-toggle",     label:"Loop actif",       icon:Repeat,       color:"#f43f5e", category:"player", desc:"Activer/désactiver le loop" },
  { id:"playback-rate",   label:"Vitesse",          icon:Gauge,        color:"#8b5cf6", category:"player", desc:"Contrôle vitesse lecture" },
  { id:"zoom-waveform",   label:"Zoom wave",        icon:ZoomIn,       color:"#06b6d4", category:"player", desc:"Zoom sur la waveform" },
  { id:"volume",          label:"Volume",           icon:Volume2,      color:"#10b981", category:"player", desc:"Contrôle du volume" },
  { id:"tap-tempo",       label:"Tap Tempo",        icon:Clock,        color:"#f97316", category:"player", desc:"Tap pour détecter le BPM" },
  { id:"track-list",      label:"Liste des tracks", icon:AlignJustify, color:"#475569", category:"library", desc:"Table de tracks avec colonnes" },
  { id:"filter-panel",    label:"Filtres",          icon:Filter,       color:"#3b82f6", category:"library", desc:"Filtres BPM, tonalité, énergie" },
  { id:"crate-digger",    label:"Crate Digger",     icon:FolderOpen,   color:"#f97316", category:"library", desc:"Navigation par dossiers" },
  { id:"favorites",       label:"Favoris",          icon:Star,         color:"#eab308", category:"library", desc:"Tracks favorites" },
  { id:"stats-library",   label:"Stats lib.",       icon:BarChart2,    color:"#64748b", category:"library", desc:"Statistiques bibliothèque" },
  { id:"settings-link",   label:"Réglages",         icon:Settings,     color:"#94a3b8", category:"library", desc:"Lien vers les réglages" },
  { id:"tab-playlists",   label:"Playlists",        icon:BookOpen,     color:"#a855f7", category:"library", desc:"Gestion des playlists" },
  { id:"bpm-display",     label:"BPM",              icon:Music,        color:"#f97316", category:"analysis", desc:"Affichage BPM en grand" },
  { id:"key-display",     label:"Tonalité",         icon:Hash,         color:"#10b981", category:"analysis", desc:"Affichage clé musicale" },
  { id:"tab-cues",        label:"Cue Points",       icon:ListMusic,    color:"#14b8a6", category:"analysis", desc:"Hot cues et markers" },
  { id:"tab-eq",          label:"EQ",               icon:Sliders,      color:"#8b5cf6", category:"analysis", desc:"Égaliseur 3 bandes" },
  { id:"tab-beatgrid",    label:"BeatGrid",         icon:ScanLine,     color:"#f59e0b", category:"analysis", desc:"Grille de tempo" },
  { id:"tab-mix",         label:"Mix",              icon:Waves,        color:"#06b6d4", category:"analysis", desc:"Suggestions de mix" },
  { id:"tab-stems",       label:"Stems",            icon:Mic2,         color:"#ec4899", category:"analysis", desc:"Séparation de sources" },
  { id:"tab-fx",          label:"FX",               icon:Sparkles,     color:"#f43f5e", category:"analysis", desc:"Effets audio" },
  { id:"tab-info",        label:"Info/Edit",        icon:NotebookPen,  color:"#3b82f6", category:"analysis", desc:"Métadonnées du track" },
  { id:"analyze-badge",   label:"Badge analyser",   icon:AlertCircle,  color:"#f97316", category:"analysis", desc:"Indicateur d'analyse" },
  { id:"tab-history",     label:"Historique",       icon:History,       color:"#64748b", category:"navigation", desc:"Historique de lecture" },
  { id:"gig-prep",        label:"Gig Prep",         icon:Sparkles,     color:"#06b6d4", category:"navigation", desc:"Préparation de set" },
  { id:"set-builder",     label:"Set Builder",      icon:Library,      color:"#14b8a6", category:"navigation", desc:"Construction de set" },
  { id:"harmonic-wheel",  label:"Roue harmo.",      icon:Piano,        color:"#22c55e", category:"tools", desc:"Roue de Camelot" },
  { id:"energy-flow",     label:"Energy Flow",      icon:Flame,        color:"#ef4444", category:"tools", desc:"Courbe d'énergie du set" },
  { id:"bpm-tap",         label:"BPM Tap",          icon:Clock,        color:"#06b6d4", category:"tools", desc:"BPM par tap" },
  { id:"duplicate-finder",label:"Doublons",         icon:GitBranch,    color:"#f59e0b", category:"tools", desc:"Détecter les doublons" },
  { id:"ai-analysis",     label:"Analyse IA",       icon:BrainCircuit, color:"#ec4899", category:"tools", desc:"Analyse IA avancée" },
];
const DEF_MAP = Object.fromEntries(DEFS.map(d => [d.id, d]));

// ─── Size presets ────────────────────────────────────────────────────────────
const SIZE_PRESETS = [
  { label:"S", w:120, h:48 },
  { label:"M", w:200, h:120 },
  { label:"L", w:360, h:200 },
  { label:"XL", w:600, h:320 },
  { label:"Pleine largeur", w:1400, h:200 },
];

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
  const OFF: Mod[] = DEFS.filter(d => !onIds.has(d.id)).map(d => ({ id:d.id, x:0, y:0, w:160, h:56, z:1, open:false, onCanvas:false, locked:false }));
  return [...ON, ...OFF];
}

// ─── Preset layouts ──────────────────────────────────────────────────────────
const BUILTIN_PRESETS = [
  { id:"default", label:"CueForge Standard", desc:"Layout par défaut avec sidebar + waveform + tracklist" },
  { id:"minimal", label:"Minimal DJ", desc:"Uniquement waveform, contrôles et liste" },
  { id:"analysis", label:"Mode Analyse", desc:"Focus sur BPM, tonalité, cues et EQ" },
  { id:"wide", label:"Écran large", desc:"Optimisé pour grands écrans, 3 colonnes" },
];

function applyPreset(presetId: string): Mod[] {
  if (presetId === "default") return makeDefault();
  if (presetId === "minimal") {
    const mods = makeDefault().map(m => ({ ...m, onCanvas:false }));
    const show: Record<string, Partial<Mod>> = {
      "track-player": { x:0, y:0, w:1400, h:200 },
      "controls-bar": { x:0, y:208, w:1400, h:56 },
      "track-list":   { x:0, y:272, w:1100, h:480 },
      "search":       { x:400, y:0, w:600, h:32 },
      "bpm-display":  { x:1108, y:272, w:292, h:200 },
      "key-display":  { x:1108, y:480, w:292, h:200 },
    };
    return mods.map(m => show[m.id] ? { ...m, onCanvas:true, open:true, z:5, ...show[m.id] } : m);
  }
  if (presetId === "analysis") {
    const mods = makeDefault().map(m => ({ ...m, onCanvas:false }));
    const show: Record<string, Partial<Mod>> = {
      "track-player":  { x:0, y:0, w:1400, h:160 },
      "controls-bar":  { x:0, y:168, w:700, h:48 },
      "bpm-display":   { x:0, y:224, w:350, h:160 },
      "key-display":   { x:358, y:224, w:350, h:160 },
      "tab-cues":      { x:0, y:392, w:500, h:360 },
      "tab-eq":        { x:508, y:224, w:450, h:260 },
      "tab-beatgrid":  { x:508, y:492, w:450, h:260 },
      "harmonic-wheel":{ x:716, y:224, w:250, h:260 },
      "tab-info":      { x:966, y:224, w:434, h:260 },
      "tab-stems":     { x:966, y:492, w:434, h:260 },
    };
    return mods.map(m => show[m.id] ? { ...m, onCanvas:true, open:true, z:5, ...show[m.id] } : m);
  }
  return makeDefault();
}

// ─── Persistence ─────────────────────────────────────────────────────────────
function loadMods(): Mod[] {
  if (typeof window === "undefined") return makeDefault();
  try { const s = localStorage.getItem(STORAGE_KEY); if (!s) return makeDefault(); return JSON.parse(s).map((m:any)=>({...m, locked:m.locked??false, opacity:m.opacity??1})); }
  catch { return makeDefault(); }
}
function saveMods(mods: Mod[]) { if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(mods)); }
function loadSavedLayouts(): SavedLayout[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(LAYOUTS_KEY) || "[]"); } catch { return []; }
}
function saveSavedLayouts(layouts: SavedLayout[]) { if (typeof window !== "undefined") localStorage.setItem(LAYOUTS_KEY, JSON.stringify(layouts)); }

// ─── Utils ───────────────────────────────────────────────────────────────────
function sg(v: number) { return Math.round(v / GRID) * GRID; }
const SNAP_T = 6;

function calcSnap(dragId:string, rect:{x:number;y:number;w:number;h:number}, all:Mod[], multiIds:Set<string>): { lines:SnapLine[]; snapX:number|null; snapY:number|null } {
  const lines: SnapLine[] = [];
  let snapX:number|null = null, snapY:number|null = null;
  const dc = { cx:rect.x+rect.w/2, cy:rect.y+rect.h/2, r:rect.x+rect.w, b:rect.y+rect.h };
  for (const m of all) {
    if (m.id === dragId || !m.onCanvas || multiIds.has(m.id)) continue;
    const mc = { cx:m.x+m.w/2, cy:m.y+m.h/2, r:m.x+m.w, b:m.y+m.h };
    for (const [dv,mv] of [[rect.x,m.x],[rect.x,mc.r],[dc.r,m.x],[dc.r,mc.r],[dc.cx,mc.cx]] as [number,number][]) {
      if (Math.abs(dv-mv) < SNAP_T && snapX === null) { snapX = mv-(dv-rect.x); lines.push({axis:"x",pos:mv}); }
    }
    for (const [dv,mv] of [[rect.y,m.y],[rect.y,mc.b],[dc.b,m.y],[dc.b,mc.b],[dc.cy,mc.cy]] as [number,number][]) {
      if (Math.abs(dv-mv) < SNAP_T && snapY === null) { snapY = mv-(dv-rect.y); lines.push({axis:"y",pos:mv}); }
    }
  }
  return { lines, snapX, snapY };
}

// ─── Alignment helpers ───────────────────────────────────────────────────────
function alignMods(mods: Mod[], ids: Set<string>, action: string): Mod[] {
  const sel = mods.filter(m => ids.has(m.id) && m.onCanvas);
  if (sel.length < 2) return mods;
  const minX = Math.min(...sel.map(m=>m.x));
  const maxR = Math.max(...sel.map(m=>m.x+m.w));
  const minY = Math.min(...sel.map(m=>m.y));
  const maxB = Math.max(...sel.map(m=>m.y+m.h));
  const cX = (minX + maxR) / 2;
  const cY = (minY + maxB) / 2;

  return mods.map(m => {
    if (!ids.has(m.id)) return m;
    switch (action) {
      case "left":   return { ...m, x: minX };
      case "right":  return { ...m, x: maxR - m.w };
      case "top":    return { ...m, y: minY };
      case "bottom": return { ...m, y: maxB - m.h };
      case "centerH": return { ...m, x: sg(cX - m.w/2) };
      case "centerV": return { ...m, y: sg(cY - m.h/2) };
      case "sameW":  return { ...m, w: sel[0].w };
      case "sameH":  return { ...m, h: sel[0].h };
      case "distH": {
        const sorted = [...sel].sort((a,b) => a.x - b.x);
        const totalW = sorted.reduce((s,m2) => s+m2.w, 0);
        const gap = (maxR - minX - totalW) / (sorted.length - 1);
        let cx = minX;
        const posMap: Record<string,number> = {};
        for (const s of sorted) { posMap[s.id] = sg(cx); cx += s.w + gap; }
        return posMap[m.id] !== undefined ? { ...m, x: posMap[m.id] } : m;
      }
      case "distV": {
        const sorted = [...sel].sort((a,b) => a.y - b.y);
        const totalH = sorted.reduce((s,m2) => s+m2.h, 0);
        const gap = (maxB - minY - totalH) / (sorted.length - 1);
        let cy = minY;
        const posMap: Record<string,number> = {};
        for (const s of sorted) { posMap[s.id] = sg(cy); cy += s.h + gap; }
        return posMap[m.id] !== undefined ? { ...m, y: posMap[m.id] } : m;
      }
      default: return m;
    }
  });
}

// ─── Module content (rich previews) ──────────────────────────────────────────
function ModContent({ id, h }: { id:string; h:number }) {
  const contentH = Math.max(0, h - 36);

  if (id === "track-player") return (
    <div style={{ height:contentH, overflow:"hidden", padding:"4px 8px" }}>
      <div style={{ height:Math.max(24,contentH*0.35), borderRadius:5, background:"rgba(0,0,0,0.3)", border:"1px solid rgba(255,255,255,0.05)", overflow:"hidden", position:"relative", marginBottom:4 }}>
        {Array.from({length:80}).map((_,i)=>{const bh=14+Math.abs(Math.sin(i*0.6)*14+Math.sin(i*0.2)*8); return <div key={i} style={{position:"absolute",left:`${i/80*100}%`,bottom:"50%",width:"1.1%",height:`${bh}%`,background:i<24?"rgba(99,102,241,0.6)":"rgba(168,85,247,0.42)",transform:"translateY(50%)",borderRadius:1}}/>;})}
        <div style={{position:"absolute",left:"30%",top:0,bottom:0,width:2,background:"#ec4899",opacity:0.9}}/>
      </div>
      {contentH>80&&(<div style={{height:Math.max(24,contentH*0.55),borderRadius:5,background:"rgba(0,0,0,0.3)",border:"1px solid rgba(255,255,255,0.05)",overflow:"hidden",position:"relative"}}>
        {Array.from({length:100}).map((_,i)=>{const bh=10+Math.abs(Math.sin(i*0.38)*24+Math.sin(i*1.1)*14); return <div key={i} style={{position:"absolute",left:`${i}%`,bottom:"50%",width:"0.85%",height:`${bh}%`,background:i<30?"rgba(99,102,241,0.65)":"rgba(168,85,247,0.45)",transform:"translateY(50%)",borderRadius:1}}/>;})}
        <div style={{position:"absolute",left:"30%",top:0,bottom:0,width:2,background:"#ec4899",opacity:0.8}}/>
      </div>)}
    </div>);

  if (id === "controls-bar") return (
    <div style={{height:contentH,display:"flex",alignItems:"center",justifyContent:"center",gap:10,padding:"0 12px"}}>
      {[{I:SkipBack,c:"#6366f1"},{I:Play,c:"#22c55e"},{I:SkipForward,c:"#6366f1"}].map(({I,c},i)=>(<div key={i} style={{width:34,height:34,borderRadius:10,background:`${c}22`,border:`1.5px solid ${c}55`,display:"flex",alignItems:"center",justifyContent:"center"}}><I size={15} color={c}/></div>))}
      <div style={{width:1,height:20,background:"rgba(255,255,255,0.1)"}}/>
      {[{I:Crosshair,c:"#ec4899",l:"IN"},{I:Repeat,c:"#f43f5e",l:"LOOP"},{I:Crosshair,c:"#ec4899",l:"OUT"}].map(({I,c,l},i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",borderRadius:7,background:`${c}15`,border:`1px solid ${c}33`}}><I size={11} color={c}/><span style={{fontSize:9,color:c,fontWeight:700}}>{l}</span></div>))}
    </div>);

  if (id === "track-list") return (
    <div style={{height:contentH,overflow:"hidden",padding:"4px 8px"}}>
      {[{n:"Acid Rain",bpm:128,key:"8A",d:"6:42",a:true},{n:"Solar Drift",bpm:132,key:"6B",d:"7:15"},{n:"Midnight Echo",bpm:124,key:"11A",d:"5:58"},{n:"Deep Signal",bpm:136,key:"3B",d:"8:02"},{n:"Phantom Bass",bpm:140,key:"1A",d:"6:28"},{n:"Techno Loop",bpm:138,key:"5A",d:"7:11"},{n:"Dark Matter",bpm:145,key:"2B",d:"5:44"},{n:"Resonance",bpm:126,key:"9A",d:"6:55"}].map((t,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 6px",borderRadius:5,marginBottom:2,background:t.a?"rgba(99,102,241,0.1)":"transparent",border:t.a?"1px solid rgba(99,102,241,0.2)":"1px solid transparent"}}>
          <Disc3 size={10} color={t.a?"#6366f1":"#334155"} style={{flexShrink:0}}/>
          <span style={{flex:1,fontSize:10,color:t.a?"#e2e8f0":"#64748b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.n}</span>
          <span style={{fontSize:9,color:"#f97316",fontVariantNumeric:"tabular-nums",flexShrink:0}}>{t.bpm}</span>
          <span style={{fontSize:9,color:"#10b981",width:22,textAlign:"right",flexShrink:0}}>{t.key}</span>
          <span style={{fontSize:9,color:"#334155",fontVariantNumeric:"tabular-nums",flexShrink:0}}>{t.d}</span>
        </div>))}
    </div>);

  if (id === "filter-panel") return (
    <div style={{height:contentH,overflow:"hidden",padding:"6px 10px",display:"flex",flexDirection:"column",gap:10}}>
      <div><div style={{fontSize:9,color:"#64748b",fontWeight:600,marginBottom:4}}>BPM</div>
      <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:10,color:"#94a3b8"}}>110</span><div style={{flex:1,height:3,background:"rgba(255,255,255,0.08)",borderRadius:2,position:"relative"}}><div style={{position:"absolute",left:"15%",right:"20%",height:"100%",background:"#3b82f6",borderRadius:2}}/></div><span style={{fontSize:10,color:"#94a3b8"}}>150</span></div></div>
      <div><div style={{fontSize:9,color:"#64748b",fontWeight:600,marginBottom:5}}>Tonalité</div>
      <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{["1A","2A","8A","8B","9A","9B"].map(k=>(<div key={k} style={{padding:"2px 6px",borderRadius:4,background:k==="8A"?"rgba(16,185,129,0.2)":"rgba(255,255,255,0.04)",border:`1px solid ${k==="8A"?"#10b98155":"rgba(255,255,255,0.08)"}`,fontSize:9,color:k==="8A"?"#10b981":"#475569"}}>{k}</div>))}</div></div>
    </div>);

  if (id === "bpm-display") return (<div style={{height:contentH,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}><div style={{fontSize:Math.min(44,contentH-16),fontWeight:800,color:"#f97316",lineHeight:1,fontVariantNumeric:"tabular-nums"}}>128</div><div style={{fontSize:10,color:"#64748b",marginTop:2}}>BPM</div></div>);
  if (id === "key-display") return (<div style={{height:contentH,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}><div style={{fontSize:Math.min(40,contentH-16),fontWeight:800,color:"#10b981",lineHeight:1}}>8A</div><div style={{fontSize:10,color:"#64748b",marginTop:2}}>Do mineur</div></div>);

  if (id === "tab-cues") {
    const cues = [{t:"0:12",p:4,c:"#f43f5e",n:"Intro",k:"I"},{t:"1:04",p:22,c:"#3b82f6",n:"Drop 1",k:"1"},{t:"2:16",p:48,c:"#22c55e",n:"Break",k:"B"},{t:"3:30",p:70,c:"#f59e0b",n:"Drop 2",k:"2"},{t:"4:45",p:92,c:"#a855f7",n:"Outro",k:"O"}];
    return (<div style={{height:contentH,overflow:"hidden",padding:"6px 8px",display:"flex",flexDirection:"column",gap:6}}>
      <div style={{position:"relative",height:28,background:"rgba(255,255,255,0.03)",borderRadius:6,border:"1px solid rgba(255,255,255,0.06)",overflow:"hidden",flexShrink:0}}>
        {cues.map((c,i)=>(<div key={i} style={{position:"absolute",left:`${c.p}%`,top:0,bottom:0,width:2,background:c.c,opacity:0.8}}><div style={{position:"absolute",top:-1,left:-4,width:10,height:10,background:c.c,borderRadius:"50%",border:"2px solid rgba(0,0,0,0.5)"}}/></div>))}
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",gap:3,overflow:"hidden"}}>
        {cues.map((c,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"3px 5px",borderRadius:6,background:`linear-gradient(90deg, ${c.c}12, transparent 70%)`,borderLeft:`2px solid ${c.c}`}}>
          <div style={{width:18,height:18,borderRadius:4,background:`${c.c}25`,border:`1px solid ${c.c}50`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:9,fontWeight:800,color:c.c}}>{c.k}</span></div>
          <span style={{fontSize:10,color:"#e2e8f0",fontVariantNumeric:"tabular-nums",width:30,flexShrink:0}}>{c.t}</span>
          <span style={{fontSize:9,color:"#94a3b8",flex:1}}>{c.n}</span>
        </div>))}
      </div>
    </div>);
  }

  if (id === "tab-eq") return (<div style={{height:contentH,padding:"6px 8px",display:"flex",flexDirection:"column",gap:8}}>{[{l:"LOW",v:0.6,c:"#3b82f6"},{l:"MID",v:0.75,c:"#10b981"},{l:"HIGH",v:0.45,c:"#f97316"}].map(({l,v,c})=>(<div key={l} style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:9,fontWeight:700,color:"#64748b",width:28}}>{l}</span><div style={{flex:1,height:4,background:"rgba(255,255,255,0.07)",borderRadius:2,position:"relative"}}><div style={{position:"absolute",left:0,width:`${v*100}%`,height:"100%",background:c,borderRadius:2}}/></div><span style={{fontSize:9,color:c,width:26,textAlign:"right"}}>{Math.round(v*24-12)}dB</span></div>))}</div>);
  if (id === "harmonic-wheel") return (<div style={{height:contentH,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:Math.min(120,contentH-12),height:Math.min(120,contentH-12),borderRadius:"50%",border:"2px solid rgba(34,197,94,0.3)",background:"conic-gradient(from 0deg, rgba(34,197,94,0.15),rgba(59,130,246,0.15),rgba(168,85,247,0.15),rgba(249,115,22,0.15),rgba(34,197,94,0.15))",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:"55%",height:"55%",borderRadius:"50%",background:"#07070f",border:"1.5px solid rgba(34,197,94,0.4)",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column"}}><span style={{fontSize:11,fontWeight:800,color:"#22c55e"}}>8A</span><span style={{fontSize:8,color:"#64748b"}}>Do min</span></div></div></div>);
  if (id === "search") return (<div style={{height:contentH,display:"flex",alignItems:"center",padding:"0 8px"}}><div style={{flex:1,height:26,borderRadius:7,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",display:"flex",alignItems:"center",gap:6,padding:"0 8px"}}><Search size={11} color="#64748b"/><span style={{fontSize:10,color:"#475569"}}>Rechercher…</span><span style={{marginLeft:"auto",fontSize:9,color:"#334155",background:"rgba(255,255,255,0.06)",padding:"1px 4px",borderRadius:4}}>⌘K</span></div></div>);
  if (id === "crate-digger") return (<div style={{height:contentH,overflow:"hidden",padding:"4px 8px",display:"flex",flexDirection:"column",gap:3}}>{["📁 Mes tracks","📁 Achats récents","📁 Mix sets","📁 Samples"].map((f,i)=>(<div key={i} style={{fontSize:10,color:i===0?"#f97316":"#64748b",padding:"3px 4px",borderRadius:4,background:i===0?"rgba(249,115,22,0.1)":"transparent"}}>{f}</div>))}</div>);
  if (id === "tab-info") return (<div style={{height:contentH,overflow:"hidden",padding:"4px 8px",display:"flex",flexDirection:"column",gap:5}}>{[{k:"Titre",v:"Acid Rain"},{k:"Artiste",v:"Unknown Artist"},{k:"Album",v:"—"},{k:"Genre",v:"Techno"}].map(({k,v})=>(<div key={k} style={{display:"flex",gap:6}}><span style={{fontSize:9,color:"#475569",width:40,flexShrink:0}}>{k}</span><span style={{fontSize:10,color:"#94a3b8"}}>{v}</span></div>))}</div>);
  if (id === "auto-analyse") return (<div style={{height:contentH,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><div style={{width:36,height:20,borderRadius:10,background:"rgba(34,197,94,0.25)",border:"1.5px solid rgba(34,197,94,0.5)",position:"relative"}}><div style={{position:"absolute",right:3,top:3,width:14,height:14,borderRadius:"50%",background:"#22c55e"}}/></div><span style={{fontSize:10,color:"#22c55e",fontWeight:600}}>ON</span></div>);

  const def = DEF_MAP[id];
  if (!def) return null;
  const Icon = def.icon;
  return (<div style={{height:contentH,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:6}}><Icon size={20} color={def.color+"88"}/><span style={{fontSize:9,color:"#334155"}}>{def.label}</span></div>);
}

// ─── Resize handles ──────────────────────────────────────────────────────────
const RH: {dir:ResizeEdge;style:React.CSSProperties;cursor:string}[] = [
  {dir:"n",cursor:"ns-resize",style:{top:-4,left:12,right:12,height:HANDLE_SZ}},
  {dir:"s",cursor:"ns-resize",style:{bottom:-4,left:12,right:12,height:HANDLE_SZ}},
  {dir:"e",cursor:"ew-resize",style:{right:-4,top:12,bottom:12,width:HANDLE_SZ}},
  {dir:"w",cursor:"ew-resize",style:{left:-4,top:12,bottom:12,width:HANDLE_SZ}},
  {dir:"nw",cursor:"nwse-resize",style:{top:-4,left:-4,width:12,height:12}},
  {dir:"ne",cursor:"nesw-resize",style:{top:-4,right:-4,width:12,height:12}},
  {dir:"se",cursor:"nwse-resize",style:{bottom:-4,right:-4,width:12,height:12}},
  {dir:"sw",cursor:"nesw-resize",style:{bottom:-4,left:-4,width:12,height:12}},
];

// ─── Module card on canvas ───────────────────────────────────────────────────
function ModCard({ mod, isSelected, isMulti, onPtrDown, onResizeDown, onSelect, maxZ, onCtxMenu }:
  { mod:Mod; isSelected:boolean; isMulti:boolean; maxZ:number;
    onPtrDown:(e:React.PointerEvent,id:string)=>void;
    onResizeDown:(e:React.PointerEvent,id:string,dir:ResizeEdge)=>void;
    onSelect:(id:string,e:React.PointerEvent)=>void;
    onCtxMenu:(e:React.MouseEvent,id:string)=>void;
}) {
  const def = DEF_MAP[mod.id]; if (!def) return null;
  const Icon = def.icon;
  const borderColor = isMulti ? "#3b82f6" : (isSelected ? def.color+"88" : "transparent");
  return (
    <div style={{ position:"absolute", left:mod.x, top:mod.y, width:mod.w, height:mod.h, zIndex:isSelected?maxZ+1:mod.z, outline:`2px solid ${borderColor}`, outlineOffset:2, borderRadius:10, transition:"outline 0.1s", opacity:mod.opacity??1 }}
      onPointerDown={e=>{e.stopPropagation(); onSelect(mod.id, e);}}
      onContextMenu={e=>{e.preventDefault(); e.stopPropagation(); onCtxMenu(e, mod.id);}}
    >
      <div style={{ width:"100%",height:"100%",borderRadius:10,background:"rgba(10,10,22,0.88)",border:`1.5px solid ${isSelected?def.color+"44":"rgba(255,255,255,0.08)"}`,backdropFilter:"blur(8px)",overflow:"hidden",display:"flex",flexDirection:"column",
        boxShadow:isSelected?`0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px ${def.color}22`:"0 4px 16px rgba(0,0,0,0.4)" }}>
        <div onPointerDown={e=>{e.stopPropagation(); if(!mod.locked) onPtrDown(e,mod.id);}}
          style={{ height:32,flexShrink:0,background:isSelected?`${def.color}12`:"rgba(255,255,255,0.04)",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",gap:7,padding:"0 8px",cursor:mod.locked?"not-allowed":"grab",userSelect:"none" }}>
          {mod.locked?<Lock size={10} color="#f59e0b" style={{flexShrink:0}}/>:<GripVertical size={11} color="rgba(255,255,255,0.2)" style={{flexShrink:0}}/>}
          <div style={{width:20,height:20,borderRadius:5,background:`${def.color}22`,border:`1.5px solid ${def.color}44`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon size={11} color={def.color}/></div>
          <span style={{fontSize:10,fontWeight:700,color:"#e2e8f0",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{def.label}</span>
        </div>
        {mod.open && mod.h > 36 && <div style={{flex:1,overflow:"hidden"}}><ModContent id={mod.id} h={mod.h}/></div>}
      </div>
      {isSelected && !isMulti && !mod.locked && RH.map(({dir,style,cursor})=>(
        <div key={dir} onPointerDown={e=>{e.stopPropagation(); onResizeDown(e,mod.id,dir);}} style={{position:"absolute",...style,cursor,background:def.color,borderRadius:3,border:`1px solid ${def.color}`,zIndex:20,opacity:0.8}}/>
      ))}
    </div>);
}

// ─── Background grid + rulers ────────────────────────────────────────────────
function BgGrid() {
  return (<>
    <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:0,opacity:0.25}}>
      <defs>
        <pattern id="g8" width={32} height={32} patternUnits="userSpaceOnUse"><path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5"/></pattern>
        <pattern id="g64" width={64} height={64} patternUnits="userSpaceOnUse"><rect width={64} height={64} fill="url(#g8)"/><path d="M 64 0 L 0 0 0 64" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5"/></pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#g64)"/>
    </svg>
    {/* Ruler marks */}
    {Array.from({length:20}).map((_,i)=><span key={`rx${i}`} style={{position:"absolute",top:0,left:i*100,fontSize:7,color:"rgba(255,255,255,0.12)",pointerEvents:"none",zIndex:1}}>{i*100}</span>)}
    {Array.from({length:10}).map((_,i)=><span key={`ry${i}`} style={{position:"absolute",left:2,top:i*100,fontSize:7,color:"rgba(255,255,255,0.12)",pointerEvents:"none",zIndex:1,writingMode:"vertical-lr"}}>{i*100}</span>)}
  </>);
}

// ─── Context menu ────────────────────────────────────────────────────────────
function CtxMenu({ menu, onAction, onClose }: { menu:ContextMenu; onAction:(a:string)=>void; onClose:()=>void }) {
  useEffect(() => { const h = () => onClose(); window.addEventListener("pointerdown", h); return ()=>window.removeEventListener("pointerdown",h); }, [onClose]);
  const items = [
    { id:"lock", label:"Verrouiller / Déverrouiller", icon:Lock },
    { id:"open", label:"Ouvrir / Réduire", icon:Maximize2 },
    { id:"front", label:"Premier plan", icon:ChevronUp },
    { id:"back", label:"Arrière-plan", icon:ChevronDown },
    { id:"remove", label:"Retirer du canvas", icon:Trash2, danger:true },
  ];
  return (
    <div style={{ position:"fixed",left:menu.x,top:menu.y,background:"rgba(10,10,22,0.96)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,padding:4,minWidth:200,zIndex:9999,backdropFilter:"blur(20px)",boxShadow:"0 12px 40px rgba(0,0,0,0.8)" }}
      onPointerDown={e=>e.stopPropagation()}>
      {items.map(it=>(
        <button key={it.id} onClick={()=>{onAction(it.id);onClose();}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:6,background:"none",border:"none",color:it.danger?"#ef4444":"#94a3b8",fontSize:11,cursor:"pointer",textAlign:"left"}}
          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.06)"}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="none"}}>
          <it.icon size={12}/>{it.label}
        </button>))}
    </div>);
}

// ─── Alignment bar ───────────────────────────────────────────────────────────
function AlignBar({ count, onAlign }: { count:number; onAlign:(a:string)=>void }) {
  if (count < 2) return null;
  const btns: {id:string;icon:React.ElementType;tip:string}[] = [
    {id:"left",icon:AlignStartVertical,tip:"Aligner à gauche"},
    {id:"centerH",icon:AlignHorizontalJustifyCenter,tip:"Centrer horiz."},
    {id:"right",icon:AlignEndVertical,tip:"Aligner à droite"},
    {id:"top",icon:AlignStartHorizontal,tip:"Aligner en haut"},
    {id:"centerV",icon:AlignVerticalJustifyCenter,tip:"Centrer vert."},
    {id:"bottom",icon:AlignEndHorizontal,tip:"Aligner en bas"},
    {id:"distH",icon:AlignHorizontalSpaceAround,tip:"Distribuer horiz."},
    {id:"distV",icon:AlignVerticalSpaceAround,tip:"Distribuer vert."},
    {id:"sameW",icon:ArrowLeftRight,tip:"Même largeur"},
    {id:"sameH",icon:ArrowUpDown,tip:"Même hauteur"},
  ];
  return (
    <div style={{position:"fixed",top:52,left:"50%",transform:"translateX(-50%)",background:"rgba(10,10,22,0.95)",border:"1px solid rgba(59,130,246,0.3)",borderRadius:10,padding:"4px 6px",display:"flex",gap:2,zIndex:200,backdropFilter:"blur(20px)",boxShadow:"0 8px 32px rgba(0,0,0,0.6)"}}>
      <span style={{fontSize:10,color:"#3b82f6",fontWeight:700,padding:"4px 8px",display:"flex",alignItems:"center"}}>{count} sélectionnés</span>
      <div style={{width:1,height:20,background:"rgba(255,255,255,0.1)",alignSelf:"center"}}/>
      {btns.map(b=><button key={b.id} onClick={()=>onAlign(b.id)} title={b.tip} style={{padding:"5px 7px",borderRadius:6,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#94a3b8",cursor:"pointer",lineHeight:0}} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="rgba(59,130,246,0.15)";(e.currentTarget as HTMLElement).style.color="#3b82f6"}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.04)";(e.currentTarget as HTMLElement).style.color="#94a3b8"}}><b.icon size={13}/></button>)}
    </div>);
}

// ─── Layers panel ────────────────────────────────────────────────────────────
function LayersPanel({ mods, selected, multiSel, onSelect, onReorder, onToggleVis }: {
  mods:Mod[]; selected:string|null; multiSel:Set<string>;
  onSelect:(id:string)=>void; onReorder:(id:string,dir:number)=>void; onToggleVis:(id:string)=>void;
}) {
  const onCanvas = mods.filter(m=>m.onCanvas).sort((a,b)=>b.z-a.z);
  return (
    <div style={{flex:1,overflowY:"auto",padding:"6px"}}>
      {onCanvas.map(m=>{
        const def = DEF_MAP[m.id]; if (!def) return null;
        const Icon = def.icon;
        const isSel = selected === m.id || multiSel.has(m.id);
        return (
          <div key={m.id} onClick={()=>onSelect(m.id)} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 8px",borderRadius:6,marginBottom:2,background:isSel?"rgba(59,130,246,0.12)":"transparent",border:isSel?"1px solid rgba(59,130,246,0.25)":"1px solid transparent",cursor:"pointer",transition:"all 0.1s"}}
            onMouseEnter={e=>{if(!isSel)(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.04)"}}
            onMouseLeave={e=>{if(!isSel)(e.currentTarget as HTMLElement).style.background="transparent"}}>
            <div style={{width:16,height:16,borderRadius:4,background:`${def.color}22`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon size={9} color={def.color}/></div>
            <span style={{fontSize:10,color:isSel?"#e2e8f0":"#64748b",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{def.label}</span>
            <span style={{fontSize:8,color:"#334155",fontVariantNumeric:"tabular-nums"}}>{m.z}</span>
            <button onClick={e=>{e.stopPropagation();onToggleVis(m.id)}} style={{background:"none",border:"none",cursor:"pointer",color:m.open?"#475569":"#f59e0b",lineHeight:0,padding:1}}>{m.open?<Eye size={10}/>:<EyeOff size={10}/>}</button>
            <div style={{display:"flex",flexDirection:"column",gap:0}}>
              <button onClick={e=>{e.stopPropagation();onReorder(m.id,1)}} style={{background:"none",border:"none",cursor:"pointer",color:"#334155",lineHeight:0,padding:0}}><ChevronUp size={9}/></button>
              <button onClick={e=>{e.stopPropagation();onReorder(m.id,-1)}} style={{background:"none",border:"none",cursor:"pointer",color:"#334155",lineHeight:0,padding:0}}><ChevronDown size={9}/></button>
            </div>
          </div>);
      })}
    </div>);
}

// ─── Properties panel ────────────────────────────────────────────────────────
function PropsPanel({ mod, def, onUpdate, onToggleOpen, onRemove, onToggleLock }: {
  mod:Mod; def:ModDef; onUpdate:(u:Partial<Mod>)=>void; onToggleOpen:()=>void; onRemove:()=>void; onToggleLock:()=>void;
}) {
  const Icon = def.icon;
  return (
    <div style={{flex:1,overflowY:"auto"}}>
      <div style={{padding:"12px 14px",borderBottom:"1px solid rgba(255,255,255,0.07)",display:"flex",alignItems:"center",gap:8}}>
        <div style={{width:28,height:28,borderRadius:7,background:`${def.color}22`,border:`1.5px solid ${def.color}44`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon size={14} color={def.color}/></div>
        <div style={{flex:1}}><div style={{fontSize:12,fontWeight:700,color:"#f1f5f9"}}>{def.label}</div><div style={{fontSize:9,color:"#475569"}}>{def.desc || def.category}</div></div>
      </div>
      <div style={{padding:"14px",borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
        <div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10,display:"flex",alignItems:"center",gap:5}}><Move size={10}/> Position & Taille</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {(["x","y","w","h"] as const).map(k=>(
            <div key={k}><label style={{fontSize:9,color:"#475569",marginBottom:3,display:"block"}}>{k.toUpperCase()}</label>
              <input type="number" value={mod[k]} onChange={e=>onUpdate({[k]:sg(parseInt(e.target.value)||0)})} step={GRID} style={{width:"100%",padding:"5px 8px",borderRadius:6,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:"#e2e8f0",fontSize:11,fontVariantNumeric:"tabular-nums",outline:"none"}}/></div>))}
        </div>
        <div style={{marginTop:10,fontSize:9,fontWeight:600,color:"#475569",marginBottom:6}}>Taille rapide</div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {SIZE_PRESETS.map(p=><button key={p.label} onClick={()=>onUpdate({w:p.w,h:p.h})} style={{padding:"3px 8px",borderRadius:5,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#64748b",fontSize:9,cursor:"pointer"}}>{p.label}</button>)}
        </div>
      </div>
      <div style={{padding:"14px",borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
        <div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10,display:"flex",alignItems:"center",gap:5}}><Layers size={10}/> Affichage</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <ToggleRow label="Z-index" type="number" value={mod.z} onChange={v=>onUpdate({z:parseInt(v)||1})}/>
          <ToggleSw label="Contenu visible" on={mod.open} onToggle={onToggleOpen} color="#22c55e"/>
          <ToggleSw label="Verrouillé" on={mod.locked} onToggle={onToggleLock} color="#f59e0b"/>
        </div>
      </div>
      <div style={{padding:"14px"}}>
        <button onClick={onRemove} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderRadius:7,background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",color:"#ef4444",fontSize:11,fontWeight:600,cursor:"pointer",width:"100%"}}><Trash2 size={12}/> Retirer du canvas</button>
      </div>
    </div>);
}

function ToggleRow({label,type,value,onChange}:{label:string;type:string;value:any;onChange:(v:string)=>void}) {
  return <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}><span style={{fontSize:11,color:"#94a3b8"}}>{label}</span><input type={type} value={value} onChange={e=>onChange(e.target.value)} style={{width:60,padding:"4px 8px",borderRadius:5,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:"#e2e8f0",fontSize:11,textAlign:"center",outline:"none"}}/></div>;
}
function ToggleSw({label,on,onToggle,color}:{label:string;on:boolean;onToggle:()=>void;color:string}) {
  return <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}><span style={{fontSize:11,color:"#94a3b8"}}>{label}</span><button onClick={onToggle} style={{width:40,height:22,borderRadius:11,border:"none",cursor:"pointer",position:"relative",background:on?`${color}30`:"rgba(255,255,255,0.1)",transition:"background 0.2s"}}><div style={{width:16,height:16,borderRadius:"50%",position:"absolute",top:3,left:on?21:3,background:on?color:"#475569",transition:"left 0.2s"}}/></button></div>;
}

// ─── Left sidebar palette ────────────────────────────────────────────────────
function Palette({ mods, searchQ, setSearchQ, expandedCats, toggleCat, addToCanvas, onDragStart }:
  { mods:Mod[]; searchQ:string; setSearchQ:(v:string)=>void; expandedCats:Set<string>; toggleCat:(id:string)=>void; addToCanvas:(id:string)=>void; onDragStart:(e:React.DragEvent,id:string)=>void; }) {
  const onIds = useMemo(() => new Set(mods.filter(m=>m.onCanvas).map(m=>m.id)), [mods]);
  const filtered = useMemo(() => {
    if (!searchQ.trim()) return DEFS;
    const q = searchQ.toLowerCase();
    return DEFS.filter(d => d.label.toLowerCase().includes(q) || d.id.includes(q) || d.category.includes(q) || (d.desc||"").toLowerCase().includes(q));
  }, [searchQ]);
  const grouped = useMemo(() => { const m:Record<string,ModDef[]>={}; for (const d of filtered) { (m[d.category]??=[]).push(d); } return m; }, [filtered]);

  return (
    <div style={{width:240,borderRight:"1px solid rgba(255,255,255,0.07)",background:"rgba(0,0,0,0.5)",backdropFilter:"blur(12px)",display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0}}>
      <div style={{padding:"12px 14px",borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
        <div style={{fontSize:12,fontWeight:700,color:"#f1f5f9",marginBottom:10}}>Modules <span style={{fontSize:9,color:"#475569",fontWeight:400}}>— glisser vers le canvas</span></div>
        <div style={{display:"flex",alignItems:"center",gap:6,padding:"0 8px",height:30,borderRadius:7,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)"}}>
          <Search size={12} color="#475569"/>
          <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Rechercher un module..." style={{flex:1,background:"none",border:"none",color:"#e2e8f0",fontSize:11,outline:"none"}}/>
          {searchQ && <button onClick={()=>setSearchQ("")} style={{background:"none",border:"none",cursor:"pointer",color:"#475569",lineHeight:0}}><X size={11}/></button>}
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"8px 0"}}>
        {CATEGORIES.map(cat => {
          const items = grouped[cat.id]; if (!items?.length) return null;
          const isExp = expandedCats.has(cat.id);
          const CatIcon = cat.icon;
          const offCount = items.filter(d => !onIds.has(d.id)).length;
          return (
            <div key={cat.id} style={{marginBottom:2}}>
              <button onClick={()=>toggleCat(cat.id)} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"7px 14px",background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:11,fontWeight:600,textAlign:"left"}}>
                {isExp?<ChevronDown size={11}/>:<ChevronRight size={11}/>}<CatIcon size={12}/><span style={{flex:1}}>{cat.label}</span>
                {offCount>0&&<span style={{fontSize:9,color:"#475569",background:"rgba(255,255,255,0.06)",padding:"1px 5px",borderRadius:8}}>{offCount}</span>}
              </button>
              {isExp && (<div style={{padding:"2px 10px 6px 32px"}}>{items.map(d=>{
                const isOn = onIds.has(d.id); const DIcon = d.icon;
                return (
                  <div key={d.id} draggable={!isOn} onDragStart={e=>!isOn&&onDragStart(e,d.id)}
                    style={{display:"flex",alignItems:"center",gap:7,padding:"5px 8px",borderRadius:6,marginBottom:2,cursor:isOn?"default":"grab",background:isOn?"rgba(255,255,255,0.02)":"transparent",opacity:isOn?0.5:1,transition:"all 0.15s"}}
                    onClick={()=>!isOn&&addToCanvas(d.id)}
                    onMouseEnter={e=>{if(!isOn)(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.06)"}}
                    onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background=isOn?"rgba(255,255,255,0.02)":"transparent"}}>
                    <div style={{width:22,height:22,borderRadius:5,background:`${d.color}18`,border:`1px solid ${d.color}33`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><DIcon size={11} color={d.color}/></div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:10,color:isOn?"#475569":"#94a3b8"}}>{d.label}</div>
                      {d.desc && <div style={{fontSize:8,color:"#334155",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.desc}</div>}
                    </div>
                    {isOn?<Check size={10} color="#22c55e"/>:<Grip size={10} color="#334155"/>}
                  </div>);
              })}</div>)}
            </div>);
        })}
      </div>
      <div style={{padding:"10px 14px",borderTop:"1px solid rgba(255,255,255,0.07)",fontSize:9,color:"#334155"}}>{mods.filter(m=>m.onCanvas).length}/{DEFS.length} modules actifs</div>
    </div>);
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
export default function LayoutBuilderPage() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [mods, setMods] = useState<Mod[]>(loadMods);
  const [selected, setSelected] = useState<string|null>(null);
  const [multiSel, setMultiSel] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<DragState|null>(null);
  const [savedBanner, setSavedBanner] = useState(false);
  const [snapOn, setSnapOn] = useState(true);
  const [snapLines, setSnapLines] = useState<SnapLine[]>([]);
  const [zoom, setZoom] = useState(1);
  const [showLeft, setShowLeft] = useState(true);
  const [rightTab, setRightTab] = useState<RightTab>("properties");
  const [showRight, setShowRight] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(["toolbar","player","library"]));
  const [showPresets, setShowPresets] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<ContextMenu|null>(null);
  const [savedLayouts, setSavedLayouts] = useState<SavedLayout[]>(loadSavedLayouts);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [layoutName, setLayoutName] = useState("");
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [rubberBand, setRubberBand] = useState<{x1:number;y1:number;x2:number;y2:number}|null>(null);

  const [undoStack, setUndoStack] = useState<Mod[][]>([]);
  const [redoStack, setRedoStack] = useState<Mod[][]>([]);
  const modsRef = useRef(mods);
  useEffect(() => { modsRef.current = mods; }, [mods]);
  const maxZ = Math.max(...mods.map(m=>m.z), 1);

  const pushUndo = useCallback((prev:Mod[]) => { setUndoStack(s=>[...s.slice(-MAX_UNDO),prev]); setRedoStack([]); }, []);
  const undo = useCallback(() => { setUndoStack(s=>{if(!s.length) return s; setRedoStack(r=>[...r,modsRef.current]); const p=s[s.length-1]; setMods(p); saveMods(p); return s.slice(0,-1);}); }, []);
  const redo = useCallback(() => { setRedoStack(s=>{if(!s.length) return s; setUndoStack(u=>[...u,modsRef.current]); const n=s[s.length-1]; setMods(n); saveMods(n); return s.slice(0,-1);}); }, []);

  // Keyboard
  useEffect(() => {
    const h = (e:KeyboardEvent) => {
      if ((e.metaKey||e.ctrlKey) && e.key==="z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.metaKey||e.ctrlKey) && (e.key==="y"||(e.key==="z"&&e.shiftKey))) { e.preventDefault(); redo(); }
      if ((e.key==="Delete"||e.key==="Backspace") && document.activeElement?.tagName!=="INPUT") {
        e.preventDefault();
        const ids = multiSel.size > 0 ? multiSel : (selected ? new Set([selected]) : new Set<string>());
        if (ids.size > 0) {
          pushUndo(modsRef.current);
          setMods(p=>{const u=p.map(m=>ids.has(m.id)?{...m,onCanvas:false}:m); saveMods(u); return u;});
          setSelected(null); setMultiSel(new Set());
        }
      }
      if (e.key==="Escape") { setSelected(null); setMultiSel(new Set()); setCtxMenu(null); }
      if ((e.metaKey||e.ctrlKey) && e.key==="a" && document.activeElement?.tagName!=="INPUT") {
        e.preventDefault();
        setMultiSel(new Set(modsRef.current.filter(m=>m.onCanvas).map(m=>m.id)));
      }
    };
    window.addEventListener("keydown",h); return ()=>window.removeEventListener("keydown",h);
  }, [selected, multiSel, undo, redo, pushUndo]);

  // Drag & rubber band
  useEffect(() => {
    if (!drag && !rubberBand) return;
    const canvas = canvasRef.current; if (!canvas) return;

    const onMove = (e:PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const px = (e.clientX-rect.left)/zoom;
      const py = (e.clientY-rect.top)/zoom;

      if (rubberBand) {
        setRubberBand(rb => rb ? {...rb, x2:px, y2:py} : null);
        // Select modules inside rubber band
        const rb = rubberBand;
        const rx = Math.min(rb.x1, px), ry = Math.min(rb.y1, py);
        const rw = Math.abs(px - rb.x1), rh = Math.abs(py - rb.y1);
        const hit = new Set<string>();
        for (const m of modsRef.current) {
          if (!m.onCanvas) continue;
          if (m.x < rx+rw && m.x+m.w > rx && m.y < ry+rh && m.y+m.h > ry) hit.add(m.id);
        }
        setMultiSel(hit);
        return;
      }

      if (!drag) return;
      const dx = px - drag.startPx;
      const dy = py - drag.startPy;

      setMods(prev => prev.map(m => {
        // Multi-move
        if (drag.multiOffsets) {
          const off = drag.multiOffsets.find(o=>o.id===m.id);
          if (!off) return m;
          let nx = sg(drag.origX + dx + off.dx);
          let ny = sg(drag.origY + dy + off.dy);
          return {...m, x:nx, y:ny};
        }
        if (m.id !== drag.id) return m;
        const {origX:ox,origY:oy,origW:ow,origH:oh} = drag;
        let nx=ox,ny=oy,nw=ow,nh=oh;
        if (drag.mode === "move") {
          nx=sg(ox+dx); ny=sg(oy+dy);
          if (snapOn) {
            const {lines,snapX,snapY} = calcSnap(drag.id,{x:nx,y:ny,w:nw,h:nh},prev,multiSel);
            setSnapLines(lines);
            if(snapX!==null)nx=snapX; if(snapY!==null)ny=snapY;
          }
        } else {
          const d=drag.mode;
          if(d.includes("e")){nw=Math.max(MIN_W,sg(ow+dx))}
          if(d.includes("w")){const nw2=Math.max(MIN_W,sg(ow-dx));nx=sg(ox+ow-nw2);nw=nw2}
          if(d.includes("s")){nh=Math.max(MIN_H,sg(oh+dy))}
          if(d.includes("n")){const nh2=Math.max(MIN_H,sg(oh-dy));ny=sg(oy+oh-nh2);nh=nh2}
          setSnapLines([]);
        }
        return {...m,x:nx,y:ny,w:nw,h:nh};
      }));
    };
    const onUp = () => { saveMods(modsRef.current); setDrag(null); setSnapLines([]); setRubberBand(null); };
    window.addEventListener("pointermove",onMove); window.addEventListener("pointerup",onUp);
    return ()=>{window.removeEventListener("pointermove",onMove);window.removeEventListener("pointerup",onUp);};
  }, [drag, snapOn, zoom, rubberBand, multiSel]);

  // Canvas pointer down — rubber band or deselect
  const onCanvasDown = useCallback((e:React.PointerEvent) => {
    const tgt = e.target as HTMLElement;
    if (tgt === canvasRef.current || tgt.hasAttribute("data-canvas")) {
      if (!e.shiftKey) { setSelected(null); setMultiSel(new Set()); }
      const rect = canvasRef.current!.getBoundingClientRect();
      const px = (e.clientX-rect.left)/zoom;
      const py = (e.clientY-rect.top)/zoom;
      setRubberBand({x1:px,y1:py,x2:px,y2:py});
    }
  }, [zoom]);

  // Handlers
  const handleMove = useCallback((e:React.PointerEvent, id:string) => {
    e.preventDefault();
    const m = modsRef.current.find(x=>x.id===id)!;
    if (m.locked) return;
    pushUndo(modsRef.current);
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX-rect.left)/zoom;
    const py = (e.clientY-rect.top)/zoom;

    // Multi-move
    if (multiSel.size > 1 && multiSel.has(id)) {
      const offsets = Array.from(multiSel).filter(mid=>mid!==id).map(mid=>{
        const mm = modsRef.current.find(x=>x.id===mid)!;
        return {id:mid, dx:mm.x-m.x, dy:mm.y-m.y};
      });
      setDrag({id, mode:"move", startPx:px, startPy:py, origX:m.x, origY:m.y, origW:m.w, origH:m.h, multiOffsets:offsets});
    } else {
      setMods(prev=>prev.map(x=>x.id===id?{...x,z:maxZ+1}:x));
      setDrag({id, mode:"move", startPx:px, startPy:py, origX:m.x, origY:m.y, origW:m.w, origH:m.h});
    }
  }, [maxZ, pushUndo, zoom, multiSel]);

  const handleResize = useCallback((e:React.PointerEvent, id:string, dir:ResizeEdge) => {
    e.preventDefault(); const m = modsRef.current.find(x=>x.id===id)!; if(m.locked)return;
    pushUndo(modsRef.current);
    const rect = canvasRef.current!.getBoundingClientRect();
    setDrag({id,mode:dir,startPx:(e.clientX-rect.left)/zoom,startPy:(e.clientY-rect.top)/zoom,origX:m.x,origY:m.y,origW:m.w,origH:m.h});
  }, [pushUndo, zoom]);

  const handleSelect = useCallback((id:string, e:React.PointerEvent) => {
    if (e.shiftKey || e.metaKey) {
      setMultiSel(prev => { const n = new Set(prev); if(n.has(id))n.delete(id); else n.add(id); if(selected && !n.has(selected)) n.add(selected); return n; });
    } else {
      setSelected(id); setMultiSel(new Set()); setShowRight(true);
      setMods(prev=>prev.map(m=>m.id===id?{...m,z:maxZ+1}:m));
    }
  }, [maxZ, selected]);

  const toggleOpen = useCallback((id:string)=>{pushUndo(modsRef.current);setMods(p=>{const u=p.map(m=>m.id===id?{...m,open:!m.open}:m);saveMods(u);return u;});}, [pushUndo]);
  const toggleLock = useCallback((id:string)=>{setMods(p=>{const u=p.map(m=>m.id===id?{...m,locked:!m.locked}:m);saveMods(u);return u;});}, []);
  const removeFromCanvas = useCallback((id:string)=>{pushUndo(modsRef.current);setMods(p=>{const u=p.map(m=>m.id===id?{...m,onCanvas:false}:m);saveMods(u);return u;});setSelected(s=>s===id?null:s);setMultiSel(p=>{const n=new Set(p);n.delete(id);return n;});}, [pushUndo]);

  const addToCanvas = useCallback((id:string) => {
    pushUndo(modsRef.current);
    const cx = canvasRef.current ? (canvasRef.current.scrollLeft/zoom)+250 : 250;
    const cy = canvasRef.current ? (canvasRef.current.scrollTop/zoom)+100 : 100;
    setMods(p=>{const u=p.map(m=>m.id===id?{...m,onCanvas:true,x:sg(cx),y:sg(cy),z:maxZ+1,open:true}:m);saveMods(u);return u;});
    setSelected(id); setMultiSel(new Set()); setShowRight(true);
  }, [maxZ, pushUndo, zoom]);

  const updateMod = useCallback((id:string, u:Partial<Mod>)=>{pushUndo(modsRef.current);setMods(p=>{const up=p.map(m=>m.id===id?{...m,...u}:m);saveMods(up);return up;});}, [pushUndo]);

  const handleAlign = useCallback((action:string) => {
    const ids = multiSel.size > 1 ? multiSel : new Set<string>();
    if (ids.size < 2) return;
    pushUndo(modsRef.current);
    setMods(p => { const u = alignMods(p, ids, action); saveMods(u); return u; });
  }, [multiSel, pushUndo]);

  const handleCtxAction = useCallback((action:string) => {
    if (!ctxMenu?.modId) return;
    const id = ctxMenu.modId;
    switch(action) {
      case "lock": toggleLock(id); break;
      case "open": toggleOpen(id); break;
      case "front": pushUndo(modsRef.current); setMods(p=>{const u=p.map(m=>m.id===id?{...m,z:maxZ+10}:m);saveMods(u);return u;}); break;
      case "back": pushUndo(modsRef.current); setMods(p=>{const u=p.map(m=>m.id===id?{...m,z:1}:m);saveMods(u);return u;}); break;
      case "remove": removeFromCanvas(id); break;
    }
  }, [ctxMenu, toggleLock, toggleOpen, removeFromCanvas, pushUndo, maxZ]);

  const reorderZ = useCallback((id:string, dir:number) => {
    pushUndo(modsRef.current);
    setMods(p=>{const u=p.map(m=>m.id===id?{...m,z:Math.max(1,m.z+dir)}:m);saveMods(u);return u;});
  }, [pushUndo]);

  const handleSave = ()=>{saveMods(mods);setSavedBanner(true);setTimeout(()=>setSavedBanner(false),2500);};
  const handleReset = ()=>{pushUndo(mods);const d=makeDefault();setMods(d);saveMods(d);setSelected(null);setMultiSel(new Set());};
  const handlePreset = (pid:string)=>{pushUndo(mods);const p=applyPreset(pid);setMods(p);saveMods(p);setSelected(null);setMultiSel(new Set());setShowPresets(false);};

  const handleSaveLayout = ()=>{
    if(!layoutName.trim()) return;
    const l:SavedLayout = {id:Date.now().toString(), name:layoutName.trim(), mods:[...mods], date:new Date().toISOString()};
    const updated = [...savedLayouts, l]; setSavedLayouts(updated); saveSavedLayouts(updated);
    setLayoutName(""); setShowSaveDialog(false); setSavedBanner(true); setTimeout(()=>setSavedBanner(false),2500);
  };
  const handleLoadLayout = (l:SavedLayout) => { pushUndo(mods); setMods(l.mods); saveMods(l.mods); setSelected(null); setMultiSel(new Set()); setShowLoadDialog(false); };
  const handleDeleteLayout = (id:string) => { const u = savedLayouts.filter(l=>l.id!==id); setSavedLayouts(u); saveSavedLayouts(u); };

  // Drag from palette
  const onPaletteDragStart = useCallback((e:React.DragEvent, id:string) => { e.dataTransfer.setData("moduleId", id); e.dataTransfer.effectAllowed = "copy"; }, []);
  const onCanvasDrop = useCallback((e:React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("moduleId"); if(!id) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = sg((e.clientX-rect.left)/zoom);
    const y = sg((e.clientY-rect.top)/zoom);
    pushUndo(modsRef.current);
    setMods(p=>{const u=p.map(m=>m.id===id?{...m,onCanvas:true,x,y,z:maxZ+1,open:true}:m);saveMods(u);return u;});
    setSelected(id); setMultiSel(new Set()); setShowRight(true);
  }, [maxZ, pushUndo, zoom]);

  const toggleCat = useCallback((id:string)=>{setExpandedCats(p=>{const n=new Set(p);if(n.has(id))n.delete(id);else n.add(id);return n;});}, []);
  const onCanvas = mods.filter(m=>m.onCanvas);
  const selMod = selected ? mods.find(m=>m.id===selected) : null;
  const selDef = selected ? DEF_MAP[selected] : null;

  return (
    <div style={{height:"100vh",display:"flex",flexDirection:"column",background:"#04040b",color:"#e2e8f0",fontFamily:"system-ui,-apple-system,sans-serif",overflow:"hidden",cursor:drag?.mode==="move"?"grabbing":"default"}}>

      {/* ─── Header ─── */}
      <div style={{padding:"8px 16px",borderBottom:"1px solid rgba(255,255,255,0.07)",background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",gap:8,flexShrink:0,backdropFilter:"blur(12px)",zIndex:100}}>
        <Link href="/admin" style={{display:"flex",alignItems:"center",gap:4,color:"#64748b",textDecoration:"none",fontSize:11}}><ChevronLeft size={12}/> Admin</Link>
        <div style={{width:1,height:12,background:"rgba(255,255,255,0.1)"}}/>
        <LayoutDashboard size={14} color="#3b82f6"/>
        <div><div style={{fontSize:13,fontWeight:700,color:"#f1f5f9",lineHeight:1.2}}>Layout Builder</div><div style={{fontSize:9,color:"#334155"}}>Drag · Resize · Shift+clic multi-sélection · ⌘A tout sélectionner</div></div>

        <div style={{display:"flex",gap:3,marginLeft:8}}>
          <HdrBtn on={showLeft} onClick={()=>setShowLeft(p=>!p)} icon={PanelLeftClose} tip="Palette"/>
          <HdrBtn on={showRight} onClick={()=>setShowRight(p=>!p)} icon={PanelRightClose} tip="Panneau droit"/>
          <HdrBtn on={snapOn} onClick={()=>setSnapOn(p=>!p)} icon={Magnet} tip="Snap" color="#ec4899"/>
        </div>

        {/* Zoom */}
        <div style={{display:"flex",alignItems:"center",gap:3}}>
          <SmBtn onClick={()=>setZoom(z=>Math.max(0.5,+(z-0.1).toFixed(1)))} icon={ZoomOut}/>
          <span style={{fontSize:10,color:"#64748b",fontVariantNumeric:"tabular-nums",minWidth:36,textAlign:"center"}}>{Math.round(zoom*100)}%</span>
          <SmBtn onClick={()=>setZoom(z=>Math.min(2,+(z+0.1).toFixed(1)))} icon={ZoomIn}/>
          <SmBtn onClick={()=>setZoom(1)} label="1:1"/>
        </div>

        {/* Undo/Redo */}
        <div style={{display:"flex",gap:2}}>
          <SmBtn onClick={undo} icon={Undo2} disabled={!undoStack.length}/>
          <SmBtn onClick={redo} icon={Redo2} disabled={!redoStack.length}/>
        </div>

        {/* Presets */}
        <div style={{position:"relative"}}>
          <HdrBtn on={showPresets} onClick={()=>setShowPresets(p=>!p)} icon={LayoutTemplate} label="Presets" color="#a855f7"/>
          {showPresets && <div style={{position:"absolute",top:"100%",left:0,marginTop:6,background:"rgba(10,10,22,0.95)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:8,width:280,zIndex:999,backdropFilter:"blur(20px)",boxShadow:"0 12px 40px rgba(0,0,0,0.8)"}}>
            <div style={{fontSize:9,fontWeight:700,color:"#475569",textTransform:"uppercase",padding:"4px 8px",marginBottom:4}}>Presets intégrés</div>
            {BUILTIN_PRESETS.map(p=><PresetBtn key={p.id} label={p.label} desc={p.desc} onClick={()=>handlePreset(p.id)}/>)}
            {savedLayouts.length > 0 && <>
              <div style={{fontSize:9,fontWeight:700,color:"#475569",textTransform:"uppercase",padding:"4px 8px",marginTop:8,marginBottom:4}}>Mes layouts</div>
              {savedLayouts.map(l=><PresetBtn key={l.id} label={l.name} desc={new Date(l.date).toLocaleDateString()} onClick={()=>handleLoadLayout(l)} onDelete={()=>handleDeleteLayout(l.id)}/>)}
            </>}
            <div style={{borderTop:"1px solid rgba(255,255,255,0.07)",marginTop:8,paddingTop:8}}>
              {showSaveDialog ? (
                <div style={{display:"flex",gap:4}}>
                  <input value={layoutName} onChange={e=>setLayoutName(e.target.value)} placeholder="Nom du layout" onKeyDown={e=>e.key==="Enter"&&handleSaveLayout()} style={{flex:1,padding:"6px 8px",borderRadius:6,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.15)",color:"#e2e8f0",fontSize:11,outline:"none"}}/>
                  <button onClick={handleSaveLayout} style={{padding:"6px 10px",borderRadius:6,background:"rgba(34,197,94,0.15)",border:"1px solid rgba(34,197,94,0.3)",color:"#22c55e",fontSize:10,cursor:"pointer",fontWeight:700}}>OK</button>
                </div>
              ) : (
                <button onClick={()=>setShowSaveDialog(true)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"8px",borderRadius:7,background:"rgba(59,130,246,0.1)",border:"1px solid rgba(59,130,246,0.2)",color:"#3b82f6",fontSize:11,cursor:"pointer",fontWeight:600}}><Save size={12}/> Sauvegarder le layout actuel</button>
              )}
            </div>
          </div>}
        </div>

        <div style={{marginLeft:"auto",display:"flex",gap:6}}>
          <button onClick={handleReset} style={{display:"flex",alignItems:"center",gap:4,padding:"5px 10px",borderRadius:6,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",color:"#94a3b8",fontSize:11,cursor:"pointer"}}><RotateCcw size={11}/> Reset</button>
          <button onClick={handleSave} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 14px",borderRadius:7,fontWeight:700,fontSize:11,cursor:"pointer",transition:"all 0.2s",background:savedBanner?"rgba(34,197,94,0.2)":"linear-gradient(135deg,#2563eb,#7c3aed)",border:savedBanner?"1px solid #22c55e66":"1px solid transparent",color:savedBanner?"#22c55e":"white",boxShadow:savedBanner?"none":"0 2px 12px rgba(37,99,235,0.4)"}}>
            {savedBanner?<><Check size={12}/> Sauvegardé !</>:<><MonitorPlay size={12}/> Mettre en prod</>}
          </button>
        </div>
      </div>

      {/* ─── Main ─── */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        {showLeft && <Palette mods={mods} searchQ={searchQ} setSearchQ={setSearchQ} expandedCats={expandedCats} toggleCat={toggleCat} addToCanvas={addToCanvas} onDragStart={onPaletteDragStart}/>}

        {/* Canvas */}
        <div ref={canvasRef} style={{flex:1,overflow:"auto",position:"relative",background:"#05050e"}}
          onPointerDown={onCanvasDown} data-canvas="1"
          onDragOver={e=>e.preventDefault()} onDrop={onCanvasDrop}>
          <div style={{position:"relative",minWidth:1400*zoom,minHeight:760*zoom,transform:`scale(${zoom})`,transformOrigin:"top left"}} data-canvas="1">
            <BgGrid/>
            {/* Zone hints */}
            <div style={{position:"absolute",left:0,top:0,width:"100%",height:48,background:"rgba(59,130,246,0.03)",borderBottom:"1px dashed rgba(59,130,246,0.1)",pointerEvents:"none",zIndex:0}}><span style={{position:"absolute",left:8,top:16,fontSize:8,color:"rgba(59,130,246,0.2)",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase"}}>Topbar</span></div>
            <div style={{position:"absolute",left:0,top:48,width:200,bottom:0,background:"rgba(168,85,247,0.02)",borderRight:"1px dashed rgba(168,85,247,0.08)",pointerEvents:"none",zIndex:0}}><span style={{position:"absolute",left:8,top:12,fontSize:8,color:"rgba(168,85,247,0.2)",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase"}}>Sidebar</span></div>
            <div style={{position:"absolute",right:0,top:48,width:240,bottom:0,background:"rgba(6,182,212,0.02)",borderLeft:"1px dashed rgba(6,182,212,0.08)",pointerEvents:"none",zIndex:0}}><span style={{position:"absolute",right:8,top:12,fontSize:8,color:"rgba(6,182,212,0.2)",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase"}}>Panneau droit</span></div>
            {/* Logo */}
            <div style={{position:"absolute",left:8,top:10,display:"flex",alignItems:"center",gap:7,pointerEvents:"none",zIndex:1}}>
              <div style={{width:26,height:26,borderRadius:7,background:"linear-gradient(135deg,#2563eb,#ec4899)",display:"flex",alignItems:"center",justifyContent:"center"}}><Disc3 size={13} color="white"/></div>
              <span style={{fontSize:14,fontWeight:700,color:"rgba(255,255,255,0.5)"}}>CueForge</span>
            </div>
            {/* Snap lines */}
            {snapLines.map((l,i)=><div key={i} style={{position:"absolute",...(l.axis==="x"?{left:l.pos,top:0,width:1,height:"100%"}:{top:l.pos,left:0,height:1,width:"100%"}),background:"#ec4899",opacity:0.6,pointerEvents:"none",zIndex:999}}/>)}
            {/* Rubber band */}
            {rubberBand && <div style={{position:"absolute",left:Math.min(rubberBand.x1,rubberBand.x2),top:Math.min(rubberBand.y1,rubberBand.y2),width:Math.abs(rubberBand.x2-rubberBand.x1),height:Math.abs(rubberBand.y2-rubberBand.y1),border:"1px solid rgba(59,130,246,0.5)",background:"rgba(59,130,246,0.08)",borderRadius:2,pointerEvents:"none",zIndex:998}}/>}
            {/* Modules */}
            {onCanvas.map(mod=><ModCard key={mod.id} mod={mod} isSelected={selected===mod.id} isMulti={multiSel.has(mod.id)} maxZ={maxZ} onPtrDown={handleMove} onResizeDown={handleResize} onSelect={handleSelect} onCtxMenu={(e,id)=>setCtxMenu({x:e.clientX,y:e.clientY,modId:id})}/>)}
          </div>
        </div>

        {/* Right panel */}
        {showRight && (
          <div style={{width:260,borderLeft:"1px solid rgba(255,255,255,0.07)",background:"rgba(0,0,0,0.5)",backdropFilter:"blur(12px)",display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0}}>
            {/* Tabs */}
            <div style={{display:"flex",borderBottom:"1px solid rgba(255,255,255,0.07)",flexShrink:0}}>
              {(["properties","layers"] as RightTab[]).map(tab=>(
                <button key={tab} onClick={()=>setRightTab(tab)} style={{flex:1,padding:"9px 0",fontSize:10,fontWeight:600,cursor:"pointer",background:rightTab===tab?"rgba(59,130,246,0.08)":"none",color:rightTab===tab?"#3b82f6":"#475569",border:"none",borderBottom:rightTab===tab?"2px solid #3b82f6":"2px solid transparent"}}>
                  {tab==="properties"?"Propriétés":"Layers"}
                </button>
              ))}
            </div>
            {rightTab === "properties" ? (
              selMod && selDef
                ? <PropsPanel mod={selMod} def={selDef} onUpdate={u=>updateMod(selMod.id,u)} onToggleOpen={()=>toggleOpen(selMod.id)} onRemove={()=>removeFromCanvas(selMod.id)} onToggleLock={()=>toggleLock(selMod.id)}/>
                : <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{textAlign:"center",padding:20}}><Crosshair size={24} color="#1e1e30" style={{marginBottom:8}}/><div style={{fontSize:11,color:"#334155"}}>Sélectionnez un module<br/>pour voir ses propriétés</div></div></div>
            ) : (
              <LayersPanel mods={mods} selected={selected} multiSel={multiSel} onSelect={id=>{setSelected(id);setRightTab("properties")}} onReorder={reorderZ} onToggleVis={toggleOpen}/>
            )}
          </div>
        )}
      </div>

      {/* Multi-select alignment bar */}
      <AlignBar count={multiSel.size} onAlign={handleAlign}/>

      {/* Context menu */}
      {ctxMenu && <CtxMenu menu={ctxMenu} onAction={handleCtxAction} onClose={()=>setCtxMenu(null)}/>}

      {/* Footer */}
      <div style={{padding:"4px 16px",borderTop:"1px solid rgba(255,255,255,0.05)",background:"rgba(0,0,0,0.3)",display:"flex",alignItems:"center",gap:16,fontSize:9,color:"#1e293b",flexShrink:0}}>
        <span><Kbd>⌘Z</Kbd> Annuler</span><span><Kbd>⌘⇧Z</Kbd> Refaire</span><span><Kbd>⌘A</Kbd> Tout sélectionner</span><span><Kbd>Shift+clic</Kbd> Multi-select</span><span><Kbd>Suppr</Kbd> Retirer</span><span><Kbd>Clic droit</Kbd> Menu</span>
        <span style={{marginLeft:"auto"}}>{onCanvas.length} modules · {multiSel.size > 0 ? `${multiSel.size} sélectionnés` : "Aucune sélection multiple"}</span>
      </div>
    </div>
  );
}

// ─── Small UI helpers ────────────────────────────────────────────────────────
function Kbd({children}:{children:React.ReactNode}) { return <kbd style={{padding:"1px 4px",borderRadius:3,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.08)",fontSize:9}}>{children}</kbd>; }
function SmBtn({onClick,icon:Icon,label,disabled}:{onClick:()=>void;icon?:React.ElementType;label?:string;disabled?:boolean}) {
  return <button onClick={onClick} disabled={disabled} style={{padding:"3px 6px",borderRadius:5,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",color:disabled?"#1e1e30":"#64748b",cursor:disabled?"default":"pointer",lineHeight:0,fontSize:9}}>
    {Icon?<Icon size={12}/>:label}
  </button>;
}
function HdrBtn({on,onClick,icon:Icon,label,color,tip}:{on:boolean;onClick:()=>void;icon:React.ElementType;label?:string;color?:string;tip?:string}) {
  const c = color || "#3b82f6";
  return <button onClick={onClick} title={tip} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",borderRadius:6,background:on?`${c}15`:"rgba(255,255,255,0.04)",border:`1px solid ${on?`${c}30`:"rgba(255,255,255,0.1)"}`,color:on?c:"#64748b",fontSize:10,cursor:"pointer",lineHeight:0}}><Icon size={11}/>{label&&<span>{label}</span>}</button>;
}
function PresetBtn({label,desc,onClick,onDelete}:{label:string;desc:string;onClick:()=>void;onDelete?:()=>void}) {
  return <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:4}}>
    <button onClick={onClick} style={{flex:1,padding:"8px 10px",borderRadius:7,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",color:"#e2e8f0",fontSize:11,cursor:"pointer",textAlign:"left"}}
      onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.08)"}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.03)"}}>
      <div style={{fontWeight:700,marginBottom:2}}>{label}</div><div style={{fontSize:9,color:"#475569"}}>{desc}</div>
    </button>
    {onDelete && <button onClick={onDelete} style={{padding:"6px",borderRadius:5,background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",color:"#ef4444",cursor:"pointer",lineHeight:0,flexShrink:0}}><Trash2 size={10}/></button>}
  </div>;
}
