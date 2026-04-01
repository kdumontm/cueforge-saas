"use client";
import { useState, useRef, useEffect, useCallback } from "react";
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
  GripVertical, Eye, Plus,
} from "lucide-react";
import Link from "next/link";

// ─── Constants ────────────────────────────────────────────────────────────────
const GRID = 8;          // px snap grid
const MIN_W = 100;       // px
const MIN_H = 36;        // px
const HANDLE_SZ = 8;     // px resize handle size
const STORAGE_KEY = "cueforge_layout_v3";

// ─── Types ────────────────────────────────────────────────────────────────────
type ResizeEdge = "n"|"ne"|"e"|"se"|"s"|"sw"|"w"|"nw";
interface ModDef { id:string; label:string; icon:React.ElementType; color:string; }
interface Mod {
  id:string; x:number; y:number; w:number; h:number;
  z:number; open:boolean; onCanvas:boolean;
}
interface DragState {
  id:string; mode:"move"|ResizeEdge;
  startPx:number; startPy:number;   // pointer at start
  origX:number; origY:number; origW:number; origH:number;
}

// ─── Module definitions ───────────────────────────────────────────────────────
const DEFS: ModDef[] = [
  { id:"auto-analyse",    label:"Auto-analyse",    icon:ToggleLeft,   color:"#22c55e" },
  { id:"import",          label:"Import",           icon:Upload,       color:"#3b82f6" },
  { id:"export",          label:"Export",           icon:Download,     color:"#06b6d4" },
  { id:"search",          label:"Recherche",        icon:Search,       color:"#a855f7" },
  { id:"notifications",   label:"Notifs",           icon:Bell,         color:"#f59e0b" },
  { id:"theme",           label:"Thème",            icon:Sun,          color:"#eab308" },
  { id:"analyze-badge",   label:"Badge analyser",   icon:AlertCircle,  color:"#f97316" },
  { id:"play-pause",      label:"Lecture / Pause",  icon:Play,         color:"#22c55e" },
  { id:"prev-track",      label:"Track préc.",      icon:SkipBack,     color:"#6366f1" },
  { id:"next-track",      label:"Track suiv.",      icon:SkipForward,  color:"#6366f1" },
  { id:"loop-in",         label:"Loop IN",          icon:Crosshair,    color:"#ec4899" },
  { id:"loop-out",        label:"Loop OUT",         icon:Crosshair,    color:"#ec4899" },
  { id:"loop-toggle",     label:"Loop actif",       icon:Repeat,       color:"#f43f5e" },
  { id:"tap-tempo",       label:"Tap Tempo",        icon:Clock,        color:"#f97316" },
  { id:"playback-rate",   label:"Vitesse",          icon:Gauge,        color:"#8b5cf6" },
  { id:"zoom-waveform",   label:"Zoom wave",        icon:ZoomIn,       color:"#06b6d4" },
  { id:"volume",          label:"Volume",           icon:Volume2,      color:"#10b981" },
  { id:"tab-info",        label:"Info/Edit",        icon:NotebookPen,  color:"#3b82f6" },
  { id:"tab-cues",        label:"Cue Points",       icon:ListMusic,    color:"#14b8a6" },
  { id:"tab-eq",          label:"EQ",               icon:Sliders,      color:"#8b5cf6" },
  { id:"tab-beatgrid",    label:"BeatGrid",         icon:ScanLine,     color:"#f59e0b" },
  { id:"tab-mix",         label:"Mix",              icon:Waves,        color:"#06b6d4" },
  { id:"tab-stems",       label:"Stems",            icon:Mic2,         color:"#ec4899" },
  { id:"tab-fx",          label:"FX",               icon:Sparkles,     color:"#f43f5e" },
  { id:"tab-history",     label:"Historique",       icon:History,      color:"#64748b" },
  { id:"tab-playlists",   label:"Playlists",        icon:BookOpen,     color:"#a855f7" },
  { id:"filter-panel",    label:"Filtres",          icon:Filter,       color:"#3b82f6" },
  { id:"batch-actions",   label:"Actions groupées", icon:CheckSquare,  color:"#f59e0b" },
  { id:"view-list",       label:"Vue Liste",        icon:AlignJustify, color:"#6366f1" },
  { id:"view-grid",       label:"Vue Grille",       icon:Grid2x2,      color:"#6366f1" },
  { id:"refresh-library", label:"Rafraîchir",       icon:RefreshCw,    color:"#22c55e" },
  { id:"crate-digger",    label:"Crate Digger",     icon:FolderOpen,   color:"#f97316" },
  { id:"harmonic-wheel",  label:"Roue harmo.",      icon:Piano,        color:"#22c55e" },
  { id:"energy-flow",     label:"Energy Flow",      icon:Flame,        color:"#ef4444" },
  { id:"quick-notes",     label:"Notes rapides",    icon:NotebookPen,  color:"#a855f7" },
  { id:"bpm-tap",         label:"BPM Tap",          icon:Clock,        color:"#06b6d4" },
  { id:"set-builder",     label:"Set Builder",      icon:Library,      color:"#14b8a6" },
  { id:"duplicate-finder",label:"Doublons",         icon:GitBranch,    color:"#f59e0b" },
  { id:"ai-analysis",     label:"Analyse IA",       icon:BrainCircuit, color:"#ec4899" },
  { id:"bpm-display",     label:"BPM",              icon:Music,        color:"#f97316" },
  { id:"key-display",     label:"Tonalité",         icon:Hash,         color:"#10b981" },
  { id:"track-player",    label:"Waveform",         icon:Disc3,        color:"#6366f1" },
  { id:"stats-library",   label:"Stats lib.",       icon:BarChart2,    color:"#64748b" },
  { id:"favorites",       label:"Favoris",          icon:Star,         color:"#eab308" },
  { id:"settings-link",   label:"Réglages",         icon:Settings,     color:"#94a3b8" },
  { id:"track-list",      label:"Liste des tracks", icon:AlignJustify, color:"#475569" },
  { id:"gig-prep",        label:"Gig Prep",         icon:Sparkles,     color:"#06b6d4" },
  { id:"controls-bar",    label:"Contrôles player", icon:Play,         color:"#22c55e" },
];
const DEF_MAP = Object.fromEntries(DEFS.map(d => [d.id, d]));

