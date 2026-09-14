'use client'

import { useEffect, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Card, Button, Badge } from '@/app/components/ui'

/* Site Operations module — admin settings page for Google connections
   (GA4 + Search Console). v1.3: multiple named org-level connections, not
   one shared account — event analytics properties are genuinely split
   across more than one Google identity, permanently (GA4/Search Console
   properties don't transfer between accounts). See
   docs/EventPilot-SiteOps-Build-Spec-v1.1.md, Changelog v1.2 -> v1.3.

   This page just manages the pool of connected accounts (add one,
   disconnect one, prove each one works via a fetch). Which connection
   applies to which event is picked later, per event, in that event's Site
   Registry (Commissioning Orchestrator Step 1). */

type Connection = { id: string; email: string; connectedAt: string | null }
type GA4Account = { id: string; name: string; properties: { id: string; name: string }[] }
type SCSite = { url: string; permissionLevel: string; verified: boolean }

export default function GoogleConnectionSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [connections, setConnections] = useState<Connection[]>([])
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [ga4ByConn, setGa4ByConn] = useState<Record<string, GA4Account[]>>({})
  const [scByConn, setScByConn] = useState<Record<string, SCSite[]>>({})
  const [fetchingGa4, setFetchingGa4] = useState<string | null>(null)
  const [fetchingSc, setFetchingSc] = useState<string | null>(null)

  async function loadStatus() {
    setLoading(true)
    const res = await fetch('/api/connect/google-org/status')
    const data = await res.json().catch(() => ({}))
    setConnections(data.connections ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadStatus()
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected')) setMsg({ text: 'Google account connected.', ok: true })
    if (params.get('error')) setMsg({ text: `Connection failed: ${params.get('error')}`, ok: false })
    if (params.toString()) window.history.replaceState(null, '', window.location.pathname)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchGa4(connectionId: string) {
    setFetchingGa4(connectionId)
    setMsg(null)
    const res = await fetch(`/api/connect/google-org/ga4-accounts?connection_id=${connectionId}`)
    const data = await res.json().catch(() => ({}))
    setFetchingGa4(null)
    if (!res.ok) { setMsg({ text: data.error ?? 'Could not fetch GA4 accounts.', ok: false }); return }
    setGa4ByConn(prev => ({ ...prev, [connectionId]: data.accounts ?? [] }))
  }

  async function fetchSc(connectionId: string) {
    setFetchingSc(connectionId)
    setMsg(null)
    const res = await fetch(`/api/connect/google-org/search-console-sites?connection_id=${connectionId}`)
    const data = await res.json().catch(() => ({}))
    setFetchingSc(null)
    if (!res.ok) { setMsg({ text: data.error ?? 'Could not fetch Search Console sites.', ok: false }); return }
    setScByConn(prev => ({ ...prev, [connectionId]: data.sites ?? [] }))
  }

  async function disconnect(connectionId: string) {
    setDisconnectingId(connectionId)
    setMsg(null)
    const res = await fetch(`/api/connect/google-org/disconnect?connection_id=${connectionId}`, { method: 'DELETE' })
    setDisconnectingId(null)
    if (!res.ok) { setMsg({ text: 'Could not disconnect.', ok: false }); return }
    setConnections(prev => prev.filter(c => c.id !== connectionId))
    setGa4ByConn(prev => { const next = { ...prev }; delete next[connectionId]; return next })
    setScByConn(prev => { const next = { ...prev }; delete next[connectionId]; return next })
    setMsg({ text: 'Disconnected.', ok: true })
  }

  if (loading) return <div style={{ minHeight: '100vh', background: 'var(--surface)', padding: '32px', color: 'var(--ink3)' }}>Loading…</div>

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader eyebrow="Admin Settings" title="Google Connections" backHref="/admin" backLabel="Back to Admin" />

      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '20px 28px 60px' }}>
        {msg && (
          <div style={{
            padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px',
            background: msg.ok ? 'var(--teal-light)' : 'var(--red-light)',
            border: `1px solid ${msg.ok ? 'var(--teal-border)' : 'var(--red-border)'}`,
            color: msg.ok ? 'var(--ink)' : 'var(--red)',
          }}>
            {msg.text} <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700, marginLeft: '8px' }}>×</button>
          </div>
        )}

        <Card padded>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>Connected Google Accounts</div>
            <Button variant="teal" href="/api/connect/google-org">Add Google Account</Button>
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>
            Event GA4/Search Console properties are genuinely split across more than one Google account — connect each one that holds real event data. Which connection applies to which event is picked later, per event, in that event&apos;s Site Registry.
          </div>
        </Card>

        {connections.length === 0 && (
          <div style={{ marginTop: '16px', fontSize: '13px', color: 'var(--ink4)' }}>No accounts connected yet.</div>
        )}

        {connections.map(conn => (
          <div key={conn.id} style={{ marginTop: '16px' }}>
            <Card padded>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>{conn.email}</div>
                  {conn.connectedAt && <div style={{ fontSize: '11.5px', color: 'var(--ink4)' }}>Connected {new Date(conn.connectedAt).toLocaleDateString()}</div>}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Badge color="teal">Connected</Badge>
                  <Button variant="ghost" onClick={() => setExpandedId(expandedId === conn.id ? null : conn.id)}>
                    {expandedId === conn.id ? 'Hide' : 'Details'}
                  </Button>
                  <Button variant="ghost" onClick={() => disconnect(conn.id)} disabled={disconnectingId === conn.id}>
                    {disconnectingId === conn.id ? 'Disconnecting…' : 'Disconnect'}
                  </Button>
                </div>
              </div>

              {expandedId === conn.id && (
                <div style={{ marginTop: '16px', display: 'grid', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', marginBottom: '8px' }}>Google Analytics (GA4)</div>
                    {!ga4ByConn[conn.id] ? (
                      <Button variant="ghost" onClick={() => fetchGa4(conn.id)} disabled={fetchingGa4 === conn.id}>{fetchingGa4 === conn.id ? 'Fetching…' : 'Fetch GA4 Accounts'}</Button>
                    ) : (
                      <div style={{ display: 'grid', gap: '10px' }}>
                        {ga4ByConn[conn.id].length === 0 && <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>No GA4 accounts visible to this connection.</div>}
                        {ga4ByConn[conn.id].map(acc => (
                          <div key={acc.id} style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--card-hi)' }}>
                            <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ink)' }}>{acc.name} <span style={{ color: 'var(--ink4)', fontWeight: 400 }}>({acc.id})</span></div>
                            {acc.properties.length > 0 && (
                              <div style={{ marginTop: '6px', display: 'grid', gap: '3px' }}>
                                {acc.properties.map(p => (
                                  <div key={p.id} style={{ fontSize: '12px', color: 'var(--ink3)' }}>· {p.name} <span style={{ color: 'var(--ink4)' }}>({p.id})</span></div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                        <Button variant="ghost" onClick={() => fetchGa4(conn.id)} disabled={fetchingGa4 === conn.id}>{fetchingGa4 === conn.id ? 'Fetching…' : 'Re-fetch'}</Button>
                      </div>
                    )}
                  </div>

                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', marginBottom: '8px' }}>Search Console</div>
                    {!scByConn[conn.id] ? (
                      <Button variant="ghost" onClick={() => fetchSc(conn.id)} disabled={fetchingSc === conn.id}>{fetchingSc === conn.id ? 'Fetching…' : 'Fetch Search Console Sites'}</Button>
                    ) : (
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {scByConn[conn.id].length === 0 && <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>No Search Console sites visible to this connection.</div>}
                        {scByConn[conn.id].map(s => (
                          <div key={s.url} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '8px', background: 'var(--card-hi)' }}>
                            <div style={{ fontSize: '13px', color: 'var(--ink)' }}>{s.url}</div>
                            <Badge color={s.verified ? 'teal' : 'amber'}>{s.verified ? 'Verified' : 'Unverified'}</Badge>
                          </div>
                        ))}
                        <Button variant="ghost" onClick={() => fetchSc(conn.id)} disabled={fetchingSc === conn.id}>{fetchingSc === conn.id ? 'Fetching…' : 'Re-fetch'}</Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>
          </div>
        ))}
      </div>
    </div>
  )
}
