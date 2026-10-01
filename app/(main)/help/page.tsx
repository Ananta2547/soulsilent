'use client';

/* Help center (ศูนย์ช่วยเหลือ) — ported from the Help.html design handoff:
 * dark hero search, two-column FAQ accordions + a sticky contact card. */
import { useState } from 'react';
import { useLang, T, tr, pick, type Lang } from '@/lib/i18n';
import { Reveal } from '@/components/design/Reveal';
import { Btn } from '@/components/design/RippleButton';

type L = { th: string; en: string };

const HELP_FAQ: { cat: L; items: { q: L; a: L }[] }[] = [
  {
    cat: { th: 'บัญชี & การเข้าสู่ระบบ', en: 'Account & login' },
    items: [
      {
        q: { th: 'ลืมรหัสผ่านต้องทำอย่างไร?', en: 'I forgot my password — what do I do?' },
        a: {
          th: 'กดที่ “ลืมรหัสผ่าน” ในหน้าเข้าสู่ระบบ เราจะส่งลิงก์รีเซ็ตไปยังอีเมลที่ลงทะเบียนไว้ภายในไม่กี่นาที',
          en: 'Tap “Forgot password” on the sign-in screen and we’ll email a reset link to your registered address within a few minutes.',
        },
      },
      {
        q: { th: 'เปลี่ยนอีเมลของบัญชีได้ไหม?', en: 'Can I change my account email?' },
        a: {
          th: 'ระบบไม่สามารถแก้ไขอีเมลด้วยตนเองได้ หากคุณต้องการเปลี่ยนอีเมลจริงๆ กรุณาติดต่อศูนย์ช่วยเหลือ',
          en: 'Email cannot be changed by yourself. If you really need to change it, please contact the help center.',
        },
      },
    ],
  },
  {
    cat: { th: 'การชำระเงิน คืนเงิน & ยกเลิก', en: 'Payment, refunds & cancellations' },
    items: [
      {
        q: { th: 'จ่ายเงินช่องทางไหนได้บ้าง?', en: 'What payment methods do you accept?' },
        a: {
          th: 'พร้อมเพย์, โอนผ่านธนาคาร และบัตรเครดิต/เดบิต สถานะ “รอชำระเงิน” จะถือที่นั่งไว้ 24 ชั่วโมง',
          en: 'PromptPay, bank transfer and credit/debit cards. A “Pending payment” booking holds your seat for 24 hours.',
        },
      },
    ],
  },
  {
    cat: { th: 'แนวทางการเข้าร่วมกิจกรรม', en: 'Journey attendance' },
    items: [
      {
        q: { th: 'ต้องไปถึงก่อนเวลาเท่าไร?', en: 'How early should I arrive?' },
        a: {
          th: 'แนะนำให้ถึงก่อนเวลาเริ่ม 15 นาทีเพื่อเช็คอินและตั้งตัว รายละเอียดสถานที่อยู่ในอีเมลยืนยัน',
          en: 'Arrive about 15 minutes early to check in and settle. Venue details are in your confirmation email.',
        },
      },
      {
        q: { th: 'ถ้าไปสายจะเข้าร่วมได้ไหม?', en: 'Can I still join if I’m late?' },
        a: {
          th: 'เข้าร่วมได้ แต่บาง session ที่เป็น meditation หรือ silent อาจปิดประตูชั่วคราวเพื่อไม่รบกวนผู้อื่น',
          en: 'You can, though some silent or meditation sessions briefly close the door so as not to disturb others.',
        },
      },
    ],
  },
];

