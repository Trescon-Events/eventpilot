import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

const ADMIN_CODE = process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'taos2026'

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
    content: `Event Pilot is Trescon Global's internal operating platform — a single workspace for every function the company runs. It covers AI learning, HR management, event planning and execution, social media content, data intelligence, and team collaboration across all four offices: Dubai, Bangalore, Mangalore, and Manipal.

The platform is built for 300 Trescon employees. Every module is designed around the specific work Trescon actually does: running global B2B events, managing sponsorship deals, building marketing campaigns, handling HR across four offices, and driving AI adoption across every department.

THE SIX MODULES

TAI Academy — The learning arm of Event Pilot. Measures each staff member's AI readiness (TAIRS score), assigns personalised course paths, and tracks progress through assessments. Every staff member has a personal dashboard.

HR — Attendance, leave, timesheets, onboarding, contracts, performance, and payroll grades. Syncs daily with the HRMS system. Employee self-service for leave requests and personal HR records.

Events — End-to-end event management. 61-task planning checklist, RACI governance, speaker and sponsor management, event website builder, brand identity generation, P&L tracking, and Cloudflare-hosted custom domain deployment.

Content & Social Media — Campaign planning and AI-generated social content for LinkedIn, Instagram, Facebook, Twitter/X, and YouTube. Approval workflows and post scheduling for each event.

Data & Market Intelligence — Contact and company database, lead finder (ICP builder), email guesser, data enrichment (LinkedIn, domain lookup), file and URL extraction, and data export. Powered by the SmartData engine.

Pilot AI Chat — Internal AI assistant for all staff. Answers questions about the platform, learning content, and Trescon processes. Scoped to the platform — does not answer general questions outside Trescon context.

HOW IT ALL CONNECTS

Every module shares the same staff identity. Your login is your Trescon email. Your department, office, job level, and manager are the same across HR, the Team Dashboard, event assignments, and TAIRS recommendations. One record, one login, every module.

Admins and office heads see the full organisation. Department heads see their department. Team leads see their team. Staff see their personal view. Access is derived automatically from the reporting hierarchy — no manual permission configuration needed for standard access.`,
    order_index: 1,
  },

  /* ── 2. TAIRS SCORE ────────────────────────────────────────────── */
  {
    slug: 'tairs-score-explained',
    category: 'Platform Overview',
    title: 'How Your TAIRS Score Works',
    content: `TAIRS stands for Trescon AI Readiness Score. It is a number from 0 to 100 that represents how embedded AI is in your current daily work.

HOW IT IS CALCULATED

When you complete the AI Readiness Questionnaire, you describe your daily work tasks. For each task, the system records an AI Readiness reading on a scale of 1 to 5:
- 1 = No AI involvement in this task at all
- 2 = Occasionally aware of AI for this task
- 3 = Sometimes uses AI for this task
- 4 = Regularly uses AI for this task
- 5 = AI is fully integrated into this task

Your TAIRS score is the average of all your task readings, converted to a 0–100 scale using the formula:
  score = round(((avg - 1) / 4) × 65 + 10)

A score of 10 means no AI usage across all tasks. A score of 75+ means AI is fully integrated across your work.

THE FIVE TIERS

Your TAIRS score places you into one of five tiers, each with a learning track:

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
    content: `Event Pilot organises all courses into three tracks that align with your TAIRS score tier.

THE THREE TRACKS

Foundation Track (AI-Unaware and AI-Curious)
Covers the essentials: what AI is, how ChatGPT works, writing with AI, AI tools for your role, meeting AI, and the broader landscape. These courses are designed for someone picking up an AI tool for the first time. Most are 15–20 minutes.

Adoption Track (AI-Aware)
Covers systematic AI usage across the core work functions: email, calendar, data and reporting, presentations, social media, brand strategy, and process mapping. These courses assume you have tried AI and are ready to embed it properly. Most are 25–30 minutes.

Advanced Track (AI-Ready and AI-Forward)
Covers AI leadership, automation building, team AI strategy, and end-to-end creative production systems. These courses are for practitioners who are ready to build systems, lead others, and operate at the cutting edge. Most are 35–45 minutes.

MANDATORY VS OPTIONAL

Some courses are marked Mandatory. These are required for all staff regardless of role, department, or TAIRS score. Mandatory courses establish the common knowledge baseline across all 300 Trescon employees.

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
If a course is mandatory and you have not passed it yet, it receives the highest priority score. Compliance always comes first.

Signal 2: Track Alignment (+30 points)
If a course belongs to your current learning track (based on your TAIRS score), it is a strong match. Foundation track users see foundation courses boosted. Adoption and advanced track users see their track boosted accordingly.

Signal 3: Department Match (+25 points)
If a course is tagged for your department (e.g., Marketing, Finance, Content & Design), it receives a relevance boost. This signal activates for courses that explicitly include your department in their tags.

Signal 4: Foundation Gap (+20 points)
If you are on the Adoption or Advanced track but have completed fewer than 3 foundation courses, the system detects a knowledge gap and boosts foundation courses for you.

Signal 5: Job-Level Boost (+15 points)
If your job level is Team Lead, Department Head, Office Head, or Super Admin, courses related to team strategy, automation, leadership, and management receive a priority boost.

PENALTY: Out-of-Range Courses
Courses significantly above your current level are penalised to avoid overwhelming beginners:
- Foundation track users: Adoption courses −10 points, Advanced courses −20 points

HOW THE FINAL LIST IS ASSEMBLED

All uncompleted courses are scored using the signals above. Courses are sorted highest to lowest. The top-scoring course becomes your "Next Up" recommendation. The next 5 courses form your "Recommended For You" list.

Each recommendation is labelled with the primary reason it was surfaced:
- "Required for all staff" (mandatory signal)
- "Recommended for [your department]" (dept signal)
- "Next in your [track] track" (track alignment)
- "Complete your foundation first" (foundation gap)
- "Relevant to your management role" (job-level signal)`,
    order_index: 4,
  },

  /* ── 5. STAFF GUIDE ────────────────────────────────────────────── */
  {
    slug: 'how-to-use-as-staff',
    category: 'User Guide',
    title: 'How to Use Event Pilot as a Staff Member',
    content: `This guide is for all Trescon staff using their personal dashboard.

STEP 1: LOG IN
Go to the Event Pilot URL. Use your Trescon work email and the password provided by HR (default: trescon@2026). You will land on your personal dashboard.

STEP 2: CHECK YOUR TAIRS SCORE
Your dashboard shows your current AI Readiness Score, your tier (AI-Unaware through AI-Forward), and your current learning track. If your score is 0, complete the AI Readiness Questionnaire first.

STEP 3: COMPLETE THE QUESTIONNAIRE
The questionnaire asks you to describe your daily work tasks and rate how much AI you currently use for each. Answer honestly — the score only helps you if it reflects your real situation. Takes 10–15 minutes.

STEP 4: START YOUR RECOMMENDED COURSE
Your dashboard shows your "Next Up" course — chosen based on your score, department, mandatory requirements, and job level. Start here.

STEP 5: COMPLETE THE COURSE
Each course has: something to read, tasks to do with real AI tools, and a 5-question assessment. You need 60% or above to pass. You can retake the assessment as many times as needed.

STEP 6: REPEAT
After completing a course, your "Next Up" updates to the next highest-priority recommendation. Your TAIRS score rises as your actual AI usage increases — retake the questionnaire after 4–6 weeks of applying what you have learned.

UNDERSTANDING YOUR DASHBOARD

- TAIRS Score: Your current AI readiness out of 100
- Tier: Your readiness label (AI-Unaware through AI-Forward)
- Learning Track: Foundation, Adoption, or Advanced
- Courses Completed: How many courses you have passed
- Mandatory Progress: How many required courses you have done
- Next Up: Your top personalised recommendation
- Recommended For You: Your next 5 personalised courses

COURSE LIBRARY
Browse all courses in the Course Library. You are not locked into a sequence — you can start any course at any time.

MY HR
Access your personal HR records from the navigation: leave balances, attendance, timesheets, contracts, and onboarding tasks.

GETTING HELP
If you cannot log in, contact your manager or HR. If a course is unclear, flag it to your manager.`,
    order_index: 5,
  },

  /* ── 6. MANAGER GUIDE ──────────────────────────────────────────── */
  {
    slug: 'how-to-use-as-manager',
    category: 'User Guide',
    title: 'How to Use Event Pilot as a Manager or Team Lead',
    content: `If you have people reporting to you, you have access to two dashboards: your Personal Dashboard and your Team Dashboard. Both are accessible from the navigation bar.

YOUR PERSONAL DASHBOARD
Identical to every other staff member's dashboard. Shows your own TAIRS score, your own recommendations, and your own course completions. Managers should lead by example — complete your own learning path first.

YOUR TEAM DASHBOARD
Shows every person who reports to you — directly and indirectly through the hierarchy. For each team member you can see:
- Their TAIRS score
- Their tier (AI-Unaware through AI-Forward)
- Their learning track (Foundation / Adoption / Advanced)
- Courses completed
- Last active date

WHAT TO LOOK FOR ON THE TEAM DASHBOARD
- AI-Unaware or AI-Curious members: Need direct support to get started. A 15-minute conversation showing them their first course is often enough.
- Large gaps between team members: Half AI-Ready, half AI-Unaware means an adoption gap compounding over time.
- Zero activity: Someone who has not started means the platform has not reached them yet.

HOW TO DRIVE TEAM PROGRESS
1. Make completing the AI Readiness Questionnaire mandatory in your next team meeting — do it together
2. Review Team Dashboard scores as a team — transparency accelerates adoption
3. Set a team target: "All team members at AI-Aware or above within 90 days"
4. Highlight one AI win in every weekly standup
5. Complete the "AI Strategy for Your Team" course for the full framework

YOUR SCOPE ON THE TEAM DASHBOARD
- Team Lead: Your direct reports
- Department Head: Your full department hierarchy
- Office Head: Your entire office
- Super Admin: The full organisation across all offices

Scope updates automatically as staff are added, moved, or promoted.`,
    order_index: 6,
  },

  /* ── 7. ADMIN GUIDE ────────────────────────────────────────────── */
  {
    slug: 'how-to-use-as-admin',
    category: 'User Guide',
    title: 'How to Use Event Pilot as an Administrator',
    content: `Administrators (Office Heads and Super Admins) have access to all views: Personal Dashboard, Team Dashboard, and Admin Dashboard. The Admin Dashboard is the control centre for the entire platform.

ACCESSING THE ADMIN DASHBOARD
Log in with your admin credentials. Use the "Admin Dashboard" button in the navigation to reach it from any page.

WHAT THE ADMIN DASHBOARD CONTAINS

Staff Learning Tab
Course completion data across all staff. Breakdown by office, department, and individual. Identifies mandatory course gaps.

Questionnaire Preview Tab
Full AI Readiness Questionnaire in read-only mode. Preview for any department.

Office Stats
Completion and readiness overview by office (Dubai, Bangalore, Mangalore, Manipal). Enrolment targets vs actual staff joined.

STAFF IMPORT
When HR provides the staff database (name, email, department, role, manager, office), use the staff import API. The system runs a two-pass import: all staff created first, then manager relationships resolved.

MANAGING COURSES
New courses can be added via the admin course creation workflow. Every course requires: title, subtitle, tier level, department tags, mandatory flag, overview, read content, task steps, and assessment questions. Courses can be AI-generated using the Generate Course feature and then reviewed and published from the Admin Review Queue.

COURSE REVIEW QUEUE
AI-generated course suggestions from staff appear in the Review Queue. Admins can preview, approve, or reject each course. Approved courses are published immediately to the Course Library and the suggester is notified.

TOOLKIT ACCESS
Control which staff members have access to advanced platform tools beyond the standard learning dashboard. Manage access grants from the Admin Toolkit page.

ORG CHART
View the full Trescon organisational hierarchy as a visual chart. Derived live from the manager relationships in staff records.

SUPER ADMIN SPECIFIC
The Super Admin account (set via SUPER_ADMIN_EMAIL) has full access to all data regardless of hierarchy. It exists as a synthetic profile before HR data is imported.`,
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
3. Includes direct reports AND indirect reports
4. Returns the full set with their TAIRS scores and completion data

DYNAMIC UPDATES

Any structural change takes effect immediately:
- Moving a staff member to a new team: Update manager_id → they appear in the new manager's dashboard that same day
- Promoting someone: Update job_level → dashboard access updates automatically
- Adding new staff: Import via staff import → they appear in all relevant dashboards immediately

IMPORT PROCESS

Two-pass import to handle manager references:
Pass 1: Create all staff records by email (no manager_id set yet)
Pass 2: For each record with a manager_email field, look up that email and set manager_id

All 300 staff can be imported from a flat CSV in one operation, even when managers appear after their reports in the file.

JOB LEVEL AND DASHBOARD ACCESS

- staff: Personal Dashboard only
- team_lead, dept_head, office_head: Personal Dashboard + Team Dashboard
- super_admin: Personal Dashboard + Team Dashboard + Admin Dashboard`,
    order_index: 8,
  },

  /* ── 9. EVENT PLANNING MODULE ──────────────────────────────────── */
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
The master planning checklist. 61 tasks across 10 workstreams — automatically seeded when a new event is created. See the Checklist & RACI document for full details.

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
    order_index: 9,
  },

  /* ── 10. CHECKLIST & RACI ──────────────────────────────────────── */
  {
    slug: 'event-checklist-and-raci',
    category: 'Operations Reference',
    title: 'Event Checklist, RACI Matrix, and Task Governance',
    content: `Every Trescon event runs on a standardised 61-task checklist with a RACI governance layer. This document explains how both systems work and how to use them effectively.

THE 61-TASK MASTER CHECKLIST

When a new event is created, 61 tasks are automatically created from the master template. These tasks cover everything from pre-event research to post-event wrap-up. They are spread across 10 workstreams.

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
- Blocked: Task cannot progress due to a dependency or external issue — add a note explaining what is blocking it
- Done: Task is complete

USING THE CHECKLIST
1. Open the event and go to the Plan tab
2. Filter by workstream to focus on your area
3. Click a task to update its status, assignee, due date, or add notes
4. Blocked tasks are highlighted — these need manager attention
5. Critical priority tasks with missed due dates are flagged in the Execution tab

THE RACI MATRIX

The RACI matrix defines who is responsible for governance of each workstream — not task-level execution, but accountability for that area of the event succeeding.

RACI stands for:
- Responsible: The person doing the work
- Accountable: The person who owns the outcome and is ultimately answerable
- Consulted: People whose input must be sought before decisions are made
- Informed: People who need to be kept updated on progress

HOW TO USE RACI
1. Open the event and go to the Plan tab → RACI section
2. For each workstream, assign R, A, C, I roles to team members
3. The RACI matrix is visible to the full event team
4. Office Heads and Admins can override any RACI assignment
5. Assignments require approval from an Office Head before they are locked

WHY THIS MATTERS
Events fail when responsibility is unclear. The checklist tells everyone what to do. The RACI tells everyone who owns each area. Together they eliminate "I thought someone else was handling it."`,
    order_index: 10,
  },

  /* ── 11. BRAND & WEBSITE BUILDER ───────────────────────────────── */
  {
    slug: 'event-brand-and-website',
    category: 'Operations Reference',
    title: 'Event Brand Identity and Website Builder',
    content: `Each event on Event Pilot has its own brand identity and a publicly accessible website. Both are managed from the event command centre.

EVENT BRAND IDENTITY

The Brand tab in each event stores the complete brand kit for that event.

What the brand kit contains:
- Primary, secondary, and accent colors (hex codes)
- Background and text colors
- Primary and secondary fonts (Google Fonts)
- Tone of voice (e.g., authoritative, energetic, exclusive)
- Brand messaging (tagline, key messages, audience persona)
- Style keywords
- Logo usage guidelines

GENERATING A BRAND WITH AI
1. Go to the event Brand tab
2. Click "Generate Brand Identity"
3. Enter a brief: event name, industry, target audience, desired feel
4. The AI (Google Gemini) generates a complete brand proposal
5. Review the generated palette, fonts, and tone
6. Accept or regenerate individual elements
7. Save to lock the brand for this event

UPLOADING AN EXISTING BRAND
If the event already has brand guidelines (PDF or images), upload them in the Brand tab. The system extracts the key brand elements automatically and populates the kit fields.

EVENT WEBSITE BUILDER

The Website tab lets you build and publish the public event landing page.

The event website contains:
- Hero section: Event name, dates, venue, and registration CTA
- About section: What the event is about
- Agenda: Session schedule pulled from the event agenda builder
- Speakers: Headshots and bios
- Sponsors: Logo wall by tier
- Registration: Link to Konfhub ticketing or external registration

PUBLISHING THE EVENT WEBSITE
1. Go to the event Website tab
2. Use the visual builder to set up all sections
3. Click Preview to see how it looks before publishing
4. Click Publish to deploy
5. The website goes live at the event slug URL (e.g., eventpilot.com/events/[slug])

CUSTOM DOMAIN DEPLOYMENT
If the event has its own domain (e.g., gccaiforum.com), go to Website → Custom Domain. Enter the domain and follow the Cloudflare configuration steps. Once DNS is pointed, the event website is served from the custom domain with full SSL.

UPDATING A LIVE WEBSITE
Changes to speakers, agenda, or sponsors sync to the live website. Re-publish to push updates live. The system stores the full published HTML snapshot for rollback if needed.`,
    order_index: 11,
  },

  /* ── 12. HR MODULE ─────────────────────────────────────────────── */
  {
    slug: 'hr-module-overview',
    category: 'Operations Reference',
    title: 'HR Module — What It Covers and How It Works',
    content: `The HR module is the people operations centre for all four Trescon offices. It syncs daily with the HRMS system and provides HR managers with a complete view of every employee's records.

WHAT THE HR MODULE COVERS

Staff Directory
Complete list of all Trescon employees. Search by name, department, office, or job level. Click any staff member to see their full profile: personal details, role history, contracts, attendance, and documents.

Attendance
Daily attendance records for all staff. Clock-in and clock-out times, late arrivals, early departures, and absences. Syncs automatically from the HRMS attendance data every night.

Leave Management
Full leave management workflow:
- Leave types: Annual Leave, Sick Leave, Emergency Leave, Maternity/Paternity Leave, Privilege Leave, Unpaid Leave, Compensatory Off
- Staff submit leave requests via My HR
- Managers approve or reject requests
- Leave balances update automatically

Timesheets
Project and event time tracking. Shows which events and projects each staff member has logged hours against. Syncs from HRMS project allocations.

Onboarding
When a new staff member joins, an onboarding workflow is created with tasks assigned across HR, IT, and their department. Progress is tracked until all tasks are complete.

Offboarding
When a staff member leaves, an offboarding checklist is generated: equipment return, access revocation, knowledge handover, exit interview. Managed in the HR module.

Contracts
Employment contract records. Type (permanent, fixed-term, probation), start/end dates, grade, and cost centre.

Payroll Grades
Salary grade and cost centre assignments for each staff member. Grades: L1 through Executive.

Performance
Annual and mid-year performance review records. Ratings, comments, and review history.

THE HRMS SYNC

All HR data is automatically pulled from the company HRMS system every night at midnight IST (18:30 UTC). The sync covers:
- Staff profiles (contact details, emergency contacts, work mode)
- Project allocations (which events each person is assigned to)
- Timesheets (hours logged per project)
- Leave balances (all leave types)

Any changes made in the HRMS appear in Event Pilot the next morning. Changes made directly in Event Pilot (leave approvals, onboarding task completion) are stored in the Event Pilot database and do not write back to HRMS.`,
    order_index: 12,
  },

  /* ── 13. MY HR — SELF-SERVICE ──────────────────────────────────── */
  {
    slug: 'my-hr-self-service',
    category: 'User Guide',
    title: 'My HR — Employee Self-Service',
    content: `My HR is the personal HR portal for every Trescon employee. Access it from the navigation bar. It shows your own HR records and lets you take HR actions without going through HR directly.

WHAT YOU CAN SEE IN MY HR

Leave Balances
Your current leave balance for each leave type: Annual Leave, Sick Leave, Emergency Leave, Maternity/Paternity Leave, Privilege Leave, Unpaid Leave, and Compensatory Off. Balances are updated automatically from the HRMS sync.

Leave Requests
Submit a leave request by selecting the type, dates, and reason. Your manager receives a notification and can approve or reject. You are notified of the decision.

Attendance Records
Your personal attendance history. View clock-in/clock-out times, absences, and any anomalies flagged by the system.

Timesheets
Hours you have logged against each event or project. Synced from HRMS.

Employment Details
Your contract type, grade, cost centre, employment start date, and reporting manager.

Documents
HR documents issued to you: offer letter, contract, confirmation letter, warning letters, certificates. Download any document from here.

Onboarding Tasks
If you are a new joiner, your onboarding task checklist appears here. Complete each task and mark it done. Your HR manager tracks your onboarding progress.

SUBMITTING A LEAVE REQUEST
1. Go to My HR
2. Click "Request Leave"
3. Select leave type, start date, end date, and reason
4. Submit — your manager is notified immediately
5. You will receive a notification when it is approved or rejected
6. Approved leave is reflected in your balance the same day`,
    order_index: 13,
  },

  /* ── 14. CONTENT & SOCIAL ──────────────────────────────────────── */
  {
    slug: 'content-social-media-module',
    category: 'Operations Reference',
    title: 'Content & Social Media Module',
    content: `The Content module is the social media planning and production engine for all Trescon events. It generates AI-powered posts for every platform in the event marketing calendar.

CAMPAIGNS

Each event has one or more content campaigns. A campaign defines the social media plan for a specific phase of the event (e.g., "Speaker Announcement Wave", "Countdown to Event", "Post-Event Recap").

Creating a campaign:
1. Go to Content in the navigation
2. Click "New Campaign"
3. Assign it to an event
4. Define the campaign period and narrative theme

POSTS

Each campaign contains individual posts scheduled for specific dates and platforms. Posts can be:
- LinkedIn (professional, 1200–1800 characters)
- Instagram (visual caption, 150–220 characters)
- Facebook (community-focused, 300–400 characters)
- Twitter/X (punchy, 220–240 characters)
- YouTube (description block, ~300 characters)

NARRATIVE ROLES

Every post is assigned a narrative role that defines its purpose in the campaign arc:
- Awareness: Introduce the event to new audiences
- Speaker Highlight: Feature a confirmed speaker
- Sponsor Feature: Spotlight a sponsor
- Countdown: Create urgency before the event
- Live Update: Real-time event day posts
- Testimonial: Post-event delegate quotes
- Recap: Summary and highlights after the event
- CTA: Direct registration or enquiry prompts

AI-GENERATED POSTS

1. Open a campaign
2. Click "Generate Posts"
3. Select the platforms and narrative roles you need
4. The AI (Google Gemini) generates platform-appropriate content for each
5. Review and edit each post
6. Approve posts that are ready to go

APPROVAL WORKFLOW

All posts go through an approval flow before publishing:
- Draft: Created but not yet reviewed
- Approved: Ready to publish
- Rejected: Needs rework — rejection note explains why

Only approved posts can be published.

PUBLISHING

Once posts are approved, they can be published to the connected social media accounts. Connected accounts are managed in Events → Social Accounts. Note: Social account connections require active API tokens from each platform.`,
    order_index: 14,
  },

  /* ── 15. DATA INTELLIGENCE ─────────────────────────────────────── */
  {
    slug: 'data-intelligence-module',
    category: 'Operations Reference',
    title: 'Data & Market Intelligence Module',
    content: `The Data module is the intelligence engine for Trescon's business development, delegate acquisition, and market research. It contains a contact and company database, lead generation tools, and data enrichment capabilities.

THE CONTACT DATABASE

Stores all contacts in the Trescon ecosystem: potential delegates, speakers, sponsors, media partners, and industry contacts. Each contact record contains: name, title, company, email, LinkedIn URL, phone, industry, geography, and engagement history.

THE COMPANY DATABASE

Stores company records linked to contacts: company name, industry, size, country, and associated contacts.

LEAD FINDER (ICP BUILDER)

The Lead Finder uses a conversational AI interface to help you build an Ideal Customer Profile and identify target leads.

How to use it:
1. Go to Data → Lead Finder
2. Describe the type of delegate or sponsor you are looking for (role, industry, geography, company size)
3. The AI asks clarifying questions to refine the ICP
4. Once the profile is confirmed, the system searches the contact database for matches
5. Export the lead list for outreach

EMAIL GUESSER

If you have a contact's name and company domain but not their email address, the Email Guesser predicts the most likely email format and generates the address. The result is flagged with a confidence score.

DATA ENRICHMENT

Enrich existing contact records with additional data from:
- LinkedIn: Job title, company, connections
- Domain Lookup: Company details from their web domain

EXTRACTION TOOLS

Extract structured data from unstructured sources:
- File: Upload a CSV, Excel, or text file — the system extracts and maps the data to contact records
- URL: Paste a webpage URL — the system extracts contact and company information from the page
- Website: Full website scan for contact data extraction

DATA EXPORT

Export any contact or company list to CSV for use in CRM, email campaigns, or outreach tools.`,
    order_index: 15,
  },

  /* ── 16. PILOT AI CHAT ─────────────────────────────────────────── */
  {
    slug: 'pilot-ai-chat',
    category: 'User Guide',
    title: 'Pilot — The Event Pilot AI Assistant',
    content: `Pilot is the internal AI assistant built into Event Pilot. It is available to all staff and answers questions about the platform, learning content, Trescon processes, and how to use AI in your work.

HOW TO ACCESS PILOT
Click "Ask Pilot" in the navigation bar from any page, or go to the Chat section.

WHAT PILOT CAN HELP WITH

Learning and TAIRS
- "What is my TAIRS score and what does it mean?"
- "Which courses should I take first?"
- "Explain the Foundation track"
- "What is the difference between AI-Aware and AI-Ready?"
- "How do I improve my score?"

Platform How-To
- "How do I submit a leave request?"
- "Where do I find the event checklist?"
- "How do I generate an event brand kit?"
- "What is the RACI matrix?"
- "How does the course recommendation engine work?"

AI in Your Work
- "How can AI help with email writing?"
- "What AI tools work for presentations?"
- "How do I use ChatGPT for data analysis?"

WHAT PILOT WILL NOT DO

Pilot is scoped specifically to Event Pilot and Trescon work. It will politely decline to:
- Answer general knowledge questions unrelated to your work
- Give personal advice or opinions on non-work topics
- Provide specific HR decisions (leave approvals, salary queries — go to HR directly)
- Share other employees' personal data or TAIRS scores
- Speculate on company strategy or decisions

DAILY USAGE LIMIT
Pilot has a daily usage limit per user to manage AI API costs. The limit resets at midnight. If you hit the limit, try again the next day or contact your admin.

PILOT IS NOT A SEARCH ENGINE
Pilot reads from the platform documentation and its training context. For specific data (your exact TAIRS score, leave balance, course progress), check your dashboard — those numbers are real-time. Pilot gives you guidance and context; your dashboard gives you your data.`,
    order_index: 16,
  },

  /* ── 17. SECURITY & ACCESS ─────────────────────────────────────── */
  {
    slug: 'security-and-access-control',
    category: 'Technical Reference',
    title: 'Security and Access Control',
    content: `Event Pilot uses a multi-layer security model to protect staff data and platform access.

LOGIN SECURITY

Brute Force Protection
Every login attempt is logged. After 5 failed attempts within 15 minutes, the account is locked for 15 minutes. This prevents automated password guessing. Contact your admin if you are locked out before the window expires.

IP Allowlisting (Optional)
The platform can be configured to allow logins only from Trescon office IP addresses. When enabled, staff logging in from outside the office network will be blocked. Admins (dept_head and above) are exempt from IP restrictions and can log in from anywhere.

Password System
Staff are issued a default password on first login (trescon@2026). Staff are encouraged to change their password after first login. Passwords are stored as bcrypt hashes — not plain text. Admins can reset any staff member's password from the Admin Dashboard.

Session Management
Sessions are stored as httpOnly cookies (cannot be read by browser JavaScript). Sessions expire after 8 hours of inactivity. Logging out clears the session immediately.

ACCESS LEVELS

Every staff member has a job_level that determines what they can see and do:
- staff: Personal dashboard, My HR, course library, Pilot chat
- team_lead: Above + Team Dashboard for direct reports
- dept_head: Above + full department view
- office_head: Above + full office view + Admin access
- super_admin: Full platform access across all offices

AUDIT LOG

Every login attempt (success and failure) is recorded with:
- Email address
- IP address
- Timestamp
- Outcome (success, wrong password, rate limited, IP blocked, account disabled)

Admins can view the audit log via the Security section.

DATA PRIVACY

Individual TAIRS scores and task profiles are visible to the staff member and their direct manager chain. Department aggregates are visible to department heads. All raw data is stored in Supabase with server-side access controls. No individual data is exposed to the browser without a valid authenticated session.`,
    order_index: 17,
  },

  /* ── 18. TECHNICAL ARCHITECTURE ────────────────────────────────── */
  {
    slug: 'technical-architecture',
    category: 'Technical Reference',
    title: 'Platform Architecture and Technology Stack',
    content: `Event Pilot is a full-stack Next.js web application. This document describes the technology stack, data architecture, and key integration points for technical administrators.

TECHNOLOGY STACK

Frontend: Next.js App Router, React, TypeScript. Font: Manrope. All styling is inline CSS — no CSS framework dependency. Fully server-rendered where possible; client components where interactivity is required.

Backend: Next.js API routes (serverless functions deployed on Vercel). All database operations are server-side only. No credentials are exposed to the browser.

Database: Supabase (PostgreSQL). Multiple Supabase projects:
- Main DB: All Event Pilot operational data (staff, courses, events, HR, content)
- HRMS DB: Read-only connection to the company HR system for nightly sync
- SmartData DB: Contact and company intelligence database

AI: Google Gemini API (gemini-2.5-flash). Used for course generation, social content, insights reports, brand generation, lead finder conversations, and Pilot chat.

Email: Resend. All transactional emails — welcome, password reset, course completion, notifications. From address: noreply@eventpilot.tresconglobal.com.

Hosting: Vercel. Serverless functions, automatic SSL, GitHub-connected deploys.

Event Site Hosting: Cloudflare. Event websites with custom domains are deployed to Cloudflare Workers for global edge delivery.

CRON JOBS

Three scheduled jobs run automatically:

HRMS Sync (Daily midnight IST via cron-job.org)
Connects to the HRMS Supabase instance, pulls staff profiles, project allocations, timesheets, and leave balances, then upserts into the main Event Pilot database.

Attendance Sync (Daily 01:00 UTC via Vercel Cron)
Pulls last 2 days of attendance records from HRMS and syncs to Event Pilot.

Weekly Insights (Sunday 14:30 UTC via cron-job.org)
Runs a full TAIRS analysis of all staff task submissions through Gemini. Produces a weekly insights report covering AI readiness distribution, shared pain clusters, and recommended platform priorities.

KEY DATABASE TABLES

staff_members — All 300 Trescon employees. Source of truth for identity, hierarchy, and access.
courses — The full course library with content, tasks, and assessment questions.
staff_task_profiles — TAIRS questionnaire responses (one record per staff member, JSONB array of tasks).
course_completions — Every passed course assessment.
events — All Trescon events with status, team, and metadata.
event_checklist — 61-task planning checklist per event.
staff_attendance — Daily attendance records synced from HRMS.
staff_leave_requests — Leave request workflow.
content_campaigns and content_posts — Social media campaigns and posts.
platform_docs — This knowledge base.`,
    order_index: 18,
  },

  /* ── 19. FAQ ────────────────────────────────────────────────────── */
  {
    slug: 'faq',
    category: 'User Guide',
    title: 'Frequently Asked Questions',
    content: `WHY IS MY TAIRS SCORE 0?
You have not yet completed the AI Readiness Questionnaire. Go to your dashboard and click "Take Assessment". It takes 10–15 minutes. Your score updates immediately after submission.

CAN I RETAKE THE QUESTIONNAIRE?
Yes. Retake it every 4–6 weeks as your AI usage grows. Each retake updates your score. Only your most recent responses are used for scoring.

CAN I RETAKE A COURSE ASSESSMENT?
Yes. Attempt any assessment as many times as you need. You need 60% or above (3 out of 5 questions correct) to pass. Once you pass, the course is marked complete.

WHY AM I SEEING CERTAIN COURSES AND NOT OTHERS?
Your course list is personalised based on your TAIRS score, department, mandatory course status, and job level. Browse all courses in the Course Library — you can start any course at any time.

I AM A MANAGER — WHY DON'T I SEE MY TEAM?
The Team Dashboard appears only if your manager_id is set as the manager for at least one other staff member. Contact HR to ensure your reporting structure is correctly configured.

HOW DO I SUBMIT A LEAVE REQUEST?
Go to My HR in the navigation and click "Request Leave". Select type, dates, and reason. Your manager is notified and will approve or reject. You are notified of the decision.

WHERE DO I SEE MY ATTENDANCE RECORDS?
Go to My HR → Attendance. Your full clock-in/clock-out history is there. Records sync from HRMS nightly.

WHERE IS THE EVENT CHECKLIST?
Go to Events → select your event → Plan tab. The full 61-task checklist is there, filterable by workstream, priority, and status.

HOW DO I GENERATE AN EVENT WEBSITE?
Go to Events → select your event → Website tab. Use the builder to set up all sections, then click Publish. For a custom domain, go to Website → Custom Domain and follow the Cloudflare setup steps.

WHAT IS PILOT?
Pilot is the platform's built-in AI assistant. Click "Ask Pilot" in the navigation. It answers questions about the platform, learning content, and how to use AI in your Trescon work.

HOW OFTEN SHOULD I USE THE LEARNING PLATFORM?
Aim for one course per week. From AI-Unaware, you can reach AI-Aware in 6 weeks and AI-Ready in 12 weeks. More courses are added continuously.

WHAT AI TOOLS DO I NEED FOR THE COURSES?
Foundation courses use ChatGPT or Claude (both free). Adoption courses may use Canva AI (free tier) or Otter.ai. Advanced courses use specialist tools. You do not need paid tools for foundation or adoption tracks.

IS MY DATA PRIVATE?
Your task profiles and scores are visible to you and your direct manager chain. Department aggregates are visible to department heads. Super Admins can see all individual data. No data is exposed outside Trescon.

MY ACCOUNT IS LOCKED — WHAT DO I DO?
After 5 failed login attempts, your account locks for 15 minutes automatically. Wait 15 minutes and try again. If you need immediate access, contact your admin to reset the lockout.

HOW DO I RESET MY PASSWORD?
On the login screen, click "Forgot Password". Enter your Trescon email and you will receive a password reset link. If you are already logged in, go to your profile settings to change your password.`,
    order_index: 19,
  },

  /* ── 20. NOTIFICATIONS ─────────────────────────────────────────── */
  {
    slug: 'notifications',
    category: 'How the Platform Works',
    title: 'Notifications and Alerts',
    content: `Event Pilot sends in-app notifications to keep you informed about activity that affects you.

WHERE TO SEE NOTIFICATIONS
The notification bell in the navigation bar shows your unread count. Click it to see your latest 5 unread notifications. Notifications are also shown on your personal dashboard.

TYPES OF NOTIFICATIONS

Course Published
When a course you suggested has been reviewed and approved by an admin, you receive a notification: "Your course suggestion is live. [Course name] has been published to the library."

Course Pending Review (Admins only)
When any staff member submits a new course suggestion via the AI course generator, the super admin receives a notification: "New course pending your approval. [Course name] has been submitted for review."

Leave Request Update
When your leave request is approved or rejected by your manager, you receive a notification with the outcome.

HR Alerts
Scheduled HR reminders: contract expiry warnings, probation end dates, document renewal reminders. These are generated by the HR module and sent to the relevant staff member and their manager.

NOTIFICATION BEHAVIOUR
- Notifications are marked as read when you view them
- Unread notifications appear on your dashboard
- Up to 5 unread notifications are shown in the bell dropdown
- All notifications are stored and remain accessible even after being read`,
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
