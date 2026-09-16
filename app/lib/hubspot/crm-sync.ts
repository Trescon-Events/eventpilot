// Manual "Sync to HubSpot" action — the only way a crm_contacts/
// crm_companies row reaches HubSpot right now (see CRM Admin's Sync button).
// Deliberately not automatic yet: Madhu wants this proven manually first.
import { supabaseAdmin } from '@/app/lib/supabase'
import { upsertHubSpotContact, upsertHubSpotCompany, findOrCreateHubSpotEvent, ensureAssociationLabel, associateWithLabel, HUBSPOT_OBJECT_TYPE } from '@/app/lib/hubspot/crm-client'

const CONTACT_ROLE_LABELS: Record<string, [name: string, label: string]> = {
  speaker: ['speaker', 'Speaker'],
  sponsor_contact: ['sponsor_contact', 'Sponsor Contact'],
}
const COMPANY_ROLE_LABELS: Record<string, [name: string, label: string]> = {
  sponsor: ['sponsor', 'Sponsor'],
  media_partner: ['media_partner', 'Media Partner'],
  association_partner: ['association_partner', 'Association Partner'],
}

export type SyncResult = {
  hubspotId: string
  isNew: boolean
  eventsLinked: number
  eventsSkipped: { eventName: string; role: string }[]
}

export async function syncContactToHubSpot(contactId: string): Promise<SyncResult> {
  const { data: contact, error } = await supabaseAdmin.from('crm_contacts').select('*').eq('id', contactId).single()
  if (error || !contact) throw new Error('Contact not found')
  if (!contact.email) throw new Error('Contact has no email — cannot sync to HubSpot (email is the only dedup key on both sides)')

  const { data: links } = await supabaseAdmin
    .from('crm_contact_event_links')
    .select('role, events(name)')
    .eq('contact_id', contactId)

  const { id: hubspotId, isNew } = await upsertHubSpotContact(contact.email, {
    firstname: contact.first_name,
    lastname: contact.last_name,
  })

  let eventsLinked = 0
  const eventsSkipped: { eventName: string; role: string }[] = []
  for (const link of links ?? []) {
    const eventName = (link.events as unknown as { name: string } | null)?.name
    const roleMap = CONTACT_ROLE_LABELS[link.role]
    if (!eventName || !roleMap) { eventsSkipped.push({ eventName: eventName ?? '(unknown)', role: link.role }); continue }
    const eventId = await findOrCreateHubSpotEvent(eventName)
    const [name, label] = roleMap
    const typeId = await ensureAssociationLabel(HUBSPOT_OBJECT_TYPE.contact, HUBSPOT_OBJECT_TYPE.event, name, label)
    await associateWithLabel(HUBSPOT_OBJECT_TYPE.contact, hubspotId, HUBSPOT_OBJECT_TYPE.event, eventId, typeId)
    eventsLinked++
  }

  await supabaseAdmin.from('crm_contacts').update({ hubspot_contact_id: hubspotId, hubspot_last_synced_at: new Date().toISOString() }).eq('id', contactId)
  return { hubspotId, isNew, eventsLinked, eventsSkipped }
}

export async function syncCompanyToHubSpot(companyId: string): Promise<SyncResult> {
  const { data: company, error } = await supabaseAdmin.from('crm_companies').select('*').eq('id', companyId).single()
  if (error || !company) throw new Error('Company not found')
  if (!company.domain) throw new Error('Company has no domain — cannot sync to HubSpot (domain is the only dedup key on both sides)')

  const { data: links } = await supabaseAdmin
    .from('crm_company_event_links')
    .select('role, events(name)')
    .eq('company_id', companyId)

  const { id: hubspotId, isNew } = await upsertHubSpotCompany(company.domain, {
    name: company.name,
    website: company.website,
  })

  let eventsLinked = 0
  const eventsSkipped: { eventName: string; role: string }[] = []
  for (const link of links ?? []) {
    const eventName = (link.events as unknown as { name: string } | null)?.name
    const roleMap = COMPANY_ROLE_LABELS[link.role]
    if (!eventName || !roleMap) { eventsSkipped.push({ eventName: eventName ?? '(unknown)', role: link.role }); continue }
    const eventId = await findOrCreateHubSpotEvent(eventName)
    const [name, label] = roleMap
    const typeId = await ensureAssociationLabel(HUBSPOT_OBJECT_TYPE.company, HUBSPOT_OBJECT_TYPE.event, name, label)
    await associateWithLabel(HUBSPOT_OBJECT_TYPE.company, hubspotId, HUBSPOT_OBJECT_TYPE.event, eventId, typeId)
    eventsLinked++
  }

  await supabaseAdmin.from('crm_companies').update({ hubspot_company_id: hubspotId, hubspot_last_synced_at: new Date().toISOString() }).eq('id', companyId)
  return { hubspotId, isNew, eventsLinked, eventsSkipped }
}
