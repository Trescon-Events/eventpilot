import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
  }

  const adminEmail    = process.env.SUPER_ADMIN_EMAIL
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD

  if (
    email.toLowerCase().trim() !== adminEmail?.toLowerCase() ||
    password !== adminPassword
  ) {
    return NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 })
  }

  // Look up their staff_member record
  const { data, error } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, office_id, department')
    .eq('email', email.toLowerCase().trim())
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Staff record not found. Contact support.' }, { status: 404 })
  }

  return NextResponse.json({ id: data.id, name: data.name })
}
