'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { AspectSpec } from '@/lib/image-aspects';
import type { CropBox, ImageMeta } from '@/lib/types';
import { CropModal, type CropModalResult } from './CropModal';

type Folder = 'workshop' | 'course' | 'location' | 'article' | 'avatar' | 'portfolio' | 'payout' | 'refund';

type Props = {
  /** Final cropped image URL (or empty). */
  value: string;
  /** Crop metadata — set after the first crop. Enables "edit crop" later. */
  meta?: ImageMeta | null;
  /**
   * Called once on save. Always emits both the new URL and the meta. Pass null
   * for meta on clear (or if upload failed). The caller persists both to DB.
   */
  onChange: (next: { url: string; meta: ImageMeta | null }) => void;
  /** Where in R2 to put new uploads — `images/{folder}/{uuid}.jpg`. */
  folder: Folder;
  /** Primary aspect — the bounding box the admin actually drags. */
  primary: AspectSpec;
  /**
   * Other placements rendered as dashed overlays on the crop preview so the
   * admin can see how the image will be re-masked. e.g. cropping at 21:9 for
   * the article hero but showing where the 16:9 card will clip.
   */
  overlays?: AspectSpec[];
  label?: string;
  maxMB?: number;
  /**
   * Custom visual. When provided, the default preview/dropzone UI is replaced by
   * this node (e.g. a banner/avatar). Clicking it opens the file picker when
   * empty, or a ครอบ/เปลี่ยน/ลบ menu when an image already exists. All upload/
   * crop/R2 logic stays inside this component.
   */
  trigger?: ReactNode;
  /** Positioning for the edit menu (e.g. `{ right: 12, top: 12 }`). */
  menuStyle?: CSSProperties;
};

