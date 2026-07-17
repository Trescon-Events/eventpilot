'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { NotificationBell } from '@/app/components/NavBar'
import PageHeader from '@/app/components/PageHeader'

const TOOL_LABELS: Record<string, string> = {
  events:          'Events Hub',
  hr_portal:       'HR Portal',
  smart_data:      'Smart Data',
  brand_studio:    'Brand Studio',
  website_builder: 'Website Builder',
  content:         'Content Engine',
  intelligence:    'Intelligence',
  finance:         'Finance',
  other:           'General',
}

type Fix = {
  id: string
  tool: string
  review_type: string
  severity: string
  title: string
  description: string
  status: string
  resolved_at: string | null
  resolved_by_name: string | null
  created_at: string
  staff_name: string
  fix_response: { message: string; author_name: string; created_at: string } | null
}

function groupByMonth(fixes: Fix[]) {
  const map = new Map<string, Fix[]>()
  for (const f of fixes) {
    const d = new Date(f.resolved_at ?? f.created_at)
    const key = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(f)
  }
  return Array.from(map.entries())
}

export default function ChangelogPage() {
  const [fixes,   setFixes]   = useState<Fix[]>([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('all')

  useEffect(() => {
    fetch('/api/reviews/changelog')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setFixes(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const displayed = filter === 'all' ? fixes : fixes.filter(f => f.tool === filter)
  const grouped   = groupByMonth(displayed)
  const tools     = Array.from(new Set(fixes.map(f => f.tool)))

  const TYPE_ICON: Record<string, string> = {
    bug:         'B',
    not_working: '!',
    suggestion:  'S',
    improvement: '+',
  }
  // color is concatenated with a runtime alpha suffix below (`${tc.color}30`),
  // so it has to stay literal hex — kept equal to each family's bright token.
  const TYPE_COLOR: Record<string, { color: string; bg: string }> = {
    bug:         { color: '#F1667A', bg: 'var(--red-light)' },
    not_working: { color: '#FB923C', bg: 'var(--orange-light)' },
    suggestion:  { color: '#5AA9F2', bg: 'var(--info-light)' },
    improvement: { color: '#34D399', bg: 'var(--success-light)' },
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Platform Updates"
        title="What's Been Fixed"
        description="Every issue reported by the team — and what we did about it."
        actions={<NotificationBell />}
      />

      <div style={{ maxWidth: '820px', margin: '0 auto', padding: '36px 24px 80px' }}>

        {/* Stats */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '28px', flexWrap: 'wrap' }}>
          {[
            { label: 'Total Fixed',   value: fixes.length,                                          color: 'var(--success)' },
            { label: 'This Month',    value: fixes.filter(f => { const d = new Date(f.resolved_at ?? f.created_at); const n = new Date(); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear() }).length, color: 'var(--teal-mid)' },
            { label: 'With Response', value: fixes.filter(f => f.fix_response).length,              color: 'var(--info)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 20px', minWidth: '130px' }}>
              <div style={{ fontSize: '24px', fontWeight: 900, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '12px', color: 'var(--ink3)', fontWeight: 600, marginTop: '2px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filter */}
        {tools.length > 1 && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '24px' }}>
            {['all', ...tools].map(t => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                style={{
                  padding: '5px 12px', borderRadius: '20px', border: '1px solid var(--border)',
                  background: filter === t ? 'var(--teal-mid)' : 'var(--card)',
                  color: filter === t ? 'var(--teal-light)' : 'var(--ink3)',
                  fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {t === 'all' ? 'All' : TOOL_LABELS[t] ?? t}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--ink4)', fontSize: '14px' }}>Loading…</div>
        ) : displayed.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--ink4)' }}>
            <svg width="40" height="40" fill="none" stroke="var(--border)" strokeWidth="1.5" viewBox="0 0 24 24" style={{ display: 'block', margin: '0 auto 12px' }}>
              <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
            <div style={{ fontWeight: 700, color: 'var(--ink3)' }}>No fixes yet</div>
            <div style={{ fontSize: '13px', marginTop: '4px' }}>Resolved issues will appear here</div>
          </div>
        ) : grouped.map(([month, items]) => (
          <div key={month} style={{ marginBottom: '36px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              {month}
              <span style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
              <span style={{ fontWeight: 600, fontSize: '11px' }}>{items.length} fix{items.length !== 1 ? 'es' : ''}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {items.map(fix => {
                const tc = TYPE_COLOR[fix.review_type] ?? { color: '#7E93A1', bg: 'rgba(255,255,255,0.06)' }
                return (
                  <div key={fix.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
                    <div style={{ padding: '16px 18px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                      {/* Type badge */}
                      <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: tc.bg, border: `1px solid ${tc.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 900, color: tc.color }}>{TYPE_ICON[fix.review_type] ?? '?'}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', marginBottom: '4px' }}>{fix.title}</div>
                        <div style={{ fontSize: '12px', color: 'var(--ink3)', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          <span style={{ background: 'var(--border-light)', padding: '2px 8px', borderRadius: '5px', fontWeight: 600 }}>{TOOL_LABELS[fix.tool] ?? fix.tool}</span>
                          {fix.resolved_at && (
                            <span>Fixed {new Date(fix.resolved_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                          )}
                          {fix.resolved_by_name && (
                            <span>by <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{fix.resolved_by_name}</span></span>
                          )}
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px', background: 'var(--success-light)', color: 'var(--success)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {fix.status === 'wont_fix' ? "Won't Fix" : 'Resolved'}
                      </span>
                    </div>
                    {/* Fix response from team */}
                    {fix.fix_response && (
                      <div style={{ borderTop: '1px solid var(--border-light)', padding: '12px 18px', background: 'rgba(0,137,123,0.03)', display: 'flex', gap: '10px' }}>
                        <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: 'rgba(0,137,123,0.1)', border: '1px solid rgba(0,137,123,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg width="9" height="9" fill="none" stroke="var(--teal-mid)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '11px', color: 'var(--ink3)', marginBottom: '4px' }}>
                            <span style={{ fontWeight: 700, color: 'var(--teal-mid)' }}>{fix.fix_response.author_name}</span> · {new Date(fix.fix_response.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </div>
                          <div style={{ fontSize: '13px', color: 'var(--ink)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{fix.fix_response.message}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        <div style={{ marginTop: '48px', textAlign: 'center' }}>
          <Link href="/dashboard" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--teal-mid)', textDecoration: 'none' }}>
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
