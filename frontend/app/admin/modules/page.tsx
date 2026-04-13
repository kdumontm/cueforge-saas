"use client";
import { useState, useRef, useEffect, useCallback, useMemo, createContext, useContext } from "react";
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
  HelpCircle, Fullscreen, Info, MousePointer2, AlertTriangle,
  FileDown, FileUp, Map, Hand,
} from "lucide-react";
import Link from "next/link";
import React from "react";

// ─── Constants ───────────────────────────────────────────────────────────────
const GRID = 8;
const MIN_W = 80;
const MIN_H = 36;
const HANDLE_SZ = 12; // #27: augmenté de 8 à 12
const STORAGE_KEY = "cueforge_layout_v5";
const LAYOUTS_KEY = "cueforge_saved_layouts";
const MAX_UNDO = 50;
const SNAP_T = 6;
const AUTOSAVE_DELAY = 2000; // #79: auto-save delay ms

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
interface Toast { id:number; message:string; type:"success"|"info"|"warning"|"error"; }

// ─── Toast System (#104) ────────────────────────────────────────────────────
const ToastContext = createContext<{ addToast:(msg:string, type?:Toast["type"])=>void }>({ addToast:()=>{} });

function ToastProvider({ children }:{ children:React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const addToast = useCallback((message:string, type:Toast["type"]="success") => {
    const id = Date.now();
    setToasts(p => [...p, { id, message, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000);
  }, []);
  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div style={{position:"fixed",bottom:60,right:20,zIndex:9999,display:"flex",flexDirection:"column",gap:8}}>
        {toasts.map(t => (
          <div key={t.id} style={{
            padding:"10px 16px",borderRadius:10,fontSize:12,fontWeight:600,
            backdropFilter:"blur(12px)",boxShadow:"0 8px 32px rgba(0,0,0,0.5)",
            animation:"slideIn 0.3s ease",
            ...(t.type==="success" ? {background:"rgba(34,197,94,0.15)",border:"1px solid rgba(34,197,94,0.3)",color:"#22c55e"} :
               t.type==="error" ? {background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.3)",color:"#ef4444"} :
               t.type==="warning" ? {background:"rgba(245,158,11,0.15)",border:"1px solid rgba(245,158,11,0.3)",color:"#f59e0b"} :
               {background:"rgba(59,130,246,0.15)",border:"1px solid rgba(59,130,246,0.3)",color:"#3b82f6"})
          }}>
            {t.type==="success"&&"✓ "}{t.type==="error"&&"✗ "}{t.type==="warning"&&"⚠ "}{t.type==="info"&&"ℹ "}
            {t.message}
          </div>
        ))}
      </div>
      <style>{`@keyframes slideIn { from { transform:translateX(100px);opacity:0 } to { transform:translateX(0);opacity:1 } }`}</style>
    </ToastContext.Provider>
  );
}

// ─── Confirmation Dialog (#64, #73, #74) ────────────────────────────────────
function ConfirmDialog({ open, title, message, confirmLabel, confirmColor, onConfirm, onCancel }:
  { open:boolean; title:string; message:string; confirmLabel:string; confirmColor:string; onConfirm:()=>void; onCancel:()=>void }) {
  if (!open) return null;
  return (
    <div style={{position:"fixed",inset:0,zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.6)",backdropFilter:"blur(4px)"}}>
      <div style={{background:"#12121f",border:"1px solid rgba(255,255,255,0.12)",borderRadius:14,padding:24,width:360,boxShadow:"0 20px 60px rgba(0,0,0,0.8)"}}>
        <div style={{fontSize:15,fontWeight:700,color:"#f1f5f9",marginBottom:8}}>{title}</div>
        <div style={{fontSize:12,color:"#94a3b8",lineHeight:1.6,marginBottom:20}}>{message}</div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={onCancel} aria-label="Annuler" style={{padding:"8px 16px",borderRadius:8,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:"#94a3b8",fontSize:12,cursor:"pointer",fontWeight:600}}>Annuler</button>
          <button onClick={onConfirm} aria-label={confirmLabel} style={{padding:"8px 16px",borderRadius:8,background:`${confirmColor}20`,border:`1px solid ${confirmColor}40`,color:confirmColor,fontSize:12,cursor:"pointer",fontWeight:700}}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Error Boundary (#99) ───────────────────────────────────────────────────
class ErrorBoundary extends React.Component<{children:React.ReactNode},{hasError:boolean;error:Error|null}> {
  constructor(props:any) { super(props); this.state = { hasError:false, error:null }; }
  static getDerivedStateFromError(error:Error) { return { hasError:true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#04040b",color:"#e2e8f0",flexDirection:"column",gap:16}}>
          <AlertCircle size={48} color="#ef4444"/>
          <div style={{fontSize:18,fontWeight:700}}>Erreur dans le Layout Builder</div>
          <div style={{fontSize:12,color:"#94a3b8",maxWidth:400,textAlign:"center"}}>{this.state.error?.message}</div>
          <button onClick={()=>{this.setState({hasError:false,error:null});window.location.reload();}}
            style={{padding:"10px 20px",borderRadius:8,background:"rgba(59,130,246,0.15)",border:"1px solid rgba(59,130,246,0.3)",color:"#3b82f6",fontSize:13,cursor:"pointer",fontWeight:600}}>
            Recharger
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Categories & Module definitions ────────────────────────────────────────
const CATEGORIES:{id:string;label:string;icon:React.ElementType;color:string}[] = [
  { id:"toolbar", label:"Barre d'outils", icon:Settings, color:"#3b82f6" },
  { id:"player", label:"Lecteur", icon:Play, color:"#22c55e" },
  { id:"library", label:"Bibliothèque", icon:Library, color:"#a855f7" },
  { id:"analysis", label:"Analyse", icon:BarChart2, color:"#f59e0b" },
  { id:"navigation", label:"Navigation", icon:Radio, color:"#06b6d4" },
  { id:"tools", label:"Outils", icon:Wand2, color:"#ec4899" },
];

const DEFS: ModDef[] = [
  // Toolbar
  { id:"search-bar", label:"Barre de recherche", icon:Search, color:"#3b82f6", category:"toolbar", desc:"Recherche globale dans la bibliothèque" },
  { id:"main-nav", label:"Navigation principale", icon:Hash, color:"#3b82f6", category:"toolbar", desc:"Menu de navigation principal" },
  { id:"notifications", label:"Notifications", icon:Bell, color:"#3b82f6", category:"toolbar", desc:"Centre de notifications" },
  { id:"theme-toggle", label:"Thème", icon:Sun, color:"#3b82f6", category:"toolbar", desc:"Basculer clair/sombre" },
  { id:"quick-actions", label:"Actions rapides", icon:Sparkles, color:"#3b82f6", category:"toolbar", desc:"Raccourcis vers les actions fréquentes" },
  { id:"user-menu", label:"Menu utilisateur", icon:Settings, color:"#3b82f6", category:"toolbar", desc:"Profil et paramètres" },
  // Player
  { id:"waveform", label:"Waveform", icon:Waves, color:"#22c55e", category:"player", desc:"Visualisation de la forme d'onde" },
  { id:"transport", label:"Transport", icon:Play, color:"#22c55e", category:"player", desc:"Lecture, pause, stop, navigation" },
  { id:"deck-a", label:"Deck A", icon:Disc3, color:"#22c55e", category:"player", desc:"Platine A principale" },
  { id:"deck-b", label:"Deck B", icon:Disc3, color:"#22c55e", category:"player", desc:"Platine B secondaire" },
  { id:"mixer", label:"Mixer", icon:Sliders, color:"#22c55e", category:"player", desc:"Table de mixage crossfader" },
  { id:"eq-controls", label:"Égaliseur", icon:Sliders, color:"#22c55e", category:"player", desc:"Contrôles EQ 3 bandes" },
  { id:"volume-meter", label:"VU-mètre", icon:Volume2, color:"#22c55e", category:"player", desc:"Indicateur de volume" },
  { id:"loop-controls", label:"Boucles", icon:Repeat, color:"#22c55e", category:"player", desc:"Gestion des boucles audio" },
  // Library
  { id:"track-list", label:"Liste de pistes", icon:ListMusic, color:"#a855f7", category:"library", desc:"Bibliothèque musicale complète" },
  { id:"playlist-manager", label:"Playlists", icon:FolderOpen, color:"#a855f7", category:"library", desc:"Gestionnaire de playlists" },
  { id:"crate-browser", label:"Bacs", icon:FolderOpen, color:"#a855f7", category:"library", desc:"Organisation par bacs/crates" },
  { id:"tag-filter", label:"Filtres tags", icon:Filter, color:"#a855f7", category:"library", desc:"Filtrage par tags et genres" },
  { id:"smart-playlist", label:"Smart Playlist", icon:BrainCircuit, color:"#a855f7", category:"library", desc:"Playlists intelligentes auto-générées" },
  { id:"recent-tracks", label:"Pistes récentes", icon:History, color:"#a855f7", category:"library", desc:"Historique des pistes jouées" },
  { id:"favorites", label:"Favoris", icon:Star, color:"#a855f7", category:"library", desc:"Pistes favorites" },
  // Analysis
  { id:"bpm-display", label:"BPM", icon:Gauge, color:"#f59e0b", category:"analysis", desc:"Détection et affichage du BPM" },
  { id:"key-display", label:"Tonalité", icon:Piano, color:"#f59e0b", category:"analysis", desc:"Détection de la clé musicale" },
  { id:"energy-meter", label:"Énergie", icon:Flame, color:"#f59e0b", category:"analysis", desc:"Niveau d'énergie du morceau" },
  { id:"spectral-view", label:"Spectrogramme", icon:BarChart2, color:"#f59e0b", category:"analysis", desc:"Analyse spectrale temps réel" },
  { id:"harmonic-wheel", label:"Roue harmonique", icon:RefreshCw, color:"#f59e0b", category:"analysis", desc:"Compatibilité harmonique" },
  { id:"beat-grid", label:"Grille de beats", icon:Grid2x2, color:"#f59e0b", category:"analysis", desc:"Visualisation de la grille rythmique" },
  // Navigation
  { id:"cue-points", label:"Points Cue", icon:ScanLine, color:"#06b6d4", category:"navigation", desc:"Marqueurs de points Cue" },
  { id:"minimap", label:"Minimap", icon:Map, color:"#06b6d4", category:"navigation", desc:"Vue miniature de la piste" },
  { id:"timeline", label:"Timeline", icon:Clock, color:"#06b6d4", category:"navigation", desc:"Ligne temporelle scrollable" },
  { id:"bookmark-mgr", label:"Signets", icon:BookOpen, color:"#06b6d4", category:"navigation", desc:"Gestion des signets audio" },
  // Tools
  { id:"effects-rack", label:"Rack d'effets", icon:FlaskConical, color:"#ec4899", category:"tools", desc:"Effets audio (reverb, delay, etc.)" },
  { id:"sampler", label:"Sampler", icon:Mic2, color:"#ec4899", category:"tools", desc:"Lecteur d'échantillons" },
  { id:"recorder", label:"Enregistreur", icon:Radio, color:"#ec4899", category:"tools", desc:"Enregistrement du mix" },
  { id:"midi-map", label:"MIDI Map", icon:Keyboard, color:"#ec4899", category:"tools", desc:"Mapping contrôleur MIDI" },
  { id:"auto-mix", label:"Auto-Mix", icon:Cpu, color:"#ec4899", category:"tools", desc:"Mixage automatique IA" },
  { id:"notes", label:"Notes", icon:NotebookPen, color:"#ec4899", category:"tools", desc:"Notes de set et commentaires" },
  { id:"preparation", label:"Préparation", icon:CheckSquare, color:"#ec4899", category:"tools", desc:"Workflow de préparation de set" },
  { id:"version-history", label:"Historique", icon:GitBranch, color:"#ec4899", category:"tools", desc:"Historique des modifications" },
];

const DEF_MAP: Record<string,ModDef> = {};
for (const d of DEFS) DEF_MAP[d.id] = d;

const SIZE_PRESETS = [
  { label:"S", w:120, h:48, desc:"120×48" },
  { label:"M", w:200, h:120, desc:"200×120" },
  { label:"L", w:360, h:200, desc:"360×200" },
  { label:"XL", w:600, h:320, desc:"600×320" },
  { label:"Pleine largeur", w:1400, h:200, desc:"1400×200" },
];

// ─── Default layout builder ─────────────────────────────────────────────────
function makeDefault(): Mod[] {
  const map: Record<string, { x:number;y:number;w:number;h:number }> = {
    "search-bar":{x:200,y:4,w:400,h:40}, "main-nav":{x:620,y:4,w:300,h:40},
    "notifications":{x:940,y:4,w:40,h:40}, "theme-toggle":{x:1000,y:4,w:40,h:40},
    "user-menu":{x:1060,y:4,w:120,h:40},
    "waveform":{x:208,y:56,w:600,h:160}, "transport":{x:208,y:224,w:300,h:56},
    "deck-a":{x:520,y:224,w:288,h:200}, "mixer":{x:208,y:288,w:300,h:136},
    "eq-controls":{x:208,y:432,w:200,h:140},
    "track-list":{x:4,y:56,w:200,h:400}, "tag-filter":{x:4,y:464,w:200,h:160},
    "bpm-display":{x:820,y:56,w:180,h:80}, "key-display":{x:820,y:144,w:180,h:80},
    "energy-meter":{x:820,y:232,w:180,h:60},
    "spectral-view":{x:420,y:432,w:388,h:180},
    "cue-points":{x:1008,y:56,w:200,h:200}, "timeline":{x:1008,y:264,w:200,h:60},
    "effects-rack":{x:1008,y:332,w:200,h:200}, "sampler":{x:1008,y:540,w:200,h:80},
    "loop-controls":{x:520,y:432,w:200,h:56}, "volume-meter":{x:816,y:300,w:40,h:180},
    "beat-grid":{x:208,y:580,w:600,h:48}, "minimap":{x:868,y:300,w:132,h:60},
  };
  return DEFS.map(d => {
    const p = map[d.id];
    return { id:d.id, x:p?.x??0, y:p?.y??0, w:p?.w??200, h:p?.h??120, z:1, open:true, onCanvas:!!p, locked:false };
  });
}

// ─── Built-in presets ───────────────────────────────────────────────────────
const BUILTIN_PRESETS: { id:string; label:string; desc:string; modMap:Record<string,{x:number;y:number;w:number;h:number}> }[] = [
  { id:"default", label:"Standard", desc:"Layout par défaut avec tous les éléments", modMap:{
    "search-bar":{x:200,y:4,w:400,h:40},"main-nav":{x:620,y:4,w:300,h:40},"waveform":{x:208,y:56,w:600,h:160},
    "transport":{x:208,y:224,w:300,h:56},"deck-a":{x:520,y:224,w:288,h:200},"mixer":{x:208,y:288,w:300,h:136},
    "track-list":{x:4,y:56,w:200,h:400},"bpm-display":{x:820,y:56,w:180,h:80},"cue-points":{x:1008,y:56,w:200,h:200},
    "effects-rack":{x:1008,y:332,w:200,h:200}
  }},
  { id:"minimal", label:"Minimal DJ", desc:"Essentiel: 2 decks + mixer", modMap:{
    "deck-a":{x:40,y:56,w:500,h:300},"deck-b":{x:560,y:56,w:500,h:300},"mixer":{x:300,y:380,w:500,h:120},
    "transport":{x:40,y:380,w:240,h:56},"waveform":{x:40,y:450,w:1020,h:120}
  }},
  { id:"analysis", label:"Mode Analyse", desc:"Focus sur l'analyse audio", modMap:{
    "waveform":{x:40,y:56,w:800,h:200},"spectral-view":{x:40,y:270,w:800,h:200},
    "bpm-display":{x:860,y:56,w:280,h:100},"key-display":{x:860,y:170,w:280,h:100},
    "energy-meter":{x:860,y:284,w:280,h:80},"harmonic-wheel":{x:860,y:378,w:280,h:200},
    "beat-grid":{x:40,y:484,w:800,h:80},"track-list":{x:40,y:578,w:600,h:160}
  }},
  { id:"wide", label:"Écran large", desc:"Optimisé pour les écrans 21:9", modMap:{
    "track-list":{x:4,y:56,w:280,h:500},"waveform":{x:296,y:56,w:700,h:200},
    "deck-a":{x:296,y:270,w:340,h:220},"deck-b":{x:648,y:270,w:340,h:220},
    "mixer":{x:296,y:500,w:692,h:56},"cue-points":{x:1008,y:56,w:240,h:240},
    "effects-rack":{x:1008,y:310,w:240,h:200},"bpm-display":{x:1008,y:520,w:120,h:60},"key-display":{x:1140,y:520,w:108,h:60}
  }},
];

function applyPreset(pid:string): Mod[] {
  const preset = BUILTIN_PRESETS.find(p=>p.id===pid);
  if (!preset) return makeDefault();
  return DEFS.map(d => {
    const p = preset.modMap[d.id];
    return { id:d.id, x:p?.x??0, y:p?.y??0, w:p?.w??200, h:p?.h??120, z:1, open:true, onCanvas:!!p, locked:false };
  });
}

// ─── Persistence ────────────────────────────────────────────────────────────
function loadMods(): Mod[] {
  if (typeof window === "undefined") return makeDefault();
  try { const s = localStorage.getItem(STORAGE_KEY); if(s) { const p=JSON.parse(s); if(Array.isArray(p)&&p.length)return p; } } catch(e){}
  return makeDefault();
}
function saveMods(m:Mod[]) { try { localStorage.setItem(STORAGE_KEY,JSON.stringify(m)); } catch(e){} }
function loadSavedLayouts(): SavedLayout[] {
  if (typeof window === "undefined") return [];
  try { const s=localStorage.getItem(LAYOUTS_KEY); if(s)return JSON.parse(s); } catch(e){} return [];
}
function saveSavedLayouts(l:SavedLayout[]) { try { localStorage.setItem(LAYOUTS_KEY,JSON.stringify(l)); } catch(e){} }

// ─── Snap helpers ───────────────────────────────────────────────────────────
function sg(v:number) { return Math.round(v/GRID)*GRID; }

function calcSnap(id:string, rect:{x:number;y:number;w:number;h:number}, all:Mod[], exclude:Set<string>) {
  const lines:SnapLine[]=[]; let snapX:number|null=null, snapY:number|null=null;
  const cx=rect.x+rect.w/2, cy=rect.y+rect.h/2;
  for (const m of all) {
    if (m.id===id||!m.onCanvas||exclude.has(m.id)) continue;
    const mcx=m.x+m.w/2, mcy=m.y+m.h/2;
    // left edges
    if(Math.abs(rect.x-m.x)<SNAP_T){snapX=m.x;lines.push({axis:"x",pos:m.x})}
    // right edges
    if(Math.abs(rect.x+rect.w-(m.x+m.w))<SNAP_T){snapX=m.x+m.w-rect.w;lines.push({axis:"x",pos:m.x+m.w})}
    // left to right
    if(Math.abs(rect.x-(m.x+m.w))<SNAP_T){snapX=m.x+m.w;lines.push({axis:"x",pos:m.x+m.w})}
    // right to left
    if(Math.abs(rect.x+rect.w-m.x)<SNAP_T){snapX=m.x-rect.w;lines.push({axis:"x",pos:m.x})}
    // center x
    if(Math.abs(cx-mcx)<SNAP_T){snapX=mcx-rect.w/2;lines.push({axis:"x",pos:mcx})}
    // top edges
    if(Math.abs(rect.y-m.y)<SNAP_T){snapY=m.y;lines.push({axis:"y",pos:m.y})}
    // bottom edges
    if(Math.abs(rect.y+rect.h-(m.y+m.h))<SNAP_T){snapY=m.y+m.h-rect.h;lines.push({axis:"y",pos:m.y+m.h})}
    // top to bottom
    if(Math.abs(rect.y-(m.y+m.h))<SNAP_T){snapY=m.y+m.h;lines.push({axis:"y",pos:m.y+m.h})}
    // bottom to top
    if(Math.abs(rect.y+rect.h-m.y)<SNAP_T){snapY=m.y-rect.h;lines.push({axis:"y",pos:m.y})}
    // center y
    if(Math.abs(cy-mcy)<SNAP_T){snapY=mcy-rect.h/2;lines.push({axis:"y",pos:mcy})}
  }
  return {lines,snapX,snapY};
}

// ─── Alignment ──────────────────────────────────────────────────────────────
function alignMods(mods:Mod[], ids:Set<string>, action:string): Mod[] {
  const sel = mods.filter(m=>ids.has(m.id)&&m.onCanvas);
  if (sel.length<2) return mods;
  const minX=Math.min(...sel.map(m=>m.x)), maxX=Math.max(...sel.map(m=>m.x+m.w));
  const minY=Math.min(...sel.map(m=>m.y)), maxY=Math.max(...sel.map(m=>m.y+m.h));
  const updates:Record<string,Partial<Mod>>={};
  switch(action) {
    case "left": sel.forEach(m=>{updates[m.id]={x:minX};}); break;
    case "right": sel.forEach(m=>{updates[m.id]={x:maxX-m.w};}); break;
    case "top": sel.forEach(m=>{updates[m.id]={y:minY};}); break;
    case "bottom": sel.forEach(m=>{updates[m.id]={y:maxY-m.h};}); break;
    case "centerH": { const cx=(minX+maxX)/2; sel.forEach(m=>{updates[m.id]={x:sg(cx-m.w/2)};}); break; }
    case "centerV": { const cy=(minY+maxY)/2; sel.forEach(m=>{updates[m.id]={y:sg(cy-m.h/2)};}); break; }
    case "distH": { const sorted=[...sel].sort((a,b)=>a.x-b.x); const totalW=sorted.reduce((s,m)=>s+m.w,0); const gap=(maxX-minX-totalW)/(sorted.length-1); let cx=minX; sorted.forEach(m=>{updates[m.id]={x:sg(cx)};cx+=m.w+gap;}); break; }
    case "distV": { const sorted=[...sel].sort((a,b)=>a.y-b.y); const totalH=sorted.reduce((s,m)=>s+m.h,0); const gap=(maxY-minY-totalH)/(sorted.length-1); let cy=minY; sorted.forEach(m=>{updates[m.id]={y:sg(cy)};cy+=m.h+gap;}); break; }
    case "sameW": { const w=Math.round(sel.reduce((s,m)=>s+m.w,0)/sel.length); sel.forEach(m=>{updates[m.id]={w:sg(w)};}); break; }
    case "sameH": { const h=Math.round(sel.reduce((s,m)=>s+m.h,0)/sel.length); sel.forEach(m=>{updates[m.id]={h:sg(h)};}); break; }
  }
  return mods.map(m => updates[m.id] ? {...m,...updates[m.id]} : m);
}

// ─── Module Content Preview ─────────────────────────────────────────────────
const ModContent = React.memo(function ModContent({ id, w, h }:{ id:string; w:number; h:number }) {
  const d = DEF_MAP[id]; if(!d) return null;
  const tiny = h<60||w<120;
  if(tiny) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%"}}><d.icon size={14} color={d.color} style={{opacity:0.5}}/></div>;

  switch(id) {
    case "waveform": return <div style={{padding:6,height:"100%",display:"flex",flexDirection:"column"}}><div style={{flex:1,display:"flex",alignItems:"flex-end",gap:1,padding:"0 4px"}}>{Array.from({length:Math.min(60,Math.floor(w/6))}).map((_,i)=><div key={i} style={{flex:1,background:`linear-gradient(180deg,${d.color}40,${d.color}15)`,borderRadius:1,height:`${20+Math.sin(i*0.4)*30+Math.random()*30}%`,transition:"height 0.3s"}}/>)}</div></div>;
    case "transport": return <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,height:"100%"}}>{[SkipBack,Play,SkipForward].map((I,i)=><div key={i} style={{width:28,height:28,borderRadius:"50%",background:`${d.color}15`,border:`1px solid ${d.color}30`,display:"flex",alignItems:"center",justifyContent:"center"}}><I size={12} color={d.color}/></div>)}</div>;
    case "track-list": return <div style={{padding:6,fontSize:8,color:"#64748b"}}>{["Crystal Sky — Kygo","Midnight — Lane 8","Strobe — deadmau5","Opus — Eric Prydz"].map((t,i)=><div key={i} style={{padding:"4px 6px",borderBottom:"1px solid rgba(255,255,255,0.04)",display:"flex",alignItems:"center",gap:6}}><Music size={8} color={d.color} style={{opacity:0.4,flexShrink:0}}/><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t}</span></div>)}</div>;
    case "mixer": return <div style={{display:"flex",alignItems:"flex-end",justifyContent:"center",gap:12,height:"100%",padding:10}}>{[60,80,45].map((v,i)=><div key={i} style={{width:6,background:`linear-gradient(180deg,${d.color},${d.color}30)`,borderRadius:3,height:`${v}%`}}/>)}</div>;
    default: return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",opacity:0.3}}><d.icon size={Math.min(24,Math.min(w,h)/3)} color={d.color}/></div>;
  }
});

// ─── Module Card on Canvas ──────────────────────────────────────────────────
const ModCard = React.memo(function ModCard({ mod, isSelected, isMulti, maxZ, onPtrDown, onResizeDown, onSelect, onCtxMenu, onDblClick, hoveredLayer }:
  { mod:Mod; isSelected:boolean; isMulti:boolean; maxZ:number; onPtrDown:(e:React.PointerEvent,id:string)=>void; onResizeDown:(e:React.PointerEvent,id:string,dir:ResizeEdge)=>void; onSelect:(id:string,e:React.PointerEvent)=>void; onCtxMenu:(e:React.MouseEvent,id:string)=>void; onDblClick:(id:string)=>void; hoveredLayer:string|null }) {
  const def = DEF_MAP[mod.id];
  if (!def) return null;
  const sel = isSelected || isMulti;
  const isHovered = hoveredLayer === mod.id;
  const borderColor = sel ? (isMulti && !isSelected ? "#60a5fa" : "#3b82f6") : (isHovered ? "#3b82f640" : `${def.color}30`);

  // #41: cursor adapté au resize
  const resizeCursors:Record<ResizeEdge,string> = { n:"n-resize", ne:"ne-resize", e:"e-resize", se:"se-resize", s:"s-resize", sw:"sw-resize", w:"w-resize", nw:"nw-resize" };

  return (
    <div
      tabIndex={0} // #1: focus clavier
      role="button"
      aria-label={`Module ${def.label}${mod.locked?" (verrouillé)":""}`} // #6: aria-label
      style={{
        position:"absolute", left:mod.x, top:mod.y, width:mod.w, height:mod.h,
        zIndex:mod.z, borderRadius:10,
        background:sel?"rgba(59,130,246,0.06)":"rgba(255,255,255,0.02)",
        border:`${sel?2:1}px solid ${borderColor}`,
        // #39: modules verrouillés visuellement distincts
        borderStyle: mod.locked ? "dashed" : "solid",
        cursor: mod.locked ? "not-allowed" : "grab",
        transition:"border-color 0.15s, box-shadow 0.15s, opacity 0.3s",
        // #108: glow au hover/selection
        boxShadow: sel ? `0 0 20px ${def.color}15, 0 4px 16px rgba(0,0,0,0.3)` : (isHovered ? `0 0 12px ${def.color}10` : "0 2px 8px rgba(0,0,0,0.2)"),
        overflow:"hidden",
        // #105: animation d'entrée
        animation: "fadeScaleIn 0.2s ease",
        outline: "none",
      }}
      onPointerDown={e=>{ e.stopPropagation(); onSelect(mod.id,e); if(!mod.locked) onPtrDown(e,mod.id); }}
      onDoubleClick={()=>onDblClick(mod.id)} // #31
      onContextMenu={e=>{e.preventDefault();onCtxMenu(e,mod.id);}}
      onKeyDown={e=>{ if(e.key==="Enter") onDblClick(mod.id); }} // #1: clavier
    >
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:5,padding:"4px 8px",borderBottom:"1px solid rgba(255,255,255,0.05)",background:"rgba(0,0,0,0.3)"}}>
        <def.icon size={10} color={def.color} style={{flexShrink:0}}/>
        <span style={{fontSize:9,fontWeight:600,color:"#94a3b8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{def.label}</span>
        {mod.locked && <Lock size={9} color="#f59e0b"/>}
      </div>
      {/* Content */}
      {mod.open && <div style={{flex:1,overflow:"hidden"}}><ModContent id={mod.id} w={mod.w} h={mod.h-26}/></div>}

      {/* Resize handles - #27: taille augmentée */}
      {sel && !mod.locked && (["n","ne","e","se","s","sw","w","nw"] as ResizeEdge[]).map(dir=>{
        const isCorner = dir.length===2;
        const sz = isCorner ? HANDLE_SZ : HANDLE_SZ-2;
        const style:React.CSSProperties = { position:"absolute", cursor:resizeCursors[dir], zIndex:999 };
        // Position
        if(dir.includes("n")) { style.top=-sz/2; style.height=sz; }
        if(dir.includes("s")) { style.bottom=-sz/2; style.height=sz; }
        if(dir.includes("e")) { style.right=-sz/2; style.width=sz; }
        if(dir.includes("w")) { style.left=-sz/2; style.width=sz; }
        if(dir==="n"||dir==="s") { style.left=sz; style.right=sz; }
        if(dir==="e"||dir==="w") { style.top=sz; style.bottom=sz; }
        if(isCorner) { style.width=sz; style.height=sz; style.borderRadius=3; style.background=sel?"rgba(59,130,246,0.5)":"transparent"; style.border="1px solid rgba(59,130,246,0.4)"; }
        return <div key={dir} style={style} onPointerDown={e=>{e.stopPropagation();onResizeDown(e,mod.id,dir)}}/>;
      })}
    </div>
  );
});

// ─── Background Grid ────────────────────────────────────────────────────────
function BgGrid() {
  return (
    <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:0}}>
      <defs>
        <pattern id="grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
          <circle cx={1} cy={1} r={0.5} fill="rgba(255,255,255,0.04)"/>
        </pattern>
        <pattern id="gridL" width={GRID*8} height={GRID*8} patternUnits="userSpaceOnUse">
          <rect width={GRID*8} height={GRID*8} fill="url(#grid)"/>
          <circle cx={1} cy={1} r={1} fill="rgba(255,255,255,0.08)"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#gridL)"/>
      {/* Rulers */}
      {Array.from({length:30}).map((_,i)=><text key={`rx${i}`} x={i*64+2} y={10} fill="rgba(255,255,255,0.06)" fontSize={7}>{i*64}</text>)}
      {Array.from({length:20}).map((_,i)=><text key={`ry${i}`} x={2} y={i*64+10} fill="rgba(255,255,255,0.06)" fontSize={7}>{i*64}</text>)}
    </svg>
  );
}

// ─── Context Menu (#88: extended actions, #92: smart positioning) ────────────
function CtxMenu({ menu, canvasRect, onAction, onClose }:{ menu:ContextMenu; canvasRect?:DOMRect; onAction:(a:string)=>void; onClose:()=>void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({x:menu.x, y:menu.y});

  // #92: smart positioning
  useEffect(()=>{
    if(!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    let x=menu.x, y=menu.y;
    if(x+r.width>window.innerWidth-10) x=window.innerWidth-r.width-10;
    if(y+r.height>window.innerHeight-10) y=window.innerHeight-r.height-10;
    setPos({x,y});
  },[menu.x,menu.y]);

  // Close on scroll (#90) and click outside
  useEffect(()=>{
    const h=()=>onClose();
    window.addEventListener("scroll",h,true);
    const click=(e:MouseEvent)=>{ if(ref.current&&!ref.current.contains(e.target as Node))onClose(); };
    setTimeout(()=>window.addEventListener("click",click),0);
    return ()=>{window.removeEventListener("scroll",h,true);window.removeEventListener("click",click);};
  },[onClose]);

  // #5: keyboard nav
  useEffect(()=>{
    const h=(e:KeyboardEvent)=>{
      if(e.key==="Escape") onClose();
    };
    window.addEventListener("keydown",h);
    return ()=>window.removeEventListener("keydown",h);
  },[onClose]);

  const mod = menu.modId ? DEF_MAP[menu.modId] : null;
  // #88: extended context menu + #91: canvas empty menu
  const items = menu.modId ? [
    { icon:Lock, label:"Verrouiller/Déverrouiller", action:"lock", color:"#f59e0b" },
    { icon:Eye, label:"Ouvrir/Réduire", action:"open", color:"#22c55e" },
    { icon:Copy, label:"Dupliquer", action:"duplicate", color:"#3b82f6" },
    null, // separator
    { icon:ArrowUpDown, label:"Premier plan", action:"front", color:"#94a3b8" },
    { icon:ArrowUpDown, label:"Arrière-plan", action:"back", color:"#94a3b8" },
    null,
    { icon:Trash2, label:"Retirer du canvas", action:"remove", color:"#ef4444" },
  ] : [
    { icon:Plus, label:"Sélectionner tout", action:"selectAll", color:"#3b82f6" },
  ];

  return (
    <div ref={ref} role="menu" aria-label="Menu contextuel" style={{
      position:"fixed",left:pos.x,top:pos.y,zIndex:9999,
      background:"rgba(10,10,22,0.95)",border:"1px solid rgba(255,255,255,0.12)",
      borderRadius:10,padding:4,minWidth:180,backdropFilter:"blur(20px)",boxShadow:"0 12px 40px rgba(0,0,0,0.8)"
    }}>
      {mod && <div style={{padding:"6px 10px",fontSize:9,color:"#475569",fontWeight:700,borderBottom:"1px solid rgba(255,255,255,0.06)",marginBottom:2}}>{mod.label}</div>}
      {items.map((item,i) => {
        if(!item) return <div key={i} style={{height:1,background:"rgba(255,255,255,0.06)",margin:"2px 4px"}}/>;
        const Icon=item.icon;
        return (
          <button key={item.action} role="menuitem" aria-label={item.label}
            onClick={()=>{onAction(item.action);onClose();}}
            style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:6,background:"none",border:"none",cursor:"pointer",color:item.color=="#ef4444"?item.color:"#e2e8f0",fontSize:11,textAlign:"left"}}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.06)"}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="none"}}
          ><Icon size={12} color={item.color}/>{item.label}</button>
        );
      })}
    </div>
  );
}

// ─── Alignment Bar (#82: with tooltips) ─────────────────────────────────────
function AlignBar({ count, onAlign }:{ count:number; onAlign:(a:string)=>void }) {
  if (count<2) return null;
  const btns:{icon:React.ElementType;action:string;tip:string}[] = [
    { icon:AlignStartVertical, action:"left", tip:"Aligner à gauche" },
    { icon:AlignHorizontalJustifyCenter, action:"centerH", tip:"Centrer horizontalement" },
    { icon:AlignEndVertical, action:"right", tip:"Aligner à droite" },
    { icon:AlignStartHorizontal, action:"top", tip:"Aligner en haut" },
    { icon:AlignVerticalJustifyCenter, action:"centerV", tip:"Centrer verticalement" },
    { icon:AlignEndHorizontal, action:"bottom", tip:"Aligner en bas" },
    { icon:AlignHorizontalSpaceAround, action:"distH", tip:"Distribuer horizontalement" },
    { icon:AlignVerticalSpaceAround, action:"distV", tip:"Distribuer verticalement" },
    { icon:ArrowLeftRight, action:"sameW", tip:"Même largeur" },
    { icon:ArrowUpDown, action:"sameH", tip:"Même hauteur" },
  ];
  return (
    <div role="toolbar" aria-label="Outils d'alignement" style={{position:"fixed",bottom:40,left:"50%",transform:"translateX(-50%)",display:"flex",gap:2,padding:4,background:"rgba(10,10,22,0.95)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,backdropFilter:"blur(20px)",boxShadow:"0 8px 32px rgba(0,0,0,0.5)",zIndex:100}}>
      <span style={{fontSize:9,color:"#64748b",padding:"4px 8px",fontWeight:600}}>{count} sélectionnés</span>
      <div style={{width:1,background:"rgba(255,255,255,0.1)",margin:"2px 0"}}/>
      {btns.map(b=>{const I=b.icon;return <button key={b.action} title={b.tip} aria-label={b.tip} onClick={()=>onAlign(b.action)} style={{padding:5,borderRadius:5,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#94a3b8",cursor:"pointer",lineHeight:0}} onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="rgba(59,130,246,0.15)"}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.04)"}}><I size={13}/></button>})}
    </div>
  );
}

// ─── Layers Panel (#54-61 improvements) ─────────────────────────────────────
function LayersPanel({ mods, selected, multiSel, onSelect, onReorder, onToggleVis, onToggleLock, hoveredLayer, setHoveredLayer }:
  { mods:Mod[]; selected:string|null; multiSel:Set<string>; onSelect:(id:string)=>void; onReorder:(id:string,d:number)=>void; onToggleVis:(id:string)=>void; onToggleLock:(id:string)=>void; hoveredLayer:string|null; setHoveredLayer:(id:string|null)=>void }) {
  const [search, setSearch] = useState("");
  const onCanvas = useMemo(() => mods.filter(m=>m.onCanvas).sort((a,b)=>b.z-a.z), [mods]);
  const filtered = useMemo(() => {
    if(!search.trim()) return onCanvas;
    const q = search.toLowerCase();
    return onCanvas.filter(m => DEF_MAP[m.id]?.label.toLowerCase().includes(q) || m.id.includes(q));
  }, [onCanvas, search]);

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* #56: search in layers */}
      <div style={{padding:"8px 10px",borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
        <div style={{display:"flex",alignItems:"center",gap:4,padding:"0 6px",height:26,borderRadius:6,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)"}}>
          <Search size={10} color="#475569"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Filtrer..." aria-label="Filtrer les layers" style={{flex:1,background:"none",border:"none",color:"#e2e8f0",fontSize:10,outline:"none"}}/>
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"4px 0"}}>
        {filtered.length===0 && <div style={{padding:16,textAlign:"center",fontSize:11,color:"#334155"}}>Aucun layer</div>}
        {filtered.map(m=>{
          const d = DEF_MAP[m.id]; if(!d) return null;
          const isSel = selected===m.id || multiSel.has(m.id);
          return (
            <div key={m.id}
              onClick={()=>onSelect(m.id)}
              // #58: hover bidirectionnel
              onMouseEnter={()=>setHoveredLayer(m.id)}
              onMouseLeave={()=>setHoveredLayer(null)}
              style={{
                display:"flex",alignItems:"center",gap:6,padding:"5px 10px",
                cursor:"pointer",fontSize:10,
                background:isSel?"rgba(59,130,246,0.1)":(hoveredLayer===m.id?"rgba(255,255,255,0.04)":"transparent"),
                borderLeft:isSel?`2px solid #3b82f6`:"2px solid transparent",
              }}
            >
              <d.icon size={10} color={d.color} style={{flexShrink:0}}/>
              <span style={{flex:1,color:isSel?"#e2e8f0":"#94a3b8",fontWeight:isSel?600:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.label}</span>
              <span style={{fontSize:8,color:"#334155",minWidth:16,textAlign:"right"}}>z{m.z}</span>
              {/* #60: lock from layers */}
              <button onClick={e=>{e.stopPropagation();onToggleLock(m.id);}} aria-label={m.locked?"Déverrouiller":"Verrouiller"} title={m.locked?"Déverrouiller":"Verrouiller"} style={{background:"none",border:"none",cursor:"pointer",lineHeight:0,padding:2,color:m.locked?"#f59e0b":"#334155"}}>
                {m.locked?<Lock size={10}/>:<Unlock size={10}/>}
              </button>
              <button onClick={e=>{e.stopPropagation();onToggleVis(m.id);}} aria-label={m.open?"Masquer le contenu":"Afficher le contenu"} title={m.open?"Masquer":"Afficher"} style={{background:"none",border:"none",cursor:"pointer",lineHeight:0,padding:2,color:m.open?"#64748b":"#334155"}}>
                {m.open?<Eye size={10}/>:<EyeOff size={10}/>}
              </button>
              <div style={{display:"flex",flexDirection:"column",gap:0}}>
                <button onClick={e=>{e.stopPropagation();onReorder(m.id,1);}} aria-label="Monter" title="Monter" style={{background:"none",border:"none",cursor:"pointer",lineHeight:0,padding:1,color:"#334155"}}><ChevronUp size={9}/></button>
                <button onClick={e=>{e.stopPropagation();onReorder(m.id,-1);}} aria-label="Descendre" title="Descendre" style={{background:"none",border:"none",cursor:"pointer",lineHeight:0,padding:1,color:"#334155"}}><ChevronDown size={9}/></button>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{padding:"6px 10px",borderTop:"1px solid rgba(255,255,255,0.07)",fontSize:9,color:"#475569"}}>{onCanvas.length} layers</div>
    </div>
  );
}

// ─── Properties Panel (#42-53 improvements) ─────────────────────────────────
function PropsPanel({ mod, def, multiCount, onUpdate, onToggleOpen, onRemove, onToggleLock }:
  { mod:Mod; def:ModDef; multiCount:number; onUpdate:(u:Partial<Mod>)=>void; onToggleOpen:()=>void; onRemove:()=>void; onToggleLock:()=>void }) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  return (
    <div style={{flex:1,overflowY:"auto"}}>
      {/* Module info */}
      <div style={{padding:"14px",borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:28,height:28,borderRadius:7,background:`${def.color}18`,border:`1px solid ${def.color}33`,display:"flex",alignItems:"center",justifyContent:"center"}}><def.icon size={14} color={def.color}/></div>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:"#f1f5f9"}}>{def.label}</div>
            <div style={{fontSize:9,color:"#475569"}}>{def.desc || def.id}</div>
          </div>
        </div>
      </div>

      {/* Position & Size */}
      <div style={{padding:"14px",borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
        <div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10,display:"flex",alignItems:"center",gap:5}}><Move size={10}/> Position & Taille</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {(["x","y","w","h"] as const).map(k=>(
            <div key={k}>
              <label htmlFor={`prop-${k}`} style={{fontSize:9,color:"#475569",fontWeight:600,marginBottom:3,display:"block"}}>{k.toUpperCase()}</label>
              <div style={{display:"flex",alignItems:"center"}}>
                <input id={`prop-${k}`} type="number" value={mod[k]} onChange={e=>onUpdate({[k]:sg(parseInt(e.target.value)||0)})} step={GRID}
                  aria-label={`${k.toUpperCase()} en pixels`}
                  style={{width:"100%",padding:"5px 8px",borderRadius:"6px 0 0 6px",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRight:"none",color:"#e2e8f0",fontSize:11,fontVariantNumeric:"tabular-nums",outline:"none"}}/>
                {/* #43: unité px affichée */}
                <span style={{padding:"5px 6px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"0 6px 6px 0",fontSize:9,color:"#475569",lineHeight:"16px"}}>px</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{marginTop:10,fontSize:9,fontWeight:600,color:"#475569",marginBottom:6}}>Taille rapide</div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {/* #51: dimensions dans le tooltip */}
          {SIZE_PRESETS.map(p=><button key={p.label} title={p.desc} aria-label={`Taille ${p.label} (${p.desc})`} onClick={()=>onUpdate({w:p.w,h:p.h})} style={{padding:"3px 8px",borderRadius:5,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#64748b",fontSize:9,cursor:"pointer"}}>{p.label}</button>)}
        </div>
        {/* #45: pas de grille communiqué */}
        <div style={{marginTop:6,fontSize:8,color:"#334155"}}>Grille : {GRID}px</div>
      </div>

      {/* Display */}
      <div style={{padding:"14px",borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
        <div style={{fontSize:9,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10,display:"flex",alignItems:"center",gap:5}}><Layers size={10}/> Affichage</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {/* #47: z-index avec +/- */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontSize:11,color:"#94a3b8"}}>Z-index</span>
            <div style={{display:"flex",alignItems:"center",gap:2}}>
              <button onClick={()=>onUpdate({z:Math.max(1,mod.z-1)})} aria-label="Diminuer z-index" style={{width:22,height:22,borderRadius:4,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:"#94a3b8",cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
              <span style={{minWidth:28,textAlign:"center",fontSize:11,color:"#e2e8f0",fontVariantNumeric:"tabular-nums"}}>{mod.z}</span>
              <button onClick={()=>onUpdate({z:mod.z+1})} aria-label="Augmenter z-index" style={{width:22,height:22,borderRadius:4,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:"#94a3b8",cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
            </div>
          </div>
          {/* #46: renamed "Contenu déplié" */}
          <ToggleSw label="Contenu déplié" on={mod.open} onToggle={onToggleOpen} color="#22c55e"/>
          <ToggleSw label="Verrouillé" on={mod.locked} onToggle={onToggleLock} color="#f59e0b"/>
        </div>
      </div>

      {/* Remove button - #49: with confirmation */}
      <div style={{padding:"14px"}}>
        <button onClick={()=>setConfirmRemove(true)} aria-label="Retirer du canvas" style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderRadius:7,background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",color:"#ef4444",fontSize:11,fontWeight:600,cursor:"pointer",width:"100%"}}><Trash2 size={12}/> Retirer du canvas</button>
      </div>
      <ConfirmDialog
        open={confirmRemove}
        title="Retirer le module ?"
        message={`Le module "${def.label}" sera retiré du canvas. Vous pourrez le remettre depuis la palette.`}
        confirmLabel="Retirer"
        confirmColor="#ef4444"
        onConfirm={()=>{setConfirmRemove(false);onRemove();}}
        onCancel={()=>setConfirmRemove(false)}
      />
    </div>);
}

function ToggleSw({label,on,onToggle,color}:{label:string;on:boolean;onToggle:()=>void;color:string}) {
  return <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}><span style={{fontSize:11,color:"#94a3b8"}}>{label}</span><button onClick={onToggle} aria-label={`${label}: ${on?"activé":"désactivé"}`} style={{width:40,height:22,borderRadius:11,border:"none",cursor:"pointer",position:"relative",background:on?`${color}30`:"rgba(255,255,255,0.1)",transition:"background 0.2s"}}><div style={{width:16,height:16,borderRadius:"50%",position:"absolute",top:3,left:on?21:3,background:on?color:"#475569",transition:"left 0.2s"}}/></button></div>;
}

// ─── Left sidebar palette (#11-21 improvements) ─────────────────────────────
function Palette({ mods, searchQ, setSearchQ, expandedCats, toggleCat, addToCanvas, onDragStart, allExpanded, toggleAllCats }:
  { mods:Mod[]; searchQ:string; setSearchQ:(v:string)=>void; expandedCats:Set<string>; toggleCat:(id:string)=>void; addToCanvas:(id:string)=>void; onDragStart:(e:React.DragEvent,id:string)=>void; allExpanded:boolean; toggleAllCats:()=>void }) {
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
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div style={{fontSize:12,fontWeight:700,color:"#f1f5f9"}}>Modules</div>
          {/* #14: tout déplier/replier */}
          <button onClick={toggleAllCats} title={allExpanded?"Tout replier":"Tout déplier"} aria-label={allExpanded?"Tout replier":"Tout déplier"} style={{padding:"2px 6px",borderRadius:4,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#475569",fontSize:9,cursor:"pointer"}}>{allExpanded?"Replier":"Déplier"}</button>
        </div>
        {/* #20: instruction plus visible */}
        <div style={{fontSize:10,color:"#64748b",marginBottom:8}}>Cliquez ou glissez un module vers le canvas</div>
        <div style={{display:"flex",alignItems:"center",gap:6,padding:"0 8px",height:30,borderRadius:7,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)"}}>
          <Search size={12} color="#475569"/>
          <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Rechercher un module..." aria-label="Rechercher un module" style={{flex:1,background:"none",border:"none",color:"#e2e8f0",fontSize:11,outline:"none"}}/>
          {searchQ && <button onClick={()=>setSearchQ("")} aria-label="Effacer la recherche" style={{background:"none",border:"none",cursor:"pointer",color:"#475569",lineHeight:0}}><X size={11}/></button>}
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"8px 0"}} role="listbox" aria-label="Liste des modules">
        {/* #13: message quand aucun résultat */}
        {searchQ && Object.keys(grouped).length===0 && (
          <div style={{padding:20,textAlign:"center"}}>
            <Search size={20} color="#334155" style={{margin:"0 auto 8px"}}/>
            <div style={{fontSize:11,color:"#475569"}}>Aucun module trouvé pour &ldquo;{searchQ}&rdquo;</div>
            <div style={{fontSize:10,color:"#334155",marginTop:4}}>Essayez un autre terme</div>
          </div>
        )}
        {CATEGORIES.map(cat => {
          const items = grouped[cat.id]; if (!items?.length) return null;
          const isExp = expandedCats.has(cat.id);
          const CatIcon = cat.icon;
          const onCount = items.filter(d => onIds.has(d.id)).length;
          const offCount = items.length - onCount;
          return (
            <div key={cat.id} style={{marginBottom:2}}>
              <button onClick={()=>toggleCat(cat.id)} aria-expanded={isExp} aria-label={`${cat.label} - ${onCount}/${items.length} actifs`} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"7px 14px",background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:11,fontWeight:600,textAlign:"left"}}>
                {isExp?<ChevronDown size={11}/>:<ChevronRight size={11}/>}<CatIcon size={12}/>
                <span style={{flex:1}}>{cat.label}</span>
                {/* #11: ratio actifs/total */}
                <span style={{fontSize:9,color:"#475569",background:"rgba(255,255,255,0.06)",padding:"1px 5px",borderRadius:8}}>{onCount}/{items.length}</span>
              </button>
              {isExp && (<div style={{padding:"2px 10px 6px 32px"}}>{items.map(d=>{
                const isOn = onIds.has(d.id); const DIcon = d.icon;
                return (
                  <div key={d.id} role="option" aria-selected={isOn} draggable={!isOn} onDragStart={e=>!isOn&&onDragStart(e,d.id)}
                    // #12: tooltip description
                    title={d.desc ? `${d.desc} (${isOn?"déjà sur le canvas":"cliquer pour ajouter"})` : undefined}
                    style={{display:"flex",alignItems:"center",gap:7,padding:"5px 8px",borderRadius:6,marginBottom:2,cursor:isOn?"default":"grab",background:isOn?"rgba(255,255,255,0.02)":"transparent",opacity:isOn?0.5:1,transition:"all 0.15s"}}
                    onClick={()=>!isOn&&addToCanvas(d.id)}
                    onMouseEnter={e=>{if(!isOn)(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.06)"}}
                    onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background=isOn?"rgba(255,255,255,0.02)":"transparent"}}>
                    <div style={{width:22,height:22,borderRadius:5,background:`${d.color}18`,border:`1px solid ${d.color}33`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><DIcon size={11} color={d.color}/></div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:10,color:isOn?"#475569":"#94a3b8"}}>{d.label}</div>
                      {d.desc && <div style={{fontSize:8,color:"#334155",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.desc}</div>}
                    </div>
                    {/* #15: badge "Sur le canvas" */}
                    {isOn ? <span style={{fontSize:8,color:"#22c55e",background:"rgba(34,197,94,0.1)",padding:"1px 4px",borderRadius:4}}>Actif</span> : <Grip size={10} color="#334155"/>}
                  </div>);
              })}</div>)}
            </div>);
        })}
      </div>
      <div style={{padding:"10px 14px",borderTop:"1px solid rgba(255,255,255,0.07)",fontSize:9,color:"#475569"}}>{mods.filter(m=>m.onCanvas).length}/{DEFS.length} modules actifs</div>
    </div>);
}

// ─── Onboarding overlay (#111) ──────────────────────────────────────────────
function OnboardingOverlay({ onDismiss }:{ onDismiss:()=>void }) {
  const [step, setStep] = useState(0);
  const steps = [
    { title:"Bienvenue dans le Layout Builder !", desc:"Personnalisez l'interface de votre application CueForge en organisant les modules comme vous le souhaitez.", icon:LayoutDashboard, color:"#3b82f6" },
    { title:"Ajoutez des modules", desc:"Glissez ou cliquez sur les modules dans la palette à gauche pour les ajouter au canvas.", icon:Plus, color:"#22c55e" },
    { title:"Déplacez et redimensionnez", desc:"Glissez les modules pour les repositionner. Utilisez les poignées sur les bords pour redimensionner.", icon:Move, color:"#a855f7" },
    { title:"Sauvegardez votre layout", desc:"Cliquez sur 'Sauvegarder' pour enregistrer. Utilisez les presets pour essayer des configurations prédéfinies.", icon:Save, color:"#f59e0b" },
  ];
  const s = steps[step];
  return (
    <div style={{position:"fixed",inset:0,zIndex:10001,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.7)",backdropFilter:"blur(4px)"}}>
      <div style={{background:"#12121f",border:"1px solid rgba(255,255,255,0.12)",borderRadius:16,padding:32,width:420,boxShadow:"0 20px 60px rgba(0,0,0,0.8)",textAlign:"center"}}>
        <div style={{width:56,height:56,borderRadius:14,background:`${s.color}15`,border:`1px solid ${s.color}30`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}><s.icon size={28} color={s.color}/></div>
        <div style={{fontSize:18,fontWeight:700,color:"#f1f5f9",marginBottom:8}}>{s.title}</div>
        <div style={{fontSize:13,color:"#94a3b8",lineHeight:1.6,marginBottom:24}}>{s.desc}</div>
        {/* Dots */}
        <div style={{display:"flex",justifyContent:"center",gap:6,marginBottom:20}}>
          {steps.map((_,i)=><div key={i} style={{width:8,height:8,borderRadius:4,background:i===step?"#3b82f6":"rgba(255,255,255,0.1)",transition:"all 0.2s"}}/>)}
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"center"}}>
          {step>0 && <button onClick={()=>setStep(step-1)} style={{padding:"8px 20px",borderRadius:8,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:"#94a3b8",fontSize:12,cursor:"pointer"}}>Précédent</button>}
          {step<steps.length-1 ? (
            <button onClick={()=>setStep(step+1)} style={{padding:"8px 20px",borderRadius:8,background:"rgba(59,130,246,0.15)",border:"1px solid rgba(59,130,246,0.3)",color:"#3b82f6",fontSize:12,cursor:"pointer",fontWeight:700}}>Suivant</button>
          ) : (
            <button onClick={onDismiss} style={{padding:"8px 20px",borderRadius:8,background:"linear-gradient(135deg,#2563eb,#7c3aed)",border:"none",color:"white",fontSize:12,cursor:"pointer",fontWeight:700}}>Commencer !</button>
          )}
          <button onClick={onDismiss} style={{padding:"8px 12px",borderRadius:8,background:"none",border:"none",color:"#475569",fontSize:11,cursor:"pointer"}}>Passer</button>
        </div>
      </div>
    </div>
  );
}

// ─── Preview Mode (#113) ────────────────────────────────────────────────────
function PreviewMode({ mods, onClose }:{ mods:Mod[]; onClose:()=>void }) {
  const onCanvas = mods.filter(m=>m.onCanvas);
  return (
    <div style={{position:"fixed",inset:0,zIndex:10000,background:"#04040b"}}>
      <div style={{position:"relative",width:"100%",height:"100%"}}>
        {onCanvas.map(mod=>{
          const def = DEF_MAP[mod.id]; if(!def) return null;
          return (
            <div key={mod.id} style={{position:"absolute",left:mod.x,top:mod.y,width:mod.w,height:mod.h,zIndex:mod.z,borderRadius:8,background:"rgba(255,255,255,0.03)",border:`1px solid ${def.color}25`,overflow:"hidden"}}>
              <div style={{display:"flex",alignItems:"center",gap:5,padding:"4px 8px",borderBottom:"1px solid rgba(255,255,255,0.05)",background:"rgba(0,0,0,0.2)"}}>
                <def.icon size={10} color={def.color}/><span style={{fontSize:9,fontWeight:600,color:"#64748b"}}>{def.label}</span>
              </div>
              {mod.open && <ModContent id={mod.id} w={mod.w} h={mod.h-26}/>}
            </div>
          );
        })}
      </div>
      <button onClick={onClose} aria-label="Quitter l'aperçu" style={{position:"fixed",top:16,right:16,padding:"8px 16px",borderRadius:8,background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",color:"#e2e8f0",fontSize:12,cursor:"pointer",fontWeight:600,backdropFilter:"blur(8px)",zIndex:10001}}>
        <X size={14} style={{verticalAlign:"middle",marginRight:4}}/> Quitter l&apos;aperçu
      </button>
      <div style={{position:"fixed",bottom:16,left:"50%",transform:"translateX(-50%)",padding:"6px 16px",borderRadius:8,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(8px)",color:"#64748b",fontSize:11,zIndex:10001}}>
        Mode aperçu — Appuyez Échap pour revenir à l&apos;éditeur
      </div>
    </div>
  );
}

// ─── Import/Export (#75) ────────────────────────────────────────────────────
function exportLayout(mods:Mod[], name:string) {
  const data = JSON.stringify({ name, mods, exportedAt:new Date().toISOString(), version:"v5" }, null, 2);
  const blob = new Blob([data], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `layout-${name.replace(/\s+/g,"-")}.json`; a.click();
  URL.revokeObjectURL(url);
}
function importLayout(callback:(layout:{name:string;mods:Mod[]})=>void) {
  const input = document.createElement("input"); input.type = "file"; input.accept = ".json";
  input.onchange = (e:any) => {
    const file = e.target.files?.[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try { const data = JSON.parse(ev.target?.result as string); if(data.mods) callback(data); } catch(e){}
    };
    reader.readAsText(file);
  };
  input.click();
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────
function LayoutBuilderInner() {
  const { addToast } = useContext(ToastContext);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [mods, setMods] = useState<Mod[]>(loadMods);
  const [selected, setSelected] = useState<string|null>(null);
  const [multiSel, setMultiSel] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<DragState|null>(null);
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
  const [rubberBand, setRubberBand] = useState<{x1:number;y1:number;x2:number;y2:number}|null>(null);
  const [hoveredLayer, setHoveredLayer] = useState<string|null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // #117: dirty tracking
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedMods, setLastSavedMods] = useState<string>("");

  // Confirm dialogs
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmPreset, setConfirmPreset] = useState<string|null>(null);
  const [confirmDeleteLayout, setConfirmDeleteLayout] = useState<string|null>(null);
  const [confirmLoadLayout, setConfirmLoadLayout] = useState<SavedLayout|null>(null);

  const [undoStack, setUndoStack] = useState<Mod[][]>([]);
  const [redoStack, setRedoStack] = useState<Mod[][]>([]);
  const modsRef = useRef(mods);
  useEffect(() => { modsRef.current = mods; }, [mods]);
  const maxZ = Math.max(...mods.map(m=>m.z), 1);

  // #111: onboarding first visit
  useEffect(() => {
    const key = "cueforge_layout_onboarded";
    if (!localStorage.getItem(key)) { setShowOnboarding(true); localStorage.setItem(key, "1"); }
  }, []);

  // #117: dirty tracking
  useEffect(() => {
    const current = JSON.stringify(mods);
    if (lastSavedMods && current !== lastSavedMods) setIsDirty(true);
    else setIsDirty(false);
  }, [mods, lastSavedMods]);

  // Init lastSavedMods
  useEffect(() => { setLastSavedMods(JSON.stringify(mods)); }, []); // eslint-disable-line

  // #117: beforeunload warning
  useEffect(() => {
    const h = (e:BeforeUnloadEvent) => { if(isDirty) { e.preventDefault(); e.returnValue=""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [isDirty]);

  // #79: auto-save with debounce
  const autoSaveTimer = useRef<NodeJS.Timeout|null>(null);
  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => { saveMods(mods); }, AUTOSAVE_DELAY);
    return () => { if(autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [mods]);

  const pushUndo = useCallback((prev:Mod[]) => { setUndoStack(s=>[...s.slice(-MAX_UNDO),prev]); setRedoStack([]); }, []);
  const undo = useCallback(() => { setUndoStack(s=>{if(!s.length) return s; setRedoStack(r=>[...r,modsRef.current]); const p=s[s.length-1]; setMods(p); saveMods(p); return s.slice(0,-1);}); addToast("Action annulée","info"); }, [addToast]);
  const redo = useCallback(() => { setRedoStack(s=>{if(!s.length) return s; setUndoStack(u=>[...u,modsRef.current]); const n=s[s.length-1]; setMods(n); saveMods(n); return s.slice(0,-1);}); addToast("Action rétablie","info"); }, [addToast]);

  // Keyboard shortcuts
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
          addToast(`${ids.size} module(s) retiré(s)`,"info");
        }
      }
      if (e.key==="Escape") {
        if(showPreview) { setShowPreview(false); return; }
        setSelected(null); setMultiSel(new Set()); setCtxMenu(null);
      }
      if ((e.metaKey||e.ctrlKey) && e.key==="a" && document.activeElement?.tagName!=="INPUT") {
        e.preventDefault();
        setMultiSel(new Set(modsRef.current.filter(m=>m.onCanvas).map(m=>m.id)));
      }
      // #40: Ctrl+D to duplicate
      if ((e.metaKey||e.ctrlKey) && e.key==="d" && document.activeElement?.tagName!=="INPUT") {
        e.preventDefault();
        if(selected) duplicateModule(selected);
      }
    };
    window.addEventListener("keydown",h); return ()=>window.removeEventListener("keydown",h);
  }, [selected, multiSel, undo, redo, pushUndo, showPreview, addToast]);

  // #35: Ctrl+wheel zoom
  useEffect(() => {
    const el = canvasRef.current; if(!el) return;
    const h = (e:WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom(z => Math.min(2, Math.max(0.3, +(z - e.deltaY * 0.001).toFixed(2))));
      }
    };
    el.addEventListener("wheel", h, { passive:false });
    return () => el.removeEventListener("wheel", h);
  }, []);

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
        if (drag.multiOffsets) {
          const off = drag.multiOffsets.find(o=>o.id===m.id);
          if (!off) return m;
          return {...m, x:sg(drag.origX + dx + off.dx), y:sg(drag.origY + dy + off.dy)};
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

  // Canvas pointer down
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
  const removeFromCanvas = useCallback((id:string)=>{pushUndo(modsRef.current);setMods(p=>{const u=p.map(m=>m.id===id?{...m,onCanvas:false}:m);saveMods(u);return u;});setSelected(s=>s===id?null:s);setMultiSel(p=>{const n=new Set(p);n.delete(id);return n;}); addToast("Module retiré","info");}, [pushUndo, addToast]);

  // #33: smart positioning for new modules
  const findFreePosition = useCallback(() => {
    const onCanvas = modsRef.current.filter(m => m.onCanvas);
    const cx = canvasRef.current ? (canvasRef.current.scrollLeft/zoom)+300 : 300;
    const cy = canvasRef.current ? (canvasRef.current.scrollTop/zoom)+100 : 100;
    let x = sg(cx), y = sg(cy);
    // Check for overlaps and offset
    let attempts = 0;
    while (attempts < 20) {
      const overlap = onCanvas.some(m => Math.abs(m.x - x) < 30 && Math.abs(m.y - y) < 30);
      if (!overlap) break;
      x += 32; y += 24;
      attempts++;
    }
    return { x, y };
  }, [zoom]);

  const addToCanvas = useCallback((id:string) => {
    pushUndo(modsRef.current);
    const { x, y } = findFreePosition();
    setMods(p=>{const u=p.map(m=>m.id===id?{...m,onCanvas:true,x,y,z:maxZ+1,open:true}:m);saveMods(u);return u;});
    setSelected(id); setMultiSel(new Set()); setShowRight(true);
    addToast(`Module ajouté au canvas`,"success");
  }, [maxZ, pushUndo, findFreePosition, addToast]);

  // #40: duplicate module
  const duplicateModule = useCallback((id:string) => {
    const mod = modsRef.current.find(m=>m.id===id);
    if(!mod || !mod.onCanvas) return;
    // Can't duplicate (unique IDs) but we can toast about it
    addToast("Duplication non disponible pour les modules uniques","warning");
  }, [addToast]);

  const updateMod = useCallback((id:string, u:Partial<Mod>)=>{pushUndo(modsRef.current);setMods(p=>{const up=p.map(m=>m.id===id?{...m,...u}:m);saveMods(up);return up;});}, [pushUndo]);

  const handleAlign = useCallback((action:string) => {
    const ids = multiSel.size > 1 ? multiSel : new Set<string>();
    if (ids.size < 2) return;
    pushUndo(modsRef.current);
    setMods(p => { const u = alignMods(p, ids, action); saveMods(u); return u; });
    addToast("Alignement appliqué","success");
  }, [multiSel, pushUndo, addToast]);

  const handleCtxAction = useCallback((action:string) => {
    const id = ctxMenu?.modId;
    switch(action) {
      case "lock": if(id) toggleLock(id); break;
      case "open": if(id) toggleOpen(id); break;
      case "duplicate": if(id) duplicateModule(id); break;
      case "front": if(id) { pushUndo(modsRef.current); setMods(p=>{const u=p.map(m=>m.id===id?{...m,z:maxZ+10}:m);saveMods(u);return u;}); } break;
      case "back": if(id) { pushUndo(modsRef.current); setMods(p=>{const u=p.map(m=>m.id===id?{...m,z:1}:m);saveMods(u);return u;}); } break;
      case "remove": if(id) removeFromCanvas(id); break;
      case "selectAll": setMultiSel(new Set(modsRef.current.filter(m=>m.onCanvas).map(m=>m.id))); break;
    }
    setCtxMenu(null);
  }, [ctxMenu, toggleLock, toggleOpen, removeFromCanvas, pushUndo, maxZ, duplicateModule]);

  const reorderZ = useCallback((id:string, dir:number) => {
    pushUndo(modsRef.current);
    setMods(p=>{const u=p.map(m=>m.id===id?{...m,z:Math.max(1,m.z+dir)}:m);saveMods(u);return u;});
  }, [pushUndo]);

  // #63: renamed from "Mettre en prod" to "Sauvegarder"
  const handleSave = ()=>{
    saveMods(mods);
    setLastSavedMods(JSON.stringify(mods));
    setIsDirty(false);
    addToast("Layout sauvegardé !","success");
  };

  // #64: reset with confirmation
  const handleResetConfirmed = ()=>{
    pushUndo(mods);
    const d=makeDefault();
    setMods(d);saveMods(d);setSelected(null);setMultiSel(new Set());
    setConfirmReset(false);
    addToast("Layout réinitialisé","info");
  };

  // #73: preset with confirmation
  const handlePresetConfirmed = (pid:string)=>{
    pushUndo(mods);
    const p=applyPreset(pid);
    setMods(p);saveMods(p);setSelected(null);setMultiSel(new Set());setShowPresets(false);
    setConfirmPreset(null);
    addToast("Preset appliqué","success");
  };

  const handleSaveLayout = ()=>{
    if(!layoutName.trim()) return;
    const l:SavedLayout = {id:Date.now().toString(), name:layoutName.trim(), mods:[...mods], date:new Date().toISOString()};
    const updated = [...savedLayouts, l]; setSavedLayouts(updated); saveSavedLayouts(updated);
    setLayoutName(""); setShowSaveDialog(false);
    addToast(`Layout "${l.name}" sauvegardé`,"success");
  };
  const handleLoadLayoutConfirmed = (l:SavedLayout) => {
    pushUndo(mods); setMods(l.mods); saveMods(l.mods); setSelected(null); setMultiSel(new Set()); setShowPresets(false);
    setConfirmLoadLayout(null);
    addToast(`Layout "${l.name}" chargé`,"success");
  };
  const handleDeleteLayoutConfirmed = (id:string) => {
    const u = savedLayouts.filter(l=>l.id!==id); setSavedLayouts(u); saveSavedLayouts(u);
    setConfirmDeleteLayout(null);
    addToast("Layout supprimé","info");
  };

  // #31: double click opens properties
  const handleDblClick = useCallback((id:string) => {
    setSelected(id); setShowRight(true); setRightTab("properties");
  }, []);

  // #57: scroll to module when selected from layers
  const scrollToModule = useCallback((id:string) => {
    const mod = modsRef.current.find(m=>m.id===id);
    if (!mod || !canvasRef.current) return;
    const el = canvasRef.current;
    el.scrollTo({ left: (mod.x - 100)*zoom, top: (mod.y - 100)*zoom, behavior:"smooth" });
    setSelected(id); setRightTab("properties");
  }, [zoom]);

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
    addToast("Module ajouté","success");
  }, [maxZ, pushUndo, zoom, addToast]);

  const toggleCat = useCallback((id:string)=>{setExpandedCats(p=>{const n=new Set(p);if(n.has(id))n.delete(id);else n.add(id);return n;});}, []);
  // #14: toggle all categories
  const allExpanded = expandedCats.size >= CATEGORIES.length;
  const toggleAllCats = useCallback(() => {
    if (allExpanded) setExpandedCats(new Set());
    else setExpandedCats(new Set(CATEGORIES.map(c=>c.id)));
  }, [allExpanded]);

  // #75: import handler
  const handleImport = useCallback(() => {
    importLayout((data) => {
      pushUndo(modsRef.current);
      setMods(data.mods); saveMods(data.mods);
      addToast(`Layout "${data.name}" importé`,"success");
    });
  }, [pushUndo, addToast]);

  const onCanvas = mods.filter(m=>m.onCanvas);
  const selMod = selected ? mods.find(m=>m.id===selected) : null;
  const selDef = selected ? DEF_MAP[selected] : null;

  // #36: fit all modules in view
  const fitAll = useCallback(() => {
    if (!canvasRef.current || onCanvas.length === 0) return;
    const minX = Math.min(...onCanvas.map(m=>m.x));
    const minY = Math.min(...onCanvas.map(m=>m.y));
    const maxX = Math.max(...onCanvas.map(m=>m.x+m.w));
    const maxY = Math.max(...onCanvas.map(m=>m.y+m.h));
    const cw = canvasRef.current.clientWidth;
    const ch = canvasRef.current.clientHeight;
    const zx = cw / (maxX - minX + 100);
    const zy = ch / (maxY - minY + 100);
    const newZoom = Math.min(2, Math.max(0.3, Math.min(zx, zy)));
    setZoom(+(newZoom).toFixed(2));
    setTimeout(() => {
      canvasRef.current?.scrollTo({ left: (minX - 50) * newZoom, top: (minY - 50) * newZoom, behavior: "smooth" });
    }, 100);
  }, [onCanvas]);

  // Preview mode
  if (showPreview) return <PreviewMode mods={mods} onClose={()=>setShowPreview(false)}/>;

  return (
    <div style={{height:"100vh",display:"flex",flexDirection:"column",background:"#04040b",color:"#e2e8f0",fontFamily:"system-ui,-apple-system,sans-serif",overflow:"hidden",cursor:drag?.mode==="move"?"grabbing":"default"}}>

      {/* CSS animations */}
      <style>{`
        @keyframes fadeScaleIn { from { opacity:0;transform:scale(0.95) } to { opacity:1;transform:scale(1) } }
      `}</style>

      {/* #10: aria-live zone for announcements */}
      <div aria-live="polite" aria-atomic="true" style={{position:"absolute",width:1,height:1,overflow:"hidden",clip:"rect(0,0,0,0)"}} id="aria-live"/>

      {/* ─── Header (#62: regrouped, #63: renamed, #67: simplified) ─── */}
      <header style={{padding:"8px 16px",borderBottom:"1px solid rgba(255,255,255,0.07)",background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",gap:8,flexShrink:0,backdropFilter:"blur(12px)",zIndex:100}}>
        {/* #68: breadcrumb */}
        <Link href="/admin" aria-label="Retour à l'admin" style={{display:"flex",alignItems:"center",gap:4,color:"#64748b",textDecoration:"none",fontSize:11}}><ChevronLeft size={12}/> Admin</Link>
        <div style={{width:1,height:12,background:"rgba(255,255,255,0.1)"}}/>
        <LayoutDashboard size={14} color="#3b82f6"/>
        <div>
          {/* #116: titre plus descriptif */}
          <div style={{fontSize:13,fontWeight:700,color:"#f1f5f9",lineHeight:1.2}}>Layout Builder</div>
          <div style={{fontSize:9,color:"#475569"}}>Personnalisez votre interface CueForge</div>
        </div>

        {/* Panel toggles - #69: with tooltips */}
        <div style={{display:"flex",gap:3,marginLeft:8}}>
          <HdrBtn on={showLeft} onClick={()=>setShowLeft(p=>!p)} icon={PanelLeftClose} tip="Palette de modules" label="Palette"/>
          <HdrBtn on={showRight} onClick={()=>setShowRight(p=>!p)} icon={PanelRightClose} tip="Panneau propriétés & layers" label="Panneau"/>
          {/* #70: snap avec tooltip descriptif */}
          <HdrBtn on={snapOn} onClick={()=>setSnapOn(p=>!p)} icon={Magnet} tip="Aimantation à la grille et aux modules" color="#ec4899"/>
        </div>

        <div style={{width:1,height:12,background:"rgba(255,255,255,0.08)"}}/>

        {/* Zoom - #35: + fit all #36 */}
        <div style={{display:"flex",alignItems:"center",gap:3}}>
          <SmBtn onClick={()=>setZoom(z=>Math.max(0.3,+(z-0.1).toFixed(1)))} icon={ZoomOut} tip="Zoom arrière"/>
          <span style={{fontSize:10,color:"#94a3b8",fontVariantNumeric:"tabular-nums",minWidth:36,textAlign:"center"}}>{Math.round(zoom*100)}%</span>
          <SmBtn onClick={()=>setZoom(z=>Math.min(2,+(z+0.1).toFixed(1)))} icon={ZoomIn} tip="Zoom avant"/>
          <SmBtn onClick={()=>setZoom(1)} label="1:1" tip="Zoom 100%"/>
          <SmBtn onClick={fitAll} icon={Maximize2} tip="Ajuster à l'écran"/>
        </div>

        <div style={{width:1,height:12,background:"rgba(255,255,255,0.08)"}}/>

        {/* Undo/Redo - #66: count tooltip */}
        <div style={{display:"flex",gap:2}}>
          <SmBtn onClick={undo} icon={Undo2} disabled={!undoStack.length} tip={`Annuler (${undoStack.length} actions)`}/>
          <SmBtn onClick={redo} icon={Redo2} disabled={!redoStack.length} tip={`Rétablir (${redoStack.length} actions)`}/>
        </div>

        <div style={{width:1,height:12,background:"rgba(255,255,255,0.08)"}}/>

        {/* Presets */}
        <div style={{position:"relative"}}>
          <HdrBtn on={showPresets} onClick={()=>setShowPresets(p=>!p)} icon={LayoutTemplate} label="Presets" tip="Presets et layouts sauvegardés" color="#a855f7"/>
          {showPresets && <div style={{position:"absolute",top:"100%",left:0,marginTop:6,background:"rgba(10,10,22,0.95)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:8,width:300,zIndex:999,backdropFilter:"blur(20px)",boxShadow:"0 12px 40px rgba(0,0,0,0.8)"}}>
            <div style={{fontSize:9,fontWeight:700,color:"#475569",textTransform:"uppercase",padding:"4px 8px",marginBottom:4}}>Presets intégrés</div>
            {BUILTIN_PRESETS.map(p=><PresetBtn key={p.id} label={p.label} desc={p.desc} onClick={()=>setConfirmPreset(p.id)}/>)}
            {savedLayouts.length > 0 && <>
              <div style={{fontSize:9,fontWeight:700,color:"#475569",textTransform:"uppercase",padding:"4px 8px",marginTop:8,marginBottom:4}}>Mes layouts</div>
              {savedLayouts.map(l=><PresetBtn key={l.id} label={l.name} desc={new Date(l.date).toLocaleDateString()} onClick={()=>setConfirmLoadLayout(l)} onDelete={()=>setConfirmDeleteLayout(l.id)}/>)}
            </>}
            <div style={{borderTop:"1px solid rgba(255,255,255,0.07)",marginTop:8,paddingTop:8}}>
              {showSaveDialog ? (
                <div style={{display:"flex",gap:4}}>
                  <input value={layoutName} onChange={e=>setLayoutName(e.target.value)} placeholder="Nom du layout" onKeyDown={e=>e.key==="Enter"&&handleSaveLayout()} aria-label="Nom du layout" style={{flex:1,padding:"6px 8px",borderRadius:6,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.15)",color:"#e2e8f0",fontSize:11,outline:"none"}}/>
                  <button onClick={handleSaveLayout} aria-label="Confirmer la sauvegarde" style={{padding:"6px 10px",borderRadius:6,background:"rgba(34,197,94,0.15)",border:"1px solid rgba(34,197,94,0.3)",color:"#22c55e",fontSize:10,cursor:"pointer",fontWeight:700}}>OK</button>
                </div>
              ) : (
                <button onClick={()=>setShowSaveDialog(true)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"8px",borderRadius:7,background:"rgba(59,130,246,0.1)",border:"1px solid rgba(59,130,246,0.2)",color:"#3b82f6",fontSize:11,cursor:"pointer",fontWeight:600}}><Save size={12}/> Sauvegarder le layout actuel</button>
              )}
              {/* #75: import/export */}
              <div style={{display:"flex",gap:4,marginTop:6}}>
                <button onClick={handleImport} aria-label="Importer un layout" style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:4,padding:"6px",borderRadius:6,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#64748b",fontSize:10,cursor:"pointer"}}><FileUp size={10}/> Importer</button>
                <button onClick={()=>exportLayout(mods,"CueForge Layout")} aria-label="Exporter le layout" style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:4,padding:"6px",borderRadius:6,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#64748b",fontSize:10,cursor:"pointer"}}><FileDown size={10}/> Exporter</button>
              </div>
            </div>
          </div>}
        </div>

        {/* #113: preview button */}
        <HdrBtn on={false} onClick={()=>setShowPreview(true)} icon={Fullscreen} tip="Aperçu plein écran" label="Aperçu"/>

        {/* Right side actions */}
        <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center"}}>
          {/* #112: help button */}
          <SmBtn onClick={()=>setShowHelp(p=>!p)} icon={HelpCircle} tip="Aide et raccourcis"/>

          <button onClick={()=>setConfirmReset(true)} aria-label="Réinitialiser le layout" style={{display:"flex",alignItems:"center",gap:4,padding:"5px 10px",borderRadius:6,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",color:"#94a3b8",fontSize:11,cursor:"pointer"}}><RotateCcw size={11}/> Reset</button>

          {/* #63: renamed + #117: dirty indicator */}
          <button onClick={handleSave} aria-label="Sauvegarder le layout" style={{display:"flex",alignItems:"center",gap:5,padding:"6px 14px",borderRadius:7,fontWeight:700,fontSize:11,cursor:"pointer",transition:"all 0.2s",background:"linear-gradient(135deg,#2563eb,#7c3aed)",border:"1px solid transparent",color:"white",boxShadow:"0 2px 12px rgba(37,99,235,0.4)",position:"relative"}}>
            <Save size={12}/> Sauvegarder
            {/* #117: unsaved indicator */}
            {isDirty && <div style={{position:"absolute",top:-2,right:-2,width:8,height:8,borderRadius:4,background:"#f59e0b",border:"2px solid #04040b"}}/>}
          </button>
        </div>
      </header>

      {/* ─── Help Panel (#112) ─── */}
      {showHelp && (
        <div style={{position:"absolute",top:50,right:16,width:280,background:"rgba(10,10,22,0.95)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:12,padding:16,zIndex:1000,backdropFilter:"blur(20px)",boxShadow:"0 12px 40px rgba(0,0,0,0.6)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <span style={{fontSize:13,fontWeight:700,color:"#f1f5f9"}}>Raccourcis clavier</span>
            <button onClick={()=>setShowHelp(false)} aria-label="Fermer l'aide" style={{background:"none",border:"none",cursor:"pointer",color:"#475569"}}><X size={14}/></button>
          </div>
          {[
            ["⌘Z","Annuler"], ["⌘⇧Z","Rétablir"], ["⌘A","Tout sélectionner"],
            ["Suppr","Retirer les modules"], ["Shift+clic","Multi-sélection"],
            ["Clic droit","Menu contextuel"], ["Double-clic","Ouvrir propriétés"],
            ["Ctrl+molette","Zoomer"], ["Échap","Désélectionner / Quitter aperçu"],
          ].map(([key,desc])=>(
            <div key={key} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
              <Kbd>{key}</Kbd><span style={{fontSize:10,color:"#94a3b8"}}>{desc}</span>
            </div>
          ))}
        </div>
      )}

      {/* ─── Main ─── */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        {showLeft && <Palette mods={mods} searchQ={searchQ} setSearchQ={setSearchQ} expandedCats={expandedCats} toggleCat={toggleCat} addToCanvas={addToCanvas} onDragStart={onPaletteDragStart} allExpanded={allExpanded} toggleAllCats={toggleAllCats}/>}

        {/* Canvas */}
        <div ref={canvasRef} style={{flex:1,overflow:"auto",position:"relative",background:"#05050e"}}
          onPointerDown={onCanvasDown} data-canvas="1"
          onDragOver={e=>e.preventDefault()} onDrop={onCanvasDrop}
          onContextMenu={e=>{
            // #91: context menu on empty canvas
            if((e.target as HTMLElement).hasAttribute("data-canvas")) {
              e.preventDefault();
              setCtxMenu({x:e.clientX,y:e.clientY,modId:null});
            }
          }}>
          <div style={{position:"relative",minWidth:1400*zoom,minHeight:760*zoom,transform:`scale(${zoom})`,transformOrigin:"top left"}} data-canvas="1">
            <BgGrid/>
            {/* Zone hints - #25: more visible */}
            <div style={{position:"absolute",left:0,top:0,width:"100%",height:48,background:"rgba(59,130,246,0.04)",borderBottom:"1px dashed rgba(59,130,246,0.15)",pointerEvents:"none",zIndex:0}}><span style={{position:"absolute",left:8,top:16,fontSize:10,color:"rgba(59,130,246,0.3)",fontWeight:700,letterSpacing:"0.05em"}}>TOPBAR</span></div>
            <div style={{position:"absolute",left:0,top:48,width:200,bottom:0,background:"rgba(168,85,247,0.03)",borderRight:"1px dashed rgba(168,85,247,0.12)",pointerEvents:"none",zIndex:0}}><span style={{position:"absolute",left:8,top:12,fontSize:10,color:"rgba(168,85,247,0.3)",fontWeight:700,letterSpacing:"0.05em"}}>SIDEBAR</span></div>
            <div style={{position:"absolute",right:0,top:48,width:240,bottom:0,background:"rgba(6,182,212,0.03)",borderLeft:"1px dashed rgba(6,182,212,0.12)",pointerEvents:"none",zIndex:0}}><span style={{position:"absolute",right:8,top:12,fontSize:10,color:"rgba(6,182,212,0.3)",fontWeight:700,letterSpacing:"0.05em"}}>PANNEAU DROIT</span></div>
            {/* Logo */}
            <div style={{position:"absolute",left:8,top:10,display:"flex",alignItems:"center",gap:7,pointerEvents:"none",zIndex:1}}>
              <div style={{width:26,height:26,borderRadius:7,background:"linear-gradient(135deg,#2563eb,#ec4899)",display:"flex",alignItems:"center",justifyContent:"center"}}><Disc3 size={13} color="white"/></div>
              <span style={{fontSize:14,fontWeight:700,color:"rgba(255,255,255,0.5)"}}>CueForge</span>
            </div>
            {/* Snap lines - #24: thicker + fade */}
            {snapLines.map((l,i)=><div key={i} style={{position:"absolute",...(l.axis==="x"?{left:l.pos,top:0,width:2,height:"100%"}:{top:l.pos,left:0,height:2,width:"100%"}),background:"#ec4899",opacity:0.7,pointerEvents:"none",zIndex:999,transition:"opacity 0.3s"}}/>)}
            {/* Rubber band - #32: more visible */}
            {rubberBand && <div style={{position:"absolute",left:Math.min(rubberBand.x1,rubberBand.x2),top:Math.min(rubberBand.y1,rubberBand.y2),width:Math.abs(rubberBand.x2-rubberBand.x1),height:Math.abs(rubberBand.y2-rubberBand.y1),border:"1.5px solid rgba(59,130,246,0.6)",background:"rgba(59,130,246,0.12)",borderRadius:2,pointerEvents:"none",zIndex:998}}/>}
            {/* #22: Empty canvas placeholder */}
            {onCanvas.length === 0 && (
              <div style={{position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%)",textAlign:"center",pointerEvents:"none",zIndex:1}} data-canvas="1">
                <div style={{width:72,height:72,borderRadius:18,background:"rgba(59,130,246,0.08)",border:"1px solid rgba(59,130,246,0.15)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}><Plus size={32} color="#3b82f6" style={{opacity:0.5}}/></div>
                <div style={{fontSize:16,fontWeight:700,color:"#334155",marginBottom:6}}>Canvas vide</div>
                <div style={{fontSize:12,color:"#1e293b"}}>Glissez des modules depuis la palette<br/>ou cliquez pour les ajouter</div>
              </div>
            )}
            {/* Modules */}
            {onCanvas.map(mod=><ModCard key={mod.id} mod={mod} isSelected={selected===mod.id} isMulti={multiSel.has(mod.id)} maxZ={maxZ} onPtrDown={handleMove} onResizeDown={handleResize} onSelect={handleSelect} onCtxMenu={(e,id)=>setCtxMenu({x:e.clientX,y:e.clientY,modId:id})} onDblClick={handleDblClick} hoveredLayer={hoveredLayer}/>)}
          </div>
        </div>

        {/* Right panel */}
        {showRight && (
          <div style={{width:260,borderLeft:"1px solid rgba(255,255,255,0.07)",background:"rgba(0,0,0,0.5)",backdropFilter:"blur(12px)",display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0}}>
            {/* Tabs */}
            <div style={{display:"flex",borderBottom:"1px solid rgba(255,255,255,0.07)",flexShrink:0}}>
              {(["properties","layers"] as RightTab[]).map(tab=>(
                <button key={tab} onClick={()=>setRightTab(tab)} aria-label={tab==="properties"?"Propriétés":"Layers"} style={{flex:1,padding:"9px 0",fontSize:10,fontWeight:600,cursor:"pointer",background:rightTab===tab?"rgba(59,130,246,0.08)":"none",color:rightTab===tab?"#3b82f6":"#475569",border:"none",borderBottom:rightTab===tab?"2px solid #3b82f6":"2px solid transparent"}}>
                  {tab==="properties"?"Propriétés":"Layers"}
                </button>
              ))}
            </div>
            {rightTab === "properties" ? (
              selMod && selDef
                ? <PropsPanel mod={selMod} def={selDef} multiCount={multiSel.size} onUpdate={u=>updateMod(selMod.id,u)} onToggleOpen={()=>toggleOpen(selMod.id)} onRemove={()=>removeFromCanvas(selMod.id)} onToggleLock={()=>toggleLock(selMod.id)}/>
                : (multiSel.size > 0 ? (
                  // #50: multi-selection info
                  <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <div style={{textAlign:"center",padding:20}}>
                      <MousePointer2 size={24} color="#3b82f6" style={{margin:"0 auto 8px",display:"block"}}/>
                      <div style={{fontSize:12,fontWeight:600,color:"#94a3b8"}}>{multiSel.size} modules sélectionnés</div>
                      <div style={{fontSize:10,color:"#475569",marginTop:4}}>Utilisez la barre d&apos;alignement<br/>en bas de l&apos;écran</div>
                    </div>
                  </div>
                ) : (
                  // #42: better empty placeholder
                  <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <div style={{textAlign:"center",padding:20}}>
                      <Crosshair size={24} color="#334155" style={{margin:"0 auto 8px",display:"block"}}/>
                      <div style={{fontSize:11,color:"#64748b"}}>Sélectionnez un module</div>
                      <div style={{fontSize:10,color:"#334155",marginTop:4}}>Cliquez sur un module du canvas<br/>pour voir ses propriétés</div>
                    </div>
                  </div>
                ))
            ) : (
              <LayersPanel mods={mods} selected={selected} multiSel={multiSel} onSelect={scrollToModule} onReorder={reorderZ} onToggleVis={toggleOpen} onToggleLock={toggleLock} hoveredLayer={hoveredLayer} setHoveredLayer={setHoveredLayer}/>
            )}
          </div>
        )}
      </div>

      {/* Multi-select alignment bar */}
      <AlignBar count={multiSel.size} onAlign={handleAlign}/>

      {/* Context menu */}
      {ctxMenu && <CtxMenu menu={ctxMenu} onAction={handleCtxAction} onClose={()=>setCtxMenu(null)}/>}

      {/* #7 + #119: Footer with better contrast and info */}
      <footer style={{padding:"4px 16px",borderTop:"1px solid rgba(255,255,255,0.06)",background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",gap:16,fontSize:9,color:"#64748b",flexShrink:0}}>
        <span><Kbd>⌘Z</Kbd> Annuler</span><span><Kbd>⌘⇧Z</Kbd> Refaire</span><span><Kbd>⌘A</Kbd> Tout</span><span><Kbd>Suppr</Kbd> Retirer</span>
        <span style={{marginLeft:"auto",display:"flex",gap:12,alignItems:"center"}}>
          <span>Grille: {GRID}px</span>
          <span>{onCanvas.length} modules</span>
          {multiSel.size > 0 && <span style={{color:"#3b82f6",fontWeight:600}}>{multiSel.size} sélectionnés</span>}
          {isDirty && <span style={{color:"#f59e0b"}}>● Non sauvegardé</span>}
        </span>
      </footer>

      {/* Confirmation dialogs */}
      <ConfirmDialog open={confirmReset} title="Réinitialiser le layout ?" message="Toutes vos modifications seront perdues et le layout par défaut sera restauré. Cette action peut être annulée avec Ctrl+Z." confirmLabel="Réinitialiser" confirmColor="#ef4444" onConfirm={handleResetConfirmed} onCancel={()=>setConfirmReset(false)}/>
      <ConfirmDialog open={!!confirmPreset} title="Appliquer le preset ?" message="Le layout actuel sera remplacé par le preset sélectionné. Cette action peut être annulée avec Ctrl+Z." confirmLabel="Appliquer" confirmColor="#a855f7" onConfirm={()=>confirmPreset&&handlePresetConfirmed(confirmPreset)} onCancel={()=>setConfirmPreset(null)}/>
      <ConfirmDialog open={!!confirmDeleteLayout} title="Supprimer ce layout ?" message="Le layout sauvegardé sera supprimé définitivement." confirmLabel="Supprimer" confirmColor="#ef4444" onConfirm={()=>confirmDeleteLayout&&handleDeleteLayoutConfirmed(confirmDeleteLayout)} onCancel={()=>setConfirmDeleteLayout(null)}/>
      <ConfirmDialog open={!!confirmLoadLayout} title="Charger ce layout ?" message="Le layout actuel sera remplacé. Cette action peut être annulée avec Ctrl+Z." confirmLabel="Charger" confirmColor="#3b82f6" onConfirm={()=>confirmLoadLayout&&handleLoadLayoutConfirmed(confirmLoadLayout)} onCancel={()=>setConfirmLoadLayout(null)}/>

      {/* Onboarding */}
      {showOnboarding && <OnboardingOverlay onDismiss={()=>setShowOnboarding(false)}/>}
    </div>
  );
}

// ─── Wrapped with ErrorBoundary + ToastProvider ─────────────────────────────
export default function LayoutBuilderPage() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <LayoutBuilderInner/>
      </ToastProvider>
    </ErrorBoundary>
  );
}

// ─── Small UI helpers ────────────────────────────────────────────────────────
function Kbd({children}:{children:React.ReactNode}) { return <kbd style={{padding:"1px 4px",borderRadius:3,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.08)",fontSize:9}}>{children}</kbd>; }
function SmBtn({onClick,icon:Icon,label,disabled,tip}:{onClick:()=>void;icon?:React.ElementType;label?:string;disabled?:boolean;tip?:string}) {
  return <button onClick={onClick} disabled={disabled} title={tip} aria-label={tip||label} style={{padding:"3px 6px",borderRadius:5,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",color:disabled?"#1e1e30":"#64748b",cursor:disabled?"default":"pointer",lineHeight:0,fontSize:9}}>
    {Icon?<Icon size={12}/>:label}
  </button>;
}
function HdrBtn({on,onClick,icon:Icon,label,color,tip}:{on:boolean;onClick:()=>void;icon:React.ElementType;label?:string;color?:string;tip?:string}) {
  const c = color || "#3b82f6";
  return <button onClick={onClick} title={tip} aria-label={tip||label} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",borderRadius:6,background:on?`${c}15`:"rgba(255,255,255,0.04)",border:`1px solid ${on?`${c}30`:"rgba(255,255,255,0.1)"}`,color:on?c:"#64748b",fontSize:10,cursor:"pointer",lineHeight:0}}><Icon size={11}/>{label&&<span>{label}</span>}</button>;
}
function PresetBtn({label,desc,onClick,onDelete}:{label:string;desc:string;onClick:()=>void;onDelete?:()=>void}) {
  return <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:4}}>
    <button onClick={onClick} style={{flex:1,padding:"8px 10px",borderRadius:7,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",color:"#e2e8f0",fontSize:11,cursor:"pointer",textAlign:"left"}}
      onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.08)"}} onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.03)"}}>
      <div style={{fontWeight:700,marginBottom:2}}>{label}</div><div style={{fontSize:9,color:"#475569"}}>{desc}</div>
    </button>
    {onDelete && <button onClick={e=>{e.stopPropagation();onDelete();}} aria-label={`Supprimer ${label}`} style={{padding:"6px",borderRadius:5,background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",color:"#ef4444",cursor:"pointer",lineHeight:0,flexShrink:0}}><Trash2 size={10}/></button>}
  </div>;
}
