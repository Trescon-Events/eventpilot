import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { generateAnnouncementCopy, describeGeminiError, type EventContext } from '@/app/lib/events/announcements'
import { resolveEffectiveRules } from '@/app/lib/content/resolve-validation-rules'
import { requireSetupView } from '../access'

/* POST /api/events/sae-setup/samples  Body: { event_id }
   "Generate 3 samples" on the Setup tab: runs the real copy generator for up to three confirmed speakers and returns the copy and
   findings. Writes NOTHING (no stakeholder_announcements rows, no creative) and is not behind the approval gate — its job is to let an
   admin see output before approving. */
export const maxDuration = 120
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string } | null
  if (!body?.event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const denied = await requireSetupView(req, body.event_id); if (denied) return denied

  const { data: event } = await supabaseAdmin.from('events').select('*').eq('id', body.event_id).single()
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  const { data: speakers } = await supabaseAdmin.from('event_speakers').select('*').eq('event_id', body.event_id).eq('active', true).eq('confirmation_status', 'Confirmed').order('created_at').limit(3)
  if (!speakers?.length) return NextResponse.json({ error: 'No confirmed speakers to sample.' }, { status: 400 })

  const effectiveRules = await resolveEffectiveRules(body.event_id).catch(() => [])
  const { data: compiled } = await supabaseAdmin.from('event_compiled_reference').select('sections').eq('event_id', body.event_id).order('version', { ascending: false }).limit(1).maybeSingle()
  let sections = compiled?.sections ?? null
  if (!sections) {
    const { data: raw } = await supabaseAdmin.from('event_messaging_docs').select('structured_json').eq('event_id', body.event_id).eq('status', 'live').order('version', { ascending: false }).limit(1).maybeSingle()
    sections = (raw?.structured_json as { sections?: unknown } | null)?.sections ?? null
  }
  const messaging = sections ? { sections } as Record<string, unknown> : null

  const samples = await Promise.all(speakers.map(async (s, i) => {
    try {
      const r = await generateAnnouncementCopy(event as unknown as EventContext, s, null, messaging, effectiveRules, 'org_promo', event.sae_copy_mode === 'assembled' ? { openerStyleIndex: i % 4, recentHooks: [] } : undefined)
      return { speaker: s.public_name || s.name, copy: r.copy, x_copy: r.xCopy, findings: r.validationFindings, attempts: r.attempts }
    } catch (e) { return { speaker: s.public_name || s.name, error: describeGeminiError(e) } }
  }))
  return NextResponse.json({ samples })
}
