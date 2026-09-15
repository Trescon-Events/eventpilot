'use client'

import { useEffect, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Card, Button, Badge } from '@/app/components/ui'

/* Site Operations module — admin settings page for the Google service
   account (GA4 + Search Console). v1.4: replaces the earlier per-user
   OAuth connection model entirely — see
   docs/EventPilot-SiteOps-Build-Spec-v1.1.md, Changelog v1.3 -> v1.4.
   A single service account (granted access on each GA4/Search Console
   property directly, same "add a user" action as sharing with a person)
   has no consent screen, no token expiry, no verification review. This
   page just proves the key is configured and can see real data — there's
   no "connect" flow to walk through, no account to pick. */

type GA4Account = { id: string; name: string; properties: { id: string; name: string }[] }
type SCSite = { url: string; permissionLevel: string; verified: boolean }
type Status = { configured: boolean; email: string | null }

export default function GoogleServiceAccountSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<Status>({ configured: false, email: null })
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const [ga4Accounts, setGa4Accounts] = useState<GA4Account[] | null>(null)
  const [fetchingGa4, setFetchingGa4] = useState(false)
  const [scSites, setScSites] = useState<SCSite[] | null>(null)
  const [fetchingSc, setFetchingSc] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const res = await fetch('/api/connect/google-org/ga4-accounts')
      const data = await res.json().catch(() => ({}))
      // A 400 with "not configured" tells us the key is missing; any other
      // shape (ok or a real Google API error) tells us the key exists.
      setStatus({ configured: res.status !== 400 || !/not configured/i.test(data?.error ?? ''), email: null })
      setLoading(false)
    }
    load()
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

  if (loading) return <div style={{ minHeight: '100vh', background: 'var(--surface)', padding: '32px', color: 'var(--ink3)' }}>Loading…</div>

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader eyebrow="Admin Settings" title="Google Service Account" backHref="/admin" backLabel="Back to Admin" />

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
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>Service Account</div>
            <Badge color={status.configured ? 'teal' : 'grey'}>{status.configured ? 'Configured' : 'Not configured'}</Badge>
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>
            One Google Cloud service account handles every event&apos;s GA4 and Search Console access — no sign-in flow, no expiring tokens, no Google review process. To grant it access to a property, add its email as a user on that property in GA4 or Search Console directly, the same way you&apos;d share access with a person: <code>eventpilot-siteops@eventpilot-site-operations.iam.gserviceaccount.com</code>
          </div>
        </Card>

        {status.configured && (
          <>
            <div style={{ marginTop: '16px' }}><Card padded>
              <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Google Analytics (GA4)</div>
              <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '14px' }}>
                Every GA4 account and property the service account can see.
              </div>
              {!ga4Accounts ? (
                <Button variant="ghost" onClick={fetchGa4} disabled={fetchingGa4}>{fetchingGa4 ? 'Fetching…' : 'Fetch GA4 Accounts'}</Button>
              ) : (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {ga4Accounts.length === 0 && <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>No GA4 accounts visible to this service account yet.</div>}
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
                Every Search Console property the service account can see.
              </div>
              {!scSites ? (
                <Button variant="ghost" onClick={fetchSc} disabled={fetchingSc}>{fetchingSc ? 'Fetching…' : 'Fetch Search Console Sites'}</Button>
              ) : (
                <div style={{ display: 'grid', gap: '8px' }}>
                  {scSites.length === 0 && <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>No Search Console sites visible to this service account yet.</div>}
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
