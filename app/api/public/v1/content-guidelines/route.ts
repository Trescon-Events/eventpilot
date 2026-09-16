import { NextRequest, NextResponse } from 'next/server'
import { authenticateGuidelineToken } from '@/app/lib/content/guideline-tokens'
import { getEventGuidelines, computeGuidelinesETag, renderGuidelinesMarkdown, renderGuidelinesJson } from '@/app/lib/content/guidelines-api'
import type { CompiledSection } from '@/app/lib/content/compile-reference'

/* GET /api/public/v1/content-guidelines
   Authorization: Bearer ep_cg_<token>
   ?format=markdown|json (default markdown)
   ?include=style_guide,messaging,production_pack (default: all three)

   EventPilot_Content_Guidelines_API_Spec.md, 13 Sep 2026 — one read
   endpoint so an external agent (Antigravity, working in the AI InfraNext
   site repo) can fetch an event's approved messaging/style-guide guidance
   before generating content, without an EventPilot session. Public under
   the /api/public prefix middleware.ts already exempts; auth is entirely
   the bearer token (event-scoped by construction — see
   guideline-tokens.ts), never a query param, so a caller can't request
   another event's guidelines by changing an id.

   Versioned at /v1/ from the start per the spec — there will be more
   consumers than one site eventually.

   Token creation (list/create/revoke) is deliberately NOT built in this
   pass — the spec's Integrations-page UI for it collides with unrelated
   in-progress work on that exact page from a concurrent session; a token
   is created via POST /api/events/content-guideline-tokens in the
   meantime (session-gated, sae.integrations.manage). */

const ALL_ROLES: CompiledSection['role'][] = ['style_guide', 'messaging', 'production_pack']

export async function GET(req: NextRequest) {
  const auth = await authenticateGuidelineToken(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const format = req.nextUrl.searchParams.get('format') === 'json' ? 'json' : 'markdown'
  const includeParam = req.nextUrl.searchParams.get('include')
  const includeRoles = includeParam
    ? ALL_ROLES.filter(r => includeParam.split(',').map(s => s.trim()).includes(r))
    : ALL_ROLES

  const guidelines = await getEventGuidelines(auth.eventId)
  if (!guidelines) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const etag = computeGuidelinesETag(guidelines)
  if (req.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag, 'Cache-Control': 'private, max-age=300' } })
  }

  const headers = { ETag: etag, 'Cache-Control': 'private, max-age=300' }

  if (format === 'json') {
    return NextResponse.json(renderGuidelinesJson(guidelines, includeRoles), { headers })
  }

  return new NextResponse(renderGuidelinesMarkdown(guidelines, includeRoles), {
    headers: { ...headers, 'Content-Type': 'text/markdown; charset=utf-8' },
  })
}
