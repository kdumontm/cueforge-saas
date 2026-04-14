/**
 * Web Worker — audio buffer decoding (points 571-580)
 * Offloads AudioContext.decodeAudioData from main thread
 * Enables parallel decoding of multiple tracks
 */

let audioContext: AudioContext | null = null;

function initAudioContext() {
  if (!audioContext) {
    const AudioCtx = (self as any).AudioContext || (self as any).webkitAudioContext;
    audioContext = AudioCtx ? new AudioCtx() : null;
  }
  return audioContext;
}

self.onmessage = async (event: MessageEvent<any>) => {
  if (event.data.type === 'decode') {
    const { arrayBuffer, id } = event.data;
    try {
      const ctx = initAudioContext();
      if (!ctx) throw new Error('AudioContext not available');

      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      // Send back decoded buffer (will be transferred)
      self.postMessage(
        {
          type: 'decoded',
          id,
          sampleRate: audioBuffer.sampleRate,
          duration: audioBuffer.duration,
          numberOfChannels: audioBuffer.numberOfChannels,
          data: audioBuffer.getChannelData(0).buffer, // Transfer ownership
        },
        [audioBuffer.getChannelData(0).buffer] as any, // Transferable
      );
    } catch (err) {
      self.postMessage({
        type: 'error',
        id,
        error: (err as Error).message,
      });
    }
  }
};
