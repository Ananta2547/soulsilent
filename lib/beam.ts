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

/**
 * Thrown when Beam itself refuses the request, so callers can tell "the
 * gateway is having a moment, press the button again" apart from "something in
 * this booking is wrong". Both used to surface as the same
 * "เกิดข้อผิดพลาด", which left the user with no idea whether retrying helps.
 */
export class BeamError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'BeamError';
  }
  /** 5xx is Beam's side; a retry is genuinely worth offering. */
  get retryable(): boolean {
    return this.status >= 500 || this.status === 0;
  }
}

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
  opts: { idempotent?: boolean; attempts?: number } = {},
): Promise<{ status: number; ok: boolean; data: T | null }> {
  const { base, auth } = await getConfig();
  const { idempotent = true, attempts: maxAttempts = 3 } = opts;

  // Beam intermittently answers 502 (observed while testing against the live
  // API), which would otherwise fail a booking outright. One retry fixes it.
  // The idempotency key makes that retry safe: if the first attempt actually
  // reached Beam, the retry returns that same result instead of creating a
  // second payment link. Keys are honoured for 12 hours.
  const idempotencyKey = method === 'POST' && idempotent ? crypto.randomUUID() : null;
  const headers: Record<string, string> = {
    Authorization: auth,
    'content-type': 'application/json',
  };
  if (idempotencyKey) headers['x-beam-idempotency-key'] = idempotencyKey;

  const MAX_ATTEMPTS = maxAttempts;
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

/** Booking ids are v4 UUIDs, which is what makes them findable in a reference. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read a reference back. Handles all three generations: a bare booking id,
 * "<host>|<bookingId>", and "<host>|<bookingId>|<nonce>".
 *
 * Identify the booking id by its UUID shape rather than by position or by
 * "has dashes" — hostnames have dashes too, so that guess read
 * "soulsilent-preview.…workers.dev|<uuid>" as a booking id of the host, and
 * genuine payments were filed as unknown money.
 */
export function parseReference(reference: string | null | undefined): {
  host: string | null;
  bookingId: string | null;
} {
  if (!reference) return { host: null, bookingId: null };
  const parts = reference.split('|');

  const idx = parts.findIndex((p) => UUID_RE.test(p));
  if (idx !== -1) {
    return { host: idx > 0 ? parts[0] : null, bookingId: parts[idx] };
  }
  // No UUID in sight — an id shape we don't generate. Treat the whole thing as
  // the booking id and let the lookup fail loudly rather than guess a host.
  return { host: null, bookingId: reference };
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
 * Since migration 048 this is the CARD lane only — PromptPay comes from
 * `createQrCharge`. See the `linkSettings` comment below for why.
 *
 * `expiresAt` matches the seat-hold window so the link dies when the hold
 * lapses, even if nothing on our side ever calls disablePaymentLink. Beam does
 * honour a short window here, unlike Stripe (which refused anything under 30
 * minutes — the reason the hold used to be 60).
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
      // NO PromptPay here — that is the whole point.
      //
      // Beam's hosted page mints a brand-new QR every time the shopper flips
      // payment method and back, each with its own 30-minute clock and each
      // still payable. That is how one booking collected several live QR images
      // and the same seat got paid for twice, and no API field turns it off.
      //
      // PromptPay now comes from `createQrCharge` on our own page, where there
      // is no method switcher and the image is stored and re-served. This link
      // is the CARD lane only: with qrPromptPay off there is nothing for the
      // hosted page to switch back and forth to.
      linkSettings: {
        qrPromptPay: { isEnabled: false },
        mobileBanking: { isEnabled: true },
        card: { isEnabled: true },
      },
      collectDeliveryAddress: false,
    },
  );

  const url = readUrl(data);
  const id = readId(data);
  if (!ok || !url || !id) {
    throw new BeamError(`Beam create payment link failed (HTTP ${status})`, status);
  }
  return { url, sessionId: id };
}

/**
 * Create the ONE PromptPay QR a booking is paid with.
 *
 * This exists because Beam's hosted checkout page cannot be made to reuse a QR:
 * every switch of payment method mints another one, all of them payable, all on
 * their own clock. A booking with several live QR images is a seat that can be
 * paid for several times, and the customer who does it is out real money until
 * a refund lands days later.
 *
 * Making the charge ourselves fixes it at the source — our page shows one image
 * and has no switcher — but it does NOT fix the clock. Probed against the live
 * API on 2026-08-23 with three charges asking for 10, 5 and 2 minutes: all three
 * came back with the SAME expiry, exactly 30 minutes out. `expiryTime` is
 * accepted and ignored. It is still sent, in case that ever changes, but nothing
 * may depend on it — the seat hold is the only deadline that counts, and
 * `expires_at` on the booking stays the authority.
 *
 * There is also no way to kill a pending charge: cancel, void, expire and
 * disable all answer 404. A QR handed out at minute 0 is scannable at minute 25
 * whatever we do, so money arriving after the hold lapses still has to be given
 * back by the webhook + cron path.
 *
 * The image comes back only on creation — a later GET returns the charge without
 * it — so callers must store `imageBase64` rather than plan to re-fetch it.
 */
