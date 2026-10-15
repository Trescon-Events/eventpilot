'use client'

import { useEffect, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import RulesPanel from '@/app/components/rules/RulesPanel'
import { Card } from '@/app/components/ui'
import {
  DraftReview, LiveDocView, DOC_ROLE_LABELS, UploadDocButton,
  type MessagingDoc, type DocRole, type UploadChoice,
} from '@/app/admin/events/[id]/details/page'

/* Trescon house style (2026-10-15, docs/build_suggestions/rules-screen-and-trescon-layer.md Part 3): the Trescon-wide rules and the
   Trescon-wide style guide. Rules reach every event, below client rules; the style guide reaches only Trescon-owned events (not
   managed client events, not client umbrellas). Platform admin only — middleware's blanket /admin/* rule, and every API call here
   re-checks the session. */

function getSession() {
  if (typeof document === 'undefined') return null
  const raw = document.cookie.split('; ').find(c => c.startsWith('tcs_session='))?.split('=')[1]
  if (!raw) return null
  try { return JSON.parse(atob(raw)) as { sid: string } } catch { return null }
}

export default function HouseStylePage() {
  const session = getSession()
  const [docs, setDocs] = useState<MessagingDoc[]>([])
  const [reloadKey, setReloadKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [msgIsError, setMsgIsError] = useState(false)
  const reload = async () => { setReloadKey(k => k + 1) }

  useEffect(() => {
    let cancelled = false
    fetch('/api/events/stakeholders/messaging?event_id=trescon&owner_type=org&all=true')
      .then(r => r.json().catch(() => []))
      .then(d => { if (!cancelled) setDocs(Array.isArray(d) ? d : []) })
    return () => { cancelled = true }
  }, [reloadKey])

  async function uploadDoc(file: File, choice: UploadChoice) {
    setSaving(true); setMsg(null)
    const form = new FormData()
    form.append('event_id', 'trescon')
    form.append('owner_type', 'org')
    form.append('file', file)
    form.append('role', 'style_guide')
    form.append('authority_rank', String(choice.rank))
    form.append('provenance', 'trescon_authored')
    if (session?.sid) form.append('uploaded_by', session.sid)
    const res = await fetch('/api/events/stakeholders/messaging', { method: 'POST', body: form })
    setSaving(false)
    if (res.ok) { await reload(); setMsg('Uploaded — review the draft below before it goes live.'); setMsgIsError(false) }
    else { const d = await res.json().catch(() => ({})); setMsg(d.error ?? 'Upload failed.'); setMsgIsError(true) }
  }

  const live = docs.find(d => d.role === 'style_guide' && d.status === 'live') ?? null
  const draft = docs.filter(d => d.role === 'style_guide' && d.status === 'draft').sort((a, b) => b.version - a.version)[0] ?? null

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 32px' }}>
      <PageHeader eyebrow="Content" title="Trescon house style" description="Trescon-wide rules and style guide. Rules apply to every event, below the client's own rules and documents. The style guide reaches Trescon-owned events only." />

      {msg && <div style={{ marginBottom: '12px', fontSize: '13px', color: msgIsError ? 'var(--red)' : 'var(--success)' }}>{msg}</div>}

      <div style={{ marginBottom: '24px' }}><RulesPanel ownerType="org" ownerId="trescon" title="Trescon-wide rules" /></div>

      <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '8px' }}>{DOC_ROLE_LABELS['style_guide' as DocRole]}</div>
      <div style={{ marginBottom: '12px' }}>
        <UploadDocButton role="style_guide" saving={saving} existing={docs.filter(d => d.status === 'live').map(d => ({ role: d.role, authority_rank: d.authority_rank, provenance: d.provenance }))} onPicked={(f, c) => uploadDoc(f, c)} />
      </div>
      {!live && !draft && <Card padded><div style={{ fontSize: '13px', color: 'var(--ink3)' }}>No Trescon-wide style guide yet.</div></Card>}
      {draft && (
        <Card padded color="amber">
          <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--amber)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '8px' }}>Draft v{draft.version} — review before it goes live</div>
          <DraftReview doc={draft} canManage session={session} onApproved={reload} />
        </Card>
      )}
      {live && !draft && <LiveDocView doc={live} canManage session={session} onUpdated={reload} />}
    </div>
  )
}
