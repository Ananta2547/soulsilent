/**
 * AllSoulLearn page loader — the wordmark logo (triangle "A" + "llSoulLearn"),
 * whose dot-eye blinks and glances around, above a sliding progress bar and a
 * pulsing "กำลังโหลด" label. Imported from the Design Composer loading screen.
 * Motion is disabled under prefers-reduced-motion (see globals.css).
 *
 * Variants:
 *  - default / `inline` → sits inside a page container (min-height 16rem).
 *  - `full`             → fixed full-screen overlay (used by route loading.tsx).
 */
export function PageLoader({
  variant = 'inline',
  label = 'กำลังโหลด',
  progress,
}: {
  variant?: 'inline' | 'full';
  label?: string;
  /** 0–1 share of the page's requests that have come back. Given a number the
   *  bar fills to it instead of sliding; left out (route fallbacks, which have
   *  nothing to count) it keeps the indeterminate slide. */
  progress?: number;
}) {
  // A bar at literally 0% reads as broken, so the first sliver is drawn as soon
  // as there is anything to wait for.
  const pct = progress == null ? null : Math.round(Math.min(1, Math.max(0.06, progress)) * 100);
  return (
    <div
      className={`asl-loader ${variant === 'full' ? 'asl-loader--full' : 'asl-loader--inline'}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <svg className="asl-logo" viewBox="0 40 636 90" role="img" aria-label="AllSoulLearn">
        <path
          d="M31,50 L43.7,50 L70.9,120 L3,120 Z M36.95,69.8 L47.1,91.4 L24.9,104.2 Z"
          fill="#0B0B0B"
          fillRule="evenodd"
        />
        <text x="73.7" y="120" style={{ fontFamily: "'Poppins', 'Mitr', sans-serif", fontSize: 100 }}>
          <tspan style={{ fontWeight: 700 }} fill="#0B0B0B">ll</tspan>
          <tspan style={{ fontWeight: 700 }} fill="#0C8577">Soul</tspan>
          <tspan style={{ fontWeight: 500 }} fill="#0B0B0B">Learn</tspan>
        </text>
        <g className="asl-eye-blink">
          <g className="asl-eye-look">
            <circle cx="226" cy="92.6" r="8.6" fill="#0B0B0B" />
          </g>
        </g>
      </svg>

      <div className="asl-foot">
        <div
          className="asl-bar-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          {...(pct == null ? {} : { 'aria-valuenow': pct })}
        >
          <div
            className={pct == null ? 'asl-bar' : 'asl-bar asl-bar--measured'}
            style={pct == null ? undefined : { width: `${pct}%` }}
          />
        </div>
        <div className="asl-label">{label}</div>
      </div>
    </div>
  );
}

export default PageLoader;
