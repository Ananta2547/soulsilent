-- The PromptPay QR a booking pays with, created by us instead of by Beam's
-- hosted checkout page.
--
-- Why this exists: the hosted page mints a NEW QR every time the shopper flips
-- payment method and back, each with its own 30-minute clock, and every one of
-- them stays payable. One booking ended up with several live QR images, which
-- is how the same seat got paid for twice.
--
-- Creating the charge ourselves (POST /api/v1/charges) is the only way to
-- guarantee one QR per booking: our page has no method switcher, and the image
-- is stored here so every reload serves the SAME QR rather than minting another.
--
-- Verified against the live API on 2026-08-23: Beam ignores the requested
-- `expiryTime` and always grants 30 minutes, and there is no endpoint to cancel
-- a pending charge (cancel/void/expire/disable all 404). So the QR necessarily
-- outlives the 10-minute seat hold, and money arriving late is still refunded by
-- the webhook + cron path rather than blocked at the source.
--
-- beam_qr_charge_id  : the charge id (ch_…). What a refund is issued against and
--                      what tells a webhook this charge is the booking's own.
-- beam_qr_image      : base64 PNG Beam returned. Stored because GET
--                      /api/v1/charges/{id} does NOT return the image again.
-- beam_qr_expires_at : ISO expiry Beam granted — 30 minutes, always longer than
--                      the seat hold. Used to mint a fresh QR if a booking is
--                      somehow still alive past it.
ALTER TABLE bookings ADD COLUMN beam_qr_charge_id TEXT;
ALTER TABLE bookings ADD COLUMN beam_qr_image TEXT;
ALTER TABLE bookings ADD COLUMN beam_qr_expires_at TEXT;
