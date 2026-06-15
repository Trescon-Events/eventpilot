import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

const ADMIN_CODE = process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'eventpilot2026'

/*
  POST /api/seed-platform-docs
  Seeds the platform_docs table with all knowledge-base articles.
  Run once. Safe to re-run — upserts by slug.
*/

const DOCS = [
  /* ── 1. PLATFORM OVERVIEW ─────────────────────────────────────── */
  {
    slug: 'what-is-eventpilot',
    category: 'Platform Overview',
    title: 'What is Event Pilot?',
    content: `Event Pilot is Trescon's internal AI learning and readiness platform. It serves all staff across the four Trescon offices — Dubai, Bangalore, Mangalore, and Manipal.

The platform has one primary purpose: measure where every employee stands in their AI readiness today, then guide them — course by course — toward becoming confident AI practitioners in their specific role.

Event Pilot is not a generic e-learning platform. Every course, every recommendation, and every score is calibrated to the work Trescon employees actually do: running events, selling sponsorships, managing campaigns, handling finance, leading teams, and building deals across 80+ countries.

The platform runs on a continuous weekly loop:
1. Staff complete an AI Readiness Questionnaire (the task survey)
2. The system calculates their AI Readiness Score (AI Readiness Score out of 100)
3. The recommendation engine assigns a personalised learning path
4. Staff take courses and complete assessments
5. Scores update. The loop continues.

Managers see their team's progress. Admins see the full organisation. Everyone has a personal dashboard that belongs to them.`,
    order_index: 1,
  },

  /* ── 2. AIRS SCORE ────────────────────────────────────────────── */
  {
    slug: 'airs-score-explained',
    category: 'Platform Overview',
    title: 'How Your AI Readiness Score Works',
    content: `AIRS stands for AI Readiness Score. It is a number from 0 to 100 that represents how embedded AI is in your current daily work.

HOW IT IS CALCULATED

When you complete the AI Readiness Questionnaire, you describe your daily work tasks. For each task, the system records an AI Readiness reading on a scale of 1 to 5:
- 1 = No AI involvement in this task at all
- 2 = Occasionally aware of AI for this task
- 3 = Sometimes uses AI for this task
- 4 = Regularly uses AI for this task
- 5 = AI is fully integrated into this task

Your AI Readiness Score is the average of all your task readings, converted to a 0–100 scale using the formula:
  score = round(((avg - 1) / 4) × 65 + 10)

A score of 0 means no AI usage across all tasks. A score of 100 would mean every task is fully AI-integrated.

THE FIVE TIERS

Your AI Readiness Score places you into one of five tiers, each with a learning track:

AI-Forward (75–100) → Advanced Track
You are a model AI practitioner. Your focus is on automating workflows, building AI systems for your team, and leading AI adoption in your department.

AI-Ready (55–74) → Advanced Track
You use AI confidently across most tasks. You are ready for advanced courses covering automation, strategy, and team-level AI implementation.

AI-Aware (35–54) → Adoption Track
You use AI for some tasks but have clear gaps. Your focus is adopting AI systematically across your full role — emails, data, presentations, meetings.

AI-Curious (15–34) → Foundation Track
You are aware of AI tools but not using them regularly. Your focus is building the foundational habit — starting with ChatGPT, writing with AI, and understanding the landscape.

AI-Unaware (0–14) → Foundation Track
You have little to no current AI practice. Your focus starts at the very beginning: what AI is, what it can do for you specifically, and your first practical use cases.

HOW TO IMPROVE YOUR SCORE

Your score updates every time you retake the questionnaire. The way to move your score up is not to answer the questionnaire differently — it is to genuinely start using AI for more of your tasks. Take a course, apply it to real work, then retake the assessment. Your score should reflect your actual practice.`,
    order_index: 2,
  },

  /* ── 3. LEARNING TRACKS ────────────────────────────────────────── */
  {
    slug: 'learning-tracks-and-courses',
    category: 'Platform Overview',
    title: 'Learning Tracks, Courses, and How They Are Structured',
    content: `Event Pilot organises all courses into three tracks that align with your AI Readiness Score tier.

THE THREE TRACKS

Foundation Track (AI-Unaware and AI-Curious)
Covers the essentials: what AI is, how ChatGPT works, writing with AI, AI tools for your role, meeting AI, and the broader landscape. These courses are designed for someone picking up an AI tool for the first time. Most are 15–20 minutes.

Adoption Track (AI-Aware)
Covers systematic AI usage across the core work functions: email, calendar, data and reporting, presentations, social media, brand strategy, and process mapping. These courses assume you have tried AI and are ready to embed it properly. Most are 25–30 minutes.

Advanced Track (AI-Ready and AI-Forward)
Covers AI leadership, automation building, team AI strategy, and end-to-end creative production systems. These courses are for practitioners who are ready to build systems, lead others, and operate at the cutting edge. Most are 35–45 minutes.

MANDATORY VS OPTIONAL

Some courses are marked Mandatory. These are required for all staff regardless of role, department, or AI Readiness Score. Mandatory courses establish the common knowledge baseline across all 300 Trescon employees.

Optional courses are recommended based on your department, job level, and learning track.

DEPARTMENT-SPECIFIC COURSES

Certain courses are tagged for specific departments and are prioritised for those teams:
- Marketing: AI Copywriting, Social Media at Scale, Brand Strategy, AI Creative Studio
- Content & Design: AI for Visual Design, AI Copywriting, AI Creative Studio
- Finance, Sales & Sponsorship, Operations: Data and Reporting with AI
- Sales & Sponsorship, Events: AI for Presentations and Proposals
- Operations, Events, HR: Process Mapping with AI
- Leadership, Management: AI Strategy for Your Team

Courses with no department tag are universal and shown to all staff.

COURSE STRUCTURE

Every course has five components:
1. Overview — Why this matters for your specific role
2. Read — The full course content (practical, no theory for its own sake)
3. Tasks — 4 real-world tasks you complete using AI tools
4. Assessment — 5 multiple-choice questions
5. Score — You need 60% or above to pass and mark the course complete

You can retake any assessment. Each attempt is recorded.`,
    order_index: 3,
  },

  /* ── 4. RECOMMENDATION ENGINE ──────────────────────────────────── */
  {
    slug: 'recommendation-engine',
    category: 'How the Platform Works',
    title: 'How the Recommendation Engine Works',
    content: `Every individual on Event Pilot sees a personalised course list. The recommendation engine scores every available (uncompleted) course for each person using five signals, then ranks and labels them.

THE FIVE SCORING SIGNALS

Signal 1: Mandatory and Not Done (+50 points)
If a course is mandatory and you have not passed it yet, it receives the highest priority score. Compliance always comes first. Mandatory courses appear at the top of your recommended list regardless of track, department, or job level.

Signal 2: Track Alignment (+30 points)
If a course belongs to your current learning track (based on your AI Readiness Score), it is a strong match. Foundation track users see foundation courses boosted. Adoption and advanced track users see their track boosted accordingly.

Signal 3: Department Match (+25 points)
If a course is tagged for your department (e.g., Marketing, Finance, Content & Design), it receives a relevance boost. A Marketing executive sees AI Copywriting and Social Media courses pushed higher than someone in Finance would. This signal activates for courses that explicitly include your department in their tags.

Signal 4: Foundation Gap (+20 points)
If you are on the Adoption or Advanced track but have completed fewer than 3 foundation courses, the system detects a knowledge gap and boosts foundation courses for you. The logic: advanced skills built on a shaky foundation do not stick. The system guides you to fill the gap before moving fully to advanced material.

Signal 5: Job-Level Boost (+15 points)
If your job level is Team Lead, Department Head, Office Head, or Super Admin, courses related to team strategy, automation, leadership, and management receive a priority boost. A manager is expected to not only use AI personally but to lead their team's AI adoption.

PENALTY: Out-of-Range Courses
Courses significantly above your current level are penalised to avoid overwhelming beginners:
- Foundation track users: Adoption courses −10 points, Advanced courses −20 points

This keeps the list achievable and progressive without hiding advanced material entirely.

HOW THE FINAL LIST IS ASSEMBLED

All uncompleted courses are scored using the signals above. Courses are sorted highest to lowest. The top-scoring course becomes your "Next Up" recommendation — displayed prominently at the top of your dashboard. The next 5 courses form your "Recommended For You" list.

Each recommendation is labelled with the primary reason it was surfaced:
- "Required for all staff" (mandatory signal)
- "Recommended for [your department]" (dept signal)
- "Next in your [track] track" (track alignment)
- "Complete your foundation first" (foundation gap)
- "Relevant to your management role" (job-level signal)

WHY THIS APPROACH

The alternative — showing everyone the same list filtered only by tier — produces generic outputs. A Finance Manager with a high AI Readiness Score and a Marketing Executive with a low score should see completely different courses, even if they are in the same tier. Role, department, and job level are equally important as raw score.

As staff complete courses, their completed courses are removed from the pool and the remaining courses re-rank. The list is always fresh and always moving forward.`,
    order_index: 4,
  },

  /* ── 5. STAFF: HOW TO USE ──────────────────────────────────────── */
  {
    slug: 'how-to-use-as-staff',
    category: 'User Guide',
    title: 'How to Use Event Pilot as a Staff Member',
    content: `This guide is for all Trescon staff using their personal dashboard.

STEP 1: LOG IN
Go to www.eventpilot.com (or localhost:3003 during development). Use your Trescon work email and the password provided by HR. You will land on your personal dashboard.

STEP 2: CHECK YOUR AIRS SCORE
Your dashboard shows your current AI Readiness Score, your tier (AI-Unaware through AI-Forward), and your current learning track. If your score is 0, it means you have not yet completed the AI Readiness Questionnaire — do this first.

STEP 3: COMPLETE THE QUESTIONNAIRE
The questionnaire asks you to describe your daily work tasks and rate how much AI you currently use for each. Answer honestly — the score only helps you if it reflects your real situation. The questionnaire takes 10–15 minutes.

STEP 4: START YOUR RECOMMENDED COURSE
Your dashboard shows your "Next Up" course — the highest-priority recommendation for you specifically. This is not random. It has been chosen based on your score, your department, whether it is mandatory, and your job level. Start here.

STEP 5: COMPLETE THE COURSE
Each course has: something to read, tasks to do with real AI tools, and a 5-question assessment. You need 60% or above to pass. You can retake the assessment as many times as needed. Each attempt is tracked.

STEP 6: REPEAT
After completing a course, your "Next Up" updates to the next highest-priority recommendation. Work through your list. Your AI Readiness Score will rise as your actual AI usage increases — take the questionnaire again after 4–6 weeks of applying what you have learned.

UNDERSTANDING YOUR DASHBOARD

- AI Readiness Score: Your current AI readiness out of 100
- Tier: Your readiness label (AI-Unaware → AI-Forward)
- Learning Track: Foundation, Adoption, or Advanced
- Courses Completed: How many courses you have passed
- Mandatory Progress: How many of the required courses you have done
- Next Up: Your top personalised recommendation
- Recommended For You: Your next 5 personalised courses with the reason each was chosen

COURSE LIBRARY
Click "View All" or "Course Library" in the navigation to browse all courses available to you. You can start any course from the library — you are not locked into a sequence.

GETTING HELP
If you cannot log in, contact your manager or the HR team. If a course is unclear or incorrect, flag it to your manager.`,
    order_index: 5,
  },

  /* ── 6. MANAGER GUIDE ──────────────────────────────────────────── */
  {
    slug: 'how-to-use-as-manager',
    category: 'User Guide',
    title: 'How to Use Event Pilot as a Manager or Team Lead',
    content: `If you have people reporting to you, you have access to two dashboards: your Personal Dashboard and your Team Dashboard. Both are accessible from the navigation bar.

YOUR PERSONAL DASHBOARD
This is identical to every other staff member's dashboard. It shows your own AI Readiness Score, your own recommendations, and your own course completions. You are expected to lead by example — managers should be among the first to complete their own learning path.

YOUR TEAM DASHBOARD
The Team Dashboard shows you every person who reports to you — directly and indirectly through the hierarchy. For each team member you can see:
- Their AI Readiness Score (AI Readiness Score)
- Their tier (AI-Unaware → AI-Forward)
- Their learning track (Foundation / Adoption / Advanced)
- Courses completed
- Last active date

WHAT THE TEAM DASHBOARD TELLS YOU
The dashboard gives you an immediate read of your team's AI readiness distribution. Look for:
- Team members at AI-Unaware or AI-Curious: These people need direct support to get started. They may be hesitant or unclear on where to begin. A 15-minute conversation showing them their first course is often enough.
- Large gaps between team members: If half your team is AI-Ready and half is AI-Unaware, you have an adoption gap that will compound over time.
- Zero activity (no courses started): This is the most urgent signal. Someone who has not started means the platform has not reached them yet.

HOW TO DRIVE YOUR TEAM'S PROGRESS
1. Make completing the AI Readiness Questionnaire mandatory in your next team meeting — do it together
2. Review Team Dashboard scores as a team — transparency accelerates adoption
3. Set a team target: "All team members at AI-Aware or above within 90 days"
4. Highlight one AI win from your team in every weekly standup
5. Complete the "AI Strategy for Your Team" course — it gives you the full framework for doing this

YOUR SCOPE ON THE TEAM DASHBOARD
If you are a Team Lead, you see your direct reports.
If you are a Department Head, you see your full department hierarchy.
If you are an Office Head, you see your entire office.
If you are a Super Admin, you see the full organisation across all offices.

The scope is determined automatically from the reporting hierarchy — it updates as staff are added, moved, or promoted.`,
    order_index: 6,
  },

  /* ── 7. ADMIN GUIDE ────────────────────────────────────────────── */
  {
    slug: 'how-to-use-as-admin',
    category: 'User Guide',
    title: 'How to Use Event Pilot as an Administrator',
    content: `Administrators have access to all three views: Personal Dashboard, Team Dashboard, and Admin Dashboard. The Admin Dashboard is the control centre for the entire platform.

ACCESSING THE ADMIN DASHBOARD
Log in with your admin credentials. You will land on the Admin Dashboard automatically. From any page, use the green "Admin Dashboard" button in the navigation to return.

WHAT THE ADMIN DASHBOARD CONTAINS

Staff Learning Tab
Shows course completion data across all staff. Breakdown by office, department, and individual. Identifies who has completed which courses and which mandatory courses have outstanding completions.

Questionnaire Preview Tab
Shows the full AI Readiness Questionnaire in read-only mode. Preview it for any department to see exactly what questions staff in that department are being asked.

Office Stats
High-level completion and readiness overview by office (Dubai, Bangalore, Mangalore, Manipal). Shows enrolment targets vs actual joined staff.

STAFF IMPORT
When HR provides the staff database (name, email, department, role, manager, office), upload it via the staff import API endpoint. The system does a two-pass import: all staff are created first, then manager relationships are resolved. After import, all staff can log in and their hierarchy is automatically populated across all dashboards.

MANAGING COURSES
New courses can be added via the seed routes or the course creation API. Every course requires: title, subtitle, tier level, department tags, mandatory flag, overview, read content, task steps, and assessment questions.

SUPER ADMIN SPECIFIC
The Super Admin account (set via SUPER_ADMIN_EMAIL in environment variables) has full access to all data regardless of the reporting hierarchy. The Super Admin account exists even before HR data is imported — it uses a synthetic profile until a matching staff record is created.`,
    order_index: 7,
  },

  /* ── 8. HIERARCHY SYSTEM ───────────────────────────────────────── */
  {
    slug: 'hierarchy-and-reporting-structure',
    category: 'How the Platform Works',
    title: 'How the Reporting Hierarchy Works',
    content: `Event Pilot uses a self-referencing hierarchy — every staff member can have a manager, and every manager's scope on the Team Dashboard is automatically derived from the chain of reporting relationships.

THE DATA MODEL

Each staff member record has:
- id: Unique identifier
- name, email, department, role, office_id: Profile fields
- manager_id: The UUID of their direct manager (nullable — top-level leaders have no manager)
- job_level: staff | team_lead | dept_head | office_head | super_admin
- team: Optional team label within a department

HOW SCOPE IS CALCULATED

When a manager opens their Team Dashboard, the system:
1. Fetches all staff records from the database
2. Recursively finds everyone whose manager_id chain leads back to this manager
3. Includes direct reports AND indirect reports (reports of reports, etc.)
4. Returns the full set with their AI Readiness Scores and completion data

This means a Department Head automatically sees their full department — including team leads and their reports — without any manual configuration. Adding a new staff member under any manager in the chain automatically includes them in all parent views.

DYNAMIC UPDATES

Because scope is calculated at runtime from the live manager_id field, any structural change takes effect immediately:
- Moving a staff member to a new team: Update their manager_id → they appear in the new manager's dashboard that same day
- Promoting someone: Update their job_level → their dashboard access updates automatically
- Adding new staff: Import via the staff import endpoint → they appear in all relevant dashboards immediately

IMPORT PROCESS

The staff import runs in two passes to handle the chicken-and-egg problem of manager references:
Pass 1: Create all staff records by email (no manager_id set yet)
Pass 2: For each record with a manager_email field, look up that email in the newly created records and set the manager_id

This ensures all 300 staff can be imported from a flat CSV in one operation, even when managers appear after their reports in the file.

JOB LEVEL AND DASHBOARD ACCESS

job_level determines which navigation links a user sees:
- staff: Personal Dashboard only
- team_lead, dept_head, office_head: Personal Dashboard + Team Dashboard
- super_admin: Personal Dashboard + Team Dashboard + Admin Dashboard

The recommendation engine also uses job_level to boost management-relevant courses for anyone at team_lead and above.`,
    order_index: 8,
  },

  /* ── 9. TECHNICAL ARCHITECTURE ─────────────────────────────────── */
  {
    slug: 'technical-architecture',
    category: 'Technical Reference',
    title: 'Platform Architecture and Technology Stack',
    content: `Event Pilot is built as a Next.js web application connected to a Supabase (PostgreSQL) database. This document describes what the platform is built on and how the data is organised — intended for technical staff and administrators.

TECHNOLOGY STACK

Frontend: Next.js 16 (App Router), React, TypeScript. Font: Manrope. All styling is applied inline — no external CSS framework dependency.

Backend: Next.js API routes (serverless functions). All sensitive database operations run server-side only and are never exposed to the browser.

Database: Supabase (PostgreSQL). The platform uses six primary tables.

AI Services: Google Gemini is used for AI-assisted course content generation. All generated content is reviewed before publication and stored in the database.

Hosting: Production deployment on Vercel with Supabase cloud database. Local development runs on port 3003.

KEY DATA TABLES

staff_members
Stores every Trescon employee. Key fields: name, email, department, role, office, job level, and manager (self-referencing — each staff member can point to their manager within the same table). This is the source of truth for the reporting hierarchy.

courses
Stores all platform courses. Each course has a tier level (foundation, adoption, or advanced), department tags, a mandatory flag, read content, task steps, and an assessment question bank.

staff_task_profiles
Stores each staff member's AI Readiness Questionnaire responses. Each response records a task description and an AI readiness rating from 1 (no AI use) to 5 (fully AI-integrated). These ratings are averaged to compute the AI Readiness Score.

course_completions
Records every passed course assessment. Stores the staff member, course, score, and completion date. This is what the recommendation engine uses to filter out already-completed courses.

course_attempts
Records every assessment attempt, whether passed or failed. Used for analytics and identifying courses where staff consistently struggle.

platform_docs
This knowledge base. Stores all platform documentation articles by category, used by the internal AI assistant to answer staff questions.

HOW DATA FLOWS

1. Staff member logs in → system reads their profile and task profiles from the database
2. AI Readiness Score is computed from task profile ratings (server-side calculation)
3. Recommendation engine scores all uncompleted courses against the staff member's score, department, and job level
4. Dashboard renders the personalised ranked course list
5. Staff completes a course → assessment result written to course_completions
6. Next recommendation recalculates on next page load — always current

DATA PRIVACY

Individual AI Readiness Scores and task profiles are visible to the staff member and their direct manager. Department and office aggregate data is visible to department heads and office heads. All data is stored in Supabase with server-side access controls. No individual performance data is exposed publicly.

INTEGRATION POINTS

The platform connects to three external services: Supabase (database), Google Gemini (AI course generation), and in future phases, the HR system (staff import) and Supabase Auth (per-user authentication replacing the current development-stage password system).`,
    order_index: 9,
  },

  /* ── 10. FAQ ────────────────────────────────────────────────────── */
  {
    slug: 'faq',
    category: 'User Guide',
    title: 'Frequently Asked Questions',
    content: `WHY IS MY AIRS SCORE 0?
You have not yet completed the AI Readiness Questionnaire. Go to your dashboard and look for the "Take Assessment" button. The questionnaire takes 10–15 minutes and asks about your daily work tasks. Your score will update immediately after submission.

CAN I RETAKE THE QUESTIONNAIRE?
Yes. You should retake it every 4–6 weeks as your AI usage grows. Each retake updates your score. Only your most recent task profiles are used for scoring.

CAN I RETAKE A COURSE ASSESSMENT?
Yes. You can attempt any assessment as many times as you need. All attempts are recorded. To pass, you need 60% or above (3 out of 5 questions correct). Once you pass, the course is marked as complete.

WHY AM I SEEING CERTAIN COURSES AND NOT OTHERS?
Your course list is personalised. The recommendation engine considers your AI Readiness Score (which determines your track), your department (which boosts relevant courses), whether any mandatory courses are outstanding, and your job level. You can browse all available courses in the Course Library.

I AM A MANAGER — WHY DON'T I SEE MY TEAM?
The Team Dashboard link appears only if your manager_id is set as the manager for at least one other staff member. This is configured during the HR staff import. If you believe you should have team access, contact your HR administrator to ensure your reporting structure is correctly imported.

HOW OFTEN SHOULD I USE THE PLATFORM?
Event Pilot is designed for continuous learning, not one-time completion. Aim for one course per week. This means your full foundation track (if starting from AI-Unaware) is complete within 6 weeks. Adoption track takes another 6 weeks. You should be at AI-Ready or above within 90 days of starting.

WHAT TOOLS DO I NEED?
Most foundation courses use ChatGPT (free account) or Claude (free account). Some courses use Canva AI (free tier), Adobe Firefly (free tier), or specialist tools like Midjourney or Otter.ai. You do not need to pay for tools to complete foundation or adoption courses.

IS MY DATA PRIVATE?
Your individual task profiles and assessment scores are visible to you and your direct manager. Aggregate department and office data is visible to department heads and above. Super Admins can see all individual data.

WHAT HAPPENS AFTER I COMPLETE ALL MY RECOMMENDED COURSES?
You will see a "Track Complete" message and be invited to explore the Course Library. If your AI Readiness Score has moved up during your learning, you may now qualify for a higher track — retake the questionnaire to check. More courses will be added to the platform continuously.

HOW ARE COURSES CREATED?
Courses are authored by the Event Pilot team. Course content is generated using AI tools (Google Gemini) and then reviewed and edited by subject matter experts before publication. All courses are reviewed for factual accuracy, practical applicability, and alignment with Trescon's specific context.`,
    order_index: 10,
  },

  /* ── 11. EVENT PLANNING MODULE ──────────────────────────────────── */
  {
    slug: 'event-planning-module',
    category: 'Operations Reference',
    title: 'Event Planning & Execution Module',
    content: `The Events module is the central workspace for planning, managing, and executing every Trescon global event. It covers the full lifecycle from initial planning through post-event wrap-up.

ACCESSING THE EVENTS MODULE
From the navigation, go to Events. You will see all events you are assigned to. Click any event to open its command centre. Admin users can see all events across the organisation.

THE EVENT COMMAND CENTRE

Each event has six tabs in its command centre:

Overview
Event name, dates, venue, status (Planning → Active → Completed / Cancelled), and team assignments. Shows the overall event health at a glance.

Plan
The master planning checklist. 61 tasks across 10 workstreams — automatically seeded when a new event is created.

Execution
Live execution view. Daily task status, critical blockers, team workload, and operational readiness.

Brand
Event brand identity. Upload or generate a brand kit: color palette, typography, tone of voice, and brand guidelines. AI-generated brand identities use Google Gemini.

Website
Event landing page builder. Design and publish the public event website with agenda, speakers, sponsors, and registration. Websites are deployed to Cloudflare with custom domain support.

Market Intel
Market research and competitive intelligence for the event. Scan the market for relevant speakers, sponsors, competitor events, and delegate personas.

EVENT STATUSES
- Planning: Event is being set up, checklist is being worked through
- Active: Event is running — execution mode
- Completed: Event is finished
- Cancelled: Event will not run

WORKSTREAMS IN THE 61-TASK TEMPLATE
- Production (9 tasks): Market research, agenda, speakers, programme design
- Marketing (11 tasks): Strategy, website, email campaigns, social media, ads
- Branding (6 tasks): Identity, assets, signage, digital collateral
- Sales (5 tasks): Pipeline, outreach, revenue targets, sponsorship decks
- Customer Success (5 tasks): Delegate onboarding, delivery, experience
- Operations (8 tasks): Venue, floorplan, AV, F&B, setup, logistics
- Partnerships (3 tasks): Partner identification, agreements, deliverables
- Tech & Data (5 tasks): CRM, ticketing (Konfhub), dashboards, post-event data

INTEGRATIONS
- Konfhub: Ticketing and delegate registration
- Cloudflare: Custom domain hosting for event websites
- Google Gemini: Brand generation and market intelligence`,
    order_index: 11,
  },

  /* ── 12. CHECKLIST & RACI ───────────────────────────────────────── */
  {
    slug: 'event-checklist-and-raci',
    category: 'Operations Reference',
    title: 'Event Checklist, RACI Matrix, and Task Governance',
    content: `Every Trescon event runs on a standardised 61-task checklist with a RACI governance layer.

THE 61-TASK MASTER CHECKLIST

When a new event is created, 61 tasks are automatically created from the master template across 10 workstreams.

Each task has:
- Title and description
- Workstream (Production, Marketing, Branding, Sales, etc.)
- Priority: Critical / High / Medium / Low
- Status: Not Started → In Progress → Blocked → Done
- Assigned To: A specific team member
- Due Date
- Dependencies: Other tasks that must be completed first

TASK STATUSES
- Not Started: Task has not been started
- In Progress: Task is being actively worked on
- Blocked: Task cannot progress — add a note explaining the blocker
- Done: Task is complete

USING THE CHECKLIST
1. Open the event and go to the Plan tab
2. Filter by workstream to focus on your area
3. Click a task to update its status, assignee, due date, or add notes
4. Blocked tasks are highlighted — these need manager attention
5. Critical priority tasks with missed due dates are flagged in the Execution tab

THE RACI MATRIX

RACI defines accountability for each workstream — not task-level execution, but who owns each area.

- Responsible: The person doing the work
- Accountable: The person who owns the outcome
- Consulted: People whose input must be sought
- Informed: People who need to be kept updated

HOW TO USE RACI
1. Open the event → Plan tab → RACI section
2. For each workstream, assign R, A, C, I roles to team members
3. The RACI matrix is visible to the full event team
4. Office Heads and Admins can override any RACI assignment`,
    order_index: 12,
  },

  /* ── 13. BRAND & WEBSITE ────────────────────────────────────────── */
  {
    slug: 'event-brand-and-website',
    category: 'Operations Reference',
    title: 'Event Brand Identity and Website Builder',
    content: `Each event on Event Pilot has its own brand identity and a publicly accessible website. Both are managed from the event command centre.

EVENT BRAND IDENTITY

The Brand tab stores the complete brand kit: primary/secondary/accent colors, fonts (Google Fonts), tone of voice, brand messaging, style keywords, and logo usage guidelines.

GENERATING A BRAND WITH AI
1. Go to the event Brand tab → "Generate Brand Identity"
2. Enter a brief: event name, industry, target audience, desired feel
3. Google Gemini generates a complete brand proposal
4. Review the palette, fonts, and tone — accept or regenerate individual elements
5. Save to lock the brand for this event

UPLOADING AN EXISTING BRAND
Upload existing brand guidelines (PDF or images) in the Brand tab. The system extracts key elements automatically.

EVENT WEBSITE BUILDER

The Website tab lets you build and publish the public event landing page with: Hero, About, Agenda, Speakers, Sponsors, and Registration sections.

PUBLISHING
1. Go to the event Website tab
2. Set up all sections using the visual builder
3. Click Preview, then Publish
4. The website goes live at the event slug URL

CUSTOM DOMAIN DEPLOYMENT
Go to Website → Custom Domain. Enter the domain and follow the Cloudflare setup steps. Once DNS is pointed, the event website is served from the custom domain with full SSL.`,
    order_index: 13,
  },

  /* ── 14. HR MODULE ──────────────────────────────────────────────── */
  {
    slug: 'hr-module-overview',
    category: 'Operations Reference',
    title: 'HR Module — What It Covers and How It Works',
    content: `The HR module is the people operations centre for all four Trescon offices. It syncs daily with the HRMS system.

WHAT THE HR MODULE COVERS

Staff Directory
Complete list of all Trescon employees. Search by name, department, office, or job level. Click any staff member to see their full profile: personal details, role history, contracts, attendance, and documents.

Attendance
Daily attendance records. Clock-in/clock-out times, late arrivals, early departures, and absences. Syncs from HRMS every night.

Leave Management
Leave types: Annual Leave, Sick Leave, Emergency Leave, Maternity/Paternity Leave, Privilege Leave, Unpaid Leave, Compensatory Off. Staff submit requests via My HR; managers approve or reject; balances update automatically.

Timesheets
Project and event time tracking. Syncs from HRMS project allocations.

Onboarding
When a new staff member joins, an onboarding workflow is created with tasks across HR, IT, and their department.

Offboarding
Offboarding checklist: equipment return, access revocation, knowledge handover, exit interview.

Contracts
Employment contract records: type (permanent, fixed-term, probation), dates, grade, and cost centre.

Payroll Grades
Salary grade and cost centre assignments. Grades: L1 through Executive.

Performance
Annual and mid-year performance review records.

THE HRMS SYNC

All HR data is automatically pulled from the company HRMS system every night at midnight IST (18:30 UTC). The sync covers: staff profiles, project allocations, timesheets, and leave balances. Changes made in HRMS appear in Event Pilot the next morning.`,
    order_index: 14,
  },

  /* ── 15. MY HR SELF-SERVICE ─────────────────────────────────────── */
  {
    slug: 'my-hr-self-service',
    category: 'User Guide',
    title: 'My HR — Employee Self-Service',
    content: `My HR is the personal HR portal for every Trescon employee. Access it from the navigation bar.

WHAT YOU CAN SEE IN MY HR

- Leave Balances: Current balance for all leave types, updated from HRMS nightly
- Leave Requests: Submit and track your leave requests
- Attendance Records: Your personal clock-in/clock-out history
- Timesheets: Hours logged against events and projects
- Employment Details: Contract type, grade, cost centre, start date, and manager
- Documents: Offer letter, contract, confirmation letter, certificates — download any document
- Onboarding Tasks: New joiners see their onboarding checklist here

SUBMITTING A LEAVE REQUEST
1. Go to My HR → "Request Leave"
2. Select leave type, start date, end date, and reason
3. Submit — your manager is notified immediately
4. You receive a notification when it is approved or rejected
5. Approved leave is reflected in your balance the same day`,
    order_index: 15,
  },

  /* ── 16. CONTENT & SOCIAL ───────────────────────────────────────── */
  {
    slug: 'content-social-media-module',
    category: 'Operations Reference',
    title: 'Content & Social Media Module',
    content: `The Content module is the social media planning and production engine for all Trescon events.

CAMPAIGNS

Each event has one or more content campaigns covering a specific phase (e.g., "Speaker Announcement Wave", "Countdown to Event", "Post-Event Recap").

POSTS

Each campaign contains posts for specific dates and platforms:
- LinkedIn (1200–1800 characters)
- Instagram (150–220 characters)
- Facebook (300–400 characters)
- Twitter/X (220–240 characters)
- YouTube (~300 characters)

NARRATIVE ROLES

Every post is assigned a narrative role: Awareness, Speaker Highlight, Sponsor Feature, Countdown, Live Update, Testimonial, Recap, or CTA.

AI-GENERATED POSTS
1. Open a campaign → "Generate Posts"
2. Select platforms and narrative roles
3. Google Gemini generates platform-appropriate content
4. Review, edit, and approve

APPROVAL WORKFLOW
- Draft: Created, not yet reviewed
- Approved: Ready to publish
- Rejected: Needs rework

Only approved posts can be published. Connected social accounts are managed in Events → Social Accounts (requires active API tokens from each platform).`,
    order_index: 16,
  },

  /* ── 17. DATA INTELLIGENCE ──────────────────────────────────────── */
  {
    slug: 'data-intelligence-module',
    category: 'Operations Reference',
    title: 'Data & Market Intelligence Module',
    content: `The Data module is the intelligence engine for Trescon's business development, delegate acquisition, and market research.

THE CONTACT DATABASE
Stores all contacts: delegates, speakers, sponsors, media partners, and industry contacts. Fields: name, title, company, email, LinkedIn URL, phone, industry, geography, and engagement history.

THE COMPANY DATABASE
Company records linked to contacts: name, industry, size, country, and associated contacts.

LEAD FINDER (ICP BUILDER)
1. Go to Data → Lead Finder
2. Describe the type of delegate or sponsor you are looking for
3. The AI asks clarifying questions to refine the ICP
4. The system searches the contact database for matches
5. Export the lead list for outreach

EMAIL GUESSER
Enter a contact's name and company domain — the system predicts the most likely email format with a confidence score.

DATA ENRICHMENT
Enrich contact records from LinkedIn and domain lookup.

EXTRACTION TOOLS
- File: Upload CSV, Excel, or text — extracts and maps data to contact records
- URL: Paste a webpage URL — extracts contact and company information
- Website: Full website scan for contact data

DATA EXPORT
Export any contact or company list to CSV for CRM, email campaigns, or outreach tools.`,
    order_index: 17,
  },

  /* ── 18. PILOT AI CHAT ──────────────────────────────────────────── */
  {
    slug: 'pilot-ai-chat',
    category: 'User Guide',
    title: 'Pilot — The Event Pilot AI Assistant',
    content: `Pilot is the internal AI assistant built into Event Pilot. Available to all staff. Access it via "Ask Pilot" in the navigation bar.

WHAT PILOT CAN HELP WITH

Learning and AI Readiness
- What is my AI Readiness Score and what does it mean?
- Which courses should I take first?
- How do I improve my score?

Platform How-To
- How do I submit a leave request?
- Where do I find the event checklist?
- How do I generate an event brand kit?
- What is the RACI matrix?

AI in Your Work
- How can AI help with email writing?
- What AI tools work for presentations?
- How do I use ChatGPT for data analysis?

WHAT PILOT WILL NOT DO
Pilot is scoped to Event Pilot and Trescon work. It will decline to:
- Answer general knowledge questions unrelated to your work
- Provide specific HR decisions (leave approvals, salary queries — go to HR directly)
- Share other employees' personal data or scores
- Speculate on company strategy

DAILY USAGE LIMIT
Pilot has a daily usage limit per user to manage AI API costs. The limit resets at midnight.

NOTE: For specific live data (your exact score, leave balance, course progress), check your dashboard — Pilot gives guidance and context, your dashboard gives you real-time numbers.`,
    order_index: 18,
  },

  /* ── 19. SECURITY & ACCESS ──────────────────────────────────────── */
  {
    slug: 'security-and-access-control',
    category: 'Technical Reference',
    title: 'Security and Access Control',
    content: `Event Pilot uses a multi-layer security model to protect staff data and platform access.

LOGIN SECURITY

Brute Force Protection
After 5 failed attempts within 15 minutes, the account is locked for 15 minutes. Contact your admin if you need immediate access.

IP Allowlisting (Optional)
When enabled, staff can only log in from Trescon office IP addresses. Admins (dept_head and above) are exempt and can log in from anywhere.

Password System
Default password on first login: trescon@2026. Passwords are stored as bcrypt hashes — never plain text. Admins can reset any staff member's password from the Admin Dashboard.

Session Management
Sessions expire after 8 hours. Stored as httpOnly cookies — cannot be read by browser JavaScript.

ACCESS LEVELS
- staff: Personal dashboard, My HR, course library, Pilot chat
- team_lead: Above + Team Dashboard for direct reports
- dept_head: Above + full department view
- office_head: Above + full office view + Admin access
- super_admin: Full platform access across all offices

AUDIT LOG
Every login attempt is recorded with email, IP address, timestamp, and outcome (success, wrong password, rate limited, IP blocked, account disabled). Admins can view this in the Security section.

DATA PRIVACY
Individual AI Readiness Scores and task profiles are visible to the staff member and their direct manager chain. Department aggregates are visible to department heads. All data is stored in Supabase with server-side access controls.`,
    order_index: 19,
  },

  /* ── 20. NOTIFICATIONS ──────────────────────────────────────────── */
  {
    slug: 'notifications',
    category: 'How the Platform Works',
    title: 'Notifications and Alerts',
    content: `Event Pilot sends in-app notifications to keep you informed about activity that affects you.

WHERE TO SEE NOTIFICATIONS
The notification bell in the navigation bar shows your unread count. Click it to see your latest 5 unread notifications. Notifications also appear on your personal dashboard.

TYPES OF NOTIFICATIONS

Course Published
When a course you suggested is approved and published: "Your course suggestion is live."

Course Pending Review (Admins only)
When a staff member submits a new course suggestion: "New course pending your approval."

Leave Request Update
When your leave request is approved or rejected by your manager.

HR Alerts
Contract expiry warnings, probation end dates, document renewal reminders — sent to the relevant staff member and their manager.

NOTIFICATION BEHAVIOUR
- Notifications are marked as read when you view them
- Up to 5 unread notifications shown in the bell dropdown
- All notifications remain accessible after being read`,
    order_index: 20,
  },
]

export async function POST(req: NextRequest) {
  const { admin_code } = await req.json().catch(() => ({}))
  if (admin_code !== ADMIN_CODE) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Upsert by slug
  const { data, error } = await supabaseAdmin
    .from('platform_docs')
    .upsert(
      DOCS.map(d => ({ ...d, updated_at: new Date().toISOString() })),
      { onConflict: 'slug' }
    )
    .select('id, slug, title')

  if (error) {
    // Table may not exist yet — return clear message
    if (error.message.includes('platform_docs')) {
      return NextResponse.json({
        error: 'platform_docs table does not exist. Run this SQL in Supabase first:\n\nCREATE TABLE platform_docs (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  slug TEXT UNIQUE NOT NULL,\n  category TEXT NOT NULL,\n  title TEXT NOT NULL,\n  content TEXT NOT NULL,\n  order_index INTEGER DEFAULT 0,\n  updated_at TIMESTAMPTZ DEFAULT NOW(),\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);',
      }, { status: 500 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    inserted: data?.length ?? 0,
    docs: data?.map(d => ({ slug: d.slug, title: d.title })),
  })
}
