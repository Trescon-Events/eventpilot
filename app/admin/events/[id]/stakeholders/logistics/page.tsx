'use client'

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Badge, Button, Card, Input, Select, Textarea } from '@/app/components/ui'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'
import { notify } from '@/app/lib/ui/notify'

/* Logistics — Arrival & Travel (2026-10-28) — speakers give flight, arrival and departure details through a private mobile link so DET can arrange airport reception (Marhaba).
   Switched on per event here. Setup (deadline, DET contact, Excel), then pick speakers (UAE-based hidden by default) and send; the table shows who has replied.
   The email is the producer's to edit; {{link}} becomes each speaker's own link, and their Additional Contacts are copied in so an assistant can fill it in too. */

type Status = 'not_invited' | 'invited' | 'submitted' | 'no_reception'
type Row = {
  speaker_id: string; name: string; company: string | null; country: string | null; producer: string | null; email_state: 'own' | 'contact' | 'none'; is_uae: boolean; status: Status; link: string | null
  travel: { arr_flight: string | null; arr_date: string | null; arr_time: string | null; dep_date: string | null; submitted_by: string | null; updated_at: string } | null
}
type Settings = { owner_staff_id?: string | null; enabled: boolean; deadline: string | null; det_name: string | null; det_email: string | null; det_link: string | null; det_sent_at: string | null }
type Filter = 'all' | Status

const STATUS = {
  not_invited: { text: 'Not emailed', color: 'grey' }, invited: { text: 'Waiting', color: 'amber' }, submitted: { text: 'Details in', color: 'teal' }, no_reception: { text: 'No reception needed', color: 'purple' },
} as const
const fmtDay = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '')

const toText = (html: string) => html.replace(/<\/p>\s*<p>/gi, '\n\n').replace(/<\/?(p|strong|em)>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/&amp;/g, '&').trim()
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const toHtml = (text: string) => text.trim().split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>').replace(/\{\{link\}\}/g, '<strong>{{link}}</strong>')}</p>`).join('')

