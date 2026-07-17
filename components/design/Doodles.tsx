import type { CSSProperties } from 'react';

type DoodleProps = {
  color?: string;
  stroke?: number;
  style?: CSSProperties;
  animate?: boolean;
};

const drawAttr = (animate: boolean) => (animate ? { 'data-draw': '' } : {});

export const Squiggle = ({ color = 'var(--accent)', stroke = 5, style, animate = true }: DoodleProps) => (
  <svg viewBox="0 0 220 18" preserveAspectRatio="none" style={style}>
    <path
      {...drawAttr(animate)}
      d="M2 12 C 22 2, 42 18, 62 8 S 102 2, 122 12 S 162 18, 182 8 S 216 4, 218 10"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      pathLength="1"
    />
  </svg>
);

export const CircleScribble = ({ color = 'var(--teal)', stroke = 4, style, animate = true }: DoodleProps) => (
  <svg viewBox="0 0 220 90" preserveAspectRatio="none" style={style}>
    <path
      {...drawAttr(animate)}
      d="M30 18 C 8 24, 6 60, 40 74 C 90 88, 180 84, 204 60 C 220 42, 200 18, 150 12 C 100 6, 60 8, 30 18 M28 22 C 12 34, 14 58, 50 70 C 110 84, 190 76, 200 56 C 208 38, 180 22, 140 18 C 90 12, 50 14, 28 22"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      pathLength="1"
    />
  </svg>
);

export const Arrow = ({ color = 'var(--ink)', stroke = 3, style, animate = true }: DoodleProps) => (
  <svg viewBox="0 0 100 60" style={style}>
    <path
      {...drawAttr(animate)}
      d="M6 30 Q 30 8 60 32 T 92 28 M82 18 L 94 28 L 84 40"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      pathLength="1"
    />
  </svg>
);

export const Star = ({ color = 'var(--accent)', style }: DoodleProps) => (
  <svg viewBox="0 0 40 40" style={style}>
    <path d="M20 4 L22 18 L36 20 L22 22 L20 36 L18 22 L4 20 L18 18 Z" fill={color} />
  </svg>
);

export const DotCluster = ({
  color = 'currentColor',
  style,
  rows = 4,
  cols = 4,
}: DoodleProps & { rows?: number; cols?: number }) => (
  <svg viewBox={`0 0 ${cols * 8} ${rows * 8}`} style={style}>
    {Array.from({ length: rows }).map((_, r) =>
      Array.from({ length: cols }).map((__, c) => (
        <circle key={`${r}-${c}`} cx={c * 8 + 3} cy={r * 8 + 3} r="1.6" fill={color} />
      ))
    )}
  </svg>
);

export const WaveLine = ({
  color = 'var(--teal)',
  stroke = 3,
  style,
  count = 2,
  animate = true,
}: DoodleProps & { count?: number }) => (
  <svg viewBox="0 0 400 60" preserveAspectRatio="none" style={style}>
    {Array.from({ length: count }).map((_, i) => (
      <path
        key={i}
        {...drawAttr(animate)}
        d={`M2 ${20 + i * 14} Q 50 ${4 + i * 14}, 100 ${20 + i * 14} T 200 ${20 + i * 14} T 300 ${20 + i * 14} T 398 ${20 + i * 14}`}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        pathLength="1"
      />
    ))}
  </svg>
);

export const Cloud = ({ color = 'var(--teal)', stroke = 3, style, animate = true }: DoodleProps) => (
  <svg viewBox="0 0 120 60" style={style}>
    <path
      {...drawAttr(animate)}
      d="M14 44 C 6 44, 4 30, 18 28 C 16 18, 30 12, 40 20 C 44 8, 64 8, 68 22 C 80 18, 92 26, 90 38 C 100 38, 104 50, 92 52 L 16 52 C 8 52, 4 48, 14 44 Z"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinejoin="round"
      strokeLinecap="round"
      pathLength="1"
    />
  </svg>
);

export const Sparkle = ({ color = 'var(--accent)', style, stroke = 2.4, animate = true }: DoodleProps) => (
  <svg viewBox="0 0 30 30" style={style}>
    <path
      {...drawAttr(animate)}
      d="M15 2 L15 12 M15 18 L15 28 M2 15 L12 15 M18 15 L28 15"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      pathLength="1"
    />
  </svg>
);

export const BigBlob = ({ color = 'var(--teal)', style }: DoodleProps) => (
  <svg viewBox="0 0 240 240" style={style}>
    <path
      d="M120 12 C 184 12, 224 56, 224 116 C 224 174, 188 220, 132 226 C 78 232, 26 198, 14 144 C 2 86, 56 12, 120 12 Z"
      fill={color}
    />
  </svg>
);

export const Ribbon = ({ color = 'var(--teal-100)', stroke = 28, style, animate = true }: DoodleProps) => (
  <svg viewBox="0 0 600 300" style={style}>
    <path
      {...drawAttr(animate)}
      d="M40 150 C 80 60, 180 60, 220 150 S 360 240, 400 150 S 540 60, 580 150"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      pathLength="1"
    />
  </svg>
);

export const UnderlineMark = ({ color = 'var(--accent)', stroke = 6, style, animate = true }: DoodleProps) => (
  <svg viewBox="0 0 200 18" preserveAspectRatio="none" style={style}>
    <path
      {...drawAttr(animate)}
      d="M4 10 C 40 4, 80 14, 120 8 S 190 6, 196 12"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      pathLength="1"
    />
  </svg>
);

export const MarkerStroke = ({ color = 'var(--accent)', style, animate = true }: DoodleProps) => (
  <svg viewBox="0 0 220 60" preserveAspectRatio="none" style={style}>
    <path
      {...drawAttr(animate)}
      d="M8 40 C 60 22, 130 22, 212 36"
      fill="none"
      stroke={color}
      strokeWidth="22"
      strokeLinecap="round"
      opacity=".75"
      pathLength="1"
    />
    <path
      {...drawAttr(animate)}
      d="M12 44 C 70 28, 140 28, 208 40"
      fill="none"
      stroke={color}
      strokeWidth="14"
      strokeLinecap="round"
      pathLength="1"
    />
  </svg>
);

export const ZigZag = ({ color = 'var(--teal)', stroke = 3, style, animate = true }: DoodleProps) => (
  <svg viewBox="0 0 200 30" preserveAspectRatio="none" style={style}>
    <path
      {...drawAttr(animate)}
      d="M4 26 L 30 6 L 56 26 L 82 6 L 108 26 L 134 6 L 160 26 L 186 6 L 196 22"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      pathLength="1"
    />
  </svg>
);
