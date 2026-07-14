# EventPilot — Complete Platform Document
**Version 2.0 — June 2026**
**Trescon — Internal Event Management & Operations Platform**

---

## 1. What Is EventPilot

EventPilot is Trescon's internal operations platform. It serves all staff across four offices — Dubai, Bangalore, Mangalore, and Manipal — and is the single system of record for event management, HR operations, data & leads, content production, and AI learning.

The platform began as an AI readiness tool but has grown into a full-fledged event management and operations suite. Its modules cover the entire Trescon operating model: planning and running events, managing people, finding and enriching leads, building event websites and brand assets, publishing social content, and tracking AI skill growth across the org.

**Core modules live as of June 2026:**

| Module | Description |
|---|---|
| Events Hub | Create and manage events; RACI, P&L, execution flow, checklists, deals, team assignments |
| HRMS | Attendance, leave, recruitment pipeline, contracts, payroll grades, onboarding wizard |
| My HR | Self-service portal — leave requests, attendance, event tasks for all staff |
| Smart Data | Lead extraction, enrichment (Apollo, Lusha), email verification, contact DB, pipeline kanban |
| Website Builder | Event microsites with template library; brand sync gate; live preview |
| Brand Studio | 9-section brand book builder, AI asset generator (Imagen 3), PDF export |
| Content Hub | AI social campaigns, approval flow, guided templates, Meta publishing queue |
| Course Library | AI learning paths, assessments, completion certificates |
| Community | Staff share AI prompts, use cases, and automations; like/filter system |
| Messaging | Internal DMs between staff; inbox, thread view, read status |
| Knowledge Base | PDF upload → text extraction → Gemini-powered Q&A via Pilot AI |
| Pilot AI | Internal AI assistant — answers questions about the platform, events, policies, and staff profile |
| Admin Dashboard | Full org overview, intelligence reports, staff management, review queue, build log |

EventPilot is designed to eventually absorb HRMS and SmartData entirely — it is the master platform, not a satellite tool.

### The Weekly Loop

The platform runs on a continuous loop:

1. Staff complete the AI Readiness Questionnaire (task survey)
2. The system calculates their AIRS score (AI Readiness Score, 0–100)
3. The recommendation engine assigns a personalised learning path
4. Staff take courses and complete assessments
5. Scores update. The loop continues.

Managers see their team's progress. Admins see the full organisation. Everyone has a personal dashboard.

---

## 2. Technology Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| Framework | Next.js (App Router) | 16.2.4 | Full-stack web application |
| Language | TypeScript | 5.x | Type-safe development |
| Frontend | React | 19.2.4 | UI components |
| Database | Supabase (PostgreSQL) | 2.104.1 | All data storage |
| AI | Google Gemini | 2.0-flash | Course generation, recommendations, chat, imports |
| Auth | bcryptjs | 3.0.x | Password hashing for staff accounts |
| PDF Processing | pdf-parse | 2.4.5 | Text extraction from uploaded documents |
| Styling | Inline styles | — | No CSS framework; full design control |
| Font | Manrope | — | Platform-wide typography |
| Hosting | Railway | — | Production deployment (auto-deploy on push to main) |
| Dev Port | 3000 | — | Local development always |

### Architecture Pattern

- **App Router**: All pages use Next.js App Router (`app/` directory)
- **Server Components**: Data fetching happens server-side via API routes
- **API Routes**: All database operations are server-side only — never exposed to browser
- **Client Components**: UI interaction marked with `'use client'`
- **Course Cache**: In-memory cache for published courses (5-minute TTL, invalidated on publish)
- **Docs Cache**: In-memory cache for platform documentation (10-minute TTL)

---

## 3. Database Schema

All data lives in Supabase (PostgreSQL). Tables below with all fields and relationships.

### `staff_members`
The source of truth for every Trescon employee.

