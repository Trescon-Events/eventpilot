import { NextResponse } from 'next/server'
import { getServerSession } from '@/app/lib/registry/access'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET — the signed-in staff member's own work email, for the "Cc me" button on the bulk-send dialogs. Only ever returns the caller's own address. */
export async function GET() {
  const session = await getServerSession()
  if (!session?.sid || session.sid === 'super-admin') return NextResponse.json({ email: null })
  const { data } = await supabaseAdmin.from('staff_members').select('email').eq('id', session.sid).maybeSingle()
  return NextResponse.json({ email: (data?.email as string | null) ?? null })
}
