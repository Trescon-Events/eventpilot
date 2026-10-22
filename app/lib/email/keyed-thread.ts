import { supabaseAdmin } from '@/app/lib/supabase'
import { sendGraphMailNewThread, sendGraphMailReply, GraphThreadGoneError } from '@/app/lib/email/graph-mail'

// One Outlook thread per (event, counterpart key, sender mailbox) — for people who are not a speaker record (see speaker-thread.ts for speakers):
// an invited speaker before they submit the form, and any other counterpart that should stay in one conversation. The first send starts the
// thread with `subject`; later sends reply on it (the thread keeps its original subject). A deleted anchor starts a fresh thread.
// Table: email_threads (supabase/email_threads_migration.sql).

type SendOpts = Parameters<typeof sendGraphMailNewThread>[0]
export const inviteThreadKey = (email: string) => `invite:${email.trim().toLowerCase()}`

export async function findKeyedThread(eventId: string, scopeKey: string, senderEmail: string) {
  const { data } = await supabaseAdmin.from('email_threads').select('id, graph_message_id, graph_conversation_id, subject').eq('event_id', eventId).eq('scope_key', scopeKey).eq('sender_email', senderEmail.toLowerCase()).maybeSingle()
  return data as { id: string; graph_message_id: string; graph_conversation_id: string | null; subject: string } | null
}

export async function sendKeyedThreadMail(eventId: string, scopeKey: string, opts: SendOpts): Promise<{ subject: string }> {
  const sender = opts.senderEmail.toLowerCase()
  const existing = await findKeyedThread(eventId, scopeKey, sender)
  if (existing) {
    try {
      await sendGraphMailReply({ ...opts, anchorMessageId: existing.graph_message_id })
      await supabaseAdmin.from('email_threads').update({ updated_at: new Date().toISOString() }).eq('id', existing.id)
      return { subject: existing.subject }
    } catch (e) {
      if (!(e instanceof GraphThreadGoneError)) throw e
    }
  }
  const { messageId, conversationId } = await sendGraphMailNewThread(opts)
  await supabaseAdmin.from('email_threads').upsert({
    event_id: eventId, scope_key: scopeKey, sender_email: sender, graph_message_id: messageId, graph_conversation_id: conversationId,
    subject: opts.subject, updated_at: new Date().toISOString(),
  }, { onConflict: 'event_id,scope_key,sender_email' })
  return { subject: opts.subject }
}

/** The thread an approval email about one announcement belongs to: one per (speaker/partner, reviewer), subject "<Name> @ <Event> — approval". */
export async function approvalThreadFor(announcement: { event_id: string; speaker_id?: string | null; partner_id?: string | null }, reviewerEmail: string): Promise<{ key: string; subject: string }> {
  const [{ data: ev }, sp, pa] = await Promise.all([
    supabaseAdmin.from('events').select('name, public_name').eq('id', announcement.event_id).maybeSingle(),
    announcement.speaker_id ? supabaseAdmin.from('event_speakers').select('name, public_name').eq('id', announcement.speaker_id).maybeSingle() : Promise.resolve({ data: null }),
    announcement.partner_id ? supabaseAdmin.from('event_sponsors').select('name').eq('id', announcement.partner_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const who = ((sp.data?.public_name as string) || (sp.data?.name as string) || (pa.data?.name as string) || 'Announcement').trim()
  const subject = `${who} @ ${(ev?.public_name as string) || (ev?.name as string) || ''} — approval`
  const id = announcement.speaker_id ?? announcement.partner_id ?? 'announcement'
  return { key: `approval:${id}:${reviewerEmail.trim().toLowerCase()}`, subject }
}
