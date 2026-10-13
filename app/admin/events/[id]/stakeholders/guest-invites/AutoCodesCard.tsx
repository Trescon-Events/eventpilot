'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Input } from '@/app/components/ui'

/* Settings card: auto-create each confirmed speaker's guest-pass code on KonfHub. Pick the guest ticket, the number of guests per
   speaker and a mode — Off (links pasted by hand), Review (a code is proposed and a producer creates it) or Automatic (created as
   soon as a speaker is Confirmed). Invites are never sent automatically. */
type Auto = { ticket_id: number | null; default_limit: number | null; mode: 'off' | 'review' | 'auto'; tickets: { id: number; name: string }[]; error: string | null }
type Mode = Auto['mode']

const MODES: { key: Mode; label: string; help: string }[] = [
  { key: 'off', label: 'Off', help: 'Nothing is created. Links are pasted by hand, as before.' },
  { key: 'review', label: 'Review first', help: 'When a speaker is confirmed, a code is proposed on the Send Invites tab. A producer checks it and creates it with one click.' },
  { key: 'auto', label: 'Automatic', help: 'The code is created on KonfHub the moment a speaker is confirmed. Use once you trust the codes it makes.' },
]

export default function AutoCodesCard({ eventId, canEdit, say, onChanged }: { eventId: string; canEdit: boolean; say: (t: string, type?: 'success' | 'error') => void; onChanged: () => void }) {
  const [a, setA] = useState<Auto | null>(null)
  const [draft, setDraft] = useState<{ ticket_id: string; limit: string; mode: Mode } | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const d = await fetch(`/api/events/guest-invites/auto?event_id=${eventId}`).then(r => r.json()).catch(() => null) as Auto | null
    if (!d) return
    setA(d); setDraft({ ticket_id: d.ticket_id ? String(d.ticket_id) : '', limit: d.default_limit ? String(d.default_limit) : '', mode: d.mode })
  }, [eventId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
  useEffect(() => { void load() }, [load])

  if (!a || !draft) return <Card padded><div style={{ color: 'var(--ink3)' }}>Loading…</div></Card>
  const dirty = (a.ticket_id ? String(a.ticket_id) : '') !== draft.ticket_id || (a.default_limit ? String(a.default_limit) : '') !== draft.limit || a.mode !== draft.mode

  async function save() {
    if (!draft) return
    setSaving(true)
    const res = await fetch(`/api/events/guest-invites/auto?event_id=${eventId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_id: draft.ticket_id ? Number(draft.ticket_id) : null, default_limit: draft.limit ? Number(draft.limit) : null, mode: draft.mode }) })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { say(d.error ?? 'Could not save.', 'error'); return }
    say('Saved.'); await load(); onChanged()
  }

  return (
    <Card padded>
      <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Create guest codes automatically</div>
      <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '12px' }}>
        Set this once and EventPilot creates each confirmed speaker’s personal registration code on KonfHub — limited to the guest ticket below and expiring on the registration deadline — and saves their link. Speakers who already have a link keep it. Emails are never sent automatically.
      </div>
      {a.error && <div style={{ fontSize: '12.5px', color: 'var(--red)', marginBottom: '8px' }}>{a.error}</div>}
      <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label style={{ display: 'grid', gap: '4px', fontSize: '11.5px', fontWeight: 700, color: 'var(--ink3)' }}>Guest ticket
          <select value={draft.ticket_id} disabled={!canEdit} onChange={e => setDraft({ ...draft, ticket_id: e.target.value })} style={{ minWidth: '260px', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px' }}>
            <option value="">Choose this event’s guest ticket…</option>
            {a.tickets.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select></label>
        <label style={{ display: 'grid', gap: '4px', fontSize: '11.5px', fontWeight: 700, color: 'var(--ink3)' }}>Guests per speaker
          <Input type="number" min={1} max={50} value={draft.limit} disabled={!canEdit} onChange={e => setDraft({ ...draft, limit: e.target.value })} style={{ width: '120px' }} /></label>
      </div>
      <div style={{ display: 'grid', gap: '6px', marginTop: '14px' }}>
        {MODES.map(m => (
          <label key={m.key} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '8px 12px', borderRadius: '10px', border: `1px solid ${draft.mode === m.key ? 'var(--teal-mid)' : 'var(--border)'}`, background: draft.mode === m.key ? 'var(--teal-light)' : 'none', cursor: canEdit ? 'pointer' : 'default' }}>
            <input type="radio" name="auto-mode" checked={draft.mode === m.key} disabled={!canEdit} onChange={() => setDraft({ ...draft, mode: m.key })} style={{ marginTop: '3px' }} />
            <span><span style={{ fontWeight: 700, color: 'var(--ink)', fontSize: '13.5px' }}>{m.label}</span><span style={{ display: 'block', fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.5 }}>{m.help}</span></span>
          </label>
        ))}
      </div>
      {canEdit && dirty && <div style={{ marginTop: '12px' }}><Button variant="teal" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button></div>}
      <div style={{ fontSize: '11.5px', color: 'var(--ink4)', marginTop: '10px', lineHeight: 1.6 }}>
        Codes look like NURYMGUEST: the shorter of the speaker’s first and last name plus GUEST. If that’s taken anywhere on the KonfHub event, the longer name is used, then a number. The registration deadline above is the expiry; each code unlocks only the guest ticket chosen here.
      </div>
    </Card>
  )
}
