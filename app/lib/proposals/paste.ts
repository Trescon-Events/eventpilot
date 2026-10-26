/* Speaker Proposals — what a producer pastes into "Drop more info". A copied LinkedIn page carries a lot that is NOT about the speaker: the "More profiles for you" rail,
   "People also viewed", ads and the site footer. Those sections list OTHER people, so they are cut before the research ever sees them. PURE (no database): the page and the server share it. */

// A line that starts one of those sections. Everything from the first such line to the end of the paste is dropped: on a LinkedIn page they sit after the person's own profile.
const CUT_HEADINGS = [
  /^more profiles for you$/i, /^people also viewed$/i, /^people you may know$/i, /^people also search(ed)? for$/i, /^explore premium profiles$/i, /^other similar profiles$/i, /^similar profiles$/i,
  /^more members$/i, /^you might like$/i, /^pages for you$/i, /^who your viewers also viewed$/i, /^profiles for you$/i, /^promoted$/i, /^ad$/i, /^suggested for you$/i,
  /^about\s+accessibility\s+talent solutions/i, /^linkedin corporation\s*©/i, /^select language$/i,
]
// Single lines of page chrome (buttons, counters) that add nothing.
const NOISE = /^(connect|follow|message|more|show all( \d+)?( \w+)?|see more|see less|…see more|\.\.\.see more|send profile in a message|save to pdf|report \/ block|add profile section|open to|enhance profile|resources|\d+ followers?|\d+\+? connections?|· (1st|2nd|3rd)|(1st|2nd|3rd)|contact info|mutual connections?)$/i

export type CleanedPaste = { text: string; removedSection: string | null; removedChars: number }

export function cleanProfilePaste(raw: string): CleanedPaste {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n')
  let cut = -1, section: string | null = null
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (t && t.length < 80 && CUT_HEADINGS.some(r => r.test(t))) {
      const before = lines.slice(0, i).join('\n').trim().length
      if (before >= 200) { cut = i; section = t; break } // only when the speaker's own profile came first; a paste that is nothing but a rail is left for the producer to see
    }
  }
  const kept = cut >= 0 ? lines.slice(0, cut) : lines
  const removedChars = cut >= 0 ? lines.slice(cut).join('\n').trim().length : 0
  const out: string[] = []
  for (const l of kept) {
    const t = l.replace(/\s+$/g, '')
    if (NOISE.test(t.trim())) continue
    if (!t.trim() && !out.length) continue
    if (!t.trim() && !out[out.length - 1]?.trim()) continue // one blank line at most
    out.push(t)
  }
  return { text: out.join('\n').trim(), removedSection: section, removedChars }
}

/** Image links found in copied HTML (what Word would show as pictures), real pictures only: web links, not tiny icons or tracking pixels. Duplicates removed. */
export function imagesInHtml(html: string, max = 12): { url: string; alt: string }[] {
  const found = new Map<string, { url: string; alt: string }>()
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0]
    const src = /\bsrc\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag); const url = (src?.[2] ?? src?.[3] ?? '').replace(/&amp;/g, '&').trim()
    if (!/^https?:\/\//i.test(url)) continue
    const w = Number(/\bwidth\s*=\s*["']?(\d+)/i.exec(tag)?.[1] ?? 0), h = Number(/\bheight\s*=\s*["']?(\d+)/i.exec(tag)?.[1] ?? 0)
    if ((w && w < 48) || (h && h < 48)) continue
    if (/\.(svg|gif)(\?|$)/i.test(url) || /(pixel|tracking|spacer|sprite|\/li\/track|beacon)/i.test(url)) continue
    if (!found.has(url)) found.set(url, { url, alt: (/\balt\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag)?.[2] ?? '').trim() })
    if (found.size >= max) break
  }
  return [...found.values()]
}