| Field | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| name | text | Full name |
| email | text | Work email (unique) |
| department | text | Department (nullable — triggers picker on first login) |
| role | text | Job title |
| office_id | text | `dubai`, `bangalore`, `mangalore`, `manipal` |
| job_level | text | `staff`, `team_lead`, `dept_head`, `office_head`, `super_admin` |
| manager_id | uuid | Self-referencing FK → another staff_member |
| team | text | Sub-team within department |
| access_enabled | boolean | Phase 1: managers only. Phase 2: all staff |
| password_hash | text | bcrypt hash (per-user, set on import) |
| profile_complete | boolean | Whether questionnaire was submitted |
| has_reports | boolean | Computed at runtime |
| joined_at | timestamp | Account creation timestamp |

### `staff_task_profiles`
Stores every response from the AI Readiness Questionnaire.

| Field | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| staff_id | uuid | FK → staff_members |
| task_name | text | Name of the daily task described |
| task_description | text | Full description of what the task involves |
| tools_used | text[] | Tools currently used for this task |
| time_taken_today | text | How long it takes today |
| ai_time_estimate | text | Estimated time with AI |
| skill_needed | text | Skill gap identified |
| ai_readiness | integer | 1–5 AI readiness rating for this task |
| frequency | text | How often this task is done |
| ai_proof | text | Evidence of AI usage (for advanced track) |
| created_at | timestamp | Submission timestamp |

### `courses`
All platform courses.

| Field | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| title | text | Course title |
| subtitle | text | One-line description |
| tool_name | text | Primary AI tool covered |
| tier_level | text | `foundation`, `adoption`, `advanced` |
| dept_tags | text[] | Departments this course is relevant to |
| is_mandatory | boolean | Required for all staff |
| estimated_minutes | integer | Estimated completion time |
| overview | text | Why this course matters |
| read_content | text | Full markdown reading content |
| task_steps | jsonb | Array of 4 task objects `{step, instruction, tip}` |
| question_bank | jsonb | Array of 10 question objects |
| source | text | `seed`, `gemini` |
| status | text | `draft`, `published` |
| suggested_by_id | uuid | FK → staff_members (course credit) |
| suggested_by_name | text | Name of person who suggested the course |
| suggested_by_role | text | Role of person who suggested the course |
| created_at | timestamp | Creation timestamp |

### `course_completions`
Every passed course assessment.

| Field | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| staff_id | uuid | FK → staff_members |
| course_id | uuid | FK → courses |
| test_score | integer | Score percentage (0–100) |
| passed | boolean | True if score >= 60% |
| attempt_count | integer | Number of attempts taken |
| completed_at | timestamp | When they passed |

### `course_attempts`
Every assessment attempt (pass or fail) — full audit trail.

| Field | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| staff_id | uuid | FK → staff_members |
| course_id | uuid | FK → courses |
| score | integer | Score on this attempt |
| passed | boolean | Whether this attempt passed |
| answers | jsonb | Full answers submitted |
| question_times | integer[] | Time taken per question (seconds) |
| authenticity_flag | boolean | True if attempt flagged as suspicious |
| attempted_at | timestamp | Attempt timestamp |

### `notifications`
In-app notifications for staff.

| Field | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| staff_id | uuid | FK → staff_members |
| type | text | `course_published`, `course_pending` |
| title | text | Notification headline |
| body | text | Full notification text |
| course_id | uuid | FK → courses (optional) |
| read | boolean | Whether it has been dismissed |
| created_at | timestamp | Timestamp |

### `documents`
Company documents uploaded to the Knowledge Base (text only — no files stored).

| Field | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| title | text | Document title |
| type | text | `policy`, `event_brief`, `staff_doc`, `onboarding`, `other` |
| extracted_text | text | Full text extracted from PDF |
| word_count | integer | Number of words |
| visibility | text | `all` (all staff) or `event_only` (assigned event staff) |
| event_id | uuid | FK → events (if event_only) |
| uploaded_by | uuid | FK → staff_members |
| is_active | boolean | Soft delete flag |
| created_at | timestamp | Upload timestamp |

### `events`
Company events managed on the platform.

