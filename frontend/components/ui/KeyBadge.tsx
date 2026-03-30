'use client';
import { getKeyColor } from '@/lib/constants';

interface KeyBadgeProps {
  camelotKey: string;
}

export default function KeyBadge({ camelotKey }: KeyBadgeProps) {
  const color = getKeyColor(camelotKey);
  return (
    <span
      className="inline-flex items-center px-[7px] py-[2px] rounded-[5px] text-[10px] font-bold font-mono tracking-wide"
      style={{
        background: color + '25',
        color: color,
        border: `1px solid ${color}40`,
      }}
    >
      {camelotKey}
    </span>
  );
}
