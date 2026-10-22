'use client';

/* Create / edit a coupon: one sheet, four steps — discount, conditions, how
 * it is handed out, review. Saving is allowed from any step. */
import { useEffect, useMemo, useState } from 'react';
import { AdminSheet, AdminChips, SheetSection, adminToast } from '@/components/admin/AdminShell';
import { PickDateTime } from '@/components/admin/pickers';
import { CouponTicket, toneFor, untilLabel } from '@/components/coupons/CouponTicket';

export type CouponRow = {
  id: string;
  name: string;
  description: string | null;
  kind: 'percent' | 'amount' | 'free' | 'fixed_price';
  value: number;
  max_discount: number | null;
  distribution: 'public' | 'unique' | 'wallet';
  public_code: string | null;
  show_at_checkout: number;
  stack_with_promo: number;
  funded_by: 'asl' | 'host' | 'split';
  host_share_pct: number;
  starts_at: string | null;
  ends_at: string | null;
  max_uses: number | null;
  per_user_limit: number | null;
  min_spend: number;
  scope: 'all' | 'masters' | 'categories' | 'hosts';
  scope_json: string | null;
  kinds_json: string | null;
  first_booking_only: number;
  status: 'active' | 'disabled';
  used?: number;
  discount_total?: number;
  codes?: number;
  claimed?: number;
};

const FLOWS = [
  { key: 'direct', label: 'จองตรง (จ่ายเต็ม)' },
  { key: 'group', label: 'จองกลุ่ม / แพ็ก / เหมารอบ' },
  { key: 'selection', label: 'กิจกรรมคัดเลือก' },
  { key: 'deposit', label: 'มัดจำ' },
  { key: 'gift', label: 'ซื้อเป็นของขวัญ' },
];

type Form = {
  name: string;
  description: string;
  kind: CouponRow['kind'];
  value: string;
  max_discount: string;
  stack_with_promo: boolean;
  funded_by: CouponRow['funded_by'];
  host_share_pct: string;
  starts_at: string;
  ends_at: string;
  max_uses: string;
  per_user_limit: string;
  min_spend: string;
  first_booking_only: boolean;
  kinds: string[];
  scope: CouponRow['scope'];
  scope_ids: string[];
  distribution: CouponRow['distribution'];
  public_code: string;
  show_at_checkout: boolean;
};

function toForm(c?: CouponRow | null): Form {
  const arr = (s: string | null | undefined) => {
    try {
      const v = s ? JSON.parse(s) : [];
      return Array.isArray(v) ? v.map(String) : [];
    } catch {
      return [];
    }
  };
  const str = (n: number | null | undefined) => (n == null ? '' : String(n));
  return {
    name: c?.name || '',
    description: c?.description || '',
    kind: c?.kind || 'percent',
    value: c ? str(c.value) : '10',
    max_discount: str(c?.max_discount),
    stack_with_promo: !!c?.stack_with_promo,
    funded_by: c?.funded_by || 'asl',
    host_share_pct: c ? str(c.host_share_pct) : '50',
    starts_at: c?.starts_at || '',
    ends_at: c?.ends_at || '',
    max_uses: str(c?.max_uses),
    per_user_limit: c ? str(c.per_user_limit) : '1',
    min_spend: c && c.min_spend ? String(c.min_spend) : '',
    first_booking_only: !!c?.first_booking_only,
    kinds: c?.kinds_json ? arr(c.kinds_json) : FLOWS.map((f) => f.key),
    scope: c?.scope || 'all',
    scope_ids: arr(c?.scope_json),
    distribution: c?.distribution || 'public',
    public_code: c?.public_code || '',
    show_at_checkout: c ? !!c.show_at_checkout : false,
  };
}

const STEPS = ['ส่วนลด', 'เงื่อนไข', 'การแจก', 'ตรวจทาน'];

export function bigOf(kind: string, value: number): string {
  if (kind === 'percent') return `${value}%`;
  if (kind === 'free') return 'ฟรี';
  return '฿' + Math.round(value).toLocaleString();
}

export function headlineOf(c: { kind: string; value: number; max_discount: number | null }): string {
  const b = (n: number) => '฿' + Math.round(n).toLocaleString();
  if (c.kind === 'percent') return `ลด ${c.value}%${c.max_discount ? ` สูงสุด ${b(c.max_discount)}` : ''}`;
  if (c.kind === 'amount') return `ลด ${b(c.value)}`;
  if (c.kind === 'free') return 'เข้าร่วมฟรี';
  return `จ่ายเพียง ${b(c.value)}`;
}

