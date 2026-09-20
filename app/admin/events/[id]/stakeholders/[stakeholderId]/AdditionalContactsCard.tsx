'use client'

import { useEffect, useState } from 'react'
import { Card, Button, Input, Badge } from '@/app/components/ui'

/* Additional Contacts (2026-09-20, Madhu) — a speaker's own small pool of
   extra people a producer coordinates with about them: an assistant,
   their office, whoever — deliberately not typed as "assistant"
   specifically, since who it actually is varies and this isn't the only
   way one gets added here (a producer can add one directly from ongoing
   communication, nothing to do with the onboarding form). See supabase/
   speaker_additional_contacts_migration.sql for the full design.

   Lives on the Communications tab (not Overview) — this list exists
   specifically to save re-typing the same email on every producer->
   speaker send; SendToSpeakerComposer/SendForExternalApprovalComposer/
   NotifyExternalComposer each fetch it themselves and default their CC
   list from it. Empty by default for every speaker — nothing here unless
   the onboarding form's assistant-coordination consent was checked
   (auto-captured, source='form') or a producer adds one by hand
   (source='manual'). */

type Contact = { id: string; first_name: string | null; last_name: string | null; email: string; source: 'manual' | 'form' }

export default function AdditionalContactsCard({ speakerId, canEdit }: { speakerId: string; canEdit: boolean }) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}/additional-contacts`)
    const data = await res.json().catch(() => ({}))
    setContacts(data.contacts ?? [])
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when the speaker itself changes
  }, [speakerId])

  async function addContact() {
    if (!email.trim()) return
    setAdding(true); setError(null)
    const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}/additional-contacts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name: firstName.trim(), last_name: lastName.trim(), email: email.trim() }),
    })
    const data = await res.json().catch(() => ({}))
    setAdding(false)
    if (res.ok) { setFirstName(''); setLastName(''); setEmail(''); await load() }
    else setError(data.error ?? 'Could not add contact.')
  }

  async function removeContact(id: string) {
    setBusyId(id)
    const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}/additional-contacts/${id}`, { method: 'DELETE' })
    setBusyId(null)
    if (res.ok) setContacts(prev => prev.filter(c => c.id !== id))
  }

  if (loading) return null

  return (
    <Card padded>
      <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>Additional Contacts</div>
      <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '4px', marginBottom: '14px' }}>
        Anyone else you coordinate with about this speaker — an assistant, their office, whoever. Every one of them is CC&apos;d by default (still editable) any time you send this speaker something from EventPilot, so you stop retyping the same email.
      </div>

      {error && (
        <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: '12.5px', marginBottom: '12px' }}>{error}</div>
      )}

      {contacts.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--ink4)', marginBottom: '14px' }}>None yet — sends go directly to the speaker unless you type someone else in on the fly.</div>
      ) : (
        <div style={{ display: 'grid', gap: '8px', marginBottom: '14px' }}>
          {contacts.map(c => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '8px', background: 'var(--card-hi)' }}>
              <div>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ink)' }}>
                  {[c.first_name, c.last_name].filter(Boolean).join(' ') || c.email}
                  {c.source === 'form' && <Badge color="teal">From form</Badge>}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--ink4)', marginTop: '2px' }}>{c.email}</div>
              </div>
              {canEdit && (
                <button onClick={() => removeContact(c.id)} disabled={busyId === c.id}
                  style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid var(--red-border)', background: 'transparent', color: 'var(--red)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink4)', display: 'block', marginBottom: '4px' }}>First Name</label>
            <Input value={firstName} onChange={e => setFirstName(e.target.value)} style={{ width: '160px' }} />
          </div>
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink4)', display: 'block', marginBottom: '4px' }}>Last Name</label>
            <Input value={lastName} onChange={e => setLastName(e.target.value)} style={{ width: '160px' }} />
          </div>
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink4)', display: 'block', marginBottom: '4px' }}>Email</label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} style={{ width: '220px' }} />
          </div>
          <Button variant="teal" onClick={addContact} disabled={adding || !email.trim()}>
            {adding ? 'Adding…' : '+ Add Contact'}
          </Button>
        </div>
      )}
    </Card>
  )
}
