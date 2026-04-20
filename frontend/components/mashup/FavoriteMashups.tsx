/**
 * FavoriteMashups — Liste des mashups favoris
 *
 * Affichage card de chaque mashup avec :
 * - Track A & B (titre, artiste)
 * - Clés Camelot
 * - Energy
 * - Rating 1-5 (étoiles)
 * - Boutons play / remove
 *
 * Props:
 * - mashups: FavoriteMashup[] (données)
 * - onPlay?: (mashupId: string) => void
 * - onRemove?: (mashupId: string) => void
 *
 * Composant visuel uniquement, aucun fetch interne.
 *
 * @example
 * <FavoriteMashups
 *   mashups={[...]}
 *   onPlay={(id) => playSoundtrack(id)}
 *   onRemove={(id) => deleteFromFavorites(id)}
 * />
 */

import React from "react";
import { Play, Trash2, Star } from "lucide-react";
import { Card, CardBody, Button, Badge } from "../ui";
import type { FavoriteMashup } from "../../lib/types/mashup";

interface FavoriteMashupsProps {
  mashups: FavoriteMashup[];
  onPlay?: (mashupId: string) => void;
  onRemove?: (mashupId: string) => void;
}

const FavoriteMashups = React.forwardRef<HTMLDivElement, FavoriteMashupsProps>(
  ({ mashups, onPlay, onRemove }, ref) => {
    if (mashups.length === 0) {
      return (
        <div
          ref={ref}
          className="text-center py-8 text-neutral-500"
        >
          <p className="text-sm">Aucun mashup favori pour le moment.</p>
        </div>
      );
    }

    return (
      <div ref={ref} className="space-y-4">
        {mashups.map((mashup) => (
          <Card key={mashup.id} hover>
            <CardBody className="space-y-3">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-neutral-900">
                    {mashup.trackA.title}
                  </p>
                  <p className="text-xs text-neutral-500">{mashup.trackA.artist}</p>
                </div>
                <Badge variant="info" size="sm">
                  {mashup.trackA.camelotKey || "—"}
                </Badge>
              </div>

              {/* Plus icon / Separator */}
              <div className="flex justify-center">
                <span className="text-neutral-400 text-xs">+</span>
              </div>

              {/* Track B */}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-neutral-900">
                    {mashup.trackB.title}
                  </p>
                  <p className="text-xs text-neutral-500">{mashup.trackB.artist}</p>
                </div>
                <Badge variant="info" size="sm">
                  {mashup.trackB.camelotKey || "—"}
                </Badge>
              </div>

              {/* Info line : Energy, Compatibility */}
              <div className="flex gap-2 flex-wrap pt-2 border-t border-neutral-100">
                {mashup.trackA.energy && (
                  <Badge variant="warning" size="sm">
                    Energy: {mashup.trackA.energy}
                  </Badge>
                )}
                <Badge
                  variant={mashup.compatibilityScore.isCompatible ? "success" : "neutral"}
                  size="sm"
                >
                  {Math.round(mashup.compatibilityScore.score)}% compat
                </Badge>
              </div>

              {/* Rating stars + Actions */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={14}
                      className={`${
                        i < mashup.rating
                          ? "fill-amber-400 text-amber-400"
                          : "text-neutral-300"
                      }`}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Play size={16} />}
                    onClick={() => onPlay?.(mashup.id)}
                    aria-label="Lire le mashup"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 size={16} />}
                    onClick={() => onRemove?.(mashup.id)}
                    aria-label="Supprimer"
                  />
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    );
  }
);

FavoriteMashups.displayName = "FavoriteMashups";

export { FavoriteMashups };
export default FavoriteMashups;
