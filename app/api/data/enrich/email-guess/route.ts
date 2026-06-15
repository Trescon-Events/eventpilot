import { NextRequest, NextResponse } from 'next/server'

/* POST /api/data/enrich/email-guess
   Body: { first_name, last_name, company?, domain? }
   Uses Apollo people/match to guess and verify email addresses.
*/

const APOLLO_KEY = process.env.APOLLO_API_KEY

export async function POST(req: NextRequest) {
  const { first_name, last_name, company, domain } = await req.json().catch(() => ({}))

  if (!first_name || !last_name) {
    return NextResponse.json({ error: 'first_name and last_name are required' }, { status: 400 })
  }

  if (!APOLLO_KEY) {
    return NextResponse.json({ setup_required: true })
  }

  const body: Record<string, unknown> = {
    api_key:                 APOLLO_KEY,
    first_name:              first_name.trim(),
    last_name:               last_name.trim(),
    reveal_personal_emails:  false,
  }

  if (domain?.trim())  body.domain            = domain.trim()
  if (company?.trim()) body.organization_name  = company.trim()

  const apolloRes = await fetch('https://api.apollo.io/v1/people/match', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })

  if (!apolloRes.ok) {
    const err = await apolloRes.text()
    if (apolloRes.status === 401) return NextResponse.json({ setup_required: true })
    return NextResponse.json({ error: `Apollo error: ${err.slice(0, 200)}` }, { status: 502 })
  }

  const data   = await apolloRes.json()
  const person = data?.person

  if (!person) {
    return NextResponse.json({ results: [] })
  }

  const results: {
    email: string
    confidence: string
    pattern: string
    verified: boolean
    quality_score?: number
  }[] = []

  // Primary matched email
  if (person.email) {
    const emailStatus = person.email_status ?? 'unknown'
    const confidence  = emailStatus === 'verified' ? 'high'
                      : emailStatus === 'likely'   ? 'high'
                      : emailStatus === 'guess'    ? 'medium'
                      : 'low'

    const detected  = detectPattern(first_name, last_name, person.email)

    results.push({
      email:         person.email,
      confidence,
      pattern:       detected,
      verified:      emailStatus === 'verified',
      quality_score: person.email_quality_score ?? undefined,
    })
  }

  // Extra guesses from email_addresses array (if returned)
  if (Array.isArray(person.email_addresses)) {
    for (const ea of person.email_addresses) {
      if (!ea.email || ea.email === person.email) continue
      const confidence = ea.email_status === 'verified' ? 'high'
                       : ea.email_status === 'likely'   ? 'high'
                       : ea.email_status === 'guess'    ? 'medium'
                       : 'low'
      results.push({
        email:     ea.email,
        confidence,
        pattern:   detectPattern(first_name, last_name, ea.email),
        verified:  ea.email_status === 'verified',
      })
    }
  }

  // If Apollo returned nothing, synthesise common patterns from domain
  if (results.length === 0 && (domain?.trim() || person.organization?.primary_domain)) {
    const d = domain?.trim() || person.organization?.primary_domain
    if (d) {
      const f = first_name.trim().toLowerCase().replace(/[^a-z]/g, '')
      const l = last_name.trim().toLowerCase().replace(/[^a-z]/g, '')
      const patterns = [
        { email: `${f}.${l}@${d}`,  pattern: 'first.last', confidence: 'medium' as const },
        { email: `${f[0]}${l}@${d}`, pattern: 'flast',     confidence: 'low'    as const },
        { email: `${f}@${d}`,        pattern: 'first',      confidence: 'low'    as const },
      ]
      patterns.forEach(p => results.push({ ...p, verified: false }))
    }
  }

  return NextResponse.json({ results })
}

function detectPattern(first: string, last: string, email: string): string {
  const local = email.split('@')[0]?.toLowerCase() ?? ''
  const f     = first.trim().toLowerCase().replace(/[^a-z]/g, '')
  const l     = last.trim().toLowerCase().replace(/[^a-z]/g, '')

  if (local === `${f}.${l}`)  return 'first.last'
  if (local === `${f}_${l}`)  return 'first_last'
  if (local === `${f[0]}.${l}`) return 'f.last'
  if (local === `${f[0]}${l}`)  return 'flast'
  if (local === f)              return 'first'
  if (local === l)              return 'last'
  if (local === `${f}${l[0]}`)  return 'firstl'
  return 'custom'
}
