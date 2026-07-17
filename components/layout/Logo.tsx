import Link from 'next/link';

export function Logo({ variant = 'default', size = 'md' }: { variant?: 'default' | 'allsoullearn'; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: { circle: 'w-8 h-8', text: 'text-lg', letter: 'text-xl' },
    md: { circle: 'w-12 h-12', text: 'text-2xl', letter: 'text-2xl' },
    lg: { circle: 'w-16 h-16', text: 'text-3xl', letter: 'text-3xl' },
  };

  const s = sizes[size];

  if (variant === 'allsoullearn') {
    return (
      <Link href="/allsoullearn" className="inline-flex items-center gap-2">
        <div className={`${s.circle} bg-accent rounded-full flex items-center justify-center`}>
          <span className={`text-dark font-heading font-medium ${s.letter}`}>a</span>
        </div>
        <span className={`font-heading ${s.text} text-dark`}>
          allsoullearn<span className="text-accent">.</span>
        </span>
      </Link>
    );
  }

  return (
    <Link href="/" className="inline-flex items-center gap-2">
      <div className={`${s.circle} bg-primary rounded-full flex items-center justify-center`}>
        <span className={`text-white font-heading font-medium ${s.letter}`}>s</span>
      </div>
      <span className={`font-heading ${s.text} text-dark`}>
        soulsilent<span className="text-primary">.</span>
      </span>
    </Link>
  );
}
