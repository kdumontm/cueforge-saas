"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight, Music, Upload, FileDown, Settings, Zap, BookOpen, Globe } from "lucide-react";
import { useKeyboardAction } from "@/lib/keyboardShortcuts";

interface Command {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  action: () => void;
  category: "navigation" | "action";
}

export function CommandPalette() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Command[] = [
    // Navigation
    {
      id: "dashboard",
      label: "Dashboard",
      description: "Retour au tableau de bord",
      icon: <Music className="w-4 h-4" />,
      action: () => {
        router.push("/dashboard");
        setIsOpen(false);
      },
      category: "navigation",
    },
    {
      id: "playlists",
      label: "Playlists",
      description: "Gérer vos playlists",
      icon: <Music className="w-4 h-4" />,
      action: () => {
        router.push("/dashboard/playlists");
        setIsOpen(false);
      },
      category: "navigation",
    },
    {
      id: "export",
      label: "Export",
      description: "Exporter vos données",
      icon: <FileDown className="w-4 h-4" />,
      action: () => {
        router.push("/dashboard/export");
        setIsOpen(false);
      },
      category: "navigation",
    },
    {
      id: "upload",
      label: "Upload",
      description: "Uploader de nouveaux tracks",
      icon: <Upload className="w-4 h-4" />,
      action: () => {
        router.push("/dashboard/upload");
        setIsOpen(false);
      },
      category: "navigation",
    },
    {
      id: "settings",
      label: "Paramètres",
      description: "Gérer vos préférences",
      icon: <Settings className="w-4 h-4" />,
      action: () => {
        router.push("/dashboard/settings");
        setIsOpen(false);
      },
      category: "navigation",
    },
    {
      id: "stats",
      label: "Statistiques",
      description: "Voir vos statistiques",
      icon: <Zap className="w-4 h-4" />,
      action: () => {
        router.push("/dashboard/stats");
        setIsOpen(false);
      },
      category: "navigation",
    },
    {
      id: "blog",
      label: "Blog",
      description: "Lire nos articles",
      icon: <BookOpen className="w-4 h-4" />,
      action: () => {
        router.push("/blog");
        setIsOpen(false);
      },
      category: "navigation",
    },
    {
      id: "docs",
      label: "Documentation",
      description: "Consulter la documentation",
      icon: <Globe className="w-4 h-4" />,
      action: () => {
        router.push("/docs");
        setIsOpen(false);
      },
      category: "navigation",
    },
    // Actions
    {
      id: "analyze-track",
      label: "Analyser un morceau",
      description: "Lancer l'analyse d'un nouveau track",
      icon: <Zap className="w-4 h-4" />,
      action: () => {
        router.push("/dashboard/upload");
        setIsOpen(false);
      },
      category: "action",
    },
    {
      id: "create-playlist",
      label: "Créer une playlist",
      description: "Créer une nouvelle playlist",
      icon: <Music className="w-4 h-4" />,
      action: () => {
        router.push("/dashboard/playlists");
        setIsOpen(false);
      },
      category: "action",
    },
    {
      id: "export-rekordbox",
      label: "Exporter Rekordbox",
      description: "Exporter vos données pour Rekordbox",
      icon: <FileDown className="w-4 h-4" />,
      action: () => {
        router.push("/dashboard/export");
        setIsOpen(false);
      },
      category: "action",
    },
  ];

  // Filter commands based on query
  const filteredCommands = commands.filter((cmd) =>
    cmd.label.toLowerCase().includes(query.toLowerCase()) ||
    cmd.description.toLowerCase().includes(query.toLowerCase())
  );

  // Listen for Cmd+K keyboard shortcut
  useKeyboardAction((action) => {
    if (action === "open-search") {
      setIsOpen((prev) => !prev);
    } else if (action === "close-modal" && isOpen) {
      setIsOpen(false);
    }
  });

  // Auto-focus input when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  const executeCommand = useCallback((cmd: Command) => {
    cmd.action();
    setQuery("");
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/40 backdrop-blur-sm"
      onClick={() => setIsOpen(false)}
    >
      <div
        className="w-full max-w-2xl mx-auto px-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-lg shadow-lg">
          <Search className="w-5 h-5 text-[var(--text-muted)]" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Rechercher une page ou une action..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent border-none outline-none text-[var(--text-primary)] placeholder-[var(--text-muted)]"
          />
        </div>

        {/* Results */}
        {filteredCommands.length > 0 && (
          <div className="mt-2 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-lg shadow-lg overflow-hidden">
            {/* Navigation Commands */}
            {filteredCommands.some((cmd) => cmd.category === "navigation") && (
              <div>
                <div className="px-4 py-2 bg-[var(--bg-elevated)] text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  Navigation
                </div>
                <div className="divide-y divide-[var(--border-subtle)]">
                  {filteredCommands
                    .filter((cmd) => cmd.category === "navigation")
                    .map((cmd, idx) => (
                      <button
                        key={cmd.id}
                        onClick={() => executeCommand(cmd)}
                        className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
                          filteredCommands[selectedIndex]?.id === cmd.id
                            ? "bg-[var(--bg-hover)]"
                            : "hover:bg-[var(--bg-hover)]"
                        }`}
                      >
                        <div className="text-[var(--accent-purple)]">{cmd.icon}</div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-[var(--text-primary)]">
                            {cmd.label}
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {cmd.description}
                          </p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-[var(--text-muted)]" />
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* Action Commands */}
            {filteredCommands.some((cmd) => cmd.category === "action") && (
              <div>
                <div className="px-4 py-2 bg-[var(--bg-elevated)] text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  Actions
                </div>
                <div className="divide-y divide-[var(--border-subtle)]">
                  {filteredCommands
                    .filter((cmd) => cmd.category === "action")
                    .map((cmd) => (
                      <button
                        key={cmd.id}
                        onClick={() => executeCommand(cmd)}
                        className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
                          filteredCommands[selectedIndex]?.id === cmd.id
                            ? "bg-[var(--bg-hover)]"
                            : "hover:bg-[var(--bg-hover)]"
                        }`}
                      >
                        <div className="text-[var(--accent-purple)]">{cmd.icon}</div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-[var(--text-primary)]">
                            {cmd.label}
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {cmd.description}
                          </p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-[var(--text-muted)]" />
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {query && filteredCommands.length === 0 && (
          <div className="mt-2 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-lg p-6 text-center">
            <p className="text-[var(--text-muted)]">Aucune commande trouvée</p>
          </div>
        )}

        {/* Hint */}
        <div className="mt-3 flex items-center justify-between px-4 py-2 text-xs text-[var(--text-muted)]">
          <span>↑↓ pour naviguer • Entrée pour sélectionner • Esc pour fermer</span>
          <span className="flex items-center gap-1">
            <kbd className="px-2 py-1 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[10px] font-mono">
              Ctrl
            </kbd>
            <span>+</span>
            <kbd className="px-2 py-1 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[10px] font-mono">
              K
            </kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
