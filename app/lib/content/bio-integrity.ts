/* Short Bio integrity check (2026-09-26, per Madhu).

   A speaker's short bio is THEIR words about themselves — not Trescon marketing
   content — so it is deliberately NOT run through the event's content rules
   (style guide / validation rules). This only looks for accidents that happen
   when text is copy-pasted or generated:
     - cut-off text, gaps ("at ."), stray characters, doubled words/punctuation
     - someone else's bio pasted in (name / pronoun / salutation contradicts the record)
     - placeholder junk and encoding damage
     - basic spelling/grammar and record contradictions, via one light AI proofread
   It only ever REPORTS. It never rewrites and never blocks a save. */
import { GoogleGenerativeAI } from '@google/generative-ai'
import crypto from 'crypto'

export type BioFinding = { code: string; message: string }

export type BioRecord = {
  name?: string | null
  public_name?: string | null
  role?: string | null
  company?: string | null
  country?: string | null
  salutation?: string | null
}

const TITLES = new Set(['dr', 'prof', 'professor', 'mr', 'ms', 'mrs', 'miss', 'sir', 'sheikh', 'sheikha', 'he', 'hh', 'hrh', 'hon', 'eng', 'amb', 'h', 'e'])
const MALE_SAL = new Set(['mr', 'sir', 'sheikh'])
const FEMALE_SAL = new Set(['ms', 'mrs', 'miss', 'sheikha'])
const DANGLING_END = /\b(and|or|the|of|at|in|for|to|with|by|as|from|on|a|an|&|whose|which|that)$/i

