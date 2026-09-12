'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLang, T, tr } from '@/lib/i18n';
import { Btn } from '@/components/design/RippleButton';
import { getVault, putVault, getIdentityLockedUntil, IdentityLockedError } from '@/lib/vault';
import { IDENTITY_LOCK_DAYS } from '@/lib/identity-lock';
import { ImageUploader } from '@/components/admin/image/ImageUploader';
import { ASPECTS } from '@/lib/image-aspects';
import { parseImageMeta } from '@/lib/image-meta';
import type { ImageMeta } from '@/lib/types';

export interface MeData {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar_url: string | null;
  avatar_meta: string | null;
  cover_image_url: string | null;
  cover_image_meta: string | null;
  nickname: string | null;
  date_of_birth: string | null;
  bio: string | null;
  phone: string | null;
  email_verified?: number;
  created_at: string;
}

const fieldLabel = 'block text-[11px] font-mono uppercase tracking-wider text-gray mb-1';

function SectionCard({
  title,
  desc,
  badge,
  children,
  className = '',
}: {
  title?: string;
  desc?: string;
  /** Optional status chip rendered next to the title (e.g. "รอยืนยัน"). */
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`card card-static ${className}`}>
      {title && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h3 className="display-th" style={{ fontSize: 18, lineHeight: 1.3, margin: 0 }}>
              {title}
            </h3>
            {badge}
          </div>
          {desc && <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0', lineHeight: 1.5 }}>{desc}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

function calcAge(dob?: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

/* ───────────── Edit Profile panel ───────────── */
function ImgGlyph({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2.5" strokeWidth={1.6} />
      <circle cx="8.5" cy="9.5" r="1.6" strokeWidth={1.6} />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M5 18l4.5-4.5L13 17l3-3 3 3" />
    </svg>
  );
}

export function EditProfilePanel({
  me,
  onSaved,
  onDirtyChange,
}: {
  me: MeData;
  onSaved: (m: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { lang } = useLang();
  const [nickname, setNickname] = useState(me.nickname || '');
  const [avatarUrl, setAvatarUrl] = useState(me.avatar_url || '');
  const [avatarMeta, setAvatarMeta] = useState<ImageMeta | null>(parseImageMeta(me.avatar_meta));
  const [coverUrl, setCoverUrl] = useState(me.cover_image_url || '');
  const [coverMeta, setCoverMeta] = useState<ImageMeta | null>(parseImageMeta(me.cover_image_meta));
  const [saving, setSaving] = useState(false);

  // Baseline of last-saved values (so dirty flips back after save without
  // mutating the `me` prop). State so it's safe to read during render.
  const [base, setBase] = useState({
    nickname: me.nickname || '',
    avatarUrl: me.avatar_url || '',
    coverUrl: me.cover_image_url || '',
  });

  const dirty =
    nickname !== base.nickname ||
    avatarUrl !== base.avatarUrl ||
    coverUrl !== base.coverUrl;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/me/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Name & bio are no longer edited here — preserve the stored values so
          // the profile PUT (which overwrites every column) doesn't wipe them.
          name: me.name,
          nickname,
          // DOB is now edited on the Autofill page; preserve the stored value so
          // this profile PUT (which overwrites every column) doesn't wipe it.
          date_of_birth: me.date_of_birth ?? '',
          bio: me.bio ?? '',
          avatar_url: avatarUrl || null,
          avatar_meta: avatarMeta,
          cover_image_url: coverUrl || null,
          cover_image_meta: coverMeta,
        }),
      });
      if (res.ok) {
        // Update the baseline so `dirty` flips back to false after save.
        setBase({ nickname, avatarUrl, coverUrl });
        onDirtyChange?.(false);
        onSaved(tr(lang, 'บันทึกโปรไฟล์แล้ว', 'Profile saved'));
      } else onSaved(tr(lang, 'บันทึกไม่สำเร็จ', 'Save failed'));
    } catch {
      onSaved(tr(lang, 'เชื่อมต่อไม่ได้', 'Cannot reach server'));
    } finally {
      setSaving(false);
    }
  }

  const joined = me.created_at
    ? new Date(me.created_at).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* Banner — cover + avatar are the upload triggers (click to upload/crop) */}
      <SectionCard className="!p-0 overflow-hidden">
        <div style={{ position: 'relative' }}>
          {/* Cover = clickable dropzone */}
          <ImageUploader
            folder="avatar"
            primary={ASPECTS.PROFILE_COVER}
            value={coverUrl}
            meta={coverMeta}
            onChange={({ url, meta }) => {
              setCoverUrl(url);
              setCoverMeta(meta);
            }}
            menuStyle={{ right: 12, top: 12 }}
            trigger={
              <div
                style={{
                  height: 172,
                  position: 'relative',
                  background: coverUrl ? 'var(--cream-deep)' : 'linear-gradient(120deg, var(--teal) 0%, var(--teal-deep) 100%)',
                  overflow: 'hidden',
                }}
              >
                  {coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#fff' }}>
                      <ImgGlyph />
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{tr(lang, 'รูปปก · คลิกเพื่ออัปโหลด', 'Cover · click to upload')}</div>
                      <div style={{ fontSize: 11, opacity: 0.85 }}>{tr(lang, 'หรือเลือกไฟล์', 'or browse files')}</div>
                    </div>
                  )}
                  {coverUrl && (
                    <span style={{ position: 'absolute', right: 12, bottom: 12, fontSize: 11, fontWeight: 600, color: '#fff', background: 'rgba(13,30,29,.55)', borderRadius: 999, padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      ✎ {tr(lang, 'แก้ไข', 'Edit')}
                    </span>
                  )}
                </div>
            }
          />

          {/* Avatar = clickable dropzone overlapping the cover */}
          <div style={{ position: 'absolute', left: 28, bottom: -44, width: 104, height: 104 }}>
            <ImageUploader
              folder="avatar"
              primary={ASPECTS.AVATAR}
              value={avatarUrl}
              meta={avatarMeta}
              onChange={({ url, meta }) => {
                setAvatarUrl(url);
                setAvatarMeta(meta);
              }}
              menuStyle={{ left: 0, top: 'calc(100% + 10px)' }}
              trigger={
                /* outer is NOT clipped, so the pencil badge stays visible */
                <div style={{ position: 'relative', width: 104, height: 104 }}>
                    <div
                      style={{
                        width: 104,
                        height: 104,
                        borderRadius: '50%',
                        background: 'var(--cream)',
                        boxShadow: '0 0 0 5px var(--paper)',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, color: 'var(--teal-deep)' }}>
                          <ImgGlyph size={22} />
                          <span style={{ fontSize: 10 }}>{tr(lang, 'รูปโปรไฟล์', 'avatar')}</span>
                        </div>
                      )}
                    </div>
                    {/* edit affordance — outside the clipped circle */}
                    <span style={{ position: 'absolute', right: 0, bottom: 2, width: 30, height: 30, borderRadius: '50%', background: 'var(--teal)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 3px var(--paper)' }}>
                      <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.2 5.2l3.6 3.6M9 13l6.6-6.6a2 2 0 112.8 2.8L11.8 15.8 8 17l1.2-3.8z" />
                      </svg>
                    </span>
                </div>
            }
          />
          </div>
        </div>
        <div style={{ padding: '58px 28px 28px' }}>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 18px' }}>
            <T th="แตะที่รูปปกหรือรูปโปรไฟล์เพื่ออัปโหลด / ครอบรูปใหม่" en="Tap the cover or avatar to upload / crop a new photo." />
          </p>

          <div className="form-grid">
            <div className="fld-full">
              <label className={fieldLabel}>
                <T th="ชื่อผู้ใช้ / ชื่อเล่น" en="Username / Nickname" />
              </label>
              <input value={nickname} onChange={(e) => setNickname(e.target.value)} className="field" maxLength={32} />
            </div>
            <div>
              <label className={fieldLabel}>
                <T th="อีเมล" en="Email" />
              </label>
              <input value={me.email} disabled className="field" style={{ background: 'var(--cream-deep)', color: 'var(--muted)' }} />
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 0' }}>
                <T th="ไม่สามารถเปลี่ยนอีเมลได้" en="Email cannot be changed" />
              </p>
            </div>
            <div>
              <label className={fieldLabel}>
                <T th="เป็นสมาชิกตั้งแต่" en="Joined" />
              </label>
              <input value={joined} disabled className="field" style={{ background: 'var(--cream-deep)', color: 'var(--muted)' }} />
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <Btn kind="teal" onClick={save} disabled={saving}>
              {saving ? tr(lang, 'กำลังบันทึก...', 'Saving...') : tr(lang, 'บันทึกการเปลี่ยนแปลง', 'Save changes')} <span className="mono">→</span>
            </Btn>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

