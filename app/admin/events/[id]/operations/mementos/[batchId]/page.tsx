'use client'

import { use, useCallback, useEffect, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Badge, Button, Select } from '@/app/components/ui'
import Toast from '@/app/components/ui/Toast'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'

/* Operations > Mementos > one batch. Ops re-checks the photos, sends the batch to the memento vendor, and follows it through download to
   the vendor's "looks good" (or reported problem). This is where the producer's "Push to Ops" email/bell lands. */

type Status = 'requested' | 'sent' | 'downloaded' | 'confirmed' | 'issue' | 'revoked'
type Dispatch = {
  id: string; status: Status; speakers: number; request_note: string | null; requested_at: string; sent_at: string | null
  first_downloaded_at: string | null; last_downloaded_at: string | null; download_count: number; vendor_response_at: string | null; vendor_note: string | null
  revoked_at: string | null; vendor_name: string | null
}
type Detail = {
  batch: { id: string; name: string; note: string | null; status: string; event_id: string; event_name: string; print?: { generated_at: string | null } | null }
  items: Array<{ speaker_id: string; name: string; photo_url: string | null }>
  dispatches: Dispatch[]
  vendors: Array<{ id: string; name: string; logins: number }>
  audit: Array<{ action: string; actor_type: string; created_at: string }>
}

const STATUS: Record<Status, { label: string; color: 'amber' | 'teal' | 'purple' | 'grey' | 'red' }> = {
  requested: { label: 'Needs your review', color: 'amber' }, sent: { label: 'Sent to vendor', color: 'purple' }, downloaded: { label: 'Downloaded by vendor', color: 'purple' },
  confirmed: { label: 'Vendor confirmed', color: 'teal' }, issue: { label: 'Vendor reported a problem', color: 'red' }, revoked: { label: 'Revoked', color: 'grey' },
}
const ACTION_LABEL: Record<string, string> = {
  memento_dispatch_requested: 'Producer pushed the batch to Ops', memento_dispatch_sent: 'Ops sent it to the vendor', memento_dispatch_resent: 'Vendor notified again',
  memento_dispatch_revoked: 'Ops revoked it', memento_dispatch_reopened: 'Ops reopened it for the vendor', memento_files_viewed_by_ops: 'Ops downloaded the photos',
  vendor_memento_viewed: 'Vendor opened the page', vendor_memento_download_started: 'Vendor started a download', vendor_memento_downloaded: 'Vendor finished downloading',
  vendor_memento_confirmed: 'Vendor confirmed the photos look good', vendor_memento_issue_reported: 'Vendor reported a problem',
}
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')
const IN_FLIGHT: Status[] = ['requested', 'sent', 'downloaded', 'issue']

