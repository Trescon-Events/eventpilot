'use client'

import { useEffect, useState } from 'react'
import { Card, Button, Badge, Input } from '@/app/components/ui'

/* Speaker Communications (2026-09-10) — a per-speaker "request outstanding
   items" flow: producers see exactly what's still missing (reusing the
   same logic as the Status Board, app/lib/stakeholders/missing-items.ts),
   send a templated email with a personal link, and track the round
   through to a producer-verified close. See supabase/speaker_
   communication_requests_migration.sql's own doc comment for the full
   design (modeled on announcement_approvals, not stakeholder_invites). */

type ItemKey = 'bio_full' | 'photo' | 'passport' | 'national_id'
type MissingItem = { key: ItemKey; label: string }
type RequestStatus = 'pending' | 'submitted' | 'closed'
type RequestRow = {
  id: string
  requested_fields: ItemKey[]
  status: RequestStatus
  requested_at: string
  submitted_at: string | null
  reminder_count: number
  last_reminder_at: string | null
  closed_at: string | null
}

const LABELS: Record<ItemKey, string> = { bio_full: 'Full Bio', photo: 'Photo', passport: 'Passport', national_id: 'National ID' }
const STATUS_BADGE: Record<RequestStatus, { label: string; color: 'amber' | 'teal' | 'grey' }> = {
  pending: { label: 'Pending', color: 'amber' },
  submitted: { label: 'Submitted — needs review', color: 'teal' },
  closed: { label: 'Closed', color: 'grey' },
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function CommunicationsTab({ speakerId, stakeholderName }: { speakerId: string; stakeholderName: string }) {
  const [missingItems, setMissingItems] = useState<MissingItem[]>([])
  const [requests, setRequests] = useState<RequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerSeed, setComposerSeed] = useState<ItemKey[]>([])
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}/communications`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setMissingItems(data.missing_items ?? [])
      setRequests(data.requests ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when the speaker itself changes
  }, [speakerId])

  function openComposer(seedKeys: ItemKey[]) {
    setComposerSeed(seedKeys)
    setComposerOpen(true)
  }

  async function remind(requestId: string) {
    setBusyRequestId(requestId); setError(null)
    try {
      const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}/communications/${requestId}/remind`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Reminder failed')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reminder failed')
    } finally {
      setBusyRequestId(null)
    }
  }

  async function acknowledge(requestId: string) {
    setBusyRequestId(requestId); setError(null)
    try {
      const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}/communications/${requestId}/acknowledge`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not send acknowledgment')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send acknowledgment')
    } finally {
      setBusyRequestId(null)
    }
  }

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '24px 32px' }}>
      <div style={{ display: 'grid', gap: '20px', maxWidth: '820px' }}>
        {error && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: '14.5px' }}>
            {error} <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700, marginLeft: '8px' }}>×</button>
          </div>
        )}

        <Card padded>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>Outstanding Items</div>
          <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '4px', marginBottom: '14px' }}>
            Same checklist the Status Board shows for this speaker — Full Bio, Photo, Passport, and (for UAE residents) National ID.
          </div>
          {loading ? (
            <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>Loading…</div>
          ) : missingItems.length === 0 ? (
            <Badge color="teal">Nothing outstanding</Badge>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                {missingItems.map(m => <Badge key={m.key} color="amber">{m.label}</Badge>)}
              </div>
              <Button variant="teal" onClick={() => openComposer(missingItems.map(m => m.key))}>Request Missing Items</Button>
            </>
          )}
        </Card>

        <Card padded>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '12px' }}>Request History</div>
          {loading ? (
            <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>Loading…</div>
          ) : requests.length === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>No requests sent yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              {requests.map(r => {
                const badge = STATUS_BADGE[r.status]
                const busy = busyRequestId === r.id
                return (
                  <div key={r.id} style={{ border: '1px solid var(--border-light)', borderRadius: '10px', padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ink)' }}>
                          {r.requested_fields.map(k => LABELS[k]).join(', ')}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--ink4)', marginTop: '4px' }}>
                          Sent {fmtDate(r.requested_at)}
                          {r.reminder_count > 0 ? ` · Reminded ${r.reminder_count}×` : ''}
                          {r.submitted_at ? ` · Submitted ${fmtDate(r.submitted_at)}` : ''}
                          {r.closed_at ? ` · Closed ${fmtDate(r.closed_at)}` : ''}
                        </div>
                      </div>
                      <Badge color={badge.color}>{badge.label}</Badge>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                      {r.status === 'pending' && (
                        <Button variant="ghost" onClick={() => remind(r.id)} disabled={busy}>{busy ? 'Sending…' : 'Send Reminder'}</Button>
                      )}
                      {r.status === 'submitted' && (
                        <>
                          <Button variant="teal" onClick={() => acknowledge(r.id)} disabled={busy}>{busy ? 'Sending…' : 'Send Acknowledgment (all good)'}</Button>
                          {missingItems.length > 0 && (
                            <Button variant="ghost" onClick={() => openComposer(missingItems.map(m => m.key))}>Request Again</Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {composerOpen && (
        <RequestComposer
          speakerId={speakerId}
          stakeholderName={stakeholderName}
          allMissingItems={missingItems}
          initialSelected={composerSeed}
          onClose={() => setComposerOpen(false)}
          onSent={load}
        />
      )}
    </div>
  )
}

function RequestComposer({ speakerId, stakeholderName, allMissingItems, initialSelected, onClose, onSent }: {
  speakerId: string
  stakeholderName: string
  allMissingItems: MissingItem[]
  initialSelected: ItemKey[]
  onClose: () => void
  onSent: () => void
}) {
  const [selected, setSelected] = useState<Set<ItemKey>>(new Set(initialSelected))
  const [step, setStep] = useState<'pick' | 'edit' | 'sending' | 'error'>('pick')
  const [pickError, setPickError] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)

  const [templateId, setTemplateId] = useState('')
  const [token, setToken] = useState('')
  const [requestedFields, setRequestedFields] = useState<ItemKey[]>([])
  const [recipientEmail, setRecipientEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [html, setHtml] = useState('')
  const [senderName, setSenderName] = useState('')
  const [senderEmail, setSenderEmail] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)

  function toggle(key: ItemKey) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function startCompose() {
    if (selected.size === 0) { setPickError('Select at least one item to request.'); return }
    setComposing(true); setPickError(null)
    try {
      const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}/communications/compose`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_keys: [...selected] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTemplateId(data.template_id)
      setToken(data.token)
      setRequestedFields(data.requested_fields)
      setRecipientEmail(data.recipient_email)
      setSubject(data.subject)
      setHtml(data.html)
      setSenderName(data.sender_name)
      setSenderEmail(data.sender_email)
      setStep('edit')
    } catch (e) {
      setPickError(e instanceof Error ? e.message : 'Could not compose email')
    }
    setComposing(false)
  }

  async function send() {
    setStep('sending'); setSendError(null)
    try {
      const res = await fetch(`/api/events/stakeholders/speakers/${speakerId}/communications/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: templateId, token, requested_fields: requestedFields, recipient_email: recipientEmail, subject, html }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onSent()
      onClose()
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Send failed')
      setStep('error')
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '620px', maxWidth: '95%', maxHeight: '90vh', overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ink)' }}>Request Missing Items — {stakeholderName}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', color: 'var(--ink3)', cursor: 'pointer' }}>×</button>
        </div>

        {step === 'pick' && (
          <div style={{ display: 'grid', gap: '14px' }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px' }}>What&apos;s Still Needed</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {allMissingItems.map(m => (
                <Button key={m.key} variant={selected.has(m.key) ? 'teal' : 'ghost'} onClick={() => toggle(m.key)}>
                  {selected.has(m.key) ? '✓ ' : ''}{m.label}
                </Button>
              ))}
            </div>
            {pickError && <div style={{ fontSize: '14.5px', color: 'var(--red)' }}>{pickError}</div>}
            <Button variant="teal" onClick={startCompose} disabled={composing}>{composing ? 'Composing…' : 'Compose Email'}</Button>
          </div>
        )}

        {(step === 'edit' || step === 'sending' || step === 'error') && (
          <div style={{ display: 'grid', gap: '12px' }}>
            <div style={{ fontSize: '14px', color: 'var(--ink3)' }}>
              Sending as <strong style={{ color: 'var(--ink2)' }}>{senderName}</strong> &lt;{senderEmail}&gt; to <strong style={{ color: 'var(--ink2)' }}>{recipientEmail}</strong>
            </div>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Subject</span>
              <Input value={subject} onChange={e => setSubject(e.target.value)} />
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '14px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>Preview</span>
              <div style={{ fontSize: '14.5px', color: 'var(--ink2)', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: html }} />
            </div>
            {sendError && <div style={{ fontSize: '14.5px', color: 'var(--red)' }}>{sendError}</div>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="teal" onClick={send} disabled={step === 'sending'}>{step === 'sending' ? 'Sending…' : step === 'error' ? 'Retry Send' : 'Send'}</Button>
              <Button variant="ghost" onClick={() => setStep('pick')}>Back</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