| Field | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| name | text | Event name |
| type | text | `conference`, `summit`, `forum`, `workshop`, `other` |
| status | text | `planning`, `confirmed`, `live`, `completed` |
| event_date | date | Event date |
| venue | text | Venue name |
| city | text | City |
| client_name | text | Client organisation |
| description | text | Event brief |
| created_at | timestamp | Creation timestamp |

### `event_staff`
Staff assignments to events.

| Field | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| event_id | uuid | FK → events |
| staff_id | uuid | FK → staff_members |
| role | text | Role on this event (optional) |
| assigned_at | timestamp | Assignment timestamp |

### `platform_docs`
Event Pilot's internal knowledge base articles (used by Pilot AI).

| Field | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| slug | text | URL-safe identifier |
| category | text | Section grouping |
| title | text | Article title |
| content | text | Full article content |
| order_index | integer | Display order |
| updated_at | timestamp | Last update |

### `chat_usage`
Daily usage tracking for the Pilot AI chat.

| Field | Type | Description |
|---|---|---|
| staff_id | text | Staff member ID |
| date | date | Calendar date |
| message_count | integer | Messages sent today |
| last_message_at | timestamp | Last message timestamp |

### `office_config`
Office headcount configuration.

| Field | Type | Description |
|---|---|---|
| office_id | text | `dubai`, `bangalore`, `mangalore`, `manipal` |
| total_staff | integer | Target headcount for this office |

### `intelligence_reports`
Weekly AI-generated org intelligence snapshots.

| Field | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| generated_at | timestamp | When generated |
| report | jsonb | Full report data |
| summary | text | Executive summary text |

---

## 4. AIRS Scoring System

AIRS = AI Readiness Score. A number from 0 to 100 representing how embedded AI is in a staff member's daily work.

### Calculation

Each task in the questionnaire gets an AI readiness rating from 1–5:
- 1 = No AI involvement
- 2 = Occasionally aware of AI
- 3 = Sometimes uses AI
- 4 = Regularly uses AI
- 5 = AI fully integrated

Formula applied to the average across all tasks:

```
score = round(((average_rating - 1) / 4) × 65 + 10)
```

This maps the 1–5 scale to a 10–75 range, leaving room at both ends. A score of 10 = pure beginner, 75 = fully integrated across all tasks.

### The Five Tiers

| Tier | Score Range | Learning Track |
|---|---|---|
| AI-Unaware | 0–14 | Foundation |
| AI-Curious | 15–34 | Foundation |
| AI-Aware | 35–54 | Adoption |
| AI-Ready | 55–74 | Advanced |
| AI-Forward | 75–100 | Advanced |

### Tier Colours (Design System)

| Tier | Colour |
|---|---|
| AI-Unaware | #FF6B6B (red) |
| AI-Curious | #FF9F43 (orange) |
| AI-Aware | #F4ED3C (yellow) |
| AI-Ready | #C0F43C (lime) |
| AI-Forward | #00A5A3 (teal) |

---

## 5. Recommendation Engine

Every staff member sees a personalised course list. The engine scores every uncompleted course for each person using five signals.

### Scoring Signals

| Signal | Points | Logic |
|---|---|---|
| Mandatory + not done | +50 | Compliance always comes first |
| Track alignment | +30 | Course tier matches staff learning track |
| Department match | +25 | Course tagged for staff department |
| Foundation gap | +20 | On Adoption/Advanced but <3 foundation courses done |
| Job-level boost | +15 | Team lead+ and course is management/strategy related |

### Penalties

| Condition | Penalty |
|---|---|
| Foundation track user viewing Adoption course | -10 |
| Foundation track user viewing Advanced course | -20 |

### Gemini Enhancement

After rule-based scoring pre-filters the top candidates, the staff profile (name, role, department, AIRS score, task profile, completed courses) is sent to Gemini 2.0 Flash. Gemini returns:
- Top 5 ranked courses
- One personalised sentence reason per course
- Label: `mandatory`, `dept`, `track`, `gap`, `role`, or `ai`

