import { PageLoader } from '@/components/design/PageLoader';

export default function Loading() {
  // Full-screen overlay so the header/footer from the (main) layout don't show
  // behind the loader while a page is loading.
  return <PageLoader variant="full" />;
}
