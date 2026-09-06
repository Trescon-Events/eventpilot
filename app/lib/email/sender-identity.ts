import { supabaseAdmin } from '@/app/lib/supabase'
import type { TcsSession } from '@/app/lib/access/session'

export type SenderIdentity = { name: string; email: string }

/*
  Resolves who an outgoing stakeholder email should actually be sent as —
  the real logged-in staffer, not whoever authored the email template.

  2026-08-17: fixes a real bug — email_templates.sender_name/sender_email
  is a per-template field an admin sets once when authoring the template
  (SenderPicker.tsx), and every send previously used that stored value
  unconditionally regardless of who was actually composing/sending. It
  only ever looked correct because the person who built and tested this
  feature (Madhu) also happened to be the one who set himself as the
  template's sender — every other staffer sending the same template sent
  as him too.

  Falls back to the template's own stored sender only when the current
  session has no real mailbox to send from at all (the synthetic
  'super-admin' session, or a staff_members lookup miss) — Microsoft Graph
  app-only sending (see graph-mail.ts) requires a real M365 mailbox in the
  API path, and 'super-admin' isn't one.

  Producer-attributed sending (2026-09-06, per Madhu) — when the email is
  about a specific speaker who has an assigned Producer
  (event_speakers.producer_staff_id, see supabase/speaker_producer_
  reference_confirmation_migration.sql), it should read as coming from
  THAT producer — the person who actually owns the relationship with this
  speaker — not whoever on the team happened to click Send (e.g. an admin
  doing a batch operation, or a different producer covering for someone).
  Takes priority over the logged-in session, but only when the producer
  lookup actually resolves to a real mailbox; falls straight through to
  the existing session/template chain otherwise, so every event that
  doesn't use the Producer field (i.e. everything except DFS today) is
  completely unaffected. No new Azure/Graph permission needed — app-only
  Graph sending already accepts an arbitrary `senderEmail` (see
  sendGraphMail in graph-mail.ts), it was never restricted to the calling
  user's own mailbox the way delegated OAuth would be.
*/
export async function resolveSenderIdentity(
  session: TcsSession | null | undefined,
  templateFallback: { sender_name: string; sender_email: string },
  producerStaffId?: string | null
): Promise<SenderIdentity> {
  if (producerStaffId) {
    const { data: producer } = await supabaseAdmin.from('staff_members').select('name, email').eq('id', producerStaffId).single()
    if (producer?.email) return { name: producer.name ?? templateFallback.sender_name, email: producer.email }
  }
  if (!session?.sid || session.sid === 'super-admin') {
    return { name: templateFallback.sender_name, email: templateFallback.sender_email }
  }
  const { data: staff } = await supabaseAdmin.from('staff_members').select('name, email').eq('id', session.sid).single()
  if (!staff?.email) return { name: templateFallback.sender_name, email: templateFallback.sender_email }
  return { name: staff.name ?? templateFallback.sender_name, email: staff.email }
}

// Shared one-liner every stakeholder-email route uses to feed
// resolveSenderIdentity's producerStaffId param — null for a partner
// announcement (partners have no Producer field) or a speaker with none
// assigned, which is the correct "no override" input either way.
export async function getSpeakerProducerId(speakerId: string | null | undefined): Promise<string | null> {
  if (!speakerId) return null
  const { data } = await supabaseAdmin.from('event_speakers').select('producer_staff_id').eq('id', speakerId).single()
  return data?.producer_staff_id ?? null
}
