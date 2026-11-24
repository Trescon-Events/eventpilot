'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, Button, Badge, Toast } from '@/app/components/ui'

/* Event Integrations → YouTube. Chooses which already-connected channel this event's session videos upload to.
   Channels are connected once, globally, in Admin → Global Integrations — nothing is typed or hard-coded per event. */

type Conn = { id: string; channel_title: string; channel_handle: string | null; channel_thumbnail_url: string | null; google_email: string | null; status: string }
type Privacy = 'private' | 'unlisted' | 'public'

export default function EventYouTubeCard({ eventId, canManage, isAdmin }: { eventId: string; canManage: boolean; isAdmin: boolean }) {
  const [conns, setConns] = useState<Conn[] | null>(null)
  const [connectionId, setConnectionId] = useState('')
  const [privacy, setPrivacy] = useState<Privacy>('private')
  const [saved, setSaved] = useState({ connectionId: '', privacy: 'private' as Privacy })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    fetch(`/api/events/youtube-channel?event_id=${eventId}`).then(r => r.json()).then(d => {
      setConns(d.connections ?? [])
      setConnectionId(d.connectionId ?? ''); setPrivacy(d.defaultPrivacy ?? 'private')
      setSaved({ connectionId: d.connectionId ?? '', privacy: d.defaultPrivacy ?? 'private' })
    }).catch(() => setConns([]))
  }, [eventId])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/events/youtube-channel?event_id=${eventId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connection_id: connectionId || null, default_privacy: privacy }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not save.')
      setSaved({ connectionId, privacy }); setMsg({ text: 'Saved.', ok: true })
    } catch (e) { setMsg({ text: e instanceof Error ? e.message : 'Could not save.', ok: false }) } finally { setSaving(false) }
  }

  const chosen = conns?.find(c => c.id === connectionId)
  const dirty = connectionId !== saved.connectionId || privacy !== saved.privacy
  const sel = { width: '100%', padding: '9px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', fontSize: '13.5px' } as const

  return (
    <Card padded>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '4px' }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>YouTube channel</div>
        {conns && <Badge color={saved.connectionId ? 'teal' : 'amber'}>{saved.connectionId ? 'Channel chosen' : 'No channel chosen'}</Badge>}
      </div>
      <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '14px' }}>
        The channel this event&apos;s session videos upload to. Several events can share one channel.
        {isAdmin ? <> Channels are connected in <Link href="/admin/settings/integrations" style={{ color: 'var(--teal)', fontWeight: 700 }}>Global Integrations</Link>.</> : ' Ask an admin to connect a channel in Global Integrations if yours is missing.'}
      </div>
      {conns === null ? <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>Loading…</div> : conns.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>No YouTube channels are connected yet.</div>
      ) : (
        <div style={{ display: 'grid', gap: '12px', maxWidth: '460px' }}>
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink4)', display: 'block', marginBottom: '4px' }}>Upload to</label>
            <select style={sel} value={connectionId} disabled={!canManage} onChange={e => setConnectionId(e.target.value)}>
              <option value="">— No channel —</option>
              {conns.map(c => <option key={c.id} value={c.id}>{c.channel_title}{c.channel_handle ? ` (${c.channel_handle})` : ''}{c.google_email ? ` — ${c.google_email}` : ''}{c.status === 'needs_reconnect' ? ' — reconnect needed' : ''}</option>)}
            </select>
            {chosen?.status === 'needs_reconnect' && <div style={{ fontSize: '12px', color: 'var(--amber)', marginTop: '4px' }}>This channel&apos;s connection has expired — an admin needs to reconnect it.</div>}
          </div>
          <div>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink4)', display: 'block', marginBottom: '4px' }}>Visibility when uploaded</label>
            <select style={sel} value={privacy} disabled={!canManage} onChange={e => setPrivacy(e.target.value as Privacy)}>
              <option value="private">Private (only the channel team can see it)</option>
              <option value="unlisted">Unlisted (anyone with the link)</option>
              <option value="public">Public</option>
            </select>
          </div>
          {canManage && <div><Button variant="teal" onClick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save'}</Button></div>}
        </div>
      )}
      <Toast message={msg?.text ?? null} type={msg?.ok ? 'success' : 'error'} onClose={() => setMsg(null)} />
    </Card>
  )
}
