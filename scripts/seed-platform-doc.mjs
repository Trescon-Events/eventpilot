/**
 * Seeds the Trescademy Platform Document into platform_docs table
 * so Tresci AI has full platform knowledge when answering questions.
 *
 * Run: node scripts/seed-platform-doc.mjs
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = 'https://pswlyezrvygcmpjkpjwu.supabase.co'
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY. Run with: SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-platform-doc.mjs')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const DOCS = [
  {
    slug:        'platform-overview',
    category:    'Platform Overview',
    title:       'What Is Trescademy',
    order_index: 0,
    content: `Trescademy is Trescon Global's internal AI learning and readiness platform. It serves all 300 staff across four offices — Dubai, Bangalore, Mangalore, and Manipal.

The platform has one primary purpose: measure where every employee stands in their AI readiness today, then guide them — course by course — toward becoming confident AI practitioners in their specific role.

Trescademy is not a generic e-learning platform. Every course, every recommendation, and every score is calibrated to the work Trescon employees actually do: running events, selling sponsorships, managing campaigns, handling finance, leading teams, and building deals across 80+ countries.

THE WEEKLY LOOP

The platform runs on a continuous loop:
1. Staff complete the AI Readiness Questionnaire
2. The system calculates their TAIRS score (AI Readiness Score, 0–100)
3. The recommendation engine assigns a personalised learning path
4. Staff take courses and complete assessments
5. Scores update. The loop continues.

Managers see their team's progress. Admins see the full organisation. Everyone has a personal dashboard that belongs to them.`,
  },
  {
    slug:        'tairs-scoring',
    category:    'How the Platform Works',
    title:       'TAIRS Scoring System',
    order_index: 1,
    content: `TAIRS stands for Trescon AI Readiness Score. It is a number from 0 to 100 representing how embedded AI is in a staff member's current daily work.

HOW IT IS CALCULATED

When you complete the AI Readiness Questionnaire, you describe your daily work tasks. For each task, the system records an AI Readiness reading on a scale of 1 to 5:
- 1 = No AI involvement in this task at all
- 2 = Occasionally aware of AI for this task
- 3 = Sometimes uses AI for this task
- 4 = Regularly uses AI for this task
- 5 = AI is fully integrated into this task

Formula: score = round(((average - 1) / 4) × 65 + 10)

THE FIVE TIERS

AI-Forward (75–100) → Advanced Track
AI-Ready (55–74) → Advanced Track
AI-Aware (35–54) → Adoption Track
AI-Curious (15–34) → Foundation Track
AI-Unaware (0–14) → Foundation Track

HOW TO IMPROVE YOUR SCORE

Your score updates every time you retake the questionnaire. The way to move your score up is not to answer differently — it is to genuinely start using AI for more of your tasks. Take a course, apply it to real work, then retake the assessment.`,
  },
  {
    slug:        'recommendation-engine',
    category:    'How the Platform Works',
    title:       'How the Recommendation Engine Works',
    order_index: 2,
    content: `Every individual on Trescademy sees a personalised course list. The recommendation engine scores every uncompleted course using five signals, then ranks them.

THE FIVE SCORING SIGNALS

Signal 1: Mandatory and Not Done (+50 points)
Compliance always comes first. Mandatory courses appear at the top regardless of track or department.

Signal 2: Track Alignment (+30 points)
If a course belongs to your current learning track (based on your TAIRS score), it is a strong match.

Signal 3: Department Match (+25 points)
If a course is tagged for your department, it receives a relevance boost.

Signal 4: Foundation Gap (+20 points)
If you are on the Adoption or Advanced track but have completed fewer than 3 foundation courses, the system boosts foundation courses for you first.

Signal 5: Job-Level Boost (+15 points)
Team leads and above get management and strategy courses boosted.

After rule-based scoring, Google Gemini AI reviews your full profile and re-ranks the top courses with a personalised reason for each one. This means your "Next Up" course is chosen specifically for you — your department, your role, your score, your gaps.

Each recommendation is labelled: "Required for all staff", "Recommended for your department", "Next in your track", "Complete your foundation first", "Relevant to your management role", or "AI-picked" with a personalised reason.`,
  },
  {
    slug:        'course-structure',
    category:    'How the Platform Works',
    title:       'Courses, Tracks, and Assessments',
    order_index: 3,
    content: `Trescademy has 20 courses organised into three tracks aligned with your TAIRS score.

THE THREE TRACKS

Foundation Track (AI-Unaware and AI-Curious)
Covers the essentials: what AI is, how ChatGPT works, writing with AI, AI tools for your role, meeting AI, and the broader landscape. Most are 15–20 minutes.

Adoption Track (AI-Aware)
Covers systematic AI usage: email, data, presentations, social media, brand strategy, process mapping. Most are 25–30 minutes.

Advanced Track (AI-Ready and AI-Forward)
Covers AI leadership, automation building, team AI strategy, and creative production systems. Most are 35–45 minutes.

COURSE STRUCTURE

Every course has five components:
1. Overview — Why this matters for your specific role
2. Read — Full course content (practical, no theory for its own sake)
3. Tasks — 4 real-world tasks you complete using AI tools
4. Assessment — 5 personalised questions based on your task submission
5. Score — You need 60% or above to pass

AI-POWERED ASSESSMENTS

The 5 assessment questions are generated by AI specifically from what you submitted in the task steps. This means every person gets different questions based on what they actually wrote. You cannot share answers with a colleague because their questions are different from yours.

Each question has a 45-second timer. You see one question at a time. This prevents looking up answers on a second device during the test.

You can retake any assessment as many times as needed. Each attempt is recorded.`,
  },
  {
    slug:        'admin-features',
    category:    'Administration',
    title:       'Admin Dashboard and Management Features',
    order_index: 4,
    content: `Administrators have access to the Admin Dashboard — the control centre for the entire platform.

THE ADMIN DASHBOARD HAS 10 TABS

Overview: Org-wide stats, office breakdown, participation metrics, demo mode indicator.

All Staff: Every staff member with their TAIRS score, tier, department, and office.

Intelligence: AI-generated weekly org intelligence reports showing readiness trends, gaps, and recommendations for leadership.

Staff Learning: Course completion data — by course, by department, by individual. See which mandatory courses are outstanding.

Playbook: Read-only preview of the full AI Readiness Questionnaire for any department.

Content Studio: Describe a learning gap → Google Gemini designs a full course (overview, tasks, 10 quiz questions) → submit for review → super admin approves → course goes live. The person who suggested the course gets credited and notified.

Staff Management: Bulk CSV import of staff records. Gemini maps your column headers automatically. After import, credentials download for HR to distribute.

Events: Create and manage Trescon events. Assign staff to events. Staff see their events on their personal dashboard.

Knowledge Base: Upload company documents (policies, event briefs, onboarding materials). PDF text is extracted and stored — the file is never kept. Staff can ask Tresci about uploaded documents.

Review Queue: All courses submitted via Content Studio appear here for super admin approval before going live to staff.

CONTENT STUDIO FLOW

1. Admin describes the learning gap
2. Selects target department and tier level
3. Names the person who identified the gap (they get credited)
4. Gemini generates the full course in seconds
5. Admin reviews and clicks Submit for Review
6. Course saved as draft — not visible to staff
7. Super admin sees a notification and reviews in Review Queue
8. Approve → course goes live. Reject → course deleted.`,
  },
  {
    slug:        'tresci-assistant',
    category:    'Platform Reference',
    title:       'Tresci — Your AI Learning Assistant',
    order_index: 5,
    content: `Tresci is the internal AI assistant built into Trescademy. You can access Tresci from the navigation bar or from the Ask Tresci button on any document card.

WHAT TRESCI CAN HELP WITH

- How your TAIRS score works and how to improve it
- Which courses to take and why they were recommended for you
- How to use the platform — navigation, dashboards, assessments
- What the different tiers mean and what each track covers
- General questions about AI tools covered in the courses
- Questions about company policies, event briefs, and documents uploaded to the Knowledge Base

WHAT TRESCI WILL NOT DO

Tresci stays focused on Trescademy and your AI learning journey. It will not answer questions about news, sport, entertainment, food, weather, or any topic outside its defined scope. It will not give legal, medical, financial, or HR compliance advice — those questions go to the appropriate team.

HOW IT IS PERSONALISED

When you ask Tresci a question, it already knows your name, department, TAIRS score, tier, and which courses you have completed. It will reference these when answering — for example, suggesting your next course by name or explaining why your score is at its current level.

DAILY LIMIT

You have 20 questions per day with Tresci. This resets at midnight. Questions are counted server-side so clearing your browser history does not reset the limit.`,
  },
  {
    slug:        'hierarchy-access',
    category:    'Administration',
    title:       'Reporting Hierarchy and Access Levels',
    order_index: 6,
    content: `Trescademy uses a live reporting hierarchy. Every staff member has a manager assigned. The system automatically calculates who reports to whom — including indirect reports.

ACCESS LEVELS

Staff: Personal Dashboard only. See their own score, courses, recommendations.

Team Lead: Personal Dashboard + Team Dashboard. See direct reports' TAIRS scores, tiers, and completion data.

Department Head: Personal Dashboard + Team Dashboard showing full department hierarchy — team leads and their reports included.

Office Head: Personal Dashboard + Team Dashboard showing the entire office. Also has access to Admin Dashboard.

Super Admin: Full access to everything across all offices.

TEAM DASHBOARD

The Team Dashboard shows every person who reports to you — directly and through the chain. For each team member you see their TAIRS score, tier, track, courses completed, and last activity.

The Team Health Brief is an AI-generated summary of your team's readiness — written by Gemini — covering the overall picture, the biggest gap department, and three recommended actions. It takes about 10 seconds to generate.

SCOPE IS AUTOMATIC

When a new staff member is imported and their manager is set, they immediately appear on their manager's Team Dashboard. No manual configuration is needed. Promoting someone updates their access automatically.`,
  },
  {
    slug:        'staff-onboarding',
    category:    'User Guide',
    title:       'Getting Started as a Staff Member',
    order_index: 7,
    content: `STEP 1: LOG IN
Go to the platform URL provided by HR. Use your work email and the temporary password from your welcome message. You will land on your personal dashboard.

STEP 2: CHOOSE YOUR DEPARTMENT
If your department has not been set, you will see a department selection screen. Choose the one that best matches your role. This determines which questions you are asked in the questionnaire.

STEP 3: COMPLETE THE QUESTIONNAIRE
The questionnaire asks you to describe your daily work tasks and rate how much AI you currently use for each. Answer honestly — the score only helps you if it reflects your real situation. The questionnaire takes 10–15 minutes.

STEP 4: CHECK YOUR TAIRS SCORE
After completing the questionnaire, your dashboard shows your AI Readiness Score, your tier, and your current learning track.

STEP 5: START YOUR RECOMMENDED COURSE
Your dashboard shows your Next Up course — the highest-priority recommendation chosen for you based on your score, department, mandatory requirements, and job level.

STEP 6: COMPLETE THE COURSE
Read the content, complete the four task steps, and take the 5-question assessment. You need 3 out of 5 correct to pass. You can retake as many times as needed.

STEP 7: REPEAT
After completing a course, your Next Up updates to the next recommendation. Work through your list. Retake the questionnaire after 4–6 weeks to see your score improve.

UNDERSTANDING YOUR DASHBOARD
- TAIRS Score: Your AI readiness out of 100
- Tier: AI-Unaware → AI-Curious → AI-Aware → AI-Ready → AI-Forward
- Learning Track: Foundation, Adoption, or Advanced
- Next Up: Your top personalised course recommendation
- Recommended For You: Your next 5 courses with the reason each was chosen
- My Events: Events you have been assigned to by the admin team
- Knowledge Base: Company documents you have access to`,
  },
  {
    slug:        'platform-tech',
    category:    'Technical Reference',
    title:       'Platform Technology and Architecture',
    order_index: 8,
    content: `Trescademy is built on Next.js 16 (App Router) with React 19, TypeScript, and Supabase (PostgreSQL) as the database.

TECHNOLOGY STACK
- Framework: Next.js 16.2.4 with App Router
- Language: TypeScript (strict mode)
- Frontend: React 19
- Database: Supabase (PostgreSQL)
- AI: Google Gemini 2.0 Flash
- Auth: bcryptjs password hashing
- PDF Processing: pdf-parse (text extracted, file never stored)
- Hosting: Vercel
- Font: Manrope

AI FEATURES POWERED BY GEMINI
1. Tresci Chat — answers staff questions using platform knowledge and staff profile
2. Course Recommendations — personalised ranking with reasons
3. Course Generation (Content Studio) — full course from a description
4. Assessment Questions — personalised from each staff member's task submission
5. Team Health Brief — written summary for managers
6. Staff Import Parser — maps any CSV headers to the database schema

DATA PRIVACY
Individual TAIRS scores and task profiles are visible to the staff member and their direct manager. Department and office aggregate data is visible to department heads and above. No individual performance data is exposed publicly. All data is stored in Supabase with server-side access controls. Uploaded documents have their text extracted server-side — the original file is destroyed immediately and never stored.

COST
The platform is designed to run under $25 per month at full capacity (300 staff). Supabase free tier handles up to 500MB of data. Google Gemini free tier handles 1,500 requests per day. At scale, estimated total cost is $3–5/month for AI and $0–25/month for Supabase depending on data volume.`,
  },
  {
    slug:        'faq',
    category:    'User Guide',
    title:       'Frequently Asked Questions',
    order_index: 9,
    content: `WHY IS MY TAIRS SCORE 0?
You have not yet completed the AI Readiness Questionnaire. Go to your dashboard and look for the Take Assessment button. The questionnaire takes 10–15 minutes.

CAN I RETAKE THE QUESTIONNAIRE?
Yes. You should retake it every 4–6 weeks as your AI usage grows. Each retake updates your score. Only your most recent task profiles are used for scoring.

CAN I RETAKE A COURSE ASSESSMENT?
Yes. You can attempt any assessment as many times as you need. You need 60% or above (3 out of 5 correct) to pass. Once you pass, the course is marked complete.

WHY AM I SEEING CERTAIN COURSES AND NOT OTHERS?
Your course list is personalised. The recommendation engine considers your TAIRS score, your department, mandatory courses, and your job level. You can browse all courses in the Course Library.

I AM A MANAGER — WHY DON'T I SEE MY TEAM?
The Team Dashboard appears only if at least one staff member has you set as their manager. This is configured during the HR staff import. Contact your HR administrator if you believe your team should appear.

HOW OFTEN SHOULD I USE THE PLATFORM?
Aim for one course per week. Your full foundation track (starting from AI-Unaware) takes 6 weeks. Adoption track takes another 6 weeks. You should reach AI-Ready within 90 days of starting.

WHAT TOOLS DO I NEED?
Most foundation and adoption courses use ChatGPT (free) or Claude (free). Some use Canva AI (free tier) or Otter.ai. You do not need paid tools to complete the foundation or adoption tracks.

IS MY DATA PRIVATE?
Your individual task profiles and scores are visible to you and your direct manager. Aggregate data is visible to department heads and above. Super Admins can see all individual data.

WHY ARE MY ASSESSMENT QUESTIONS DIFFERENT FROM MY COLLEAGUE'S?
The 5 questions in each assessment are generated by AI from what you specifically wrote in your task submission. This is intentional — it ensures you are tested on your own understanding, not generic knowledge that can be shared.

WHAT DOES THE TIMER ON EACH QUESTION MEAN?
You have 45 seconds per question. A circle depletes in real time. This is a feature of the platform's learning integrity system — it encourages genuine engagement with the material.`,
  },
]

async function seed() {
  console.log('Seeding platform document into platform_docs...\n')

  for (const doc of DOCS) {
    const { error } = await supabase
      .from('platform_docs')
      .upsert(doc, { onConflict: 'slug' })

    if (error) {
      console.error(`Failed: ${doc.title} —`, error.message)
    } else {
      console.log(`Seeded: ${doc.title}`)
    }
  }

  console.log('\nDone. Tresci now has full platform knowledge.')
}

seed()
