'use client'

import { useState, useEffect, useCallback } from 'react'

interface AuditRow {
  id:           string
  contact_id?:  string | null
  company_id?:  string | null
  source_tool:  string
  field_key:    string
  old_value?:   string | null
  new_value?:   string | null
  action:       string
  created_at:   string
  contact_name?: string | null
}

const TOOL_LABELS: Record<string, string> = {
  linkedin_enricher: 'LinkedIn Enricher',
  smart_lookup:      'Smart Lookup',
  email_verifier:    'Email Verifier',
  email_guesser:     'Email Guesser',
  manual:            'Manual',
  file_extractor:    'File Extractor',
  url_extractor:     'URL Extractor',
}

const ACTION_COLORS: Record<string, { color: string; bg: string }> = {
  auto_merge: { color: 'var(--teal-mid)', bg: 'rgba(18,201,189,0.08)' },
  manual:     { color: 'var(--info)',     bg: 'rgba(90,169,242,0.08)' },
  overwrite:  { color: 'var(--amber)',    bg: 'rgba(245,185,77,0.08)' },
}

export default function AuditPage() {
  const [rows,    setRows]    = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tool,    setTool]    = useState('')
  const [query,   setQuery]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '150' })
    if (tool) params.set('tool', tool)
    const data = await fetch(`/api/data/audit?${params}`).then(r => r.json()).catch(() => [])
    setRows(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [tool])

  useEffect(() => { load() }, [load])

  const filtered = query.trim()
    ? rows.filter(r =>
        r.contact_name?.toLowerCase().includes(query.toLowerCase()) ||
        r.field_key.toLowerCase().includes(query.toLowerCase()) ||
        r.source_tool.toLowerCase().includes(query.toLowerCase()) ||
        r.new_value?.toLowerCase().includes(query.toLowerCase())
      )
    : rows

  const tools = Array.from(new Set(rows.map(r => r.source_tool))).filter(Boolean)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <svg width="16" height="16" fill="none" stroke="var(--teal-mid)" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
        </svg>
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>Enrichment Audit</span>
        <span style={{ fontSize: '13px', color: 'var(--ink4)' }}>{filtered.length} field changes</span>
        <div style={{ flex: 1 }} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Filter by name, field, value…"
          style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--ink)', background: 'var(--surface)', outline: 'none', width: '220px' }}
        />
        <select
          value={tool}
          onChange={e => setTool(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--ink3)', background: 'var(--card)', outline: 'none' }}
        >
          <option value="">All Tools</option>
          {tools.map(t => <option key={t} value={t}>{TOOL_LABELS[t] ?? t}</option>)}
        </select>
        <button onClick={load} style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', fontSize: '13px', color: 'var(--ink3)', cursor: 'pointer', fontWeight: 600 }}>Refresh</button>
      </div>

      {loading ? (
        <div style={{ padding: '64px', textAlign: 'center', color: 'var(--ink4)', fontSize: '15px' }}>Loading audit log…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '64px', textAlign: 'center', color: 'var(--ink4)', fontSize: '15px' }}>
          {rows.length === 0 ? 'No enrichment events yet. Run the LinkedIn Enricher or Email Verifier to start tracking field changes.' : 'No results match your filter.'}
        </div>
      ) : (
        <div style={{ padding: '20px' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
            {/* Table head */}
            <div style={{ display: 'grid', gridTemplateColumns: '180px 120px 140px 1fr 1fr 120px', padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--card)' }}>
              {['Contact', 'Tool', 'Field', 'Old Value', 'New Value', 'When'].map(h => (
                <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</div>
              ))}
            </div>

            {filtered.map((r, i) => {
              const ac    = ACTION_COLORS[r.action] ?? { color: 'var(--ink4)', bg: 'rgba(255,255,255,0.06)' }
              const label = TOOL_LABELS[r.source_tool] ?? r.source_tool
              return (
                <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '180px 120px 140px 1fr 1fr 120px', padding: '10px 20px', borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center' }}>

                  <div style={{ overflow: 'hidden' }}>
                    {r.contact_name
                      ? <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.contact_name}</div>
                      : <div style={{ fontSize: '12px', color: 'var(--ink4)' }}>—</div>
                    }
                  </div>

                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '6px', background: ac.bg, color: ac.color }}>{label}</span>
                  </div>

                  <div style={{ fontSize: '12px', color: 'var(--ink3)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.field_key}</div>

                  <div style={{ fontSize: '12px', color: 'var(--ink4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.old_value ?? '—'}
                  </div>

                  <div style={{ fontSize: '12px', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: r.new_value ? 500 : 400 }}>
                    {r.new_value ?? '—'}
                  </div>

                  <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>
                    {new Date(r.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}{' '}
                    {new Date(r.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </div>

                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
