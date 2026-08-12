# EventPilot — SME Context Document
**Share this file with any subject matter expert who is helping design, specify, or iterate on a micro-tool inside EventPilot.**

> **How to use this document**
> Paste the full contents into ChatGPT, Gemini, or any AI tool before asking it to generate a prompt or PRD for Durga. The AI will understand the platform, its conventions, and how to write instructions that translate directly into working code without ambiguity.

---

## 1. What Is EventPilot

EventPilot is Trescon's internal operations platform. It is a private, staff-only web application used by roughly 120+ employees across four offices: **Dubai, Bangalore, Mangalore, and Manipal**.

It is not a public product. Every page is behind authentication. Staff log in via **Microsoft 365 Single Sign-On (SSO)** only — there is no email/password login.

The platform serves as the single system of record for:
- Event planning and execution
- HR operations (attendance, leave, recruitment, contracts, payroll)
- Lead data management and enrichment
- Event website and brand asset creation
- AI social content production
- AI learning and skill development for all staff

**The platform will eventually absorb Trescon's separate HRMS and SmartData systems.** All new tools should be designed as if EventPilot is the master system — not a satellite.

---

## 2. Live URL & Deployment

| Item | Detail |
|---|---|
| Production URL | https://eventpilot.tresconglobal.com |
| Hosting | Railway (auto-deploys from GitHub main branch) |
| DNS layer | Cloudflare Worker proxies the custom domain to Railway |
| Supabase project | yuyxfxoevztugtfgduks (PostgreSQL) |

Deploy = `git push origin main`. No CLI commands, no manual steps.

---

## 3. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | **Next.js 16** (App Router) | Breaking changes from Next.js 13/14 — do not assume old patterns |
| Language | **TypeScript** | Strict typing throughout |
| UI | **React 19** | Server + Client components |
| Database | **Supabase** (PostgreSQL) | `@supabase/supabase-js` v2 |
| AI | **Google Gemini 2.0 Flash** | Course generation, recommendations, chat, content |
| Styling | **Inline styles only** | No Tailwind, no CSS framework. All styles are written as JS objects |
| Font | **Manrope** | Platform-wide, loaded via Google Fonts |
| Auth | Microsoft 365 SSO | `tcs_session` httpOnly cookie (30 days) |
| Email | **Resend** | From `noreply@eventpilot.tresconglobal.com` |
| Dev port | **3000** | Always |

### Critical: Styling Convention

**There is no Tailwind or CSS framework in this project.** All styling is done with inline React style objects. For example:

```tsx
<div style={{ display: 'flex', gap: 12, backgroundColor: '#f9fafb', borderRadius: 8 }}>
```

When writing prompts that describe UI, describe layout and behavior — not class names. Do NOT write Tailwind classes like `flex gap-3 bg-gray-50 rounded-lg` — Durga cannot use them.

### Critical: Next.js App Router

All pages live in the `app/` directory. The project uses the **App Router** (not Pages Router). Key patterns:
- Pages that need interactivity are marked `'use client'` at the top
- Data fetching inside pages is done via `fetch('/api/...')` calls to the app's own API routes
- API routes live in `app/api/[route-name]/route.ts` and export functions like `GET`, `POST`, `PATCH`, `DELETE`

---

## 4. Who Uses the Platform

### Staff Roles

| Role | `job_level` value | Description |
|---|---|---|
| Regular staff | `staff` | All standard employees |
| Team leads | `team_lead` | Direct people managers |
| Department heads | `dept_head` | Head of a department |
| Office heads | `office_head` | Country/office director |
| Super admin | `super_admin` | Madhu (platform owner) |

### Access Roles (permissions system)

Each staff member has an `access_roles` array in the database. Possible values:
- `standard` — default
- `hr` — can access HRMS admin
- `project_manager` — events team access
- `project_director` — senior events access
- `admin` — full platform admin (Durga, Madhu)
- `super_admin` — highest level (Madhu only)

### Toolkit Grants (module-level access)

