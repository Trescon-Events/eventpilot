// Pull direction (Phase 3) — HubSpot -> EventPilot. Only ever reads back
// records EventPilot itself already pushed (identified by the
// hubspot_contact_id/hubspot_company_id this same integration wrote) — see
// batchReadContacts/batchReadCompanies's own comment on why this can never
// become a blanket poll of the whole HubSpot object type.
//
// Symmetric with what Phase 2/3's push actually sends today (firstname/
// lastname/email; name/domain/website) — no arbitrary crm_properties pulled
// back yet. Per Madhu 2026-09-16, property mapping stays a human-controlled,
// manually-flagged step (see feedback/project memory
// eventpilot_crm_hubspot_properties_manual), not something this pull loop
// should reach into on its own.
import { supabaseAdmin } from '@/app/lib/supabase'
import { batchReadContacts, batchReadCompanies } from '@/app/lib/hubspot/crm-client'

const BATCH_SIZE = 100 // HubSpot's own batch/read cap

export type PullResult = { checked: number; updated: number; skippedNoLongerFound: number }

export async function pullContactsFromHubSpot(): Promise<PullResult> {
  const { data: rows } = await supabaseAdmin
    .from('crm_contacts')
    .select('id, hubspot_contact_id, hubspot_last_synced_at, first_name, last_name')
    .not('hubspot_contact_id', 'is', null)
    .order('hubspot_last_synced_at', { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE)
  if (!rows || rows.length === 0) return { checked: 0, updated: 0, skippedNoLongerFound: 0 }

  const byHubSpotId = new Map(rows.map(r => [r.hubspot_contact_id as string, r]))
  // Contacts is the one HubSpot object type whose modified-date property is
  // the legacy `lastmodifieddate`, NOT `hs_lastmodifieddate` (confirmed
  // live — `hs_lastmodifieddate` comes back null for Contacts specifically;
  // Companies and custom objects both use `hs_lastmodifieddate` correctly).
  const remote = await batchReadContacts(rows.map(r => r.hubspot_contact_id as string), ['firstname', 'lastname', 'lastmodifieddate'])

  let updated = 0
  for (const record of remote) {
    const local = byHubSpotId.get(record.id)
    if (!local) continue
    const remoteModified = record.properties.lastmodifieddate
    const localSynced = local.hubspot_last_synced_at
    // No local sync timestamp at all shouldn't happen (hubspot_contact_id
    // only ever gets set alongside it — see crm-sync.ts) but treat it as
    // "always pull" defensively rather than crash on a null Date compare.
    const shouldPull = !localSynced || (remoteModified && new Date(remoteModified) > new Date(localSynced))
    if (!shouldPull) continue

    await supabaseAdmin
      .from('crm_contacts')
      .update({
        first_name: record.properties.firstname ?? local.first_name,
        last_name: record.properties.lastname ?? local.last_name,
        hubspot_last_synced_at: remoteModified ?? new Date().toISOString(),
      })
      .eq('id', local.id)
    updated++
  }

  return { checked: rows.length, updated, skippedNoLongerFound: rows.length - remote.length }
}

export async function pullCompaniesFromHubSpot(): Promise<PullResult> {
  const { data: rows } = await supabaseAdmin
    .from('crm_companies')
    .select('id, hubspot_company_id, hubspot_last_synced_at, name, website')
    .not('hubspot_company_id', 'is', null)
    .order('hubspot_last_synced_at', { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE)
  if (!rows || rows.length === 0) return { checked: 0, updated: 0, skippedNoLongerFound: 0 }

  const byHubSpotId = new Map(rows.map(r => [r.hubspot_company_id as string, r]))
  const remote = await batchReadCompanies(rows.map(r => r.hubspot_company_id as string), ['name', 'website', 'hs_lastmodifieddate'])

  let updated = 0
  for (const record of remote) {
    const local = byHubSpotId.get(record.id)
    if (!local) continue
    const remoteModified = record.properties.hs_lastmodifieddate
    const localSynced = local.hubspot_last_synced_at
    const shouldPull = !localSynced || (remoteModified && new Date(remoteModified) > new Date(localSynced))
    if (!shouldPull) continue

    await supabaseAdmin
      .from('crm_companies')
      .update({
        name: record.properties.name ?? local.name,
        website: record.properties.website ?? local.website,
        hubspot_last_synced_at: remoteModified ?? new Date().toISOString(),
      })
      .eq('id', local.id)
    updated++
  }

  return { checked: rows.length, updated, skippedNoLongerFound: rows.length - remote.length }
}
