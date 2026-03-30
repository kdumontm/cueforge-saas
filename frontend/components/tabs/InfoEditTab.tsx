// @ts-nocheck
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Save, RotateCcw, Check, X, Star } from 'lucide-react';
import type { Track } from '@/types';
import { CATEGORY_PRESETS } from '@/types';

interface InfoEditTabProps {
  track: Track | null;
  onSave: (trackId: number, data: Record<string, any>) => Promise<void>;
}

const COLOR_PRESETS = [
  { name: 'Rouge',  value: '#C02626' },
  { name: 'Orange', value: '#F8821A' },
  { name: 'Jaune',  value: '#F1E315' },
  { name: 'Vert',   value: '#1FAD2D' },
  { name: 'Cyan',   value: '#0DC5C1' },
  { name: 'Bleu',   value: '#1644AD' },
  { name: 'Violet', value: '#9110C2' },
  { name: 'Rose',   value: '#E91180' },
];

const TAG_SUGGESTIONS = [
  'vocal', 'instrumental', 'dark', 'uplifting', 'groovy', 'melodic',
  'peak', 'warmup', 'closing', 'festival', 'underground', 'classic',
  'remix', 'edit', 'mashup', 'b2b', 'transition', 'build',
];

function EnergyBar({ value }: { value: number }) {
  return (
    <div className="flex gap-0.5 mt-1">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className={`flex-1 h-1 rounded-sm ${
          i < value
            ? i < 3 ? 'bg-emerald-500' : i < 6 ? 'bg-yellow-500' : i < 8 ? 'bg-orange-500' : 'bg-red-500'
            : 'bg-[var(--bg-elevated)]'
        }`} />
      ))}
    </div>
  );
}

