import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

/* POST — submit platform feedback */
export async function POST(req: NextRequest) {
  const { staff_id, name, department, message } = await req.json()
  if (!message?.trim()) return NextResponse.json({ error: 'Message is required.' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('platform_feedback')
    .insert({ staff_id: staff_id || null, name: name || 'Anonymous', department: department || null, message: message.trim() })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

/* GET — fetch all feedback (admin only) */
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('platform_feedback')
    .select('id, name, department, message, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
