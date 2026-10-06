import { parseGuestLink } from './link'
import { speakerEmailOf } from './access'

const TITLES = new Set(['dr', 'prof', 'professor', 'mr', 'mrs', 'ms', 'miss', 'eng', 'engr', 'sheikh', 'sheikha', 'he', 'h.e', 'hh', 'sir', 'amb', 'ambassador'])
const clean = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()
export function nameTokens(name: string): string[] { return clean(name).split(' ').filter(t => t && !TITLES.has(t)) }
const nameKey = (name: string) => nameTokens(name).join(' ')

export type MatchSpeaker = { id: string; name: string | null; public_name: string | null; email: string; guest_invite_code: string | null }
export type ImportRow = { name?: string | null; email?: string | null; link?: string | null }
export type RowResult = {
  index: number; input: ImportRow
  status: 'matched' | 'ambiguous' | 'unmatched' | 'invalid_link' | 'duplicate_in_file' | 'code_taken'
  how?: 'email' | 'name' | 'code'
  speaker?: { id: string; name: string }
  candidates?: { id: string; name: string }[]
  code?: string; url?: string; message?: string
  replaces?: boolean // the speaker already has a different link
}

/** Matches each row to a speaker: by email, then exact name, then the code's name prefix (e.g. NURYMGUEST → Nurym …). */
export function matchRows(rows: ImportRow[], speakers: MatchSpeaker[]): RowResult[] {
  const label = (s: MatchSpeaker) => s.public_name || s.name || '(unnamed)'
  const byEmail = new Map(speakers.filter(s => s.email).map(s => [s.email.toLowerCase(), s]))
  const results: RowResult[] = []
  const seenCodes = new Map<string, number>()
  const assigned = new Map<string, number>() // speaker id -> row index, to catch two rows for one speaker

  rows.forEach((input, index) => {
    const parsed = parseGuestLink(input.link ?? '')
    if (!parsed.ok) { results.push({ index, input, status: 'invalid_link', message: parsed.error }); return }
    const base: RowResult = { index, input, status: 'unmatched', code: parsed.code, url: parsed.url }
    if (seenCodes.has(parsed.code)) { results.push({ ...base, status: 'duplicate_in_file', message: `This code is also on row ${seenCodes.get(parsed.code)! + 1}.` }); return }
    seenCodes.set(parsed.code, index)

    let hit: MatchSpeaker | undefined; let how: RowResult['how']
    const email = (input.email ?? '').trim().toLowerCase()
    if (email && byEmail.has(email)) { hit = byEmail.get(email); how = 'email' }
    if (!hit && input.name?.trim()) {
      const key = nameKey(input.name)
      const named = speakers.filter(s => nameKey(label(s)) === key || (s.name && nameKey(s.name) === key))
      if (named.length === 1) { hit = named[0]; how = 'name' }
      else if (named.length > 1) { results.push({ ...base, status: 'ambiguous', candidates: named.map(s => ({ id: s.id, name: label(s) })), message: 'More than one speaker has this name.' }); return }
    }
    if (!hit) {
      const stem = parsed.code.replace(/GUEST.*$/, '').toLowerCase()
      if (stem.length >= 4) {
        const cands = speakers.filter(s => { const t = nameTokens(label(s)); return t.some(tok => tok === stem || (tok.length >= 4 && tok.startsWith(stem))) })
        if (cands.length === 1) { hit = cands[0]; how = 'code' }
        else if (cands.length > 1) { results.push({ ...base, status: 'ambiguous', candidates: cands.map(s => ({ id: s.id, name: label(s) })), message: `“${stem}” fits more than one speaker — add a name or email to that row.` }); return }
      }
    }
    if (!hit) { results.push({ ...base, status: 'unmatched', message: 'No speaker matched. Add the speaker’s name or email on that row.' }); return }
    if (assigned.has(hit.id)) { results.push({ ...base, status: 'duplicate_in_file', message: `${label(hit)} already has a link on row ${assigned.get(hit.id)! + 1}.` }); return }
    // a code already assigned to a DIFFERENT speaker
    const owner = speakers.find(s => s.guest_invite_code === parsed.code && s.id !== hit!.id)
    if (owner) { results.push({ ...base, status: 'code_taken', message: `This code already belongs to ${label(owner)}.` }); return }
    assigned.set(hit.id, index)
    results.push({ ...base, status: 'matched', how, speaker: { id: hit.id, name: label(hit) }, replaces: !!hit.guest_invite_code && hit.guest_invite_code !== parsed.code })
  })
  return results
}

export { speakerEmailOf }