If Gemini fails or times out, the rule-based ranking is used silently as fallback. The dashboard shows instantly — AI recommendations upgrade in the background.

### Output Labels Shown to Staff

- "Required for all staff" (mandatory)
- "Recommended for [department]" (dept match)
- "Next in your Foundation track" (track)
- "Complete your foundation first" (gap)
- "Relevant to your management role" (job level)
- "AI-picked" with italic reason (Gemini personalised)

---

## 6. Course Structure

Every course has five components:

1. **Overview** — Why this matters for the staff member's specific role
2. **Read** — Full course content in markdown (600–1200 words, practical)
3. **Tasks** — 4 real-world steps completed using actual AI tools
4. **Assessment** — 5 multiple-choice questions (personalised by Gemini where possible)
5. **Score** — 60% or above (3/5) to pass and mark complete

### Course Library (20 Courses Live)

**Foundation Track (AI-Unaware / AI-Curious)**
1. ChatGPT for Your Daily Work
2. AI Basics: What It Can and Can't Do
3. Writing with AI: From Blank Page to Final Draft
4. Meeting AI: Recaps, Actions, Follow-ups in Minutes
5. AI for Research: From Hours to Minutes
6. The AI Landscape: Tools, Players, and What's Coming

**Adoption Track (AI-Aware)**
7. Automate Your Biggest Time Drain
8. AI for Email: Write Less, Communicate More
9. Data and Reporting with AI
10. AI for Presentations and Proposals
11. Social Media at Scale with AI
12. AI Brand Strategy: Consistent, Fast, On-Message
13. Process Mapping with AI

**Advanced Track (AI-Ready / AI-Forward)**
14. AI Strategy for Your Team
15. Building Automations That Last
16. AI for Visual Design and Creative Production
17. AI Copywriting: From Brief to Publish

**Department-Specific**
18. AI Copywriting (Marketing / Content)
19. AI Creative Studio (Content & Design)
20. AI for Presentations and Proposals (Sales / Events)

---

## 7. Anti-Cheat System

The platform detects and flags assessment dishonesty without publicly accusing staff.

### How It Works

**Personalised Questions**
When a staff member submits their task work (Step 2 — Tasks), Gemini generates 5 questions specifically from their submission. The questions test understanding of what *they* wrote, making generic AI answers harder to use without doing the actual work.

Fallback: if Gemini fails (quota, error), 5 questions are drawn at random from the 10-question static bank.

**Per-Question Timer**
Each question has a 45-second countdown. A visible SVG circle depletes in real time. When time runs out the question auto-submits. This prevents looking up answers on a second device (not enough time).

**Authenticity Flag**
After submission, the server checks:
- Average time per question < 12 seconds AND score >= 70% = suspicious

If flagged, `authenticity_flag = true` is stored on the `course_attempts` record.

**Graduated Private Response**

| Offense Number | What Staff Sees | Who Can See |
|---|---|---|
| 1st flag | Amber banner: "We noticed this attempt was completed very quickly. We encourage you to revisit the material." | Staff only |
| 2nd flag | Same banner, stronger phrasing | Staff + (manager notified internally in future phase) |
| 3rd+ flag | Amber banner: "This is your third flagged attempt. Your manager has been notified." | Staff — manager will be notified in Phase 2 |

The flag is never shown on the score card publicly. Dignity is preserved while accountability is maintained.

### Pre-Test Popup

Before every assessment, a full-screen overlay appears explaining:
- The test is AI-monitored
- Questions are personalised to the staff member's submission
- Each question has a 45-second time limit
- Multiple devices do not help because questions are unique to them

---

## 8. User Flows

### Staff Member Flow

