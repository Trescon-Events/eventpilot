import { supabaseAdmin } from '@/app/lib/supabase'
import { normalizeTimezone } from '@/app/lib/events/timezones'
import { checkGuestCode, type CodeCheck } from './codes'

export type GuestCodeDetails = {
  found: boolean | null
  ticket_name: string | null
  limit: number | null
  used: number | null
  available: number | null
  opens_at: string | null
  expires_at: string | null
  checked_at: string | null
}

export const detailsFromRow = (s: { guest_invite_code_found: boolean | null; guest_invite_ticket_name: string | null; guest_invite_limit: number | null; guest_invite_used: number | null; guest_invite_opens_at: string | null; guest_invite_expires_at: string | null; guest_invite_usage_checked_at: string | null }): GuestCodeDetails => ({
  found: s.guest_invite_code_found, ticket_name: s.guest_invite_ticket_name, limit: s.guest_invite_limit, used: s.guest_invite_used,
  available: s.guest_invite_limit === null || s.guest_invite_used === null ? null : Math.max(s.guest_invite_limit - s.guest_invite_used, 0),
  opens_at: s.guest_invite_opens_at, expires_at: s.guest_invite_expires_at, checked_at: s.guest_invite_usage_checked_at,
})

export async function loadKonfhubConfig(eventId: string) {
  const [{ data: web }, { data: ev }] = await Promise.all([
    supabaseAdmin.from('event_websites').select('konfhub_event_id, konfhub_client_id, konfhub_client_secret').eq('event_id', eventId).maybeSingle(),
    supabaseAdmin.from('events').select('timezone').eq('id', eventId).maybeSingle(),
  ])
  if (!web?.konfhub_event_id || !web.konfhub_client_id || !web.konfhub_client_secret) return null
  return { konfhubEventId: web.konfhub_event_id as string, clientId: web.konfhub_client_id as string, clientSecret: web.konfhub_client_secret as string, tz: normalizeTimezone(ev?.timezone) ?? 'Asia/Dubai' }
}

/**
 * Reads this speaker's code from KonfHub and stores what it says (pass type, limit, used, opening
 * and expiry). Returns the details plus any warnings (not found, wrong pass, expired, used up).
 * Throws on a KonfHub/network failure — the caller decides how to present it.
 */
export async function syncSpeakerGuestCode(speakerId: string, opts: { fresh?: boolean } = {}): Promise<{ details: GuestCodeDetails; warnings: string[]; check: CodeCheck } | { error: string }> {
  const { data: s } = await supabaseAdmin.from('event_speakers').select('event_id, guest_invite_url, guest_invite_code').eq('id', speakerId).maybeSingle()
  if (!s?.guest_invite_url || !s.guest_invite_code) return { error: 'No registration link saved.' }
  const cfg = await loadKonfhubConfig(s.event_id)
  if (!cfg) return { error: 'KonfHub isn’t configured for this event.' }

  const check = await checkGuestCode({ ...cfg, code: s.guest_invite_code, url: s.guest_invite_url, fresh: opts.fresh })
  const now = new Date().toISOString()
  const info = check.info
  await supabaseAdmin.from('event_speakers').update({
    guest_invite_code_found: check.found,
    guest_invite_ticket_name: info?.tickets.join(', ') || null,
    guest_invite_limit: info?.limit ?? null,
    guest_invite_used: info?.used ?? null,
    guest_invite_opens_at: info?.opensAt ?? null,
    guest_invite_expires_at: info?.expiresAt ?? null,
    guest_invite_usage_checked_at: now,
  }).eq('id', speakerId)
  return {
    details: { found: check.found, ticket_name: info?.tickets.join(', ') || null, limit: info?.limit ?? null, used: info?.used ?? null, available: info?.available ?? null, opens_at: info?.opensAt ?? null, expires_at: info?.expiresAt ?? null, checked_at: now },
    warnings: check.warnings, check,
  }
}
