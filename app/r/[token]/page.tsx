import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { getDB, getEnv } from '@/lib/db';
import { PrintButton } from '../../voucher/[token]/PrintButton';
import './report.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Organizer Impact Summary', robots: { index: false, follow: false } };

type Row = {
  id: string;
  period_from: string;
  period_to: string;
  activity_title: string | null;
  figures_json: string;
  intro: string | null;
  created_at: string;
  expires_at: string;
  revoked: number;
  live: number;
};

const MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const thDate = (d: string) => `${Number(d.slice(8, 10))} ${MONTH[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(0, 4)) + 543}`;
const n = (v: number) => v.toLocaleString('th-TH', { maximumFractionDigits: 1 });

/** One line per figure: label, value, and a short note. */
const FIGURE: Record<string, (v: never) => { label: string; value: string; note?: string }> = {
  views: (v: number) => ({ label: 'ยอดเข้าชมหน้ากิจกรรม', value: n(v), note: 'ผู้เข้าชมไม่ซ้ำต่อวัน' }),
  participants: (v: number) => ({ label: 'ผู้เข้าร่วมทั้งหมด', value: `${n(v)} คน`, note: 'นับคนที่มาจริง (เช็คอิน)' }),
  repeat90: (v: number) => ({ label: 'กลับมาซ้ำใน 90 วัน', value: `${n(v)}%` }),
  fill: (v: number) => ({ label: 'อัตราเต็มรอบเฉลี่ย', value: `${n(v)}%` }),
  soldOutDaysBefore: (v: number) => ({ label: 'เต็มก่อนวันจัดเฉลี่ย', value: `${n(v)} วัน`, note: 'ค่ากลางของรอบที่เต็ม' }),
  csat: (v: number) => ({ label: 'ความพอใจ (แบบสอบถามหลังกิจกรรม)', value: `${n(v)} / 5` }),
  responseRate: (v: number) => ({ label: 'อัตราตอบแบบสอบถาม', value: `${n(v)}%` }),
  rounds: (v: number) => ({ label: 'จำนวนรอบที่จัด', value: `${n(v)} รอบ` }),
  ageBand: (v: { label: string; share: number }) => ({ label: 'กลุ่มผู้เข้าร่วมหลัก', value: `อายุ ${v.label} ปี`, note: `${n(v.share)}% ของผู้เข้าร่วม` }),
};

/**
 * Organizer Impact Summary — the one-page report a host hands to a sponsor,
 * brand or company. Every number was taken from the system when the host made
 * it; this page is also where the printed copy's QR leads, so anyone can check
 * the copy they were given against the original. Totals only.
 */
export default async function ReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{16}$/.test(token)) notFound();
  const db = await getDB();
  const r = await db
    .prepare(
      `SELECT id, period_from, period_to, activity_title, figures_json, intro, created_at, expires_at, revoked,
              CASE WHEN revoked = 0 AND datetime(expires_at) > datetime('now') THEN 1 ELSE 0 END AS live
         FROM host_reports WHERE id = ?`,
    )
    .bind(token)
    .first<Row>();
  if (!r) notFound();

  if (!r.live) {
    return (
      <main className="rp-page">
        <div className="rp-sheet rp-dead">
          <h1>รายงานนี้{r.revoked ? 'ถูกผู้จัดยกเลิกแล้ว' : 'หมดอายุแล้ว'}</h1>
          <p>ตัวเลขในฉบับที่คุณได้รับไม่สามารถยืนยันกับ AllSoulLearn ได้อีก โปรดขอรายงานฉบับใหม่จากผู้จัด</p>
        </div>
      </main>
    );
  }

  const figures = JSON.parse(r.figures_json) as Record<string, unknown> & { _host?: { name: string; avatar: string | null } };
  const env = await getEnv();
  const url = `${(env.SITE_URL || 'https://allsoullearn.com').replace(/\/$/, '')}/r/${r.id}`;
  const qr = await QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
  const items = Object.entries(figures)
    .filter(([k]) => k !== '_host' && FIGURE[k])
    .map(([k, v]) => ({ key: k, ...FIGURE[k](v as never) }));

  return (
    <main className="rp-page">
      <div className="rp-tools">
        <PrintButton />
      </div>
      <article className="rp-sheet">
        <header className="rp-head">
          <div>
            <div className="rp-eyebrow">Organizer Impact Summary</div>
            <h1>{figures._host?.name || 'ผู้จัด'}</h1>
            <div className="rp-sub">
              {r.activity_title ? `${r.activity_title} · ` : ''}
              {thDate(r.period_from)} – {thDate(r.period_to)}
            </div>
          </div>
          <div className="rp-verified">ยืนยันโดย AllSoulLearn ✓</div>
        </header>
        {r.intro && <p className="rp-intro">{r.intro}</p>}

        <div className="rp-grid">
          {items.map((it) => (
            <div key={it.key} className="rp-fig">
              <div className="rp-label">{it.label}</div>
              <div className="rp-value">{it.value}</div>
              {it.note && <div className="rp-note">{it.note}</div>}
            </div>
          ))}
        </div>

        <footer className="rp-foot">
          <div className="rp-qr" dangerouslySetInnerHTML={{ __html: qr }} />
          <div className="rp-check">
            <b>ตรวจสอบรายงาน</b>
            <span>สแกนเพื่อดูฉบับจริงบน AllSoulLearn</span>
            <span className="rp-mono">{url.replace(/^https?:\/\//, '')}</span>
            <span>
              สร้างเมื่อ {thDate(r.created_at.slice(0, 10))} · ใช้ได้ถึง {thDate(r.expires_at.slice(0, 10))}
            </span>
            <span>ตัวเลขดึงจากระบบโดยตรง แก้ไขไม่ได้ · เป็นตัวเลขรวม ไม่มีข้อมูลรายบุคคล</span>
          </div>
        </footer>
        <div className="rp-powered">Powered by AllSoulLearn</div>
      </article>
    </main>
  );
}