Specific modules can be granted per person via `tool_grants` JSONB (a free-form
key/value map on `staff_members` — a new tool just needs a new key, no schema
change):
| Module | Grant key |
|---|---|
| Website Builder | `website_builder` |
| Market Intelligence | `intelligence` |
| Brand Studio | `brand_studio` |
| Smart Data | `smart_data` |
| Content Hub | `content` |
| TresAgent | `tresagent` |
| Bespoke Tracker | `bespoke` |
| HR Portal | `hr_portal` |
| Timesheets | `timesheets` |
| Finance Portal | `finance` |
| Commercial P&L | `commercial` |
| Knowledge Base | `knowledge_base` |
| DocuHub | `docuhub` |
| Knowledge Assistant | `knowledge_assistant` |
| SmartExcel | `smart_excel` (base access) / `smart_excel_admin` (admin tier within the tool) |
| Corporate Marketing | `corporate_marketing` (grantable only via the Access Requests flow today — not yet in the `/hr/staff/new`/`/admin/org-chart` toggle lists below) |
| Course Builder | admin-only (no grant key) |
| AI Course Generator | admin-only (no grant key) |

Grants are toggled from `/hr/staff/new` (new staff), `/admin/org-chart`, or
`/admin` → People → staff → Access & Tools. All three keep their own
hand-maintained lists — add a new key to all three when a new tool ships.

**Two-tier access (17 Jul 2026):** some tools additionally have their own
"Settings → Access" page (e.g. `/admin/toolkit/knowledge-base/settings`) where
a tool admin can grant a `user` or `admin` tier directly, without going
through the People module at all — backed by a separate table, `module_access`
(`staff_id` + `module_key` + `tier`), via a generic, reusable
`app/api/module-access/[moduleKey]/*` route trio + a shared
`<AccessTab moduleKey="..." moduleLabel="..." />` component
(`app/components/AccessTab.tsx`). A `module_access` grant (either tier) is
independently sufficient to open the tool — it does not require also being
toggled on in the People module. Every module using the `tool_grant` access
kind can opt into this by adding a `moduleAccessKey` to its entry in
`app/lib/registry/modules.tsx` (see `checkAccess()` in
`app/lib/registry/access.ts`). As of this session: **Knowledge Base,
DocuHub, Knowledge Assistant, Bespoke Tracker, Website Builder, Market
Intelligence, Brand Studio, Commercial P&L** all have this. **HR, Finance,
Content, Smart Data** have the Settings→Access UI too, but — deliberately,
for now — a grant there only controls whether the tool's tile shows in the
Toolkit hub, not real route access (those four are gated in `middleware.ts`
by role/department read straight from the session cookie, with no DB call by
design; making a grant there open the real route needs a follow-up decision,
not yet made — see HANDOFF.md "What's Next"). SmartExcel and Corporate
Marketing intentionally do **not** use this system — they predate it and have
their own working, independently-verified auth (see `app/lib/smartexcel/auth.ts`
and `app/lib/corporate-marketing/auth.ts`).

### Departments (current list)

Marketing, Sales, Operations, Finance, HR, Content, Technology, Legal, Executive, Design

### Offices

`dubai`, `bangalore`, `mangalore`, `manipal`

---

## 5. Full Module Map (What Already Exists)

Do not ask Durga to build anything that already exists. Reference this when writing prompts.

### Staff-Facing Pages

| URL | What it does |
|---|---|
| `/dashboard` | Personal dashboard — AIRS score, courses, team view for managers |
| `/profile` | AI Readiness Questionnaire — staff describe their daily tasks for scoring |
| `/chat` | Pilot AI — internal assistant (Gemini-powered) |
| `/community` | Staff post AI prompts, automations, use cases; like/filter |
| `/messages` | Internal DM system — inbox + thread view |
| `/my-hr` | Self-service HR — leave requests, attendance, event tasks |
| `/team` | Manager's view of their team's course progress |
| `/docs` | Platform documentation (20 articles) |
| `/events` | Events listed (for assigned staff) |
| `/data` | Smart Data — lead extraction, enrichment, pipeline, scoring |
| `/content` | Content Hub — AI social campaigns |
| `/hr` | HRMS — full HR management (HR role only) |
| `/knowledge` | Knowledge Base — browse/search ingested company knowledge; `/knowledge/settings` (admin grants), `/knowledge/assistant` (Knowledge Assistant chat, KB/DocuHub pilot members only, 20 msgs/day cap) |
| `/docuhub` | DocuHub — post-event reports, BD proposals, permanent shareable links; `/docuhub/upload`, `/docuhub/bulk`, `/docuhub/settings` |

### Admin Pages

