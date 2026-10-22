'use client';

/* One coupon: its numbers, its codes (print a batch of cards, or hand codes
 * to members' wallets) and every booking that used it. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageLoader } from '@/components/design/PageLoader';
import { AdminHead, AdminSearch, Badge, adminConfirm, adminAlert, adminToast } from '@/components/admin/AdminShell';
import { CouponTicket, toneFor, untilLabel } from '@/components/coupons/CouponTicket';
import { CouponForm, bigOf, headlineOf, periodOf, type CouponRow } from '../_components/CouponForm';

type CodeRow = { id: string; code: string; batch: string | null; owner_user_id: string | null; owner_name: string | null; owner_email: string | null; claimed_at: string | null; used_booking: string | null };
type UseRow = {
  id: string;
  workshop_id: string;
  coupon_code: string;
  amount: number;
  list_amount: number | null;
  discount_amount: number;
  host_discount: number;
  host_credit: number;
  status: string;
  payment_status: string;
  created_at: string;
  workshop_title: string;
  workshop_date: string;
  user_name: string | null;
  user_email: string | null;
  alive: number;
};
type Member = { id: string; name: string; email: string };

const baht = (n: number) => '฿' + Math.round(n || 0).toLocaleString();
const FUND: Record<string, string> = { asl: 'ASL แบก', host: 'ผู้จัดแบก', split: 'แบ่งกัน' };

export default function AdminCouponDetail() {
  const { id } = useParams<{ id: string }>();
  const [coupon, setCoupon] = useState<CouponRow | null>(null);
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [uses, setUses] = useState<UseRow[]>([]);
  const [missing, setMissing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [count, setCount] = useState('20');
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [mq, setMq] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [codeQ, setCodeQ] = useState('');

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/coupons/${id}`);
    if (!res.ok) {
      setMissing(true);
      return;
    }
    const d = (await res.json()) as { coupon: CouponRow; codes: CodeRow[]; uses: UseRow[] };
    setCoupon(d.coupon);
    setCodes(d.codes);
    setUses(d.uses);
  }, [id]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const isWallet = coupon?.distribution === 'wallet';
  useEffect(() => {
    if (!isWallet || members) return;
    (async () => {
      try {
        const res = await fetch('/api/users');
        const d = (await res.json()) as { users?: Member[] };
        setMembers(d.users || []);
      } catch {
        setMembers([]);
      }
    })();
  }, [isWallet, members]);

  const sums = useMemo(() => {
    const live = uses.filter((u) => u.alive && (u.payment_status === 'paid' || u.status === 'confirmed'));
    const discount = live.reduce((s, u) => s + (u.discount_amount || 0), 0);
    const host = live.reduce((s, u) => s + (u.host_discount || 0), 0);
    return { discount, host };
  }, [uses]);

  const batches = useMemo(() => [...new Set(codes.map((c) => c.batch).filter((b): b is string => !!b))], [codes]);
  const shownCodes = useMemo(() => {
    const t = codeQ.trim().toLowerCase();
    return t ? codes.filter((c) => [c.code, c.owner_name, c.owner_email].filter(Boolean).some((v) => (v as string).toLowerCase().includes(t))) : codes;
  }, [codes, codeQ]);
  const memberList = useMemo(() => {
    const t = mq.trim().toLowerCase();
    if (!members || !t) return [];
    const owned = new Set(codes.map((c) => c.owner_user_id).filter(Boolean));
    return members.filter((m) => !owned.has(m.id) && [m.name, m.email].some((v) => (v || '').toLowerCase().includes(t))).slice(0, 20);
  }, [members, mq, codes]);

  async function generate() {
    const n = Math.round(Number(count) || 0);
    if (n < 1) return;
    setBusy(true);
    const res = await fetch(`/api/admin/coupons/${id}/codes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count: n }) });
    const d = (await res.json()) as { created?: number; error?: string };
    setBusy(false);
    if (!res.ok) return adminAlert('สร้างบัตรไม่สำเร็จ', d.error);
    adminToast(`สร้างบัตร ${d.created} ใบแล้ว`);
    load();
  }

  async function grant() {
    if (picked.length === 0) return;
    setBusy(true);
    const res = await fetch(`/api/admin/coupons/${id}/codes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_ids: picked }) });
    const d = (await res.json()) as { created?: number; error?: string };
    setBusy(false);
    if (!res.ok) return adminAlert('มอบคูปองไม่สำเร็จ', d.error);
    adminToast(`มอบคูปองให้ ${d.created} คนแล้ว`);
    setPicked([]);
    setMq('');
    load();
  }

  async function withdraw(code: string) {
    if (!(await adminConfirm({ title: 'ถอนรหัสนี้?', msg: `รหัส ${code} จะใช้ไม่ได้อีก`, ok: 'ถอนรหัส', danger: true }))) return;
    const res = await fetch(`/api/admin/coupons/${id}/codes`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    const d = (await res.json()) as { error?: string };
    if (!res.ok) return adminAlert('ถอนรหัสไม่ได้', d.error);
    adminToast('ถอนรหัสแล้ว');
    load();
  }

  async function toggleStatus() {
    if (!coupon) return;
    const next = coupon.status === 'active' ? 'disabled' : 'active';
    if (next === 'disabled' && !(await adminConfirm({ title: 'ปิดคูปองนี้?', msg: 'ผู้ใช้จะใช้คูปองนี้ไม่ได้อีก การจองที่ใช้ไปแล้วยังคงราคาเดิม', ok: 'ปิดคูปอง', danger: true }))) return;
    await fetch(`/api/admin/coupons/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) });
    adminToast(next === 'active' ? 'เปิดคูปองแล้ว' : 'ปิดคูปองแล้ว');
    load();
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(() => adminToast('คัดลอกแล้ว'));
  }

  function exportCsv() {
    const lines = [['code', 'batch', 'owner', 'email', 'used'].join(',')].concat(
      codes.map((c) => [c.code, c.batch || '', (c.owner_name || '').replace(/,/g, ' '), c.owner_email || '', c.used_booking ? 'yes' : ''].join(',')),
    );
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `coupon-${coupon?.name || id}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (missing) return <div className="adm-card adm-empty">ไม่พบคูปอง</div>;
  if (!coupon) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256 }}>
        <PageLoader />
      </div>
    );
  }

  const aliveCount = uses.filter((u) => u.alive).length;

  return (
    <>
      <AdminHead
        back={{ href: '/admin/coupons', label: 'คูปองทั้งหมด' }}
        eyebrow="admin · coupon"
        title={coupon.name}
        sub={`${headlineOf(coupon)} · ${periodOf(coupon)}`}
        actions={
          <>
            <button type="button" className="adm-btn" onClick={toggleStatus}>{coupon.status === 'active' ? 'ปิดคูปอง' : 'เปิดคูปอง'}</button>
            <button type="button" className="adm-btn teal" onClick={() => setEditing(true)}>แก้ไข</button>
          </>
        }
      />

      <div className="adm-two">
        <div className="adm-stack">
          <div className="adm-card pad" style={{ background: 'var(--cream)', boxShadow: 'none', padding: 0 }}>
            <CouponTicket
              big={bigOf(coupon.kind, coupon.value)}
              name={coupon.name}
              line={headlineOf(coupon)}
              meta={untilLabel(coupon.ends_at) || coupon.description || 'ไม่มีวันหมดอายุ'}
              code={coupon.distribution === 'public' ? coupon.public_code || '' : undefined}
              tone={toneFor(coupon.kind)}
              off={coupon.status !== 'active'}
              size="big"
            />
          </div>
          <div className="adm-sum">
            <div><span className="adm-label">ใช้ไป</span><b>{aliveCount}{coupon.max_uses ? ` / ${coupon.max_uses}` : ''}</b><small>รวมที่กำลังรอชำระ</small></div>
            <div><span className="adm-label">ส่วนลดรวม</span><b>{baht(sums.discount)}</b><small>เฉพาะที่ชำระแล้ว</small></div>
            <div><span className="adm-label">ผู้จัดแบก</span><b>{baht(sums.host)}</b><small>{FUND[coupon.funded_by]}{coupon.funded_by === 'split' ? ` ${coupon.host_share_pct}%` : ''}</small></div>
            <div className="is-net"><span className="adm-label">ASL แบก</span><b>{baht(sums.discount - sums.host)}</b><small>รวมในรายได้ผู้จัด</small></div>
          </div>
        </div>

        <div className="adm-card">
          <div className="adm-card-head">
            <h3 className="adm-h">รหัส</h3>
            {codes.length > 0 && <button type="button" className="adm-btn sm white" onClick={exportCsv}>ดาวน์โหลด CSV</button>}
          </div>
          <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {coupon.distribution === 'public' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span className="adm-code" style={{ fontSize: 18, letterSpacing: '.16em' }}>{coupon.public_code}</span>
                  <button type="button" className="adm-btn sm" onClick={() => copy(coupon.public_code || '')}>คัดลอกรหัส</button>
                  <button type="button" className="adm-btn sm" onClick={() => copy(`${window.location.origin}/coupon/${coupon.public_code}`)}>คัดลอกลิงก์</button>
                </div>
                <p className="adm-hint">{coupon.show_at_checkout ? 'แสดงในหน้าชำระเงินให้ผู้ใช้กดเลือกได้' : 'ผู้ใช้ต้องพิมพ์รหัสเองตอนชำระเงิน'}</p>
              </>
            )}

            {coupon.distribution === 'unique' && (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                  <div className="adm-field" style={{ width: 140, margin: 0 }}>
                    <label htmlFor="cp-count">จำนวนบัตร</label>
                    <input id="cp-count" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/[^0-9]/g, ''))} />
                  </div>
                  <button type="button" className="adm-btn teal" onClick={generate} disabled={busy}>{busy ? 'กำลังสร้าง…' : 'สร้างบัตร'}</button>
                </div>
                {batches.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {batches.map((b) => (
                      <Link key={b} href={`/admin/coupons/${id}/print?batch=${encodeURIComponent(b)}`} className="adm-btn sm white" target="_blank">
                        พิมพ์ชุด {b} ({codes.filter((c) => c.batch === b).length})
                      </Link>
                    ))}
                    <Link href={`/admin/coupons/${id}/print`} className="adm-btn sm" target="_blank">พิมพ์ทั้งหมด</Link>
                  </div>
                )}
              </>
            )}

            {coupon.distribution === 'wallet' && (
              <>
                <div className="adm-field" style={{ margin: 0 }}>
                  <label htmlFor="cp-member">มอบให้ผู้ใช้</label>
                  <input id="cp-member" value={mq} onChange={(e) => setMq(e.target.value)} placeholder="ค้นหาชื่อหรืออีเมล" />
                </div>
                {memberList.length > 0 && (
                  <div className="adm-checklist" style={{ maxHeight: 220, overflowY: 'auto' }}>
                    {memberList.map((m) => (
                      <label key={m.id} className="adm-check">
                        <input type="checkbox" checked={picked.includes(m.id)} onChange={() => setPicked((p) => (p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id]))} />
                        <div><b>{m.name}</b><span>{m.email}</span></div>
                      </label>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button type="button" className="adm-btn teal" onClick={grant} disabled={busy || picked.length === 0}>มอบคูปอง{picked.length ? ` (${picked.length})` : ''}</button>
                  <span className="adm-hint" style={{ margin: 0 }}>ผู้ใช้ที่เปิดการแจ้งเตือนจะได้รับแจ้ง</span>
                </div>
              </>
            )}

            {coupon.distribution !== 'public' && codes.length > 0 && (
              <>
                {/* .adm-search grows along a row (flex 1 1 260px); keep it in a row here. */}
                <div style={{ display: 'flex' }}>
                  <AdminSearch value={codeQ} onChange={setCodeQ} placeholder="ค้นหารหัสหรือผู้ถือ" />
                </div>
                <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                  <table className="adm-table">
                    <thead><tr><th>รหัส</th><th>ผู้ถือ</th><th>สถานะ</th><th /></tr></thead>
                    <tbody>
                      {shownCodes.map((c) => (
                        <tr key={c.id}>
                          <td><span className="adm-code">{c.code}</span></td>
                          <td className="adm-meta">{c.owner_name || '—'}</td>
                          <td>{c.used_booking ? <Badge tone="ok">ใช้แล้ว</Badge> : c.owner_user_id ? <Badge tone="teal">เก็บแล้ว</Badge> : <Badge tone="mute">ยังไม่ใช้</Badge>}</td>
                          <td style={{ textAlign: 'right' }}>{!c.used_booking && <button type="button" className="adm-btn sm danger" onClick={() => withdraw(c.code)}>ถอน</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-card-head"><h3 className="adm-h">ประวัติการใช้</h3><span className="adm-meta">{uses.length} รายการ</span></div>
        {uses.length === 0 ? (
          <div className="adm-empty">ยังไม่มีการใช้คูปองนี้</div>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead><tr><th>กิจกรรม</th><th>ผู้ใช้</th><th>รหัส</th><th>ราคาก่อนลด</th><th>ส่วนลด</th><th>จ่ายจริง</th><th>สถานะ</th></tr></thead>
              <tbody>
                {uses.map((u) => (
                  <tr key={u.id}>
                    <td><Link href={`/admin/workshops/${u.workshop_id}/attendance`} className="adm-link-title">{u.workshop_title}</Link><div className="adm-meta">{u.workshop_date}</div></td>
                    <td>{u.user_name || '—'}<div className="adm-meta">{u.user_email}</div></td>
                    <td><span className="adm-code">{u.coupon_code}</span></td>
                    <td>{baht(u.list_amount ?? u.amount + u.discount_amount)}</td>
                    <td>−{baht(u.discount_amount)}{u.host_discount ? <div className="adm-meta">ผู้จัด {baht(u.host_discount)}</div> : null}</td>
                    <td>{baht(u.amount)}</td>
                    <td>
                      {!u.alive ? <Badge tone="mute">ยกเลิก / หมดเวลา</Badge> : u.payment_status === 'paid' || u.status === 'confirmed' ? <Badge tone="ok">ชำระแล้ว</Badge> : <Badge tone="warn">รอชำระ</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <CouponForm
          open
          coupon={coupon}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            load();
          }}
        />
      )}
    </>
  );
}
