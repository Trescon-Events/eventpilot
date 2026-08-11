import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getSession } from '@/app/lib/access/session'

/* POST /api/admin/email-templates/ai-rewrite
   Body: { html: string, instruction: string }
   Stateless — works on an unsaved draft, not a saved template row. Mirrors
   messaging/[id]/propose-edit's "propose, never auto-save" shape, simplified
   to one field (an email body has no sections to diff). Never writes
   anything — the caller applies proposed_html into the editor themselves,
   only persisted via the template's normal PATCH/POST on Save. */

let _gemini: GoogleGenerativeAI | null = null
function getGemini() {
  if (!_gemini) _gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  return _gemini
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const body = await req.json().catch(() => null) as { html?: string; instruction?: string } | null
  if (!body?.instruction?.trim()) return NextResponse.json({ error: 'instruction required' }, { status: 400 })

  const html = body.html ?? ''

  const prompt = `You are editing the HTML body of one marketing/notification email template.
Preserve the existing HTML tag structure (paragraphs, headings, lists, links) unless the
instruction explicitly asks to restructure it — you are rewriting copy, not redesigning layout.

CRITICAL: this HTML may contain {{placeholder}} tokens (e.g. {{speaker_name}}, {{event_name}},
{{form_link}}). Preserve every existing token EXACTLY, character-for-character, wherever the
surrounding sentence still needs it. Do not invent new {{tokens}} that aren't already present.

CURRENT HTML:
${html || '(empty — write new content from scratch)'}

INSTRUCTION:
${body.instruction}

Return JSON only, no markdown fences, no explanation outside the JSON:
{ "reply": "one sentence summarizing what you changed", "proposed_html": "the full new HTML body" }`

  try {
    const model = getGemini().getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent([{ text: prompt }])
    const text = result.response.text().trim()
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON in model response')
    const parsed = JSON.parse(match[0]) as { reply: string; proposed_html: string }

    return NextResponse.json({ reply: parsed.reply, proposed_html: parsed.proposed_html })
  } catch (e) {
    console.error('email-templates ai-rewrite failed:', e)
    return NextResponse.json({ error: 'Could not process that request. Please try rephrasing.' }, { status: 500 })
  }
}
