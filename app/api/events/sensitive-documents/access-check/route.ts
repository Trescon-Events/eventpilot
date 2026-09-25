import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { evaluateAccessPolicy } from '@/app/lib/access/sensitive-access-policy'

/* GET /api/events/sensitive-documents/access-check
   Shows the signed-in user how the document location policy sees THEM: the
   country / IP the server received, the mode, and whether they'd be allowed.
   Used to confirm, in production, that Cloudflare's country/IP headers really
   reach the app before switching from monitor to enforce. Reveals nothing
   about the configured allow-list beyond how many rules exist. */
export async function GET(req: NextRequest) {
  if (!getSession(req)) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const p = evaluateAccessPolicy(req)
  return NextResponse.json({ mode: p.mode, allowed: p.allowed, reason: p.reason, country: p.country, ip: p.ip, seen_ip_for_logs: p.logIp, rules: p.rules }, { headers: { 'Cache-Control': 'no-store' } })
}
