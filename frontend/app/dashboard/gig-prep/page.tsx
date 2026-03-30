// @ts-nocheck
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2, Circle, Plus, Trash2, Clock, MapPin, Music,
  Calendar, ChevronDown, ChevronUp, Headphones, AlertTriangle,
  Zap, Save, Sparkles,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────
interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
  category: string;
}

interface GigInfo {
  name: string;
  venue: string;
  date: string;
  startTime: string;
  endTime: string;
  genre: string;
  notes: string;
}

interface GigPrep {
  id: string;
  info: GigInfo;
  checklist: ChecklistItem[];
  createdAt: string;
}

// ── Default checklist templates ────────────────────────────────────────
const DEFAULT_CHECKLIST: Omit<ChecklistItem, 'id'>[] = [
  // Matériel
  { label: 'Clés USB (principale + backup)', checked: false, category: 'Matériel' },
  { label: 'Casque DJ', checked: false, category: 'Matériel' },
  { label: 'Câbles audio (RCA, Jack 6.35, XLR)', checked: false, category: 'Matériel' },
  { label: 'Laptop + chargeur', checked: false, category: 'Matériel' },
  { label: 'Carte son externe', checked: false, category: 'Matériel' },
  { label: 'Adaptateur jack / USB-C', checked: false, category: 'Matériel' },
  // Musique
  { label: 'Playlist/Set préparé et exporté', checked: false, category: 'Musique' },
  { label: 'Tracks analysés avec cue points', checked: false, category: 'Musique' },
  { label: 'BPM range vérifié pour le créneau', checked: false, category: 'Musique' },
  { label: 'Tracks de secours / requests', checked: false, category: 'Musique' },
  { label: 'Transitions testées', checked: false, category: 'Musique' },
  { label: 'Backup des tracks sur 2ème support', checked: false, category: 'Musique' },
  // Logistique
  { label: 'Adresse du lieu confirmée', checked: false, category: 'Logistique' },
  { label: 'Horaire de soundcheck', checked: false, category: 'Logistique' },
  { label: 'Contact organisateur sauvé', checked: false, category: 'Logistique' },
  { label: 'Rider technique envoyé', checked: false, category: 'Logistique' },
  { label: 'Parking / transport prévu', checked: false, category: 'Logistique' },
  // Avant le set
  { label: 'Test son / soundcheck fait', checked: false, category: 'Avant le set' },
  { label: 'Niveaux de volume vérifiés', checked: false, category: 'Avant le set' },
  { label: 'Monitoring casque testé', checked: false, category: 'Avant le set' },
  { label: 'Téléphone en mode avion', checked: false, category: 'Avant le set' },
];

const GENRE_PRESETS = [
  'House', 'Techno', 'Deep House', 'Melodic Techno', 'Tech House',
  'Afro House', 'Progressive', 'Minimal', 'Trance', 'Drum & Bass',
  'Hip-Hop', 'Disco', 'Funk', 'Electro', 'Ambient', 'Variétés',
];

// ── Helpers ────────────────────────────────────────────────────────────
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function loadGigs(): GigPrep[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('cueforge_gig_preps') || '[]');
  } catch { return []; }
}

