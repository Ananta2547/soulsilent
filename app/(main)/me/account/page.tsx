import { redirect } from 'next/navigation';

export default function AccountRedirect() {
  redirect('/me/settings?tab=account');
}
