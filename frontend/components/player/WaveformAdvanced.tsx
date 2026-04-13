'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, Eye, EyeOff } from 'lucide-react';

interface WaveformData {
  samples: number[];
  sampleRate: number;
  duration: number;
}

interface Cue {
  time: number;
  label: string;
  color?: string;
}

interface WaveformAdvancedProps {
  waveformData: WaveformData;
  currentTime?: number;
  onSeek?: (time: number) => void;
  cues?: Cue[];
  title?: string;
  comparison?: WaveformData;
  showBeatNumbers?: boolean;
}

type ZoomPreset = 'overview' | 'bars' | 'beats';

interface VisualizationMode {
  waveform: boolean;
  energy: boolean;
  loudness: boolean;
  frequency: boolean;
  comparison: boolean;
}

const ZOOM_LEVELS: Record<ZoomPreset, number> = {
  overview: 0.5,
  bars: 1.5,
  beats: 3,
};

const generateMinimap = (data: WaveformData, width: number): number[] => {
  const samplesPerPixel = Math.ceil(data.samples.length / width);
  const minimap: number[] = [];

  for (let i = 0; i < width; i++) {
    const start = i * samplesPerPixel;
    const end = Math.min(start + samplesPerPixel, data.samples.length);
    let max = 0;
    for (let j = start; j < end; j++) {
      max = Math.max(max, Math.abs(data.samples[j]));
    }
    minimap.push(max);
  }
  return minimap;
};

const getEnergyColor = (energy: number): string => {
  // gradient from blue (low) to red (high)
  if (energy < 0.25) return '#3b82f6'; // blue
  if (energy < 0.5) return '#06b6d4'; // cyan
  if (energy < 0.75) return '#fbbf24'; // amber
  return '#ef4444'; // red
};

