import { NextResponse } from 'next/server';
import { getDB, getEnv } from '@/lib/db';
import { getStripe } from '@/lib/stripe';

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');
    const env = await getEnv();
    const webhookSecret = env.STRIPE_WEBHOOK_SECRET || '';

    const stripe = await getStripe();
    let event;

    try {
      event = stripe.webhooks.constructEvent(body, signature!, webhookSecret);
    } catch {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const metadata = session.metadata || {};
      const db = await getDB();

      if (metadata.type === 'workshop' && metadata.booking_id) {
        await db
          .prepare(
            "UPDATE bookings SET status = 'confirmed', payment_status = 'paid', stripe_payment_id = ? WHERE id = ?"
          )
          .bind(session.payment_intent as string, metadata.booking_id)
          .run();
      } else if (metadata.type === 'course' && metadata.enrollment_id) {
        await db
          .prepare(
            "UPDATE enrollments SET payment_status = 'paid', stripe_payment_id = ? WHERE id = ?"
          )
          .bind(session.payment_intent as string, metadata.enrollment_id)
          .run();
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook error' }, { status: 500 });
  }
}
