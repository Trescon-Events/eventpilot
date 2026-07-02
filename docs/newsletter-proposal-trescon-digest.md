# Trescon Digest — Fortnightly all-staff newsletter

**From:** Durga
**To:** Madhu
**Date:** 02 Jul 2026

Madhu — sharing a proposal I've been shaping for how we communicate with the wider Trescon team on what's happening with Event Pilot and our AI adoption more broadly. Want your read on it before we ship anything.

The core idea: **a fortnightly newsletter from us to all 127 staff across Dubai, Bangalore, Mangalore, and Manipal.** One consistent format, half auto-generated from the platform, half authored by a small rotation of us. Management stays looped in by default because they're on the recipient list like everyone else.

---

## The basics

| Field | Value |
|---|---|
| **Name** | **Trescon Digest** (working name — also considering "The Event Digest") |
| **Cadence** | Every second Friday, 11:00 IST |
| **Sender** | `Trescon Digest <noreply@eventpilot.tresconglobal.com>` |
| **Signed by** | Durga (CAIO) — my voice as the recurring signature |
| **Audience** | All 127 staff, all 4 offices, personalized `firstName` only |
| **Delivery** | **Dual channel:** email (Resend, same pipeline as the Bangalore rollout) + in-app **News Corner** section on Event Pilot itself |

---

## The 7 sections

Each fortnight follows the same 7-section spine so staff know what to expect. Roughly a 5-minute read.

### 🧠 AI This Week *(150-200 words)*

Two blended halves:

- **Inside Trescon** — adoption stats for the fortnight (course completions, first-time logins, offices onboarded), plus one milestone/theme worth calling out
- **Outside Trescon** — 2-3 items from the wider AI world that matter to us as a B2B events company: model releases, industry trends, competitor moves, speakers we should book. Short and opinionated, not just a news dump

This carries my voice implicitly; content can be drafted from platform activity + a scan of AI news, then I edit and approve.

### 🚀 What shipped this fortnight *(2-3 items)*

The new tools/features that went live. One-liner each + one-liner impact. Pulled from HANDOFF.md and commit history — I'll get you a first-pass draft, we finalize.

### 🎯 Events pulse *(2 blocks)*

- **Events we ran:** attendees, sponsors, key wins, one photo/quote
- **Coming up:** what's next in the calendar

Owned by Marketing (Nicholas or Thulasi — need to nominate).

### 📚 Learning corner *(fully auto)*

- Adoption number: "X staff completed Y courses across Z offices this fortnight"
- Top 5 learners (consolidated from the two weekly leaderboards)
- One course spotlight worth trying

Pulls from `course_completions` + `weekly_leaderboard_snapshots`. Once we unblock the `CRON_SECRET` issue for the leaderboard cron, this section writes itself.

### 👥 Faces of Trescon *(rotates every issue)*

- **New joiners this fortnight** — auto-pulled from `staff_members` where `joined_at` is within 14 days. Name, role, office, one line
- **Staff spotlight** — a 5-question interview with one staff member per issue about their AI journey. Rotates across functions: Sales, Ops, Marketing, Branding, HR, Finance, etc. So every function gets a turn over a year

The interview is the manual heart of the newsletter. Nominated by me; ~20 min to write up.

### 🛠 You said, we did *(top 3, fully auto)*

Top 3 platform reviews resolved this fortnight. Pulled from `platform_reviews` where `status='resolved'` and `resolved_at` in the last 14 days. Shows staff their Report Issue feedback is being acted on.

### 🔭 Coming up next *(3 items)*

What's on the build roadmap for the next fortnight. Not commitments — direction signals. Written by me.

---

## Content pipeline — who does what

| Section | Owner | Source | Effort |
|---|---|---|---|
| AI This Week | Durga (I write) | Activity + AI news | ~20 min |
| What shipped | Durga + Claude | HANDOFF.md + commits | ~10 min |
| Events pulse | Nicholas or Thulasi | events table + brief | ~15 min |
| Learning corner | — | leaderboard + completions | **auto** |
| New joiners | — | staff_members.joined_at | **auto** |
| Staff spotlight | Durga to nominate + HR/Marketing to write | 5-Q form | ~20 min |
| You said, we did | — | platform_reviews resolved | **auto** |
| Coming up next | Durga | product roadmap | ~5 min |

**Half auto-generated, half manual. ~70 min per fortnight, split across 3 people.**

---

## What I'd want us to build

This is where I want your read most, Madhu. Rough scope for the infrastructure:

**1. A new table `newsletter_issues`**
```
(id, issue_number, planned_send_at, subject, ai_this_week_md,
 what_shipped_md, events_recap_md, events_upcoming_md,
 leaderboard_snapshot_json, new_joiners_json, spotlight_md,
 resolved_reviews_json, coming_up_md, status, sent_at,
 is_published, published_at, slug)
```

Status lifecycle: `draft` → `ready` → `sending` → `sent`.
`is_published` gates News Corner visibility separately from email send — so we can publish to News Corner without email if useful.
`slug` gives each issue a stable URL (e.g. `/news/2026-07-04-issue-1`).

**2. An admin composer at `/admin/newsletter`**

