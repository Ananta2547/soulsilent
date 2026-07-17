-- Google Drive link to the event photos, shown to attended users on My Journey.
-- Only meaningful when PDPA photo/video consent is enabled for the workshop.
ALTER TABLE workshops ADD COLUMN photos_drive_url TEXT;
