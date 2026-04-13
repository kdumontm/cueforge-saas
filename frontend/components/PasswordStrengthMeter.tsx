'use client';

import { useMemo } from 'react';

interface PasswordStrengthMeterProps {
  password: string;
}

export default function PasswordStrengthMeter({
  password,
}: PasswordStrengthMeterProps) {
  const strength = useMemo(() => {
    let score = 0;

    // Check length >= 8
    if (password.length >= 8) score += 1;

    // Check for uppercase and lowercase
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;

    // Check for digit
    if (/\d/.test(password)) score += 1;

    // Check for special character
    if (/[!@#$%^&*()_\-+=\[\]{};:'",.<>?/\\|`~]/.test(password))
      score += 1;

    return score;
  }, [password]);

  const labels = ['Très faible', 'Faible', 'Moyen', 'Fort', 'Très fort'];
  const colors = [
    'bg-red-500',
    'bg-orange-500',
    'bg-yellow-500',
    'bg-green-500',
    'bg-green-600',
  ];
  const borderColors = [
    'border-red-500/30',
    'border-orange-500/30',
    'border-yellow-500/30',
    'border-green-500/30',
    'border-green-600/30',
  ];
  const textColors = [
    'text-red-400',
    'text-orange-400',
    'text-yellow-400',
    'text-green-400',
    'text-green-500',
  ];

  if (password.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {/* Progress bar */}
      <div className="flex gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={`
              flex-1 h-2 rounded-full transition-all
              ${i < strength ? colors[strength - 1] : 'bg-slate-700'}
            `}
          />
        ))}
      </div>

      {/* Label and help text */}
      <div
        className={`
          px-3 py-2 rounded-lg text-sm
          border ${borderColors[strength]}
          bg-slate-900/50 ${textColors[strength]}
        `}
        aria-label={`Force du mot de passe: ${labels[strength]}`}
        role="status"
      >
        <div className="font-medium">{labels[strength]}</div>
        <div className="text-xs opacity-80 mt-1">
          {strength === 0 && "Ajoutez au moins 8 caractères, des majuscules et des minuscules"}
          {strength === 1 && "Ajoutez une majuscule, une minuscule et un chiffre"}
          {strength === 2 && "Ajoutez un chiffre et un caractère spécial"}
          {strength === 3 && "Ajoutez un caractère spécial pour renforcer"}
          {strength === 4 && "Très bon mot de passe !"}
        </div>
      </div>
    </div>
  );
}
