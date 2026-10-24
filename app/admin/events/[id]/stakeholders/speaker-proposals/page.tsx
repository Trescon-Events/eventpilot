'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader'
import { Button, Input } from '@/app/components/ui'
import { notify } from '@/app/lib/ui/notify'

/* Speaker Proposals — the event's batches (one per spreadsheet "drop") and the upload that starts a new one. */
type BatchRow = { id: string; name: string; status: string; source_filename: string | null; created_at: string; total: number; researched: number; ready: number; excluded: number }

export default function SpeakerProposalsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const router = useRouter()
  const [batches, setBatches] = useState<BatchRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetch(`/api/events/speaker-proposals/batches?event_id=${eventId}`)
      const d = await res.json().catch(() => ({}))
      if (cancelled) return
      if (!res.ok) setLoadError(d.error ?? 'Could not load the batches.'); else setBatches(d.batches)
    })()
    return () => { cancelled = true }
  }, [eventId])

  async function create() {
    if (!name.trim()) { notify('Give the drop a name first.', 'error'); return }
    setBusy(true)
    const res = await fetch('/api/events/speaker-proposals/batches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, name: name.trim() }) })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { notify(d.error ?? 'Could not create the drop.', 'error'); return }
    router.push(`/admin/events/${eventId}/stakeholders/speaker-proposals/${d.id}`)
  }

  if (loadError) return <div style={{ padding: '32px', color: 'var(--red)' }}>{loadError}</div>
  return (
    <div>
      <PageHeader eyebrow="Stakeholder Hub" title="Speaker Proposals" description="A drop is a batch of proposed speakers. Add speakers, let the system research each one, review the cards, preview what the client sees, then send it for approval." backHref={`/admin/events/${eventId}/stakeholders`} backLabel="Stakeholder Hub" />
      <div style={{ padding: '20px 32px 60px', maxWidth: '980px' }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '18px', background: 'var(--card)', marginBottom: '24px' }}>
          <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>New drop</div>
          <div style={{ fontSize: '13.5px', color: 'var(--ink3)', marginBottom: '12px' }}>Name the drop, then add its speakers inside — upload a spreadsheet or type them in one by one.</div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 280px', maxWidth: '420px' }}><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Drop 27" onKeyDown={e => { if (e.key === 'Enter') void create() }} /></div>
            <Button variant="teal" onClick={() => void create()} disabled={busy}>{busy ? 'Creating…' : 'Create drop'}</Button>
          </div>
        </div>

        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '10px' }}>Drops</div>
        {!batches ? <div style={{ color: 'var(--ink3)' }}>Loading…</div> : batches.length === 0 ? <div style={{ color: 'var(--ink3)', fontSize: '14px' }}>No drops yet.</div> : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {batches.map(b => (
              <Link key={b.id} href={`/admin/events/${eventId}/stakeholders/speaker-proposals/${b.id}`} style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', padding: '14px 16px', border: '1px solid var(--border-light)', borderRadius: '10px', background: 'var(--card)', textDecoration: 'none' }}>
                <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)', flex: 1 }}>{b.name}</span>
                <span style={{ fontSize: '13.5px', color: 'var(--ink3)' }}>{b.total} speakers · {b.researched} researched · {b.ready} ready{b.excluded ? ` · ${b.excluded} excluded` : ''}</span>
                <span style={{ fontSize: '12.5px', color: 'var(--ink4)' }}>{new Date(b.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
