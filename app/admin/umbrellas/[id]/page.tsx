'use client'

import { useState, useEffect, use } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { permissionSetSatisfies } from '@/app/lib/access/permission-match'
import { Button, Card } from '@/app/components/ui'
import {
  DraftReview, LiveDocView, DOC_ROLE_LABELS,
  type MessagingDoc, type DocRole,
} from '@/app/admin/events/[id]/details/page'

/* Umbrella/event separation (2026-09-11) — a real event_umbrellas row
   (see supabase/umbrella_events_separation_migration.sql), a deliberately
   SIMPLIFIED workspace: Common Details, Content Approval (no "inherit"
   option here — an umbrella is the top of the hierarchy, nothing above it
   to inherit from), Reference Documents (style guide / messaging /
   production pack, reusing the exact same review/clarification/
   suggested-rules UI the event details page uses, via owner_type=umbrella
   on every call), Content Check, and its child events for navigation.
   Deliberately does NOT get Stakeholder Hub, Brief, Plan, Execution,
   Website Builder, Brand Studio, Market Intel, Commercial, or
   Integrations — none of those make sense for a pure grouping construct;
   that's the whole point of this page existing separately from
   app/admin/events/[id]/details/page.tsx rather than reusing it wholesale. */

type UmbrellaRow = {
  id: string; name: string; client_name: string | null; status: string
  event_date: string | null; end_date: string | null; description: string | null
  type: string | null; requires_client_approval: boolean | null
  children: Array<{ id: string; name: string; type: string | null; status: string; client_name: string | null }>
}

function getSession() {
  if (typeof document === 'undefined') return null
  const raw = document.cookie.split('; ').find(c => c.startsWith('tcs_session='))?.split('=')[1]
  if (!raw) return null
  try { return JSON.parse(atob(raw)) as { sid: string } } catch { return null }
}

export default function UmbrellaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: umbrellaId } = use(params)
  const session = getSession()

  const [permissions, setPermissions] = useState<Set<string>>(new Set())
  const [umbrella, setUmbrella] = useState<UmbrellaRow | null>(null)
  const [editForm, setEditForm] = useState({ name: '', client_name: '', status: 'planning', event_date: '', end_date: '', description: '' })
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
    setUmbrella(umbrellaRes ?? null)
    if (umbrellaRes) {
      setEditForm({
        name: umbrellaRes.name ?? '', client_name: umbrellaRes.client_name ?? '', status: umbrellaRes.status ?? 'planning',
        event_date: umbrellaRes.event_date ?? '', end_date: umbrellaRes.end_date ?? '', description: umbrellaRes.description ?? '',
      })
    }
    setDocs(Array.isArray(docsRes) ? docsRes : [])
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount, matches the event details page's own pattern
    setLoading(true)
    loadAll().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadAll is stable for this effect's purpose (mount + umbrellaId change only)
  }, [umbrellaId])

  async function saveDetails() {
    setSaving(true); setMsg(null)
    const res = await fetch(`/api/events/umbrellas?id=${umbrellaId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (res.ok) { setMsg('Saved.'); setMsgIsError(false); await loadAll() }
    else { setMsg(data.error ?? 'Save failed.'); setMsgIsError(true) }
  }

  async function saveRequiresClientApproval(value: boolean) {
    setSaving(true); setMsg(null)
    const res = await fetch(`/api/events/umbrellas?id=${umbrellaId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requires_client_approval: value }),
    })
    setSaving(false)
    if (res.ok) { setMsg('Saved.'); setMsgIsError(false); await loadAll() } else { setMsg('Save failed.'); setMsgIsError(true) }
  }

  async function uploadDoc(file: File) {
    setSaving(true); setMsg(null)
    const form = new FormData()
    form.append('event_id', umbrellaId)
    form.append('owner_type', 'umbrella')
    form.append('file', file)
    form.append('role', uploadRole)
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
  if (!umbrella) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--red)' }}>Umbrella event not found.</div>

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 32px' }}>
      <PageHeader eyebrow="Umbrella Event" title={umbrella.name} description="A grouping of related events sharing top-level reference documents and content rules — not a producible event itself." />

      {msg && <div style={{ marginBottom: '12px', fontSize: '13px', color: msgIsError ? 'var(--red)' : 'var(--success)' }}>{msg}</div>}

      <Card padded>
        <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '14px' }}>Common Details</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '4px' }}>Name</label>
            <input disabled={!canManage} value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
              style={{ width: '100%', fontSize: '13px', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '4px' }}>Client</label>
            <input disabled={!canManage} value={editForm.client_name} onChange={e => setEditForm(f => ({ ...f, client_name: e.target.value }))}
              style={{ width: '100%', fontSize: '13px', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '4px' }}>Description / Notes</label>
            <textarea disabled={!canManage} value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} rows={3}
              style={{ width: '100%', fontSize: '13px', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' }} />
          </div>
        </div>
        {canManage && (
          <div style={{ marginTop: '14px' }}>
            <Button variant="lime" onClick={saveDetails} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        )}
      </Card>

      <Card padded>
        <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '4px' }}>Content Approval</div>
        <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '14px' }}>
          When on, this becomes the default for every child event that doesn&apos;t explicitly override it — client sign-off is required before internal approval or publish.
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {([['on', 'Require', true], ['off', "Don't require", false]] as const).map(([key, label, value]) => {
            const selected = !!umbrella.requires_client_approval === value && (umbrella.requires_client_approval !== null)
            return (
              <button key={key} disabled={!canManage || saving} onClick={() => saveRequiresClientApproval(value)}
                style={{ padding: '8px 14px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700, cursor: canManage ? 'pointer' : 'default', fontFamily: 'inherit', border: selected ? '1.5px solid var(--teal-mid)' : '1px solid var(--border)', background: selected ? 'var(--teal-light)' : 'var(--card)', color: selected ? 'var(--teal-mid)' : 'var(--ink2)' }}>
                {label}
              </button>
            )
          })}
        </div>
      </Card>

      {umbrella.children.length > 0 && (
        <Card padded>
          <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '10px' }}>Child Events ({umbrella.children.length})</div>
          <div style={{ display: 'grid', gap: '4px' }}>
            {umbrella.children.map(c => (
              <a key={c.id} href={`/admin/events/${c.id}/details`} style={{ fontSize: '13px', color: 'var(--teal-mid)', textDecoration: 'none', padding: '6px 0' }}>
                {c.name} <span style={{ fontSize: '11px', color: 'var(--ink4)' }}>· {c.client_name}</span>
              </a>
            ))}
          </div>
        </Card>
      )}

      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink)', margin: '24px 0 12px' }}>Reference Documents</div>
      <div style={{ marginBottom: '16px' }}>
        {canManage && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select value={uploadRole} onChange={e => setUploadRole(e.target.value as DocRole)}
              style={{ fontSize: '12px', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit' }}>
              {(Object.keys(DOC_ROLE_LABELS) as DocRole[]).map(r => <option key={r} value={r}>{DOC_ROLE_LABELS[r]}</option>)}
            </select>
            <label style={{ padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--lime)', color: 'var(--lime-dark)', fontSize: '13px', fontWeight: 800, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Uploading…' : 'Upload PDF ▲'}
              <input type="file" accept="application/pdf" disabled={saving} style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadDoc(f); e.target.value = '' }} />
            </label>
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
