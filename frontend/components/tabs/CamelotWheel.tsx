'use client';

import { CAMELOT_WHEEL, getCompatibleKeys } from '@/lib/constants';

interface CamelotWheelProps {
  selectedKey?: string;
  highlightCompatible?: boolean;
  onKeyClick?: (key: string) => void;
}

export function CamelotWheel({
  selectedKey,
  highlightCompatible = true,
  onKeyClick,
}: CamelotWheelProps) {
  const compatibleKeys = selectedKey ? getCompatibleKeys(selectedKey) : [];
  const radius = 150;
  const innerRadius = 100;
  const size = 320;

  const getCoordinates = (index: number, isInner: boolean) => {
    const angle = (index * 360) / 12 - 90;
    const rad = (angle * Math.PI) / 180;
    const r = isInner ? innerRadius : radius;
    const x = size / 2 + r * Math.cos(rad);
    const y = size / 2 + r * Math.sin(rad);
    return { x, y };
  };

  const outerKeys = CAMELOT_WHEEL.filter((_, i) => i % 2 === 1);
  const innerKeys = CAMELOT_WHEEL.filter((_, i) => i % 2 === 0);

  return (
    <div className="flex justify-center p-4">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="max-w-full h-auto"
      >
        {/* Background circles */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border-default)"
          strokeWidth="1"
          opacity="0.3"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={innerRadius}
          fill="none"
          stroke="var(--border-default)"
          strokeWidth="1"
          opacity="0.3"
        />

        {/* Radial lines */}
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i * 360) / 12 - 90;
          const rad = (angle * Math.PI) / 180;
          const x1 = size / 2 + innerRadius * Math.cos(rad);
          const y1 = size / 2 + innerRadius * Math.sin(rad);
          const x2 = size / 2 + radius * Math.cos(rad);
          const y2 = size / 2 + radius * Math.sin(rad);
          return (
            <line
              key={`line-${i}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--border-default)"
              strokeWidth="1"
              opacity="0.2"
            />
          );
        })}

        {/* Outer Keys (B keys - Major) */}
        {outerKeys.map((key, i) => {
          const coords = getCoordinates(i * 2 + 1, false);
          const isSelected = selectedKey === key.n;
          const isCompatible = compatibleKeys.includes(key.n);

          return (
            <g key={`outer-${key.n}`}>
              <circle
                cx={coords.x}
                cy={coords.y}
                r="22"
                fill={isSelected ? key.color : isCompatible && highlightCompatible ? key.color + '80' : key.color + '40'}
                stroke={isSelected ? 'white' : 'var(--border-default)'}
                strokeWidth={isSelected ? '2' : '1'}
                opacity={isSelected ? 1 : isCompatible && highlightCompatible ? 0.7 : 0.4}
                style={{ cursor: onKeyClick ? 'pointer' : 'default' }}
                onClick={() => onKeyClick?.(key.n)}
              />
              <text
                x={coords.x}
                y={coords.y}
                textAnchor="middle"
                dy="0.3em"
                className="text-[14px] font-bold"
                fill={isSelected || (isCompatible && highlightCompatible) ? 'white' : 'gray'}
                pointerEvents="none"
              >
                {key.n}
              </text>
            </g>
          );
        })}

        {/* Inner Keys (A keys - Minor) */}
        {innerKeys.map((key, i) => {
          const coords = getCoordinates(i * 2, true);
          const isSelected = selectedKey === key.n;
          const isCompatible = compatibleKeys.includes(key.n);

          return (
            <g key={`inner-${key.n}`}>
              <circle
                cx={coords.x}
                cy={coords.y}
                r="20"
                fill={isSelected ? key.color : isCompatible && highlightCompatible ? key.color + '80' : key.color + '40'}
                stroke={isSelected ? 'white' : 'var(--border-default)'}
                strokeWidth={isSelected ? '2' : '1'}
                opacity={isSelected ? 1 : isCompatible && highlightCompatible ? 0.7 : 0.4}
                style={{ cursor: onKeyClick ? 'pointer' : 'default' }}
                onClick={() => onKeyClick?.(key.n)}
              />
              <text
                x={coords.x}
                y={coords.y}
                textAnchor="middle"
                dy="0.3em"
                className="text-[12px] font-bold"
                fill={isSelected || (isCompatible && highlightCompatible) ? 'white' : 'gray'}
                pointerEvents="none"
              >
                {key.n}
              </text>
            </g>
          );
        })}

        {/* Labels */}
        <text
          x={size / 2}
          y="20"
          textAnchor="middle"
          className="text-[12px]"
          fill="var(--text-muted)"
        >
          Camelot Wheel
        </text>
      </svg>
    </div>
  );
}
