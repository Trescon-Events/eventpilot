import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

const ADMIN_CODE = process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'eventpilot2026'

const COURSES = [
  /* ─── FOUNDATION 1 ─────────────────────────────────────────── */
  {
    title:     'ChatGPT for Your Daily Work',
    subtitle:  'Your first AI colleague — how to actually use it',
    tool_name: 'ChatGPT',
    tier_level: 'foundation',
    dept_tags:  [],
    is_mandatory: true,
    overview:  `Most people type a question into ChatGPT like it's a search engine — and get a mediocre answer. That's not how it works. ChatGPT is a conversation partner, not a lookup tool. When you give it context, role, and a clear task, the output transforms completely.\n\nFor Trescon staff, this means writing proposals faster, summarising meeting notes in seconds, drafting emails without staring at a blank screen, and getting structured plans instead of generic advice.\n\nBy the end of this course you will use ChatGPT as a daily work tool — not just when you remember it exists.`,
    read_content: `# How ChatGPT Actually Works\n\nChatGPT predicts the most useful next word based on everything you've told it. It doesn't "know" things the way Google does — it reasons from what you give it. This is why context is everything.\n\n## The 3-Part Prompt Formula\n\nEvery good prompt has three parts:\n\n**1. Role** — Tell it who it is.\n> "You are an experienced event coordinator at a B2B events company."\n\n**2. Task** — Tell it exactly what to do.\n> "Write a vendor confirmation email for our upcoming summit on 12 June in Dubai."\n\n**3. Context** — Give it the details.\n> "The vendor is handling AV setup. The venue is Atlantis The Palm. The contact is Ravi Shah."\n\nCombined:\n> "You are an experienced event coordinator at a B2B events company. Write a vendor confirmation email for our upcoming summit on 12 June in Dubai. The vendor is handling AV setup. The venue is Atlantis The Palm. The contact is Ravi Shah."\n\nThat single prompt gives you a professional, ready-to-send email in 10 seconds.\n\n## What ChatGPT Is Great At\n- First drafts (emails, reports, proposals, social posts)\n- Summarising long documents (paste the text, ask for a summary)\n- Creating structured plans (ask for step-by-step with deadlines)\n- Rewriting content in a different tone\n- Answering "how do I do X in [tool]" questions\n\n## What ChatGPT Gets Wrong\n- Real-time facts (use Google for news, prices, live data)\n- Confidential Trescon data (never paste client names, financials, or contracts)\n- Maths with complex numbers (verify important calculations yourself)\n\n## The Iteration Rule\nIf the first answer isn't what you wanted, don't give up — refine. Say: "That's too formal. Make it shorter and more conversational." ChatGPT improves with every instruction.`,
    task_steps: [
      { step: 1, instruction: 'Open ChatGPT (chat.openai.com) and log in or create a free account.', tip: 'Free account gives you GPT-4o — that\'s the one you want.' },
      { step: 2, instruction: 'Think of one real email or document you need to write today at work. Use the 3-part formula: Role + Task + Context. Type your prompt.', tip: 'Be specific. Instead of "write an email to a vendor", say "write a polite follow-up email to our venue AV vendor who hasn\'t confirmed setup times for our 15 June Dubai summit."' },
      { step: 3, instruction: 'Read the output. Now ask ChatGPT to change one thing — tone, length, or add a detail it missed. Type your follow-up instruction.', tip: 'This is the key skill: iterating. The first answer is a draft, not the final.' },
      { step: 4, instruction: 'Try one more prompt: paste any piece of text (a long email, a report, a WhatsApp thread) and ask ChatGPT to "Summarise this in 5 bullet points".', tip: 'Works with meeting notes, client briefs, long email chains.' },
    ],
    questions: [
      {
        question: 'You paste a 3-line question into ChatGPT and the answer is too generic. What is the most likely reason?',
        options: ['ChatGPT is broken', 'You didn\'t give it enough context or role', 'You need to use the paid version', 'ChatGPT doesn\'t understand your industry'],
        correct_index: 1,
        explanation: 'Context and role are what turn generic answers into specific, useful ones. A longer, more detailed prompt almost always produces a better result.',
      },
      {
        question: 'Which of these tasks is ChatGPT best suited for?',
        options: ['Checking today\'s flight prices', 'Writing a first-draft proposal for a new sponsorship package', 'Running financial calculations for the Q3 board report', 'Sending a WhatsApp message on your behalf'],
        correct_index: 1,
        explanation: 'ChatGPT excels at writing tasks — drafts, summaries, plans, rewrites. It\'s not a search engine or data source.',
      },
      {
        question: 'You need to draft an event brief for an upcoming summit. Which prompt will get the best result?',
        options: [
          '"Write an event brief"',
          '"Write a one-page event brief for the Trescon AI Summit, Dubai, 15 June 2026, targeting 200 CXOs from banking and fintech. Include agenda structure, logistics, and speaker slots."',
          '"What is an event brief?"',
          '"Give me some ideas for a summit"',
        ],
        correct_index: 1,
        explanation: 'The more specific the task, audience, date, and format, the more directly useful the output will be.',
      },
      {
        question: 'A colleague says "I tried ChatGPT once, the answer was wrong, so I stopped using it." What is the correct response?',
        options: [
          'Agree — AI isn\'t reliable',
          'ChatGPT is only right when you pay for it',
          'One wrong answer doesn\'t mean it\'s always wrong — refine your prompt and verify facts for anything critical',
          'They should use Google instead',
        ],
        correct_index: 2,
        explanation: 'ChatGPT improves dramatically with better prompts. Factual claims in any output — from AI or humans — should be verified if they\'re going to be used in important documents.',
      },
      {
        question: 'Which of these should you NEVER paste into ChatGPT?',
        options: [
          'A vendor\'s public LinkedIn profile',
          'A long meeting transcript to summarise',
          'Trescon client contracts, financial data, or confidential internal documents',
          'An article you want to understand better',
        ],
        correct_index: 2,
        explanation: 'Pasting confidential business data into public AI tools is a data security risk. Use AI for public-safe content only — or use an enterprise-licensed tool for sensitive material.',
      },
    ],
  },

  /* ─── FOUNDATION 2 ─────────────────────────────────────────── */
  {
    title:     'AI Basics: What It Can and Can\'t Do',
    subtitle:  'Build a clear mental model so you use AI confidently',
    tool_name: null,
    tier_level: 'foundation',
    dept_tags:  [],
    is_mandatory: true,
    overview:  `Half the people who say "AI doesn't work for me" are using it for the wrong things. The other half have inflated expectations and get disappointed. This course cuts through both problems.\n\nYou'll build a clear mental model of what AI tools actually are, what tasks they genuinely accelerate, and where human judgment still beats the machine. This mental model is the foundation for everything else in the Event Pilot training path.`,
    read_content: `# What AI Tools Actually Are\n\nModern AI tools like ChatGPT, Gemini, and Claude are **large language models** — they predict what text comes next based on patterns trained on enormous amounts of human writing. They are extraordinary at language tasks. They are not magic, not infallible, and not a replacement for thinking.\n\n## The Spectrum of AI Capability\n\n### Where AI consistently beats humans\n- **Speed on routine language tasks** — writing, summarising, reformatting, translating\n- **Pattern recognition** in large text datasets\n- **Generating multiple options** quickly (give me 10 subject lines for this email)\n- **Converting formats** (text to JSON, bullet points to a table, etc.)\n\n### Where AI is useful but needs oversight\n- **Research starting points** — it gives you a useful first frame, not ground truth\n- **Complex documents** — good structure, but facts need checking\n- **Creative work** — strong at output volume, weaker on originality and brand voice\n\n### Where humans are still essential\n- **Judgment calls** that depend on relationships, context, or stakes\n- **Real-time facts** — AI's knowledge has a cutoff; it doesn't browse the web unless told to\n- **Emotional intelligence** — reading a room, handling a sensitive client, navigating conflict\n- **Accountability** — a human is always responsible for the output, even if AI wrote the draft\n\n## The Three Categories of AI Tools\n\n**Text AI** — ChatGPT, Claude, Gemini: writing, summarising, coding, Q&A\n\n**Image AI** — Midjourney, DALL-E, Adobe Firefly: visual design, concept art, image editing\n\n**Workflow AI** — n8n, Zapier AI, Make: connecting tools, automating multi-step processes\n\nAt the Foundation level, text AI is where you start.\n\n## The Accountability Rule\nAI produces a draft. A human produces the final output. Everything that carries Trescon's name goes through a human review before it's sent or published. This isn't a limitation — it's how you get speed AND quality.`,
    task_steps: [
      { step: 1, instruction: 'List 3 tasks you do regularly at work that involve mostly writing or summarising. Write them down.', tip: 'Examples: writing recap emails, filling out reports, drafting social posts, summarising meeting notes.' },
      { step: 2, instruction: 'For each task, estimate how long it takes you today. Then write a guess: how fast could AI do the first draft?', tip: 'The goal is to spot your highest-ROI opportunities, not to automate everything.' },
      { step: 3, instruction: 'List 2 tasks from your role where you believe human judgment is critical and AI should not take over.', tip: 'These are your "protect" tasks — things that need your experience, relationships, or accountability.' },
      { step: 4, instruction: 'Open ChatGPT or Gemini and give it one of your writing tasks as a prompt. See how close the output gets on the first try.', tip: 'Don\'t judge AI on the first prompt. Try refining it once. That\'s the real test.' },
    ],
    questions: [
      {
        question: 'What are large language models (LLMs) like ChatGPT and Gemini trained to do?',
        options: ['Search the internet in real time', 'Predict the most useful next word based on patterns in training data', 'Store and retrieve Trescon documents', 'Make decisions based on company policy'],
        correct_index: 1,
        explanation: 'LLMs are fundamentally text prediction systems. They generate language, not facts. This is why they\'re powerful for writing tasks and why their factual claims need checking.',
      },
      {
        question: 'Which task is the BEST use of a text AI tool at Trescon?',
        options: ['Approving a vendor invoice', 'Generating a first-draft email recap for a client meeting', 'Deciding which sponsorship package to offer a new client', 'Reading a client\'s body language during a pitch'],
        correct_index: 1,
        explanation: 'Text generation — especially drafts — is exactly where AI tools shine. Approval, judgment, and interpersonal tasks remain human responsibilities.',
      },
      {
        question: 'You\'ve asked an AI tool a question about Trescon\'s 2025 revenue and it gave you specific numbers. What should you do?',
        options: ['Use the numbers — AI is accurate', 'Ignore AI tools for all financial questions forever', 'Verify the numbers against the actual source before using them', 'Ask the AI again to confirm'],
        correct_index: 2,
        explanation: 'AI tools can generate plausible-sounding but incorrect numbers. Always verify factual claims — especially financial figures — against authoritative sources.',
      },
      {
        question: 'The Accountability Rule in this course states that:',
        options: [
          'AI is responsible for its own output',
          'AI tools are only safe for personal use, not professional',
          'A human reviews and is responsible for every AI-generated output before it\'s used',
          'Only senior staff can use AI tools at Trescon',
        ],
        correct_index: 2,
        explanation: 'Speed and quality combine only when AI writes the draft and a human reviews it. The person who sends the document is always accountable for what it says.',
      },
      {
        question: 'What is the correct role of Workflow AI tools like n8n or Zapier AI?',
        options: ['Replacing email clients', 'Connecting different tools and automating multi-step processes without manual input', 'Writing long-form content', 'Managing your calendar'],
        correct_index: 1,
        explanation: 'Workflow AI specialises in connecting tools and automating sequences — e.g., when a form is submitted, create a Trello card, send a confirmation email, and log it in a spreadsheet. It\'s orchestration, not writing.',
      },
    ],
  },

  /* ─── ADOPTION 1 ─────────────────────────────────────────── */
  {
    title:     'Prompt Engineering: Getting 10x Better Outputs',
    subtitle:  'Move beyond basic queries — build prompts that actually work',
    tool_name: 'ChatGPT / Claude / Gemini',
    tier_level: 'adoption',
    dept_tags:  [],
    is_mandatory: true,
    overview:  `You've used AI tools. You know the basics. Now the gap between you and someone who gets genuinely useful output every time comes down to one skill: prompt engineering.\n\nThis isn't jargon — it's the practice of structuring your instructions so that AI can give you the exact answer you need. Professionals who master this skill do in 2 minutes what others take 30 minutes to produce.\n\nThis course covers the five most powerful prompting techniques used by Trescon's highest-scoring staff.`,
    read_content: `# Five Prompting Techniques That Change Everything\n\n## 1. Chain-of-Thought Prompting\nAdd "Think step by step" to complex questions. This forces the model to reason through the problem rather than jump to a conclusion.\n\n> "I need to increase sponsorship revenue by 15% this quarter without adding headcount. Think step by step through the options."\n\n## 2. Persona Assignment\nThe role you assign determines the depth of the answer.\n\n> "You are a senior B2B sales consultant who has spent 15 years selling sponsorship packages to Fortune 500 companies. Review this pitch deck and tell me what a sceptical CMO would object to."\n\n## 3. Output Format Control\nTell the model exactly what format you need.\n\n> "Give me the output as:\n> - A one-sentence summary\n> - Three bullet points of key actions\n> - One risk to watch"\n\nThis is especially powerful for reports, briefing notes, and social content.\n\n## 4. Contrast Prompting\nAsk for multiple versions with different approaches.\n\n> "Write two versions of this event invitation — one formal for C-suite, one casual for mid-level managers. Label them Version A and Version B."\n\n## 5. Constrained Prompting\nAdd limits to force precision.\n\n> "In exactly 3 sentences, explain why this event matters to a CMO who hasn't heard of Trescon."\n\nConstraints force AI to prioritise, which is exactly what you do when you edit anyway.\n\n## Combining Techniques\nThe real skill is combining them:\n\n> "You are a senior event marketing specialist. I need to increase registration for our Dubai summit by 30% in the next 2 weeks. Think step by step through a campaign plan. Format your response as: Goal → 5 Actions → One risk. Be specific to B2B events."\n\nThat prompt is 42 words and produces a better answer than 30 minutes of planning.`,
    task_steps: [
      { step: 1, instruction: 'Take a real work challenge you have right now — a document to write, a problem to solve, or a plan to build.', tip: 'This works best with a genuine problem, not a made-up one.' },
      { step: 2, instruction: 'Write a basic prompt (how you\'d normally ask it) and save the output.', tip: 'Just 1–2 sentences. Your current default approach.' },
      { step: 3, instruction: 'Now rewrite the prompt using at least two of the five techniques from this course (persona + format control, or chain-of-thought + constraints, etc). Run it.', tip: 'Combine techniques in a single prompt. That\'s where the real improvement happens.' },
      { step: 4, instruction: 'Compare both outputs. Note specifically what changed. Which answer would you actually use at work?', tip: 'If the second output would have taken you 20 minutes to write manually, that\'s your baseline ROI for learning this skill.' },
    ],
    questions: [
      {
        question: 'Chain-of-thought prompting improves AI output by:',
        options: ['Making prompts shorter', 'Forcing the model to reason through a problem step by step before concluding', 'Giving the model a specific persona', 'Asking for multiple output versions'],
        correct_index: 1,
        explanation: 'Adding "Think step by step" makes the model work through logic rather than pattern-match to a quick answer. Essential for complex analysis, plans, and problem-solving.',
      },
      {
        question: 'You need AI to write a proposal in a specific format: one-paragraph summary + three risks + a recommended next step. How do you ensure it follows this format?',
        options: ['Hope it figures out the format you want', 'Explicitly tell it the output format in your prompt', 'Ask it to write a proposal and then reformat it yourself', 'Use a different AI tool'],
        correct_index: 1,
        explanation: 'Output format control is one of the most practical prompting skills. State the structure you want and the model will follow it.',
      },
      {
        question: 'Constrained prompting (e.g., "in exactly 3 sentences") is useful because:',
        options: ['It makes prompts look more professional', 'It limits how much you have to read', 'It forces the model to prioritise, producing cleaner, more focused output', 'It makes AI responses more accurate factually'],
        correct_index: 2,
        explanation: 'Constraints mirror the editing process — they force AI to decide what matters most, which produces tighter, more useful output than an open-ended request.',
      },
      {
        question: 'You ask the same question to ChatGPT twice and get two very different answers. This means:',
        options: ['ChatGPT is broken', 'AI is unreliable and shouldn\'t be trusted', 'AI is probabilistic — slight prompt differences produce different outputs. Use the better answer and note what made it better.', 'You need a paid subscription for consistent results'],
        correct_index: 2,
        explanation: 'AI outputs vary — that\'s a feature. Run a prompt twice to see if a different framing gets a better answer. When you find the better answer, analyse what made the prompt work.',
      },
      {
        question: 'Which prompt is most likely to get a useful response for a sponsorship proposal review?',
        options: [
          '"Review my proposal"',
          '"You are a senior B2B sales consultant. Review this sponsorship proposal and tell me the three things a sceptical CFO would object to, and how I should address each. Format: Objection → Why it\'s a risk → Counter-argument."',
          '"Tell me if this proposal is good"',
          '"Is this a good sponsorship proposal? Yes or no."',
        ],
        correct_index: 1,
        explanation: 'Specific persona + specific task + specific format = specific, actionable output. The other options are too open-ended for the model to know what level of depth you need.',
      },
    ],
  },

  /* ─── ADOPTION 2 ─────────────────────────────────────────── */
  {
    title:     'Automate Your Biggest Time Drain',
    subtitle:  'Use AI workflow tools to eliminate repetitive tasks',
    tool_name: 'n8n / Zapier / Make',
    tier_level: 'adoption',
    dept_tags:  [],
    is_mandatory: true,
    overview:  `Every Trescon staff member has at least one task they do on repeat — chasing confirmations, writing the same type of email, filling the same spreadsheet, pulling data from one tool and pasting it into another. These are not just time wasters. They are your best starting point for automation.\n\nThis course introduces workflow AI tools — n8n, Zapier, and Make — that connect your existing tools and run tasks automatically. No code required for most automations. By the end, you'll have mapped your own highest-impact automation and understand exactly how to build it.`,
    read_content: `# Workflow Automation: The Basics\n\nWorkflow tools automate multi-step processes by connecting different apps. The core concept is a **trigger → action** chain:\n\n> When [something happens in Tool A] → Do [something in Tool B]\n\n## Real Examples at Trescon\n\n**Event registration flow:**\n> When someone fills out the registration form → Add to spreadsheet + Send confirmation email + Create a task in Trello for the events team\n\n**Vendor follow-up:**\n> Every morning at 9am → Check if any vendor confirmation is older than 3 days → Send a reminder email to each overdue contact\n\n**Content approval:**\n> When a designer uploads a file to Google Drive → Notify the marketing manager on WhatsApp + Create an approval task in Asana\n\n## The Three Tools\n\n**Zapier** — easiest to start, best for simple two-step automations, most app integrations. Free tier available.\n\n**Make (formerly Integromat)** — more powerful visual builder, better for complex multi-branch flows. Good free tier.\n\n**n8n** — open source, runs on your own server or cloud, most customisable. Ideal once you're confident.\n\n## How to Find Your Automation\n\nAnswer these three questions:\n1. What do I do more than twice a week that involves copying information from one place to another?\n2. What reminder or follow-up do I send manually that fires on a regular schedule?\n3. What notification does someone need when something happens — and I'm currently the one sending it?\n\nEach answer is an automation candidate.\n\n## The "Start Small" Rule\nDon't automate a 10-step process on your first try. Pick the simplest trigger-action pair. Build it. Test it. Trust it. Then add complexity.\n\n## Integration + AI\nThe newest feature of these tools is AI steps — you can add a ChatGPT or Gemini node in the middle of a workflow:\n> When a new lead comes in → GPT-4 writes a personalised first email → Email is sent automatically\n\nThis is the direction everything is heading.`,
    task_steps: [
      { step: 1, instruction: 'Identify your single most repetitive task — the one you do exactly the same way every time. Write it down as: "Every time [X happens], I do [Y]."', tip: 'Think about confirmation emails, status updates, spreadsheet entries, notification messages.' },
      { step: 2, instruction: 'Create a free account on Zapier (zapier.com) or Make (make.com). Explore the template library — search for tools you already use.', tip: 'You\'ll likely find a pre-built template that covers your use case. Most simple automations take 10 minutes to set up.' },
      { step: 3, instruction: 'Find or create a simple two-step automation: one trigger, one action. Set it up and test it with a real (or test) data entry.', tip: 'Start with something you can test immediately — like "When a row is added to my Google Sheet, send me a Slack/email notification."' },
      { step: 4, instruction: 'After testing, calculate the time saved per week if this ran automatically. Write your estimate.', tip: 'Even 15 minutes saved per day is 65+ hours per year. That context matters when advocating for automation tools.' },
    ],
    questions: [
      {
        question: 'A workflow automation tool works on the principle of:',
        options: ['Writing code to replace entire job roles', 'Trigger → Action: when something happens in one tool, do something in another', 'Storing all company data in one place', 'Replacing email with AI chat'],
        correct_index: 1,
        explanation: 'Trigger-action is the core concept. Everything else — multi-step flows, conditionals, AI nodes — is built on this foundation.',
      },
      {
        question: 'You want to set up your first automation. Which approach is best?',
        options: [
          'Automate your most complex multi-step process first to maximise impact',
          'Wait until IT approves the tool before touching anything',
          'Start with the simplest possible trigger-action pair, test it, then add complexity',
          'Automate everything at once using a template',
        ],
        correct_index: 2,
        explanation: 'Complexity is the enemy of a first automation. Start simple, build trust in the system, then expand. Most people who start with a 10-step flow give up before they finish.',
      },
      {
        question: 'Which of these is the strongest candidate for workflow automation?',
        options: [
          'Deciding which vendor to hire for an event',
          'Copying attendee names from a Google Form into a spreadsheet every time someone registers',
          'Writing the event\'s creative theme',
          'Having a difficult conversation with a client',
        ],
        correct_index: 1,
        explanation: 'Copying data from one tool to another on a trigger is exactly what workflow tools do perfectly — it\'s deterministic, repetitive, and has clear success criteria.',
      },
      {
        question: 'The newest capability of workflow tools like n8n and Make is:',
        options: [
          'Replacing spreadsheets',
          'Adding AI (ChatGPT/Gemini) nodes into the middle of a workflow to generate or process text',
          'Booking meetings automatically',
          'Sending automated invoices',
        ],
        correct_index: 1,
        explanation: 'AI nodes let you add a language model step into any workflow — so instead of just moving data, the workflow can now interpret, summarise, or generate text as part of the chain.',
      },
      {
        question: 'A colleague asks "Why should I learn automation tools when IT can just build it for us?" The best response is:',
        options: [
          'Agree — automation is an IT responsibility',
          'The tools require no code and take minutes to set up — waiting for IT means weeks of delay for things you can do yourself today',
          'Automation tools are too risky for non-technical staff',
          'IT should always be involved in any automation',
        ],
        correct_index: 1,
        explanation: 'No-code automation tools are specifically designed for non-technical users. The speed advantage of self-service is real — a simple automation built today is better than a complex one queued for next quarter.',
      },
    ],
  },

  /* ─── ADVANCED 1 ─────────────────────────────────────────── */
  {
    title:     'Building an AI Pilot for Your Department',
    subtitle:  'Design, test, and measure a real AI implementation',
    tool_name: null,
    tier_level: 'advanced',
    dept_tags:  [],
    is_mandatory: true,
    overview:  `You use AI well. Now the question is whether you can lead others to do the same. Advanced-track staff at Trescon are not just individual contributors — they are the AI anchors for their departments. That means identifying the highest-impact opportunity, designing a lightweight pilot, and measuring whether it actually worked.\n\nThis course covers the complete framework Event Pilot uses internally to evaluate, launch, and report on AI pilots. Completing this course and running a pilot is the fastest path to the AI-Forward tier.`,
    read_content: `# The Event Pilot Framework\n\nA pilot is a structured experiment: you run AI on a real process for a defined period, measure the before and after, and decide whether to scale.\n\n## Step 1: Choose the Right Process\n\nA good pilot target has four characteristics:\n- **High frequency** — happens multiple times per week\n- **Currently manual** — someone is doing this by hand\n- **Measurable** — you can record time or quality before and after\n- **Low risk** — a bad output doesn't cause a crisis (drafts, not approvals)\n\n## Step 2: Define Success Before You Start\n\nWrite this down before you begin:\n> "We will call this pilot successful if [specific outcome] happens by [date]."\n\nExample: "We will call this pilot successful if the average time to produce a client proposal drops from 2 hours to 45 minutes by the end of April."\n\nVague success criteria = no one knows if it worked.\n\n## Step 3: Map the Current Process\n\nFor the task you've chosen:\n1. What triggers the task?\n2. What steps does it currently go through?\n3. Who is involved at each step?\n4. What does the output look like when done right?\n\nThis map is also your baseline. Record how long each step takes now.\n\n## Step 4: Design the AI-Assisted Version\n\nFor each step that's manual and language-based, propose an AI alternative:\n- "Step 2 (draft email) → Use ChatGPT with standard prompt template"\n- "Step 4 (summarise notes) → Paste notes into Gemini and summarise"\n\nLeave human steps where human judgment is essential.\n\n## Step 5: Run the Pilot\n\nRun the AI-assisted version for 3–4 weeks with 2–3 team members. Track:\n- Time per task (before vs. after)\n- Quality of output (rated 1-5 by the receiver)\n- Issues encountered\n\n## Step 6: Report Results\n\nA pilot report has three sections:\n1. **What we tested** — process, tools, team, period\n2. **What we measured** — time saved, quality score, team adoption\n3. **Recommendation** — scale, adjust, or abandon (with reasons)\n\nPresent this to your manager. This is how AI adoption gets funded and expanded.`,
    task_steps: [
      { step: 1, instruction: 'Using the four criteria (high frequency, currently manual, measurable, low risk), identify the best AI pilot candidate in your department. Write it as a one-paragraph brief.', tip: 'Talk to one or two colleagues before choosing — they often name the same pain point independently, which means it\'s a real issue.' },
      { step: 2, instruction: 'Write your success criteria: "We will call this pilot successful if [X] happens by [date]." Be specific with numbers.', tip: 'If you can\'t put a number on success, the pilot can\'t be evaluated. "Better" is not a metric.' },
      { step: 3, instruction: 'Map the current process step by step. Time at least one real example and record it. This is your baseline.', tip: 'Use a simple table: Step → Current time → Who does it → Is it language-based? (yes/no)' },
      { step: 4, instruction: 'Design the AI-assisted version. For each language-based step, write the specific prompt or tool you\'d use to speed it up.', tip: 'Keep the human steps where you need judgment. The goal is augmentation, not replacement.' },
    ],
    questions: [
      {
        question: 'A good AI pilot target must have all of these characteristics EXCEPT:',
        options: ['High frequency', 'Currently manual', 'Approved by IT in advance', 'Measurable before and after'],
        correct_index: 2,
        explanation: 'IT approval is not a prerequisite for a well-scoped pilot using standard AI tools. The four criteria are frequency, manual effort, measurability, and low risk.',
      },
      {
        question: 'Why is defining success criteria before the pilot starts essential?',
        options: [
          'So you can report it to the board immediately',
          'Because without specific, pre-defined criteria, you can\'t determine whether the pilot actually worked',
          'It\'s required by Event Pilot policy',
          'It makes the pilot run faster',
        ],
        correct_index: 1,
        explanation: '"Better" is not a result. Pre-defined, measurable criteria (time, quality score, adoption rate) let you make a clear recommend-or-abandon decision.',
      },
      {
        question: 'In the current-process map, what is the "baseline"?',
        options: [
          'The minimum performance standard',
          'The AI tool you\'re comparing against',
          'A recorded measurement of how long the current manual process takes — the "before" data',
          'The team\'s skill level before training',
        ],
        correct_index: 2,
        explanation: 'Without a baseline (current time and quality), you can\'t calculate improvement. The baseline is collected before the pilot runs.',
      },
      {
        question: 'During a 4-week pilot, a team member says "I don\'t trust the AI outputs, so I\'m not using it." What is the best response?',
        options: [
          'Remove them from the pilot',
          'Accept that the pilot failed',
          'Work with them to refine their prompt — a lack of trust often means the output isn\'t matching expectations yet',
          'Tell them AI adoption is mandatory',
        ],
        correct_index: 2,
        explanation: 'Low trust in AI outputs is usually a prompt quality problem, not a fundamental tool problem. Coaching on better prompting is the most productive response.',
      },
      {
        question: 'A pilot report recommending "scale" means:',
        options: [
          'The pilot was too small to be useful',
          'The results justified expanding the AI process to more team members or tasks',
          'The tool should be replaced with a more powerful one',
          'Leadership should build a custom AI system',
        ],
        correct_index: 1,
        explanation: '"Scale" is a recommendation to expand — apply the AI process to more team members, a longer period, or adjacent tasks. It\'s the best outcome: evidence-backed expansion.',
      },
    ],
  },
]

export async function POST(req: NextRequest) {
  const { admin_code } = await req.json().catch(() => ({}))
  if (admin_code !== ADMIN_CODE) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check for existing courses
  const { data: existing } = await supabaseAdmin
    .from('courses')
    .select('id')
    .eq('source', 'manual')
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json({ error: 'Courses already seeded. Delete them first.' }, { status: 409 })
  }

  const rows = COURSES.map(c => ({ ...c, source: 'manual', status: 'published' }))

  const { data, error } = await supabaseAdmin
    .from('courses')
    .insert(rows)
    .select('id, title, tier_level')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    inserted: data?.length ?? 0,
    courses: data?.map(c => ({ id: c.id, title: c.title, tier: c.tier_level })),
  })
}
