'use client';

/**
 * Counts installs and opens of the installed app into /api/app/ping, so the
 * admin dashboard can show whether people use it. Anonymous: the server only
 * keeps a number per day.
 *
 * Each device is counted once as an install — on Chrome's `appinstalled`
 * event, or (iPhone has no such event) the first time it runs from the home
 * screen — and at most once a day as an open. localStorage remembers what
 * this device already sent.
 */
import { isStandalone } from './usePwa';

const INSTALLED_KEY = 'asl-app-installed';
const OPEN_DAY_KEY = 'asl-app-open-day';

function ping(m: 'install' | 'open') {
  fetch('/api/app/ping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ m }),
    keepalive: true,
  }).catch(() => {});
}

/** Count this device as installed, once. */
export function countInstall() {
  try {
    if (localStorage.getItem(INSTALLED_KEY)) return;
    localStorage.setItem(INSTALLED_KEY, String(Date.now()));
  } catch {
    return; // no storage: we could not keep it to once, so skip
  }
  ping('install');
}

/** On each page load: count an open (once a day) when running as the app. */
export function countAppOpen() {
  if (!isStandalone()) return;
  countInstall();
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  try {
    if (localStorage.getItem(OPEN_DAY_KEY) === today) return;
    localStorage.setItem(OPEN_DAY_KEY, today);
  } catch {
    return;
  }
  ping('open');
}
