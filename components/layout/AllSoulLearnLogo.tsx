/**
 * AllSoulLearn wordmark — triangle "A" mark + "llSoulLearn" (Poppins) with the
 * dot inside the "o". Imported from the Design Composer logo asset. Inline SVG
 * so it stays crisp at any size; Poppins is loaded globally in app/layout.tsx.
 * `variant="light"` is the on-dark version (white + brighter teal).
 */
export function AllSoulLearnLogo({
  height = 26,
  variant = 'default',
  title = 'AllSoulLearn',
}: {
  height?: number;
  variant?: 'default' | 'light';
  title?: string;
}) {
  const ink = variant === 'light' ? '#FFFFFF' : '#0B0B0B';
  const teal = variant === 'light' ? '#16A99A' : '#0C8577';
  return (
    <svg
      viewBox="0 47 636 76"
      style={{ height, width: 'auto', display: 'block' }}
      role="img"
      aria-label={title}
    >
      <path
        d="M31,50 L43.7,50 L70.9,120 L3,120 Z M36.95,69.8 L47.1,91.4 L24.9,104.2 Z"
        fill={ink}
        fillRule="evenodd"
        strokeLinejoin="round"
      />
      <text x="73.7" y="120" style={{ fontFamily: "'Poppins', sans-serif", fontSize: 100 }}>
        <tspan style={{ fontWeight: 700 }} fill={ink}>ll</tspan>
        <tspan style={{ fontWeight: 700 }} fill={teal}>Soul</tspan>
        <tspan style={{ fontWeight: 500 }} fill={ink}>Learn</tspan>
      </text>
      <circle cx="226" cy="92.6" r="8.6" fill={ink} />
    </svg>
  );
}

export default AllSoulLearnLogo;
