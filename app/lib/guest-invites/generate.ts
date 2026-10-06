import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getLatestCompiledReference } from '@/app/lib/content/compile-reference'
import { resolveEffectiveRules } from '@/app/lib/content/resolve-validation-rules'
import { PRO_MODEL } from '@/app/lib/content/press-release-access'
import { type GuestKind, SKELETON, REQUIRED_VARIABLES, GUEST_VARIABLES, guestVariables, renderGuestTemplate, htmlToPlainText, checkEmailCompliance, missingRequiredVariables, loadEventGuestSettings } from './template'

/*
  Drafts an event's guest-invite (or reminder) email from its own material: the
  public name/dates/venue on Event Details and the approved Messaging Doc. The model
  writes the email around a fixed structure and the placeholders; the result is
  rendered with sample values and checked against the event's effective content
  rules (own + umbrella — errors are retried with the findings fed back, up to
  three times). If the model can't produce a compliant draft, the vetted
  fallback skeleton is returned instead, so a send is never blocked on the AI.
*/

type Section = { title: string; kind: string; content: unknown }

function flattenSection(s: Section): string {
  if (typeof s.content === 'string') return s.content
  if (Array.isArray(s.content)) return s.content.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join('\n')
  return JSON.stringify(s.content ?? '')
}

export async function referenceExcerpt(eventId: string, maxChars = 9000): Promise<string> {
  const ref = await getLatestCompiledReference(eventId)
  const sections = (ref?.sections ?? []) as Section[]
  const keep = sections.filter(s => s.kind === 'text' || s.kind === 'facts')
  let out = ''
  for (const s of keep) { const t = `## ${s.title}\n${flattenSection(s)}\n\n`; if (out.length + t.length > maxChars) break; out += t }
  return out.trim()
}

export type GenerateResult = { subject: string; body_html: string; source: 'ai' | 'fallback'; attempts: number; warnings: string[]; notes: string[] }

