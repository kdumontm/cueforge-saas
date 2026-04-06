// ─── Détection et bridge desktop Electron ──────────────────────────────────
// Ce fichier permet aux composants web de détecter s'ils tournent dans l'app
// Electron et d'accéder aux capacités locales (fichiers, exports, updater).
//
// PRINCIPE : le web gère TOUT (auth, API, BDD, admin, settings, sécu).
// Le desktop ajoute juste 3 capacités locales via window.cueforge :
//   1. files   → ouvrir/lire/sauvegarder des fichiers sur le disque
//   2. export  → générer des fichiers Rekordbox XML / Serato .crate
//   3. updater → auto-mise à jour de l'app

// ── Types pour le bridge Electron ────────────────────────────────────────────

export interface CueForgeFiles {
  openDialog: () => Promise<string[]>;
  readBuffer: (path: string) => Promise<ArrayBuffer>;
  readMetadata: (path: string) => Promise<Record<string, any>>;
  revealInFinder: (path: string) => void;
  save: (content: string | Buffer, defaultName: string, filters?: any[]) => Promise<string>;
  getFilePath: (file: File) => string;
}

export interface CueForgeExport {
  rekordbox: (tracks: any[], outputPath?: string) => Promise<string>;
  serato: (tracks: any[], outputPath?: string) => Promise<string>;
}

export interface CueForgeUpdater {
  check: () => Promise<void>;
  onAvailable: (cb: (info: any) => void) => void;
  onDownloaded: (cb: (info: any) => void) => void;
  onProgress: (cb: (data: { percent: number }) => void) => void;
}

export interface CueForgeStems {
  checkAvailable: () => Promise<{ available: boolean; python: string | null }>;
  separate: (filePath: string) => Promise<{
    stemDir: string;
    stems: Record<string, { path: string; buffer: ArrayBuffer }>;
    model: string;
  }>;
  readBuffer: (stemPath: string) => Promise<ArrayBuffer | null>;
  onProgress: (cb: (pct: number) => void) => void;
}

export interface CueForgeBridge {
  isDesktop: true;
  getAppVersion: () => Promise<string>;
  files: CueForgeFiles;
  export: CueForgeExport;
  updater: CueForgeUpdater;
  stems: CueForgeStems;
}

// ── Détection ────────────────────────────────────────────────────────────────

/**
 * Vérifie si l'app tourne dans Electron (= le bridge cueforge est injecté)
 * Safe pour SSR (Next.js) : vérifie typeof window
 */
export function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && !!(window as any).cueforge?.isDesktop;
}

/**
 * Retourne le bridge Electron ou null si on est sur le web
 */
function getBridge(): CueForgeBridge | null {
  if (!isDesktopApp()) return null;
  return (window as any).cueforge as CueForgeBridge;
}

// ── Hook React ───────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';

/**
 * Hook principal pour accéder aux capacités desktop depuis n'importe quel composant.
 *
 * Usage :
 *   const { isDesktop, files, export: localExport } = useElectron();
 *   if (isDesktop && files) {
 *     const paths = await files.openDialog();
 *   }
 */
export function useElectron() {
  const bridge = getBridge();

  return {
    /** true si on est dans l'app Electron */
    isDesktop: !!bridge,

    /** Accès aux fichiers locaux (ouvrir, lire, sauvegarder, reveal in Finder) */
    files: bridge?.files ?? null,

    /** Exports DJ (Rekordbox XML, Serato .crate) vers le disque local */
    export: bridge?.export ?? null,

    /** Auto-updater de l'app */
    updater: bridge?.updater ?? null,

    /** Séparation de stems (Demucs local) */
    stems: bridge?.stems ?? null,

    /** Version de l'app Electron */
    getAppVersion: bridge?.getAppVersion ?? null,
  };
}

// ── Hook pour l'auto-updater ─────────────────────────────────────────────────

export interface UpdateState {
  available: boolean;
  downloaded: boolean;
  progress: number;
  info: any;
}

/**
 * Hook pour gérer les mises à jour de l'app desktop.
 * Retourne l'état de l'update et ne fait rien si on est sur le web.
 */
export function useAutoUpdate(): UpdateState {
  const { updater } = useElectron();
  const [state, setState] = useState<UpdateState>({
    available: false,
    downloaded: false,
    progress: 0,
    info: null,
  });

  useEffect(() => {
    if (!updater) return;

    updater.onAvailable((info) => {
      setState((prev) => ({ ...prev, available: true, info }));
    });

    updater.onProgress((data) => {
      setState((prev) => ({ ...prev, progress: data.percent }));
    });

    updater.onDownloaded((info) => {
      setState((prev) => ({ ...prev, downloaded: true, info }));
    });
  }, [updater]);

  return state;
}
