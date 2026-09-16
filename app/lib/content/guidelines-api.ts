import { supabaseAdmin } from '@/app/lib/supabase'
import { createHash } from 'node:crypto'
import { getLatestCompiledReference, type CompiledSection } from './compile-reference'
import { resolveEffectiveRules } from './resolve-validation-rules'
import type { ValidationRule } from './validate'
import { TRACKED_EVENT_FIELDS, FIELD_LABELS, type TrackedEventField } from '@/app/lib/events/detail-fields'

/* Content Guidelines API (2026-09-16) — see
   ~/Downloads/EventPilot_Content_Guidelines_API_Spec.md.

   Assembles GET /api/public/v1/content-guidelines' response from
   event_compiled_reference (already-merged event+umbrella sections, see
   compile-reference.ts) and the effective validation rule set. Two
   deliberate departures from the spec's illustrative response shape,
   because they assumed structure that doesn't exist in this codebase:

   - "Event facts" is TRACKED_EVENT_FIELDS off the `events` row (public
     name/dates/venue/links), not a `default_fields` block on the compiled
     reference — event_compiled_reference has no such column.
     default_fields only ever exists transiently on a DRAFT messaging doc;
     once approved it's written straight into `events`' own columns (see
     .../messaging/[id]/approve/route.ts) and that's the only place it
     persists. The spec's own example fields (Delegates, Speakers,
     Business Pass) aren't tracked fields at all — illustrative, not real.
   - "document_version"/"approved_at" come from the compiled reference's
     own version/compiled_at plus the latest source doc's updated_at
     (the moment it went live) — event_messaging_docs has no separate
     approved_at column, updated_at IS the approval timestamp (see
     approve/route.ts's `.update({ status: 'live', updated_at: ... })`). */

export type GuidelineSection = CompiledSection & {
  topic?: string
  confidence?: 'high' | 'medium' | 'low'
  source: 'event' | 'umbrella'
}

export type EventGuidelines = {
  event: { id: string; name: string | null }
  umbrella: { id: string; name: string } | null
  generated_at: string
  document_version: number
  approved_at: string | null
  event_facts: Array<{ key: TrackedEventField; label: string; value: string }>
  sections: GuidelineSection[]
  validation_rules: ValidationRule[]
}

export async function getEventGuidelines(eventId: string): Promise<EventGuidelines | null> {
  const { data: event } = await supabaseAdmin
    .from('events')
    .select(`id, name, umbrella_id, ${TRACKED_EVENT_FIELDS.join(', ')}`)
    .eq('id', eventId)
    .maybeSingle() as { data: (Record<string, unknown> & { id: string; name: string; umbrella_id: string | null }) | null }
  if (!event) return null

  const [compiled, rules, umbrella] = await Promise.all([
    getLatestCompiledReference(eventId),
    resolveEffectiveRules(eventId),
    event.umbrella_id
      ? supabaseAdmin.from('event_umbrellas').select('id, name').eq('id', event.umbrella_id).maybeSingle().then(r => r.data)
      : Promise.resolve(null),
  ])

  const sourceDocIds = (compiled?.source_doc_ids ?? []) as string[]
  const { data: sourceDocs } = sourceDocIds.length
    ? await supabaseAdmin.from('event_messaging_docs').select('id, event_id, umbrella_id, updated_at').in('id', sourceDocIds)
    : { data: [] as Array<{ id: string; event_id: string | null; umbrella_id: string | null; updated_at: string }> }

  const ownerByDocId = new Map((sourceDocs ?? []).map(d => [d.id, d.event_id ? 'event' as const : 'umbrella' as const]))
  const approvedAt = (sourceDocs ?? []).reduce<string | null>(
    (latest, d) => (!latest || d.updated_at > latest ? d.updated_at : latest), null
  )

  const sections: GuidelineSection[] = ((compiled?.sections ?? []) as CompiledSection[]).map(s => ({
    ...s,
    source: ownerByDocId.get(s.source_doc_id) ?? 'event',
  }))

  const event_facts = TRACKED_EVENT_FIELDS
    .map(key => ({ key, label: FIELD_LABELS[key], value: event[key] as string | null }))
    .filter((f): f is { key: TrackedEventField; label: string; value: string } => !!f.value)

  return {
    event: { id: event.id, name: event.name },
    umbrella: umbrella as { id: string; name: string } | null,
    generated_at: new Date().toISOString(),
    document_version: compiled?.version ?? 0,
    approved_at: approvedAt,
    event_facts,
    sections,
    validation_rules: rules,
  }
}

