// @ts-nocheck
'use client';

import { useState, useEffect, useRef } from 'react';
import { StickyNote, Plus, Trash2, Clock, Search, Pin, PinOff } from 'lucide-react';

interface Note {
  id: string;
  text: string;
  trackTitle?: string;
  trackArtist?: string;
  timestamp: string;
  pinned: boolean;
  color: string;
}

const NOTE_COLORS = [
  { id: 'yellow', bg: 'bg-yellow-500/15', border: 'border-yellow-500/30', text: 'text-yellow-300' },
  { id: 'blue', bg: 'bg-blue-500/15', border: 'border-blue-500/30', text: 'text-blue-300' },
  { id: 'pink', bg: 'bg-pink-500/15', border: 'border-pink-500/30', text: 'text-pink-300' },
  { id: 'green', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', text: 'text-emerald-300' },
  { id: 'purple', bg: 'bg-purple-500/15', border: 'border-purple-500/30', text: 'text-purple-300' },
];

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function loadNotes(): Note[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem('cueforge_quick_notes') || '[]'); } catch { return []; }
}

function saveNotes(notes: Note[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('cueforge_quick_notes', JSON.stringify(notes));
}

interface QuickNotesProps {
  currentTrackTitle?: string;
  currentTrackArtist?: string;
}

export default function QuickNotes({ currentTrackTitle, currentTrackArtist }: QuickNotesProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [newText, setNewText] = useState('');
  const [selectedColor, setSelectedColor] = useState('yellow');
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setNotes(loadNotes()); }, []);
  useEffect(() => { if (notes.length > 0) saveNotes(notes); }, [notes]);

  function addNote() {
    if (!newText.trim()) return;
    const note: Note = {
      id: generateId(),
      text: newText.trim(),
      trackTitle: currentTrackTitle,
      trackArtist: currentTrackArtist,
      timestamp: new Date().toISOString(),
      pinned: false,
      color: selectedColor,
    };
    setNotes(prev => [note, ...prev]);
    setNewText('');
    inputRef.current?.focus();
  }

  function deleteNote(id: string) {
    setNotes(prev => prev.filter(n => n.id !== id));
  }

  function togglePin(id: string) {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, pinned: !n.pinned } : n));
  }

  const filteredNotes = notes
    .filter(n => !searchQuery || n.text.toLowerCase().includes(searchQuery.toLowerCase()) || n.trackTitle?.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

  function formatTime(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'À l\'instant';
    if (diff < 3600000) return `il y a ${Math.floor(diff / 60000)}min`;
    if (diff < 86400000) return `il y a ${Math.floor(diff / 3600000)}h`;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  function getColorClasses(colorId: string) {
    return NOTE_COLORS.find(c => c.id === colorId) || NOTE_COLORS[0];
  }

  return (
    <div className="bg-[var(--bg-card)] rounded-[14px] border border-[var(--border-subtle)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <StickyNote size={16} className="text-yellow-400" />
        <span className="text-sm font-bold text-[var(--text-primary)]">Quick Notes</span>
        <span className="text-[11px] text-[var(--text-muted)] ml-auto">{notes.length} note{notes.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Add note */}
      <div className="flex gap-2 mb-3">
        <input
          ref={inputRef}
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addNote(); }}
          placeholder={currentTrackTitle ? `Note sur "${currentTrackTitle}"...` : 'Écrire une note...'}
          className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] outline-none focus:border-yellow-500/50 transition-colors placeholder:text-[var(--text-muted)]"
        />
        <button
          onClick={addNote}
          disabled={!newText.trim()}
          className="px-3 py-2 rounded-lg bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 text-sm cursor-pointer hover:bg-yellow-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Color picker */}
      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-[10px] text-[var(--text-muted)]">Couleur:</span>
        {NOTE_COLORS.map(c => (
          <button
            key={c.id}
            onClick={() => setSelectedColor(c.id)}
            className={`w-5 h-5 rounded-full border-2 cursor-pointer transition-all ${
              selectedColor === c.id ? 'scale-110 border-white/60' : 'border-transparent opacity-60 hover:opacity-100'
            } ${c.bg}`}
          />
        ))}
      </div>

      {/* Search */}
      {notes.length > 3 && (
        <div className="relative mb-3">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Rechercher..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
        </div>
      )}

      {/* Notes list */}
      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {filteredNotes.length === 0 && (
          <p className="text-[12px] text-[var(--text-muted)] text-center py-4">
            {searchQuery ? 'Aucune note trouvée' : 'Aucune note. Écris ta première !'}
          </p>
        )}
        {filteredNotes.map(note => {
          const colors = getColorClasses(note.color);
          return (
            <div
              key={note.id}
              className={`px-3 py-2.5 rounded-lg border ${colors.bg} ${colors.border} group relative`}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] ${colors.text} leading-relaxed`}>{note.text}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    {note.trackTitle && (
                      <span className="text-[10px] text-[var(--text-muted)] truncate max-w-[150px]">
                        🎵 {note.trackTitle}
                      </span>
                    )}
                    <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-0.5">
                      <Clock size={9} /> {formatTime(note.timestamp)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button
                    onClick={() => togglePin(note.id)}
                    className="p-1 hover:bg-white/10 rounded text-[var(--text-muted)] bg-transparent border-none cursor-pointer"
                    title={note.pinned ? 'Désépingler' : 'Épingler'}
                  >
                    {note.pinned ? <PinOff size={11} /> : <Pin size={11} />}
                  </button>
                  <button
                    onClick={() => deleteNote(note.id)}
                    className="p-1 hover:bg-red-500/20 rounded text-red-400 bg-transparent border-none cursor-pointer"
                    title="Supprimer"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
              {note.pinned && (
                <Pin size={9} className="absolute top-1.5 right-1.5 text-[var(--text-muted)] opacity-40" />
              )}
            </div>
          );
        })}
      </div>

      {/* Clear all */}
      {notes.length > 0 && (
        <button
          onClick={() => {
            if (window.confirm('Supprimer toutes les notes ?')) {
              setNotes([]);
              localStorage.removeItem('cueforge_quick_notes');
            }
          }}
          className="mt-3 text-[11px] text-[var(--text-muted)] hover:text-red-400 bg-transparent border-none cursor-pointer transition-colors"
        >
          Tout effacer
        </button>
      )}
    </div>
  );
}
