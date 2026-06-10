'use client'

import { useState } from 'react'

interface SourceCount { contacts: number; companies: number }
interface MigrateResult {
  contacts?:    { fetched: number; inserted: number; total: number }
  companies?:   { fetched: number; inserted: number; total: number }
  next_offset:  number | null
  done:         boolean
  dry_run?:     boolean
  error?:       string
}

export default function MigratePage() {
  const [sourceCount, setSourceCount] = useState<SourceCount | null>(null)
  const [checking, setChecking]       = useState(false)
  const [entity, setEntity]           = useState<'both' | 'contacts' | 'companies'>('both')
  const [batchSize, setBatchSize]     = useState(500)
  const [running, setRunning]         = useState(false)
  const [log, setLog]                 = useState<string[]>([])
  const [totals, setTotals]           = useState({ contacts: 0, companies: 0 })
  const [done, setDone]               = useState(false)

  const addLog = (msg: string) => setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])

  const checkSource = async () => {
    setChecking(true)
    try {
      const res = await fetch('/api/data/migrate')
      const d   = await res.json()
      if (d.error) { addLog(`Error: ${d.error}`); return }
      setSourceCount(d.smartdata)
      addLog(`SmartData has ${d.smartdata.contacts.toLocaleString()} contacts and ${d.smartdata.companies.toLocaleString()} companies ready to migrate.`)
    } finally { setChecking(false) }
  }

  const runMigration = async () => {
    setRunning(true); setDone(false); setLog([]); setTotals({ contacts: 0, companies: 0 })
    let offset = 0, iteration = 0
    addLog(`Starting migration — entity: ${entity}, batch size: ${batchSize}`)
    while (true) {
      iteration++
      addLog(`Batch ${iteration} — offset ${offset}…`)
      const res = await fetch('/api/data/migrate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ source: 'smartdata', entity, batch_size: batchSize, offset }),
      })
      const d: MigrateResult = await res.json()
      if (d.error) { addLog(`Error: ${d.error}`); break }
      const ci = d.contacts?.inserted ?? 0
      const co = d.companies?.inserted ?? 0
      setTotals(prev => ({ contacts: prev.contacts + ci, companies: prev.companies + co }))
      const contactTotal  = d.contacts?.total ?? 0
      const companyTotal  = d.companies?.total ?? 0
      addLog(`Batch ${iteration} done — contacts: +${ci} (total in source: ${contactTotal.toLocaleString()}), companies: +${co} (total in source: ${companyTotal.toLocaleString()})`)
      if (d.done || d.next_offset === null) { addLog('Migration complete.'); setDone(true); break }
      offset = d.next_offset!
      await new Promise(r => setTimeout(r, 300))
    }
    setRunning(false)
  }

  const selectStyle: React.CSSProperties = {
    padding: '9px 12px', borderRadius: '8px', border: '1px solid #DDE8EE',
    fontSize: '13px', color: '#0F1923', background: '#F8FAFB', cursor: 'pointer', outline: 'none',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFB', fontFamily: 'system-ui, sans-serif' }}>
      {/* Page header */}
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #DDE8EE', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <svg width="16" height="16" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
          <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
          <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
        </svg>
        <span style={{ fontSize: '15px', fontWeight: 700, color: '#0F1923' }}>Data Migration</span>
        <span style={{ fontSize: '13px', color: '#9CA3AF' }}>SmartData → Event Pilot import</span>
      </div>

      <div style={{ padding: '32px 24px', maxWidth: '760px' }}>
        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#0F1923', marginBottom: '6px' }}>SmartData → Event Pilot Migration</div>
          <div style={{ fontSize: '15px', color: '#6B7280' }}>Import all contacts and companies from SmartData into Event Pilot in one click. Duplicate records are deduped on LinkedIn URL and domain.</div>
        </div>

        {/* Step 1 */}
        <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '14px', padding: '24px', marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#9CA3AF', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Step 1 — Verify Source</div>
          <div style={{ fontSize: '15px', color: '#6B7280', marginBottom: '16px' }}>Check how many records are available in SmartData before migrating.</div>

          <button onClick={checkSource} disabled={checking} style={{ padding: '9px 20px', borderRadius: '9px', background: checking ? 'rgba(0,165,163,0.2)' : '#00A5A3', color: checking ? '#9CA3AF' : '#FFFFFF', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>
            {checking ? 'Checking…' : 'Check SmartData'}
          </button>

          {sourceCount && (
            <div style={{ display: 'flex', gap: '16px', marginTop: '16px' }}>
              <div style={{ padding: '14px 20px', background: 'rgba(0,165,163,0.06)', border: '1px solid rgba(0,165,163,0.2)', borderRadius: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Contacts</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F1923' }}>{sourceCount.contacts.toLocaleString()}</div>
              </div>
              <div style={{ padding: '14px 20px', background: 'rgba(0,165,163,0.06)', border: '1px solid rgba(0,165,163,0.2)', borderRadius: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Companies</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F1923' }}>{sourceCount.companies.toLocaleString()}</div>
              </div>
            </div>
          )}
        </div>

        {/* Step 2 */}
        <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '14px', padding: '24px', marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#9CA3AF', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Step 2 — Configure</div>
          <div style={{ display: 'flex', gap: '16px', marginTop: '16px', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#6B7280', marginBottom: '6px' }}>What to migrate</div>
              <select value={entity} onChange={e => setEntity(e.target.value as any)} style={selectStyle}>
                <option value="both">Contacts + Companies</option>
                <option value="contacts">Contacts only</option>
                <option value="companies">Companies only</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#6B7280', marginBottom: '6px' }}>Batch size</div>
              <select value={batchSize} onChange={e => setBatchSize(Number(e.target.value))} style={selectStyle}>
                <option value={200}>200 per batch</option>
                <option value={500}>500 per batch</option>
                <option value={1000}>1000 per batch</option>
              </select>
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '14px', padding: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#9CA3AF', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Step 3 — Run Migration</div>
          <div style={{ fontSize: '15px', color: '#6B7280', marginBottom: '16px' }}>Safe to re-run — existing records are matched by LinkedIn URL and domain and skipped.</div>

          <button onClick={runMigration} disabled={running} style={{ padding: '10px 24px', borderRadius: '9px', background: running ? 'rgba(0,165,163,0.2)' : '#00A5A3', color: running ? '#9CA3AF' : '#FFFFFF', border: 'none', cursor: running ? 'default' : 'pointer', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            {running && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite', transformOrigin: '50% 50%' }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
            )}
            {running ? 'Migrating…' : 'Start Migration'}
          </button>

          {(log.length > 0 || done) && (
            <div style={{ marginTop: '20px' }}>
              {done && (
                <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                  <div style={{ padding: '10px 18px', background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#34D399', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px' }}>Contacts imported</div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: '#0F1923' }}>{totals.contacts.toLocaleString()}</div>
                  </div>
                  <div style={{ padding: '10px 18px', background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#34D399', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px' }}>Companies imported</div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: '#0F1923' }}>{totals.companies.toLocaleString()}</div>
                  </div>
                </div>
              )}
              <div style={{ background: '#F8FAFB', borderRadius: '10px', padding: '16px', fontFamily: 'monospace', fontSize: '12px', color: '#34D399', lineHeight: 1.8, maxHeight: '280px', overflowY: 'auto', border: '1px solid #DDE8EE' }}>
                {log.map((line, i) => <div key={i}>{line}</div>)}
                {running && <div style={{ opacity: 0.7 }}>▌</div>}
              </div>
            </div>
          )}
        </div>

        <div style={{ marginTop: '16px', padding: '14px 18px', background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: '12px', fontSize: '13px', color: '#6B7280' }}>
          <strong style={{ color: '#FBBF24' }}>Before running:</strong> Add <code style={{ background: 'rgba(251,191,36,0.1)', padding: '1px 5px', borderRadius: '4px', color: '#FBBF24' }}>SMARTDATA_ANON_KEY</code> or <code style={{ background: 'rgba(251,191,36,0.1)', padding: '1px 5px', borderRadius: '4px', color: '#FBBF24' }}>SMARTDATA_SERVICE_ROLE_KEY</code> to <code style={{ background: 'rgba(251,191,36,0.1)', padding: '1px 5px', borderRadius: '4px', color: '#FBBF24' }}>.env.local</code> — get the service role key from the SmartData Supabase dashboard.
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
