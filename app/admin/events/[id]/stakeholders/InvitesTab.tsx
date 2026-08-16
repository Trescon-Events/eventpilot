'use client'

import { useEffect, useState } from 'react'
import { Card, Button, Input, Select, Badge } from '@/app/components/ui'
import InviteComposer from './InviteComposer'

/* Unified top-level Invites tab (2026-08-14, per Madhu) — every invite sent
   for this event, across every category, in one place, replacing the old
   per-category-tab "Invites" card (which meant checking each tab
   separately to see what had gone out). Self-contained like DeletedTab.tsx
   — fetches its own data rather than threading state through the parent
   page. */

type FormType = 'speaker' | 'sponsor' | 'media_partner' | 'association_partner'
const FORM_TYPE_LABELS: Record<FormType, string> = {
  speaker: 'Speaker', sponsor: 'Sponsor', media_partner: 'Media Partner', association_partner: 'Association Partner',
}

type Invite = {
  id: string; event_id: string; form_type: FormType; template_id: string
  invite_token: string; recipient_name: string; recipient_email: string
  status: 'draft' | 'sent' | 'submitted'; send_error: string | null
  actual_subject: string; actual_body_html: string
  sent_at: string | null; reminder_count: number
  submission: { status: string; processed_into: string | null } | null
}

export default function InvitesTab({ eventId, can }: { eventId: string; can: (key: string) => boolean }) {
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'sent' | 'draft' | 'submitted'>('all')
  const [categoryFilter, setCategoryFilter] = useState<'all' | FormType>('all')
  const [composeOpen, setComposeOpen] = useState(false)
  const [reminderTarget, setReminderTarget] = useState<Invite | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function fetchInvites() {
    setLoading(true)
    const res = await fetch(`/api/events/stakeholders/invites?event_id=${eventId}`)
    setInvites(await res.json().catch(() => []))
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount, matches DeletedTab.tsx's own pattern
  useEffect(() => { fetchInvites() }, [eventId])

  async function retryInvite(invite: Invite) {
    const res = await fetch('/api/events/stakeholders/invites/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invite_token: invite.invite_token, event_id: invite.event_id, form_type: invite.form_type, template_id: invite.template_id,
        recipient_name: invite.recipient_name, recipient_email: invite.recipient_email,
        subject: invite.actual_subject, html: invite.actual_body_html,
      }),
    })
    if (res.ok) fetchInvites()
    else setMsg('Retry failed — check the invite for details.')
  }

  function reviewUrl(invite: Invite): string | null {
    if (!invite.submission?.processed_into) return null
    const kind = invite.form_type === 'speaker' ? 'speaker' : 'partner'
    return `/admin/events/${invite.event_id}/stakeholders/${invite.submission.processed_into}?kind=${kind}&formType=${invite.form_type}`
  }

  const q = search.trim().toLowerCase()
  const filtered = invites.filter(inv => {
    if (statusFilter !== 'all' && inv.status !== statusFilter) return false
    if (categoryFilter !== 'all' && inv.form_type !== categoryFilter) return false
    if (q && !`${inv.recipient_name} ${inv.recipient_email}`.toLowerCase().includes(q)) return false
    return true
  })

  const counts = {
    sent: invites.filter(i => i.status === 'sent').length,
    draft: invites.filter(i => i.status === 'draft').length,
    submitted: invites.filter(i => i.status === 'submitted').length,
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--ink)' }}>Invites</div>
        {can('sae.invites.send') && <Button variant="lime" onClick={() => setComposeOpen(true)}>+ Invite</Button>}
      </div>

      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: '14.5px', marginBottom: '14px' }}>
          {msg} <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700, marginLeft: '8px' }}>×</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <Card padded>
          <span style={{ fontSize: '15px', color: 'var(--ink3)' }}>Sent </span>
          <strong style={{ fontSize: '18px', color: 'var(--ink)' }}>{counts.sent}</strong>
        </Card>
        <Card padded>
          <span style={{ fontSize: '15px', color: 'var(--ink3)' }}>Failed / Draft </span>
          <strong style={{ fontSize: '18px', color: counts.draft > 0 ? 'var(--red)' : 'var(--ink)' }}>{counts.draft}</strong>
        </Card>
        <Card padded>
          <span style={{ fontSize: '15px', color: 'var(--ink3)' }}>Submitted </span>
          <strong style={{ fontSize: '18px', color: 'var(--ink)' }}>{counts.submitted}</strong>
        </Card>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email…" style={{ width: '240px' }} />
        <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} style={{ width: '170px' }}>
          <option value="all">All statuses</option>
          <option value="sent">Sent</option>
          <option value="draft">Failed / Draft</option>
          <option value="submitted">Submitted</option>
        </Select>
        <Select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value as typeof categoryFilter)} style={{ width: '200px' }}>
          <option value="all">All categories</option>
          {(Object.keys(FORM_TYPE_LABELS) as FormType[]).map(ft => <option key={ft} value={ft}>{FORM_TYPE_LABELS[ft]}</option>)}
        </Select>
      </div>

      {loading ? (
        <div style={{ color: 'var(--ink3)', fontSize: '15px' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: 'var(--ink3)', fontSize: '15px', padding: '30px 0', textAlign: 'center' }}>
          {invites.length === 0 ? 'No invites sent yet.' : 'No invites match your filters.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '10px' }}>
          {filtered.map(inv => {
            const url = reviewUrl(inv)
            return (
              <Card key={inv.id} padded>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '15.5px', fontWeight: 800, color: 'var(--ink)' }}>
                      {inv.recipient_name} <span style={{ fontWeight: 500, color: 'var(--ink3)' }}>· {inv.recipient_email}</span>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--ink4)', marginTop: '4px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <Badge color="grey">{FORM_TYPE_LABELS[inv.form_type]}</Badge>
                      {inv.status === 'sent' && <span>Sent{inv.sent_at ? ' ' + new Date(inv.sent_at).toLocaleDateString() : ''}{inv.reminder_count > 0 ? ` · Reminded ${inv.reminder_count}×` : ''}</span>}
                      {inv.status === 'draft' && <span style={{ color: 'var(--red)' }}>Send failed{inv.send_error ? `: ${inv.send_error}` : ''}</span>}
                      {inv.status === 'submitted' && <span>Submitted</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {inv.status === 'sent' && can('sae.invites.send') && <Button variant="ghost" onClick={() => setReminderTarget(inv)}>Send Reminder</Button>}
                    {inv.status === 'draft' && can('sae.invites.send') && <Button variant="red" onClick={() => retryInvite(inv)}>Retry Send</Button>}
                    {inv.status === 'submitted' && (url
                      ? <Button variant="teal" href={url}>Open Record</Button>
                      : <Badge color="teal">Submitted</Badge>)}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {composeOpen && (
        <InviteComposer
          eventId={eventId}
          onClose={() => setComposeOpen(false)}
          onSent={fetchInvites}
        />
      )}
      {reminderTarget && (
        <InviteComposer
          eventId={eventId}
          formType={reminderTarget.form_type}
          title={`Send Reminder — ${reminderTarget.recipient_name}`}
          initialTemplateId={reminderTarget.template_id}
          initialRecipientName={reminderTarget.recipient_name}
          initialRecipientEmail={reminderTarget.recipient_email}
          onClose={() => setReminderTarget(null)}
          onSent={() => { setReminderTarget(null); fetchInvites() }}
        />
      )}
    </div>
  )
}
