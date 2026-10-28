import { supabaseAdmin } from '@/app/lib/supabase'
import type { HubSpotFieldMapping } from '@/app/lib/hubspot/types'
import { checkFormWorkflow } from '@/app/lib/hubspot/crm-client'
import { addConsentValues, applyMapping } from '@/app/lib/hubspot/submission-ingest'
import { sendAlert } from '@/app/lib/alerts/send'
import { siteUrl } from '@/app/lib/badges/client-approval'

/* HubSpot-vs-EventPilot gap check. Every form submission HubSpot recorded must have a matching row in EventPilot; anything HubSpot has that EventPilot doesn't is a "gap".
   Runs every 15 minutes (cron) and on demand from the Sync health card. Forward-only: only submissions from the moment a form was first checked (`since`) onward are
   ever compared or brought in, nothing historical is touched. Matching is by email and count, because a webhook row carries no HubSpot submission id.
   A gap can also be a submission HubSpot is holding in its spam tab — the card says so, and a person decides (bring it in, or ignore). */

const API = 'https://api.hubapi.com'
const ALERT_AFTER_MS = 30 * 60 * 1000
const REALERT_AFTER_MS = 24 * 60 * 60 * 1000
const MAX_PAGES = 20

export type GapEntry = { conversion_id: string; email: string; submitted_at: string; first_seen: string }
export type FormHealth = {
  hubspot_form_id: string; event_id: string; form_type: string; since: string; checked_at: string | null; check_error: string | null
  hubspot_count: number; eventpilot_count: number; gap: GapEntry[]; workflow_ok: boolean | null; workflow_problem: string | null; last_received_at: string | null
  recent_errors: { created_at: string; stage: string; message: string }[]
}

type Hs = { conversionId: string; submittedAt: number; values: { name: string; value: string }[] }
type Conn = { event_id: string; form_type: string; hubspot_form_id: string; field_mapping: unknown; hubspot_workflow_id: string | null }

