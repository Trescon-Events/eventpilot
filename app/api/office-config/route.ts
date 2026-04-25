import { NextRequest, NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/app/lib/supabase'

// GET — public read, used by landing page
export async function GET() {
  const { data, error } = await supabase
    .from('office_config')
    .select('office_id, total_staff')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — admin only, updates totals
// Body: { admin_code: string, updates: { office_id: string, total_staff: number }[] }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { admin_code, updates } = body

  if (admin_code !== (process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'taos2026')) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
  }

  for (const u of updates) {
    if (!u.office_id || typeof u.total_staff !== 'number' || u.total_staff < 0) {
      return NextResponse.json({ error: 'Invalid update data' }, { status: 400 })
    }
  }

  const rows = updates.map((u: { office_id: string; total_staff: number }) => ({
    office_id:   u.office_id,
    total_staff: u.total_staff,
    updated_at:  new Date().toISOString(),
  }))

  const { error } = await supabaseAdmin
    .from('office_config')
    .upsert(rows, { onConflict: 'office_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