export function computeGuidelinesETag(g: EventGuidelines): string {
  const rulesHash = createHash('sha256')
    .update(JSON.stringify(g.validation_rules.map(r => r.rule_key)))
    .digest('hex')
    .slice(0, 12)
  return `"${g.document_version}-${rulesHash}"`
}

const ROLE_TITLES: Record<CompiledSection['role'], string> = {
  style_guide: 'Style Guide',
  messaging: 'Messaging',
  production_pack: 'Production Pack',
}

function renderSectionMarkdown(s: GuidelineSection): string {
  const lines: string[] = [`### ${s.title}`]
  if (s.confidence === 'low') lines.push('_Low-confidence extraction — verify before relying on this._')
  if (s.source === 'umbrella') lines.push('_Inherited from the umbrella event._')

  if (s.kind === 'rules') {
    const bullets = (typeof s.content === 'string' ? s.content : '')
      .split('\n').map(l => l.trim()).filter(l => l.startsWith('- ') || l.startsWith('• '))
      .map(l => l.replace(/^[-•]\s*/, ''))
    lines.push(...bullets.map((b, i) => `${i + 1}. ${b}`))
  } else if (s.kind === 'table' && s.content && typeof s.content === 'object') {
    const { columns, rows } = s.content as { columns: string[]; rows: string[][] }
    if (columns?.length) {
      lines.push(`| ${columns.join(' | ')} |`)
      lines.push(`|${columns.map(() => '---').join('|')}|`)
      for (const row of rows ?? []) lines.push(`| ${row.join(' | ')} |`)
    }
  } else if (s.kind === 'facts' && Array.isArray(s.content)) {
    lines.push('| Fact | Detail | Source |')
    lines.push('|---|---|---|')
    for (const f of s.content as Array<{ fact?: string; detail?: string; source?: string }>) {
      lines.push(`| ${f.fact ?? ''} | ${f.detail ?? ''} | ${f.source ?? ''} |`)
    }
  } else {
    lines.push(typeof s.content === 'string' ? s.content : JSON.stringify(s.content))
  }

  return lines.join('\n')
}

export function renderGuidelinesMarkdown(g: EventGuidelines, includeRoles: CompiledSection['role'][]): string {
  const out: string[] = [`# Content Guidelines — ${g.event.name ?? 'Untitled event'}`]
  const approved = g.approved_at ? new Date(g.approved_at).toISOString().slice(0, 10) : 'not yet approved'
  out.push(`Generated ${g.generated_at} · Document version ${g.document_version} · Approved ${approved}`, '')

  if (g.event_facts.length) {
    out.push('## Event facts')
    out.push(...g.event_facts.map(f => `- ${f.label}: ${f.value}`))
    if (g.umbrella) out.push(`- Part of: ${g.umbrella.name}`)
    out.push('')
  }

  for (const role of includeRoles) {
    const roleSections = g.sections.filter(s => s.role === role).sort((a, b) => a.order - b.order)
    if (!roleSections.length) continue
    out.push(`## ${ROLE_TITLES[role]}`, '')
    for (const s of roleSections) out.push(renderSectionMarkdown(s), '')
  }

  if (g.validation_rules.length) {
    out.push(
      '---',
      'Validate before publishing:',
      'POST /api/events/stakeholders/content/validate'
    )
  }

  return out.join('\n')
}

export function renderGuidelinesJson(g: EventGuidelines, includeRoles: CompiledSection['role'][]) {
  return {
    event: { id: g.event.id, name: g.event.name },
    generated_at: g.generated_at,
    document_version: g.document_version,
    approved_at: g.approved_at,
    event_facts: g.event_facts,
    sections: g.sections.filter(s => includeRoles.includes(s.role)),
    validation_rules: g.validation_rules,
    umbrella: g.umbrella,
  }
}
