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

  if (data.profile_complete) {
    return NextResponse.json({ error: `You've already submitted your work profile, ${data.name.split(' ')[0]}. Thank you!` }, { status: 409 })
  }

  return NextResponse.json({ id: data.id, name: data.name, office_id: data.office_id, department: data.department })
}
