-- Migration 061: free-seat invitations issued by admin (บัตรเชิญที่นั่งฟรี).
--
-- An invitation is an ordinary booking of ฿0, held by the admin who issued it
-- until someone scans its QR and claims it through the existing seat-handover
-- flow (ticket_transfers, kind = 'invite'). The seat counts against the round
-- from the moment it is issued.
--
-- comp_kind says who covers the seat:
--   'teacher' — the host gives it away; nothing is added to the host's revenue
--   'asl'     — AllSoulLearn pays the host the ticket price shown at issue time
--   'special' — AllSoulLearn pays the host an agreed special price
-- host_credit is that amount in baht. It counts toward the host's gross before
-- the payout deduction, and is money AllSoulLearn pays out, not money a
-- participant paid — reports keep it apart from bookings.amount.
ALTER TABLE bookings ADD COLUMN comp_kind TEXT;
ALTER TABLE bookings ADD COLUMN host_credit INTEGER NOT NULL DEFAULT 0;
