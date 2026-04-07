// @ts-nocheck
'use client';

import { useState } from 'react';
import { Heart } from 'lucide-react';

interface FavoriteButtonProps {
  trackId: number;
  initialFavorite?: boolean;
  onToggle?: (isFavorite: boolean) => void;
  size?: number;
}

export default function FavoriteButton({
  trackId,
  initialFavorite = false,
  onToggle,
  size = 20,
}: FavoriteButtonProps) {
  const [isFavorite, setIsFavorite] = useState(initialFavorite);
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLoading(true);

    try {
      const response = await fetch(`/api/v1/favorites/${trackId}`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to toggle favorite');
      }

      const data = await response.json();
      const newState = data.is_favorite;
      setIsFavorite(newState);
      onToggle?.(newState);
    } catch (error) {
      console.error('Error toggling favorite:', error);
      // Reset state on error
      setIsFavorite(!isFavorite);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={isLoading}
      className={`p-1.5 rounded-lg transition-all duration-200 ${
        isFavorite
          ? 'text-red-500 bg-red-500/10 hover:bg-red-500/20'
          : 'text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10'
      } ${isFavorite && !isLoading ? 'animate-pulse-once' : ''} ${
        isLoading ? 'opacity-60 cursor-not-allowed' : ''
      }`}
      title={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
    >
      <Heart
        size={size}
        fill={isFavorite ? 'currentColor' : 'none'}
        className="transition-all duration-200"
      />
    </button>
  );
}
