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

  const { data: existing } = await supabaseAdmin
    .from('staff_members')
    .select('id, account_type, access_enabled, data_source')
    .eq('email', email)
    .maybeSingle()

  // An ex-employee marked inactive in Staff Portal (the sync leaves access_enabled=false)
  // can be converted into a vendor in place — keeps their history on the same row.
  // Anyone else (active staff, existing vendor, manual rows) still gets the 409.
  const isInactiveStaffPortalPerson =
    !!existing && existing.data_source === 'staff_portal' && existing.access_enabled === false && existing.account_type !== 'vendor'
  if (existing && !isInactiveStaffPortalPerson) {
    return NextResponse.json({ error: 'A staff member with this email already exists.' }, { status: 409 })
  }

  if (existing) {
    const { data: converted, error: convertErr } = await supabaseAdmin
      .from('staff_members')
      .update({
        name: vendorLabel,
        vendor_label: vendorLabel,
        account_type: 'vendor',
        access_roles: ['standard'],
        job_level: 'staff', // the sync preserves elevated levels; a vendor must not keep one
        data_source: 'manual', // detaches from the Staff Portal sync (run-sync also skips vendors)
        access_enabled: body?.access_enabled ?? true,
        profile_complete: true,
        is_active: true,
      })
      .eq('id', existing.id)
      .select('id, name, email, vendor_label, access_enabled, created_at')
      .single()
    if (convertErr || !converted) return NextResponse.json({ error: convertErr?.message ?? 'Failed to convert account' }, { status: 500 })

    // Drop everything left over from their staff days, then apply only the chosen grants.
    await supabaseAdmin.from('module_access').delete().eq('staff_id', existing.id)
    await supabaseAdmin.from('event_staff').delete().eq('staff_id', existing.id)
    if (moduleKeys.length > 0) {
      await supabaseAdmin.from('module_access').insert(
        moduleKeys.map(module_key => ({
          staff_id: existing.id,
          module_key,
          tier: 'user',
          granted_by: session!.sid === 'super-admin' ? null : session!.sid,
        }))
      )
    }
    return NextResponse.json({ ...converted, converted_from_staff: true }, { status: 201 })
  }

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
