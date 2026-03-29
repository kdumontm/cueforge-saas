'use client';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export default function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl transition-colors duration-300 ${className}`}>
      {children}
    </div>
  );
}
