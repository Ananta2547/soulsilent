'use client';

import { EXTRA_ROLES, rolesOf } from '@/lib/roles';
import { adminToast, AdminHead, AdminSearch, AdminChips, AdminSheet, SheetSection, Badge, RowMenu, type MenuItem } from '@/components/admin/AdminShell';

/** Everything the picker offers: admin on top, then the extras. */
const ROLE_OPTIONS = [
  { value: 'admin', label: 'admin', hint: 'จัดการทุกอย่างในระบบ' },
  ...EXTRA_ROLES.map((r) => ({ value: r.value, label: r.label, hint: r.hint })),
];
const ROLE_LABEL: Record<string, string> = Object.fromEntries(ROLE_OPTIONS.map((o) => [o.value, o.label]));

import { PageLoader } from '@/components/design/PageLoader';

import { useState, useEffect } from 'react';
import { sqliteToMs } from '@/lib/datetime';
import { isOwnerEmail } from '@/lib/constants';

type AccountStatus = 'active' | 'suspended' | 'pending_deletion';

interface User {
  id: string;
  email: string;
  name: string;
  nickname: string | null;
  role: string;
  /** Extra roles (JSON string[]) — see lib/roles.ts. */
  roles_json?: string | null;
  account_status: AccountStatus | null;
  deleted_at: string | null;
  is_team: number;
  created_at: string;
}

type Tab = 'all' | 'suspended' | 'pending_deletion';

