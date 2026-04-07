'use client';

import { useState, useEffect } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';

const PRESET_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
];

interface Tag {
  id: number;
  name: string;
  color: string;
}

interface TrackTag {
  id: number;
  tag_id: number;
  tag: Tag;
}

interface TagManagerProps {
  trackId: number;
  onTagsChange?: (tags: TrackTag[]) => void;
}

export default function TagManager({ trackId, onTagsChange }: TagManagerProps) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [trackTags, setTrackTags] = useState<TrackTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[4]);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);

  useEffect(() => {
    loadTags();
  }, [trackId]);

  async function loadTags() {
    setLoading(true);
    try {
      const [tagsRes, trackTagsRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/tags`, { credentials: 'include' }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/tags/tracks/${trackId}`, { credentials: 'include' }),
      ]);

      if (tagsRes.ok) {
        const tags = await tagsRes.json();
        setAllTags(tags);
      }
      if (trackTagsRes.ok) {
        const trackTags = await trackTagsRes.json();
        setTrackTags(trackTags);
        onTagsChange?.(trackTags);
      }
    } catch {}
    setLoading(false);
  }

  async function handleCreateTag() {
    if (!newTagName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
        credentials: 'include',
      });

      if (res.ok) {
        const newTag = await res.json();
        setAllTags(prev => [...prev, newTag]);

        // Add tag to track
        const addRes = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/tags/${newTag.id}/tracks/${trackId}`,
          { method: 'POST', credentials: 'include' }
        );
        if (addRes.ok) {
          await loadTags();
          setNewTagName('');
          setShowAdd(false);
        }
      }
    } catch {}
    setCreating(false);
  }

  async function handleAddTag(tagId: number) {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/tags/${tagId}/tracks/${trackId}`,
        { method: 'POST', credentials: 'include' }
      );
      if (res.ok) {
        await loadTags();
      }
    } catch {}
  }

  async function handleRemoveTag(trackTagId: number, tagId: number) {
    setRemoving(trackTagId);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/tags/${tagId}/tracks/${trackId}`,
        { method: 'DELETE', credentials: 'include' }
      );
      if (res.ok) {
        await loadTags();
      }
    } catch {}
    setRemoving(null);
  }

  const taggedIds = new Set(trackTags.map(t => t.tag_id));
  const availableTags = allTags.filter(t => !taggedIds.has(t.id));

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
        <Loader2 size={12} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Existing tags */}
      {trackTags.map(tt => (
        <div
          key={tt.id}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium text-white whitespace-nowrap"
          style={{ backgroundColor: tt.tag.color }}
        >
          <span>{tt.tag.name}</span>
          <button
            onClick={() => handleRemoveTag(tt.id, tt.tag_id)}
            disabled={removing === tt.id}
            className="flex items-center justify-center w-3.5 h-3.5 rounded hover:bg-black/20 bg-transparent border-none cursor-pointer transition-colors"
            title="Retirer le tag"
          >
            {removing === tt.id ? (
              <Loader2 size={10} className="animate-spin" />
            ) : (
              <X size={10} />
            )}
          </button>
        </div>
      ))}

      {/* Add tag button */}
      {!showAdd && (
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] transition-colors"
        >
          <Plus size={10} /> Tag
        </button>
      )}

      {/* Add tag dropdown/form */}
      {showAdd && (
        <div className="flex flex-col gap-2 p-2 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-lg">
          {/* Existing tags list */}
          {availableTags.length > 0 && (
            <div className="flex flex-col gap-1 pb-2 border-b border-[var(--border-subtle)]">
              {availableTags.slice(0, 5).map(tag => (
                <button
                  key={tag.id}
                  onClick={() => {
                    handleAddTag(tag.id);
                    setShowAdd(false);
                  }}
                  className="text-left px-2 py-1 rounded text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-1.5"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                </button>
              ))}
            </div>
          )}

          {/* Create new tag */}
          <div className="flex flex-col gap-1.5">
            <input
              type="text"
              placeholder="Nouveau tag..."
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              className="px-2 py-1 rounded text-[11px] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateTag();
                if (e.key === 'Escape') setShowAdd(false);
              }}
            />
            <div className="flex gap-1">
              {PRESET_COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => setNewTagColor(color)}
                  className={`w-5 h-5 rounded-full border-2 transition-all ${
                    newTagColor === color
                      ? 'border-white'
                      : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
            <div className="flex gap-1">
              <button
                onClick={handleCreateTag}
                disabled={creating || !newTagName.trim()}
                className="flex-1 px-2 py-1 rounded text-[10px] font-medium bg-blue-600 hover:bg-blue-700 text-white border-none cursor-pointer disabled:opacity-50 transition-colors"
              >
                {creating ? <Loader2 size={10} className="animate-spin inline mr-1" /> : 'Créer'}
              </button>
              <button
                onClick={() => setShowAdd(false)}
                className="px-2 py-1 rounded text-[10px] font-medium bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] cursor-pointer transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
