// @ts-nocheck
'use client';

import { useState } from 'react';
import { X, Tag, Trash2, Download, Zap, Palette, FolderOpen, Star, CheckSquare } from 'lucide-react';
import { CATEGORY_PRESETS } from '@/types';

interface BatchActionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBatchTag: (tag: string) => void;
  onBatchCategory: (category: string) => void;
  onBatchRating: (rating: number) => void;
  onBatchColor: (color: string) => void;
  onBatchAnalyze: () => void;
  onBatchExport: () => void;
  onBatchDelete: () => void;
  onSelectAll: () => void;
}

const QUICK_TAGS = ['vocal', 'instrumental', 'peak', 'warmup', 'dark', 'melodic', 'groovy', 'festival', 'closing', 'build'];
const COLORS = [
  { name: 'Rouge', value: '#C02626' },
  { name: 'Orange', value: '#F8821A' },
  { name: 'Jaune', value: '#F1E315' },
  { name: 'Vert', value: '#1FAD2D' },
  { name: 'Bleu', value: '#1644AD' },
  { name: 'Violet', value: '#9110C2' },
  { name: 'Rose', value: '#E91180' },
];

export default function BatchActionBar({
  selectedCount,
  onClearSelection,
  onBatchTag,
  onBatchCategory,
  onBatchRating,
  onBatchColor,
  onBatchAnalyze,
  onBatchExport,
  onBatchDelete,
  onSelectAll,
}: BatchActionBarProps) {
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [customTag, setCustomTag] = useState('');

  if (selectedCount === 0) return null;

  return (
    <div className="sticky top-0 z-40 bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-xl px-4 py-2.5 flex items-center gap-3 backdrop-blur-sm">
      {/* Selection info */}
      <div className="flex items-center gap-2">
        <CheckSquare size={16} className="text-blue-400" />
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          {selectedCount} sélectionné{selectedCount > 1 ? 's' : ''}
        </span>
        <button
          onClick={onSelectAll}
          className="text-[10px] text-blue-400 hover:text-blue-300 bg-transparent border-none cursor-pointer underline"
        >
          Tout sélectionner
        </button>
      </div>

      <div className="h-4 w-px bg-[var(--border-subtle)]" />

      {/* Quick actions */}
      <div className="flex items-center gap-1.5 flex-1">
        {/* Tag */}
        <div className="relative">
          <button
            onClick={() => { setShowTagMenu(!showTagMenu); setShowCategoryMenu(false); setShowColorMenu(false); }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)] transition-all cursor-pointer"
          >
            <Tag size={12} /> Tag
          </button>
          {showTagMenu && (
            <div className="absolute top-full left-0 mt-1 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg shadow-xl z-50 p-2 min-w-[200px]">
              <div className="flex flex-wrap gap-1 mb-2">
                {QUICK_TAGS.map(tag => (
                  <button
                    key={tag}
                    onClick={() => { onBatchTag(tag); setShowTagMenu(false); }}
                    className="px-2 py-0.5 rounded-full text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 cursor-pointer transition-colors"
                  >
                    {tag}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={customTag}
                  onChange={e => setCustomTag(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && customTag.trim()) {
                      onBatchTag(customTag.trim());
                      setCustomTag('');
                      setShowTagMenu(false);
                    }
                  }}
                  placeholder="Tag personnalisé..."
                  className="flex-1 px-2 py-1 text-[10px] bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded text-[var(--text-primary)] outline-none"
                />
                <button
                  onClick={() => {
                    if (customTag.trim()) {
                      onBatchTag(customTag.trim());
                      setCustomTag('');
                      setShowTagMenu(false);
                    }
                  }}
                  className="px-2 py-1 text-[10px] bg-blue-600 text-white rounded font-semibold cursor-pointer border-none"
                >
                  +
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Category */}
        <div className="relative">
          <button
            onClick={() => { setShowCategoryMenu(!showCategoryMenu); setShowTagMenu(false); setShowColorMenu(false); }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)] transition-all cursor-pointer"
          >
            <FolderOpen size={12} /> Catégorie
          </button>
          {showCategoryMenu && (
            <div className="absolute top-full left-0 mt-1 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg shadow-xl z-50 py-1 min-w-[160px]">
              {CATEGORY_PRESETS.map(cat => (
                <button
                  key={cat}
                  onClick={() => { onBatchCategory(cat); setShowCategoryMenu(false); }}
                  className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] bg-transparent border-none cursor-pointer transition-colors"
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Color */}
        <div className="relative">
          <button
            onClick={() => { setShowColorMenu(!showColorMenu); setShowTagMenu(false); setShowCategoryMenu(false); }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)] transition-all cursor-pointer"
          >
            <Palette size={12} /> Couleur
          </button>
          {showColorMenu && (
            <div className="absolute top-full left-0 mt-1 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg shadow-xl z-50 p-2">
              <div className="flex gap-1.5">
                {COLORS.map(c => (
                  <button
                    key={c.value}
                    onClick={() => { onBatchColor(c.value); setShowColorMenu(false); }}
                    className="w-6 h-6 rounded-full border border-transparent hover:border-white hover:scale-110 transition-all cursor-pointer"
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Rating */}
        <div className="flex items-center gap-0.5 px-2">
          {[1, 2, 3, 4, 5].map(star => (
            <button
              key={star}
              onClick={() => onBatchRating(star)}
              className="p-0.5 hover:bg-[var(--bg-hover)] rounded cursor-pointer bg-transparent border-none transition-colors"
              title={`${star} étoile${star > 1 ? 's' : ''}`}
            >
              <Star size={14} className="text-[var(--text-muted)] hover:text-yellow-500 hover:fill-yellow-500 transition-colors" />
            </button>
          ))}
        </div>

        {/* Analyze */}
        <button
          onClick={onBatchAnalyze}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/30 transition-all cursor-pointer"
        >
          <Zap size={12} /> Analyser
        </button>

        {/* Export */}
        <button
          onClick={onBatchExport}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)] transition-all cursor-pointer"
        >
          <Download size={12} /> Exporter
        </button>
      </div>

      {/* Delete & Close */}
      <button
        onClick={onBatchDelete}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all cursor-pointer"
      >
        <Trash2 size={12} /> Supprimer
      </button>

      <button
        onClick={onClearSelection}
        className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all cursor-pointer bg-transparent border-none"
      >
        <X size={14} />
      </button>
    </div>
  );
}
