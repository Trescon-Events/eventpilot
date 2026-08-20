'use client'

import { useState, useEffect } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Button } from '@/app/components/ui'

/* PR Approvals (2026-08-20) — replaces "open GitHub, read the diff, click
   Approve, click Merge, hope CI is green" with one page: a friendly
   AI-written summary of what changed, a SAFE/REVIEW_CLOSELY badge, live CI
   status, and two buttons. Approve calls GitHub's API server-side (as
   Madhu, via GITHUB_APPROVER_TOKEN — see app/lib/github/api.ts) to review +
   merge in one shot; Send Back requests changes with a note. Fed by
   app/api/webhooks/github-pr, the same trigger that already emailed Madhu
   before this page existed. */

type CheckState = 'passing' | 'failing' | 'pending' | 'none'

type PrReview = {
  id: string
  pr_number: number
  pr_url: string
  pr_title: string
  author: string
  ai_summary: string | null
  mechanical_summary: string
  areas_touched: string[]
  verdict: 'SAFE' | 'REVIEW_CLOSELY'
  verdict_reason: string | null
  files_changed: string[]
  status: 'pending' | 'approved' | 'sent_back'
  decision_note: string | null
  merge_error: string | null
  created_at: string
  checks: { state: CheckState; runs: { name: string; status: string; conclusion: string | null; url: string }[] }
}

const CHECK_LABEL: Record<CheckState, { label: string; badgeClass: string }> = {
  passing: { label: '✓ Checks passing', badgeClass: 'tbadge-teal' },
  failing: { label: '✗ Checks failing', badgeClass: 'tbadge-red' },
  pending: { label: '⋯ Checks running', badgeClass: 'tbadge-amber' },
  none:    { label: 'No checks yet', badgeClass: 'tbadge-grey' },
}

