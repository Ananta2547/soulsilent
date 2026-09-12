/** Roles. A user has one primary `role` (the column every old check reads)
 *  and may carry extra ones in `roles_json` (migration 052). Admin implies
 *  everything. This file has no server imports so both sides can use it. */

export type Role = 'user' | 'teacher' | 'admin' | 'session_host';

/** Roles the admin can add on top of the primary one, with their Thai label. */
export const EXTRA_ROLES: { value: Role; label: string; hint: string }[] = [
  { value: 'teacher', label: 'ผู้สอน', hint: 'เห็น Teacher Dashboard และมีหน้าโปรไฟล์สาธารณะ' },
  { value: 'session_host', label: 'ผู้จัดรอบ', hint: 'เปิดรอบสอนของ Workshop ที่ถูกผูกชื่อไว้ได้เอง' },
];

export function parseRoles(json: string | null | undefined): Role[] {
  try {
    const arr = json ? (JSON.parse(json) as unknown) : [];
    return Array.isArray(arr) ? (arr.filter((r) => typeof r === 'string') as Role[]) : [];
  } catch {
    return [];
  }
}

/** Every role the user holds: primary + extras, admin last so it is easy to spot. */
export function rolesOf(u: { role?: string | null; roles_json?: string | null; roles?: string[] | null }): Role[] {
  const set = new Set<Role>();
  if (u.role) set.add(u.role as Role);
  parseRoles(u.roles_json).forEach((r) => set.add(r));
  (u.roles || []).forEach((r) => set.add(r as Role));
  return [...set];
}

/** True when the user holds any of `wanted` — or is admin. */
export function hasAnyRole(roles: readonly string[] | null | undefined, wanted: readonly Role[]): boolean {
  if (!roles) return false;
  if (roles.includes('admin')) return true;
  return wanted.some((w) => roles.includes(w));
}

/** SQL: the user row `alias` holds role `r` (primary or extra, or is admin).
 *  `r` must be a literal role name, never user input. */
export function roleSql(alias: string, r: Role): string {
  return `(${alias}.role = 'admin' OR ${alias}.role = '${r}' OR EXISTS (SELECT 1 FROM json_each(COALESCE(${alias}.roles_json, '[]')) WHERE json_each.value = '${r}'))`;
}
