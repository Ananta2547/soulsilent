/**
 * Paper / canvas size presets for the Portfolio editor. Dimensions are in px at
 * 96 DPI so they map cleanly to on-screen layout and PNG/PDF export.
 *
 * A-series at 96 DPI: A4 = 794×1123, A3 = 1123×1587 (portrait).
 */
export type PaperPreset = {
  key: string;
  label: string;
  w: number;
  h: number;
};

export const PAPER_PRESETS: PaperPreset[] = [
  { key: 'a4-p', label: 'A4 ตั้ง (794×1123)', w: 794, h: 1123 },
  { key: 'a4-l', label: 'A4 นอน (1123×794)', w: 1123, h: 794 },
  { key: 'a3-p', label: 'A3 ตั้ง (1123×1587)', w: 1123, h: 1587 },
  { key: 'a5-p', label: 'A5 ตั้ง (559×794)', w: 559, h: 794 },
  { key: 'letter-p', label: 'Letter ตั้ง (816×1056)', w: 816, h: 1056 },
  { key: 'square', label: 'สี่เหลี่ยมจัตุรัส (1080×1080)', w: 1080, h: 1080 },
  { key: 'story', label: 'Story (1080×1920)', w: 1080, h: 1920 },
  { key: 'slide', label: 'สไลด์ 16:9 (1280×720)', w: 1280, h: 720 },
  { key: 'web', label: 'เว็บยาว (880×1400)', w: 880, h: 1400 },
];

/** Find a preset matching exact w×h, else null (= custom). */
export function matchPreset(w: number, h: number): PaperPreset | null {
  return PAPER_PRESETS.find((p) => p.w === w && p.h === h) ?? null;
}
