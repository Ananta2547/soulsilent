import { redirect } from 'next/navigation';

/** The dashboard opens on the workshop list — that is what a teacher comes
 *  here to work on. The revenue overview lives at /teacher/overview. */
export default function TeacherIndex() {
  redirect('/host/journeys');
}
