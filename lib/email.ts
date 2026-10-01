import { Resend } from 'resend';
import { getEnv } from './db';

type SendArgs = {
  to: string;
  subject: string;
  html: string;
};

/**
 * Send a transactional email via Resend.
 *
 * If `RESEND_API_KEY` isn't configured we don't throw — we log the message
 * server-side and report `sent: false`, so local dev and un-provisioned
 * environments keep working (the caller can surface a dev link instead).
 */
export async function sendEmail({ to, subject, html }: SendArgs): Promise<{ ok: boolean; sent: boolean; error?: string }> {
  const env = await getEnv();
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM || 'soulsilent <onboarding@resend.dev>';

  if (!apiKey) {
    console.info(`[email:skipped — no RESEND_API_KEY] to=${to} subject="${subject}"`);
    return { ok: true, sent: false };
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({ from, to, subject, html });
    if (error) {
      console.error('[email] Resend error:', JSON.stringify(error), '| from=', from, '| to=', to);
      return { ok: false, sent: false, error: error.message || error.name || 'resend error' };
    }
    console.info('[email] sent id=', data?.id, 'to=', to);
    return { ok: true, sent: true };
  } catch (e) {
    console.error('[email] send failed:', e);
    return { ok: false, sent: false, error: e instanceof Error ? e.message : 'send failed' };
  }
}

/** Branded HTML wrapper (soulsilent palette) for a single CTA email. */
export function emailTemplate(opts: {
  heading: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  footnote?: string;
}): string {
  const { heading, body, ctaLabel, ctaHref, footnote } = opts;
  return `<!doctype html><html><body style="margin:0;background:#f6f1e6;font-family:'IBM Plex Sans Thai','Noto Sans Thai','Leelawadee UI',Arial,sans-serif;color:#0d1e1d;">
  <div style="max-width:480px;margin:0 auto;padding:40px 24px;">
    <div style="display:inline-flex;align-items:center;gap:8px;margin-bottom:28px;">
      <span style="width:30px;height:30px;border-radius:50%;background:#0d8a7e;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:600;">s</span>
      <span style="font-size:18px;font-weight:600;">soulsilent<span style="color:#0d8a7e;">.</span></span>
    </div>
    <div style="background:#fff;border-radius:20px;padding:32px;">
      <h1 style="font-size:22px;margin:0 0 14px;">${heading}</h1>
      <p style="font-size:15px;line-height:1.7;color:#1a2e2c;margin:0 0 26px;">${body}</p>
      <a href="${ctaHref}" style="display:inline-block;background:#0d8a7e;color:#fff;text-decoration:none;padding:13px 24px;border-radius:999px;font-weight:600;font-size:15px;">${ctaLabel}</a>
      ${footnote ? `<p style="font-size:12px;color:#6a7a78;margin:24px 0 0;line-height:1.6;">${footnote}</p>` : ''}
    </div>
    <p style="font-size:11px;color:#9aa8a6;text-align:center;margin:24px 0 0;">© 2026 soulsilent · learn outside the room</p>
  </div></body></html>`;
}