function saveGigs(gigs: GigPrep[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('cueforge_gig_preps', JSON.stringify(gigs));
}

// ── Component ──────────────────────────────────────────────────────────
export default function GigPrepPage() {
  const [gigs, setGigs] = useState<GigPrep[]>([]);
  const [activeGigId, setActiveGigId] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState(true);

  // Load from localStorage
  useEffect(() => {
    const loaded = loadGigs();
    setGigs(loaded);
    if (loaded.length > 0) setActiveGigId(loaded[0].id);
  }, []);

  // Auto-save
  useEffect(() => {
    if (gigs.length > 0) {
      saveGigs(gigs);
    }
  }, [gigs]);

  const activeGig = gigs.find(g => g.id === activeGigId) || null;

  function createNewGig() {
    const newGig: GigPrep = {
      id: generateId(),
      info: { name: '', venue: '', date: '', startTime: '', endTime: '', genre: '', notes: '' },
      checklist: DEFAULT_CHECKLIST.map(item => ({ ...item, id: generateId() })),
      createdAt: new Date().toISOString(),
    };
    setGigs(prev => [newGig, ...prev]);
    setActiveGigId(newGig.id);
  }

  function deleteGig(gigId: string) {
    if (!window.confirm('Supprimer cette préparation de gig ?')) return;
    setGigs(prev => prev.filter(g => g.id !== gigId));
    if (activeGigId === gigId) {
      setActiveGigId(gigs.find(g => g.id !== gigId)?.id || null);
    }
  }

  function updateGigInfo(field: keyof GigInfo, value: string) {
    setGigs(prev => prev.map(g =>
      g.id === activeGigId ? { ...g, info: { ...g.info, [field]: value } } : g
    ));
    setSaved(false);
    setTimeout(() => setSaved(true), 800);
  }

  function toggleCheckItem(itemId: string) {
    setGigs(prev => prev.map(g =>
      g.id === activeGigId
        ? { ...g, checklist: g.checklist.map(i => i.id === itemId ? { ...i, checked: !i.checked } : i) }
        : g
    ));
  }

  function addCheckItem(category: string) {
    const label = window.prompt('Nouvel élément :');
    if (!label?.trim()) return;
    setGigs(prev => prev.map(g =>
      g.id === activeGigId
        ? { ...g, checklist: [...g.checklist, { id: generateId(), label: label.trim(), checked: false, category }] }
        : g
    ));
  }

  function removeCheckItem(itemId: string) {
    setGigs(prev => prev.map(g =>
      g.id === activeGigId
        ? { ...g, checklist: g.checklist.filter(i => i.id !== itemId) }
        : g
    ));
  }

  function toggleCategory(cat: string) {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }

  // Group checklist by category
  const categories = activeGig
    ? Array.from(new Set(activeGig.checklist.map(i => i.category)))
    : [];

  const totalItems = activeGig?.checklist.length || 0;
  const checkedItems = activeGig?.checklist.filter(i => i.checked).length || 0;
  const progress = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;

  // Upcoming gigs (sorted by date)
  const sortedGigs = [...gigs].sort((a, b) => {
    if (!a.info.date) return 1;
    if (!b.info.date) return -1;
    return new Date(a.info.date).getTime() - new Date(b.info.date).getTime();
  });

  return (
    <div className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600/30 to-pink-600/30 flex items-center justify-center">
            <Sparkles size={20} className="text-purple-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[var(--text-primary)]">Préparation de Gig</h1>
            <p className="text-[13px] text-[var(--text-muted)]">Checklist complète pour ne rien oublier</p>
          </div>
        </div>
        <button
          onClick={createNewGig}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-semibold cursor-pointer border-none hover:opacity-90 transition-opacity"
        >
          <Plus size={16} />
          Nouveau Gig
        </button>
      </div>

      {/* Gig selector */}
      {gigs.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {sortedGigs.map(gig => {
            const gigChecked = gig.checklist.filter(i => i.checked).length;
            const gigTotal = gig.checklist.length;
            const isActive = gig.id === activeGigId;
            return (
              <button
                key={gig.id}
                onClick={() => setActiveGigId(gig.id)}
                className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all cursor-pointer ${
                  isActive
                    ? 'bg-purple-600/20 border-purple-500/40 text-[var(--text-primary)]'
                    : 'bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-medium truncate max-w-[150px]">
                    {gig.info.name || 'Sans nom'}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    {gig.info.date || 'Pas de date'} · {gigChecked}/{gigTotal}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* No gig state */}
      {gigs.length === 0 && (
        <div className="bg-[var(--bg-card)] rounded-[14px] border border-[var(--border-subtle)] p-12 flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-purple-600/15 flex items-center justify-center">
            <Headphones size={28} className="text-purple-400" />
          </div>
          <div className="text-center">
            <div className="text-base font-semibold text-[var(--text-primary)]">Aucune préparation de gig</div>
            <div className="text-[13px] text-[var(--text-muted)] mt-1">Crée ta première checklist pour ne rien oublier le jour J !</div>
          </div>
          <button
            onClick={createNewGig}
            className="px-5 py-2.5 rounded-lg bg-purple-600 text-white text-sm font-semibold cursor-pointer border-none hover:bg-purple-500 transition-colors"
          >
            Créer une checklist
          </button>
        </div>
      )}

      {/* Active Gig */}
      {activeGig && (
        <>
          {/* Progress Bar */}
          <div className="bg-[var(--bg-card)] rounded-[14px] border border-[var(--border-subtle)] p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-[var(--text-primary)]">Progression</span>
              <span className={`text-sm font-bold ${
                progress === 100 ? 'text-emerald-400' :
                progress >= 75 ? 'text-blue-400' :
                progress >= 50 ? 'text-amber-400' :
                'text-[var(--text-muted)]'
              }`}>
                {checkedItems}/{totalItems} · {progress}%
              </span>
            </div>
            <div className="w-full h-3 bg-[var(--bg-primary)] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  progress === 100 ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' :
                  progress >= 75 ? 'bg-gradient-to-r from-blue-500 to-blue-400' :
                  progress >= 50 ? 'bg-gradient-to-r from-amber-500 to-amber-400' :
                  'bg-gradient-to-r from-purple-600 to-pink-500'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
            {progress === 100 && (
              <div className="flex items-center gap-2 mt-3 text-emerald-400">
                <CheckCircle2 size={16} />
                <span className="text-sm font-medium">Tu es prêt pour le gig ! 🎉</span>
              </div>
            )}
          </div>

          {/* Gig Info */}
          <div className="bg-[var(--bg-card)] rounded-[14px] border border-[var(--border-subtle)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-[var(--text-primary)]">Infos du gig</h2>
              <button
                onClick={() => deleteGig(activeGig.id)}
                className="p-1.5 hover:bg-red-500/20 rounded-lg text-red-400 bg-transparent border-none cursor-pointer"
                title="Supprimer"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase mb-1 block">Nom de l'événement</label>
                <input
                  type="text"
                  value={activeGig.info.name}
                  onChange={e => updateGigInfo('name', e.target.value)}
                  placeholder="Ex: Warehouse Party"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] outline-none focus:border-purple-500 transition-colors"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase mb-1 block">Lieu</label>
                <div className="relative">
                  <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    value={activeGig.info.venue}
                    onChange={e => updateGigInfo('venue', e.target.value)}
                    placeholder="Ex: Le Rex Club"
                    className="w-full pl-8 pr-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] outline-none focus:border-purple-500 transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase mb-1 block">Date</label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    type="date"
                    value={activeGig.info.date}
                    onChange={e => updateGigInfo('date', e.target.value)}
                    className="w-full pl-8 pr-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] outline-none focus:border-purple-500 transition-colors"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase mb-1 block">Début</label>
                  <div className="relative">
                    <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                      type="time"
                      value={activeGig.info.startTime}
                      onChange={e => updateGigInfo('startTime', e.target.value)}
                      className="w-full pl-8 pr-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] outline-none focus:border-purple-500 transition-colors"
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase mb-1 block">Fin</label>
                  <input
                    type="time"
                    value={activeGig.info.endTime}
                    onChange={e => updateGigInfo('endTime', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] outline-none focus:border-purple-500 transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase mb-1 block">Genre</label>
                <select
                  value={activeGig.info.genre}
                  onChange={e => updateGigInfo('genre', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] outline-none focus:border-purple-500 transition-colors cursor-pointer"
                >
                  <option value="">Sélectionner...</option>
                  {GENRE_PRESETS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase mb-1 block">Notes</label>
                <input
                  type="text"
                  value={activeGig.info.notes}
                  onChange={e => updateGigInfo('notes', e.target.value)}
                  placeholder="Ex: Set B2B avec Alex, crowd jeune"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] outline-none focus:border-purple-500 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Checklist */}
          <div className="space-y-3">
            {categories.map(cat => {
              const items = activeGig.checklist.filter(i => i.category === cat);
              const catChecked = items.filter(i => i.checked).length;
              const isCollapsed = collapsedCategories.has(cat);
              const catIcon = cat === 'Matériel' ? '🎛️' : cat === 'Musique' ? '🎵' : cat === 'Logistique' ? '🚗' : '🎧';

              return (
                <div key={cat} className="bg-[var(--bg-card)] rounded-[14px] border border-[var(--border-subtle)] overflow-hidden">
                  {/* Category header */}
                  <button
                    onClick={() => toggleCategory(cat)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-transparent border-none cursor-pointer text-left hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <span className="text-base">{catIcon}</span>
                    <span className="flex-1 text-sm font-bold text-[var(--text-primary)]">{cat}</span>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                      catChecked === items.length
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'
                    }`}>
                      {catChecked}/{items.length}
                    </span>
                    {isCollapsed ? <ChevronDown size={14} className="text-[var(--text-muted)]" /> : <ChevronUp size={14} className="text-[var(--text-muted)]" />}
                  </button>

                  {/* Items */}
                  {!isCollapsed && (
                    <div className="border-t border-[var(--border-subtle)] px-2 py-1">
                      {items.map(item => (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors group"
                        >
                          <button
                            onClick={() => toggleCheckItem(item.id)}
                            className="bg-transparent border-none cursor-pointer p-0 flex-shrink-0"
                          >
                            {item.checked ? (
                              <CheckCircle2 size={18} className="text-emerald-400" />
                            ) : (
                              <Circle size={18} className="text-[var(--text-muted)]" />
                            )}
                          </button>
                          <span className={`flex-1 text-[13px] ${
                            item.checked
                              ? 'text-[var(--text-muted)] line-through'
                              : 'text-[var(--text-primary)]'
                          }`}>
                            {item.label}
                          </span>
                          <button
                            onClick={() => removeCheckItem(item.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded text-red-400 bg-transparent border-none cursor-pointer transition-opacity"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => addCheckItem(cat)}
                        className="flex items-center gap-2 px-2 py-2 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-transparent border-none cursor-pointer transition-colors"
                      >
                        <Plus size={14} />
                        Ajouter un élément
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
