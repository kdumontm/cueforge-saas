/**
 * Canvas Renderer - Points 1081-1130
 * Optimizations for waveform rendering, visualization, and GPU acceleration
 */

interface RenderContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  sampleRate: number;
  pixelRatio: number;
}

interface SpatialHashBucket {
  x: number;
  y: number;
  markers: CanvasMarker[];
}

interface CanvasMarker {
  id: string;
  x: number;
  y: number;
  type: 'cue' | 'beat' | 'loop';
  size: number;
  color: string;
}

interface DirtyRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TileCache {
  zoomLevel: number;
  tiles: Map<string, ImageData>;
}

/**
 * Main WaveformRenderer class with advanced rendering techniques
 */
export class WaveformRenderer {
  private renderCtx: RenderContext;
  private layeredCanvases: Map<string, HTMLCanvasElement>;
  private offscreenCanvas: HTMLCanvasElement;
  private dirtyRegions: DirtyRegion[] = [];
  private spatialHash: Map<string, SpatialHashBucket> = new Map();
  private tileCache: TileCache = { zoomLevel: 0, tiles: new Map() };
  private animationBudget: number = 16; // ms per frame
  private lastFrameTime: number = 0;
  private textureAtlas: Map<string, CanvasPattern> = new Map();

  constructor(canvas: HTMLCanvasElement, sampleRate: number = 44100) {
    const dpr = this.renderHighDPI();
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context');
    }

    this.renderCtx = {
      canvas,
      ctx,
      width: canvas.offsetWidth,
      height: canvas.offsetHeight,
      sampleRate,
      pixelRatio: dpr,
    };

    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = this.renderCtx.width * dpr;
    this.offscreenCanvas.height = this.renderCtx.height * dpr;

