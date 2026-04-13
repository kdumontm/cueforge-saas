/**
 * Audio buffer pool (points 571-580)
 * Reuses AudioBuffers instead of creating new ones
 * Reduces garbage collection pressure
 */

interface PooledBuffer {
  buffer: AudioBuffer;
  inUse: boolean;
  createdAt: number;
}

export class AudioBufferPool {
  private pool: Map<string, PooledBuffer[]> = new Map();
  private maxPerSpec = 5; // Max 5 buffers per sample rate/channels combo
  private context: AudioContext;

  constructor(context: AudioContext) {
    this.context = context;
  }

  /**
   * Get or create a buffer from the pool
   */
  getBuffer(sampleRate: number, duration: number, channels: number = 1): AudioBuffer {
    const key = `${sampleRate}-${channels}`;

    if (!this.pool.has(key)) {
      this.pool.set(key, []);
    }

    const buffers = this.pool.get(key)!;

    // Try to find an available buffer
    for (const pooled of buffers) {
      if (!pooled.inUse) {
        pooled.inUse = true;
        return pooled.buffer;
      }
    }

    // Create new buffer if under limit
    if (buffers.length < this.maxPerSpec) {
      const buffer = this.context.createBuffer(
        channels,
        Math.ceil(duration * sampleRate),
        sampleRate,
      );

      const pooled: PooledBuffer = {
        buffer,
        inUse: true,
        createdAt: Date.now(),
      };

      buffers.push(pooled);
      return buffer;
    }

    // Pool full: create temporary buffer (will be garbage collected)
    console.warn(
      `[AudioBufferPool] Pool exhausted for ${key}, creating temporary buffer`,
    );
    return this.context.createBuffer(
      channels,
      Math.ceil(duration * sampleRate),
      sampleRate,
    );
  }

  /**
   * Return a buffer to the pool
   */
  returnBuffer(buffer: AudioBuffer) {
    const key = `${buffer.sampleRate}-${buffer.numberOfChannels}`;
    const buffers = this.pool.get(key);

    if (buffers) {
      for (const pooled of buffers) {
        if (pooled.buffer === buffer) {
          pooled.inUse = false;
          break;
        }
      }
    }
  }

  /**
   * Clear old buffers (older than 5 minutes)
   */
  cleanup() {
    const maxAge = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();

    for (const buffers of this.pool.values()) {
      // Keep only unused buffers
      for (let i = buffers.length - 1; i >= 0; i--) {
        if (!buffers[i].inUse && now - buffers[i].createdAt > maxAge) {
          buffers.splice(i, 1);
        }
      }
    }
  }

  /**
   * Get pool stats
   */
  getStats() {
    let totalBuffers = 0;
    let usedBuffers = 0;

    for (const buffers of this.pool.values()) {
      totalBuffers += buffers.length;
      usedBuffers += buffers.filter((b) => b.inUse).length;
    }

    return { totalBuffers, usedBuffers };
  }
}

// Global instance
let globalPool: AudioBufferPool | null = null;

export function getAudioBufferPool(context: AudioContext): AudioBufferPool {
  if (!globalPool) {
    globalPool = new AudioBufferPool(context);

    // Cleanup every 10 minutes
    setInterval(() => {
      globalPool?.cleanup();
    }, 10 * 60 * 1000);
  }

  return globalPool;
}
