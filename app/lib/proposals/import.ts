import * as XLSX from 'xlsx'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { GEMINI_FLASH_MODEL } from '@/app/lib/ai/models'
import { COPY_GENERATION_CONFIG, generateCopy } from '@/app/lib/ai/gemini-call'
import { cleanRow, type ProposalInput } from './research'

/* Reads a speaker-drop spreadsheet: a speakers sheet (Name / Designation / Company / Sex / Country / LinkedIn / Track, any column order, notes after the last column kept aside)
   and, when present, an "Event Overview" sheet that lists each day's stages and tracks with their times. The messy cells are tidied by one Gemini call; the untouched row is always kept. */

export type RawSpeakerRow = { position: number; cells: Record<string, string>; extra: string[] }
export type ParsedTrack = { name: string; day_label: string | null; stage: string | null; time_label: string | null; position: number }

const cellText = (v: unknown): string => (v == null ? '' : String(v)).replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
const HEADERS: Record<string, string> = { name: 'name', designation: 'designation', title: 'designation', company: 'company', organisation: 'company', organization: 'company', sex: 'sex', gender: 'sex', country: 'country', nationality: 'country', linkedin: 'linkedin', track: 'track' }

export function parseSpeakerSheet(buf: Buffer): { rows: RawSpeakerRow[]; tracks: ParsedTrack[] } {
  const wb = XLSX.read(buf, { type: 'buffer' })
  const grid = (name: string) => XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, blankrows: false, defval: '' }) as unknown[][]
  const overviewName = wb.SheetNames.find(n => /overview|agenda|programme|program/i.test(n))
  const speakerName = wb.SheetNames.find(n => n !== overviewName) ?? wb.SheetNames[0]

  const g = grid(speakerName)
  const headerAt = g.findIndex(r => r.map(cellText).map(s => s.toLowerCase()).includes('name') && r.map(cellText).some(s => /^(designation|title)$/i.test(s)))
  if (headerAt < 0) throw new Error('Could not find a header row with Name and Designation.')
  const cols: Record<string, number> = {}
  g[headerAt].forEach((h, i) => { const k = HEADERS[cellText(h).toLowerCase()]; if (k && cols[k] === undefined) cols[k] = i })
  if (cols.name === undefined) throw new Error('No Name column found.')
  const lastMapped = Math.max(...Object.values(cols))
  const rows: RawSpeakerRow[] = []
  for (const r of g.slice(headerAt + 1)) {
    const name = cellText(r[cols.name])
    if (!name) continue
    const cells: Record<string, string> = {}
    for (const [k, i] of Object.entries(cols)) cells[k] = cellText(r[i])
    rows.push({ position: rows.length + 1, cells, extra: r.slice(lastMapped + 1).map(cellText).filter(Boolean) })
  }
  return { rows, tracks: overviewName ? parseOverview(grid(overviewName)) : [] }
}

const TIME = /(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})/
const to24 = (h: number, m: string) => `${String(h >= 1 && h <= 7 ? h + 12 : h).padStart(2, '0')}:${m}`
const timeLabel = (s: string): string | null => { const m = s.match(TIME); return m ? `${to24(+m[1], m[2])} – ${to24(+m[3], m[4])}` : null }

/** The overview sheet is a grid: one column per day, a "Stage X: (time)" row, then the track's name, then its description. */
export function parseOverview(g: unknown[][]): ParsedTrack[] {
  const text = (r: number, c: number) => cellText(g[r]?.[c])
  const width = Math.max(...g.map(r => r.length))
  const dayRow = g.findIndex(r => r.some(c => /^day\s*\d/i.test(cellText(c))))
  const out: ParsedTrack[] = []
  for (let c = 0; c < width; c++) {
    const day = dayRow >= 0 && /^day\s*\d/i.test(text(dayRow, c)) ? text(dayRow, c) : null
    if (!day) continue
    for (let r = dayRow + 1; r < g.length; r++) {
      const label = text(r, c)
      if (!/^(plenary\s+)?stage\b/i.test(label)) continue
      // time: in this label, else the same row's first day column, else (plenary) the row below
      const firstDayCol = g[dayRow].findIndex(x => /^day\s*\d/i.test(cellText(x)))
      let time = timeLabel(label) ?? timeLabel(text(r, firstDayCol)) ?? (/plenary/i.test(label) ? timeLabel(text(r + 1, c)) : null)
      const period = /pre\s*lunch/i.test(`${label} ${text(r, firstDayCol)}`) ? 'pre lunch' : /post\s*lunch/i.test(`${label} ${text(r, firstDayCol)}`) ? 'post lunch' : null
      if (!time && period) time = period === 'pre lunch' ? 'Pre lunch' : 'Post lunch'
      let name = ''
      for (let k = r + 1; k < Math.min(g.length, r + 5); k++) { const t = text(k, c); if (t && t.length <= 140 && !TIME.test(t) && !/^(plenary\s+)?stage\b/i.test(t)) { name = t; break } if (/^(plenary\s+)?stage\b/i.test(t)) break }
      if (!name) continue
      const stage = label.replace(/\(.*?\)/g, '').replace(/[:\s]+$/g, '').replace(/\s*(pre|post)\s*lunch/i, '').replace(/:\s*$/, '').trim() || null
      out.push({ name: name.replace(/:\s*$/, ''), day_label: day, stage: stage ? stage.replace(/^stage\s+(\w)\b.*/i, 'Stage $1') : null, time_label: time, position: out.length })
    }
  }
  return out
}

