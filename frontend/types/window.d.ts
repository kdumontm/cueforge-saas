/**
 * Déclarations globales pour window — évite les (window as any).
 */

interface CueForgeElectronBridge {
  isDesktop?: boolean;
  analyzeLocal?: (filePath: string) => Promise<unknown>;
  getFilePath?: (trackId: number) => Promise<string | null>;
  openFile?: (path: string) => Promise<void>;
  showItemInFolder?: (path: string) => Promise<void>;
  onDeepLink?: (callback: (url: string) => void) => void;
}

declare global {
  interface Window {
    cueforge?: CueForgeElectronBridge;
    __cuePreviewTimer?: ReturnType<typeof setTimeout>;
    webkitAudioContext?: typeof AudioContext;
  }
}

export {};
