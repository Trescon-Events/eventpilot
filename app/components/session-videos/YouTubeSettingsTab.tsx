'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, Card } from '@/app/components/ui'

/* Session Videos → YouTube. The event's channel, and which playlist each session goes into: map every agenda day × stage to a playlist (or create one),
   override single sessions where needed, and a fallback for anything unmapped. Every change saves immediately. API: /api/events/session-videos/youtube-settings. */

type PRef = { id: string; title: string | null }
type Playlist = { id: string; title: string; count: number; privacy: string }
type Group = { key: string; day: string; dayLabel: string; trackId: string | null; trackName: string; playlist: PRef | null; sessions: Array<{ id: string; title: string; start: string | null; override: PRef | null }> }
type Settings = {
  connections: Array<{ id: string; title: string; handle: string | null; email: string | null; status: string }>
  connectionId: string | null; fallback: PRef | null; playlists: Playlist[] | null; playlistsError: string | null; groups: Group[]; timezone: string
  existing: Existing
}
type Existing = {
  scannedAt: string | null
  links: Array<{ sessionId: string; videoId: string; title: string; privacy: string | null; publishedAt: string | null; thumbnail: string | null; source: 'auto' | 'manual' }>
  unlinkedVideos: Array<{ id: string; title: string; privacy: string; publishedAt: string | null; playlistTitle: string | null }>
  suggestions: Record<string, string>
}
const RESCAN_MS = 60 * 60 * 1000
type Target = { kind: 'stage'; key: string } | { kind: 'session'; sessionId: string } | { kind: 'event' }

const NEW = '__new__'
const sel = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-light)', background: 'var(--surface)', color: 'var(--ink1)', fontSize: 13, fontFamily: 'inherit' } as const
const note = { fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.55 } as const

