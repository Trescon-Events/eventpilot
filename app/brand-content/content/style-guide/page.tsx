'use client'

import { useEffect, useRef, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import RulesPanel from '@/app/components/rules/RulesPanel'
import { Button, Card } from '@/app/components/ui'
import { useBrandContentAccess } from '@/app/components/brand-content/access'
import {
  DraftReview, LiveDocView, DOC_ROLE_LABELS, UploadDocButton,
  type MessagingDoc, type DocRole, type UploadChoice,
} from '@/app/admin/events/[id]/details/page'

/* Content style guide (docs/build_suggestions/brand-and-content-section.md, Part 3): the Trescon-wide style guide, readable by everyone,
   with the PDF original and a Word copy to download. The upload, extract, draft review and approve flow is the same as before; the
   rules Trescon-wide EventPilot checks sit on the second tab. Editors need platform.content.manage; approving is super admin only.
   The style guide reaches Trescon-owned events only (not managed client events, not client umbrellas). */

function getSession() {
  if (typeof document === 'undefined') return null
  const raw = document.cookie.split('; ').find(c => c.startsWith('tcs_session='))?.split('=')[1]
  if (!raw) return null
  try { return JSON.parse(atob(raw)) as { sid: string } } catch { return null }
}

const TABS = [{ id: 'guide', label: 'Style guide' }, { id: 'rules', label: 'Rules EventPilot checks' }] as const
type TabId = typeof TABS[number]['id']

export default function ContentStyleGuidePage() {
  const session = getSession()
  const access = useBrandContentAccess()
  const canEdit = !!access?.can_edit_content
  const [tab, setTab] = useState<TabId>('guide')
  const [docs, setDocs] = useState<MessagingDoc[]>([])
  const [reloadKey, setReloadKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [msgIsError, setMsgIsError] = useState(false)
  const wordInput = useRef<HTMLInputElement>(null)
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
    if (res.ok) { await reload(); setMsg('Uploaded. Review the draft below before it goes live.'); setMsgIsError(false) }
    else { const d = await res.json().catch(() => ({})); setMsg(d.error ?? 'Upload failed.'); setMsgIsError(true) }
  }

  async function uploadWord(doc: MessagingDoc, file: File) {
    setSaving(true); setMsg(null)
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`/api/events/stakeholders/messaging/${doc.id}/word`, { method: 'POST', body: form })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (res.ok) { await reload(); setMsg('✓ Word copy attached to this version.'); setMsgIsError(false) } else { setMsg(d.error ?? 'Could not attach the Word copy.'); setMsgIsError(true) }
  }

  const live = docs.find(d => d.role === 'style_guide' && d.status === 'live') ?? null
  const draft = docs.filter(d => d.role === 'style_guide' && d.status === 'draft').sort((a, b) => b.version - a.version)[0] ?? null
  const dl = { padding: '7px 14px', borderRadius: '10px', border: '1.5px solid var(--border)', color: 'var(--ink2)', fontSize: '13px', fontWeight: 700, textDecoration: 'none', background: 'var(--card)' } as const

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 16px' }}>
      <PageHeader eyebrow="Content" title="Content style guide" description="The Trescon-wide content style guide and the house rules EventPilot checks. The guide reaches Trescon-owned events only; the rules apply to every event, below the client's own rules." />

      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '5px', width: 'fit-content', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: 800, background: tab === t.id ? 'var(--surface)' : 'transparent', color: tab === t.id ? 'var(--lime)' : 'var(--ink3)' }}>{t.label}</button>
        ))}
      </div>

      {access && !canEdit && <div style={{ padding: '8px 12px', marginBottom: '14px', borderRadius: '8px', fontSize: '12.5px', background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--ink3)' }}>View only. You can read and download everything here; editing needs permission.</div>}
      {msg && <div style={{ marginBottom: '12px', fontSize: '13px', color: msgIsError ? 'var(--red)' : 'var(--success)' }}>{msg}</div>}

      {tab === 'rules' && <RulesPanel ownerType="org" ownerId="trescon" title="Trescon-wide rules" />}

      {tab === 'guide' && (
        <>
          <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '8px' }}>{DOC_ROLE_LABELS['style_guide' as DocRole]}</div>
          {live && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
              <span style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>Live version {live.version}</span>
              {live.source_url && <a href={live.source_url} target="_blank" rel="noreferrer" style={dl}>Download PDF</a>}
              {live.word_file_url
                ? <a href={live.word_file_url} target="_blank" rel="noreferrer" style={dl}>Download Word</a>
                : <span style={{ fontSize: '12px', color: 'var(--ink4)' }}>No Word copy attached to this version.</span>}
              {canEdit && (
                <>
                  <input ref={wordInput} type="file" accept=".docx" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadWord(live, f); e.target.value = '' }} />
                  <Button variant="ghost" onClick={() => wordInput.current?.click()} disabled={saving}>{live.word_file_url ? 'Replace Word copy' : 'Attach Word copy'}</Button>
                </>
              )}
            </div>
          )}
          {canEdit && (
            <div style={{ marginBottom: '12px' }}>
              <UploadDocButton role="style_guide" saving={saving} existing={docs.filter(d => d.status === 'live').map(d => ({ role: d.role, authority_rank: d.authority_rank, provenance: d.provenance }))} onPicked={(f, c) => uploadDoc(f, c)} />
            </div>
          )}
          {!live && !draft && <Card padded><div style={{ fontSize: '13px', color: 'var(--ink3)' }}>No Trescon-wide style guide yet.</div></Card>}
          {draft && canEdit && (
            <Card padded color="amber">
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--amber)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '8px' }}>Draft v{draft.version}. Review before it goes live{access?.can_approve ? '' : ' (a super admin approves it)'}</div>
              <DraftReview doc={draft} canManage canApprove={!!access?.can_approve} session={session} onApproved={reload} />
            </Card>
          )}
          {live && !draft && <LiveDocView doc={live} canManage={canEdit} session={session} onUpdated={reload} />}
          {live && draft && !canEdit && <LiveDocView doc={live} canManage={false} session={session} onUpdated={reload} />}
        </>
      )}
    </div>
  )
}
