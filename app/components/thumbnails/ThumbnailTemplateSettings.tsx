'use client'

import { useEffect, useState } from 'react'
import { Card, Button, Badge, Select, Toast } from '@/app/components/ui'

/* Admin Console → Thumbnails: which thumbnail templates the session thumbnails use (the speaker card + one layout per
   session format) and what text goes on the card. The templates themselves are edited in the variant list below this card.
   Generating and approving thumbnails stays in Session Videos → Thumbnails. */

type V = { id: string; name: string; category: string; kind?: string; w: number; h: number }
type Data = { can_edit: boolean; missing: string[]; variants: V[]; settings: { card_variant_id: string | null; layout_variant_ids: Record<string, string>; card_text: 'name' | 'name_company' } }
const LAYOUTS = ['keynote', 'fireside', 'panel'] as const

export default function ThumbnailTemplateSettings({ eventId, refreshKey }: { eventId: string; refreshKey: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [card, setCard] = useState('')
  const [layouts, setLayouts] = useState<Record<string, string>>({})
  const [text, setText] = useState<'name' | 'name_company'>('name')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / when the variant list changes
    fetch(`/api/events/thumbnails?event_id=${eventId}`, { cache: 'no-store' }).then(r => r.json()).then((d: Data & { error?: string }) => {
      if (d.error) { setMsg({ text: d.error, ok: false }); return }
      setData(d); setCard(d.settings.card_variant_id ?? ''); setLayouts(d.settings.layout_variant_ids ?? {}); setText(d.settings.card_text)
    }).catch(() => setMsg({ text: 'Could not load the thumbnail settings.', ok: false }))
  }, [eventId, refreshKey])

  async function save() {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/events/thumbnails', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, action: 'save_settings', card_variant_id: card || null, layout_variant_ids: Object.fromEntries(Object.entries(layouts).filter(([, v]) => v)), card_text: text }) })
      const j = await r.json().catch(() => ({})) as { error?: string; missing?: string[] }
      if (!r.ok) throw new Error(j.error ?? 'Could not save.')
      setMsg({ text: 'Thumbnail settings saved.', ok: true })
      const d = await fetch(`/api/events/thumbnails?event_id=${eventId}`, { cache: 'no-store' }).then(x => x.json()).catch(() => null) as Data | null
      if (d) setData(d)
    } catch (e) { setMsg({ text: e instanceof Error ? e.message : 'Could not save.', ok: false }) } finally { setBusy(false) }
  }

  if (!data) return <Card padded><div style={{ fontSize: 13, color: 'var(--ink3)' }}>{msg?.text ?? 'Loading thumbnail settings…'}</div></Card>
  const cards = data.variants.filter(v => v.category === 'thumbnail_card')
  const lays = data.variants.filter(v => v.category === 'thumbnail_layout')
  const lbl = { fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'grid', gap: 4 } as const

  return (
    <Card padded>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Session thumbnails</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.6, maxWidth: 680 }}>Pick the speaker card and the layout for each session format. Edit the templates themselves in the list below. Thumbnails are generated and approved in Session Videos → Thumbnails.</div>
        </div>
        <Badge color={data.missing.length ? 'amber' : 'teal'}>{data.missing.length ? `Missing: ${data.missing.join(' · ')}` : 'Ready'}</Badge>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        <label style={lbl}>Speaker card
          <Select value={card} disabled={!data.can_edit} onChange={e => setCard(e.target.value)}>
            <option value="">Choose…</option>{cards.map(v => <option key={v.id} value={v.id}>{v.name} ({v.w}×{v.h})</option>)}
          </Select>
        </label>
        {LAYOUTS.map(k => (
          <label key={k} style={{ ...lbl, textTransform: 'capitalize' }}>{k} layout
            <Select value={layouts[k] ?? ''} disabled={!data.can_edit} onChange={e => setLayouts(l => ({ ...l, [k]: e.target.value }))}>
              <option value="">Choose…</option>{lays.filter(v => !v.kind || v.kind === k).map(v => <option key={v.id} value={v.id}>{v.name} ({v.w}×{v.h})</option>)}
            </Select>
          </label>
        ))}
        <label style={lbl}>Text on card
          <Select value={text} disabled={!data.can_edit} onChange={e => setText(e.target.value as 'name' | 'name_company')}>
            <option value="name">Name only</option><option value="name_company">Name and company</option>
          </Select>
        </label>
      </div>
      {data.can_edit && <div style={{ marginTop: 12 }}><Button variant="teal" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save settings'}</Button></div>}
      <Toast message={msg?.text ?? null} type={msg?.ok ? 'success' : 'error'} onClose={() => setMsg(null)} />
    </Card>
  )
}