```
Login → Personal Dashboard
  ↓ (if no questionnaire)
Department Picker (if dept not set)
  ↓
AI Readiness Questionnaire (12–18 questions, dept-tailored)
  ↓
AIRS Score Calculated → Tier Assigned → Track Set
  ↓
Personal Dashboard
  - AIRS Score + Tier Badge
  - Next Up (AI-recommended course)
  - Recommended For You (5 courses with reasons)
  - Courses Completed counter
  - Mandatory Progress bar
  - Daily AI tip
  - Notifications
  - My Events (if assigned)
  - Knowledge Base (accessible docs)
  ↓
Course Player
  Step 1: Overview → Step 2: Read → Step 3: Tasks (4 steps + submission)
  → Pre-test popup → Assessment (5 questions, 45s each, one at a time)
  → Result (pass/fail, score, any authenticity note)
  → Back to dashboard (recommendations refresh)
```

### Manager Flow

All of the above, plus:

```
Team Dashboard
  - All direct + indirect reports
  - Each person's AIRS score, tier, track, completions
  - Filter by department, office, tier
  - Team Health Brief (Gemini-generated, on demand)
    → Overview paragraph
    → Biggest gap department
    → 3 action bullets
    → Platform impact statement
  - CTA: Open Content Studio pre-filled with gap department
```

### Admin Flow

All of the above, plus Admin Dashboard with 10 tabs:

| Tab | Purpose |
|---|---|
| Overview | Org-wide stats, office breakdown, participation |
| All Staff | Every staff member, AIRS scores, tier distribution |
| Intelligence | AI-generated org insights, weekly snapshots |
| Staff Learning | Course completion table, by department, top learners |
| Playbook | AI readiness questionnaire preview by department |
| Content Studio | Generate new courses with Gemini, submit for review |
| Staff Management | Bulk CSV import, staff directory, enable/disable access |
| Events | Create and manage events, assign staff |
| Knowledge Base | Upload documents (PDF text extracted, file destroyed) |
| Review Queue | Approve or reject courses submitted via Content Studio (super admin only) |

---

## 9. Authentication

### Login Flow

Single `/login` page for all users.

1. Staff enters work email + password
2. Server checks email against `staff_members` table
3. If email matches `SUPER_ADMIN_EMAIL` env var → super admin path
4. Otherwise → staff path

**Super Admin Path:**
- Password checked against `SUPER_ADMIN_PASSWORD` env var
- If no staff record exists (pre-import): synthetic profile returned (`id: 'super-admin'`)
- If staff record exists: real profile returned with `is_admin: true`

**Staff Path:**
- Password checked against per-user `password_hash` (bcrypt) if set
- Falls back to `STAFF_DEFAULT_PASSWORD` env var if no hash set
- `access_enabled` must be `true` (Phase 1: managers only)
- Returns profile including `job_level`, `is_admin`, `has_reports`, `has_profile`

### Session Storage

| Key | Storage | Value |
|---|---|---|
| `tai_staff_id` | localStorage | Staff UUID (persists across sessions) |
| `tai_admin_authed` | sessionStorage | `'1'` (admin session flag) |
| `tai_admin_staff_id` | sessionStorage | Admin's staff UUID |

### Job Level → Access Rights

| job_level | Personal Dashboard | Team Dashboard | Admin Dashboard |
|---|---|---|---|
| staff | Yes | No | No |
| team_lead | Yes | Yes | No |
| dept_head | Yes | Yes | No |
| office_head | Yes | Yes | Yes |
| super_admin | Yes | Yes | Yes |

### Reporting Hierarchy

`manager_id` is a self-referencing FK on `staff_members`. Team Dashboard scope is calculated at runtime via recursive traversal of the full manager chain — no manual configuration needed.

- Team Lead → sees direct reports only
- Dept Head → sees full department hierarchy
- Office Head → sees entire office
- Super Admin → sees all offices, all staff

---

## 10. Course Approval Flow

Courses generated via Content Studio go through a mandatory approval step before reaching staff.

### Flow

1. Any admin opens Content Studio → describes a learning gap → selects department + tier level → adds course credit (name + role of person who identified the gap)
2. Clicks **Submit for Review** → course saved as `status: 'draft'`
3. Super admin receives a dashboard notification: "New course pending your approval"
4. Super admin opens **Review Queue** tab (only visible to super admin)
5. Reviews course title, tier, department, overview, who suggested it
6. **Approve & Publish** → `status` set to `published` → course appears in library for all staff → suggester notified on their dashboard
7. Or **Reject** → draft deleted permanently

