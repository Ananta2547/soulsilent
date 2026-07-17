import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { verifyPassword, createToken, setAuthCookie } from '@/lib/auth';
import type { User } from '@/lib/types';

const RECOVER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Parse a SQLite UTC datetime string to epoch ms (server runs in UTC). */
function utcMs(v: string | null): number {
  if (!v) return NaN;
  return new Date(v.replace(' ', 'T') + 'Z').getTime();
}

export async function POST(request: Request) {
  try {
    const { email, password, recover } = (await request.json()) as {
      email: string;
      password: string;
      recover?: boolean;
    };

    if (!email || !password) {
      return NextResponse.json({ error: 'กรุณากรอกอีเมลและรหัสผ่าน' }, { status: 400 });
    }

    const db = await getDB();
    const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<User>();

    if (!user || !user.password_hash) {
      return NextResponse.json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }, { status: 401 });
    }
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }, { status: 401 });
    }

    const status = user.account_status || 'active';

    // Admin-suspended → blocked, no self-recovery.
    if (status === 'suspended') {
      return NextResponse.json({ blocked: 'suspended' }, { status: 403 });
    }

    // Self-deleted → recoverable within 30 days.
    if (status === 'pending_deletion') {
      const elapsed = Date.now() - utcMs(user.deleted_at);
      if (Number.isFinite(elapsed) && elapsed >= RECOVER_WINDOW_MS) {
        return NextResponse.json({ blocked: 'deleted' }, { status: 403 });
      }
      if (!recover) {
        // Client shows the "recover account?" popup; it re-calls with recover:true.
        return NextResponse.json({ blocked: 'pending_deletion' }, { status: 200 });
      }
      // Recover → restore the account, then log in below.
      await db
        .prepare("UPDATE users SET account_status = 'active', deleted_at = NULL WHERE id = ?")
        .bind(user.id)
        .run();
    }

    const token = await createToken({ sub: user.id, email: user.email, name: user.name, role: user.role });
    await setAuthCookie(token);

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
