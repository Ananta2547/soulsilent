import Stripe from 'stripe';
import { getEnv } from './db';

let stripeInstance: Stripe | null = null;

export async function getStripe(): Promise<Stripe> {
  if (!stripeInstance) {
    const env = await getEnv();
    stripeInstance = new Stripe(env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2026-04-22.dahlia',
      // Cloudflare Workers has no Node `http` module — the Stripe SDK must talk
      // to the API over fetch, otherwise every call fails with
      // "An error occurred with our connection to Stripe".
      httpClient: Stripe.createFetchHttpClient(),
    });
  }
  return stripeInstance;
}

function appendSessionId(url: string): string {
  // Stripe replaces {CHECKOUT_SESSION_ID} with the actual session id.
  // Frontend reads it from the URL and calls /api/bookings/verify (or
  // /api/enrollments/verify) so payment is confirmed even if the webhook
  // never reaches us (e.g. local dev with no Stripe CLI forwarding).
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}session_id={CHECKOUT_SESSION_ID}`;
}

export async function createWorkshopCheckout(params: {
  workshopTitle: string;
  amount: number;
  bookingId: string;
  userId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string; sessionId: string }> {
  const stripe = await getStripe();
  const session = await stripe.checkout.sessions.create({
    // 'promptpay' = Thai QR payment via mobile banking apps (SCB/KBank/KMA/etc.)
    payment_method_types: ['promptpay'],
    line_items: [
      {
        price_data: {
          currency: 'thb',
          product_data: { name: params.workshopTitle },
          unit_amount: Math.round(params.amount * 100),
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: appendSessionId(params.successUrl),
    cancel_url: params.cancelUrl,
    metadata: {
      type: 'workshop',
      booking_id: params.bookingId,
      user_id: params.userId,
    },
  });
  return { url: session.url!, sessionId: session.id };
}

/**
 * Expire an open Checkout Session immediately. This cancels the session's
 * underlying PaymentIntent, so the PromptPay QR it produced stops working —
 * a QR saved to the phone then fails when scanned. Safe to call anytime (no
 * 30-minute minimum, unlike the session's own auto-`expires_at`).
 *
 * Returns `{ paid }`: if the session already completed (the user paid in the
 * race just before we expired it), Stripe refuses to expire it and we report
 * `paid: true` so the caller confirms the booking instead of cancelling it.
 */
export async function expireCheckoutSession(sessionId: string): Promise<{ paid: boolean }> {
  const stripe = await getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status === 'paid' || session.status === 'complete') {
    return { paid: true };
  }
  if (session.status === 'open') {
    await stripe.checkout.sessions.expire(sessionId);
  }
  return { paid: false };
}

/** Full refund of a PaymentIntent — used when a payment lands after the hold
 *  already expired (seat was released), so the user never pays for nothing. */
export async function refundPaymentIntent(paymentIntentId: string): Promise<void> {
  const stripe = await getStripe();
  await stripe.refunds.create({ payment_intent: paymentIntentId });
}

/**
 * Verify a Stripe Checkout session against the live API and return what we
 * need to update our DB. Used by /api/payments/verify when the user comes
 * back from Stripe (works without webhook delivery).
 */
export async function fetchCheckoutSession(sessionId: string) {
  const stripe = await getStripe();
  return stripe.checkout.sessions.retrieve(sessionId);
}
