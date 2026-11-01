import { actualDur, fmtDur, paxText, secToHm, type Row } from './model'

/* Show Caller — Excel download (browser side, exceljs loaded on demand). One tab per stage and day in the layout the show callers already use: cue, time, duration, actual times, type,
   MC, speakers, topic, screen, live, mic, audio, LX, stage (seats), comments. It is a snapshot; changes made afterwards in EventPilot are not in the file. */

const HEAD = 'FF12344D', GREEN = 'FFE3F4E8', YELLOW = 'FFFFF3B0', GREY = 'FFE5E7EB', BLUE = 'FFDCEBFA', GOLD = 'FFFCEFC3', LINE = { style: 'thin' as const, color: { argb: 'FFB8BEC6' } }
const COLS: { h: string; w: number }[] = [
  { h: 'CUE', w: 6 }, { h: 'TIME', w: 9 }, { h: 'DURATION', w: 10 }, { h: 'ACTUAL START', w: 12 }, { h: 'ACTUAL END', w: 12 }, { h: 'ACTUAL DURATION', w: 12 }, { h: 'SESSION TYPE', w: 18 }, { h: 'MC', w: 14 },
  { h: 'SPEAKERS', w: 48 }, { h: 'SESSION TOPIC', w: 36 }, { h: 'SCREEN', w: 14 }, { h: 'LIVE', w: 10 }, { h: 'MIC', w: 12 }, { h: 'AUDIO', w: 13 }, { h: 'LX', w: 16 }, { h: 'STAGE', w: 9 }, { h: 'COMMENTS', w: 34 },
]
const typeFill = (t: string) => (/fireside/i.test(t) ? GREY : /panel/i.test(t) ? BLUE : /keynote/i.test(t) ? GOLD : null)
const safeName = (s: string) => s.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)
const dayLabel = (d: string) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '')

export async function downloadShowcallXlsx(opts: { eventName: string; timezone: string; stages: { id: string; name: string }[]; rows: Row[]; includeMc: boolean }): Promise<void> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.created = new Date()
  const readme = wb.addWorksheet('Read me')
  readme.getColumn(1).width = 110
  ;[`${opts.eventName} — show caller sheet`, `Downloaded ${new Date().toLocaleString('en-GB', { timeZone: opts.timezone })} (${opts.timezone}).`, '',
    'This file is a snapshot of the live sheet at that moment. Times, titles, speakers and session types come from the Agenda; changes made in EventPilot after the download are not in this file.',
    'Cells you edit here stay in this file only — they are not sent back to EventPilot.'].forEach((t, i) => { const c = readme.addRow([t]).getCell(1); c.alignment = { wrapText: true, vertical: 'top' }; if (i === 0) c.font = { bold: true, size: 14, color: { argb: HEAD } } })

  const groups = new Map<string, Row[]>()
  for (const r of opts.rows) { if (r.flag === 'removed' || (!opts.includeMc && r.kind === 'mc')) continue; const k = `${r.trackId ?? ''}|${r.date}`; groups.set(k, [...(groups.get(k) ?? []), r]) }
  const used = new Set<string>(['Read me'])
  for (const [k, list] of [...groups.entries()].sort((a, b) => (a[0].split('|')[1] + (opts.stages.findIndex(s => s.id === a[0].split('|')[0]))).localeCompare(b[0].split('|')[1] + (opts.stages.findIndex(s => s.id === b[0].split('|')[0]))))) {
    const [tid, date] = k.split('|'), stage = opts.stages.find(s => s.id === tid)?.name ?? 'Stage'
    let name = safeName(`${stage} ${date.slice(8)}-${date.slice(5, 7)}`), n = 2
    while (used.has(name)) name = safeName(`${stage} ${date.slice(8)}-${date.slice(5, 7)} ${n++}`)
    used.add(name)
    const ws = wb.addWorksheet(name, { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }, views: [{ state: 'frozen', ySplit: 3 }] })
    COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c.w })
    ws.addRow([`${opts.eventName.toUpperCase()} — ${stage.toUpperCase()}`]); ws.mergeCells(1, 1, 1, COLS.length)
    ws.getCell(1, 1).font = { bold: true, size: 15, color: { argb: HEAD } }; ws.getCell(1, 1).alignment = { horizontal: 'center' }
    ws.addRow([dayLabel(date).toUpperCase()]); ws.mergeCells(2, 1, 2, COLS.length)
    ws.getCell(2, 1).font = { bold: true, size: 11 }; ws.getCell(2, 1).alignment = { horizontal: 'center' }
    const head = ws.addRow(COLS.map(c => c.h)); head.height = 22
    head.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD } }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = { top: LINE, left: LINE, bottom: LINE, right: LINE } })
    for (const r of list) {
      const f = r.fields
      const row = ws.addRow([r.cue, secToHm(r.startSec), fmtDur(r.durSec), f.actual_start ?? '', f.actual_end ?? '', actualDur(f.actual_start, f.actual_end), (r.typeLabel || '').toUpperCase(), (f.mc ?? '').toUpperCase(), '', r.topic, (f.screen ?? '').toUpperCase(), (f.live ?? '').toUpperCase(), (f.mic ?? '').toUpperCase(), (f.audio ?? '').toUpperCase(), (f.lx ?? '').toUpperCase(), r.kind === 'mc' ? '' : paxText(r), [f.comments, r.suggest && !f.comments ? r.suggest : ''].filter(Boolean).join(' ').toUpperCase()])
      const sp = row.getCell(9)
      sp.value = r.people.length
        ? { richText: r.people.flatMap((p, i) => [...(p.moderator ? [{ text: '(MOD) ', font: { bold: true, color: { argb: 'FFC0262D' }, size: 10 } }] : []), { text: `${p.name}${i < r.people.length - 1 ? '\n' : ''}`, font: { size: 10 } }]) }
        : r.peopleText
      const base = r.kind === 'mc' ? GREEN : r.kind === 'custom' ? YELLOW : null
      row.eachCell({ includeEmpty: true }, (c, col) => {
        c.font = { ...(c.font ?? {}), size: 10, bold: col === 7 || col === 2 }
        c.alignment = { vertical: 'middle', horizontal: col === 9 || col === 10 || col === 17 ? 'left' : 'center', wrapText: true }
        c.border = { top: LINE, left: LINE, bottom: LINE, right: LINE }
        const fill = col === 7 && r.kind === 'session' ? typeFill(r.typeLabel) : base
        if (fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
      })
    }
  }
  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url; a.download = `${opts.eventName.replace(/[^\w]+/g, '_')}_showcaller_${new Date().toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}
