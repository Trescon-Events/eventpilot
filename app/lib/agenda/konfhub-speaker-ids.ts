import { supabaseAdmin } from '@/app/lib/supabase'
import { getEventRoles, resolvePrimaryRole } from '@/app/lib/konfhub/roles'

/*
  Maps a session's (speaker, role) assignments to the KonfHub speaker RECORD ids
  to send as session_speakers. KonfHub has no per-session role — the tag on the
  record shows — so a (speaker, role) pair resolves to:
    · the speaker's main record, when the role is "" (main role) or equals their
      resolved main role (event_speakers.konfhub_speaker_id);
    · otherwise that role's own record (speaker_konfhub_roles).
  Pairs whose record hasn't been pushed to KonfHub yet are returned in `skipped`.
*/
export type RoleEntry = { speaker_id: string; role_tag_id: string }

export async function konfhubSpeakerIdsFor(eventId: string, entries: RoleEntry[]): Promise<{ ids: string[]; skipped: { speaker_id: string; name: string; role_tag_id: string }[] }> {
  const speakerIds = [...new Set(entries.map(e => e.speaker_id))]
  if (speakerIds.length === 0) return { ids: [], skipped: [] }
  const [roles, { data: speakers }, { data: extras }] = await Promise.all([
    getEventRoles(eventId),
    supabaseAdmin.from('event_speakers').select('id, public_name, name, konfhub_speaker_id, konfhub_primary_role_tag_id').in('id', speakerIds),
    supabaseAdmin.from('speaker_konfhub_roles').select('speaker_id, tag_id, konfhub_speaker_id').in('speaker_id', speakerIds),
  ])
  const ids: string[] = []
  const skipped: { speaker_id: string; name: string; role_tag_id: string }[] = []
  for (const e of entries) {
    const sp = speakers?.find(s => s.id === e.speaker_id)
    const primary = resolvePrimaryRole(sp?.konfhub_primary_role_tag_id, roles)?.tag_id
    const id = !e.role_tag_id || e.role_tag_id === primary
      ? sp?.konfhub_speaker_id
      : extras?.find(x => x.speaker_id === e.speaker_id && x.tag_id === e.role_tag_id)?.konfhub_speaker_id
    if (id) { if (!ids.includes(id)) ids.push(id) }
    else skipped.push({ speaker_id: e.speaker_id, name: sp?.public_name || sp?.name || '', role_tag_id: e.role_tag_id })
  }
  return { ids, skipped }
}