| URL | What it does |
|---|---|
| `/admin` | Main admin dashboard — org stats, reviews, build log, What's Next |
| `/admin/events` | Event management list |
| `/admin/events/[id]` | Single event — tabs for brand, website, market intel, team, P&L, RACI |
| `/admin/events/[id]/brand` | Brand Studio — 9-section brand book builder |
| `/admin/events/[id]/website` | Website Builder — template selection, content editing |
| `/admin/events/[id]/market-intel` | Market Intelligence reports |
| `/admin/events/[id]/details` | Event Details (11 Aug 2026) — public-facing name/dates/venue/links/socials (separate from the internal HR-synced name), per-form-type "Public Onboarding Pages" links, and the Topline Messaging Doc (PDF upload → draft → chat-review → Approve gate). Every field change is logged (`event_details_field_changes`) |
| `/admin/events/[id]/stakeholders` | Stakeholder Hub — speaker/sponsor/partner onboarding, RBAC-gated (`sae.*` permission keys). Forms are managed in HubSpot, not built in-app — see `.../stakeholders/hubspot-form/[formType]` to connect a form and map its fields |
| `/admin/toolkit` | Full toolkit — every tool as a card, gated by `tool_grants` (see §4) |
| `/admin/courses` | Course Builder — create/edit/publish courses |
| `/admin/templates` | Manage microsite templates |
| `/admin/sites` | Published event microsites |
| `/admin/org-chart` | Org chart — directory + hierarchy + tool grant toggles |
| `/admin/reviews` | Staff review/feedback triage |
| `/admin/bespoke` | Bespoke Tracker — client brief to invoice, 53-task SOP |
| `/hr` | HR Portal — staff directory, recruitment, leave, attendance, onboarding |
| `/timesheets` | Daily time logging + manager approval |
| `/finance` | Finance Portal — salary, expense claims, vendor payments, payroll |
| `/admin/commercial` | Commercial P&L — revenue, costs, executive dashboard |
| `/pilots` | Pilot Projects — SME/Co-Pilot/Tracker view of active builds (see §17) |
| `/admin/pilots` | Pilot Projects — admin view, all projects/members/checklists |
| `/admin/pilots/new` | Create/edit a Pilot Project (members, roles, checklist, tool grants) |

---

## 6. Database Tables Reference

These tables already exist. Any new tool should use them where relevant, or add new tables via SQL migrations.

| Table | Key fields | Purpose |
|---|---|---|
| `staff_members` | id, name, email, department, office_id, job_level, access_roles, tool_grants | Every Trescon employee |
| `staff_task_profiles` | staff_id, task_name, task_description, tools_used, ai_readiness | AIRS assessment responses |
| `courses` | title, tier_level, dept_tags, is_mandatory, status | AI learning courses |
| `course_completions` | staff_id, course_id, test_score, passed | Passed course assessments |
| `events` | name, type, status, event_date, venue, city, client_name | Company events |
| `event_staff` | event_id, staff_id, role | Staff assignments to events |
| `notifications` | staff_id, type, title, body, read | In-app bell notifications |
| `messages` | from_id, to_id, body, read | Internal DMs |
| `documents` | title, type, extracted_text, visibility | Knowledge base uploads |
| `platform_docs` | slug, category, title, content | Platform help articles |
| `community_posts` | author_id, category, body, tool_name, likes | Community posts |
| `platform_reviews` | staff_id, severity, body, screenshot_url, status | Staff feedback/bug reports |
| `build_log_enriched` | sha, title, bullets, author_name, pushed_at | Auto-generated build log |

New tables should be named descriptively (e.g., `corporate_marketing_campaigns`, `bespoke_event_briefs`) and added via a `.sql` migration file.

---

## 7. API Route Conventions

All backend logic is in `app/api/[name]/route.ts`. These are Next.js Route Handlers.

```typescript
// Standard pattern for every API route
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  // ... fetch from supabase, return NextResponse.json(...)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  // ... insert/update, return NextResponse.json(...)
}
```

**Session reading pattern** (how to check who is logged in):

```typescript
import { getSession } from '@/app/lib/session'

const session = await getSession(req)
if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
// session.sid = staff_members.id
// session.adm = true if admin
// session.dept = department
// session.jl = job_level
```

---

## 8. UI / Design Conventions

Describing these precisely will help your AI tool generate prompts that produce consistent, on-brand results.

