// Centralized runtime config. On Cloudflare Workers with `nodejs_compat`, text
// vars and secrets are exposed through `process.env`; the same holds for the
// Node-based drizzle/seed scripts. R2/Queue *bindings* (Phase 1) are NOT here —
// those come from the `cloudflare:workers` env object and will be added later.

export interface AppConfig {
  DATABASE_URL: string;
  SESSION_SECRET: string;
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  APP_URL: string;
  APP_NAME: string;
  SUPER_ADMIN_EMAIL: string;
  // Shared HMAC secret for the EventPilot SSO bridge — must match EventPilot's
  // SMARTEXCEL_SSO_SECRET. This is the only login path; there is no local
  // password auth. See /sso route + ssoLogin in auth.functions.ts.
  SMARTEXCEL_SSO_SECRET: string;
  GEMINI_API_KEY?: string;
  // R2 S3-compatible credentials for presigning upload/download URLs. Optional
  // so the app still boots pre-provisioning; storage helpers throw if unset.
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET?: string;
  // Python processing worker (Cloud Run / CF Containers) + shared bearer token.
  WORKER_URL?: string;
  WORKER_SHARED_SECRET?: string;
}

function must(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example and set it via .dev.vars (local) or \`wrangler secret put\` (prod).`,
    );
  }
  return value;
}

export function getConfig(): AppConfig {
  const e = process.env;
  return {
    DATABASE_URL: must(e.DATABASE_URL, "DATABASE_URL"),
    SESSION_SECRET: must(e.SESSION_SECRET, "SESSION_SECRET"),
    RESEND_API_KEY: e.RESEND_API_KEY ?? "",
    EMAIL_FROM: e.EMAIL_FROM ?? "SmartExcel <onboarding@resend.dev>",
    APP_URL: e.APP_URL ?? "http://localhost:3000",
    APP_NAME: e.APP_NAME ?? "SmartExcel",
    SUPER_ADMIN_EMAIL: (e.SUPER_ADMIN_EMAIL ?? "md@tresconglobal.com").toLowerCase(),
    SMARTEXCEL_SSO_SECRET: must(e.SMARTEXCEL_SSO_SECRET, "SMARTEXCEL_SSO_SECRET"),
    GEMINI_API_KEY: e.GEMINI_API_KEY,
    R2_ACCOUNT_ID: e.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: e.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: e.R2_SECRET_ACCESS_KEY,
    R2_BUCKET: e.R2_BUCKET,
    WORKER_URL: e.WORKER_URL,
    WORKER_SHARED_SECRET: e.WORKER_SHARED_SECRET,
  };
}
