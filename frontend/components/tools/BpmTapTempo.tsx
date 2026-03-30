// @ts-nocheck
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Activity, RotateCcw, Copy, Check } from 'lucide-react';

interface BpmTapTempoProps {
  onBpmDetected?: (bpm: number) => void;
}

export default function BpmTapTempo({ onBpmDetected }: BpmTapTempoProps) {
  const [taps, setTaps] = useState<number[]>([]);
  const [bpm, setBpm] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleTap = useCallback(() => {
    const now = Date.now();

    // Reset if last tap was more than 3 seconds ago
    if (taps.length > 0 && now - taps[taps.length - 1] > 3000) {
      setTaps([now]);
      setBpm(null);
      setIsActive(true);
      return;
    }

    const newTaps = [...taps, now].slice(-12); // Keep last 12 taps
    setTaps(newTaps);
    setIsActive(true);

    if (newTaps.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < newTaps.length; i++) {
        intervals.push(newTaps[i] - newTaps[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const detectedBpm = Math.round(60000 / avgInterval * 10) / 10;
      setBpm(detectedBpm);
      onBpmDetected?.(detectedBpm);
    }

    // Auto-reset after 3s of inactivity
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsActive(false), 3000);
  }, [taps, onBpmDetected]);

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only capture T key when not in an input
      if (e.key === 't' || e.key === 'T') {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        handleTap();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTap]);

  function handleReset() {
    setTaps([]);
    setBpm(null);
    setIsActive(false);
  }

  function handleCopy() {
    if (bpm) {
      navigator.clipboard?.writeText(bpm.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  // Pulse animation intensity based on BPM
  const pulseSpeed = bpm ? Math.max(0.3, 60 / bpm) : 1;

  return (
    <div className="bg-[var(--bg-card)] rounded-[14px] border border-[var(--border-subtle)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Activity size={16} className="text-pink-400" />
        <span className="text-sm font-bold text-[var(--text-primary)]">Tap Tempo</span>
        <span className="text-[11px] text-[var(--text-muted)] ml-auto">Appuie sur T ou clique</span>
      </div>

      {/* Tap button */}
      <div className="flex flex-col items-center gap-4">
        <button
          onMouseDown={handleTap}
          className="relative w-32 h-32 rounded-full border-4 transition-all cursor-pointer flex items-center justify-center"
          style={{
            borderColor: isActive ? '#ec4899' : 'var(--border-default)',
            background: isActive ? 'rgba(236, 72, 153, 0.1)' : 'var(--bg-elevated)',
            boxShadow: isActive ? '0 0 30px rgba(236, 72, 153, 0.3)' : 'none',
          }}
        >
          {/* Pulse ring */}
          {isActive && bpm && (
            <div
              className="absolute inset-0 rounded-full border-2 border-pink-400 opacity-0"
              style={{
                animation: `ping ${pulseSpeed}s ease-out infinite`,
              }}
            />
          )}
          <div className="text-center">
            {bpm ? (
              <>
                <div className="text-3xl font-bold text-[var(--text-primary)]">{bpm}</div>
                <div className="text-[11px] text-[var(--text-muted)]">BPM</div>
              </>
            ) : (
              <>
                <div className="text-lg font-bold text-[var(--text-muted)]">TAP</div>
                <div className="text-[11px] text-[var(--text-muted)]">{taps.length > 0 ? `${taps.length} taps` : 'Clique ici'}</div>
              </>
            )}
          </div>
        </button>

        {/* Info bar */}
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-[var(--text-muted)]">{taps.length} tap{taps.length !== 1 ? 's' : ''}</span>
          {bpm && (
            <>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer transition-colors"
              >
                {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                {copied ? 'Copié !' : 'Copier'}
              </button>
            </>
          )}
          <button
            onClick={handleReset}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer transition-colors"
          >
            <RotateCcw size={11} />
            Reset
          </button>
        </div>

        {/* BPM ranges */}
        {bpm && (
          <div className="w-full flex gap-1">
            {[
              { label: '½', value: Math.round(bpm / 2 * 10) / 10 },
              { label: '×1', value: bpm },
              { label: '×2', value: Math.round(bpm * 2 * 10) / 10 },
            ].map(({ label, value }) => (
              <div
                key={label}
                className={`flex-1 text-center py-1.5 rounded-lg text-[12px] ${
                  label === '×1'
                    ? 'bg-pink-500/20 text-pink-400 font-bold'
                    : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'
                }`}
              >
                {label}: {value}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
