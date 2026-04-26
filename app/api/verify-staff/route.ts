import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

export async function POST(req: NextRequest) {
  const { email } = await req.json()

  if (!email) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, office_id, department, profile_complete')
    .eq('email', email.toLowerCase().trim())
    .single()

  if (error || !data) {
    return NextResponse.json({ error: "We couldn't find your email. Have you joined at /join yet?" }, { status: 404 })
  }

  return NextResponse.json({ id: data.id, name: data.name, office_id: data.office_id, department: data.department, profile_complete: data.profile_complete })
}

/* PATCH — update department for a staff member (used during questionnaire onboarding) */
export async function PATCH(req: NextRequest) {
  const { staff_id, department } = await req.json()
  if (!staff_id || !department) return NextResponse.json({ error: 'staff_id and department required' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('staff_members')
    .update({ department })
    .eq('id', staff_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
