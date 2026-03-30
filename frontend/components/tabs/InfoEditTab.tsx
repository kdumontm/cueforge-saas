// @ts-nocheck
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Save, Tag, Palette, MessageSquare, Music2, Star, Zap, RotateCcw, Check, X, Disc3, Hash } from 'lucide-react';
import type { Track } from '@/types';
import { CATEGORY_PRESETS } from '@/types';

interface InfoEditTabProps {
  track: Track | null;
  onSave: (trackId: number, data: Record<string, any>) => Promise<void>;
}

const COLOR_PRESETS = [
  { name: 'Rouge', value: '#C02626' },
  { name: 'Orange', value: '#F8821A' },
  { name: 'Jaune', value: '#F1E315' },
  { name: 'Vert', value: '#1FAD2D' },
  { name: 'Cyan', value: '#0DC5C1' },
  { name: 'Bleu', value: '#1644AD' },
  { name: 'Violet', value: '#9110C2' },
  { name: 'Rose', value: '#E91180' },
];

const TAG_SUGGESTIONS = [
  'vocal', 'instrumental', 'dark', 'uplifting', 'groovy', 'melodic',
  'peak', 'warmup', 'closing', 'festival', 'underground', 'classic',
  'remix', 'edit', 'mashup', 'b2b', 'transition', 'build',
];

