// Client for KonfHub's Speakers-management API — the "Speakers" section a
// producer maintains directly in the KonfHub dashboard (feeds KonfHub's own
// event page + worldaishow.com/malaysia/speakers/), NOT the Attendees list
// (real registration record, used for badges/the event app — EventPilot must
// not touch that) and NOT the old ticket/attendee-registration flow this repo
// used to auto-push to (event/capture/v2, removed 2026-08-23 — see
// app/api/events/speakers/route.ts's doc comment).
//
// Auth is Bearer-token via a client_id/client_secret exchange (event_websites.
// konfhub_client_id/konfhub_client_secret — distinct from the old
// konfhub_api_key), tokens expire in 5 minutes. Fetch fresh per call site
// rather than caching — a whole sync run finishes well under that window, and
// caching across serverless invocations buys nothing.
//
// KonfHub's Speakers API has no email field — an existing KonfHub speaker can
// only be matched to an EventPilot record by name (a one-time bridge; see
// matchKonfhubSpeakers below), after which event_speakers.konfhub_speaker_id
// is what every future update targets. Never delete+recreate an existing
// speaker: KonfHub's Agenda sessions reference speakers by this ID, so
// recreating would silently drop them from their assigned sessions.

const TOKEN_ENDPOINT = 'https://api.konfhub.com/api-clients/token'
const API_BASE = 'https://api.konfhub.com/event'

export type KonfhubSpeaker = {
  // Despite the API docs saying "String", live responses return this as a
  // number (confirmed 2026-08-23) — normalized to string in
  // listKonfhubSpeakers so every caller gets one consistent type.
  speaker_id: string
  name: string
  about?: string | null
  image_url?: string | null
  organisation_logo_url?: string | null
  designation?: string | null
  organisation?: string | null
  location?: string | null
  linkedin_url?: string | null
  facebook_url?: string | null
  twitter_url?: string | null
  website_url?: string | null
  // KonfHub's own single-value grouping field (distinct from the `tags`
  // array below) — one category per speaker. Used for umbrella KonfHub
  // events that host several separately-branded sub-events under one
  // event_id (e.g. Dubai Future Finance Week), where each sub-event maps
  // to its own EventPilot event/website but shares this one KonfHub
  // event — event_websites.konfhub_speaker_category_id says which
  // category id this EventPilot event's pushes should use. Unset (null)
  // for a normal 1:1 EventPilot-event-to-KonfHub-event, same as tags.
  speaker_category_id?: string | null
  speaker_order?: number
  // Panel-discussion workaround (2026-08-25) — a speaker can be listed as
  // Speaker, Moderator, or both, WITHOUT a duplicate KonfHub record: a
  // single speaker's tags array can hold multiple {id, name} entries at
  // once, confirmed live to render correctly on both KonfHub's own page
  // and the event website. Tag ids are per-event (event_websites.
  // konfhub_speaker_tag_id/konfhub_moderator_tag_id), not hardcoded here.
  tags?: { id: string; name: string }[]
}

// Sessions/Agenda — undocumented (found live 2026-08-26, same way the
// Speakers-management API's own quirks were): GET .../sessions requires a
// sessions_to_return query param, one of 'all'/'assigned'/'unassigned'
// (anything else 400s). Used only for the delete-confirmation's real
// "is this speaker actually in a KonfHub session" check — never to modify
// anything. Each session's session_speakers array holds full speaker
// objects (not just ids), with speaker_id as a number despite the rest of
// this file normalizing to string elsewhere — normalized here too.
export type KonfhubSession = {
  session_id: string
  session_title: string
  session_speakers: { speaker_id: string; name: string }[]
}

export async function listKonfhubSessions(konfhubEventId: string, token: string): Promise<KonfhubSession[]> {
  const res = await fetch(`${API_BASE}/${konfhubEventId}/sessions?sessions_to_return=all`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json().catch(() => []) as Array<{ session_id: number | string; session_title: string; session_speakers?: Array<{ speaker_id: number | string; name: string }> }> | { error?: string }
  if (!res.ok || !Array.isArray(data)) throw new KonfhubApiError((data as { error?: string })?.error || 'Failed to list KonfHub sessions', res.status)
  return data.map(s => ({
    session_id: String(s.session_id),
    session_title: s.session_title,
    session_speakers: (s.session_speakers ?? []).map(sp => ({ speaker_id: String(sp.speaker_id), name: sp.name })),
  }))
}

export class KonfhubApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function getKonfhubToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
  })
  const data = await res.json().catch(() => ({})) as { token?: string; error?: string }
  if (!res.ok || !data.token) throw new KonfhubApiError(data.error || 'Failed to obtain KonfHub token', res.status)
  return data.token
}

