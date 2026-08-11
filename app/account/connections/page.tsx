'use client'

import { useState, useEffect } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Button, Card } from '@/app/components/ui'

/* Connected Accounts — Phase D of the HubSpot Forms integration. Each
   staff member connects their OWN Google/Microsoft account here (delegated
   OAuth), so secure documents (passport/national ID) can later be copied
   into a per-event Drive/OneDrive folder using THEIR access — never a
   shared app-level credential. Everyone has Microsoft 365; not everyone
   has a Trescon Google account (mainly producers do) — connect whichever
   you actually have. */

type ProviderStatus = { connected: boolean; email: string | null }
type Status = { google: ProviderStatus; microsoft: ProviderStatus }

export default function ConnectedAccountsPage() {
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'google' | 'microsoft' | null>(null)

  async function load() {
    const res = await fetch('/api/connect/status')
    setStatus(res.ok ? await res.json() : null)
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount; matches stakeholders/page.tsx's fetchAll effect
  useEffect(() => { load() }, [])

  async function disconnect(provider: 'google' | 'microsoft') {
    if (!window.confirm(`Disconnect your ${provider === 'google' ? 'Google' : 'Microsoft'} account? Any event secure-document folder that relies on your access will stop working for producers using that folder until reconnected or reconfigured.`)) return
    setBusy(provider)
    await fetch(`/api/connect/disconnect?provider=${provider}`, { method: 'DELETE' })
    setBusy(null)
    load()
  }

  return (
    <div>
      <PageHeader
        eyebrow="Account"
        title="Connected Accounts"
        description="Connect your own Google Drive or Microsoft OneDrive so secure documents (passport/ID copies collected via onboarding forms) can be copied into a folder you choose, using your own access."
      />
      <div style={{ padding: '24px 32px', maxWidth: '640px' }}>
        {loading ? (
          <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Loading…</div>
        ) : (
          <div style={{ display: 'grid', gap: '12px' }}>
            <ConnectionCard
              label="Microsoft OneDrive"
              status={status?.microsoft}
              connectHref="/api/connect/microsoft"
              busy={busy === 'microsoft'}
              onDisconnect={() => disconnect('microsoft')}
            />
            <ConnectionCard
              label="Google Drive"
              status={status?.google}
              connectHref="/api/connect/google"
              busy={busy === 'google'}
              onDisconnect={() => disconnect('google')}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function ConnectionCard({ label, status, connectHref, busy, onDisconnect }: {
  label: string
  status: ProviderStatus | undefined
  connectHref: string
  busy: boolean
  onDisconnect: () => void
}) {
  return (
    <Card padded>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>{label}</div>
          <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '2px' }}>
            {status?.connected ? `Connected — ${status.email ?? 'account connected'}` : 'Not connected'}
          </div>
        </div>
        {status?.connected ? (
          <Button variant="red" onClick={onDisconnect} disabled={busy}>{busy ? 'Disconnecting…' : 'Disconnect'}</Button>
        ) : (
          <a href={connectHref}><Button variant="lime">Connect</Button></a>
        )}
      </div>
    </Card>
  )
}
