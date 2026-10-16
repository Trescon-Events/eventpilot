'use client'

import { useState, useEffect } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Button, Card } from '@/app/components/ui'

/* Umbrella/event separation (2026-09-11) — umbrellas live in their own
   event_umbrellas table now (see supabase/umbrella_events_separation_migration.sql),
   so they no longer show up in the regular events list at all. This is
   the simple index to find and open one — not the fancy grouped-list-
   with-nested-children visual from the original Staff Portal screenshot
   (deliberately deferred; this page exists so umbrellas stay reachable
   at all, which is the load-bearing part).

   2026-10-15 — also where a platform admin creates a Trescon SERIES umbrella (World AI Show, World Cyber Security Show…) and attaches
   existing events to it: Staff Portal sends no umbrella type, so a series can only be made here. Client umbrellas (DFFW) stay Staff Portal's. */

type UmbrellaListRow = { id: string; name: string; client_name: string | null; status: string; type?: string | null; events?: { count: number }[] }
type EventOption = { id: string; name: string; umbrella_id: string | null }

export default function UmbrellasListPage() {
  const [umbrellas, setUmbrellas] = useState<UmbrellaListRow[]>([])
  const [events, setEvents] = useState<EventOption[]>([])
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [newName, setNewName] = useState('')
  const [pick, setPick] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/events/umbrellas').then(r => r.json()),
      fetch('/api/events/umbrellas/attach').then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([u, e]) => {
      if (cancelled) return
      setUmbrellas(Array.isArray(u) ? u : []); setEvents(Array.isArray(e) ? e : []); setLoading(false)
    })
    return () => { cancelled = true }
  }, [reloadKey])

  async function send(url: string, body: unknown, ok: string) {
    setBusy(true); setMsg(null)
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    setMsg(res.ok ? ok : (d.error ?? 'Failed.'))
    if (res.ok) setReloadKey(k => k + 1)
    return res.ok
  }

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '24px 32px' }}>
      <PageHeader eyebrow="Events" title="Umbrella Events" description="Groupings of related events sharing top-level reference documents and content rules." />
      {msg && <div style={{ fontSize: '13px', marginBottom: '12px', color: 'var(--ink2)' }}>{msg}</div>}
      {loading ? (
        <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Loading…</div>
      ) : umbrellas.length === 0 ? (
        <Card padded><div style={{ fontSize: '13px', color: 'var(--ink3)', textAlign: 'center', padding: '10px' }}>No umbrella events yet.</div></Card>
      ) : (
        <div style={{ display: 'grid', gap: '8px' }}>
          {umbrellas.map(u => {
            const attached = events.filter(e => e.umbrella_id === u.id)
            return (
              <Card key={u.id} padded>
                <a href={`/admin/umbrellas/${u.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>{u.name}{u.type === 'series' ? ' · series' : ''}</div>
                  <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '2px' }}>
                    {u.client_name ? `${u.client_name} · ` : ''}{u.status} · {u.events?.[0]?.count ?? 0} child event{(u.events?.[0]?.count ?? 0) === 1 ? '' : 's'}
                  </div>
                </a>
                {u.type === 'series' && (
                  <div style={{ marginTop: '10px', display: 'grid', gap: '6px' }}>
                    {attached.map(e => (
                      <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: 'var(--ink2)' }}>
                        <span>{e.name}</span>
                        <button type="button" disabled={busy} onClick={() => send('/api/events/umbrellas/attach', { event_id: e.id, umbrella_id: null }, 'Event detached.')} style={{ background: 'none', border: 'none', color: 'var(--ink3)', cursor: 'pointer', fontSize: '12px' }}>Detach</button>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <select value={pick[u.id] ?? ''} onChange={e => setPick({ ...pick, [u.id]: e.target.value })} style={{ flex: 1, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12.5px', background: 'var(--card)', color: 'var(--ink)' }}>
                        <option value="">Attach an event…</option>
                        {events.filter(e => e.umbrella_id !== u.id).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                      <Button variant="ghost" disabled={busy || !pick[u.id]} onClick={async () => { if (await send('/api/events/umbrellas/attach', { event_id: pick[u.id], umbrella_id: u.id }, 'Event attached.')) setPick({ ...pick, [u.id]: '' }) }}>Attach</Button>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <div style={{ marginTop: '24px' }}>
        <Card padded>
          <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink2)', marginBottom: '6px' }}>New series</div>
          <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '8px' }}>A Trescon-owned series such as World AI Show. Platform admins only.</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Series name" style={{ flex: 1, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12.5px', background: 'var(--card)', color: 'var(--ink)' }} />
            <Button variant="lime" disabled={busy || !newName.trim()} onClick={async () => { if (await send('/api/events/umbrellas', { name: newName }, 'Series created.')) setNewName('') }}>Create series</Button>
          </div>
        </Card>
      </div>

      <div style={{ marginTop: '16px', fontSize: '12.5px' }}>
        <a href="/brand-content/content/style-guide" style={{ color: 'var(--teal-mid)', fontWeight: 700 }}>Trescon house style →</a>
        <span style={{ color: 'var(--ink3)' }}> Trescon-wide rules and style guide.</span>
      </div>
    </div>
  )
}
