'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminConfirm, AdminHead, AdminChips, AdminSheet, SheetSection } from '@/components/admin/AdminShell';
import { sqliteToMs } from '@/lib/datetime';
import { AdmSelect } from '@/components/admin/pickers';

type ReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  featured: number;
  created_at: string;
  user_name: string | null;
  workshop_title: string | null;
};
type Opt = { id: string; label: string };

export default function AdminReviewsPage() {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [workshops, setWorkshops] = useState<Opt[]>([]);
  const [users, setUsers] = useState<Opt[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Create form
  const [wsId, setWsId] = useState('');
  const [userId, setUserId] = useState('');
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'featured'>('all');

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await fetch('/api/reviews');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { reviews: ReviewRow[]; total: number };
      setRows(data.reviews || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error('Failed to load reviews', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
      try {
        const [w, u] = await Promise.all([fetch('/api/workshops'), fetch('/api/users')]);
        const wd = (await w.json()) as { workshops: { id: string; title: string }[] };
        const ud = (await u.json()) as { users: { id: string; name: string; email: string }[] };
        setWorkshops((wd.workshops || []).map((x) => ({ id: x.id, label: x.title })));
        setUsers((ud.users || []).map((x) => ({ id: x.id, label: `${x.name} (${x.email})` })));
      } catch (e) {
        console.error('Failed to load review form options', e);
      }
    })();
  }, [load]);

  async function create() {
    setErr(null);
    if (!wsId || !userId) {
      setErr('กรุณาเลือกกิจกรรมและผู้เข้าร่วม');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workshop_id: wsId, user_id: userId, rating, comment }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(data.error || 'บันทึกไม่สำเร็จ');
        return;
      }
      setWsId('');
      setUserId('');
      setRating(5);
      setComment('');
      setFormOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!(await adminConfirm({ title: 'ลบรีวิวนี้?', ok: 'ลบรีวิว', danger: true }))) return;
    setBusyId(id);
    try {
      await fetch(`/api/reviews/${id}`, { method: 'DELETE' });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  // Toggle "featured" (ติดดาว) — featured reviews appear in the homepage slider.
  async function toggleFeatured(r: ReviewRow) {
    const next = r.featured ? 0 : 1;
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, featured: next } : x)));
    try {
      await fetch(`/api/reviews/${r.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featured: next }),
      });
    } catch {
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, featured: r.featured } : x)));
    }
  }

  const featuredCount = rows.filter((r) => r.featured).length;
  const shown = filter === 'featured' ? rows.filter((r) => r.featured) : rows;

  return (
    <>
      <AdminHead
        eyebrow="admin · reviews"
        title="รีวิว"
        sub={`ทั้งหมด ${total} รีวิว · ติดดาวเพื่อแสดงในสไลด์หน้าแรก`}
        actions={
          <button type="button" className="adm-btn teal" onClick={() => setFormOpen(true)}>
            + เพิ่มรีวิว
          </button>
        }
      />

      <div className="adm-toolbar">
        <AdminChips
          value={filter}
          onChange={setFilter}
          items={[
            { key: 'all', label: 'ทั้งหมด', n: rows.length },
            { key: 'featured', label: '★ ติดดาว', n: featuredCount },
          ]}
        />
      </div>

      {loading ? (
        <p className="adm-meta">กำลังโหลด…</p>
      ) : loadError ? (
        <div className="adm-card adm-empty">
          <p style={{ margin: '0 0 12px' }}>โหลดรีวิวไม่สำเร็จ</p>
          <button type="button" className="adm-btn sm" onClick={() => { setLoading(true); load(); }}>
            ลองใหม่
          </button>
        </div>
      ) : shown.length === 0 ? (
        <div className="adm-card adm-empty">{filter === 'featured' ? 'ยังไม่มีรีวิวที่ติดดาว' : 'ยังไม่มีรีวิว'}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {shown.map((r) => (
            <article key={r.id} className="adm-card adm-review">
              <div className="adm-review-top">
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{r.user_name || '—'}</div>
                  <div className="adm-meta" style={{ marginTop: 2 }}>
                    {r.workshop_title || '—'} ·{' '}
                    {new Date(sqliteToMs(r.created_at)).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                </div>
                <span className="adm-review-stars" aria-label={`${r.rating} ดาว`}>
                  <span style={{ color: '#f5b301' }}>{'★'.repeat(r.rating)}</span>
                  <span style={{ color: '#d9d2c2' }}>{'★'.repeat(Math.max(0, 5 - r.rating))}</span>
                </span>
              </div>
              {r.comment && <p className="adm-review-text">{r.comment}</p>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => toggleFeatured(r)}
                  title={r.featured ? 'เอาออกจากรีวิวติดดาว' : 'ติดดาว (แสดงหน้าแรก)'}
                  className="adm-btn sm"
                  style={r.featured ? { background: '#fdf1d3', color: '#7a5200' } : undefined}
                  aria-pressed={!!r.featured}
                >
                  <span style={{ color: r.featured ? '#f5b301' : undefined }}>★</span> {r.featured ? 'ติดดาวแล้ว' : 'ติดดาว'}
                </button>
                <div style={{ flex: 1 }} />
                <button type="button" onClick={() => remove(r.id)} disabled={busyId === r.id} className="adm-btn sm danger">
                  {busyId === r.id ? 'กำลังลบ…' : 'ลบ'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <AdminSheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        eyebrow="admin · reviews"
        title="เพิ่มรีวิว"
        sub="บันทึกแทนผู้เข้าร่วม"
        width={560}
        footer={
          <>
            <button type="button" className="adm-btn" onClick={() => setFormOpen(false)}>
              ยกเลิก
            </button>
            <button type="button" className="adm-btn teal" onClick={create} disabled={saving}>
              {saving ? 'กำลังบันทึก…' : 'เพิ่มรีวิว'}
            </button>
          </>
        }
      >
        <SheetSection n={1} title="รายละเอียดรีวิว">
          {err && <div className="adm-notice" style={{ background: '#fde4e1', color: '#a3261a', borderRadius: 14 }}>{err}</div>}
          <div className="adm-field">
            <label htmlFor="rv-ws">กิจกรรม</label>
            <AdmSelect id="rv-ws" value={wsId} onChange={(e) => setWsId(e.target.value)}>
              <option value="">— เลือกกิจกรรม —</option>
              {workshops.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </AdmSelect>
          </div>
          <div className="adm-field">
            <label htmlFor="rv-user">ผู้เข้าร่วม</label>
            <AdmSelect id="rv-user" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">— เลือกผู้เข้าร่วม —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </AdmSelect>
          </div>
          <div className="adm-field">
            <span className="adm-field-label">คะแนน</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  style={{ fontSize: 28, lineHeight: 1, background: 'none', border: 0, cursor: 'pointer', color: n <= rating ? '#f5b301' : '#d9d2c2' }}
                  aria-label={`${n} ดาว`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
          <div className="adm-field">
            <label htmlFor="rv-text">ความคิดเห็น</label>
            <textarea id="rv-text" value={comment} onChange={(e) => setComment(e.target.value)} rows={4} placeholder="ข้อความรีวิว..." />
          </div>
        </SheetSection>
      </AdminSheet>
    </>
  );
}
