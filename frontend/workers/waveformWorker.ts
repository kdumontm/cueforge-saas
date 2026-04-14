/**
 * Web Worker — compute RGB spectral waveform (points 551-560)
 * Offloads heavy computation from main thread
 * Accepts: AudioBuffer, numBars
 * Returns: Array<{ r, g, b, amp }>
 */

function computeRGBWaveform(buf: AudioBuffer, numBars = 8000): { r: number; g: number; b: number; amp: number }[] {
  const data = buf.getChannelData(0);
  const segLen = Math.max(1, Math.floor(data.length / numBars));

  const bands: { lo: number; mi: number; hi: number; amp: number }[] = new Array(numBars);
  let maxLo = 1e-9,
    maxMi = 1e-9,
    maxHi = 1e-9;

  for (let i = 0; i < numBars; i++) {
    const s = i * segLen;
    const e = Math.min(s + segLen, data.length);
    let lo = 0,
      mi = 0,
      hi = 0,
      peak = 0;
    let prev = s > 0 ? data[s - 1] : 0;
    let prev2 = s > 1 ? data[s - 2] : 0;
    const n = e - s || 1;

    for (let j = s; j < e; j++) {
      const v = data[j];
      const d1 = v - prev;
      const d2 = v - 2 * prev + prev2;
      lo += v * v;
      mi += d1 * d1;
      hi += d2 * d2;
      peak = Math.max(peak, Math.abs(v));
      prev2 = prev;
      prev = v;
    }
    const loR = Math.sqrt(lo / n);
    const miR = Math.sqrt(mi / n);
    const hiR = Math.sqrt(hi / n);
    maxLo = Math.max(maxLo, loR);
    maxMi = Math.max(maxMi, miR);
    maxHi = Math.max(maxHi, hiR);
    bands[i] = { lo: loR, mi: miR, hi: hiR, amp: peak };
  }

  // Normalize and return
  return bands.map((c) => {
    const r = Math.pow(c.lo / maxLo, 0.55);
    const g = Math.pow(c.mi / maxMi, 0.55);
    const b = Math.pow(c.hi / maxHi, 0.55);
    return { r, g, b, amp: c.amp };
  });
}

self.onmessage = (event: MessageEvent<any>) => {
  if (event.data.type === 'compute') {
    const { buffer, numBars } = event.data;
    const result = computeRGBWaveform(buffer, numBars);
    self.postMessage({ type: 'result', data: result });
  }
};
