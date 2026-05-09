import { supabaseAdmin } from '@/app/lib/supabase'
import { NextResponse } from 'next/server'

/*
  GET /api/platform-status
  Returns whether real staff data has been imported.

  Detection logic: if any @demo.tai accounts exist, still in demo mode.
  Once all demo accounts are removed and only real staff remain, is_demo = false.
*/

export async function GET() {
  const { count, error } = await supabaseAdmin
    .from('staff_members')
    .select('*', { count: 'exact', head: true })
    .ilike('email', '%@demo.tai')

  if (error) {
    return NextResponse.json({ is_demo: false })
  }

  return NextResponse.json({ is_demo: (count ?? 0) > 0 })
}
