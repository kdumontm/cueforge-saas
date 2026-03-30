// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { Wrench } from 'lucide-react';
import BpmTapTempo from '@/components/tools/BpmTapTempo';
import CrateDigger from '@/components/tools/CrateDigger';
import EnergyFlow from '@/components/tools/EnergyFlow';
import QuickNotes from '@/components/tools/QuickNotes';
import HarmonicWheel from '@/components/tools/HarmonicWheel';
import { listTracks, isAuthenticated } from '@/lib/api';
import type { Track } from '@/types';

export default function ToolsPage() {
  const [tracks, setTracks] = useState<Track[]>([]);

  useEffect(() => {
    if (!isAuthenticated()) return;
    listTracks()
      .then(data => {
        const list = Array.isArray(data) ? data : (data?.tracks || []);
        setTracks(list);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-600/30 to-blue-600/30 flex items-center justify-center">
          <Wrench size={20} className="text-cyan-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">Outils DJ</h1>
          <p className="text-[13px] text-[var(--text-muted)]">Tap Tempo, Crate Digger et plus</p>
        </div>
      </div>

      {/* Tools grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BpmTapTempo />
        <CrateDigger tracks={tracks} />
        <QuickNotes />
      </div>

      {/* Harmonic Wheel + Energy Flow - full width */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HarmonicWheel tracks={tracks} />
        {tracks.length > 0 && (
          <EnergyFlow tracks={tracks} title="Energy Flow de ta collection" />
        )}
      </div>
    </div>
  );
}
