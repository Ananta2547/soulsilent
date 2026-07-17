import { redirect } from 'next/navigation';

// The help center now lives at /help (built from the Help.html design).
export default function MeHelpRedirect() {
  redirect('/help');
}
