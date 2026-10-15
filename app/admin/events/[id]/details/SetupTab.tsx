'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, Card } from '@/app/components/ui'

/* Event Details → Setup. One screen an admin approves per event (docs/build_suggestions/sae-readiness-and-setup-approval.md, Part 3):
   readiness checklist, the fixed lines as they will print, the source documents, the active rules, three sample posts, and Approve.
   Read-only apart from Approve (admins) and Generate 3 samples (writes nothing). */
type Check = { key: string; level: 'block' | 'warn'; message: string; fix_href: string }
type Setup = {
  event: { name: string; public_name: string | null; copy_mode: string }
  checks: Check[]
  gate: { ok: boolean; reasons: string[]; changed_since_approval: boolean; enforced: boolean }
  approval: { approved_at: string | null; approved_by: string | null }
  fixed_lines: { dateVenue: string | null; attribution: string | null; cta: string | null; hashtags: string | null } | null
  docs: { id: string; role: string; status: string; extraction_status: string | null; version: number; title: string | null; authority_rank: number | null; provenance: string | null; owner: string; owner_name: string | null; uploaded_by: string | null; created_at: string }[]
  compiled: { version: number; conflicts: number } | null
  rules: { id: string; owner: string; rule_key: string; rule_type: string; severity: string; message: string; source_clause: string | null }[]
  speaker_issues: { id: string; name: string; warnings: string[] }[]
  can_approve: boolean
}
type Sample = { speaker: string; copy?: string; x_copy?: string; findings?: { post_copy: { severity: string; message: string }[] }; attempts?: number; error?: string }

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
const label = { fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '8px' } as const

