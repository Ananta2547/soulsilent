'use client';

import { PageLoader } from '@/components/design/PageLoader';

import { useEffect, useState } from 'react';
import type { Location, User, ImageMeta } from '@/lib/types';
import { AddressPicker } from '@/components/admin/AddressPicker';
import { GalleryEditor } from '@/components/admin/GalleryEditor';
import { ImageUploader } from '@/components/admin/image/ImageUploader';
import { ASPECTS } from '@/lib/image-aspects';
import { parseImageMeta } from '@/lib/image-meta';
import { AdminHead, AdminSearch, AdminSheet, SheetSection, Badge, RowMenu, type MenuItem } from '@/components/admin/AdminShell';

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
  const [query, setQuery] = useState('');

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
    (async () => {
      await fetchAll();
    })();
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256 }}>
        <PageLoader />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="adm-card adm-empty">
        <p style={{ margin: '0 0 12px' }}>โหลดข้อมูลไม่สำเร็จ</p>
        <button onClick={() => { setLoading(true); fetchAll(); }} className="adm-btn sm">
          ลองใหม่
        </button>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const shown = locations.filter((l) => !q || [l.name, l.province, l.district, l.subdistrict].some((s) => (s || '').toLowerCase().includes(q)));
  const openNew = () => {
    setShowForm(true);
    setEditingId(null);
    setForm(emptyLocation);
  };
  const menuOf = (loc: Location): MenuItem[] => [
    { label: 'ดูหน้าจริง ↗', onClick: () => window.open(`/locations/${loc.id}`, '_blank', 'noopener') },
    { label: 'ลบสถานที่', danger: true, onClick: () => handleDelete(loc.id) },
  ];
  const thumb = (loc: Location, size: number) => {
    const main = safeParseArray<string>(loc.gallery_json, [])[0];
    return (
      <span className="adm-thumb" style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {main ? <img src={main} alt="" /> : <span className="adm-meta">—</span>}
      </span>
    );
  };

  return (
    <>
      <AdminHead
        eyebrow="admin · locations"
        title="สถานที่"
        sub={`ทั้งหมด ${locations.length} สถานที่ · ที่อยู่ · แกลเลอรี · สิ่งอำนวยความสะดวก`}
        actions={
          <button onClick={openNew} className="adm-btn teal">
            + เพิ่มสถานที่
          </button>
        }
      />

      <div className="adm-toolbar">
        <AdminSearch value={query} onChange={setQuery} placeholder="ค้นหาชื่อสถานที่หรือจังหวัด" />
      </div>

      <div className="adm-card">
        {shown.length === 0 ? (
          <div className="adm-empty">{locations.length === 0 ? 'ยังไม่มีสถานที่ในระบบ' : 'ไม่พบรายการที่ตรงกับเงื่อนไข'}</div>
        ) : (
          <>
            <div className="adm-table-wrap has-cards">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>สถานที่</th>
                    <th>จังหวัด</th>
                    <th>เขต · ตำบล</th>
                    <th className="num">ที่จอด รถ · มอไซค์</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((loc) => (
                    <tr key={loc.id}>
                      <td>
                        <div className="adm-cell-title">
                          {thumb(loc, 44)}
                          <b>{loc.name}</b>
                        </div>
                      </td>
                      <td>{loc.province}</td>
                      <td className="adm-meta">
                        {loc.district} · {loc.subdistrict}
                      </td>
                      <td className="num adm-mono" style={{ fontSize: 13 }}>
                        {loc.car_parking ?? 0} · {loc.motorcycle_parking ?? 0}
                      </td>
                      <td className="act">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <button onClick={() => handleEdit(loc)} className="adm-btn sm">
                            แก้ไข
                          </button>
                          <RowMenu items={menuOf(loc)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="adm-mcards">
              {shown.map((loc) => (
                <div key={loc.id} className="adm-mcard">
                  <div className="adm-mcard-top">
                    {thumb(loc, 48)}
                    <div>
                      <div className="adm-mcard-title">{loc.name}</div>
                      <div className="adm-mcard-sub">
                        {loc.province} · {loc.district}
                      </div>
                    </div>
                  </div>
                  <div className="adm-meta">
                    ที่จอดรถ {loc.car_parking ?? 0} คัน · มอเตอร์ไซค์ {loc.motorcycle_parking ?? 0} คัน
                  </div>
                  <div className="adm-mcard-acts">
                    <button onClick={() => handleEdit(loc)} className="adm-btn sm">
                      แก้ไข
                    </button>
                    <RowMenu items={menuOf(loc)} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <AdminSheet
        open={showForm}
        onClose={() => setShowForm(false)}
        eyebrow="admin · locations"
        title={editingId ? 'แก้ไขสถานที่' : 'เพิ่มสถานที่ใหม่'}
        sub={editingId ? form.name : undefined}
        footer={
          <>
            <button type="button" onClick={() => setShowForm(false)} className="adm-btn">
              ยกเลิก
            </button>
            <button type="submit" form="loc-form" disabled={saving} className="adm-btn teal">
              {saving ? 'กำลังบันทึก…' : 'บันทึก'}
            </button>
          </>
        }
      >
        <form id="loc-form" onSubmit={handleSubmit}>
          <SheetSection n={1} title="ข้อมูลพื้นฐาน">
            <div className="adm-field">
              <label htmlFor="loc-name">ชื่อสถานที่</label>
              <input
                id="loc-name"
                value={form.name ?? ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="เช่น soulsilent studio · บ้านริมทะเล"
                required
              />
            </div>
            <div className="adm-field">
              <label htmlFor="loc-details">รายละเอียดสถานที่</label>
              <textarea
                id="loc-details"
                value={form.details ?? ''}
                onChange={(e) => setForm({ ...form, details: e.target.value })}
                rows={3}
                placeholder="บรรยากาศ · สิ่งที่น่าสนใจ · ทางเข้า"
              />
            </div>
          </SheetSection>

          <SheetSection n={2} title="ที่อยู่">
            <AddressPicker
              value={{ province: form.province, district: form.district, subdistrict: form.subdistrict }}
              onChange={(v) => setForm({ ...form, province: v.province, district: v.district, subdistrict: v.subdistrict })}
            />
            <div className="adm-field">
              <label htmlFor="loc-addr">ที่อยู่สถานที่</label>
              <textarea
                id="loc-addr"
                value={form.address_detail ?? ''}
                onChange={(e) => setForm({ ...form, address_detail: e.target.value })}
                rows={2}
                placeholder="บ้านเลขที่ · ซอย · ถนน · จุดสังเกต"
              />
              <p className="adm-hint">แสดงในหน้ารายละเอียดสถานที่</p>
            </div>
            <div className="adm-field">
              <label htmlFor="loc-map">ลิงก์ Google Maps</label>
              <input id="loc-map" value={form.map_url ?? ''} onChange={(e) => setForm({ ...form, map_url: e.target.value })} placeholder="https://maps.app.goo.gl/..." />
            </div>
          </SheetSection>

          <SheetSection n={3} title="สิ่งอำนวยความสะดวก">
            <div className="adm-grid">
              <div className="adm-field">
                <label htmlFor="loc-car">ที่จอดรถยนต์ (คัน)</label>
                <input
                  id="loc-car"
                  type="number"
                  min={0}
                  value={form.car_parking ?? 0}
                  onChange={(e) => setForm({ ...form, car_parking: Math.max(0, +e.target.value) })}
                />
              </div>
              <div className="adm-field">
                <label htmlFor="loc-moto">ที่จอดมอเตอร์ไซค์ (คัน)</label>
                <input
                  id="loc-moto"
                  type="number"
                  min={0}
                  value={form.motorcycle_parking ?? 0}
                  onChange={(e) => setForm({ ...form, motorcycle_parking: Math.max(0, +e.target.value) })}
                />
              </div>
            </div>
          </SheetSection>

          <SheetSection n={4} title="รูปภาพ">
            <div className="adm-field">
              <span className="adm-field-label">แกลเลอรีรูปภาพ</span>
              <GalleryEditor value={form.gallery ?? []} onChange={(g) => setForm({ ...form, gallery: g })} type="location" />
            </div>
            <div className="adm-field">
              <span className="adm-field-label">แผนที่ภาพประกอบ</span>
              <p className="adm-hint" style={{ margin: '0 0 8px' }}>
                อัปโหลดภาพแผนที่/แผนผังของสถานที่ (เช่น hand-drawn map)
              </p>
              <ImageUploader
                folder="location"
                primary={ASPECTS.LOCATION_MAP}
                value={form.graphic_map_url ?? ''}
                meta={form.graphic_map_meta}
                onChange={({ url, meta }) => setForm({ ...form, graphic_map_url: url, graphic_map_meta: meta })}
              />
            </div>
          </SheetSection>

          <SheetSection n={5} title="ข้อมูลภายใน">
            <div className="adm-field">
              <label htmlFor="loc-owner">ผู้รับผิดชอบสถานที่</label>
              <select id="loc-owner" value={form.owner_id ?? ''} onChange={(e) => setForm({ ...form, owner_id: e.target.value })}>
                <option value="">— เลือกผู้รับผิดชอบ —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email}) · {u.role}
                  </option>
                ))}
              </select>
            </div>
            <div className="adm-field">
              <label htmlFor="loc-note">
                หมายเหตุภายใน <Badge tone="warn">admin only</Badge>
              </label>
              <textarea
                id="loc-note"
                value={form.internal_note ?? ''}
                onChange={(e) => setForm({ ...form, internal_note: e.target.value })}
                rows={3}
                placeholder="เก็บข้อมูลภายในที่ผู้เข้าร่วมไม่เห็น เช่น เบอร์ติดต่อเจ้าของ · ราคาเช่า · รหัสประตู"
              />
              <p className="adm-hint">เห็นเฉพาะใน Admin Dashboard</p>
            </div>
          </SheetSection>
        </form>
      </AdminSheet>
    </>
  );
}
