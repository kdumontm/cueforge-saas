'use client';

import { useState, useEffect } from 'react';
import {
  X, Star, Tag, Folder, MessageSquare, Zap, Palette,
  ChevronDown, Check, Save, Disc3, CircleDot,
} from 'lucide-react';
import type { Track, CuePoint } from '@/types';
import { CATEGORY_PRESETS, REKORDBOX_CUE_COLORS, CUE_COLORS } from '@/types';
import {
  updateTrackOrganization,
  setCueMode,
  setCueColor,
  getTrackCuePoints,
} from '@/lib/api';

interface TrackOrganizerProps {
  track: Track;
  onClose: () => void;
  onUpdate: (track: Track) => void;
}

// Star Rating Component
function StarRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(star === value ? 0 : star)}
          className="p-0.5 transition-transform hover:scale-110"
        >
          <Star
            size={18}
            className={
              star <= (hover || value)
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-slate-600'
            }
          />
        </button>
      ))}
    </div>
  );
}

function CueRow({
  cue, index, onModeChange, onColorChange,
}: {
  cue: CuePoint; index: number;
  onModeChange: (id: number, mode: 'memory' | 'hot') => void;
  onColorChange: (id: number, color: string) => void;
}) {
  const [showColors, setShowColors] = useState(false);
  const mode = cue.cue_mode || 'memory';
  const posMs = cue.position_ms;
  const m = Math.floor(posMs / 60000);
  const s = Math.floor((posMs % 60000) / 1000);
  const timeStr = `${m}:${s.toString().padStart(2, '0')}`;
  const cueColor = CUE_COLORS[cue.color as keyof typeof CUE_COLORS] || REKORDBOX_CUE_COLORS[cue.color] || '#2563eb';

  return (
    <div className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-bg-elevated/40 group">
      <span className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-black text-white flex-shrink-0" style={{ backgroundColor: cueColor }}>{index + 1}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-white truncate">{cue.name}</p>
        <p className="text-[10px] text-slate-500 font-mono">{timeStr}</p>
      </div>
      <div className="flex items-center bg-bg-primary rounded-md border border-slate-800/50 overflow-hidden">
        <button onClick={() => onModeChange(cue.id, 'memory')} className={`px-2 py-1 text-[10px] font-semibold transition-colors ${mode === 'memory' ? 'bg-blue-600/20 text-blue-400 border-r border-blue-600/30' : 'text-slate-500 hover:text-slate-300 border-r border-slate-800/50'}`} title="Memory Cue"><CircleDot size={12} /></button>
        <button onClick={() => onModeChange(cue.id, 'hot')} className={`px-2 py-1 text-[10px] font-semibold transition-colors ${mode === 'hot' ? 'bg-orange-600/20 text-orange-400' : 'text-slate-500 hover:text-slate-300'}`} title="Hot Cue"><Zap size={12} /></button>
      </div>
      <div className="relative">
        <button onClick={() => setShowColors(!showColors)} className="w-5 h-5 rounded-full border-2 border-slate-700 hover:border-slate-500 transition-colors" style={{ backgroundColor: cueColor }} title="Change color" />
        {showColors && (
          <div className="absolute right-0 top-7 z-50 bg-bg-secondary border border-slate-700 rounded-lg p-2 shadow-xl grid grid-cols-3 gap-1.5 min-w-[120px]">
            {Object.entries(REKORDBOX_CUE_COLORS).map(([name, hex]) => (
              <button key={name} onClick={() => { onColorChange(cue.id, name); setShowColors(false); }} className={`w-7 h-7 rounded-full border-2 transition-all hover:scale-110 ${cue.color === name ? 'border-white scale-110' : 'border-transparent'}`} style={{ backgroundColor: hex }} title={name} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TrackOrganizer({ track, onClose, onUpdate }: TrackOrganizerProps) {
  const [category, setCategory] = useState(track.category || '');
  const [tags, setTags] = useState(track.tags || '');
  const [rating, setRating] = useState(track.rating || 0);
  const [comment, setComment] = useState(track.comment || '');
  const [energyLevel, setEnergyLevel] = useState(track.energy_level || 0);
  const [colorCode, setColorCode] = useState(track.color_code || '');
  const [cuePoints, setCuePoints] = useState<CuePoint[]>(track.cue_points || []);
  const [saving, setSaving] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    getTrackCuePoints(track.id)
      .then((cues) => setCuePoints(cues as unknown as CuePoint[]))
      .catch(() => {});
  }, [track.id]);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await updateTrackOrganization(track.id, {
        category: category || null, tags: tags || null, rating: rating || null,
        color_code: colorCode || null, comment: comment || null, energy_level: energyLevel || null,
      });
      onUpdate({ ...track, ...updated });
    } catch (e) { console.error('Save failed:', e); }
    setSaving(false);
  }

  async function handleCueModeChange(cueId: number, mode: 'memory' | 'hot') {
    try {
      await setCueMode(cueId, mode);
      setCuePoints((prev) => prev.map((c) => (c.id === cueId ? { ...c, cue_mode: mode } : c)));
    } catch (e) { console.error('Failed to set cue mode:', e); }
  }

  async function handleCueColorChange(cueId: number, color: string) {
    try {
      const result = await setCueColor(cueId, color);
      setCuePoints((prev) => prev.map((c) => c.id === cueId ? { ...c, color: result.color, color_rgb: result.color_rgb } : c));
    } catch (e) { console.error('Failed to set cue color:', e); }
  }

  function addTag() {
    if (!tagInput.trim()) return;
    const currentTags = tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
    if (!currentTags.includes(tagInput.trim())) currentTags.push(tagInput.trim());
    setTags(currentTags.join(','));
    setTagInput('');
  }

  function removeTag(tagToRemove: string) {
    const currentTags = tags.split(',').map((t) => t.trim()).filter((t) => t && t !== tagToRemove);
    setTags(currentTags.join(','));
  }

  const tagList = tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
  const TRACK_COLORS = ['#E11D48', '#EA580C', '#CA8A04', '#16A34A', '#0891B2', '#2563EB', '#7C3AED', '#DB2777'];

  return (
    <div className="fixed inset-y-0 right-0 w-[400px] bg-bg-secondary border-l border-slate-800/60 z-40 shadow-2xl flex flex-col animate-slide-in">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/40 flex-shrink-0">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Folder size={16} className="text-purple-400" />Organisation DJ
        </h3>
        <div className="flex items-center gap-2">
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-all">
            <Save size={12} />{saving ? 'Saving...' : 'Sauvegarder'}
          </button>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors"><X size={16} /></button>
        </div>
      </div>
      <div className="px-4 py-3 border-b border-slate-800/30 flex-shrink-0">
        <div className="flex items-center gap-3">
          {track.artwork_url ? (
            <img src={track.artwork_url} alt="" className="w-12 h-12 rounded-lg object-cover" />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-bg-elevated flex items-center justify-center"><Disc3 size={20} className="text-slate-600" /></div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">{track.title || track.original_filename}</p>
            <p className="text-xs text-slate-400 truncate">{track.artist || 'Artiste inconnu'}</p>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Folder size={10} /> Catégorie</label>
          <div className="relative">
            <button onClick={() => setShowCategoryDropdown(!showCategoryDropdown)} className="w-full flex items-center justify-between px-3 py-2 bg-bg-primary border border-slate-800/50 rounded-lg text-xs text-white hover:border-slate-700 transition-colors">
              <span>{category || 'Sélectionner...'}</span><ChevronDown size={14} className="text-slate-500" />
            </button>
            {showCategoryDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-bg-secondary border border-slate-700 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
                <button onClick={() => { setCategory(''); setShowCategoryDropdown(false); }} className="w-full px-3 py-2 text-xs text-slate-400 hover:bg-bg-elevated text-left italic">Aucune catégorie</button>
                {CATEGORY_PRESETS.map((cat) => (
                  <button key={cat} onClick={() => { setCategory(cat); setShowCategoryDropdown(false); }} className={`w-full px-3 py-2 text-xs hover:bg-bg-elevated text-left flex items-center justify-between ${category === cat ? 'text-blue-400' : 'text-white'}`}>
                    {cat}{category === cat && <Check size={12} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Tag size={10} /> Tags</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {tagList.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-600/15 text-blue-400 text-[10px] font-medium rounded-md border border-blue-600/20">
                {tag}<button onClick={() => removeTag(tag)} className="hover:text-red-400 transition-colors"><X size={10} /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTag()} placeholder="Ajouter un tag..." className="flex-1 px-3 py-1.5 bg-bg-primary border border-slate-800/50 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-600/50" />
            <button onClick={addTag} className="px-3 py-1.5 bg-bg-elevated hover:bg-slate-700 text-xs text-slate-300 rounded-lg transition-colors">+</button>
          </div>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Star size={10} /> Note</label>
          <StarRating value={rating} onChange={setRating} />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Zap size={10} /> Énergie (1-10)</label>
          <div className="flex items-center gap-2">
            <input type="range" min={0} max={10} step={1} value={energyLevel} onChange={(e) => setEnergyLevel(parseInt(e.target.value))} className="flex-1 accent-yellow-500" />
            <span className="text-xs font-bold text-yellow-400 w-6 text-center">{energyLevel || '—'}</span>
          </div>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Palette size={10} /> Couleur du morceau</label>
          <div className="flex items-center gap-2">
            {TRACK_COLORS.map((c) => (
              <button key={c} onClick={() => setColorCode(c === colorCode ? '' : c)} className={`w-6 h-6 rounded-full border-2 transition-all hover:scale-110 ${colorCode === c ? 'border-white scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><MessageSquare size={10} /> Notes DJ</label>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Notes, rappels, transitions..." rows={3} className="w-full px-3 py-2 bg-bg-primary border border-slate-800/50 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-600/50 resize-none" />
        </div>
        {cuePoints.length > 0 && (
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1"><Disc3 size={10} /> Cue Points ({cuePoints.length})</label>
            <p className="text-[10px] text-slate-600 mb-2">Memory = sauvegardé · Hot = chargé au lancement</p>
            <div className="space-y-1">
              {cuePoints.map((cue, i) => (
                <CueRow key={cue.id} cue={cue} index={i} onModeChange={handleCueModeChange} onColorChange={handleCueColorChange} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
