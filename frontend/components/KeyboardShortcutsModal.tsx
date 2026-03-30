// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { X, Keyboard } from 'lucide-react';

const SHORTCUT_GROUPS = [
  {
    title: 'Lecture',
    shortcuts: [
      { keys: ['Space'], desc: 'Play / Pause' },
      { keys: ['←'], desc: 'Reculer 5 secondes' },
      { keys: ['→'], desc: 'Avancer 5 secondes' },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['↑'], desc: 'Track précédent' },
      { keys: ['↓'], desc: 'Track suivant' },
      { keys: ['Esc'], desc: 'Désélectionner' },
      { keys: ['Ctrl', 'F'], desc: 'Rechercher' },
    ],
  },
  {
    title: 'Actions rapides',
    shortcuts: [
      { keys: ['1', '-', '5'], desc: 'Noter de 1 à 5 étoiles' },
      { keys: ['Del'], desc: 'Supprimer le track' },
      { keys: ['Ctrl', 'A'], desc: 'Tout sélectionner' },
      { keys: ['Ctrl', 'Click'], desc: 'Multi-sélection' },
    ],
  },
  {
    title: 'Raccourcis globaux',
    shortcuts: [
      { keys: ['?'], desc: 'Afficher les raccourcis' },
      { keys: ['Ctrl', 'Shift', 'E'], desc: 'Exporter la sélection' },
    ],
  },
];

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl shadow-2xl w-[550px] max-h-[80vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <Keyboard size={18} className="text-[var(--accent-purple)]" />
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Raccourcis clavier</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] transition-colors bg-transparent border-none cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[60vh]">
          {SHORTCUT_GROUPS.map(group => (
            <div key={group.title}>
              <h3 className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
                {group.title}
              </h3>
              <div className="space-y-1.5">
                {group.shortcuts.map((shortcut, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors">
                    <span className="text-sm text-[var(--text-secondary)]">{shortcut.desc}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, j) => (
                        <span key={j}>
                          {j > 0 && key !== '-' && <span className="text-[var(--text-muted)] text-xs mx-0.5">+</span>}
                          {key === '-' ? (
                            <span className="text-[var(--text-muted)] text-xs mx-0.5">à</span>
                          ) : (
                            <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[11px] font-mono font-medium text-[var(--text-primary)] shadow-sm">
                              {key}
                            </kbd>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
          <p className="text-[11px] text-[var(--text-muted)] text-center">
            Appuie sur <kbd className="px-1 py-0.5 rounded bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[10px] font-mono">?</kbd> n&apos;importe quand pour afficher ce panneau
          </p>
        </div>
      </div>
    </div>
  );
}
