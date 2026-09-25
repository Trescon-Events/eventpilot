import { supabaseAdmin } from '@/app/lib/supabase'
import { newToken, sha256Hex } from './crypto'
import { PORTAL_URL } from './mail'

export const INVITE_HOURS = 48
export const OPS_RESET_HOURS = 24

/** Creates a fresh single-use link token for a vendor user, retiring any earlier unused ones. Returns the full URL — it goes ONLY into the email to that user, never back to ops. */
export async function issueSetPasswordLink(userId: string, purpose: 'invite' | 'reset', hours: number, createdBy: string | null): Promise<string> {
  await supabaseAdmin.from('ops_vendor_tokens').update({ used_at: new Date().toISOString() }).eq('user_id', userId).is('used_at', null)
  const token = newToken()
  const { error } = await supabaseAdmin.from('ops_vendor_tokens').insert({
    user_id: userId, purpose, token_hash: sha256Hex(token), expires_at: new Date(Date.now() + hours * 3600_000).toISOString(), created_by: createdBy,
  })
  if (error) throw new Error(`Could not create link: ${error.message}`)
  return `${PORTAL_URL}/set-password?token=${token}`
}
