/**
 * Select — Menu déroulant stylé (HTML natif)
 *
 * Props:
 * - label?: string
 * - helperText?: string
 * - error?: boolean | string
 * - disabled?: boolean
 * - options: Array<{ value: string; label: string }>
 * - className?: string
 *
 * forwardRef compatible avec HTMLSelectElement.
 *
 * @example
 * <Select
 *   label="Playlist"
 *   options={[
 *     { value: "all", label: "Toutes les playlists" },
 *     { value: "favorites", label: "Mes favoris" },
 *   ]}
 *   value={selectedPlaylist}
 *   onChange={(e) => setSelectedPlaylist(e.target.value)}
 * />
 */

import React from "react";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  helperText?: string;
  error?: boolean | string;
  options: SelectOption[];
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      helperText,
      error = false,
      disabled = false,
      options,
      className = "",
      id,
      ...props
    },
    ref
  ) => {
    const hasError = error && error !== true;
    const errorMessage = typeof error === "string" ? error : helperText;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={id}
            className="block text-sm font-medium text-neutral-700 mb-2"
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={id}
          disabled={disabled}
          className={`
            w-full px-4 py-2
            border rounded-lg
            text-sm font-normal
            bg-white
            transition-colors duration-200
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-0
            disabled:bg-neutral-50 disabled:text-neutral-400 disabled:border-neutral-200 disabled:cursor-not-allowed
            ${
              error
                ? "border-red-400 focus:ring-red-500"
                : "border-neutral-300 focus:border-neutral-300"
            }
            ${className}
          `}
          aria-invalid={error ? "true" : "false"}
          aria-describedby={errorMessage ? `${id}-hint` : undefined}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {errorMessage && (
          <p
            id={`${id}-hint`}
            className={`mt-1 text-xs ${
              error ? "text-red-600" : "text-neutral-500"
            }`}
          >
            {errorMessage}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = "Select";

export { Select };
export default Select;
