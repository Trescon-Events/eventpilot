// Shared generation logic for the Stakeholder Announcement Engine — used by
// announcements/generate and both regenerate-* routes, so the copy/creative
// pipeline is defined once rather than duplicated across three route files.
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { CanvaAutofillField } from '@/app/lib/canva'

let _gemini: GoogleGenerativeAI | null = null
function getGemini() {
  if (!_gemini) _gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  return _gemini
}

export type EventContext = {
  name: string; event_date: string | null; end_date: string | null
  venue: string | null; city: string | null
  event_hashtag: string | null; registration_url: string | null
}

export async function generatePostCopy(
  event: EventContext,
  speaker: Record<string, unknown> | null,
  partner: Record<string, unknown> | null,
  messagingJson: Record<string, unknown> | null
): Promise<string> {
  const dates = [event.event_date, event.end_date].filter(Boolean).join(' – ')
  const eventContext = [
    `Event: ${event.name}`,
    dates && `Dates: ${dates}`,
    event.venue && `Venue: ${event.venue}${event.city ? `, ${event.city}` : ''}`,
    event.event_hashtag && `Hashtag: ${event.event_hashtag}`,
    event.registration_url && `Registration: ${event.registration_url}`,
  ].filter(Boolean).join('\n')

  const messagingContext = messagingJson
    ? `Messaging doc context (use for positioning/tone/themes — do not invent facts beyond this):\n${JSON.stringify(messagingJson)}`
    : 'No topline messaging doc uploaded for this event yet — write in a neutral, professional Trescon voice.'

  const stakeholderContext = speaker
    ? `Speaker: ${speaker.name}, ${speaker.role} at ${speaker.company}${speaker.country ? `, ${speaker.country}` : ''}.\nBio: ${speaker.bio ?? '(not provided)'}`
    : `Partner: ${partner!.name}, category: ${String(partner!.partner_type).replace(/_/g, ' ')}.\nDescription: ${partner!.company_description ?? '(not provided)'}`

  const prompt = `You are writing social media announcement posts for Trescon events.
You write in the established Trescon voice: confident, data-driven, forward-looking.
Grounded only in the provided data — never fabricate credentials, statistics, or event details not given below.

${eventContext}

${messagingContext}

${stakeholderContext}

Generate LinkedIn post copy (max 1300 characters):
- Opening hook (1-2 sentences, grounded in the ${speaker ? "speaker's expertise" : "company's relevance"})
- 2-3 sentences on why this ${speaker ? 'speaker' : 'partner'} matters to the event audience
- Event dates and venue, if given above
- A call to action, including the registration link if given above
- Hashtags: the event hashtag (if given) plus 4-6 relevant topic hashtags

Return JSON only, no markdown fences: { "copy": "...", "hashtags": ["#...", "..."] }`

  const model  = getGemini().getGenerativeModel({ model: 'gemini-2.5-flash' })
  const result = await model.generateContent([{ text: prompt }])
  const text   = result.response.text().trim()

  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0]) as { copy?: string; hashtags?: string[] }
      if (parsed.copy) return [parsed.copy, ...(parsed.hashtags ?? [])].join('\n\n')
    }
  } catch {
    // fall through to raw text
  }
  return text
}

export type TemplateFieldMap = Record<string, string> // semantic key -> real Canva field name
export type CanvaTemplateConfig = {
  speaker?: { template_design_id: string; fields: TemplateFieldMap }
  partner?: Record<string, { template_design_id: string; fields: TemplateFieldMap }>
}

export function buildAutofillFields(
  stakeholderType: 'speaker' | 'partner',
  speaker: Record<string, unknown> | null,
  partner: Record<string, unknown> | null,
  templateConfig: CanvaTemplateConfig | null,
  useCompanyLogo: boolean
): { templateDesignId?: string; fields?: Record<string, CanvaAutofillField>; templateError?: string } {
  if (stakeholderType === 'speaker') {
    const cfg = templateConfig?.speaker
    if (!cfg?.template_design_id) return { templateError: 'No Canva speaker template configured for this event (events.canva_template_config.speaker)' }

    const map = cfg.fields
    const fields: Record<string, CanvaAutofillField> = {}
    if (map.speaker_name) fields[map.speaker_name] = { type: 'text', value: String(speaker!.name ?? '') }
    if (map.job_title) fields[map.job_title] = { type: 'text', value: String(speaker!.role ?? '') }
    if (map.company) fields[map.company] = { type: 'text', value: String(speaker!.company ?? '') }
    const photoUrl = (speaker!.photo_processed_url as string | null) ?? (speaker!.photo_url as string | null)
    if (map.speaker_photo && photoUrl) fields[map.speaker_photo] = { type: 'image', asset_url: photoUrl }
    if (useCompanyLogo && map.company_logo && speaker!.company_logo_url) {
      fields[map.company_logo] = { type: 'image', asset_url: speaker!.company_logo_url as string }
    }
    return { templateDesignId: cfg.template_design_id, fields }
  }

  const partnerType = String(partner!.partner_type)
  const cfg = templateConfig?.partner?.[partnerType]
  if (!cfg?.template_design_id) return { templateError: `No Canva template configured for partner type '${partnerType}' (events.canva_template_config.partner.${partnerType})` }

  const map = cfg.fields
  const fields: Record<string, CanvaAutofillField> = {}
  if (map.company_logo && partner!.logo_url) fields[map.company_logo] = { type: 'image', asset_url: partner!.logo_url as string }
  if (map.tier_label) fields[map.tier_label] = { type: 'text', value: partnerType.replace(/_/g, ' ') }
  return { templateDesignId: cfg.template_design_id, fields }
}
