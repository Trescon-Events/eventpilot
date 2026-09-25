'use client'

import { use, useCallback, useEffect, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'

type Contact = { id?: string; name: string; email: string; phone?: string | null; job_title?: string | null }
type Vendor = { id: string; name: string; category: string; notes: string | null; active: boolean; contacts: Contact[]; assigned: boolean }

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'speaker_license', label: 'Speaker licence' },
  { value: 'av', label: 'AV' },
  { value: 'print', label: 'Print' },
  { value: 'visa', label: 'Visa agency' },
  { value: 'other', label: 'Other' },
]
const categoryLabel = (v: string) => CATEGORIES.find(c => c.value === v)?.label ?? v
const blankContact = (): Contact => ({ name: '', email: '', phone: '', job_title: '' })

export default function VendorsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [eventName, setEventName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // null = form closed; 'new' = creating; otherwise editing that vendor id
  const [editing, setEditing] = useState<string | 'new' | null>(null)

  useBreadcrumbLabel(eventId, eventName)

  const [reloadTick, setReloadTick] = useState(0)
  const load = useCallback(() => setReloadTick(t => t + 1), [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [vRes, eRes] = await Promise.all([
        fetch(`/api/events/operations/vendors?event_id=${eventId}`),
        fetch(`/api/events?id=${eventId}`),
      ])
      const vendorsBody = vRes.ok ? await vRes.json() : null
      const vendorsErr = vRes.ok ? null : ((await vRes.json().catch(() => null))?.error ?? 'Could not load vendors.')
      const eventBody = eRes.ok ? await eRes.json() : null
      if (cancelled) return
      if (vendorsBody) setVendors(vendorsBody)
      if (vendorsErr) setError(vendorsErr)
      setEventName(eventBody?.name ?? null)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [eventId, reloadTick])

  async function toggleAssigned(v: Vendor) {
    setError(null)
    const res = await fetch('/api/events/operations/event-vendors', {
      method: v.assigned ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, vendor_id: v.id }),
    })
    if (!res.ok) setError((await res.json().catch(() => null))?.error ?? 'Could not update assignment.')
    else load()
  }

  const editingVendor = editing && editing !== 'new' ? vendors.find(v => v.id === editing) ?? null : null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Operations"
        title="Vendors"
        description="A shared directory — the same vendor can serve many events. Assign the ones engaged on this event."
        actions={editing === null ? <button onClick={() => setEditing('new')} style={btnPrimary}>+ Add vendor</button> : undefined}
      />
      <div style={{ padding: '24px 32px', maxWidth: '960px' }}>
        {error && <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: '8px', background: 'var(--amber-light)', color: 'var(--amber)', fontSize: '13px' }}>{error}</div>}

        {editing !== null && (
          <VendorForm
            key={editing}
            eventId={eventId}
            vendor={editingVendor}
            onDone={() => { setEditing(null); load() }}
            onCancel={() => setEditing(null)}
            setError={setError}
          />
        )}

        {loading ? (
          <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>
        ) : vendors.length === 0 ? (
          <div style={{ color: 'var(--ink3)', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>
            No vendors in the directory yet. Add the first one above.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {vendors.map(v => (
              <div key={v.id} style={{ padding: '16px 18px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', opacity: v.active ? 1 : 0.6, display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>
                    {v.name} <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink3)', marginLeft: '6px' }}>{categoryLabel(v.category)}{v.active ? '' : ' · inactive'}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '6px', lineHeight: 1.6 }}>
                    {v.contacts.map(c => (
                      <div key={c.id}>{c.name}{c.job_title ? `, ${c.job_title}` : ''} · {c.email}{c.phone ? ` · ${c.phone}` : ''}</div>
                    ))}
                  </div>
                  {v.notes && <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '6px' }}>{v.notes}</div>}
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <button onClick={() => setEditing(v.id)} style={btnGhost}>Edit</button>
                  <button onClick={() => toggleAssigned(v)} style={v.assigned ? btnAssigned : btnPrimary} disabled={!v.active && !v.assigned}>
                    {v.assigned ? '✓ On this event' : 'Assign to event'}
                  </button>
                </div>
                {v.assigned && v.active && <VendorLogins eventId={eventId} vendor={v} setError={setError} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

type PortalUser = { id: string; name: string; email: string; status: 'invited' | 'active' | 'disabled'; last_login_at: string | null }
const USER_STATUS: Record<PortalUser['status'], { label: string; color: string }> = {
  invited: { label: 'Invite sent — password not set yet', color: 'var(--amber)' },
  active: { label: 'Active', color: 'var(--lime)' },
  disabled: { label: 'Disabled', color: 'var(--ink3)' },
}

/* Vendor Portal logins for one vendor. Ops creates the login and sends links;
   the vendor chooses their own password from the emailed link — it is never
   shown to or set by ops. Needs ops.vendor_accounts.manage. */
function VendorLogins({ eventId, vendor, setError }: { eventId: string; vendor: Vendor; setError: (e: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState<PortalUser[] | null>(null)
  const [tick, setTick] = useState(0)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      const res = await fetch(`/api/events/operations/vendor-users?event_id=${eventId}&vendor_id=${vendor.id}`)
      const body = await res.json().catch(() => null)
      if (cancelled) return
      if (res.ok) setUsers(body); else setError(body?.error ?? 'Could not load logins.')
    })()
    return () => { cancelled = true }
  }, [open, tick, eventId, vendor.id, setError])
  const reload = () => setTick(t => t + 1)

  async function create() {
    setBusy('create'); setError(null); setNote(null)
    const res = await fetch('/api/events/operations/vendor-users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, vendor_id: vendor.id, name, email }) })
    setBusy(null)
    const body = await res.json().catch(() => null)
    if (!res.ok) { setError(body?.error ?? 'Could not create the login.'); return }
    setNote(`Invitation emailed to ${email}. They choose their own password from the link.`)
    setAdding(false); setName(''); setEmail(''); reload()
  }

  async function act(u: PortalUser, action: 'send_link' | 'disable' | 'enable') {
    setBusy(u.id + action); setError(null); setNote(null)
    const res = await fetch(`/api/events/operations/vendor-users/${u.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, action }) })
    setBusy(null)
    const body = await res.json().catch(() => null)
    if (!res.ok) { setError(body?.error ?? 'That did not go through.'); return }
    if (action === 'send_link') setNote(`A link was emailed to ${body.sent_to}.`)
    reload()
  }

  return (
    <div style={{ flexBasis: '100%', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
      <button onClick={() => setOpen(o => !o)} style={{ ...btnGhost, padding: '6px 12px', fontSize: '12px' }}>{open ? 'Hide portal logins' : 'Portal logins'}</button>
      {open && (
        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {note && <div style={{ fontSize: '12px', color: 'var(--lime)', fontWeight: 600 }}>{note}</div>}
          {users === null && <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>Loading…</div>}
          {users?.length === 0 && <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>No logins yet. The vendor can&rsquo;t sign in until you create one.</div>}
          {users?.map(u => (
            <div key={u.id} style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', fontSize: '13px', color: 'var(--ink)' }}>
              <div style={{ minWidth: 0 }}>
                <strong>{u.name}</strong> · {u.email}
                <div style={{ fontSize: '11px', color: USER_STATUS[u.status].color }}>{USER_STATUS[u.status].label}{u.last_login_at ? ` · last sign-in ${new Date(u.last_login_at).toLocaleString()}` : ''}</div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                {u.status !== 'disabled' && <button disabled={!!busy} onClick={() => act(u, 'send_link')} style={{ ...btnGhost, padding: '6px 12px', fontSize: '12px' }}>{busy === u.id + 'send_link' ? 'Sending…' : u.status === 'invited' ? 'Resend invite' : 'Send reset link'}</button>}
                {u.status !== 'disabled'
                  ? <button disabled={!!busy} onClick={() => act(u, 'disable')} style={{ ...btnGhost, padding: '6px 12px', fontSize: '12px' }}>Disable</button>
                  : <button disabled={!!busy} onClick={() => act(u, 'enable')} style={{ ...btnGhost, padding: '6px 12px', fontSize: '12px' }}>Enable</button>}
              </div>
            </div>
          ))}
          {adding ? (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" style={{ ...input, flex: '1 1 140px' }} />
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email (this is their username)" style={{ ...input, flex: '2 1 220px' }} />
              {vendor.contacts.length > 0 && (
                <select value="" onChange={e => { const c = vendor.contacts.find(x => x.id === e.target.value); if (c) { setName(c.name); setEmail(c.email) } }} style={{ ...input, flex: '1 1 150px' }}>
                  <option value="">Fill from a contact…</option>
                  {vendor.contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <button disabled={busy === 'create' || !name.trim() || !email.trim()} onClick={create} style={btnPrimary}>{busy === 'create' ? 'Sending…' : 'Create & email invite'}</button>
              <button onClick={() => setAdding(false)} style={btnGhost}>Cancel</button>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} style={{ ...btnGhost, alignSelf: 'flex-start', padding: '6px 12px', fontSize: '12px' }}>+ Add a login</button>
          )}
        </div>
      )}
    </div>
  )
}

function VendorForm({ eventId, vendor, onDone, onCancel, setError }: {
  eventId: string; vendor: Vendor | null; onDone: () => void; onCancel: () => void; setError: (e: string | null) => void
}) {
  const [name, setName] = useState(vendor?.name ?? '')
  const [category, setCategory] = useState(vendor?.category ?? 'speaker_license')
  const [notes, setNotes] = useState(vendor?.notes ?? '')
  const [active, setActive] = useState(vendor?.active ?? true)
  const [contacts, setContacts] = useState<Contact[]>(vendor?.contacts.length ? vendor.contacts : [blankContact()])
  const [saving, setSaving] = useState(false)

  const setContact = (i: number, patch: Partial<Contact>) => setContacts(cs => cs.map((c, j) => j === i ? { ...c, ...patch } : c))

  async function save() {
    setSaving(true); setError(null)
    const payload = { name, category, notes, contacts }
    const res = vendor
      ? await fetch(`/api/events/operations/vendors/${vendor.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, active }) })
      : await fetch('/api/events/operations/vendors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, event_id: eventId, assign: true }) })
    setSaving(false)
    if (!res.ok) { setError((await res.json().catch(() => null))?.error ?? 'Could not save vendor.'); return }
    onDone()
  }

  return (
    <div style={{ marginBottom: '20px', padding: '18px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{vendor ? `Edit ${vendor.name}` : 'New vendor'}</div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Vendor name" style={{ ...input, flex: '2 1 220px' }} />
        <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...input, flex: '1 1 160px' }}>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      {contacts.map((c, i) => (
        <div key={c.id ?? i} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={c.name} onChange={e => setContact(i, { name: e.target.value })} placeholder="Contact name" style={{ ...input, flex: '1 1 150px' }} />
          <input value={c.email} onChange={e => setContact(i, { email: e.target.value })} placeholder="Email" style={{ ...input, flex: '1.5 1 200px' }} />
          <input value={c.phone ?? ''} onChange={e => setContact(i, { phone: e.target.value })} placeholder="Phone (optional)" style={{ ...input, flex: '1 1 140px' }} />
          <input value={c.job_title ?? ''} onChange={e => setContact(i, { job_title: e.target.value })} placeholder="Title (optional)" style={{ ...input, flex: '1 1 140px' }} />
          {contacts.length > 1 && <button onClick={() => setContacts(cs => cs.filter((_, j) => j !== i))} style={btnGhost}>Remove</button>}
        </div>
      ))}
      {contacts.length < 2 && <button onClick={() => setContacts(cs => [...cs, blankContact()])} style={{ ...btnGhost, alignSelf: 'flex-start' }}>+ Add second contact</button>}
      <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} style={{ ...input, resize: 'vertical' }} />
      {vendor && (
        <label style={{ fontSize: '12px', color: 'var(--ink3)', display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Active
        </label>
      )}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={save} disabled={saving} style={btnPrimary}>{saving ? 'Saving…' : 'Save'}</button>
        <button onClick={onCancel} style={btnGhost}>Cancel</button>
      </div>
      {!vendor && <div style={{ fontSize: '11px', color: 'var(--ink3)' }}>A new vendor is assigned to this event automatically. Vendors are shared across events.</div>}
    </div>
  )
}

const input: React.CSSProperties = {
  padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--ink)', fontSize: '13px', minWidth: 0,
}
const btnPrimary: React.CSSProperties = {
  padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)',
  color: 'var(--teal-light)', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
}
const btnAssigned: React.CSSProperties = {
  padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--lime-light)',
  color: 'var(--lime)', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
}
const btnGhost: React.CSSProperties = {
  padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent',
  color: 'var(--ink3)', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
}
