'use client'

import { useState, use } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Button, Card } from '@/app/components/ui'

/* Reference Documents spec, Stage 3 (2026-09-10) — standalone "check this
   copy" tool. Paste hand-written copy, check it against this event's
   effective validation rule set (its own rules + its umbrella's) via
   app/api/events/stakeholders/content/validate. Deterministic only — no
   model call, no judgement, see app/lib/content/validate.ts. */

type Finding = {
  rule_key: string
  severity: 'error' | 'warning'
  message: string
  source_clause: string | null
  match: string
  offset: number
}

export default function ContentCheckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const [text, setText] = useState('')
  const [findings, setFindings] = useState<Finding[] | null>(null)
  const [rulesChecked, setRulesChecked] = useState<number | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function check() {
    if (!text.trim() || checking) return
    setChecking(true); setError(null)
    try {
      const res = await fetch('/api/events/stakeholders/content/validate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, text }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Check failed.'); setFindings(null); return }
      setFindings(data.findings ?? [])
      setRulesChecked(data.rules_checked ?? 0)
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setChecking(false)
    }
  }

  const errors = (findings ?? []).filter(f => f.severity === 'error')
  const warnings = (findings ?? []).filter(f => f.severity === 'warning')

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 32px' }}>
      <PageHeader
        eyebrow="Content"
        title="Content Check"
        description="Paste hand-written copy and check it against this event's deterministic validation rules — banned terms, style rules, required formats, proximity checks. Not a model judgement call, just mechanical pattern matching against what's been configured."
      />

      <Card padded>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Paste copy here…"
          rows={10}
          style={{ width: '100%', fontSize: '13px', fontFamily: 'inherit', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', resize: 'vertical', boxSizing: 'border-box' }}
        />
        <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="lime" onClick={check} disabled={checking || !text.trim()}>{checking ? 'Checking…' : 'Check copy'}</Button>
        </div>
      </Card>

      {error && (
        <div style={{ marginTop: '16px', fontSize: '13px', color: 'var(--red)' }}>{error}</div>
      )}

      {findings !== null && (
        <div style={{ marginTop: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '10px' }}>
            {findings.length === 0
              ? `Clean — checked against ${rulesChecked} active rule${rulesChecked === 1 ? '' : 's'}`
              : `${errors.length} error${errors.length === 1 ? '' : 's'}, ${warnings.length} warning${warnings.length === 1 ? '' : 's'} — checked against ${rulesChecked} active rule${rulesChecked === 1 ? '' : 's'}`}
          </div>

          {findings.length === 0 && (
            <Card padded>
              <div style={{ padding: '10px', fontSize: '13px', color: 'var(--success)', textAlign: 'center' }}>
                No findings. {rulesChecked === 0 && 'No active rules are configured for this event yet.'}
              </div>
            </Card>
          )}

          <div style={{ display: 'grid', gap: '8px' }}>
            {findings.map((f, i) => (
              <Card key={i} padded color={f.severity === 'error' ? 'red' : 'amber'}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                  <div>
                    <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: f.severity === 'error' ? 'var(--red)' : 'var(--amber)' }}>
                      {f.severity}
                    </span>
                    <div style={{ fontSize: '13px', color: 'var(--ink)', marginTop: '4px' }}>{f.message}</div>
                    <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '4px' }}>
                      Matched: <code style={{ background: 'var(--surface)', padding: '1px 6px', borderRadius: '4px' }}>{f.match}</code>
                      {f.source_clause && <span> · {f.source_clause}</span>}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
