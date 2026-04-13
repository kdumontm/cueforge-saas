/**
 * Audio Processing Worklet (Points 1011-1080)
 * AudioWorkletProcessor for real-time DSP:
 * - Peak metering
 * - RMS level metering
 * - Beat detection (onset strength)
 * - Spectral analysis streaming
 */

// Declare global types for AudioWorklet
declare const registerProcessor: (name: string, constructor: any) => void;

type AudioWorkletProcessorOptions = {
  processorOptions?: Record<string, any>;
  numberOfInputs?: number;
  numberOfOutputs?: number;
  outputChannelCount?: number[];
};

// ============================================================================
// BaseAudioProcessor — Base class for audio worklets
// ============================================================================
abstract class BaseAudioProcessor {
  protected sampleRate: number;
  protected bufferSize: number;
  protected port: MessagePort;

  constructor(options: AudioWorkletProcessorOptions) {
    this.sampleRate = (options as any).processorOptions?.sampleRate || 44100;
    this.bufferSize = 128;
    this.port = (self as any).port || new MessageChannel().port1;
  }

  /**
   * Calculate RMS (Root Mean Square) level
   */
  protected calculateRMS(samples: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }

  /**
   * Calculate peak level
   */
  protected calculatePeak(samples: Float32Array): number {
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
      peak = Math.max(peak, Math.abs(samples[i]));
    }
    return peak;
  }

  /**
   * Convert linear to dB scale
   */
  protected toDB(linear: number): number {
    return linear > 0 ? 20 * Math.log10(Math.max(linear, 1e-6)) : -Infinity;
  }

  /**
   * Convert dB to linear scale
   */
  protected toLinear(dB: number): number {
    return Math.pow(10, dB / 20);
  }
}

// ============================================================================
// PeakMeterProcessor — Real-time peak metering
// ============================================================================
class PeakMeterProcessor extends BaseAudioProcessor {
  private holdTime: number = 1; // seconds
  private holdSamples: number;
  private peakValue: number = 0;
  private holdCounter: number = 0;

  constructor(options: AudioWorkletNodeOptions) {
    super(options);
    this.holdSamples = Math.floor(this.sampleRate * this.holdTime);
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const samples = input[0];
    const peak = this.calculatePeak(samples);

    if (peak > this.peakValue) {
      this.peakValue = peak;
      this.holdCounter = this.holdSamples;
    } else if (this.holdCounter > 0) {
      this.holdCounter -= samples.length;
    } else {
      this.peakValue = peak;
    }

    // Send peak value to main thread
    this.port.postMessage({
      type: 'peak',
      value: this.peakValue,
      dB: this.toDB(this.peakValue),
    });

    // Pass through
    if (outputs[0]) {
      outputs[0][0].set(samples);
    }

    return true;
  }
}

// ============================================================================
// RMSMeterProcessor — Real-time RMS level metering
// ============================================================================
class RMSMeterProcessor extends BaseAudioProcessor {
  private windowSize: number;
  private rmsBuffer: number[] = [];
  private updateInterval: number;
  private sampleCounter: number = 0;

  constructor(options: AudioWorkletNodeOptions) {
    super(options);
    this.windowSize = Math.floor(this.sampleRate * 0.1); // 100ms window
    this.updateInterval = this.windowSize;
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const samples = input[0];

    for (let i = 0; i < samples.length; i++) {
      const rms = this.calculateRMS(new Float32Array([samples[i]]));
      this.rmsBuffer.push(rms);

      this.sampleCounter++;

      if (this.sampleCounter >= this.updateInterval) {
        // Calculate average RMS over the window
        const avgRMS =
          this.rmsBuffer.reduce((a, b) => a + b, 0) / this.rmsBuffer.length;

        this.port.postMessage({
          type: 'rms',
          value: avgRMS,
          dB: this.toDB(avgRMS),
          smoothed: true,
        });

        this.rmsBuffer = [];
        this.sampleCounter = 0;
      }
    }

    // Pass through
    if (outputs[0]) {
      outputs[0][0].set(samples);
    }

    return true;
  }
}

// ============================================================================
// BeatDetectionProcessor — Real-time onset/beat detection
// ============================================================================
class BeatDetectionProcessor extends BaseAudioProcessor {
  private fftSize: number = 512;
  private prevMagnitudes: number[] = [];
  private onsetThreshold: number = 0.4;
  private noiseFloor: number = 1e-6;
  private bufferIdx: number = 0;
  private fftBuffer: Float32Array;

  constructor(options: AudioWorkletNodeOptions) {
    super(options);
    this.fftBuffer = new Float32Array(this.fftSize);
    this.prevMagnitudes = Array(this.fftSize / 2).fill(0);
  }

  /**
   * Simple FFT implementation (Cooley-Tukey)
   */
  private simpleFFT(input: Float32Array): { real: Float32Array; imag: Float32Array } {
    const n = input.length;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);

