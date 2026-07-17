/**
 * Thai address data — decompacted from thai-address-database's db.json once
 * on first use and cached at module scope. The package exports search-only
 * helpers; we need "list all by parent" for cascading dropdowns, so we run
 * its decompaction logic ourselves on the raw payload.
 */

// The db.json is compact: provinces → amphoes → tambons → zipcodes, with
// a small dictionary at the top for repeat substrings.
// Re-implements the package's `preprocess()` so we can keep the full array.

type CompactedDB = {
  data: unknown[];
  lookup?: string;
  words?: string;
};
type Entry = { province: string; amphoe: string; district: string; zipcode: string };

let cache: Entry[] | null = null;

function loadEntries(): Entry[] {
  if (cache) return cache;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const raw = require('thai-address-database/database/db.json') as CompactedDB;

  const useLookup = !!(raw.lookup && raw.words);
  const lookup = useLookup ? raw.lookup!.split('|') : [];
  const words = useLookup ? raw.words!.split('|') : [];
  const data = (useLookup ? raw.data : raw.data) as unknown[];

  const decode = (val: unknown): string => {
    if (!useLookup) return String(val);
    let text = typeof val === 'number' ? lookup[val] : String(val);
    text = text.replace(/[A-Z]/gi, (m) => {
      const ch = m.charCodeAt(0);
      return words[ch < 97 ? ch - 65 : 26 + ch - 97];
    });
    return text;
  };

  const out: Entry[] = [];
  // db structure: [["province", [["amphoe", [["tambon", ["zip", ...]] ...]] ...]] ...]
  // For geographic db there's a code at index 1 — we don't need codes here.
  for (const provArr of data as unknown[][]) {
    if (!Array.isArray(provArr)) continue;
    const provName = decode(provArr[0]);
    const childIdx = provArr.length === 3 ? 2 : 1;
    const amphoes = provArr[childIdx] as unknown[];
    if (!Array.isArray(amphoes)) continue;
    for (const ampArr of amphoes as unknown[][]) {
      if (!Array.isArray(ampArr)) continue;
      const ampName = decode(ampArr[0]);
      const tambonsIdx = ampArr.length === 3 ? 2 : 1;
      const tambons = ampArr[tambonsIdx] as unknown[];
      if (!Array.isArray(tambons)) continue;
      for (const tamArr of tambons as unknown[][]) {
        if (!Array.isArray(tamArr)) continue;
        const tamName = decode(tamArr[0]);
        const zipIdx = tamArr.length === 3 ? 2 : 1;
        const zips = tamArr[zipIdx];
        const zipList = Array.isArray(zips) ? zips : [zips];
        for (const z of zipList) {
          out.push({
            province: provName,
            amphoe: ampName,
            district: tamName,
            zipcode: String(z),
          });
        }
      }
    }
  }
  cache = out;
  return out;
}

/** Distinct list of all 77 provinces. */
export function getProvinces(): string[] {
  const set = new Set<string>();
  for (const e of loadEntries()) set.add(e.province);
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'th'));
}

/** Distinct list of districts (amphoe) for a given province. */
export function getDistricts(province: string): string[] {
  if (!province) return [];
  const set = new Set<string>();
  for (const e of loadEntries()) if (e.province === province) set.add(e.amphoe);
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'th'));
}

/** Distinct list of subdistricts (tambon) for a given province + district. */
export function getSubdistricts(province: string, district: string): string[] {
  if (!province || !district) return [];
  const set = new Set<string>();
  for (const e of loadEntries()) {
    if (e.province === province && e.amphoe === district) set.add(e.district);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'th'));
}
