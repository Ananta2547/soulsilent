'use client';

import { PageLoader } from '@/components/design/PageLoader';

import { useState, useEffect } from 'react';
import { sqliteToMs } from '@/lib/datetime';
import { isOwnerEmail } from '@/lib/constants';

type AccountStatus = 'active' | 'suspended' | 'pending_deletion';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
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
  const [editRole, setEditRole] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function fetchUsers() {
    const res = await fetch('/api/users');
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setAuthError(body.error || `HTTP ${res.status}`);
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { users: User[] };
    setUsers(data.users || []);
    setLoading(false);
  }

  useEffect(() => { fetchUsers(); }, []);

  async function handleUpdateRole(userId: string) {
    await fetch(`/api/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: editRole }),
    });
    setEditingId(null);
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
      <div className="card text-center py-12">
        <p className="text-dark font-medium mb-1">โหลดข้อมูลผู้ใช้ไม่สำเร็จ</p>
        <p className="text-gray text-sm mb-4">{authError}</p>
        <a href="/auth/login?redirect=/admin/users" className="btn-primary text-sm">
          เข้าสู่ระบบใหม่
        </a>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'all', label: `ทั้งหมด (${counts.all})` },
    { key: 'suspended', label: `ระงับ (${counts.suspended})` },
    { key: 'pending_deletion', label: `ลบภายใน 30 วัน (${counts.pending_deletion})` },
  ];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-mono text-primary tracking-[.2em] uppercase mb-2">
          admin · users
        </p>
        <h1 className="font-heading text-3xl text-dark">จัดการผู้ใช้งาน</h1>
        <p className="text-sm text-gray mt-1">
          ทั้งหมด {users.length} คน · เปลี่ยน role ได้: admin, teacher, user
        </p>
      </header>

      <div className="flex items-center gap-2 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              tab === t.key
                ? 'btn-primary text-sm !py-1.5'
                : 'btn-ghost text-sm !py-1.5'
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface">
              <tr>
                <th className="text-left py-3 px-4 text-gray font-medium">ชื่อ</th>
                <th className="text-left py-3 px-4 text-gray font-medium">อีเมล</th>
                <th className="text-left py-3 px-4 text-gray font-medium">บทบาท</th>
                <th className="text-left py-3 px-4 text-gray font-medium">สถานะ</th>
                <th className="text-center py-3 px-4 text-gray font-medium">ทีม About</th>
                <th className="text-left py-3 px-4 text-gray font-medium">วันที่สมัคร</th>
                <th className="text-right py-3 px-4 text-gray font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-gray text-sm">
                    ไม่มีผู้ใช้ในหมวดนี้
                  </td>
                </tr>
              )}
              {shown.map((user) => {
                const status = statusOf(user);
                const left = status === 'pending_deletion' ? daysLeft(user.deleted_at) : null;
                const owner = isOwnerEmail(user.email);
                return (
                <tr key={user.id} className="border-t border-gray-lighter hover:bg-surface/50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                        <span className="text-primary font-medium text-xs">
                          {user.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="text-dark font-medium">{user.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray">{user.email}</td>
                  <td className="py-3 px-4">
                    {editingId === user.id && !owner ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value)}
                          className="input-field !py-1.5 !px-2 !text-xs w-24"
                        >
                          <option value="user">user</option>
                          <option value="teacher">teacher</option>
                          <option value="admin">admin</option>
                        </select>
                        <button onClick={() => handleUpdateRole(user.id)} className="text-primary text-xs font-medium">บันทึก</button>
                        <button onClick={() => setEditingId(null)} className="text-gray text-xs">ยกเลิก</button>
                      </div>
                    ) : (
                      <span className={
                        user.role === 'admin' ? 'badge-danger' :
                        user.role === 'teacher' ? 'badge-primary' :
                        'badge bg-gray-lighter text-gray'
                      }>
                        {user.role}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {status === 'suspended' ? (
                      <span className="badge-danger">ระงับ</span>
                    ) : status === 'pending_deletion' ? (
                      <span className="badge" style={{ background: '#fdf2da', color: '#8a6a16' }}>
                        รอลบ{left != null ? ` · ${left} วัน` : ''}
                      </span>
                    ) : (
                      <span className="badge" style={{ background: '#e6f4f1', color: '#0f766e' }}>ปกติ</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      type="button"
                      onClick={() => toggleTeam(user)}
                      disabled={busyId === user.id}
                      title={user.is_team ? 'นำออกจากทีม About' : 'เพิ่มเข้าทีม About'}
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                        user.is_team
                          ? 'bg-primary/10 text-primary hover:bg-primary/20'
                          : 'bg-gray-lighter/60 text-gray hover:bg-gray-lighter'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill={user.is_team ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                      {user.is_team ? 'อยู่ในทีม' : 'เพิ่ม'}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-gray text-xs">
                    {new Date(user.created_at).toLocaleDateString('th-TH')}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {owner ? (
                      <span className="inline-flex items-center gap-1 text-gray text-xs font-medium">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <rect x="5" y="11" width="14" height="10" rx="2" strokeWidth={1.8} />
                          <path strokeLinecap="round" strokeWidth={1.8} d="M8 11V7a4 4 0 1 1 8 0v4" />
                        </svg>
                        เจ้าของระบบ
                      </span>
                    ) : (
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => { setEditingId(user.id); setEditRole(user.role); }}
                        className="text-primary text-xs font-medium hover:underline"
                      >
                        แก้ไข
                      </button>
                      {status === 'active' ? (
                        <button
                          onClick={() => setStatus(user.id, 'suspended')}
                          disabled={busyId === user.id}
                          className="text-red-500 text-xs font-medium hover:underline disabled:opacity-50"
                        >
                          ระงับบัญชี
                        </button>
                      ) : status === 'suspended' ? (
                        <button
                          onClick={() => setStatus(user.id, 'active')}
                          disabled={busyId === user.id}
                          className="text-primary text-xs font-medium hover:underline disabled:opacity-50"
                        >
                          ยกเลิกระงับ
                        </button>
                      ) : (
                        <button
                          onClick={() => setStatus(user.id, 'active')}
                          disabled={busyId === user.id}
                          className="text-primary text-xs font-medium hover:underline disabled:opacity-50"
                        >
                          กู้คืนบัญชี
                        </button>
                      )}
                    </div>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
