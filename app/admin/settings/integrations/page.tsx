'use client'

import { useEffect, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Card, Button, Badge, Input } from '@/app/components/ui'

/* Global Integrations (2026-09-21) — credentials shared across every
   event, not scoped to any one of them (contrast with each event's own
   Integrations page under Settings). Built directly after finding live
   that HUBSPOT_CRM_SERVICE_KEY had simply never been added to Railway's
   production environment — the whole CRM-to-HubSpot sync had been
   silently failing there this entire time with no visible trace anything
   was wrong. Paste-once-here instead of a Railway env var means: no
   Railway access needed to rotate it, and a real "configured / not
   configured" status instead of a silent runtime failure discovered by
   accident. See app/lib/integrations/global-secrets.ts for the storage
   (AES-256-GCM at rest, same helper as OAuth tokens) — the value is never
   decrypted back to the browser once saved, only this status line. */

type Status = { configured: boolean; label: string | null; updatedAt: string | null; updatedByName: string | null }

export default function GlobalIntegrationsSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<Status | null>(null)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    setLoading(true)
    fetch('/api/admin/integrations/hubspot-crm-key')
      .then(r => r.json())
      .then(setStatus)
      .finally(() => setLoading(false))
  }, [])

  async function save() {
    if (!value.trim()) return
    setSaving(true); setMsg(null)
    try {
      const res = await fetch('/api/admin/integrations/hubspot-crm-key', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: value.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save the key.')
      setStatus(data)
      setValue('')
      setMsg({ text: 'Saved.', ok: true })
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Could not save the key.', ok: false })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader eyebrow="Admin Settings" title="Global Integrations" description="Credentials shared across every event — not the per-event Integrations page under each event's own Settings." backHref="/admin" backLabel="Back to Admin" />

      <div style={{ padding: '24px 32px', maxWidth: '640px' }}>
        <Card padded>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '4px' }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>HubSpot CRM Sync Service Key</div>
            {!loading && (
              <Badge color={status?.configured ? 'teal' : 'amber'}>{status?.configured ? 'Configured' : 'Not configured'}</Badge>
            )}
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '14px' }}>
            Used for every speaker/sponsor CRM sync to HubSpot (contacts, companies, property values) — find it in HubSpot under Development → Keys → Service Keys → &quot;EventPilot CRM Sync&quot; → Show/Copy. Pasted here instead of a Railway environment variable, so it can be rotated without server access and its status is always visible instead of failing silently.
          </div>

          {loading ? (
            <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>Loading…</div>
          ) : (
            <>
              {status?.configured && (
                <div style={{ fontSize: '12px', color: 'var(--ink4)', marginBottom: '14px' }}>
                  Last set {status.updatedAt ? new Date(status.updatedAt).toLocaleString() : 'unknown'}{status.updatedByName ? ` by ${status.updatedByName}` : ''}.
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink4)', display: 'block', marginBottom: '4px' }}>
                    {status?.configured ? 'Replace with a new key' : 'Paste the key'}
                  </label>
                  <Input type="password" value={value} onChange={e => setValue(e.target.value)} placeholder="pat-na1-…" autoComplete="off" />
                </div>
                <Button variant="teal" onClick={save} disabled={saving || !value.trim()}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
              {msg && (
                <div style={{ fontSize: '12.5px', color: msg.ok ? 'var(--teal-mid)' : 'var(--red)', marginTop: '10px' }}>{msg.text}</div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
