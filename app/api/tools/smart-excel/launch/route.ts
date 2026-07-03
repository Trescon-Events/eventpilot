import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET /api/tools/smart-excel/launch
   SSO bridge into SmartExcel (separately-deployed TanStack Start app on
   Cloudflare Workers). Verifies the caller has tool_grants.smart_excel,
   mints a short-lived HMAC-signed token carrying their staff identity +
   role, and redirects to SmartExcel's /sso receiver.

   Token format: base64url(payload JSON) + '.' + base64url(HMAC-SHA256 of that string)
   Shared secret: SMARTEXCEL_SSO_SECRET (must match the value SmartExcel verifies with).
*/

const TOKEN_TTL_SECONDS = 120

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

export async function GET(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return NextResponse.redirect(new URL('/login', req.url))

  let session: { sid: string; adm?: boolean } | null = null
  try { session = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) } catch {}
  if (!session?.sid) return NextResponse.redirect(new URL('/login', req.url))

  const { data: staff, error } = await supabaseAdmin
    .from('staff_members')
    .select('id, name, email, tool_grants')
    .eq('id', session.sid)
    .single()

  if (error || !staff) {
    return NextResponse.json({ error: 'Staff record not found' }, { status: 404 })
  }

  const grants = (staff.tool_grants ?? {}) as Record<string, boolean>
  const isAdmin = session.adm === true || grants.smart_excel_admin === true
  const hasAccess = session.adm === true || grants.smart_excel === true || isAdmin

  if (!hasAccess) {
    return NextResponse.json({ error: 'You do not have access to SmartExcel. Ask an admin to grant it from Staff → Access & Tools.' }, { status: 403 })
  }

  const smartExcelUrl = process.env.SMARTEXCEL_URL
  const secret = process.env.SMARTEXCEL_SSO_SECRET
  if (!smartExcelUrl || !secret) {
    return NextResponse.json({ error: 'SmartExcel is not configured yet (SMARTEXCEL_URL / SMARTEXCEL_SSO_SECRET missing).' }, { status: 503 })
  }

  const payload = {
    sid: staff.id,
    email: staff.email,
    name: staff.name,
    role: isAdmin ? 'admin' : 'standard',
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  }
  const payloadB64 = b64url(JSON.stringify(payload))
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest()
  const token = `${payloadB64}.${b64url(sig)}`

  // NOTE: new URL('/sso', smartExcelUrl) would silently drop any path prefix
  // on smartExcelUrl (e.g. '/smartexcel') since a leading-slash path is
  // resolved against the origin, not the base URL's own path. Concatenate instead.
  const dest = new URL(smartExcelUrl.replace(/\/$/, '') + '/sso')
  dest.searchParams.set('token', token)
  return NextResponse.redirect(dest.toString())
}
