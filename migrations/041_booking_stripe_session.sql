-- Store the Stripe Checkout Session id on each booking so the server can
-- expire the session (which cancels its PaymentIntent and kills the PromptPay
-- QR) the moment the 10-minute payment hold lapses. A QR saved to the phone
-- then becomes unusable — scanning it later fails in the banking app.
ALTER TABLE bookings ADD COLUMN stripe_session_id TEXT;