- List of past issues + a "Compose next issue" button
- Split view: manual sections on the left (edit) + auto sections on the right (pre-populated + refreshable)
- "Preview as email" button that renders the full issue in the branded template
- "Send test to me" button (fires to Durga + Madhu only) before real send
- "Send to all staff" button — gated by a confirmation modal + management CC per the rule I saved

**3. A branded email template** — same look as the Bangalore rollout, plus per-section styling

**4. An auto-populator** — pulls from all the source tables when a new issue is created:
- `computeFortnightAdoption()` — counts completions + first-time users in window
- `getTopLearners(weekStart, weekEnd)` — union of two weekly snapshots
- `getNewJoiners(fortnightStart)` — 14-day rolling window on `joined_at`
- `getResolvedReviews(fortnightStart)` — top 3 by severity + resolved recency

**5. Scheduled cron** — every 2nd Friday at 10:00 IST fires an in-app reminder to Durga to review the pre-populated draft; at 11:00 IST if `status='ready'` it fires the send. Won't send `status='draft'` — guard against silent misfires.

**6. Delivery — dual channel:**
   - **Email** — reuses the Resend infra we already have. Static snapshot at send time.
   - **News Corner on Event Pilot** — a new section at `/news` accessible from the main nav. Every issue gets a permanent URL (`/news/{issue_number}`), rendered from the same `newsletter_issues` row, so if a staffer misses the email or joins later they can browse the archive. Fresh-issue badge on the nav link so people notice new content. Optional per-issue reactions/comments if we want engagement signals.

**7. Publish flow** — "Send to all staff" in the composer becomes "Publish" and does two things atomically:
   - Fires the Resend batch to all 127 staff
   - Sets `is_published=true` so the issue appears in News Corner

We could also expose "Publish to News Corner only" as a checkbox for out-of-band items (announcements between fortnights) where a mass email would be overkill.

Total: probably **3-4 days of focused work** (the News Corner viewing surface adds ~1 day of UI on top of the composer). Most complexity is still in the composer + populator; the News Corner side is mostly a read-view of what the composer already produces.

---

## Sample — how Issue #1 might read (if we shipped this fortnight)

**Subject:** `Trescon Digest #1 — Bangalore is now live, and Prashant leads the leaderboard`

> **🧠 AI This Week**
>
> *Inside Trescon:* Bangalore is now live on Event Pilot — 60 staff got their first-login email this morning. Course completions are up 42 across the last two weeks, with three offices now active. First fortnightly milestone: we've moved from "3 people building it" to "60+ people using it."
>
> *Outside Trescon:*
> - Anthropic released Opus 4.7 with 1M context — meaningful for our brief-drafting tools; already testing in Bespoke Brief
> - A large events competitor rolled out AI-generated agendas last week — worth Marketing taking a look
> - Gartner's new events tech report puts "AI-assisted sponsor matching" in the top 3 industry shifts for 2026 — matches what we're building
>
> **🚀 What shipped this fortnight**
> - Save & Resume across Website Builder + Brand Studio — Khalifat asked, shipped in 48 hours
> - Bespoke Event Tracker unblock — Nicholas can now create projects end-to-end
> - Auto-resolving bug reports — file a Report Issue, get a reply when it's fixed
>
> **🎯 Events pulse** *(Nicholas/Thulasi to fill)*
>
> **📚 Learning corner**
> - This fortnight: 42 completions across 28 staff, 3 offices
> - Top 5 learners: Prashant · Bangalore · 6 | Christine · Dubai · 4 | Fouzan · Bangalore · 4 | Anil · Bangalore · 3 | Shrikanth · Manipal · 3
> - Try this week: "Prompt Engineering Fundamentals" — 22 min
>
> **👥 Faces of Trescon**
> - New joiners: {2 with 1 line each}
> - Staff spotlight — Khalifat (Branding, Bangalore): "The moment Website Builder saved me from redoing the World AI Show landing page from scratch..." → full interview
>
> **🛠 You said, we did**
> - Nicholas: "Bespoke Tracker create is broken" → Fixed `06d9f27`
> - Khalifat: "Add Resume Work sidebar" → Shipped `23fe7d2` + `e775ba1`
> - {a third}
>
> **🔭 Coming up next**
> - Weekly leaderboard emails start firing Monday 06 Jul
> - Market Intel + Bespoke Brief get the Save & Resume treatment
> - Mangalore + Manipal rollout announcement

---

## What I want from you

1. **Sanity check the format** — is the 7-section spine right, or should we cut/add?
2. **Name preference** — Trescon Digest or The Event Digest?
3. **Dual channel — email + News Corner on the platform.** News Corner is a new `/news` section where every issue lives permanently (past archive, staff who joined later can browse). Agree that's the right shape, or would you keep it email-only for Issue #1 and add News Corner in v2?
4. **Build order** — I'm thinking composer + email first (manual send for Issue #1), then News Corner view + automation layers on top for Issue #2+. Agree?
5. **Who owns Events pulse** — do you have a strong view Nicholas vs Thulasi?
6. **The auto-populator scope** — anything you'd add or trim from that helper list?
7. **Ship target** — realistic for us to send Issue #1 by Friday 17 Jul (two fortnights out from today)?

Let's talk when you have 15 minutes. — Durga
