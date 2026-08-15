-- ONLINE workshops.
--
-- An online session has no physical venue, so `location_id` stays NULL and
-- `is_online` carries the choice instead of a sentinel id (which would look
-- like a dangling reference into `locations`).
--
-- online_platform: 'zoom' | 'meet' | 'teams' | 'other'
-- online_platform_other: the admin-typed name, only when platform = 'other'
-- online_url: meeting link. Only ever sent to users holding a secured seat.
ALTER TABLE workshops ADD COLUMN is_online INTEGER DEFAULT 0;
ALTER TABLE workshops ADD COLUMN online_platform TEXT;
ALTER TABLE workshops ADD COLUMN online_platform_other TEXT;
ALTER TABLE workshops ADD COLUMN online_url TEXT;
