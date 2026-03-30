'use client';

import { useState, useEffect } from 'react';
import {
  Layers, Plus, Trash2, Loader2, ChevronDown, ChevronUp,
  Music2, Sliders, Check, X, Filter, Zap, Hash,
} from 'lucide-react';
import { listCrates, getCrate, createCrate, deleteCrate } from '@/lib/api';
import type { SmartCrate, SmartCrateDetail, CrateRule } from '@/lib/api';

const CRATE_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#8b5cf6', '#ec4899'];

const FIELD_OPTIONS = [
  { value: 'bpm', label: 'BPM', type: 'number' },
  { value: 'energy', label: 'Énergie', type: 'number' },
  { value: 'genre', label: 'Genre', type: 'text' },
  { value: 'artist', label: 'Artiste', type: 'text' },
  { value: 'key', label: 'Tonalité', type: 'text' },
  { value: 'year', label: 'Année', type: 'number' },
  { value: 'rating', label: 'Note', type: 'number' },
  { value: 'camelot_code', label: 'Camelot', type: 'text' },
];

const OP_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  number: [
    { value: 'eq', label: '=' },
    { value: 'gt', label: '>' },
    { value: 'gte', label: '>=' },
    { value: 'lt', label: '<' },
    { value: 'lte', label: '<=' },
    { value: 'between', label: 'entre' },
  ],
  text: [
    { value: 'eq', label: '=' },
    { value: 'contains', label: 'contient' },
    { value: 'starts_with', label: 'commence par' },
  ],
};

interface RuleBuilderProps {
  rules: CrateRule[];
  onChange: (rules: CrateRule[]) => void;
}

