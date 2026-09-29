import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { requirePlatformAdmin } from '@/app/lib/platform-api/admin-access'
import { generatePlatformApiToken, DOMAINS, type Domain } from '@/app/lib/platform-api/auth'

/* GET  /api/admin/platform-api-tokens — list every token (never plaintext,
   token_hash is never selected).
   POST /api/admin/platform-api-tokens — create one.
     Body: { label: string, domains: Domain[], event_scope: 'all'|'specific', event_ids?: string[] }
   Both platform-admin only — see admin-access.ts's own comment for why
   there's no delegated permission path here. */

export async function GET(req: NextRequest) {
  const denied = requirePlatformAdmin(req)
  if (denied) return denied

  const { data, error } = await supabaseAdmin
    .from('platform_api_tokens')
    .select('id, label, domains, event_scope, event_ids, created_at, last_used_at, revoked_at, created_by, staff_members!platform_api_tokens_created_by_fkey(name)')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

type CreateBody = { label?: string; domains?: string[]; event_scope?: string; event_ids?: string[] }

export async function POST(req: NextRequest) {
  const denied = requirePlatformAdmin(req)
  if (denied) return denied
  const session = getSession(req)

  const body = await req.json().catch(() => null) as CreateBody | null
  const label = body?.label?.trim()
  if (!label) return NextResponse.json({ error: 'A label is required.' }, { status: 400 })

  const domains = (body?.domains ?? []).filter((d): d is Domain => DOMAINS.includes(d as Domain))
  if (domains.length === 0) return NextResponse.json({ error: 'Pick at least one data domain.' }, { status: 400 })

  const eventScope = body?.event_scope === 'specific' ? 'specific' : 'all'
  const eventIds = eventScope === 'specific' ? (body?.event_ids ?? []) : null
  if (eventScope === 'specific' && (!eventIds || eventIds.length === 0)) {
    return NextResponse.json({ error: 'Pick at least one event, or choose "All events".' }, { status: 400 })
  }

  const { plaintext, hash } = generatePlatformApiToken()
  const { data, error } = await supabaseAdmin
    .from('platform_api_tokens')
    .insert({ label, token_hash: hash, domains, event_scope: eventScope, event_ids: eventIds, created_by: session?.sid ?? null })
    .select('id, label, domains, event_scope, event_ids, created_at')
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not create token' }, { status: 500 })

  // The ONLY place the plaintext token is ever returned — never again
  // after this response, same "shown once" contract as
  // guideline-tokens.ts's own token type.
  return NextResponse.json({ ...data, token: plaintext }, { status: 201 })
}
