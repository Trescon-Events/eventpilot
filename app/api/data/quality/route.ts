import { smartdataAdmin } from '@/app/lib/supabase'
import { NextResponse } from 'next/server'

/* GET /api/data/quality — data quality stats across contacts */

export async function GET() {
  // Pull all contacts (property_values only — we don't need full records)
  const { data: contacts, error } = await smartdataAdmin
    .from('sd_contact_records')
    .select('property_values, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!contacts || contacts.length === 0) {
    return NextResponse.json({ total: 0, fields: [], duplicates: 0, verified_emails: 0, enrichment_rate: 0 })
  }

  const total = contacts.length

  // Field completeness
  const FIELDS = [
    { key: 'email',        label: 'Email'          },
    { key: 'phone',        label: 'Phone'          },
    { key: 'title',        label: 'Job Title'      },
    { key: 'company',      label: 'Company'        },
    { key: 'linkedinUrl',  label: 'LinkedIn URL'   },
    { key: 'country',      label: 'Country'        },
    { key: 'firstName',    label: 'First Name'     },
    { key: 'lastName',     label: 'Last Name'      },
  ]

  const fields = FIELDS.map(f => {
    const filled = contacts.filter(c => {
      const pv = c.property_values ?? {}
      const v  = pv[f.key] ?? pv[f.key.toLowerCase()] ?? pv[f.key.replace(/([A-Z])/g, '_$1').toLowerCase()]
      return v && String(v).trim().length > 0
    }).length
    return { key: f.key, label: f.label, filled, total, pct: Math.round((filled / total) * 100) }
  })

  // Verified emails — look in property_values for emailStatus = 'ok' (set by MillionVerifier)
  const verified_emails = contacts.filter(c => {
    const pv = c.property_values as Record<string, string>
    return pv?.emailStatus === 'ok' || pv?.emailVerified === 'true'
  }).length

  // Emails present
  const with_email = fields.find(f => f.key === 'email')?.filled ?? 0

  // Duplicate detection: contacts sharing the same email
  const emailCounts: Record<string, number> = {}
  for (const c of contacts) {
    const email = (c.property_values as Record<string, string>)?.email?.trim().toLowerCase()
    if (email) emailCounts[email] = (emailCounts[email] ?? 0) + 1
  }
  const duplicates = Object.values(emailCounts).filter(n => n > 1).reduce((sum, n) => sum + (n - 1), 0)

  // Enrichment rate: contacts with 5+ key fields filled
  const KEY_FIELDS = ['email', 'phone', 'title', 'company', 'linkedinUrl']
  const enrichment_rate = Math.round(
    (contacts.filter(c => {
      const pv = c.property_values ?? {}
      return KEY_FIELDS.filter(k => (pv as Record<string, string>)[k]?.trim()).length >= 3
    }).length / total) * 100
  )

  // Monthly additions (last 6 months)
  const monthly: Record<string, number> = {}
  for (const c of contacts) {
    const month = c.created_at?.slice(0, 7)
    if (month) monthly[month] = (monthly[month] ?? 0) + 1
  }
  const monthly_trend = Object.entries(monthly)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6)
    .map(([month, count]) => ({ month, count }))

  return NextResponse.json({
    total,
    with_email,
    verified_emails,
    duplicates,
    enrichment_rate,
    fields,
    monthly_trend,
  })
}
