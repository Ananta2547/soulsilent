/** The server's idea of "now", for the browser.
 *
 * Open/closed badges, countdowns and "event started" gates are all computed
 * on the client from the device clock — which the visitor can wind back. The
 * API enforces every deadline again with its own clock, so a wrong device
 * clock can never actually book a closed round; but the page would still show
 * a "จอง" button that only fails on submit. Learning the server's clock from
 * the `Date` header of the responses we already fetch keeps what the page
 * shows in line with what the server will accept.
 *
 * On the server the offset stays 0, so `serverNow()` is plain `new Date()`.
 */

let offsetMs = 0;

/** Read the `Date` header off a same-origin response and remember how far the
 *  device clock is from the server's. Safe to call on every response. */
export function learnServerClock(res: Response): void {
  const header = res.headers.get('date');
  if (!header) return;
  const serverMs = Date.parse(header);
  if (!Number.isFinite(serverMs)) return;
  // The header has whole-second precision; ignore drift under a couple of
  // seconds so an accurate device clock is not nudged around by rounding.
  const diff = serverMs - Date.now();
  offsetMs = Math.abs(diff) < 2000 ? 0 : diff;
}

/** Now, as the server sees it (device clock corrected by the learned offset). */
export function serverNow(): Date {
  return new Date(Date.now() + offsetMs);
}
