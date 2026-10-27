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

/* ── the rich LinkedIn box ─────────────────────────────────────────────────────────────────────
   What lands in the box is what was copied (text, headings, lists, pictures), like pasting into Word — minus everything that is not the speaker:
   the "More profiles for you" rail and after, scripts/styles, and every picture that is not the speaker's own: the viewer's photo, company logos, banners, post images, documents,
   other people's photos. Pictures are judged from what the copied page says about them (the address LinkedIn serves them from, their alt text, their size). */

const TITLE_TOKENS = new Set(['dr', 'prof', 'professor', 'mr', 'mrs', 'ms', 'miss', 'sir', 'eng', 'engr', 'h.e.', 'he', 'hh', 'sheikh', 'sheikha', 'ambassador', 'amb'])
export const nameTokens = (name: string) => name.toLowerCase().split(/[\s.,]+/).map(t => t.replace(/[^\p{L}]/gu, '')).filter(t => t.length >= 3 && !TITLE_TOKENS.has(t))

export type PicVerdict = 'speaker' | 'maybe' | 'drop'
/** Is this copied picture the speaker's own face? 'speaker' = a profile-photo address whose alt text names them; 'maybe' = a profile-photo address with no name to compare; anything else is dropped. */
export function judgePicture(p: { url: string; alt: string; w?: number; h?: number }, name: string): PicVerdict {
  const url = p.url
  if (!/^https?:\/\//i.test(url)) return 'drop'
  if ((p.w && p.w < 48) || (p.h && p.h < 48)) return 'drop'
  if (/\.(svg|gif)(\?|$)/i.test(url) || /(pixel|tracking|spacer|sprite|beacon|\/li\/track)/i.test(url)) return 'drop'
  if (/(company-logo|logo|background|banner|cover|feedshare|articleshare|videocover|document|ghost|sync\/|ads?[-_/]|school|organization)/i.test(url)) return 'drop'
  if (/\b(logo|banner|cover|background|poster|certificate|award|post|document|icon)\b/i.test(p.alt)) return 'drop'
  const person = /(profile-(displayphoto|framedphoto|originalphoto)|\/profile-)/i.test(url)
  const toks = nameTokens(name), alt = p.alt.toLowerCase()
  const hits = toks.filter(t => alt.includes(t)).length
  const named = toks.length > 0 && (hits >= 2 || (toks.length === 1 && hits === 1) || (hits >= 1 && alt.includes(toks[toks.length - 1])))
  if (named && (person || !alt.includes('logo'))) return person || /\b(photo|picture|profile|headshot)\b/i.test(p.alt) || alt.trim().split(/\s+/).length <= 5 ? 'speaker' : 'drop'
  if (person && !p.alt.trim()) return 'maybe'     // a profile photo that does not say whose — could be the viewer's own, so it only counts when nothing better is there
  return 'drop'                                     // a profile photo whose alt names SOMEONE ELSE (the viewer, a suggested profile), or any non-person picture
}

const ALLOWED = new Set(['p', 'br', 'div', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'a', 'img'])
const encAttr = (s: string) => s.replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const attr = (tag: string, n: string) => { const m = new RegExp(`\\b${n}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag); return (m?.[2] ?? m?.[3] ?? '').replace(/&amp;/g, '&').trim() }

export type RichPaste = { html: string; text: string; speakerPictures: string[]; maybePictures: string[]; leftOutPictures: number; removedSection: string | null; removedChars: number }

/** Copied page HTML in, safe HTML out (only simple formatting, links and the speaker's own picture), plus the plain text for the research. PURE: also used to re-clean what is stored before it is shown again. */
export function richPaste(rawHtml: string, name: string): RichPaste {
  let html = rawHtml.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|iframe|object|embed|svg|math|form|head|title|meta|link|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, '').replace(/<(meta|link)\b[^>]*>/gi, '')
  // cut at the first rail heading, but only when the speaker's own profile came first
  let removedSection: string | null = null, removedChars = 0
  for (const m of html.matchAll(/>\s*([^<>]{3,80}?)\s*</g)) {
    const t = m[1].trim()
    if (CUT_HEADINGS.some(r => r.test(t))) {
      const before = html.slice(0, m.index).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length
      if (before >= 200) { removedSection = t; removedChars = html.slice(m.index).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length; html = html.slice(0, m.index + 1); break }
    }
  }
  const out: string[] = [], speaker: string[] = [], maybe: string[] = []
  let left = 0
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|[^<]+|</g)) {
    const [tok, close, tagRaw, attrs] = m
    if (!tagRaw) { out.push(tok === '<' ? '&lt;' : tok); continue }
    const tag = tagRaw.toLowerCase()
    if (!ALLOWED.has(tag)) continue
    if (close) { if (tag !== 'img' && tag !== 'br') out.push(`</${tag}>`); continue }
    if (tag === 'img') {
      const url = attr(attrs, 'src'), alt = attr(attrs, 'alt')
      const v = judgePicture({ url, alt, w: Number(attr(attrs, 'width')) || undefined, h: Number(attr(attrs, 'height')) || undefined }, name)
      if (v === 'drop') { left++; continue }
      ;(v === 'speaker' ? speaker : maybe).push(url)
      out.push(`<img src="${encAttr(url)}" alt="${encAttr(alt)}">`); continue
    }
    if (tag === 'a') { const href = attr(attrs, 'href'); out.push(/^https?:\/\//i.test(href) ? `<a href="${encAttr(href)}" target="_blank" rel="noopener noreferrer">` : '<a>'); continue }
    out.push(tag === 'br' ? '<br>' : `<${tag}>`)
  }
  // with a clear speaker picture, "maybe" ones (profile photos that do not say whose) are not offered at all: one of them could be the viewer's own
  let kept = out.join('')
  if (speaker.length) for (const u of maybe) { kept = kept.replace(new RegExp(`<img src="${encAttr(u).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`, 'g'), ''); left++ }
  const text = cleanProfilePaste(kept.replace(/<(br|\/p|\/div|\/li|\/h[1-4])\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")).text
  return { html: kept, text, speakerPictures: [...new Set(speaker)], maybePictures: speaker.length ? [] : [...new Set(maybe)], leftOutPictures: left, removedSection, removedChars }
}
