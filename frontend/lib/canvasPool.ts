/**
 * Canvas pool and rendering optimizations (points 561-570)
 * Reuses canvas elements, batches operations, double buffering
 */

interface PooledCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  inUse: boolean;
}

export class CanvasPool {
  private pool: PooledCanvas[] = [];
  private maxSize = 10;

  /**
   * Get or create a canvas from pool
   */
  getCanvas(width: number, height: number): HTMLCanvasElement {
    // Try to find one with matching size
    let available: PooledCanvas | undefined;
    for (const pooled of this.pool) {
      if (
        !pooled.inUse &&
        pooled.canvas.width === width &&
        pooled.canvas.height === height
      ) {
        available = pooled;
        break;
      }
    }

    if (!available && this.pool.length < this.maxSize) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      available = { canvas, ctx, inUse: false };
      this.pool.push(available);
    }

    if (available) {
      available.inUse = true;
      available.canvas.width = width;
      available.canvas.height = height;
      // Clear
      available.ctx.clearRect(0, 0, width, height);
      return available.canvas;
    }

    // Fallback: create temporary canvas
    console.warn('[CanvasPool] Pool exhausted, creating temporary canvas');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  /**
   * Return canvas to pool
   */
  returnCanvas(canvas: HTMLCanvasElement) {
    for (const pooled of this.pool) {
      if (pooled.canvas === canvas) {
        pooled.inUse = false;
        break;
      }
    }
  }

  /**
   * Clear pool
   */
  clear() {
    this.pool = [];
  }
}

// Global instance
let globalCanvasPool: CanvasPool | null = null;

export function getCanvasPool(): CanvasPool {
  if (!globalCanvasPool) {
    globalCanvasPool = new CanvasPool();
  }
  return globalCanvasPool;
}

/**
 * Double buffering helper for smooth canvas animation
 * Renders to off-screen canvas first, then blits to visible canvas
 */
export class DoubleBuffer {
  private backBuffer: HTMLCanvasElement;
  private frontBuffer: HTMLCanvasElement;
  private backCtx: CanvasRenderingContext2D;
  private frontCtx: CanvasRenderingContext2D;
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    const pool = getCanvasPool();
    this.backBuffer = pool.getCanvas(width, height);
    this.frontBuffer = pool.getCanvas(width, height);
    this.backCtx = this.backBuffer.getContext('2d')!;
    this.frontCtx = this.frontBuffer.getContext('2d')!;
    this.width = width;
    this.height = height;
  }

  /**
   * Get context for drawing (back buffer)
   */
  getContext(): CanvasRenderingContext2D {
    return this.backCtx;
  }

  /**
   * Swap buffers
   */
  swap() {
    const temp = this.backBuffer;
    this.backBuffer = this.frontBuffer;
    this.frontBuffer = temp;

    this.backCtx.clearRect(0, 0, this.width, this.height);
  }

  /**
   * Get visible canvas
   */
  getCanvas(): HTMLCanvasElement {
    return this.frontBuffer;
  }

  /**
   * Resize both buffers
   */
  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.backBuffer.width = width;
    this.backBuffer.height = height;
    this.frontBuffer.width = width;
    this.frontBuffer.height = height;
  }

  /**
   * Release buffers back to pool
   */
  release() {
    const pool = getCanvasPool();
    pool.returnCanvas(this.backBuffer);
    pool.returnCanvas(this.frontBuffer);
  }
}

/**
 * Dirty region tracking — only redraw changed areas
 */
export class DirtyRegion {
  private dirtyRect: { x: number; y: number; w: number; h: number } | null = null;
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  /**
   * Mark a region as dirty
   */
  addRect(x: number, y: number, w: number, h: number) {
    if (!this.dirtyRect) {
      this.dirtyRect = { x, y, w, h };
    } else {
      // Expand dirty rectangle
      const x1 = Math.min(this.dirtyRect.x, x);
      const y1 = Math.min(this.dirtyRect.y, y);
      const x2 = Math.max(this.dirtyRect.x + this.dirtyRect.w, x + w);
      const y2 = Math.max(this.dirtyRect.y + this.dirtyRect.h, y + h);
      this.dirtyRect = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    }
  }

  /**
   * Check if a point is in dirty region
   */
  isDirty(x: number, y: number): boolean {
    if (!this.dirtyRect) return false;
    return (
      x >= this.dirtyRect.x &&
      x < this.dirtyRect.x + this.dirtyRect.w &&
      y >= this.dirtyRect.y &&
      y < this.dirtyRect.y + this.dirtyRect.h
    );
  }

  /**
   * Get dirty rectangle (or full canvas if many changes)
   */
  getRect(): { x: number; y: number; w: number; h: number } | null {
    if (!this.dirtyRect) return null;
    // If dirty area > 50% of canvas, just redraw everything
    const ratio = (this.dirtyRect.w * this.dirtyRect.h) / (this.width * this.height);
    return ratio > 0.5 ? null : this.dirtyRect;
  }

  /**
   * Reset dirty state
   */
  clear() {
    this.dirtyRect = null;
  }
}

/**
 * Canvas batch operations — defer state changes
 */
export class CanvasBatcher {
  private operations: Array<() => void> = [];
  private ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  /**
   * Queue an operation
   */
  queue(op: () => void) {
    this.operations.push(op);
  }

  /**
   * Execute all queued operations
   */
  flush() {
    this.ctx.save();
    for (const op of this.operations) {
      op();
    }
    this.ctx.restore();
    this.operations = [];
  }
}
