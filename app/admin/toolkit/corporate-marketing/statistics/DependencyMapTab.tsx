'use client'

/*
  Dependency Map tab (CMOS 2.1 §Dependency Map).
  Statistic → assets that use it, grouped by statistic.
*/

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BRAND, fmtRel } from './_shared'

type Row = {
  id: string
  module: string
  asset_name: string
  asset_reference: string | null
  status: string
  linked_at: string
  statistic: { id: string; name: string; scope: string; scope_ref_label: string | null } | null
}

const MODULE_LABELS: Record<string, string> = {
  corporate_deck:    'Corporate Deck',
  knowledge_hub:     'Knowledge Hub',
  proposal_template: 'Proposal Template',
  sales_deck:        'Sales Deck',
  brochure:          'Brochure',
  article:           'Article',
  email_template:    'Email Template',
  website:           'Website',
}

export default function DependencyMapTab() {
  const [deps, setDeps]     = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/corporate-marketing/statistics/dependencies', { cache: 'no-store' })
    if (r.ok) { const d = await r.json(); setDeps(d.dependencies ?? []) }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  // Group by statistic
  const grouped = useMemo(() => {
    const map = new Map<string, { stat: Row['statistic']; rows: Row[] }>()
    for (const d of deps) {
      if (!d.statistic) continue
      const g = map.get(d.statistic.id) ?? { stat: d.statistic, rows: [] }
      g.rows.push(d)
      map.set(d.statistic.id, g)
    }
    return Array.from(map.values()).sort((a, b) => (a.stat?.name ?? '').localeCompare(b.stat?.name ?? ''))
  }, [deps])

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink3)' }}>Loading dependencies…</div>

  if (grouped.length === 0) {
    return (
      <div style={{
        padding: '48px 24px', textAlign: 'center',
        border: '1px dashed var(--border)', borderRadius: '16px',
        background: 'var(--card)', color: 'var(--ink3)',
      }}>
        <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink)', marginBottom: '6px' }}>No dependency links yet</div>
        <div style={{ fontSize: '13px', maxWidth: '480px', margin: '0 auto', lineHeight: 1.55 }}>
          Open any statistic → <strong>Dependencies</strong> tab → link the assets that use it (Corporate Deck slide 6,
          Knowledge Hub, Proposal Template, etc). When the statistic value changes, every linked asset is auto-flagged
          <strong> needs_review</strong>.
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {grouped.map(g => (
        <section key={g.stat!.id} style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: '14px', padding: '18px 22px',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '12px' }}>
            <div style={{ fontSize: '15px', fontWeight: 900, color: 'var(--ink)' }}>{g.stat!.name}</div>
            <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>
              {g.stat!.scope === 'company' ? 'Company'
                : g.stat!.scope === 'event_series' ? `Series · ${g.stat!.scope_ref_label ?? ''}`
                : 'Event'}
            </div>
            <div style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: 700, color: BRAND }}>
              → {g.rows.length} asset{g.rows.length === 1 ? '' : 's'}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {g.rows.map(r => (
              <div key={r.id} style={{
                display: 'grid', gridTemplateColumns: '1fr auto auto',
                gap: '10px', alignItems: 'center',
                padding: '10px 12px', borderRadius: '8px',
                background: 'var(--surface)', border: '1px solid var(--border)',
                fontSize: '13px',
              }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{MODULE_LABELS[r.module] ?? r.module} · {r.asset_name}</div>
                  {r.asset_reference && <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '2px' }}>ref: <code>{r.asset_reference}</code></div>}
                </div>
                <span style={{
                  fontSize: '10px', fontWeight: 800, letterSpacing: '0.5px',
                  background: statusPillBg(r.status),
                  color: statusPillFg(r.status),
                  padding: '3px 8px', borderRadius: '10px',
                }}>{r.status.replace('_', ' ')}</span>
                <span style={{ fontSize: '11px', color: 'var(--ink4)' }}>{fmtRel(r.linked_at)}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function statusPillBg(s: string): string {
  if (s === 'needs_review') return '#F5B94D22'
  if (s === 'reviewed')     return 'var(--border-light)'
  if (s === 'obsolete')     return 'var(--red-light)'
  return 'var(--success-light)'
}
function statusPillFg(s: string): string {
  if (s === 'needs_review') return '#B87400'
  if (s === 'reviewed')     return 'var(--ink3)'
  if (s === 'obsolete')     return 'var(--red)'
  return 'var(--success)'
}
