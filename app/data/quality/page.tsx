'use client'

import { useState, useEffect } from 'react'

interface QualityData {
  total:           number
  with_email:      number
  verified_emails: number
  duplicates:      number
  enrichment_rate: number
  fields:          { key: string; label: string; filled: number; total: number; pct: number }[]
  monthly_trend:   { month: string; count: number }[]
}

function pctColor(pct: number): string {
  if (pct >= 80) return '#34D399'
  if (pct >= 50) return '#FBBF24'
  return '#F87171'
}

export default function QualityPage() {
  const [data,    setData]    = useState<QualityData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/data/quality')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFB', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ background: '#FFFFFF', borderBottom: '1px solid #DDE8EE', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#0F1923' }}>Data Quality</span>
        </div>
        <div style={{ padding: '64px', textAlign: 'center', color: '#9CA3AF', fontSize: '15px' }}>Analysing contacts…</div>
      </div>
    )
  }

  if (!data || data.total === 0) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFB', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ background: '#FFFFFF', borderBottom: '1px solid #DDE8EE', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#0F1923' }}>Data Quality</span>
        </div>
        <div style={{ padding: '64px', textAlign: 'center', color: '#9CA3AF', fontSize: '15px' }}>No contacts in the database yet.</div>
      </div>
    )
  }

  const maxMonth = Math.max(...(data.monthly_trend.map(m => m.count)), 1)

  const statsRow = [
    { label: 'Total Contacts',   value: data.total.toLocaleString(),   sub: 'in database' },
    { label: 'Have Email',        value: `${Math.round((data.with_email / data.total) * 100)}%`, sub: `${data.with_email.toLocaleString()} contacts` },
    { label: 'Verified Emails',   value: data.verified_emails.toLocaleString(), sub: 'MillionVerifier confirmed' },
    { label: 'Enrichment Rate',   value: `${data.enrichment_rate}%`,   sub: '3+ key fields filled' },
    { label: 'Possible Dupes',    value: data.duplicates.toLocaleString(), sub: 'same email, multiple records' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFB', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #DDE8EE', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <svg width="16" height="16" fill="none" stroke="#00A5A3" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <span style={{ fontSize: '15px', fontWeight: 700, color: '#0F1923' }}>Data Quality</span>
        <span style={{ fontSize: '13px', color: '#9CA3AF' }}>Field completeness and enrichment health</span>
      </div>

      <div style={{ padding: '24px', maxWidth: '1100px' }}>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '24px' }}>
          {statsRow.map(s => (
            <div key={s.label} style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '14px', padding: '18px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '8px' }}>{s.label}</div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#0F1923', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '5px' }}>{s.sub}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>

          {/* Field completeness */}
          <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '20px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923', marginBottom: '16px' }}>Field Completeness</div>
            {data.fields
              .sort((a, b) => b.pct - a.pct)
              .map(f => (
                <div key={f.key} style={{ marginBottom: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span style={{ fontSize: '13px', color: '#6B7280' }}>{f.label}</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: pctColor(f.pct) }}>{f.pct}%</span>
                  </div>
                  <div style={{ height: '5px', background: '#F0F4F7', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: '3px',
                      background: pctColor(f.pct),
                      width: `${f.pct}%`,
                      transition: 'width 0.6s ease',
                    }} />
                  </div>
                  <div style={{ fontSize: '11px', color: '#C4CDD6', marginTop: '3px' }}>
                    {f.filled.toLocaleString()} of {f.total.toLocaleString()}
                  </div>
                </div>
              ))}
          </div>

          {/* Monthly trend */}
          <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '20px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923', marginBottom: '16px' }}>Monthly Additions (last 6 months)</div>
            {data.monthly_trend.length === 0 ? (
              <div style={{ color: '#9CA3AF', fontSize: '13px', textAlign: 'center', padding: '32px 0' }}>No data yet</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', height: '140px', paddingBottom: '20px' }}>
                {data.monthly_trend.map(m => {
                  const height = Math.round((m.count / maxMonth) * 100)
                  const label  = new Date(m.month + '-01').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
                  return (
                    <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%', justifyContent: 'flex-end' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: '#0F1923' }}>{m.count}</div>
                      <div style={{ width: '100%', background: '#00A5A3', borderRadius: '4px 4px 0 0', height: `${height}%`, minHeight: '4px', transition: 'height 0.5s' }} />
                      <div style={{ fontSize: '10px', color: '#9CA3AF', whiteSpace: 'nowrap' }}>{label}</div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Duplicate alert */}
            {data.duplicates > 0 && (
              <div style={{ marginTop: '16px', padding: '12px 14px', background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: '10px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <svg width="14" height="14" fill="none" stroke="#F87171" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: '1px' }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#F87171', marginBottom: '2px' }}>
                    {data.duplicates} possible duplicate{data.duplicates !== 1 ? 's' : ''} detected
                  </div>
                  <div style={{ fontSize: '12px', color: '#9CA3AF' }}>Multiple contacts share the same email address. Review in Contacts view.</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Coverage score */}
        <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923', marginBottom: '4px' }}>Overall Database Score</div>
          <div style={{ fontSize: '13px', color: '#9CA3AF', marginBottom: '20px' }}>Average completeness across all key fields</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            {(() => {
              const avg = Math.round(data.fields.reduce((sum, f) => sum + f.pct, 0) / data.fields.length)
              const color = pctColor(avg)
              return (
                <>
                  <div style={{ position: 'relative', width: '80px', height: '80px', flexShrink: 0 }}>
                    <svg width="80" height="80" viewBox="0 0 80 80">
                      <circle cx="40" cy="40" r="34" fill="none" stroke="#F0F4F7" strokeWidth="8"/>
                      <circle
                        cx="40" cy="40" r="34" fill="none" stroke={color} strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 34}`}
                        strokeDashoffset={`${2 * Math.PI * 34 * (1 - avg / 100)}`}
                        transform="rotate(-90 40 40)"
                        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                      />
                    </svg>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 800, color }}>
                      {avg}%
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#0F1923', marginBottom: '4px' }}>
                      {avg >= 80 ? 'Excellent' : avg >= 60 ? 'Good' : avg >= 40 ? 'Fair' : 'Needs Attention'}
                    </div>
                    <div style={{ fontSize: '13px', color: '#9CA3AF', lineHeight: 1.6 }}>
                      {avg >= 80
                        ? 'Your contact database is well-enriched and ready for outreach.'
                        : avg >= 60
                        ? 'Good coverage. Focus on filling in phone numbers and LinkedIn URLs.'
                        : avg >= 40
                        ? 'Consider running the LinkedIn Enricher to improve field coverage.'
                        : 'Database needs significant enrichment. Start with email verification and LinkedIn enrichment.'
                      }
                    </div>
                  </div>
                </>
              )
            })()}
          </div>
        </div>

      </div>
    </div>
  )
}
