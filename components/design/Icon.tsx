/**
 * The AllSoulLearn line-icon set.
 *
 * Drawn from the `AllSoulLearn Icons` design canvas: a 24px grid, 2px stroke,
 * round caps and joins, so every glyph reads as one family. The path data here
 * is copied from that canvas verbatim — change it there first, not here.
 *
 * These replace the emoji the site used to label dates, times, places and so
 * on. Emoji rendered in whatever font the device happened to ship, which meant
 * a different weight, colour and vertical alignment on every phone, sitting
 * beside type that was carefully chosen. A stroked SVG inherits the text colour
 * and sits on the same baseline everywhere.
 *
 * Two shapes:
 *   <Icon name="date" />        inline, inherits colour through currentColor
 *   <IconBadge name="date" />   the same glyph inside the teal circle used for
 *                               the larger feature marks
 *
 * Decorative by default (`aria-hidden`), because in nearly every use here the
 * icon sits next to the words it illustrates and a screen reader announcing it
 * again is noise. Pass a `title` where the icon carries meaning on its own.
 */
import type { CSSProperties } from 'react';

/** Glyph bodies, in the 24×24 coordinate space the whole set is drawn on. */
const PATHS = {
  /** hourglass — how long something runs */
  duration: (
    <path d="M7 3h10M7 21h10M7 3v3.2c0 1 .4 2 1.2 2.6L12 12l-3.8 3.2c-.8.6-1.2 1.6-1.2 2.6V21M17 3v3.2c0 1-.4 2-1.2 2.6L12 12l3.8 3.2c.8.6 1.2 1.6 1.2 2.6V21" />
  ),
  /** calendar — the dots are filled, so they take their colour from the stroke */
  date: (
    <>
      <rect x="3" y="6" width="18" height="15" rx="3" />
      <path d="M8 3v4M16 3v4" />
      <circle cx="8.5" cy="14.5" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="12" cy="14.5" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="14.5" r="1.15" fill="currentColor" stroke="none" />
    </>
  ),
  location: (
    <>
      <path d="M12 21.5c4.2-4.6 6.3-8 6.3-10.5A6.3 6.3 0 0 0 5.7 11c0 2.5 2.1 5.9 6.3 10.5Z" />
      <circle cx="12" cy="10.7" r="2.4" />
    </>
  ),
  participants: (
    <>
      <circle cx="9.5" cy="8.5" r="3.3" />
      <path d="M3.2 19.4c.5-3.2 3.1-5.2 6.3-5.2s5.8 2 6.3 5.2" />
      <path d="M16.4 5.6a3.3 3.3 0 0 1 0 6.3M18.2 14.6c1.6.7 2.5 2.4 2.6 4.4" />
    </>
  ),
  time: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.4V12l3.2 2.1" />
    </>
  ),
  /** rain — stands in for a no-show, the way the old 🌧️ did */
  weather: (
    <>
      <path d="M7.2 15.2a4 4 0 0 1-.3-8 5.5 5.5 0 0 1 10.4 1.3 3.4 3.4 0 0 1-.5 6.7H7.2Z" />
      <path d="M8.6 18.4l-.9 2.2M12 18.4l-.9 2.2M15.4 18.4l-.9 2.2" />
    </>
  ),
  rating: (
    <path d="M12 3.6l2.6 5.3 5.8.85-4.2 4.1 1 5.8L12 16.9l-5.2 2.75 1-5.8-4.2-4.1 5.8-.85L12 3.6Z" />
  ),
  notes: (
    <>
      <path d="M19.6 6.4l-2-2a1.6 1.6 0 0 0-2.3 0L6 13.7 5 19l5.3-1 9.3-9.3a1.6 1.6 0 0 0 0-2.3Z" />
      <path d="M14.4 5.6l4 4M4.5 21.2h15" />
    </>
  ),
  course: (
    <path d="M4 5.4A2.4 2.4 0 0 1 6.4 3H11v17H6.4A2.4 2.4 0 0 0 4 22.4V5.4ZM20 5.4A2.4 2.4 0 0 0 17.6 3H13v17h4.6A2.4 2.4 0 0 1 20 22.4V5.4Z" />
  ),
  certificate: (
    <>
      <path d="M2.6 8.4 12 4.2l9.4 4.2L12 12.6 2.6 8.4Z" />
      <path d="M6.6 10.2v5.1c0 1.9 2.4 3.3 5.4 3.3s5.4-1.4 5.4-3.3v-5.1M21.4 8.8v5.6" />
    </>
  ),
  live: (
    <>
      <rect x="2.6" y="5.6" width="13" height="12.8" rx="2.6" />
      <path d="M15.6 10.6l5.8-3.2v9.2l-5.8-3.2Z" />
    </>
  ),
  language: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M3.6 12h16.8M12 3.4c2.2 2.4 3.3 5.3 3.3 8.6s-1.1 6.2-3.3 8.6c-2.2-2.4-3.3-5.3-3.3-8.6S9.8 5.8 12 3.4Z" />
    </>
  ),
  included: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M8.2 12.2l2.7 2.7 5-5.3" />
    </>
  ),
  /** bell — announcements, and anything the user is waiting to hear about */
  reminder: (
    <>
      <path d="M4.4 9.6a7.6 7.6 0 0 1 15.2 0c0 4 .9 5.8 1.7 6.7H2.7c.8-.9 1.7-2.7 1.7-6.7Z" />
      <path d="M9.6 19.2a2.6 2.6 0 0 0 4.8 0" />
    </>
  ),
  support: (
    <path d="M3.4 7.4A2.8 2.8 0 0 1 6.2 4.6h11.6a2.8 2.8 0 0 1 2.8 2.8v6.8a2.8 2.8 0 0 1-2.8 2.8H9.6L5 20.4v-3.4h-1.6Z" />
  ),
  materials: <path d="M12 3.6v10.8M7.8 10.4l4.2 4 4.2-4M4.4 19.6h15.2" />,
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.6" />
      <path d="M15.6 15.6l4.4 4.4" />
    </>
  ),
  price: (
    <>
      <path d="M12.4 3.4H19a1.6 1.6 0 0 1 1.6 1.6v6.6L11 21.2a1.6 1.6 0 0 1-2.3 0L3.4 15.9a1.6 1.6 0 0 1 0-2.3Z" />
      <circle cx="16.4" cy="7.6" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  contact: (
    <>
      <path d="M3.4 6.6A2 2 0 0 1 5.4 4.6h13.2a2 2 0 0 1 2 2v10.8a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2Z" />
      <path d="M3.8 7l8.2 6 8.2-6" />
    </>
  ),
  /** wrapped box — a seat bought for somebody else */
  gift: (
    <>
      <path d="M3.4 8.8h17.2v3.4H3.4Z" />
      <path d="M4.9 12.2v6.8a1.8 1.8 0 0 0 1.8 1.8h10.6a1.8 1.8 0 0 0 1.8-1.8v-6.8" />
      <path d="M12 8.8v12" />
      <path d="M12 8.8H8.9a2.1 2.1 0 1 1 0-4.2c2 0 3.1 2.3 3.1 4.2ZM12 8.8h3.1a2.1 2.1 0 1 0 0-4.2c-2 0-3.1 2.3-3.1 4.2Z" />
    </>
  ),
  syllabus: (
    <>
      <path d="M4.6 19.4V6.6a2 2 0 0 1 2-2h7.8l5 5v9.8a2 2 0 0 1-2 2H6.6a2 2 0 0 1-2-2Z" />
      <path d="M14 4.8V10h5.2M8.6 13.4h6.8M8.6 16.6h4.4" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

type IconProps = {
  name: IconName;
  /** Rendered box in px. The set is drawn to hold up from about 16 to 42. */
  size?: number;
  /** Fill the glyph as well as stroke it — a rating star that is "earned". */
  filled?: boolean;
  /** Give the icon an accessible name. Without it the icon is hidden from
   *  screen readers, which is right whenever its label sits next to it. */
  title?: string;
  className?: string;
  style?: CSSProperties;
  /** Nudge off the text baseline. The default lift is what makes an icon look
   *  optically centred beside Thai type rather than sitting low. */
  align?: CSSProperties['verticalAlign'];
};

export function Icon({
  name,
  size = 20,
  filled = false,
  title,
  className,
  style,
  align = '-0.16em',
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      // Width and height are set on the element rather than left to CSS so the
      // glyph keeps its proportions inside a flex row that would squash it.
      style={{ flexShrink: 0, verticalAlign: align, ...style }}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {PATHS[name]}
    </svg>
  );
}

type StarsProps = {
  /** How many stars are earned. Clamped into 0…max. */
  value: number;
  max?: number;
  size?: number;
  /** Draw the unearned stars in a faded colour. Off shows only what was
   *  earned, which suits a compact "your review" chip. */
  showEmpty?: boolean;
  /** The gold the site has always used for ratings. */
  color?: string;
  emptyColor?: string;
  /** Accessible name for the whole row — the individual stars are decorative. */
  title?: string;
  style?: CSSProperties;
};

/**
 * A rating row.
 *
 * Every rating on the site used to be `'★'.repeat(n)`, which put a text glyph
 * where an icon belongs: it took its weight from the running font, and the
 * width of a star differed enough between Thai and Latin fallbacks that rows
 * of them did not line up under each other. Drawing the set's own star fixes
 * the alignment and matches the rest of the icons.
 */
export function Stars({
  value,
  max = 5,
  size = 14,
  showEmpty = true,
  color = '#f5b301',
  emptyColor = 'var(--cream-deep)',
  title,
  style,
}: StarsProps) {
  const earned = Math.max(0, Math.min(max, Math.round(value)));
  const shown = showEmpty ? max : earned;
  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: 1, ...style }}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {Array.from({ length: shown }, (_, i) => (
        <Icon
          key={i}
          name="rating"
          size={size}
          filled={i < earned}
          align="baseline"
          style={{ color: i < earned ? color : emptyColor }}
        />
      ))}
    </span>
  );
}

type BadgeProps = {
  name: IconName;
  /** Diameter of the circle. The glyph is drawn at ~48% of it, the ratio the
   *  design canvas uses at both 88px and 72px. */
  size?: number;
  /** solid: white on teal · soft: teal on a pale tint · outline: teal in a
   *  rounded square. All three are the design's own variants. */
  tone?: 'solid' | 'soft' | 'outline';
  title?: string;
  className?: string;
  style?: CSSProperties;
};

export function IconBadge({ name, size = 72, tone = 'solid', title, className, style }: BadgeProps) {
  const tones: Record<NonNullable<BadgeProps['tone']>, CSSProperties> = {
    solid: { background: 'var(--teal)', color: '#fff', borderRadius: '50%' },
    soft: { background: 'var(--teal-50)', color: 'var(--teal)', borderRadius: '50%' },
    outline: {
      border: '1.5px solid var(--teal-200)',
      color: 'var(--teal)',
      borderRadius: Math.round(size * 0.28),
    },
  };

  return (
    <span
      className={className}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...tones[tone],
        ...style,
      }}
    >
      <Icon name={name} size={Math.round(size * 0.48)} title={title} align="baseline" />
    </span>
  );
}