### Color Palette — dark navy/teal theme (17 Jul 2026 — full replacement of the previous light theme)

**Never hardcode a hex color for ink/surface/border/family purposes.** Every internal page now uses CSS custom properties defined once in `app/globals.css`'s `:root` block — even though components still write plain inline `style={{}}` objects (there's still no Tailwind/CSS framework), the *values* inside those objects should be `var(--token)` strings, not literal hex. This is the single centralization point for the whole app's branding — a future rebrand changes `globals.css` only.

| Token | Value | Used for |
|---|---|---|
| `--surface` | `#0A121A` | Page background |
| `--card` | `#142330` | Card/panel background |
| `--card-hi` | `#1B2C3B` | Hovered/active card state |
| `--sidebar-bg` | `#101C27` | Persistent sidebar background (one step lighter than page bg) |
| `--ink` / `--ink2` / `--ink3` / `--ink4` | near-white → muted | Body text by importance (`--ink` = primary/headings, `--ink4` = de-emphasized icons/badges only — never body text, it fails contrast) |
| `--border` / `--border-light` | translucent white | Card/input borders |
| `--teal` / `--teal-mid` / `--teal-dark` | `#0EA79D` / `#12C9BD` / `#0B8079` | Primary brand color, buttons, active states |
| `--lime` | `#C0F43C` | Secondary accent — success/positive/CTA highlight |
| `--indigo` / `--purple` / `--amber` / `--red` / `--orange` | brand family colors | Categorical/status colors |
| `--success` / `--warning` / `--danger` / `--info` | semantic aliases | `--warning` = `--amber`, `--danger` = `--red` |

Every family also has a `-light` variant (e.g. `--teal-light`, `--red-light`) and most have a `-border` variant — these exist for **one specific purpose each**, documented as a 3-rule convention directly in `globals.css` (read that comment block before styling anything new):
1. Body/UI text on a plain surface → the ink scale, by importance.
2. Text on a family's own `-light` tint (badges, alerts) → that family's bright/main value, never `--ink`.
3. Text on a SOLID saturated brand button/badge fill → that family's `-light` token (or `-dark` for lime) — **never white**. White-on-brand-color fails WCAG AA across this entire palette (measured 2–3:1 uniformly); each `-light`/`-dark` value was specifically chosen to double as legible button text.

### Common UI Patterns

- **Cards**: `background: 'var(--card)'`, `border: '1px solid var(--border)'`, `borderRadius: 12`, padding 24px — no drop shadow on plain cards (dark-on-dark), use `var(--shadow-sm)`/`var(--shadow-md)` only where real elevation is needed
- **Tables**: header row in `var(--card-hi)`, `border: '1px solid var(--border)'`
- **Buttons (primary)**: `background: 'var(--teal-mid)'`, `color: 'var(--teal-light)'` (per rule 3 above — not white), `borderRadius: 8`, `padding: '10px 20px'`
- **Buttons (outline)**: `border: '1px solid var(--border)'`, `background: 'var(--card)'`, `color: 'var(--ink3)'`
- **Status badges**: pill-shaped, tint background + bright text of the same family, e.g. `{ background: 'var(--success-light)', color: 'var(--success)', borderRadius: 999, padding: '2px 10px', fontSize: 12 }`
- **Forms**: labels above inputs, `border: '1px solid var(--border)'`, `borderRadius: 8`, `padding: '10px 14px'`, placeholder text `var(--ink3)`
- **Section headers**: `fontSize: 18, fontWeight: 600, color: 'var(--ink)'` with a `var(--border)` separator below
- **No modals for primary flows** — prefer inline panels or separate pages

**Explicitly out of this theme** (still their own separate styling, don't migrate): `app/smartexcel/**` (Tailwind arbitrary-value classes, ported independently), `app/events/[slug]/**` (public event microsites — tenant/data-driven themed via `event.theme_primary` etc., not this app's own chrome).

### Existing Shared Components

