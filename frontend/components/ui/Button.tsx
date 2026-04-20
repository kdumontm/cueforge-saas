/**
 * Button — Composant bouton principal
 *
 * Variants : primary (action principale), secondary (action secondaire),
 * ghost (minimal), danger (destructif).
 *
 * Sizes : sm (12px), md (16px), lg (18px)
 *
 * Props:
 * - variant?: "primary" | "secondary" | "ghost" | "danger" (defaut: "primary")
 * - size?: "sm" | "md" | "lg" (defaut: "md")
 * - loading?: boolean (affiche spinner, désactive)
 * - icon?: React.ReactNode (icône lucide à gauche)
 * - disabled?: boolean
 * - className?: string (override Tailwind)
 *
 * Étend HTMLButtonElement, accessible (focus ring, aria).
 *
 * @example
 * <Button variant="primary" size="md" onClick={() => alert('click!')}>
 *   Click me
 * </Button>
 *
 * <Button variant="ghost" icon={<Trash2 size={16} />} />
 */

import React from "react";
import { Loader2 } from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantStyles = {
  primary:
    "bg-purple-600 text-white hover:bg-purple-700 active:bg-purple-800 disabled:bg-neutral-200 disabled:text-neutral-400",
  secondary:
    "bg-neutral-100 text-neutral-900 hover:bg-neutral-200 active:bg-neutral-300 disabled:bg-neutral-100 disabled:text-neutral-400",
  ghost:
    "bg-transparent text-neutral-700 hover:bg-neutral-100 active:bg-neutral-200 disabled:text-neutral-400",
  danger:
    "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:bg-neutral-200 disabled:text-neutral-400",
};

const sizeStyles = {
  sm: "px-3 py-1.5 text-xs font-medium h-8 gap-1.5",
  md: "px-4 py-2 text-sm font-medium h-10 gap-2",
  lg: "px-6 py-3 text-base font-medium h-12 gap-2",
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      icon,
      disabled = false,
      className = "",
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`
          inline-flex items-center justify-center
          rounded-lg font-medium
          transition-colors duration-200
          focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2
          disabled:cursor-not-allowed
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${className}
        `}
        aria-busy={loading}
        {...props}
      >
        {loading ? (
          <Loader2 size={size === "sm" ? 14 : size === "md" ? 16 : 18} className="animate-spin" />
        ) : icon ? (
          icon
        ) : null}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button };
export default Button;