export default function InfoEditTab({ track, onSave }: InfoEditTabProps) {
  const [formData, setFormData] = useState({
    title: '', artist: '', album: '', genre: '', label: '',
    category: '', tags: '', comment: '', color_code: '',
    energy_level: 0, rating: 0,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!track) return;
    setFormData({
      title:        track.title || track.original_filename || '',
      artist:       track.artist || '',
      album:        track.album || '',
      genre:        track.genre || '',
      label:        (track as any).label || '',
      category:     track.category || '',
      tags:         track.tags || '',
      comment:      track.comment || '',
      color_code:   track.color_code || '',
      energy_level: track.energy_level || 0,
      rating:       track.rating || 0,
    });
    setDirty(false);
    setSaved(false);
  }, [track?.id]);

  const set = useCallback((field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setDirty(true);
    setSaved(false);
  }, []);

  const handleSave = async () => {
    if (!track || track.id < 0) return;
    setSaving(true);
    try {
      await onSave(track.id, formData);
      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('Save failed:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!track) return;
    setFormData({
      title: track.title || track.original_filename || '',
      artist: track.artist || '',
      album: track.album || '',
      genre: track.genre || '',
      label: (track as any).label || '',
      category: track.category || '',
      tags: track.tags || '',
      comment: track.comment || '',
      color_code: track.color_code || '',
      energy_level: track.energy_level || 0,
      rating: track.rating || 0,
    });
    setDirty(false);
  };

  const toggleTag = (tag: string) => {
    const tags = formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    const idx = tags.indexOf(tag);
    if (idx >= 0) tags.splice(idx, 1); else tags.push(tag);
    set('tags', tags.join(','));
  };

  const currentTags = formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : [];

  const inputCls = 'w-full px-2.5 py-1.5 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-md text-xs text-[var(--text-primary)] focus:outline-none focus:border-blue-500 transition-colors';
  const labelCls = 'block text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-1';

  if (!track) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
        Sélectionnez un morceau
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* Zone vide gauche */}
      <div className="flex-1" />

      {/* Panneau compact droit */}
      <div className="w-[270px] flex-shrink-0 flex flex-col h-full border-l border-[var(--border-subtle)] bg-[var(--bg-secondary)]">

        {/* Header sticky */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border-subtle)] flex-shrink-0">
          <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Informations</span>
          <div className="flex items-center gap-1.5">
            {dirty && (
              <button onClick={handleReset} className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors" title="Annuler">
                <RotateCcw size={11} />
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className={`px-2.5 py-1 rounded text-[10px] font-semibold flex items-center gap-1 transition-all ${
                saved    ? 'bg-emerald-500/20 text-emerald-400'
                : dirty  ? 'bg-blue-600 text-white hover:bg-blue-500 cursor-pointer'
                         : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] cursor-not-allowed'
              }`}
            >
              {saving ? <div className="w-2.5 h-2.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
               : saved ? <Check size={11} />
                       : <Save size={11} />}
              {saved ? 'Sauvé' : 'Sauver'}
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">

          <div>
            <label className={labelCls}>Titre</label>
            <input className={inputCls} value={formData.title} onChange={e => set('title', e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>Artiste</label>
            <input className={inputCls} value={formData.artist} onChange={e => set('artist', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Genre</label>
              <input className={inputCls} value={formData.genre} onChange={e => set('genre', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Label</label>
              <input className={inputCls} value={formData.label} onChange={e => set('label', e.target.value)} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Album</label>
            <input className={inputCls} value={formData.album} onChange={e => set('album', e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>Catégorie</label>
            <select className={inputCls} value={formData.category} onChange={e => set('category', e.target.value)}>
              <option value="">— Aucune —</option>
              {CATEGORY_PRESETS.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>

          {/* Rating */}
          <div>
            <label className={labelCls}>Évaluation</label>
            <div className="flex gap-1">
              {[1,2,3,4,5].map(s => (
                <button key={s} onClick={() => set('rating', formData.rating === s ? 0 : s)} className="hover:bg-[var(--bg-hover)] rounded p-0.5 transition-colors">
                  <Star size={16} className={s <= formData.rating ? 'fill-yellow-500 text-yellow-500' : 'text-[var(--bg-elevated)]'} />
                </button>
              ))}
            </div>
          </div>

          {/* Energy */}
          <div>
            <label className={labelCls}>Énergie <span className="normal-case font-normal text-[var(--text-muted)]">{formData.energy_level}/10</span></label>
            <input type="range" min="0" max="10" value={formData.energy_level} onChange={e => set('energy_level', parseInt(e.target.value))} className="w-full accent-blue-500" />
            <EnergyBar value={formData.energy_level} />
          </div>

          {/* Couleur */}
          <div>
            <label className={labelCls}>Couleur</label>
            <div className="flex gap-1.5 flex-wrap">
              {COLOR_PRESETS.map(c => (
                <button key={c.value} onClick={() => set('color_code', formData.color_code === c.value ? '' : c.value)}
                  className={`w-5 h-5 rounded-full border-2 transition-all hover:scale-110 ${formData.color_code === c.value ? 'border-white scale-110' : 'border-transparent opacity-60 hover:opacity-100'}`}
                  style={{ backgroundColor: c.value }} title={c.name} />
              ))}
              {formData.color_code && (
                <button onClick={() => set('color_code', '')} className="w-5 h-5 rounded-full border border-[var(--border-subtle)] flex items-center justify-center hover:bg-[var(--bg-hover)] transition-colors">
                  <X size={9} className="text-[var(--text-muted)]" />
                </button>
              )}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className={labelCls}>Tags</label>
            {currentTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {currentTags.map(tag => (
                  <button key={tag} onClick={() => toggleTag(tag)}
                    className="px-1.5 py-0.5 rounded-full text-[9px] bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 transition-all flex items-center gap-0.5">
                    {tag} <X size={8} />
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1">
              {TAG_SUGGESTIONS.filter(t => !currentTags.includes(t)).slice(0, 12).map(tag => (
                <button key={tag} onClick={() => toggleTag(tag)}
                  className="px-1.5 py-0.5 rounded-full text-[9px] bg-[var(--bg-primary)] text-[var(--text-muted)] border border-[var(--border-subtle)] hover:border-blue-500/50 hover:text-blue-400 transition-all">
                  +{tag}
                </button>
              ))}
            </div>
          </div>

          {/* Commentaire */}
          <div>
            <label className={labelCls}>Commentaire</label>
            <textarea value={formData.comment} onChange={e => set('comment', e.target.value)}
              placeholder="Notes, mix ideas..." rows={3}
              className="w-full px-2.5 py-1.5 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-md text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500 transition-colors resize-none" />
          </div>

        </div>
      </div>
    </div>
  );
}