    for (let k = 0; k < n; k++) {
      real[k] = 0;
      imag[k] = 0;

      for (let t = 0; t < n; t++) {
        const angle = (-2 * Math.PI * k * t) / n;
        real[k] += input[t] * Math.cos(angle);
        imag[k] += input[t] * Math.sin(angle);
      }
    }

    return { real, imag };
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const samples = input[0];

    for (let i = 0; i < samples.length; i++) {
      this.fftBuffer[this.bufferIdx] = samples[i];
      this.bufferIdx++;

      if (this.bufferIdx >= this.fftSize) {
        this.bufferIdx = 0;

        // Perform FFT
        const { real, imag } = this.simpleFFT(this.fftBuffer);

        // Calculate magnitudes
        const magnitudes = new Array(real.length / 2);
        for (let j = 0; j < magnitudes.length; j++) {
          magnitudes[j] = Math.sqrt(
            real[j] * real[j] + imag[j] * imag[j]
          ) / this.fftSize;
        }

        // Calculate onset strength (flux)
        let onsetStrength = 0;
        for (let j = 0; j < magnitudes.length; j++) {
          const diff = Math.max(0, magnitudes[j] - this.prevMagnitudes[j]);
          onsetStrength += diff;
        }

        // Normalize
        onsetStrength = onsetStrength / magnitudes.length;

        // Detect beat if onset exceeds threshold
        const isBeat = onsetStrength > this.onsetThreshold;

        this.port.postMessage({
          type: 'beat',
          onsetStrength,
          isBeat,
          confidence: Math.min(1, onsetStrength / this.onsetThreshold),
        });

        this.prevMagnitudes = magnitudes;
      }
    }

    // Pass through
    if (outputs[0]) {
      outputs[0][0].set(samples);
    }

    return true;
  }
}

// ============================================================================
// SpectralAnalysisProcessor — Real-time spectral analysis
// ============================================================================
class SpectralAnalysisProcessor extends BaseAudioProcessor {
  private fftSize: number = 2048;
  private bufferIdx: number = 0;
  private fftBuffer: Float32Array;
  private hannWindow: Float32Array;
  private updateRate: number = 60; // Hz
  private updateSamples: number;
  private samplesSinceUpdate: number = 0;

  constructor(options: AudioWorkletNodeOptions) {
    super(options);
    this.fftBuffer = new Float32Array(this.fftSize);
    this.hannWindow = this.createHannWindow(this.fftSize);
    this.updateSamples = Math.floor(this.sampleRate / this.updateRate);
  }

  /**
   * Create Hann window function
   */
  private createHannWindow(size: number): Float32Array {
    const window = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
    }
    return window;
  }

  /**
   * Radix-2 FFT (simplified)
   */
  private fft(input: Float32Array): Float32Array {
    const n = input.length;
    const output = new Float32Array(n);

    // Apply window
    for (let i = 0; i < n; i++) {
      output[i] = input[i] * this.hannWindow[i];
    }

    // Convert to frequency domain magnitudes (simplified)
    const freqs = new Float32Array(n / 2);
    for (let k = 0; k < n / 2; k++) {
      let real = 0,
        imag = 0;
      for (let t = 0; t < n; t++) {
        const angle = (-2 * Math.PI * k * t) / n;
        real += output[t] * Math.cos(angle);
        imag += output[t] * Math.sin(angle);
      }
      freqs[k] = Math.sqrt(real * real + imag * imag) / n;
    }

    return freqs;
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const samples = input[0];

    for (let i = 0; i < samples.length; i++) {
      this.fftBuffer[this.bufferIdx] = samples[i];
      this.bufferIdx++;
      this.samplesSinceUpdate++;

      if (this.bufferIdx >= this.fftSize) {
        this.bufferIdx = 0;

        // Perform FFT
        const spectrum = this.fft(this.fftBuffer);

        // Send spectrum every updateRate
        if (this.samplesSinceUpdate >= this.updateSamples) {
          this.port.postMessage({
            type: 'spectrum',
            data: Array.from(spectrum),
            timestamp: Date.now(),
          });

          this.samplesSinceUpdate = 0;
        }
      }
    }

    // Pass through
    if (outputs[0]) {
      outputs[0][0].set(samples);
    }

    return true;
  }
}

// ============================================================================
// Register all processors
// ============================================================================
registerProcessor('peak-meter', PeakMeterProcessor);
registerProcessor('rms-meter', RMSMeterProcessor);
registerProcessor('beat-detection', BeatDetectionProcessor);
registerProcessor('spectral-analysis', SpectralAnalysisProcessor);

export {
  PeakMeterProcessor,
  RMSMeterProcessor,
  BeatDetectionProcessor,
  SpectralAnalysisProcessor,
};
