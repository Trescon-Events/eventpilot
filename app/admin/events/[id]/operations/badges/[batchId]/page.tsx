'use client'

import { use, useCallback, useEffect, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Badge, Button, Select } from '@/app/components/ui'
import Toast from '@/app/components/ui/Toast'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'

/* Operations > Badge Printing > one batch. Ops re-checks the print file, sends it to the print vendor, and follows it
   through download to "printed". This is where the producer's "Notify Ops" email/bell lands. */

type Dispatch = {
  id: string; status: 'requested' | 'sent' | 'downloaded' | 'printed' | 'revoked'; pdf_version: number; badges: number; request_note: string | null
  requested_at: string; sent_at: string | null; first_downloaded_at: string | null; last_downloaded_at: string | null; download_count: number
  printed_confirmed_at: string | null; printed_note: string | null; revoked_at: string | null; vendor_name: string | null
}
type Detail = {
  batch: { id: string; name: string; event_id: string; event_name: string; template_name: string; canvas_width: number; canvas_height: number; print?: { width_mm: number; height_mm: number; bleed_mm: number } }
  items: Array<{ id: string; name: string | null; preview_url: string | null }>
  dispatches: Dispatch[]
  vendors: Array<{ id: string; name: string; logins: number }>
  audit: Array<{ action: string; actor_type: string; created_at: string; meta: Record<string, unknown> | null }>
}

const STATUS: Record<Dispatch['status'], { label: string; color: 'amber' | 'teal' | 'purple' | 'grey' }> = {
  requested: { label: 'Needs your review', color: 'amber' }, sent: { label: 'Sent to printer', color: 'purple' },
  downloaded: { label: 'Downloaded by printer', color: 'purple' }, printed: { label: 'Printed', color: 'teal' }, revoked: { label: 'Revoked', color: 'grey' },
}
const ACTION_LABEL: Record<string, string> = {
  badge_dispatch_requested: 'Producer released the file to Ops', badge_dispatch_sent: 'Ops sent it to the printer', badge_dispatch_resent: 'Printer notified again',
  badge_dispatch_revoked: 'Ops revoked it', badge_file_viewed_by_ops: 'Ops opened the print file', vendor_badge_batch_viewed: 'Printer opened the page',
  vendor_badge_download_started: 'Printer started a download', vendor_badge_downloaded: 'Printer finished downloading', vendor_badge_printed_confirmed: 'Printer confirmed printed',
}
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')

