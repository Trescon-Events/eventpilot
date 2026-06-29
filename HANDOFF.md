# EventPilot — Session Handoff

> **Claude Code: Read this file at the start of EVERY session before doing any work.**
> Report its contents to the user when starting, so they know the current state.
> Update this file before every sign-off.

---

## Handoff Protocol

**Before starting work:** Read this file. Tell the user: who last worked, what they did, and what's next.
**Before signing off:** Update the Last Session block, What Was Built, and What's Next. Commit the updated HANDOFF.md.

---

## Last Session

| Field         | Value                                                              |
|---------------|--------------------------------------------------------------------|
| Who           | Durga + Claude Code (Opus 4.6)                                     |
| Date          | 2026-06-29                                                         |
| Handed off to | Madhu / Open                                                       |
| Deployed      | Yes — https://eventpilot.tresconglobal.com (Railway auto-deploy)   |

---

## What Was Built This Session (29 Jun 2026 — Durga)

### Massive session — platform restructure, new modules, UX overhaul, real-time notifications

---

### 1. Bug Fixes (Khalifatur + Thulasi)

**PDF Brand Extraction (Khalifatur Rahman — HIGH):**
- Root cause: Website Builder read `data.colors` (wrong key) instead of `data.color_palette`
- Root cause: No `event_id` passed — full extraction was discarded, never saved to DB
- Root cause: `maxOutputTokens: 8192` too low for large PDFs — bumped to 32768
- Root cause: `thinkingBudget: 0` degraded extraction quality — removed
- Added: code fence stripping, proper JSON parse error handling, 3-min client timeout
- Files: `app/api/events/brand/extract-pdf/route.ts`, `app/api/events/brand/upload-extract/route.ts`, `app/admin/events/[id]/website/page.tsx`, `app/admin/events/[id]/brand/page.tsx`

**Content Images (Thulasi — MEDIUM):**
- Fix was already deployed (shimmer loading + onError fallback). Marked resolved in DB.
- Both reviews marked resolved, notifications sent to staff.

**TypeScript Build Error (CRITICAL):**
- `Record<string, unknown>` type on parsed JSON broke `.find()` and `.filter()` — blocked ALL Railway deploys for hours
- Every commit pushed today failed to deploy until this was fixed
- **Lesson: ALWAYS run `npx next build` locally before pushing**

---

### 2. New Modules Built

**Timesheets (`/timesheets`):**
- Staff logs daily hours per event/project with task type
- 7-day week grid with day cards showing entries
- Manager approval tab with approve/reject
- Feeds into Commercial P&L staff cost calculations
- API: `/api/hr/timesheets` (already existed)

**Salary & Compensation (`/finance/salary`):**
- Select staff → view/add/revise salary records
- Payroll grade selection (8 grades: L1-EX)
- Basic/allowances/deductions breakdown with net salary calc
- **CSV bulk import** — HR uploads CSV with email + salary data, system matches staff
- API: `/api/hr/salary` + `/api/hr/salary/bulk` (new)

**Performance Reviews (`/hr/performance`):**
- Create reviews with 1-5 rating scale + visual rating picker
- KPI score %, strengths, areas to improve, goals
- Status flow: draft → submitted → acknowledged → completed
- Filter by status and period
- API: `/api/hr/performance` (already existed)

**Expense Claims (`/finance/expenses`):**
- Staff submit expense receipts by category (travel, meals, software, etc.)
- Manager approve/reject with rejection reason
- Track by event, filter by status
- Stats: total claims, pending amount, approved amount
- New table: `expense_claims` (SQL run in Supabase)
- API: `/api/hr/expenses` (new)

**Vendor Payments (`/finance/vendors`):**
- Track vendor invoices: pending → approved → paid → overdue
- Category, event, invoice number, due date
- Approve/pay/cancel workflow
- New table: `vendor_payments` (SQL run in Supabase)
- API: `/api/hr/vendor-payments` (new)

**Payroll Summary (`/finance/payroll`):**
- Monthly view: all salaries + expenses by department and staff
- Department breakdown table + staff detail table
- Visual breakdown bar (basic/allowances/deductions)
- API: `/api/hr/payroll-summary` (new)

**Finance Portal (`/finance`):**
- Dashboard with KPIs: monthly payroll, pending expenses, overdue vendors
- Links to all 5 finance modules + Commercial P&L
- Separated from HR — Finance owns salary, expenses, vendors, payroll
- Middleware: `/finance/*` requires admin OR finance role OR Finance dept

**Event Intelligence Brief (`/admin/events/[id]/brief`):**
- Structured 5-section brief per event: Positioning, Messaging, Commercial, Competition, Success Metrics
- Completion percentage auto-calculated on save
- Feeds Content Generator + Pilot AI with event context
- New table: `event_briefs` (SQL run in Supabase)
- API: `/api/events/brief` (new)

---

### 3. AI Tool Wiring

**Content Generator** now reads from `event_briefs` as primary context:
- Elevator pitch, value prop, key themes, messages, tone, tagline, hashtags, differentiators, delegate profile
- Falls back to uploaded documents as secondary source

**Pilot Chat** now answers event questions:
- Loads event briefs for events the staff member is assigned to
- Staff can ask "what is this event about?", "who is our target audience?"
- Expanded system prompt scope to cover event-related questions

---

### 4. Platform Restructure

**Toolkit reorganized into 6 categories with 14 tools:**
- Event Tools (3): Website Builder, Market Intelligence, Brand Studio
- Data & Marketing (2): Smart Data, Content Engine
- Operations (3): Bespoke Tracker, HR Portal, Timesheets
- Finance (2): Finance Portal, Commercial P&L
- Academy (2): AI Course Generator, Course Manager
- AI Agents (1): TresAgent