// ─── Default layout — calqué sur le vrai dashboard CueForge ──────────────────
// Canvas : 1400×760  |  Grid : 8px  |  Gap entre colonnes : 8px
// Topbar : y 0→48  |  Sidebar : x 0→200  |  Main : x 208→1152  |  Right : x 1160→1400
function makeDefault(): Mod[] {
  const ON: Mod[] = [
    // ── Topbar (y:8, h:32) ──────────────────────────────────
    { id:"auto-analyse",   x:200, y:8,   w:128, h:32,  z:10, open:true,  onCanvas:true },
    { id:"import",         x:336, y:8,   w:80,  h:32,  z:10, open:true,  onCanvas:true },
    { id:"export",         x:424, y:8,   w:80,  h:32,  z:10, open:true,  onCanvas:true },
    { id:"search",         x:536, y:8,   w:240, h:32,  z:10, open:true,  onCanvas:true },
    { id:"batch-actions",  x:808, y:8,   w:136, h:32,  z:10, open:true,  onCanvas:true },
    { id:"view-list",      x:952, y:8,   w:40,  h:32,  z:10, open:true,  onCanvas:true },
    { id:"view-grid",      x:1000,y:8,   w:40,  h:32,  z:10, open:true,  onCanvas:true },
    { id:"refresh-library",x:1048,y:8,   w:40,  h:32,  z:10, open:true,  onCanvas:true },
    { id:"notifications",  x:1296,y:8,   w:40,  h:32,  z:10, open:true,  onCanvas:true },
    { id:"theme",          x:1344,y:8,   w:40,  h:32,  z:10, open:true,  onCanvas:true },
    // ── Sidebar gauche (x:0, w:200) ─────────────────────────
    { id:"filter-panel",   x:0,   y:56,  w:200, h:200, z:5,  open:true,  onCanvas:true },
    { id:"crate-digger",   x:0,   y:264, w:200, h:120, z:5,  open:true,  onCanvas:true },
    { id:"harmonic-wheel", x:0,   y:392, w:200, h:176, z:5,  open:true,  onCanvas:true },
    { id:"stats-library",  x:0,   y:576, w:200, h:64,  z:5,  open:true,  onCanvas:true },
    { id:"favorites",      x:0,   y:648, w:200, h:48,  z:5,  open:true,  onCanvas:true },
    { id:"settings-link",  x:0,   y:704, w:200, h:48,  z:5,  open:true,  onCanvas:true },
    // ── Zone centrale (x:208, w:944) ─────────────────────────
    { id:"track-player",   x:208, y:56,  w:944, h:200, z:5,  open:true,  onCanvas:true },
    { id:"controls-bar",   x:208, y:264, w:944, h:56,  z:5,  open:true,  onCanvas:true },
    { id:"track-list",     x:208, y:328, w:944, h:424, z:5,  open:true,  onCanvas:true },
    // ── Panneau droit (x:1160, w:240) ────────────────────────
    { id:"bpm-display",    x:1160,y:56,  w:240, h:96,  z:5,  open:true,  onCanvas:true },
    { id:"key-display",    x:1160,y:160, w:240, h:96,  z:5,  open:true,  onCanvas:true },
    { id:"tab-cues",       x:1160,y:264, w:240, h:200, z:5,  open:true,  onCanvas:true },
    { id:"tab-eq",         x:1160,y:472, w:240, h:128, z:5,  open:true,  onCanvas:true },
    { id:"tab-info",       x:1160,y:608, w:240, h:144, z:5,  open:true,  onCanvas:true },
  ];
  const onIds = new Set(ON.map(m => m.id));
  const OFF: Mod[] = DEFS
    .filter(d => !onIds.has(d.id))
    .map(d => ({ id:d.id, x:0, y:0, w:160, h:56, z:1, open:false, onCanvas:false }));
  return [...ON, ...OFF];
}

