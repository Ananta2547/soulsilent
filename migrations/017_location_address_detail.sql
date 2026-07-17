-- Migration 017: location full street address
-- `province/district/subdistrict` come from cascading dropdowns; this is the
-- free-text street address (house no., soi, road, landmark) the admin writes.

ALTER TABLE locations ADD COLUMN address_detail TEXT;
