import Link from 'next/link';

export function Logo({
  size = 'md',
  markOnly = false,
}: {
  size?: 'sm' | 'md' | 'lg';
  /** Just the circle. The wordmark is ink-coloured, so on the dark dashboard
   *  rails all that showed of it was the teal full stop — a green dot floating
   *  beside the mark with nothing to punctuate. */
  markOnly?: boolean;
}) {
  const sizes = {
    sm: { circle: 'w-8 h-8', text: 'text-lg', letter: 'text-xl' },
    md: { circle: 'w-12 h-12', text: 'text-2xl', letter: 'text-2xl' },
    lg: { circle: 'w-16 h-16', text: 'text-3xl', letter: 'text-3xl' },
  };

  const s = sizes[size];

  return (
    <Link href="/" className="inline-flex items-center gap-2">
      <div className={`${s.circle} bg-primary rounded-full flex items-center justify-center`}>
        <span className={`text-white font-heading font-medium ${s.letter}`}>a</span>
      </div>
      {!markOnly && (
        <span className={`font-heading ${s.text} text-dark`}>
          allsoullearn<span className="text-primary">.</span>
        </span>
      )}
    </Link>
  );
}
