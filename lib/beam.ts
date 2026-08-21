/**
 * Beam Checkout — the payment gateway replacing Stripe for workshop bookings.
 *
 * The exports deliberately mirror `lib/stripe.ts` one-for-one so the call sites
 * (bookings POST, /pay, /confirm, /expire, the cron sweep and
 * /api/payments/verify) change as little as possible:
 *
 *   createWorkshopCheckout  ← stripe.checkout.sessions.create
 *   disablePaymentLink      ← expireCheckoutSession  (kills a saved QR)
 *   fetchPaymentLink        ← fetchCheckoutSession   (redirect-time verify)
 *   refundCharge            ← refundPaymentIntent
 *   verifyBeamSignature     ← stripe.webhooks.constructEventAsync
 *
 * Beam is a plain REST API, so there is no SDK and none of the Workers
 * workarounds Stripe needed (no fetch httpClient, no SubtleCryptoProvider).
 *
 * MONEY UNIT — read before touching any amount here. Beam takes the smallest
 * currency unit: THB is satang, so ฿1 is 100 and a ฿2,500 workshop is 250000.
 * Verified 2026-08-21 against a live link — netAmount 100 rendered as ฿1 on the
 * hosted page. Getting this wrong is a silent 100x error in either direction,
 * which is why `toSatang` is the only conversion in the file and why every
 * request logs the baht and satang figures side by side.
 */
import { getEnv } from './db';

/** Statuses a payment link moves through (Beam's Payment Links overview). */
export type BeamLinkStatus = 'ACTIVE' | 'PAID' | 'EXPIRED' | 'DISABLED' | 'VOIDED' | 'REFUNDED';

async function getConfig(): Promise<{ base: string; auth: string }> {
  const env = await getEnv();
  const merchantId = env.BEAM_MERCHANT_ID || '';
  const apiKey = env.BEAM_API_KEY || '';
  if (!merchantId || !apiKey) {
    throw new Error('Beam is not configured — set BEAM_MERCHANT_ID and BEAM_API_KEY');
  }
  return {
    // Playground and production are separate hosts with non-interchangeable
    // keys; a production key sent to playground returns 401.
    base: env.BEAM_BASE_URL || 'https://api.beamcheckout.com',
    auth: 'Basic ' + btoa(`${merchantId}:${apiKey}`),
  };
}

async function beamFetch<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ status: number; ok: boolean; data: T | null }> {
  const { base, auth } = await getConfig();

  // Beam intermittently answers 502 (observed while testing against the live
  // API), which would otherwise fail a booking outright. One retry fixes it.
  // The idempotency key makes that retry safe: if the first attempt actually
  // reached Beam, the retry returns that same result instead of creating a
  // second payment link. Keys are honoured for 12 hours.
  const idempotencyKey = method === 'POST' ? crypto.randomUUID() : null;
  const headers: Record<string, string> = {
    Authorization: auth,
    'content-type': 'application/json',
  };
  if (idempotencyKey) headers['x-beam-idempotency-key'] = idempotencyKey;

  const MAX_ATTEMPTS = 3;
  let res: Response | null = null;
  let text = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    res = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    text = await res.text();
    // Only server-side failures are worth retrying — a 4xx is our mistake and
    // will fail identically.
    if (res.status < 500 || attempt === MAX_ATTEMPTS) break;
    console.warn(`Beam ${method} ${path} → ${res.status}, retry ${attempt}/${MAX_ATTEMPTS - 1}`);
    // Beam has answered 502 twice in a row, so give it a moment rather than
    // firing the retry into the same bad second.
    await new Promise((r) => setTimeout(r, 400 * attempt));
  }

  let data: T | null = null;
  try {
    data = text ? (JSON.parse(text) as T) : null;
  } catch {
    // Not JSON — leave data null; the status code still tells the caller what
    // happened.
  }
  if (!res!.ok) {
    console.error(`Beam ${method} ${path} → ${res!.status}`, text.slice(0, 500));
  }
  return { status: res!.status, ok: res!.ok, data };
}

/**
 * Beam fans every event for a merchant account out to EVERY registered webhook
 * endpoint. Preview and production share one live account, so each site hears
 * about the other's payments — and a booking id from the other environment
 * simply is not in this database.
 *
 * So the reference we send carries the site that created it, and each side
 * skips anything that is not its own instead of treating a stranger's payment
 * as money it has to deal with.
 *
 * Format: "<host>|<bookingId>". Rows created before this carry a bare booking
 * id and are still accepted (host comes back null).
 */
