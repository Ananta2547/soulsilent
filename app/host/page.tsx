import { redirect } from 'next/navigation';

/** The dashboard opens on its overview — what to do today, money coming in,
 *  and whether things are growing (slide deck 10). */
export default function TeacherIndex() {
  redirect('/host/overview');
}
