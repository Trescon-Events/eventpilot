'use client'

/* eslint-disable @next/next/no-img-element -- small remote Google avatar */

import { useCallback, useEffect, useState } from 'react'
import { Card, Button, Badge, Input, Toast } from '@/app/components/ui'

/* Global Integrations → YouTube. Two steps: (1) paste the Google OAuth client once; (2) connect channels.
   One connection = one channel. A Google login that owns several channels is connected once per channel — Google asks
   which channel to authorise each time. Events pick which connected channel they upload to on their own Integrations page. */

type Conn = { id: string; channel_title: string; channel_handle: string | null; channel_thumbnail_url: string | null; google_email: string | null; status: 'active' | 'needs_reconnect'; connected_at: string; events: { id: string; name: string }[] }
type ClientStatus = { configured: boolean; clientId: string | null; updatedAt: string | null; updatedByName: string | null; redirectUri: string }

const ERRORS: Record<string, string> = {
  client_not_configured: 'Paste the Google OAuth client first.',
  invalid_state: 'The connection attempt expired or came from another session. Try again.',
  token_exchange_failed: 'Google rejected the sign-in (check the client ID/secret and that the redirect URI is registered).',
  upload_permission_not_granted: 'Upload permission was not ticked on the Google consent screen. Try again and tick every box.',
  no_channel_found: 'That Google login has no YouTube channel. Create one on YouTube first, or choose a different account.',
  no_refresh_token: 'Google did not return a long-lived token. Remove EventPilot from that account’s Google permissions page and connect again.',
  access_denied: 'Sign-in was cancelled — or this Google login is not on the OAuth app’s test-user list.',
  save_failed: 'Connected, but saving failed. Try again.',
}

export default function YouTubeAccountsCard() {
  const [client, setClient] = useState<ClientStatus | null>(null)
  const [conns, setConns] = useState<Conn[] | null>(null)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const load = useCallback(async () => {
    const [c, l] = await Promise.all([fetch('/api/admin/youtube/client').then(r => r.json()), fetch('/api/admin/youtube/connections').then(r => r.json())])
    setClient(c); setConns(l.connections ?? [])
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load()
    const q = new URLSearchParams(window.location.search)
    const ok = q.get('youtube_connected'), err = q.get('youtube_error')
    if (ok) setMsg({ text: `Connected “${ok}”.`, ok: true })
    else if (err) setMsg({ text: ERRORS[err] ?? `YouTube connection failed (${err}).`, ok: false })
    if (ok || err) window.history.replaceState({}, '', window.location.pathname)
  }, [load])

  async function saveClient() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/youtube/client', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, clientSecret }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not save.')
      setClientId(''); setClientSecret(''); setEditing(false); setMsg({ text: 'Saved.', ok: true }); await load()
    } catch (e) { setMsg({ text: e instanceof Error ? e.message : 'Could not save.', ok: false }) } finally { setSaving(false) }
  }

  async function disconnect(id: string) {
    const res = await fetch(`/api/admin/youtube/connections?id=${id}`, { method: 'DELETE' })
    setConfirmId(null)
    setMsg(res.ok ? { text: 'Disconnected.', ok: true } : { text: 'Could not disconnect.', ok: false })
    await load()
  }

  const label = { fontSize: '11px', fontWeight: 700, color: 'var(--ink4)', display: 'block', marginBottom: '4px' } as const
  const showForm = client && (!client.configured || editing)

  return (
    <Card padded>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '4px' }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>YouTube channels</div>
        {client && <Badge color={client.configured ? 'teal' : 'amber'}>{client.configured ? 'OAuth client set' : 'Set up needed'}</Badge>}
      </div>
      <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '14px' }}>
        Connect the YouTube channels that session videos upload to. Connect each channel once here; then every event chooses its channel on its own Integrations page. One Google login can own several channels — connect it once per channel.
      </div>

      {!client || conns === null ? <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>Loading…</div> : (
        <>
          {showForm ? (
            <div style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '14px', marginBottom: '14px' }}>
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink)', marginBottom: '6px' }}>Step 1 — Google OAuth client (once)</div>
              <div style={{ fontSize: '12px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '10px' }}>
                In Google Cloud → APIs &amp; Services: enable <b>YouTube Data API v3</b>, create an <b>OAuth client ID (Web application)</b>, and add this exact Authorised redirect URI:
                <code style={{ display: 'block', margin: '6px 0', padding: '6px 8px', background: 'var(--surface)', borderRadius: '6px', wordBreak: 'break-all' }}>{client.redirectUri}</code>
                Then paste the client ID and secret below. (For local testing also add http://localhost:3000/api/admin/youtube/callback.)
              </div>
              <div style={{ display: 'grid', gap: '8px' }}>
                <div><label style={label}>Client ID</label><Input value={clientId} onChange={e => setClientId(e.target.value)} placeholder="…apps.googleusercontent.com" autoComplete="off" /></div>
                <div><label style={label}>Client secret</label><Input type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)} autoComplete="off" /></div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button variant="teal" onClick={saveClient} disabled={saving || !clientId.trim() || !clientSecret.trim()}>{saving ? 'Saving…' : 'Save client'}</Button>
                  {editing && <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: 'var(--ink4)', marginBottom: '14px' }}>
              OAuth client {client.clientId ? `…${client.clientId.slice(0, 12)}` : ''} set{client.updatedByName ? ` by ${client.updatedByName}` : ''}. <button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', padding: 0, font: 'inherit', fontWeight: 700 }}>Replace</button>
            </div>
          )}

          {client.configured && (
            <>
              <div style={{ display: 'grid', gap: '8px', marginBottom: '14px' }}>
                {conns.length === 0 && <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>No channels connected yet.</div>}
                {conns.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 12px', flexWrap: 'wrap' }}>
                    {c.channel_thumbnail_url && <img src={c.channel_thumbnail_url} alt="" width={36} height={36} style={{ borderRadius: '50%' }} />}
                    <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ink)' }}>{c.channel_title} {c.channel_handle && <span style={{ fontWeight: 400, color: 'var(--ink4)' }}>{c.channel_handle}</span>}</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--ink4)' }}>
                        Login: {c.google_email ?? 'unknown'} · {c.events.length ? `Used by ${c.events.map(e => e.name).join(', ')}` : 'Not used by any event yet'}
                      </div>
                    </div>
                    {c.status === 'needs_reconnect' && <Badge color="amber">Reconnect needed</Badge>}
                    {confirmId === c.id ? (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12px' }}>
                        {c.events.length > 0 && <span style={{ color: 'var(--ink3)' }}>{c.events.length} event(s) will lose this channel.</span>}
                        <Button variant="ghost" onClick={() => disconnect(c.id)}>Yes, disconnect</Button>
                        <Button variant="ghost" onClick={() => setConfirmId(null)}>Keep</Button>
                      </div>
                    ) : (
                      <>
                        {c.status === 'needs_reconnect' && <a href="/api/admin/youtube/connect"><Button variant="teal">Reconnect</Button></a>}
                        <Button variant="ghost" onClick={() => setConfirmId(c.id)}>Disconnect</Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <a href="/api/admin/youtube/connect"><Button variant="teal">+ Connect a YouTube channel</Button></a>
              <div style={{ fontSize: '11.5px', color: 'var(--ink4)', marginTop: '8px', lineHeight: 1.5 }}>
                Google will ask which account and — for accounts that own several channels — which channel to allow. Tick every permission box.
              </div>
            </>
          )}
          <Toast message={msg?.text ?? null} type={msg?.ok ? 'success' : 'error'} onClose={() => setMsg(null)} />
        </>
      )}
    </Card>
  )
}
