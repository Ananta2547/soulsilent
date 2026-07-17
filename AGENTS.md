<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Image Upload — Global Standard (IMMUTABLE)

Every image input in this codebase — current and future, anywhere — **MUST** use `<ImageUploader>` from `components/admin/image/ImageUploader.tsx`. Raw `<input type="text">` for image URLs is forbidden in admin forms.

## Required architecture

1. **Database**: every image field stores a `*_url` (TEXT, final cropped) **plus** a `*_meta` (TEXT JSON) sibling column. The meta is `ImageMeta` (`lib/types.ts`) — `{ original_url, crop: { unit, x, y, width, height }, aspect }`. Crop coords are stored as `%` (resolution-independent) so re-crops always restore correctly.

2. **Aspect ratios live in `lib/image-aspects.ts`** — `ASPECTS.*`. Never hard-code a ratio in a form. Add a new entry to the registry if a new placement appears.

3. **Multi-placement**: if an image renders at >1 ratio in production, pass the **widest/largest** ratio as `primary` and the others as `overlays`. The cropper draws the secondary aspects as dashed boxes inside the primary crop so admins see the masking before saving.

4. **Re-crop must always work**: when saving a crop for the first time, `ImageUploader` uploads BOTH the final cropped JPEG AND the untouched original to R2, then persists `original_url` in `*_meta`. Subsequent edits load the original + restore previous crop coords — never the already-cropped pixel data.

5. **API contract** for entities with images: POST/PUT accept `{ <field>_url, <field>_meta }` and store both. SELECT returns both. Public read paths use `<field>_url` only.

## Adding a new image field — checklist

1. Migration: `ALTER TABLE <table> ADD COLUMN <field>_meta TEXT;`
2. `lib/types.ts`: add `<field>_meta: string | null` (raw) to the entity interface.
3. `lib/image-aspects.ts`: add the placement(s) if not already there.
4. Admin form: import `ImageUploader`, manage both `value` + `meta` in state, render with `primary={ASPECTS.X}` and `overlays={[...]}` if multi-placement.
5. API POST + PUT: accept `<field>_meta`, persist via `JSON.stringify(body.<field>_meta)`.
6. Public render: keep using `<img src={url}>` — meta is admin-only.

Do NOT skip step 4 or use any other upload primitive. Legacy `components/admin/ImageUpload.tsx` is deprecated for new code.
