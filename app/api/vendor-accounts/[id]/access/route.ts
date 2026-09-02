/**
 * POST   /api/vendor-accounts/[id]/access   { module_key } — grant a module ('user' tier)
 * DELETE /api/vendor-accounts/[id]/access?module_key=X     — revoke a module
 *
 * Writes module_access rows keyed by the registry's own module `key` (not
 * moduleAccessKey — that generic-API-whitelist convention is a different
 * axis, see app/lib/registry/access.ts's checkAccess() vendor-account
 * branch, which checks this same table by `key` too).
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getModuleRegistry } from '@/app/lib/registry/modules'
import { getVendorAccountsSession, isPlatformAdmin } from '../../_lib/access'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getVendorAccountsSession(req)
  if (!isPlatformAdmin(session)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  const moduleKey = body?.module_key
  if (!moduleKey || !getModuleRegistry().some(m => m.key === moduleKey)) {
    return NextResponse.json({ error: 'Unknown module_key' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('module_access')
    .upsert(
      { staff_id: id, module_key: moduleKey, tier: 'user', granted_by: session!.sid === 'super-admin' ? null : session!.sid, granted_at: new Date().toISOString() },
      { onConflict: 'staff_id,module_key' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, grant: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getVendorAccountsSession(req)
  if (!isPlatformAdmin(session)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const moduleKey = req.nextUrl.searchParams.get('module_key')
  if (!moduleKey) return NextResponse.json({ error: 'module_key is required' }, { status: 400 })

  const { error } = await supabaseAdmin.from('module_access').delete().eq('staff_id', id).eq('module_key', moduleKey)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
