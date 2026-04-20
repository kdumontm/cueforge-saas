/**
 * Input — Champ de saisie avec label et helper text
 *
 * Props:
 * - label?: string
 * - helperText?: string
 * - error?: boolean | string (booléen ou message d'erreur)
 * - disabled?: boolean
 * - className?: string
 *
 * forwardRef compatible avec HTMLInputElement.
 *
 * @example
 * <Input
 *   label="Email"
 *   type="email"
 *   placeholder="you@example.com"
 *   helperText="Votre adresse email professionnelle"
 * />
 */

import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: boolean | string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helperText,
      error = false,
      disabled = false,
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
        <input
          ref={ref}
          id={id}
          disabled={disabled}
          className={`
            w-full px-4 py-2
            border rounded-lg
            text-sm font-normal
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
        />
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

Input.displayName = "Input";

export { Input };
export default Input;
