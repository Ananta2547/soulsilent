import type { ImageMeta } from './types';

/** Safe parse a stored `*_meta` column. Returns null for empty/invalid. */
export function parseImageMeta(json: string | null | undefined): ImageMeta | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    if (
      v &&
      typeof v === 'object' &&
      typeof v.original_url === 'string' &&
      v.crop &&
      typeof v.crop.x === 'number' &&
      typeof v.crop.y === 'number' &&
      typeof v.crop.width === 'number' &&
      typeof v.crop.height === 'number'
    ) {
      return v as ImageMeta;
    }
  } catch {
    // fall through
  }
  return null;
}

/** Stringify for DB storage. Null/undefined → null (no JSON). */
export function stringifyImageMeta(meta: ImageMeta | null | undefined): string | null {
  if (!meta) return null;
  return JSON.stringify(meta);
}
