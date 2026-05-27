import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

/* PATCH /api/staff-access
   Body: { id?: string, enable_all?: boolean, enabled: boolean }
   Toggles access_enabled for one staff member, or all staff at once.
*/
export async function PATCH(req: NextRequest) {
  const { id, enable_all, enabled } = await req.json().catch(() => ({}))

  if (enable_all) {
    const { error } = await supabaseAdmin
      .from('staff_members')
      .update({ access_enabled: enabled })
      .not('id', 'is', null)   // update all rows
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (!id) return NextResponse.json({ error: 'id or enable_all required' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('staff_members')
    .update({ access_enabled: enabled })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
