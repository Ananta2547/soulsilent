'use client';

import { useCallback, useEffect, useState } from 'react';
import { Stars as IconStars } from '@/components/design/Icon';

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

/** Local alias so this page keeps its slightly warmer empty-star grey. */
const Stars = ({ n }: { n: number }) => <IconStars value={n} size={13} emptyColor="#d9d2c2" />;

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
      setErr('กรุณาเลือก Workshop และผู้ใช้');
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
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('ลบรีวิวนี้?')) return;
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

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-dark mb-1">รีวิวกิจกรรม</h1>
      <p className="text-sm text-gray mb-6">ทั้งหมด {total} รีวิว</p>

      {/* Create form */}
      <div className="border border-gray-lighter rounded-xl bg-white p-5 mb-8">
        <h2 className="font-semibold text-dark mb-4">เพิ่มรีวิว (แทนผู้ใช้)</h2>
        {err && <div className="mb-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-dark mb-1">Workshop</label>
            <select value={wsId} onChange={(e) => setWsId(e.target.value)} className="input-field">
              <option value="">— เลือก Workshop —</option>
              {workshops.map((w) => (
                <option key={w.id} value={w.id}>{w.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-dark mb-1">ผู้ใช้</label>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className="input-field">
              <option value="">— เลือกผู้ใช้ —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3">
          <label className="block text-xs font-medium text-dark mb-1">คะแนน</label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                className="text-2xl leading-none"
                style={{ color: n <= rating ? '#f5b301' : '#d9d2c2' }}
                aria-label={`${n} ดาว`}
              >
                ★
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <label className="block text-xs font-medium text-dark mb-1">ความคิดเห็น</label>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} className="input-field" placeholder="ข้อความรีวิว..." />
        </div>
        <button
          type="button"
          onClick={create}
          disabled={saving}
          className="mt-4 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'กำลังบันทึก...' : 'เพิ่มรีวิว'}
        </button>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-gray text-sm">กำลังโหลด…</p>
      ) : loadError ? (
        <p className="text-gray text-sm">
          โหลดรีวิวไม่สำเร็จ{' '}
          <button onClick={() => { setLoading(true); load(); }} className="underline text-primary">ลองใหม่</button>
        </p>
      ) : rows.length === 0 ? (
        <p className="text-gray text-sm">ยังไม่มีรีวิว</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="border border-gray-lighter rounded-xl bg-white p-4 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-dark">{r.user_name || '—'}</span>
                  <span className="text-xs text-gray">· {r.workshop_title || '—'}</span>
                  <Stars n={r.rating} />
                </div>
                {r.comment && <p className="text-sm text-dark mt-1 whitespace-pre-line">{r.comment}</p>}
                <div className="text-xs text-gray mt-1">
                  {new Date(r.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleFeatured(r)}
                  title={r.featured ? 'เอาออกจากรีวิวติดดาว' : 'ติดดาว (แสดงหน้าแรก)'}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    r.featured
                      ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                      : 'bg-gray-lighter/60 text-gray hover:bg-gray-lighter'
                  }`}
                >
                  <span aria-hidden style={{ color: r.featured ? '#f5b301' : undefined }}>★</span>
                  {r.featured ? 'ติดดาวแล้ว' : 'ติดดาว'}
                </button>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  disabled={busyId === r.id}
                  className="text-red-500 text-xs font-medium hover:underline disabled:opacity-50"
                >
                  {busyId === r.id ? 'กำลังลบ...' : 'ลบ'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
