/**
 * Branded page loader — a calm breathing teal orb ("s") wrapped in expanding
 * sound-wave rings, with the wordmark pulsing softly below. Fits the
 * "soul silent" theme. Motion is disabled under prefers-reduced-motion.
 *
 * Variants:
 *  - default / `inline`  → sits inside a page container (min-height 16rem).
 *  - `full`              → fixed full-screen overlay (used by route loading.tsx).
 */
export function PageLoader({
  variant = 'inline',
  label = 'กำลังโหลด',
}: {
  variant?: 'inline' | 'full';
  label?: string;
}) {
  return (
    <div
      className={`ss-loader ${variant === 'full' ? 'ss-loader--full' : 'ss-loader--inline'}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="ss-orb-wrap">
        <span className="ss-ring" />
        <span className="ss-ring" />
        <span className="ss-ring" />
        <span className="ss-orb">s</span>
      </div>
      <div className="ss-loader-word">
        soulsilent<b>.</b>
      </div>
    </div>
  );
}

export default PageLoader;
