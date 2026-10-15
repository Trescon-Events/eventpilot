import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { loadSetupSnapshot, decideGate } from '@/app/lib/events/sae-setup'
import { speakerWarnings } from '@/app/lib/events/sae-readiness'
import { buildDateVenueLine, buildAttributionLine, buildFixedCtaLine, type EventContext } from '@/app/lib/events/announcements'
import { getSession } from '@/app/lib/access/session'
import { requireSetupView } from './access'

/* GET /api/events/sae-setup?event_id=X — everything the Setup tab shows: readiness checklist, the fixed lines as they will print,
   the source documents, the active rules by owner, the approval state and per-speaker warnings. Read-only. */
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const denied = await requireSetupView(req, eventId); if (denied) return denied
  const snap = await loadSetupSnapshot(eventId)
  if (!snap) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const { data: full } = await supabaseAdmin.from('events').select('*').eq('id', eventId).single()
  const ctx = full as unknown as EventContext
  const assembled = snap.event.sae_copy_mode === 'assembled'
  const fixedLines = assembled
    ? { dateVenue: buildDateVenueLine(ctx), attribution: buildAttributionLine(ctx), cta: buildFixedCtaLine(ctx), hashtags: snap.event.event_hashtag }
    : null

  const staffIds = [...new Set([snap.event.sae_setup_approved_by, ...snap.docs.map(d => d.uploaded_by)].filter((x): x is string => !!x && /^[0-9a-f-]{36}$/i.test(x)))]
  const { data: staff } = staffIds.length ? await supabaseAdmin.from('staff_members').select('id, name').in('id', staffIds) : { data: [] as { id: string; name: string }[] }
  const nameOf = (id: string | null) => (id ? (staff ?? []).find(s => s.id === id)?.name ?? id : null)

  const { data: speakers } = await supabaseAdmin.from('event_speakers')
    .select('id, name, public_name, role, company, bio, pronoun_style').eq('event_id', eventId).eq('active', true).eq('confirmation_status', 'Confirmed')
  const speakerIssues = (speakers ?? []).map(s => ({ id: s.id, name: s.public_name || s.name, warnings: speakerWarnings(s) })).filter(s => s.warnings.length)

  const gate = decideGate(snap)
  return NextResponse.json({
    event: { id: eventId, name: snap.event.name, public_name: snap.event.public_name, copy_mode: snap.event.sae_copy_mode ?? 'legacy' },
    checks: snap.checks,
    gate: { ok: gate.ok, reasons: gate.reasons, changed_since_approval: gate.changedSinceApproval, enforced: snap.event.sae_setup_enforce },
    approval: { approved_at: snap.event.sae_setup_approved_at, approved_by: nameOf(snap.event.sae_setup_approved_by) },
    fixed_lines: fixedLines,
    docs: snap.docs.map(d => ({ id: d.id, role: d.role, status: d.status, extraction_status: d.extraction_status ?? null, version: d.version, title: d.title, authority_rank: d.authority_rank, provenance: d.provenance, owner: d.owner, owner_name: d.owner_name, uploaded_by: nameOf(d.uploaded_by), created_at: d.created_at })),
    compiled: snap.compiled ? { version: snap.compiled.version, conflicts: snap.compiled.conflicts?.length ?? 0 } : null,
    rules: snap.rules.map(r => ({ id: r.id, owner: r.owner, rule_key: r.rule_key, rule_type: r.rule_type, severity: r.severity, message: r.message, source_clause: r.source_clause })),
    speaker_issues: speakerIssues,
    can_approve: !!getSession(req)?.adm,
  })
}
