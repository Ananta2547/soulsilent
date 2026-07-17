-- Migration 010: Image crop metadata — enable Re-cropping
--
-- Architecture: every image field already stores the FINAL cropped URL in a
-- TEXT column. We add a sibling `_meta` TEXT (JSON) that stores:
--   {
--     "original_url": "/api/media/...",   // uncropped source
--     "crop": { "unit":"%"|"px", "x":..., "y":..., "width":..., "height":... },
--     "aspect": 1.7777                    // numeric (e.g. 16/9)
--   }
--
-- Reading: `<img src={url}>` keeps working (no change in public). The meta
-- only matters when an admin clicks "Edit crop" — we load original_url +
-- restore crop coords in the cropper, let them re-adjust, re-upload final.
--
-- locations.gallery_json items used to be `string[]` of URLs. The app now
-- handles items as either string (legacy) OR { url, original_url, crop }.
-- We don't migrate the JSON shape — backward-compat in code.

ALTER TABLE workshops ADD COLUMN image_meta TEXT;
ALTER TABLE courses   ADD COLUMN thumbnail_meta TEXT;
ALTER TABLE articles  ADD COLUMN cover_image_meta TEXT;
ALTER TABLE locations ADD COLUMN graphic_map_meta TEXT;
