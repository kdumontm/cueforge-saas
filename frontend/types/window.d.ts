/**
 * Déclarations globales pour window — évite les (window as any).
 */

interface TrackCueElectronBridge {
  isDesktop?: boolean;
  analyzeLocal?: (filePath: string) => Promise<unknown>;
  getFilePath?: (trackId: number) => Promise<string | null>;
  openFile?: (path: string) => Promise<void>;
  showItemInFolder?: (path: string) => Promise<void>;
  onDeepLink?: (callback: (url: string) => void) => void;
}

declare global {
  interface Window {
    trackcue?: TrackCueElectronBridge;
    __cuePreviewTimer?: ReturnType<typeof setTimeout>;
    webkitAudioContext?: typeof AudioContext;
  }
}

export {};
