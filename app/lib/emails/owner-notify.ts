import { supabaseAdmin } from '@/app/lib/supabase'
import { sendSystemMail } from '@/app/lib/email/system-mail'
import { notifyStaff } from '@/app/lib/notify'

/* Tells the owner of an email something about it (2026-11-12): a bell notification and a system email (from the no-reply address, internal only). Never throws. */

const APP_URL = 'https://eventpilot.tresconglobal.com'

export type CampLike = { id: unknown; name: unknown; event_id: unknown; owner_staff_id?: unknown; created_by?: unknown }

export async function notifyOwner(c: CampLike, type: string, title: string, body: string): Promise<void> {
  const ownerId = ((c.owner_staff_id as string | null) ?? (c.created_by as string | null)) ?? null
  if (!ownerId || ownerId === 'super-admin') return
  const link = `/admin/events/${c.event_id}/stakeholders/emails?open=${c.id}`
  await notifyStaff([ownerId], { type: `email_${type}`, title, body, link, eventId: c.event_id as string })
  try {
    const { data: s } = await supabaseAdmin.from('staff_members').select('email').eq('id', ownerId).maybeSingle()
    // eslint-disable-next-line no-restricted-syntax -- email HTML needs literal colours (mail clients cannot read CSS custom properties)
    if (s?.email) await sendSystemMail({ to: s.email as string, subject: title, html: `<p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1A2530;">${body.replace(/</g, '&lt;')}</p><p style="font-family:Arial,sans-serif;font-size:15px;"><a href="${APP_URL}${link}">Open it in EventPilot</a></p>` })
  } catch (e) { console.error('[emails] owner mail failed:', e instanceof Error ? e.message : e) }
}
