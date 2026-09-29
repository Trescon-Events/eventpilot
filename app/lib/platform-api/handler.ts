import { NextRequest, NextResponse } from 'next/server'
import { authenticatePlatformApiToken, requiresDomain, requiresEventInScope, logPlatformApiAccess, type Domain, type TokenScope } from './auth'

/* Shared request wrapper for every /api/public/v1/knowledge/* route —
   authenticate, check the route's required domain, optionally check the
   requested event is in the token's scope, run the query, log exactly
   ONE access-log row per request (whatever the outcome), respond. Every
   route file becomes a thin one-liner around this instead of repeating
   the same five-step dance eight times — see app/lib/platform-api/auth.ts
   for why logging isn't optional here (unlike Content Guidelines' own
   token type, which deliberately has no log at all).

   Error messages are deliberately generic and never include the caught
   error's own message/stack — see this session's own plan doc: nothing
   about how EventPilot is built should ever leak through this API. */
export async function handleKnowledgeRequest<T>(
  req: NextRequest,
  domain: Domain,
  opts: { eventId?: string | null; querySummary?: string | null },
  run: (scope: TokenScope) => Promise<T>
): Promise<NextResponse> {
  const auth = await authenticatePlatformApiToken(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { scope } = auth

  const domainErr = requiresDomain(scope, domain)
  if (domainErr) {
    await logPlatformApiAccess({ tokenId: scope.tokenId, domain, eventId: opts.eventId, querySummary: opts.querySummary, statusCode: 403 })
    return NextResponse.json({ error: domainErr }, { status: 403 })
  }

  if (opts.eventId) {
    const scopeErr = requiresEventInScope(scope, opts.eventId)
    if (scopeErr) {
      await logPlatformApiAccess({ tokenId: scope.tokenId, domain, eventId: opts.eventId, querySummary: opts.querySummary, statusCode: 404 })
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  }

  try {
    const result = await run(scope)
    if (result === null || result === undefined) {
      await logPlatformApiAccess({ tokenId: scope.tokenId, domain, eventId: opts.eventId, querySummary: opts.querySummary, resultCount: 0, statusCode: 404 })
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const resultCount = Array.isArray(result) ? result.length : 1
    await logPlatformApiAccess({ tokenId: scope.tokenId, domain, eventId: opts.eventId, querySummary: opts.querySummary, resultCount, statusCode: 200 })
    return NextResponse.json(result)
  } catch {
    await logPlatformApiAccess({ tokenId: scope.tokenId, domain, eventId: opts.eventId, querySummary: opts.querySummary, statusCode: 500 })
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
