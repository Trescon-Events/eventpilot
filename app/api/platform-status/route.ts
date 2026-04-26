import { supabaseAdmin } from '@/app/lib/supabase'
import { NextResponse } from 'next/server'

/*
  GET /api/platform-status
  Returns whether real staff data has been imported.

  Detection logic: seed/demo data never sets password_hash.
  A real bulk import always bcrypt-hashes every staff member's password.
  So password_hash IS NOT NULL = real data is in the system.
*/

export async function GET() {
  const { count, error } = await supabaseAdmin
    .from('staff_members')
    .select('*', { count: 'exact', head: true })
    .not('password_hash', 'is', null)

  if (error) {
    return NextResponse.json({ is_demo: true })
  }

  // Fewer than 5 accounts with password_hash = still demo/test accounts only, not a real import
  return NextResponse.json({ is_demo: (count ?? 0) < 5 })
}
