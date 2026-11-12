import { supabaseAdmin } from '@/app/lib/supabase'
import { decideReview, type ReferenceInfo, type ReviewRecord, type ReviewState } from './review-rules'

/* Emails module — template review, server side (2026-11-12). Works out, for one event, which templates need a person to confirm they are still accurate, and records the confirmation. */

export type ReferenceDetail = { version: number; compiled_at: string; docs: { title: string; updated_at: string }[] }
export type TemplateReview = ReviewState & { reviewed_at: string | null; reviewed_by_name: string | null; reference: ReferenceDetail | null }

/** The event's current compiled reference (its own messaging docs and style guide plus its umbrella's), with the documents it was built from. */
export async function eventReference(eventId: string): Promise<ReferenceDetail | null> {
  const { data: ref } = await supabaseAdmin.from('event_compiled_reference').select('version, compiled_at, source_doc_ids').eq('event_id', eventId).order('version', { ascending: false }).limit(1).maybeSingle()
  if (!ref) return null
  const ids = (ref.source_doc_ids as string[] | null) ?? []
  const { data: docs } = ids.length ? await supabaseAdmin.from('event_messaging_docs').select('title, updated_at').in('id', ids) : { data: [] }
  return { version: ref.version as number, compiled_at: ref.compiled_at as string, docs: (docs ?? []).map(d => ({ title: d.title as string, updated_at: d.updated_at as string })) }
}

/** The review state of the given templates for one event. */
export async function reviewStates(eventId: string, templates: { id: string; updated_at: string | null }[], now = new Date()): Promise<Map<string, TemplateReview>> {
  const out = new Map<string, TemplateReview>()
  if (!templates.length) return out
  const [reference, { data: rows }] = await Promise.all([
    eventReference(eventId),
    supabaseAdmin.from('email_template_reviews').select('template_id, reviewed_at, reviewed_by, reference_version, template_updated_at').eq('event_id', eventId).in('template_id', templates.map(t => t.id)),
  ])
  const byTpl = new Map((rows ?? []).map(r => [r.template_id as string, r]))
  const staffIds = [...new Set((rows ?? []).map(r => r.reviewed_by as string | null).filter((x): x is string => !!x && /^[0-9a-f-]{36}$/i.test(x)))]
  const { data: staff } = staffIds.length ? await supabaseAdmin.from('staff_members').select('id, name').in('id', staffIds) : { data: [] }
  const who = new Map((staff ?? []).map(s => [s.id as string, s.name as string]))
  const refInfo: ReferenceInfo = reference ? { version: reference.version, compiled_at: reference.compiled_at } : null
  for (const t of templates) {
    const r = byTpl.get(t.id)
    const record: ReviewRecord | null = r ? { reviewed_at: r.reviewed_at as string, template_updated_at: (r.template_updated_at as string | null) ?? null, reference_version: (r.reference_version as number | null) ?? null } : null
    out.set(t.id, { ...decideReview({ template_updated_at: t.updated_at, review: record, reference: refInfo, now }), reviewed_at: record?.reviewed_at ?? null, reviewed_by_name: r ? (who.get(r.reviewed_by as string) ?? (r.reviewed_by === 'super-admin' ? 'Admin' : null)) : null, reference })
  }
  return out
}

/** The gate used when an email is created: a template that is stale for this event cannot be used until someone confirms it. Returns what to record on the email. */
export async function templateGate(eventId: string, templateId: string | null | undefined): Promise<{ ok: true; review: { by: string | null; at: string | null; reference_version: number | null } | null } | { ok: false; error: string; status: number; needs_review: true; reasons: string[] }> {
  if (!templateId) return { ok: true, review: null }
  const { data: t } = await supabaseAdmin.from('email_templates').select('id, updated_at').eq('id', templateId).maybeSingle()
  if (!t) return { ok: true, review: null }
  const st = (await reviewStates(eventId, [{ id: t.id as string, updated_at: t.updated_at as string | null }])).get(t.id as string)
  if (!st) return { ok: true, review: null }
  if (st.state === 'stale') return { ok: false, error: `This template needs to be checked for this event before it is used. ${st.reasons[0] ?? ''}`.trim(), status: 409, needs_review: true, reasons: st.reasons }
  return { ok: true, review: { by: st.reviewed_by_name, at: st.reviewed_at, reference_version: st.reference?.version ?? null } }
}

/** Records that a person confirmed the template is still accurate for this event, against the text and reference as they stand now. */
export async function confirmReview(templateId: string, eventId: string, by: string | null): Promise<{ ok: true; reviewed_at: string } | { ok: false; error: string; status: number }> {
  const { data: t } = await supabaseAdmin.from('email_templates').select('id, updated_at, audience_type, event_id, is_active').eq('id', templateId).maybeSingle()
  if (!t || t.audience_type !== 'speaker' || !t.is_active || (t.event_id && t.event_id !== eventId)) return { ok: false, error: 'That template is not available for this event.', status: 404 }
  const reference = await eventReference(eventId)
  const at = new Date().toISOString()
  const { error } = await supabaseAdmin.from('email_template_reviews').upsert({ template_id: templateId, event_id: eventId, reviewed_at: at, reviewed_by: by, reference_version: reference?.version ?? null, template_updated_at: t.updated_at })
  if (error) return { ok: false, error: error.message, status: 500 }
  return { ok: true, reviewed_at: at }
}