    this.layeredCanvases = this.createLayeredCanvas();
  }

  /**
   * Render only visible samples within current viewport (viewport culling)
   */
  renderWithViewportCulling(
    waveformData: Float32Array,
    startSample: number,
    endSample: number,
    zoomLevel: number
  ): void {
    const ctx = this.renderCtx.ctx;
    const height = this.renderCtx.height;
    const dpr = this.renderCtx.pixelRatio;

    ctx.clearRect(0, 0, this.renderCtx.width, this.renderCtx.height);

    const samplesPerPixel = Math.pow(2, Math.max(0, 10 - zoomLevel));
    const visibleSamples = startSample + this.renderCtx.width * samplesPerPixel;

    for (let i = startSample; i < Math.min(endSample, visibleSamples); i += samplesPerPixel) {
      const pixelX = (i - startSample) / samplesPerPixel;
      if (pixelX < 0 || pixelX > this.renderCtx.width) continue;

      const minSample = Math.min(...waveformData.slice(i, i + samplesPerPixel));
      const maxSample = Math.max(...waveformData.slice(i, i + samplesPerPixel));

      const y1 = (height / 2) * (1 - maxSample);
      const y2 = (height / 2) * (1 - minSample);

      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pixelX, y1);
      ctx.lineTo(pixelX, y2);
      ctx.stroke();
    }
  }

  /**
   * Instanced rendering for beat markers using efficient drawing patterns
   */
  renderInstanced(
    markers: CanvasMarker[],
    scale: number = 1
  ): void {
    const ctx = this.renderCtx.ctx;

    // Group markers by type for batching
    const markersByType = new Map<string, CanvasMarker[]>();
    markers.forEach((m) => {
      if (!markersByType.has(m.type)) {
        markersByType.set(m.type, []);
      }
      markersByType.get(m.type)!.push(m);
    });

    // Render each type with consistent styling
    markersByType.forEach((typeMarkers, type) => {
      ctx.fillStyle = type === 'beat' ? '#ff0000' : type === 'cue' ? '#00ff00' : '#0000ff';

      typeMarkers.forEach((marker) => {
        const size = marker.size * scale;
        ctx.beginPath();
        ctx.arc(marker.x, marker.y, size / 2, 0, Math.PI * 2);
        ctx.fill();
      });
    });
  }

  /**
   * Create texture atlas for cue icons to batch rendering
   */
  createTextureAtlas(): Map<string, CanvasPattern> {
    const atlas = new Map<string, CanvasPattern>();
    const iconSize = 32;
    const atlasCanvas = document.createElement('canvas');
    atlasCanvas.width = 256;
    atlasCanvas.height = 256;
    const atlasCtx = atlasCanvas.getContext('2d');

    if (!atlasCtx) return atlas;

    const iconTypes = ['cue', 'beat', 'loop', 'marker'];
    iconTypes.forEach((type, idx) => {
      const x = (idx % 4) * iconSize;
      const y = Math.floor(idx / 4) * iconSize;

      atlasCtx.fillStyle = '#ffffff';
      atlasCtx.fillRect(x, y, iconSize, iconSize);

      // Draw icon
      atlasCtx.fillStyle = '#000000';
      atlasCtx.font = 'bold 16px Arial';
      atlasCtx.textAlign = 'center';
      atlasCtx.textBaseline = 'middle';
      atlasCtx.fillText(type[0].toUpperCase(), x + iconSize / 2, y + iconSize / 2);

      const pattern = this.renderCtx.ctx.createPattern(atlasCanvas, 'repeat');
      if (pattern) {
        atlas.set(type, pattern);
      }
    });

    this.textureAtlas = atlas;
    return atlas;
  }

  /**
   * Apply dirty region updates - only redraw changed areas
   */
  applyDirtyRegionUpdate(region: DirtyRegion): void {
    this.dirtyRegions.push(region);

    // Merge overlapping regions to minimize redraws
    this.dirtyRegions = this.mergeDirtyRegions(this.dirtyRegions);
  }

  private mergeDirtyRegions(regions: DirtyRegion[]): DirtyRegion[] {
    if (regions.length === 0) return regions;

    const merged: DirtyRegion[] = [];
    const sorted = regions.sort((a, b) => a.x - b.x);

    let current = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i];
      if (current.x + current.width >= next.x) {
        // Merge regions
        current.width = Math.max(current.width, next.x - current.x + next.width);
        current.height = Math.max(current.height, next.height);
      } else {
        merged.push(current);
        current = next;
      }
    }
    merged.push(current);
    return merged;
  }

  /**
   * Double buffering: render to offscreen canvas, then blit to visible
   */
  renderDoubleBuffered(
    waveformData: Float32Array,
    startSample: number,
    endSample: number
  ): void {
    const offCtx = this.offscreenCanvas.getContext('2d');
    if (!offCtx) return;

    const dpr = this.renderCtx.pixelRatio;
    offCtx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);

    // Render waveform to offscreen buffer
    offCtx.strokeStyle = '#00ff00';
    offCtx.lineWidth = 1 * dpr;
    offCtx.beginPath();

    const pixelsPerSample = this.offscreenCanvas.width / (endSample - startSample);
    for (let i = startSample; i < endSample; i++) {
      const x = (i - startSample) * pixelsPerSample;
      const y = this.offscreenCanvas.height / 2 * (1 - waveformData[i]);
      if (i === startSample) {
        offCtx.moveTo(x, y);
      } else {
        offCtx.lineTo(x, y);
      }
    }
    offCtx.stroke();

    // Blit offscreen to visible canvas
    this.renderCtx.ctx.drawImage(
      this.offscreenCanvas,
      0,
      0,
      this.offscreenCanvas.width,
      this.offscreenCanvas.height,
      0,
      0,
      this.renderCtx.width,
      this.renderCtx.height
    );
  }

  /**
   * Handle high DPI displays automatically
   */
  private renderHighDPI(): number {
    const dpr = window.devicePixelRatio || 1;
    const canvas = this.renderCtx.canvas;

    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;

    this.renderCtx.ctx.scale(dpr, dpr);
    return dpr;
  }

  /**
   * Create 3 layered canvases for background, waveform, markers, and playhead
   */
  private createLayeredCanvas(): Map<string, HTMLCanvasElement> {
    const layers = new Map<string, HTMLCanvasElement>();
    const layerNames = ['background', 'waveform', 'markers', 'playhead'];

    layerNames.forEach((name) => {
      const canvas = document.createElement('canvas');
      canvas.width = this.renderCtx.width * this.renderCtx.pixelRatio;
      canvas.height = this.renderCtx.height * this.renderCtx.pixelRatio;
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      layers.set(name, canvas);
    });

    return layers;
  }

  /**
   * Animate with 16ms budget per frame, skip if overflow
   */
  animateWithBudget(
    onAnimate: (deltaTime: number) => void,
    maxIterations: number = 1000
  ): void {
    const now = performance.now();
    const deltaTime = Math.min(now - this.lastFrameTime, 16);
    this.lastFrameTime = now;

    let timeUsed = 0;
    const startTime = performance.now();

    for (let i = 0; i < maxIterations; i++) {
      onAnimate(deltaTime);
      timeUsed = performance.now() - startTime;

      if (timeUsed > this.animationBudget) {
        console.warn(`Animation exceeded budget: ${timeUsed.toFixed(2)}ms > ${this.animationBudget}ms`);
        break;
      }
    }
  }

  /**
   * Create spatial hash for fast hit testing of markers
   */
  createSpatialHash(markers: CanvasMarker[], cellSize: number = 64): Map<string, SpatialHashBucket> {
    const hash = new Map<string, SpatialHashBucket>();

    markers.forEach((marker) => {
      const cellX = Math.floor(marker.x / cellSize);
      const cellY = Math.floor(marker.y / cellSize);
      const key = `${cellX},${cellY}`;

      if (!hash.has(key)) {
        hash.set(key, {
          x: cellX * cellSize,
          y: cellY * cellSize,
          markers: [],
        });
      }
      hash.get(key)!.markers.push(marker);
    });

    this.spatialHash = hash;
    return hash;
  }

  /**
   * Get markers near a point using spatial hash
   */
  getMarkersNearPoint(x: number, y: number, radius: number = 32, cellSize: number = 64): CanvasMarker[] {
    const cellX = Math.floor(x / cellSize);
    const cellY = Math.floor(y / cellSize);
    const results: CanvasMarker[] = [];

    for (let cx = cellX - 1; cx <= cellX + 1; cx++) {
      for (let cy = cellY - 1; cy <= cellY + 1; cy++) {
        const key = `${cx},${cy}`;
        const bucket = this.spatialHash.get(key);
        if (bucket) {
          bucket.markers.forEach((marker) => {
            const dist = Math.hypot(marker.x - x, marker.y - y);
            if (dist <= radius) {
              results.push(marker);
            }
          });
        }
      }
    }

    return results;
  }

  /**
   * Render GPU-accelerated gradients for waveform
   */
  renderGPUGradient(
    startColor: string,
    endColor: string,
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): CanvasGradient {
    const ctx = this.renderCtx.ctx;
    const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
    gradient.addColorStop(0, startColor);
    gradient.addColorStop(1, endColor);
    return gradient;
  }

  /**
   * Batch draw calls by grouping similar styles
   */
  batchDrawCalls(
    drawOperations: Array<{
      type: 'rect' | 'circle' | 'line';
      x: number;
      y: number;
      width?: number;
      height?: number;
      radius?: number;
      color: string;
    }>
  ): void {
    const ctx = this.renderCtx.ctx;
    const operationsByColor = new Map<string, typeof drawOperations>();

    // Group by color for batching
    drawOperations.forEach((op) => {
      if (!operationsByColor.has(op.color)) {
        operationsByColor.set(op.color, []);
      }
      operationsByColor.get(op.color)!.push(op);
    });

    // Render each color group
    operationsByColor.forEach((ops, color) => {
      ctx.fillStyle = color;
      ops.forEach((op) => {
        ctx.beginPath();
        if (op.type === 'rect' && op.width && op.height) {
          ctx.fillRect(op.x, op.y, op.width, op.height);
        } else if (op.type === 'circle' && op.radius) {
          ctx.arc(op.x, op.y, op.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    });
  }

  /**
   * Pre-render waveform tiles at different zoom levels
   */
  precomputeWaveformTiles(
    waveformData: Float32Array,
    zoomLevels: number[] = [0, 1, 2, 3, 4]
  ): void {
    const tileSize = 256;
    zoomLevels.forEach((zoomLevel) => {
      const samplesPerPixel = Math.pow(2, Math.max(0, 10 - zoomLevel));
      const tilesNeeded = Math.ceil(waveformData.length / (tileSize * samplesPerPixel));

      for (let tileIdx = 0; tileIdx < tilesNeeded; tileIdx++) {
        const startSample = tileIdx * tileSize * samplesPerPixel;
        const endSample = Math.min(startSample + tileSize * samplesPerPixel, waveformData.length);

        const tileCanvas = document.createElement('canvas');
        tileCanvas.width = tileSize;
        tileCanvas.height = 128;

        const tileCtx = tileCanvas.getContext('2d');
        if (!tileCtx) continue;

        tileCtx.strokeStyle = '#00ff00';
        tileCtx.lineWidth = 1;
        tileCtx.beginPath();

        for (let i = startSample; i < endSample; i += samplesPerPixel) {
          const pixelX = (i - startSample) / samplesPerPixel;
          const sample = waveformData[i] || 0;
          const y = 64 * (1 - sample);

          if (i === startSample) {
            tileCtx.moveTo(pixelX, y);
          } else {
            tileCtx.lineTo(pixelX, y);
          }
        }
        tileCtx.stroke();

        const imageData = tileCtx.getImageData(0, 0, tileSize, 128);
        const key = `z${zoomLevel}_t${tileIdx}`;
        this.tileCache.tiles.set(key, imageData);
      }
    });

    this.tileCache.zoomLevel = zoomLevels[0];
  }

  /**
   * Get tile from cache
   */
  getTile(zoomLevel: number, tileIndex: number): ImageData | null {
    const key = `z${zoomLevel}_t${tileIndex}`;
    return this.tileCache.tiles.get(key) || null;
  }

  /**
   * Clear all caches and dirty regions
   */
  clear(): void {
    this.dirtyRegions = [];
    this.spatialHash.clear();
    this.tileCache.tiles.clear();
    this.renderCtx.ctx.clearRect(0, 0, this.renderCtx.width, this.renderCtx.height);
  }

  /**
   * Get the rendering context
   */
  getContext(): RenderContext {
    return this.renderCtx;
  }

  /**
   * Get layered canvases
   */
  getLayeredCanvases(): Map<string, HTMLCanvasElement> {
    return this.layeredCanvases;
  }

  /**
   * Get dirty regions
   */
  getDirtyRegions(): DirtyRegion[] {
    return this.dirtyRegions;
  }

  /**
   * Get texture atlas
   */
  getTextureAtlas(): Map<string, CanvasPattern> {
    return this.textureAtlas;
  }

  /**
   * Set animation budget in milliseconds
   */
  setAnimationBudget(budget: number): void {
    this.animationBudget = budget;
  }
}

export default WaveformRenderer;
