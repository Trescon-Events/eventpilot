'use client'

import { useEffect, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Card, Button, Badge } from '@/app/components/ui'

/* Site Operations module, Phase 2 — admin settings page for the ONE
   shared org-level Google connection (GA4 + Search Console). Deliberately
   global, not per-event: every event's Site Registry will fetch from this
   same connected account (Madhu's explicit decision, 2026-09-13). See
   docs/EventPilot-SiteOps-Build-Spec-v1.1.md.

   Fetch-and-select display only for now — the GA4 accounts/Search Console
   sites lists here are read-only proof that the connection works. Wiring
   a fetched property/site into a specific event's Site Registry is later
   orchestrator work (spec section 4), not this page's job. */

type GA4Account = { id: string; name: string; properties: { id: string; name: string }[] }
type SCSite = { url: string; permissionLevel: string; verified: boolean }

export default function GoogleConnectionSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const [ga4Accounts, setGa4Accounts] = useState<GA4Account[] | null>(null)
  const [fetchingGa4, setFetchingGa4] = useState(false)
  const [scSites, setScSites] = useState<SCSite[] | null>(null)
  const [fetchingSc, setFetchingSc] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  async function loadStatus() {
    setLoading(true)
    const res = await fetch('/api/connect/google-org/status')
    const data = await res.json().catch(() => ({}))
    setConnected(!!data.connected)
    setEmail(data.email ?? null)
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

  async function fetchGa4() {
    setFetchingGa4(true)
    setMsg(null)
    const res = await fetch('/api/connect/google-org/ga4-accounts')
    const data = await res.json().catch(() => ({}))
    setFetchingGa4(false)
    if (!res.ok) { setMsg({ text: data.error ?? 'Could not fetch GA4 accounts.', ok: false }); return }
    setGa4Accounts(data.accounts ?? [])
  }

  async function fetchSc() {
    setFetchingSc(true)
    setMsg(null)
    const res = await fetch('/api/connect/google-org/search-console-sites')
    const data = await res.json().catch(() => ({}))
    setFetchingSc(false)
    if (!res.ok) { setMsg({ text: data.error ?? 'Could not fetch Search Console sites.', ok: false }); return }
    setScSites(data.sites ?? [])
  }

  async function disconnect() {
    setDisconnecting(true)
    setMsg(null)
    const res = await fetch('/api/connect/google-org/disconnect', { method: 'DELETE' })
    setDisconnecting(false)
    if (!res.ok) { setMsg({ text: 'Could not disconnect.', ok: false }); return }
    setConnected(false)
    setEmail(null)
    setGa4Accounts(null)
    setScSites(null)
    setMsg({ text: 'Disconnected.', ok: true })
  }

  if (loading) return <div style={{ minHeight: '100vh', background: 'var(--surface)', padding: '32px', color: 'var(--ink3)' }}>Loading…</div>

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader eyebrow="Admin Settings" title="Google Connection" backHref="/admin" backLabel="Back to Admin" />

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
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>Shared Google Account</div>
            <Badge color={connected ? 'teal' : 'grey'}>{connected ? 'Connected' : 'Not connected'}</Badge>
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '16px' }}>
            One Google account, connected once, used for every event&apos;s GA4 and Search Console access across the whole platform — never a personal Gmail. Site-specific selection (which property/site applies to which event) happens later, per event, in that event&apos;s Site Registry.
          </div>
          {connected ? (
            <>
              <div style={{ fontSize: '13px', color: 'var(--ink2)', marginBottom: '14px' }}>
                Connected as <strong>{email}</strong>
              </div>
              <Button variant="ghost" onClick={disconnect} disabled={disconnecting}>{disconnecting ? 'Disconnecting…' : 'Disconnect'}</Button>
            </>
          ) : (
            <Button variant="teal" href="/api/connect/google-org">Connect Google Account</Button>
          )}
        </Card>

        {connected && (
          <>
            <div style={{ marginTop: '16px' }}><Card padded>
              <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Google Analytics (GA4)</div>
              <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '14px' }}>
                Every GA4 account and property this connection can see.
              </div>
              {!ga4Accounts ? (
                <Button variant="ghost" onClick={fetchGa4} disabled={fetchingGa4}>{fetchingGa4 ? 'Fetching…' : 'Fetch GA4 Accounts'}</Button>
              ) : (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {ga4Accounts.length === 0 && <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>No GA4 accounts visible to this connection.</div>}
                  {ga4Accounts.map(acc => (
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
                  <Button variant="ghost" onClick={fetchGa4} disabled={fetchingGa4}>{fetchingGa4 ? 'Fetching…' : 'Re-fetch'}</Button>
                </div>
              )}
            </Card></div>

            <div style={{ marginTop: '16px' }}><Card padded>
              <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Search Console</div>
              <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '14px' }}>
                Every Search Console property this connection can see.
              </div>
              {!scSites ? (
                <Button variant="ghost" onClick={fetchSc} disabled={fetchingSc}>{fetchingSc ? 'Fetching…' : 'Fetch Search Console Sites'}</Button>
              ) : (
                <div style={{ display: 'grid', gap: '8px' }}>
                  {scSites.length === 0 && <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>No Search Console sites visible to this connection.</div>}
                  {scSites.map(s => (
                    <div key={s.url} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '8px', background: 'var(--card-hi)' }}>
                      <div style={{ fontSize: '13px', color: 'var(--ink)' }}>{s.url}</div>
                      <Badge color={s.verified ? 'teal' : 'amber'}>{s.verified ? 'Verified' : 'Unverified'}</Badge>
                    </div>
                  ))}
                  <Button variant="ghost" onClick={fetchSc} disabled={fetchingSc}>{fetchingSc ? 'Fetching…' : 'Re-fetch'}</Button>
                </div>
              )}
            </Card></div>
          </>
        )}
      </div>
    </div>
  )
}