export function makeReference(bookingId: string, siteUrl: string): string {
  let host = '';
  try {
    host = new URL(siteUrl).host;
  } catch {
    // Unparseable SITE_URL — send an untagged reference rather than block the
    // payment.
  }
  // The nonce keeps every link distinct. Beam answers 502 — not a 4xx — when a
  // second link reuses a referenceId, which made "continue payment" fail every
  // single time while a fresh booking always worked.
  const nonce = Date.now().toString(36);
  return host ? `${host}|${bookingId}|${nonce}` : `${bookingId}|${nonce}`;
}

/**
 * Read a reference back. Handles all three generations: bare booking id,
 * "<host>|<bookingId>", and "<host>|<bookingId>|<nonce>".
 */
export function parseReference(reference: string | null | undefined): {
  host: string | null;
  bookingId: string | null;
} {
  if (!reference) return { host: null, bookingId: null };
  const parts = reference.split('|');
  if (parts.length === 1) return { host: null, bookingId: parts[0] };
  // A bare "<bookingId>|<nonce>" has no host, which only happens when SITE_URL
  // could not be parsed. A UUID has dashes; the nonce never does.
  if (parts.length === 2 && parts[0].includes('-')) {
    return { host: null, bookingId: parts[0] };
  }
  return { host: parts[0], bookingId: parts[1] };
}

/** Baht → satang. The single conversion point in the whole integration. */
function toSatang(baht: number): number {
  return Math.round(baht * 100);
}

/**
 * Beam does not publish its response field names, so read the id and URL
 * tolerantly instead of betting on one spelling. Pin these down once a real
 * response is captured from the preview environment.
 */
function readId(o: Record<string, unknown> | null): string | null {
  if (!o) return null;
  return (o.paymentLinkId || o.id || o.linkId || null) as string | null;
}
function readUrl(o: Record<string, unknown> | null): string | null {
  if (!o) return null;
  return (o.url || o.paymentLinkUrl || o.link || o.checkoutUrl || null) as string | null;
}

/**
 * Dig a charge id out of any Beam object.
 *
 * Beam publishes no payload schema, and the first live payment proved the point:
 * `payment_link.paid` confirmed the booking but no `chargeId` was found at the
 * top level, so nothing was stored to refund against. Rather than betting on one
 * spelling, walk the object for a key that looks like a charge id — `chargeId`,
 * `charge_id`, or a nested `charge: { id }`.
 *
 * Depth-limited so a malformed or deeply nested payload can't spin.
 */
