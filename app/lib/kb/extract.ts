import { GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleAIFileManager } from '@google/generative-ai/server'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import * as XLSX from 'xlsx'

const INLINE_THRESHOLD = 5 * 1024 * 1024

async function extractPdfText(buffer: Buffer, fileName: string): Promise<string> {
  const genAI  = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model  = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  const prompt = 'Extract all text content from this PDF document. Return only the raw text exactly as it appears — preserve headings, paragraphs, lists, and section structure. Do not summarise, do not add commentary, do not add formatting characters. Return the full text.'

  if (buffer.byteLength > INLINE_THRESHOLD) {
    const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY!)
    const tmpPath = join(tmpdir(), `kb_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`)
    try {
      await writeFile(tmpPath, buffer)
      const uploadRes = await fileManager.uploadFile(tmpPath, { mimeType: 'application/pdf', displayName: fileName })
      const result = await model.generateContent([
        { fileData: { mimeType: 'application/pdf', fileUri: uploadRes.file.uri } },
        { text: prompt },
      ])
      await fileManager.deleteFile(uploadRes.file.name).catch(() => {})
      return result.response.text().trim()
    } finally {
      await unlink(tmpPath).catch(() => {})
    }
  }

  const result = await model.generateContent([
    { inlineData: { mimeType: 'application/pdf', data: buffer.toString('base64') } },
    { text: prompt },
  ])
  return result.response.text().trim()
}

/** Parses every sheet into a compact delimited text table — capped so it stays within a reasonable prompt size. */
function extractXlsxText(buffer: Buffer): string {
  const MAX_ROWS_PER_SHEET = 2000
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sections: string[] = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    if (rows.length === 0) continue

    const headers = Object.keys(rows[0])
    const lines = [headers.join('\t')]
    for (const row of rows.slice(0, MAX_ROWS_PER_SHEET)) {
      lines.push(headers.map(h => String(row[h] ?? '')).join('\t'))
    }
    const truncatedNote = rows.length > MAX_ROWS_PER_SHEET ? `\n... (${rows.length - MAX_ROWS_PER_SHEET} more rows truncated, ${rows.length} total)` : ''
    sections.push(`--- Sheet: ${sheetName} (${rows.length} rows) ---\n${lines.join('\n')}${truncatedNote}`)
  }

  return sections.join('\n\n')
}

export async function extractKbText(buffer: Buffer, fileName: string): Promise<string> {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'))

  if (ext === '.pdf') return extractPdfText(buffer, fileName)
  if (ext === '.xlsx' || ext === '.xls') return extractXlsxText(buffer)
  if (ext === '.txt' || ext === '.md') return buffer.toString('utf-8').trim()

  throw new Error(`Unsupported file type "${ext}". Supported: .pdf, .xlsx, .xls, .txt, .md`)
}
