'use client';

/**
 * Install state of the app (PWA), shared by the install banner and the /app
 * page. Chrome/Edge/Android hand us a `beforeinstallprompt` event we can fire
 * from our own button; Safari on iPhone/iPad has no such event, so there we
 * explain "Share → Add to Home Screen" instead.
 */
import { useSyncExternalStore } from 'react';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

type State = { canInstall: boolean; installed: boolean };

let deferred: InstallEvent | null = null;
let state: State = { canInstall: false, installed: false };
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};

let wired = false;
/** Hook up the browser events once, as early as possible (PwaRegister calls it). */
export function wirePwaEvents() {
  if (wired || typeof window === 'undefined') return;
  wired = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep Chrome's mini-bar away; our own button fires it
    deferred = e as InstallEvent;
    set({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    set({ canInstall: false, installed: true });
  });
}

/** Opens the browser's install dialog. Resolves true when the user accepts. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const ev = deferred;
  deferred = null;
  set({ canInstall: false });
  await ev.prompt();
  const choice = await ev.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
  return choice.outcome === 'accepted';
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Running as the installed app (home-screen icon), not in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** iPhone / iPad (iPadOS reports itself as a Mac with touch). */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Tell the service worker to forget the signed-in member's offline copies. */
export function clearUserOfflineData() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker?.controller) return;
  navigator.serviceWorker.controller.postMessage({ type: 'clear-user-data' });
}

export function usePwa() {
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  return { ...s, promptInstall };
}