const lc = (s: string | undefined | null) => (s ?? '').trim().toLowerCase()
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function listSubmissions(formId: string, sinceMs: number): Promise<Hs[]> {
  const key = process.env.HUBSPOT_API_KEY
  if (!key) throw new Error('HUBSPOT_API_KEY not configured')
  const out: Hs[] = []
  let after = ''
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(`${API}/form-integrations/v1/submissions/forms/${formId}?limit=50${after ? `&after=${encodeURIComponent(after)}` : ''}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) })
    if (!res.ok) throw new Error(`HubSpot form submissions ${res.status}`)
    const j = (await res.json()) as { results?: Hs[]; paging?: { next?: { after?: string } } }
    const rows = j.results ?? []
    out.push(...rows.filter(r => r.submittedAt >= sinceMs))
    after = j.paging?.next?.after ?? ''
    if (!after || !rows.length || rows[rows.length - 1].submittedAt < sinceMs) break   // newest first: once a page reaches back past `since`, we have everything
  }
  return out
}

const hsEmail = (r: Hs) => lc(r.values.find(v => v.name === 'email')?.value)

/** The email of an EventPilot row: via the field the mapping sends `email` to, else the first value that looks like one. */
function rowEmail(data: Record<string, unknown>, mapping: HubSpotFieldMapping[]): string {
  const m = mapping.find(x => x.hubspot_field_name === 'email')
  const key = !m ? null : m.target.type === 'concept' ? m.target.key : m.target.type === 'custom' ? m.hubspot_field_name : m.target.type === 'crm_property' ? m.target.property_key : null
  const direct = key ? lc(String(data[key] ?? '')) : ''
  if (EMAIL.test(direct)) return direct
  for (const v of Object.values(data)) if (typeof v === 'string' && EMAIL.test(v.trim())) return lc(v)
  return ''
}

async function ensureHealthRow(c: Conn) {
  const { data } = await supabaseAdmin.from('hubspot_form_sync_health').select('*').eq('hubspot_form_id', c.hubspot_form_id).maybeSingle()
  if (data) return data
  const { data: made } = await supabaseAdmin.from('hubspot_form_sync_health')
    .upsert({ hubspot_form_id: c.hubspot_form_id, event_id: c.event_id, form_type: c.form_type, since: new Date().toISOString() }, { onConflict: 'hubspot_form_id', ignoreDuplicates: true })
    .select('*').maybeSingle()
  if (made) return made
  return (await supabaseAdmin.from('hubspot_form_sync_health').select('*').eq('hubspot_form_id', c.hubspot_form_id).single()).data!
}

async function loadConn(eventId: string, formType: string): Promise<Conn | null> {
  const { data } = await supabaseAdmin.from('event_hubspot_forms').select('event_id, form_type, hubspot_form_id, field_mapping, hubspot_workflow_id').eq('event_id', eventId).eq('form_type', formType).maybeSingle()
  return (data as Conn | null) ?? null
}

/** One form: compares, stores the result, and returns it. Never throws — a failed check is itself a result. */
export async function checkForm(c: Conn): Promise<FormHealth> {
  const prev = await ensureHealthRow(c)
  const sinceMs = new Date(prev.since as string).getTime()
  const now = new Date().toISOString()
  const dismissed = new Set<string>((prev.dismissed as string[]) ?? [])
  const prevSeen = new Map(((prev.gap as GapEntry[]) ?? []).map(g => [g.conversion_id, g.first_seen]))
  let checkError: string | null = null
  let gap: GapEntry[] = [], hubspotCount = prev.hubspot_count as number, epCount = prev.eventpilot_count as number

  try {
    const [subs, { data: rows }] = await Promise.all([
      listSubmissions(c.hubspot_form_id, sinceMs),
      supabaseAdmin.from('stakeholder_form_submissions').select('submitted_data, submitted_at').eq('event_id', c.event_id).eq('form_type', c.form_type).eq('source', 'hubspot').gte('submitted_at', prev.since as string),
    ])
    const mapping = (c.field_mapping ?? []) as HubSpotFieldMapping[]
    const epByEmail = new Map<string, number>()
    for (const r of rows ?? []) { const e = rowEmail((r.submitted_data ?? {}) as Record<string, unknown>, mapping); epByEmail.set(e, (epByEmail.get(e) ?? 0) + 1) }
    const hsByEmail = new Map<string, Hs[]>()
    for (const s of subs) { const e = hsEmail(s); hsByEmail.set(e, [...(hsByEmail.get(e) ?? []), s]) }
    for (const [email, list] of hsByEmail) {
      const missing = list.length - (epByEmail.get(email) ?? 0)
      if (missing <= 0) continue
      // The newest submissions are the ones assumed missing (an older one is more likely to have been delivered already).
      for (const s of [...list].sort((a, b) => b.submittedAt - a.submittedAt).slice(0, missing)) {
        if (dismissed.has(s.conversionId)) continue
        gap.push({ conversion_id: s.conversionId, email, submitted_at: new Date(s.submittedAt).toISOString(), first_seen: prevSeen.get(s.conversionId) ?? now })
      }
    }
    gap.sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))
    hubspotCount = subs.length; epCount = rows?.length ?? 0
  } catch (e) {
    checkError = e instanceof Error ? e.message : 'check failed'
    gap = (prev.gap as GapEntry[]) ?? []
  }

  let workflowOk: boolean | null = prev.workflow_ok as boolean | null, workflowProblem: string | null = null
  if (c.hubspot_workflow_id) {
    try { const w = await checkFormWorkflow(c.hubspot_workflow_id, c.hubspot_form_id); workflowOk = w.ok; workflowProblem = w.problem } catch { /* keep the last known answer */ }
  } else { workflowOk = null; workflowProblem = 'No automatic sync has been set up for this form.' }

  const { data: last } = await supabaseAdmin.from('stakeholder_form_submissions').select('submitted_at').eq('event_id', c.event_id).eq('form_type', c.form_type).eq('source', 'hubspot').order('submitted_at', { ascending: false }).limit(1).maybeSingle()
  await supabaseAdmin.from('hubspot_form_sync_health').update({
    checked_at: now, check_error: checkError, hubspot_count: hubspotCount, eventpilot_count: epCount, gap, workflow_ok: workflowOk, workflow_checked_at: now, last_received_at: last?.submitted_at ?? null,
  }).eq('hubspot_form_id', c.hubspot_form_id)

  const { data: errs } = await supabaseAdmin.from('hubspot_webhook_errors').select('created_at, stage, message').eq('hubspot_form_id', c.hubspot_form_id).gte('created_at', new Date(Date.now() - 7 * 864e5).toISOString()).order('created_at', { ascending: false }).limit(5)
  return {
    hubspot_form_id: c.hubspot_form_id, event_id: c.event_id, form_type: c.form_type, since: prev.since as string, checked_at: now, check_error: checkError, hubspot_count: hubspotCount, eventpilot_count: epCount,
    gap, workflow_ok: workflowOk, workflow_problem: workflowProblem, last_received_at: (last?.submitted_at as string | null) ?? null, recent_errors: (errs ?? []) as FormHealth['recent_errors'],
  }
}

export async function checkOne(eventId: string, formType: string): Promise<FormHealth | null> {
  const c = await loadConn(eventId, formType)
  return c ? checkForm(c) : null
}

/** Brings the chosen HubSpot submissions into EventPilot, built from what the submitter actually entered. Safe to repeat: a submission is only ever added once. */
export async function fillGap(eventId: string, formType: string, conversionIds: string[]): Promise<{ added: number; skipped: number }> {
  const c = await loadConn(eventId, formType)
  if (!c) throw new Error('No HubSpot form is connected here.')
  const health = await ensureHealthRow(c)
  const want = new Set(conversionIds)
  const subs = (await listSubmissions(c.hubspot_form_id, new Date(health.since as string).getTime())).filter(s => want.has(s.conversionId))
  const mapping = (c.field_mapping ?? []) as HubSpotFieldMapping[]
  let added = 0, skipped = 0
  for (const s of subs) {
    const key = `conv:${s.conversionId}`
    const { data: have } = await supabaseAdmin.from('stakeholder_form_submissions').select('id').eq('hubspot_submission_key', key).maybeSingle()
    if (have) { skipped++; continue }
    const props: Record<string, string | undefined> = {}
    for (const v of s.values) props[v.name] = v.value
    await addConsentValues(c.hubspot_form_id, mapping, props)
    const { submittedData, fileUrls } = applyMapping(mapping, props)
    const { error } = await supabaseAdmin.from('stakeholder_form_submissions').insert({
      event_id: c.event_id, form_type: c.form_type, submitted_data: submittedData, file_urls: fileUrls, source: 'hubspot', hubspot_submission_key: key, submitted_at: new Date(s.submittedAt).toISOString(),
    })
    if (error) throw new Error(error.message)
    added++
  }
  return { added, skipped }
}

export async function dismissGap(eventId: string, formType: string, conversionIds: string[]): Promise<void> {
  const c = await loadConn(eventId, formType)
  if (!c) return
  const h = await ensureHealthRow(c)
  const dismissed = [...new Set([...((h.dismissed as string[]) ?? []), ...conversionIds])]
  await supabaseAdmin.from('hubspot_form_sync_health').update({ dismissed, gap: ((h.gap as GapEntry[]) ?? []).filter(g => !conversionIds.includes(g.conversion_id)) }).eq('hubspot_form_id', c.hubspot_form_id)
}

/** The 15-minute job: checks every connected form and raises ONE alert per problem (a submission HubSpot has had for 30+ minutes that EventPilot hasn't, or a broken workflow). */
export async function runGapCheck(): Promise<{ forms: number; withGap: number; alerted: number }> {
  const { data: conns } = await supabaseAdmin.from('event_hubspot_forms').select('event_id, form_type, hubspot_form_id, field_mapping, hubspot_workflow_id')
  let withGap = 0, alerted = 0
  for (const c of (conns ?? []) as Conn[]) {
    const h = await checkForm(c)
    if (h.gap.length) withGap++
    const { data: row } = await supabaseAdmin.from('hubspot_form_sync_health').select('last_alert_at').eq('hubspot_form_id', c.hubspot_form_id).single()
    const lastAlert = row?.last_alert_at ? new Date(row.last_alert_at as string).getTime() : 0
    const overdue = h.gap.filter(g => Date.now() - new Date(g.first_seen).getTime() >= ALERT_AFTER_MS)
    const newOverdue = overdue.some(g => new Date(g.first_seen).getTime() > lastAlert)
    const brokenWorkflow = h.workflow_ok === false
    if (!(newOverdue || ((overdue.length || brokenWorkflow) && Date.now() - lastAlert > REALERT_AFTER_MS))) continue
    if (await sendGapAlert(c, h, overdue)) {
      alerted++
      await supabaseAdmin.from('hubspot_form_sync_health').update({ last_alert_at: new Date().toISOString() }).eq('hubspot_form_id', c.hubspot_form_id)
    }
  }
  return { forms: (conns ?? []).length, withGap, alerted }
}

async function sendGapAlert(c: Conn, h: FormHealth, overdue: GapEntry[]): Promise<boolean> {
  const { data: ev } = await supabaseAdmin.from('events').select('name').eq('id', c.event_id).maybeSingle()
  const name = (ev?.name as string) || 'an event'
  const link = `/admin/events/${c.event_id}/stakeholders/hubspot-form/${c.form_type}`
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = [
    overdue.length ? `<p>HubSpot has ${overdue.length} ${c.form_type} form submission${overdue.length > 1 ? 's' : ''} for <strong>${esc(name)}</strong> that EventPilot doesn't, for over 30 minutes:</p><ul>${overdue.slice(0, 10).map(g => `<li>${esc(g.email || 'no email')} — submitted ${esc(g.submitted_at.slice(0, 16).replace('T', ' '))} UTC</li>`).join('')}</ul><p>Check HubSpot's spam tab for the form first; if they aren't there, use "Bring in" on the card.</p>` : '',
    h.workflow_ok === false ? `<p><strong>The HubSpot workflow needs attention:</strong> ${esc(h.workflow_problem ?? '')}</p>` : '',
    `<p><a href="${siteUrl()}${link}">Open the Sync health card</a></p>`,
  ].join('')
  return sendAlert('hubspot_sync_gap', {
    subject: `HubSpot form not syncing: ${name} (${c.form_type})`, html, link, eventId: c.event_id,
    bellTitle: `HubSpot form not syncing: ${name}`, bellBody: overdue.length ? `${overdue.length} submission(s) missing in EventPilot` : (h.workflow_problem ?? 'Workflow needs attention'),
  })
}