| Component | File | What it does |
|---|---|---|
| `GlobalShell` | `app/components/GlobalShell.tsx` | Persistent top shell (logo, breadcrumb strip, quick-access, Help/Sound/Profile) — rendered once above every authenticated page by `AuthedShellGate` in the root layout. **A new page never renders this itself and never unmounts/remounts it** — just build page content; the shell is already there. |
| `PageHeader` | `app/components/PageHeader.tsx` | The page-level title/description/actions row every new page should render at its own top — `<PageHeader title="..." description="..." actions={<button/>} />`. Replaces the old per-page `AppShellNav`/`NavBar` top bar convention entirely — do not add a new page-owned logo, back-link, or nav bar; `GlobalShell` + the breadcrumb already cover that. |
| `ModuleSidebar` | `app/components/ModuleSidebar.tsx` | Optional persistent left sidebar for a module with 2+ sub-pages (Finance, HR, Knowledge Base, DocuHub, Smart Data are the reference implementations) — add a `layout.tsx` for the module rendering `<ModuleSidebar groups={...}>{children}</ModuleSidebar>` alongside a flex wrapper. Skip this for a single-page tool. |
| `PlatformMenu` | `app/components/PlatformMenu.tsx` | Slide-in full-platform navigation — grid-icon trigger, derives its tile list from the module registry (`app/lib/registry/modules.tsx`) + `GET /api/modules/accessible`, not a hardcoded list. Rendered once inside `GlobalShell` — don't add another. |
| `ReviewWidget` | `app/components/ReviewWidget.tsx` | Floating "Report Issue" trigger, opened from the Help menu in `GlobalShell` (not its own floating button anymore) |
| `NavBar` / `AppShellNav` | `app/components/NavBar.tsx` / `AppShell.tsx` | **Retired as of the 15–16 Jul 2026 nav overhaul** — every page that used to render one of these now renders `PageHeader` instead. Don't use either in a new page; they're kept only because a couple of exported pieces (`HelpMenu`, `SoundToggle`, `ProfileMenu`) are reused by `GlobalShell` itself. |

Do not rebuild navigation from scratch, and do not hand-maintain a new list of "what modules exist" anywhere — add the module to `app/lib/registry/modules.tsx` once and every surface (PlatformMenu, Toolkit hub, page badges, breadcrumbs) picks it up automatically. Breadcrumbs (`app/lib/nav/breadcrumbs.ts`) are derived purely from the registry + current URL — a static `href` needs no extra work; a page whose path includes a dynamic segment your registry entry can't express as its own `href` (an event-scoped tool, for example) needs `breadcrumbPattern` (a `/path/:param` template) + `breadcrumbParent` (the ancestor registry key) on its `ModuleDef` entry instead.

**Module registry & access control** (`app/lib/registry/`): `modules.tsx` is the single source of truth for every module's key/label/icon/color/href/access rule — read it before assuming a module doesn't exist or building a new nav list. `access.ts` (server-only) exposes `requireModuleAccess(moduleKey)` — call this at the top of a `layout.tsx` for any page that should be gated server-side; client-side-only tile hiding is not sufficient (this was a real production security gap, closed 14 Jul 2026).

---

## 9. How New Micro-Tools Are Built

Every new tool Durga builds follows this pattern:

### File Structure for a New Tool

```
app/
  [tool-name]/
    page.tsx          ← main UI page (often 'use client')
    layout.tsx        ← optional: sidebar layout if the tool has sub-sections

app/api/
  [tool-name]/
    route.ts          ← GET + POST (main data)
  [tool-name]/[id]/
    route.ts          ← PATCH + DELETE for individual records

supabase/
  [tool-name]_migration.sql   ← SQL to create any new tables
```

### Durga's Workflow

1. You give Durga a prompt describing what to build
2. Durga pastes it into Claude Code on his system
3. Claude Code writes the code
4. Durga runs the SQL migration in Supabase
5. Durga pushes to `main` → Railway auto-deploys

So when you write a prompt for Durga, structure it so **Claude Code** can act on it directly. Claude Code is a code-writing AI — it needs specific, unambiguous instructions.

---

## 10. How to Write a Good Prompt for Durga

### For a Full New Tool (PRD-style)

Structure your prompt with these sections:

```
## Tool Name
[Name of the tool and its URL path, e.g., /admin/corporate-marketing]

## Purpose
[One paragraph: what problem does this solve? Who uses it?]

## Who Can Access This
[Which staff roles / job levels / tool grants can see this]

## Pages / Sections
[List each screen or tab with what it shows and what the user can do]

## Data It Needs
[What data does it create, read, update, delete?
If new database tables are needed, describe the fields]

## Key Behaviors
[Specific logic, rules, validations, or workflows the tool must follow]

## UI Notes
[Layout description — sidebar? tabs? table? form? 
Describe structure, not class names]

## What It Should NOT Do
[Scope limits — what to exclude from v1]
```

