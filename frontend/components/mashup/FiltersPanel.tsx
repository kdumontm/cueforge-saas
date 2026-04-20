/**
 * FiltersPanel — Panneau de filtres « Idea filters »
 *
 * Contient filtres énergie (range slider 1-10), BPM (range),
 * playlist (Select), compatibility Camelot (checkboxes).
 *
 * Props:
 * - defaultFilters?: MashupFilters (état initial)
 * - onChange?: (filters: MashupFilters) => void (callback changement)
 * - playlists?: Array<{ id: string; name: string }> (options playlist)
 *
 * Retourne : { energyRange, bpmRange, playlistId, compatKey }
 *
 * @example
 * <FiltersPanel
 *   defaultFilters={{ energyRange: [4, 8], bpmRange: [120, 160], playlistId: "fav" }}
 *   onChange={(f) => console.log(f)}
 *   playlists={[{ id: "fav", name: "Favoris" }]}
 * />
 */

import React, { useState, useCallback } from "react";
import { Card, CardHeader, CardBody, Input, Select, Switch } from "../ui";
import type { MashupFilters } from "../../lib/types/mashup";

interface FiltersPanelProps {
  defaultFilters?: Partial<MashupFilters>;
  onChange?: (filters: MashupFilters) => void;
  playlists?: Array<{ id: string; name: string }>;
}

const camelotKeys = [
  "1A", "2A", "3A", "4A", "5A", "6A", "7A", "8A", "9A", "10A", "11A", "12A",
  "1B", "2B", "3B", "4B", "5B", "6B", "7B", "8B", "9B", "10B", "11B", "12B",
];

const FiltersPanel = React.forwardRef<HTMLDivElement, FiltersPanelProps>(
  (
    {
      defaultFilters = {},
      onChange,
      playlists = [],
    },
    ref
  ) => {
    const [energyMin, setEnergyMin] = useState(defaultFilters.energyRange?.[0] ?? 1);
    const [energyMax, setEnergyMax] = useState(defaultFilters.energyRange?.[1] ?? 10);
    const [bpmMin, setBpmMin] = useState(defaultFilters.bpmRange?.[0] ?? 80);
    const [bpmMax, setBpmMax] = useState(defaultFilters.bpmRange?.[1] ?? 180);
    const [playlistId, setPlaylistId] = useState(defaultFilters.playlistId ?? "all");
    const [compatKey, setCompatKey] = useState(defaultFilters.compatKey ?? "");

    const emitChange = useCallback(() => {
      if (onChange) {
        onChange({
          energyRange: [energyMin, energyMax],
          bpmRange: [bpmMin, bpmMax],
          playlistId: playlistId === "all" ? undefined : playlistId,
          compatKey: compatKey || undefined,
        });
      }
    }, [energyMin, energyMax, bpmMin, bpmMax, playlistId, compatKey, onChange]);

    React.useEffect(() => {
      emitChange();
    }, [energyMin, energyMax, bpmMin, bpmMax, playlistId, compatKey, emitChange]);

    return (
      <Card ref={ref} className="w-full max-w-sm">
        <CardHeader>
          <h3 className="text-lg font-semibold text-neutral-900">Idea Filters</h3>
        </CardHeader>
        <CardBody className="space-y-6">
          {/* Énergie */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-3">
              Énergie : {energyMin} - {energyMax}
            </label>
            <div className="flex gap-3">
              <input
                type="range"
                min="1"
                max="10"
                value={energyMin}
                onChange={(e) => setEnergyMin(Math.min(parseInt(e.target.value), energyMax))}
                className="flex-1"
              />
              <input
                type="range"
                min="1"
                max="10"
                value={energyMax}
                onChange={(e) => setEnergyMax(Math.max(parseInt(e.target.value), energyMin))}
                className="flex-1"
              />
            </div>
          </div>

          {/* BPM */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-3">
              BPM : {bpmMin} - {bpmMax}
            </label>
            <div className="flex gap-3">
              <Input
                type="number"
                min="60"
                max="200"
                value={bpmMin}
                onChange={(e) => setBpmMin(Math.min(parseInt(e.target.value) || 60, bpmMax))}
                className="flex-1"
              />
              <Input
                type="number"
                min="60"
                max="200"
                value={bpmMax}
                onChange={(e) => setBpmMax(Math.max(parseInt(e.target.value) || 200, bpmMin))}
                className="flex-1"
              />
            </div>
          </div>

          {/* Playlist */}
          {playlists.length > 0 && (
            <Select
              label="Playlist"
              value={playlistId}
              onChange={(e) => setPlaylistId(e.target.value)}
              options={[
                { value: "all", label: "Toutes les playlists" },
                ...playlists.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          )}

          {/* Clé Camelot */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Clé Camelot
            </label>
            <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
              {camelotKeys.map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={compatKey === key}
                    onChange={() => setCompatKey(compatKey === key ? "" : key)}
                    className="rounded w-4 h-4 accent-purple-600"
                  />
                  {key}
                </label>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>
    );
  }
);

FiltersPanel.displayName = "FiltersPanel";

export { FiltersPanel };
export default FiltersPanel;
