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
*/
export async function resolveSenderIdentity(
  session: TcsSession | null | undefined,
  templateFallback: { sender_name: string; sender_email: string }
): Promise<SenderIdentity> {
  if (!session?.sid || session.sid === 'super-admin') {
    return { name: templateFallback.sender_name, email: templateFallback.sender_email }
  }
  const { data: staff } = await supabaseAdmin.from('staff_members').select('name, email').eq('id', session.sid).single()
  if (!staff?.email) return { name: templateFallback.sender_name, email: templateFallback.sender_email }
  return { name: staff.name ?? templateFallback.sender_name, email: staff.email }
}
