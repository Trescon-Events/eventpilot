/** PATCH /api/vendor-accounts/[id] — rename the agency label or enable/disable the account */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getVendorAccountsSession, isPlatformAdmin } from '../_lib/access'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getVendorAccountsSession(req)
  if (!isPlatformAdmin(session)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if ('vendor_label' in body && body.vendor_label?.trim()) {
    updates.vendor_label = body.vendor_label.trim()
    updates.name = body.vendor_label.trim()
  }
  if ('access_enabled' in body) updates.access_enabled = !!body.access_enabled

  const { data, error } = await supabaseAdmin
    .from('staff_members')
    .update(updates)
    .eq('id', id)
    .eq('account_type', 'vendor')
    .select('id, name, email, vendor_label, access_enabled, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
