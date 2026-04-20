'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Volume2, Music, Zap } from 'lucide-react';
import { TrackSummary } from '@/lib/api/mashup';
import WaveSurferPlayer from '@/components/player/WaveSurferPlayer';

interface Props {
  /** Piste Deck A (obligatoire) */
  trackA: TrackSummary;
  /** Piste Deck B (optionnel si pas encore sélectionnée) */
  trackB?: TrackSummary;
  /** URL audio Deck A */
  audioUrlA: string;
  /** URL audio Deck B */
  audioUrlB?: string;
  /** Décalage de pitch en semitones (pour harmonisation) */
  pitchSemitones?: number;
  /** Callback swap/change B */
  onSwapB?: () => void;
}

/**
 * Composant central Mashup Studio : deux decks superposés avec waveforms alignées.
 *
 * Layout :
 * - Deck A (haut) : piste choisie, controls, metadata
 * - Séparateur fin
 * - Deck B (bas) : piste suggestion/sélectionnée, controls, metadata
 * - Les waveforms wavesurfer sont alignés sur le temps
 *
 * Fonctionnalités (MVP) :
 * - Play/pause sync
 * - Volume indépendant par deck
 * - Affichage BPM, clé Camelot, énergie
 * - Bouton « Sync beatgrid » (TODO Phase 3.5 — hors scope MVP)
 *
 * @component
 */
export default function DualDeck({
  trackA,
  trackB,
  audioUrlA,
  audioUrlB,
  pitchSemitones = 0,
  onSwapB,
}: Props) {
  const playerARef = useRef<any>(null);
  const playerBRef = useRef<any>(null);
  const [isPlayingA, setIsPlayingA] = useState(false);
  const [isPlayingB, setIsPlayingB] = useState(false);
  const [positionA, setPositionA] = useState(0);
  const [positionB, setPositionB] = useState(0);

  /**
   * Sync play/pause entre les deux decks.
   * Si on play A, on play B aussi (et vice versa).
   */
  const togglePlayback = (deck: 'A' | 'B') => {
    if (deck === 'A') {
      playerARef.current?.playPause();
      setIsPlayingA(!isPlayingA);
      if (playerBRef.current && trackB) {
        // Optionnel : sync B avec A
        if (!isPlayingA) playerBRef.current.playPause();
      }
    } else if (deck === 'B' && trackB) {
      playerBRef.current?.playPause();
      setIsPlayingB(!isPlayingB);
    }
  };

  /**
   * Sync beatgrid (TODO Phase 3.5).
   * Aligne les beats de B sur A avec pitch adjustment si nécessaire.
   */
  const handleSyncBeatgrid = () => {
    // Placeholder — TODO en Phase 3.5 avec analyse BPM/phase lock
    console.log('TODO: Sync beatgrid entre A et B');
  };

  return (
    <div className="w-full h-full flex flex-col bg-gray-900 text-white rounded-lg overflow-hidden">
      {/* ── DECK A ────────────────────────────────────────────────── */}
      <DeckSection
        label="Deck A"
        track={trackA}
        audioUrl={audioUrlA}
        isPlaying={isPlayingA}
        position={positionA}
        playerRef={playerARef}
        onTogglePlay={() => togglePlayback('A')}
        onTimeUpdate={setPositionA}
        isMaster={true}
      />

      {/* ── SÉPARATEUR ────────────────────────────────────────────── */}
      <div className="h-px bg-gray-700" />

      {/* ── DECK B ────────────────────────────────────────────────── */}
      {trackB && audioUrlB ? (
        <DeckSection
          label="Deck B"
          track={trackB}
          audioUrl={audioUrlB}
          isPlaying={isPlayingB}
          position={positionB}
          playerRef={playerBRef}
          onTogglePlay={() => togglePlayback('B')}
          onTimeUpdate={setPositionB}
          pitchSemitones={pitchSemitones}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-800">
          <div className="text-center text-gray-400">
            <Music className="w-12 h-12 mx-auto mb-2" />
            <p>Deck B : sélectionne une suggestion</p>
          </div>
        </div>
      )}

      {/* ── CONTROLS PARTAGÉS ─────────────────────────────────────── */}
      <div className="bg-gray-800 px-4 py-3 flex items-center justify-between gap-4">
        <button
          onClick={handleSyncBeatgrid}
          disabled={!trackB}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
          title="TODO Phase 3.5 : Alignement automatique des beats"
        >
          <Zap className="inline-block w-4 h-4 mr-1" />
          Sync Beatgrid (TODO)
        </button>

        {onSwapB && (
          <button
            onClick={onSwapB}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors"
          >
            Changer B
          </button>
        )}

        <div className="text-xs text-gray-400">
          {pitchSemitones !== 0 && (
            <>Pitch: {pitchSemitones > 0 ? '+' : ''}{pitchSemitones} semitones</>
          )}
        </div>
      </div>
    </div>
  );
}

interface DeckSectionProps {
  label: string;
  track: TrackSummary;
  audioUrl: string;
  isPlaying: boolean;
  position: number;
  playerRef: React.MutableRefObject<any>;
  onTogglePlay: () => void;
  onTimeUpdate: (pos: number) => void;
  isMaster?: boolean;
  pitchSemitones?: number;
}

/**
 * Section Deck (A ou B) avec waveform et métadonnées.
 */
function DeckSection({
  label,
  track,
  audioUrl,
  isPlaying,
  playerRef,
  onTogglePlay,
  onTimeUpdate,
  isMaster = false,
  pitchSemitones = 0,
}: DeckSectionProps) {
  return (
    <div className="flex-1 flex flex-col bg-gray-800 p-4 gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-100">{label}</h3>
        <div className="text-xs text-gray-400">
          {track.bpm && <span>{Math.round(track.bpm)} BPM</span>}
          {track.key && <span className="ml-2">{track.key}</span>}
          {track.energy !== undefined && (
            <span className="ml-2 flex items-center gap-1">
              <Zap className="w-3 h-3" />
              {track.energy}
            </span>
          )}
        </div>
      </div>

      {/* Métadonnées track */}
      <div className="flex gap-3 items-start">
        {track.artwork_url ? (
          <img
            src={track.artwork_url}
            alt={track.title}
            className="w-16 h-16 rounded object-cover"
          />
        ) : (
          <div className="w-16 h-16 rounded bg-gray-700 flex items-center justify-center">
            <Music className="w-8 h-8 text-gray-600" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white truncate">{track.title}</p>
          <p className="text-sm text-gray-400 truncate">{track.artist}</p>
          {pitchSemitones !== 0 && (
            <p className="text-xs text-purple-400 mt-1">
              Pitch: {pitchSemitones > 0 ? '+' : ''}{pitchSemitones} ST
            </p>
          )}
        </div>
      </div>

      {/* Waveform (WaveSurferPlayer) */}
      <div className="flex-1 min-h-[100px] bg-gray-900 rounded border border-gray-700">
        <WaveSurferPlayer
          trackId={track.id}
          trackDuration={track.duration}
          onTimeUpdate={onTimeUpdate}
          onPlay={() => {}}
          height={isMaster ? 120 : 80}
          playerRef={playerRef}
        />
      </div>

      {/* Contrôles basiques */}
      <div className="flex items-center gap-2">
        <button
          onClick={onTogglePlay}
          className={`px-3 py-2 rounded font-medium text-sm transition-colors ${
            isPlaying
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '⏸ Pause' : '▶ Play'}
        </button>

        <div className="flex items-center gap-1 text-xs text-gray-400">
          <Volume2 className="w-4 h-4" />
          <span>Volume control via waveform</span>
        </div>
      </div>
    </div>
  );
}