export const WaveformAdvanced: React.FC<WaveformAdvancedProps> = ({
  waveformData,
  currentTime = 0,
  onSeek,
  cues = [],
  title = 'Waveform',
  comparison,
  showBeatNumbers = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [zoomLevel, setZoomLevel] = useState<number>(ZOOM_LEVELS.overview);
  const [zoomPreset, setZoomPreset] = useState<ZoomPreset>('overview');
  const [scrollOffset, setScrollOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [visualization, setVisualization] = useState<VisualizationMode>({
    waveform: true,
    energy: false,
    loudness: false,
    frequency: false,
    comparison: false,
  });

  const canvasWidth = 1200;
  const canvasHeight = 200;
  const miniMapHeight = 40;

  // Draw waveform
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Grid lines (beat/bar markers)
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 0.5;
    const bpm = 120; // Default, could be parameterized
    const beatWidth = (canvasWidth / waveformData.duration) * (60 / bpm);

    for (let i = 0; i < canvasWidth; i += beatWidth) {
      ctx.beginPath();
      ctx.moveTo(i - scrollOffset, 0);
      ctx.lineTo(i - scrollOffset, canvasHeight);
      ctx.stroke();
    }

    // Center line
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, canvasHeight / 2);
    ctx.lineTo(canvasWidth, canvasHeight / 2);
    ctx.stroke();

    if (!visualization.waveform) return;

    // Calculate samples to draw based on zoom
    const visibleDuration = waveformData.duration / zoomLevel;
    const startTime = scrollOffset / canvasWidth * visibleDuration;
    const endTime = (scrollOffset + canvasWidth) / canvasWidth * visibleDuration;

    const startSample = Math.floor(startTime * waveformData.sampleRate);
    const endSample = Math.floor(endTime * waveformData.sampleRate);
    const samplesPerPixel = Math.ceil((endSample - startSample) / canvasWidth);

    // Draw main waveform
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let i = 0; i < canvasWidth; i++) {
      const sampleStart = startSample + i * samplesPerPixel;
      const sampleEnd = Math.min(sampleStart + samplesPerPixel, waveformData.samples.length);

      let max = 0;
      for (let j = sampleStart; j < sampleEnd; j++) {
        max = Math.max(max, Math.abs(waveformData.samples[j]));
      }

      const y = (canvasHeight / 2) - (max * (canvasHeight / 2));
      if (i === 0) {
        ctx.moveTo(i, y);
      } else {
        ctx.lineTo(i, y);
      }
    }
    ctx.stroke();

    // Draw mirror waveform (bottom)
    ctx.beginPath();
    for (let i = 0; i < canvasWidth; i++) {
      const sampleStart = startSample + i * samplesPerPixel;
      const sampleEnd = Math.min(sampleStart + samplesPerPixel, waveformData.samples.length);

      let max = 0;
      for (let j = sampleStart; j < sampleEnd; j++) {
        max = Math.max(max, Math.abs(waveformData.samples[j]));
      }

      const y = (canvasHeight / 2) + (max * (canvasHeight / 2));
      if (i === 0) {
        ctx.moveTo(i, y);
      } else {
        ctx.lineTo(i, y);
      }
    }
    ctx.stroke();

    // Draw energy heatmap overlay
    if (visualization.energy) {
      for (let i = 0; i < canvasWidth; i += 4) {
        const sampleStart = startSample + i * samplesPerPixel;
        const sampleEnd = Math.min(sampleStart + samplesPerPixel, waveformData.samples.length);

        let energy = 0;
        for (let j = sampleStart; j < sampleEnd; j++) {
          energy += Math.abs(waveformData.samples[j]);
        }
        energy = energy / (sampleEnd - sampleStart);

        ctx.fillStyle = getEnergyColor(energy);
        ctx.globalAlpha = 0.3;
        ctx.fillRect(i, 0, 4, canvasHeight);
        ctx.globalAlpha = 1;
      }
    }

    // Draw comparison waveform
    if (visualization.comparison && comparison) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();

      const startSampleComp = Math.floor(startTime * comparison.sampleRate);
      const samplesPerPixelComp = Math.ceil(
        ((endTime - startTime) * comparison.sampleRate) / canvasWidth
      );

      for (let i = 0; i < canvasWidth; i++) {
        const sampleStart = startSampleComp + i * samplesPerPixelComp;
        const sampleEnd = Math.min(sampleStart + samplesPerPixelComp, comparison.samples.length);

        let max = 0;
        for (let j = sampleStart; j < sampleEnd; j++) {
          max = Math.max(max, Math.abs(comparison.samples[j]));
        }

        const y = (canvasHeight / 2) - (max * (canvasHeight / 2.5));
        if (i === 0) {
          ctx.moveTo(i, y);
        } else {
          ctx.lineTo(i, y);
        }
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Draw cue points
    ctx.fillStyle = '#fbbf24';
    ctx.font = '11px monospace';
    cues.forEach(cue => {
      const x = (cue.time / visibleDuration) * canvasWidth - scrollOffset;
      if (x >= 0 && x <= canvasWidth) {
        // Cue line
        ctx.strokeStyle = cue.color || '#fbbf24';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasHeight);
        ctx.stroke();

        // Cue label
        ctx.fillStyle = cue.color || '#fbbf24';
        ctx.fillText(cue.label, x + 5, 15);
      }
    });

    // Draw beat numbers
    if (showBeatNumbers) {
      ctx.fillStyle = '#64748b';
      ctx.font = '10px monospace';
      const beatsToShow = Math.ceil(canvasWidth / beatWidth);
      for (let i = 0; i < beatsToShow; i++) {
        const beatNum = Math.floor(startTime * (bpm / 60)) + i;
        const x = i * beatWidth - scrollOffset;
        if (x >= 0 && x <= canvasWidth) {
          ctx.fillText(`${beatNum + 1}`, x + 2, canvasHeight - 5);
        }
      }
    }

    // Draw playhead
    const playheadX = (currentTime / visibleDuration) * canvasWidth - scrollOffset;
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, canvasHeight);
    ctx.stroke();
  }, [
    waveformData,
    zoomLevel,
    scrollOffset,
    visualization,
    currentTime,
    cues,
    showBeatNumbers,
    comparison,
  ]);

  // Draw minimap
  const drawMinimap = useCallback(() => {
    const canvas = miniCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, canvasWidth, miniMapHeight);

    const minimap = generateMinimap(waveformData, canvasWidth);

    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let i = 0; i < minimap.length; i++) {
      const y = miniMapHeight - (minimap[i] * miniMapHeight);
      if (i === 0) {
        ctx.moveTo(i, y);
      } else {
        ctx.lineTo(i, y);
      }
    }
    ctx.stroke();

    // Draw visible window indicator
    const visibleRatio = (waveformData.duration / zoomLevel) / waveformData.duration;
    const visibleWidth = canvasWidth * visibleRatio;
    const visibleStart = scrollOffset;

    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.strokeRect(visibleStart, 0, visibleWidth, miniMapHeight);
  }, [waveformData, zoomLevel, scrollOffset]);

  // Redraw on changes
  useEffect(() => {
    drawWaveform();
    drawMinimap();
  }, [drawWaveform, drawMinimap]);

  // Handle wheel zoom
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const direction = e.deltaY > 0 ? -1 : 1;
    setZoomLevel(prev => Math.max(0.5, Math.min(prev * (1 + direction * 0.1), 5)));
    setZoomPreset('overview');
  };

  // Handle canvas click to seek
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const visibleDuration = waveformData.duration / zoomLevel;
    const time = (scrollOffset + x) / canvasWidth * visibleDuration;

    onSeek?.(Math.max(0, Math.min(time, waveformData.duration)));
  };

  // Handle minimap drag
  const handleMiniMapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = miniCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const visibleDuration = waveformData.duration / zoomLevel;
    const visibleRatio = visibleDuration / waveformData.duration;
    const newScroll = Math.max(
      0,
      Math.min(x - (canvasWidth * visibleRatio) / 2, canvasWidth * (1 - visibleRatio))
    );

    setScrollOffset(newScroll);
  };

  // Handle horizontal scroll
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      setScrollOffset(prev => Math.max(0, prev - 50));
    } else if (e.key === 'ArrowRight') {
      const visibleDuration = waveformData.duration / zoomLevel;
      const maxScroll = canvasWidth * (1 - visibleDuration / waveformData.duration);
      setScrollOffset(prev => Math.min(maxScroll, prev + 50));
    }
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col bg-slate-900 rounded-lg border border-slate-700 overflow-hidden"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{title}</h3>

        <div className="flex items-center gap-2">
          {/* Visualization toggles */}
          <button
            onClick={() =>
              setVisualization(prev => ({ ...prev, energy: !prev.energy }))
            }
            className={`px-2 py-1 text-xs rounded transition-colors ${
              visualization.energy
                ? 'bg-orange-500/20 text-orange-400'
                : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
            }`}
            title="Toggle energy heatmap"
          >
            Energy
          </button>

          <button
            onClick={() =>
              setVisualization(prev => ({ ...prev, loudness: !prev.loudness }))
            }
            className={`px-2 py-1 text-xs rounded transition-colors ${
              visualization.loudness
                ? 'bg-green-500/20 text-green-400'
                : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
            }`}
            title="Toggle loudness curve"
          >
            Loudness
          </button>

          {comparison && (
            <button
              onClick={() =>
                setVisualization(prev => ({
                  ...prev,
                  comparison: !prev.comparison,
                }))
              }
              className={`px-2 py-1 text-xs rounded transition-colors ${
                visualization.comparison
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
              title="Toggle comparison waveform"
            >
              Compare
            </button>
          )}

          {/* Zoom controls */}
          <div className="border-l border-slate-700 pl-2 ml-2 flex gap-1">
            <button
              onClick={() => setZoomLevel(prev => Math.max(0.5, prev - 0.5))}
              className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
              title="Zoom out"
            >
              <ZoomOut size={16} />
            </button>

            <div className="flex items-center gap-1">
              {(['overview', 'bars', 'beats'] as const).map(preset => (
                <button
                  key={preset}
                  onClick={() => {
                    setZoomPreset(preset);
                    setZoomLevel(ZOOM_LEVELS[preset]);
                    setScrollOffset(0);
                  }}
                  className={`px-2 py-1 text-xs rounded transition-colors capitalize ${
                    zoomPreset === preset
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            <button
              onClick={() => setZoomLevel(prev => Math.min(prev + 0.5, 5))}
              className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
              title="Zoom in"
            >
              <ZoomIn size={16} />
            </button>

            <span className="text-xs text-slate-400 ml-2 w-8 text-right">
              {zoomLevel.toFixed(1)}x
            </span>
          </div>
        </div>
      </div>

      {/* Waveform */}
      <div className="flex-1 flex flex-col overflow-hidden p-2 gap-2">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          onClick={handleCanvasClick}
          onWheel={handleWheel}
          className="border border-slate-700 rounded cursor-crosshair bg-slate-950"
          style={{ userSelect: 'none' }}
        />

        {/* Minimap */}
        <canvas
          ref={miniCanvasRef}
          width={canvasWidth}
          height={miniMapHeight}
          onClick={handleMiniMapClick}
          className="border border-slate-700 rounded cursor-pointer bg-slate-950 h-10"
        />

        {/* Time display */}
        <div className="text-xs text-slate-400 px-2 text-center">
          {Math.floor(currentTime)}s / {Math.floor(waveformData.duration)}s
        </div>
      </div>
    </div>
  );
};

export default WaveformAdvanced;
