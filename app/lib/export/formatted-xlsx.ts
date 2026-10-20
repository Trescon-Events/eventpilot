// Browser-side formatted Excel export (2026-10-20). SheetJS (xlsx) cannot write cell styles, so exports that must look finished
// (speaker details, status board) go through exceljs, loaded on demand so it never weighs on the page bundle.
export type XlsxColumn = { header: string; width?: number; group?: string }
export type StatusTone = 'green' | 'amber' | 'red' | 'teal' | 'grey'

const TONE: Record<StatusTone, { bg: string; fg: string }> = {
  green: { bg: 'FFDCF5E6', fg: 'FF14773A' },
  amber: { bg: 'FFFFF0CC', fg: 'FF8A5A00' },
  red: { bg: 'FFFDE0DE', fg: 'FFB3261E' },
  teal: { bg: 'FFD6F1EF', fg: 'FF0E6B66' },
  grey: { bg: 'FFEEF0F3', fg: 'FF5B6470' },
}
const HEADER_BG = 'FF12344D'
const GROUP_BGS = ['FF1F6F6B', 'FF3B4A9C', 'FF6B3FA0', 'FF8A5A00', 'FF4A5560']
const BORDER = { style: 'thin' as const, color: { argb: 'FFD5D9DE' } }

export async function downloadFormattedXlsx(opts: {
  filename: string
  sheetName: string
  title: string
  subtitle?: string
  columns: XlsxColumn[]
  rows: (string | number | null | undefined)[][]
  freezeColumns?: number
  // Colours a cell by its header + text (status columns); return undefined for plain cells.
  tone?: (header: string, value: string) => StatusTone | undefined
}): Promise<void> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.created = new Date()
  const ws = wb.addWorksheet(opts.sheetName.slice(0, 31))
  const n = opts.columns.length
  const hasGroups = opts.columns.some(c => c.group)

  ws.addRow([opts.title]); ws.mergeCells(1, 1, 1, Math.max(n, 2))
  ws.getCell(1, 1).font = { bold: true, size: 15, color: { argb: HEADER_BG } }
  ws.getRow(1).height = 26
  ws.addRow([opts.subtitle ?? '']); ws.mergeCells(2, 1, 2, Math.max(n, 2))
  ws.getCell(2, 1).font = { size: 10, color: { argb: 'FF5B6470' } }

  let headerRowNo = 3
  if (hasGroups) {
    ws.addRow(opts.columns.map(c => c.group ?? ''))
    let start = 0; let colour = 0
    for (let i = 1; i <= n; i++) {
      if (i === n || (opts.columns[i].group ?? '') !== (opts.columns[start].group ?? '')) {
        if (i - 1 > start) ws.mergeCells(3, start + 1, 3, i)
        for (let c = start + 1; c <= i; c++) ws.getCell(3, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GROUP_BGS[colour % GROUP_BGS.length] } }
        ws.getCell(3, start + 1).font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
        ws.getCell(3, start + 1).alignment = { horizontal: 'center', vertical: 'middle' }
        colour++; start = i
      }
    }
    headerRowNo = 4
  }

  const header = ws.addRow(opts.columns.map(c => c.header))
  header.height = 30
  header.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER }
  })

  opts.rows.forEach((values, ri) => {
    const row = ws.addRow(values.map(v => (v === null || v === undefined ? '' : v)))
    row.eachCell({ includeEmpty: true }, (cell, colNo) => {
      const head = opts.columns[colNo - 1]?.header ?? ''
      const text = String(cell.value ?? '')
      cell.alignment = { vertical: 'top', wrapText: true }
      cell.border = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER }
      if (ri % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F9FA' } }
      if (/^https?:\/\//.test(text)) {
        cell.value = { text: 'Open link', hyperlink: text }
        cell.font = { color: { argb: 'FF1D5FBF' }, underline: true }
        return
      }
      const tone = opts.tone?.(head, text)
      if (tone) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TONE[tone].bg } }
        cell.font = { bold: true, color: { argb: TONE[tone].fg } }
        cell.alignment = { vertical: 'top', horizontal: 'center', wrapText: true }
      }
    })
  })

  opts.columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.width ?? 18 })
  ws.views = [{ state: 'frozen', xSplit: opts.freezeColumns ?? 0, ySplit: headerRowNo }]
  ws.autoFilter = { from: { row: headerRowNo, column: 1 }, to: { row: headerRowNo, column: n } }
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }

  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url; a.download = opts.filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