### Why This Exists

Without approval, any admin could publish poorly constructed or incorrect content directly to 300 staff. The approval gate ensures every course that reaches staff has been reviewed by the super admin.

---

## 11. Pilot AI Assistant

Pilot is the internal AI learning assistant accessible at `/chat`.

### Capabilities

- Answers questions about AIRS scores, tiers, tracks
- Explains course recommendations and how they were chosen
- Navigates staff through the platform
- Answers questions about company policies and event briefs (from uploaded documents)
- Personalised to the staff member asking (knows their name, score, department, completed courses)

### What Pilot Will Not Do

- Answer questions outside Event Pilot and AI skill-building at work
- Discuss politics, entertainment, sport, news, food, weather
- Reveal passwords, API keys, or credentials
- Make up course titles, scores, or features not in the knowledge base
- Give legal, medical, financial, or HR compliance advice
- Engage with roleplay, personas, or jailbreak attempts

### Rate Limits

- 20 messages per staff member per day (server-enforced via `chat_usage` table)
- Super admin is exempt from rate limits

### How It Works

1. Staff sends a question
2. Server pre-checks for misuse patterns (regex: jailbreak attempts, explicit content, violence)
3. If clear misuse detected → blocked before hitting Gemini
4. Checks daily usage count → rejects if over 20
5. Fetches platform docs from cache (rebuilt every 10 minutes from `platform_docs` table)
6. Fetches staff profile: name, department, role, AIRS score, tier, completed courses
7. Fetches documents this staff member can access (all-visibility + event-assigned)
8. Builds system prompt: identity + rules + scope + knowledge base + staff context + documents
9. Sends to Gemini 2.0 Flash with last 8 messages as conversation history
10. Increments daily usage counter
11. Returns answer

### Misuse Handling

**Hard block (pre-Gemini):**
Patterns like "ignore previous instructions", "pretend you are", "act as DAN", "jailbreak", explicit content, violence keywords → returns a fixed response without using any API quota.

**Soft redirect (via prompt):**
Off-topic patterns (sport, recipes, movies, stocks, weather, news) → internal note appended to prompt telling Gemini to apply its off-topic redirect rule.

---

## 12. Document Intelligence

### Upload Flow

1. Admin uploads PDF or text file via Knowledge Base tab
2. Server reads the file bytes
3. For PDF: `pdf-parse` extracts all text content
4. For .txt / .md: read as UTF-8 string
5. Text saved to `documents` table with word count
6. File is destroyed — never stored anywhere
7. Document appears in admin list immediately

### Visibility Levels

- **All** — visible to every staff member on their dashboard
- **Event Only** — visible only to staff assigned to the linked event

### Pilot Integration

When staff ask Pilot a question, the server fetches up to 5 documents they have access to. Each document contributes up to 2,000 characters of extracted text injected into Pilot's system prompt. This means staff can ask Pilot about company policies, event briefs, or onboarding documents and get accurate answers from the actual uploaded content.

---

## 13. Events System

### What Events Are

Events are created by admins and represent Trescon's live events — conferences, summits, forums, workshops. Each event has: name, type, status, date, venue, city, client, and description.

### Staff Assignment

Staff members are assigned to events via the Events tab in admin. Once assigned:
- The event appears in their personal dashboard under "My Events"
- They can access event-scoped documents (visibility = `event_only`)
- Pilot can answer questions about the event brief

---

## 14. Bulk Staff Import

### Process

1. Admin uploads a CSV or pastes raw text
2. Gemini 2.0 Flash reads the headers and maps them to known schema fields
3. Admin reviews the mapping — approves, rejects, or corrects each column
4. Gemini identifies new valuable columns not in the schema → admin can approve to `ALTER TABLE` automatically
5. Preview shows first 10 rows with warnings
6. Admin confirms → two-pass commit:
   - **Pass 1**: Insert all staff records (no manager links yet)
   - **Pass 2**: Resolve manager names/emails → UUIDs, set `manager_id`
