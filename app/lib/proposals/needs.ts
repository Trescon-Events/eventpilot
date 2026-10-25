/* What a producer still has to do to finish a speaker's card — in plain words, most important first. Pure: the same list drives the checklist on each card, the "N speakers need your input" banner,
   and the email / reminder. A card with an empty list is ready for the producer to mark Ready. */

export type Ask = { key: 'retry' | 'identity' | 'confirm' | 'bio' | 'photo' | 'country' | 'logo'; text: string; hint: string }
export type NeedsCandidate = {
  status: string; review_state: string
  card: { photo_url?: string | null; logo_url?: string | null; bio?: string | null; nationality_iso2?: string | null; website_url?: string | null }
  research?: { status?: string; concerns?: string[] } | null
}
const wordCount = (s: string | null | undefined) => (s ?? '').trim().split(/\s+/).filter(Boolean).length

export function asksFor(c: NeedsCandidate): Ask[] {
  if (c.review_state === 'excluded' || c.review_state === 'ready') return []
  if (c.status === 'error') return [{ key: 'retry', text: 'The research did not finish.', hint: 'Press Research again. If it fails twice, drop the speaker’s LinkedIn text in the box first.' }]
  if (c.status !== 'researched') return []
  const out: Ask[] = []
  const concerns = c.research?.concerns ?? []
  if (c.research?.status === 'not_found') out.push({ key: 'identity', text: 'We could not find this person online.', hint: 'Paste their LinkedIn profile text, a bio, or a link to a page about them into “Drop more info”, then research again.' })
  const org = concerns.find(x => /organisation found .* is not the one in the sheet/i.test(x))
  const name = concerns.find(x => /spelled differently from the sheet/i.test(x))
  if (org) out.push({ key: 'confirm', text: 'The organisation found differs from the sheet.', hint: 'Check it is the right person, and correct the organisation above if the sheet was wrong.' })
  else if (name) out.push({ key: 'confirm', text: 'The name found is spelled differently from the sheet.', hint: 'Confirm it is the same person, and correct the name above if needed.' })
  else if (c.research?.status === 'needs_review' && concerns.some(x => /could not confirm who this is|disagrees on the|snippets only|only one independent source/i.test(x))) out.push({ key: 'confirm', text: 'The research is not certain about this person.', hint: 'Open the findings on the right, confirm the title and organisation, or drop their LinkedIn text in the box for a firmer match.' })
  if (c.research?.status !== 'not_found' && wordCount(c.card.bio) < 40) out.push({ key: 'bio', text: 'No usable bio yet.', hint: 'Paste their LinkedIn “About” text or any bio into “Drop more info” and research again — or write the bio above.' })
  if (!c.card.photo_url) out.push({ key: 'photo', text: 'No photo.', hint: 'Drop or paste a portrait into “Drop more info”, or use Upload photo.' })
  if (!c.card.nationality_iso2) out.push({ key: 'country', text: 'No country, so no flag.', hint: 'Pick the nationality above.' })
  if (!c.card.logo_url && c.research?.status !== 'not_found') out.push({ key: 'logo', text: 'No organisation logo.', hint: 'Add the organisation’s website above, or upload a logo.' })
  return out
}

/** Speakers that are researched but still waiting on the producer. */
export const needsInput = (list: NeedsCandidate[]) => list.filter(c => asksFor(c).length > 0)
