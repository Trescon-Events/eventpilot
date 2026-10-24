/*
  Credentials registry — the single list of every secret/API key/token the
  platform depends on: where it lives, which login owns the account, the
  direct console URL, and how to rotate it. Rendered at Admin → Settings →
  Keys & Credentials, and enforced by `npm run check:keys` (CI): any new
  secret-looking env var read in the code MUST be listed here (or in
  NOT_SECRET_VARS with a reason), so the list can never silently go stale.

  Created 2026-10-22 after the Railway security incident, when rotating keys
  meant hunting for which Google/Cloudflare/Microsoft login owned what.

  RULES
  - Names and URLs only. NEVER put a secret value in this file.
  - Adding a new platform, API key or secret anywhere (env var, GitHub
    Actions secret, DB-stored token, external system)? Add it here in the same
    change. The CI check catches env vars; the other kinds are on you.
  - `login` is the account to sign in with. If you do not know, write
    'confirm' and fix it the first time someone signs in.
  - As of 2026-10-22 Madhu (md@tresconglobal.com) is the only EventPilot
    admin and builder. dc@tresconglobal.com (Durga) no longer owns anything.
*/

export type CredentialStore = 'railway' | 'github-actions' | 'database' | 'external'

/** How a rotation behaves — decides the order and the risk. */
export type RotateMode =
  | 'old-stays'   // console lets you add a new one; old keeps working until you delete it
  | 'old-dies'    // regenerating kills the old value immediately
  | 'must-match'  // must be changed in two or more places at the same moment
  | 'none'        // the platform offers no rotation (note says what to do instead)

export type CredentialGroup =
  | 'Hosting & database'
  | 'Sign-in & email'
  | 'AI & media'
  | 'File storage'
  | 'CRM, social & marketing'
  | 'Source control & CI'
  | 'Event platforms'
  | 'Cron & webhooks'
  | 'Other systems'

export interface Credential {
  id: string
  platform: string
  group: CredentialGroup
  what: string
  /** Env var / secret names only (never values). */
  vars: string[]
  stores: CredentialStore[]
  /** Other places that must hold the same value. */
  alsoSet?: string
  consoleUrl: string
  /** Which login owns the account. */
  login: string
  rotate: string
  mode: RotateMode
  note?: string
}

