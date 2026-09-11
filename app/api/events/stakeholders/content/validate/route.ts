import { NextRequest, NextResponse } from 'next/server'
import { resolveEffectiveRulesForOwner } from '@/app/lib/content/resolve-validation-rules'
import { validateText } from '@/app/lib/content/validate'

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
   no changes; only the umbrella workspace page passes 'umbrella'. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const eventId = body?.event_id as string | undefined
  const text = body?.text as string | undefined
  const ownerType: 'event' | 'umbrella' = body?.owner_type === 'umbrella' ? 'umbrella' : 'event'
  if (!eventId || typeof text !== 'string') {
    return NextResponse.json({ error: 'event_id and text required' }, { status: 400 })
  }

  const rules = await resolveEffectiveRulesForOwner({ kind: ownerType, id: eventId })
  const findings = validateText(text, rules)
  return NextResponse.json({ findings, rules_checked: rules.length })
}
