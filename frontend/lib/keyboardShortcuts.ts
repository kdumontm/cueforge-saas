/**
 * Keyboard Shortcuts Library
 * Global keyboard event handling for TrackCue
 */

import { useEffect } from "react";

type KeyboardAction =
  | "toggle-playback"
  | "open-search"
  | "open-upload"
  | "open-export"
  | "open-settings"
  | "open-shortcuts"
  | "close-modal"
  | "prev-track"
  | "next-track"
  | "cue-1"
  | "cue-2"
  | "cue-3"
  | "cue-4"
  | "cue-5"
  | "cue-6"
  | "cue-7"
  | "cue-8"
  | "cue-9";

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  cmd?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: KeyboardAction;
}

const SHORTCUTS: ShortcutConfig[] = [
  { key: " ", action: "toggle-playback" }, // Space
  { key: "k", ctrl: true, action: "open-search" }, // Ctrl/Cmd + K
  { key: "u", ctrl: true, action: "open-upload" }, // Ctrl/Cmd + U
  { key: "e", ctrl: true, action: "open-export" }, // Ctrl/Cmd + E
  { key: ",", ctrl: true, action: "open-settings" }, // Ctrl/Cmd + ,
  { key: "?", action: "open-shortcuts" }, // ?
  { key: "/", ctrl: true, action: "open-shortcuts" }, // Ctrl/Cmd + /
  { key: "Escape", action: "close-modal" },
  { key: "ArrowLeft", action: "prev-track" },
  { key: "ArrowRight", action: "next-track" },
  { key: "1", action: "cue-1" },
  { key: "2", action: "cue-2" },
  { key: "3", action: "cue-3" },
  { key: "4", action: "cue-4" },
  { key: "5", action: "cue-5" },
  { key: "6", action: "cue-6" },
  { key: "7", action: "cue-7" },
  { key: "8", action: "cue-8" },
  { key: "9", action: "cue-9" },
];

/**
 * Check if an element is an input field or textarea
 */
function isInputElement(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    element.hasAttribute("contenteditable")
  );
}

/**
 * Check if a keyboard event matches a shortcut config
 */
function matchesShortcut(event: KeyboardEvent, config: ShortcutConfig): boolean {
  const keyMatches = event.key === config.key || event.code === config.key;

  if (!keyMatches) return false;

  const ctrlOrCmd = config.ctrl || config.cmd;
  const hasCtrlOrCmd =
    event.ctrlKey || (event.metaKey && /Mac|iPhone|iPad|iPod/.test(navigator.platform));

  if (ctrlOrCmd && !hasCtrlOrCmd) return false;
  if (!ctrlOrCmd && (event.ctrlKey || event.metaKey)) return false;

  if (config.shift && !event.shiftKey) return false;
  if (!config.shift && event.shiftKey) return false;

  if (config.alt && !event.altKey) return false;
  if (!config.alt && event.altKey) return false;

  return true;
}

/**
 * Dispatch a custom event for keyboard actions
 */
function dispatchAction(action: KeyboardAction): void {
  const event = new CustomEvent("keyboard-action", {
    detail: { action },
  });
  window.dispatchEvent(event);
}

/**
 * Hook to handle global keyboard shortcuts
 * Returns the action triggered (or null)
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if focused on input
      const activeElement = document.activeElement;
      if (activeElement && isInputElement(activeElement)) {
        return;
      }

      // Check each shortcut
      for (const config of SHORTCUTS) {
        if (matchesShortcut(event, config)) {
          event.preventDefault();
          dispatchAction(config.action);
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}

/**
 * Hook to listen for keyboard actions
 */
export function useKeyboardAction(callback: (action: KeyboardAction) => void) {
  useEffect(() => {
    const handleAction = (event: CustomEvent) => {
      callback(event.detail.action);
    };

    window.addEventListener("keyboard-action", handleAction as EventListener);
    return () =>
      window.removeEventListener("keyboard-action", handleAction as EventListener);
  }, [callback]);
}

/**
 * Get all available shortcuts configuration
 */
export function getShortcuts(): ShortcutConfig[] {
  return SHORTCUTS;
}

/**
 * Get shortcuts grouped by category for display
 */
export function getGroupedShortcuts() {
  return {
    playback: [
      { key: "Space", desc: "Play / Pause", action: "toggle-playback" },
      { key: "←", desc: "Track précédent", action: "prev-track" },
      { key: "→", desc: "Track suivant", action: "next-track" },
    ],
    navigation: [
      { key: "Ctrl/Cmd + K", desc: "Recherche rapide", action: "open-search" },
      { key: "Ctrl/Cmd + ,", desc: "Paramètres", action: "open-settings" },
      { key: "Esc", desc: "Fermer les modales", action: "close-modal" },
    ],
    actions: [
      { key: "Ctrl/Cmd + U", desc: "Aller à l'upload", action: "open-upload" },
      { key: "Ctrl/Cmd + E", desc: "Aller à l'export", action: "open-export" },
      { key: "1-9", desc: "Poser un cue point", action: "cue-1" },
    ],
    help: [
      {
        key: "? ou Ctrl/Cmd + /",
        desc: "Afficher les raccourcis",
        action: "open-shortcuts",
      },
    ],
  };
}
