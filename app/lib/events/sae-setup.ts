import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { resolveEffectiveRuleRowsForOwner } from '@/app/lib/content/resolve-validation-rules'
import { orgDocsReachEvent } from '@/app/lib/content/trescon-layer'
import { cleanField, cleanEventPatch } from '@/app/lib/text/clean-field'
import { logEventFieldChanges } from '@/app/lib/events/detail-field-log'
import { runReadiness, blockingChecks, type ReadinessCheck, type ReadinessEvent, type ReadinessDoc } from './sae-readiness'

/* SAE setup approval (docs/build_suggestions/sae-readiness-and-setup-approval.md, Part 3) — server side: loads everything the
   readiness check and the fingerprint need, and decides whether generation may run.

   Gate rules (evaluateGate):
   - any blocking readiness check fails                         -> refuse (always, grandfathered or not)
   - sae_setup_enforce and the event is not approved            -> refuse
   - sae_setup_enforce and the fingerprint changed since approval-> refuse
   - not enforced (the six grandfathered live events) and the fingerprint changed -> allowed, amber "setup changed" banner only. */

export type DocRow = ReadinessDoc & { version: number; title: string | null; authority_rank: number | null; provenance: string | null; uploaded_by: string | null; created_at: string; owner: 'event' | 'umbrella' | 'org'; owner_name: string | null }
export type RuleRow = { id: string; rule_key: string; rule_type: string; pattern: string; severity: string; message: string; source_clause: string | null; owner: 'event' | 'umbrella' | 'org' }

const EVENT_COLS = 'id, name, public_name, public_dates_display, public_venue_display, event_hashtag, registration_url, announcement_cta_label, announcement_attribution_line, sae_copy_mode, announcement_line_emojis, umbrella_id, sae_compile_error, sae_setup_approved_at, sae_setup_approved_by, sae_setup_fingerprint, sae_setup_enforce'
export type SetupEvent = ReadinessEvent & { announcement_line_emojis: boolean | null; sae_setup_approved_at: string | null; sae_setup_approved_by: string | null; sae_setup_fingerprint: string | null; sae_setup_enforce: boolean }

export type SetupSnapshot = {
  event: SetupEvent
  docs: DocRow[]
  liveDocs: DocRow[]
  compiled: { version: number; conflicts: unknown[] | null } | null
  rules: RuleRow[]
  checks: ReadinessCheck[]
  fingerprint: string
}

