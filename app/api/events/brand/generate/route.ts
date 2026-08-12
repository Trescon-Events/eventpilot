import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabaseAdmin } from '@/app/lib/supabase'

let _gemini: GoogleGenerativeAI | null = null
function getGemini() {
  if (!_gemini) _gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  return _gemini
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { event_id } = body

  // Fetch event details
  const { data: event, error: evErr } = await supabaseAdmin
    .from('events')
    .select('id, name, city, event_date, description, public_name')
    .eq('id', event_id)
    .single()

  if (evErr || !event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const eventSummary = [
    `Event Name: ${event.public_name || event.name}`,
    event.city ? `City: ${event.city}` : null,
    event.event_date ? `Date: ${new Date(event.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` : null,
    event.description ? `Description: ${event.description}` : null,
  ].filter(Boolean).join('\n')

  const prompt = `You are a professional brand strategist for Trescon, a world-class B2B events company.

Given this event:
${eventSummary}

Generate a complete brand identity package for this event. The brand should feel premium, corporate, modern, and international — suitable for C-suite and senior executive audiences.

Trescon's house colors are dark navy (#0F1923), teal (#00A5A3), and lime (#C0F43C). The event brand can use these or create a custom palette that complements the event's theme and location.

Respond ONLY with a valid JSON object (no markdown, no explanation) matching this exact shape:
{
  "primary_color": "#hex",
  "secondary_color": "#hex",
  "accent_color": "#hex",
  "background_color": "#hex",
  "text_color": "#hex",
  "heading_font": "Google Font Name",
  "body_font": "Google Font Name",
  "tone": ["word1", "word2", "word3", "word4", "word5"],
  "key_messages": ["short statement 1", "short statement 2", "short statement 3"],
  "style_keywords": ["keyword1", "keyword2", "keyword3", "keyword4"],
  "logo_notes": "How to use the Trescon logo in event materials",
  "ai_reasoning": "2-3 sentence explanation of the brand choices made"
}

Rules:
- All colors must be valid hex codes
- tone: 4-6 single words like Professional, Bold, Innovative, Forward-thinking
- key_messages: 3-4 short punchy brand statements (under 12 words each)
- style_keywords: 4-5 visual style descriptors like Geometric, Minimal, High-contrast
- heading_font: must be a real Google Fonts name
- body_font: must be a real Google Fonts name (Inter, Manrope, DM Sans etc.)
`

  try {
    const gemini = getGemini()
    const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent(prompt)
    const text = result.response.text().trim()

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')

    const parsed = JSON.parse(jsonMatch[0])

    // Upsert into DB
    const { data, error } = await supabaseAdmin
      .from('event_brand_guidelines')
      .upsert(
        {
          event_id,
          primary_color:    parsed.primary_color    ?? '#0F1923',
          secondary_color:  parsed.secondary_color  ?? '#00A5A3',
          accent_color:     parsed.accent_color     ?? '#C0F43C',
          background_color: parsed.background_color ?? '#FFFFFF',
          text_color:       parsed.text_color       ?? '#2D3E50',
          heading_font:     parsed.heading_font     ?? 'Inter',
          body_font:        parsed.body_font        ?? 'Inter',
          tone:             Array.isArray(parsed.tone) ? parsed.tone : [],
          key_messages:     Array.isArray(parsed.key_messages) ? parsed.key_messages : [],
          style_keywords:   Array.isArray(parsed.style_keywords) ? parsed.style_keywords : [],
          logo_notes:       parsed.logo_notes ?? null,
          ai_reasoning:     parsed.ai_reasoning ?? null,
          updated_at:       new Date().toISOString(),
        },
        { onConflict: 'event_id' }
      )
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e) {
    console.error('Brand generate error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