export default function YouTubeSettingsTab({ eventId }: { eventId: string }) {
  const [s, setS] = useState<Settings | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [confirmChannel, setConfirmChannel] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await fetch(`/api/events/session-videos/youtube-settings?event_id=${eventId}`, { cache: 'no-store' }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) : {}
    if (r?.ok) { setS(j as Settings); setErr(null) } else setErr((j as { error?: string }).error ?? 'Could not load the YouTube settings.')
  }, [eventId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
  useEffect(() => { void load() }, [load])

  const post = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/events/session-videos/youtube-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, ...body }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error((j as { error?: string }).error ?? 'Failed.')
      setMsg({ text: ok, ok: true }); await load()
    } catch (e) { setMsg({ text: e instanceof Error ? e.message : 'Failed.', ok: false }) } finally { setBusy(false) }
  }
  const assign = (target: Target, p: PRef | null, label: string) => post({ action: 'assign', target, playlist_id: p?.id ?? null, playlist_title: p?.title ?? null }, p ? `${label} → “${p.title}”.` : `${label}: cleared.`)
  const create = (target: Target, title: string, label: string) => post({ action: 'create', target, title }, `Created “${title}” on YouTube and set it for ${label}.`)

  // Rescan by itself (at most hourly): the team keeps uploading sessions by hand until this module takes over.
  const [autoScanned, setAutoScanned] = useState(false)
  useEffect(() => {
    if (!s?.connectionId || autoScanned || busy) return
    const stale = !s.existing.scannedAt || Date.now() - Date.parse(s.existing.scannedAt) > RESCAN_MS
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot guard
    setAutoScanned(true)
    if (stale) void post({ action: 'scan' }, 'Checked YouTube for sessions the team already uploaded.')
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once per visit
  }, [s?.connectionId])

  if (err) return <div style={{ fontSize: 13, color: 'var(--red)' }}>{err}</div>
  if (!s) return <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Loading…</div>
  const channel = s.connections.find(c => c.id === s.connectionId) ?? null
  const mapped = s.groups.filter(g => g.playlist).length
  const overrides = s.groups.reduce((n, g) => n + g.sessions.filter(x => x.override).length, 0)

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {msg && <div style={{ fontSize: 13, color: msg.ok ? 'var(--success)' : 'var(--red)' }}>{msg.text}</div>}

      <Card padded>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Channel</div>
        <div style={{ ...note, marginBottom: 10 }}>Session videos upload here — unlisted for review, public once published. Channels are connected once by an admin in <a href="/admin/settings/integrations" style={{ color: 'var(--teal)', fontWeight: 700 }}>Global Integrations</a>.</div>
        {s.connections.length === 0 ? <div style={note}>No YouTube channels are connected yet.</div> : (
          <div style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
            <select style={sel} value={confirmChannel ?? s.connectionId ?? ''} disabled={busy} onChange={e => setConfirmChannel(e.target.value)}>
              <option value="">— No channel —</option>
              {s.connections.map(c => <option key={c.id} value={c.id}>{c.title}{c.handle ? ` (${c.handle})` : ''}{c.status !== 'active' ? ' — reconnect needed' : ''}</option>)}
            </select>
            {confirmChannel !== null && confirmChannel !== (s.connectionId ?? '') && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 12.5, color: s.connectionId ? 'var(--amber)' : 'var(--ink2)' }}>{s.connectionId ? 'Changing the channel clears this event’s playlist choices (playlists belong to a channel).' : 'Use this channel for this event?'}</span>
                <Button variant="teal" disabled={busy} onClick={() => void post({ action: 'set_channel', connection_id: confirmChannel || null }, 'Channel saved.').then(() => setConfirmChannel(null))}>Save channel</Button>
                <Button variant="ghost" disabled={busy} onClick={() => setConfirmChannel(null)}>Cancel</Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {channel && (
        <>
          {s.playlistsError && <div style={{ fontSize: 13, color: 'var(--amber)' }}>{s.playlistsError}</div>}
          <Card padded>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>Playlists by day and stage</div>
              <div style={note}>{mapped} of {s.groups.length} mapped{overrides ? ` · ${overrides} session override${overrides === 1 ? '' : 's'}` : ''}</div>
            </div>
            <div style={{ ...note, margin: '4px 0 12px' }}>Each session goes into the playlist of its day and stage (days in {s.timezone} time). Open a row to give one session a different playlist.</div>
            {s.groups.length === 0 ? <div style={note}>No speaker sessions on the agenda yet.</div> : (
              <div style={{ display: 'grid', gap: 6 }}>
                {s.groups.map(g => (
                  <div key={g.key} style={{ border: '1px solid var(--border-light)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) minmax(220px, 2fr)', gap: 10, alignItems: 'center' }}>
                      <button type="button" onClick={() => setOpen(o => o === g.key ? null : g.key)} style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', color: 'var(--ink1)', fontFamily: 'inherit', padding: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 800 }}>{open === g.key ? '▾' : '▸'} {g.dayLabel} · {g.trackName}</div>
                        <div style={note}>{g.sessions.length} session{g.sessions.length === 1 ? '' : 's'}{g.sessions.some(x => x.override) ? ` · ${g.sessions.filter(x => x.override).length} overridden` : ''}</div>
                      </button>
                      <PlaylistPicker playlists={s.playlists} value={g.playlist} busy={busy} inheritLabel={s.fallback ? `— Use the fallback (${s.fallback.title}) —` : '— No playlist —'}
                        suggest={`${g.dayLabel.split(' · ')[0]} | ${g.trackName}`}
                        onPick={p => void assign({ kind: 'stage', key: g.key }, p, `${g.dayLabel} · ${g.trackName}`)}
                        onCreate={t => void create({ kind: 'stage', key: g.key }, t, `${g.dayLabel} · ${g.trackName}`)} />
                    </div>
                    {open === g.key && (
                      <div style={{ display: 'grid', gap: 6, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-light)' }}>
                        {g.sessions.map(x => (
                          <div key={x.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) minmax(220px, 2fr)', gap: 10, alignItems: 'center' }}>
                            <div style={{ fontSize: 12.5 }}>{x.start ? <span style={{ color: 'var(--ink3)' }}>{new Date(x.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: s.timezone })} · </span> : null}{x.title}</div>
                            <PlaylistPicker playlists={s.playlists} value={x.override} busy={busy}
                              inheritLabel={g.playlist ? `Same as the stage (${g.playlist.title})` : s.fallback ? `Same as the fallback (${s.fallback.title})` : '— No playlist —'}
                              suggest={x.title}
                              onPick={p => void assign({ kind: 'session', sessionId: x.id }, p, x.title)}
                              onCreate={t => void create({ kind: 'session', sessionId: x.id }, t, x.title)} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <ExistingCard s={s} busy={busy} post={post} />

          <Card padded>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Fallback playlist</div>
            <div style={{ ...note, marginBottom: 10 }}>For sessions whose day and stage aren&apos;t mapped above. Leave empty to upload them without a playlist.</div>
            <div style={{ maxWidth: 520 }}>
              <PlaylistPicker playlists={s.playlists} value={s.fallback} busy={busy} inheritLabel="— No fallback —" suggest="Sessions"
                onPick={p => void assign({ kind: 'event' }, p, 'Fallback')} onCreate={t => void create({ kind: 'event' }, t, 'the fallback')} />
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

function PlaylistPicker({ playlists, value, busy, inheritLabel, suggest, onPick, onCreate }: {
  playlists: Playlist[] | null; value: PRef | null; busy: boolean; inheritLabel: string; suggest: string
  onPick: (p: PRef | null) => void; onCreate: (title: string) => void
}) {
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const known = !!value && (playlists ?? []).some(p => p.id === value.id)
  if (creating) return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <input autoFocus style={{ ...sel, flex: '1 1 200px', width: 'auto' }} value={title} onChange={e => setTitle(e.target.value)} placeholder="New playlist name" />
      <Button variant="teal" disabled={busy || !title.trim()} onClick={() => { onCreate(title.trim()); setCreating(false) }}>Create</Button>
      <Button variant="ghost" disabled={busy} onClick={() => setCreating(false)}>Cancel</Button>
    </div>
  )
  return (
    <select style={sel} disabled={busy || !playlists} value={value?.id ?? ''} onChange={e => {
      const id = e.target.value
      if (id === NEW) { setTitle(suggest); setCreating(true); return }
      const p = (playlists ?? []).find(x => x.id === id)
      onPick(p ? { id: p.id, title: p.title } : null)
    }}>
      <option value="">{inheritLabel}</option>
      {value && !known && <option value={value.id}>{value.title ?? value.id} (not found on the channel)</option>}
      {(playlists ?? []).map(p => <option key={p.id} value={p.id}>{p.title} ({p.count}{p.privacy !== 'public' ? `, ${p.privacy}` : ''})</option>)}
      <option value={NEW}>+ Create a new playlist…</option>
    </select>
  )
}

function ExistingCard({ s, busy, post }: { s: Settings; busy: boolean; post: (b: Record<string, unknown>, ok: string) => Promise<void> }) {
  const [show, setShow] = useState<'todo' | 'linked' | null>('todo')
  const [pick, setPick] = useState<Record<string, string>>({})
  const ex = s.existing
  const linkBy = new Map(ex.links.map(l => [l.sessionId, l]))
  const sessions = s.groups.flatMap(g => g.sessions.map(x => ({ ...x, group: `${g.dayLabel} · ${g.trackName}` })))
  const linked = sessions.filter(x => linkBy.has(x.id)), todo = sessions.filter(x => !linkBy.has(x.id))
  const videoTitle = (id: string) => ex.unlinkedVideos.find(v => v.id === id)?.title ?? id
  return (
    <Card padded>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Already on YouTube</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={note}>{ex.scannedAt ? `Checked ${new Date(ex.scannedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : 'Not checked yet'}</span>
          <Button variant="ghost" disabled={busy} onClick={() => void post({ action: 'scan' }, 'Checked YouTube again.')}>{busy ? 'Working…' : 'Scan now'}</Button>
        </div>
      </div>
      <div style={{ ...note, margin: '4px 0 10px' }}>
        Sessions the team uploaded by hand into the playlists above are found and linked automatically (title + speaker names), so nobody processes them again.
        They show “On YouTube” in the Videos list. <strong>{linked.length}</strong> of {sessions.length} sessions are linked; {ex.unlinkedVideos.length} video{ex.unlinkedVideos.length === 1 ? '' : 's'} in the playlists aren&apos;t matched to a session (promos, recaps…).
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <Button variant={show === 'todo' ? 'teal' : 'ghost'} onClick={() => setShow(v => v === 'todo' ? null : 'todo')}>Not on YouTube yet ({todo.length})</Button>
        <Button variant={show === 'linked' ? 'teal' : 'ghost'} onClick={() => setShow(v => v === 'linked' ? null : 'linked')}>Linked ({linked.length})</Button>
      </div>
      {show === 'linked' && (
        <div style={{ display: 'grid', gap: 6 }}>
          {linked.map(x => { const l = linkBy.get(x.id)!; return (
            <div key={x.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) minmax(200px, 1.4fr) auto', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
              <div><strong>{x.title}</strong><div style={note}>{x.group}</div></div>
              <div><a href={`https://www.youtube.com/watch?v=${l.videoId}`} target="_blank" rel="noreferrer" style={{ color: 'var(--teal)', fontWeight: 700 }}>▶ {l.title}</a>
                <div style={note}>{l.source === 'auto' ? 'Matched automatically' : 'Linked by hand'}{l.privacy && l.privacy !== 'public' ? ` · ${l.privacy}` : ''}</div></div>
              <Button variant="ghost" disabled={busy} onClick={() => void post({ action: 'unlink', session_id: x.id }, 'Unlinked.')}>Unlink</Button>
            </div>
          ) })}
        </div>
      )}
      {show === 'todo' && (
        <div style={{ display: 'grid', gap: 6 }}>
          {todo.length === 0 && <div style={note}>Every session is on YouTube.</div>}
          {todo.map(x => {
            const sug = ex.suggestions[x.id]
            const value = pick[x.id] ?? sug ?? ''
            return (
              <div key={x.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) minmax(200px, 1.4fr) auto', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
                <div><strong>{x.title}</strong><div style={note}>{x.group}</div></div>
                <select style={sel} value={value} disabled={busy || ex.unlinkedVideos.length === 0} onChange={e => setPick(p => ({ ...p, [x.id]: e.target.value }))}>
                  <option value="">{ex.unlinkedVideos.length ? '— Not uploaded yet —' : '— No unmatched videos —'}</option>
                  {ex.unlinkedVideos.map(v => <option key={v.id} value={v.id}>{v.id === sug ? '★ ' : ''}{v.title}{v.playlistTitle ? ` — ${v.playlistTitle}` : ''}</option>)}
                </select>
                <Button variant={value ? 'teal' : 'ghost'} disabled={busy || !value} onClick={() => void post({ action: 'link', session_id: x.id, video_id: value }, `Linked to “${videoTitle(value)}”.`)}>Link</Button>
              </div>
            )
          })}
          {Object.keys(ex.suggestions).length > 0 && <div style={note}>★ = a possible match that wasn&apos;t certain enough to link automatically. Link it only if it&apos;s really that session.</div>}
        </div>
      )}
    </Card>
  )
}