export function computeFingerprint(event: SetupEvent, liveDocs: Pick<DocRow, 'id' | 'version'>[], rules: RuleRow[]): string {
  const payload = {
    // cleanField'd, so a stray space can never move the fingerprint (and relock an approved event)
    f: [event.name, event.public_name, event.public_dates_display, event.public_venue_display, event.event_hashtag, event.registration_url, event.announcement_cta_label, event.announcement_attribution_line].map(v => cleanField(v)),
    mode: event.sae_copy_mode, emojis: event.announcement_line_emojis ?? null,
    docs: liveDocs.map(d => `${d.id}:${d.version}`).sort(),
    rules: rules.map(r => `${r.id}:${crypto.createHash('sha1').update(JSON.stringify([r.rule_key, r.rule_type, r.pattern, r.severity, r.message, r.source_clause])).digest('hex')}`).sort(),
  }
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

export async function loadSetupSnapshot(eventId: string): Promise<SetupSnapshot | null> {
  const { data: ev } = await supabaseAdmin.from('events').select(EVENT_COLS).eq('id', eventId).maybeSingle()
  if (!ev) return null
  let event = ev as unknown as SetupEvent
  // Lossless auto-clean: invisible characters / stray spaces in the event's text fields are removed here, logged, and generation carries on.
  const cleaned = cleanEventPatch(event as unknown as Record<string, unknown>)
  const changedKeys = Object.keys(cleaned).filter(k => (event as unknown as Record<string, unknown>)[k] !== cleaned[k])
  if (changedKeys.length) {
    const patch = Object.fromEntries(changedKeys.map(k => [k, cleaned[k]]))
    const { error: cleanErr } = await supabaseAdmin.from('events').update(patch).eq('id', eventId)
    if (cleanErr) console.error(`Auto-clean failed for event ${eventId}:`, cleanErr)
    else {
      console.log(`[sae-setup] auto-cleaned ${changedKeys.join(', ')} on event ${eventId}`)
      await logEventFieldChanges(eventId, event as unknown as Record<string, unknown>, patch, 'auto_clean', null)
      event = { ...event, ...patch } as SetupEvent
    }
  }
  const docSel = 'id, role, status, extraction_status, version, title, authority_rank, provenance, uploaded_by, created_at'
  const [{ data: own }, { data: umb }, { data: umbrella }, { data: comp }, effectiveRules, orgReach] = await Promise.all([
    supabaseAdmin.from('event_messaging_docs').select(docSel).eq('event_id', eventId),
    event.umbrella_id ? supabaseAdmin.from('event_messaging_docs').select(docSel).eq('umbrella_id', event.umbrella_id) : Promise.resolve({ data: [] as unknown[] }),
    event.umbrella_id ? supabaseAdmin.from('event_umbrellas').select('name').eq('id', event.umbrella_id).maybeSingle() : Promise.resolve({ data: null }),
    supabaseAdmin.from('event_compiled_reference').select('version, conflicts').eq('event_id', eventId).order('version', { ascending: false }).limit(1).maybeSingle(),
    // Effective rules (own + umbrella + Trescon-wide, minus overrides) — so a Trescon-wide rule change or an override moves the fingerprint.
    resolveEffectiveRuleRowsForOwner({ kind: 'event', id: eventId }),
    orgDocsReachEvent(eventId),
  ])
  const { data: orgDocRows } = orgReach ? await supabaseAdmin.from('event_messaging_docs').select(docSel).eq('org_scope', 'trescon') : { data: [] as unknown[] }
  const umbrellaName = (umbrella as { name?: string } | null)?.name ?? null
  const docs: DocRow[] = [
    ...((own ?? []) as unknown as Omit<DocRow, 'owner' | 'owner_name'>[]).map(d => ({ ...d, owner: 'event' as const, owner_name: event.public_name ?? event.name })),
    ...((umb ?? []) as unknown as Omit<DocRow, 'owner' | 'owner_name'>[]).map(d => ({ ...d, owner: 'umbrella' as const, owner_name: umbrellaName })),
    ...((orgDocRows ?? []) as unknown as Omit<DocRow, 'owner' | 'owner_name'>[]).map(d => ({ ...d, owner: 'org' as const, owner_name: 'Trescon-wide' })),
  ]
  const liveDocs = docs.filter(d => d.status === 'live')
  const rules: RuleRow[] = effectiveRules.map(r => ({ id: r.id, rule_key: r.rule_key, rule_type: r.rule_type, pattern: r.pattern, severity: r.severity, message: r.message, source_clause: r.source_clause, owner: r.level }))
  const compiled = comp as SetupSnapshot['compiled']
  const checks = runReadiness({ event, docs, compiled })
  return { event, docs, liveDocs, compiled, rules, checks, fingerprint: computeFingerprint(event, liveDocs, rules) }
}

export type GateResult = { ok: boolean; reasons: string[]; changedSinceApproval: boolean; snapshot: SetupSnapshot }

/** Pure decision from a snapshot (exported for tests). */
export function decideGate(s: SetupSnapshot): { ok: boolean; reasons: string[]; changedSinceApproval: boolean } {
  const reasons = blockingChecks(s.checks).map(c => c.message)
  const e = s.event
  const approved = !!e.sae_setup_approved_at
  const changed = approved && !!e.sae_setup_fingerprint && e.sae_setup_fingerprint !== s.fingerprint
  if (e.sae_setup_enforce) {
    if (!approved) reasons.push('This event’s setup has not been approved yet. An admin approves it once on Event Details → Setup.')
    else if (changed) reasons.push('Setup changed since it was approved (documents, rules or event details). An admin must re-approve it on Event Details → Setup.')
  }
  return { ok: reasons.length === 0, reasons, changedSinceApproval: changed }
}

export async function evaluateGate(eventId: string): Promise<GateResult | null> {
  const snapshot = await loadSetupSnapshot(eventId)
  if (!snapshot) return null
  return { ...decideGate(snapshot), snapshot }
}

/** For the generator routes: null when generation may proceed, otherwise a 409 with every reason listed. A missing event is not this
    gate's business (the route's own 404 handles it). */
export async function setupGateResponse(eventId: string): Promise<NextResponse | null> {
  let g: GateResult | null = null
  try { g = await evaluateGate(eventId) } catch (e) { console.error('SAE setup gate failed to evaluate:', e); return NextResponse.json({ error: 'Could not check this event’s setup. Try again in a moment.', code: 'sae_setup_unavailable' }, { status: 503 }) }
  if (!g || g.ok) return null
  return NextResponse.json({ error: `Setup isn’t ready: ${g.reasons.join(' ')}`, reasons: g.reasons, code: 'sae_setup_not_ready', fix_href: `/admin/events/${eventId}/details?tab=setup` }, { status: 409 })
}
