/**
 * Switch — Bascule/toggle accessible
 *
 * Props:
 * - checked?: boolean
 * - disabled?: boolean
 * - onChange?: (checked: boolean) => void
 * - label?: string
 * - className?: string
 *
 * Role "switch", aria-checked pour accessibilité.
 *
 * @example
 * <Switch
 *   label="Afficher les résultats"
 *   checked={isVisible}
 *   onChange={setIsVisible}
 * />
 */

import React from "react";

interface SwitchProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  checked?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
}

const Switch = React.forwardRef<HTMLDivElement, SwitchProps>(
  (
    {
      checked = false,
      disabled = false,
      onChange,
      label,
      className = "",
      ...props
    },
    ref
  ) => {
    const handleClick = () => {
      if (!disabled && onChange) {
        onChange(!checked);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === " ") {
        e.preventDefault();
        handleClick();
      }
    };

    return (
      <div
        ref={ref}
        className={`flex items-center gap-3 ${className}`}
        {...props}
      >
        <div
          role="switch"
          aria-checked={checked}
          aria-disabled={disabled}
          tabIndex={disabled ? -1 : 0}
          className={`
            relative h-6 w-11
            rounded-full transition-colors duration-200
            cursor-pointer
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2
            ${checked ? "bg-purple-600" : "bg-neutral-300"}
            ${disabled ? "cursor-not-allowed opacity-50" : ""}
          `}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
        >
          <div
            className={`
              absolute top-1 h-4 w-4
              bg-white rounded-full
              transition-transform duration-200
              ${checked ? "translate-x-5" : "translate-x-1"}
            `}
          />
        </div>
        {label && (
          <label
            className={`text-sm font-medium ${
              disabled ? "text-neutral-400 cursor-not-allowed" : "text-neutral-700"
            }`}
          >
            {label}
          </label>
        )}
      </div>
    );
  }
);

Switch.displayName = "Switch";

export { Switch };
export default Switch;
