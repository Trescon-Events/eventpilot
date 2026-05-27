import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

/* POST /api/data/enrich/email
   Body: { email } or { contact_ids: string[] }
   Verifies email(s) using MillionVerifier API.
   Requires MILLION_VERIFIER_API_KEY env var.
*/

const MV_KEY = process.env.MILLION_VERIFIER_API_KEY

type MvResult = {
  email:       string
  result:      string  // ok | catch_all | unknown | error | disposable | invalid
  sub_result?: string
  free:        boolean
  role:        boolean
  quality_score: number
}

async function verifySingle(email: string): Promise<MvResult | null> {
  if (!MV_KEY) return null

  const res = await fetch(
    `https://api.millionverifier.com/api/v3/?api=${MV_KEY}&email=${encodeURIComponent(email)}&timeout=10`,
    { method: 'GET' }
  )

  if (!res.ok) return null
  return res.json()
}

export async function POST(req: NextRequest) {
  if (!MV_KEY) {
    return NextResponse.json({
      error: 'MillionVerifier API key not configured. Add MILLION_VERIFIER_API_KEY to your environment variables.',
      setup_required: true,
    }, { status: 503 })
  }

  const { email, contact_id } = await req.json().catch(() => ({}))

  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  const result = await verifySingle(email)

  if (!result) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }

  const isValid   = result.result === 'ok' || result.result === 'catch_all'
  const isBounce  = result.result === 'invalid' || result.result === 'error'

  // If contact_id provided, update the contact record with verification result
  if (contact_id) {
    const { data: contact } = await supabaseAdmin
      .from('sd_contact_records')
      .select('property_values')
      .eq('id', contact_id)
      .single()

    if (contact) {
      const pv = {
        ...contact.property_values,
        email_verified:       isValid,
        email_verify_result:  result.result,
        email_quality_score:  result.quality_score,
      }

      await supabaseAdmin
        .from('sd_contact_records')
        .update({ property_values: pv, updated_at: new Date().toISOString() })
        .eq('id', contact_id)

      await supabaseAdmin.from('sd_enrichment_audit').insert({
        contact_id,
        source_tool: 'email_verifier',
        field_key:   'email_verified',
        new_value:   String(isValid),
        action:      'auto_merge',
      })
    }
  }

  return NextResponse.json({
    email,
    valid:         isValid,
    result:        result.result,
    sub_result:    result.sub_result,
    free:          result.free,
    role:          result.role,
    quality_score: result.quality_score,
    is_bounce:     isBounce,
  })
}
