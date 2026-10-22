import type { TcsSession } from '@/app/lib/access/session'
import { getAccessibleEventIds } from '@/app/lib/access/event-access'

/* Who may EDIT the workspace email templates (2026-10-23, per Madhu): platform admins, and producers — anyone who can edit Stakeholder Hub content on at least one
   event ('sae.stakeholders.edit'). Creating and deleting templates stays admin-only. Templates are shared by every event, so an edit applies everywhere. */
export async function canEditEmailTemplates(session: TcsSession | null | undefined): Promise<boolean> {
  if (!session) return false
  if (session.adm) return true
  if (!session.sid || session.vt) return false
  const { allEvents, eventIds } = await getAccessibleEventIds(session.sid, 'sae.stakeholders.edit')
  return allEvents || eventIds.length > 0
}
