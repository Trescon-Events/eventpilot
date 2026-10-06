'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { Badge, Button, Card, Input, Toast } from '@/app/components/ui'
import { permissionSetSatisfies } from '@/app/lib/access/permission-match'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'
import TemplatesCard, { type TemplateInfo } from './TemplatesCard'

/* Guest Invites (2026-10-06) — speakers invite their own guests through a personal KonfHub
   registration link (a code with a cap, made by the delegate team). This page holds the
   event's settings, its two generated emails (invite + reminder) and an overview of every speaker: link, usage, what's been sent. Sending to one speaker
   happens on that speaker's "Guest Invite" tab. EventPilot only stores links and reads
   KonfHub for usage — it never creates or edits codes. */

type Settings = { pass_name: string; deadline: string | null }
type Row = {
  id: string; name: string; email: string | null; status: 'missing' | 'ready' | 'sent'; url: string | null; code: string | null
  code_found: boolean | null; ticket_name: string | null; limit: number | null; used: number | null; available: number | null; usage_checked_at: string | null
  sent_at: string | null; sent_count: number; reminder_sent_at: string | null; reminder_count: number
}
type Kind = 'guest_invite' | 'guest_invite_reminder'

const STATUS = { missing: { text: 'No link', color: 'red' }, ready: { text: 'Ready to send', color: 'amber' }, sent: { text: 'Sent', color: 'teal' } } as const
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')