export const CREDENTIALS: Credential[] = [
  /* ── Hosting & database ───────────────────────────────────────────── */
  {
    id: 'railway', platform: 'Railway', group: 'Hosting & database',
    what: 'Hosts the app; holds every env var below. Signs in with GitHub.',
    vars: [], stores: ['external'],
    consoleUrl: 'https://railway.com/project/26f95192-091d-48d0-a4f9-f8cc4549b8a4',
    login: 'webadmin@tresconglobal.com (billing; sign in with GitHub)',
    rotate: 'Variables tab → edit → Deploy. Hobby→Pro upgrade done 22 Oct 2026 (Hobby builds were restored last during the incident).',
    mode: 'none',
  },
  {
    id: 'supabase-main', platform: 'Supabase (EventPilot DB)', group: 'Hosting & database',
    what: 'Main database. The service-role key is full access.',
    vars: ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_PASSWORD'], stores: ['railway', 'github-actions'],
    alsoSet: 'GitHub Actions secrets SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL',
    consoleUrl: 'https://supabase.com/dashboard/project/yuyxfxoevztugtfgduks/settings/api-keys',
    login: 'confirm (CLAUDE.md says dc@ — stale)',
    rotate: 'Settings → API Keys → New secret key (new sb_secret_ style). DB password: Settings → Database → Reset password (used live by SmartExcel, so only at deploy time).',
    mode: 'old-stays',
    note: 'The new-style secret key may not work with every client library — test one deploy before revoking the legacy key.',
  },
  {
    id: 'oauth-encryption', platform: 'Token encryption key', group: 'Hosting & database',
    what: 'Encrypts saved OAuth tokens and global secrets in the database (AES-256-GCM).',
    vars: ['OAUTH_TOKEN_ENCRYPTION_KEY'], stores: ['railway'],
    consoleUrl: 'https://railway.com/project/26f95192-091d-48d0-a4f9-f8cc4549b8a4',
    login: 'webadmin@tresconglobal.com',
    rotate: 'Do NOT just change it: every saved token becomes unreadable. Needs a re-encrypt migration or re-connecting each integration.',
    mode: 'none',
  },
  {
    id: 'session', platform: 'Session signing', group: 'Hosting & database',
    what: 'Signs the login cookie. Changing it signs everyone out once.',
    vars: ['SESSION_SECRET'], stores: ['railway'],
    consoleUrl: 'https://railway.com/project/26f95192-091d-48d0-a4f9-f8cc4549b8a4',
    login: 'webadmin@tresconglobal.com',
    rotate: 'Generate a random value (openssl rand -hex 32), set in Railway, deploy.',
    mode: 'old-dies',
  },

  /* ── Sign-in & email ──────────────────────────────────────────────── */
  {
    id: 'microsoft-sso', platform: 'Microsoft Entra — staff sign-in & mail', group: 'Sign-in & email',
    what: 'Microsoft 365 sign-in for everyone, and email sent as a person (Graph). Password sign-in was removed 22 Oct 2026; this is the ONLY way in.',
    vars: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_TENANT_ID'], stores: ['railway'],
    consoleUrl: 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Credentials/appId/1eb65a1b-849d-414f-88f4-e0faf812fbfc',
    login: 'md@tresconglobal.com',
    rotate: 'Certificates & secrets → New client secret (copy the Value, not the Secret ID) → put in Railway → deploy → delete the old one.',
    mode: 'old-stays',
    note: 'Never delete the old secret before Railway has the new one — sign-in and Graph mail both stop.',
  },
  {
    id: 'azure-docs', platform: 'Azure — sensitive documents (UAE)', group: 'Sign-in & email',
    what: 'Stores passports/IDs in Azure Blob (account tresconeventpilotdocs). App "EventPilot Documents (Railway)".',
    vars: ['AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID', 'AZURE_STORAGE_ACCOUNT', 'AZURE_DOCS_CONTAINER', 'AZURE_LICENSE_CONTAINER'], stores: ['railway'],
    consoleUrl: 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Credentials/appId/2c9c8041-c85c-484d-80fc-7acb4cb4a938',
    login: 'md@tresconglobal.com',
    rotate: 'Certificates & secrets → New client secret. Only AZURE_CLIENT_SECRET is secret; the other AZURE_* are IDs/names.',
    mode: 'old-stays',
    note: 'Also review the storage account\'s own access keys in the Azure portal — the code does not use them, so disable if enabled.',
  },
  {
    id: 'resend', platform: 'Resend', group: 'Sign-in & email',
    what: 'System email (internal notices, approvals, vendor-portal invites/OTPs). Sends from noreply@eventpilot.tresconglobal.com, so the key MUST come from the Resend account where that domain is verified.',
    vars: ['RESEND_API_KEY', 'RESEND_FROM', 'RESEND_FROM_EMAIL'], stores: ['railway'],
    consoleUrl: 'https://resend.com/domains',
    login: 'The Resend account that shows eventpilot.tresconglobal.com as Verified on its Domains page. NOT webadmin@tresconglobal.com — that account has no domain and cannot send (found 22 Oct 2026).',
    rotate: 'In the right account: API keys → Create API key (sending access, that domain) → Railway RESEND_API_KEY → deploy → send a test (vendor-portal invite) → delete old. RESEND_FROM / RESEND_FROM_EMAIL are just the sender address, not secrets.',
    mode: 'old-stays',
    note: 'A key from the wrong account fails every send (vendor invites showed only "Could not create the login"). The Staff Portal has its own RESEND_API_KEY — check whether it is the same key before deleting the old one.',
  },
  {
    id: 'turnstile', platform: 'Cloudflare Turnstile', group: 'Sign-in & email',
    what: 'Bot check on the vendor portal sign-in. Widget "eventpilot.tresconglobal.com (Spin)".',
    vars: ['TURNSTILE_SECRET_KEY'], stores: ['railway'],
    consoleUrl: 'https://dash.cloudflare.com/?to=/:account/turnstile',
    login: 'md@tresconglobal.com (Cloudflare admin)',
    rotate: 'Edit widget → Rotate secret key (choose the option that keeps the old one valid for a while).',
    mode: 'old-stays',
  },

  /* ── AI & media ───────────────────────────────────────────────────── */
  {
    id: 'gemini', platform: 'Google Gemini (AI Studio)', group: 'AI & media',
    what: 'Announcement copy, bios, intelligence features. Project "Default Gemini Project".',
    vars: ['GEMINI_API_KEY'], stores: ['railway', 'github-actions'],
    alsoSet: 'GitHub Actions secret GEMINI_API_KEY',
    consoleUrl: 'https://aistudio.google.com/apikey',
    login: 'confirm (which Google account created the key)',
    rotate: 'Create API key in the same project → Railway + GitHub secret → deploy → delete old.',
    mode: 'old-stays',
  },
  {
    id: 'openai', platform: 'OpenAI', group: 'AI & media',
    what: 'Image generation and fallback text models.',
    vars: ['OPENAI_API_KEY'], stores: ['railway'],
    consoleUrl: 'https://platform.openai.com/api-keys',
    login: 'confirm',
    rotate: 'Create new secret key (sk-proj-…) with the Copy button → verify it starts with sk- → Railway → deploy → delete old. Check Usage for anything unexpected.',
    note: 'On 22 Oct 2026 a truncated copy (start of the key missing) caused "Incorrect API key" in Clean Photo. Always check the pasted value begins with sk-.',
    mode: 'old-stays',
  },
  {
    id: 'fal', platform: 'fal.ai', group: 'AI & media',
    what: 'Photo upscaler ("Make it High-Res", Topaz model). Pay-as-you-go, key named "EventPilot - to generate images".',
    vars: ['FAL_API_KEY'], stores: ['railway'],
    consoleUrl: 'https://fal.ai/dashboard/keys',
    login: 'account named "Trescon" (confirm email)',
    rotate: 'API Keys → Add key (API scope) → Railway → deploy → delete old. Low-balance alert recommended at $5.',
    mode: 'old-stays',
  },
  {
    id: 'firecrawl', platform: 'Firecrawl', group: 'AI & media',
    what: 'Web scraping for Market Intel and KB Intel.',
    vars: ['FIRECRAWL_API_KEY'], stores: ['railway'],
    consoleUrl: 'https://www.firecrawl.dev/app/api-keys',
    login: 'confirm',
    rotate: 'Create API key → Railway → deploy → delete old.',
    mode: 'old-stays',
  },
  {
    id: 'serper', platform: 'Serper', group: 'AI & media',
    what: 'Web, video and image search for KB Intel and Speaker Proposals research.',
    vars: ['SERPER_API_KEY'], stores: ['railway'],
    consoleUrl: 'https://serper.dev/api-keys',
    login: 'confirm',
    rotate: 'Regenerate (old dies at once) → Railway → deploy.',
    mode: 'old-dies',
  },
  {
    id: 'photoroom', platform: 'PhotoRoom', group: 'AI & media',
    what: 'Background removal for speaker photos.',
    vars: ['PHOTOROOM_API_KEY'], stores: ['railway'],
    consoleUrl: 'https://app.photoroom.com/api-dashboard',
    login: 'confirm',
    rotate: 'Create new key → Railway → deploy → delete old.',
    mode: 'old-stays',
  },
  {
    id: 'cloudconvert', platform: 'CloudConvert', group: 'AI & media',
    what: 'File conversion.',
    vars: ['CLOUDCONVERT_API_KEY'], stores: ['railway'],
    consoleUrl: 'https://cloudconvert.com/dashboard/api/v2/keys',
    login: 'md@tresconglobal.com',
    rotate: 'Dashboard → API → Authorization → API keys → Create (user.read, task.read, task.write) → Railway → deploy → revoke old.',
    mode: 'old-stays',
  },
  {
    id: 'canva', platform: 'Canva Connect', group: 'AI & media',
    what: 'Canva integration "Event Pilot" (client ID OC-AZ8TfXq-4SDg). Developer changes need MFA enabled on the Canva account.',
    vars: ['CANVA_CLIENT_ID', 'CANVA_CLIENT_SECRET'], stores: ['railway'],
    consoleUrl: 'https://www.canva.com/developers/integrations/connect-api',
    login: 'confirm (the developer account avatar shows "A")',
    rotate: 'Your integrations → Event Pilot → Configuration → Generate another secret → Railway → deploy → delete old.',
    mode: 'old-stays',
  },

  /* ── File storage ─────────────────────────────────────────────────── */
  {
    id: 'r2-docuhub', platform: 'Cloudflare R2 — DocuHub', group: 'File storage',
    what: 'DocuHub documents bucket (docuhub-documents).',
    vars: ['DOCUHUB_R2_ACCESS_KEY_ID', 'DOCUHUB_R2_SECRET_ACCESS_KEY', 'DOCUHUB_R2_ACCOUNT_ID', 'DOCUHUB_R2_BUCKET'], stores: ['railway'],
    consoleUrl: 'https://dash.cloudflare.com/?to=/:account/r2/api-tokens',
    login: 'md@tresconglobal.com (Cloudflare admin)',
    rotate: 'R2 → Manage API tokens → Create Account API token (Object Read & Write, bucket docuhub-documents). Save the Access Key ID (32 chars) AND Secret Access Key (64 chars) — NOT the "token value". → Railway → deploy → delete old token "EventPilot-DocuHub-Docs".',
    mode: 'old-stays',
  },
  {
    id: 'r2-kb', platform: 'Cloudflare R2 — Knowledge Base', group: 'File storage',
    what: 'KB bucket (eventpilot-kb).',
    vars: ['KB_R2_ACCESS_KEY_ID', 'KB_R2_SECRET_ACCESS_KEY', 'KB_R2_ACCOUNT_ID', 'KB_R2_BUCKET'], stores: ['railway'],
    consoleUrl: 'https://dash.cloudflare.com/?to=/:account/r2/api-tokens',
    login: 'md@tresconglobal.com (Cloudflare admin)',
    rotate: 'Same page → Create Account API token (bucket eventpilot-kb) → Railway → deploy → delete old token "eventpilot-kb".',
    mode: 'old-stays',
  },
  {
    id: 'google-site-ops', platform: 'Google Cloud — Site Operations service account', group: 'File storage',
    what: 'Service account eventpilot-siteops@eventpilot-site-operations.iam.gserviceaccount.com (Site Ops / Google APIs).',
    vars: ['GOOGLE_SERVICE_ACCOUNT_KEY'], stores: ['railway'],
    consoleUrl: 'https://console.cloud.google.com/iam-admin/serviceaccounts?authuser=4&project=eventpilot-site-operations',
    login: 'md@tresconglobal.com — Google account index 4 ("md-org"). Other Google accounts cannot see this project.',
    rotate: 'Service account → Keys → Add key → JSON → Railway → deploy → delete old key.',
    mode: 'old-stays',
    note: 'Always use ?authuser=4 — fresh tabs silently open the wrong Google account.',
  },

  /* ── CRM, social & marketing ──────────────────────────────────────── */
  {
    id: 'hubspot-crm', platform: 'HubSpot — CRM Sync service key', group: 'CRM, social & marketing',
    what: 'Speaker/sponsor sync to HubSpot (service key "EventPilot CRM Sync"). Can ALSO be pasted at Admin → Settings → Global Integrations (stored encrypted in the DB).',
    vars: ['HUBSPOT_CRM_SERVICE_KEY'], stores: ['railway', 'database'],
    consoleUrl: 'https://app.hubspot.com/service-keys/2953901',
    login: 'confirm',
    rotate: 'Service key → Rotate → "expire this key later" (7 days grace).',
    mode: 'old-stays',
  },
  {
    id: 'hubspot-forms', platform: 'HubSpot — Forms service key', group: 'CRM, social & marketing',
    what: 'Forms integration (service key "EventPilot-Forms").',
    vars: ['HUBSPOT_API_KEY', 'HUBSPOT_PORTAL_ID'], stores: ['railway'],
    consoleUrl: 'https://app.hubspot.com/service-keys/2953901',
    login: 'confirm',
    rotate: 'Service key → Rotate → "expire this key later".',
    mode: 'old-stays',
  },
  {
    id: 'hubspot-webhook', platform: 'HubSpot form-submission webhook', group: 'CRM, social & marketing',
    what: 'Password HubSpot\'s workflows send to /api/public/hubspot/submissions. All 8 connected speaker forms share ONE portal-wide HubSpot secret named EVENTPILOT_WEBHOOK_TOKEN that holds the text "Bearer <HUBSPOT_WEBHOOK_SECRET>".',
    vars: ['HUBSPOT_WEBHOOK_SECRET'], stores: ['railway', 'external'],
    alsoSet: 'HubSpot secret EVENTPILOT_WEBHOOK_TOKEN = "Bearer " + the Railway value. Edit it once: open any EventPilot workflow → Send a webhook → API key dropdown → Manage secrets → pencil. All workflows update at once.',
    consoleUrl: 'https://app.hubspot.com/workflows/2953901/platform/flow/1893915960/edit/actions/1/webhook',
    login: 'confirm',
    rotate: 'Set the new value in Railway and deploy. Then copy it from Railway\'s copy icon (NOT from a note: pbcopy adds a hidden newline that breaks the match) and paste after "Bearer " in the HubSpot secret. Test: submit a fresh fake contact on a connected form; it must appear as New Submission in the Stakeholder Hub.',
    mode: 'must-match',
    note: 'The "Set Up Automatic Sync" button only shows when no workflow exists, so it cannot rewrite the header — edit the HubSpot secret instead. Verified working 22 Oct 2026.',
  },
  {
    id: 'postiz', platform: 'Postiz', group: 'CRM, social & marketing',
    what: 'Social scheduling. Whoever holds the key can publish to the connected channels.',
    vars: ['POSTIZ_API_KEY', 'POSTIZ_API_URL'], stores: ['railway'],
    consoleUrl: 'https://platform.postiz.com/settings',
    login: 'confirm',
    rotate: 'Settings → Agents / Dev → API Key → Rotate Key (old dies at once).',
    mode: 'old-dies',
  },

  /* ── Source control & CI ──────────────────────────────────────────── */
  {
    id: 'github-buildlog', platform: 'GitHub — Build Log read token', group: 'Source control & CI',
    what: 'Read-only token the Build Log uses to list commits.',
    vars: ['GITHUB_TOKEN'], stores: ['railway'],
    consoleUrl: 'https://github.com/settings/personal-access-tokens',
    login: 'Madhu\'s GitHub account (owner of the fine-grained tokens; org Trescon-Events)',
    rotate: 'Fine-grained token: Trescon-Events / eventpilot only, Contents read-only, 90 days.',
    mode: 'old-stays',
  },
  {
    id: 'github-approver', platform: 'GitHub — PR approver token', group: 'Source control & CI',
    what: 'Acts as the reviewer on the PR Approvals page.',
    vars: ['GITHUB_APPROVER_TOKEN'], stores: ['railway'],
    consoleUrl: 'https://github.com/settings/personal-access-tokens/new',
    login: 'Madhu\'s GitHub account',
    rotate: 'Fine-grained token: Trescon-Events / eventpilot only, Pull requests read+write, Contents read-only, 90 days.',
    mode: 'old-stays',
  },
  {
    id: 'github-pr-webhook', platform: 'GitHub — PR safety webhook', group: 'Cron & webhooks',
    what: 'Bearer password the GitHub Action sends to /api/webhooks/github-pr.',
    vars: ['GITHUB_PR_WEBHOOK_SECRET'], stores: ['railway', 'github-actions'],
    alsoSet: 'GitHub Actions secret PR_WEBHOOK_SECRET (repo Trescon-Events/eventpilot)',
    consoleUrl: 'https://github.com/Trescon-Events/eventpilot/settings/secrets/actions',
    login: 'Madhu\'s GitHub account (org owner)',
    rotate: 'Random value (openssl rand -hex 32) in BOTH places.',
    mode: 'must-match',
  },

  /* ── Cron & webhooks ──────────────────────────────────────────────── */
  {
    id: 'cron-secret', platform: 'Cron secret (GitHub Actions jobs)', group: 'Cron & webhooks',
    what: 'Bearer secret six GitHub workflows use to call EventPilot cron endpoints (staff-portal sync, HubSpot pulls, revoke expired access, purge sensitive documents, …).',
    vars: ['CRON_SECRET'], stores: ['railway', 'github-actions'],
    alsoSet: 'GitHub Actions secret CRON_SECRET',
    consoleUrl: 'https://github.com/Trescon-Events/eventpilot/settings/secrets/actions',
    login: 'Madhu\'s GitHub account (org owner)',
    rotate: 'Random value → Railway first; update the GitHub secret right AFTER the deploy goes live, or the jobs 401 in between.',
    mode: 'must-match',
  },
  {
    id: 'kb-intel-cron', platform: 'KB Intel weekly job (cron-job.org)', group: 'Cron & webhooks',
    what: 'Bearer secret the weekly cron-job.org call uses for /api/kb/intel/run.',
    vars: ['KB_INTEL_CRON_SECRET'], stores: ['railway', 'external'],
    alsoSet: 'The cron-job.org job\'s Authorization header',
    consoleUrl: 'https://console.cron-job.org/jobs',
    login: 'confirm',
    rotate: 'Random value → Railway; after the deploy, update the cron-job.org header.',
    mode: 'must-match',
  },
  {
    id: 'teams-alerts', platform: 'Microsoft Teams — task alerts webhook', group: 'Cron & webhooks',
    what: 'Overdue-task alerts into a Teams channel. The URL itself is the secret. Without it the cron runs in dry-run mode.',
    vars: ['TEAMS_TASK_ALERTS_WEBHOOK_URL'], stores: ['railway'],
    consoleUrl: 'https://teams.microsoft.com',
    login: 'md@tresconglobal.com (confirm)',
    rotate: 'Recreate the channel workflow/webhook in Teams and paste the new URL.',
    mode: 'old-dies',
  },

  /* ── Other systems ────────────────────────────────────────────────── */
  {
    id: 'staff-portal', platform: 'Staff Portal (Lovable) sync', group: 'Other systems',
    what: 'Shared key between EventPilot and the Staff Portal sync endpoint. The portal reads it as SYNC_API_KEY.',
    vars: ['STAFF_PORTAL_SYNC_KEY', 'STAFF_PORTAL_SYNC_URL'], stores: ['railway', 'external'],
    alsoSet: 'Lovable Staff Portal → Project Settings → Secrets → SYNC_API_KEY (takes effect instantly, single key — no overlap)',
    consoleUrl: 'https://lovable.dev/projects/8ffd1f71-7b8b-4f5f-a88b-789e8de373af',
    login: 'md@tresconglobal.com',
    rotate: 'Random value → Railway; the moment the deploy is live, update SYNC_API_KEY in Lovable. Mismatch = 401s and a possible rate-limit lockout.',
    mode: 'must-match',
  },
  {
    id: 'hrms-supabase', platform: 'Staff Portal (HRMS) database login', group: 'Other systems',
    what: 'EventPilot signs in to the HRMS Supabase project as an admin user (anon key is public by design).',
    vars: ['HRMS_SUPABASE_URL', 'HRMS_SUPABASE_ANON_KEY', 'HRMS_ADMIN_EMAIL', 'HRMS_ADMIN_PASSWORD'], stores: ['railway'],
    consoleUrl: 'https://supabase.com/dashboard/project/smdqljhuwcnfhzezrlbg',
    login: 'confirm',
    rotate: 'Change the admin user\'s password in the Staff Portal, then set HRMS_ADMIN_PASSWORD in Railway. The anon key needs no rotation.',
    mode: 'must-match',
  },
  {
    id: 'konfhub', platform: 'KonfHub (per event)', group: 'Event platforms',
    what: 'Client ID/secret per KonfHub event (DFFW umbrella, BSS, DFWS, AI InfraNext, WAIS Malaysia). Stored in the database (event_websites), not Railway.',
    vars: [], stores: ['database'],
    consoleUrl: 'https://dashboard.konfhub.com',
    login: 'confirm',
    rotate: 'KonfHub offers NO way to change the keys. Protect by keeping the Supabase service-role key secret (rotate that instead).',
    mode: 'none',
  },
]

