import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getDB, getEnv } from '@/lib/db';
import { getStripe, refundPaymentIntent } from '@/lib/stripe';

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');
    const env = await getEnv();
    const webhookSecret = env.STRIPE_WEBHOOK_SECRET || '';

    if (!signature || !webhookSecret) {
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 400 });
    }

    const stripe = await getStripe();
    let event: Stripe.Event;

    try {
      // Cloudflare Workers has no Node `crypto` — signature verification MUST use
      // the async SubtleCrypto path (`constructEvent` sync throws on Workers).
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret,
        undefined,
        Stripe.createSubtleCryptoProvider(),
      );
    } catch (err) {
      console.error('Webhook signature verify failed:', err);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // A charge succeeding on Stripe that does NOT correspond to a legitimately
    // owed booking = money we shouldn't keep: a late payment on a saved QR, or a
    // repeat scan of the same QR (excess). PromptPay can't block these at the
    // bank, so we record every such charge for the admin reconcile page. The
    // normal, expected charge for a live booking is ignored here (the
    // checkout.session.completed branch confirms those).
    if (event.type === 'charge.succeeded') {
      const charge = event.data.object;
      const db = await getDB();
      const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;

      if (piId) {
        // The booking this PI belongs to — first by the id we store on confirm,
        // else via the Checkout Session's metadata (set before confirmation).
        let booking = await db
          .prepare('SELECT id, status, payment_status, stripe_payment_id FROM bookings WHERE stripe_payment_id = ?')
          .bind(piId)
          .first<{ id: string; status: string; payment_status: string; stripe_payment_id: string | null }>();

        if (!booking) {
          try {
            const stripe = await getStripe();
            const sessions = await stripe.checkout.sessions.list({ payment_intent: piId, limit: 1 });
            const bookingId = sessions.data[0]?.metadata?.booking_id;
            if (bookingId) {
              booking = await db
                .prepare('SELECT id, status, payment_status, stripe_payment_id FROM bookings WHERE id = ?')
                .bind(bookingId)
                .first<{ id: string; status: string; payment_status: string; stripe_payment_id: string | null }>();
            }
          } catch (e) {
            console.error('charge.succeeded session lookup failed', e);
          }
        }

        let reason: string | null = null;
        if (!booking) {
          reason = 'unknown';
        } else if (booking.status === 'cancelled' || booking.payment_status === 'expired') {
          reason = 'late_cancelled';
        } else if (
          (booking.status === 'confirmed' || booking.payment_status === 'paid') &&
          booking.stripe_payment_id &&
          booking.stripe_payment_id !== piId
        ) {
          // Seat already paid by a different charge → this one is a duplicate.
          reason = 'duplicate';
        }
        // reason stays null when this charge is the booking's own legitimate
        // payment (pending awaiting confirmation, or confirmed by this same PI).

        if (reason) {
          await db
            .prepare(
              `INSERT OR IGNORE INTO orphan_payments (id, payment_intent, booking_id, amount, currency, email, reason)
               VALUES (?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              charge.id,
              piId,
              booking?.id ?? null,
              charge.amount,
              charge.currency || 'thb',
              charge.receipt_email ?? null,
              reason
            )
            .run();
        }
      }
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const metadata = session.metadata || {};
      const db = await getDB();

      if (metadata.type === 'workshop' && metadata.booking_id) {
        const paymentIntentId = session.payment_intent as string;
        const booking = await db
          .prepare('SELECT status, payment_status FROM bookings WHERE id = ?')
          .bind(metadata.booking_id)
          .first<{ status: string; payment_status: string }>();

        // Late payment: the hold already expired and the seat was released
        // (booking cancelled/expired). Refund immediately so the user never
        // pays for a seat they can't get, and leave the booking cancelled.
        if (booking && (booking.status === 'cancelled' || booking.payment_status === 'expired')) {
          if (paymentIntentId) {
            try {
              await refundPaymentIntent(paymentIntentId);
            } catch (e) {
              console.error('Late-payment refund failed', e);
            }
          }
        } else {
          await db
            .prepare(
              "UPDATE bookings SET status = 'confirmed', payment_status = 'paid', stripe_payment_id = ? WHERE id = ?"
            )
            .bind(paymentIntentId, metadata.booking_id)
            .run();
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook error' }, { status: 500 });
  }
}
