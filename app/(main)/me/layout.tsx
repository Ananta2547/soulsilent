export default function MeLayout({ children }: { children: React.ReactNode }) {
  // Navigation now lives in the navbar profile dropdown (rich panel). Each /me
  // page renders its own page-head/sidebar as needed (e.g. Settings hub has its
  // own split layout). This wrapper just centres the content like the design's
  // `.page-main`.
  return <main className="page-main">{children}</main>;
}
