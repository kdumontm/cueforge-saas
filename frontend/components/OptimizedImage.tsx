'use client';

import Image from 'next/image';
import { useState } from 'react';

interface OptimizedImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  fill?: boolean;
  priority?: boolean;
}

/**
 * Wrapper autour de next/image qui gère les domaines inconnus.
 * Si le domaine n'est pas dans remotePatterns, fallback sur <img> natif.
 */
export default function OptimizedImage({
  src,
  alt,
  width,
  height,
  className,
  fill = false,
  priority = false,
}: OptimizedImageProps) {
  const [hasError, setHasError] = useState(false);

  // Pour les URLs qui pourraient ne pas être dans remotePatterns,
  // on tente next/image et fallback sur <img> en cas d'erreur
  if (hasError || !src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className={className}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={fill ? undefined : (width || 48)}
      height={fill ? undefined : (height || 48)}
      fill={fill}
      className={className}
      loading={priority ? 'eager' : 'lazy'}
      priority={priority}
      onError={() => setHasError(true)}
      unoptimized={false}
    />
  );
}
