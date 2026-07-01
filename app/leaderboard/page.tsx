'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import NavBar from '@/app/components/NavBar'

type Row = {
  rank:              number
  staff_id:          string
  name:              string
  department:        string | null
  office_id:         string | null
  score:             number
  completions_count: number
  delta:             number | null
}

type MeCard = {
  rank:              number | null
  score:             number
  completions_count: number
  delta:             number | null
  trend:             { week_start: string; rank: number; score: number }[]
}

type Payload = {
  week_start:   string
  week_end:     string
  top10:        Row[]
  me:           MeCard | null
  is_admin:     boolean
  total_ranked: number
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

function fmtRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  const s = new Date(start + 'T12:00:00Z').toLocaleDateString('en-GB', opts)
  const e = new Date(end   + 'T12:00:00Z').toLocaleDateString('en-GB', opts)
  return `${s} – ${e}`
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) return <span style={{ color: '#94A3B8', fontSize: 11, fontWeight: 600 }}>new</span>
  if (delta === 0)   return <span style={{ color: '#94A3B8', fontSize: 11, fontWeight: 600 }}>—</span>
  if (delta > 0)     return <span style={{ color: '#16A34A', fontSize: 11, fontWeight: 800 }}>▲ {delta}</span>
  return                <span style={{ color: '#DC2626', fontSize: 11, fontWeight: 800 }}>▼ {Math.abs(delta)}</span>
}

export default function LeaderboardPage() {
  const [data, setData]     = useState<Payload | null>(null)
  const [loading, setLoad]  = useState(true)
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/leaderboard', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setData(d)
        setLoad(false)
      })
      .catch(() => { setError('Failed to load leaderboard'); setLoad(false) })
  }, [])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F0F4F8' }}>
        <NavBar />
        <div style={{ padding: '80px 24px', textAlign: 'center', color: '#5B7080', fontFamily: 'var(--font-manrope)', fontSize: 15, fontWeight: 600 }}>
          Loading leaderboard…
        </div>
      </div>
    )
  }
  if (error || !data) {
    return (
      <div style={{ minHeight: '100vh', background: '#F0F4F8' }}>
        <NavBar />
        <div style={{ padding: '80px 24px', textAlign: 'center', color: '#DC2626', fontFamily: 'var(--font-manrope)', fontSize: 15, fontWeight: 600 }}>
          {error ?? 'No data'}
        </div>
      </div>
    )
  }

  const { top10, me, week_start, week_end, is_admin, total_ranked } = data

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4F8', fontFamily: 'var(--font-manrope)' }}>
      <NavBar />
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '32px 24px 48px' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#5B7080', marginBottom: 6 }}>
            Learning Leaderboard
          </div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: '#0F1923' }}>Week of {fmtRange(week_start, week_end)}</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: '#5B7080' }}>
            {total_ranked > 0 ? `${total_ranked} staff ranked · updated every Monday 07:00 IST` : 'Snapshot not yet generated for this week.'}
          </p>
        </div>

        {/* Personal card (staff only) */}
        {!is_admin && me && (
          <div style={{
            background: 'linear-gradient(135deg,#0F1923 0%,#00A5A3 100%)',
            borderRadius: 14, padding: '22px 26px', color: '#fff', marginBottom: 24,
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.65)', marginBottom: 6 }}>
              You this week
            </div>
            {me.rank != null ? (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 40, fontWeight: 900, lineHeight: 1 }}>#{me.rank}</div>
                  <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)' }}>
                    {me.score} pts · {me.completions_count} completed
                    {me.delta == null ? '' :
                     me.delta === 0 ? ' · same as last week' :
                     me.delta > 0 ? <> · <span style={{ color: '#C0F43C', fontWeight: 700 }}>up {me.delta} from last week</span></> :
                                     <> · <span style={{ color: '#FCA5A5' }}>down {Math.abs(me.delta)} from last week</span></>}
                  </div>
                </div>
                {me.trend.length >= 2 && (
                  <div style={{ marginTop: 16, display: 'flex', gap: 6, alignItems: 'flex-end', height: 40 }}>
                    {me.trend.map(t => {
                      const height = Math.max(6, 40 - Math.min(35, (t.rank - 1) * 2))
                      return (
                        <div key={t.week_start} style={{ flex: 1, textAlign: 'center' }}>
                          <div style={{ background: 'rgba(192,244,60,0.75)', height, borderRadius: 3, marginBottom: 4 }} title={`#${t.rank} · ${t.score}pts`} />
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>#{t.rank}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            ) : (
              <>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>No completions this week.</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>Complete any course to get on the board next Monday.</div>
              </>
            )}
          </div>
        )}

        {/* Top 10 card */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E8EEF4', overflow: 'hidden' }}>
          <div style={{ padding: '18px 24px 8px' }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#5B7080' }}>Top 10 · this week</div>
          </div>

          {top10.length === 0 ? (
            <div style={{ padding: '32px 24px', textAlign: 'center', color: '#5B7080', fontSize: 14 }}>
              No course completions this week yet. Will you be first next Monday?
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {top10.map(r => (
                  <tr key={r.staff_id} style={{ borderTop: '1px solid #F0F4F8' }}>
                    <td style={{ padding: '12px 14px', width: 44, textAlign: 'center', fontSize: 13, fontWeight: 900, color: '#0F1923' }}>#{r.rank}</td>
                    <td style={{ padding: '12px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#00A5A3', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>
                          {initials(r.name)}
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#0F1923', lineHeight: 1.2 }}>{r.name}</div>
                          {r.department && <div style={{ fontSize: 11, color: '#5B7080', marginTop: 2 }}>{r.department}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#0F1923' }}>{r.score} pts</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', width: 56 }}>
                      <DeltaBadge delta={r.delta} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p style={{ marginTop: 20, fontSize: 12, color: '#5B7080', textAlign: 'center' }}>
          Scoring — 100 pts per course completed · +30 if test score ≥ 90 · +20 for first-attempt pass · level bonus (Adoption +25 · Advanced +50). Ties broken by fewer attempts.
          <br />Admins are excluded from ranks — they steward the platform, not the leaderboard.
        </p>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <Link href="/dashboard" style={{ fontSize: 13, color: '#00695C', fontWeight: 700, textDecoration: 'none' }}>← Back to dashboard</Link>
        </div>
      </div>
    </div>
  )
}
