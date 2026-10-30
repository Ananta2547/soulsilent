'use client';

/**
 * บัญชีผู้จัด — for each host, where admin sends their earnings and how to
 * reach them (migrations 077 + 078). Admin only. Empty name / phone / LINE
 * fields show what the host wrote in their own profile until admin saves
 * their own. An account holder whose name is not the host's is flagged red
 * but can still be saved (Thai / English spellings differ).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminChips, AdminHead, AdminSearch, AdminSheet, Badge, adminConfirm, adminToast } from '@/components/admin/AdminShell';
import { accountNameMismatch, PAYOUT_FIELDS, type PayoutField } from '@/lib/host-payout';
import type { HostAccountRow } from '@/app/api/admin/hosts/route';

type Filter = 'all' | 'missing' | 'mismatch';
type Draft = Record<PayoutField, string>;

/** A field as shown: admin's value, else the host's profile, else empty. */
function eff(h: HostAccountRow, f: PayoutField): { v: string; fromProfile: boolean } {
  const own = h.info?.[f];
  if (own) return { v: own, fromProfile: false };
  const p = (h.profile as Record<string, string | null | undefined>)[f];
  return p ? { v: p, fromProfile: true } : { v: '', fromProfile: false };
}

const hasAccount = (h: HostAccountRow) => !!(h.info?.account_no || h.info?.promptpay);
const mismatch = (h: HostAccountRow) => accountNameMismatch(eff(h, 'full_name').v, h.info?.account_name);

