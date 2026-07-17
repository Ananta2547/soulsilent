'use client';

import { useRef, useState } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

type Props = {
  /** Ordered array of media URLs (e.g. `/api/media/...`). First = main image. */
  value: string[];
  onChange: (next: string[]) => void;
  /** Folder hint for the R2 key. */
  type: 'location' | 'workshop' | 'course';
  /** Max images allowed. */
  max?: number;
};

export function GalleryEditor({ value, onChange, type, max = 12 }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [cropSrc, setCropSrc] = useState<string | null>(null); // dataURL being cropped
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  function pickFile() {
    fileInputRef.current?.click();
  }

  function handleFile(file: File) {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('ไฟล์ต้องเป็นรูปภาพ');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('ไฟล์ใหญ่เกิน 8MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
  }

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget;
    // Default to a centered 4:3 crop covering 90% of the smaller dimension
    const initial = centerCrop(
      makeAspectCrop({ unit: '%', width: 90 }, 4 / 3, width, height),
      width,
      height
    );
    setCrop(initial);
  }

  async function confirmCrop() {
    if (!completedCrop || !imgRef.current) return;
    setUploading(true);
    setError(null);
    try {
      const blob = await canvasFromCrop(imgRef.current, completedCrop);
      const ext = 'jpg';
      const key = `images/${type}/${crypto.randomUUID()}.${ext}`;
      const fd = new FormData();
      fd.append('file', new File([blob], `${key.split('/').pop()}`, { type: 'image/jpeg' }));
      fd.append('key', key);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error || 'อัปโหลดไม่สำเร็จ');
        return;
      }
      onChange([...value, data.url]);
      setCropSrc(null);
      setCrop(undefined);
      setCompletedCrop(undefined);
    } finally {
      setUploading(false);
    }
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  function moveTo(from: number, to: number) {
    if (from === to) return;
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  return (
    <div>
      {/* Hidden file input */}
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

      {/* Gallery grid */}
      {value.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-3">
          {value.map((url, idx) => (
            <div
              key={`${url}-${idx}`}
              draggable
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIdx != null) moveTo(dragIdx, idx);
                setDragIdx(null);
              }}
              onDragEnd={() => setDragIdx(null)}
              className="relative rounded-xl overflow-hidden border-2 border-gray-lighter group cursor-move"
              style={{
                aspectRatio: '4/3',
                opacity: dragIdx === idx ? 0.5 : 1,
                transition: 'opacity .15s ease',
              }}
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
              {idx === 0 && (
                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-primary text-white text-[10px] font-medium tracking-wide">
                  ★ MAIN
                </span>
              )}
              <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/50 text-white text-[10px] font-mono">
                #{idx + 1}
              </span>
              <button
                type="button"
                onClick={() => remove(idx)}
                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/90 text-red-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="ลบ"
              >
                ×
              </button>
              {idx !== 0 && (
                <button
                  type="button"
                  onClick={() => moveTo(idx, 0)}
                  className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-white/90 text-dark text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                  title="ทำเป็นภาพหลัก"
                >
                  ตั้งเป็นหลัก
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add button */}
      {value.length < max && (
        <button
          type="button"
          onClick={pickFile}
          disabled={uploading}
          className="w-full px-4 py-6 rounded-xl border-2 border-dashed border-gray-lighter
                     hover:border-primary hover:bg-primary/5 transition-colors text-center
                     disabled:opacity-50"
        >
          <div className="flex flex-col items-center gap-1 text-gray">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-sm font-medium">
              {uploading ? 'กำลังอัปโหลด...' : 'เพิ่มรูป'}
            </span>
            <span className="text-xs">
              เลือก + ครอบตัด · {value.length}/{max}
            </span>
          </div>
        </button>
      )}

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      <p className="mt-2 text-xs text-gray">
        ลากเพื่อจัดลำดับ · ภาพอันดับ 1 จะใช้เป็นภาพหลักของสถานที่
      </p>

      {/* Crop modal */}
      {cropSrc && (
        <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-lighter flex items-center justify-between">
              <h3 className="font-heading text-lg text-dark">ครอบตัดรูปภาพ</h3>
              <button
                onClick={() => setCropSrc(null)}
                className="text-gray hover:text-dark text-xl"
                aria-label="close"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 flex justify-center bg-gray-lighter/30">
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={4 / 3}
                keepSelection
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imgRef}
                  src={cropSrc}
                  alt="crop preview"
                  onLoad={onImageLoad}
                  style={{ maxHeight: '60vh' }}
                />
              </ReactCrop>
            </div>
            <div className="p-4 border-t border-gray-lighter flex justify-end gap-2">
              <button onClick={() => setCropSrc(null)} className="btn-ghost text-sm">
                ยกเลิก
              </button>
              <button
                onClick={confirmCrop}
                disabled={uploading || !completedCrop}
                className="btn-primary text-sm"
              >
                {uploading ? 'กำลังบันทึก...' : 'บันทึกครอบตัด'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Convert a completed crop into a JPEG Blob via an off-screen canvas. */
async function canvasFromCrop(img: HTMLImageElement, crop: PixelCrop): Promise<Blob> {
  const scaleX = img.naturalWidth / img.width;
  const scaleY = img.naturalHeight / img.height;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(crop.width * scaleX);
  canvas.height = Math.round(crop.height * scaleY);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d unavailable');
  ctx.drawImage(
    img,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    canvas.width,
    canvas.height
  );
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/jpeg',
      0.9
    );
  });
}