export default function DevApprovalsPage() {
  const [reviews, setReviews] = useState<PrReview[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  async function fetchAll() {
    setLoading(true)
    const res = await fetch('/api/admin/dev-approvals')
    const data = await res.json().catch(() => ({}))
    if (res.ok) { setReviews(data.reviews ?? []); setLoadError(null) }
    else setLoadError(data.error || 'Could not load PR reviews.')
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount, matches this app's other top-level fetchAll effects (e.g. MyApprovalsPage)
    fetchAll()
  }, [])

  async function approve(prNumber: number) {
    setBusy(`approve-${prNumber}`)
    setMsg(null)
    const res = await fetch(`/api/admin/dev-approvals/${prNumber}/approve`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    setBusy(null)
    if (res.ok) { setMsg({ type: 'success', text: `PR #${prNumber} approved and merged — Railway is deploying it now.` }); fetchAll() }
    else { setMsg({ type: 'error', text: data.error || 'Approve failed.' }); fetchAll() }
  }

  async function reject(prNumber: number) {
    if (!note.trim()) return
    setBusy(`reject-${prNumber}`)
    setMsg(null)
    const res = await fetch(`/api/admin/dev-approvals/${prNumber}/reject`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: note.trim() }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(null)
    if (res.ok) { setMsg({ type: 'success', text: `Sent back to Khalifa with your note.` }); setOpenId(null); setNote(''); fetchAll() }
    else setMsg({ type: 'error', text: data.error || 'Send back failed.' })
  }

  const pending = reviews.filter(r => r.status === 'pending')
  const decided = reviews.filter(r => r.status !== 'pending')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Developer Workflow"
        title="PR Approvals"
        description="Khalifa's Task Manager pull requests, waiting on your decision. Approve merges it live and tells him; Send Back requests a fix with your note."
      />
      <div style={{ maxWidth: '780px', margin: '0 auto', padding: '28px 32px' }}>
        {msg && (
          <div style={{
            padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '13.5px',
            background: msg.type === 'error' ? 'var(--red-light)' : 'var(--teal-light)',
            border: `1px solid ${msg.type === 'error' ? 'var(--red-border)' : 'var(--teal-border)'}`,
            color: msg.type === 'error' ? 'var(--red)' : 'var(--teal)',
          }}>
            {msg.text} <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700, marginLeft: '8px' }}>×</button>
          </div>
        )}

        {loading ? (
          <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>
        ) : loadError ? (
          <div style={{ color: 'var(--red)', fontSize: '13px' }}>{loadError}</div>
        ) : pending.length === 0 ? (
          <div style={{ color: 'var(--ink3)', fontSize: '13.5px', padding: '32px 0', textAlign: 'center' }}>Nothing waiting on you right now.</div>
        ) : (
          <div style={{ display: 'grid', gap: '14px' }}>
            {pending.map(r => {
              const isOpen = openId === r.id
              const isSafe = r.verdict === 'SAFE'
              const chk = CHECK_LABEL[r.checks?.state ?? 'none']
              return (
                <div key={r.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)' }}>PR #{r.pr_number}: {r.pr_title}</div>
                      <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>by {r.author} · {new Date(r.created_at).toLocaleString()}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <span className={`tbadge ${isSafe ? 'tbadge-teal' : 'tbadge-amber'}`}>{isSafe ? '🟢 SAFE' : '🟡 REVIEW CLOSELY'}</span>
                      <span className={`tbadge ${chk.badgeClass}`}>{chk.label}</span>
                    </div>
                  </div>

                  <p style={{ fontSize: '13.5px', color: 'var(--ink2)', lineHeight: 1.6, margin: '0 0 10px' }}>
                    {r.ai_summary || r.mechanical_summary}
                  </p>

                  {r.checks?.state === 'failing' && (
                    <div style={{ fontSize: '12px', color: 'var(--red)', marginBottom: '10px' }}>
                      Failing: {r.checks.runs.filter(c => c.conclusion && c.conclusion !== 'success').map(c => c.name).join(', ') || 'a required check'} — Approve is disabled until this is fixed.
                    </div>
                  )}

                  {r.merge_error && (
                    <div style={{ fontSize: '12px', color: 'var(--amber)', marginBottom: '10px' }}>
                      Last approve attempt: {r.merge_error}
                    </div>
                  )}

                  <details style={{ marginBottom: '12px' }}>
                    <summary style={{ fontSize: '11.5px', color: 'var(--teal-mid)', cursor: 'pointer' }}>
                      {r.files_changed.length} file{r.files_changed.length === 1 ? '' : 's'} changed · {r.areas_touched.join(', ')}
                    </summary>
                    <div style={{ marginTop: '8px', display: 'grid', gap: '2px' }}>
                      {r.files_changed.map(f => (
                        <div key={f} style={{ fontSize: '11.5px', color: 'var(--ink4)', fontFamily: 'ui-monospace, monospace' }}>{f}</div>
                      ))}
                    </div>
                  </details>

                  {!isOpen ? (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Button
                        variant="lime"
                        disabled={busy !== null || r.checks?.state !== 'passing'}
                        onClick={() => approve(r.pr_number)}
                        title={r.checks?.state !== 'passing' ? "Can't approve until checks pass" : undefined}
                      >
                        {busy === `approve-${r.pr_number}` ? 'Approving…' : '✓ Approve & Ship'}
                      </Button>
                      <Button variant="ghost" disabled={busy !== null} onClick={() => { setOpenId(r.id); setNote('') }}>Send Back</Button>
                      <Button variant="ghost" href={`${r.pr_url}/files`} target="_blank">View diff on GitHub</Button>
                    </div>
                  ) : (
                    <div style={{ paddingTop: '10px', borderTop: '1px solid var(--border-light)' }}>
                      <textarea rows={3} value={note} onChange={e => setNote(e.target.value)} className="tfield"
                        placeholder="What needs to change? (required — Khalifa sees this)"
                        style={{ resize: 'vertical', width: '100%', marginBottom: '10px' }} />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Button variant="ghost" disabled={!note.trim() || busy !== null} onClick={() => reject(r.pr_number)}>
                          {busy === `reject-${r.pr_number}` ? 'Sending…' : 'Send Back to Khalifa'}
                        </Button>
                        <Button variant="ghost" onClick={() => setOpenId(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {decided.length > 0 && (
          <div style={{ marginTop: '32px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '10px' }}>
              Recently decided
            </div>
            <div style={{ display: 'grid', gap: '8px' }}>
              {decided.slice(0, 8).map(r => (
                <div key={r.id} style={{ fontSize: '12.5px', color: 'var(--ink3)', padding: '8px 12px', border: '1px solid var(--border-light)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>PR #{r.pr_number}: {r.pr_title}</span>
                  <span style={{ fontWeight: 700, color: r.status === 'approved' ? 'var(--teal)' : 'var(--amber)' }}>
                    {r.status === 'approved' ? '✓ Merged' : '↩ Sent back'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
