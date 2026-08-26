import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { normalizeSpeakerName, getKonfhubToken, listKonfhubSessions } from '@/app/lib/konfhub-speakers'

/* GET /api/events/stakeholders/speakers/dependencies?event_id=X&ids=a,b,c
   Delete-confirmation dependency check (2026-08-26, per Madhu: "the system
   should check dependencies... flag it to user before deletion"). Warns,
   never blocks — deletion is already a reversible soft delete/restore, so
   this exists to make sure a producer SEES what else references a speaker
   before they type DELETE, not to stop them.

   Three independent checks per speaker:
   - pendingAnnouncements — real FK (stakeholder_announcements.speaker_id,
     ON DELETE SET NULL — supabase/sae_migration.sql:179), counted for
     every status except 'published' (a live post is done; anything else —
     draft/pending_approval/approved/scheduled/etc. — would silently lose
     its speaker link on delete).
   - possibleAgendaMentions — event_agenda has NO real relationship to
     event_speakers at all (speaker_name is free text, event_website.sql:89)
     so this is a best-effort name match only, using the same
     normalizeSpeakerName() conservative-match convention already used for
     the KonfHub speaker-matching bridge. Always caveated in the UI as
     "verify manually" — never treated as authoritative.
   - konfhubSessionTitles — a REAL check, not a guess (2026-08-26, per
     Madhu: "shouldn't you check actual association... so the warning
     itself should be dynamic"). Only run when at least one selected
     speaker has a konfhub_speaker_id — one GET .../sessions call fetches
     every session for the event (each with a real session_speakers array
     of speaker ids), matched locally against every selected speaker. Only
     surfaced when a real match is found; no generic "might be assigned"
     copy otherwise. */

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  const idsParam = req.nextUrl.searchParams.get('ids')
  if (!eventId || !idsParam) return NextResponse.json({ error: 'event_id and ids required' }, { status: 400 })
  const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean)
  if (ids.length === 0) return NextResponse.json({})

  const [{ data: speakers }, { data: announcements }, { data: agendaRows }] = await Promise.all([
    supabaseAdmin.from('event_speakers').select('id, name, public_name, konfhub_speaker_id').in('id', ids),
    supabaseAdmin.from('stakeholder_announcements').select('speaker_id, status').in('speaker_id', ids).neq('status', 'published'),
    supabaseAdmin.from('event_agenda').select('speaker_name').eq('event_id', eventId),
  ])

  const announcementCounts = new Map<string, number>()
  for (const a of announcements ?? []) {
    if (!a.speaker_id) continue
    announcementCounts.set(a.speaker_id, (announcementCounts.get(a.speaker_id) ?? 0) + 1)
  }

  const normalizedAgendaNames = (agendaRows ?? [])
    .map(r => r.speaker_name)
    .filter((n): n is string => !!n?.trim())
    .map(normalizeSpeakerName)

  // konfhub_speaker_id -> [session titles it appears in]. Only fetched if
  // at least one selected speaker is actually published to KonfHub —
  // otherwise there's nothing to check, and no need for the API round-trip.
  const konfhubSessionsBySpeakerId = new Map<string, string[]>()
  const speakersWithKonfhubId = (speakers ?? []).filter(s => !!s.konfhub_speaker_id)
  if (speakersWithKonfhubId.length > 0) {
    const { data: website } = await supabaseAdmin
      .from('event_websites')
      .select('konfhub_client_id, konfhub_client_secret, konfhub_event_id')
      .eq('event_id', eventId)
      .single()
    if (website?.konfhub_client_id && website?.konfhub_client_secret && website?.konfhub_event_id) {
      try {
        const token = await getKonfhubToken(website.konfhub_client_id, website.konfhub_client_secret)
        const sessions = await listKonfhubSessions(website.konfhub_event_id, token)
        for (const session of sessions) {
          for (const sp of session.session_speakers) {
            const list = konfhubSessionsBySpeakerId.get(sp.speaker_id) ?? []
            list.push(session.session_title)
            konfhubSessionsBySpeakerId.set(sp.speaker_id, list)
          }
        }
      } catch {
        // Best-effort — if KonfHub is briefly unreachable, just skip this
        // check rather than blocking the whole delete-confirmation modal
        // from opening. The other two dependency checks still work.
      }
    }
  }

  const result: Record<string, { pendingAnnouncements: number; possibleAgendaMentions: number; konfhubSessionTitles: string[] }> = {}
  for (const s of speakers ?? []) {
    const candidates = [s.name, s.public_name].filter((n): n is string => !!n?.trim()).map(normalizeSpeakerName)
    const possibleAgendaMentions = normalizedAgendaNames.filter(a => candidates.includes(a)).length
    result[s.id] = {
      pendingAnnouncements: announcementCounts.get(s.id) ?? 0,
      possibleAgendaMentions,
      konfhubSessionTitles: s.konfhub_speaker_id ? (konfhubSessionsBySpeakerId.get(s.konfhub_speaker_id) ?? []) : [],
    }
  }
  return NextResponse.json(result)
}