export async function generateGuestTemplate(eventId: string, kind: GuestKind): Promise<GenerateResult> {
  const { eventName, dates, venue, settings } = await loadEventGuestSettings(eventId)
  const rules = await resolveEffectiveRules(eventId)
  const excerpt = await referenceExcerpt(eventId)
  const sampleVars = guestVariables({ speakerName: 'Dr. Jane Sample', eventName, dates, venue, settings, cap: 5, link: 'https://konfhub.com/checkout/sample?selectedCode=SAMPLEGUEST', producerName: 'The Producer', used: 2 })

  const check = async (body: string, subject: string) => {
    const rendered = renderGuestTemplate({ subject, body_html: body, header_image_url: null, header_alt_text: null }, sampleVars)
    return checkEmailCompliance(eventId, htmlToPlainText(rendered.html) + '\n' + rendered.subject)
  }

  const intent = kind === 'guest_invite'
    ? `The FIRST email: shared in the run-up to the event, offering the speaker a personal registration link to invite their own guests. Cover: the event name, dates and venue; that each guest who registers through the link receives a complimentary {{pass_name}}; that they may invite up to {{guest_limit}} guests; that registration closes on {{registration_deadline}}; the link button; how to use it (share it directly, guests register themselves, registrations are connected to the speaker). Include ONE short paragraph, specific to this event and grounded ONLY in the reference material below, on why guests would value attending (no numbers, no forecasts, no superlatives).`
    : `A single, kind REMINDER, sent by the producer. Cover: the link remains open until {{registration_deadline}}; one sentence {{usage_summary}} (it is filled in with where the speaker currently stands — do not write numbers yourself); the link button; that each guest who registers receives a complimentary {{pass_name}} and they can still share the link before the deadline.`

  const baseRules = rules.map(r => `- [${r.severity}] ${r.message}${r.rule_type === 'forbidden_term' || r.rule_type === 'forbidden_pattern' ? ` (pattern: ${r.pattern})` : ''}`).join('\n')
  const prompt = (feedback: string) => `You write a short, professional email for ${eventName} on behalf of its producer, to a confirmed SPEAKER who already knows about the event.

${intent}

HARD REQUIREMENTS
- Output JSON only: {"subject": "...", "body_html": "..."}. body_html uses only <p>, <br/>, <strong>. No styles, no links, no images.
- Use these placeholders exactly as written (double curly braces) and keep every one of: ${REQUIRED_VARIABLES[kind].map(v => `{{${v}}}`).join(' ')}. Other allowed placeholders: ${GUEST_VARIABLES.filter(v => v.kinds.includes(kind)).map(v => `{{${v.key}}}`).join(' ')}.
- {{guest_link_button}} must sit on its own line between paragraphs.
- Do NOT thank them for speaking, do not congratulate, do not use exclamation marks, em dashes, ampersands, or the words unprecedented, world-class, seamless, unlock, transformative, game-changing, premier.
- Never abbreviate the event name; write ${eventName} in full via {{event_name}}.
- Register: authoritative, warm and concise, 110 to 170 words, British spelling. Open with the purpose, not a greeting formula beyond "Dear {{speaker_name}},". Sign off "Warm regards," then {{producer_name}}.

CONTENT RULES THAT WILL BE CHECKED (errors block the email)
${baseRules}

EVENT FACTS
Name: ${eventName}
Dates: ${dates}
Venue: ${venue}

REFERENCE MATERIAL (approved messaging; ground any event-specific sentence ONLY in this)
${excerpt || '(none available — keep to the structure and add no event-specific claims)'}

REFERENCE STRUCTURE TO FOLLOW (adapt wording, keep the content):
${SKELETON[kind].body}
${feedback ? `\nYOUR PREVIOUS DRAFT FAILED THESE CHECKS — FIX THEM:\n${feedback}\n` : ''}`

  const notes: string[] = []
  let feedback = ''
  const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null
  if (!genAI) notes.push('No AI key configured — used the standard wording.')
  for (let attempt = 1; genAI && attempt <= 3; attempt++) {
    try {
      const model = genAI.getGenerativeModel({ model: PRO_MODEL })
      const out = (await model.generateContent(prompt(feedback))).response.text().trim()
      const m = out.match(/\{[\s\S]*\}/)
      if (!m) { feedback = 'Return valid JSON only.'; continue }
      const parsed = JSON.parse(m[0]) as { subject?: string; body_html?: string }
      const body = (parsed.body_html ?? '').trim(); const subject = (parsed.subject ?? '').trim() || SKELETON[kind].subject
      const missing = missingRequiredVariables(kind, body)
      if (!body || missing.length) { feedback = `Missing placeholders: ${missing.map(v => `{{${v}}}`).join(', ') || 'body empty'}.`; continue }
      if (/<a\s|https?:\/\//i.test(body)) { feedback = 'Do not include links; use {{guest_link_button}}.'; continue }
      const { errors, warnings } = await check(body, subject)
      if (errors.length === 0) return { subject, body_html: body, source: 'ai', attempts: attempt, warnings: warnings.map(w => `${w.message} (“${w.match}”)`), notes }
      feedback = errors.map(e => `- ${e.message} Matched: “${e.match}”`).join('\n')
    } catch (e) {
      notes.push(`AI attempt ${attempt} failed: ${e instanceof Error ? e.message.slice(0, 160) : 'error'}`)
    }
  }
  if (genAI) notes.push('The AI draft did not pass the content rules — used the standard wording instead.')
  const fb = SKELETON[kind]
  const { warnings } = await check(fb.body, fb.subject)
  return { subject: fb.subject, body_html: fb.body, source: 'fallback', attempts: 0, warnings: warnings.map(w => `${w.message} (“${w.match}”)`), notes }
}

export async function saveGuestTemplate(eventId: string, kind: GuestKind, subject: string, bodyHtml: string, staffId: string | null) {
  const { data: existing } = await supabaseAdmin.from('email_templates').select('id').eq('event_id', eventId).eq('kind', kind).maybeSingle()
  const fields = { subject, body_html: bodyHtml, variable_hints: GUEST_VARIABLES.filter(v => v.kinds.includes(kind)).map(v => ({ key: v.key, label: v.label })), updated_by: staffId, updated_at: new Date().toISOString(), is_active: true }
  if (existing) {
    const { data } = await supabaseAdmin.from('email_templates').update(fields).eq('id', existing.id).select('*').single()
    return data
  }
  const { data: ev } = await supabaseAdmin.from('events').select('name').eq('id', eventId).single()
  const { data } = await supabaseAdmin.from('email_templates').insert({
    ...fields, event_id: eventId, kind, slug: `${kind}_${eventId.slice(0, 8)}`, category: 'guest_invite',
    name: `${kind === 'guest_invite' ? 'Speaker Guest Invite' : 'Speaker Guest Invite Reminder'} — ${(ev?.name ?? '').trim()}`,
    description: 'Generated for this event from Event Details and its Messaging Doc.', sender_name: 'Event producer', sender_email: 'noreply@eventpilot.tresconglobal.com', created_by: staffId,
  }).select('*').single()
  return data
}
