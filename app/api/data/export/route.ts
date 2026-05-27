import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

/* POST /api/data/export
   Body: {
     type: 'contacts' | 'companies',
     ids?: string[],         // specific IDs, or
     filter_target?: string, // vendorTarget | delegateTarget | etc.
     filter_event?: string,  // event name within target
     include_fields?: string[] // which property_values fields to include
   }
   Returns: CSV file
*/

function toCSV(rows: Record<string, string>[], headers: string[]): string {
  const escape = (v: unknown): string => {
    if (v == null) return ''
    const s = Array.isArray(v) ? v.join('; ') : String(v)
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }

  const lines = [
    headers.join(','),
    ...rows.map(row => headers.map(h => escape(row[h])).join(',')),
  ]
  return lines.join('\n')
}

const DEFAULT_CONTACT_FIELDS = [
  'firstName', 'lastName', 'email', 'title', 'companyName',
  'phoneNumber1', 'phoneNumber2', 'contactCountry', 'contactCity',
  'seniority', 'personLinkedinUrl', 'contactL2',
  'vendorTarget', 'delegateTarget', 'speakerTarget', 'partnershipTarget',
]

const DEFAULT_COMPANY_FIELDS = [
  'companyName', 'website', 'companyCountry', 'companyCity',
  'industry', 'employees', 'hqCountry', 'l2Categories',
]

export async function POST(req: NextRequest) {
  const {
    type = 'contacts',
    ids,
    filter_target,
    filter_event,
    include_fields,
  } = await req.json().catch(() => ({}))

  const fields: string[] = include_fields?.length
    ? include_fields
    : type === 'companies' ? DEFAULT_COMPANY_FIELDS : DEFAULT_CONTACT_FIELDS

  let rows: Record<string, string>[] = []

  if (type === 'contacts') {
    let query = supabaseAdmin
      .from('sd_contact_records')
      .select('id, linkedin_url, property_values, source_tool, last_enriched_at, created_at')
      .order('created_at', { ascending: false })
      .limit(10000)

    if (ids?.length) query = query.in('id', ids)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    rows = (data ?? [])
      .filter(c => {
        if (!filter_target || !filter_event) return true
        const arr = c.property_values?.[filter_target]
        return Array.isArray(arr) && arr.includes(filter_event)
      })
      .map(c => {
        const row: Record<string, string> = { id: c.id, linkedin_url: c.linkedin_url ?? '' }
        for (const f of fields) {
          const v = c.property_values?.[f]
          row[f] = Array.isArray(v) ? v.join('; ') : (v != null ? String(v) : '')
        }
        row.source_tool      = c.source_tool ?? ''
        row.last_enriched_at = c.last_enriched_at ? new Date(c.last_enriched_at).toLocaleDateString() : ''
        row.created_at       = new Date(c.created_at).toLocaleDateString()
        return row
      })
  } else {
    let query = supabaseAdmin
      .from('sd_company_records')
      .select('id, domain, name, website, property_values, source_tool, created_at')
      .order('created_at', { ascending: false })
      .limit(10000)

    if (ids?.length) query = query.in('id', ids)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    rows = (data ?? []).map(c => {
      const row: Record<string, string> = { id: c.id, domain: c.domain ?? '', name: c.name }
      for (const f of fields) {
        const v = c.property_values?.[f]
        row[f] = Array.isArray(v) ? v.join('; ') : (v != null ? String(v) : '')
      }
      row.source_tool = c.source_tool ?? ''
      row.created_at  = new Date(c.created_at).toLocaleDateString()
      return row
    })
  }

  const headers = type === 'contacts'
    ? ['id', ...fields, 'linkedin_url', 'source_tool', 'last_enriched_at', 'created_at']
    : ['id', 'name', 'domain', ...fields, 'source_tool', 'created_at']

  const csv = toCSV(rows, headers)
  const filename = `${type}-${new Date().toISOString().split('T')[0]}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type':        'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