function Icon({ name, size = 18 }: { name: 'search' | 'mail' | 'phone' | 'calendar' | 'chevron'; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    search: (<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>),
    mail: (<><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" /></>),
    phone: <path d="M5 4h3l1.5 5-2 1.5a12 12 0 0 0 6 6l1.5-2 5 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />,
    calendar: (<><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 9.5H21" /><path d="M8 3v3.5M16 3v3.5" /></>),
    chevron: <path d="m6 9 6 6 6-6" />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

function Accordion({ q, a, lang }: { q: L; a: L; lang: Lang }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`acc ${open ? 'open' : ''}`}>
      <button className="acc-q" onClick={() => setOpen((v) => !v)} aria-expanded={open} type="button">
        {pick(q, lang)}
        <span style={{ color: 'var(--muted)', flexShrink: 0, transition: 'transform .25s', transform: open ? 'rotate(180deg)' : 'none', display: 'inline-flex' }}>
          <Icon name="chevron" size={18} />
        </span>
      </button>
      <div className="acc-a">
        <p>{pick(a, lang)}</p>
      </div>
    </div>
  );
}

export default function HelpPage() {
  const { lang } = useLang();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const filtered = HELP_FAQ.map((g) => ({
    ...g,
    items: g.items.filter((it) => !q || pick(it.q, lang).toLowerCase().includes(q) || pick(it.a, lang).toLowerCase().includes(q)),
  })).filter((g) => g.items.length);

  const contacts: { icon: 'mail' | 'phone' | 'calendar'; l: string; v: string }[] = [
    { icon: 'mail', l: tr(lang, 'อีเมล', 'Email'), v: 'allsoullearn@gmail.com' },
    { icon: 'phone', l: tr(lang, 'โทร', 'Phone'), v: '0933984488' },
    { icon: 'calendar', l: tr(lang, 'เวลาทำการ', 'Support hours'), v: tr(lang, 'จ–ศ 09.00–17.00', 'Mon–Fri 9–5') },
  ];

  return (
    <section className="section">
      <div className="container">
        {/* Hero search */}
        <Reveal
          className="card"
          style={{ background: 'var(--ink)', color: '#fff', padding: '48px 32px', textAlign: 'center', marginBottom: 30, boxShadow: 'none' }}
        >
          <span className="eyebrow" style={{ color: 'var(--accent)', justifyContent: 'center' }}>
            <T th="ศูนย์ช่วยเหลือ" en="Help center" />
          </span>
          <h1 className="display-th" style={{ fontSize: 'clamp(28px,4vw,42px)', margin: '14px 0 22px', color: '#fff' }}>
            <T th="วันนี้เราช่วยอะไรคุณได้บ้าง?" en="How can we help you today?" />
          </h1>
          <div style={{ maxWidth: 560, margin: '0 auto', position: 'relative' }}>
            <span style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', display: 'inline-flex' }}>
              <Icon name="search" size={20} />
            </span>
            <input
              className="field"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr(lang, 'ค้นหาคำถามที่พบบ่อย…', 'Search the help center…')}
              style={{ padding: '16px 18px 16px 50px', fontSize: 16, background: '#fff' }}
            />
          </div>
        </Reveal>

        {/* FAQ + contact */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_0.9fr] gap-7 items-start">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
            {filtered.length === 0 && (
              <div className="card card-static">
                <p style={{ margin: 0, color: 'var(--muted)' }}>
                  <T th="ไม่พบคำถามที่ตรงกับการค้นหา" en="No questions match your search." />
                </p>
              </div>
            )}
            {filtered.map((g, i) => (
              <Reveal key={i} className="card card-static" delay={i * 60}>
                <h2 className="display-th" style={{ margin: '0 0 6px', fontSize: 20 }}>
                  {pick(g.cat, lang)}
                </h2>
                <div>
                  {g.items.map((it, j) => (
                    <Accordion key={j} q={it.q} a={it.a} lang={lang} />
                  ))}
                </div>
              </Reveal>
            ))}
          </div>

          {/* Contact / escalation */}
          <div className="card card-static" style={{ background: 'var(--cream)', position: 'sticky', top: 88 }}>
            <h3 className="display-th" style={{ margin: '0 0 6px', fontSize: 20 }}>
              <T th="ยังต้องการความช่วยเหลือ?" en="Still need a hand?" />
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.6 }}>
              <T th="ทีมงานพร้อมช่วยคุณทุกวัน" en="Our team is here for you, every day." />
            </p>
            {contacts.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i ? '1px solid var(--cream-deep)' : '0' }}>
                <span className="sess-ico" style={{ background: 'var(--paper)' }}>
                  <Icon name={c.icon} size={18} />
                </span>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'JetBrains Mono,IBM Plex Sans Thai, monospace', letterSpacing: '.06em', textTransform: 'uppercase' }}>{c.l}</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{c.v}</div>
                </div>
              </div>
            ))}
            <Btn kind="ink" href="mailto:allsoullearn@gmail.com" style={{ width: '100%', justifyContent: 'center', marginTop: 18 }}>
              {tr(lang, 'เปิดเรื่องใหม่ (Ticket)', 'Open a support ticket')}
            </Btn>
          </div>
        </div>
      </div>
    </section>
  );
}
