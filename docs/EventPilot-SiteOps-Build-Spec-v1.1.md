# EventPilot — Site Operations Module

Build specification for the EventPilot Claude Code session.

Everything required to take an event website from "published" to "fully
commissioned and competing" — search, analytics, AI discovery, social, off-site
presence and ongoing health — managed from inside EventPilot.

Version 1.1 · 13 September 2026 (revised from v1.0 same day, post codebase verification)

---

## Changelog — v1.0 → v1.1

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

### Step 6 — Analytics configuration
- Conversion events, one per form, named so sponsorship enquiries are
  distinguishable from delegate applications
- Link GA4 to Search Console — required for query data inside GA4
- Link GA4 to Google Ads if present, for future campaign work
- **Consent Mode v2** — required for EU traffic and mandatory for Google Ads
  personalisation. Set up now rather than retrofitted mid-campaign.
- Content groupings, per scenario classification

### Step 7 — Social and preview
- Validate every OG image resolves and is 1200×630
- Run each route through the LinkedIn Post Inspector to prime its cache —
  LinkedIn caches aggressively, and a bad first scrape persists
- Confirm `og:locale`, `twitter:card` and site name

### Step 8 — Off-site presence
- Generate the standard listing copy at three lengths from the messaging
  document
- Present the directory checklist with per-listing status
- Flag any conflict with a sibling event on the same domain, so two Trescon
  events do not compete for the same query with identical copy

### Step 9 — Baseline and handover
- Record Core Web Vitals baseline
- Run the full health check suite
- Assign roles: `content` to marketing, `design` to branding, `admin` to event
  lead
- Mark the site `live`

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
Consent Mode status, Ads link status.

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
   domain before adding B and C.
5. **Scenarios B and C.**
6. **SEO & Discovery section**, page metadata first.
7. **Off-site presence tracker.**
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