export default function TravelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const [eventName, setEventName] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [defaultBody, setDefaultBody] = useState('')
  const [body, setBody] = useState('')
  const bodyTouched = useRef(false)
  const [deadline, setDeadline] = useState('')
  const [detName, setDetName] = useState('')
  const [detEmail, setDetEmail] = useState('')
  const [detNote, setDetNote] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [hideUae, setHideUae] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [find, setFind] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [tick, setTick] = useState(0)
  useBreadcrumbLabel(eventId, eventName)
  const reload = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    let live = true
    fetch(`/api/events/stakeholders/travel?event_id=${eventId}`).then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!live) return
      if (!r.ok) { setLoadError(d.error ?? 'Could not load this page.'); return }
      setSettings(d.settings); setRows(d.rows); setCanEdit(!!d.can_edit); setDefaultBody(d.default_body)
      setDeadline(d.settings.deadline ?? ''); setDetName(d.settings.det_name ?? ''); setDetEmail(d.settings.det_email ?? '')
      setOwnerId(d.settings.owner_staff_id ?? ''); setStaff(d.staff ?? []); setDetNote(n => n || d.default_det_note || '')
      setBody(b => (bodyTouched.current ? b : toText(d.default_body)))
    }).catch(() => live && setLoadError('Could not load this page.'))
    fetch(`/api/events?id=${eventId}`).then(r => r.json()).then(ed => { const ev = Array.isArray(ed) ? ed[0] : ed; if (live) setEventName(ev?.public_name || ev?.name || null) }).catch(() => undefined)
    return () => { live = false }
  }, [eventId, tick])

  async function saveSettings(patch: Record<string, unknown>, ok: string) {
    setBusy('settings')
    const r = await fetch('/api/events/stakeholders/travel', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, ...patch }) })
    const d = await r.json().catch(() => ({}))
    setBusy(null)
    if (!r.ok) { notify(d.error ?? 'Could not save.', 'error'); return }
    notify(ok); bodyTouched.current = false; reload()
  }

  const shown = useMemo(() => (rows ?? []).filter(r =>
    (!hideUae || !r.is_uae) && (filter === 'all' || r.status === filter) && (!find.trim() || `${r.name} ${r.company ?? ''} ${r.country ?? ''}`.toLowerCase().includes(find.trim().toLowerCase()))), [rows, hideUae, filter, find])
  const reachable = (rows ?? []).filter(r => picked.has(r.speaker_id) && r.email_state !== 'none')
  const counts = useMemo(() => {
    const c = { all: 0, not_invited: 0, invited: 0, submitted: 0, no_reception: 0 } as Record<Filter, number>
    for (const r of rows ?? []) if (!hideUae || !r.is_uae) { c.all++; c[r.status]++ }
    return c
  }, [rows, hideUae])
  const firstPicked = (rows ?? []).find(r => picked.has(r.speaker_id)) ?? null
  const toggle = (id: string) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const allShownPicked = shown.length > 0 && shown.every(r => picked.has(r.speaker_id))

  async function send() {
    setBusy('send'); setConfirm(false)
    const html = toHtml(body)
    const ids = reachable.map(r => r.speaker_id)
    let batch: string | undefined, sent = 0; const problems: string[] = []
    for (let i = 0; i < ids.length; i += 8) {
      const r = await fetch('/api/events/stakeholders/travel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, action: 'send', speaker_ids: ids.slice(i, i + 8), body_html: html, batch_id: batch }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { notify(d.errors?.[0]?.message ?? d.error ?? 'Could not send.', 'error'); break }
      batch = d.batch_id
      for (const x of d.results as { status: string; reason?: string; id: string }[]) { if (x.status === 'sent') sent++; else problems.push(`${rows?.find(q => q.speaker_id === x.id)?.name ?? 'A speaker'}: ${x.reason ?? x.status}`) }
    }
    setBusy(null)
    if (sent) notify(`Sent to ${sent} speaker${sent === 1 ? '' : 's'}.`)
    if (problems.length) notify(`Not sent — ${problems.slice(0, 3).join('; ')}${problems.length > 3 ? '…' : ''}`, 'error')
    setPicked(new Set()); reload()
  }

  async function sendDet() {
    setBusy('det')
    const save = await fetch('/api/events/stakeholders/travel', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, det_name: detName, det_email: detEmail, owner_staff_id: ownerId || null }) })
    if (!save.ok) { const d = await save.json().catch(() => ({})); setBusy(null); notify(d.error ?? 'Could not save the DET contact.', 'error'); return }
    const r = await fetch('/api/events/stakeholders/travel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, action: 'send_det', message: detNote }) })
    const d = await r.json().catch(() => ({}))
    setBusy(null)
    if (!r.ok) { notify(d.error ?? 'Could not send.', 'error'); return }
    notify('Sent to the DET contact.'); reload()
  }

  async function copy(text: string, what: string) { try { await navigator.clipboard.writeText(text); notify(`${what} copied.`) } catch { notify('Could not copy.', 'error') } }

  if (loadError) return <div style={{ padding: '32px', color: 'var(--red)' }}>{loadError}</div>
  if (!settings || !rows) return <div style={{ padding: '32px', color: 'var(--ink3)' }}>Loading…</div>

  const label = { display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--ink2)', marginBottom: '6px' } as const

  return (
    <div>
      <PageHeader eyebrow="Stakeholder Hub" title="Logistics" description="Arrival and travel details for DET airport reception: speakers share their flights on their phone. Switched on per event." />
      <div style={{ padding: '0 clamp(16px, 3vw, 32px) 60px', display: 'grid', gap: '16px' }}>

        <Card padded>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)' }}>{settings.enabled ? 'Switched on for this event' : 'Switched off for this event'}</div>
            <Badge color={settings.enabled ? 'teal' : 'grey'}>{settings.enabled ? 'On' : 'Off'}</Badge>
            <span style={{ flex: 1 }} />
            {canEdit && <Button variant={settings.enabled ? 'ghost' : 'lime'} disabled={busy === 'settings'} onClick={() => void saveSettings({ enabled: !settings.enabled }, settings.enabled ? 'Switched off. Speaker and DET links stop working.' : 'Switched on.')}>{settings.enabled ? 'Switch off' : 'Switch on'}</Button>}
          </div>
          {!settings.enabled && <p style={{ margin: '10px 0 0', fontSize: '14px', color: 'var(--ink3)', lineHeight: 1.6 }}>While this is off nothing can be sent, and any links already sent stop working. Your settings and the details speakers entered are kept.</p>}
        </Card>

        {settings.enabled && (
          <>
            <Card padded>
              <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '12px' }}>Setup</div>
              <div style={{ maxWidth: '260px' }}><label style={label}>Deadline for speakers</label><Input type="date" value={deadline} disabled={!canEdit} onChange={e => setDeadline(e.target.value)} /></div>
              <div style={{ marginTop: '16px', maxWidth: '360px' }}>
                <label style={label}>Module owner</label>
                <Select value={ownerId} disabled={!canEdit} onChange={e => setOwnerId(e.target.value)}>
                  <option value="">Choose the owner…</option>
                  {staff.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                </Select>
                <p style={{ margin: '8px 0 0', fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6 }}>The owner is notified in EventPilot and by email whenever a speaker submits or changes their details, and the email to the DET contact is sent from the owner’s own address and signed by them, so DET knows who to contact. Each speaker’s own producer is also notified in EventPilot.</p>
              </div>
              {canEdit && <div style={{ marginTop: '14px' }}><Button variant="lime" disabled={busy === 'settings'} onClick={() => void saveSettings({ deadline: deadline || null, owner_staff_id: ownerId || null }, 'Saved.')}>Save</Button></div>}
            </Card>

            <Card padded>
              <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Share with DET</div>
              <p style={{ margin: '0 0 12px', fontSize: '13.5px', color: 'var(--ink3)', lineHeight: 1.6 }}>Sent from the module owner’s own email address, so DET can reply to them directly. It is a short note with a link to a live, read-only page of all the arrival and departure details. It updates by itself as speakers submit, so you only need to send it once. You can also download the same details as Excel at any time.</p>
              <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <div><label style={label}>DET contact name</label><Input value={detName} disabled={!canEdit} onChange={e => setDetName(e.target.value)} placeholder="Name" /></div>
                <div><label style={label}>DET contact email</label><Input type="email" value={detEmail} disabled={!canEdit} onChange={e => setDetEmail(e.target.value)} placeholder="name@det.gov.ae" /></div>
              </div>
              {canEdit && (
                <div style={{ marginTop: '14px', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', background: 'var(--surface)' }}>
                  <div style={{ padding: '12px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border-light)', fontSize: '14.5px', color: 'var(--ink2)' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink4)', marginRight: '10px' }}>Added automatically</span>
                    Dear {detName.trim() || '[DET contact]'},
                  </div>
                  <Textarea rows={5} value={detNote} onChange={e => setDetNote(e.target.value)} aria-label="Note to the DET contact" style={{ display: 'block', width: '100%', boxSizing: 'border-box', border: 'none', borderRadius: 0, padding: '14px 16px', fontSize: '15px', lineHeight: 1.7, background: 'var(--card)', resize: 'vertical' }} />
                  <div style={{ padding: '12px 16px', background: 'var(--surface2)', borderTop: '1px solid var(--border-light)', fontSize: '14.5px', color: 'var(--ink2)', lineHeight: 1.6 }}>
                    <span style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: '6px' }}>Added automatically</span>
                    A button linking to the live speaker arrivals page<br />Kind regards,<br /><strong>{staff.find(x => x.id === ownerId)?.name ?? '[Module owner]'}</strong> (with their job title and email)
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '14px' }}>
                {canEdit && <Button variant="lime" disabled={!!busy || !detEmail.trim() || !ownerId} title={ownerId ? '' : 'Choose the module owner in Setup and save first'} onClick={() => void sendDet()}>{busy === 'det' ? 'Sending…' : settings.det_sent_at ? 'Send to DET again' : 'Send to DET'}</Button>}
                {settings.det_link && <Button variant="ghost" onClick={() => void copy(settings.det_link!, 'DET link')}>Copy live link</Button>}
                <Button variant="ghost" href={`/api/events/stakeholders/travel?event_id=${eventId}&format=xlsx`}>Download Excel</Button>
              </div>
              {settings.det_sent_at && <p style={{ margin: '10px 0 0', fontSize: '13px', color: 'var(--ink3)' }}>Last sent to the DET contact {new Date(settings.det_sent_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. The link stays live; there is no need to send it again when more speakers submit.</p>}
            </Card>

            <Card padded>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>Speakers</div>
                <Input style={{ maxWidth: '240px' }} placeholder="Search name, company, country" value={find} onChange={e => setFind(e.target.value)} />
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13.5px', color: 'var(--ink2)', cursor: 'pointer' }}><input type="checkbox" checked={hideUae} onChange={e => setHideUae(e.target.checked)} /> Hide UAE-based speakers</label>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                {([['all', 'All'], ['not_invited', 'Not emailed'], ['invited', 'Waiting'], ['submitted', 'Details in'], ['no_reception', 'No reception needed']] as [Filter, string][]).map(([k, text]) => (
                  <button key={k} onClick={() => setFilter(k)} style={{ padding: '6px 14px', borderRadius: '20px', border: '1.5px solid var(--border)', background: filter === k ? 'var(--ink)' : 'transparent', color: filter === k ? 'var(--card)' : 'var(--ink2)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{text} {counts[k]}</button>
                ))}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead><tr style={{ textAlign: 'left', color: 'var(--ink3)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    <th style={{ padding: '8px' }}>{canEdit && <input type="checkbox" checked={allShownPicked} onChange={e => setPicked(p => { const n = new Set(p); for (const r of shown) { if (e.target.checked) n.add(r.speaker_id); else n.delete(r.speaker_id) } return n })} aria-label="Select all shown" />}</th>
                    <th style={{ padding: '8px' }}>Speaker</th><th style={{ padding: '8px' }}>Country</th><th style={{ padding: '8px' }}>Email</th><th style={{ padding: '8px' }}>Status</th><th style={{ padding: '8px' }}>Arrival</th><th style={{ padding: '8px' }}></th>
                  </tr></thead>
                  <tbody>
                    {shown.length === 0 && <tr><td colSpan={7} style={{ padding: '16px 8px', color: 'var(--ink3)' }}>No speakers match.</td></tr>}
                    {shown.map(r => (
                      <tr key={r.speaker_id} style={{ borderTop: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '8px' }}>{canEdit && <input type="checkbox" checked={picked.has(r.speaker_id)} onChange={() => toggle(r.speaker_id)} aria-label={`Select ${r.name}`} />}</td>
                        <td style={{ padding: '8px' }}><strong style={{ color: 'var(--ink)' }}>{r.name}</strong><div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>{r.company}</div></td>
                        <td style={{ padding: '8px', color: 'var(--ink2)' }}>{r.country ?? ''}</td>
                        <td style={{ padding: '8px' }}>{r.email_state === 'none' ? <Badge color="red">No email</Badge> : r.email_state === 'contact' ? <Badge color="amber">Via contact</Badge> : <Badge color="teal">Has email</Badge>}</td>
                        <td style={{ padding: '8px' }}><Badge color={STATUS[r.status].color}>{STATUS[r.status].text}</Badge></td>
                        <td style={{ padding: '8px', color: 'var(--ink2)', fontSize: '13px' }}>{r.status === 'submitted' && r.travel ? <>{r.travel.arr_flight} · {fmtDay(r.travel.arr_date)} {r.travel.arr_time}<div style={{ color: 'var(--ink3)' }}>by {r.travel.submitted_by}</div></> : ''}</td>
                        <td style={{ padding: '8px' }}>{r.link && <Button variant="ghost" onClick={() => void copy(r.link!, 'Speaker link')}>Copy link</Button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {canEdit && (
              <Card padded>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>The email</div>
                <p style={{ margin: '0 0 14px', fontSize: '13.5px', color: 'var(--ink3)', lineHeight: 1.6 }}>Edit the middle part freely. <strong>{'{{link}}'}</strong> becomes each speaker’s own link. The greeting and sign-off (shaded) are added for every speaker automatically, and the email goes out as that speaker’s producer with their Additional Contacts copied in, so an assistant can fill it in too.</p>
                <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', background: 'var(--surface)' }}>
                  <div style={{ padding: '14px 18px', background: 'var(--surface2)', borderBottom: '1px solid var(--border-light)', fontSize: '15px', color: 'var(--ink2)' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink4)', marginRight: '10px' }}>Added automatically</span>
                    Dear {firstPicked ? firstPicked.name : '[Speaker name]'},
                  </div>
                  <Textarea rows={12} value={body} onChange={e => { setBody(e.target.value); bodyTouched.current = true }} aria-label="Email message" style={{ display: 'block', width: '100%', boxSizing: 'border-box', border: 'none', borderRadius: 0, padding: '16px 18px', fontSize: '15px', lineHeight: 1.7, background: 'var(--card)', resize: 'vertical' }} />
                  <div style={{ padding: '14px 18px', background: 'var(--surface2)', borderTop: '1px solid var(--border-light)', fontSize: '15px', color: 'var(--ink2)', lineHeight: 1.6 }}>
                    <span style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: '6px' }}>Added automatically</span>
                    Warm regards,<br /><strong>{firstPicked?.producer ?? '[Producer name]'}</strong>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '12px' }}>
                  <Button variant="lime" disabled={!!busy || reachable.length === 0 || !body.includes('{{link}}')} onClick={() => setConfirm(true)}>{busy === 'send' ? 'Sending…' : `Send to ${reachable.length} selected speaker${reachable.length === 1 ? '' : 's'}`}</Button>
                  <Button variant="ghost" disabled={body === toText(defaultBody)} onClick={() => { setBody(toText(defaultBody)); bodyTouched.current = false }}>Reset to the standard wording</Button>
                  {picked.size > reachable.length && <span style={{ fontSize: '13px', color: 'var(--amber)' }}>{picked.size - reachable.length} selected have no email address and will be skipped.</span>}
                  {!body.includes('{{link}}') && <span style={{ fontSize: '13px', color: 'var(--red)' }}>The email needs {'{{link}}'} in it.</span>}
                </div>
              </Card>
            )}
          </>
        )}
      </div>

      {confirm && (
        <div onClick={() => setConfirm(false)} style={{ position: 'fixed', inset: 0, background: 'var(--overlay-scrim)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px', width: 'min(460px, 100%)' }}>
            <div style={{ fontSize: '17px', fontWeight: 900, color: 'var(--ink)', marginBottom: '8px' }}>Send this email?</div>
            <div style={{ fontSize: '14px', color: 'var(--ink2)', lineHeight: 1.6, marginBottom: '16px' }}>It goes to {reachable.length} speaker{reachable.length === 1 ? '' : 's'}, each with their own link, and their Additional Contacts are copied in. This cannot be undone.</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
              <Button variant="lime" onClick={() => void send()}>Send</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
