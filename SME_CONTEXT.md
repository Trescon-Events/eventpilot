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
| SmartExcel | `smart_excel` (base access) / `smart_excel_admin` (admin tier within the tool) |
| Course Builder | admin-only (no grant key) |
| AI Course Generator | admin-only (no grant key) |

Grants are toggled from `/hr/staff/new` (new staff), `/admin/org-chart`, or
`/admin` → People → staff → Access & Tools. All three keep their own
hand-maintained lists — add a new key to all three when a new tool ships.

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

### Admin Pages

| URL | What it does |
|---|---|
| `/admin` | Main admin dashboard — org stats, reviews, build log, What's Next |
| `/admin/events` | Event management list |
| `/admin/events/[id]` | Single event — tabs for brand, website, market intel, team, P&L, RACI |
| `/admin/events/[id]/brand` | Brand Studio — 9-section brand book builder |
| `/admin/events/[id]/website` | Website Builder — template selection, content editing |
| `/admin/events/[id]/market-intel` | Market Intelligence reports |
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

### Color Palette (most-used)

| Color | Hex | Used for |
|---|---|---|
| Teal / primary | `#0d9488` | Primary buttons, CTAs, active states |
| Dark teal | `#0f766e` | Hover on primary buttons |
| Slate dark | `#0f172a` | Page backgrounds, sidebar |
| Slate mid | `#1e293b` | Card backgrounds in dark sections |
| Light background | `#f8fafc` | Content area backgrounds |
| White | `#ffffff` | Cards, panels |
| Red / danger | `#dc2626` | Delete, error, critical |
| Amber / warning | `#d97706` | Warnings, pending states |
| Green / success | `#16a34a` | Confirmed, complete |
| Gray text | `#6b7280` | Secondary text, labels |
| Dark text | `#111827` | Primary body text |

### Common UI Patterns

- **Split layouts**: Left sidebar (dark, `#0f172a`) + right content area (light, `#f8fafc`)
- **Cards**: White `#ffffff`, `borderRadius: 12`, `boxShadow: '0 1px 3px rgba(0,0,0,0.1)'`, padding 24px
- **Tables**: Striped rows, header in `#f8fafc`, `border: '1px solid #e2e8f0'`
- **Buttons (primary)**: `backgroundColor: '#0d9488'`, `color: '#fff'`, `borderRadius: 8`, `padding: '10px 20px'`
- **Buttons (outline)**: `border: '1px solid #e2e8f0'`, `background: 'white'`, `color: '#374151'`
- **Status badges**: Pill-shaped spans, e.g. `{ background: '#dcfce7', color: '#16a34a', borderRadius: 999, padding: '2px 10px', fontSize: 12 }`
- **Forms**: Labels above inputs, `border: '1px solid #e2e8f0'`, `borderRadius: 8`, `padding: '10px 14px'`
- **Section headers**: `fontSize: 18, fontWeight: 600, color: '#111827'` with a line separator below
- **No modals for primary flows** — prefer inline panels or separate pages

### Existing Shared Components

| Component | File | What it does |
|---|---|---|
| `NavBar` | `app/components/NavBar.tsx` | Top nav with logo, profile menu, notification bell |
| `PlatformMenu` | `app/components/PlatformMenu.tsx` | Slide-in full-platform navigation |
| `ReviewWidget` | `app/components/ReviewWidget.tsx` | Floating "Report Issue" button (bottom-left) |

All pages should include `<NavBar />`. Do not rebuild navigation from scratch.

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
a label + a hex color, no code change needed):
- **Pilot** — the SME who owns the PRD/direction (you, usually)
- **Co-Pilot** — a second SME/tester on the same project
- **Consulting** — advisory input, not day-to-day ownership
- **Tracking** — tracks progress/checklist across the project, doesn't necessarily use the tool itself
- **Builder** — who actually codes it. **Not always Durga** — `pilot_projects.builder_id` is per-project. Whoever submits a Build Request (see below) for that project, the alert email goes to that project's builder specifically.

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
in its own subdirectory with its own toolchain — see `tools/smartexcel/` for
the reference example (TanStack Start + Vite + Cloudflare Workers, its own
Neon Postgres, a separate Python/FastAPI worker for heavy processing).

**What stays consistent even when the stack doesn't:**
- **No separate GitHub repo, no separate handoff doc.** One repo, one
  `HANDOFF.md`. The subdirectory can have its own `CLAUDE.md` for stack-specific
  detail (commands, env vars) — same pattern as any nested `CLAUDE.md`.
- **Login is still EventPilot's, never a second password system.** The tool
  gets an "SSO bridge": a small EventPilot API route (see
  `app/api/tools/smart-excel/launch/route.ts`) checks the person's
  `tool_grants`, mints a short-lived signed token, and redirects into the
  other app's own `/sso`-style receiver route, which creates a local session
  from that token — no signup/login form of its own.
- **Still shows up as a normal Toolkit card**, gated by a `tool_grants` key
  like every other tool (see §4) — the person using it never needs to know
  it's a different framework under the hood.
- **Same domain too, not just same login.** SmartExcel is reachable at
  `eventpilot.tresconglobal.com/smartexcel`, not its own separate domain —
  reverse-proxied through `eventpilot-proxy`, the one Cloudflare Worker that
  fronts all of `eventpilot.tresconglobal.com`. This is a bigger ask than the
  SSO bridge: the tool's own build needs to be base-path-aware (its asset URLs
  and internal navigation have to come out prefixed correctly, e.g. Vite's
  `base` config + a matching router basepath), and touching `eventpilot-proxy`
  is the **one thing in this whole platform that needs Durga's explicit
  sign-off before Claude Code touches it** — it's a single Worker serving
  every staff member, not just users of your tool. See
  `infra/eventpilot-proxy/README.md` for how it's deployed and how to add
  another tool's route to it. Don't assume this happens automatically for a
  new tool — it's a deliberate extra step, ask for it if you want it.
- If the root `tsconfig.json`/`eslint.config.mjs` glob the whole repo (they
  do), the subdirectory needs to be added to both `exclude`/`globalIgnores` so
  its toolchain doesn't collide with the Next.js build.
- Deploy target doesn't have to be Railway — SmartExcel is on Cloudflare
  Workers (web app) + Railway (Python worker, a separate Railway project).
  Whatever fits; it's independent of EventPilot's own `git push origin main` →
  Railway flow.

If your tool can reasonably be a Next.js route instead (most can — see §9),
prefer that. This pattern is for when the stack genuinely can't be Next.js.

---

## 19. Template for Sharing with Your AI Tool

When you open ChatGPT or Gemini to generate a prompt for Durga, paste this as the first message:

```
I am a subject matter expert helping build a feature for EventPilot — Trescon's internal staff platform. 
The full platform context is below. Use it to help me write precise, implementable prompts that Durga 
(our developer) can give directly to Claude Code (an AI coding assistant) to build the feature.

[PASTE THE FULL CONTENTS OF THIS FILE HERE]

Now help me write a prompt for: [describe what you want to build]
```

---

*Last updated: 03 Jul 2026 (evening) — added Pilot Projects (§17) and the tools-outside-the-main-app pattern (§18, now covering domain-uniformity via eventpilot-proxy), refreshed the Toolkit grants + module map for everything shipped since June*
*For questions about the platform, contact Madhu (md@tresconglobal.com) or Durga (dc@tresconglobal.com)*
