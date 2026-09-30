'use client';

import { PageLoader } from '@/components/design/PageLoader';

import { useEffect, useState } from 'react';
import type { Location, User, ImageMeta } from '@/lib/types';
import { AddressPicker } from '@/components/admin/AddressPicker';
import { GalleryEditor } from '@/components/admin/GalleryEditor';
import { ImageUploader } from '@/components/admin/image/ImageUploader';
import { ASPECTS } from '@/lib/image-aspects';
import { parseImageMeta } from '@/lib/image-meta';

type LocationForm = {
  name: string;
  province: string;
  district: string;
  subdistrict: string;
  address_detail: string;
  details: string;
  map_url: string;
  car_parking: number;
  motorcycle_parking: number;
  internal_note: string;
  owner_id: string;
  gallery: string[];
  graphic_map_url: string;
  graphic_map_meta: ImageMeta | null;
};

const emptyLocation: LocationForm = {
  name: '',
  province: '',
  district: '',
  subdistrict: '',
  address_detail: '',
  details: '',
  map_url: '',
  car_parking: 0,
  motorcycle_parking: 0,
  internal_note: '',
  owner_id: '',
  gallery: [],
  graphic_map_url: '',
  graphic_map_meta: null,
};

function safeParseArray<T>(json: string | null | undefined, fallback: T[]): T[] {
  if (!json) return fallback;
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as T[]) : fallback;
  } catch {
    return fallback;
  }
}

