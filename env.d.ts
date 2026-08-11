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
