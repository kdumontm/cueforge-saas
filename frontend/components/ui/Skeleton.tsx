'use client';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  className?: string;
  variant?: 'text' | 'circle' | 'rect';
}

export default function Skeleton({
  width,
  height,
  className = '',
  variant = 'rect',
}: SkeletonProps) {
  const baseStyle = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };

  const variantClasses = {
    text: 'h-4 rounded',
    circle: 'rounded-full',
    rect: 'rounded-lg',
  };

  return (
    <div
      className={`
        bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800
        animate-pulse
        ${variantClasses[variant]}
        ${className}
      `}
      style={baseStyle}
      aria-busy="true"
      aria-label="Chargement..."
    />
  );
}