const RECOVER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Days left in the 30-day recovery window for a self-deleted account. */
function daysLeft(deletedAt: string | null): number | null {
  const ms = sqliteToMs(deletedAt);
  if (!Number.isFinite(ms)) return null;
  const left = RECOVER_WINDOW_MS - (Date.now() - ms);
  return Math.max(0, Math.ceil(left / (24 * 60 * 60 * 1000)));
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  // One picker holds every role a user has. Saving maps it back onto the
  // primary `role` column (admin > teacher > user) plus the extras.
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [authError, setAuthError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  async function fetchUsers() {
    try {
      const res = await fetch('/api/users');
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setAuthError(body.error || `HTTP ${res.status}`);
        return;
      }
      const data = (await res.json()) as { users: User[] };
      setUsers(data.users || []);
    } catch (e) {
      console.error('Failed to load users', e);
      setAuthError('โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await fetchUsers();
    })();
  }, []);

  async function handleUpdateRole(userId: string) {
    await fetch(`/api/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: editRoles.includes('admin') ? 'admin' : editRoles.includes('teacher') ? 'teacher' : 'user',
        roles: editRoles.filter((r) => r !== 'admin'),
      }),
    });
    setEditingId(null);
    adminToast('บันทึกบทบาทแล้ว');
    fetchUsers();
  }

  // Suspend / un-suspend / restore — all reversible, no hard delete.
  async function setStatus(userId: string, account_status: 'active' | 'suspended') {
    setBusyId(userId);
    await fetch(`/api/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_status }),
    });
    setBusyId(null);
    fetchUsers();
  }

  // Feature / unfeature this user on the public About "team" section.
  async function toggleTeam(user: User) {
    const next = user.is_team ? 0 : 1;
    setBusyId(user.id);
    // optimistic update
    setUsers((rows) => rows.map((r) => (r.id === user.id ? { ...r, is_team: next } : r)));
    try {
      await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_team: next }),
      });
    } finally {
      setBusyId(null);
    }
  }

  const statusOf = (u: User): AccountStatus => u.account_status || 'active';
  const counts = {
    all: users.length,
    suspended: users.filter((u) => statusOf(u) === 'suspended').length,
    pending_deletion: users.filter((u) => statusOf(u) === 'pending_deletion').length,
  };
  const shown = users.filter((u) => (tab === 'all' ? true : statusOf(u) === tab));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <PageLoader />
      </div>
    );
  }

  if (authError) {
    return (
      <div className="adm-card adm-empty">
        <p style={{ color: 'var(--ink)', fontWeight: 600, margin: '0 0 4px' }}>โหลดข้อมูลผู้ใช้ไม่สำเร็จ</p>
        <p style={{ margin: '0 0 16px' }}>{authError}</p>
        <a href="/auth/login?redirect=/admin/users" className="adm-btn teal">
          เข้าสู่ระบบใหม่
        </a>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const found = shown.filter((u) => !q || [u.name, u.nickname, u.email].some((s) => (s || '').toLowerCase().includes(q)));
  const editing = users.find((u) => u.id === editingId) || null;

  const rowOf = (user: User) => {
    const status = statusOf(user);
    const left = status === 'pending_deletion' ? daysLeft(user.deleted_at) : null;
    const owner = isOwnerEmail(user.email);
    // Display name = the nickname users edit everywhere else, falling back to
    // the registration name; the full name shows underneath when it differs.
    const display = (user.nickname && user.nickname.trim()) || user.name;
    const full = user.nickname && user.nickname.trim() !== user.name ? user.name : '';
    const roles = rolesOf(user).filter((r) => r !== 'user');
    const roleBadges =
      roles.length === 0 ? (
        <Badge tone="mute">user</Badge>
      ) : (
        roles.map((r) => (
          <Badge key={r} tone={r === 'admin' ? 'bad' : 'teal'}>
            {ROLE_LABEL[r] || r}
          </Badge>
        ))
      );
    const statusBadge = owner ? (
      <Badge tone="teal">เจ้าของระบบ</Badge>
    ) : status === 'suspended' ? (
      <Badge tone="bad">ระงับ</Badge>
    ) : status === 'pending_deletion' ? (
      <Badge tone="warn">รอลบ{left != null ? ` · ${left} วัน` : ''}</Badge>
    ) : (
      <Badge tone="ok">ปกติ</Badge>
    );
    const menu: MenuItem[] = owner
      ? []
      : [
          status === 'active'
            ? { label: 'ระงับบัญชี', danger: true, onClick: () => setStatus(user.id, 'suspended'), disabled: busyId === user.id }
            : status === 'suspended'
              ? { label: 'ยกเลิกระงับ', onClick: () => setStatus(user.id, 'active'), disabled: busyId === user.id }
              : { label: 'กู้คืนบัญชี', onClick: () => setStatus(user.id, 'active'), disabled: busyId === user.id },
        ];
    const editBtn = owner ? (
      <span className="adm-meta" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="11" width="14" height="10" rx="2" strokeWidth={1.8} />
          <path strokeLinecap="round" strokeWidth={1.8} d="M8 11V7a4 4 0 1 1 8 0v4" />
        </svg>
        ล็อกไว้
      </span>
    ) : (
      <button
        type="button"
        className="adm-btn sm"
        onClick={() => {
          setEditingId(user.id);
          setEditRoles(rolesOf(user).filter((r) => r !== 'user'));
        }}
      >
        แก้ไขบทบาท
      </button>
    );
    const team = (
      <button
        type="button"
        onClick={() => toggleTeam(user)}
        disabled={busyId === user.id}
        title={user.is_team ? 'นำออกจากทีม About' : 'เพิ่มเข้าทีม About'}
        className={`adm-star${user.is_team ? ' is-on' : ''}`}
        aria-pressed={!!user.is_team}
      >
        {user.is_team ? '★' : '☆'}
      </button>
    );
    const joined = new Date(sqliteToMs(user.created_at)).toLocaleDateString('th-TH');
    return { display, full, roleBadges, statusBadge, menu, editBtn, team, joined };
  };

  return (
    <>
      <AdminHead
        eyebrow="admin · users"
        title="ผู้ใช้งาน"
        sub={`${users.length} คน · กำหนดสิทธิ์ admin / ผู้จัด / ผู้จัดรอบ ได้จากปุ่ม แก้ไขบทบาท · ★ = แสดงในทีมหน้า About`}
      />

      <div className="adm-toolbar">
        <AdminSearch value={query} onChange={setQuery} placeholder="ค้นหาชื่อหรืออีเมล" />
        <AdminChips
          value={tab}
          onChange={setTab}
          items={[
            { key: 'all', label: 'ทั้งหมด', n: counts.all },
            { key: 'suspended', label: 'ระงับ', n: counts.suspended },
            { key: 'pending_deletion', label: 'รอลบ', n: counts.pending_deletion },
          ]}
        />
      </div>

      <div className="adm-card">
        {found.length === 0 ? (
          <div className="adm-empty">
            <p style={{ margin: '0 0 12px' }}>ไม่พบรายการที่ตรงกับเงื่อนไข</p>
            {query && (
              <button type="button" className="adm-btn sm" onClick={() => setQuery('')}>
                ล้างคำค้นหา
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="adm-table-wrap has-cards">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>ผู้ใช้</th>
                    <th>บทบาท</th>
                    <th>สถานะ</th>
                    <th title="แสดงในทีมหน้า About">ทีม</th>
                    <th>สมัครเมื่อ</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {found.map((user) => {
                    const r = rowOf(user);
                    return (
                      <tr key={user.id}>
                        <td>
                          <div className="adm-cell-title">
                            <span className="adm-avatar">{(r.display || '?').charAt(0).toUpperCase()}</span>
                            <div style={{ minWidth: 0 }}>
                              <b>{r.display}</b>
                              <small className="adm-mono" style={{ fontSize: 12 }}>
                                {user.email}
                                {r.full ? ` · ${r.full}` : ''}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="adm-badges">{r.roleBadges}</div>
                        </td>
                        <td>{r.statusBadge}</td>
                        <td>{r.team}</td>
                        <td className="adm-meta" style={{ whiteSpace: 'nowrap' }}>
                          {r.joined}
                        </td>
                        <td className="act">
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {r.editBtn}
                            <RowMenu items={r.menu} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="adm-mcards">
              {found.map((user) => {
                const r = rowOf(user);
                return (
                  <div key={user.id} className="adm-mcard">
                    <div className="adm-mcard-top">
                      <span className="adm-avatar" style={{ width: 40, height: 40, fontSize: 14 }}>
                        {(r.display || '?').charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <div className="adm-mcard-title">{r.display}</div>
                        <div className="adm-mcard-sub">{user.email}</div>
                      </div>
                      {r.team}
                    </div>
                    <div className="adm-badges">
                      {r.statusBadge}
                      {r.roleBadges}
                    </div>
                    <div className="adm-meta">สมัครเมื่อ {r.joined}{r.full ? ` · ${r.full}` : ''}</div>
                    <div className="adm-mcard-acts">
                      {r.editBtn}
                      <RowMenu items={r.menu} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <AdminSheet
        open={!!editing}
        onClose={() => setEditingId(null)}
        eyebrow="admin · users"
        title="แก้ไขบทบาท"
        sub={editing ? `${(editing.nickname && editing.nickname.trim()) || editing.name} · ${editing.email}` : undefined}
        width={520}
        footer={
          <>
            <button type="button" className="adm-btn" onClick={() => setEditingId(null)}>
              ยกเลิก
            </button>
            <button type="button" className="adm-btn teal" onClick={() => editing && handleUpdateRole(editing.id)}>
              บันทึก
            </button>
          </>
        }
      >
        <SheetSection n={1} title="บทบาท">
          <p className="adm-hint" style={{ marginTop: -8 }}>
            ไม่ติ๊กเลย = ผู้เข้าร่วมทั่วไป · เลือกได้หลายบทบาท
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, margin: '0 -14px' }}>
            {ROLE_OPTIONS.map((o) => (
              <label key={o.value} className="adm-check">
                <input
                  type="checkbox"
                  checked={editRoles.includes(o.value)}
                  onChange={(e) =>
                    setEditRoles((rs) => (e.target.checked ? [...rs, o.value] : rs.filter((x) => x !== o.value)))
                  }
                />
                <div>
                  <b>{o.label}</b>
                  {o.hint && <span>{o.hint}</span>}
                </div>
              </label>
            ))}
          </div>
        </SheetSection>
      </AdminSheet>
    </>
  );
}
