'use client';

/**
 * Browser side of app notifications: ask permission, subscribe this device
 * with the server's VAPID key (/api/push/key), and register it with
 * /api/push/subscribe. iPhone/iPad only allow this inside the installed app.
 */
import { isIOS, isStandalone } from './usePwa';

export type PushState =
  | 'unsupported' // browser has no push
  | 'install-first' // iPhone/iPad in Safari: push only works from the home-screen app
  | 'unavailable' // the server has no VAPID keys yet
  | 'denied' // the member blocked notifications for this site
  | 'off'
  | 'on';

function toKey(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) || null;
}

export async function pushState(): Promise<PushState> {
  if (typeof window === 'undefined' || !('Notification' in window) || !('PushManager' in window) || !('serviceWorker' in navigator)) {
    return isIOS() && !isStandalone() ? 'install-first' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  const key = await fetch('/api/push/key').catch(() => null);
  if (!key || !key.ok) return 'unavailable';
  const reg = await registration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Turn notifications on for this device. Returns the resulting state. */
export async function enablePush(): Promise<PushState> {
  const keyRes = await fetch('/api/push/key');
  if (!keyRes.ok) return 'unavailable';
  const { publicKey } = (await keyRes.json()) as { publicKey: string };
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
  const reg = (await registration()) || (await navigator.serviceWorker.register('/sw.js', { scope: '/' }));
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) });
  const res = await fetch('/api/push/subscribe?test=1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || 'subscribe failed');
  }
  return 'on';
}

/** Turn notifications off for this device (also used on sign-out). */
export async function disablePush(): Promise<void> {
  const reg = await registration();
  const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
  if (!sub) return;
  await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
