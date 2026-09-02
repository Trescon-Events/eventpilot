/**
 * GET  /api/vendor-accounts  — list every vendor account + which modules it can see
 * POST /api/vendor-accounts  — create a vendor account (staff_members row + initial module grants)
 *
 * Platform-admin-only (Madhu/Durga) — see app/api/vendor-accounts/_lib/access.ts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getModuleRegistry } from '@/app/lib/registry/modules'
import { getVendorAccountsSession, isPlatformAdmin } from './_lib/access'

export async function GET(req: NextRequest) {
  const session = getVendorAccountsSession(req)
  if (!isPlatformAdmin(session)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: vendors, error } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, email, vendor_label, access_enabled, created_at')
    .eq('account_type', 'vendor')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!vendors?.length) return NextResponse.json([])

  const { data: grants } = await supabaseAdmin
    .from('module_access')
    .select('staff_id, module_key, tier')
    .in('staff_id', vendors.map(v => v.id))

  const labelByKey = new Map(getModuleRegistry().map(m => [m.key, m.label]))
  const grantsByVendor = new Map<string, { module_key: string; label: string; tier: string }[]>()
  for (const g of grants ?? []) {
    const list = grantsByVendor.get(g.staff_id) ?? []
    list.push({ module_key: g.module_key, label: labelByKey.get(g.module_key) ?? g.module_key, tier: g.tier })
    grantsByVendor.set(g.staff_id, list)
  }

  return NextResponse.json(vendors.map(v => ({ ...v, modules: grantsByVendor.get(v.id) ?? [] })))
}

export async function POST(req: NextRequest) {
  const session = getVendorAccountsSession(req)
  if (!isPlatformAdmin(session)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const email = body?.email?.trim().toLowerCase()
  const vendorLabel = body?.vendor_label?.trim()
  const moduleKeys: string[] = Array.isArray(body?.module_keys) ? body.module_keys : []

  if (!email || !email.includes('@')) return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  if (!vendorLabel) return NextResponse.json({ error: 'vendor_label (agency name) is required' }, { status: 400 })

  const validKeys = new Set(getModuleRegistry().map(m => m.key))
  const invalidKeys = moduleKeys.filter(k => !validKeys.has(k))
  if (invalidKeys.length > 0) return NextResponse.json({ error: `Unknown module key(s): ${invalidKeys.join(', ')}` }, { status: 400 })

  const { data: existing } = await supabaseAdmin.from('staff_members').select('id').eq('email', email).maybeSingle()
  if (existing) return NextResponse.json({ error: 'A staff member with this email already exists.' }, { status: 409 })

  const { data: vendor, error: insertErr } = await supabaseAdmin
    .from('staff_members')
    .insert({
      name: vendorLabel,
      email,
      vendor_label: vendorLabel,
      account_type: 'vendor',
      access_roles: ['standard'],
      job_level: 'staff',
      data_source: 'manual',
      access_enabled: body?.access_enabled ?? true,
      // Skip the AIRS/profile-setup redirect on first SSO login (see
      // app/api/auth/callback/route.ts) — that flow is for onboarding
      // internal staff, not relevant to an external agency login.
      profile_complete: true,
      is_active: true,
    })
    .select('id, name, email, vendor_label, access_enabled, created_at')
    .single()

  if (insertErr || !vendor) return NextResponse.json({ error: insertErr?.message ?? 'Failed to create vendor account' }, { status: 500 })

  if (moduleKeys.length > 0) {
    await supabaseAdmin.from('module_access').insert(
      moduleKeys.map(module_key => ({
        staff_id: vendor.id,
        module_key,
        tier: 'user',
        granted_by: session!.sid === 'super-admin' ? null : session!.sid,
      }))
    )
  }

  return NextResponse.json(vendor, { status: 201 })
}