/** Env vars the CI check ignores because they are not secrets, with the reason. */
export const NOT_SECRET_VARS: Record<string, string> = {
  GITHUB_REPOSITORY: 'public repo name set by GitHub Actions',
  RAILWAY_GIT_COMMIT_SHA: 'public commit id set by Railway',
}

/** Vars removed from the platform — listed so nobody re-adds them by accident. */
export const RETIRED_VARS: Record<string, string> = {
  SUPER_ADMIN_PASSWORD: 'Password sign-in removed 22 Oct 2026 — Microsoft SSO only. Delete from Railway.',
  STAFF_DEFAULT_PASSWORD: 'Password sign-in removed 22 Oct 2026. Delete from Railway.',
  APOLLO_API_KEY: 'Lead enrichment / Smart Data module removed 22 Oct 2026. Delete from Railway.',
  LUSHA_API_KEY: 'Lead enrichment removed 22 Oct 2026. Delete from Railway.',
  MILLION_VERIFIER_API_KEY: 'Lead enrichment removed 22 Oct 2026. Delete from Railway.',
  SMARTDATA_URL: 'Smart Data module removed 22 Oct 2026. Delete from Railway.',
  SMARTDATA_ANON_KEY: 'Smart Data module removed 22 Oct 2026. Delete from Railway.',
  SMARTDATA_SERVICE_ROLE_KEY: 'Smart Data module removed 22 Oct 2026. Delete from Railway.',
  SMARTDATA_DB_PASSWORD: 'Smart Data module removed 22 Oct 2026. Delete from Railway.',
  LOVABLE_SD_URL: 'Smart Data module removed 22 Oct 2026. Delete from Railway.',
  LOVABLE_SD_ANON_KEY: 'Smart Data module removed 22 Oct 2026. Delete from Railway.',
  GOOGLE_CLIENT_ID: 'Unused OAuth client from an orphaned project. Delete from Railway.',
  GOOGLE_CLIENT_SECRET: 'Unused. Delete from Railway.',
  GOOGLE_ORG_CLIENT_ID: 'Unused. Delete from Railway.',
  GOOGLE_ORG_CLIENT_SECRET: 'Unused. Delete from Railway.',
  NEXT_PUBLIC_ADMIN_CODE: 'Retired shared admin code. Delete from Railway.',
}
