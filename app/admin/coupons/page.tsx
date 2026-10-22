'use client';

/* Every coupon, how often it is used and what it has cost. Create and edit in
 * a sheet; codes, cards and usage live on each coupon's page. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageLoader } from '@/components/design/PageLoader';
import { AdminHead, AdminSearch, AdminChips, Badge, RowMenu, adminConfirm, adminAlert, adminToast } from '@/components/admin/AdminShell';
import { CouponForm, headlineOf, periodOf, type CouponRow } from './_components/CouponForm';

type Filter = 'all' | 'active' | 'disabled' | 'expired';

const DIST: Record<CouponRow['distribution'], string> = { public: 'รหัสสาธารณะ', unique: 'บัตรรหัสเฉพาะ', wallet: 'คูปองในบัญชี' };
const baht = (n: number) => '฿' + Math.round(n || 0).toLocaleString();

function thaiNow(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 16);
}

function stateOf(c: CouponRow): Exclude<Filter, 'all'> {
  if (c.status !== 'active') return 'disabled';
  if (c.ends_at && thaiNow() > c.ends_at) return 'expired';
  return 'active';
}

export default function AdminCouponsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<CouponRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<CouponRow | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/coupons');
      if (!res.ok) throw new Error(String(res.status));
      const d = (await res.json()) as { coupons?: CouponRow[] };
      setRows(d.coupons || []);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows || []).filter((c) => (filter === 'all' || stateOf(c) === filter) && (!term || [c.name, c.public_code, c.description].filter(Boolean).some((v) => (v as string).toLowerCase().includes(term))));
  }, [rows, filter, q]);

  const n = (f: Filter) => (rows || []).filter((c) => f === 'all' || stateOf(c) === f).length;

  async function setStatus(c: CouponRow, status: 'active' | 'disabled') {
    if (status === 'disabled' && !(await adminConfirm({ title: 'ปิดคูปองนี้?', msg: 'ผู้ใช้จะใช้คูปองนี้ไม่ได้อีก การจองที่ใช้ไปแล้วยังคงราคาเดิม', ok: 'ปิดคูปอง', danger: true }))) return;
    const res = await fetch(`/api/admin/coupons/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    if (res.ok) {
      adminToast(status === 'active' ? 'เปิดคูปองแล้ว' : 'ปิดคูปองแล้ว');
      load();
    }
  }

  async function remove(c: CouponRow) {
    if (!(await adminConfirm({ title: 'ลบคูปองนี้?', msg: 'รหัสทั้งหมดของคูปองนี้จะถูกลบด้วย ลบได้เฉพาะคูปองที่ยังไม่มีคนใช้', ok: 'ลบ', danger: true }))) return;
    const res = await fetch(`/api/admin/coupons/${c.id}`, { method: 'DELETE' });
    const d = (await res.json()) as { error?: string };
    if (!res.ok) {
      await adminAlert('ลบไม่ได้', d.error);
      return;
    }
    adminToast('ลบคูปองแล้ว');
    load();
  }

  if (!rows && !loadError) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256 }}>
        <PageLoader />
      </div>
    );
  }

  const menu = (c: CouponRow) => [
    { label: 'ดูรายละเอียด', href: `/admin/coupons/${c.id}` },
    { label: 'แก้ไข', onClick: () => setEditing(c) },
    c.status === 'active' ? { label: 'ปิดคูปอง', onClick: () => setStatus(c, 'disabled') } : { label: 'เปิดคูปอง', onClick: () => setStatus(c, 'active') },
    { label: 'ลบ', onClick: () => remove(c), danger: true, disabled: (c.used || 0) > 0 },
  ];

  const badge = (c: CouponRow) => {
    const s = stateOf(c);
    return <Badge tone={s === 'active' ? 'ok' : s === 'expired' ? 'warn' : 'mute'}>{s === 'active' ? 'เปิดอยู่' : s === 'expired' ? 'หมดอายุ' : 'ปิด'}</Badge>;
  };
  const codeCell = (c: CouponRow) =>
    c.distribution === 'public' ? <span className="adm-code">{c.public_code}</span> : <span className="adm-meta">{c.distribution === 'unique' ? `${c.codes || 0} ใบ · เก็บแล้ว ${c.claimed || 0}` : `${c.codes || 0} คน`}</span>;

  return (
    <>
      <AdminHead
        eyebrow="admin · coupons"
        title="คูปอง"
        sub="ส่วนลดและบัตรฟรี — สร้างรหัส บัตรพิมพ์ หรือมอบเข้าบัญชีผู้ใช้"
        actions={<button type="button" className="adm-btn teal" onClick={() => setCreating(true)}>+ สร้างคูปอง</button>}
      />
      {loadError ? (
        <div className="adm-card adm-empty">โหลดข้อมูลไม่สำเร็จ</div>
      ) : (
        <>
          <div className="adm-toolbar">
            <AdminSearch value={q} onChange={setQ} placeholder="ค้นหาชื่อคูปองหรือรหัส" />
            <AdminChips
              value={filter}
              onChange={setFilter}
              items={[
                { key: 'all', label: 'ทั้งหมด', n: n('all') },
                { key: 'active', label: 'เปิดอยู่', n: n('active') },
                { key: 'expired', label: 'หมดอายุ', n: n('expired') },
                { key: 'disabled', label: 'ปิด', n: n('disabled') },
              ]}
            />
          </div>
          {shown.length === 0 ? (
            <div className="adm-card adm-empty">{rows && rows.length === 0 ? 'ยังไม่มีคูปอง — กด “สร้างคูปอง” เพื่อเริ่ม' : 'ไม่พบคูปอง'}</div>
          ) : (
            <div className="adm-card">
              <div className="adm-table-wrap has-cards">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>คูปอง</th>
                      <th>รูปแบบ</th>
                      <th>รหัส</th>
                      <th>ใช้ไป</th>
                      <th>ส่วนลดรวม</th>
                      <th>ช่วงเวลา</th>
                      <th>สถานะ</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <Link href={`/admin/coupons/${c.id}`} className="adm-link-title">{c.name}</Link>
                          <div className="adm-meta">{headlineOf(c)}</div>
                        </td>
                        <td>{DIST[c.distribution]}</td>
                        <td>{codeCell(c)}</td>
                        <td>{c.used || 0}{c.max_uses ? ` / ${c.max_uses}` : ''}</td>
                        <td>{baht(c.discount_total || 0)}</td>
                        <td className="adm-meta">{periodOf(c)}</td>
                        <td>{badge(c)}</td>
                        <td style={{ textAlign: 'right' }}><RowMenu items={menu(c)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="adm-mcards">
                {shown.map((c) => (
                  <div key={c.id} className="adm-mcard">
                    <div className="adm-mcard-top">
                      <div>
                        <Link href={`/admin/coupons/${c.id}`} className="adm-mcard-title" style={{ color: 'inherit', textDecoration: 'none' }}>{c.name}</Link>
                        <div className="adm-mcard-sub">{headlineOf(c)} · {DIST[c.distribution]}</div>
                      </div>
                      <RowMenu items={menu(c)} />
                    </div>
                    <div className="adm-badges">
                      {badge(c)}
                      <Badge tone="info">ใช้ไป {c.used || 0}{c.max_uses ? `/${c.max_uses}` : ''}</Badge>
                      {c.distribution === 'public' && <Badge tone="teal">{c.public_code}</Badge>}
                    </div>
                    <div className="adm-meta">{periodOf(c)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {(creating || editing) && (
        <CouponForm
          open
          coupon={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(id) => {
            const wasNew = creating;
            setCreating(false);
            setEditing(null);
            if (wasNew && id) router.push(`/admin/coupons/${id}`);
            else load();
          }}
        />
      )}
    </>
  );
}