export async function createQrCharge(params: {
  amount: number;
  bookingId: string;
  /** Tagged into the reference so the other environment ignores this charge. */
  siteUrl: string;
}): Promise<{ chargeId: string; imageBase64: string; expiry: string | null }> {
  const amount = toSatang(params.amount);
  console.log(
    `Beam QR charge booking=${params.bookingId} ฿${params.amount} → amount=${amount} satang`,
  );

  const { ok, data, status } = await beamFetch<Record<string, unknown>>('POST', '/api/v1/charges', {
    amount,
    currency: 'THB',
    paymentMethod: {
      paymentMethodType: 'QR_PROMPT_PAY',
      // Asked for, not granted — Beam always returns 30 minutes. Kept so the
      // request states the intent and starts working if Beam ever honours it.
      qrPromptPay: {
        expiryTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      },
    },
    referenceId: makeReference(params.bookingId, params.siteUrl),
    returnUrl: params.siteUrl,
  });

  const image = (data?.encodedImage || {}) as Record<string, unknown>;
  const chargeId = typeof data?.chargeId === 'string' ? data.chargeId : null;
  const imageBase64 =
    typeof image.imageBase64Encoded === 'string' ? image.imageBase64Encoded : null;

  if (!ok || !chargeId || !imageBase64) {
    throw new BeamError(`Beam create QR charge failed (HTTP ${status})`, status);
  }
  return {
    chargeId,
    imageBase64,
    expiry: typeof image.expiry === 'string' ? image.expiry : null,
  };
}

/**
 * Read a charge's live state — the backstop for the QR page when the webhook is
 * slow or never arrives.
 *
 * A charge created through the Charges API reports `source: "API"` with an empty
 * `sourceId`, and echoes our `referenceId` back, which is how a payment is tied
 * to its booking without a payment link in the picture.
 */
export async function fetchCharge(chargeId: string): Promise<{
  status: string | null;
  paid: boolean;
  referenceId: string | null;
  raw: Record<string, unknown> | null;
}> {
  const { data } = await beamFetch<Record<string, unknown>>('GET', `/api/v1/charges/${chargeId}`);
  const status = typeof data?.status === 'string' ? data.status : null;
  // A pending charge answers "PENDING"; the success spelling has not been seen
  // on a live payment yet, so accept the plausible ones rather than let a paid
  // seat read as unpaid.
  const up = (status || '').toUpperCase();
  return {
    status,
    paid: up === 'SUCCEEDED' || up === 'SUCCESS' || up === 'PAID',
    referenceId: typeof data?.referenceId === 'string' ? data.referenceId : null,
    raw: data,
  };
}

/**
 * The still-payable URL for a link, or null if it can't be handed out again.
 *
 * Used by both routes that send a user to checkout so a booking only ever has
 * ONE live QR: minting a fresh link on every visit is how a user ended up with
 * two valid QR images, paid the older one, and had nothing update.
 */
export async function reusableCheckoutUrl(linkId: string | null | undefined): Promise<string | null> {
  if (!linkId) return null;
  try {
    const link = await fetchPaymentLink(linkId);
    if (link.status !== 'ACTIVE') return null;
    const url = link.raw?.url;
    return typeof url === 'string' && url ? url : null;
  } catch {
    // Couldn't ask Beam — fall through and mint a new link rather than block
    // the booking.
    return null;
  }
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
export async function refundCharge(
  chargeId: string,
  reason = 'Payment received after the seat hold expired',
): Promise<void> {
  // Send `chargeId` and `reason` only — proven against the live API (201).
  //
  // `reason` is required despite reading as optional; omitting it returns 502,
  // the same unhelpful status Beam gives for a duplicate referenceId, so it
  // looks like a flaky gateway rather than a malformed request.
  //
  // `amount` must be LEFT OUT. Partial refunds are card-only, so naming an
  // amount on a PromptPay charge is rejected — again as a 502. Omitting it
  // refunds the full charge, which is what we always want here.
  //
  // A 400 "Amount must be 1 or greater" does NOT mean the amount is missing:
  // it means the charge has nothing left to refund because it already was.
  // NO idempotency key and NO retry here, unlike every other POST.
  //
  // Beam blocks a repeated refund on the same charge —
  // 409 "db failed to create refund: request blocked due to conflict" — and the
  // retry surfaces as a 502. That is why automatic refunds kept failing while
  // the identical body sent by hand (which carries no key) returned 201 every
  // time. A refund is also the call where a silent retry is least welcome:
  // better to leave it for a human than to risk sending money twice.
  const { ok, status } = await beamFetch(
    'POST',
    '/api/v1/refunds',
    { chargeId, reason },
    { idempotent: false, attempts: 1 },
  );

  // Beam's way of saying "nothing left to refund" — the money is already back,
  // so this is the outcome we wanted, not a failure.
  if (status === 400 || status === 409) {
    console.warn(`Beam refund ${chargeId}: HTTP ${status} — treating as already refunded`);
    return;
  }
  if (!ok) throw new BeamError(`Beam refund failed (HTTP ${status})`, status);
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