function RuleBuilder({ rules, onChange }: RuleBuilderProps) {
  function addRule() {
    onChange([...rules, { field: 'bpm', op: 'between', value: [120, 130] }]);
  }

  function updateRule(i: number, patch: Partial<CrateRule>) {
    const updated = rules.map((r, idx) => idx === i ? { ...r, ...patch } : r);
    onChange(updated);
  }

  function removeRule(i: number) {
    onChange(rules.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      {rules.map((rule, i) => {
        const fieldMeta = FIELD_OPTIONS.find(f => f.value === rule.field);
        const fieldType = fieldMeta?.type || 'text';
        const ops = OP_OPTIONS[fieldType] || OP_OPTIONS.text;

        return (
          <div key={i} className="flex items-center gap-2 bg-[var(--bg-input)] rounded-xl px-3 py-2">
            {/* Field */}
            <select
              value={rule.field}
              onChange={e => {
                const newField = e.target.value;
                const newType = FIELD_OPTIONS.find(f => f.value === newField)?.type || 'text';
                const defaultOp = OP_OPTIONS[newType][0].value;
                const defaultVal = newType === 'number' ? (defaultOp === 'between' ? [120, 130] : 0) : '';
                updateRule(i, { field: newField, op: defaultOp, value: defaultVal });
              }}
              className="bg-transparent text-[var(--text-primary)] text-[12px] outline-none cursor-pointer border-none"
            >
              {FIELD_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>

            {/* Op */}
            <select
              value={rule.op}
              onChange={e => updateRule(i, { op: e.target.value })}
              className="bg-transparent text-[var(--text-muted)] text-[12px] outline-none cursor-pointer border-none"
            >
              {ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            {/* Value */}
            {rule.op === 'between' ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={Array.isArray(rule.value) ? rule.value[0] : ''}
                  onChange={e => updateRule(i, { value: [Number(e.target.value), Array.isArray(rule.value) ? rule.value[1] : 0] })}
                  className="w-16 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded px-2 py-0.5 text-[12px] text-[var(--text-primary)] outline-none"
                />
                <span className="text-[11px] text-[var(--text-muted)]">–</span>
                <input
                  type="number"
                  value={Array.isArray(rule.value) ? rule.value[1] : ''}
                  onChange={e => updateRule(i, { value: [Array.isArray(rule.value) ? rule.value[0] : 0, Number(e.target.value)] })}
                  className="w-16 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded px-2 py-0.5 text-[12px] text-[var(--text-primary)] outline-none"
                />
              </div>
            ) : (
              <input
                type={FIELD_OPTIONS.find(f => f.value === rule.field)?.type === 'number' ? 'number' : 'text'}
                value={rule.value as string | number}
                onChange={e => {
                  const t = FIELD_OPTIONS.find(f => f.value === rule.field)?.type;
                  updateRule(i, { value: t === 'number' ? Number(e.target.value) : e.target.value });
                }}
                placeholder="valeur..."
                className="w-24 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded px-2 py-0.5 text-[12px] text-[var(--text-primary)] outline-none"
              />
            )}

            <button
              onClick={() => removeRule(i)}
              className="ml-auto text-[var(--text-muted)] hover:text-red-400 bg-transparent border-none cursor-pointer p-0.5"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
      <button
        onClick={addRule}
        className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-transparent border border-dashed border-[var(--border-subtle)] hover:border-[var(--border-default)] rounded-xl px-3 py-2 w-full transition-colors cursor-pointer"
      >
        <Plus size={12} /> Ajouter une règle
      </button>
    </div>
  );
}

export default function CratesPage() {
  const [crates, setCrates] = useState<SmartCrate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<SmartCrateDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRules, setNewRules] = useState<CrateRule[]>([{ field: 'bpm', op: 'between', value: [120, 130] }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setCrates(await listCrates()); } catch {}
    finally { setLoading(false); }
  }

  async function handleExpand(id: number) {
    if (expandedId === id) { setExpandedId(null); setExpandedDetail(null); return; }
    setExpandedId(id);
    setExpandedDetail(null);
    setLoadingDetail(true);
    try { setExpandedDetail(await getCrate(id)); } catch {}
    finally { setLoadingDetail(false); }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || newRules.length === 0) return;
    setSaving(true);
    try {
      const crate = await createCrate({ name: newName.trim(), rules: newRules });
      setCrates(prev => [crate, ...prev]);
      setNewName('');
      setNewRules([{ field: 'bpm', op: 'between', value: [120, 130] }]);
      setCreating(false);
    } catch {}
    finally { setSaving(false); }
  }

  async function handleDelete(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await deleteCrate(id);
      setCrates(prev => prev.filter(c => c.id !== id));
      if (expandedId === id) { setExpandedId(null); setExpandedDetail(null); }
    } catch {}
  }

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Layers size={20} className="text-purple-400" />
            Smart Crates
          </h1>
          <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
            Playlists dynamiques basées sur des règles automatiques
          </p>
        </div>
        <button
          onClick={() => setCreating(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg transition-colors border-none cursor-pointer"
        >
          <Plus size={14} /> Nouveau crate
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <form onSubmit={handleCreate} className="mb-5 bg-[var(--bg-card)] border border-purple-500/30 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Nom du crate..."
              className="flex-1 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-purple-500"
            />
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-transparent border-none cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Règles</p>
            <RuleBuilder rules={newRules} onChange={setNewRules} />
          </div>
          <button
            type="submit"
            disabled={saving || !newName.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors border-none cursor-pointer"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Créer le crate
          </button>
        </form>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-[var(--text-muted)]">
          <Loader2 size={20} className="animate-spin mr-2" /> Chargement...
        </div>
      )}

      {/* Empty state */}
      {!loading && crates.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-purple-600/10 flex items-center justify-center mb-4">
            <Filter size={28} className="text-purple-400" />
          </div>
          <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">Aucun Smart Crate</h3>
          <p className="text-[13px] text-[var(--text-muted)] mb-4">
            Crée un crate avec des règles automatiques — ex: "Tech House entre 126-130 BPM"
          </p>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-lg transition-colors border-none cursor-pointer"
          >
            <Plus size={14} /> Créer un crate
          </button>
        </div>
      )}

      {/* Crate list */}
      <div className="space-y-3">
        {crates.map((crate, idx) => {
          const color = CRATE_COLORS[idx % CRATE_COLORS.length];
          const isExpanded = expandedId === crate.id;

          return (
            <div
              key={crate.id}
              className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden transition-all"
              style={isExpanded ? { borderColor: color + '40' } : {}}
            >
              {/* Crate header */}
              <div
                className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
                onClick={() => handleExpand(crate.id)}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                <div className="flex-1 min-w-0">
                  <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">{crate.name}</h3>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-[var(--text-muted)]">
                    <span className="flex items-center gap-1"><Music2 size={11} /> {crate.track_count} tracks</span>
                    <span className="flex items-center gap-1"><Filter size={11} /> {crate.rules.length} règle{crate.rules.length !== 1 ? 's' : ''}</span>
                    <span className="capitalize">{crate.match_mode === 'all' ? 'Toutes' : "L'une des"} règles</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => handleDelete(crate.id, e)}
                    className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 bg-transparent border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-all"
                    title="Supprimer"
                  >
                    <Trash2 size={13} />
                  </button>
                  {isExpanded ? <ChevronUp size={15} className="text-[var(--text-muted)]" /> : <ChevronDown size={15} className="text-[var(--text-muted)]" />}
                </div>
              </div>

              {/* Rules summary (always visible) */}
              <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                {crate.rules.map((rule, i) => {
                  const fieldLabel = FIELD_OPTIONS.find(f => f.value === rule.field)?.label || rule.field;
                  const val = Array.isArray(rule.value) ? `${rule.value[0]}–${rule.value[1]}` : String(rule.value);
                  return (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                      style={{ background: color + '15', color }}>
                      {fieldLabel} {rule.op === 'contains' ? 'contient' : rule.op === 'between' ? 'entre' : rule.op} {val}
                    </span>
                  );
                })}
              </div>

              {/* Expanded track list */}
              {isExpanded && (
                <div className="border-t border-[var(--border-subtle)]">
                  {loadingDetail ? (
                    <div className="flex items-center justify-center py-6 text-[var(--text-muted)]">
                      <Loader2 size={16} className="animate-spin mr-2" /> Calcul des tracks...
                    </div>
                  ) : expandedDetail && expandedDetail.tracks.length > 0 ? (
                    <div className="divide-y divide-[var(--border-subtle)]">
                      {expandedDetail.tracks.map(t => (
                        <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg-hover)] transition-colors">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: color + '15' }}>
                            <Music2 size={13} style={{ color }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-semibold text-[var(--text-primary)] truncate">
                              {t.title || `Track ${t.id}`}
                            </p>
                            {t.artist && <p className="text-[11px] text-[var(--text-muted)] truncate">{t.artist}</p>}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
                            {t.bpm && <span className="font-mono">{Math.round(t.bpm)} BPM</span>}
                            {t.key && (
                              <span className="px-1.5 py-0.5 rounded font-mono font-semibold text-[10px]"
                                style={{ background: color + '20', color }}>
                                {t.key}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : expandedDetail ? (
                    <div className="py-6 text-center text-[13px] text-[var(--text-muted)]">
                      Aucune track ne correspond à ces règles pour le moment.
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