export default function SetupTab({ eventId }: { eventId: string }) {
  const [s, setS] = useState<Setup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<'approve' | 'samples' | null>(null)
  const [samples, setSamples] = useState<Sample[] | null>(null)

  const [reloadKey, setReloadKey] = useState(0)
  const load = useCallback(async () => { setReloadKey(k => k + 1) }, [])
  useEffect(() => {
    let cancelled = false
    fetch(`/api/events/sae-setup?event_id=${eventId}`)
      .then(async res => ({ ok: res.ok, d: await res.json().catch(() => ({})) }))
      .then(({ ok, d }) => {
        if (cancelled) return
        if (!ok) setError((d as { error?: string }).error ?? 'Could not load setup.')
        else { setError(null); setS(d as Setup) }
      })
    return () => { cancelled = true }
  }, [eventId, reloadKey])

  async function approve() {
    setBusy('approve'); setMsg(null)
    const res = await fetch('/api/events/sae-setup/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId }) })
    const d = await res.json().catch(() => ({}))
    setBusy(null)
    setMsg(res.ok ? 'Setup approved.' : (d.error ?? 'Could not approve.'))
    if (res.ok) await load()
  }
  async function runSamples() {
    setBusy('samples'); setMsg(null); setSamples(null)
    const res = await fetch('/api/events/sae-setup/samples', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId }) })
    const d = await res.json().catch(() => ({}))
    setBusy(null)
    if (res.ok) setSamples(d.samples as Sample[]); else setMsg(d.error ?? 'Could not generate samples.')
  }

  if (error) return <Card padded><div style={{ fontSize: '13px', color: 'var(--red)' }}>{error}</div></Card>
  if (!s) return <Card padded><div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Loading setup…</div></Card>

  const blocks = s.checks.filter(c => c.level === 'block'); const warns = s.checks.filter(c => c.level === 'warn')
  const approved = !!s.approval.approved_at
  const rulesByOwner = (['umbrella', 'event'] as const).map(o => ({ owner: o, rows: s.rules.filter(r => r.owner === o) })).filter(g => g.rows.length)

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      {msg && <div style={{ padding: '10px 14px', borderRadius: '8px', fontSize: '12.5px', background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--ink2)' }}>{msg}</div>}

      {s.gate.changed_since_approval && !s.gate.enforced && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', fontSize: '12.5px', background: 'var(--amber-light)', border: '1px solid var(--amber)', color: 'var(--ink)' }}>
          Setup changed since approval — documents, rules or event details are different from what was approved. Generation is still allowed for this event; re-approve once you have checked the changes.
        </div>
      )}

      <Card padded>
        <div style={label}>Status</div>
        <div style={{ fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.7 }}>
          {s.gate.ok ? <strong style={{ color: 'var(--success)' }}>Generation is allowed.</strong> : <strong style={{ color: 'var(--red)' }}>Generation is blocked.</strong>}{' '}
          {approved ? <>Approved by {s.approval.approved_by ?? 'an admin'} on {fmt(s.approval.approved_at)}.</> : 'Not approved yet.'}{' '}
          {!s.gate.enforced && 'This event is grandfathered: approval is recorded but only blocking checks can stop generation.'}
        </div>
        {!s.gate.ok && <ul style={{ margin: '8px 0 0', paddingLeft: '18px', fontSize: '12.5px', color: 'var(--red)' }}>{s.gate.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
      </Card>

      <Card padded>
        <div style={label}>1 · Readiness checklist</div>
        {s.checks.length === 0 && <div style={{ fontSize: '13px', color: 'var(--success)' }}>Everything checks out.</div>}
        <div style={{ display: 'grid', gap: '6px' }}>
          {[...blocks, ...warns].map(c => (
            <div key={`${c.key}-${c.message}`} style={{ display: 'flex', gap: '10px', alignItems: 'baseline', fontSize: '12.5px' }}>
              <span style={{ fontWeight: 800, color: c.level === 'block' ? 'var(--red)' : 'var(--amber)', minWidth: '52px' }}>{c.level === 'block' ? 'BLOCK' : 'WARN'}</span>
              <span style={{ color: 'var(--ink2)', flex: 1 }}>{c.message}</span>
              <Link href={c.fix_href} style={{ color: 'var(--teal-mid)', fontWeight: 700, whiteSpace: 'nowrap' }}>Fix →</Link>
            </div>
          ))}
        </div>
      </Card>

      <Card padded>
        <div style={label}>2 · Fixed lines, exactly as they will print</div>
        {!s.fixed_lines ? <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>This event is in legacy copy mode — dates, venue and hashtags are written by the model rather than assembled in code.</div> : (
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '13px', color: 'var(--ink)', lineHeight: 1.7 }}>
            {[s.fixed_lines.dateVenue, s.fixed_lines.attribution, s.fixed_lines.cta, s.fixed_lines.hashtags].filter(Boolean).join('\n\n') || '(nothing set)'}
          </pre>
        )}
      </Card>

      <Card padded>
        <div style={label}>3 · Source documents</div>
        {s.docs.length === 0 ? <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>No reference documents.</div> : (
          <div style={{ display: 'grid', gap: '6px', fontSize: '12.5px', color: 'var(--ink2)' }}>
            {s.docs.map(d => (
              <div key={d.id}>
                <strong>{d.role.replace('_', ' ')}</strong> v{d.version} · {d.status}{d.extraction_status === 'processing' ? ' (extracting)' : ''} · rank {d.authority_rank ?? '—'} · {d.provenance?.replace('_', ' ') ?? 'no provenance'} · {d.owner === 'umbrella' ? `umbrella (${d.owner_name ?? ''})` : 'this event'} · uploaded {d.uploaded_by ? `by ${d.uploaded_by} ` : ''}{fmt(d.created_at)}
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '8px' }}>
          {s.compiled ? `Compiled reference v${s.compiled.version} · ${s.compiled.conflicts} unresolved conflict${s.compiled.conflicts === 1 ? '' : 's'}.` : 'No compiled reference yet.'}
        </div>
      </Card>

      <Card padded>
        <div style={label}>4 · Active rules ({s.rules.length})</div>
        {rulesByOwner.length === 0 && <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>No active rules.</div>}
        {rulesByOwner.map(g => (
          <div key={g.owner} style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink2)', marginBottom: '4px' }}>{g.owner === 'umbrella' ? 'From the umbrella event' : 'From this event'}</div>
            <div style={{ display: 'grid', gap: '4px', fontSize: '12px', color: 'var(--ink3)' }}>
              {g.rows.map(r => <div key={r.id}><strong style={{ color: r.severity === 'error' ? 'var(--red)' : 'var(--amber)' }}>{r.severity}</strong> · {r.rule_type.replace('_', ' ')} · {r.message}{r.source_clause ? ` — “${r.source_clause}”` : ''}</div>)}
            </div>
          </div>
        ))}
      </Card>

      {s.speaker_issues.length > 0 && (
        <Card padded>
          <div style={label}>Speaker warnings (never blocking)</div>
          <div style={{ display: 'grid', gap: '4px', fontSize: '12.5px', color: 'var(--ink2)' }}>
            {s.speaker_issues.map(x => <div key={x.id}><strong>{x.name}</strong>: {x.warnings.join('; ')}</div>)}
          </div>
        </Card>
      )}

      <Card padded>
        <div style={label}>5 · Sample posts</div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '10px' }}>Runs the real generator for three confirmed speakers and shows the copy and findings. Nothing is saved.</div>
        <Button variant="ghost" onClick={runSamples} disabled={!!busy}>{busy === 'samples' ? 'Generating…' : 'Generate 3 samples'}</Button>
        {samples && (
          <div style={{ display: 'grid', gap: '14px', marginTop: '14px' }}>
            {samples.map((x, i) => (
              <div key={i} style={{ borderTop: '1px solid var(--border-light)', paddingTop: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink2)' }}>{x.speaker}{x.attempts ? ` · ${x.attempts} attempt${x.attempts === 1 ? '' : 's'}` : ''}</div>
                {x.error ? <div style={{ fontSize: '12.5px', color: 'var(--red)' }}>{x.error}</div> : (
                  <>
                    <pre style={{ margin: '6px 0', whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '13px', color: 'var(--ink)', lineHeight: 1.6 }}>{x.copy}</pre>
                    {(x.findings?.post_copy.length ?? 0) > 0 && <div style={{ fontSize: '12px', color: 'var(--amber)' }}>{x.findings!.post_copy.map(f => `${f.severity}: ${f.message}`).join(' · ')}</div>}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card padded>
        <div style={label}>6 · Approve</div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '10px' }}>
          Approving records this exact setup. If the fixed lines, copy mode, live documents or active rules change afterwards, it needs approving again.
        </div>
        {s.can_approve
          ? <Button variant="lime" onClick={approve} disabled={!!busy || blocks.length > 0}>{busy === 'approve' ? 'Approving…' : approved ? 'Re-approve setup' : 'Approve setup'}</Button>
          : <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>Only a platform admin can approve setup.</div>}
        {blocks.length > 0 && s.can_approve && <div style={{ fontSize: '12px', color: 'var(--red)', marginTop: '6px' }}>Fix the blocking items above first.</div>}
      </Card>
    </div>
  )
}
