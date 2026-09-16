declare global {
  interface CloudflareEnv {
    DB: D1Database;
    R2: R2Bucket;
    JWT_SECRET: string;
    STRIPE_SECRET_KEY: string;
    STRIPE_WEBHOOK_SECRET: string;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    SITE_URL: string;
    /** Resend API key (re_...) for transactional email. */
    RESEND_API_KEY: string;
    /** Verified "from" address, e.g. "soulsilent <no-reply@soulsilent.co>". */
    EMAIL_FROM: string;
    /** Shared secret guarding the cron sweep endpoint (/api/cron/expire-holds). */
    CRON_SECRET: string;
    /** Shared key guarding the read-only finance export (/api/export/finance).
     *  Also salts the customer pseudonyms in that export. */
    FINANCE_EXPORT_KEY?: string;
    /** Beam Checkout merchant id, e.g. "allsoullearn-xxxxxx". Not secret. */
    BEAM_MERCHANT_ID: string;
    /** Beam API key. Playground and production keys are NOT interchangeable. */
    BEAM_API_KEY: string;
    /** Base64 HMAC key used to verify the X-Beam-Signature webhook header. */
    BEAM_WEBHOOK_SECRET: string;
    /** Override the API host. Defaults to production
     *  (https://api.beamcheckout.com); set to
     *  https://playground.api.beamcheckout.com for the sandbox. */
    BEAM_BASE_URL?: string;
  }

  namespace NodeJS {
    interface ProcessEnv {
      JWT_SECRET?: string;
      STRIPE_SECRET_KEY?: string;
      STRIPE_WEBHOOK_SECRET?: string;
      GOOGLE_CLIENT_ID?: string;
      GOOGLE_CLIENT_SECRET?: string;
      SITE_URL?: string;
      RESEND_API_KEY?: string;
      EMAIL_FROM?: string;
    }
  }
}

export {};
