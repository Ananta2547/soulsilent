import { SignJWT, jwtVerify } from 'jose';
import { hash, compare } from 'bcryptjs';
import { cookies } from 'next/headers';
import { getEnv } from './db';
import type { CurrentUser, JWTPayload } from './types';
import { getDB } from './db';
import { hasAnyRole, rolesOf, type Role } from './roles';

const COOKIE_NAME = 'ss_token';
const TOKEN_EXPIRY = '7d';

async function getSecret(): Promise<Uint8Array> {
  const env = await getEnv();
  const secret = env.JWT_SECRET || 'dev-secret-change-in-production';
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, 12);
}

export async function verifyPassword(password: string, hashed: string): Promise<boolean> {
  return compare(password, hashed);
}

export async function createToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(await getSecret());
}

/**
 * Sign a single-use password-reset token. Carries the user id, a `pwreset`
 * scope, and a `nonce` that must match the value stored on the user row — so a
 * link dies once the password is reset (nonce cleared) or another reset is
 * requested (nonce rotated).
 */
export async function createResetToken(sub: string, nonce: string): Promise<string> {
  return new SignJWT({ sub, scope: 'pwreset', nonce })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(await getSecret());
}

/** Verify a reset token and return its `sub`/`nonce`, or null if invalid. */
export async function verifyResetToken(
  token: string,
): Promise<{ sub: string; nonce: string } | null> {
  try {
    const { payload } = await jwtVerify(token, await getSecret());
    if (payload.scope !== 'pwreset' || typeof payload.sub !== 'string' || typeof payload.nonce !== 'string') {
      return null;
    }
    return { sub: payload.sub, nonce: payload.nonce };
  } catch {
    return null;
  }
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, await getSecret());
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

export async function setAuthCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
}

export async function getAuthCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value ?? null;
}

export async function removeAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getCurrentUser(): Promise<JWTPayload | null> {
  const token = await getAuthCookie();
  if (!token) return null;
  return verifyToken(token);
}

export async function requireAuth(): Promise<JWTPayload> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');
  return user;
}

/** The signed-in user with every role they hold, or null. One row read; the
 *  roles come from the database rather than the token so an admin ticking a
 *  role takes effect without a fresh sign-in. */
export async function getCurrentUserWithRoles(): Promise<CurrentUser | null> {
  const u = await getCurrentUser();
  if (!u) return null;
  const db = await getDB();
  const row = await db
    .prepare('SELECT role, roles_json, account_status FROM users WHERE id = ?')
    .bind(u.sub)
    .first<{ role: string; roles_json: string | null; account_status: string | null }>();
  if (!row || (row.account_status && row.account_status !== 'active')) return null;
  return { ...u, role: row.role as JWTPayload['role'], roles: rolesOf(row) };
}

/** Throws 'Unauthorized' when signed out, 'Forbidden' without one of `wanted`
 *  (admin always passes). */
export async function requireRoles(...wanted: Role[]): Promise<CurrentUser> {
  const u = await getCurrentUserWithRoles();
  if (!u) throw new Error('Unauthorized');
  if (!hasAnyRole(u.roles, wanted)) throw new Error('Forbidden');
  return u;
}

export async function requireAdmin(): Promise<JWTPayload> {
  const user = await requireAuth();
  if (user.role !== 'admin') throw new Error('Forbidden');
  return user;
}
