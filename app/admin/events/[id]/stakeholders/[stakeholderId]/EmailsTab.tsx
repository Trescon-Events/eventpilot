'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/app/components/ui'

/* Emails tab on a speaker's record (2026-11-12): every Emails-module email that went to this person, across events, with what happened to each, like the activity timeline on a HubSpot
   contact. Only emails of events the viewer can access are listed. */

type Row = { id: string; campaign_id: string; campaign_name: string; subject: string; event_id: string; event_name: string | null; sent_at: string | null; status: string; to: string; cc: string[]; from: string | null; reply_type: string; bounce_kind: string | null; stop_requested: boolean; note: string | null }
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')

export default function EmailsTab({ speakerId, eventId, stakeholderName }: { speakerId: string; eventId: string; stakeholderName: string }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void (async () => {
      const r = await fetch(`/api/events/stakeholders/speakers/${speakerId}/email-activity`)
      const d = await r.json().catch(() => ({}))
      if (!live) return
      if (r.ok) setRows(d.activity ?? []); else { setRows([]); setError(d.error ?? 'Could not load the emails.') }
    })()
    return () => { live = false }
  }, [speakerId])

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 32px' }}>
      <div style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '14px', lineHeight: 1.6 }}>Every email sent to {stakeholderName} from the Emails module, across events. Open an email to see everyone it went to.</div>
      {rows === null && <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>}
      {error && <div style={{ color: 'var(--amber)', fontSize: '13px' }}>{error}</div>}
      {rows && rows.length === 0 && !error && <div style={{ padding: '24px', borderRadius: '14px', border: '1px solid var(--border)', background: 'var(--card)', fontSize: '14px', color: 'var(--ink2)' }}>No emails have been sent to {stakeholderName} from the Emails module yet.</div>}
      <div style={{ display: 'grid', gap: '8px' }}>
        {(rows ?? []).map(r => (
          <div key={r.id} style={{ padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--card)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'baseline' }}>
              <Link href={`/admin/events/${r.event_id}/stakeholders/emails?open=${r.campaign_id}`} style={{ fontSize: '14px', fontWeight: 800, color: 'var(--teal-mid)', textDecoration: 'none' }}>{r.campaign_name}</Link>
              <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>{when(r.sent_at)}</div>
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--ink2)', marginTop: '2px' }}>{r.subject}</div>
            <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '3px', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              {r.event_name} · to {r.to}{r.cc.length ? ` · cc ${r.cc.length}` : ''}{r.from ? ` · from ${r.from}` : ''}
              <Badge color={r.status === 'sent' ? 'teal' : r.status === 'failed' ? 'red' : 'amber'}>{r.status}</Badge>
              {r.reply_type !== 'none' && <Badge color={r.reply_type === 'bounce' ? (r.bounce_kind === 'hard' ? 'red' : 'amber') : r.reply_type === 'reply' ? 'purple' : 'grey'}>{r.reply_type === 'bounce' ? `bounced${r.bounce_kind === 'hard' ? ' (bad address)' : ''}` : r.reply_type === 'reply' ? 'replied' : 'auto-reply'}</Badge>}
              {r.stop_requested && <Badge color="amber">asked to stop</Badge>}
            </div>
            {r.note && <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '3px', overflowWrap: 'anywhere' }}>{r.note}</div>}
          </div>
        ))}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '14px' }}>From the speaker’s event workspace: <Link href={`/admin/events/${eventId}/stakeholders/emails`} style={{ color: 'var(--teal-mid)', fontWeight: 700 }}>all emails for this event</Link>.</div>
    </div>
  )
}
