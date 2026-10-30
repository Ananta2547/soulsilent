import { redirect } from 'next/navigation';

/** /app used to explain installing the site as an app (PWA). Notifications now
 *  come through LINE, so old links land on the notification settings. */
export default function AppPage() {
  redirect('/me/settings?tab=notify');
}
