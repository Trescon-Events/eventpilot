'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { Badge, Button, Card, Input, Toast } from '@/app/components/ui'
import { permissionSetSatisfies } from '@/app/lib/access/permission-match'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'
import TemplatesCard, { type TemplateInfo } from './TemplatesCard'
import BulkSendDialog from './BulkSendDialog'

/* Guest Invites (2026-10-06) — speakers invite their own guests through a personal KonfHub
   registration link (a code with a cap, made by the delegate team). This page holds the
   event's settings, its two generated emails (invite + reminder) and an overview of every speaker: link, usage, what's been sent. Send to many speakers
   here, or to one from that speaker's "Guest Invite" tab. EventPilot only stores links and reads
   KonfHub for usage — it never creates or edits codes. */

type Settings = { pass_name: string; deadline: string | null }
type Row = {
  id: string; name: string; email: string | null; to: string | null; cc: string[]; blocked: string | null; can_invite: boolean; can_remind: boolean; status: 'missing' | 'ready' | 'sent'; url: string | null; code: string | null
  code_found: boolean | null; ticket_name: string | null; limit: number | null; used: number | null; available: number | null; usage_checked_at: string | null
  sent_at: string | null; sent_count: number; reminder_sent_at: string | null; reminder_count: number
}
type Kind = 'guest_invite' | 'guest_invite_reminder'
type Send = { id: string; speaker_id: string; kind: Kind; to_email: string; cc_emails: string[]; status: 'sent' | 'failed'; error: string | null; used_at_send: number | null; limit_at_send: number | null; bulk_batch_id: string | null; created_at: string }
type Filter = 'all' | 'ready' | 'invited' | 'remind' | 'blocked'

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
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulk, setBulk] = useState<'invite' | 'reminder' | null>(null)
  const [sends, setSends] = useState<Send[] | null>(null)
  const [showHistory, setShowHistory] = useState(false)
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
    const hist = await fetch(`/api/events/guest-invites/history?event_id=${eventId}`).then(r => r.json()).catch(() => null)
    setSends(hist?.sends ?? [])
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

  const inFilter = (r: Row) => filter === 'all' ? true : filter === 'ready' ? r.can_invite : filter === 'invited' ? !!r.sent_at : filter === 'remind' ? r.can_remind : !!r.blocked
  const shown = rows?.filter(inFilter) ?? []
  const seg = rows ? { ready: rows.filter(r => r.can_invite).length, invited: rows.filter(r => r.sent_at).length, remind: rows.filter(r => r.can_remind).length, blocked: rows.filter(r => r.blocked).length } : null
  const pickFilter = (f: Filter) => { setFilter(f); setSelected(new Set(rows?.filter(r => f === 'ready' ? r.can_invite : f === 'remind' ? r.can_remind : false).map(r => r.id) ?? [])) }
  const selectable = shown.filter(r => r.can_invite || r.can_remind)
  const toggle = (id: string) => setSelected(cur => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const picked = (kind: 'invite' | 'reminder') => (rows ?? []).filter(r => selected.has(r.id) && (kind === 'invite' ? r.can_invite : r.can_remind))
  const nameOf = (id: string) => rows?.find(r => r.id === id)?.name ?? 'Speaker'
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
          {seg && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px', alignItems: 'center' }}>
              {([['all', `All ${rows?.length ?? 0}`], ['ready', `Not yet invited ${seg.ready}`], ['invited', `Invited ${seg.invited}`], ['remind', `Reminder due ${seg.remind}`], ['blocked', `Can’t send ${seg.blocked}`]] as [Filter, string][]).map(([f, label]) => (
                <button key={f} onClick={() => pickFilter(f)} style={{ padding: '4px 12px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', border: `1px solid ${filter === f ? 'var(--teal-mid)' : 'var(--border)'}`, background: filter === f ? 'var(--teal-light)' : 'none', color: filter === f ? 'var(--teal-mid)' : 'var(--ink2)' }}>{label}</button>
              ))}
              {canEdit && selectable.length > 0 && (
                <span style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button onClick={() => setSelected(selectable.every(r => selected.has(r.id)) ? new Set() : new Set(selectable.map(r => r.id)))} style={{ background: 'none', border: 'none', color: 'var(--teal-mid)', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer' }}>{selectable.every(r => selected.has(r.id)) ? 'Clear selection' : 'Select all shown'}</button>
                </span>
              )}
            </div>
          )}
          {canEdit && (picked('invite').length > 0 || picked('reminder').length > 0) && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', marginBottom: '10px', borderRadius: '10px', background: 'var(--card-hi)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '13px', color: 'var(--ink2)' }}><strong>{selected.size}</strong> selected</span>
              {picked('invite').length > 0 && <Button variant="teal" onClick={() => setBulk('invite')} disabled={!tpl?.templates.guest_invite}>{`Send invite to ${picked('invite').length}`}</Button>}
              {picked('reminder').length > 0 && <Button variant="teal" onClick={() => setBulk('reminder')} disabled={!tpl?.templates.guest_invite_reminder}>{`Send reminder to ${picked('reminder').length}`}</Button>}
              <Button variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
              {(!tpl?.templates.guest_invite || !tpl?.templates.guest_invite_reminder) && <span style={{ fontSize: '12px', color: 'var(--amber)' }}>Save the {!tpl?.templates.guest_invite ? 'invite' : 'reminder'} email above before sending it.</span>}
            </div>
          )}
          {!rows ? <div style={{ color: 'var(--ink3)' }}>Loading…</div> : rows.length === 0 ? <div style={{ color: 'var(--ink3)' }}>No speakers yet.</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead><tr style={{ textAlign: 'left', color: 'var(--ink3)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  {['', 'Speaker', 'Status', 'Recipients', 'Code', 'Pass type', 'Passes available', 'Invite sent', 'Reminder sent', ''].map(h => <th key={h} style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {shown.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '8px 6px 8px 10px' }}>{canEdit && <input type="checkbox" aria-label={`Select ${r.name}`} disabled={!r.can_invite && !r.can_remind} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--ink)' }}>{r.name}{!r.email && (r.to ? <span title="No email on file for the speaker — goes to their first additional contact" style={{ marginLeft: '6px', color: 'var(--amber)' }}>via contact</span> : <span title="No email on file" style={{ marginLeft: '6px', color: 'var(--amber)' }}>⚠ no email</span>)}</td>
                      <td style={{ padding: '8px 10px' }}><Badge color={STATUS[r.status].color}>{STATUS[r.status].text}</Badge>{r.blocked && r.status !== 'missing' && <div style={{ fontSize: '11.5px', color: 'var(--amber)', marginTop: '3px' }}>{r.blocked}</div>}</td>
                      <td style={{ padding: '8px 10px', fontSize: '12px', color: 'var(--ink3)', maxWidth: '220px', overflowWrap: 'anywhere' }}>{r.to ?? '—'}{r.cc.length > 0 && <span style={{ color: 'var(--ink4)' }}> +{r.cc.length} cc</span>}</td>
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
          {rows && rows.length > 0 && shown.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>No speakers in this view.</div>}
        </Card>

        <Card padded>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>4 · Send history {sends && <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--ink3)' }}>· {sends.filter(s => s.status === 'sent').length} sent{sends.some(s => s.status === 'failed') ? ` · ${sends.filter(s => s.status === 'failed').length} failed` : ''}</span>}</div>
            <Button variant="ghost" onClick={() => setShowHistory(v => !v)}>{showHistory ? 'Hide' : 'Show'}</Button>
          </div>
          {showHistory && (!sends || sends.length === 0 ? <div style={{ color: 'var(--ink3)', fontSize: '13px', marginTop: '10px' }}>Nothing sent yet.</div> : (
            <div style={{ display: 'grid', gap: '4px', marginTop: '10px' }}>
              {sends.map(s => (
                <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '130px minmax(0,1.1fr) 90px minmax(0,1.6fr) auto', gap: '10px', fontSize: '12.5px', padding: '6px 10px', borderRadius: '8px', background: 'var(--card-hi)', alignItems: 'center' }}>
                  <span style={{ color: 'var(--ink3)' }}>{fmt(s.created_at)}</span>
                  <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{nameOf(s.speaker_id)}</span>
                  <span style={{ color: 'var(--ink2)' }}>{s.kind === 'guest_invite' ? 'Invite' : 'Reminder'}{s.bulk_batch_id ? ' · bulk' : ''}</span>
                  <span style={{ color: 'var(--ink3)', overflowWrap: 'anywhere' }}>{s.to_email}{s.cc_emails.length > 0 && <span style={{ color: 'var(--ink4)' }}> · cc {s.cc_emails.join(', ')}</span>}{s.status === 'failed' && s.error && <span style={{ color: 'var(--red)' }}> — {s.error}</span>}</span>
                  <span style={{ color: s.status === 'sent' ? 'var(--teal-mid)' : 'var(--red)' }}>{s.status === 'sent' ? (s.used_at_send !== null && s.limit_at_send !== null ? `✓ ${s.used_at_send}/${s.limit_at_send} used` : '✓ Sent') : 'Failed'}</span>
                </div>
              ))}
            </div>
          ))}
        </Card>
      </div>
      {bulk && rows && (
        <BulkSendDialog eventId={eventId} kind={bulk} deadlineText={settings?.deadline ? new Date(settings.deadline + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'on the date set above'}
          rows={picked(bulk).map(r => ({ id: r.id, name: r.name, to: r.to, cc: r.cc, available: r.available, limit: r.limit, sent_at: r.sent_at }))}
          onClose={() => { setBulk(null); setSelected(new Set()) }} onFinished={() => void load()} />
      )}
    </div>
  )
}