function fmtWall(w: string | null): string {
  if (!w) return '';
  const [d, t] = w.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${day} ${MON[m - 1]} ${(y + 543) % 100}${t && t !== '00:00' ? ` ${t}` : ''}`;
}

/** "1 พ.ย. 69 – 30 พ.ย. 69 23:59", or "ไม่มีวันหมดอายุ". */
export function periodOf(c: Pick<CouponRow, 'starts_at' | 'ends_at'>): string {
  if (!c.starts_at && !c.ends_at) return 'ไม่มีวันหมดอายุ';
  if (!c.starts_at) return `ถึง ${fmtWall(c.ends_at)}`;
  if (!c.ends_at) return `ตั้งแต่ ${fmtWall(c.starts_at)}`;
  return `${fmtWall(c.starts_at)} – ${fmtWall(c.ends_at)}`;
}

export function CouponForm({ open, coupon, onClose, onSaved }: { open: boolean; coupon?: CouponRow | null; onClose: () => void; onSaved: (id: string) => void }) {
  const [f, setF] = useState<Form>(() => toForm(coupon));
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [options, setOptions] = useState<{ masters: { id: string; label: string }[]; categories: { id: string; label: string }[]; hosts: { id: string; label: string }[] } | null>(null);
  const [optQ, setOptQ] = useState('');

  useEffect(() => {
    if (!open || options) return;
    let live = true;
    (async () => {
      try {
        const [m, w, t] = await Promise.all([
          fetch('/api/workshop-masters').then((r) => r.json() as Promise<{ masters?: { id: string; title: string }[] }>),
          fetch('/api/workshops').then((r) => r.json() as Promise<{ workshops?: { category: string | null }[] }>),
          fetch('/api/teachers').then((r) => r.json() as Promise<{ teachers?: { id: string; name: string; nickname: string | null }[] }>),
        ]);
        if (!live) return;
        const cats = [...new Set((w.workshops || []).map((x) => x.category).filter((x): x is string => !!x))].sort();
        setOptions({
          masters: (m.masters || []).map((x) => ({ id: x.id, label: x.title })),
          categories: cats.map((c) => ({ id: c, label: c })),
          hosts: (t.teachers || []).map((x) => ({ id: x.id, label: x.nickname || x.name })),
        });
      } catch {
        if (live) setOptions({ masters: [], categories: [], hosts: [] });
      }
    })();
    return () => {
      live = false;
    };
  }, [open, options]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const toggle = (k: 'kinds' | 'scope_ids', id: string) =>
    setF((p) => ({ ...p, [k]: p[k].includes(id) ? p[k].filter((x) => x !== id) : [...p[k], id] }));

  const scopeList = useMemo(() => {
    if (!options || f.scope === 'all') return [];
    const list = f.scope === 'masters' ? options.masters : f.scope === 'categories' ? options.categories : options.hosts;
    const q = optQ.trim().toLowerCase();
    return q ? list.filter((o) => o.label.toLowerCase().includes(q)) : list;
  }, [options, f.scope, optQ]);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(coupon ? `/api/admin/coupons/${coupon.id}` : '/api/admin/coupons', {
        method: coupon ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, value: f.kind === 'free' ? 0 : f.value }),
      });
      const d = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) {
        setErr(d.error || 'บันทึกไม่สำเร็จ');
        return;
      }
      adminToast(coupon ? 'บันทึกคูปองแล้ว' : 'สร้างคูปองแล้ว');
      onSaved(coupon?.id || d.id || '');
    } catch {
      setErr('เชื่อมต่อไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  const preview = { kind: f.kind, value: f.kind === 'free' ? 0 : Number(f.value) || 0, max_discount: f.max_discount ? Number(f.max_discount) : null };

  return (
    <AdminSheet
      open={open}
      onClose={onClose}
      eyebrow="admin · coupon"
      title={coupon ? 'แก้ไขคูปอง' : 'สร้างคูปอง'}
      sub={f.name || 'ตั้งส่วนลด เงื่อนไข และวิธีแจก'}
      width={760}
      footer={
        <>
          <button type="button" className="adm-btn" onClick={onClose} disabled={saving}>ยกเลิก</button>
          <div style={{ flex: 1 }} />
          {step > 0 && <button type="button" className="adm-btn" onClick={() => setStep(step - 1)}>← ย้อนกลับ</button>}
          {step < STEPS.length - 1 && <button type="button" className="adm-btn" onClick={() => setStep(step + 1)}>ถัดไป →</button>}
          <button type="button" className="adm-btn teal" onClick={save} disabled={saving}>{saving ? 'กำลังบันทึก…' : coupon ? 'บันทึกการแก้ไข' : 'สร้างคูปอง'}</button>
        </>
      }
    >
      <nav className="adm-steptabs" aria-label="ขั้นตอนของฟอร์ม">
        {STEPS.map((s, i) => (
          <button key={s} type="button" className={step === i ? 'is-on' : ''} aria-current={step === i ? 'step' : undefined} onClick={() => setStep(i)}>
            <span>{i + 1}</span>
            {s}
          </button>
        ))}
      </nav>
      {err && <div className="adm-notice is-bad" style={{ marginTop: 16 }}>{err}</div>}

      <div className={`adm-step${step === 0 ? ' is-on' : ''}`}>
        <SheetSection n={1} title="ชื่อคูปอง">
          <div className="adm-field">
            <label htmlFor="cp-name">ชื่อที่ผู้ใช้เห็น</label>
            <input id="cp-name" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="เช่น ส่วนลดสมาชิกใหม่" />
          </div>
          <div className="adm-field">
            <label htmlFor="cp-desc">คำอธิบาย (ไม่บังคับ)</label>
            <input id="cp-desc" value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="เช่น ใช้ได้กับทุกกิจกรรมในเดือนพฤศจิกายน" />
          </div>
        </SheetSection>
        <SheetSection n={2} title="ส่วนลด">
          <AdminChips
            value={f.kind}
            onChange={(k) => set('kind', k)}
            items={[
              { key: 'percent', label: 'ลดเป็น %' },
              { key: 'amount', label: 'ลดเป็นบาท' },
              { key: 'free', label: 'ฟรี 100%' },
              { key: 'fixed_price', label: 'ราคาพิเศษ' },
            ]}
          />
          {f.kind !== 'free' && (
            <div className="adm-grid">
              <div className="adm-field">
                <label htmlFor="cp-val">{f.kind === 'percent' ? 'ลดกี่ %' : f.kind === 'amount' ? 'ลดกี่บาท' : 'ผู้ใช้จ่ายเท่าไร (บาท)'}</label>
                <input id="cp-val" inputMode="numeric" value={f.value} onChange={(e) => set('value', e.target.value.replace(/[^0-9]/g, ''))} />
              </div>
              {f.kind === 'percent' && (
                <div className="adm-field">
                  <label htmlFor="cp-max">ลดสูงสุด (บาท, ไม่บังคับ)</label>
                  <input id="cp-max" inputMode="numeric" value={f.max_discount} onChange={(e) => set('max_discount', e.target.value.replace(/[^0-9]/g, ''))} placeholder="ไม่จำกัด" />
                </div>
              )}
            </div>
          )}
          <label className="adm-inline-check">
            <input type="checkbox" checked={f.stack_with_promo} onChange={(e) => set('stack_with_promo', e.target.checked)} />
            <span>
              ใช้ซ้อนกับราคาโปรโมชันได้
              <span className="adm-hint" style={{ display: 'block', margin: '2px 0 0' }}>
                {f.stack_with_promo ? 'ลดต่อจากราคาโปร' : 'ไม่ซ้อน: คิดจากราคาเต็ม แล้วระบบเลือกให้ว่าราคาโปรหรือคูปองถูกกว่า'}
              </span>
            </span>
          </label>
        </SheetSection>
        <SheetSection n={3} title="ใครแบกส่วนลด">
          <AdminChips
            value={f.funded_by}
            onChange={(k) => set('funded_by', k)}
            items={[
              { key: 'asl', label: 'ASL' },
              { key: 'host', label: 'ผู้จัด' },
              { key: 'split', label: 'แบ่งกัน' },
            ]}
          />
          {f.funded_by === 'split' && (
            <div className="adm-field" style={{ maxWidth: 260 }}>
              <label htmlFor="cp-share">ผู้จัดแบกกี่ % ของส่วนลด</label>
              <input id="cp-share" inputMode="numeric" value={f.host_share_pct} onChange={(e) => set('host_share_pct', e.target.value.replace(/[^0-9]/g, ''))} />
            </div>
          )}
          <p className="adm-hint">
            {f.funded_by === 'asl'
              ? 'ผู้จัดได้รายได้เต็มราคา ส่วนลดเป็นต้นทุนของ ASL (บันทึกเป็นยอดที่ ASL จ่ายให้ผู้จัด)'
              : f.funded_by === 'host'
                ? 'รายได้ผู้จัดคิดจากยอดที่ผู้ใช้จ่ายจริงหลังลด'
                : `ผู้จัดแบก ${Number(f.host_share_pct) || 0}% · ASL แบก ${100 - (Number(f.host_share_pct) || 0)}% ของส่วนลด`}
          </p>
        </SheetSection>
      </div>

      <div className={`adm-step${step === 1 ? ' is-on' : ''}`}>
        <SheetSection n={1} title="ช่วงเวลาใช้งาน">
          <div className="adm-grid">
            <div className="adm-field">
              <label>เริ่มใช้ได้ (ไม่บังคับ)</label>
              <PickDateTime value={f.starts_at} onChange={(v) => set('starts_at', v)} />
            </div>
            <div className="adm-field">
              <label>หมดอายุ (ไม่บังคับ)</label>
              <PickDateTime value={f.ends_at} onChange={(v) => set('ends_at', v)} />
            </div>
          </div>
        </SheetSection>
        <SheetSection n={2} title="จำนวนและยอดขั้นต่ำ">
          <div className="adm-grid">
            <div className="adm-field">
              <label htmlFor="cp-max-uses">ใช้ได้ทั้งหมด (ครั้ง)</label>
              <input id="cp-max-uses" inputMode="numeric" value={f.max_uses} onChange={(e) => set('max_uses', e.target.value.replace(/[^0-9]/g, ''))} placeholder="ไม่จำกัด" />
            </div>
            <div className="adm-field">
              <label htmlFor="cp-per-user">ต่อคน (ครั้ง)</label>
              <input id="cp-per-user" inputMode="numeric" value={f.per_user_limit} onChange={(e) => set('per_user_limit', e.target.value.replace(/[^0-9]/g, ''))} placeholder="ไม่จำกัด" />
            </div>
            <div className="adm-field">
              <label htmlFor="cp-min">ยอดขั้นต่ำ (บาท)</label>
              <input id="cp-min" inputMode="numeric" value={f.min_spend} onChange={(e) => set('min_spend', e.target.value.replace(/[^0-9]/g, ''))} placeholder="ไม่มี" />
            </div>
          </div>
          <label className="adm-inline-check">
            <input type="checkbox" checked={f.first_booking_only} onChange={(e) => set('first_booking_only', e.target.checked)} />
            <span>ใช้ได้เฉพาะคนที่ยังไม่เคยจองกิจกรรม</span>
          </label>
        </SheetSection>
        <SheetSection n={3} title="ใช้กับการจองแบบไหน">
          <div className="adm-checklist">
            {FLOWS.map((k) => (
              <label key={k.key} className="adm-check">
                <input type="checkbox" checked={f.kinds.includes(k.key)} onChange={() => toggle('kinds', k.key)} />
                <div><b>{k.label}</b></div>
              </label>
            ))}
          </div>
        </SheetSection>
        <SheetSection n={4} title="ใช้กับกิจกรรมไหน">
          <AdminChips
            value={f.scope}
            onChange={(k) => {
              set('scope', k);
              set('scope_ids', []);
              setOptQ('');
            }}
            items={[
              { key: 'all', label: 'ทุกกิจกรรม' },
              { key: 'masters', label: 'เลือกกิจกรรม' },
              { key: 'categories', label: 'ตามหมวด' },
              { key: 'hosts', label: 'ตามผู้จัด' },
            ]}
          />
          {f.scope !== 'all' && (
            <>
              <div className="adm-field">
                <input value={optQ} onChange={(e) => setOptQ(e.target.value)} placeholder="ค้นหา" aria-label="ค้นหา" />
                <p className="adm-hint">เลือกแล้ว {f.scope_ids.length} รายการ</p>
              </div>
              <div className="adm-checklist" style={{ maxHeight: 280, overflowY: 'auto' }}>
                {!options ? (
                  <p className="adm-hint">กำลังโหลด…</p>
                ) : scopeList.length === 0 ? (
                  <p className="adm-hint">ไม่พบรายการ</p>
                ) : (
                  scopeList.map((o) => (
                    <label key={o.id} className="adm-check">
                      <input type="checkbox" checked={f.scope_ids.includes(o.id)} onChange={() => toggle('scope_ids', o.id)} />
                      <div><b>{o.label}</b></div>
                    </label>
                  ))
                )}
              </div>
            </>
          )}
        </SheetSection>
      </div>

      <div className={`adm-step${step === 2 ? ' is-on' : ''}`}>
        <SheetSection n={1} title="รูปแบบการแจก">
          <AdminChips
            value={f.distribution}
            onChange={(k) => set('distribution', k)}
            items={[
              { key: 'public', label: 'รหัสสาธารณะ' },
              { key: 'unique', label: 'บัตรรหัสเฉพาะ' },
              { key: 'wallet', label: 'คูปองในบัญชี' },
            ]}
          />
          <p className="adm-hint">
            {f.distribution === 'public'
              ? 'รหัสเดียวใช้ได้หลายคน เช่น SOUL10 — แจกทางโซเชียล ผู้ใช้กรอกตอนชำระเงิน'
              : f.distribution === 'unique'
                ? 'สร้างบัตรเป็นชุด แต่ละใบมีรหัสไม่ซ้ำ ใช้ได้ใบละครั้ง พิมพ์พร้อม QR ได้ — สร้างบัตรในหน้ารายละเอียดหลังบันทึก'
                : 'มอบเข้า “คูปองของฉัน” ของผู้ใช้รายคน แล้วขึ้นให้เลือกตอนชำระเงิน — เลือกผู้ใช้ในหน้ารายละเอียดหลังบันทึก'}
          </p>
          {f.distribution === 'public' && (
            <>
              <div className="adm-field" style={{ maxWidth: 320 }}>
                <label htmlFor="cp-code">รหัส</label>
                <input
                  id="cp-code"
                  value={f.public_code}
                  onChange={(e) => set('public_code', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  placeholder="เช่น SOUL10"
                  style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '.12em' }}
                />
              </div>
              <label className="adm-inline-check">
                <input type="checkbox" checked={f.show_at_checkout} onChange={(e) => set('show_at_checkout', e.target.checked)} />
                <span>แสดงในหน้าชำระเงินให้ผู้ใช้กดเลือกได้เลย (ไม่ต้องพิมพ์รหัส)</span>
              </label>
            </>
          )}
        </SheetSection>
      </div>

      <div className={`adm-step${step === 3 ? ' is-on' : ''}`}>
        <SheetSection n={1} title="หน้าตาคูปอง">
          <div style={{ maxWidth: 440, background: 'var(--cream)', padding: 16, borderRadius: 20 }}>
            <CouponTicket
              big={bigOf(preview.kind, preview.value)}
              name={f.name || 'ชื่อคูปอง'}
              line={headlineOf(preview)}
              meta={untilLabel(f.ends_at) || 'ไม่มีวันหมดอายุ'}
              code={f.distribution === 'public' ? f.public_code || 'CODE' : 'XXXXXXXX'}
              tone={toneFor(f.kind)}
            />
          </div>
        </SheetSection>
        <SheetSection n={2} title="สรุป">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.9 }}>
            <li>{headlineOf(preview)}{f.stack_with_promo ? ' · ซ้อนโปรได้' : ' · ไม่ซ้อนโปร'}</li>
            <li>{f.funded_by === 'asl' ? 'ASL แบกส่วนลด' : f.funded_by === 'host' ? 'ผู้จัดแบกส่วนลด' : `ผู้จัดแบก ${f.host_share_pct}%`}</li>
            <li>ใช้ได้ {f.max_uses || 'ไม่จำกัด'} ครั้ง · ต่อคน {f.per_user_limit || 'ไม่จำกัด'} ครั้ง{f.min_spend ? ` · ขั้นต่ำ ฿${Number(f.min_spend).toLocaleString()}` : ''}</li>
            <li>{f.scope === 'all' ? 'ทุกกิจกรรม' : `จำกัด ${f.scope_ids.length} รายการ`} · {f.kinds.length === FLOWS.length ? 'ทุกแบบการจอง' : FLOWS.filter((k) => f.kinds.includes(k.key)).map((k) => k.label).join(', ')}</li>
            <li>{periodOf({ starts_at: f.starts_at || null, ends_at: f.ends_at || null })}</li>
            {f.first_booking_only && <li>เฉพาะคนที่ยังไม่เคยจอง</li>}
          </ul>
        </SheetSection>
      </div>
    </AdminSheet>
  );
}
