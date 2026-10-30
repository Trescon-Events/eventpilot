'use client'

import { useState } from 'react'
import { Button } from '@/app/components/ui'
import { notify } from '@/app/lib/ui/notify'
import type { AffectedRule } from '@/app/lib/content/edit-diff'

/* Part A of docs/build_suggestions/doc-rule-linkage-and-canonical-names.md — shown after a live-doc edit is applied: the validation rules that mention text the edit
   removed, each with Old → Suggested and an Update rule / Leave as is choice. A rule is changed only when someone clicks Update rule (the same PATCH, checks and audit as the
   Rules screen; the doc edit id is passed along so the two can be traced together). Rules the person cannot edit are listed read-only. */

type State = 'idle' | 'updated' | 'left'

export default function AffectedRulesCard({ rules, docEditId, onOpenRules }: { rules: AffectedRule[]; docEditId: string | null; onOpenRules?: () => void }) {
  const [state, setState] = useState<Record<string, State>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [ack, setAck] = useState<Record<string, string[]>>({})
  if (!rules.length) return null

  const byRule = new Map<string, AffectedRule[]>()
  for (const r of rules) byRule.set(r.rule_id, [...(byRule.get(r.rule_id) ?? []), r])

  async function update(ruleId: string, fields: AffectedRule[], acknowledge: boolean) {
    setBusy(ruleId)
    const body: Record<string, unknown> = { acknowledge_warnings: acknowledge, source_doc_edit_id: docEditId ?? undefined }
    for (const f of fields) { if (f.suggested_pattern !== null) body.pattern = f.suggested_pattern; if (f.suggested_message !== null) body.message = f.suggested_message }
    const res = await fetch(`/api/events/validation-rules?id=${ruleId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await res.json().catch(() => ({})) as { error?: string; warnings?: string[]; needs_acknowledgement?: boolean }
    setBusy(null)
    if (res.status === 409 && d.needs_acknowledgement) { setAck(a => ({ ...a, [ruleId]: d.warnings ?? [] })); return }
    if (!res.ok) { notify(d.error ?? 'Could not update the rule.', 'error'); return }
    setAck(a => { const n = { ...a }; delete n[ruleId]; return n })
    setState(s => ({ ...s, [ruleId]: 'updated' })); notify('Rule updated.', 'success')
  }

  const mono = { fontFamily: 'monospace', fontSize: '12px', background: 'var(--surface)', padding: '1px 5px', borderRadius: '4px', wordBreak: 'break-word' } as const
  return (
    <div style={{ marginTop: '8px', border: '1px solid var(--amber)', background: 'var(--amber-light)', borderRadius: '8px', padding: '10px 12px' }}>
      <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--amber)' }}>This edit affects {byRule.size} check{byRule.size === 1 ? '' : 's'}</div>
      <div style={{ fontSize: '12.5px', color: 'var(--ink2)', margin: '3px 0 8px' }}>These checks mention text you just changed. Nothing changes until you click Update rule.</div>
      <div style={{ display: 'grid', gap: '8px' }}>
        {[...byRule.entries()].map(([ruleId, fields]) => {
          const st = state[ruleId] ?? 'idle'
          const canEdit = fields[0].can_edit
          return (
            <div key={ruleId} style={{ background: 'var(--card)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '8px 10px', opacity: st === 'left' ? 0.55 : 1 }}>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                <code style={{ fontSize: '12.5px', fontWeight: 700 }}>{fields[0].rule_key}</code>
                <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--ink3)' }}>{fields[0].level === 'org' ? 'Trescon-wide' : fields[0].level === 'umbrella' ? 'Umbrella' : 'This event'}</span>
                {!fields[0].is_active && <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--ink3)' }}>disabled</span>}
              </div>
              {fields.map(f => (
                <div key={f.field} style={{ marginTop: '5px', fontSize: '12px', color: 'var(--ink3)' }}>
                  <div style={{ fontWeight: 700 }}>{f.field === 'pattern' ? 'Pattern' : 'Message'}</div>
                  <div><span style={mono}>{f.current}</span></div>
                  <div style={{ margin: '2px 0' }}>→ <span style={mono}>{f.suggested}</span></div>
                </div>
              ))}
              {(ack[ruleId] ?? []).length > 0 && <div style={{ fontSize: '12px', color: 'var(--amber)', marginTop: '6px' }}>{ack[ruleId].join(' ')}</div>}
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                {!canEdit ? <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>Ask an admin to update this rule.</span>
                  : st === 'updated' ? <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--teal-mid)' }}>Rule updated ✓</span>
                  : st === 'left' ? <span style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>Left as is</span>
                  : (<>
                      <Button variant="lime" onClick={() => update(ruleId, fields, (ack[ruleId] ?? []).length > 0)} disabled={busy === ruleId}>{(ack[ruleId] ?? []).length > 0 ? 'Update anyway' : 'Update rule'}</Button>
                      <Button variant="ghost" onClick={() => setState(s => ({ ...s, [ruleId]: 'left' }))} disabled={busy === ruleId}>Leave as is</Button>
                    </>)}
              </div>
            </div>
          )
        })}
      </div>
      {onOpenRules && <button onClick={onOpenRules} style={{ marginTop: '8px', background: 'none', border: 'none', padding: 0, fontSize: '12.5px', fontWeight: 700, color: 'var(--teal-mid)', cursor: 'pointer', textDecoration: 'underline' }}>Open all rules</button>}
    </div>
  )
}
