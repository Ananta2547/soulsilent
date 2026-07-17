'use client';

import { useMemo } from 'react';
import { getProvinces, getDistricts, getSubdistricts } from '@/lib/thai-addresses';

type Value = { province: string; district: string; subdistrict: string };

type Props = {
  value: Value;
  onChange: (next: Value) => void;
};

export function AddressPicker({ value, onChange }: Props) {
  const provinces = useMemo(() => getProvinces(), []);
  const districts = useMemo(() => getDistricts(value.province), [value.province]);
  const subdistricts = useMemo(
    () => getSubdistricts(value.province, value.district),
    [value.province, value.district]
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div>
        <label className="block text-xs font-medium text-dark mb-1">จังหวัด</label>
        <select
          value={value.province}
          onChange={(e) =>
            onChange({ province: e.target.value, district: '', subdistrict: '' })
          }
          className="input-field"
          required
        >
          <option value="">— เลือกจังหวัด —</option>
          {provinces.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-dark mb-1">อำเภอ / เขต</label>
        <select
          value={value.district}
          onChange={(e) => onChange({ ...value, district: e.target.value, subdistrict: '' })}
          className="input-field"
          required
          disabled={!value.province}
        >
          <option value="">— เลือกอำเภอ —</option>
          {districts.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-dark mb-1">ตำบล / แขวง</label>
        <select
          value={value.subdistrict}
          onChange={(e) => onChange({ ...value, subdistrict: e.target.value })}
          className="input-field"
          required
          disabled={!value.district}
        >
          <option value="">— เลือกตำบล —</option>
          {subdistricts.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