const fbHref = (v: string) => (/^https?:\/\//i.test(v) ? v : `https://facebook.com/${v.replace(/^@/, '')}`);
const igHref = (v: string) => (/^https?:\/\//i.test(v) ? v : `https://instagram.com/${v.replace(/^@/, '')}`);
const lineHref = (v: string) => (/^https?:\/\//i.test(v) ? v : `https://line.me/ti/p/~${v.replace(/^@/, '')}`);

export default function AdminHostsPage() {
  const [hosts, setHosts] = useState<HostAccountRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<HostAccountRow | null>(null);

  const load = useCallback(() => {
    fetch('/api/admin/hosts')
      .then(async (r) => {
        const d = (await r.json()) as { hosts?: HostAccountRow[]; error?: string };
        if (!r.ok) throw new Error(d.error || 'โหลดไม่สำเร็จ');
        setHosts(d.hosts || []);
      })
      .catch((e: Error) => setErr(e.message));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  // ?q= from the users page's "บัญชีผู้จัด" shortcut, once the list is in.
  const [fromUrl, setFromUrl] = useState(false);
  if (hosts && !fromUrl) {
    setFromUrl(true);
    const qp = new URLSearchParams(window.location.search).get('q');
    if (qp) setQ(qp);
  }

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (hosts || []).filter((h) => {
      if (filter === 'missing' && hasAccount(h)) return false;
      if (filter === 'mismatch' && !mismatch(h)) return false;
      if (!t) return true;
      return [h.name, h.email, eff(h, 'full_name').v, eff(h, 'nickname').v, h.info?.account_name, h.info?.account_no].some((x) => (x || '').toLowerCase().includes(t));
    });
  }, [hosts, q, filter]);

  const copy = (v: string, what: string) => navigator.clipboard?.writeText(v).then(() => adminToast(`คัดลอก${what}แล้ว`));

  return (
    <div>
      <AdminHead
        eyebrow="ADMIN · HOSTS"
        title="บัญชีผู้จัด"
        sub="ช่องทางโอนเงินและข้อมูลติดต่อของผู้จัดแต่ละคน · เห็นเฉพาะ admin · ช่องที่ยังไม่กรอกดึงจากโปรไฟล์ของผู้จัด"
      />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ flex: '1 1 280px' }}>
          <AdminSearch value={q} onChange={setQ} placeholder="ค้นชื่อ อีเมล หรือเลขบัญชี" />
        </div>
        <AdminChips
          value={filter}
          onChange={setFilter}
          items={[
            { key: 'all', label: 'ทั้งหมด', n: hosts?.length ?? 0 },
            { key: 'missing', label: 'ยังไม่มีบัญชี', n: (hosts || []).filter((h) => !hasAccount(h)).length },
            { key: 'mismatch', label: 'ชื่อบัญชีไม่ตรง', n: (hosts || []).filter(mismatch).length },
          ]}
        />
      </div>

      {err && <div className="adm-notice is-bad">{err}</div>}
      {!hosts && !err && <p className="adm-soft-empty">กำลังโหลด…</p>}
      {hosts && shown.length === 0 && <p className="adm-soft-empty">ไม่พบผู้จัด</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 380px), 1fr))', gap: 14 }}>
        {shown.map((h) => {
          const full = eff(h, 'full_name');
          const nick = eff(h, 'nickname');
          const phone = eff(h, 'phone');
          const line = eff(h, 'line_id');
          const bad = mismatch(h);
          return (
            <article key={h.id} className="adm-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                    {full.v || h.name || '—'}
                    {nick.v && <span style={{ color: 'var(--muted)', fontWeight: 500 }}> ({nick.v})</span>}
                  </h3>
                  <p className="adm-meta" style={{ margin: '2px 0 0' }}>
                    {h.name && h.name !== full.v ? `${h.name} · ` : ''}
                    {h.email}
                    {(full.fromProfile || nick.fromProfile) && ' · ชื่อจากโปรไฟล์'}
                  </p>
                </div>
                <button type="button" className="adm-btn sm" onClick={() => setEditing(h)}>
                  แก้ไข
                </button>
              </div>

              <section style={{ background: 'var(--cream, #f6f1e6)', borderRadius: 14, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="adm-eyebrow" style={{ margin: 0 }}>
                  ข้อมูลโอนชำระ
                </span>
                {!hasAccount(h) ? (
                  <span className="adm-meta">ยังไม่มีบัญชี — กด “แก้ไข” เพื่อเพิ่ม</span>
                ) : (
                  <>
                    {h.info?.account_no && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14 }}>{h.info.bank || 'ธนาคาร —'}</span>
                        <b className="adm-mono" style={{ fontSize: 15 }}>
                          {h.info.account_no}
                        </b>
                        <button type="button" className="adm-link-btn" onClick={() => copy(h.info!.account_no!.replace(/-/g, ''), 'เลขบัญชี')}>
                          คัดลอก
                        </button>
                      </div>
                    )}
                    {h.info?.promptpay && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14 }}>พร้อมเพย์</span>
                        <b className="adm-mono" style={{ fontSize: 15 }}>
                          {h.info.promptpay}
                        </b>
                        <button type="button" className="adm-link-btn" onClick={() => copy(h.info!.promptpay!.replace(/-/g, ''), 'พร้อมเพย์')}>
                          คัดลอก
                        </button>
                      </div>
                    )}
                    <div style={{ fontSize: 14 }}>
                      ชื่อบัญชี: <b>{h.info?.account_name || '—'}</b> {bad && <Badge tone="bad">ไม่ตรงกับชื่อผู้จัด</Badge>}
                    </div>
                  </>
                )}
              </section>

              <section style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 }}>
                <span className="adm-eyebrow" style={{ margin: 0 }}>
                  ข้อมูลติดต่อ
                </span>
                <span>
                  โทร: {phone.v ? <a href={`tel:${phone.v.replace(/[^0-9+]/g, '')}`}>{phone.v}</a> : '—'}
                  {phone.fromProfile && <span className="adm-meta"> · จากโปรไฟล์</span>}
                </span>
                <span>
                  LINE:{' '}
                  {line.v ? (
                    <a href={lineHref(line.v)} target="_blank" rel="noopener noreferrer">
                      {line.v}
                    </a>
                  ) : (
                    '—'
                  )}
                  {line.fromProfile && <span className="adm-meta"> · จากโปรไฟล์</span>}
                </span>
                <span>
                  FB:{' '}
                  {h.info?.facebook ? (
                    <a href={fbHref(h.info.facebook)} target="_blank" rel="noopener noreferrer">
                      {h.info.facebook}
                    </a>
                  ) : (
                    '—'
                  )}
                </span>
                <span>
                  IG:{' '}
                  {h.info?.instagram ? (
                    <a href={igHref(h.info.instagram)} target="_blank" rel="noopener noreferrer">
                      {h.info.instagram}
                    </a>
                  ) : (
                    '—'
                  )}
                </span>
              </section>

              {h.info?.note && (
                <p style={{ margin: 0, fontSize: 13.5, whiteSpace: 'pre-wrap', background: '#fdf1d3', color: '#5c3d00', borderRadius: 12, padding: '10px 12px' }}>
                  <b>Note:</b> {h.info.note}
                </p>
              )}
              {h.info?.updated_at && (
                <p className="adm-meta" style={{ margin: 0, fontSize: 12 }}>
                  แก้ล่าสุด {h.info.updated_at.slice(0, 10)}
                  {h.info.updated_by_name ? ` โดย ${h.info.updated_by_name}` : ''}
                </p>
              )}
            </article>
          );
        })}
      </div>

      {editing && (
        <EditSheet
          host={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            adminToast('บันทึกแล้ว');
            load();
          }}
        />
      )}
    </div>
  );
}

const LABEL: Record<PayoutField, string> = {
  full_name: 'ชื่อจริง นามสกุล',
  nickname: 'ชื่อเล่น',
  bank: 'ธนาคาร',
  account_no: 'เลขบัญชี',
  account_name: 'ชื่อเจ้าของบัญชี',
  promptpay: 'พร้อมเพย์',
  phone: 'เบอร์โทร',
  facebook: 'Facebook (ชื่อหรือลิงก์)',
  line_id: 'LINE ID',
  instagram: 'Instagram',
  note: 'Note',
};

