'use client'

import { use, useCallback, useEffect, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Button, Card, Input, Select, Textarea } from '@/app/components/ui'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'
import { downloadFormattedXlsx } from '@/app/lib/export/formatted-xlsx'
import { notify } from '@/app/lib/ui/notify'
import { toMinutes, dayBlocks, slotOf, describeWindows, type MediaDay, type MediaWindow } from '@/app/lib/pr/windows'

/* PR & Media (2026-10-21): what the event's PR person works from. Speakers = only those who said YES to media interviews, with their times and notes (that is all PR acts on);
   Availability = per day, who is free when; Settings = PR contacts, the days/hours the speaker form offers, and the line speakers see about who contacts them.
   Asking speakers, reminders and who has not answered are the producers' side: Stakeholder Hub › Speakers › Media Interviews. */

type State = 'not_asked' | 'asked' | 'interested' | 'declined'
type Row = {
  speaker_id: string; name: string; public_name: string; company: string | null; role: string | null; country: string | null; producer: string | null; request_id: string | null; state: State; windows: MediaWindow[]
  note: string | null; pr_note: string | null; sent_at: string | null; submitted_at: string | null; last_opened_at: string | null; short_bio: string | null; full_bio_url: string | null
  email: string | null; phone: string | null; additional_contacts: { name: string; email: string }[]
}
type Person = { id: string; name: string; email: string; role?: string | null }
type Settings = { contacts: Person[]; contacts_assigned: boolean; candidates: Person[]; days: MediaDay[]; suggestion: { days: MediaDay[]; source: string }; intro: string | null; days_confirmed_at: string | null; timezone: string }

const fmtDay = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : ''

