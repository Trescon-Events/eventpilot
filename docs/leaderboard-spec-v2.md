# Leaderboard v2 — Percentile-based Learning Leaderboard

**From:** Durga
**To:** Madhu
**Date:** 02 Jul 2026

Madhu — pivoting the weekly leaderboard from the rank-and-tier model we spec'd on 01 Jul to a **Mi Watch / Strava-style percentile model**. Crisp spec below.

---

## Why the change

Rank numbers ("you're #47") demotivate anyone outside the top 10. Fixed tier thresholds (Learner, Explorer, Champion, etc.) are arbitrary and hard to defend. **Percentile framing** ("you're in the top 25%, and ahead of 82% of your office") is universally positive and self-scales as we grow.

Scope stays **course-completions only** — tool usage, contributions, collaboration all move to the fortnightly Trescon Digest newsletter instead. One metric, one message.

---

## The personal card

What every staffer sees in their weekly email and on `/leaderboard`:

```
Hi Fouzan,

🎯 You're in the top 25% of Trescon this week
   for AI course completions

📈 You learned more than 82% of Bangalore office
📊 You learned more than 71% of Marketing dept
🔥 4-week streak — longer than 91% of the company

Try next: "Prompt Engineering Fundamentals" (22 min)
```

**3–4 comparative percentile signals**, computed against peer groups:
- Trescon-wide (headline)
- Your office
- Your department
- Your tenure cohort (0–6 months, 6–24 months, 2+ years)

Everyone finds at least one lens where they win. New joiners get "top X% of new joiners" — instant wins to hook them in.

---

## The public leaderboard

**Only two things public:**

1. **Top 10 of the week** — by score. One moment of glory, drives Monday-morning drama
2. **Office standings** — average score per active learner, ranked. Dubai vs Bangalore vs Mangalore vs Manipal

Ranks 11+ are private (only you see your personal rank on your card). No public shame.

---

## Scoring

Same as before — course-based, no changes:

| Signal | Points |
|---|---|
| Base — completed course | +100 |
| Test score ≥ 90 | +30 |
| First-attempt pass | +20 |
| Adoption course tier bonus | +25 |
| Advanced course tier bonus | +50 |

**Weekly cap: 400 pts.** Prevents grinding.

Percentiles are computed off the **cumulative learning score** (everyone's since-day-one total), not weekly points. So a strong learner who takes a week off stays in a high percentile — they don't lose ground for real life.

---

## Streaks

- Consecutive weeks with ≥1 completion
- **2 auto-freezes per quarter** — miss a week, streak stays. Silent, no user action, no UI
- If both freezes are burned, next miss breaks the streak

---

## Anti-fake — 5 layers (all confirmed)

Course completions and tests get validated across five checkpoints. Layers 1–3 are silent + automatic; Layer 4 is a quarterly ask; Layer 5 is admin spot-check.

| # | Layer | Catches |
|---|---|---|
| 1 | Minimum 60% of stated course duration, focused-tab only | Clickers, background players |
| 2 | Randomized tests (question bank, answer order, no back-nav, time limit) | Answer sharing, googling |
| 3 | Trust score per completion (3+ flags = doesn't count for leaderboard) | Suspicious patterns, grinding |
| 4 | Manager attestation for Champion + Master tier learners, quarterly | Fake tier claims without real work |
| 5 | Weekly random spot-audit of 1 top-10 completion | Anything that slips 1–4 |

**Layer 3 trust flags:**
- Course completed in <60% of stated duration
- Test completed in <30 sec/question
- Perfect + first-attempt + fastest-quintile combo
- Tab blurred >50% of course duration
- Test attempted at unusual hour

**Layer 4 UX:** manager sees a quarterly prompt in their admin dashboard listing their Champion/Master reports with one question: "Have you observed [name] applying AI learnings from Event Pilot in their actual work?" One-click yes/no per report. Two "no" quarters in a row = tier reverts to Adopter.

**Layer 5 UX:** every Monday, the system picks 1 random completion from the previous week's top 10. Surfaces in `/admin/leaderboard-audit` for review. ~5 min per audit, ~4/month for you or me.

---

## What we need to build

**Data model** — extend `weekly_leaderboard_snapshots`:
```
cumulative_score      INTEGER
percentile_trescon    INTEGER (0-100)
percentile_office     INTEGER
percentile_dept       INTEGER
percentile_cohort     INTEGER
streak_weeks          INTEGER
streak_freezes_used   INTEGER (per quarter)
trust_flags_json      JSONB (per completion)
```

**New tables:**
- `manager_attestations` — (id, manager_id, staff_id, quarter, attested, attested_at)
- `leaderboard_audits` — (id, completion_id, audited_by, verdict, notes, audited_at)

**Course engagement tracking:**
- Frontend: heartbeat every 15 sec while tab focused, POST to `/api/course-engagement`
- Backend: aggregate focused-time per staff per course completion

**Test integrity:**
- Randomize question order + answer order server-side per attempt
- Question bank with `courses.question_bank_json` (draws N per attempt)
- Server-side time limit enforcement

**Admin surfaces:**
- `/admin/leaderboard-audit` — weekly spot-audit queue
- `/admin/manager-attestations` — quarterly attestation dashboard

**Percentile computation:**
- Nightly cron regenerates percentile columns (fresh cohort math as new staff join)

---

## Rollout — 3 phases

### Phase 0 — This week (unblock)
- Get `CRON_SECRET` set on Railway + GitHub Actions (blocker from 01 Jul)
- Fix name-join bug on `/leaderboard` so seeded row shows names not UUIDs

### Phase 1 — Mon 06 Jul (v1 simple fires, buys us a week)
- Simple weekly leaderboard fires as already coded
- Frame it as "v1, percentile version coming next Monday"

### Phase 2 — Mon 13 Jul (percentile v2 lands)
- Personal card with 4 percentile signals + streak
- Top 10 strip + office standings
- Layers 1–3 anti-fake automatic
- Streak freeze mechanic

### Phase 3 — Aug (integrity layer completes)
- Manager attestation dashboard + quarterly workflow
- Admin spot-audit queue
- LinkedIn-shareable card for Adopter+ tier

**Total build: ~4–5 days focused work.** Most is on the engagement tracking, question randomization, and percentile computation. Personal card UI is small.

---

## What I want from you

1. **Sanity check the data model** — did I miss anything?
2. **Question bank scope** — do our current courses have big enough banks to randomize 8/30? If not, we need Gemini to generate more per course
3. **Tab-focus tracking on the client** — any Next.js 16 gotchas you've hit with this pattern before?
4. **Manager attestation workflow** — feels heavy or fine as a quarterly click-through?
5. **Ship target** — realistic for Mon 13 Jul percentile v2 launch?

Talk when you have 15 min. — Durga
