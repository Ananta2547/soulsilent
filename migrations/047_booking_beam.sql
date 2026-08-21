-- Beam Checkout ids on a booking.
--
-- Deliberately separate from stripe_session_id / stripe_payment_id rather than
-- reusing them: during the switchover both gateways are live, and which column
-- is set is how the expire route, the cron sweep and /api/payments/verify decide
-- who to talk to. Reusing one column would lose that provenance and leave old
-- Stripe holds unkillable.
--
-- beam_payment_link_id : the hosted checkout link (Beam's answer to a Stripe
--                        Checkout Session). Needed to disable it, which is what
--                        kills a saved PromptPay QR.
-- beam_charge_id       : set once payment lands; what a refund is issued against.
ALTER TABLE bookings ADD COLUMN beam_payment_link_id TEXT;
ALTER TABLE bookings ADD COLUMN beam_charge_id TEXT;
