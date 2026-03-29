'use client';

import { type LucideIcon } from 'lucide-react';

type Variant = 'primary' | 'danger' | 'success' | 'default' | 'ghost';

interface ButtonProps {
  children?: React.ReactNode;
  variant?: Variant;
  icon?: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
  small?: boolean;
  className?: string;
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-blue-600 hover:bg-blue-700 text-white border-transparent',
  danger: 'bg-red-500/15 hover:bg-red-500/25 text-red-400 border-red-500/20',
  success: 'bg-green-500/15 hover:bg-green-500/25 text-green-400 border-green-500/20',
  default: 'bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border-[var(--border-subtle)]',
  ghost: 'bg-transparent hover:bg-[var(--bg-hover)] text-[var(--text-muted)] border-transparent',
};

export default function Button({
  children,
  variant = 'default',
  icon: Icon,
  onClick,
  disabled,
  small,
  className = '',
}: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-md font-medium cursor-pointer border transition-colors
        ${small ? 'px-2 py-[3px] text-[11px]' : 'px-3 py-1.5 text-xs'}
        ${variantClasses[variant]}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${className}
      `}
    >
      {Icon && <Icon size={small ? 11 : 13} />}
      {children}
    </button>
  );
}
