import { supabaseAdmin } from '@/app/lib/supabase'
import { encryptToken, decryptToken } from '@/app/lib/security/token-crypto'

/* Global Integration Secrets (2026-09-21) — see supabase/
   global_integration_secrets_migration.sql for the full design/reasoning.
   A small, fixed set of global (cross-event) credentials, each keyed by a
   known id string. Callers that read these are expected to still fall back
   to their own env var (e.g. process.env.HUBSPOT_CRM_SERVICE_KEY) when
   nothing's stored here yet — this is an alternative source, not a
   replacement that breaks local dev/.env.local. */

export const GLOBAL_SECRET_IDS = {
  hubspotCrmServiceKey: 'hubspot_crm_service_key',
} as const

export async function getGlobalSecret(id: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('global_integration_secrets').select('encrypted_value').eq('id', id).maybeSingle()
  if (!data?.encrypted_value) return null
  try {
    return decryptToken(data.encrypted_value)
  } catch (e) {
    console.error(`Could not decrypt global secret "${id}":`, e)
    return null
  }
}

export type GlobalSecretStatus = { configured: boolean; label: string | null; updatedAt: string | null; updatedByName: string | null }

export async function getGlobalSecretStatus(id: string): Promise<GlobalSecretStatus> {
  const { data } = await supabaseAdmin
    .from('global_integration_secrets')
    .select('label, updated_at, updated_by:staff_members(name)')
    .eq('id', id)
    .maybeSingle()
  if (!data) return { configured: false, label: null, updatedAt: null, updatedByName: null }
  const updatedBy = Array.isArray(data.updated_by) ? data.updated_by[0] : data.updated_by
  return { configured: true, label: data.label, updatedAt: data.updated_at, updatedByName: (updatedBy as { name: string } | null)?.name ?? null }
}

export async function setGlobalSecret(id: string, label: string, plaintext: string, updatedBy: string | null): Promise<void> {
  await supabaseAdmin.from('global_integration_secrets').upsert({
    id, label, encrypted_value: encryptToken(plaintext), updated_at: new Date().toISOString(), updated_by: updatedBy,
  })
}
