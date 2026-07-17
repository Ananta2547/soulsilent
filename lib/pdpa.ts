export type ConsentStatus = 'granted' | 'denied' | null;

/**
 * Read the PDPA photo/video consent from a booking's application_json.
 * Returns 'granted' / 'denied', or null when the applicant answered no PDPA
 * question (e.g. the workshop didn't require consent).
 */
export function readPdpaConsent(applicationJson: string | null | undefined): ConsentStatus {
  if (!applicationJson) return null;
  try {
    const app = JSON.parse(applicationJson) as { consent?: { photoVideo?: string } };
    const v = app?.consent?.photoVideo;
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}
