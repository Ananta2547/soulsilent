'use client';

/**
 * Autofill vault storage. The server (users.vault_json, keyed by user_id) is the
 * source of truth so the vault follows the user across browsers/devices;
 * localStorage is kept as a same-device cache so existing synchronous readers
 * still work and it degrades gracefully when offline / signed out.
 */
const KEY = 'ss_autofill_vault';
export type VaultData = Record<string, string>;

function readLocal(): VaultData {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as VaultData) : {};
  } catch {
    return {};
  }
}

function writeLocal(data: VaultData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
}

/** Load the vault. Server wins; if the server is empty but this browser has a
 *  local vault (legacy / first sync) it is pushed up once. Falls back to local
 *  when offline or signed out. */
export async function getVault(): Promise<VaultData> {
  const local = readLocal();
  try {
    const res = await fetch('/api/me/vault');
    if (res.ok) {
      const { vault } = (await res.json()) as { vault: VaultData | null };
      if (vault && Object.keys(vault).length > 0) {
        writeLocal(vault); // sync server → this device
        return vault;
      }
      if (Object.keys(local).length > 0) {
        await putVault(local); // migrate this device's legacy vault up
      }
      return local;
    }
  } catch {}
  return local;
}

/** Persist the vault to both the server (per-user) and localStorage. */
export async function putVault(data: VaultData): Promise<void> {
  writeLocal(data);
  try {
    await fetch('/api/me/vault', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vault: data }),
    });
  } catch {}
}
