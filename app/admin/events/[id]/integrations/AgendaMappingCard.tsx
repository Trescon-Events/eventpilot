'use client'
import { useCallback, useEffect, useState } from 'react'
import { Card, Button, Select } from '@/app/components/ui'

/* Agenda mapping (2026-10-18): where each EventPilot agenda field (stage, session type, theme) lives in KonfHub for this event, plus the one-time
   import that links the event's existing KonfHub sessions in place. Import is a preview first; "Import" only appears after a clean preview. */

type Filter = { id: string; name: string; tags: { id: string; name: string }[] }
type Mapping = {
  stage_mode: 'track' | 'tag'; push_session_type: boolean
  stage_filter_id: string | null; format_filter_id: string | null; theme_filter_id: string | null; room_filter_id: string | null
  mapped: { stage: number; format: number; theme: number; room: number }
  filters: Filter[]; filter_error: string | null; konfhub_configured: boolean
}
type Item = { konfhub_session_id: string; title: string; date: string; start: string; end: string; stage: string | null; format: string | null; theme: string | null; speakers: { name: string; matched: boolean }[]; action: 'create' | 'skip'; reason?: string; warnings: string[] }
type Report = { dryRun: boolean; stages: { name: string; action: string }[]; items: Item[]; counts: { create: number; skip: number; warnings: number } }

export default function AgendaMappingCard({ eventId, canManage }: { eventId: string; canManage: boolean }) {
  const [m, setM] = useState<Mapping | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [report, setReport] = useState<Report | null>(null)

  const load = useCallback(async () => {
    const r = await fetch(`/api/events/konfhub/agenda-mapping?event_id=${eventId}`)
    const j = await r.json()
    if (r.ok) setM(j); else setMsg({ text: j.error || 'Could not load the mapping.', ok: false })
  }, [eventId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
  useEffect(() => { load() }, [load])

  async function save(patch: Record<string, unknown>) {
    setBusy(true); setMsg(null); setReport(null)
    const r = await fetch(`/api/events/konfhub/agenda-mapping?event_id=${eventId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    const j = await r.json()
    if (r.ok) { setM(j); setMsg({ text: 'Saved.', ok: true }) } else setMsg({ text: j.error || 'Save failed.', ok: false })
    setBusy(false)
  }

  async function runImport(dryRun: boolean) {
    setBusy(true); setMsg(null)
    const r = await fetch('/api/events/konfhub/import-agenda', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, dry_run: dryRun }) })
    const j = await r.json()
    if (r.ok) { setReport(j); if (!dryRun) setMsg({ text: `Imported ${j.counts.create} sessions. Nothing was changed on KonfHub.`, ok: true }) }
    else setMsg({ text: j.error || 'Import failed.', ok: false })
    setBusy(false)
  }

  if (!m) return <Card padded><div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>{msg?.text ?? 'Loading agenda mapping…'}</div></Card>
  const tagMode = m.stage_mode === 'tag'
  const filterSelect = (label: string, key: 'stage_filter_id' | 'format_filter_id' | 'theme_filter_id' | 'room_filter_id', mapped: number) => (
    <div>
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '4px' }}>{label}</div>
      <Select value={m[key] ?? ''} disabled={!canManage || busy} onChange={e => save({ [key]: e.target.value || null })}>
        <option value="">— Not mapped —</option>
        {m.filters.map(f => <option key={f.id} value={f.id}>{f.name} ({f.tags.length} tags)</option>)}
      </Select>
      <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '3px' }}>{mapped} tags mapped</div>
    </div>
  )

  return (
    <Card padded>
      <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Agenda mapping</div>
      <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '14px' }}>
        EventPilot keeps fixed fields (stage, session type, theme). This says where each one lives in KonfHub for this event: a KonfHub track, or a tag of a KonfHub filter.
      </div>
      {!m.konfhub_configured && <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>KonfHub isn&apos;t configured for this event yet.</div>}
      {m.konfhub_configured && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '14px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '4px' }}>Stage lives in</div>
              <Select value={m.stage_mode} disabled={!canManage || busy} onChange={e => save({ stage_mode: e.target.value })}>
                <option value="track">A KonfHub track</option>
                <option value="tag">A tag of a filter</option>
              </Select>
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '4px' }}>Push the session type number</div>
              <Select value={m.push_session_type ? 'yes' : 'no'} disabled={!canManage || busy} onChange={e => save({ push_session_type: e.target.value === 'yes' })}>
                <option value="yes">Yes</option>
                <option value="no">No, leave KonfHub&apos;s as it is</option>
              </Select>
            </div>
          </div>
          {m.filter_error && <div style={{ fontSize: '12px', color: 'var(--red, #b91c1c)', marginBottom: '10px' }}>{m.filter_error}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '14px' }}>
            {tagMode && filterSelect('Stage filter', 'stage_filter_id', m.mapped.stage)}
            {filterSelect('Session type filter', 'format_filter_id', m.mapped.format)}
            {filterSelect('Theme filter', 'theme_filter_id', m.mapped.theme)}
            {filterSelect('Roundtable room filter (optional)', 'room_filter_id', m.mapped.room)}
          </div>
          {msg && <div style={{ fontSize: '12.5px', marginBottom: '10px', color: msg.ok ? 'var(--green, #15803d)' : 'var(--red, #b91c1c)' }}>{msg.text}</div>}

          {tagMode && canManage && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', marginBottom: '4px' }}>Import existing KonfHub sessions</div>
              <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '10px' }}>
                Links each KonfHub session to a new Agenda Builder session in place. Nothing is deleted or recreated on KonfHub. Preview first.
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Button variant="ghost" disabled={busy} onClick={() => runImport(true)}>{busy ? 'Working…' : 'Preview import'}</Button>
                {report?.dryRun && report.counts.create > 0 && (
                  <Button disabled={busy} onClick={() => { if (confirm(`Import ${report.counts.create} sessions into the Agenda Builder? Nothing changes on KonfHub.`)) runImport(false) }}>
                    Import {report.counts.create} sessions
                  </Button>
                )}
              </div>
              {report && (
                <div style={{ marginTop: '12px', fontSize: '12.5px', color: 'var(--ink2)' }}>
                  <div style={{ marginBottom: '6px' }}>
                    {report.dryRun ? 'Preview: ' : 'Done: '}{report.counts.create} to create, {report.counts.skip} already linked, {report.counts.warnings} warnings.
                    {report.stages.length > 0 && <> Stages: {report.stages.map(s => `${s.name}${s.action === 'create' ? ' (new)' : ''}`).join(', ')}.</>}
                  </div>
                  <div style={{ maxHeight: '320px', overflow: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
                    {report.items.map(it => (
                      <div key={it.konfhub_session_id} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ fontWeight: 600 }}>{it.title} <span style={{ fontWeight: 400, color: 'var(--ink4)' }}>({it.action})</span></div>
                        <div style={{ fontSize: '11.5px', color: 'var(--ink3)' }}>
                          {it.date} {it.start}–{it.end} · {it.stage ?? 'no stage'} · {it.format ?? 'no type'}{it.theme ? ` · ${it.theme}` : ''} · {it.speakers.length} speakers{it.speakers.some(s => !s.matched) ? ` (${it.speakers.filter(s => !s.matched).length} unmatched)` : ''}
                        </div>
                        {it.warnings.map((w, i) => <div key={i} style={{ fontSize: '11.5px', color: 'var(--amber, #b45309)' }}>{w}</div>)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  )
}
