# EventPilot — Site Operations Module

Build specification for the EventPilot Claude Code session.

Everything required to take an event website from "published" to "fully
commissioned and competing" — search, analytics, AI discovery, social, off-site
presence and ongoing health — managed from inside EventPilot.

Version 1.4 · 15 September 2026 (addendum — service account replaces OAuth entirely)

---

## Changelog — v1.3 → v1.4

v1.3's multi-account OAuth model lasted about a day. Two real-world
constraints made it unworkable as designed:

1. **Testing users don't want to re-authenticate weekly.** External +
   Testing publishing status (required the moment a non-Workspace account
   like `tresconsocial@gmail.com` needs to sign in) caps refresh tokens at
   7 days for unverified apps.
2. **Madhu explicitly ruled out Google's app verification process** as a
   fix for (1) — no submission, no review queue, not for this.

**The fix: one shared Google Cloud service account, not a human OAuth
login at all.** What EventPilot actually needs — a backend reading/writing
GA4 and Search Console data on the org's behalf — is exactly what service
accounts are for. Granting the service account access to a property is the
same "add a user" action as sharing with a person (GA4 Admin →
Property Access Management; Search Console → Settings → Users and
permissions), just pointed at `eventpilot-siteops@eventpilot-site-
operations.iam.gserviceaccount.com` instead of an email address. No
consent screen, no Internal/External distinction, no token expiry, no
verification review — the whole v1.3 problem space stops applying.

