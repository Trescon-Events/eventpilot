'use client'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Badge, Button, Card, Input, Select, Textarea } from '@/app/components/ui'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'
import { downloadFormattedXlsx } from '@/app/lib/export/formatted-xlsx'
import { toMinutes, fromMinutes, describeWindows, type MediaDay, type MediaWindow } from '@/app/lib/pr/windows'

/* PR & Media (2026-10-21): what the event's PR person works from. Responses = every speaker with their media-interview answer; Availability = per day,
   who is free when; Settings = PR contacts, the days/hours the speaker form offers, and the line speakers see about who contacts them.
   Asking speakers happens in the Stakeholder Hub (bulk action "Request media interest"). */

type State = 'not_asked' | 'asked' | 'interested' | 'declined'
type Row = { speaker_id: string; name: string; company: string | null; role: string | null; producer: string | null; request_id: string | null; state: State; windows: MediaWindow[]; note: string | null; pr_note: string | null; sent_at: string | null; submitted_at: string | null; last_opened_at: string | null; reminder_count: number; expired: boolean }
type Person = { id: string; name: string; email: string; role?: string | null }
type Settings = { contacts: Person[]; contacts_assigned: boolean; candidates: Person[]; days: MediaDay[]; suggestion: { days: MediaDay[]; source: string }; intro: string | null; days_confirmed_at: string | null; timezone: string }

const TONE: Record<State, { label: string; color: 'grey' | 'amber' | 'teal' | 'red' }> = { not_asked: { label: 'Not asked', color: 'grey' }, asked: { label: 'Waiting for answer', color: 'amber' }, interested: { label: 'Interested', color: 'teal' }, declined: { label: 'Not available', color: 'red' } }
const fmtDay = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : ''