export function findChargeId(value: unknown, depth = 0): string | null {
  if (!value || typeof value !== 'object' || depth > 5) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findChargeId(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }

  const obj = value as Record<string, unknown>;
  for (const [key, v] of Object.entries(obj)) {
    const k = key.toLowerCase();
    if (typeof v === 'string' && v && (k === 'chargeid' || k === 'charge_id')) return v;
    // { charge: { id: "..." } }
    if (k === 'charge' && v && typeof v === 'object') {
      const id = (v as Record<string, unknown>).id;
      if (typeof id === 'string' && id) return id;
    }
  }
  for (const v of Object.values(obj)) {
    const hit = findChargeId(v, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/**
 * Create a hosted Beam checkout for one booking.
 *
 * `expiresAt` matches the seat-hold window so the QR dies exactly when the hold
 * lapses, even if nothing on our side ever calls disablePaymentLink. Unlike
 * Stripe (which refuses anything under 30 minutes — the reason the hold was
 * stretched to 60) Beam accepts short windows, so `holdMinutes` can safely drop
 * back to 10 later.
 *
 * Returns the same shape as the Stripe helper — `sessionId` is Beam's payment
 * link id — so the call sites keep working unchanged.
 */
export async function createWorkshopCheckout(params: {
  workshopTitle: string;
  amount: number;
  bookingId: string;
  userId: string;
  successUrl: string;
  /** Where to send a shopper who backs out. Beam's guide never mentions it, but
   *  a fetched link echoes `cancelUrl` back, so the field is real. */
  cancelUrl?: string;
  holdMinutes?: number;
}): Promise<{ url: string; sessionId: string }> {
  const netAmount = toSatang(params.amount);
  const holdMinutes = params.holdMinutes ?? 60;

  // Logged on purpose: a 100x unit slip is the most damaging bug this file can
  // ship and it is invisible without both numbers side by side.
  console.log(
    `Beam checkout booking=${params.bookingId} ฿${params.amount} → netAmount=${netAmount} satang, expires in ${holdMinutes}m`,
  );

  const { ok, data, status } = await beamFetch<Record<string, unknown>>(
    'POST',
    '/api/v1/payment-links',
    {
      order: {
        netAmount,
        currency: 'THB',
        description: params.workshopTitle,
        // How the webhook finds its way back to our row — tagged with this
        // site's host so the other environment ignores it.
        referenceId: makeReference(params.bookingId, params.successUrl),
      },
      expiresAt: new Date(Date.now() + holdMinutes * 60 * 1000).toISOString(),
      redirectUrl: params.successUrl,
      ...(params.cancelUrl ? { cancelUrl: params.cancelUrl } : {}),
      linkSettings: {
        qrPromptPay: { isEnabled: true },
        mobileBanking: { isEnabled: true },
        card: { isEnabled: true },
      },
      collectDeliveryAddress: false,
    },
  );

  const url = readUrl(data);
  const id = readId(data);
  if (!ok || !url || !id) {
    throw new Error(`Beam create payment link failed (HTTP ${status})`);
  }
  return { url, sessionId: id };
}

/**
 * Close an open payment link so its QR stops working — the Beam equivalent of
 * cancelling a Stripe PaymentIntent, and far simpler: one documented endpoint
 * instead of retrieve → cancel PI → expire session.
 *
 * Returns `{ paid }` so a caller that loses the race (the shopper paid moments
 * before we disabled) confirms the booking instead of cancelling it.
 */
export async function disablePaymentLink(linkId: string): Promise<{ paid: boolean }> {
  const current = await fetchPaymentLink(linkId);
  if (current.paid) return { paid: true };

  // A link cannot be deleted or edited — disable is the only mutation, and it
  // applies to an ACTIVE link. Anything else is already closed.
  if (current.status === 'ACTIVE') {
    await beamFetch('POST', `/api/v1/payment-links/${linkId}/disable`);
  }
  // Re-read: the shopper may have paid during the disable call.
  const after = await fetchPaymentLink(linkId);
  return { paid: after.paid };
}

/**
 * Read a payment link's live state. Used by /api/payments/verify when the user
 * returns from Beam, so a booking still confirms if the webhook never arrives.
 */
export async function fetchPaymentLink(linkId: string): Promise<{
  id: string | null;
  status: BeamLinkStatus | null;
  paid: boolean;
  raw: Record<string, unknown> | null;
}> {
  const { data } = await beamFetch<Record<string, unknown>>(
    'GET',
    `/api/v1/payment-links/${linkId}`,
  );
  const status = (data?.status as BeamLinkStatus) ?? null;
  return {
    id: readId(data),
    status,
    // REFUNDED / VOIDED mean money did arrive and went back — not a held seat.
    paid: status === 'PAID',
    raw: data,
  };
}

/**
 * Refund a charge in full — used when money lands after the hold already
 * expired, so nobody pays for a seat they no longer hold.
 *
 * As with Stripe, a PromptPay refund is not instant and may need the payer to
 * supply bank details, so this starts a refund rather than completing one.
 */
export async function refundCharge(chargeId: string): Promise<void> {
  const { ok, status } = await beamFetch('POST', '/api/v1/refunds', { chargeId });
  if (!ok) throw new Error(`Beam refund failed (HTTP ${status})`);
}

/**
 * Verify a webhook really came from Beam.
 *
 * `X-Beam-Signature` is base64(HMAC-SHA256(raw body bytes, base64-decoded
 * key)). The RAW body must be used — re-serialising parsed JSON changes the
 * bytes and the signature stops matching. Beam sends no timestamp, so there is
 * no replay window to enforce.
 */
export async function verifyBeamSignature(
  rawBody: string,
  signature: string | null,
  secretBase64: string,
): Promise<boolean> {
  if (!signature || !secretBase64) return false;

  const keyBytes = Uint8Array.from(atob(secretBase64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

  // Constant-time compare so a wrong signature can't be probed byte by byte.
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}
