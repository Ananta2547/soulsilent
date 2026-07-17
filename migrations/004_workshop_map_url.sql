-- Migration 004: Google Maps URL for workshops
-- Admin can paste a Google Maps share link or embed iframe src.
-- Frontend uses this for the "Open in Google Maps" button and tries to
-- embed it directly when it's already an embed URL.

ALTER TABLE workshops ADD COLUMN map_url TEXT;