**Toolkit sidebar redesigned:**
- Dark background (#0F1923) with accent-coloured icons
- Collapsible category dropdowns with chevron arrows
- Tool count badges per category
- Colour-coded category dots

**Admin dashboard tabs cleaned up (9 tabs):**
- Overview, People, Intelligence, Learning Analytics, AI Course Generator, Events, Knowledge Base, Review Queue (super-admin), Security (super-admin)
- Removed duplicate Toolkit tab (already in nav bar)
- Removed Commercial P&L tab (already in Toolkit + PlatformMenu)

**Admin nav bar redesigned:**
- 6 primary items: My Dashboard, Toolkit (highlighted), HR, Finance, Timesheets, Org Chart
- [?] help icon dropdown: Platform Feedback, Platform Updates, Docs
- [avatar] circle with initial: name, role, Sign out
- Green dot for live indicator (was a text label)

**Renames:**
- "Staff Reviews" → "Platform Feedback"
- "What's Next" → "Platform Updates"
- "Leadership Dashboard" → "Admin Dashboard"
- "Learning Lab" → "AI Course Generator"
- "Staff Learning" → "Learning Analytics"
- "Course Builder" → "Course Manager"
- "TRESCON PLATFORM" label removed (redundant with logo)

**HR / Finance separation:**
- HR Portal owns: Staff Directory, Recruitment, Leave, Attendance, Onboarding, Performance
- Finance Portal owns: Salary, Expenses, Vendors, Payroll, Commercial P&L
- Old `/hr/salary`, `/hr/expenses`, `/hr/vendors`, `/hr/payroll` redirect to `/finance/*`

**PLATFORM_TOOLS permissions synced:**
- Added: `timesheets`, `finance` grant keys
- Removed: `finance` (old duplicate of `commercial`)
- Renamed labels to match Toolkit naming

**Event workspace redesigned with RACI phase flow:**
- Phase 1 (Concept): Event Brief + Execution Flow
- Phase 2 (Planning): Planning Board + Commercial P&L + Brand Studio
- Phase 3 (Public Assets): Website Builder + Content Campaigns
- Phase 4 (Execution): Info card — speakers, sponsors, delegates, ops
- Phase 5 (Pre-Event Lock): Info card — 21-day countdown

---

### 5. Real-Time Notifications

**Supabase Realtime + Browser Push + Sound:**
- `RealtimeNotifications` component in app layout — always running
- Subscribes to `notifications` + `messages` tables filtered by staff_id
- Plays subtle two-tone ding (300ms WAV) on new notification/message
- Browser desktop notification popup when tab is not focused
- Dispatches custom events for instant NavBar badge updates
- Polling kept as fallback (60s notifications, 30s messages)
- SQL run: `ALTER PUBLICATION supabase_realtime ADD TABLE notifications, messages`

**Attendance near-real-time sync:**
- New endpoint: `/api/cron/attendance-live` — pulls today+yesterday from HRMS
- Auto-syncs every 5 minutes while attendance page is open
- Rate limited to max 1 sync per 2 minutes
- Daily cron stays as backup

---

### 6. Staff Access Changes

- `dc@tresconglobal.com` — added `super_admin` to access_roles (was admin only)

---

### 7. Database Changes (SQL run in Supabase this session)

- `expense_claims` table — created
- `vendor_payments` table — created
- `event_briefs` table — created
- `ALTER PUBLICATION supabase_realtime ADD TABLE notifications` — run
- `ALTER PUBLICATION supabase_realtime ADD TABLE messages` — run

---

## What's Next

### Pending — Waiting for Madhu

1. **HRMS Supabase access** — old project `smdqljhuwcnfhzezrlbg` is not in Trescon org. Madhu created it under a different account. Need him to either share dashboard access or enable Realtime publication on `attendance_records` table. Once done, upgrade from 5-min polling to instant sync.

2. **Canva integration** — CANVA_CLIENT_ID + CANVA_CLIENT_SECRET need to be added to Railway env vars. Code is deployed and ready.

3. **HR Attendance & Payroll completion plan** — saved in memory (`project_hr_attendance_plan.md`). Durga will discuss with Madhu before building. Key items:
   - Holiday calendar per office (Dubai vs India holidays)
   - LOP (Loss of Pay) auto-calculation
   - Attendance percentage
   - Multi-currency payroll (INR for India, AED for Dubai, USD for P&L reporting)
   - Monthly attendance summary reports
   - Regularisation requests
   - Comp-off earn flow
   - Leave encashment

### Pending — Can build anytime

4. **Salary data upload** — Finance team needs to upload salary CSV for 127 staff at `/finance/salary`
5. **Event Brief adoption** — staff need to start filling briefs for existing events
6. **Timesheet adoption** — staff need to start logging hours daily
7. **Wire Event Brief into Website Builder** — auto-generate website copy from brief
8. **Wire Event Brief into Market Intel** — auto-seed competitor scan targets

---

## Previous Sessions

### 28 Jun 2026 — Durga
Bespoke Tracker full build (3 tables, 3 APIs, 3 pages, 53 auto-generated tasks per project)

### 26 Jun 2026 — Durga
Content Engine upgrades (auto-publish cron, article generation, social analytics, email notifications, drag-drop calendar), Messaging system restored, Dashboard layout fixes, Commercial P&L crash fix

### 25 Jun 2026 — Durga
Commercial Tracker full BRD implementation (8 tables, 15 APIs, Executive Dashboard + Event Workspace)
