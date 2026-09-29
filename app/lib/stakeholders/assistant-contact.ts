import { supabaseAdmin } from '@/app/lib/supabase'

// The onboarding form's own "coordinate with your assistant" answer lives in
// custom_fields under this key (HubSpot-mapped field name) — the outstanding-
// items page records its answer under the same key so both entry points
// read/write one place.
export const ASSISTANT_CONSENT_KEY = 'would_you_like_us_to_coordinate_with_your_assistant_regarding_your_participation'

// "Already known" = a recorded yes/no answer, OR any Additional Contact / assistant
// details already on file. Used to decide whether the submission page should ask.
export async function hasAssistantAnswer(speakerId: string, customFields: Record<string, unknown> | null): Promise<boolean> {
  const cf = customFields ?? {}
  const raw = cf[ASSISTANT_CONSENT_KEY]
  const answer = String(Array.isArray(raw) ? raw[0] : raw ?? '').trim()
  if (answer) return true
  const email = cf.assistant_email
  if (typeof email === 'string' && email.trim()) return true
  const { count } = await supabaseAdmin.from('speaker_additional_contacts').select('id', { count: 'exact', head: true }).eq('speaker_id', speakerId)
  return (count ?? 0) > 0
}