**One real obstacle hit and cleared**: this GCP organization enforces
`iam.disableServiceAccountKeyCreation` at the org level, blocking key
creation outright. Madhu holds full org admin access, so this was resolved
by overriding the policy scoped to just the `eventpilot-site-operations`
project (Cloud Console → IAM & Admin → Organization Policies →
"Disable service account key creation" → Manage policy → Override
parent's policy → Enforcement: Off), rather than disabling it
organization-wide. Google's own "Fix access" troubleshooter self-granted
the `roles/orgpolicy.policyAdmin` role needed to make that change.

**Side finding, unresolved and no longer relevant to this module**: the
service-account key creation block being real (and requiring a genuine
Organization Policy Administrator role) means this GCP org **does** have a
proper Cloud Identity/Organization resource — which undercuts the earlier
v1.3-era theory that `md@tresconglobal.com`'s "Internal" OAuth consent
screen failure (`Error 403: org_internal`) was caused by a missing
Organization link. Since the service account approach sidesteps OAuth
consent screens entirely, this mystery no longer blocks anything — but if
Internal-mode OAuth is ever needed again for a different integration, it's
still an open question why a legitimate Workspace admin account failed it.

### What this removes and adds

**Removed entirely** (dead code, deleted): `google_org_connection` /
`google_connections` OAuth flow — `/api/connect/google-org/{route,
callback,disconnect,status}`, `app/lib/security/google-org-auth.ts`, the
multi-account admin UI, and the per-event "which Google account" picker
introduced in v1.3. `site_connections.google_connection_id` stays in the
schema (harmless, unused) rather than triggering another migration purely
for cleanup.

**Added**: `app/lib/security/google-service-account-auth.ts`
(`getGoogleServiceAccountToken()`, JWT-based via `google-auth-library`,
scopes: `analytics.readonly`, `analytics.edit`, `webmasters`).
`GOOGLE_SERVICE_ACCOUNT_KEY` env var holds the full downloaded JSON key,
minified to one line — set in both `.env.local` and Railway production.
`/admin/settings/google` repurposed to show service-account status and
prove GA4/Search Console access via the same fetch-and-select endpoints
(`ga4-accounts`, `search-console-sites`), now parameter-free.

**Unaffected**: `classify`, `ga4-property`, `connections`, and both health
checks (`checkGa4Receiving`, `checkSearchConsoleVerified`) all still work
exactly as designed — they just call `getGoogleServiceAccountToken()`
instead of picking a connection first.

### Outstanding manual step

The service account (`eventpilot-siteops@eventpilot-site-operations.iam
.gserviceaccount.com`) needs to be granted access, property by property, to
everything currently reachable only through `tresconsocial@gmail.com`:

- GA4: WBS Global - GA4, Trescon - New-Domain, Trescon - GA4, AI Singapore
  - GA4, AI Dubai - GA4 (all under Trescon Events account `145871382`)
- Search Console: `futuresustainabilityforum.com`,
  `worldaishow.com/dubai/`, `worldcxsummit.com/` (unverified even for
  `tresconsocial` itself — separate pre-existing gap), `aiinfranext.com`

Once granted, `tresconsocial@gmail.com`'s own Google sign-in becomes
irrelevant to EventPilot entirely — nothing in this module authenticates
as a human anymore.

---

## Changelog — v1.2 → v1.3

Phase 2 (section 8) built `google_org_connection` as a **singleton** — one
shared Google identity for every event's GA4/Search Console access. That
assumption is wrong. Confirmed 14 Sep 2026: event analytics properties are
currently split across at least two Google accounts in active use —
`tresconsocial@gmail.com` (existing, holds some events already) and
`digital@tresconglobal.com` (the account Madhu is consolidating into, access
expected 15 Sep 2026) — plus `md@tresconglobal.com`, which owns the GCP OAuth
client itself (`eventpilot-site-operations`) but which Madhu does not intend
to keep using for event property access going forward (retained for admin
access only). Because GA4/Search Console properties cannot be transferred
between Google accounts, `tresconsocial@gmail.com` is a **permanent** second
home for some events, not a migration artifact that resolves itself — the
singleton model was never going to be sufficient, not just temporarily wrong.

This surfaced directly from Scenario B/C planning: World AI Show Malaysia is
meant to test Scenario C (reusing WAIS Indonesia's existing GA4
stream/Search Console property, per section 3's own example), which only
works if EventPilot is looking through the Google account that actually
holds those properties. A singleton connection can silently look through the
wrong one and misclassify a site as Scenario A — creating a duplicate
property for a domain that already has one — with no evidence to even
present for override, since it never queried the account holding the
evidence.

**This addendum replaces the singleton with a named multi-account model.**
Everything below is being built now; connecting the actual
`digital@tresconglobal.com` account is data entry through the resulting UI,
gated on Madhu's access arriving — not a code dependency.

### Schema

`google_org_connection` (singleton, one implicit row) becomes
`google_connections` (one row per Google identity, keyed by the email Google
itself returns via `userinfo` at connect time — never free-typed, consistent
with principle 1):

```sql
alter table google_org_connection rename to google_connections;
alter table google_connections drop column if exists id;
-- (id/access_token_enc/refresh_token_enc/expires_at/google_account_email/
--  connected_by/connected_at/updated_at all carry forward unchanged in shape;
--  only the "exactly one row" assumption is dropped)
alter table google_connections
  add constraint google_connections_email_unique unique (google_account_email);
-- No pre-seeded row anymore — a row only exists once something has connected.
```

`site_connections` gains one column, so every per-site GA4/Search Console
connection records *which* org-level Google identity it came from — this is
what audit mode and health checks use to re-authenticate correctly later,
and what Step 2 (Classify) uses to know which connections to search across:

```sql
alter table site_connections
  add column google_connection_id uuid references google_connections(id);
```

### Behavioural changes

- **Connect flow (`/api/connect/google-org` → `callback`)**: unchanged
  mechanically (still OAuth, still fetches `userinfo.email` after token
  exchange) — the callback now **upserts by `google_account_email`** instead
  of always updating "the" one row. Connecting a Google identity that's
  already on file refreshes its tokens; connecting a new one adds a new row.
  Any admin can add a connection for any account they can complete the OAuth
  consent screen for — there's no restriction to one connector.
- **Disconnect**: now takes a `connection_id` and deletes that row outright
  (no reason to keep an empty placeholder row per-account the way the
  singleton did).
- **Status → list**: `/api/connect/google-org/status` returns every
  connection (`id`, `email`, `connectedAt`), not one.
- **`ga4-accounts`, `search-console-sites`, `ga4-property`**: all now require
  a `connection_id` — fetch-and-select extends one level: pick *which
  connected account* to fetch from, then pick the property/site as before.
- **Step 1 of the orchestrator (Connect Google)** changes shape slightly: it
  was "OAuth to the Google account" (implying one); it becomes "pick which
  already-connected account applies to this site, or connect a new one right
  here if none fit." That choice is what gets stored in the new
  `site_connections.google_connection_id`.
- **Step 2 (Classify)**: the existing Search-Console-evidence check
  (`classify/route.ts`) now loops across **every** connection, not the one
  connection, when looking for a matching domain. GA4-side evidence
  gathering for classification isn't built at all yet (today's evidence is
  Search Console + sibling EventPilot events only) — that gap is real but
  pre-existing and belongs to the Scenario B/C build itself (section 8, item
  5), not fixed as a side effect of this addendum.
- **Health checks** (`checkGa4Receiving`, `checkSearchConsoleVerified`): now
  read `site_connections.google_connection_id` for the site being checked
  and re-authenticate against that specific account, instead of the one
  singleton token.
- **Admin UI (`/admin/settings/google`)**: becomes a list of connected
  accounts (add another, disconnect one, fetch GA4/Search Console per
  account) instead of a single connected/not-connected card.
- **Per-event Integrations page**: Step 1's Google section gets an account
  picker ahead of the existing GA4/Search Console fetch-and-select UI.

### What ships today vs. what waits

Everything above — schema, API routes, both UI surfaces — is buildable now
and has no dependency on any specific account being connected. The only
thing waiting on Madhu is *using* the resulting "Add Google Account" flow to
actually connect `digital@tresconglobal.com`, which needs his access
(expected 15 Sep 2026). `tresconsocial@gmail.com` can be connected whenever
someone completes the OAuth screen as that identity. Live testing of any of
this is still blocked on the pre-existing `NEXT_PUBLIC_SITE_URL` issue
(Phase 2 finding — the OAuth redirect always resolves to production), so
none of this can be end-to-end verified locally regardless of which account
is used.

---

## Changelog — v1.1 → v1.2

Phases 0-4 (section 8) are built and committed as of 13 Sep 2026, covering
Step 0 (Site Registry), Step 1 (Google connection), Steps 2-3 (Classify,
Verify) of the Commissioning Orchestrator, and Health Checks (5.6). This
addendum details Steps 4-9 — the actual GA4/Search Console/technical-SEO
settings work, not yet built — and closes one structural gap found while
scoping it.

1. **Audit mode, added.** The orchestrator as written in v1.1 assumes a
   linear, greenfield walkthrough. There was no defined way to run it against
   a site that's already live with partial setup — detect what's missing,
   propose only the delta. See the new "Two entry modes" note at the top of
   section 4, and the "Detection basis" line added to each of Steps 4-9.
2. **GA4 cross-domain measurement, added to Step 6 and section 5.2.** Not in
   v1.1. Ticket purchases route through `konfhub.com` — a different domain
   from the event site — so without cross-domain configuration, GA4
   under-counts the actual conversion funnel (visit → click buy → complete on
   KonfHub).
3. **Health Checks table (5.6) extended** with the checks needed to drive
   audit-mode detection for Steps 4, 5, 6, 7 and 8, each annotated with the
   step it audits. No new tables required — `site_health_checks` already
   supports arbitrary `check_key` values.
4. **How Step 4 actually "publishes" `robots.txt`/`sitemap.xml`/`llms.txt` —
   resolved 14 Sep 2026.** Branding owns every site's repo and deploy
   pipeline; EventPilot has never had write access to it, by design. The
   approach: edge-serve these three paths via a Cloudflare Worker route
   scoped to the site's zone (`event_sites.cf_zone_id`/`cf_account_id`,
   already in schema), intercepting them ahead of the branding site's own
   build. **This is Cloudflare Worker routing — CLAUDE.md's hard rule 3 named
   Durga as the required sign-off; Madhu has since confirmed his own
   sign-off is sufficient project-wide, superseding that line.** Cleared to
   build. One remaining check before building it broadly: confirm which
   hosting providers the actual target sites run on (Site Registry's
   `hosting_provider` field) — this mechanism assumes Cloudflare-fronted
   sites specifically, and needs a fallback for any that aren't.

