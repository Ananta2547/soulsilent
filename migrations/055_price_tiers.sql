-- Prices on a round master become a list. Two base prices keep columns:
-- price_group = ราคา/คน (one seat), price_group_booking = กลุ่ม (booking
-- together — stored now, sold later). Every further tier the admin adds is a
-- row in price_tiers_json: [{"id","label","price","mode":"seat"|"round"}].
-- The old whole-round price_private, where set, becomes such a tier.
-- Bookings remember the tier's name.
ALTER TABLE workshop_masters ADD COLUMN price_group_booking REAL;
ALTER TABLE workshop_masters ADD COLUMN price_tiers_json TEXT;
ALTER TABLE bookings ADD COLUMN booking_tier_label TEXT;
UPDATE workshop_masters
   SET price_tiers_json = '[{"id":"private","label":"ส่วนตัว (เหมาทั้งรอบ)","price":' || price_private || ',"mode":"round"}]'
 WHERE price_private IS NOT NULL AND price_tiers_json IS NULL;
