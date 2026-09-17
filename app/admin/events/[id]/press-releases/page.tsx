'use client'

import { useState, use, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'

type PressRelease = {
  id: string; title: string; status: string; created_at: string; updated_at: string
  press_release_versions: { count: number }[] | null
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  draft:      { label: 'Draft',      color: 'var(--ink3)',   bg: 'var(--border-light)' },
  in_review:  { label: 'In Review',  color: 'var(--amber)',  bg: 'var(--amber-light)' },
  approved:   { label: 'Approved',   color: 'var(--lime)',   bg: 'var(--lime-light)' },
  published:  { label: 'Published',  color: 'var(--teal)',   bg: 'var(--teal-light)' },
}

export default function PressReleasesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const router = useRouter()
  const [releases, setReleases] = useState<PressRelease[]>([])
  const [eventName, setEventName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')

  useBreadcrumbLabel(eventId, eventName)

  const load = useCallback(async () => {
    setLoading(true)
    const [releasesRes, eventRes] = await Promise.all([
      fetch(`/api/events/press-releases?event_id=${eventId}`),
      fetch(`/api/events?id=${eventId}`),
    ])
    if (releasesRes.ok) setReleases(await releasesRes.json())
    if (eventRes.ok) {
      const eventData = await eventRes.json()
      setEventName(eventData?.name ?? null)
    }
    setLoading(false)
  }, [eventId])

  useEffect(() => { load() }, [load])

  async function createRelease() {
    if (!newTitle.trim()) return
    const res = await fetch('/api/events/press-releases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, title: newTitle.trim() }),
    })
    if (res.ok) {
      const created = await res.json()
      router.push(`/admin/events/${eventId}/press-releases/${created.id}`)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Press Release Studio"
        title="Press Releases"
        description="Research a story, generate a draft, iterate, and get it approved — grounded in this event's style guide and messaging."
        actions={
          creating ? (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createRelease()}
                placeholder="Working title…"
                style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', minWidth: '220px' }}
              />
              <button onClick={createRelease} style={btnPrimary}>Create</button>
              <button onClick={() => { setCreating(false); setNewTitle('') }} style={btnGhost}>Cancel</button>
            </div>
          ) : (
            <button onClick={() => setCreating(true)} style={btnPrimary}>+ New Press Release</button>
          )
        }
      />

      <div style={{ padding: '24px 32px', maxWidth: '960px' }}>
        {loading ? (
          <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>
        ) : releases.length === 0 ? (
          <div style={{ color: 'var(--ink3)', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>
            No press releases yet for this event. Start one with &ldquo;New Press Release&rdquo; above.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {releases.map(r => {
              const cfg = STATUS_CFG[r.status] ?? STATUS_CFG.draft
              const versionCount = r.press_release_versions?.[0]?.count ?? 0
              return (
                <div
                  key={r.id}
                  onClick={() => router.push(`/admin/events/${eventId}/press-releases/${r.id}`)}
                  style={{
                    padding: '16px 18px', borderRadius: '10px', border: '1px solid var(--border)',
                    background: 'var(--card)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>{r.title}</div>
                    <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '4px' }}>
                      {versionCount} version{versionCount === 1 ? '' : 's'} · updated {new Date(r.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px', color: cfg.color, background: cfg.bg }}>
                    {cfg.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const btnPrimary: React.CSSProperties = {
  padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)',
  color: 'var(--teal-light)', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
}
const btnGhost: React.CSSProperties = {
  padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent',
  color: 'var(--ink3)', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
}
