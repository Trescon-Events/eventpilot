import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireVendor } from '@/app/lib/ops/vendor-auth/guard'
import { logOpsAccess } from '@/app/lib/ops/audit'
import { VENDOR_TERMS_VERSION, VENDOR_TERMS_TITLE, VENDOR_TERMS_INTRO, VENDOR_TERMS_ITEMS, VENDOR_TERMS_CHECKBOX } from '@/app/lib/ops/vendor-auth/terms'

/* GET  /vendor-portal/api/terms — the current data-handling terms and whether this user has accepted them.
   POST /vendor-portal/api/terms — records this user's acceptance of the CURRENT version (time, IP).
   The only authenticated vendor routes that work before the terms are accepted. */
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const auth = await requireVendor(req, { skipTerms: true })
  if ('error' in auth) return auth.error
  return NextResponse.json({
    version: VENDOR_TERMS_VERSION, title: VENDOR_TERMS_TITLE, intro: VENDOR_TERMS_INTRO,
    items: VENDOR_TERMS_ITEMS, checkbox: VENDOR_TERMS_CHECKBOX, accepted: auth.session.termsAccepted,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const auth = await requireVendor(req, { stateChanging: true, skipTerms: true })
  if ('error' in auth) return auth.error
  const { session, ip } = auth
  const body = await req.json().catch(() => null) as { accept?: boolean; version?: string } | null
  if (body?.accept !== true || body.version !== VENDOR_TERMS_VERSION) {
    return NextResponse.json({ error: 'Please tick the box to accept the terms.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }
  const { error } = await supabaseAdmin.from('ops_vendor_terms_acceptances')
    .upsert({ vendor_user_id: session.userId, terms_version: VENDOR_TERMS_VERSION, ip, accepted_at: new Date().toISOString() }, { onConflict: 'vendor_user_id,terms_version', ignoreDuplicates: true })
  if (error) return NextResponse.json({ error: 'That could not be saved. Please try again.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  await logOpsAccess({ eventId: null, actorType: 'vendor', actorId: session.userId, action: 'vendor_terms_accepted', targetType: 'vendor_terms', targetId: VENDOR_TERMS_VERSION, meta: { vendor: session.vendorName }, ip })
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
