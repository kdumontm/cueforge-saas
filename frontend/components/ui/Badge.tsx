'use client';

interface BadgeProps {
  children: React.ReactNode;
  color?: string;
  className?: string;
}

export default function Badge({ children, color = '#2563eb', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold font-mono tracking-wide ${className}`}
      style={{
        background: `${color}20`,
        color,
        border: `1px solid ${color}30`,
      }}
    >
      {children}
    </span>
  );
}