export default function PrMediaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const [tab, setTab] = useState<'responses' | 'availability' | 'settings'>('responses')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [eventName, setEventName] = useState<string | null>(null)
  const [eventVenue, setEventVenue] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [exportFields, setExportFields] = useState<Set<string>>(new Set())
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
      const ev = Array.isArray(ed) ? ed[0] : ed; setEventName(ev?.public_name || ev?.name || null); setEventVenue(ev?.public_venue_display || [ev?.venue, ev?.city].filter(Boolean).join(', ') || null)
    })()
    return () => { cancelled = true }
  }, [eventId, tick])

  const say = (text: string, ok = true) => notify(text, ok ? 'success' : 'error')
  const shown = (rows ?? []).filter(r => (!search.trim() || `${r.public_name} ${r.company ?? ''} ${r.role ?? ''} ${r.country ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())))

  async function saveNote(r: Row, text: string) {
    if (text === (r.pr_note ?? '')) return
    const res = await fetch(`/api/events/pr/requests/${r.request_id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pr_note: text }) })
    if (!res.ok) { say('Could not save the note.', false); return }
    setRows(prev => prev?.map(x => x.speaker_id === r.speaker_id ? { ...x, pr_note: text || null } : x) ?? prev)
  }
  // Columns the PR team can put in the Excel they share with the media. Contact details start unticked: only added when really needed.
  const EXPORT_FIELDS: { key: string; label: string; width: number; contact?: boolean; locked?: boolean; get: (r: Row) => string }[] = [
    { key: 'event', label: 'Event', width: 30, get: () => eventName ?? '' },
    { key: 'venue', label: 'Venue', width: 30, get: () => eventVenue ?? '' },
    { key: 'name', label: 'Speaker', width: 26, locked: true, get: r => r.public_name },
    { key: 'role', label: 'Job title', width: 30, get: r => r.role ?? '' },
    { key: 'company', label: 'Company', width: 26, get: r => r.company ?? '' },
    { key: 'country', label: 'Country', width: 16, get: r => r.country ?? '' },
    { key: 'short_bio', label: 'Short bio', width: 60, get: r => r.short_bio ?? '' },
    { key: 'full_bio', label: 'Full bio (download link)', width: 18, get: r => r.full_bio_url ?? '' },
    { key: 'available', label: 'Available', width: 36, get: r => [...new Set(r.windows.map(w => w.date))].sort().map(d => `${fmtDay(d)}: ${describeWindows(r.windows.filter(w => w.date === d))}`).join('\n') },
    { key: 'note', label: 'Speaker note', width: 36, get: r => r.note ?? '' },
    { key: 'producer', label: 'Producer', width: 20, get: r => r.producer ?? '' },
    { key: 'asked', label: 'Asked', width: 12, get: r => fmtDate(r.sent_at) },
    { key: 'answered', label: 'Answered', width: 12, get: r => fmtDate(r.submitted_at) },
    { key: 'email', label: 'Email', width: 28, contact: true, get: r => r.email ?? '' },
    { key: 'phone', label: 'Phone', width: 18, contact: true, get: r => r.phone ?? '' },
    { key: 'extra', label: 'Additional contacts', width: 40, contact: true, get: r => r.additional_contacts.map(c => `${c.name ? `${c.name} — ` : ''}${c.email}`).join('\n') },
  ]
  async function exportXlsx() {
    const list = rows ?? []
    const cols = EXPORT_FIELDS.filter(f => exportFields.has(f.key))
    // For sharing with the media. PR's own notes stay internal and are never exported.
    await downloadFormattedXlsx({
      filename: `media-speakers-${new Date().toISOString().slice(0, 10)}.xlsx`, sheetName: 'Speakers open to media', title: `${eventName ? `${eventName} — ` : ''}Speakers open to media interviews`,
      subtitle: `${list.length} speaker${list.length === 1 ? '' : 's'} · times are event time (${settings?.timezone ?? ''})`,
      columns: cols.map(f => ({ header: f.label, width: f.width })),
      rows: list.map(r => cols.map(f => f.get(r))),
    })
    setExportOpen(false)
  }

  const needsSetup = settings && (!settings.days.length || !settings.days_confirmed_at || !settings.contacts.length)
  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader eyebrow="PR & Media" title="Speakers open to media interviews" backHref={`/admin/events/${eventId}`} backLabel="Event workspace"
        description="Speakers who said yes to media bites or interviews, and the times they are free. Producers ask the speakers; you see the ones who agreed." />
      <div style={{ padding: '20px 32px 60px', maxWidth: '1100px' }}>
        {error && <div style={{ color: 'var(--red)', fontSize: '14px', marginBottom: '12px' }}>{error}</div>}
        {needsSetup && (
          <div style={{ marginBottom: '14px', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--amber)', background: 'var(--amber-light)', color: 'var(--ink)', fontSize: '13.5px', lineHeight: 1.5 }}>
            Before producers can ask speakers: {[!settings.contacts.length && 'choose the PR contact', !settings.days.length ? 'add the media days and hours' : !settings.days_confirmed_at && 'confirm the media days and hours'].filter(Boolean).join(' and ')}. Do it under <button onClick={() => setTab('settings')} style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', fontWeight: 800, padding: 0, fontFamily: 'inherit', fontSize: 'inherit' }}>Settings</button>.
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {(['responses', 'availability', 'settings'] as const).map(t => <Button key={t} variant={tab === t ? 'teal' : 'ghost'} onClick={() => setTab(t)}>{t === 'responses' ? 'Speakers' : t === 'availability' ? 'Availability' : 'Settings'}</Button>)}
          <div style={{ flex: 1 }} />
          {tab === 'responses' && <Button variant="ghost" onClick={() => { setExportFields(new Set(EXPORT_FIELDS.filter(f => !f.contact).map(f => f.key))); setExportOpen(true) }} disabled={!rows?.length}>Download Excel</Button>}
        </div>

        {tab === 'responses' && (
          <>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontWeight: 800, fontSize: '14px' }}>{rows === null ? '' : `${rows.length} speaker${rows.length === 1 ? '' : 's'} open to media`}</div>
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search speaker or company" style={{ width: '220px', marginLeft: 'auto' }} />
            </div>
            {rows === null ? <div style={{ color: 'var(--ink3)' }}>Loading…</div> : shown.length === 0 ? <div style={{ color: 'var(--ink3)', fontSize: '14px' }}>{rows?.length ? 'Nobody matches.' : 'No speaker has said yes yet. Producers ask the speakers from Stakeholder Hub › Speakers › Media Interviews.'}</div> : (
              <div style={{ display: 'grid', gap: '10px' }}>
                {shown.map(r => (
                  <Card key={r.speaker_id} padded>
                    <div style={{ fontWeight: 800, fontSize: '16px' }}>{r.public_name}</div>
                    <div style={{ color: 'var(--ink2)', fontSize: '13.5px', marginTop: '2px' }}>{[r.role, r.company, r.country].filter(Boolean).join(' · ') || '—'}</div>
                    {r.short_bio && <p style={{ margin: '10px 0 0', fontSize: '13.5px', lineHeight: 1.6, color: 'var(--ink2)', whiteSpace: 'pre-wrap' }}>{r.short_bio}</p>}
                    <div style={{ marginTop: '8px', fontSize: '13px' }}>
                      {r.full_bio_url
                        ? <a href={r.full_bio_url} download target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', fontWeight: 700 }}>Download full bio ↓</a>
                        : <span style={{ color: 'var(--ink4)' }}>No full bio on file</span>}
                    </div>
                    <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px 24px', fontSize: '13.5px', lineHeight: 1.6 }}>
                      <div>
                        <div style={{ fontSize: '11.5px', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--ink3)' }}>Available</div>
                        {[...new Set(r.windows.map(w => w.date))].sort().map(d => <div key={d}><strong>{fmtDay(d)}</strong>: {describeWindows(r.windows.filter(w => w.date === d))}</div>)}
                        {r.note && <div style={{ color: 'var(--ink3)', marginTop: '4px' }}>“{r.note}”</div>}
                      </div>
                      <div>
                        <div style={{ fontSize: '11.5px', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--ink3)' }}>Contact</div>
                        {r.email ? <div><a href={`mailto:${r.email}`} style={{ color: 'var(--teal)' }}>{r.email}</a></div> : null}
                        {r.phone ? <div><a href={`tel:${r.phone}`} style={{ color: 'var(--teal)' }}>{r.phone}</a></div> : null}
                        {r.additional_contacts.map(c => <div key={c.email}>{c.name ? `${c.name} — ` : ''}<a href={`mailto:${c.email}`} style={{ color: 'var(--teal)' }}>{c.email}</a></div>)}
                        {!r.email && !r.phone && r.additional_contacts.length === 0 && <div style={{ color: 'var(--ink4)' }}>No contact details on file</div>}
                      </div>
                    </div>
                    <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--ink4)' }}>
                      Asked {fmtDate(r.sent_at)}{r.submitted_at ? ` · answered ${fmtDate(r.submitted_at)}` : ''}{r.producer ? ` · producer ${r.producer}` : ''}
                    </div>
                    {r.request_id && (
                      <Textarea defaultValue={r.pr_note ?? ''} onBlur={e => void saveNote(r, e.target.value.trim())} placeholder="PR note (e.g. interview with the TV crew at 11:30) — internal, not in the Excel" rows={1} style={{ marginTop: '8px', fontSize: '13px' }} />
                    )}
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {exportOpen && (
          <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'var(--overlay-scrim)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px', width: 'min(520px, 100%)', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ fontSize: '18px', fontWeight: 900, marginBottom: '4px' }}>Download Excel</div>
              <div style={{ fontSize: '13.5px', color: 'var(--ink3)', marginBottom: '14px', lineHeight: 1.5 }}>Choose what goes in the sheet. Contact details are left out unless you tick them. Your PR notes are never included.</div>
              {[false, true].map(contact => (
                <div key={String(contact)} style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '11.5px', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '6px' }}>{contact ? 'Contact details' : 'Speaker details'}</div>
                  {EXPORT_FIELDS.filter(f => !!f.contact === contact).map(f => (
                    <label key={f.key} style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px', padding: '3px 0', cursor: f.locked ? 'default' : 'pointer' }}>
                      <input type="checkbox" checked={exportFields.has(f.key)} disabled={f.locked} onChange={() => setExportFields(prev => { const n = new Set(prev); if (n.has(f.key)) n.delete(f.key); else n.add(f.key); return n })} />
                      {f.label}{f.locked ? <span style={{ color: 'var(--ink4)' }}> (always included)</span> : null}
                    </label>
                  ))}
                </div>
              ))}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
                <Button variant="ghost" onClick={() => setExportOpen(false)}>Cancel</Button>
                <Button variant="teal" onClick={exportXlsx}>Download</Button>
              </div>
            </div>
          </div>
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
        const hours = dayBlocks(d.open, d.close, slotOf(d))
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
        <p style={{ fontSize: '13px', color: 'var(--ink3)', margin: '4px 0 10px', lineHeight: 1.5 }}>Set each day’s overall hours (e.g. 10:00 to 17:00), then split them into half-hour or one-hour slots. Speakers tap as many slots as they are free for (event time, {settings.timezone.replace('_', ' ')}). {settings.days.length ? '' : `Pre-filled from ${settings.suggestion.source === 'agenda' ? 'the agenda' : settings.suggestion.source === 'event_days' ? 'the event dates (09:00–17:00)' : 'nothing yet — add the days'}; check them.`}</p>
        {days.map((d, i) => (
          <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
            <Input type="date" value={d.day} onChange={e => setDay(i, { day: e.target.value })} style={{ width: '160px' }} />
            <Input type="time" value={d.open} onChange={e => setDay(i, { open: e.target.value })} style={{ width: '120px' }} />
            <span style={{ color: 'var(--ink3)' }}>to</span>
            <Input type="time" value={d.close} onChange={e => setDay(i, { close: e.target.value })} style={{ width: '120px' }} />
            {([30, 60] as const).map(m => (
              <Button key={m} variant={slotOf(d) === m ? 'teal' : 'ghost'} onClick={() => setDay(i, { slot: m })}>{m === 30 ? 'Split into half-hour slots' : 'Split into one-hour slots'}</Button>
            ))}
            <span style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>{dayBlocks(d.open, d.close, slotOf(d)).length === 1 ? '1 slot' : `${dayBlocks(d.open, d.close, slotOf(d)).length} slots`}</span>
            <Button variant="ghost" onClick={() => setDays(ds => ds.filter((_, j) => j !== i))}>Remove</Button>
            <div style={{ flexBasis: '100%', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {dayBlocks(d.open, d.close, slotOf(d)).map(b => (
                <span key={b.from} style={{ fontSize: '12.5px', fontWeight: 700, padding: '4px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card-hi)', color: 'var(--ink2)' }}>{b.from}–{b.to}</span>
              ))}
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={() => setDays(ds => [...ds, { day: '', open: '09:00', close: '17:00', slot: 60 }])}>＋ Add a day</Button>
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