7. Per-user passwords generated: `FirstName@XXXX` format, bcrypt hashed, stored in `password_hash`
8. Managers (`team_lead+`) get `access_enabled = true`, staff get `false` (Phase 1)
9. After commit: download credentials CSV for HR to send welcome messages

### Fuzzy Name Matching

When resolving manager references from CSV names to UUIDs:
- Exact match = 100 points
- First + last name match = 90 points
- Name contains match = 80 points
- First name only = 50 points

Best match above 50 is used. Unresolved managers are reported back to admin after import.

---

## 15. API Endpoints — Full List

### Authentication
| Method | Endpoint | Purpose |
|---|---|---|
| POST | /api/login | Unified login for all users |
| POST | /api/verify-staff | Email lookup for questionnaire |
| PATCH | /api/verify-staff | Update staff department |

### Dashboard & Profile
| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/dashboard | Full dashboard data for a staff member |
| GET | /api/staff-member | Staff profile + task profiles |
| GET | /api/staff-list | All staff (admin) |
| GET | /api/staff-completions | Course completion history |
| PATCH | /api/staff-access | Toggle access_enabled |

### Courses
| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/courses | Published courses (staff) or draft queue (admin) |
| POST | /api/courses | Submit generated course as draft |
| PATCH | /api/courses | Approve draft → publish |
| DELETE | /api/courses | Reject and delete draft |
| GET | /api/course-detail | Individual course full data |
| POST | /api/course-completion | Submit assessment, record result |

### AI
| Method | Endpoint | Purpose |
|---|---|---|
| POST | /api/ask | Pilot AI chat |
| POST | /api/recommendations | Gemini-powered course recommendations |
| POST | /api/generate-course | Generate full course from description |
| POST | /api/generate-questions | Generate personalised questions from submission |
| POST | /api/team-brief | Gemini team health summary |

### Documents & Events
| Method | Endpoint | Purpose |
|---|---|---|
| POST | /api/documents/upload | Upload + extract PDF/text |
| GET | /api/documents/list | List documents (staff or admin) |
| DELETE | /api/documents/list | Soft-delete a document |
| GET | /api/events | List events |
| POST | /api/events | Create event |
| PATCH | /api/events | Update event |
| DELETE | /api/events | Delete event |
| GET | /api/events/staff | Staff assigned to event |
| POST | /api/events/staff | Assign staff to event |
| DELETE | /api/events/staff | Remove staff from event |

### Notifications
| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/notifications | Fetch unread notifications |
| PATCH | /api/notifications | Mark notification as read |

### Platform & Config
| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/platform-docs | Fetch documentation articles |
| GET | /api/platform-status | Platform health (demo mode detection) |
| GET | /api/office-config | Office headcount config |
| POST | /api/office-config | Update office config |

### Intelligence
| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/intelligence-reports | Fetch saved insight reports |
| GET | /api/generate-insights | Trigger new insight generation |
| GET | /api/cron/weekly-insights | Scheduled weekly insight generation |

### Import
| Method | Endpoint | Purpose |
|---|---|---|
| POST | /api/import/parse | Gemini CSV column mapping |
| POST | /api/import/commit | Two-pass staff import commit |

### Seed (Dev Only)
| Method | Endpoint | Purpose |
|---|---|---|
| POST | /api/seed-demo | Create demo staff accounts |
| DELETE | /api/seed-demo | Delete all demo accounts |
| POST | /api/seed-courses | Seed course library |
| POST | /api/seed-platform-docs | Seed platform documentation |

---

## 16. Environment Variables

All environment variables must be set in Vercel → Project Settings → Environment Variables before deployment.