export default function AdminLocationsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LocationForm>(emptyLocation);
  const [saving, setSaving] = useState(false);

  async function fetchAll() {
    setLoadError(false);
    try {
      const [locRes, userRes] = await Promise.all([
        fetch('/api/locations'),
        fetch('/api/users'),
      ]);
      if (!locRes.ok || !userRes.ok) throw new Error(`HTTP ${locRes.status}/${userRes.status}`);
      const locData = (await locRes.json()) as { locations: Location[] };
      const userData = (await userRes.json()) as { users: User[] };
      setLocations(locData.locations || []);
      setUsers(userData.users || []);
    } catch (e) {
      console.error('Failed to load locations', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
  }, []);

  function handleEdit(loc: Location) {
    setForm({
      name: loc.name,
      province: loc.province,
      district: loc.district,
      subdistrict: loc.subdistrict,
      address_detail: loc.address_detail || '',
      details: loc.details || '',
      map_url: loc.map_url || '',
      car_parking: loc.car_parking ?? 0,
      motorcycle_parking: loc.motorcycle_parking ?? 0,
      internal_note: loc.internal_note || '',
      owner_id: loc.owner_id || '',
      gallery: safeParseArray<string>(loc.gallery_json, []),
      graphic_map_url: loc.graphic_map_url || '',
      graphic_map_meta: parseImageMeta(
        (loc as Location & { graphic_map_meta?: string | null }).graphic_map_meta
      ),
    });
    setEditingId(loc.id);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const url = editingId ? `/api/locations/${editingId}` : '/api/locations';
    const method = editingId ? 'PUT' : 'POST';

    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });

    setSaving(false);
    setShowForm(false);
    setEditingId(null);
    setForm(emptyLocation);
    fetchAll();
  }

  async function handleDelete(id: string) {
    if (!confirm('ต้องการลบสถานที่นี้? กิจกรรมที่อ้างอิงจะถูกถอนการเชื่อม')) return;
    await fetch(`/api/locations/${id}`, { method: 'DELETE' });
    fetchAll();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <PageLoader />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted">
        <p>โหลดข้อมูลไม่สำเร็จ</p>
        <button onClick={() => { setLoading(true); fetchAll(); }} className="border border-primary text-primary rounded-full px-6 py-2 text-sm font-semibold">ลองใหม่</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-mono text-primary tracking-[.2em] uppercase mb-2">
            admin · locations
          </p>
          <h1 className="font-heading text-3xl text-dark">จัดการสถานที่</h1>
          <p className="text-sm text-gray mt-1">
            ทั้งหมด {locations.length} สถานที่ · ที่อยู่ · galler · สิ่งอำนวยความสะดวก
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingId(null);
            setForm(emptyLocation);
          }}
          className="btn-primary text-sm"
        >
          + เพิ่มสถานที่
        </button>
      </header>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
            <h2 className="font-heading text-xl text-dark mb-4">
              {editingId ? 'แก้ไขสถานที่' : 'เพิ่มสถานที่ใหม่'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Basic */}
              <div>
                <label className="block text-sm font-medium text-dark mb-1">ชื่อสถานที่</label>
                <input
                  value={form.name ?? ''}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input-field"
                  placeholder="เช่น soulsilent studio · บ้านริมทะเล"
                  required
                />
              </div>

              {/* Address (cascading) */}
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-dark">ที่อยู่</legend>
                <AddressPicker
                  value={{
                    province: form.province,
                    district: form.district,
                    subdistrict: form.subdistrict,
                  }}
                  onChange={(v) =>
                    setForm({
                      ...form,
                      province: v.province,
                      district: v.district,
                      subdistrict: v.subdistrict,
                    })
                  }
                />
              </fieldset>

              {/* Details + map link */}
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-dark mb-1">
                    ที่อยู่สถานที่
                  </label>
                  <textarea
                    value={form.address_detail ?? ''}
                    onChange={(e) => setForm({ ...form, address_detail: e.target.value })}
                    className="input-field"
                    rows={2}
                    placeholder="บ้านเลขที่ · ซอย · ถนน · จุดสังเกต (แสดงในหน้ารายละเอียดสถานที่)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark mb-1">
                    รายละเอียดสถานที่ (เกี่ยวกับสถานที่)
                  </label>
                  <textarea
                    value={form.details ?? ''}
                    onChange={(e) => setForm({ ...form, details: e.target.value })}
                    className="input-field"
                    rows={3}
                    placeholder="บรรยากาศ · สิ่งที่น่าสนใจ · ทางเข้า"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark mb-1">
                    ลิงก์ Google Maps
                  </label>
                  <input
                    value={form.map_url ?? ''}
                    onChange={(e) => setForm({ ...form, map_url: e.target.value })}
                    className="input-field"
                    placeholder="https://maps.app.goo.gl/..."
                  />
                </div>
              </div>

              {/* Amenities */}
              <fieldset className="border border-gray-lighter rounded-xl p-4 bg-surface/40">
                <legend className="text-sm font-medium text-dark px-2">
                  สิ่งอำนวยความสะดวก
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-dark mb-1">
                      🚗 จอดรถยนต์ (คัน)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={form.car_parking ?? 0}
                      onChange={(e) =>
                        setForm({ ...form, car_parking: Math.max(0, +e.target.value) })
                      }
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-dark mb-1">
                      🛵 จอดมอเตอร์ไซค์ (คัน)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={form.motorcycle_parking ?? 0}
                      onChange={(e) =>
                        setForm({ ...form, motorcycle_parking: Math.max(0, +e.target.value) })
                      }
                      className="input-field"
                    />
                  </div>
                </div>
              </fieldset>

              {/* Owner */}
              <div>
                <label className="block text-sm font-medium text-dark mb-1">
                  ผู้รับผิดชอบสถานที่
                </label>
                <select
                  value={form.owner_id ?? ''}
                  onChange={(e) => setForm({ ...form, owner_id: e.target.value })}
                  className="input-field"
                >
                  <option value="">— เลือกผู้รับผิดชอบ —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email}) · {u.role}
                    </option>
                  ))}
                </select>
              </div>

              {/* Internal note */}
              <div>
                <label className="block text-sm font-medium text-dark mb-1">
                  หมายเหตุภายใน
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-accent/30 text-accent-dark uppercase tracking-wider">
                    admin only
                  </span>
                </label>
                <textarea
                  value={form.internal_note ?? ''}
                  onChange={(e) => setForm({ ...form, internal_note: e.target.value })}
                  className="input-field"
                  rows={3}
                  placeholder="เก็บข้อมูลภายในที่ผู้เข้าร่วมไม่เห็น เช่น เบอร์ติดต่อเจ้าของ · ราคาเช่า · รหัสประตู"
                />
                <p className="text-xs text-gray mt-1">เห็นเฉพาะใน Admin Dashboard</p>
              </div>

              {/* Gallery */}
              <fieldset className="border border-gray-lighter rounded-xl p-4 bg-surface/40">
                <legend className="text-sm font-medium text-dark px-2">
                  แกลเลอรีรูปภาพ
                </legend>
                <GalleryEditor
                  value={form.gallery ?? []}
                  onChange={(g) => setForm({ ...form, gallery: g })}
                  type="location"
                />
              </fieldset>

              {/* Graphic map */}
              <fieldset className="border border-gray-lighter rounded-xl p-4 bg-surface/40">
                <legend className="text-sm font-medium text-dark px-2">แผนที่ภาพประกอบ</legend>
                <p className="text-xs text-gray mb-3">
                  อัปโหลดภาพแผนที่/แผนผังของสถานที่ (เช่น hand-drawn map)
                </p>
                <ImageUploader
                  folder="location"
                  primary={ASPECTS.LOCATION_MAP}
                  value={form.graphic_map_url ?? ''}
                  meta={form.graphic_map_meta}
                  onChange={({ url, meta }) =>
                    setForm({ ...form, graphic_map_url: url, graphic_map_meta: meta })
                  }
                />
              </fieldset>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-ghost flex-1">
                  ยกเลิก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface">
              <tr>
                <th className="text-left py-3 px-4 text-gray font-medium w-16">รูป</th>
                <th className="text-left py-3 px-4 text-gray font-medium">ชื่อ</th>
                <th className="text-left py-3 px-4 text-gray font-medium">จังหวัด</th>
                <th className="text-left py-3 px-4 text-gray font-medium">เขต/ตำบล</th>
                <th className="text-right py-3 px-4 text-gray font-medium">ที่จอด</th>
                <th className="text-right py-3 px-4 text-gray font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((loc) => {
                const gallery = safeParseArray<string>(loc.gallery_json, []);
                const main = gallery[0];
                return (
                  <tr key={loc.id} className="border-t border-gray-lighter hover:bg-surface/50">
                    <td className="py-2 px-4">
                      <div
                        className="w-12 h-12 rounded-lg bg-cream overflow-hidden flex items-center justify-center"
                      >
                        {main ? (
                          <img src={main} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-gray text-xs">—</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-dark font-medium">{loc.name}</td>
                    <td className="py-3 px-4 text-gray">{loc.province}</td>
                    <td className="py-3 px-4 text-gray text-xs">
                      {loc.district} · {loc.subdistrict}
                    </td>
                    <td className="py-3 px-4 text-right text-gray text-xs">
                      🚗 {loc.car_parking ?? 0} · 🛵 {loc.motorcycle_parking ?? 0}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={`/locations/${loc.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-dark text-xs font-medium hover:text-primary hover:underline"
                        >
                          ดูหน้าจริง ↗
                        </a>
                        <button
                          onClick={() => handleEdit(loc)}
                          className="text-primary text-xs font-medium hover:underline"
                        >
                          แก้ไข
                        </button>
                        <button
                          onClick={() => handleDelete(loc.id)}
                          className="text-red-500 text-xs font-medium hover:underline"
                        >
                          ลบ
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {locations.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray">
                    ยังไม่มีสถานที่ในระบบ
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
