import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { isOwnerEmail } from '@/lib/constants';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const { role, name, account_status, is_team } = (await request.json()) as {
      role?: string;
      name?: string;
      account_status?: 'active' | 'suspended';
      is_team?: boolean | number;
    };
    const db = await getDB();

    // Protect the owner account: role locked to admin, cannot be suspended.
    const target = await db
      .prepare('SELECT email FROM users WHERE id = ?')
      .bind(id)
      .first<{ email: string }>();
    if (target && isOwnerEmail(target.email)) {
      if (role && role !== 'admin') {
        return NextResponse.json(
          { error: 'ไม่สามารถเปลี่ยนบทบาทของบัญชีเจ้าของระบบได้' },
          { status: 403 },
        );
      }
      if (account_status === 'suspended') {
        return NextResponse.json(
          { error: 'ไม่สามารถระงับบัญชีเจ้าของระบบได้' },
          { status: 403 },
        );
      }
    }

    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (role) { fields.push('role = ?'); values.push(role); }
    if (name) { fields.push('name = ?'); values.push(name); }
    // Feature (or remove) this user on the public About "team" section.
    if (is_team !== undefined) {
      fields.push('is_team = ?');
      values.push(is_team ? 1 : 0);
    }
    // Admin suspend / un-suspend. Un-suspending also clears any deletion mark.
    if (account_status === 'suspended' || account_status === 'active') {
      fields.push('account_status = ?');
      values.push(account_status);
      if (account_status === 'active') {
        fields.push('deleted_at = NULL');
      }
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: 'ไม่มีข้อมูลที่ต้องอัปเดต' }, { status: 400 });
    }

    fields.push("updated_at = datetime('now')");
    values.push(id);

    await db
      .prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const db = await getDB();

    // The owner account can never be hard-deleted.
    const target = await db
      .prepare('SELECT email FROM users WHERE id = ?')
      .bind(id)
      .first<{ email: string }>();
    if (target && isOwnerEmail(target.email)) {
      return NextResponse.json(
        { error: 'ไม่สามารถลบบัญชีเจ้าของระบบได้' },
        { status: 403 },
      );
    }

    await db.prepare('DELETE FROM bookings WHERE user_id = ?').bind(id).run();
    await db.prepare('DELETE FROM enrollments WHERE user_id = ?').bind(id).run();
    await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
