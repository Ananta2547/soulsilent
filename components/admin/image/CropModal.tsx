'use client';

import { useRef, useState } from 'react';
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type Crop,
  type PixelCrop,
} from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import type { AspectSpec } from '@/lib/image-aspects';
import type { CropBox } from '@/lib/types';

export type CropModalResult = {
  /** Final cropped image — what we upload to R2. */
  blob: Blob;
  /** % crop coords (storage-friendly, resolution-independent). */
  crop: CropBox;
  /** Primary aspect actually used. */
  aspect: number;
};

type Props = {
  /** Image to crop — either a dataURL (just-picked file) or an existing URL (re-crop). */
  src: string;
  /** Primary aspect — bounding box the admin actually drags. */
  primary: AspectSpec;
  /**
   * Other placements rendered as dashed overlays inside the crop area so the
   * admin can see how their crop will be masked elsewhere. Each overlay is
   * centered horizontally + vertically inside the primary crop box.
   */
  overlays?: AspectSpec[];
  /** Restore previous crop coords when re-cropping. % unit. */
  initialCrop?: CropBox;
  onCancel: () => void;
  onSave: (result: CropModalResult) => void | Promise<void>;
};

export function CropModal({ src, primary, overlays = [], initialCrop, onCancel, onSave }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop | undefined>(
    initialCrop ? { ...initialCrop, unit: '%' as const } : undefined
  );
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    if (initialCrop) {
      // Already restored from initialCrop — also seed completedCrop for the
      // save button. We materialize into pixel coords on save.
      return;
    }
    const { width, height } = e.currentTarget;
    const next = centerCrop(
      makeAspectCrop({ unit: '%', width: 90 }, primary.ratio, width, height),
      width,
      height
    );
    setCrop(next);
  }

  async function handleSave() {
    if (!imgRef.current) return;
    setBusy(true);
    setError(null);
    try {
      // Resolve a pixel crop. If user never moved the box (no completedCrop yet),
      // fall back to the current `crop` * image natural size.
      const img = imgRef.current;
      let pxCrop: PixelCrop | undefined = completedCrop;
      if (!pxCrop && crop) {
        const isPct = crop.unit === '%';
        pxCrop = {
          unit: 'px',
          x: isPct ? (crop.x / 100) * img.width : crop.x,
          y: isPct ? (crop.y / 100) * img.height : crop.y,
          width: isPct ? (crop.width / 100) * img.width : crop.width,
          height: isPct ? (crop.height / 100) * img.height : crop.height,
        };
      }
      if (!pxCrop || pxCrop.width < 4 || pxCrop.height < 4) {
        setError('กรุณาเลือกพื้นที่ครอบตัด');
        return;
      }
      const blob = await renderCropToBlob(img, pxCrop);

      // Persist as % so the meta is resolution-agnostic — re-crops always restore correctly
      const cropPct: CropBox = {
        unit: '%',
        x: (pxCrop.x / img.width) * 100,
        y: (pxCrop.y / img.height) * 100,
        width: (pxCrop.width / img.width) * 100,
        height: (pxCrop.height / img.height) * 100,
      };
      await onSave({ blob, crop: cropPct, aspect: primary.ratio });
    } catch (e) {
      setError((e as Error).message || 'ครอบตัดไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-lighter flex items-center justify-between gap-4">
          <div>
            <h3 className="font-heading text-lg text-dark">ครอบตัดรูปภาพ</h3>
            <p className="text-xs text-gray mt-0.5">
              กรอบหลัก: <b>{primary.label}</b>
              {overlays.length > 0 && (
                <>
                  {' '}
                  · เส้นประ:{' '}
                  {overlays.map((o, i) => (
                    <span key={i} className="ml-1">
                      {o.label}
                      {i < overlays.length - 1 ? ',' : ''}
                    </span>
                  ))}
                </>
              )}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="text-gray hover:text-dark text-xl flex-shrink-0"
            aria-label="close"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 flex justify-center bg-gray-lighter/30">
          <div style={{ position: 'relative', maxHeight: '60vh' }}>
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={primary.ratio}
              keepSelection
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={src}
                alt="crop source"
                onLoad={handleImageLoad}
                crossOrigin="anonymous"
                style={{ maxHeight: '60vh', display: 'block' }}
              />
            </ReactCrop>
            {/* Multi-aspect overlay guides — drawn inside the primary crop area */}
            <OverlayGuides crop={completedCrop ?? crop} overlays={overlays} primary={primary} />
          </div>
        </div>

        {error && (
          <div className="px-4 py-2 bg-red-50 text-red-700 text-sm border-t border-red-200">
            {error}
          </div>
        )}

        <div className="p-4 border-t border-gray-lighter flex justify-end gap-2">
          <button onClick={onCancel} className="btn-ghost text-sm">
            ยกเลิก
          </button>
          <button onClick={handleSave} disabled={busy} className="btn-primary text-sm">
            {busy ? 'กำลังบันทึก...' : 'บันทึกการครอบตัด'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Render dashed boxes inside the primary crop area to preview how the image
 * will be masked at other aspect ratios. Each overlay is centered.
 */
function OverlayGuides({
  crop,
  overlays,
  primary,
}: {
  crop: Crop | undefined;
  overlays: AspectSpec[];
  primary: AspectSpec;
}) {
  if (!crop || overlays.length === 0) return null;
  // We can only overlay reliably if we have pixel coords of the crop relative
  // to the displayed image. react-image-crop renders selection absolutely
  // inside its own container — we mirror that.
  const isPct = crop.unit === '%';
  // Use percentages of the displayed image. Selection rect in % of image.
  const cropPct =
    isPct
      ? { x: crop.x, y: crop.y, w: crop.width, h: crop.height }
      : null; // pixel mode — skip overlay (rare; would need image dim refs)

  if (!cropPct) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
      }}
    >
      {overlays.map((o, i) => {
        // Skip if same as primary
        if (Math.abs(o.ratio - primary.ratio) < 0.01) return null;
        // Compute the inscribed (centered) box at ratio `o.ratio` inside the
        // primary crop rectangle. cropPct is in % of the displayed image; the
        // displayed image fills the container 1:1 by react-image-crop layout.
        const cropAspect = primary.ratio;
        let oW = cropPct.w;
        let oH = (oW / o.ratio) * cropAspect; // express height in cropPct's % units
        // If oH > crop height, scale by height instead
        if (oH > cropPct.h) {
          oH = cropPct.h;
          oW = (oH * o.ratio) / cropAspect;
        }
        const oX = cropPct.x + (cropPct.w - oW) / 2;
        const oY = cropPct.y + (cropPct.h - oH) / 2;
        const color = ['#f5c243', '#3478ff', '#ec4899'][i % 3];
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${oX}%`,
              top: `${oY}%`,
              width: `${oW}%`,
              height: `${oH}%`,
              outline: `2px dashed ${color}`,
              outlineOffset: -1,
              pointerEvents: 'none',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: -22,
                left: 0,
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10,
                color: '#fff',
                background: color,
                padding: '2px 6px',
                borderRadius: 4,
                whiteSpace: 'nowrap',
              }}
            >
              {o.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Crop a loaded image to a pixel rect via canvas → JPEG blob. */
async function renderCropToBlob(img: HTMLImageElement, crop: PixelCrop): Promise<Blob> {
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
