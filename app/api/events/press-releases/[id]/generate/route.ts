import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getEventGuidelines, renderGuidelinesMarkdown } from '@/app/lib/content/guidelines-api'
import {
  loadPressReleaseAndAuthorize, getPriorApprovedReleasesContext, countTodayGenerations, getLatestVersion,
  PRO_MODEL, DAILY_GENERATE_LIMIT,
} from '@/app/lib/content/press-release-access'

let _gemini: GoogleGenerativeAI | null = null
function getGemini() {
  if (!_gemini) _gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  return _gemini
}

/* POST /api/events/press-releases/[id]/generate
   Body: { session_id: string, custom_instruction?: string }

   Pulls the research transcript (content_research_messages) + this event's
   compiled guidelines, makes one Gemini call, and inserts a new immutable
   press_release_versions row (version_number = max + 1). Mirrors
   app/api/content/generate/route.ts's prompt-assembly and JSON-parsing
   approach — one synchronous Gemini call, same cost class as the existing
   social-post generator, so no background-job/poll workaround needed. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await loadPressReleaseAndAuthorize(req, id, 'sae.content_studio.press_release.generate')
  if (!auth.ok) return auth.error
  const { pr, staffId, isAdmin, eventName } = auth.data

  if (!isAdmin && staffId) {
    const used = await countTodayGenerations(staffId)
    if (used >= DAILY_GENERATE_LIMIT) {
      return NextResponse.json({
        error: `You've reached today's generate limit (${DAILY_GENERATE_LIMIT}). It resets at midnight UTC.`,
        limit_reached: true,
      }, { status: 429 })
    }
  }

  const { session_id, custom_instruction } = await req.json().catch(() => ({})) as {
    session_id?: string; custom_instruction?: string
  }
  if (!session_id) return NextResponse.json({ error: 'session_id required — run a research conversation first.' }, { status: 400 })

  const { data: researchMessages } = await supabaseAdmin
    .from('content_research_messages')
    .select('role, text')
    .eq('session_id', session_id)
    .order('created_at', { ascending: true })

  if (!researchMessages?.length) {
    return NextResponse.json({ error: 'No research conversation found for this session.' }, { status: 400 })
  }

  const researchSummary = researchMessages
    .map(m => `${m.role === 'user' ? 'PR team' : 'Research assistant'}: ${m.text}`)
    .join('\n\n')

  const [guidelines, priorReleasesText] = await Promise.all([
    getEventGuidelines(pr.event_id),
    getPriorApprovedReleasesContext(pr.event_id, pr.id),
  ])
  const guidelinesText = guidelines
    ? renderGuidelinesMarkdown(guidelines, ['style_guide', 'messaging', 'production_pack'])
    : ''

  const systemPrompt = `You are the senior PR writer for Trescon — a B2B events company that runs the World AI Show, World Blockchain Summit, DATE, and CARE summits across 15+ countries.

Write a press release for "${eventName}" using the research conversation and event guidelines below. Standard press release structure: headline, dateline, lead paragraph (who/what/when/where/why), supporting body paragraphs, a quote if one is available from the research, and a company boilerplate.

If this event has previously approved releases (below), don't repeat their angle or phrasing — this one should read as a distinct, continuing story.

Return ONLY valid JSON, no preamble, no markdown fences:
{ "headline": "...", "dateline": "...", "body": "... (full release, markdown paragraphs)", "boilerplate": "..." }`

  const userPrompt = [
    `EVENT GUIDELINES:\n${guidelinesText || '(none available)'}`,
    '',
    `PREVIOUSLY APPROVED RELEASES FOR THIS EVENT:\n${priorReleasesText || 'None yet — this would be the first.'}`,
    '',
    `RESEARCH CONVERSATION:\n${researchSummary}`,
    custom_instruction ? `\nSPECIFIC INSTRUCTION FOR THIS DRAFT: ${custom_instruction}` : '',
  ].filter(Boolean).join('\n')

  let headline = '', dateline = '', body = '', boilerplate = ''
  try {
    const model = getGemini().getGenerativeModel({ model: PRO_MODEL })
    const result = await model.generateContent([{ text: systemPrompt + '\n\n' + userPrompt }])
    const text = result.response.text().trim()
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('Model did not return JSON')
    const parsed = JSON.parse(match[0])
    headline = parsed.headline ?? ''
    dateline = parsed.dateline ?? ''
    body = parsed.body ?? text
    boilerplate = parsed.boilerplate ?? ''
  } catch (err) {
    console.error('press-release generate Gemini error:', err)
    const { isQuotaError, QUOTA_ERROR_MESSAGE } = await import('@/app/lib/gemini-error')
    if (isQuotaError(err)) return NextResponse.json({ error: QUOTA_ERROR_MESSAGE }, { status: 429 })
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }

  const latest = await getLatestVersion(pr.id)
  const nextVersion = (latest?.version_number ?? 0) + 1

  const { data: version, error } = await supabaseAdmin
    .from('press_release_versions')
    .insert({
      press_release_id: pr.id,
      version_number: nextVersion,
      headline, dateline, body, boilerplate,
      research_summary: researchSummary,
      custom_instruction: custom_instruction ?? null,
      generated_by: staffId,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabaseAdmin.from('press_releases').update({ updated_at: new Date().toISOString() }).eq('id', pr.id)

  const generateUsed = staffId ? await countTodayGenerations(staffId) : 0
  return NextResponse.json({ ...version, generate_usage: { used: generateUsed, limit: isAdmin ? null : DAILY_GENERATE_LIMIT } })
}