const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
const wordsOf = (s: string) => fold(s).replace(/[^a-z\s'-]/g, ' ').split(/\s+/).filter(Boolean)
const nameTokens = (r: BioRecord) => [...new Set([...wordsOf(r.public_name ?? ''), ...wordsOf(r.name ?? '')])].filter(t => t.length >= 3 && !TITLES.has(t.replace(/\./g, '')))

/** Deterministic checks — free and instant. */
export function checkBioIntegrity(bio: string | null | undefined, record: BioRecord, maxChars = 500): BioFinding[] {
  const text = (bio ?? '').trim()
  if (!text) return []
  const out: BioFinding[] = []
  const add = (code: string, message: string) => out.push({ code, message })

  // Length is deliberately not checked here: the field's own hint already states the limit, and imported/producer
  // bios are the speaker's own text. (maxChars stays in the signature for callers.)
  void maxChars
  if (text.length < 60) add('too_short', 'Very short — may be incomplete.')

  // Cut-off / damaged text
  const gap = text.match(/\b(at|in|of|for|to|with|and|by|as|from|the)\s+([.,;:])/i)
  if (gap) add('gap', `Words look missing near “…${text.slice(Math.max(0, (gap.index ?? 0) - 25), (gap.index ?? 0) + 15).trim()}…”.`)
  if (!/[.!?]["'”’)\]]?$/.test(text)) add('cut_off', 'Doesn’t end with sentence punctuation — the text may be cut off.')
  else if (DANGLING_END.test(text.replace(/[.!?]+["'”’)\]]?$/, '').trim())) add('cut_off', 'Ends on a joining word — the last sentence may be cut off.')
  if (/(\b\w+)\s+\1\b/i.test(text.replace(/\b(had|that)\s+\1\b/gi, ''))) add('repeated_word', `Repeated word: “${text.match(/(\b\w+)\s+\1\b/i)?.[0]}”.`)
  if (/[.!?,;]{2,}|\s[,.;:!?]/.test(text.replace(/\.\.\./g, ''))) add('punctuation', 'Doubled or misplaced punctuation.')
  if (/ {2,}/.test(text)) add('spacing', 'Double spaces in the text.')
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f�]|â€|Ã[©¨¼¶¤]|\?\?\?/.test(text)) add('encoding', 'Garbled or unreadable characters.')
  if (/<\/?[a-z][^>]*>|\*\*|^\s*[-•]\s|\[[^\]]{0,40}\]|lorem ipsum|\bTBD\b|\bTBC\b|insert (name|bio)|\bN\/A\b|xxx/im.test(text)) add('placeholder', 'Contains markup or placeholder text.')

  // Mix-up with someone else's bio
  const tokens = nameTokens(record)
  const bodyWords = new Set(wordsOf(text))
  if (tokens.length > 0 && !tokens.some(t => bodyWords.has(t))) add('name_missing', `Doesn’t mention the speaker’s name (${(record.public_name ?? record.name ?? '').trim()}) — could belong to someone else.`)
  const lead = text.match(/^((?:(?:Dr|Prof|Professor|Mr|Ms|Mrs|Sheikh|Sheikha|H\.?E\.?|Eng|Amb)\.?\s+)*\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’.-]+){0,3})\s+(is|was|has|serves|leads|joined|brings|currently)\b/u)
  if (lead && tokens.length > 0) {
    const leadTokens = wordsOf(lead[1]).filter(t => t.length >= 3 && !TITLES.has(t))
    if (leadTokens.length > 0 && !leadTokens.some(t => tokens.includes(t))) add('other_name', `Opens with a different name (“${lead[1].trim()}”).`)
  }
  const sal = fold(record.salutation ?? '').replace(/[^a-z]/g, '')
  const he = (text.match(/\b(he|his|him|himself)\b/gi) ?? []).length
  const she = (text.match(/\b(she|her|hers|herself)\b/gi) ?? []).length
  if (MALE_SAL.has(sal) && she >= 2 && he === 0) add('pronoun_mismatch', `Salutation is “${record.salutation}” but the bio uses she/her.`)
  if (FEMALE_SAL.has(sal) && he >= 2 && she === 0) add('pronoun_mismatch', `Salutation is “${record.salutation}” but the bio uses he/his.`)
  return out
}

// ── Light AI proofread (report-only) ──────────────────────────────────────
let _gemini: GoogleGenerativeAI | null = null
const cache = new Map<string, { at: number; findings: BioFinding[] }>()
const CACHE_MS = 60 * 60 * 1000

/** One short Gemini pass that LISTS problems only. Never rewrites. Returns [] on any failure — the check must never break the page. */
export async function proofreadBio(bio: string, record: BioRecord): Promise<BioFinding[]> {
  const text = bio.trim()
  if (!text || !process.env.GEMINI_API_KEY) return []
  const key = crypto.createHash('sha256').update(JSON.stringify([text, record.public_name, record.role, record.company, record.salutation])).digest('hex')
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.findings
  try {
    if (!_gemini) _gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = _gemini.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json', temperature: 0 } })
    const prompt = `You are proofreading a speaker's short bio for accidents made while copy-pasting or generating it. This is the speaker's own text about themselves — do NOT judge style, tone, marketing language, punctuation conventions, abbreviations or figures.

Speaker record: name "${record.public_name || record.name || ''}", title "${record.role || ''}", organisation "${record.company || ''}", country "${record.country || ''}", salutation "${record.salutation || ''}".

Today's date is ${new Date().toISOString().slice(0, 10)}. Do NOT judge dates, years, awards, figures or factual claims — you cannot verify them.

Report ONLY real problems of these kinds:
1. spelling mistakes or clearly broken grammar
2. words that look missing or cut off
3. text that seems to describe a DIFFERENT person or organisation than the record above
4. a clear contradiction with the record: a wholly different organisation, or a different gender. Ignore wording differences — abbreviations, singular/plural, extra or missing parts of a title or organisation name (e.g. "Investment" vs "Investments") are NOT problems

Bio:
"""
${text.slice(0, 3000)}
"""

Return a JSON array of at most 5 short strings (each under 110 characters, quoting the problem words). Return [] if there are no real problems.`
    const raw = (await model.generateContent([{ text: prompt }])).response.text().trim()
    const parsed = JSON.parse(raw) as unknown
    const findings: BioFinding[] = Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 5).map(m => ({ code: 'proofread', message: m.trim() }))
      : []
    cache.set(key, { at: Date.now(), findings })
    return findings
  } catch (e) {
    console.error('proofreadBio failed (ignored):', e instanceof Error ? e.message : e)
    return []
  }
}

/** Deterministic + AI, de-duplicated. */
export async function fullBioCheck(bio: string | null | undefined, record: BioRecord, maxChars = 500): Promise<BioFinding[]> {
  const det = checkBioIntegrity(bio, record, maxChars)
  const ai = bio?.trim() ? await proofreadBio(bio, record) : []
  return [...det, ...ai]
}