// GET /speakers actually returns {categorized: [...], uncategorized: [...]}
// (confirmed live 2026-08-23), not the flat array the Postman doc's example
// implies — flattened here so every caller just gets one list.
export async function listKonfhubSpeakers(konfhubEventId: string, token: string): Promise<KonfhubSpeaker[]> {
  const res = await fetch(`${API_BASE}/${konfhubEventId}/speakers`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json().catch(() => ({})) as
    { categorized?: KonfhubSpeaker[]; uncategorized?: KonfhubSpeaker[]; error?: string }
  if (!res.ok) throw new KonfhubApiError(data.error || 'Failed to list KonfHub speakers', res.status)
  return [...(data.categorized ?? []), ...(data.uncategorized ?? [])]
    .map(s => ({ ...s, speaker_id: String(s.speaker_id) }))
}

export async function updateKonfhubSpeaker(
  konfhubEventId: string,
  speakerId: string,
  token: string,
  fields: Partial<Pick<KonfhubSpeaker,
    'name' | 'about' | 'image_url' | 'organisation_logo_url' | 'designation' | 'organisation' |
    'location' | 'linkedin_url' | 'facebook_url' | 'twitter_url' | 'website_url' | 'tags' | 'speaker_category_id'
  >>
): Promise<void> {
  const res = await fetch(`${API_BASE}/${konfhubEventId}/speakers/${speakerId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  const data = await res.json().catch(() => ({})) as { error?: string }
  if (!res.ok) throw new KonfhubApiError(data.error || 'Failed to update KonfHub speaker', res.status)
}

export async function createKonfhubSpeaker(
  konfhubEventId: string,
  token: string,
  fields: { name: string; speaker_order: number } & Partial<Pick<KonfhubSpeaker,
    'about' | 'image_url' | 'organisation_logo_url' | 'designation' | 'organisation' |
    'location' | 'linkedin_url' | 'facebook_url' | 'twitter_url' | 'website_url' | 'tags' | 'speaker_category_id'
  >>
): Promise<string> {
  const res = await fetch(`${API_BASE}/${konfhubEventId}/speakers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  const data = await res.json().catch(() => ({})) as { speaker_id?: string | number; error?: string }
  if (!res.ok || data.speaker_id === undefined) throw new KonfhubApiError(data.error || 'Failed to create KonfHub speaker', res.status)
  return String(data.speaker_id)
}

export async function deleteKonfhubSpeaker(konfhubEventId: string, speakerId: string, token: string): Promise<void> {
  const res = await fetch(`${API_BASE}/${konfhubEventId}/speakers/${speakerId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    throw new KonfhubApiError(data.error || 'Failed to delete KonfHub speaker', res.status)
  }
}

// GET /event/:id/tags (2026-09-05, Integrations page) — undocumented, same
// endpoint discovered 2026-08-25 for the Speaker/Moderator tag workaround
// (see konfhub-push/route.ts's doc comment). Returns EVERY tag on the
// event, not just Speaker/Moderator — a live probe against WAIS Malaysia's
// real event found session-type tags (Keynote, Panel Discussion, Break…)
// mixed into the same list, AND a lowercase 'speaker' tag alongside a
// separate capitalized 'Speaker' tag. Never auto-match by name — always
// return the raw list and let a human pick, which is exactly why this
// returns id+name pairs rather than trying to guess here.
export type KonfhubTag = { id: string; name: string }

export async function fetchKonfhubTags(konfhubEventId: string, token: string): Promise<KonfhubTag[]> {
  const res = await fetch(`${API_BASE}/${konfhubEventId}/tags`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    throw new KonfhubApiError(data.error || 'Failed to fetch KonfHub tags', res.status)
  }
  return await res.json() as KonfhubTag[]
}

// GET /event/:id/tickets (2026-09-05, Integrations page) — every ticket
// type configured on the event (Delegate Pass, Speaker Registration,
// Sponsor Conference Pass, Media Pass, etc.), grouped into KonfHub's own
// categories, each with its full custom-form field list already embedded
// (`forms: [{form_id, form_name}]`) — confirmed live against WAIS
// Malaysia's real event, 2026-09-04/05. No need to reverse-engineer field
// ids from real attendee records the way the original Speaker Registration
// mapping was built (see konfhub-registration-push/route.ts's HISTORY
// comment) — this is a clean schema-listing source. `form_name` comes back
// as raw (often messy, copy-pasted-from-a-doc) HTML — stripHtml() below
// gives the mapping UI a readable label.
export type KonfhubTicketForm = { form_id: number; form_name: string }
export type KonfhubTicket = { ticket_id: number; ticket_name: string; forms: KonfhubTicketForm[] }
export type KonfhubTicketCategory = { category_id: number; category_name: string; tickets: KonfhubTicket[] }

export async function fetchKonfhubTickets(konfhubEventId: string, token: string): Promise<KonfhubTicketCategory[]> {
  const res = await fetch(`${API_BASE}/${konfhubEventId}/tickets`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    throw new KonfhubApiError(data.error || 'Failed to fetch KonfHub tickets', res.status)
  }
  const data = await res.json() as { categorized?: KonfhubTicketCategory[] }
  return data.categorized ?? []
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

// Name-normalization for the one-time matching bridge (2026-08-23) — strips
// salutation-style prefixes/punctuation/whitespace so e.g. "Dr. Ong Hong Hoe"
// and "Ong Hong Hoe" line up. Deliberately conservative: this only decides
// what counts as a "confident" auto-match; anything it can't resolve cleanly
// should be surfaced for manual confirmation, never guessed.
export function normalizeSpeakerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\b(dr|mr|mrs|ms|prof|sr|ts|ir|datuk|dato|tan sri|puan sri)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
