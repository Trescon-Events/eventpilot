import { supabaseAdmin } from '@/app/lib/supabase'

/* Reference Documents spec, Stage 4 (2026-09-10) — release gate. Rewritten
   2026-09-11 for the umbrella/event structural separation — an umbrella's
   requires_client_approval now lives on event_umbrellas, not another
   events row. requires_client_approval is settable at umbrella or event
   level; a null value on a child inherits the umbrella's, an explicit
   value overrides. This only ever resolves for a real event — an
   announcement is always generated for a specific event, never "for" an
   umbrella directly. Defaults to false when neither is set — not all
   managed-event clients demand approval on every asset, so this is
   opt-in per event, never derived from `type`. */
export async function resolveRequiresClientApproval(eventId: string): Promise<boolean> {
  const { data: event } = await supabaseAdmin
    .from('events').select('id, requires_client_approval, umbrella_id').eq('id', eventId).single()
  if (!event) return false
  if (event.requires_client_approval !== null) return event.requires_client_approval

  if (event.umbrella_id) {
    const { data: umbrella } = await supabaseAdmin
      .from('event_umbrellas').select('requires_client_approval').eq('id', event.umbrella_id).single()
    return umbrella?.requires_client_approval ?? false
  }
  return false
}

// Where the gate is on, client approval must be resolved before internal
// approval can even be requested — reuses the existing three-layer
// announcement_approvals/send-for-client-approval machinery unchanged,
// this only re-sequences WHEN it's allowed to run. Does not rebuild any
// of the approval flow itself, per the spec's explicit instruction.
export async function checkClientApprovalPrerequisite(announcementId: string, eventId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const requires = await resolveRequiresClientApproval(eventId)
  if (!requires) return { ok: true }

  const { data: announcement } = await supabaseAdmin
    .from('stakeholder_announcements').select('client_approval_bypassed_at').eq('id', announcementId).single()
  if (announcement?.client_approval_bypassed_at) return { ok: true }

  const { data: clientApprovals } = await supabaseAdmin
    .from('announcement_approvals')
    .select('status, created_at')
    .eq('announcement_id', announcementId).eq('layer', 'client')
    .order('created_at', { ascending: false })

  const latest = clientApprovals?.[0]
  if (latest && (latest.status === 'approved' || latest.status === 'approved_with_comments')) return { ok: true }

  return {
    ok: false,
    message: latest?.status === 'changes_requested'
      ? 'Client has requested changes — resolve that before requesting internal approval.'
      : 'This event requires client approval before internal approval — send for client approval first.',
  }
}