export default function InfoEditTab({ track, onSave }: InfoEditTabProps) {
  const [formData, setFormData] = useState({
    title: '',
    artist: '',
    album: '',
    genre: '',
    label: '',
    category: '',
    tags: '',
    comment: '',
    color_code: '',
    energy_level: 0,
    rating: 0,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Sync form when track changes
  useEffect(() => {
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
    setSaved(false);
  }, [track?.id]);

  const updateField = useCallback((field: string, value: any) => {
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
    const currentTags = formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    const idx = currentTags.indexOf(tag);
    if (idx >= 0) {
      currentTags.splice(idx, 1);
    } else {
      currentTags.push(tag);
    }
    updateField('tags', currentTags.join(','));
  };

  const currentTags = formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : [];

  if (!track) {
    return (
      <div className="flex items-center justify-center h-32 text-[var(--text-muted)] text-sm">
        Sélectionnez un morceau pour modifier ses informations
      </div>
    );
  }

  return (
    <div className="space-y-4 p-1">
      {/* Save Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Music2 size={16} className="text-[var(--accent-purple)]" />
          <span className="text-sm font-semibold text-[var(--text-primary)]">Informations du morceau</span>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={handleReset}
              className="px-2.5 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-1.5"
            >
              <RotateCcw size={12} /> Annuler
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              saved
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : dirty
                  ? 'bg-blue-600 text-white hover:bg-blue-500 cursor-pointer'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] cursor-not-allowed'
            }`}
          >
            {saving ? (
              <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : saved ? (
              <Check size={12} />
            ) : (
              <Save size={12} />
            )}
            {saved ? 'Sauvegardé' : 'Sauvegarder'}
          </button>
        </div>
      </div>

      {/* Main Info */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Titre</label>
          <input
            type="text"
            value={formData.title}
            onChange={e => updateField('title', e.target.value)}
            className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Artiste</label>
          <input
            type="text"
            value={formData.artist}
            onChange={e => updateField('artist', e.target.value)}
            className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Album</label>
          <input
            type="text"
            value={formData.album}
            onChange={e => updateField('album', e.target.value)}
            className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Genre</label>
          <input
            type="text"
            value={formData.genre}
            onChange={e => updateField('genre', e.target.value)}
            className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Label</label>
          <input
            type="text"
            value={formData.label}
            onChange={e => updateField('label', e.target.value)}
            className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Catégorie</label>
          <select
            value={formData.category}
            onChange={e => updateField('category', e.target.value)}
            className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-blue-500 transition-colors"
          >
            <option value="">— Aucune —</option>
            {CATEGORY_PRESETS.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Rating */}
      <div>
        <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
          <Star size={10} className="inline mr-1" />Évaluation
        </label>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map(star => (
            <button
              key={star}
              onClick={() => updateField('rating', formData.rating === star ? 0 : star)}
              className="p-1 hover:bg-[var(--bg-hover)] rounded transition-colors"
            >
              <Star
                size={20}
                className={star <= formData.rating
                  ? 'fill-yellow-500 text-yellow-500'
                  : 'text-[var(--text-muted)]'
                }
              />
            </button>
          ))}
          {formData.rating > 0 && (
            <span className="ml-2 text-xs text-[var(--text-muted)]">{formData.rating}/5</span>
          )}
        </div>
      </div>

      {/* Energy Level */}
      <div>
        <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
          <Zap size={10} className="inline mr-1" />Niveau d'énergie: {formData.energy_level || '—'}
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="0"
            max="10"
            value={formData.energy_level}
            onChange={e => updateField('energy_level', parseInt(e.target.value))}
            className="flex-1 accent-blue-500"
          />
          <div className="flex gap-0.5">
            {Array.from({ length: 10 }, (_, i) => (
              <div
                key={i}
                className={`w-2 h-4 rounded-sm transition-colors ${
                  i < formData.energy_level
                    ? i < 3 ? 'bg-emerald-500' : i < 6 ? 'bg-yellow-500' : i < 8 ? 'bg-orange-500' : 'bg-red-500'
                    : 'bg-[var(--bg-primary)]'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Color Code */}
      <div>
        <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
          <Palette size={10} className="inline mr-1" />Couleur
        </label>
        <div className="flex items-center gap-2 flex-wrap">
          {COLOR_PRESETS.map(c => (
            <button
              key={c.value}
              onClick={() => updateField('color_code', formData.color_code === c.value ? '' : c.value)}
              className={`w-7 h-7 rounded-full border-2 transition-all hover:scale-110 ${
                formData.color_code === c.value
                  ? 'border-white scale-110 shadow-lg'
                  : 'border-transparent opacity-70 hover:opacity-100'
              }`}
              style={{ backgroundColor: c.value }}
              title={c.name}
            />
          ))}
          {formData.color_code && (
            <button
              onClick={() => updateField('color_code', '')}
              className="w-7 h-7 rounded-full border border-[var(--border-subtle)] flex items-center justify-center hover:bg-[var(--bg-hover)] transition-colors"
              title="Supprimer la couleur"
            >
              <X size={12} className="text-[var(--text-muted)]" />
            </button>
          )}
        </div>
      </div>

      {/* Tags */}
      <div>
        <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
          <Tag size={10} className="inline mr-1" />Tags
        </label>
        {/* Current tags */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {currentTags.map(tag => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 transition-all flex items-center gap-1"
            >
              {tag} <X size={10} />
            </button>
          ))}
          {currentTags.length === 0 && (
            <span className="text-xs text-[var(--text-muted)] italic">Aucun tag</span>
          )}
        </div>
        {/* Suggestions */}
        <div className="flex flex-wrap gap-1">
          {TAG_SUGGESTIONS.filter(t => !currentTags.includes(t)).map(tag => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className="px-2 py-0.5 rounded-full text-[10px] bg-[var(--bg-primary)] text-[var(--text-muted)] border border-[var(--border-subtle)] hover:border-blue-500/50 hover:text-blue-400 transition-all"
            >
              + {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Comment */}
      <div>
        <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">
          <MessageSquare size={10} className="inline mr-1" />Commentaire
        </label>
        <textarea
          value={formData.comment}
          onChange={e => updateField('comment', e.target.value)}
          placeholder="Notes personnelles, mix ideas, etc."
          rows={2}
          className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500 transition-colors resize-none"
        />
      </div>

      {/* Analysis Info (read-only) */}
      {track.analysis && (
        <div className="p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
          <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
            <Disc3 size={10} className="inline mr-1" />Analyse (auto-détecté)
          </div>
          <div className="grid grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-[var(--text-muted)]">BPM</span>
              <div className="font-mono font-bold text-[var(--text-primary)]">{track.analysis.bpm ? Math.round(track.analysis.bpm * 10) / 10 : '—'}</div>
            </div>
            <div>
              <span className="text-[var(--text-muted)]">Tonalité</span>
              <div className="font-mono font-bold text-[var(--text-primary)]">{track.analysis.key || '—'}</div>
            </div>
            <div>
              <span className="text-[var(--text-muted)]">Énergie</span>
              <div className="font-mono font-bold text-[var(--text-primary)]">{track.analysis.energy ? Math.round(track.analysis.energy * 100) + '%' : '—'}</div>
            </div>
            <div>
              <span className="text-[var(--text-muted)]">Durée</span>
              <div className="font-mono font-bold text-[var(--text-primary)]">
                {track.analysis.duration_ms ? `${Math.floor(track.analysis.duration_ms / 60000)}:${String(Math.floor((track.analysis.duration_ms % 60000) / 1000)).padStart(2, '0')}` : '—'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
