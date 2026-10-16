/**
 * Launch screens for the app installed on iPhone/iPad (Add to Home Screen).
 * iOS shows a blank white screen while the app starts unless a picture
 * matches the exact screen, so there is one per device size (portrait only).
 * Images live in public/splash/: cream background, app tile and wordmark.
 * Used by appleWebApp.startupImage in app/layout.tsx.
 */
const SIZES: [width: number, height: number, ratio: number][] = [
  [440, 956, 3], [402, 874, 3], [430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3],
  [375, 812, 3], [414, 896, 3], [414, 896, 2], [414, 736, 3], [375, 667, 2], [320, 568, 2],
  [1032, 1376, 2], [1024, 1366, 2], [834, 1210, 2], [834, 1194, 2], [834, 1112, 2], [820, 1180, 2],
  [810, 1080, 2], [768, 1024, 2], [744, 1133, 2],
];

export const APPLE_SPLASH = SIZES.map(([w, h, r]) => ({
  url: `/splash/splash-${w * r}x${h * r}.png`,
  media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`,
}));
