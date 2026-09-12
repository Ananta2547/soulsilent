'use client';

/**
 * Autofill vault storage. The server (users.vault_json, keyed by user_id) is the
 * source of truth so the vault follows the user across browsers/devices.
 *
 * The localStorage cache is scoped PER USER (`ss_autofill_vault:<userId>`) so
 * that switching accounts on a shared browser can never surface — or worse,
 * upload — one account's vault into another's. A single global cache key used to
 * do exactly that: signing into an account with an empty server vault would push
 * the previous user's cached vault up to the new account.
 */
export type VaultData = Record<string, string>;

/** Pre-scoping single global key. Only ever purged now — never read into an account. */
const LEGACY_KEY = 'ss_autofill_vault';
const keyFor = (userId: string) => `ss_autofill_vault:${userId}`;

/** Remembered from the last server round-trip so putVault can scope its cache. */
let cachedUid: string | null = null;

function readLocal(key: string): VaultData {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as VaultData) : {};
  } catch {
    return {};
  }
}

function writeLocal(key: string, data: VaultData) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

function purgeLegacy() {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {}
}

/** Epoch ms until which the identity section is read-only; null = editable.
 *  Remembered from the last round-trip so the settings form can ask for it. */
let lockedUntil: number | null = null;

/** Thrown by putVault when the server refuses an identity change (lib/identity-lock). */
export class IdentityLockedError extends Error {
  constructor(public until: number) {
    super('identity_locked');
  }
}

/** Fetch the signed-in user's vault + id. null when signed-out / offline. */
async function fetchServer(): Promise<{ vault: VaultData; userId: string } | null> {
  try {
    const res = await fetch('/api/me/vault');
    if (!res.ok) return null;
    const d = (await res.json()) as { vault: VaultData | null; userId?: string; identityLockedUntil?: number | null };
    if (!d.userId) return null;
    lockedUntil = d.identityLockedUntil ?? null;
    return { vault: d.vault || {}, userId: d.userId };
  } catch {
    return null;
  }
}

async function putServer(data: VaultData): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/me/vault', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vault: data }),
    });
  } catch {
    return; // offline — the per-user cache keeps the edit until next sync
  }
  const d = (await res.json().catch(() => ({}))) as { identityLockedUntil?: number | null };
  if (res.status === 423) throw new IdentityLockedError(d.identityLockedUntil || 0);
  if (res.ok) lockedUntil = d.identityLockedUntil ?? null;
}

/** Identity lock as of the last server round-trip (call after getVault/putVault). */
export function getIdentityLockedUntil(): number | null {
  return lockedUntil;
}

/**
 * Load the current user's vault. Server is authoritative. When signed-out or
 * offline we return an empty vault rather than a shared cache — never risk
 * showing another account's data. The per-user cache only ever seeds a save
 * when the server has nothing yet for THIS user.
 */
export async function getVault(): Promise<VaultData> {
  const server = await fetchServer();
  // Retire the ambiguous global cache the moment we can — it must never bleed
  // into an account.
  purgeLegacy();
  if (!server) return {};

  cachedUid = server.userId;
  const localKey = keyFor(server.userId);

  if (Object.keys(server.vault).length > 0) {
    writeLocal(localKey, server.vault); // refresh this device's per-user cache
    return server.vault;
  }

  // Server empty → seed ONLY from this same user's scoped cache (provably theirs).
  const scoped = readLocal(localKey);
  if (Object.keys(scoped).length > 0) {
    void putServer(scoped); // migrate this user's own cache up
    return scoped;
  }
  return {};
}

/** Persist the vault to the server (per-user) and this user's scoped local cache. */
export async function putVault(data: VaultData): Promise<void> {
  let uid = cachedUid;
  if (!uid) {
    const server = await fetchServer();
    uid = server?.userId ?? null;
    if (uid) cachedUid = uid;
  }
  purgeLegacy();
  await putServer(data); // throws IdentityLockedError — nothing cached in that case
  if (uid) writeLocal(keyFor(uid), data);
}
