import { supabaseAdmin } from '@/app/lib/supabase'
import { sendSystemMail } from '@/app/lib/email/system-mail'
import { notifyStaff } from '@/app/lib/notify'
import { SUPER_ADMIN_EMAIL } from '@/app/lib/access/super-admin'
import { alertTypeByKey } from './types'

/* The one way to raise a system alert. Recipients come from the Super Admin's settings (alert_recipients), per alert type; a type nobody was chosen for goes to the Super Admin.
   Returns false when nothing could be delivered, so the caller can try again on its next run instead of believing it alerted someone. */

export type AlertContent = { subject: string; html: string; bellTitle: string; bellBody: string; link?: string; eventId?: string | null }

export async function alertRecipients(type: string): Promise<{ id: string; email: string; wantsEmail: boolean; wantsBell: boolean }[]> {
  const { data: rows } = await supabaseAdmin.from('alert_recipients').select('staff_id, email, bell').eq('alert_type', type)
  const ids = (rows ?? []).map(r => r.staff_id as string)
  const { data: people } = ids.length
    ? await supabaseAdmin.from('staff_members').select('id, email, access_enabled').in('id', ids)
    : await supabaseAdmin.from('staff_members').select('id, email, access_enabled').eq('email', SUPER_ADMIN_EMAIL)
  const flags = new Map((rows ?? []).map(r => [r.staff_id as string, r]))
  return (people ?? []).filter(p => p.email && p.access_enabled !== false).map(p => ({
    id: p.id as string, email: p.email as string, wantsEmail: flags.get(p.id as string)?.email ?? true, wantsBell: flags.get(p.id as string)?.bell ?? true,
  }))
}

export async function sendAlert(type: string, c: AlertContent): Promise<boolean> {
  if (!alertTypeByKey(type)) throw new Error(`Unknown alert type: ${type}`)
  const to = await alertRecipients(type)
  if (!to.length) return false
  const bell = to.filter(r => r.wantsBell).map(r => r.id)
  if (bell.length) await notifyStaff(bell, { type, title: c.bellTitle, body: c.bellBody, link: c.link, eventId: c.eventId ?? null })
  const mail = to.filter(r => r.wantsEmail).map(r => r.email)
  if (mail.length) {
    try { await sendSystemMail({ to: mail, subject: c.subject, html: c.html }) } catch (e) { console.error('[alert] email failed:', e instanceof Error ? e.message : e); return bell.length > 0 }
  }
  return bell.length > 0 || mail.length > 0
}