// ─── Persistence ──────────────────────────────────────────────────────────────
function loadMods(): Mod[] {
  if (typeof window === "undefined") return makeDefault();
  try { const s = localStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s) : makeDefault(); }
  catch { return makeDefault(); }
}
function saveMods(mods: Mod[]) {
  if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(mods));
}

// ─── Snap to grid ─────────────────────────────────────────────────────────────
function sg(v: number) { return Math.round(v / GRID) * GRID; }

// ─── Module content ───────────────────────────────────────────────────────────
function ModContent({ id, h }: { id:string; h:number }) {
  const contentH = Math.max(0, h - 36);

  if (id === "track-player") return (
    <div style={{ height: contentH, overflow:"hidden", padding:"4px 8px" }}>
      {/* Overview */}
      <div style={{ height: Math.max(24, contentH * 0.35), borderRadius:5, background:"rgba(0,0,0,0.3)", border:"1px solid rgba(255,255,255,0.05)", overflow:"hidden", position:"relative", marginBottom:4 }}>
        {Array.from({length:80}).map((_,i) => {
          const bh = 14 + Math.abs(Math.sin(i*0.6)*14 + Math.sin(i*0.2)*8);
          return <div key={i} style={{ position:"absolute", left:`${i/80*100}%`, bottom:"50%", width:"1.1%", height:`${bh}%`, background:i<24?"rgba(99,102,241,0.6)":"rgba(168,85,247,0.42)", transform:"translateY(50%)", borderRadius:1 }} />;
        })}
        <div style={{ position:"absolute", left:"30%", top:0, bottom:0, width:2, background:"#ec4899", opacity:0.9 }} />
      </div>
      {/* Detail */}
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
        <div key={i} style={{ width:34,height:34,borderRadius:10,background:`${c}22`,border:`1.5px solid ${c}55`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}>
          <Icon size={15} color={c} />
        </div>
      ))}
      <div style={{ width:1,height:20,background:"rgba(255,255,255,0.1)" }} />
      {[{Icon:Crosshair,c:"#ec4899",l:"IN"},{Icon:Repeat,c:"#f43f5e",l:"LOOP"},{Icon:Crosshair,c:"#ec4899",l:"OUT"}].map(({Icon,c,l},i)=>(
        <div key={i} style={{ display:"flex",alignItems:"center",gap:4,padding:"4px 8px",borderRadius:7,background:`${c}15`,border:`1px solid ${c}33`,cursor:"pointer" }}>
          <Icon size={11} color={c} />
          <span style={{ fontSize:9,color:c,fontWeight:700 }}>{l}</span>
        </div>
      ))}
      <div style={{ width:1,height:20,background:"rgba(255,255,255,0.1)" }} />
      {[0.5,1,1.5,2].map(r=>(
        <div key={r} style={{ padding:"2px 6px",borderRadius:5,background:r===1?"rgba(99,102,241,0.2)":"rgba(255,255,255,0.04)",border:`1px solid ${r===1?"rgba(99,102,241,0.4)":"rgba(255,255,255,0.07)"}`,fontSize:9,color:r===1?"#818cf8":"#475569",cursor:"pointer" }}>{r}×</div>
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
            <div key={k} style={{ padding:"2px 6px",borderRadius:4,background:k==="8A"?"rgba(16,185,129,0.2)":"rgba(255,255,255,0.04)",border:`1px solid ${k==="8A"?"#10b98155":"rgba(255,255,255,0.08)"}`,fontSize:9,color:k==="8A"?"#10b981":"#475569",cursor:"pointer" }}>{k}</div>
          ))}
        </div>
      </div>
      {contentH > 130 && (
        <div>
          <div style={{ fontSize:9,color:"#64748b",fontWeight:600,marginBottom:4 }}>Énergie</div>
          <div style={{ display:"flex",gap:3 }}>
            {[1,2,3,4,5].map(e=>(
              <div key={e} style={{ width:20,height:20,borderRadius:5,background:e<=3?"rgba(239,68,68,0.25)":"rgba(255,255,255,0.04)",border:`1px solid ${e<=3?"rgba(239,68,68,0.4)":"rgba(255,255,255,0.08)"}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}>
                <Flame size={10} color={e<=3?"#ef4444":"#334155"} />
              </div>
            ))}
          </div>
        </div>
      )}
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
        {/* ── Mini timeline bar ── */}
        <div style={{ position:"relative",height:28,background:"rgba(255,255,255,0.03)",borderRadius:6,border:"1px solid rgba(255,255,255,0.06)",overflow:"hidden",flexShrink:0 }}>
          {/* Waveform hint */}
          <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"flex-end",padding:"0 4px",gap:1 }}>
            {Array.from({length:60}).map((_,i)=>{
              const h2 = 4 + Math.sin(i*0.4)*8 + Math.cos(i*0.7)*4;
              return <div key={i} style={{ flex:1,height:`${Math.max(3,h2)}px`,background:"rgba(255,255,255,0.06)",borderRadius:1 }} />;
            })}
          </div>
          {/* Cue markers on timeline */}
          {cues.map((cue,i)=>(
            <div key={i} style={{ position:"absolute",left:`${cue.p}%`,top:0,bottom:0,width:2,background:cue.c,opacity:0.8 }}>
              <div style={{ position:"absolute",top:-1,left:-4,width:10,height:10,background:cue.c,borderRadius:"50%",border:"2px solid rgba(0,0,0,0.5)",boxShadow:`0 0 6px ${cue.c}60` }} />
            </div>
          ))}
          {/* Playhead */}
          <div style={{ position:"absolute",left:"35%",top:0,bottom:0,width:1.5,background:"#fff",opacity:0.6 }} />
        </div>
        {/* ── Cue list ── */}
        <div style={{ flex:1,display:"flex",flexDirection:"column",gap:3,overflow:"hidden" }}>
          {cues.map((cue,i)=>(
            <div key={i} style={{ display:"flex",alignItems:"center",gap:6,padding:"3px 5px",borderRadius:6,background:`linear-gradient(90deg, ${cue.c}12, transparent 70%)`,borderLeft:`2px solid ${cue.c}`,transition:"background 0.15s" }}>
              {/* Hot cue badge */}
              <div style={{ width:18,height:18,borderRadius:4,background:`${cue.c}25`,border:`1px solid ${cue.c}50`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 0 8px ${cue.c}30`,flexShrink:0 }}>
                <span style={{ fontSize:9,fontWeight:800,color:cue.c }}>{cue.k}</span>
              </div>
              <span style={{ fontSize:10,color:"#e2e8f0",fontVariantNumeric:"tabular-nums",width:30,flexShrink:0,fontWeight:600 }}>{cue.t}</span>
              <span style={{ fontSize:9,color:"#94a3b8",flex:1,textTransform:"uppercase",letterSpacing:0.5,fontWeight:500 }}>{cue.n}</span>
              {/* Glow dot */}
              <div style={{ width:6,height:6,borderRadius:"50%",background:cue.c,boxShadow:`0 0 4px ${cue.c}`,flexShrink:0 }} />
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
          <span style={{ fontSize:9,color:c,width:26,textAlign:"right",fontVariantNumeric:"tabular-nums" }}>{Math.round(v*24-12)}dB</span>
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

  if (id === "auto-analyse") return (
    <div style={{ height:contentH,display:"flex",alignItems:"center",justifyContent:"center",gap:8 }}>
      <div style={{ width:36,height:20,borderRadius:10,background:"rgba(34,197,94,0.25)",border:"1.5px solid rgba(34,197,94,0.5)",position:"relative",cursor:"pointer" }}>
        <div style={{ position:"absolute",right:3,top:3,width:14,height:14,borderRadius:"50%",background:"#22c55e" }} />
      </div>
      <span style={{ fontSize:10,color:"#22c55e",fontWeight:600 }}>ON</span>
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

// ─── Resize handles ───────────────────────────────────────────────────────────
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

// ─── Single module card ────────────────────────────────────────────────────────
function ModCard({
  mod, isSelected, onPointerDownMove, onPointerDownResize, onSelect, onToggleOpen, onRemove, maxZ,
}: {
  mod: Mod; isSelected: boolean; maxZ: number;
  onPointerDownMove: (e: React.PointerEvent, id:string) => void;
  onPointerDownResize: (e: React.PointerEvent, id:string, dir:ResizeEdge) => void;
  onSelect: (id:string) => void;
  onToggleOpen: (id:string) => void;
  onRemove: (id:string) => void;
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
      }}
      onPointerDown={(e) => { e.stopPropagation(); onSelect(mod.id); }}
    >
      {/* Glass card body */}
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
        {/* ── Header (drag handle) ── */}
        <div
          onPointerDown={(e) => { e.stopPropagation(); onPointerDownMove(e, mod.id); }}
          style={{
            height:32, flexShrink:0,
            background: isSelected ? `${def.color}12` : "rgba(255,255,255,0.04)",
            borderBottom:"1px solid rgba(255,255,255,0.06)",
            display:"flex", alignItems:"center", gap:7, padding:"0 8px",
            cursor:"grab", userSelect:"none",
          }}
        >
          <GripVertical size={11} color="rgba(255,255,255,0.2)" style={{ flexShrink:0 }} />
          <div style={{ width:20,height:20,borderRadius:5,background:`${def.color}22`,border:`1.5px solid ${def.color}44`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
            <Icon size={11} color={def.color} />
          </div>
          <span style={{ fontSize:10,fontWeight:700,color:"#e2e8f0",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{def.label}</span>
          {isSelected && (
            <div style={{ display:"flex",gap:3,flexShrink:0 }}>
              <button
                onPointerDown={(e)=>e.stopPropagation()}
                onClick={(e)=>{ e.stopPropagation(); onToggleOpen(mod.id); }}
                style={{ background:"none",border:"none",cursor:"pointer",color:mod.open?def.color:"#475569",lineHeight:0,padding:2 }}
              >
                {mod.open ? <Minimize2 size={11}/> : <Maximize2 size={11}/>}
              </button>
              <button
                onPointerDown={(e)=>e.stopPropagation()}
                onClick={(e)=>{ e.stopPropagation(); onRemove(mod.id); }}
                style={{ background:"none",border:"none",cursor:"pointer",color:"#475569",lineHeight:0,padding:2 }}
              >
                <X size={11}/>
              </button>
            </div>
          )}
        </div>

        {/* ── Content ── */}
        {mod.open && mod.h > 36 && (
          <div style={{ flex:1,overflow:"hidden" }}>
            <ModContent id={mod.id} h={mod.h} />
          </div>
        )}
      </div>

      {/* ── Resize handles (shown when selected) ── */}
      {isSelected && RESIZE_HANDLES.map(({ dir, style, cursor }) => (
        <div
          key={dir}
          onPointerDown={(e) => { e.stopPropagation(); onPointerDownResize(e, mod.id, dir); }}
          style={{
            position:"absolute", ...style, cursor,
            background: dir.length === 1
              ? `${def.color}cc`
              : def.color,
            borderRadius: dir.length === 1 ? 3 : 3,
            border: `1px solid ${def.color}`,
            zIndex: 20,
          }}
        />
      ))}
    </div>
  );
}

// ─── Background reference grid ────────────────────────────────────────────────
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

// ─── Main page ────────────────────────────────────────────────────────────────
export default function LayoutBuilderPage() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [mods, setMods] = useState<Mod[]>(loadMods);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [savedBanner, setSavedBanner] = useState(false);
  const [showPalette, setShowPalette] = useState(true);
  const modsRef = useRef(mods);
  useEffect(() => { modsRef.current = mods; }, [mods]);

  const maxZ = Math.max(...mods.map(m => m.z), 1);

  // ── Drag effect ──
  useEffect(() => {
    if (!drag) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const dx = px - drag.startPx;
      const dy = py - drag.startPy;

      setMods(prev => prev.map(m => {
        if (m.id !== drag.id) return m;
        const { origX:ox, origY:oy, origW:ow, origH:oh } = drag;
        let nx=ox, ny=oy, nw=ow, nh=oh;

        if (drag.mode === "move") {
          nx = sg(ox + dx); ny = sg(oy + dy);
          // no clamping — free positioning, can go beyond canvas edges
        } else {
          const d = drag.mode;
          if (d.includes("e")) { nw = Math.max(MIN_W, sg(ow + dx)); }
          if (d.includes("w")) { const nw2=Math.max(MIN_W,sg(ow-dx)); nx=sg(ox+ow-nw2); nw=nw2; }
          if (d.includes("s")) { nh = Math.max(MIN_H, sg(oh + dy)); }
          if (d.includes("n")) { const nh2=Math.max(MIN_H,sg(oh-dy)); ny=sg(oy+oh-nh2); nh=nh2; }
        }
        return { ...m, x:nx, y:ny, w:nw, h:nh };
      }));
    };

    const onUp = () => {
      saveMods(modsRef.current);
      setDrag(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag]);

  // ── Handlers ──
  const handleMove = useCallback((e: React.PointerEvent, id: string) => {
    e.preventDefault();
    const m = modsRef.current.find(x => x.id === id)!;
    // Bring to front
    setMods(prev => prev.map(x => x.id===id ? {...x, z: maxZ+1} : x));
    setDrag({ id, mode:"move", startPx:e.clientX, startPy:e.clientY, origX:m.x, origY:m.y, origW:m.w, origH:m.h });
  }, [maxZ]);

  const handleResize = useCallback((e: React.PointerEvent, id: string, dir: ResizeEdge) => {
    e.preventDefault();
    const m = modsRef.current.find(x => x.id === id)!;
    setDrag({ id, mode:dir, startPx:e.clientX, startPy:e.clientY, origX:m.x, origY:m.y, origW:m.w, origH:m.h });
  }, []);

  const handleSelect = useCallback((id: string) => {
    setSelected(id);
    setMods(prev => prev.map(m => m.id===id ? {...m, z:maxZ+1} : m));
  }, [maxZ]);

  const toggleOpen = useCallback((id: string) => {
    setMods(prev => { const u=prev.map(m => m.id===id ? {...m, open:!m.open} : m); saveMods(u); return u; });
  }, []);

  const removeFromCanvas = useCallback((id: string) => {
    setMods(prev => { const u=prev.map(m => m.id===id ? {...m, onCanvas:false} : m); saveMods(u); return u; });
    setSelected(s => s===id ? null : s);
  }, []);

  const addToCanvas = useCallback((id: string) => {
    const canvas = canvasRef.current;
    const cx = canvas ? canvas.scrollLeft + 200 : 200;
    const cy = canvas ? canvas.scrollTop + 100 : 100;
    setMods(prev => {
      const u = prev.map(m => m.id===id ? {...m, onCanvas:true, x:sg(cx), y:sg(cy), z:maxZ+1, open:true} : m);
      saveMods(u);
      return u;
    });
    setSelected(id);
  }, [maxZ]);

  const handleSave = () => {
    saveMods(mods);
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 2500);
  };

  const handleReset = () => {
    const d = makeDefault();
    setMods(d);
    saveMods(d);
    setSelected(null);
  };

  const onCanvas = mods.filter(m => m.onCanvas);
  const offCanvas = mods.filter(m => !m.onCanvas);

  return (
    <div style={{ height:"100vh", display:"flex", flexDirection:"column", background:"#04040b", color:"#e2e8f0", fontFamily:"system-ui,-apple-system,sans-serif", overflow:"hidden", cursor: drag?.mode==="move" ? "grabbing" : "default" }}>

      {/* ─── Header ─── */}
      <div style={{ padding:"8px 16px", borderBottom:"1px solid rgba(255,255,255,0.07)", background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", gap:10, flexShrink:0, backdropFilter:"blur(12px)", zIndex:100 }}>
        <Link href="/admin" style={{ display:"flex",alignItems:"center",gap:4,color:"#64748b",textDecoration:"none",fontSize:11 }}>
          <ChevronLeft size={12}/> Admin
        </Link>
        <div style={{ width:1,height:12,background:"rgba(255,255,255,0.1)" }}/>
        <LayoutDashboard size={14} color="#3b82f6"/>
        <div>
          <div style={{ fontSize:13,fontWeight:700,color:"#f1f5f9",lineHeight:1.2 }}>Layout Builder</div>
          <div style={{ fontSize:9,color:"#334155" }}>Glisse les modules · Resize par les bords/coins · Clic pour sélectionner</div>
        </div>

        <div style={{ display:"flex",gap:6,marginLeft:14 }}>
          <button onClick={()=>setShowPalette(p=>!p)} style={{ display:"flex",alignItems:"center",gap:4,padding:"4px 9px",borderRadius:6,background:showPalette?"rgba(59,130,246,0.15)":"rgba(255,255,255,0.04)",border:`1px solid ${showPalette?"rgba(59,130,246,0.3)":"rgba(255,255,255,0.1)"}`,color:showPalette?"#3b82f6":"#64748b",fontSize:10,cursor:"pointer" }}>
            <Eye size={11}/> Palette ({offCanvas.length})
          </button>
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

      {/* ─── Canvas + Palette ─── */}
      <div style={{ flex:1,display:"flex",flexDirection:"column",overflow:"hidden" }}>

        {/* ─── Free canvas ─── */}
        <div
          ref={canvasRef}
          style={{ flex:1,overflow:"auto",position:"relative",background:"#05050e" }}
          onPointerDown={(e) => { if (e.target === canvasRef.current || (e.target as HTMLElement).hasAttribute("data-canvas")) setSelected(null); }}
          data-canvas="1"
        >
          <div style={{ position:"relative",minWidth:1400,minHeight:760 }} data-canvas="1">
            <BgGrid/>
            {/* Zone hints — guides de référence très discrets */}
            <div style={{ position:"absolute",left:0,top:0,width:"100%",height:48,background:"rgba(59,130,246,0.03)",borderBottom:"1px dashed rgba(59,130,246,0.1)",pointerEvents:"none",zIndex:0 }}>
              <span style={{ position:"absolute",left:8,top:16,fontSize:8,color:"rgba(59,130,246,0.2)",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase" }}>Topbar</span>
            </div>
            <div style={{ position:"absolute",left:0,top:48,width:200,bottom:0,background:"rgba(168,85,247,0.02)",borderRight:"1px dashed rgba(168,85,247,0.08)",pointerEvents:"none",zIndex:0 }}>
              <span style={{ position:"absolute",left:8,top:12,fontSize:8,color:"rgba(168,85,247,0.2)",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase" }}>Sidebar</span>
            </div>
            <div style={{ position:"absolute",right:0,top:48,width:240,bottom:0,background:"rgba(6,182,212,0.02)",borderLeft:"1px dashed rgba(6,182,212,0.08)",pointerEvents:"none",zIndex:0 }}>
              <span style={{ position:"absolute",right:8,top:12,fontSize:8,color:"rgba(6,182,212,0.2)",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase" }}>Panneau droit</span>
            </div>

            {/* CueForge logo watermark */}
            <div style={{ position:"absolute",left:8,top:10,display:"flex",alignItems:"center",gap:7,pointerEvents:"none",zIndex:1 }}>
              <div style={{ width:26,height:26,borderRadius:7,background:"linear-gradient(135deg,#2563eb,#ec4899)",display:"flex",alignItems:"center",justifyContent:"center" }}>
                <Disc3 size={13} color="white"/>
              </div>
              <span style={{ fontSize:14,fontWeight:700,color:"rgba(255,255,255,0.5)" }}>CueForge</span>
            </div>

            {/* All canvas modules */}
            {onCanvas.map(mod => (
              <ModCard
                key={mod.id} mod={mod}
                isSelected={selected === mod.id}
                maxZ={maxZ}
                onPointerDownMove={handleMove}
                onPointerDownResize={handleResize}
                onSelect={handleSelect}
                onToggleOpen={toggleOpen}
                onRemove={removeFromCanvas}
              />
            ))}
          </div>
        </div>

        {/* ─── Palette ─── */}
        {showPalette && offCanvas.length > 0 && (
          <div style={{ borderTop:"1px solid rgba(255,255,255,0.07)", background:"rgba(0,0,0,0.4)", padding:"8px 14px", flexShrink:0, backdropFilter:"blur(8px)" }}>
            <div style={{ fontSize:9,fontWeight:700,color:"#334155",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:7,display:"flex",alignItems:"center",gap:5 }}>
              <EyeOff size={10}/> Modules hors canvas — clique + pour ajouter
            </div>
            <div style={{ display:"flex",gap:5,flexWrap:"wrap" }}>
              {offCanvas.map(m => {
                const def = DEF_MAP[m.id];
                if (!def) return null;
                const Icon = def.icon;
                return (
                  <button key={m.id} onClick={() => addToCanvas(m.id)} style={{ display:"flex",alignItems:"center",gap:5,padding:"4px 9px",borderRadius:6,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",cursor:"pointer",fontSize:10,color:"#64748b",userSelect:"none",transition:"all 0.12s" }}
                    onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.08)";(e.currentTarget as HTMLElement).style.color="#94a3b8"}}
                    onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.04)";(e.currentTarget as HTMLElement).style.color="#64748b"}}
                  >
                    <Icon size={10} color={def.color}/>
                    {def.label}
                    <Plus size={9} style={{ marginLeft:2 }}/>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ─── Selection info bar ─── */}
      {selected && !drag && (() => {
        const mod = mods.find(m => m.id === selected);
        const def = DEF_MAP[selected];
        if (!mod || !def) return null;
        const Icon = def.icon;
        return (
          <div style={{
            position:"fixed", bottom:showPalette && offCanvas.length>0 ? 74 : 16, left:"50%", transform:"translateX(-50%)",
            background:"rgba(8,8,20,0.96)", border:`1.5px solid ${def.color}66`,
            borderRadius:12, padding:"7px 12px",
            display:"flex", alignItems:"center", gap:10,
            boxShadow:`0 8px 36px rgba(0,0,0,0.8), 0 0 0 1px ${def.color}18`,
            zIndex:200, backdropFilter:"blur(20px)", whiteSpace:"nowrap",
          }}>
            <div style={{ width:24,height:24,borderRadius:6,background:`${def.color}22`,border:`1.5px solid ${def.color}55`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
              <Icon size={12} color={def.color}/>
            </div>
            <span style={{ fontSize:11,fontWeight:700,color:"#f1f5f9" }}>{def.label}</span>
            <div style={{ width:1,height:14,background:"rgba(255,255,255,0.1)" }}/>
            <span style={{ fontSize:9,color:"#475569",fontVariantNumeric:"tabular-nums" }}>
              x:{mod.x} y:{mod.y}  {mod.w}×{mod.h}px
            </span>
            <div style={{ width:1,height:14,background:"rgba(255,255,255,0.1)" }}/>
            <button onClick={()=>toggleOpen(selected)} style={{ display:"flex",alignItems:"center",gap:4,padding:"3px 8px",borderRadius:5,background:mod.open?"rgba(34,197,94,0.15)":"rgba(255,255,255,0.05)",border:`1px solid ${mod.open?"#22c55e55":"rgba(255,255,255,0.1)"}`,color:mod.open?"#22c55e":"#64748b",fontSize:10,fontWeight:600,cursor:"pointer" }}>
              {mod.open ? <><Minimize2 size={10}/> Ouvert</> : <><Maximize2 size={10}/> Compact</>}
            </button>
            <button onClick={()=>removeFromCanvas(selected)} style={{ display:"flex",alignItems:"center",gap:4,padding:"3px 8px",borderRadius:5,background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",color:"#ef4444",fontSize:10,fontWeight:600,cursor:"pointer" }}>
              <EyeOff size={10}/> Retirer
            </button>
            <button onClick={()=>setSelected(null)} style={{ background:"none",border:"none",cursor:"pointer",color:"#475569",lineHeight:0,padding:2 }}>
              <X size={12}/>
            </button>
          </div>
        );
      })()}
    </div>
  );
}
