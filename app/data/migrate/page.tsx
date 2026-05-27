'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const NAV = [
  { label: 'Contacts',  href: '/data' },
  { label: 'Companies', href: '/data/companies' },
  { label: 'Lead Finder', href: '/data/lead-finder' },
  { label: 'Tools',     href: '/data/tools' },
  { label: 'Analytics', href: '/data/analytics' },
]

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
    } finally {
      setChecking(false)
    }
  }

  const runMigration = async () => {
    setRunning(true)
    setDone(false)
    setLog([])
    setTotals({ contacts: 0, companies: 0 })
    let offset    = 0
    let iteration = 0

    addLog(`Starting migration — entity: ${entity}, batch size: ${batchSize}`)

    while (true) {
      iteration++
      addLog(`Batch ${iteration} — offset ${offset}…`)

      const res = await fetch('/api/data/migrate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ source: 'smartdata', entity, batch_size: batchSize, offset }),
      })
      const d: MigrateResult = await res.json()

      if (d.error) { addLog(`Error: ${d.error}`); break }

      const ci = d.contacts?.inserted  ?? 0
      const co = d.companies?.inserted ?? 0
      setTotals(prev => ({ contacts: prev.contacts + ci, companies: prev.companies + co }))

      const contactTotal  = d.contacts?.total  ?? 0
      const companyTotal  = d.companies?.total ?? 0
      addLog(`Batch ${iteration} done — contacts: +${ci} (total in source: ${contactTotal.toLocaleString()}), companies: +${co} (total in source: ${companyTotal.toLocaleString()})`)

      if (d.done || d.next_offset === null) {
        addLog('Migration complete.')
        setDone(true)
        break
      }

      offset = d.next_offset!
      // Small pause to avoid hammering the DB
      await new Promise(r => setTimeout(r, 300))
    }

    setRunning(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFB', fontFamily: 'system-ui, sans-serif' }}>
      {/* Nav */}
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #DDE8EE', padding: '0 24px', height: '56px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="20" height="20" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
          <span style={{ fontSize: '15px', fontWeight: 800, color: '#0F1923' }}>Data Intelligence</span>
        </div>
        <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
          {NAV.map(tab => (
            <Link key={tab.href} href={tab.href} style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, background: 'transparent', color: '#6B7280', textDecoration: 'none' }}>{tab.label}</Link>
          ))}
          <span style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, background: 'rgba(0,165,163,0.1)', color: '#00A5A3' }}>Migration</span>
        </div>
      </div>

      <div style={{ padding: '32px 24px', maxWidth: '760px' }}>
        {/* Header */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#0F1923', marginBottom: '6px' }}>SmartData → TAOS Migration</div>
          <div style={{ fontSize: '15px', color: '#6B7280' }}>Import all contacts and companies from SmartData into TAOS in one click. Duplicate records are deduped on LinkedIn URL and domain.</div>
        </div>

        {/* Step 1 — check source */}
        <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '24px', marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '1px' }}>Step 1 — Verify Source</div>
          <div style={{ fontSize: '15px', color: '#6B7280', marginBottom: '16px' }}>Check how many records are available in SmartData before migrating.</div>

          <button onClick={checkSource} disabled={checking} style={{ padding: '9px 20px', borderRadius: '9px', background: checking ? '#F3F4F6' : '#0F1923', color: checking ? '#9CA3AF' : '#FFFFFF', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>
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

        {/* Step 2 — configure */}
        <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '24px', marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '1px' }}>Step 2 — Configure</div>
          <div style={{ display: 'flex', gap: '16px', marginTop: '16px', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#6B7280', marginBottom: '6px' }}>What to migrate</div>
              <select value={entity} onChange={e => setEntity(e.target.value as any)} style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', background: '#FAFBFC', cursor: 'pointer' }}>
                <option value="both">Contacts + Companies</option>
                <option value="contacts">Contacts only</option>
                <option value="companies">Companies only</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#6B7280', marginBottom: '6px' }}>Batch size</div>
              <select value={batchSize} onChange={e => setBatchSize(Number(e.target.value))} style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #DDE8EE', fontSize: '13px', background: '#FAFBFC', cursor: 'pointer' }}>
                <option value={200}>200 per batch</option>
                <option value={500}>500 per batch</option>
                <option value={1000}>1000 per batch</option>
              </select>
            </div>
          </div>
        </div>

        {/* Step 3 — run */}
        <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '24px' }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '1px' }}>Step 3 — Run Migration</div>
          <div style={{ fontSize: '15px', color: '#6B7280', marginBottom: '16px' }}>Safe to re-run — existing records are matched by LinkedIn URL and domain and skipped.</div>

          <button onClick={runMigration} disabled={running} style={{ padding: '10px 24px', borderRadius: '9px', background: running ? '#F3F4F6' : '#00A5A3', color: running ? '#9CA3AF' : '#FFFFFF', border: 'none', cursor: running ? 'default' : 'pointer', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            {running && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" style={{ animation: 'spin 1s linear infinite', transformOrigin: '50% 50%' }}/>
              </svg>
            )}
            {running ? 'Migrating…' : 'Start Migration'}
          </button>

          {(log.length > 0 || done) && (
            <div style={{ marginTop: '20px' }}>
              {done && (
                <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                  <div style={{ padding: '10px 18px', background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.2)', borderRadius: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px' }}>Contacts imported</div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: '#0F1923' }}>{totals.contacts.toLocaleString()}</div>
                  </div>
                  <div style={{ padding: '10px 18px', background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.2)', borderRadius: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px' }}>Companies imported</div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: '#0F1923' }}>{totals.companies.toLocaleString()}</div>
                  </div>
                </div>
              )}
              <div style={{ background: '#0F1923', borderRadius: '10px', padding: '16px', fontFamily: 'monospace', fontSize: '12px', color: '#C4F135', lineHeight: 1.8, maxHeight: '280px', overflowY: 'auto' }}>
                {log.map((line, i) => <div key={i}>{line}</div>)}
                {running && <div style={{ animation: 'pulse 1s ease-in-out infinite' }}>▌</div>}
              </div>
            </div>
          )}
        </div>

        {/* Note about keys */}
        <div style={{ marginTop: '16px', padding: '14px 18px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '12px', fontSize: '13px', color: '#92400E' }}>
          <strong>Before running:</strong> Add <code style={{ background: 'rgba(245,158,11,0.1)', padding: '1px 5px', borderRadius: '4px' }}>SMARTDATA_ANON_KEY</code> or <code style={{ background: 'rgba(245,158,11,0.1)', padding: '1px 5px', borderRadius: '4px' }}>SMARTDATA_SERVICE_ROLE_KEY</code> to <code style={{ background: 'rgba(245,158,11,0.1)', padding: '1px 5px', borderRadius: '4px' }}>.env.local</code> — get the service role key from the SmartData Supabase dashboard.
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
