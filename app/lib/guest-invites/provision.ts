import { CONFIRMED_STATUSES } from '@/app/lib/badges/types'
import { supabaseAdmin } from '@/app/lib/supabase'
import { parseEventTime } from '@/app/lib/events/timezones'
import { getKonfhubToken } from '@/app/lib/konfhub-speakers'
import { fetchKonfhubCodes } from './codes'
import { loadKonfhubConfig, syncSpeakerGuestCode } from './sync'
import { parseGuestLink } from './link'
import { createGuestCoupon, deleteCoupon, CouponClashError } from './konfhub-coupons'

/*
  Auto-creating a speaker's guest-pass code on KonfHub (2026-10-12). The producer sets, per event, which KonfHub
  guest ticket the codes belong to, the limit and a mode:
    off     nothing is generated (hand-made links pasted by producers, as before)
    review  a newly confirmed speaker gets a PROPOSED code; a producer creates it with one click
    auto    the code is created on KonfHub as soon as the speaker is Confirmed
  Emails are never sent from here — creating the link and inviting stay separate steps.
  Code = shorter of first/last name + GUEST (NURYMGUEST); if taken the longer name, then a number. "Taken" means any code on the
  KonfHub event (events can share one KonfHub event) or any code/proposal held by a speaker of those events.
*/
export type AutoMode = 'off' | 'review' | 'auto'
export type AutoSettings = { ticket_id: number | null; default_limit: number | null; mode: AutoMode; slug: string | null }

export async function loadAutoSettings(eventId: string): Promise<AutoSettings & { deadline: string | null }> {
  const { data: e } = await supabaseAdmin.from('events').select('guest_invite_ticket_id, guest_invite_default_limit, guest_invite_auto_mode, konfhub_event_slug, guest_invite_deadline').eq('id', eventId).maybeSingle()
  return { ticket_id: e?.guest_invite_ticket_id ?? null, default_limit: e?.guest_invite_default_limit ?? null, mode: (e?.guest_invite_auto_mode as AutoMode) ?? 'off', slug: e?.konfhub_event_slug ?? null, deadline: e?.guest_invite_deadline ?? null }
}

/** Events that share this event's KonfHub event (codes must be unique across all of them). */
async function sharedEventIds(eventId: string, konfhubEventId: string): Promise<string[]> {
  const { data } = await supabaseAdmin.from('event_websites').select('event_id').eq('konfhub_event_id', konfhubEventId)
  return [...new Set([eventId, ...(data ?? []).map(r => r.event_id as string)])]
}

/** The KonfHub event's own link name (its `event_url`, the part after konfhub.com/checkout/) — read from KonfHub, never typed by a producer.
    Falls back to the one in any link already saved for this KonfHub event. */
export async function resolveSlug(eventId: string, cfg: { konfhubEventId: string; clientId: string; clientSecret: string }): Promise<string | null> {
  try {
    const token = await getKonfhubToken(cfg.clientId, cfg.clientSecret)
    const res = await fetch(`https://api.konfhub.com/event/${cfg.konfhubEventId}`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) { const j = await res.json() as { event_url?: string }; const u = (j.event_url ?? '').trim().toLowerCase(); if (/^[a-z0-9-]+$/.test(u)) return u }
  } catch { /* fall through to saved links */ }
  const { data } = await supabaseAdmin.from('event_speakers').select('guest_invite_url').in('event_id', await sharedEventIds(eventId, cfg.konfhubEventId)).not('guest_invite_url', 'is', null).limit(1)
  const p = data?.[0]?.guest_invite_url ? parseGuestLink(data[0].guest_invite_url) : null
  return p?.ok ? p.slug : null
}

const FOLD: Record<string, string> = { Ø: 'O', ø: 'o', Æ: 'AE', æ: 'ae', ß: 'ss', Đ: 'D', đ: 'd', Ł: 'L', ł: 'l', Œ: 'OE', œ: 'oe' }
const lettersOnly = (s: string) => s.replace(/[ØøÆæßĐđŁłŒœ]/g, c => FOLD[c]).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase()
const HONORIFICS = new Set(['HE', 'DR', 'MR', 'MRS', 'MS', 'MISS', 'PROF', 'SIR', 'SHEIKH', 'SHEIKHA', 'SENATOR', 'HON', 'AMB', 'ENG', 'HH', 'HRH'])

