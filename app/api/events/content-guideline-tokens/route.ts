import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { generateGuidelineToken } from '@/app/lib/content/guideline-tokens'

/* GET  /api/events/content-guideline-tokens?event_id=X   — list (never plaintext)
   POST /api/events/content-guideline-tokens?event_id=X   — create, body { label? }

   Content Guidelines API (2026-09-16) — token management for
   GET /api/public/v1/content-guidelines. Gated on sae.integrations.manage,
   same permission as the rest of the event Integrations page (KonfHub
   settings, HubSpot, Postiz) this would normally live inside; the actual
   "generate/label/show-once/revoke" card on that page is deferred (see
   the content-guidelines route's own comment for why), so this is the
   only way to issue a token until that UI lands — call it directly, the
   plaintext token is returned exactly once, in this response. */

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('content_guideline_tokens')
    .select('id, label, created_at, last_used_at, revoked_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ tokens: data })
}

export async function POST(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, eventId, 'sae.integrations.manage'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as { label?: string }
  const { plaintext, hash } = generateGuidelineToken()

  const { data, error } = await supabaseAdmin
    .from('content_guideline_tokens')
    .insert({ event_id: eventId, token_hash: hash, label: body.label ?? null, created_by: session?.sid ?? null })
    .select('id, label, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ...data, token: plaintext })
}
