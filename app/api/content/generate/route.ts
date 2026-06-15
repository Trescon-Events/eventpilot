import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabaseAdmin } from '@/app/lib/supabase'

let _gemini: GoogleGenerativeAI | null = null
function getGemini() {
  if (!_gemini) _gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  return _gemini
}

const PLATFORM_RULES: Record<string, string> = {
  LinkedIn:  'LinkedIn post. Professional, authoritative, thought-leadership tone. 1200–1800 characters. Start with a bold insight or question. End with a CTA. Use 3–5 hashtags at the end.',
  Instagram: 'Instagram caption. Visual-led, energetic, punchy. 150–220 characters. Strong hook in the first line. End with 5–8 hashtags.',
  Facebook:  'Facebook post. Community-focused, conversational. 300–400 characters. Informative and engaging. 2–3 hashtags.',
  Twitter:   'X (Twitter) post. Punchy and direct. 220–240 characters max. One strong statement. 2–3 hashtags.',
  YouTube:   'YouTube community post or video description. 200–300 characters. Engaging, builds anticipation. Relevant hashtags.',
}

const NARRATIVE_ROLES: Record<string, string> = {
  Awareness:   'Build awareness about the event. Highlight why this matters to the target audience.',
  Speaker:     'Announce or spotlight a speaker. Focus on their expertise and what attendees will learn.',
  Sponsor:     'Highlight a sponsor or partner. Focus on the value they bring to the event.',
  Countdown:   'Build urgency and excitement. Event is X days away. Drive registrations.',
  'Live':      'Real-time live coverage. The event is happening now. Create FOMO and excitement.',
  Testimonial: 'Share a delegate or speaker testimonial. Social proof, outcome-focused.',
  Recap:       'Post-event recap. Key highlights, outcomes, gratitude. Build anticipation for the next edition.',
  CTA:         'Direct call to action. Register, apply, sponsor, partner. Clear and compelling.',
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { campaign_id, post_id, platform, narrative_role, week_theme, custom_instruction } = body

    if (!campaign_id || !platform) {
      return NextResponse.json({ error: 'campaign_id and platform required' }, { status: 400 })
    }

    // ── Load campaign + event + brief documents ────────────────────────────
    const { data: campaign } = await supabaseAdmin
      .from('content_campaigns')
      .select('*, events(id, name, city, event_date, type, description)')
      .eq('id', campaign_id)
      .single()

    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    const event = campaign.events as {
      id: string; name: string; city: string; event_date: string; type: string; description: string
    } | null

    // Load event briefs from documents table
    let briefContext = ''
    if (event?.id) {
      const { data: docs } = await supabaseAdmin
        .from('documents')
        .select('title, extracted_text')
        .eq('event_id', event.id)
        .eq('is_active', true)
        .in('type', ['event_brief', 'other'])
        .order('created_at', { ascending: false })
        .limit(3)

      if (docs?.length) {
        briefContext = docs.map(d => `[${d.title}]\n${d.extracted_text}`).join('\n\n---\n\n')
      }
    }

    // ── Build the prompt ──────────────────────────────────────────────────
    const eventInfo = event
      ? `Event: ${event.name} | Type: ${event.type} | Location: ${event.city} | Date: ${event.event_date ?? 'TBD'}`
      : 'Event details not available'

    const systemPrompt = `You are the senior social media manager for Trescon — a B2B events company that runs the World AI Show, World Blockchain Summit, DATE, and CARE summits across 15+ countries.

Your audience: CXOs, senior technology leaders, government officials, enterprise technology buyers.
Trescon's position: A global deal facilitation platform that connects decision-makers, drives partnerships, and delivers measurable business outcomes through world-class events.

Tone: Authoritative, confident, outcome-focused. Never generic. Never "we're excited to announce." Never hollow buzzwords.

Return ONLY the post text. No preamble, no explanation, no quotation marks.`

    const userPrompt = [
      `PLATFORM: ${platform}`,
      `FORMAT: ${PLATFORM_RULES[platform] ?? PLATFORM_RULES.LinkedIn}`,
      '',
      `CAMPAIGN: ${campaign.name}`,
      `PHASE: ${campaign.phase?.replace('_', ' ')}`,
      `OBJECTIVE: ${campaign.objective || 'Drive awareness and registrations'}`,
      week_theme ? `WEEK THEME: ${week_theme}` : '',
      `NARRATIVE ROLE: ${NARRATIVE_ROLES[narrative_role] ?? narrative_role}`,
      campaign.brand_notes ? `BRAND NOTES FROM TEAM: ${campaign.brand_notes}` : '',
      custom_instruction ? `SPECIFIC INSTRUCTION: ${custom_instruction}` : '',
      '',
      eventInfo,
      '',
      briefContext
        ? `EVENT BRIEF CONTEXT:\n${briefContext.slice(0, 4000)}`
        : (event?.description ? `EVENT DESCRIPTION: ${event.description}` : ''),
    ].filter(Boolean).join('\n')

    // ── Generate with Gemini ──────────────────────────────────────────────
    const model = getGemini().getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent([
      { text: systemPrompt + '\n\n' + userPrompt },
    ])
    const text = result.response.text().trim()

    // ── Generate image URL (Pollinations) ─────────────────────────────────
    const seed = Math.floor(Math.random() * 900000) + 100000
    const imagePrompt = encodeURIComponent(
      `${event?.name ?? campaign.name} ${event?.city ?? ''} professional event photography, ${platform === 'LinkedIn' ? 'corporate conference' : 'modern summit'}, teal and dark blue tones, editorial quality, no text`
    )
    const imageUrl = `https://image.pollinations.ai/prompt/${imagePrompt}?width=1080&height=1080&seed=${seed}&nologo=true`

    // ── Persist to DB if post_id provided ─────────────────────────────────
    if (post_id) {
      await supabaseAdmin
        .from('content_posts')
        .update({ text, image_url: imageUrl, image_seed: seed, status: 'generated', updated_at: new Date().toISOString() })
        .eq('id', post_id)
    }

    return NextResponse.json({ text, image_url: imageUrl, seed })

  } catch (err) {
    console.error('[content/generate]', err)
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}
