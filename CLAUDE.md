@AGENTS.md

---

# Event Pilot — MANDATORY SESSION BRIEF
# Read this before touching ANYTHING. No exceptions.

---

## LIVE SITE
https://eventpilot.tresconglobal.com

## LOCAL PATH
/Users/madhu/EventPilot — port 3000

---

## BUILD & PUSH FLOW (the only flow — do not deviate)

1. Make code changes locally
2. git push to Trescon-Events/eventpilot (main branch) on GitHub
3. Railway auto-deploys (~3 min) via GitHub webhook
4. Cloudflare Worker (eventpilot-proxy) serves it live at eventpilot.tresconglobal.com

That is it. Git push = live. No Vercel. No wrangler commands. No manual deploy steps.

---

## ACCOUNT MAP

| Layer        | Account                                                        | Login                       |
|--------------|----------------------------------------------------------------|-----------------------------|
| Code         | GitHub: Trescon-Events/eventpilot                              | md@tresconglobal.com        |
| Hosting      | Railway: Trescon's Projects / eventpilot                       | webadmin@tresconglobal.com  |
| Domain + DNS | Cloudflare: Trescon account                                    | md@tresconglobal.com        |
| Database     | Supabase: yuyxfxoevztugtfgduks                                 | md@tresconglobal.com        |
| Email        | Resend: noreply@eventpilot.tresconglobal.com                   | see .env.local              |
| SSO          | Microsoft Azure Entra ID                                       | managed by Madhu            |

Railway project URL: https://railway.com/project/26f95192-091d-48d0-a4f9-f8cc4549b8a4
Railway internal URL: eventpilot-production-90c6.up.railway.app

---

## MICROSOFT SSO
- MICROSOFT_CLIENT_ID: 1eb65a1b-849d-414f-88f4-e0faf812fbfc
- MICROSOFT_TENANT_ID: 932ae9a0-7b21-4cbe-8f11-cc53d1d3d722
- MICROSOFT_CLIENT_SECRET: stored in Railway env vars — do not expose, do not change

---

## KEY VALUES
- Super admin email: md@tresconglobal.com (fixed in code, `app/lib/access/super-admin.ts`; Madhu is the sole Super Admin)
- **No passwords, codes or secrets are kept in this file.** Real values live in `.env.local` (local) and Railway variables (production). On 26 Sep 2026 the following were removed because they were dead and must never sit in a checked-in file: a stale super-admin password, the retired shared "admin code" (it no longer works anywhere — routes now require a real signed session), a staff default password, and the hardcoded cron-secret literal (also retired; only the env `CRON_SECRET` is accepted).
- Local port: 3000

---

## ACCESS REMOVAL NOTE
Durga Charan (dc@tresconglobal.com and reachcharan@gmail.com) was removed from the system on 28 Oct 2026. This was done in the wake of the recent Railway.com global outage, as part of tightening up all our loose ends and rotating all our env vars.

---

## COLLEAGUES
- Madhu (Madhukar Dudda) — md@tresconglobal.com — Bangalore — sole admin and builder

---

## HARD RULES — NEVER BREAK THESE

1. Vercel is gone — deleted 18 Jun 2026. Never create or reference a Vercel project for this app.
2. Never run vercel deploy or wrangler deploy commands
3. Never touch Cloudflare Worker routing without explicit instruction — Madhu's sign-off is sufficient (confirmed 14 Sep 2026)
4. Never change environment variables in Railway without explicit instruction
5. Never add default passwords or hardcoded credentials to code without asking first
6. Never deploy to production without user saying so explicitly in that message
7. Only do exactly what is asked — nothing extra

Note (14 Sep 2026): Madhu's sign-off is sufficient authorization project-wide going forward — no rule above needs anyone else's approval.