export default function PrMediaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const [tab, setTab] = useState<'responses' | 'availability' | 'settings'>('responses')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [eventName, setEventName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null)
  const [filter, setFilter] = useState<'all' | State>('all')
  const [search, setSearch] = useState('')
  useBreadcrumbLabel(eventId, eventName)

  const [tick, setTick] = useState(0)
  const load = useCallback(async () => { setTick(t => t + 1) }, [])
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [a, b, e] = await Promise.all([fetch(`/api/events/pr/requests?event_id=${eventId}`), fetch(`/api/events/pr/settings?event_id=${eventId}`), fetch(`/api/events?id=${eventId}`)])
      const ad = await a.json().catch(() => ({})), bd = await b.json().catch(() => ({})), ed = await e.json().catch(() => ({}))
      if (cancelled) return
      if (!a.ok) { setError(ad.error ?? 'Could not load PR & Media.'); setRows([]); return }
      setRows(ad.rows); if (b.ok) setSettings(bd)
      const ev = Array.isArray(ed) ? ed[0] : ed; setEventName(ev?.public_name || ev?.name || null)
    })()
    return () => { cancelled = true }
  }, [eventId, tick])

  const say = (text: string, ok = true) => setToast({ text, ok })
  const counts = useMemo(() => { const c = { not_asked: 0, asked: 0, interested: 0, declined: 0 }; for (const r of rows ?? []) c[r.state]++; return c }, [rows])
  const shown = (rows ?? []).filter(r => (filter === 'all' || r.state === filter) && (!search.trim() || `${r.name} ${r.company ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())))

  async function remind(r: Row) {
    const res = await fetch(`/api/events/pr/requests/${r.request_id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'remind' }) })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { say(d.error ?? 'Could not send the reminder.', false); return }
    say(`Reminder sent to ${r.name}.`); void load()
  }
  async function saveNote(r: Row, text: string) {
    if (text === (r.pr_note ?? '')) return
    const res = await fetch(`/api/events/pr/requests/${r.request_id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pr_note: text }) })
    if (!res.ok) { say('Could not save the note.', false); return }
    setRows(prev => prev?.map(x => x.speaker_id === r.speaker_id ? { ...x, pr_note: text || null } : x) ?? prev)
  }
  async function exportXlsx() {
    const list = (rows ?? []).filter(r => r.state !== 'not_asked')
    await downloadFormattedXlsx({
      filename: `media-availability-${new Date().toISOString().slice(0, 10)}.xlsx`, sheetName: 'Media availability', title: `${eventName ? `${eventName} — ` : ''}Media interview availability`,
      subtitle: `${list.length} speaker${list.length === 1 ? '' : 's'} asked · times are event time (${settings?.timezone ?? ''})`,
      columns: [{ header: 'Speaker', width: 26 }, { header: 'Company', width: 26 }, { header: 'Status', width: 18 }, { header: 'Available', width: 48 }, { header: 'Speaker note', width: 40 }, { header: 'PR note', width: 40 }, { header: 'Producer', width: 20 }],
      rows: list.map(r => [r.name, r.company ?? '', TONE[r.state].label, [...new Set(r.windows.map(w => w.date))].map(d => `${fmtDay(d)}: ${describeWindows(r.windows.filter(w => w.date === d))}`).join('\n'), r.note ?? '', r.pr_note ?? '', r.producer ?? '']),
      tone: (h, v) => h !== 'Status' ? undefined : v === 'Interested' ? 'teal' : v === 'Not available' ? 'red' : v === 'Waiting for answer' ? 'amber' : 'grey',
    })
  }

  const needsSetup = settings && (!settings.days.length || !settings.days_confirmed_at || !settings.contacts.length)
  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader eyebrow="PR & Media" title="Media interview availability" backHref={`/admin/events/${eventId}`} backLabel="Event workspace"
        description="Speakers who are open to media bites or interviews, and the times they are free. Ask speakers from the Stakeholder Hub (select speakers › Actions › Request media interest)." />
      <div style={{ padding: '20px 32px 60px', maxWidth: '1100px' }}>
        {error && <div style={{ color: 'var(--red)', fontSize: '14px', marginBottom: '12px' }}>{error}</div>}
        {toast && <div role="status" style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', fontSize: '13.5px', background: toast.ok ? 'var(--teal-light)' : 'var(--red-light)', border: `1px solid ${toast.ok ? 'var(--teal)' : 'var(--red-border)'}`, color: toast.ok ? 'var(--teal)' : 'var(--red)' }}>{toast.text} <button onClick={() => setToast(null)} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700 }}>×</button></div>}
        {needsSetup && (
          <div style={{ marginBottom: '14px', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--amber)', background: 'var(--amber-light)', color: 'var(--ink)', fontSize: '13.5px', lineHeight: 1.5 }}>
            Before producers can ask speakers: {[!settings.contacts.length && 'choose the PR contact', !settings.days.length ? 'add the media days and hours' : !settings.days_confirmed_at && 'confirm the media days and hours'].filter(Boolean).join(' and ')}. Do it under <button onClick={() => setTab('settings')} style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', fontWeight: 800, padding: 0, fontFamily: 'inherit', fontSize: 'inherit' }}>Settings</button>.
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {(['responses', 'availability', 'settings'] as const).map(t => <Button key={t} variant={tab === t ? 'teal' : 'ghost'} onClick={() => setTab(t)}>{t === 'responses' ? 'Responses' : t === 'availability' ? 'Availability' : 'Settings'}</Button>)}
          <div style={{ flex: 1 }} />
          {tab === 'responses' && <Button variant="ghost" onClick={exportXlsx} disabled={!rows?.some(r => r.state !== 'not_asked')}>Download Excel</Button>}
        </div>

        {tab === 'responses' && (
          <>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
              {(['all', 'interested', 'asked', 'declined', 'not_asked'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 12px', borderRadius: '999px', border: '1.5px solid var(--border)', background: filter === f ? 'var(--ink)' : 'transparent', color: filter === f ? 'var(--card)' : 'var(--ink2)', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {f === 'all' ? `All ${rows?.length ?? 0}` : `${TONE[f].label} ${counts[f]}`}
                </button>
              ))}
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search speaker or company" style={{ width: '220px', marginLeft: 'auto' }} />
            </div>
            {rows === null ? <div style={{ color: 'var(--ink3)' }}>Loading…</div> : shown.length === 0 ? <div style={{ color: 'var(--ink3)', fontSize: '14px' }}>Nobody matches.</div> : (
              <div style={{ display: 'grid', gap: '10px' }}>
                {shown.map(r => (
                  <Card key={r.speaker_id} padded>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 800, fontSize: '15px' }}>{r.name}</div>
                      <Badge color={TONE[r.state].color}>{TONE[r.state].label}</Badge>
                      {r.expired && r.state === 'asked' && <Badge color="red">Link expired</Badge>}
                      <div style={{ color: 'var(--ink3)', fontSize: '12.5px' }}>{[r.role, r.company].filter(Boolean).join(' · ')}</div>
                      <div style={{ flex: 1 }} />
                      {r.state === 'asked' && <Button variant="ghost" onClick={() => remind(r)}>Send reminder{r.reminder_count ? ` (${r.reminder_count} sent)` : ''}</Button>}
                    </div>
                    {r.state === 'interested' && (
                      <div style={{ marginTop: '8px', fontSize: '13.5px', lineHeight: 1.6 }}>
                        {[...new Set(r.windows.map(w => w.date))].map(d => <div key={d}><strong>{fmtDay(d)}</strong>: {describeWindows(r.windows.filter(w => w.date === d))}</div>)}
                        {r.note && <div style={{ color: 'var(--ink3)', marginTop: '4px' }}>“{r.note}”</div>}
                      </div>
                    )}
                    <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--ink4)' }}>
                      {r.state === 'not_asked' ? 'Not asked yet.' : `Asked ${fmtDate(r.sent_at)}${r.submitted_at ? ` · answered ${fmtDate(r.submitted_at)}` : r.last_opened_at ? ` · opened ${fmtDate(r.last_opened_at)}` : ''}${r.producer ? ` · producer ${r.producer}` : ''}`}
                    </div>
                    {r.request_id && (
                      <Textarea defaultValue={r.pr_note ?? ''} onBlur={e => void saveNote(r, e.target.value.trim())} placeholder="PR note (e.g. interview with the TV crew at 11:30)" rows={1} style={{ marginTop: '8px', fontSize: '13px' }} />
                    )}
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'availability' && <AvailabilityView rows={rows ?? []} days={settings?.days ?? []} />}
        {tab === 'settings' && settings && <SettingsView eventId={eventId} settings={settings} reload={load} say={say} />}
      </div>
    </div>
  )
}

/* Per day: a row per hour block with who is free then — so PR can see the busiest windows. */
function AvailabilityView({ rows, days }: { rows: Row[]; days: MediaDay[] }) {
  const interested = rows.filter(r => r.state === 'interested')
  if (!days.length) return <div style={{ color: 'var(--ink3)', fontSize: '14px' }}>Set the media days under Settings first.</div>
  if (!interested.length) return <div style={{ color: 'var(--ink3)', fontSize: '14px' }}>Nobody has said they are open to media interviews yet.</div>
  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      {days.map(d => {
        const hours: { from: string; to: string }[] = []
        for (let s = toMinutes(d.open); s < toMinutes(d.close); s = (Math.floor(s / 60) + 1) * 60) hours.push({ from: fromMinutes(s), to: fromMinutes(Math.min(toMinutes(d.close), (Math.floor(s / 60) + 1) * 60)) })
        return (
          <Card key={d.day} padded>
            <div style={{ fontWeight: 900, fontSize: '15px', marginBottom: '8px' }}>{fmtDay(d.day)}</div>
            {hours.map(h => {
              const free = interested.filter(r => r.windows.some(w => w.date === d.day && toMinutes(w.from) <= toMinutes(h.from) && toMinutes(w.to) >= toMinutes(h.to)))
              return (
                <div key={h.from} style={{ display: 'flex', gap: '12px', padding: '6px 0', borderTop: '1px solid var(--border)', fontSize: '13.5px', alignItems: 'baseline' }}>
                  <div style={{ width: '96px', fontWeight: 700, flexShrink: 0 }}>{h.from}–{h.to}</div>
                  <div style={{ width: '28px', flexShrink: 0, color: free.length ? 'var(--teal)' : 'var(--ink4)', fontWeight: 800 }}>{free.length}</div>
                  <div style={{ color: 'var(--ink2)', lineHeight: 1.5 }}>{free.map(r => r.name).join(', ') || '—'}</div>
                </div>
              )
            })}
          </Card>
        )
      })}
    </div>
  )
}

function SettingsView({ eventId, settings, reload, say }: { eventId: string; settings: Settings; reload: () => Promise<void>; say: (t: string, ok?: boolean) => void }) {
  const [contactIds, setContactIds] = useState<string[]>(settings.contacts_assigned ? settings.contacts.map(c => c.id) : [])
  const [days, setDays] = useState<MediaDay[]>(settings.days.length ? settings.days : settings.suggestion.days)
  const [intro, setIntro] = useState(settings.intro ?? '')
  const [busy, setBusy] = useState(false)

  async function save(extra: Record<string, unknown> = {}) {
    setBusy(true)
    const res = await fetch('/api/events/pr/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, contact_ids: contactIds, days, intro, ...extra }) })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { say(d.error ?? 'Could not save.', false); return false }
    await reload(); return true
  }
  const setDay = (i: number, patch: Partial<MediaDay>) => setDays(ds => ds.map((d, j) => j === i ? { ...d, ...patch } : d))
  const unsavedDays = JSON.stringify(days) !== JSON.stringify(settings.days)

  return (
    <div style={{ display: 'grid', gap: '16px', maxWidth: '760px' }}>
      <Card padded>
        <div style={{ fontWeight: 900, fontSize: '15px' }}>PR contact (one or two)</div>
        <p style={{ fontSize: '13px', color: 'var(--ink3)', margin: '4px 0 10px', lineHeight: 1.5 }}>They get the notification when a speaker answers, and speakers see their name and contact details as the person who will be in touch. Choose from this event’s staff list. {!settings.contacts_assigned && settings.contacts.length > 0 && 'Until you choose, people with the PR manage permission receive the notifications.'}</p>
        {[0, 1].map(i => (
          <Select key={i} value={contactIds[i] ?? ''} onChange={e => setContactIds(ids => { const n = [...ids]; if (e.target.value) n[i] = e.target.value; else n.splice(i, 1); return [...new Set(n.filter(Boolean))] })} style={{ marginBottom: '8px', maxWidth: '380px' }}>
            <option value="">{i === 0 ? 'Choose the PR contact' : 'Second contact (optional)'}</option>
            {settings.candidates.map(c => <option key={c.id} value={c.id}>{c.name}{c.role ? ` — ${c.role}` : ''}</option>)}
          </Select>
        ))}
        <p style={{ fontSize: '12px', color: 'var(--ink4)', margin: '4px 0 0' }}>A PR contact also needs access to this event (an access role) to see the workspace card on their home page; the PR & Media link above always works for them.</p>
      </Card>

      <Card padded>
        <div style={{ fontWeight: 900, fontSize: '15px' }}>Media days and hours</div>
        <p style={{ fontSize: '13px', color: 'var(--ink3)', margin: '4px 0 10px', lineHeight: 1.5 }}>The days and hours speakers can choose from (event time, {settings.timezone.replace('_', ' ')}). {settings.days.length ? '' : `Pre-filled from ${settings.suggestion.source === 'agenda' ? 'the agenda' : settings.suggestion.source === 'event_days' ? 'the event dates (09:00–17:00)' : 'nothing yet — add the days'}; check them.`}</p>
        {days.map((d, i) => (
          <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
            <Input type="date" value={d.day} onChange={e => setDay(i, { day: e.target.value })} style={{ width: '160px' }} />
            <Input type="time" value={d.open} onChange={e => setDay(i, { open: e.target.value })} style={{ width: '120px' }} />
            <span style={{ color: 'var(--ink3)' }}>to</span>
            <Input type="time" value={d.close} onChange={e => setDay(i, { close: e.target.value })} style={{ width: '120px' }} />
            <Button variant="ghost" onClick={() => setDays(ds => ds.filter((_, j) => j !== i))}>Remove</Button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={() => setDays(ds => [...ds, { day: '', open: '09:00', close: '17:00' }])}>＋ Add a day</Button>
          <Button variant="ghost" onClick={() => setDays(settings.suggestion.days)} disabled={!settings.suggestion.days.length}>Reset to suggestion</Button>
        </div>
        <div style={{ marginTop: '12px', fontSize: '13px', color: settings.days_confirmed_at && !unsavedDays ? 'var(--teal)' : 'var(--amber)' }}>
          {settings.days_confirmed_at && !unsavedDays ? `Confirmed ${fmtDate(settings.days_confirmed_at)}. Producers can now ask speakers.` : 'Not confirmed yet — producers can’t ask speakers until you confirm.'}
        </div>
      </Card>

      <Card padded>
        <div style={{ fontWeight: 900, fontSize: '15px' }}>What speakers read after they answer</div>
        <p style={{ fontSize: '13px', color: 'var(--ink3)', margin: '4px 0 10px' }}>Shown above your name and contact details. Leave blank for the default.</p>
        <Textarea value={intro} onChange={e => setIntro(e.target.value)} rows={3} maxLength={600} placeholder="Our PR team will contact you to arrange interviews with the media attending the event, within the times you chose." />
      </Card>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <Button variant="ghost" onClick={async () => { if (await save()) say('Saved.') }} disabled={busy}>Save</Button>
        <Button variant="teal" onClick={async () => { if (await save({ confirm_days: true })) say('Saved and confirmed. Producers can now ask speakers.') }} disabled={busy || !days.length || !contactIds.length && !settings.contacts.length}>Save and confirm media days</Button>
      </div>
    </div>
  )
}