export default function GuestInvitesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const [eventName, setEventName] = useState<string | null>(null)
  const [perms, setPerms] = useState<Set<string>>(new Set())
  const [settings, setSettings] = useState<Settings | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [tpl, setTpl] = useState<{ templates: Record<Kind, TemplateInfo>; variables: { key: string; label: string; kinds: Kind[] }[] } | null>(null)
  const [draftSettings, setDraftSettings] = useState<Settings | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  useBreadcrumbLabel(eventId, eventName)
  const say = (text: string, type: 'success' | 'error' = 'success') => setToast({ text, type })
  const canEdit = permissionSetSatisfies(perms, 'sae.stakeholders.edit')

  const load = useCallback(async () => {
    const [ovRes, tplRes, permRes, evRes] = await Promise.all([
      fetch(`/api/events/guest-invites/overview?event_id=${eventId}`), fetch(`/api/events/guest-invites/template?event_id=${eventId}`),
      fetch(`/api/events/access/me?event_id=${eventId}`), fetch(`/api/events?id=${eventId}`),
    ])
    const ov = await ovRes.json().catch(() => ({})); const t = await tplRes.json().catch(() => ({}))
    if (ovRes.ok) { setSettings(ov.settings); setDraftSettings(cur => cur ?? ov.settings); setRows(ov.speakers) } else setRows([])
    if (tplRes.ok) setTpl({ templates: t.templates, variables: t.variables })
    setPerms(new Set((await permRes.json().catch(() => ({ permissions: [] }))).permissions ?? []))
    setEventName((await evRes.json().catch(() => null))?.name ?? null)
  }, [eventId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
  useEffect(() => { void load() }, [load])

  async function saveSettings() {
    if (!draftSettings) return
    const res = await fetch(`/api/events/guest-invites/settings?event_id=${eventId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draftSettings) })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { say(d.error ?? 'Could not save.', 'error'); return }
    setSettings(d); setDraftSettings(d); say('Settings saved.')
  }

  async function refreshUsage() {
    setRefreshing(true)
    const res = await fetch('/api/events/guest-invites/usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId }) })
    const d = await res.json().catch(() => ({}))
    setRefreshing(false)
    if (!res.ok) { say(d.error ?? 'Could not read KonfHub.', 'error'); return }
    say(`Checked ${d.checked} speaker${d.checked === 1 ? '' : 's'} against KonfHub.`); void load()
  }

  const dirtySettings = !!(settings && draftSettings && (settings.pass_name !== draftSettings.pass_name || settings.deadline !== draftSettings.deadline))
  const counts = rows ? { missing: rows.filter(r => r.status === 'missing').length, ready: rows.filter(r => r.status === 'ready').length, sent: rows.filter(r => r.status === 'sent').length } : null

  return (
    <div>
      <PageHeader
        eyebrow="Stakeholder Hub"
        title="Guest Invites"
        description="Each speaker gets a personal KonfHub registration link to invite their own guests. Set it up once per event, then add each speaker’s link and send from their Guest Invite tab."
        backHref={`/admin/events/${eventId}/stakeholders`}
        backLabel="Back to Stakeholder Hub"
      />
      <Toast message={toast?.text ?? null} type={toast?.type} onClose={() => setToast(null)} />
      <div style={{ padding: '20px 32px 48px', maxWidth: '1180px', display: 'grid', gap: '18px' }}>

        <Card padded>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '12px' }}>1 · Settings</div>
          {draftSettings && (
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label style={{ display: 'grid', gap: '4px', fontSize: '11.5px', fontWeight: 700, color: 'var(--ink3)' }}>Pass name
                <Input value={draftSettings.pass_name} disabled={!canEdit} onChange={e => setDraftSettings({ ...draftSettings, pass_name: e.target.value })} style={{ width: '200px' }} /></label>
              <label style={{ display: 'grid', gap: '4px', fontSize: '11.5px', fontWeight: 700, color: 'var(--ink3)' }}>Registration deadline
                <Input type="date" value={draftSettings.deadline ?? ''} disabled={!canEdit} onChange={e => setDraftSettings({ ...draftSettings, deadline: e.target.value || null })} style={{ width: '170px' }} /></label>
              {canEdit && dirtySettings && <Button variant="teal" onClick={saveSettings}>Save settings</Button>}
            </div>
          )}
          <div style={{ fontSize: '12px', color: 'var(--ink4)', marginTop: '10px', lineHeight: 1.6 }}>
            How many guests each speaker may invite isn’t set here — the delegate team sets the limit on each speaker’s code on KonfHub, and EventPilot reads it when the link is saved.
            Event name, dates and venue come from <Link href={`/admin/events/${eventId}/details`} style={{ color: 'var(--teal-mid)', fontWeight: 700 }}>Event Details</Link>.
          </div>
        </Card>

        <Card padded>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '12px' }}>2 · The emails</div>
          {tpl ? <TemplatesCard eventId={eventId} templates={tpl.templates} variables={tpl.variables} canEdit={canEdit} onSaved={load} say={say} /> : <div style={{ color: 'var(--ink3)' }}>Loading…</div>}
        </Card>

        <Card padded>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>3 · Speakers {counts && <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--ink3)' }}>· {counts.sent} sent · {counts.ready} ready · {counts.missing} without a link</span>}</div>
            {canEdit && <Button variant="ghost" onClick={refreshUsage} disabled={refreshing}>{refreshing ? 'Reading KonfHub…' : 'Refresh from KonfHub'}</Button>}
          </div>
          {!rows ? <div style={{ color: 'var(--ink3)' }}>Loading…</div> : rows.length === 0 ? <div style={{ color: 'var(--ink3)' }}>No speakers yet.</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead><tr style={{ textAlign: 'left', color: 'var(--ink3)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  {['Speaker', 'Status', 'Code', 'Pass type', 'Passes available', 'Invite sent', 'Reminder sent', ''].map(h => <th key={h} style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--ink)' }}>{r.name}{!r.email && <span title="No email on file" style={{ marginLeft: '6px', color: 'var(--amber)' }}>⚠ no email</span>}</td>
                      <td style={{ padding: '8px 10px' }}><Badge color={STATUS[r.status].color}>{STATUS[r.status].text}</Badge></td>
                      <td style={{ padding: '8px 10px', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '12px', color: 'var(--ink2)' }}>{r.code ?? '—'}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--ink3)', fontSize: '12.5px' }}>{r.code ? (r.code_found === false ? <span style={{ color: 'var(--red)' }}>not on KonfHub</span> : r.ticket_name ?? <span style={{ color: 'var(--ink4)' }}>not read</span>) : '—'}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--ink2)' }}>{r.code && r.code_found !== false ? (r.limit === null ? <span style={{ color: 'var(--ink4)' }}>—</span> : <><strong style={{ color: r.available === 0 ? 'var(--amber)' : 'var(--ink)' }}>{r.available ?? '?'}</strong> of {r.limit}{r.usage_checked_at && <span style={{ color: 'var(--ink4)' }}> · {fmt(r.usage_checked_at)}</span>}</>) : '—'}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--ink3)' }}>{fmt(r.sent_at)}{r.sent_count > 1 ? ` (×${r.sent_count})` : ''}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--ink3)' }}>{fmt(r.reminder_sent_at)}{r.reminder_count > 1 ? ` (×${r.reminder_count})` : ''}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}><Link href={`/admin/events/${eventId}/stakeholders/${r.id}?tab=guest`} style={{ color: 'var(--teal-mid)', fontWeight: 700, fontSize: '12.5px', textDecoration: 'none' }}>Open →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