/* ───────────── Account panel ───────────── */
export function AccountPanel({
  me,
  onSaved,
  onDirtyChange,
}: {
  me: MeData;
  onSaved: (m: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { lang } = useLang();
  const [resetting, setResetting] = useState(false);
  const [resetSent, setResetSent] = useState<{ to: string; devLink?: string } | null>(null);
  const [device, setDevice] = useState<{ browser: string; os: string } | null>(null);

  // Self-delete (2-step): consent → type the confirm phrase.
  const CONFIRM_PHRASE = 'ยืนยันการลบบัญชี';
  const [delOpen, setDelOpen] = useState(false);
  const [delStep, setDelStep] = useState<1 | 2>(1);
  const [delConsent, setDelConsent] = useState(false);
  const [delConfirmText, setDelConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Username & phone are no longer edited here, so this panel has no tracked
  // form edits — always report "not dirty" to the parent guard.
  useEffect(() => {
    onDirtyChange?.(false);
  }, [onDirtyChange]);

  useEffect(() => {
    (async () => {
      if (typeof navigator !== 'undefined') {
        const ua = navigator.userAgent;
        let browser = 'Unknown';
        if (/Edg\//.test(ua)) browser = 'Microsoft Edge';
        else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
        else if (/Chrome\//.test(ua)) browser = 'Chrome';
        else if (/Firefox\//.test(ua)) browser = 'Firefox';
        else if (/Safari\//.test(ua)) browser = 'Safari';
        let os = 'Unknown';
        if (/Windows/.test(ua)) os = 'Windows';
        else if (/Mac OS X/.test(ua)) os = 'macOS';
        else if (/Android/.test(ua)) os = 'Android';
        else if (/iPhone|iPad/.test(ua)) os = 'iOS';
        else if (/Linux/.test(ua)) os = 'Linux';
        setDevice({ browser, os });
      }
    })();
  }, []);

  async function passwordReset() {
    setResetting(true);
    try {
      const res = await fetch('/api/me/password-reset', { method: 'POST' });
      const data = (await res.json()) as { ok?: boolean; sentTo?: string; devLink?: string };
      if (data.ok) setResetSent({ to: data.sentTo || me.email, devLink: data.devLink });
      else onSaved(tr(lang, 'ส่งอีเมลไม่สำเร็จ', 'Could not send email'));
    } catch {
      onSaved(tr(lang, 'เชื่อมต่อไม่ได้', 'Cannot reach server'));
    } finally {
      setResetting(false);
    }
  }

  function openDelete() {
    setDelStep(1);
    setDelConsent(false);
    setDelConfirmText('');
    setDelOpen(true);
  }
  function closeDelete() {
    if (deleting) return;
    setDelOpen(false);
  }
  async function confirmDelete() {
    if (delConfirmText.trim() !== CONFIRM_PHRASE) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/me/account/delete', { method: 'POST' });
      if (res.ok) {
        // Account is now pending_deletion and the session is cleared. Leave.
        window.location.href = '/';
      } else {
        onSaved(tr(lang, 'ลบบัญชีไม่สำเร็จ', 'Could not delete account'));
        setDeleting(false);
      }
    } catch {
      onSaved(tr(lang, 'เชื่อมต่อไม่ได้', 'Cannot reach server'));
      setDeleting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* Password */}
      <SectionCard>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h3 className="display-th" style={{ fontSize: 18, lineHeight: 1.3, margin: 0 }}>
              <T th="รหัสผ่าน" en="Password" />
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0', maxWidth: 380, lineHeight: 1.5 }}>
              <T th="เพื่อความปลอดภัย เราจะส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลของคุณ" en="For your security, we'll email you a password reset link" />
            </p>
          </div>
          <Btn kind="paper" onClick={passwordReset} disabled={resetting}>
            {resetting ? tr(lang, 'กำลังส่ง...', 'Sending...') : tr(lang, 'แก้ไขรหัสผ่าน', 'Change password')}
          </Btn>
        </div>
        {resetSent && (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 14, background: 'var(--teal-50)', color: 'var(--teal-deep)', fontSize: 13 }}>
            <T th={`ส่งลิงก์รีเซ็ตไปที่ ${resetSent.to} แล้ว`} en={`Reset link sent to ${resetSent.to}`} />
            {resetSent.devLink && (
              <div style={{ marginTop: 8 }}>
                <a href={resetSent.devLink} className="text-primary underline" style={{ fontSize: 11, wordBreak: 'break-all' }}>
                  {resetSent.devLink}
                </a>
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* Active sessions */}
      <SectionCard title={tr(lang, 'อุปกรณ์ที่เข้าสู่ระบบ', 'Active sessions')} desc={tr(lang, 'อุปกรณ์ที่กำลังเข้าใช้บัญชีของคุณ', 'Devices currently signed in')}>
        <div className="sess-row">
          <span className="sess-ico">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="2.5" y="4" width="19" height="13" rx="2" strokeWidth={1.6} />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M8 20.5h8M12 17v3.5" />
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>{device ? `${device.browser} · ${device.os}` : tr(lang, 'อุปกรณ์นี้', 'This device')}</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{tr(lang, 'ออนไลน์', 'online now')}</div>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: '#16a34a' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16a34a' }} />
            <T th="ออนไลน์" en="Online" />
          </span>
        </div>
      </SectionCard>

      {/* Danger zone — delete account */}
      <SectionCard className="danger-card">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h3 className="display-th" style={{ fontSize: 18, lineHeight: 1.3, margin: 0, color: '#b3261e' }}>
              <T th="ลบบัญชี" en="Delete account" />
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0', maxWidth: 420, lineHeight: 1.5 }}>
              <T
                th="เมื่อยืนยัน บัญชีจะถูกปิดการใช้งานและกู้คืนได้ภายใน 30 วัน หลังจากนั้นจะถูกลบถาวร"
                en="Once confirmed, your account is disabled and recoverable for 30 days, then permanently deleted"
              />
            </p>
          </div>
          <button
            type="button"
            onClick={openDelete}
            className="btn btn-sm"
            style={{ flexShrink: 0, background: '#fdeceb', color: '#b3261e', border: '1px solid #f3c9c5', fontWeight: 600 }}
          >
            <T th="ลบบัญชี" en="Delete account" />
          </button>
        </div>
      </SectionCard>

      {delOpen && (
        <div
          onClick={closeDelete}
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--paper, #fff)', borderRadius: 20, width: '100%', maxWidth: 460, padding: 26, boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, background: '#fdeceb', color: '#b3261e', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                  </svg>
                </span>
                <h3 className="display-th" style={{ fontSize: 19, lineHeight: 1.25, margin: 0 }}>
                  <T th="ลบบัญชี" en="Delete account" />
                </h3>
              </div>
              <button
                type="button"
                onClick={closeDelete}
                disabled={deleting}
                aria-label={tr(lang, 'ปิด', 'Close')}
                style={{ flexShrink: 0, width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'var(--cream, #f2efe9)', color: 'var(--ink)', cursor: deleting ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Step indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              {[1, 2].map((n) => (
                <span
                  key={n}
                  style={{ flex: 1, height: 4, borderRadius: 999, background: delStep >= n ? '#b3261e' : 'var(--cream, #eee)' }}
                />
              ))}
            </div>

            {delStep === 1 ? (
              <>
                <div style={{ padding: 14, borderRadius: 14, background: '#fdeceb', color: '#8a221b', fontSize: 14, lineHeight: 1.6 }}>
                  <T
                    th="หากยืนยัน บัญชีจะสามารถกู้คืนได้ภายใน 30 วัน หากเลยกำหนดบัญชีจะถูกลบถาวร"
                    en="Once confirmed, your account can be recovered within 30 days. After that it will be permanently deleted."
                  />
                </div>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 16, cursor: 'pointer', fontSize: 14, lineHeight: 1.5 }}>
                  <input
                    type="checkbox"
                    checked={delConsent}
                    onChange={(e) => setDelConsent(e.target.checked)}
                    style={{ marginTop: 3, width: 17, height: 17, accentColor: '#b3261e', flexShrink: 0 }}
                  />
                  <span>
                    <T th="ฉันเข้าใจและยอมรับเงื่อนไขข้างต้น" en="I understand and accept the terms above" />
                  </span>
                </label>
                <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                  <button type="button" onClick={closeDelete} className="btn btn-paper" style={{ flex: 1 }}>
                    <T th="ยกเลิก" en="Cancel" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDelStep(2)}
                    disabled={!delConsent}
                    className="btn"
                    style={{ flex: 1, background: delConsent ? '#b3261e' : '#e6c3c0', color: '#fff', border: 'none', cursor: delConsent ? 'pointer' : 'not-allowed', fontWeight: 600 }}
                  >
                    <T th="ถัดไป" en="Next" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{ fontSize: 14, lineHeight: 1.6, margin: '0 0 12px', color: 'var(--ink)' }}>
                  <T
                    th={`เพื่อยืนยัน โปรดพิมพ์ "${CONFIRM_PHRASE}" ลงในช่องด้านล่าง`}
                    en={`To confirm, type "${CONFIRM_PHRASE}" in the field below`}
                  />
                </p>
                <input
                  value={delConfirmText}
                  onChange={(e) => setDelConfirmText(e.target.value)}
                  className="field"
                  placeholder={CONFIRM_PHRASE}
                  autoFocus
                  style={{ borderColor: delConfirmText && delConfirmText.trim() !== CONFIRM_PHRASE ? '#e0a9a4' : undefined }}
                />
                <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                  <button type="button" onClick={() => setDelStep(1)} disabled={deleting} className="btn btn-paper" style={{ flex: 1 }}>
                    <T th="ย้อนกลับ" en="Back" />
                  </button>
                  <button
                    type="button"
                    onClick={confirmDelete}
                    disabled={deleting || delConfirmText.trim() !== CONFIRM_PHRASE}
                    className="btn"
                    style={{
                      flex: 1,
                      background: !deleting && delConfirmText.trim() === CONFIRM_PHRASE ? '#b3261e' : '#e6c3c0',
                      color: '#fff',
                      border: 'none',
                      cursor: !deleting && delConfirmText.trim() === CONFIRM_PHRASE ? 'pointer' : 'not-allowed',
                      fontWeight: 600,
                    }}
                  >
                    {deleting ? tr(lang, 'กำลังลบ...', 'Deleting...') : tr(lang, 'ยืนยันการลบบัญชี', 'Delete account')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────── Identity verification panel ─────────────
 * Status = "Verified" automatically once the profile is complete in BOTH parts:
 *   (1) Identity — first/last name + nickname   (2) Health & dietary — medical.
 * All read from the autofill vault (localStorage). Incomplete → the status and
 * each unfinished step link to the Autofill form so the user can complete it. */
export function IdentityPanel({ me, onSaved }: { me?: MeData; onSaved?: (m: string) => void }) {
  const { lang } = useLang();
  const router = useRouter();
  const goForm = () => router.push('/me/settings?tab=autofill');

  const [vault, setVault] = useState<Partial<Vault>>({});
  useEffect(() => {
    let alive = true;
    // Server-synced vault (falls back to this device's cache). See lib/vault.ts.
    getVault().then((raw) => {
      if (alive && raw && Object.keys(raw).length > 0) setVault(raw as Partial<Vault>);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Read the same required-field lists the form gates on, so this status can
  // never disagree with the section badges.
  const isDone = (keys: (keyof Vault)[]) => keys.every((k) => String(vault[k] ?? '').trim().length > 0);
  const identityComplete = isDone(REQUIRED_BASE.identity);
  const healthComplete = isDone(REQUIRED_BASE.health);
  const verified = identityComplete && healthComplete;

  const emailVerified = me?.email_verified === 1;
  const [sending, setSending] = useState(false);
  const [sentInfo, setSentInfo] = useState<{ to: string; devLink?: string } | null>(null);

  async function sendVerifyEmail() {
    setSending(true);
    try {
      const res = await fetch('/api/me/verify-email', { method: 'POST' });
      const data = (await res.json()) as { ok?: boolean; sentTo?: string; devLink?: string; error?: string };
      if (data.ok) {
        setSentInfo({ to: data.sentTo || '', devLink: data.devLink });
        onSaved?.(tr(lang, 'ส่งอีเมลยืนยันแล้ว', 'Verification email sent'));
      } else {
        onSaved?.(data.error || tr(lang, 'ส่งอีเมลไม่สำเร็จ', 'Could not send email'));
      }
    } catch {
      onSaved?.(tr(lang, 'เชื่อมต่อไม่ได้', 'Cannot reach server'));
    } finally {
      setSending(false);
    }
  }

  const badge = verified
    ? { th: 'ยืนยันแล้ว', en: 'Verified', col: 'var(--teal)', bg: 'var(--teal-50)', txt: 'var(--teal-deep)' }
    : { th: 'ยังไม่ยืนยัน', en: 'Not verified', col: '#b56a5f', bg: '#f6e7e4', txt: '#9a4a3f' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* Status card — clickable when not verified → go complete the form */}
      <SectionCard className={verified ? '' : 'clickable'}>
        <div
          role={verified ? undefined : 'button'}
          tabIndex={verified ? undefined : 0}
          onClick={verified ? undefined : goForm}
          onKeyDown={verified ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') goForm(); }}
          style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', cursor: verified ? 'default' : 'pointer' }}
        >
          <span style={{ width: 54, height: 54, borderRadius: 16, background: badge.bg, color: badge.col, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldSvg color={badge.col} />
          </span>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div className="display-th" style={{ fontSize: 20, lineHeight: 1.3 }}>
              <T th="การยืนยันตัวตน" en="Identity verification" />
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
              {verified
                ? tr(lang, 'ข้อมูลโปรไฟล์ของคุณครบถ้วนแล้ว', 'Your profile is complete')
                : tr(lang, 'กดเพื่อไปกรอกข้อมูลตัวตนและสุขภาพให้ครบ', 'Tap to complete your identity & health info')}
            </div>
          </div>
          <span style={{ padding: '7px 14px', borderRadius: 999, background: badge.bg, color: badge.txt, fontSize: 12.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: badge.col }} />
            {tr(lang, badge.th, badge.en)}
            {!verified && <span aria-hidden style={{ marginLeft: 2 }}>→</span>}
          </span>
        </div>
      </SectionCard>

      <SectionCard title={tr(lang, 'ขั้นตอนการยืนยัน', 'Verification steps')}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <StepRow
            done={identityComplete}
            index={1}
            label={tr(lang, 'ข้อมูลตัวตน (ชื่อ-นามสกุล, ชื่อเล่น)', 'Identity (full name, nickname)')}
            action={
              !identityComplete ? (
                <button type="button" onClick={goForm} className="btn btn-paper btn-sm" style={{ flexShrink: 0 }}>
                  {tr(lang, 'กรอกข้อมูล', 'Complete')}
                </button>
              ) : null
            }
            lang={lang}
          />
          <StepRow
            done={healthComplete}
            index={2}
            label={tr(lang, 'ข้อมูลสุขภาพ & อาหาร', 'Health & dietary')}
            action={
              !healthComplete ? (
                <button type="button" onClick={goForm} className="btn btn-paper btn-sm" style={{ flexShrink: 0 }}>
                  {tr(lang, 'กรอกข้อมูล', 'Complete')}
                </button>
              ) : null
            }
            lang={lang}
          />
          <StepRow
            done={emailVerified}
            index={3}
            label={tr(lang, 'ยืนยันอีเมล', 'Email verified')}
            action={
              !emailVerified ? (
                <button type="button" onClick={sendVerifyEmail} disabled={sending} className="btn btn-paper btn-sm" style={{ flexShrink: 0 }}>
                  {sending ? tr(lang, 'กำลังส่ง...', 'Sending...') : tr(lang, 'ส่งอีเมลยืนยัน', 'Send verify email')}
                </button>
              ) : null
            }
            lang={lang}
          />
        </div>

        {sentInfo && (
          <div style={{ marginTop: 16, padding: 12, borderRadius: 14, background: 'var(--teal-50)', color: 'var(--teal-deep)', fontSize: 13 }}>
            <T th={`ส่งลิงก์ยืนยันไปที่ ${sentInfo.to} แล้ว — กรุณาตรวจสอบอีเมลของคุณ`} en={`A verification link has been sent to ${sentInfo.to} — please check your inbox`} />
            {sentInfo.devLink && (
              <div style={{ marginTop: 8 }}>
                <a href={sentInfo.devLink} className="text-primary underline" style={{ fontSize: 11, wordBreak: 'break-all' }}>
                  {sentInfo.devLink}
                </a>
              </div>
            )}
          </div>
        )}
        {!verified && (
          <div style={{ marginTop: 22 }}>
            <Btn kind="teal" onClick={goForm}>
              {tr(lang, 'ไปกรอกข้อมูลให้ครบ', 'Complete my info')} <span className="mono">→</span>
            </Btn>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function StepRow({ done, index, label, action, lang }: { done: boolean; index: number; label: string; action: React.ReactNode; lang: 'th' | 'en' }) {
  return (
    <div className="sess-row">
      <span style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: done ? 'var(--teal)' : 'var(--cream)', color: done ? '#fff' : 'var(--muted)' }}>
        {done ? (
          <svg width="16" height="16" fill="none" stroke="#fff" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M5 13l4 4L19 7" /></svg>
        ) : (
          <span className="mono" style={{ fontSize: 12 }}>{index}</span>
        )}
      </span>
      <span style={{ flex: 1, fontSize: 14.5, fontWeight: 500, color: done ? 'var(--ink)' : 'var(--muted)' }}>{label}</span>
      {done ? <span style={{ fontSize: 11.5, color: 'var(--teal)', fontWeight: 600 }}>{tr(lang, 'เสร็จ', 'done')}</span> : action}
    </div>
  );
}

/* ───────────── Autofill vault panel — UI only (localStorage) ───────────── */
type Vault = {
  prefix: string;
  firstName: string;
  lastName: string;
  nickname: string;
  dob: string;
  gender: string;
  genderOther: string;
  phone: string;
  lineId: string;
  facebook: string;
  emName: string;
  emRelation: string;
  emPhone: string;
  medical: string;
  dietary: string;
};
const EMPTY_VAULT: Vault = {
  prefix: '',
  firstName: '',
  lastName: '',
  nickname: '',
  dob: '',
  gender: 'female',
  genderOther: '',
  phone: '',
  lineId: '',
  facebook: '',
  emName: '',
  emRelation: '',
  emPhone: '',
  medical: '',
  dietary: '',
};

/* Sectional model — each section saves independently. Required fields decide
   whether a section is "complete"; once saved complete a section is "verified"
   and its required fields can be edited but not emptied. */
type SectionKey = 'identity' | 'health' | 'emergency';

const SECTION_FIELDS: Record<SectionKey, (keyof Vault)[]> = {
  identity: ['prefix', 'firstName', 'lastName', 'nickname', 'dob', 'gender', 'genderOther', 'phone', 'lineId', 'facebook'],
  health: ['medical', 'dietary'],
  emergency: ['emName', 'emRelation', 'emPhone'],
};

const REQUIRED_BASE: Record<SectionKey, (keyof Vault)[]> = {
  // LINE ID is required (main contact channel); Facebook is optional.
  identity: ['prefix', 'firstName', 'lastName', 'nickname', 'dob', 'gender', 'phone', 'lineId'],
  health: ['medical', 'dietary'],
  emergency: [], // optional — always saveable
};

/** Thai block + spaces — used by the ชื่อจริง / นามสกุล / ชื่อเล่น inputs.
    Anything else is stripped as the user types. */
const THAI_CHAR = /[฀-๿\s]/;
const stripNonThai = (s: string) =>
  s
    .split('')
    .filter((ch) => THAI_CHAR.test(ch))
    .join('');

/** Required fields for a section given current values (gender "other" needs genderOther). */
function requiredFor(section: SectionKey, vals: Vault): (keyof Vault)[] {
  if (section === 'identity' && vals.gender === 'other') return [...REQUIRED_BASE.identity, 'genderOther'];
  return REQUIRED_BASE[section];
}

const isFilled = (val: unknown) => String(val ?? '').trim().length > 0;

const ERR_RING: React.CSSProperties = { boxShadow: 'inset 0 0 0 1.5px #d94b46' };

export function AutofillPanel({
  me,
  onSaved,
  onDirtyChange,
}: {
  me?: MeData;
  onSaved: (m: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { lang } = useLang();
  const [v, setV] = useState<Vault>(EMPTY_VAULT);
  // Last-saved snapshot. On mount it loads from the vault; only an explicit
  // section Save updates it, so unsaved (possibly invalid) edits are discarded
  // when the panel unmounts and repopulated from here on return.
  const [saved, setSaved] = useState<Vault>(EMPTY_VAULT);
  /** Fields the user has left (blurred) — gates the "required" error per field. */
  const [touched, setTouched] = useState<Partial<Record<keyof Vault, boolean>>>({});
  /** Fields where the last keystroke/paste contained non-Thai characters. */
  const [thaiWarn, setThaiWarn] = useState<Partial<Record<keyof Vault, boolean>>>({});
  /** Identity can be changed once every 30 days (lib/identity-lock). Epoch ms
      the lock lifts, or null when the section is open for editing. */
  const [identityLockedUntil, setIdentityLockedUntil] = useState<number | null>(null);
  const identityLocked = identityLockedUntil != null && identityLockedUntil > Date.now();
  const set = (k: keyof Vault) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));

  /** Thai-only name input: silently drops any disallowed character and flags why. */
  const setThaiName = (k: keyof Vault) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const clean = stripNonThai(raw);
    setThaiWarn((p) => ({ ...p, [k]: clean !== raw }));
    setV((p) => ({ ...p, [k]: clean }));
  };

  const onBlurField = (k: keyof Vault) => () => setTouched((p) => ({ ...p, [k]: true }));

  useEffect(() => {
    // Load-once from the device vault on mount. Synchronous setState here is the
    // intended pattern for hydrating persisted state (and is SSR-safe — no
    // localStorage during render).
    let alive = true;
    getVault().then((raw) => {
      if (!alive) return;
      const loaded = { ...EMPTY_VAULT, ...(raw || {}) } as Vault;
      // Seed DOB from the legacy profile column so users who set it on the old
      // Edit-Profile page don't have to re-enter it here.
      if (!loaded.dob && me?.date_of_birth) loaded.dob = me.date_of_birth;
      setV(loaded);
      setSaved(loaded);
      setIdentityLockedUntil(getIdentityLockedUntil());
    });
    return () => {
      alive = false;
    };
  }, [me]);

  const sectionDirty = (s: SectionKey) => SECTION_FIELDS[s].some((f) => v[f] !== saved[f]);
  const isComplete = (s: SectionKey, vals: Vault) => requiredFor(s, vals).every((f) => isFilled(vals[f]));
  /** A section is verified once it has been saved with every required field filled. */
  const isVerified = (s: SectionKey) => isComplete(s, saved);

  // The parent unsaved-changes guard watches any section being dirty.
  const anyDirty = (['identity', 'health', 'emergency'] as SectionKey[]).some(sectionDirty);
  useEffect(() => {
    onDirtyChange?.(anyDirty);
  }, [anyDirty, onDirtyChange]);

  /** Persist only this section's fields into the shared vault, keeping other
      sections at their last-saved values (never their unsaved edits). */
  async function saveSection(s: SectionKey) {
    if (!isComplete(s, v)) return; // guarded — the button is disabled in this state
    if (s === 'identity' && identityLocked) return;
    const next: Vault = { ...saved };
    SECTION_FIELDS[s].forEach((f) => {
      (next as Record<string, string>)[f] = v[f];
    });
    try {
      await putVault(next as Record<string, string>); // syncs to server + localStorage
      setSaved(next);
      // The server decides whether this save started (or is still under) the
      // identity clock; mirror it so the form greys out without a reload.
      setIdentityLockedUntil(getIdentityLockedUntil());
      const label =
        s === 'identity' ? tr(lang, 'ตัวตน', 'Identity') : s === 'health' ? tr(lang, 'สุขภาพ & อาหาร', 'Health & dietary') : tr(lang, 'ผู้ติดต่อฉุกเฉิน', 'Emergency contact');
      onSaved(tr(lang, `บันทึกส่วน “${label}” แล้ว`, `${label} section saved`));
    } catch (e) {
      if (e instanceof IdentityLockedError) {
        // Refused — drop the edits so the greyed-out form shows what is on file.
        setIdentityLockedUntil(e.until);
        setV((p) => {
          const back = { ...p };
          SECTION_FIELDS.identity.forEach((f) => {
            (back as Record<string, string>)[f] = saved[f];
          });
          return back;
        });
        onSaved(tr(lang, 'ข้อมูลตัวตนแก้ไขได้เดือนละครั้ง — ยังไม่ครบกำหนด', 'Identity can be changed once a month — not yet'));
        return;
      }
      onSaved(tr(lang, 'บันทึกไม่สำเร็จ', 'Save failed'));
    }
  }

  /** "12 ต.ค. 2569" — the day the identity section opens again. */
  const lockLiftsOn = identityLockedUntil
    ? new Date(identityLockedUntil).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  /** Empty-required error: after the field is blurred, once the section is
      verified (delete-prevention), or once the user has started filling it. */
  const showErr = (f: keyof Vault, s: SectionKey) =>
    requiredFor(s, v).includes(f) && !isFilled(v[f]) && (touched[f] || isVerified(s) || sectionDirty(s));

  /** Any error on the field — drives the red ring. */
  const hasErr = (f: keyof Vault, s: SectionKey) => showErr(f, s) || !!thaiWarn[f];

  // Plain render helpers (not nested components) so they don't remount each render.
  const req = () => <span style={{ color: '#d94b46' }}> *</span>;
  const renderErr = () => (
    <span style={{ display: 'block', marginTop: 4, fontSize: 11.5, color: '#d94b46' }}>{tr(lang, 'ห้ามเว้นว่าง — จำเป็น', 'Required — cannot be empty')}</span>
  );
  const renderThaiErr = () => (
    <span style={{ display: 'block', marginTop: 4, fontSize: 11.5, color: '#d94b46' }}>
      {tr(lang, 'กรอกภาษาไทยเท่านั้น — ห้ามตัวเลขหรืออักษรพิเศษ', 'Thai letters only — no digits or symbols')}
    </span>
  );

  /** "รอยืนยัน" until the section has been saved with every required field filled. */
  const statusBadge = (s: SectionKey) =>
    isVerified(s) ? (
      <span className="tag" style={{ fontSize: 10.5 }}>✓ {tr(lang, 'ยืนยันแล้ว', 'Verified')}</span>
    ) : (
      <span className="tag tag-warn" style={{ fontSize: 10.5 }}>{tr(lang, 'รอยืนยัน', 'Pending')}</span>
    );

  const saveBar = (s: SectionKey) => {
    const verified = isVerified(s);
    const complete = isComplete(s, v);
    const dirtyS = sectionDirty(s);
    const locked = s === 'identity' && identityLocked;
    const canSave = complete && dirtyS && !locked;
    const blocked = verified && dirtyS && !complete; // a required field was cleared

    // "Saved" only means something once the section actually holds saved data —
    // an untouched optional section (Emergency) should read as blank, not "Saved".
    const hasSavedData = SECTION_FIELDS[s].some((f) => isFilled(saved[f]));

    let status: { text: string; color: string; check?: boolean } | null = null;
    if (locked) status = { text: tr(lang, `แก้ไขได้อีกครั้งวันที่ ${lockLiftsOn}`, `Editable again on ${lockLiftsOn}`), color: 'var(--muted)' };
    else if (blocked) status = { text: tr(lang, 'กรอกช่องที่จำเป็นให้ครบก่อนบันทึก — ห้ามเว้นว่าง', 'Fill the required fields before saving — they cannot be empty'), color: '#d94b46' };
    else if (!verified && !complete) status = { text: tr(lang, 'กรอกช่องที่มีเครื่องหมาย * ให้ครบเพื่อบันทึกครั้งแรก', 'Fill every * field to save this section for the first time'), color: 'var(--muted)' };
    else if (canSave) status = { text: tr(lang, 'พร้อมบันทึก', 'Ready to save'), color: 'var(--muted)' };
    else if (!dirtyS && hasSavedData) status = { text: tr(lang, 'บันทึกแล้ว', 'Saved'), color: 'var(--teal-deep)', check: true };

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 8, paddingTop: 14, borderTop: '1px dashed var(--cream-deep)' }}>
        <Btn kind="teal" size="sm" disabled={!canSave} onClick={() => saveSection(s)} style={!canSave ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}>
          {tr(lang, 'บันทึกส่วนนี้', 'Save section')} <span className="mono">→</span>
        </Btn>
        {status && (
          <span style={{ fontSize: 12.5, color: status.color, fontWeight: status.check ? 600 : 400 }}>
            {status.check ? '✓ ' : ''}
            {status.text}
          </span>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 18px', borderRadius: 16, background: 'var(--teal-50)' }}>
        <ShieldSvg color="var(--teal-deep)" size={20} />
        <p style={{ margin: 0, fontSize: 13, color: 'var(--teal-deep)', lineHeight: 1.6 }}>
          <T th="ข้อมูลนี้จะถูกใช้กรอกแบบฟอร์มสมัครเวิร์กชอปให้อัตโนมัติ และเก็บไว้ในเครื่องของคุณ · แต่ละส่วนบันทึกแยกกันได้ · ส่วน “ตัวตน” แก้ไขได้เดือนละครั้ง" en="This vault auto-fills your workshop checkout forms. Stored on your device · each section saves independently · Identity can be changed once a month." />
        </p>
      </div>

      <SectionCard title={tr(lang, 'ตัวตน', 'Identity')} badge={statusBadge('identity')}>
        {identityLocked && (
          <div
            role="status"
            style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 12, background: '#fcefcf', color: '#7a4f0a', fontSize: 13, lineHeight: 1.55, marginBottom: 16 }}
          >
            <span aria-hidden>🔒</span>
            <span>
              {tr(
                lang,
                `ข้อมูลตัวตนแก้ไขได้ 1 ครั้งทุก ${IDENTITY_LOCK_DAYS} วัน — แก้ไขได้อีกครั้งวันที่ ${lockLiftsOn}`,
                `Identity can be changed once every ${IDENTITY_LOCK_DAYS} days — editable again on ${lockLiftsOn}`
              )}
            </span>
          </div>
        )}
        {/* A disabled fieldset greys out every control inside without touching
            each input — the save bar below checks the same flag. */}
        <fieldset disabled={identityLocked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, opacity: identityLocked ? 0.55 : 1 }}>
        <div className="form-grid">
          <div>
            <label className={fieldLabel}>
              <T th="คำนำหน้า" en="Title / Prefix" />
              {req()}
            </label>
            <select value={v.prefix || ''} onChange={(e) => setV((p) => ({ ...p, prefix: e.target.value }))} onBlur={onBlurField('prefix')} className="field" style={showErr('prefix', 'identity') ? ERR_RING : undefined}>
              <option value="">{tr(lang, '— เลือก —', '— Select —')}</option>
              <option value="mr">{tr(lang, 'นาย', 'Mr.')}</option>
              <option value="mrs">{tr(lang, 'นาง', 'Mrs.')}</option>
              <option value="ms">{tr(lang, 'นางสาว', 'Ms.')}</option>
            </select>
            {showErr('prefix', 'identity') && renderErr()}
          </div>
          {/* spacer to keep prefix on its own row on 2-col grids */}
          <div aria-hidden />
          <div>
            <label className={fieldLabel}>
              <T th="ชื่อจริง" en="First name" />
              {req()}
            </label>
            <input
              value={v.firstName || ''}
              onChange={setThaiName('firstName')}
              onBlur={onBlurField('firstName')}
              className="field"
              inputMode="text"
              placeholder={tr(lang, 'ภาษาไทยเท่านั้น', 'Thai letters only')}
              style={hasErr('firstName', 'identity') ? ERR_RING : undefined}
            />
            {thaiWarn.firstName ? renderThaiErr() : showErr('firstName', 'identity') ? renderErr() : null}
          </div>
          <div>
            <label className={fieldLabel}>
              <T th="นามสกุล" en="Last name" />
              {req()}
            </label>
            <input
              value={v.lastName || ''}
              onChange={setThaiName('lastName')}
              onBlur={onBlurField('lastName')}
              className="field"
              inputMode="text"
              placeholder={tr(lang, 'ภาษาไทยเท่านั้น', 'Thai letters only')}
              style={hasErr('lastName', 'identity') ? ERR_RING : undefined}
            />
            {thaiWarn.lastName ? renderThaiErr() : showErr('lastName', 'identity') ? renderErr() : null}
          </div>
          <div>
            <label className={fieldLabel}>
              <T th="ชื่อเล่น" en="Nickname" />
              {req()}
            </label>
            <input
              value={v.nickname || ''}
              onChange={setThaiName('nickname')}
              onBlur={onBlurField('nickname')}
              className="field"
              inputMode="text"
              placeholder={tr(lang, 'เช่น มะนาว (ภาษาไทยเท่านั้น)', 'e.g. Nong (Thai letters only)')}
              style={hasErr('nickname', 'identity') ? ERR_RING : undefined}
            />
            {thaiWarn.nickname ? renderThaiErr() : showErr('nickname', 'identity') ? renderErr() : null}
          </div>
          <div>
            <label className={fieldLabel}>
              <T th="วันเกิด" en="Birthdate" />
              {req()}
              {calcAge(v.dob) != null && (
                <span style={{ color: 'var(--teal)', marginLeft: 8 }}>· {lang === 'th' ? `${calcAge(v.dob)} ปี` : `age ${calcAge(v.dob)}`}</span>
              )}
            </label>
            <input
              type="date"
              value={v.dob || ''}
              onChange={(e) => setV((p) => ({ ...p, dob: e.target.value }))}
              onBlur={onBlurField('dob')}
              className="field"
              max={new Date().toISOString().slice(0, 10)}
              style={showErr('dob', 'identity') ? ERR_RING : undefined}
            />
            {showErr('dob', 'identity') && renderErr()}
          </div>
          <div>
            <label className={fieldLabel}>
              <T th="เพศ" en="Gender" />
              {req()}
            </label>
            <select
              value={v.gender || 'female'}
              onChange={(e) => {
                const g = e.target.value;
                setV((p) => ({ ...p, gender: g, genderOther: g === 'other' ? p.genderOther : '' }));
              }}
              className="field"
            >
              <option value="female">{tr(lang, 'หญิง', 'Female')}</option>
              <option value="male">{tr(lang, 'ชาย', 'Male')}</option>
              <option value="nonbinary">{tr(lang, 'ไม่ระบุเพศ', 'Non-binary')}</option>
              <option value="other">{tr(lang, 'อื่นๆ', 'Other')}</option>
            </select>
          </div>
          {v.gender === 'other' && (
            <div>
              <label className={fieldLabel}>
                <T th="ระบุเพศ" en="Specify gender" />
                {req()}
              </label>
              <input
                value={v.genderOther || ''}
                onChange={set('genderOther')}
                onBlur={onBlurField('genderOther')}
                className="field"
                style={showErr('genderOther', 'identity') ? ERR_RING : undefined}
                placeholder={tr(lang, 'ระบุอัตลักษณ์ทางเพศของคุณ', 'Type your gender identity')}
              />
              {showErr('genderOther', 'identity') && renderErr()}
            </div>
          )}
          <div>
            <label className={fieldLabel}>
              <T th="เบอร์โทรศัพท์" en="Phone number" />
              {req()}
            </label>
            <input type="tel" value={v.phone} onChange={set('phone')} onBlur={onBlurField('phone')} className="field" style={showErr('phone', 'identity') ? ERR_RING : undefined} placeholder={tr(lang, 'เช่น 081-234-5678', 'e.g. 081-234-5678')} />
            {showErr('phone', 'identity') && renderErr()}
          </div>
          <div>
            <label className={fieldLabel}>
              Line ID
              {req()}
            </label>
            <input value={v.lineId} onChange={set('lineId')} onBlur={onBlurField('lineId')} className="field" style={showErr('lineId', 'identity') ? ERR_RING : undefined} />
            {showErr('lineId', 'identity') && renderErr()}
          </div>
          <div>
            <label className={fieldLabel}>Facebook</label>
            <input value={v.facebook} onChange={set('facebook')} className="field" placeholder={tr(lang, 'ลิงก์หรือชื่อโปรไฟล์ Facebook (ไม่บังคับ)', 'Facebook profile link or name (optional)')} />
          </div>
        </div>
        </fieldset>
        {saveBar('identity')}
      </SectionCard>

      <SectionCard
        title={tr(lang, 'สุขภาพ & อาหาร', 'Health & dietary')}
        badge={statusBadge('health')}
        desc={tr(lang, 'ช่วยให้ผู้จัดดูแลคุณได้ดีขึ้นในวันเวิร์กชอป (หากไม่มี ให้ระบุว่า "ไม่มี")', 'Helps facilitators care for you on the day. Put "None" if not applicable.')}
      >
        <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
          <div>
            <label className={fieldLabel}>
              <T th="โรคประจำตัว / อาการแพ้" en="Medical conditions / allergies" />
              {req()}
            </label>
            <textarea value={v.medical} onChange={set('medical')} onBlur={onBlurField('medical')} className="field" rows={2} style={{ resize: 'vertical', ...(showErr('medical', 'health') ? ERR_RING : {}) }} placeholder={tr(lang, 'หากไม่มี ให้ระบุว่า "ไม่มี"', 'Put "None" if not applicable')} />
            {showErr('medical', 'health') && renderErr()}
          </div>
          <div>
            <label className={fieldLabel}>
              <T th="ข้อจำกัดด้านอาหาร" en="Dietary restrictions" />
              {req()}
            </label>
            <textarea value={v.dietary} onChange={set('dietary')} onBlur={onBlurField('dietary')} className="field" rows={2} style={{ resize: 'vertical', ...(showErr('dietary', 'health') ? ERR_RING : {}) }} placeholder={tr(lang, 'หากไม่มี ให้ระบุว่า "ไม่มี"', 'Put "None" if not applicable')} />
            {showErr('dietary', 'health') && renderErr()}
          </div>
        </div>
        {saveBar('health')}
      </SectionCard>

      <SectionCard title={tr(lang, 'ผู้ติดต่อฉุกเฉิน', 'Emergency contact')} desc={tr(lang, 'ไม่บังคับ — เว้นว่างได้ บันทึกเมื่อไรก็ได้', 'Optional — you may leave this blank. Saveable anytime.')}>
        <div className="form-grid">
          <div>
            <label className={fieldLabel}>
              <T th="ชื่อผู้ติดต่อ" en="Contact name" />
            </label>
            <input value={v.emName} onChange={set('emName')} className="field" />
          </div>
          <div>
            <label className={fieldLabel}>
              <T th="ความสัมพันธ์" en="Relationship" />
            </label>
            <input value={v.emRelation} onChange={set('emRelation')} className="field" />
          </div>
          <div className="fld-full">
            <label className={fieldLabel}>
              <T th="เบอร์โทรฉุกเฉิน" en="Emergency phone" />
            </label>
            <input type="tel" value={v.emPhone} onChange={set('emPhone')} className="field" />
          </div>
        </div>
        {saveBar('emergency')}
      </SectionCard>
    </div>
  );
}

function ShieldSvg({ color = 'currentColor', size = 26 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke={color} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 12l2 2 4-4" />
    </svg>
  );
}