export default function OpsMementoBatchPage({ params }: { params: Promise<{ id: string; batchId: string }> }) {
  const { id: eventId, batchId } = use(params)
  const [d, setD] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vendorId, setVendorId] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  useBreadcrumbLabel(eventId, d?.batch.event_name ?? null)
  useBreadcrumbLabel(batchId, d?.batch.name ?? null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/events/operations/mementos/${batchId}`)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { setError(body.error ?? 'Could not load this batch.'); return }
    setD(body); setError(null)
    setVendorId(v => v || (body.vendors?.length === 1 ? body.vendors[0].id : ''))
  }, [batchId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
  useEffect(() => { void load() }, [load])

  async function act(action: string, dispatchId: string, extra?: Record<string, unknown>) {
    setBusy(`${action}${dispatchId}`)
    const res = await fetch(`/api/events/operations/mementos/${batchId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, dispatch_id: dispatchId, ...extra }) })
    const body = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { setToast({ message: body.error ?? 'Could not do that.', type: 'error' }); return }
    setToast({ message: action === 'send' ? 'Sent to the vendor. They have been notified.' : action === 'revoke' ? 'Revoked. The producer can adjust the batch and push it again.' : action === 'reopen' ? 'Reopened for the vendor.' : 'Vendor notified again.', type: 'success' })
    await load()
  }

  if (error) return <div style={{ padding: '32px', color: 'var(--red)' }}>{error}</div>
  if (!d) return <div style={{ padding: '32px', color: 'var(--ink3)' }}>Loading…</div>
  const current = d.dispatches.find(x => IN_FLIGHT.includes(x.status)) ?? d.dispatches.find(x => x.status === 'confirmed') ?? d.dispatches[0]
  const history = d.dispatches.filter(x => x.id !== current?.id)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader eyebrow="Operations · Mementos" title={d.batch.name} backHref={`/admin/events/${eventId}/operations/mementos`} backLabel="Mementos"
        description={<>{d.batch.event_name} · {d.items.length} speaker photo{d.items.length === 1 ? '' : 's'}</>} />
      <div style={{ padding: '24px 32px 60px', maxWidth: '1100px', display: 'grid', gap: '18px' }}>
        {current ? (
          <div style={{ padding: '18px', border: '1px solid var(--border-light)', borderRadius: '12px', background: 'var(--card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)' }}>{current.speakers} speaker photo{current.speakers === 1 ? '' : 's'}</div>
              <Badge color={STATUS[current.status].color}>{STATUS[current.status].label}</Badge>
              <div style={{ flex: 1 }} />
              <a href={`/api/events/operations/mementos/${batchId}?download=1`}><Button variant="ghost">{d.batch.print ? 'Download print file (PDF)' : 'Download photos (ZIP)'}</Button></a>
            </div>
            <div style={{ fontSize: '14px', color: 'var(--ink2)', lineHeight: 1.7 }}>
              Pushed by the producer {when(current.requested_at)}.{current.request_note || d.batch.note ? ` Note: “${current.request_note ?? d.batch.note}”` : ''}
              {current.vendor_name && <> Sent to <strong>{current.vendor_name}</strong> {when(current.sent_at)}.</>}
              {current.first_downloaded_at && <> Downloaded {when(current.first_downloaded_at)} ({current.download_count}×).</>}
              {current.status === 'confirmed' && <> <strong>Confirmed</strong> — the vendor said everything looks good {when(current.vendor_response_at)}.{current.vendor_note ? ` Note: “${current.vendor_note}”` : ''}</>}
              {current.status === 'issue' && <> <strong>Problem reported</strong> {when(current.vendor_response_at)}: “{current.vendor_note}”</>}
            </div>
            {current.status === 'requested' && (
              <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '14px', color: 'var(--ink2)', marginBottom: '8px' }}>Review the photos below, then send them to the memento vendor.</div>
                {d.vendors.length === 0 ? (
                  <div style={{ fontSize: '14px', color: 'var(--amber)' }}>No memento vendor is set up for this event. Add one under Operations &gt; Vendors (category: Memento), assign it to the event and create a portal login.</div>
                ) : (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <Select value={vendorId} onChange={e => setVendorId(e.target.value)} style={{ flex: '1 1 240px' }}>
                      <option value="">Choose the memento vendor…</option>
                      {d.vendors.map(v => <option key={v.id} value={v.id}>{v.name}{v.logins === 0 ? ' (no portal login yet)' : ''}</option>)}
                    </Select>
                    <Button variant="lime" disabled={!vendorId || busy !== null} onClick={() => void act('send', current.id, { vendor_id: vendorId })}>{busy === `send${current.id}` ? 'Sending…' : 'Send to vendor'}</Button>
                  </div>
                )}
              </div>
            )}
            <div style={{ marginTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {(current.status === 'sent' || current.status === 'downloaded') && <Button variant="ghost" disabled={busy !== null} onClick={() => void act('resend', current.id)}>Notify vendor again</Button>}
              {current.status === 'issue' && <Button variant="lime" disabled={busy !== null} onClick={() => void act('reopen', current.id)}>Reopen for the vendor</Button>}
              {IN_FLIGHT.includes(current.status) && <Button variant="red" disabled={busy !== null} onClick={() => { if (window.confirm('Revoke this hand-off? The vendor will no longer be able to download it, and the batch goes back to a draft for the producer.')) void act('revoke', current.id) }}>Revoke</Button>}
            </div>
          </div>
        ) : <div style={{ color: 'var(--ink3)' }}>No hand-off yet for this batch.</div>}

        <div>
          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>The photos ({d.items.length})</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' }}>
            {d.items.map(i => (
              <div key={i.speaker_id} style={{ border: '1px solid var(--border-light)', borderRadius: '8px', background: 'var(--card)', overflow: 'hidden' }}>
                <div style={{ aspectRatio: '1 / 1', background: 'repeating-conic-gradient(var(--surface2) 0% 25%, var(--surface) 0% 50%) 0 0 / 16px 16px' }}>
                  {i.photo_url
                    // eslint-disable-next-line @next/next/no-img-element -- remote Supabase storage URL
                    ? <img src={i.photo_url} alt={i.name} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                    : <div style={{ fontSize: '12px', color: 'var(--ink4)', padding: '10px' }}>No photo</div>}
                </div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)', padding: '6px 8px' }}>{i.name}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>Activity</div>
          {d.audit.length === 0 ? <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Nothing yet.</div> : (
            <div style={{ display: 'grid', gap: '4px' }}>
              {d.audit.map((a, i) => <div key={i} style={{ fontSize: '13px', color: 'var(--ink2)' }}><span style={{ color: 'var(--ink3)' }}>{when(a.created_at)}</span> · {ACTION_LABEL[a.action] ?? a.action}</div>)}
            </div>
          )}
        </div>

        {history.length > 0 && (
          <div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>Earlier hand-offs</div>
            {history.map(h => <div key={h.id} style={{ fontSize: '13px', color: 'var(--ink2)' }}>{STATUS[h.status].label}{h.vendor_name ? ` · ${h.vendor_name}` : ''} · {when(h.requested_at)}</div>)}
          </div>
        )}
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
