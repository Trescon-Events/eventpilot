# eventpilot-proxy

The Cloudflare Worker that fronts `eventpilot.tresconglobal.com/*` (single
route on the `tresconglobal.com` zone). Not part of EventPilot's own
Railway/git deploy flow — this is a separate, tiny Worker deployed directly to
Cloudflare, and until 03 Jul 2026 its source wasn't checked in anywhere. It's
here now for durability.

**Never touch this without explicit instruction from Durga** — it fronts the
entire domain, not just one tool. See root `CLAUDE.md` hard rules.

## What it does

Every request to `eventpilot.tresconglobal.com` is a simple hostname-swap
proxy: forwards to EventPilot's Railway app by default, except requests to
`/smartexcel` or `/smartexcel/*`, which forward to the SmartExcel Cloudflare
Worker instead (full path preserved — SmartExcel's own build is base-path-aware,
see `tools/smartexcel/vite.config.ts`). No other path rewriting happens.

## Account

Deployed under the `reachcharan@gmail.com` Cloudflare identity (the platform
owner account), not `md@tresconglobal.com`'s. A Cloudflare API token for that
identity is in EventPilot's `.env.local` (`CF_API_TOKEN` — gitignored, never
commit it) — that's what authenticates the commands below, separate from the
`wrangler login` OAuth session used for everything else in this repo.

## Deploy

No `wrangler.jsonc` for this one — it's simple enough that it's deployed via
a raw Cloudflare API multipart upload rather than a full wrangler project:

```bash
cd infra/eventpilot-proxy
set -a && source ../../.env.local && set +a
TOKEN="${CF_API_TOKEN:-$CLOUDFLARE_API_TOKEN}"

echo '{"main_module":"proxy-worker.js","compatibility_flags":[]}' > /tmp/metadata.json

curl -X PUT \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "metadata=@/tmp/metadata.json;type=application/json" \
  -F "proxy-worker.js=@proxy-worker.js;type=application/javascript+module" \
  "https://api.cloudflare.com/client/v4/accounts/b27fbe19c7798f8b75ecaeb7b5660f19/workers/scripts/eventpilot-proxy"
```

Takes effect immediately on the single bound route
(`eventpilot.tresconglobal.com/*`) — no separate "activate" step.

## Adding another path-based route (e.g. a future tool)

Add another branch to the `isSmartExcel`-style check in `proxy-worker.js`,
redeploy with the command above. Keep the default branch (Railway) as the
catch-all fallback — every new path added here needs its own explicit branch,
nothing routes anywhere except Railway unless it's named.
