/**
 * Badge — Étiquette visuelle compacte
 *
 * Variants : neutral (gris), success (vert), warning (orange),
 * danger (rouge), info (bleu).
 *
 * Sizes : sm (12px), md (14px)
 *
 * Props:
 * - variant?: "neutral" | "success" | "warning" | "danger" | "info" (defaut: "neutral")
 * - size?: "sm" | "md" (defaut: "sm")
 * - className?: string
 *
 * Usage : afficher clé Camelot, énergie, statut track.
 *
 * @example
 * <Badge variant="success">Matché</Badge>
 * <Badge variant="info" size="md">9A</Badge>
 */

import React from "react";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "neutral" | "success" | "warning" | "danger" | "info";
  size?: "sm" | "md";
}

const variantStyles = {
  neutral: "bg-neutral-100 text-neutral-700",
  success: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-red-100 text-red-700",
  info: "bg-blue-100 text-blue-700",
};

const sizeStyles = {
  sm: "px-2 py-1 text-xs font-medium rounded-md",
  md: "px-3 py-1.5 text-sm font-medium rounded-lg",
};

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  (
    { variant = "neutral", size = "sm", className = "", children, ...props },
    ref
  ) => {
    return (
      <span
        ref={ref}
        className={`
          inline-flex items-center
          whitespace-nowrap
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${className}
        `}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = "Badge";

export { Badge };
export default Badge;