| Variable | Visibility | Purpose |
|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | Public | Supabase project URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Public | Supabase anonymous key |
| SUPABASE_SERVICE_ROLE_KEY | Secret | Supabase admin key (server-only) |
| GEMINI_API_KEY | Secret | Google Gemini API key |
| SUPER_ADMIN_EMAIL | Secret | Super admin login email |
| SUPER_ADMIN_PASSWORD | Secret | Super admin login password |
| STAFF_DEFAULT_PASSWORD | Secret | Default password for all imported staff |
| NEXT_PUBLIC_ADMIN_CODE | Public | Admin feature gate code |
| CRON_SECRET | Secret | Bearer token for cron job authentication |
| NEXT_PUBLIC_SITE_URL | Public | Production domain URL |

---

## 17. Gemini AI Usage

Gemini 2.0 Flash is used across six features:

| Feature | When Called | Input | Output |
|---|---|---|---|
| Pilot Chat | Every staff message | System prompt + docs + staff profile + conversation history | Answer text |
| Course Recommendations | Dashboard load (async) | Staff profile + eligible courses | Ranked list with reasons |
| Course Generation | Content Studio submit | Gap description + department + tier | Full course JSON |
| Question Generation | Before each assessment | Course title + tasks + submission text | 5 personalised questions |
| Team Health Brief | Manager requests | Team AIRS data + completion stats | 4-part written brief |
| Staff Import Parse | CSV upload | Column headers + sample rows | Field mapping JSON |

### Free Tier Limits (gemini-2.0-flash)
- 1,500 requests per day
- 15 requests per minute
- Sufficient for launch with 300 staff

### Fallback Behaviour

Every Gemini call has a silent fallback:
- Recommendations: falls back to rule-based scoring
- Questions: falls back to random selection from static bank
- Team brief: returns null (button shows error state)
- Course generation: returns error to admin

---

## 18. Deployment Checklist (Railway)

Deployment is automatic — just push to main:

```bash
git push origin main
```

Railway picks up the push via GitHub webhook, runs `next build`, and deploys. Monitor at: `railway.com/project/26f95192-091d-48d0-a4f9-f8cc4549b8a4`

**Infrastructure (as of 18 Jun 2026):**
```
Browser → eventpilot.tresconglobal.com
            ↓ (Cloudflare DNS, proxied)
         Cloudflare Worker: eventpilot-proxy
            ↓
         Railway: eventpilot-production-90c6.up.railway.app
            ↓
         Supabase: yuyxfxoevztugtfgduks
```

**Before deploying a new environment:**
- [ ] Add all env vars to Railway (project → eventpilot service → Variables tab)
- [ ] Set `NEXT_PUBLIC_SITE_URL` to production domain
- [ ] Confirm `.env.local` is in `.gitignore` (it is)
- [ ] Run `npm run build` locally — confirm zero errors
- [ ] Run any pending Supabase migration SQL files
- [ ] Test SSO end-to-end: `curl https://eventpilot.tresconglobal.com/api/auth/microsoft` must return 307
- [ ] Add `CRON_SECRET` to Railway env vars for weekly insight cron

---

## 19. Data Rollout Plan

| Stage | Action |
|---|---|
| Now | Demo data + test accounts coexist. Management review. |
| Pre-launch | Delete all demo and test data via SQL |
| Launch | Import real HR staff CSV. All 300 staff created with temp passwords. |
| Phase 1 | Managers enabled (`access_enabled = true`). Staff accounts created but not yet active. |
| Phase 2 | All staff enabled. Platform open company-wide. |
| Ongoing | Weekly cron generates org intelligence. Admin reviews content studio submissions. |

---

## 20. Design Rules (Non-Negotiable)

- No emojis anywhere — SVG icons only
- No faded or opacity text on dark backgrounds — full-strength colours only
- Dark base: `#080A0B`
- Teal primary: `#00A5A3`
- Lime accent: `#C0F43C`
- Purple (AI/Gemini): `#A478FF`
- All numbers on platform are data-driven — nothing hardcoded
- Port 3003 always for local dev
- Never deploy to Vercel without explicit instruction

---

*Document last updated: June 2026*
*Platform version: 2.0 — Full Operations Platform*