const key = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
/** Which track a sheet's track text means (typos and trailing colons tolerated). Null when nothing is close enough. */
export function matchTrack<T extends { id: string; name: string }>(text: string, tracks: T[]): T | null {
  const t = key(text)
  if (!t) return null
  const exact = tracks.find(x => key(x.name) === t); if (exact) return exact
  const A = new Set(t.split(' ').filter(w => w.length > 2))
  let best: { track: T; score: number } | null = null
  for (const tr of tracks) {
    const B = new Set(key(tr.name).split(' ').filter(w => w.length > 2))
    const hit = [...A].filter(w => B.has(w) || [...B].some(b => b.length > 4 && w.length > 4 && (b.startsWith(w.slice(0, 5)) || w.startsWith(b.slice(0, 5))))).length
    const score = hit / Math.max(1, Math.min(A.size, B.size))
    if (!best || score > best.score) best = { track: tr, score }
  }
  return best && best.score >= 0.7 ? best.track : null
}

/** One call tidies every row: merged name/title, "Designation:" prefixes, designation split across cells, stray honorifics. Falls back to simple cleaning. */
export async function normaliseRows(rows: RawSpeakerRow[]): Promise<ProposalInput[]> {
  const fallback = rows.map(r => cleanRow({ name: r.cells.name, designation: r.cells.designation, company: r.cells.company, country: r.cells.country, linkedin: r.cells.linkedin, track: r.cells.track }))
  try {
    const gem = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!).getGenerativeModel({ model: GEMINI_FLASH_MODEL, generationConfig: COPY_GENERATION_CONFIG })
    const out: ProposalInput[] = []
    for (let i = 0; i < rows.length; i += 30) {
      const slice = rows.slice(i, i + 30)
      const prompt = `Tidy these spreadsheet rows of proposed speakers. Each has Name, Designation and Company cells that may be messy: the title merged into the name, the designation split across Designation and Company ("Director of Enforcement at the" + "Virtual Assets Regulatory Authority"), prefixes like "Designation:" or "Organisation:", trailing commas, honorifics like "Mr.".
Rules: NEVER invent or "correct" facts, spellings or organisations — only move text into the right field and remove clutter. Keep rank titles that are part of how the person is formally addressed (Major General, Dr., Prof., Lt. Col., H.E.) at the start of the name; drop Mr./Mrs./Ms. If the company is missing but the designation says "at X", move X to company. If a cell is a phone number or a note, drop it. Return JSON only: {"rows":[{"i":<index>,"name":"","designation":"","company":""}]}

${slice.map((r, k) => `${k}: name=${JSON.stringify(r.cells.name ?? '')} | designation=${JSON.stringify(r.cells.designation ?? '')} | company=${JSON.stringify(r.cells.company ?? '')}`).join('\n')}`
      const j = JSON.parse(await generateCopy(gem, prompt, 'proposal sheet tidy')) as { rows?: { i: number; name?: string; designation?: string; company?: string }[] }
      for (let k = 0; k < slice.length; k++) {
        const t = j.rows?.find(x => x.i === k), base = fallback[i + k]
        const name = (t?.name ?? '').trim()
        out.push({ ...base, name: name.length >= 3 && name.length <= 120 ? name : base.name, designation: (t?.designation ?? '').trim() || base.designation, company: (t?.company ?? '').trim() || base.company })
      }
    }
    return out
  } catch (e) { console.error('[proposals] sheet tidy failed, using simple cleaning:', e instanceof Error ? e.message : e); return fallback }
}
