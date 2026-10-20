import Link from 'next/link';
import { POLICY_UPDATED } from '@/lib/policy';
import './legal.css';

export type LegalSection = { id: string; title: string; body: React.ReactNode };

/** Shared layout of /terms and /privacy: a title, the effective date, a
 *  contents list and numbered sections, on the site's cream page. */
export function LegalDoc({
  eyebrow,
  title,
  intro,
  sections,
  other,
}: {
  eyebrow: string;
  title: string;
  intro: React.ReactNode;
  sections: LegalSection[];
  /** Link to the sibling document. */
  other: { href: string; label: string };
}) {
  return (
    <div className="legal-page">
      <div className="container legal-wrap">
        <div className="mono legal-eyebrow">{eyebrow}</div>
        <h1 className="display-th legal-title">{title}</h1>
        <p className="legal-updated">มีผลตั้งแต่วันที่ {POLICY_UPDATED}</p>
        <div className="legal-intro">{intro}</div>

        <nav className="legal-toc" aria-label="สารบัญ">
          <div className="legal-toc-h">สารบัญ</div>
          <ol>
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.title}</a>
              </li>
            ))}
          </ol>
        </nav>

        {sections.map((s, i) => (
          <section key={s.id} id={s.id} className="legal-sec">
            <h2>
              <span>{i + 1}.</span> {s.title}
            </h2>
            {s.body}
          </section>
        ))}

        <p className="legal-other">
          อ่านเพิ่มเติม: <Link href={other.href}>{other.label}</Link>
        </p>
      </div>
    </div>
  );
}
