/** How an applicant travels to the venue.
 *
 * Asked on every workshop application (BookingModal step 2) and stored in
 * `bookings.application_json.travel`. Private vehicles carry a plate number so
 * staff can plan parking and identify vehicles on the day; public transport
 * never stores one.
 */

export type TravelMethod = 'car' | 'motorcycle' | 'public';

export interface TravelInfo {
  method: TravelMethod | '';
  /** Thai label captured at submit time, so old rows keep reading correctly
   *  even if the wording below changes later. */
  label?: string;
  /** '' for public transport. */
  plate?: string;
}

export const TRAVEL_OPTIONS: {
  value: TravelMethod;
  th: string;
  en: string;
  needsPlate: boolean;
}[] = [
  { value: 'car', th: 'รถยนต์ส่วนตัว', en: 'Private car', needsPlate: true },
  { value: 'motorcycle', th: 'รถจักรยานยนต์ส่วนตัว', en: 'Private motorcycle', needsPlate: true },
  { value: 'public', th: 'รถสาธารณะ', en: 'Public transport', needsPlate: false },
];

export function travelNeedsPlate(method: TravelMethod | '' | undefined): boolean {
  return !!TRAVEL_OPTIONS.find((o) => o.value === method)?.needsPlate;
}

/** One-line summary for admin/teacher lists, e.g. "รถยนต์ส่วนตัว · กข 1234".
 *  Returns '—' for applications submitted before this question existed. */
export function formatTravel(t: TravelInfo | null | undefined): string {
  if (!t || !t.method) return '—';
  const label = t.label || TRAVEL_OPTIONS.find((o) => o.value === t.method)?.th || t.method;
  const plate = (t.plate || '').trim();
  return plate ? `${label} · ${plate}` : label;
}
