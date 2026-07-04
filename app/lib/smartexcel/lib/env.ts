// Runtime config for the ported worker/storage/AI integrations. Auth secrets
// (SESSION_SECRET, SMARTEXCEL_SSO_SECRET) are gone — this is now native
// EventPilot code, authenticated via EventPilot's own tcs_session cookie
// (see ../auth.ts), not a bridged SSO token.

export interface AppConfig {
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  GEMINI_API_KEY?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET?: string;
  WORKER_URL?: string;
  WORKER_SHARED_SECRET?: string;
}

export function getConfig(): AppConfig {
  const e = process.env;
  return {
    RESEND_API_KEY: e.SMARTEXCEL_RESEND_API_KEY ?? "",
    EMAIL_FROM: e.SMARTEXCEL_EMAIL_FROM ?? "SmartExcel <onboarding@resend.dev>",
    GEMINI_API_KEY: e.SMARTEXCEL_GEMINI_API_KEY,
    R2_ACCOUNT_ID: e.SMARTEXCEL_R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: e.SMARTEXCEL_R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: e.SMARTEXCEL_R2_SECRET_ACCESS_KEY,
    R2_BUCKET: e.SMARTEXCEL_R2_BUCKET,
    WORKER_URL: e.SMARTEXCEL_WORKER_URL,
    WORKER_SHARED_SECRET: e.SMARTEXCEL_WORKER_SHARED_SECRET,
  };
}
