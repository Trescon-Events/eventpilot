import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

/*
  POST /api/import/parse
  Body: { csv: string }   — raw CSV text

  1. Extracts headers + up to 10 sample rows
  2. Sends to Gemini with current schema definition
  3. Gemini returns:
     - column_mapping: maps each source column → target field (or "new" or "ignore")
     - new_columns: suggested new DB columns with type + description
     - rows: all parsed+normalised rows ready for preview
     - warnings: per-row issues (missing email, unknown dept, etc.)
*/

const KNOWN_FIELDS = [
  { field: 'name',             type: 'text',    note: 'Full name, required' },
  { field: 'email',            type: 'text',    note: 'Work email, required, must be unique' },
  { field: 'office_id',        type: 'text',    note: 'One of: dubai, bangalore, mangalore, manipal' },
  { field: 'department',       type: 'text',    note: 'One of: Events, Sales & Sponsorship, Marketing, Finance, Operations, IT, HR & Recruitment, Content & Design, Government Relations, DemandifyMedia, Leadership, Other' },
  { field: 'role',             type: 'text',    note: 'Job title as a string' },
  { field: 'job_level',        type: 'text',    note: 'One of: staff, team_lead, dept_head, office_head, super_admin — infer from title if not explicit' },
  { field: 'manager_name',     type: 'text',    note: 'Manager full name — used to resolve manager_id later' },
  { field: 'team',             type: 'text',    note: 'Sub-team name if applicable, else null' },
]

export async function POST(req: NextRequest) {
  const { csv } = await req.json().catch(() => ({}))
  if (!csv || typeof csv !== 'string') {
    return NextResponse.json({ error: 'csv string required' }, { status: 400 })
  }

  /* Split into lines, extract headers + sample */
  const lines   = csv.split('\n').map(l => l.trim()).filter(Boolean)
  const headers = parseCSVLine(lines[0])
  const sample  = lines.slice(1, 11).map(l => parseCSVLine(l))
  const allRows = lines.slice(1).map(l => parseCSVLine(l))

  const headerList    = headers.join(', ')
  const samplePreview = sample.map((row, i) =>
    `Row ${i + 1}: ${headers.map((h, j) => `${h}="${row[j] ?? ''}"`).join(' | ')}`
  ).join('\n')

  const knownFieldDefs = KNOWN_FIELDS.map(f => `- ${f.field} (${f.type}): ${f.note}`).join('\n')

  const prompt = `You are a data import assistant for Event Pilot, a staff learning platform.

CURRENT DATABASE SCHEMA — staff_members table has these fields:
${knownFieldDefs}

SOURCE FILE HEADERS:
${headerList}

SAMPLE DATA (first ${sample.length} rows):
${samplePreview}

YOUR TASKS:

1. COLUMN MAPPING: For each source header, decide:
   - "map": maps to an existing field → specify which field
   - "new": valuable data not in schema → suggest a snake_case column name, SQL type (text/integer/date/boolean), and a description
   - "ignore": not worth keeping (row numbers, internal HR notes, checkboxes, etc.)

2. ROW PARSING: Parse ALL ${allRows.length} data rows using your mapping. For each row:
   - Normalise office: dubai→dubai, Bangalore/BLR/bangalore→bangalore, Mangalore/MLR→mangalore, Manipal/MAHE→manipal
   - Normalise department to one of the exact known values (best match)
   - Infer job_level from the role title if not explicit: 
     VP/Director/Head of → dept_head or office_head
     Manager/Lead/Senior Manager → team_lead
     Executive/Associate/Coordinator/Analyst/Engineer → staff
   - If email is missing, set warning
   - If name is missing, set warning

3. NEW COLUMNS: For any "new" columns, list them separately so the admin can approve before adding to DB.

Return ONLY valid JSON in this exact format — no markdown, no explanation:
{
  "column_mapping": [
    { "source": "Original Header", "action": "map|new|ignore", "target_field": "field_name_or_null", "new_col_name": "snake_case_or_null", "new_col_type": "text|integer|date|boolean|null", "new_col_description": "what this stores" }
  ],
  "new_columns": [
    { "col_name": "snake_case_name", "col_type": "text", "description": "what it stores", "sample_values": ["val1", "val2"] }
  ],
  "rows": [
    { "name": "", "email": "", "office_id": "", "department": "", "role": "", "job_level": "", "manager_name": "", "team": null, "extra": { "col_name": "value" }, "warnings": [] }
  ],
  "summary": { "total": 0, "clean": 0, "warnings": 0, "new_columns_found": 0 }
}`

  try {
    const model  = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent(prompt)
    const raw    = result.response.text().trim()

    const clean = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()

    let parsed: object
    try {
      parsed = JSON.parse(clean)
    } catch {
      console.error('Import parse JSON error:', clean.slice(0, 300))
      return NextResponse.json({ error: 'AI response could not be parsed' }, { status: 500 })
    }

    return NextResponse.json(parsed)
  } catch (err) {
    console.error('Import parse Gemini error:', err)
    const { isQuotaError, QUOTA_ERROR_MESSAGE } = await import('@/app/lib/gemini-error')
    if (isQuotaError(err)) return NextResponse.json({ error: QUOTA_ERROR_MESSAGE }, { status: 429 })
    return NextResponse.json({ error: 'AI parsing failed' }, { status: 500 })
  }
}

/* Minimal CSV line parser — handles quoted fields with commas */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}
