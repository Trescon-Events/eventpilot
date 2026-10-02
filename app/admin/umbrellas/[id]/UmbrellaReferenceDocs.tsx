'use client'

import { useState, useEffect, use } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { permissionSetSatisfies } from '@/app/lib/access/permission-match'
import { Button, Card } from '@/app/components/ui'
import {
  DraftReview, LiveDocView, DOC_ROLE_LABELS, UploadDocButton,
  type MessagingDoc, type DocRole, type UploadChoice,
} from '@/app/admin/events/[id]/details/page'

/* Umbrella Reference Documents (2026-10-02, split out of the old single Overview page): style guide / messaging / production
   pack for the umbrella — upload with Rank + Provenance, review drafts, live docs — and Content Check, reusing the exact same
   review UI the event details page uses (owner_type=umbrella on every call). Platform-admin only. */

function getSession() {
  if (typeof document === 'undefined') return null
  const raw = document.cookie.split('; ').find(c => c.startsWith('tcs_session='))?.split('=')[1]
  if (!raw) return null
  try { return JSON.parse(atob(raw)) as { sid: string } } catch { return null }
}

export default function UmbrellaReferenceDocs({ params }: { params: Promise<{ id: string }> }) {
  const { id: umbrellaId } = use(params)
  const session = getSession()

  const [permissions, setPermissions] = useState<Set<string>>(new Set())
  const [umbrellaName, setUmbrellaName] = useState<string | null>(null)
  const [docs, setDocs] = useState<MessagingDoc[]>([])
  const [uploadRole, setUploadRole] = useState<DocRole>('style_guide')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [msgIsError, setMsgIsError] = useState(false)

  const [checkText, setCheckText] = useState('')
  const [checkFindings, setCheckFindings] = useState<Array<{ rule_key: string; severity: 'error' | 'warning'; message: string; source_clause: string | null; match: string }> | null>(null)
  const [checking, setChecking] = useState(false)

  const can = (key: string) => permissionSetSatisfies(permissions, key)
  // A Corporate Marketing Director decision, not a producer one — every
  // document here changes every child event's effective document set at
  // once. See app/api/events/stakeholders/messaging/route.ts POST.
  const canManage = can('sae.messaging.umbrella_manage')

  async function loadAll() {
    const [permRes, umbrellaRes, docsRes] = await Promise.all([
      fetch(`/api/events/access/me?event_id=${umbrellaId}`).then(r => r.json()).catch(() => ({ permissions: [] })),
      fetch(`/api/events/umbrellas?id=${umbrellaId}`).then(r => r.json()).catch(() => null),
      fetch(`/api/events/stakeholders/messaging?event_id=${umbrellaId}&owner_type=umbrella&all=true`).then(r => r.json()).catch(() => []),
    ])
    setPermissions(new Set(permRes.permissions ?? []))
    setUmbrellaName(umbrellaRes?.name ?? null)
    setDocs(Array.isArray(docsRes) ? docsRes : [])
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount, matches the event details page's own pattern
    setLoading(true)
    loadAll().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadAll is stable for this effect's purpose (mount + umbrellaId change only)
  }, [umbrellaId])

  async function uploadDoc(file: File, choice: UploadChoice) {
    setSaving(true); setMsg(null)
    const form = new FormData()
    form.append('event_id', umbrellaId)
    form.append('owner_type', 'umbrella')
    form.append('file', file)
    form.append('role', uploadRole)
    form.append('authority_rank', String(choice.rank))
    form.append('provenance', choice.provenance)
    if (session?.sid) form.append('uploaded_by', session.sid)
    const res = await fetch('/api/events/stakeholders/messaging', { method: 'POST', body: form })
    setSaving(false)
    if (res.ok) { await loadAll(); setMsg('Uploaded — review the draft below before it goes live.'); setMsgIsError(false) }
    else { const data = await res.json().catch(() => ({})); setMsg(data.error ?? 'Upload failed.'); setMsgIsError(true) }
  }

  async function checkCopy() {
    if (!checkText.trim() || checking) return
    setChecking(true); setCheckFindings(null)
    const res = await fetch('/api/events/stakeholders/content/validate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: umbrellaId, owner_type: 'umbrella', text: checkText }),
    })
    const data = await res.json().catch(() => ({}))
    setChecking(false)
    setCheckFindings(data.findings ?? [])
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
  if (!umbrellaName) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--red)' }}>Umbrella event not found.</div>

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 32px' }}>
      <PageHeader eyebrow="Umbrella Event" title="Reference Documents" description={`Style guide, messaging document and production pack for ${umbrellaName}. They apply to every event in the umbrella.`} backHref={`/admin/umbrellas/${umbrellaId}`} backLabel="Overview" />

      {msg && <div style={{ marginBottom: '12px', fontSize: '13px', color: msgIsError ? 'var(--red)' : 'var(--success)' }}>{msg}</div>}

      <div style={{ marginBottom: '16px' }}>
        {canManage && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select value={uploadRole} onChange={e => setUploadRole(e.target.value as DocRole)}
              style={{ fontSize: '12px', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit' }}>
              {(Object.keys(DOC_ROLE_LABELS) as DocRole[]).map(r => <option key={r} value={r}>{DOC_ROLE_LABELS[r]}</option>)}
            </select>
            <UploadDocButton role={uploadRole} saving={saving}
              existing={docs.filter(d => d.status === 'live').map(d => ({ role: d.role, authority_rank: d.authority_rank, provenance: d.provenance }))}
              onPicked={(f, choice) => uploadDoc(f, choice)} />
          </div>
        )}
        {!canManage && (
          <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>Managing umbrella-level documents requires the umbrella-manage permission — it changes every child event at once.</div>
        )}
      </div>

      {(['style_guide', 'messaging', 'production_pack'] as DocRole[]).map(role => {
        const roleLive = docs.find(d => d.role === role && d.status === 'live') ?? null
        const roleDraft = docs.filter(d => d.role === role && d.status === 'draft').sort((a, b) => b.version - a.version)[0] ?? null
        if (!roleLive && !roleDraft) return null
        return (
          <div key={role} style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '8px' }}>{DOC_ROLE_LABELS[role]}</div>
            {roleDraft && (
              <Card padded color="amber">
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--amber)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Draft v{roleDraft.version} — review before it goes live
                </div>
                <DraftReview doc={roleDraft} canManage={canManage} session={session} onApproved={loadAll} />
              </Card>
            )}
            {roleLive && !roleDraft && (
              <LiveDocView doc={roleLive} canManage={canManage} session={session} onUpdated={loadAll} />
            )}
          </div>
        )
      })}

      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', margin: '24px 0 12px' }}>Content Check</div>
      <Card padded>
        <textarea value={checkText} onChange={e => setCheckText(e.target.value)} placeholder="Paste copy here to check against this umbrella's rules…" rows={6}
          style={{ width: '100%', fontSize: '13px', fontFamily: 'inherit', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', resize: 'vertical', boxSizing: 'border-box' }} />
        <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="lime" onClick={checkCopy} disabled={checking || !checkText.trim()}>{checking ? 'Checking…' : 'Check copy'}</Button>
        </div>
        {checkFindings !== null && (
          <div style={{ marginTop: '14px', display: 'grid', gap: '8px' }}>
            {checkFindings.length === 0 && <div style={{ fontSize: '13px', color: 'var(--success)', textAlign: 'center' }}>No findings.</div>}
            {checkFindings.map((f, i) => (
              <div key={i} style={{ padding: '8px 12px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: f.severity === 'error' ? 'var(--red)' : 'var(--amber)' }}>{f.severity}</span>
                <div style={{ fontSize: '13px', color: 'var(--ink)', marginTop: '2px' }}>{f.message}</div>
                <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '2px' }}>Matched: <code>{f.match}</code>{f.source_clause && ` · ${f.source_clause}`}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