export default function OpsBadgeBatchPage({ params }: { params: Promise<{ id: string; batchId: string }> }) {
  const { id: eventId, batchId } = use(params)
  const [d, setD] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vendorId, setVendorId] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  useBreadcrumbLabel(eventId, d?.batch.event_name ?? null)
  useBreadcrumbLabel(batchId, d?.batch.name ?? null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/events/operations/badges/${batchId}`)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { setError(body.error ?? 'Could not load this batch.'); return }
    setD(body); setError(null)
    setVendorId(v => v || (body.vendors?.length === 1 ? body.vendors[0].id : ''))
  }, [batchId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
  useEffect(() => { void load() }, [load])

  async function act(action: string, dispatchId: string, extra?: Record<string, unknown>) {
    setBusy(`${action}${dispatchId}`)
    const res = await fetch(`/api/events/operations/badges/${batchId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, dispatch_id: dispatchId, ...extra }) })
    const body = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { setToast({ message: body.error ?? 'Could not do that.', type: 'error' }); return }
    setToast({ message: action === 'send' ? 'Sent to the vendor. They have been notified.' : action === 'revoke' ? 'Revoked.' : 'Vendor notified again.', type: 'success' })
    await load()
  }
  async function openFile(dispatchId: string) {
    const res = await fetch(`/api/events/operations/badges/${batchId}?download=${dispatchId}`)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { setToast({ message: body.error ?? 'Could not open the file.', type: 'error' }); return }
    const a = document.createElement('a'); a.href = body.url; a.download = body.filename; document.body.appendChild(a); a.click(); a.remove()
  }

  if (error) return <div style={{ padding: '32px', color: 'var(--red)' }}>{error}</div>
  if (!d) return <div style={{ padding: '32px', color: 'var(--ink3)' }}>Loading…</div>
  const current = d.dispatches.find(x => ['requested', 'sent', 'downloaded'].includes(x.status)) ?? d.dispatches[0]
  const history = d.dispatches.filter(x => x.id !== current?.id)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader eyebrow="Operations · Badge Printing" title={d.batch.name} backHref={`/admin/events/${eventId}/operations/badges`} backLabel="Badge Printing"
        description={<>{d.batch.event_name} · {d.batch.template_name}{d.batch.print ? ` · artwork ${d.batch.print.width_mm} × ${d.batch.print.height_mm} mm, bleed ${d.batch.print.bleed_mm} mm` : ''}</>} />
      <div style={{ padding: '24px 32px 60px', maxWidth: '1100px', display: 'grid', gap: '18px' }}>
        {current ? (
          <div style={{ padding: '18px', border: '1px solid var(--border-light)', borderRadius: '12px', background: 'var(--card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)' }}>Print file v{current.pdf_version} · {current.badges} badge{current.badges === 1 ? '' : 's'}</div>
              <Badge color={STATUS[current.status].color}>{STATUS[current.status].label}</Badge>
              <div style={{ flex: 1 }} />
              <Button variant="ghost" onClick={() => void openFile(current.id)}>Download to review</Button>
            </div>
            <div style={{ fontSize: '14px', color: 'var(--ink2)', lineHeight: 1.7 }}>
              Released by the producer {when(current.requested_at)}.{current.request_note ? ` Note: “${current.request_note}”` : ''}
              {current.vendor_name && <> Sent to <strong>{current.vendor_name}</strong> {when(current.sent_at)}.</>}
              {current.first_downloaded_at && <> Downloaded {when(current.first_downloaded_at)} ({current.download_count}×).</>}
              {current.printed_confirmed_at && <> <strong>Printed</strong> — confirmed {when(current.printed_confirmed_at)}.{current.printed_note ? ` Note: “${current.printed_note}”` : ''}</>}
            </div>
            {current.status === 'requested' && (
              <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '14px', color: 'var(--ink2)', marginBottom: '8px' }}>Review the file, then send it to the print vendor.</div>
                {d.vendors.length === 0 ? (
                  <div style={{ fontSize: '14px', color: 'var(--amber)' }}>No print vendor is set up for this event. Add one under Operations &gt; Vendors (category: Print, then assign it and create a portal login).</div>
                ) : (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <Select value={vendorId} onChange={e => setVendorId(e.target.value)} style={{ flex: '1 1 240px' }}>
                      <option value="">Choose the print vendor…</option>
                      {d.vendors.map(v => <option key={v.id} value={v.id}>{v.name}{v.logins === 0 ? ' (no portal login yet)' : ''}</option>)}
                    </Select>
                    <Button variant="lime" disabled={!vendorId || busy !== null} onClick={() => void act('send', current.id, { vendor_id: vendorId })}>{busy === `send${current.id}` ? 'Sending…' : 'Send to vendor'}</Button>
                  </div>
                )}
              </div>
            )}
            {(current.status === 'sent' || current.status === 'downloaded') && (
              <div style={{ marginTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Button variant="ghost" disabled={busy !== null} onClick={() => void act('resend', current.id)}>Notify vendor again</Button>
              </div>
            )}
            {['requested', 'sent', 'downloaded'].includes(current.status) && (
              <div style={{ marginTop: '10px' }}><Button variant="red" disabled={busy !== null} onClick={() => { if (window.confirm('Revoke this hand-off? The vendor will no longer be able to download it.')) void act('revoke', current.id) }}>Revoke</Button></div>
            )}
          </div>
        ) : <div style={{ color: 'var(--ink3)' }}>No hand-off yet for this batch.</div>}

        <div>
          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>The badges ({d.items.length})</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px' }}>
            {d.items.map(i => (
              <div key={i.id} style={{ border: '1px solid var(--border-light)', borderRadius: '8px', background: 'var(--card)', overflow: 'hidden' }}>
                {i.preview_url && (
                  // eslint-disable-next-line @next/next/no-img-element -- generated preview from storage
                  <img src={i.preview_url} alt={i.name ?? ''} style={{ width: '100%', aspectRatio: `${d.batch.canvas_width} / ${d.batch.canvas_height}`, objectFit: 'contain', display: 'block', background: 'var(--surface)' }} />
                )}
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
            {history.map(h => <div key={h.id} style={{ fontSize: '13px', color: 'var(--ink2)' }}>v{h.pdf_version} · {STATUS[h.status].label}{h.vendor_name ? ` · ${h.vendor_name}` : ''} · {when(h.requested_at)}</div>)}
          </div>
        )}
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
