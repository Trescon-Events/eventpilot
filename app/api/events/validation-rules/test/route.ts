import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { resolveEffectiveRulesForOwner } from '@/app/lib/content/resolve-validation-rules'
import { validateText, type ValidationRule } from '@/app/lib/content/validate'
import { checkRuleDraft } from '@/app/lib/content/rule-check'
import { fixedTextsForOwner, parseOwner } from '@/app/lib/content/rule-admin'

/* POST /api/events/validation-rules/test
   Body: { owner_type, owner_id, text, draft?: { rule_key?, rule_type, pattern, severity?, message? } }
   Runs the owner's EFFECTIVE rule set (plus the draft rule, if any) over the pasted text, with validate.ts — the same code
   generation uses. Writes nothing. Also returns the draft's save-time checks (errors / warnings) so the test box and the
   Save button agree. */
export async function POST(req: NextRequest) {
  if (!getSession(req)) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const body = await req.json().catch(() => null) as { owner_type?: string; owner_id?: string; text?: string; draft?: { rule_key?: string; rule_type: string; pattern: string; severity?: string; message?: string } } | null
  const owner = parseOwner(body?.owner_type ?? null, body?.owner_id ?? null)
  if (!body || !owner || typeof body.text !== 'string') return NextResponse.json({ error: 'owner_type, owner_id and text required.' }, { status: 400 })

  const effective = await resolveEffectiveRulesForOwner(owner)
  let rules: ValidationRule[] = effective
  let draft_check: { errors: string[]; warnings: string[] } | null = null
  if (body.draft) {
    draft_check = checkRuleDraft(body.draft, await fixedTextsForOwner(owner))
    if (draft_check.errors.length === 0) {
      const d: ValidationRule = {
        rule_key: body.draft.rule_key || 'draft-rule', rule_type: body.draft.rule_type as ValidationRule['rule_type'], pattern: body.draft.pattern,
        severity: body.draft.severity === 'warning' ? 'warning' : 'error', message: body.draft.message || '(draft rule)', source_clause: 'Draft',
      }
      rules = [...effective.filter(r => r.rule_key !== d.rule_key), d]
    }
  }
  return NextResponse.json({ findings: validateText(body.text, rules), rules_applied: rules.length, draft_check })
}
