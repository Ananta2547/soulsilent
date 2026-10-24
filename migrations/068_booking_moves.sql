-- Migration 068: a host cancels a round that has bookings.
--
-- Each paid booking is either refunded (cancelled with cancel_reason
-- 'workshop_changed'; admin transfers the money and attaches the slip, as for
-- any cancelled event) or moved to another round of the same activity. A
-- moved booking keeps its row, payment and coupon; only workshop_id changes.
-- moved_from remembers the cancelled round so My Bookings can say what
-- happened and offer "ขอคืนเงินแทน" until the new round starts.
--
-- A member asking for the refund instead is cancelled with cancel_reason
-- 'refund_requested' and joins the same admin refund list.
ALTER TABLE bookings ADD COLUMN moved_from TEXT;
ALTER TABLE bookings ADD COLUMN moved_at TEXT;