function EditSheet({ host, onClose, onSaved }: { host: HostAccountRow; onClose: () => void; onSaved: () => void }) {
  // Start from what is shown, profile values included, so saving keeps them.
  const [d, setD] = useState<Draft>(() => Object.fromEntries(PAYOUT_FIELDS.map((f) => [f, eff(host, f).v])) as Draft);
  // What each field held when the sheet opened (admin's saved value or the
  // host's own profile): changing one that was filled is flagged, field by
  // field, and listed again before saving.
  const [was] = useState(() => Object.fromEntries(PAYOUT_FIELDS.map((f) => [f, eff(host, f)])) as Record<PayoutField, { v: string; fromProfile: boolean }>);
  const overwritten = PAYOUT_FIELDS.filter((f) => was[f].v.trim() !== '' && d[f].trim() !== was[f].v.trim());
  const restore = (f: PayoutField) => setD((x) => ({ ...x, [f]: was[f].v }));
  const warnOf = (f: PayoutField) =>
    overwritten.includes(f) && (
      <div className="adm-overwrite" role="status">
        <span>
          กำลังกรอกทับข้อมูลเดิม{was[f].fromProfile ? 'ที่ผู้จัดกรอกในโปรไฟล์' : 'ที่บันทึกไว้'}: <b>{was[f].v}</b>
          {d[f].trim() === '' ? ' — จะถูกลบออก' : ''}
        </span>
        <button type="button" onClick={() => restore(f)}>
          คืนค่าเดิม
        </button>
      </div>
    );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bad = accountNameMismatch(d.full_name, d.account_name);

  const field = (f: PayoutField, opts: { mono?: boolean; numeric?: boolean; placeholder?: string } = {}) => (
    <div className="adm-field">
      <label htmlFor={`hp-${f}`}>{LABEL[f]}</label>
      <input
        id={`hp-${f}`}
        value={d[f]}
        onChange={(e) => setD((x) => ({ ...x, [f]: e.target.value }))}
        className={opts.mono ? 'adm-mono' : undefined}
        inputMode={opts.numeric ? 'numeric' : undefined}
        placeholder={opts.placeholder}
        aria-invalid={overwritten.includes(f) || undefined}
      />
      {warnOf(f)}
    </div>
  );

  async function save() {
    if (overwritten.length) {
      const lines = overwritten.map((f) => `• ${LABEL[f]}: ${was[f].v} → ${d[f].trim() || '(ว่าง)'}`).join('\n');
      const ok = await adminConfirm({ title: `บันทึกทับข้อมูลเดิม ${overwritten.length} ช่อง?`, msg: lines, ok: 'บันทึกทับ', danger: true });
      if (!ok) return;
    }
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch(`/api/admin/hosts/${host.id}/payout-info`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
      const res = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(res.error || 'บันทึกไม่สำเร็จ');
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminSheet
      open
      onClose={onClose}
      eyebrow="บัญชีผู้จัด"
      title={host.name || host.email}
      sub="เห็นเฉพาะ admin"
      width={620}
      footer={
        <>
          <button type="button" className="adm-btn" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className="adm-btn teal" disabled={saving} onClick={save}>
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </>
      }
    >
      {err && <div className="adm-notice is-bad">{err}</div>}
      <div className="adm-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {field('full_name')}
        {field('nickname')}
      </div>
      <p className="adm-eyebrow" style={{ marginTop: 8 }}>
        ข้อมูลโอนชำระ
      </p>
      <div className="adm-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {field('bank', { placeholder: 'เช่น กสิกรไทย' })}
        {field('account_no', { mono: true, numeric: true })}
        {field('account_name')}
        {field('promptpay', { mono: true, numeric: true, placeholder: 'เบอร์โทร / เลขบัตร (ถ้ามี)' })}
      </div>
      {bad && (
        <div className="adm-notice is-bad" style={{ marginTop: 0 }}>
          ชื่อเจ้าของบัญชีไม่ตรงกับชื่อผู้จัด ({d.full_name}) — ตรวจก่อนโอน ยังบันทึกได้
        </div>
      )}
      <p className="adm-eyebrow" style={{ marginTop: 8 }}>
        ข้อมูลติดต่อ
      </p>
      <div className="adm-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {field('phone', { numeric: true })}
        {field('line_id')}
        {field('facebook')}
        {field('instagram', { placeholder: '@ชื่อผู้ใช้' })}
      </div>
      <div className="adm-field">
        <label htmlFor="hp-note">{LABEL.note}</label>
        <textarea id="hp-note" rows={3} value={d.note} onChange={(e) => setD((x) => ({ ...x, note: e.target.value }))} placeholder="หมายเหตุสำหรับ admin เช่น โอนทุกวันที่ 5 · ขอใบสำคัญทางอีเมล" />
        {warnOf('note')}
      </div>
    </AdminSheet>
  );
}
