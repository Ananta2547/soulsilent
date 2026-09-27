'use client';

/* บัตรเชิญที่นั่งฟรี — admin issues a free seat as a QR invitation card.
 * The seat is held in the admin's name until someone scans the QR, signs in
 * and claims it (/claim/{token}). The three kinds decide what reaches the
 * host's revenue — see lib/comp.ts. */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'qrcode';
import type { Workshop } from '@/lib/types';
import { fmtDate, fmtDateTime } from '@/lib/datetime';
import { getEffectivePrice, getWorkshopDays } from '@/lib/workshop-utils';
import { COMP_KINDS, COMP_LABEL, type CompKind } from '@/lib/comp';
import type { InviteRow } from '@/app/api/admin/workshops/[id]/invites/route';

const baht = (n: number) => `฿${n.toLocaleString('th-TH')}`;

export default function WorkshopInvitesPage() {
  const { id } = useParams<{ id: string }>();
  const [workshop, setWorkshop] = useState<(Workshop & { held?: number }) | null>(null);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<CompKind>('teacher');
  const [special, setSpecial] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/workshops/${id}`).then((r) => r.json() as Promise<{ workshop?: Workshop; bookingCount?: number }>),
      fetch(`/api/admin/workshops/${id}/invites`).then((r) => r.json() as Promise<{ invites?: InviteRow[]; error?: string }>),
    ])
      .then(([w, inv]) => {
        setWorkshop(w.workshop ? { ...w.workshop, held: w.bookingCount } : null);
        setInvites(inv.invites || []);
        if (inv.error) setError(inv.error);
      })
      .catch(() => setError('โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }, [id]);

  // One QR image per live invitation.
  useEffect(() => {
    invites
      .filter((i) => i.status === 'pending' && !qr[i.token])
      .forEach((i) => {
        QRCode.toDataURL(i.url, { width: 560, margin: 2, errorCorrectionLevel: 'M' })
          .then((src) => setQr((m) => ({ ...m, [i.token]: src })))
          .catch(() => {});
      });
  }, [invites, qr]);

  const price = workshop ? getEffectivePrice(workshop).price : 0;
  const credit = kind === 'asl' ? price : kind === 'special' ? Number(special) || 0 : 0;

  async function issue() {
    setError(null);
    if (kind === 'special' && !(Number(special) > 0)) {
      setError('กรอกราคาพิเศษก่อน');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/workshops/${id}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comp_kind: kind, special_price: kind === 'special' ? Number(special) : undefined }),
      });
      const d = (await res.json()) as { invite?: InviteRow; error?: string };
      if (!res.ok || !d.invite) throw new Error(d.error || 'ออกบัตรเชิญไม่สำเร็จ');
      setInvites((l) => [d.invite!, ...l]);
      setWorkshop((w) => (w ? { ...w, held: (w.held || 0) + 1 } : w));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(token: string) {
    if (!confirm('ยกเลิกบัตรเชิญนี้? ที่นั่งจะกลับไปเปิดขายตามปกติ')) return;
    const res = await fetch(`/api/admin/workshops/${id}/invites?token=${token}`, { method: 'DELETE' });
    const d = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(d.error || 'ยกเลิกไม่สำเร็จ');
      return;
    }
    setInvites((l) => l.map((i) => (i.token === token ? { ...i, status: 'cancelled' } : i)));
    setWorkshop((w) => (w ? { ...w, held: Math.max(0, (w.held || 0) - 1) } : w));
  }

  async function copy(url: string, token: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(token);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* older browsers */
    }
  }

  if (loading) return <div className="p-8 text-gray">กำลังโหลด…</div>;
  if (!workshop) {
    return (
      <div className="p-8 text-gray">
        ไม่พบกิจกรรม — <Link href="/admin/workshops" className="text-primary underline">กลับ</Link>
      </div>
    );
  }

  const days = getWorkshopDays(workshop);
  const when = `${fmtDate(days[0] || workshop.date, 'th', 'medium')} · ${workshop.time_start}`;
  const pending = invites.filter((i) => i.status === 'pending');
  const done = invites.filter((i) => i.status !== 'pending');
  const aslTotal = invites.filter((i) => i.status !== 'cancelled').reduce((s, i) => s + i.host_credit, 0);
  const seatsLeft = Math.max(0, workshop.max_participants - (workshop.held || 0));

  return (
    <div className="max-w-5xl mx-auto p-6">
      <Link href="/admin/workshops" className="text-sm text-gray hover:text-primary hover:underline">
        ← กลับไปจัดการ Workshop
      </Link>
      <h1 className="text-2xl font-bold text-dark mt-2 mb-1">บัตรเชิญที่นั่งฟรี — {workshop.title}</h1>
      <p className="text-sm text-gray mb-5">
        {when} · ที่นั่งว่าง {seatsLeft}/{workshop.max_participants} · ราคาบัตรที่แสดงตอนนี้ {baht(price)}
        {aslTotal > 0 && <> · ASL ออกให้ Host รวม {baht(aslTotal)}</>}
      </p>

      {/* Issue */}
      <div className="rounded-2xl border border-gray-lighter bg-white p-5 mb-6">
        <h2 className="font-semibold text-dark mb-3">ออกบัตรเชิญใหม่ (1 QR = 1 ที่นั่ง)</h2>
        <div className="grid gap-2 sm:grid-cols-3 mb-4">
          {COMP_KINDS.map((k) => (
            <label
              key={k.key}
              className={`cursor-pointer rounded-xl border p-3 text-sm ${kind === k.key ? 'border-primary bg-primary/5' : 'border-gray-lighter'}`}
            >
              <input type="radio" name="comp" className="mr-2" checked={kind === k.key} onChange={() => setKind(k.key)} />
              <span className="font-semibold text-dark">{k.label}</span>
              <span className="block text-xs text-gray mt-1 leading-relaxed">{k.hint}</span>
            </label>
          ))}
        </div>
        {kind === 'special' && (
          <label className="block mb-4 text-sm">
            <span className="text-dark font-medium">ราคาพิเศษที่ ASL จ่ายให้ Host (บาท)</span>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={special}
              onChange={(e) => setSpecial(e.target.value)}
              className="mt-1 block w-48 rounded-lg border border-gray-lighter px-3 py-2"
              placeholder="เช่น 500"
            />
          </label>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={issue}
            disabled={busy || seatsLeft <= 0}
            className="rounded-full bg-primary text-white px-6 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {busy ? 'กำลังออกบัตร…' : 'เจน QR บัตรเชิญ'}
          </button>
          <span className="text-sm text-gray">
            รายได้ Host จากที่นั่งนี้: <b className="text-dark">{baht(credit)}</b> (ก่อนหักค่าธรรมเนียม)
          </span>
          {seatsLeft <= 0 && <span className="text-sm text-red-600">ที่นั่งเต็มแล้ว</span>}
        </div>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      </div>

      {/* Live invitations */}
      <h2 className="font-semibold text-dark mb-3">รอคนรับ ({pending.length})</h2>
      {pending.length === 0 && <p className="text-sm text-gray mb-6">ยังไม่มีบัตรเชิญที่รอรับ</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        {pending.map((i) => (
          <div key={i.token} className="rounded-2xl border border-gray-lighter bg-white p-4 flex flex-col items-center text-center">
            <span className="text-xs font-semibold text-primary tracking-wide">บัตรเชิญ · {COMP_LABEL[i.comp_kind]}</span>
            <span className="text-sm font-semibold text-dark mt-1 line-clamp-2">{workshop.title}</span>
            <span className="text-xs text-gray">{when}</span>
            {qr[i.token] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr[i.token]} alt="QR บัตรเชิญ" className="w-48 h-48 my-3" />
            ) : (
              <div className="w-48 h-48 my-3 bg-gray-lighter rounded" />
            )}
            <span className="text-xs text-gray mb-3">
              รายได้ Host {baht(i.host_credit)} · ถือโดย {i.issued_by || 'admin'} จนกว่าจะมีคนรับ
            </span>
            <div className="flex flex-wrap justify-center gap-2 text-xs">
              {qr[i.token] && (
                <a href={qr[i.token]} download={`invite-${i.token.slice(0, 8)}.png`} className="rounded-full border border-primary text-primary px-3 py-1.5 font-semibold">
                  ดาวน์โหลด QR
                </a>
              )}
              <button type="button" onClick={() => copy(i.url, i.token)} className="rounded-full border border-gray-lighter px-3 py-1.5 font-semibold text-dark">
                {copied === i.token ? '✓ คัดลอกแล้ว' : 'คัดลอกลิงก์'}
              </button>
              <button type="button" onClick={() => withdraw(i.token)} className="rounded-full px-3 py-1.5 font-semibold text-red-600">
                ยกเลิก
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* History */}
      {done.length > 0 && (
        <>
          <h2 className="font-semibold text-dark mb-3">รับแล้ว / ยกเลิกแล้ว</h2>
          <div className="rounded-2xl border border-gray-lighter bg-white divide-y divide-gray-lighter text-sm">
            {done.map((i) => (
              <div key={i.token} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className={`badge ${i.status === 'claimed' ? 'bg-primary/15 text-primary' : 'bg-gray-lighter text-gray'}`}>
                  {i.status === 'claimed' ? 'รับแล้ว' : 'ยกเลิก'}
                </span>
                <span className="text-dark">{COMP_LABEL[i.comp_kind]}</span>
                <span className="text-gray">{i.status === 'claimed' ? `โดย ${i.to_name || '-'} · ${fmtDateTime(i.claimed_at, 'th')}` : fmtDateTime(i.created_at, 'th')}</span>
                <span className="ml-auto text-dark">{i.status === 'claimed' ? baht(i.host_credit) : '—'}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