export function ImageUploader({
  value,
  meta,
  onChange,
  folder,
  primary,
  overlays = [],
  label,
  maxMB = 8,
  trigger,
  menuStyle,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [initialCrop, setInitialCrop] = useState<CropBox | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('mousedown', onDoc);
    return () => window.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  function pickFile() {
    fileInputRef.current?.click();
  }

  function handleFile(file: File) {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('ไฟล์ต้องเป็นรูปภาพ');
      return;
    }
    if (file.size > maxMB * 1024 * 1024) {
      setError(`ไฟล์ใหญ่เกิน ${maxMB}MB`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      // Fresh upload — no initial crop coords
      setInitialCrop(undefined);
      setCropSrc(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  function startReCrop() {
    if (!meta?.original_url) {
      // No meta to re-crop from — admin will have to re-pick a file
      pickFile();
      return;
    }
    setInitialCrop(meta.crop);
    setCropSrc(meta.original_url);
  }

  async function handleCropSave(result: CropModalResult) {
    setBusy(true);
    setError(null);
    try {
      // 1) Upload final cropped file (always a fresh R2 object — keeps history sane)
      const ext = 'jpg';
      const finalKey = `images/${folder}/${crypto.randomUUID()}.${ext}`;
      const finalUrl = await uploadBlob(result.blob, finalKey);
      if (!finalUrl) return;

      // 2) Source URL — if re-cropping, reuse existing original. Otherwise the
      // freshly-picked file is currently a dataURL; upload it too so we have a
      // permanent source for future re-crops.
      let originalUrl = meta?.original_url;
      if (!originalUrl) {
        const originalKey = `images/${folder}/_src_${crypto.randomUUID()}.${ext}`;
        const dataUrlBlob = await dataUrlToBlob(cropSrc!);
        const uploaded = await uploadBlob(dataUrlBlob, originalKey);
        if (!uploaded) return;
        originalUrl = uploaded;
      }

      onChange({
        url: finalUrl,
        meta: {
          original_url: originalUrl,
          crop: result.crop,
          aspect: result.aspect,
        },
      });
      setCropSrc(null);
      setInitialCrop(undefined);
    } finally {
      setBusy(false);
    }
  }

  async function uploadBlob(blob: Blob, key: string): Promise<string | null> {
    const fd = new FormData();
    fd.append(
      'file',
      new File([blob], key.split('/').pop() || 'upload.jpg', { type: blob.type || 'image/jpeg' })
    );
    fd.append('key', key);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !data.url) {
      setError(data.error || 'อัปโหลดไม่สำเร็จ');
      return null;
    }
    return data.url;
  }

  const hiddenInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      style={{ display: 'none' }}
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) handleFile(f);
        e.target.value = '';
      }}
    />
  );

  // Custom-trigger mode: caller supplies the visual; clicking it uploads (empty)
  // or opens a ครอบ/เปลี่ยน/ลบ menu (when an image exists). All ref access stays
  // inside event handlers.
  if (trigger !== undefined) {
    const itemBase: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 0, cursor: 'pointer', fontSize: 13.5, borderRadius: 8 };
    const hoverOn = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'var(--cream, #f6f1e6)'; };
    const hoverOff = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'transparent'; };
    return (
      <>
        {hiddenInput}
        <div ref={menuWrapRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
          <button
            type="button"
            onClick={() => (value ? setMenuOpen((o) => !o) : pickFile())}
            style={{ all: 'unset', display: 'block', width: '100%', height: '100%', cursor: busy ? 'wait' : 'pointer' }}
            aria-label={label}
          >
            {trigger}
          </button>
          {menuOpen && (
            <div
              style={{ position: 'absolute', zIndex: 40, minWidth: 170, padding: 6, background: 'var(--paper, #fff)', borderRadius: 12, boxShadow: '0 16px 40px -12px rgba(13,30,29,.4), 0 0 0 1px var(--cream-deep, #ede5cf)', ...menuStyle }}
            >
              <button type="button" style={{ ...itemBase, color: 'var(--ink, #0d1e1d)' }} onMouseEnter={hoverOn} onMouseLeave={hoverOff} onClick={() => { setMenuOpen(false); startReCrop(); }}>
                ✂ ครอบรูป
              </button>
              <button type="button" style={{ ...itemBase, color: 'var(--ink, #0d1e1d)' }} onMouseEnter={hoverOn} onMouseLeave={hoverOff} onClick={() => { setMenuOpen(false); pickFile(); }}>
                🔄 เปลี่ยนรูป
              </button>
              <button type="button" style={{ ...itemBase, color: '#9a4a3f' }} onMouseEnter={hoverOn} onMouseLeave={hoverOff} onClick={() => { setMenuOpen(false); onChange({ url: '', meta: null }); }}>
                🗑 ลบรูป
              </button>
            </div>
          )}
        </div>
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        {cropSrc && (
          <CropModal
            src={cropSrc}
            primary={primary}
            overlays={overlays}
            initialCrop={initialCrop}
            onCancel={() => {
              setCropSrc(null);
              setInitialCrop(undefined);
            }}
            onSave={handleCropSave}
          />
        )}
      </>
    );
  }

  return (
    <div>
      {label && <label className="block text-sm font-medium text-dark mb-1">{label}</label>}

      {hiddenInput}

      {value ? (
        <div className="relative inline-block">
          <img
            src={value}
            alt="preview"
            className="rounded-xl border border-gray-lighter"
            style={{ maxHeight: 160, maxWidth: '100%', aspectRatio: primary.ratio, objectFit: 'cover' }}
          />
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={startReCrop}
              disabled={busy}
              className="text-primary text-xs font-medium hover:underline disabled:opacity-50"
            >
              {meta ? 'แก้ไขการครอบตัด' : 'ครอบตัดอีกครั้ง'}
            </button>
            <button
              type="button"
              onClick={pickFile}
              disabled={busy}
              className="text-gray text-xs font-medium hover:text-primary hover:underline disabled:opacity-50"
            >
              เปลี่ยนรูป
            </button>
            <button
              type="button"
              onClick={() => onChange({ url: '', meta: null })}
              className="text-red-500 text-xs font-medium hover:underline"
            >
              ลบ
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={pickFile}
          disabled={busy}
          className="w-full px-4 py-8 rounded-xl border-2 border-dashed border-gray-lighter
                     hover:border-primary hover:bg-primary/5 transition-colors text-center
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex flex-col items-center gap-2 text-gray">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span className="text-sm font-medium">{busy ? 'กำลังอัปโหลด...' : 'คลิกเพื่ออัปโหลดรูป'}</span>
            <span className="text-xs">
              {primary.label} · max {maxMB}MB
            </span>
          </div>
        </button>
      )}

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      {cropSrc && (
        <CropModal
          src={cropSrc}
          primary={primary}
          overlays={overlays}
          initialCrop={initialCrop}
          onCancel={() => {
            setCropSrc(null);
            setInitialCrop(undefined);
          }}
          onSave={handleCropSave}
        />
      )}
    </div>
  );
}

/* ---------- helpers ---------- */

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}
