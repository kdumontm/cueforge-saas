// @ts-nocheck
'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Trash2, Eye, X, Merge } from 'lucide-react';
import type { Track } from '@/types';

interface DuplicateGroup {
  key: string;
  reason: string;
  tracks: Track[];
  confidence: number; // 0-100
}

function normalizeTitle(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')     // Remove parenthesized content
    .replace(/\[.*?\]/g, '')     // Remove bracketed content
    .replace(/feat\.?\s.*/i, '') // Remove feat. and after
    .replace(/ft\.?\s.*/i, '')
    .replace(/remix|edit|mix|version|extended|original|radio|bootleg|rework/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function normalizeArtist(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/&|,|\band\b|\bvs\.?\b|\bfeat\.?\b|\bft\.?\b/gi, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .sort()
    .join(' ')
    .trim();
}

function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const la = a.length, lb = b.length;
  if (la === 0 || lb === 0) return 0;
  const matrix: number[][] = [];
  for (let i = 0; i <= la; i++) matrix[i] = [i];
  for (let j = 0; j <= lb; j++) matrix[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return 1 - matrix[la][lb] / Math.max(la, lb);
}

function findDuplicates(tracks: Track[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const processed = new Set<number>();

  for (let i = 0; i < tracks.length; i++) {
    if (processed.has(tracks[i].id)) continue;
    const a = tracks[i];
    const titleA = normalizeTitle(a.title || a.original_filename || '');
    const artistA = normalizeArtist(a.artist || '');
    const matches: { track: Track; confidence: number; reason: string }[] = [];

    for (let j = i + 1; j < tracks.length; j++) {
      if (processed.has(tracks[j].id)) continue;
      const b = tracks[j];
      const titleB = normalizeTitle(b.title || b.original_filename || '');
      const artistB = normalizeArtist(b.artist || '');

      // Exact title+artist match
      if (titleA && titleA === titleB && artistA && artistA === artistB) {
        matches.push({ track: b, confidence: 98, reason: 'Même titre et artiste' });
        continue;
      }

      // Fuzzy title match with same artist
      if (artistA && artistA === artistB && titleA && titleB) {
        const sim = levenshteinSimilarity(titleA, titleB);
        if (sim > 0.85) {
          matches.push({ track: b, confidence: Math.round(sim * 90), reason: 'Titre très similaire, même artiste' });
          continue;
        }
      }

      // Same title, different artist spelling
      if (titleA && titleA === titleB && artistA && artistB) {
        const artistSim = levenshteinSimilarity(artistA, artistB);
        if (artistSim > 0.8) {
          matches.push({ track: b, confidence: Math.round(artistSim * 85), reason: 'Même titre, artiste similaire' });
          continue;
        }
      }

      // Filename match (without extension)
      const fnA = (a.original_filename || a.filename || '').replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const fnB = (b.original_filename || b.filename || '').replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (fnA && fnA === fnB) {
        matches.push({ track: b, confidence: 92, reason: 'Même nom de fichier' });
      }
    }

    if (matches.length > 0) {
      const avgConfidence = Math.round(matches.reduce((s, m) => s + m.confidence, 0) / matches.length);
      const matchedIds = matches.map(m => m.track.id);
      matchedIds.forEach(id => processed.add(id));
      processed.add(a.id);

      groups.push({
        key: `dup_${a.id}`,
        reason: matches[0].reason,
        tracks: [a, ...matches.map(m => m.track)],
        confidence: avgConfidence,
      });
    }
  }

  return groups.sort((a, b) => b.confidence - a.confidence);
}

interface DuplicateDetectorProps {
  tracks: Track[];
  onDeleteTrack?: (trackId: number) => void;
  onSelectTrack?: (track: Track) => void;
}

export default function DuplicateDetector({ tracks, onDeleteTrack, onSelectTrack }: DuplicateDetectorProps) {
  const duplicates = useMemo(() => findDuplicates(tracks), [tracks]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visibleDuplicates = duplicates.filter(d => !dismissed.has(d.key));

  if (visibleDuplicates.length === 0) return null;

  const toggleExpand = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const formatDuration = (ms: number | null | undefined) => {
    if (!ms) return '—';
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={16} className="text-amber-400" />
        <span className="text-sm font-bold text-amber-300">
          {visibleDuplicates.length} doublon{visibleDuplicates.length > 1 ? 's' : ''} détecté{visibleDuplicates.length > 1 ? 's' : ''}
        </span>
        <button
          onClick={() => setDismissed(new Set(duplicates.map(d => d.key)))}
          className="ml-auto text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-transparent border-none cursor-pointer"
        >
          Tout ignorer
        </button>
      </div>

      <div className="space-y-2">
        {visibleDuplicates.map(group => (
          <div key={group.key} className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] overflow-hidden">
            {/* Header */}
            <button
              onClick={() => toggleExpand(group.key)}
              className="w-full flex items-center gap-3 px-3 py-2.5 bg-transparent border-none cursor-pointer text-left hover:bg-[var(--bg-hover)] transition-colors"
            >
              {expanded.has(group.key) ? (
                <ChevronUp size={14} className="text-[var(--text-muted)]" />
              ) : (
                <ChevronDown size={14} className="text-[var(--text-muted)]" />
              )}
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-[var(--text-primary)] truncate block">
                  {group.tracks[0].title || group.tracks[0].original_filename}
                  <span className="text-[var(--text-muted)] font-normal"> — {group.tracks[0].artist || 'Inconnu'}</span>
                </span>
                <span className="text-[11px] text-amber-400">{group.reason}</span>
              </div>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                group.confidence >= 90 ? 'bg-red-500/20 text-red-400' :
                group.confidence >= 75 ? 'bg-amber-500/20 text-amber-400' :
                'bg-blue-500/20 text-blue-400'
              }`}>
                {group.confidence}%
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); setDismissed(prev => new Set([...prev, group.key])); }}
                className="p-1 hover:bg-[var(--bg-elevated)] rounded text-[var(--text-muted)] bg-transparent border-none cursor-pointer"
              >
                <X size={12} />
              </button>
            </button>

            {/* Expanded details */}
            {expanded.has(group.key) && (
              <div className="border-t border-[var(--border-subtle)] px-3 py-2 space-y-1.5">
                {group.tracks.map((track, idx) => (
                  <div key={track.id} className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors">
                    <span className="text-[11px] font-mono text-[var(--text-muted)] w-5">#{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-[var(--text-primary)] truncate">
                        {track.title || track.original_filename}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] flex gap-3">
                        <span>{track.analysis?.bpm ? `${Math.round(track.analysis.bpm)} BPM` : '—'}</span>
                        <span>{track.analysis?.key || '—'}</span>
                        <span>{formatDuration(track.analysis?.duration_ms)}</span>
                        <span>{track.original_filename}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {onSelectTrack && (
                        <button
                          onClick={() => onSelectTrack(track)}
                          className="p-1.5 hover:bg-blue-500/20 rounded text-blue-400 bg-transparent border-none cursor-pointer"
                          title="Voir"
                        >
                          <Eye size={13} />
                        </button>
                      )}
                      {onDeleteTrack && idx > 0 && (
                        <button
                          onClick={() => {
                            if (window.confirm(`Supprimer "${track.title || track.original_filename}" ?`)) {
                              onDeleteTrack(track.id);
                            }
                          }}
                          className="p-1.5 hover:bg-red-500/20 rounded text-red-400 bg-transparent border-none cursor-pointer"
                          title="Supprimer ce doublon"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
