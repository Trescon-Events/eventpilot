import { supabaseAdmin } from '@/app/lib/supabase'
import { orgDocsReachEvent } from './trescon-layer'

/* Trescon profile (2026-10-16, docs/build_suggestions/trescon-profile-boilerplate.md Part 4) — the one place tools read the approved
   "About Trescon" text. Consumers read ONLY approved_text, never the working copy (working_text). Nothing approved → null, and the
   caller decides what to tell the user; there is no silent fallback to model-written text here. The hook for the website builder,
   proposals and Pilot AI later; today only the press release generator uses it. */

/** Event types treated as Trescon Signature Events (they get the Signature Events module appended). Assumption to confirm with Madhu:
    the series the module names (World AI Show, World Cyber Security Show, World FinTech Show) are stored as type 'flagship'. */
export const SIGNATURE_EVENT_TYPES = ['signature', 'flagship']

/** The approved text for a company_profile_texts key, or null when it has never been approved. Reads approved_text only, never the working copy. */
export async function getApprovedText(key: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from('company_profile_texts').select('approved_text').eq('key', key).maybeSingle()
  if (error) { console.error(`[trescon-profile] could not read approved_text for ${key}:`, error.message); return null }
  const t = data?.approved_text
  return typeof t === 'string' && t.trim() ? t : null
}

/** Is this a Trescon-owned event (not managed, not under a client umbrella)? Same rule as the Trescon-wide style guide. */
export async function isTresconOwnedEvent(eventId: string): Promise<boolean> {
  return orgDocsReachEvent(eventId)
}

/** The approved About Trescon text for an event: the standard boilerplate, plus the Signature Events module for a Signature Event.
    null for a managed event / client-umbrella event, or when the standard boilerplate has not been approved. */
export async function getAboutTresconForEvent(eventId: string): Promise<{ text: string; kind: 'standard' | 'signature' } | null> {
  if (!(await isTresconOwnedEvent(eventId))) return null
  const standard = await getApprovedText('about_standard')
  if (!standard) return null
  const { data: ev } = await supabaseAdmin.from('events').select('type').eq('id', eventId).maybeSingle()
  if (ev?.type && SIGNATURE_EVENT_TYPES.includes(ev.type)) {
    const sigModule = await getApprovedText('module_signature')
    if (sigModule) return { text: `${standard}\n\n${sigModule}`, kind: 'signature' }
  }
  return { text: standard, kind: 'standard' }
}