/** First and last name words (letters only, upper-case) from the record's first/last name, else from the display name. */
export function nameParts(s: { name: string | null; public_name: string | null; custom_fields: Record<string, unknown> | null }): { first: string; last: string } {
  const cf = s.custom_fields ?? {}
  const one = (v: unknown) => (Array.isArray(v) ? String(v[0] ?? '') : String(v ?? '')).trim()
  let first = one(cf.first_name), last = one(cf.last_name)
  if (!first && !last) {
    const words = (s.name || s.public_name || '').replace(/\([^)]*\)/g, ' ').split(/\s+/).filter(w => w && !HONORIFICS.has(lettersOnly(w)))
    first = words[0] ?? ''; last = words.length > 1 ? words[words.length - 1] : ''
  }
  // Only the first word of a first name and the last word of a last name ("Yosef (Seffy)" -> YOSEF).
  const fw = first.replace(/\([^)]*\)/g, ' ').split(/\s+/).filter(Boolean)[0] ?? ''
  const lw = last.replace(/\([^)]*\)/g, ' ').split(/\s+/).filter(Boolean).pop() ?? ''
  return { first: lettersOnly(fw), last: lettersOnly(lw) }
}

/** Candidate codes in order of preference: shorter name, longer name, then the shorter name with a number. */
export function candidateCodes(parts: { first: string; last: string }, taken: Set<string>, suffix = 'GUEST'): string[] {
  const names = [parts.first, parts.last].filter(n => n.length >= 2)
  if (!names.length) return []
  const sorted = [...names].sort((a, b) => a.length - b.length) // stable: first name wins a tie
  const out: string[] = []
  for (const n of sorted) out.push(n + suffix)
  for (let i = 2; i <= 60; i++) out.push(sorted[0] + suffix + i)
  return out.filter(c => !taken.has(c))
}

/** `exceptSpeakerId`: that speaker's own claim/proposal doesn't count as taken. */
export async function takenCodes(eventId: string, cfg: { konfhubEventId: string; clientId: string; clientSecret: string; tz: string }, exceptSpeakerId?: string): Promise<Set<string>> {
  const taken = new Set<string>((await fetchKonfhubCodes(cfg.konfhubEventId, cfg.clientId, cfg.clientSecret, cfg.tz, { fresh: true })).keys())
  const { data } = await supabaseAdmin.from('event_speakers').select('id, guest_invite_code, guest_invite_proposed_code').in('event_id', await sharedEventIds(eventId, cfg.konfhubEventId))
  for (const r of (data ?? []).filter(x => x.id !== exceptSpeakerId)) for (const c of [r.guest_invite_code, r.guest_invite_proposed_code]) if (c) taken.add(String(c).toUpperCase())
  return taken
}

const SPEAKER_COLS = 'id, event_id, name, public_name, custom_fields, confirmation_status, guest_invite_url, guest_invite_code, guest_invite_proposed_code'

export type ProvisionResult = { ok: true; code: string; link: string; warnings: string[] } | { ok: false; error: string }

/** Everything needed to create codes for an event, or the reason it can't be done. */
async function readiness(eventId: string) {
  const cfg = await loadKonfhubConfig(eventId)
  if (!cfg) return { error: 'KonfHub isn’t configured for this event.' } as const
  const st = await loadAutoSettings(eventId)
  if (!st.ticket_id) return { error: 'Choose the guest ticket in Settings first.' } as const
  if (!st.default_limit || st.default_limit < 1) return { error: 'Set the number of guests per speaker in Settings first.' } as const
  if (!st.deadline) return { error: 'Set the registration deadline in Settings first — it becomes the code’s expiry.' } as const
  const expiresAt = parseEventTime(`${st.deadline}T23:59`, cfg.tz)
  if (!expiresAt || expiresAt.getTime() < Date.now()) return { error: 'The registration deadline has passed.' } as const
  const slug = await resolveSlug(eventId, cfg)
  if (!slug) return { error: 'Couldn’t read this KonfHub event’s link from KonfHub. Try again in a moment.' } as const
  return { cfg, st: { ...st, ticket_id: st.ticket_id, default_limit: st.default_limit }, slug, expiresAt } as const
}

