/**
 * POST /api/access-request
 *
 * Called from /no-access when a staff member clicks "Request access" for a
 * tool they don't currently have permission to use. Sends an email to Durga
 * so the tool_grant can be enabled from the admin panel.
 *
 * Body: { tool: string, from?: string }
 * Auth: session cookie required (must be logged in — anonymous users can't
 * request tool access, they need to log in first).
 *
 * De-dup: same (staff, tool) pair only fires one email per 24h using an
 * in-process cache. Server restart resets the cache — worst case is an
 * extra email, never fewer.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { sendToolAccessRequest } from '@/app/lib/email'

// Human-readable label per tool key. Keep in sync with the toolkit + gate keys.
const TOOL_LABEL: Record<string, string> = {
  bespoke:         'Bespoke Tracker',
  website_builder: 'Website Builder',
  brand_studio:    'Brand Studio',
  intelligence:    'Market Intelligence',
  smart_data:      'Smart Data',
  smart_excel:     'Smart Excel',
  admin:           'Admin Panel',
  finance:         'Finance Portal',
  hr:              'HR Portal',
}

// In-process de-dup — { key: timestamp }
const recentRequests = new Map<string, number>()
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000

export async function POST(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  let session: { sid?: string; adm?: boolean } | null = null
  try { session = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) } catch {}
  if (!session?.sid) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const toolKey = String(body?.tool ?? '').trim()
  const fromPath = body?.from ? String(body.from).slice(0, 200) : null
  if (!toolKey) return NextResponse.json({ error: 'tool required' }, { status: 400 })

  const label = TOOL_LABEL[toolKey] ?? toolKey

  // De-dup
  const key = `${session.sid}::${toolKey}`
  const last = recentRequests.get(key)
  if (last && Date.now() - last < DEDUPE_WINDOW_MS) {
    return NextResponse.json({ ok: true, deduped: true })
  }

  // Look up requester
  const { data: staff } = await supabaseAdmin
    .from('staff_members')
    .select('full_name, email')
    .eq('id', session.sid)
    .single()

  if (!staff?.email) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })

  try {
    await sendToolAccessRequest({
      staffName:  staff.full_name || staff.email,
      staffEmail: staff.email,
      tool:       label,
      fromPath,
    })
    recentRequests.set(key, Date.now())
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('access-request email failed', err)
    return NextResponse.json({ error: 'Email send failed' }, { status: 500 })
  }
}
