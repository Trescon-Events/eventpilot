'use client'

import { use, useCallback, useEffect, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import ShowcallSheet, { type SheetPayload } from '@/app/components/showcall/ShowcallSheet'
import { Button, Select } from '@/app/components/ui'
import { downloadShowcallXlsx } from '@/app/lib/showcall/xlsx'
import { permissionSetSatisfies } from '@/app/lib/access/permission-match'

/* Show Caller — producers' page. The same live sheet the show caller gets on their private link, plus the link itself. "Full screen" gives the sheet the whole window. */

type LinkRow = { id: string; track_id: string | null; label: string; token: string }
type Payload = SheetPayload & { links: LinkRow[] }

export default function ShowcallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const [links, setLinks] = useState<LinkRow[]>([])
  const [stages, setStages] = useState<{ id: string; name: string }[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [full, setFull] = useState(false)
  const [stage, setStage] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    void fetch(`/api/events/access/me?event_id=${eventId}`).then(x => x.json()).catch(() => ({})).then((p: { permissions?: string[] }) => setCanEdit(permissionSetSatisfies(new Set<string>(p.permissions ?? []), 'sae.showcall.manage')))
  }, [eventId])

  const load = useCallback(async (): Promise<SheetPayload> => {
    const r = await fetch(`/api/events/showcall?event_id=${eventId}`, { cache: 'no-store' })
    const j: Payload & { error?: string } = await r.json().catch(() => ({} as Payload))
    if (!r.ok) throw new Error(j.error ?? 'Could not load the sheet.')
    setLinks(j.links ?? []); setStages(j.stages ?? [])
    return j
  }, [eventId])
  const act = useCallback(async (body: Record<string, unknown>) => {
    const r = await fetch('/api/events/showcall', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, ...body }) })
    const j = await r.json().catch(() => ({}))
    return r.ok ? null : (j.error ?? 'Could not save.') as string
  }, [eventId])

  const url = (t: string) => `${typeof window === 'undefined' ? '' : window.location.origin}/public/showcall/${t}`
  async function createLink() {
    await fetch('/api/events/screens/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, kind: 'showcall', track_id: stage || null, label: stage ? '' : 'Show caller — all stages' }) })
    await load()
  }
  async function revoke(id: string) {
    if (!window.confirm('Switch this link off? Anyone using it loses access immediately.')) return
    await fetch('/api/events/screens/links', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, id }) })
    await load()
  }

  const sheet = <ShowcallSheet load={load} act={act} readOnly={!canEdit} onExcel={(p, o) => downloadShowcallXlsx({ eventName: p.event_name, timezone: p.timezone, stages: p.stages, rows: p.rows, includeMc: o.mc })} />
  return (
    <div>
      {!full && (
        <>
          <PageHeader
            eyebrow="On the day"
            title="Show Caller"
            description="The live run-of-show sheet, built from the Agenda. Time, title, speakers and format come from the Agenda; MC, screen, mic, lights, seats, comments and actual times are typed here and saved as you go."
            actions={<Button variant="teal" onClick={() => setFull(true)}>Full screen</Button>}
          />
          <details style={{ margin: '14px 32px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 800, fontSize: '14.5px' }}>Show caller link ({links.length})</summary>
            <div style={{ fontSize: '13px', color: 'var(--ink3)', margin: '8px 0 10px' }}>Send this link to the show caller. It opens the sheet full screen, no login, and they can edit it. Switch it off any time. A link limited to one stage shows only that stage.</div>
            {links.map(l => (
              <div key={l.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', padding: '6px 0', borderTop: '1px solid var(--border-light)' }}>
                <strong style={{ minWidth: '170px', fontSize: '14px' }}>{l.label}</strong>
                <code style={{ fontSize: '12px', color: 'var(--ink2)', wordBreak: 'break-all', flex: '1 1 260px' }}>{url(l.token)}</code>
                <Button variant="ghost" onClick={() => { void navigator.clipboard.writeText(url(l.token)); setCopied(l.id); setTimeout(() => setCopied(null), 1500) }}>{copied === l.id ? 'Copied' : 'Copy link'}</Button>
                {canEdit && <Button variant="red" onClick={() => revoke(l.id)}>Switch off</Button>}
              </div>
            ))}
            {canEdit && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                <Select value={stage} onChange={e => setStage(e.target.value)} style={{ width: 'auto', minWidth: '220px' }}>
                  <option value="">All stages (one link)</option>{stages.map(s => <option key={s.id} value={s.id}>{s.name} only</option>)}
                </Select>
                <Button variant="teal" onClick={createLink}>Create link</Button>
              </div>
            )}
          </details>
        </>
      )}
      <div style={full ? { position: 'fixed', inset: 0, zIndex: 60, background: 'var(--surface)' } : { height: 'calc(100vh - 150px)', minHeight: '480px', margin: '0 12px 12px', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        {full && <button className="scx-btn" style={{ position: 'absolute', right: 12, bottom: 12, zIndex: 70, padding: '6px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--card-hi)', color: 'var(--ink)', cursor: 'pointer', fontWeight: 700 }} onClick={() => setFull(false)}>Exit full screen</button>}
        {sheet}
      </div>
    </div>
  )
}
