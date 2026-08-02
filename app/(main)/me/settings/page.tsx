'use client';

import { PageLoader } from '@/components/design/PageLoader';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLang, T, tr } from '@/lib/i18n';
import { useUnsavedGuard } from '@/lib/use-unsaved-guard';
import {
  EditProfilePanel,
  AccountPanel,
  IdentityPanel,
  AutofillPanel,
  type MeData,
} from '@/components/me/settings/panels';

type TabKey = 'edit' | 'account' | 'identity' | 'autofill';

const SECTIONS: { key: TabKey; th: string; en: string; icon: React.ReactNode }[] = [
  {
    key: 'edit',
    th: 'แก้ไขโปรไฟล์',
    en: 'Edit profile',
    icon: (
      <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M15.2 5.2l3.6 3.6M9 13l6.6-6.6a2 2 0 112.8 2.8L11.8 15.8 8 17l1.2-3.8z" />
        <path strokeLinecap="round" strokeWidth={1.7} d="M5 20h14" />
      </svg>
    ),
  },
  {
    key: 'account',
    th: 'จัดการบัญชี',
    en: 'Account management',
    icon: (
      <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="3.2" strokeWidth={1.7} />
        <path strokeLinecap="round" strokeWidth={1.7} d="M5 20c0-3.3 3-5.5 7-5.5s7 2.2 7 5.5" />
      </svg>
    ),
  },
  {
    key: 'identity',
    th: 'ยืนยันตัวตน',
    en: 'Identity verification',
    icon: (
      <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    key: 'autofill',
    th: 'ข้อมูลกรอกอัตโนมัติ',
    en: 'Autofill data',
    icon: (
      <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="3" y="5" width="18" height="14" rx="2" strokeWidth={1.7} />
        <path strokeLinecap="round" strokeWidth={1.7} d="M7 10h6M7 14h10" />
      </svg>
    ),
  },
];

export default function SettingsPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <SettingsHub />
    </Suspense>
  );
}

function LoadingBlock() {
  return (
    <div className="flex items-center justify-center h-64">
      <PageLoader />
    </div>
  );
}

function SettingsHub() {
  const { lang } = useLang();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = (searchParams.get('tab') || 'edit') as TabKey;
  const tab: TabKey = SECTIONS.some((s) => s.key === tabParam) ? tabParam : 'edit';

  const [me, setMe] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const warnMsg = tr(
    lang,
    'คุณมีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก แน่ใจหรือไม่ว่าต้องการออกโดยไม่บันทึก?',
    'You have unsaved changes. Are you sure you want to leave without saving?',
  );

  // Guard tab/refresh/external navigation while there are unsaved edits.
  useUnsavedGuard(dirty, warnMsg);

  const onDirtyChange = useCallback((d: boolean) => setDirty(d), []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = (await res.json()) as { user: MeData | null };
        setMe(data.user);
      } catch {}
      setLoading(false);
    })();
  }, []);

  function notify(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  }

  function setTab(k: TabKey) {
    if (k === tab) return;
    // Confirm before leaving a tab with unsaved edits.
    if (dirty && !window.confirm(warnMsg)) return;
    setDirty(false);
    router.replace(`/me/settings?tab=${k}`, { scroll: false });
  }

  const meta = SECTIONS.find((s) => s.key === tab)!;

  return (
    <>
      {/* Page head */}
      <div className="page-head" style={{ marginBottom: 30 }}>
        <div className="crumbs">
          <Link href="/">soulsilent</Link>
          <span>/</span>
          {tr(lang, 'ตั้งค่า', 'Settings')}
        </div>
        <h1 className="display-th" style={{ margin: 0, fontSize: 'clamp(30px,4vw,44px)', lineHeight: 1.1 }}>
          <T th="ตั้งค่า" en="Settings" />
        </h1>
        <p style={{ margin: '10px 0 0', fontSize: 15, color: 'var(--muted)', lineHeight: 1.55, maxWidth: 560 }}>
          <T th="จัดการโปรไฟล์ บัญชี และข้อมูลสำหรับสมัครเวิร์กชอป" en="Manage your profile, account and workshop checkout data." />
        </p>
      </div>

      <div className="settings-grid">
        {/* Sidebar */}
        <aside className="set-side">
          <div className="set-rail">
            {SECTIONS.map((s) => (
              <button key={s.key} className="set-navitem" aria-current={tab === s.key} onClick={() => setTab(s.key)} type="button">
                <span className="set-ico">{s.icon}</span>
                <span className="set-cap">{tr(lang, s.th, s.en)}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Content */}
        <div style={{ minWidth: 0 }}>
          <div style={{ marginBottom: 18 }}>
            <h2 className="display-th" style={{ margin: 0, fontSize: 24, lineHeight: 1.25 }}>
              {tr(lang, meta.th, meta.en)}
            </h2>
          </div>

          {loading || !me ? (
            <LoadingBlock />
          ) : (
            <>
              {tab === 'edit' && <EditProfilePanel me={me} onSaved={notify} onDirtyChange={onDirtyChange} />}
              {tab === 'account' && <AccountPanel me={me} onSaved={notify} onDirtyChange={onDirtyChange} />}
              {tab === 'identity' && <IdentityPanel me={me} onSaved={notify} />}
              {tab === 'autofill' && <AutofillPanel me={me} onSaved={notify} onDirtyChange={onDirtyChange} />}
            </>
          )}
        </div>
      </div>

      {toast && (
        <div className="toast">
          <svg width="16" height="16" fill="none" stroke="#fff" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M5 13l4 4L19 7" />
          </svg>
          {toast}
        </div>
      )}
    </>
  );
}