### For a Change or Bug Fix (during active development)

```
## What's Wrong / What Needs to Change
[Describe the specific behavior that is wrong or the thing that needs to be added]

## File / Page It's On
[The URL of the page or section, e.g., "the Brand Studio tab in /admin/events/[id]/brand"]

## What It Should Do Instead
[The correct behavior]

## Edge Cases
[Any special conditions or exceptions to handle]
```

### For a Minor UI Change

```
On the [page name] page at [URL], [specific element] currently [current behavior].
Change it to [desired behavior].
[Any design specifics — color, position, size, label text]
```

---

## 11. What NOT to Include in Prompts

These things will confuse Claude Code or create broken code:

- **Tailwind class names** — there is no Tailwind in this project. Describe layout and color values instead.
- **Redux, Context API, or global state** — this app uses local component state and direct API calls. No state management libraries.
- **"Use a database ORM like Prisma"** — the project uses the Supabase JS client directly.
- **"Add to the Prisma schema"** — no Prisma. Database changes are raw SQL in a `.sql` file.
- **"Use Next.js Pages Router"** — the project uses App Router (`app/` directory). Pages Router patterns (`getServerSideProps`, etc.) do not apply.
- **"Create a new component library"** — use inline styles consistent with the rest of the app.
- **Third-party UI libraries (MUI, shadcn, Radix, etc.)** — not installed. Do not reference them.

---

## 12. AI in the Platform

The app uses **Google Gemini 2.0 Flash** (not OpenAI/ChatGPT). When your tool needs AI capabilities:

- **Text generation / summarisation**: Gemini via `@google/generative-ai`
- **Course generation**: Already exists at `/api/generate-course`
- **Image generation**: Imagen 3 via Gemini (used in Brand Studio)
- **PDF text extraction**: `pdf-parse` library

When describing AI features in your prompt, specify:
- What input the user provides
- What AI generates from it
- Where the result is displayed or stored

---

## 13. Existing Integrations

| Service | What it does | API key location |
|---|---|---|
| Microsoft Entra ID | Staff SSO login | Railway env vars |
| Supabase | Database + file storage | Railway env vars |
| Google Gemini | AI features | `GEMINI_API_KEY` in Railway |
| Resend | Transactional email | `RESEND_API_KEY` in Railway |
| Apollo | Lead enrichment (email guesser, lead finder) | `APOLLO_API_KEY` in Railway |
| Lusha | LinkedIn enrichment | `LUSHA_API_KEY` in Railway |
| Million Verifier | Email verification | `MILLION_VERIFIER_API_KEY` in Railway |
| Firecrawl | Web scraping for leads | `FIRECRAWL_API_KEY` in Railway |

---

## 14. Things the Platform Does Not Have (yet)

These are intentional gaps — do not tell Claude Code to integrate them:

- Real-time / WebSocket connections (polling is used where needed)
- Role-based column-level permissions in Supabase (RLS is not enabled — all access is via the service role key from the server, with session checks in API routes)
- Native mobile app
- Multi-tenancy (it is single-org only — Trescon)
- Payment processing

---

## 15. Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| Database tables | `snake_case` | `corporate_marketing_campaigns` |
| Database columns | `snake_case` | `created_at`, `staff_id` |
| API route files | `route.ts` inside a named folder | `app/api/marketing/route.ts` |
| Page files | `page.tsx` inside a named folder | `app/admin/marketing/page.tsx` |
| React components | `PascalCase` | `CampaignCard`, `BriefForm` |
| Variables / functions | `camelCase` | `handleSubmit`, `campaignData` |
| UUID primary keys | `id` (uuid) | Standard Supabase pattern |
| Foreign keys | `<table>_id` | `staff_id`, `event_id` |
| Timestamps | `created_at`, `updated_at` | Always `timestamp with time zone` |
| Soft delete | `is_active boolean DEFAULT true` | Filter with `WHERE is_active = true` |

---

## 16. Important Context About Trescon

