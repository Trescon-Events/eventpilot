'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader'
import { Button } from '@/app/components/ui'
import CreateDropModal, { type Producer } from '@/app/components/proposals/CreateDropModal'
import { permissionSetSatisfies } from '@/app/lib/access/permission-match'

/* Speaker Proposals — the event's batches (one per spreadsheet "drop") and the upload that starts a new one. */
type BatchRow = { id: string; name: string; status: string; source_filename: string | null; created_at: string; total: number; researched: number; ready: number; excluded: number }

export default function SpeakerProposalsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const router = useRouter()
  const [batches, setBatches] = useState<BatchRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [setup, setSetup] = useState<{ team: Producer[]; me: string | null } | null>(null)
  const [perms, setPerms] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const canEdit = permissionSetSatisfies(perms, 'sae.stakeholders.edit')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetch(`/api/events/speaker-proposals/batches?event_id=${eventId}`)
      const d = await res.json().catch(() => ({}))
      if (cancelled) return
      if (!res.ok) setLoadError(d.error ?? 'Could not load the batches.'); else setBatches(d.batches)
    })()
    void (async () => {
      const [s, p] = await Promise.all([fetch(`/api/events/speaker-proposals/setup?event_id=${eventId}`).then(x => (x.ok ? x.json() : null)).catch(() => null), fetch(`/api/events/access/me?event_id=${eventId}`).then(x => x.json()).catch(() => ({}))])
      if (cancelled) return
      setSetup(s); setPerms(new Set<string>((p as { permissions?: string[] }).permissions ?? []))
    })()
    return () => { cancelled = true }
  }, [eventId])

  if (loadError) return <div style={{ padding: '32px', color: 'var(--red)' }}>{loadError}</div>
  return (
    <div>
      <PageHeader eyebrow="Stakeholder Hub" title="Speaker Proposals" description="A drop is a batch of proposed speakers. Add speakers, let the system research each one, review the cards, preview what the client sees, then share one link with the client for approval." backHref={`/admin/events/${eventId}/stakeholders`} backLabel="Stakeholder Hub" />
      <div style={{ padding: '20px 32px 60px', maxWidth: '980px' }}>
        {canEdit && <div style={{ marginBottom: '24px' }}><Button variant="teal" onClick={() => setCreating(true)} disabled={!setup}>Create drop</Button></div>}

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
      {creating && setup && <CreateDropModal eventId={eventId} team={setup.team} me={setup.me} onClose={() => setCreating(false)} onCreated={id => router.push(`/admin/events/${eventId}/stakeholders/speaker-proposals/${id}`)} />}
    </div>
  )
}
