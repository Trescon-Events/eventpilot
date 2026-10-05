import { supabaseAdmin } from '@/app/lib/supabase'
import { sendGraphMailNewThread, sendGraphMailReply, GraphThreadGoneError } from '@/app/lib/email/graph-mail'

// One shared subject per speaker per event — the same convention producers use
// by hand ("<Speaker> @ <Event>"), so EventPilot sends land in their existing
// thread instead of opening a new one per communication type.
export function speakerThreadSubject(speakerName: string, eventName: string): string {
  return `${speakerName} @ ${eventName}`
}

type SendOpts = Parameters<typeof sendGraphMailNewThread>[0]

/*
  Sends a speaker-facing email into that speaker's single thread (per sender
  mailbox). First send creates the thread and stores its Graph message id in
  speaker_email_threads; later sends reply on it. If the stored message is gone
  (producer deleted the thread) a fresh thread is started and the row replaced.
  `opts.subject` is only used when a new thread is started; replies keep the
  thread's subject. Returns the subject actually used, for send logging.
*/
export async function sendSpeakerThreadMail(speakerId: string, opts: SendOpts): Promise<{ subject: string; threaded: boolean }> {
  const { data: speaker } = await supabaseAdmin.from('event_speakers').select('event_id, name, public_name').eq('id', speakerId).single()
  if (!speaker) throw new Error('Speaker not found for threading')
  const { data: event } = await supabaseAdmin.from('events').select('name, public_name').eq('id', speaker.event_id).single()
  const threadSubject = speakerThreadSubject(speaker.public_name || speaker.name || '', event?.public_name || event?.name || '')
  const sender = opts.senderEmail.toLowerCase()

  const { data: existing } = await supabaseAdmin
    .from('speaker_email_threads').select('graph_message_id, subject')
    .eq('speaker_id', speakerId).eq('sender_email', sender).maybeSingle()

  if (existing) {
    try {
      await sendGraphMailReply({ ...opts, anchorMessageId: existing.graph_message_id })
      await supabaseAdmin.from('speaker_email_threads').update({ updated_at: new Date().toISOString() }).eq('speaker_id', speakerId).eq('sender_email', sender)
      return { subject: existing.subject, threaded: true }
    } catch (e) {
      if (!(e instanceof GraphThreadGoneError)) throw e
    }
  }

  const { messageId, conversationId } = await sendGraphMailNewThread({ ...opts, subject: threadSubject })
  await supabaseAdmin.from('speaker_email_threads').upsert({
    speaker_id: speakerId, event_id: speaker.event_id, sender_email: sender,
    graph_message_id: messageId, graph_conversation_id: conversationId, subject: threadSubject,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'speaker_id,sender_email' })
  return { subject: threadSubject, threaded: true }
}

// For routes where the announcement may or may not be about a speaker (partner
// announcements have none): thread when there is one, else plain send.
export async function sendMaybeSpeakerThreadMail(speakerId: string | null | undefined, opts: SendOpts): Promise<{ subject: string }> {
  if (speakerId) return sendSpeakerThreadMail(speakerId, opts)
  const { sendGraphMail } = await import('@/app/lib/email/graph-mail')
  await sendGraphMail(opts)
  return { subject: opts.subject }
}
