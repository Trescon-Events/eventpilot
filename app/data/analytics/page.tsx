'use client'

import { useState, useEffect } from 'react'

interface Analytics {
  totals: { contacts: number; companies: number; extractions: number; contacts_month: number }
  today:  { contacts: number; credits: number; jobs: number }
  top_users:      { email: string; count: number }[]
  tool_breakdown: { tool: string; count: number }[]
  recent_jobs:    any[]
}

const TOOL_LABELS: Record<string, string> = {
  linkedin_enricher: 'LinkedIn Enricher',
  smart_lookup:      'Smart Lookup',
  website_finder:    'Website Finder',
  lead_finder:       'Lead Finder',
  email_verifier:    'Email Verifier',
  manual:            'Manual',
}

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  complete: { color: 'var(--success)',  bg: 'rgba(52,211,153,0.1)' },
  failed:   { color: 'var(--red)',      bg: 'rgba(241,102,122,0.1)' },
  pending:  { color: 'var(--amber)',    bg: 'rgba(245,185,77,0.1)' },
  running:  { color: 'var(--teal-mid)', bg: 'rgba(90,169,242,0.1)' },
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '8px' }}>{label}</div>
      <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
      {sub && <div style={{ fontSize: '12px', color: 'var(--ink4)', marginTop: '6px' }}>{sub}</div>}
    </div>
  )
}

export default function AnalyticsPage() {
  const [data, setData]     = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/data/analytics').then(r => r.json()).then(d => { setData(d); setLoading(false) })
  }, [])

  if (loading || !data) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--surface)', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>Analytics</span>
        </div>
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--ink4)', fontSize: '15px' }}>Loading analytics…</div>
      </div>
    )
  }

  const maxToolCount = Math.max(...(data.tool_breakdown.map(t => t.count) ?? [1]))

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', fontFamily: 'system-ui, sans-serif' }}>
      {/* Page header */}
      <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <svg width="16" height="16" fill="none" stroke="var(--teal-mid)" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
          <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
        </svg>
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>Analytics</span>
        <span style={{ fontSize: '13px', color: 'var(--ink4)' }}>Platform usage and extraction stats</span>
      </div>

      <div style={{ padding: '24px', maxWidth: '1100px' }}>
        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
          <StatCard label="Total Contacts" value={data.totals.contacts} sub="All time" />
          <StatCard label="Total Companies" value={data.totals.companies} sub="All time" />
          <StatCard label="Contacts This Month" value={data.totals.contacts_month} sub="Last 30 days" />
          <StatCard label="Today's Additions" value={data.today.contacts} sub={`${data.today.jobs} jobs · ${data.today.credits.toFixed(0)} credits`} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
          {/* Tool Breakdown */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', marginBottom: '16px' }}>Contacts by Tool (30 days)</div>
            {data.tool_breakdown.length === 0 ? (
              <div style={{ color: 'var(--ink4)', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>No data yet</div>
            ) : data.tool_breakdown.map(t => (
              <div key={t.tool} style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{TOOL_LABELS[t.tool] ?? t.tool}</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{t.count.toLocaleString()}</span>
                </div>
                <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'var(--teal-mid)', borderRadius: '2px', width: `${(t.count / maxToolCount) * 100}%`, transition: 'width 0.5s' }} />
                </div>
              </div>
            ))}
          </div>

          {/* Top Contributors */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', marginBottom: '16px' }}>Top Contributors (30 days)</div>
            {data.top_users.length === 0 ? (
              <div style={{ color: 'var(--ink4)', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>No data yet</div>
            ) : data.top_users.map((u, i) => (
              <div key={u.email} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: i < data.top_users.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', flexShrink: 0 }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                </div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--teal-mid)' }}>{u.count.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Jobs */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>Recent Extraction Jobs</span>
          </div>
          {data.recent_jobs.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--ink4)', fontSize: '13px' }}>No extraction jobs yet.</div>
          ) : (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px 80px 80px 100px', padding: '10px 20px', background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
                {['Source', 'Tool', 'Status', 'Contacts', 'Credits', 'Date'].map(h => (
                  <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</div>
                ))}
              </div>
              {data.recent_jobs.map(job => {
                const sc = STATUS_COLORS[job.status] ?? { color: 'var(--ink3)', bg: 'rgba(255,255,255,0.06)' }
                return (
                  <div key={job.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px 80px 80px 100px', padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '13px', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.source_name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>{TOOL_LABELS[job.source_type] ?? job.source_type}</div>
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '8px', background: sc.bg, color: sc.color }}>
                        {job.status}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>{job.contacts_count ?? 0}</div>
                    <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>{job.credits_used ?? 0}</div>
                    <div style={{ fontSize: '12px', color: 'var(--ink4)' }}>{new Date(job.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
