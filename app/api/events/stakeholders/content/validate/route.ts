import { NextRequest, NextResponse } from 'next/server'
import { resolveEffectiveRulesForOwner } from '@/app/lib/content/resolve-validation-rules'
import { validateText } from '@/app/lib/content/validate'
import { authenticateGuidelineToken } from '@/app/lib/content/guideline-tokens'

/* POST /api/events/stakeholders/content/validate
   Body: { event_id, text, owner_type? }

   Reference Documents spec, Stage 3 (2026-09-10) — standalone "check this
   copy" endpoint, so anyone (Fouzan, Khalifa, a producer) can paste
   hand-written copy and check it against an event's (or, since the
   umbrella/event separation, 2026-09-11, an umbrella's own) effective
   validation rule set without generating an announcement first. Same
   deterministic check SAE generation runs automatically — see
   announcements/generate/route.ts — just callable directly. owner_type
   defaults to 'event' so the existing per-event Content Check page needs
   no changes; only the umbrella workspace page passes 'umbrella'.

   Content Guidelines API (2026-09-16): also callable externally with
   `Authorization: Bearer ep_cg_<token>` and no EventPilot session — see
   app/lib/content/guideline-tokens.ts and the sibling
   /api/public/v1/content-guidelines route. A token is issued per-event, so
   when a bearer header is present it SUPERSEDES any event_id in the body
   (an external caller can't validate against a different event than the
   one its token was scoped to) and owner_type is forced to 'event' — a
   content_guideline_token is never issued per-umbrella. Internal,
   cookie-based callers (Content Check page, umbrella workspace page) are
   unaffected — no Authorization header, identical body-driven behavior as
   before this change. middleware.ts exempts this exact path ONLY when a
   Bearer header is present, so a real session is still required for the
   original body-only calling convention. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const authHeader = req.headers.get('authorization')

  let eventId: string | undefined
  let ownerType: 'event' | 'umbrella' = body?.owner_type === 'umbrella' ? 'umbrella' : 'event'

  if (authHeader) {
    const auth = await authenticateGuidelineToken(authHeader)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    eventId = auth.eventId
    ownerType = 'event'
  } else {
    eventId = body?.event_id as string | undefined
  }

  const text = body?.text as string | undefined
  if (!eventId || typeof text !== 'string') {
    return NextResponse.json({ error: 'event_id and text required' }, { status: 400 })
  }

  const rules = await resolveEffectiveRulesForOwner({ kind: ownerType, id: eventId })
  const findings = validateText(text, rules)
  return NextResponse.json({ findings, rules_checked: rules.length })
}