- **Trescon** is a B2B events company that runs conferences, summits, and forums globally
- **Events** are the core business unit. Most tools relate to planning, promoting, or executing events
- **"Bespoke events"** = custom events built for specific clients (not Trescon's own IP events)
- **Staff** use the platform to manage their work — not attendees or external clients
- The four offices (Dubai, Bangalore, Mangalore, Manipal) have different roles: Dubai = leadership/sales, Bangalore + Mangalore + Manipal = operations/delivery
- **"AIRS"** = AI Readiness Score — a 0–100 score per staff member measuring AI skill and adoption

---

## 17. Pilot Projects — How SME-Led Builds Actually Work

This is the process this very document exists to support. A **Pilot Project**
is a scoped tool build owned by an SME (you), coded by a builder, tracked by
someone else. It's tracked as real data in EventPilot itself, not a side
spreadsheet.

**Roles** (`pilot_project_members.role_label`, free-text — new roles are just
a label + a hex color, no code change needed; `ROLE_PRESETS` in
`/admin/pilots/new` currently offers six as one-click presets, any other label
is still just a "Custom…" entry away):
- **Pilot** — the SME who owns the PRD/direction (you, usually)
- **Co-Pilot** — a second SME/tester on the same project
- **Consulting** — advisory input, not day-to-day ownership
- **Tracking** — tracks progress/checklist across the project, doesn't necessarily use the tool itself
- **Collaborator** — looped in on relevant decisions and asked for input as the project progresses, without owning a specific slice of it
- **Builder** — who actually codes it. **Not always Durga** — `pilot_projects.builder_id` is per-project (its own dropdown on the New Pilot Project form, separate from adding someone as a "Builder" member — most projects do both). Whoever submits a Build Request (see below) for that project, the alert email goes to that project's builder specifically.

**Build Requests** (`/pilots` or `/admin/pilots`, "🔧 Build Requests" tab): the
in-app way to ask your project's builder for something, with file attachments
and a reply thread — not a side Slack/email conversation. Submitting one emails
the project's builder directly.

**Checklist**: each member gets their own tick-off checklist (prerequisite /
scope_decision / content_prep / coordination categories), visible on `/pilots`.

---

## 18. Tools Living Outside the Main Next.js App

Not every tool has to be a Next.js route in this repo. If what you're
proposing needs a fundamentally different stack (its own database, a
non-Next.js framework, background job processing Next.js/Vercel-style
functions can't do), it can still live **inside this same GitHub repo**, just
in its own subdirectory with its own toolchain.

**`tools/smartexcel/` used to be the reference example of this pattern**
(TanStack Start + Vite + Cloudflare Workers, its own Neon Postgres) — as of
04 Jul 2026 it was **fully ported into native Next.js code** at
`app/smartexcel/` + `app/api/smartexcel/` + `app/lib/smartexcel/`, because
even with the SSO bridge and domain-uniformity proxy below, it never actually
shared EventPilot's layout/nav — it was still a different origin server
underneath, just hidden behind a proxy. Read §19 below before reaching for
this pattern; it's now the cautionary tale, not the template. The cutover is
fully live: `eventpilot-proxy` no longer forwards `/smartexcel/*` anywhere
special (verified against the real domain), the old SSO bridge is deleted,
and the database was consolidated into EventPilot's own Supabase Postgres
(dedicated `smartexcel` schema) rather than kept on the separate Neon DB.
`tools/smartexcel/` (the old TanStack Start source) and its Cloudflare
Pages/Workers deploy are now fully orphaned — nothing references them — and
can be deleted whenever. **The Python worker (Railway, separate project) was
unaffected by any of this**, since it was always called over plain HTTP with
a bearer secret, no framework coupling — only its `APP_CALLBACK_URL` env var
changed, to point at EventPilot's domain instead of the old dead worker.

**The pattern itself is still valid** for a tool whose stack genuinely can't
be Next.js (e.g. it needs Python data libs Node can't run — that's why
SmartExcel's own heavy processing stays a separate Python/FastAPI worker even
after the frontend went native). What stays consistent when you do reach for
it:
- **No separate GitHub repo, no separate handoff doc.** One repo, one
  `HANDOFF.md`. The subdirectory can have its own `CLAUDE.md` for stack-specific
  detail (commands, env vars) — same pattern as any nested `CLAUDE.md`.
- **Login is still EventPilot's, never a second password system.** Historically
  this meant an "SSO bridge" (a signed-token handoff into the other app's own
  session) — but if the tool is later ported native, that whole bridge
  disappears in favor of just reading EventPilot's own session cookie
  directly (see §19).
- **Still shows up as a normal Toolkit card**, gated by a `tool_grants` key
  like every other tool (see §4) — the person using it never needs to know
  it's a different framework under the hood.
- **Same domain too, not just same login**, via `eventpilot-proxy`, the one
  Cloudflare Worker that fronts all of `eventpilot.tresconglobal.com`.
  Touching `eventpilot-proxy` is the **one thing in this whole platform that
  needs Durga's explicit sign-off before Claude Code touches it** — it's a
  single Worker serving every staff member, not just users of your tool. See
  `infra/eventpilot-proxy/README.md` for how it's deployed and how to add
  another tool's route to it. Don't assume this happens automatically for a
  new tool — it's a deliberate extra step, ask for it if you want it.
- If the root `tsconfig.json`/`eslint.config.mjs` glob the whole repo (they
  do), the subdirectory needs to be added to both `exclude`/`globalIgnores` so
  its toolchain doesn't collide with the Next.js build.

If your tool can reasonably be a Next.js route instead (most can — see §9),
prefer that. This pattern is for when the stack genuinely can't be Next.js —
and even then, plan for it to feel bolted-on until/unless it's later ported
native, same as SmartExcel was.

---

## 19. Porting an Outside-the-App Tool to Native Next.js

If a tool built under §18 needs to stop feeling like a different app (no
shared nav, a visible domain switch, or — as with SmartExcel on 04 Jul 2026 —
a same-domain proxy that still didn't share layout because it was a different
origin server underneath), here's what actually moves and what doesn't:

- **The database usually doesn't move.** SmartExcel kept its own separate
  Neon Postgres (via `drizzle-orm`) — no reason to migrate rows into Supabase
  just because the frontend moved. Next.js server code can query any Postgres
  directly regardless of host (Railway, Cloudflare, wherever).
- **A non-Next.js-compatible piece (e.g. Python data processing) stays put.**
  SmartExcel's Python/FastAPI worker (R2 file processing via pandas) was
  never coupled to the frontend framework — it's called over plain HTTP with
  a bearer secret, so porting the frontend didn't touch it at all.
- **The SSO bridge disappears entirely, not just gets simplified.** Once the
  tool's pages are literally inside EventPilot's own Next.js app, there's no
  second origin to hand a signed token to — every request just reads
  EventPilot's own session cookie (`tcs_session`) directly and syncs/loads the
  tool's own `users` row by email on demand. This deletes an entire class of
  moving parts: the signed-token minting route, the shared HMAC secret, the
  tool's own session table/cookie.
- **The Toolkit card href becomes a plain internal path** (e.g.
  `/smartexcel/jobs`), not a launch-route redirect — same as every other
  native tool, no `target="_blank"` special-casing needed.
- **The old proxy branch in `eventpilot-proxy` needs removing once verified**,
  so requests fall through to Railway/Next.js instead of being forwarded to
  the old separately-deployed frontend. This is a shared-Worker-routing
  change — still needs Durga's sign-off, same rule as §18.
- **Decommission order matters**: keep the old bridge/route (SSO launch
  route, old Cloudflare Worker deploy) in place until the native routes are
  live-verified against real production secrets (DB URL, API keys) — don't
  delete the fallback before confirming the replacement actually works.

---

## 20. Template for Sharing with Your AI Tool

When you open ChatGPT or Gemini to generate a prompt for Durga, paste this as the first message:

```
I am a subject matter expert helping build a feature for EventPilot — Trescon's internal staff platform. 
The full platform context is below. Use it to help me write precise, implementable prompts that Durga 
(our developer) can give directly to Claude Code (an AI coding assistant) to build the feature.

[PASTE THE FULL CONTENTS OF THIS FILE HERE]

Now help me write a prompt for: [describe what you want to build]
```

---

*Last updated: 13 Jul 2026 — Pilot Projects (§17) role model extended with Collaborator preset and a dedicated Project Builder field, separate from the Builder member role*
*Previously updated: 03 Jul 2026 (evening) — added Pilot Projects (§17) and the tools-outside-the-main-app pattern (§18, now covering domain-uniformity via eventpilot-proxy), refreshed the Toolkit grants + module map for everything shipped since June*
*For questions about the platform, contact Madhu (md@tresconglobal.com) or Durga (dc@tresconglobal.com)*