v1.0 was written and reviewed against the live codebase before any code was
touched. Four things changed as a result. Everything not listed here was
verified accurate and is carried forward unchanged.

1. **`event_sites` naming collision, resolved.** A table named `event_sites`
   already exists (`supabase/event_sites.sql`), built for an earlier,
   abandoned site-generation effort ("TAOS": `repo_name`, `worker_name`,
   `template_id`, deployed via `app/api/sites/deploy` and
   `app/api/sites/sync-content`, surfaced in `app/admin/sites/page.tsx` and
   inside the Website Builder's deploy tab). **Confirmed dead**: 0 rows in
   production, 0 events with `custom_domain`/`cf_zone_id` ever set on
   `event_websites`, no feature commits since 17 Jul 2026 (only unrelated
   auth-gap sweeps). Decision: **drop and recreate `event_sites`** with the
   schema in section 6. See section 8, Phase 0.
2. **A dependent route is broken and must be fixed, not left alone.**
   `app/api/events/cloudflare/route.ts:32-40` reads `worker_name` from the old
   `event_sites` to compute a CNAME target, falling back to
   `cname.vercel-dns.com` when it finds nothing — which, since the table is
   empty, is always. That fallback points at infrastructure that no longer
   exists (Vercel was removed 18 Jun 2026, per this project's hard rules).
   This route has likely never worked correctly. It gets rebuilt against the
   new `event_sites`/`site_connections` tables in Phase 0, targeting the
   actual Cloudflare account/zone selected through Site Registry, not a
   Vercel-era guess.
3. **Orchestrator step order fixed.** v1.0's Step 1 (Classify) depended on
   evidence — existing GA4 properties, existing Search Console properties —
   that only becomes available after Step 2 (Connect Google/OAuth). Steps 1
   and 2 are swapped: connect first, classify from what that connection
   reveals. See section 4.
4. **Credential encryption mechanism named.** v1.0 said `site_connections.
   credentials` must be "encrypted at rest" without saying how. An AES-256-GCM
   helper already exists for exactly this (`app/lib/security/token-crypto.ts`,
   built for OAuth/Drive tokens) — reuse it rather than inventing a second
   mechanism. Note this is *not* yet applied to KonfHub/Postiz secrets, which
   remain plaintext in `event_website.sql` by design ("fine for now" per that
   file's own comment) — that is a separate, pre-existing gap, out of scope
   here and not silently fixed as a side effect of this build.

Also confirmed and left as-is: `admin/sites/page.tsx` stays wired into the nav
(`app/lib/registry/modules.tsx`) and linked from `app/admin/bespoke/[id]/page.tsx`
until the new Site Registry section ships and replaces it in one move — per
Madhu, 13 Sep 2026. It will show broken/empty state in the interim; nothing
depends on it functioning.

**Not affected by any of this**: the Website Builder itself
(`app/admin/events/[id]/website/page.tsx`, backed by `event_websites`) is a
live, actively developed module — 4 real events, last touched 5 Sep 2026 —
entirely separate from the dead TAOS backend it happens to share a page with.
Section 9's instruction to reuse its infrastructure (slug handling, publish
state, asset upload, draft/publish versioning) stands unchanged.

---

## 0. Purpose

When the branding team publishes an event website, it is raw. No analytics, no
Search Console, no sitemap submission, no AI crawler configuration, no
off-site presence. Today nothing in EventPilot knows the site exists.

This module closes that gap. One button identifies what kind of launch this is,
proposes the correct setup, and executes it step by step under human control.

It must handle three distinct situations, and detect which applies without
being told.

---

## 1. Design principles — inherit these exactly

These come from the existing per-event Integrations page
(`app/admin/events/[id]/integrations/page.tsx`) and are not to be
re-litigated. They are the reason this module will be trustworthy. Verified
against that file directly — every principle below is already load-bearing
there, not aspirational.

**1. Fetch-and-select. Never free-typed identifiers.**
Credentials and account-level IDs are typed once. Everything downstream —
properties, streams, sites, tags, tickets, accounts — is fetched from the
provider and selected by a human from a dropdown.

This principle is the direct fix for a real failure: a fabricated GA4
measurement ID (`G-AINFRANEXT26`) reached production and collected nothing for
two days, because it was a free-typed string. Under fetch-and-select it could
not have existed.

**2. Never auto-run a fetch.** Only a human knows when the provider side is
ready. Every fetch is on explicit request.

**3. A human maps every field.** No auto-matching by name. The existing
KonfHub notes record why: one real event had both a `speaker` tag and a
separate `Speaker` tag.

**4. AI proposes, a human approves each step.** The orchestrator in section 4
is multi-step and AI-assisted, but nothing executes without confirmation. It
never batches approvals.

**5. A value being present never means it works.** Every connection carries a
verification state proven by a live check, not by a field being non-empty.

**6. Permission-gated.** Follow the existing `sae.integrations.manage` pattern
(`app/lib/registry/access-permissions.ts:76`), delegatable the same way
Producer and Sensitive Documents already are.

---

## 2. Placement

Extend the existing per-event Integrations page rather than creating a parallel
surface. It already has the scroll-spied left nav (`IntersectionObserver`-based)
and the fetch-and-select conventions.

Current `NAV_SECTIONS` keys: `konfhub`, `hubspot`, `postiz`, `client-approval`.

New sections to add:

```
Existing:  KonfHub · HubSpot Forms · Postiz · Client Approval Contacts
New:       Site Registry · Google Analytics · Search Console ·
           SEO & Discovery · Off-site Presence · Health Checks
```

Commissioning (section 4) sits above them as a launcher — a single panel at the
top of the page that appears when a site is registered but not yet commissioned.

---

## 3. Scenario classification — domain first

The determining factor is **not** event lineage. It is the registrable domain.
Two editions of the same series on one domain share search infrastructure; the
same series on a new domain does not.

Classify by comparing the site's registrable domain against existing registered
sites and against the connected Google account's properties.

### Scenario A — New domain, new series
*Example: aiinfranext.com*

Everything is created fresh.
- New Search Console property (domain property, DNS verified)
- New GA4 property and web data stream
- Full setup path

### Scenario B — New domain, existing series
*Example: a future AI InfraNext edition on its own domain*

- New Search Console property
- **New data stream inside the existing series GA4 property**, not a new
  property — this preserves cross-edition reporting, which is the whole reason
  a series brand exists
- Inherit conventions from the series: UTM scheme, conversion event names,
  content groupings

### Scenario C — Existing domain, new edition
*Example: worldaishow.com/indonesia alongside worldaishow.com/malaysia*

- **Reuse** the existing Search Console property and GA4 stream. Creating new
  ones fragments the data and loses accumulated authority.
- Add edition segmentation: a GA4 content grouping or custom dimension keyed to
  the edition path, so reporting can separate editions without separating data.
- Submit the new URLs to the existing sitemap; do not create a second sitemap.

**Detection must be evidence-based.** Query the Google account for existing
properties covering the domain, and query the EventPilot site registry for
sibling events. Present the classification with the evidence that produced it,
and allow the human to override it.

---

## 4. The Commissioning Orchestrator

A guided flow. AI proposes, human confirms each step, every step verifies
before the next unlocks.

Step order below is revised from v1.0: classification requires evidence from
the Google account, so connecting it must happen first.

**Two entry modes.** A site enters this orchestrator once, at commissioning —
Scenario A, B or C, Steps 0-9 in full. It can also re-enter later in **Audit
mode**: triggered manually from the Integrations page, or automatically when
Health Checks (5.6) surface a fail/warn on any of the checks Steps 4-9 own.
Audit mode skips Steps 0-3 (already satisfied for a commissioned site) and
runs a detection pass across Steps 4-9: each step's proposal panel shows only
what's missing or broken, with anything already correctly configured shown as
confirmed and skipped. This is not a second flow — the same step
implementation serves both modes. A step's job is always *detect current
state, propose only the delta, execute what's confirmed* — never assume
greenfield. This is why each step below now carries a **Detection basis**
line: that's the exact signal Audit mode uses to decide what to show.

### Step 0 — Register the site
Human enters: live URL, repo URL, preview URL, hosting provider. Everything
else is derived or fetched.

### Step 1 — Connect Google
OAuth to the Google account. Fetch, never type:
- Search Console: list of properties the account can access
- GA4: account list → property list → data stream list

Human selects existing resources at this point only for the purpose of
gathering classification evidence — no creation happens yet.

### Step 2 — Classify
Orchestrator uses the fetched evidence plus the EventPilot site registry
(sibling events on this domain) to determine Scenario A, B or C, and presents:

```
Detected: Scenario C — existing domain, new edition

Evidence
  · Domain worldaishow.com already has a Search Console property
    (verified 2024-03-11)
  · GA4 property "World AI Show" has a web stream for this domain
  · 2 sibling events registered on this domain in EventPilot

Proposed
  · Reuse existing Search Console property
  · Reuse existing GA4 stream
  · Add content grouping "edition = indonesia-2026"
  · Submit 21 new URLs to the existing sitemap

                                   [ Override ]  [ Confirm ]
```

For Scenario A or B, an explicit **Create** action is offered at this step,
which creates the property via the Admin API and then re-fetches so the
selection still comes from real data.

### Step 3 — Verify connections
Each must pass before proceeding:
- Search Console property is verified (DNS preferred — survives rebuilds, unlike
  the HTML meta tag)
- GA4 stream returns a live hit within 24 hours, or the step stays amber and
  explains how to generate one
- Measurement ID format validates as `G-` plus ten alphanumerics

### Step 4 — Technical foundation
Generate and publish, then verify each:
- `robots.txt` including the AI crawler allowlist
- `sitemap.xml`, excluding `noindex` routes
- `llms.txt` from event facts and published articles
- Canonical tags present and self-referencing
- `noindex, nofollow` confirmed on private routes
- 404 page resolves
- `www` and apex resolve to one canonical host

**Detection basis (audit mode)**: fetch `robots.txt`/`sitemap.xml`/`llms.txt`
live and parse; scan a sample of routes for canonical tags and `noindex`
headers/meta; request a known-bad path to confirm 404 behaviour; resolve both
`www` and apex hosts and compare. All of this is read-only against the live
site — no publish access needed to detect a gap, only to fix one.

**Open decision — how "publish" actually works here, not yet resolved (see
Changelog item 4).** Branding owns every site's repo/deploy; EventPilot has
never had write access. The schema-consistent option is edge-serving these
three paths via a Cloudflare Worker route bound to the site's existing
`cf_zone_id`, intercepting them ahead of the branding site's own build and
serving EventPilot-generated content instead — no repo access needed. **This
touches Cloudflare Worker routing, which requires Durga's explicit
sign-off per this project's hard rules — not assumed by this spec.** Build
the detection/verification half of this step first; hold the publish
mechanism until that sign-off exists.

### Step 5 — Search submission
- Submit sitemap to Search Console
- **Bing Webmaster Tools** — connect and submit. Routinely skipped and it feeds
  more than Bing.
- **IndexNow** — configure the key. Gives near-instant indexing on Bing and
  Yandex, and costs nothing. Wire it so publishing an article pings IndexNow
  automatically.
- Validate structured data. Event schema completeness matters specifically:
  Google surfaces events in its own event experience, and incomplete Event
  markup silently excludes the site from it.

**Detection basis (audit mode)**: Search Console's `sitemaps.list` API
(submitted status, last read, errors) — already the source for the existing
"Sitemap readable" health check; Bing Webmaster's equivalent sitemap-status
call once that connection exists; presence of an IndexNow key in
`site_connections` (provider `indexnow`, schema already anticipates this) plus
a check of whether recent publishes actually pinged it; re-run the existing
schema-validity check (5.6) against the live page's JSON-LD for Event-field
completeness specifically, not just parseability.

### Step 6 — Analytics configuration
- Conversion events, one per form, named so sponsorship enquiries are
  distinguishable from delegate applications
- Link GA4 to Search Console — required for query data inside GA4
- Link GA4 to Google Ads if present, for future campaign work
- **Consent Mode v2** — required for EU traffic and mandatory for Google Ads
  personalisation. Set up now rather than retrofitted mid-campaign.
- Content groupings, per scenario classification
- **GA4 cross-domain measurement, added in v1.2.** Ticket purchases route
  through `konfhub.com` — a separate domain from the event site. Without
  configuring `konfhub.com` as a linked domain in the GA4 data stream's
  cross-domain settings, GA4 treats the handoff as a new session and loses
  the referral, undercounting the real conversion funnel (visit → click buy →
  complete on KonfHub). Configure this for every event, not just ones already
  showing a conversion-rate anomaly.

**Detection basis (audit mode)**: GA4 Admin API for conversion event
definitions, the GA4↔Search Console link resource, the GA4↔Ads link resource,
and the cross-domain/"configure your domains" setting on the data stream; a
live scan of the site for a consent-management-platform script or the
`gtag('consent', ...)` call to confirm Consent Mode is actually wired on the
site side, not just configured in GA4.

### Step 7 — Social and preview
- Validate every OG image resolves and is 1200×630
- Run each route through the LinkedIn Post Inspector to prime its cache —
  LinkedIn caches aggressively, and a bad first scrape persists
- Confirm `og:locale`, `twitter:card` and site name

**Detection basis (audit mode)**: HTTP HEAD + dimension check on every
`og:image` (extends the existing "OG images resolve" health check from
existence-only to dimension-correctness); meta-tag scan for `og:locale` /
`twitter:card` / `og:site_name`; LinkedIn Post Inspector's own re-scrape
response indicates whether its cached preview is stale relative to the live
page.

### Step 8 — Off-site presence
- Generate the standard listing copy at three lengths from the messaging
  document
- Present the directory checklist with per-listing status
- Flag any conflict with a sibling event on the same domain, so two Trescon
  events do not compete for the same query with identical copy

**Detection basis (audit mode)**: a straight status rollup from
`site_directory_listings` (already exists, section 6) — this step's audit
mode is purely "what's still `not_submitted`," nothing new to fetch.

### Step 9 — Baseline and handover
- Record Core Web Vitals baseline
- Run the full health check suite
- Assign roles: `content` to marketing, `design` to branding, `admin` to event
  lead
- Mark the site `live`

**Detection basis (audit mode)**: re-running this step for an already-live
site is just "refresh the Core Web Vitals baseline and re-run health
checks" — role assignment and the `live` flag don't need re-confirming once
set. In practice, Audit mode for an already-commissioned site mostly means
Steps 4-8; Step 9 only matters again if Core Web Vitals baseline data is
stale or missing.

---

## 5. Section specifications

### 5.1 Site Registry
Live URL, repo URL, preview URL, hosting provider, Cloudflare account/zone/
project, deploy hook, last deploy timestamp and status, build framework, bound
content types, commissioning status.

This is also where `app/api/events/cloudflare/route.ts` is rebuilt: custom
domain + zone selection becomes fetch-and-select against the connected
Cloudflare account (mirroring principle 1), and the CNAME target is read from
the new `event_sites`/`site_connections` records instead of the dead
`worker_name` lookup and its stale Vercel fallback.

### 5.2 Google Analytics
Connected account, selected property and stream, measurement ID (read-only,
fetched), verification state with last-hit timestamp, conversion event list,
Consent Mode status, Ads link status, **cross-domain measurement status
(added v1.2)** — whether `konfhub.com` is configured as a linked domain on
this stream, surfaced as its own state rather than buried inside a generic
"configured" flag, since it's easy to set up GA4 correctly and still miss
this one setting.

### 5.3 Search Console
Connected account, selected property, verification method and state, sitemap
submission status and last read date, indexed page count, top queries summary,
coverage errors surfaced as notifications.

**Branded search volume is the headline metric for a first-edition event.**
Rising searches for the event name is the leading indicator that outbound and
social are working, and it comes from Search Console rather than GA4.

### 5.4 SEO & Discovery
- Per-route metadata with live character counts against the 60 and 155 limits
- Indexing control per route, enforced not merely configured
- Redirect management
- Structured data configuration, generated from EventPilot data
- `llms.txt` generation
- AI crawler allowlist state
- IndexNow key and ping log

### 5.5 Off-site Presence
Directory listing tracker with status per aggregator, standard copy at three
lengths, and sibling-event conflict warnings.

### 5.6 Health Checks
Scheduled daily, runnable on demand. Failures notify the `admin` role.

| Check | Fails when |
|---|---|
| Site reachable | Non-200 on any key route |
| GA4 receiving | No hit in 24h against a configured property |
| Search Console verified | Property unverified |
| Sitemap readable | Search Console reports a fetch error |
| Schema valid | JSON-LD unparseable or required Event fields missing |
| OG images resolve | Any `og:image` returns 404 |
| Private routes excluded | A `noindex` route is indexable or in the sitemap |
| Metadata limits | Title over 60, or description outside 120–155 |
| Internal links | Any internal link 404s |
| Deploy freshness | Content published with no successful deploy since |
| Venue consistency | Venue confirmed in EventPilot but stale on site |
| SSL expiry | Certificate expires within 30 days |
| Core Web Vitals | Mobile LCP, CLS or INP outside thresholds |
| `robots.txt` valid *(v1.2, Step 4)* | Missing, or AI crawler allowlist absent |
| `llms.txt` present *(v1.2, Step 4)* | Missing, or stale against current event facts |
| Canonical host *(v1.2, Step 4)* | `www` and apex do not resolve to one host |
| Bing indexed *(v1.2, Step 5)* | Bing Webmaster property unverified, or sitemap not submitted there |
| IndexNow configured *(v1.2, Step 5)* | No key on record, or no successful ping in the last 30 days |
| GA4↔Search Console linked *(v1.2, Step 6)* | Link resource absent |
| GA4 cross-domain configured *(v1.2, Step 6)* | `konfhub.com` not present in the stream's linked domains |
| Consent Mode live *(v1.2, Step 6)* | GA4 configured for Consent Mode, but no consent signal detected on the live site |
| OG image dimensions *(v1.2, Step 7)* | Resolves, but not 1200×630 |
| LinkedIn preview fresh *(v1.2, Step 7)* | Post Inspector's cached preview is stale vs. the live page |
| Directory listings *(v1.2, Step 8)* | Any tracked listing still `not_submitted` past its target date |

---

## 6. Schema

`event_sites` already exists but is dead (see Changelog item 1: 0 rows,
abandoned TAOS-era shape). It is dropped and recreated here rather than
altered in place, since none of its columns or data carry forward.

```sql
drop table if exists event_sites cascade;

create table event_sites (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid references events(id) on delete cascade not null,
  live_url            text,
  repo_url            text,
  preview_url         text,
  hosting_provider    text,
  cf_account_id       text,
  cf_project_name     text,
  cf_zone_id          text,
  deploy_hook_url     text,
  last_deploy_at      timestamptz,
  last_deploy_status  text,
  build_framework     text,
  registrable_domain  text,
  launch_scenario     text check (launch_scenario in ('new_domain_new_series','new_domain_existing_series','existing_domain_new_edition')),
  commissioning_state text default 'registered'
                      check (commissioning_state in ('registered','in_progress','commissioned','archived')),
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);
create index if not exists idx_event_sites_domain on event_sites(registrable_domain);

create table if not exists site_connections (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid references event_sites(id) on delete cascade not null,
  provider        text not null,   -- ga4 | search_console | bing | cloudflare | google_ads | indexnow
  account_ref     text,
  property_ref    text,
  stream_ref      text,
  credentials     jsonb,           -- AES-256-GCM via app/lib/security/token-crypto.ts; never returned to client
  status          text default 'not_connected'
                  check (status in ('not_connected','connected_unverified','verified','error')),
  last_verified_at timestamptz,
  last_error      text,
  created_at      timestamptz default now(),
  unique (site_id, provider)
);

create table if not exists site_health_checks (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid references event_sites(id) on delete cascade not null,
  check_key   text not null,
  status      text not null check (status in ('pass','warn','fail')),
  detail      text,
  checked_at  timestamptz default now()
);
create index if not exists idx_health_site_time on site_health_checks(site_id, checked_at desc);

create table if not exists site_directory_listings (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid references event_sites(id) on delete cascade not null,
  directory    text not null,
  status       text default 'not_submitted'
               check (status in ('not_submitted','submitted','live','rejected')),
  listing_url  text,
  submitted_at timestamptz,
  notes        text
);
```

`site_connections.credentials` holds OAuth tokens, encrypted at rest using the
existing `encryptToken`/`decryptToken` helpers in
`app/lib/security/token-crypto.ts` (AES-256-GCM, key from
`OAUTH_TOKEN_ENCRYPTION_KEY`). Never return it to the client.

`app/api/events/cloudflare/route.ts` must be updated in the same migration to
stop reading `worker_name`/`site_url` from the old `event_sites` shape (those
columns no longer exist) and instead resolve its CNAME target from
`site_connections` (provider `cloudflare`) / the new `event_sites` fields.

**v1.2 note: no new tables needed for Steps 4-9.** `site_health_checks`
already accepts arbitrary `check_key` values (the new rows added to 5.6's
table above need no migration), and `site_connections.provider` already
anticipates `bing` and `indexnow`. The one open item is *not* a schema
question — it's whether `robots.txt`/`sitemap.xml`/`llms.txt` get published
via Cloudflare Worker routing (Step 4's flagged decision, pending Durga's
sign-off) or some other mechanism; either way it doesn't change this schema.

---

## 7. KonfHub gaps

Confirmed accurate against the codebase as written. Current state: the KonfHub
integration covers **speakers only** —
`app/api/events/konfhub/{settings,fetch-tags,fetch-tickets,registration-fields}`
plus the speaker push routes under
`app/api/events/stakeholders/speakers/[id]/konfhub-*`.

This work has no schema or code dependency on sections 1–6 above and can be
built independently, in parallel, by a different session if useful — it's
grouped in this document because it originated from the same review, not
because it shares infrastructure with Site Operations.

KonfHub is a genuine destination in its own right, not a pass-through. Its
attendee app needs speakers, sponsors, partners and agenda to drive networking,
matchmaking and the on-site experience. Three things are missing.

**Sponsor and partner push.** Managed in EventPilot stakeholders
(`app/api/events/sponsors/route.ts`), no push route exists. `event_sponsors.
tier` also needs extending — its constraint currently allows
`platinum, gold, silver, bronze, media, association, government, startup`
(confirmed, `supabase/event_website.sql:101-113`) and cannot represent `lead`,
`exhibitor`, `cxo_boardroom` or brand-visibility packages. Note
`sae_migration.sql` already added a separate, broader `partner_type` column
without touching `tier` — check whether extending `tier` or leaning further on
`partner_type` is the better fit before migrating.

**Agenda push.** `event_agenda` exists (`supabase/event_website.sql:82-96`);
no push route (`app/api/events/agenda/route.ts` has none).

**Two-way sync with field ownership.** KonfHub generates booking IDs, check-in
status, session attendance and app engagement, which should flow back. That
requires a conflict rule, settled before it is built:

> **EventPilot owns content fields. KonfHub owns operational fields.**
> Name, title, bio, photo, session title, sponsor tier, agenda content —
> EventPilot is authoritative and overwrites.
> Booking ID, check-in status, scan data, app engagement — KonfHub is
> authoritative and writes into EventPilot.
> Every field belongs to exactly one owner. No field is negotiated.

---

## 8. Build order

**Phase 0 — Retire the dead TAOS layer.** Drop and recreate `event_sites`
(section 6), delete `app/api/sites/deploy` and `app/api/sites/sync-content`,
remove the now-broken deploy/template/sync buttons from
`app/admin/events/[id]/website/page.tsx` and `app/admin/sites/page.tsx`. Leave
`admin/sites/page.tsx` itself and its nav entry in place (per Madhu,
13 Sep 2026) — it will show broken/empty state until Phase 1 replaces it.
Fix `app/api/events/cloudflare/route.ts`'s dead `worker_name` lookup as part
of this same pass, per section 5.1.

1. **Site Registry UI**, on the recreated `event_sites` table. Nothing else
   can exist until a site is a record.
2. **Google connections — GA4 and Search Console.** Fetch-and-select. This is
   the highest-value single piece.
3. **Health checks.** Start with GA4 receiving, Search Console verified, schema
   valid, private routes excluded. Highest assurance per line of code.
4. **Commissioning orchestrator, Scenario A only.** Prove the flow on a new
   domain before adding B and C. *(Done, 13 Sep 2026 — Steps 2-3 only.)*
5. **Scenarios B and C.**
5a. **Step 4 (Technical foundation)** — detection half (audit-mode checks:
    robots.txt/sitemap.xml/llms.txt/canonical/private-routes/host scan, new
    health-check rows) and the Cloudflare Worker publish mechanism (v1.2
    Changelog item 4, cleared 14 Sep 2026) can now be built together.
5b. **Step 5 (Search submission)** — Bing Webmaster connection (new
    `site_connections` provider row, same OAuth/API-key pattern as Google),
    IndexNow key generation and ping wiring, structured-data completeness
    check.
5c. **Step 6 (Analytics configuration)** — conversion events, GA4↔Search
    Console link, Consent Mode v2, content groupings, and the new GA4
    cross-domain measurement setting (v1.2).
5d. **Step 7 (Social/preview)** — OG image dimension validation, LinkedIn
    Post Inspector integration, meta tag scan.
6. **SEO & Discovery section (5.4)**, page metadata first — the persistent
   settings panel backing Steps 4-6 above.
7. **Off-site presence tracker (Step 8 / 5.5).**
7a. **Audit-mode wiring** — the shared "detect current state, propose only
    the delta" entry point across Steps 4-9, once each step above exists
    individually. Health Checks (already live, Phase 3) become the trigger
    surface for it.
8. **KonfHub sponsor and agenda push.** (Independent track — see section 7.)
9. **KonfHub two-way sync** with the ownership rule.
10. **Google Ads connection**, same pattern, when campaigns start.

---

## 9. What not to build

**A visual page builder.** The existing Website Builder (`event_websites`,
live, actively developed — not to be confused with the dead TAOS backend
retired in Phase 0) already does this and is the templatised path being moved
away from. Reuse its infrastructure — slug handling, publish state, asset
upload, draft/publish versioning. Do not extend its template concept.

**Centralised brand tokens.** Holding every event's colours and fonts in
EventPilot is exactly where templatisation returns. Brand assets stay in each
site's repository.

**Auto-execution of anything.** Every fetch, every creation, every submission
is human-confirmed. The orchestrator's value is that it knows what to propose,
not that it acts alone.