/** Creates the speaker's code on KonfHub and saves the link. `wanted` = a specific code (an edited proposal); otherwise the first free candidate. */
export async function createGuestCodeFor(speakerId: string, wanted?: string | null): Promise<ProvisionResult> {
  const { data: s } = await supabaseAdmin.from('event_speakers').select(SPEAKER_COLS).eq('id', speakerId).maybeSingle()
  if (!s) return { ok: false, error: 'Speaker not found.' }
  if (s.guest_invite_url || s.guest_invite_code) return { ok: false, error: 'This speaker already has a registration link.' }
  const r = await readiness(s.event_id)
  if ('error' in r) return { ok: false, error: r.error as string }
  const { cfg, st, slug, expiresAt } = r

  const taken = await takenCodes(s.event_id, cfg, speakerId)
  const fail = async (error: string): Promise<ProvisionResult> => { await supabaseAdmin.from('event_speakers').update({ guest_invite_provision_error: error }).eq('id', speakerId); return { ok: false, error } }
  let candidates: string[]
  const want = (wanted ?? s.guest_invite_proposed_code ?? '').trim().toUpperCase()
  if (wanted) {
    if (!/^[A-Z0-9]{3,40}$/.test(want)) return fail('A code can only contain letters and numbers (3–40 characters).')
    if (taken.has(want)) return fail(`The code ${want} is already taken.`)
    candidates = [want]
  } else {
    const proposed = (s.guest_invite_proposed_code ?? '').toUpperCase()
    const fresh = candidateCodes(nameParts(s), taken)
    candidates = proposed && !taken.has(proposed) ? [proposed, ...fresh.filter(c => c !== proposed)] : fresh
  }
  if (!candidates.length) return fail('Could not build a code from this speaker’s name — enter one manually.')

  for (const code of candidates.slice(0, 8)) {
    // Reserve the code on the speaker first: the (event, code) unique index stops two clicks / two requests creating twice.
    const { data: claimed, error: claimErr } = await supabaseAdmin.from('event_speakers').update({ guest_invite_code: code }).eq('id', speakerId).is('guest_invite_code', null).is('guest_invite_url', null).select('id')
    if (claimErr) { if (claimErr.code === '23505') continue; return fail(claimErr.message) }
    if (!claimed?.length) return { ok: false, error: 'This speaker already has a registration link.' }
    const release = () => supabaseAdmin.from('event_speakers').update({ guest_invite_code: null }).eq('id', speakerId)
    let couponId: string
    try {
      couponId = await createGuestCoupon({ konfhubEventId: cfg.konfhubEventId, clientId: cfg.clientId, clientSecret: cfg.clientSecret, code, ticketId: st.ticket_id, limit: st.default_limit, opensAt: new Date(), expiresAt })
    } catch (e) {
      await release()
      if (e instanceof CouponClashError && !wanted) continue
      return fail(e instanceof Error ? e.message : 'KonfHub could not create the code.')
    }
    const link = `https://konfhub.com/checkout/${slug}?ticketId=${st.ticket_id}%7C1%3B&selectedCode=${code}`
    await supabaseAdmin.from('event_speakers').update({ guest_invite_url: link, guest_invite_coupon_id: couponId, guest_invite_proposed_code: null, guest_invite_provision_error: null }).eq('id', speakerId)
    // Read it back from KonfHub; never keep a link whose code can't be seen there.
    const sync = await syncSpeakerGuestCode(speakerId, { fresh: true }).catch(() => ({ error: 'KonfHub could not be read.' }))
    if ('error' in sync || !sync.check.found) {
      await deleteCoupon({ konfhubEventId: cfg.konfhubEventId, clientId: cfg.clientId, clientSecret: cfg.clientSecret, couponId }).catch(() => {})
      await supabaseAdmin.from('event_speakers').update({ guest_invite_url: null, guest_invite_code: null, guest_invite_coupon_id: null, guest_invite_code_found: null, guest_invite_ticket_name: null, guest_invite_limit: null, guest_invite_used: null, guest_invite_opens_at: null, guest_invite_expires_at: null, guest_invite_usage_checked_at: null }).eq('id', speakerId)
      return fail('The code was created but could not be confirmed on KonfHub, so it was removed again. Try once more.')
    }
    return { ok: true, code, link, warnings: sync.warnings }
  }
  return fail('Every code tried was already taken — enter one manually.')
}

/** Records the proposal for review mode (no KonfHub write). */
export async function proposeGuestCode(speakerId: string): Promise<string | null> {
  const { data: s } = await supabaseAdmin.from('event_speakers').select(SPEAKER_COLS).eq('id', speakerId).maybeSingle()
  if (!s || s.guest_invite_url || s.guest_invite_code || s.guest_invite_proposed_code) return s?.guest_invite_proposed_code ?? null
  const cfg = await loadKonfhubConfig(s.event_id)
  if (!cfg) return null
  const [first] = candidateCodes(nameParts(s), await takenCodes(s.event_id, cfg, speakerId))
  if (!first) return null
  await supabaseAdmin.from('event_speakers').update({ guest_invite_proposed_code: first }).eq('id', speakerId)
  return first
}

/** Called when a speaker becomes Confirmed (and by "Generate missing"). Never throws — a failure is stored on the speaker. */
export async function ensureGuestCode(speakerId: string): Promise<void> {
  try {
    const { data: s } = await supabaseAdmin.from('event_speakers').select(SPEAKER_COLS).eq('id', speakerId).maybeSingle()
    if (!s || !(CONFIRMED_STATUSES as readonly string[]).includes(s.confirmation_status ?? '') || s.guest_invite_url || s.guest_invite_code) return
    const { mode } = await loadAutoSettings(s.event_id)
    if (mode === 'review') await proposeGuestCode(speakerId)
    else if (mode === 'auto') await createGuestCodeFor(speakerId)
  } catch (e) { console.error('[guest-invites] ensureGuestCode failed for', speakerId, e) }
}
