'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const NAV = [
  { label: 'Contacts', href: '/data' },
  { label: 'Companies', href: '/data/companies' },
  { label: 'Lead Finder', href: '/data/lead-finder' },
  { label: 'Tools', href: '/data/tools' },
  { label: 'Analytics', href: '/data/analytics', active: true },
]

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
  complete: { color: '#059669', bg: 'rgba(16,185,129,0.1)' },
  failed:   { color: '#DC2626', bg: 'rgba(239,68,68,0.1)' },
  pending:  { color: '#D97706', bg: 'rgba(245,158,11,0.1)' },
  running:  { color: '#2563EB', bg: 'rgba(37,99,235,0.1)' },
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '14px', padding: '20px' }}>
      <div style={{ fontSize: '11px', fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '8px' }}>{label}</div>
      <div style={{ fontSize: '28px', fontWeight: 800, color: '#0F1923', lineHeight: 1 }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
      {sub && <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '6px' }}>{sub}</div>}
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
      <div style={{ minHeight: '100vh', background: '#F8FAFB', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ background: '#FFFFFF', borderBottom: '1px solid #DDE8EE', padding: '0 24px', height: '56px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '15px', fontWeight: 800, color: '#0F1923' }}>Data Intelligence</span>
        </div>
        <div style={{ padding: '48px', textAlign: 'center', color: '#9CA3AF', fontSize: '14px' }}>Loading analytics…</div>
      </div>
    )
  }

  const maxToolCount = Math.max(...(data.tool_breakdown.map(t => t.count) ?? [1]))

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFB', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #DDE8EE', padding: '0 24px', height: '56px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="20" height="20" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
          <span style={{ fontSize: '15px', fontWeight: 800, color: '#0F1923' }}>Data Intelligence</span>
        </div>
        <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
          {NAV.map(tab => <Link key={tab.href} href={tab.href} style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: (tab as any).active ? 700 : 500, background: (tab as any).active ? 'rgba(0,165,163,0.1)' : 'transparent', color: (tab as any).active ? '#00A5A3' : '#6B7280', textDecoration: 'none' }}>{tab.label}</Link>)}
        </div>
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
          <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '20px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923', marginBottom: '16px' }}>Contacts by Tool (30 days)</div>
            {data.tool_breakdown.length === 0 ? (
              <div style={{ color: '#9CA3AF', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>No data yet</div>
            ) : data.tool_breakdown.map(t => (
              <div key={t.tool} style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', color: '#0F1923' }}>{TOOL_LABELS[t.tool] ?? t.tool}</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923' }}>{t.count.toLocaleString()}</span>
                </div>
                <div style={{ height: '6px', background: '#F3F4F6', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: '#00A5A3', borderRadius: '3px', width: `${(t.count / maxToolCount) * 100}%`, transition: 'width 0.5s' }} />
                </div>
              </div>
            ))}
          </div>

          {/* Top Contributors */}
          <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '20px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923', marginBottom: '16px' }}>Top Contributors (30 days)</div>
            {data.top_users.length === 0 ? (
              <div style={{ color: '#9CA3AF', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>No data yet</div>
            ) : data.top_users.map((u, i) => (
              <div key={u.email} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: i < data.top_users.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 800, color: '#6B7280', flexShrink: 0 }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F1923', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                </div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#00A5A3' }}>{u.count.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Jobs */}
        <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #DDE8EE' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923' }}>Recent Extraction Jobs</span>
          </div>
          {data.recent_jobs.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>No extraction jobs yet.</div>
          ) : (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px 80px 80px 100px', padding: '10px 20px', background: '#F8FAFB', borderBottom: '1px solid #DDE8EE' }}>
                {['Source', 'Tool', 'Status', 'Contacts', 'Credits', 'Date'].map(h => (
                  <div key={h} style={{ fontSize: '11px', fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</div>
                ))}
              </div>
              {data.recent_jobs.map(job => {
                const sc = STATUS_COLORS[job.status] ?? { color: '#6B7280', bg: '#F3F4F6' }
                return (
                  <div key={job.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px 80px 80px 100px', padding: '12px 20px', borderBottom: '1px solid #F3F4F6' }}>
                    <div style={{ fontSize: '13px', color: '#0F1923', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.source_name}</div>
                    <div style={{ fontSize: '12px', color: '#6B7280' }}>{TOOL_LABELS[job.source_type] ?? job.source_type}</div>
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '8px', background: sc.bg, color: sc.color }}>
                        {job.status}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F1923' }}>{job.contacts_count ?? 0}</div>
                    <div style={{ fontSize: '13px', color: '#6B7280' }}>{job.credits_used ?? 0}</div>
                    <div style={{ fontSize: '12px', color: '#9CA3AF' }}>{new Date(job.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</div>
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
