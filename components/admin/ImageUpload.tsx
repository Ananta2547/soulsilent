'use client';

import { useRef, useState } from 'react';

type Props = {
  /** Current image URL (from form state). Falsy = nothing uploaded yet. */
  value: string;
  onChange: (url: string) => void;
  /** Folder hint for the R2 key, e.g. 'workshop' or 'course'. */
  type: 'workshop' | 'course' | 'location' | 'article';
  label?: string;
  /** Max file size in MB. Defaults to 5. */
  maxMB?: number;
};

export function ImageUpload({ value, onChange, type, label, maxMB = 5 }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('ไฟล์ต้องเป็นรูปภาพ');
      return;
    }
    if (file.size > maxMB * 1024 * 1024) {
      setError(`ไฟล์ใหญ่เกิน ${maxMB}MB`);
      return;
    }

    setUploading(true);
    try {
      // Build a unique R2 key: images/{type}/{uuid}.{ext}
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const id = crypto.randomUUID();
      const key = `images/${type}/${id}.${ext}`;

      const fd = new FormData();
      fd.append('file', file);
      fd.append('key', key);

      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = (await res.json()) as { url?: string; error?: string };

      if (!res.ok || !data.url) {
        setError(data.error || 'อัปโหลดไม่สำเร็จ');
        return;
      }
      onChange(data.url);
    } catch {
      setError('อัปโหลดไม่สำเร็จ');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {label && <label className="block text-sm font-medium text-dark mb-1">{label}</label>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = ''; // allow reselecting the same file
        }}
      />

      {value ? (
        <div className="relative inline-block">
          <img
            src={value}
            alt="preview"
            className="rounded-xl border border-gray-lighter"
            style={{ maxHeight: 160, maxWidth: '100%' }}
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="text-primary text-xs font-medium hover:underline disabled:opacity-50"
            >
              {uploading ? 'กำลังอัปโหลด...' : 'เปลี่ยนรูป'}
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              className="text-red-500 text-xs font-medium hover:underline"
            >
              ลบ
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full px-4 py-8 rounded-xl border-2 border-dashed border-gray-lighter
                     hover:border-primary hover:bg-primary/5 transition-colors text-center
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex flex-col items-center gap-2 text-gray">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-sm font-medium">
              {uploading ? 'กำลังอัปโหลด...' : 'คลิกเพื่ออัปโหลดรูป'}
            </span>
            <span className="text-xs">PNG · JPG · WebP · สูงสุด {maxMB}MB</span>
          </div>
        </button>
      )}

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
