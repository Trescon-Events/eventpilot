'use client'

/*
  Event Series Statistics tab — per-series stat groups.

  Series names are free text (World AI Show, Dubai AI Festival, Future
  Sustainability Forum…). Users pick an existing series or create a new
  one when adding the first stat for it. The active series drives the
  filter on /api/corporate-marketing/statistics.
*/

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BRAND, INPUT_STYLE, TableHeader, StatRow, useMe, useStatCrud } from './_shared'
import StatisticDetailDrawer from './StatisticDetailDrawer'

const SUGGESTED_SERIES_STATS = ['Speakers', 'Sponsors', 'Delegates', 'Countries', 'Editions', 'Revenue', 'Growth', 'Media Reach']

export default function EventSeriesStatsTab() {
  const [seriesList, setSeriesList]   = useState<string[]>([])
  const [activeSeries, setActiveSeries] = useState<string>('')
  const [newSeries, setNewSeries]     = useState<string>('')
  const [showAddStat, setShowAddStat] = useState(false)
  const [newRow, setNewRow] = useState({ name: '', current_value: '', unit: '', description: '' })

  // Load the distinct list of series labels once (from every event_series statistic).
  const loadSeries = useCallback(async () => {
    const r = await fetch('/api/corporate-marketing/statistics?scope=event_series&limit=500', { cache: 'no-store' })
    if (!r.ok) return
    const d = await r.json()
    type Row = { scope_ref_label: string | null }
    const labels = Array.from(new Set((d.statistics as Row[]).map(x => x.scope_ref_label).filter((x): x is string => !!x))).sort()
    setSeriesList(labels)
    if (!activeSeries && labels.length > 0) setActiveSeries(labels[0])
  }, [activeSeries])
  useEffect(() => { loadSeries() }, [loadSeries])

  const fetchUrl = useMemo(
    () => activeSeries ? `/api/corporate-marketing/statistics?scope=event_series&scope_ref=${encodeURIComponent(activeSeries)}` : '',
    [activeSeries]
  )
  const crud = useStatCrud(fetchUrl || '/api/corporate-marketing/statistics?scope=event_series&limit=0')
  const me = useMe()
  const [detailId, setDetailId] = useState<string | null>(null)

  async function addSeries() {
    const name = newSeries.trim()
    if (!name) return
    setSeriesList(prev => Array.from(new Set([...prev, name])).sort())
    setActiveSeries(name)
    setNewSeries('')
  }

  async function addStat() {
    if (!activeSeries) { alert('Pick or create a series first.'); return }
    if (!newRow.name.trim()) { alert('Name is required.'); return }
    const res = await fetch('/api/corporate-marketing/statistics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'event_series',
        scope_ref_label: activeSeries,
        name: newRow.name.trim(),
        current_value: newRow.current_value,
        unit: newRow.unit || null,
        description: newRow.description || null,
      }),
    })
    if (!res.ok) { alert(`Add failed: ${(await res.json().catch(() => ({}))).error || res.statusText}`); return }
    setNewRow({ name: '', current_value: '', unit: '', description: '' })
    setShowAddStat(false)
    crud.reload()
    loadSeries()  // in case this created the very first stat for a brand-new series
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Series picker + add-series */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: '14px', padding: '16px 20px',
        display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink4)', letterSpacing: '1px', textTransform: 'uppercase' }}>
          Series
        </span>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {seriesList.length === 0
            ? <span style={{ fontSize: '13px', color: 'var(--ink4)', fontStyle: 'italic' }}>No series yet — create one below.</span>
            : seriesList.map(s => (
                <button
                  key={s}
                  onClick={() => setActiveSeries(s)}
                  style={{
                    padding: '6px 12px', borderRadius: '999px',
                    border: `1px solid ${activeSeries === s ? BRAND : 'var(--ink4)'}`,
                    background: activeSeries === s ? BRAND : 'var(--card)',
                    color:      activeSeries === s ? 'var(--red-light)' : 'var(--ink)',
                    fontSize: '12px', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                  }}>
                  {s}
                </button>
              ))}
        </div>
        <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
          <input
            value={newSeries} onChange={e => setNewSeries(e.target.value)}
            placeholder="+ New series name…" style={{ ...INPUT_STYLE, width: '220px' }}
          />
          <button
            onClick={addSeries} disabled={!newSeries.trim()}
            style={{
              padding: '6px 14px', borderRadius: '6px', border: 'none',
              background: newSeries.trim() ? BRAND : 'var(--border-light)',
              color:      newSeries.trim() ? 'var(--red-light)' : 'var(--ink4)',
              fontSize: '12px', fontWeight: 800, fontFamily: 'inherit',
              cursor: newSeries.trim() ? 'pointer' : 'not-allowed',
            }}>
            Add series
          </button>
        </div>
      </div>

      {/* Table for the active series */}
      {activeSeries && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => setShowAddStat(v => !v)}
              style={{
                background: BRAND, color: 'var(--red-light)', border: 'none',
                padding: '8px 16px', borderRadius: '8px',
                fontSize: '12px', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
              }}>
              {showAddStat ? '× Cancel' : '+ Add stat'}
            </button>
            <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--ink4)' }}>
              {crud.rows.length} stat{crud.rows.length === 1 ? '' : 's'} for <strong>{activeSeries}</strong>
            </div>
          </div>

          {showAddStat && (
            <div style={{
              background: 'var(--card)', border: `1px dashed ${BRAND}`, borderRadius: '12px',
              padding: '14px 16px', display: 'grid', gap: '10px',
              gridTemplateColumns: '1.4fr 1fr 0.7fr 1.5fr auto', alignItems: 'center',
            }}>
              <input placeholder="Name (or pick suggested)" value={newRow.name} onChange={e => setNewRow(n => ({ ...n, name: e.target.value }))} list={`suggested-${activeSeries}`} style={INPUT_STYLE} />
              <datalist id={`suggested-${activeSeries}`}>
                {SUGGESTED_SERIES_STATS.map(s => <option key={s} value={s} />)}
              </datalist>
              <input placeholder="Value" value={newRow.current_value} onChange={e => setNewRow(n => ({ ...n, current_value: e.target.value }))} style={INPUT_STYLE} />
              <input placeholder="Unit" value={newRow.unit} onChange={e => setNewRow(n => ({ ...n, unit: e.target.value }))} style={INPUT_STYLE} />
              <input placeholder="Description (optional)" value={newRow.description} onChange={e => setNewRow(n => ({ ...n, description: e.target.value }))} style={INPUT_STYLE} />
              <button onClick={addStat} style={{
                background: BRAND, color: 'var(--red-light)', border: 'none',
                padding: '7px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
              }}>Create draft</button>
            </div>
          )}

          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
            <TableHeader />
            {crud.loading
              ? <div style={{ padding: '32px', textAlign: 'center', color: 'var(--ink3)' }}>Loading…</div>
              : crud.rows.length === 0
                ? <div style={{ padding: '32px 18px', textAlign: 'center', color: 'var(--ink4)', fontSize: '13px' }}>
                    No stats for <strong>{activeSeries}</strong> yet. Click <strong>+ Add stat</strong> above.
                  </div>
                : crud.rows.map(r => (
                    <StatRow key={r.id} r={r} me={me}
                      editing={crud.editing} setEditing={crud.setEditing} busy={crud.busy}
                      beginEdit={crud.beginEdit} cancelEdit={crud.cancelEdit} saveEdit={crud.saveEdit}
                      transition={crud.transition} archive={crud.archive}
                      onOpenDetail={setDetailId}
                    />
                  ))}
          </div>
        </>
      )}
      <StatisticDetailDrawer statisticId={detailId} onClose={() => setDetailId(null)} onChanged={crud.reload} />
    </div>
  )
}
