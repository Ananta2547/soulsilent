/**
 * Draws a free-seat invitation (บัตรเชิญ) as a shareable PNG card: brand,
 * workshop title, date/time, place and the claim QR. Client-only (canvas).
 *
 * The card goes to the guest, so it never says who pays for the seat (the
 * comp kind is an internal revenue rule). The poster image is left out on
 * purpose — it is served from another origin and would taint the canvas,
 * which blocks toDataURL.
 */
import QRCode from 'qrcode';

const W = 1080;
const H = 1350;
const C = { ink: '#0d1e1d', teal: '#0d8a7e', cream: '#f4efe4', paper: '#fffdf7', accent: '#f5c243', muted: '#5d6d6b' };

export type InviteCardInput = {
  title: string;
  when: string;
  place?: string | null;
  url: string;
  code: string;
};

/** Thai has no spaces between words, so wrap on word segments. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
  const parts = seg ? Array.from(seg.segment(text), (s) => s.segment) : text.split(/(\s+)/);
  const lines: string[] = [];
  let cur = '';
  let used = 0;
  for (const p of parts) {
    if (ctx.measureText(cur + p).width <= maxW || !cur) {
      cur += p;
      used++;
      continue;
    }
    lines.push(cur.trim());
    if (lines.length === maxLines) break;
    cur = p.trimStart();
    used++;
  }
  if (lines.length < maxLines && cur.trim()) lines.push(cur.trim());
  // Out of room: end the last line with an ellipsis.
  if (used < parts.length && lines.length) {
    let last = lines[lines.length - 1];
    while (last && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
    lines[lines.length - 1] = last + '…';
  }
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function renderInviteCard(input: InviteCardInput): Promise<string> {
  // Canvas text only uses fonts that are already loaded.
  await Promise.all(
    ['600 64px Mitr', '500 34px Mitr', '400 30px "IBM Plex Sans Thai"', '500 26px "JetBrains Mono"', '64px "Archivo Black"'].map((f) =>
      document.fonts.load(f).catch(() => []),
    ),
  );
  const qrUrl = await QRCode.toDataURL(input.url, { width: 560, margin: 1, errorCorrectionLevel: 'M', color: { dark: C.ink, light: '#ffffff' } });
  const qr = await new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = qrUrl;
  });

  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d')!;

  // Background + dotted texture.
  ctx.fillStyle = C.cream;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(13,138,126,.14)';
  for (let y = 14; y < H; y += 28) for (let x = 14; x < W; x += 28) ctx.fillRect(x, y, 2.4, 2.4);

  // Ticket body.
  const M = 60;
  ctx.shadowColor = 'rgba(13,30,29,.18)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  roundRect(ctx, M, M, W - 2 * M, H - 2 * M, 44);
  ctx.fillStyle = C.paper;
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // Header band.
  ctx.save();
  roundRect(ctx, M, M, W - 2 * M, H - 2 * M, 44);
  ctx.clip();
  ctx.fillStyle = C.teal;
  ctx.fillRect(M, M, W - 2 * M, 250);
  ctx.restore();

  ctx.fillStyle = '#ffffff';
  ctx.font = '64px "Archivo Black", Mitr, sans-serif';
  ctx.fillText('AllSoulLearn', M + 56, M + 110);
  ctx.fillStyle = C.accent;
  ctx.font = '500 26px "JetBrains Mono", Mitr, monospace';
  ctx.fillText('INVITATION  ·  บัตรเชิญเข้าร่วมฟรี', M + 58, M + 175);

  // Title.
  let y = M + 345;
  ctx.fillStyle = C.ink;
  ctx.font = '600 58px Mitr, sans-serif';
  for (const line of wrap(ctx, input.title, W - 2 * M - 112, 3)) {
    ctx.fillText(line, M + 56, y);
    y += 74;
  }

  // Date / place.
  y += 6;
  ctx.fillStyle = C.teal;
  ctx.font = '500 34px Mitr, sans-serif';
  ctx.fillText(input.when, M + 56, y);
  if (input.place) {
    y += 50;
    ctx.fillStyle = C.muted;
    ctx.font = '400 30px "IBM Plex Sans Thai", Mitr, sans-serif';
    ctx.fillText(wrap(ctx, input.place, W - 2 * M - 112, 1)[0] || '', M + 56, y);
  }

  // Perforation with punched notches.
  const py = Math.max(y + 60, 760);
  ctx.strokeStyle = 'rgba(13,30,29,.22)';
  ctx.setLineDash([14, 12]);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(M + 40, py);
  ctx.lineTo(W - M - 40, py);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = C.cream;
  for (const cx of [M, W - M]) {
    ctx.beginPath();
    ctx.arc(cx, py, 28, 0, Math.PI * 2);
    ctx.fill();
  }

  // QR + instructions.
  const qs = Math.min(380, H - M - py - 90);
  const qx = M + 56;
  const qy = py + 50;
  roundRect(ctx, qx - 14, qy - 14, qs + 28, qs + 28, 22);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.drawImage(qr, qx, qy, qs, qs);

  const tx = qx + qs + 56;
  const tw = W - M - 56 - tx;
  ctx.fillStyle = C.ink;
  ctx.font = '600 40px Mitr, sans-serif';
  ctx.fillText('สแกนเพื่อรับสิทธิ์', tx, qy + 56);
  ctx.fillStyle = C.muted;
  ctx.font = '400 28px "IBM Plex Sans Thai", Mitr, sans-serif';
  let ty = qy + 108;
  for (const line of wrap(ctx, 'เข้าสู่ระบบแล้วกรอกใบสมัคร ที่นั่งจะเป็นของคุณทันที', tw, 3)) {
    ctx.fillText(line, tx, ty);
    ty += 42;
  }
  ctx.fillStyle = C.teal;
  ctx.font = '500 24px "JetBrains Mono", Mitr, monospace';
  ctx.fillText('FREE · 1 SEAT', tx, qy + qs - 36);
  ctx.fillStyle = C.muted;
  ctx.fillText(`#${input.code}`, tx, qy + qs);

  return cv.toDataURL('image/png');
}
