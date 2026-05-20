'use client'

import { useState, use } from 'react'
import Link from 'next/link'

// ── Design tokens (matches execution flow) ────────────────────────────────────
const BG      = '#E8EEF4'
const SURFACE = '#FFFFFF'
const DARK    = '#0F1923'
const MUTED   = '#5B7080'
const BORDER  = '#DDE8EE'
const ACCENT  = '#C0F43C'

// ── Types ─────────────────────────────────────────────────────────────────────
type Participant = {
  company_name: string
  official_domain: string | null
  participant_type: string
  tier: string | null
  confidence: number
  evidence: string[]
  extraction_method: string
}

type SiteAnalysis = {
  site_type: string
  rendering_model: string
  commercial_structure: string
  terminology_used: string[]
  information_richness: string
  pages_analyzed: number
}

type EventMeta = {
  name: string
  edition: string | null
  industry: string
  location: string
  website: string
  organizer: string | null
}

type IntelResult = {
  event: EventMeta
  site_analysis: SiteAnalysis
  participants: Participant[]
  intelligence_summary: string
  hypotheses_generated: { url: string; reasoning: string; confidence: number }[]
  hypotheses: { hypothesis: string; validated: boolean; finding: string }[]
  crawl_summary: {
    homepage_analyzed: boolean
    sub_pages_fetched: number
    total_links_discovered: number
    total_participants_extracted: number
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const TIER_COLOR: Record<string, string> = {
  platinum: '#E5E4E2', diamond: '#B9F2FF', gold: '#FFD700',
  silver: '#C0C0C0', bronze: '#CD7F32', strategic: '#6366F1',
  associate: '#0EA5E9', general: '#94A3B8',
}

const TYPE_COLOR: Record<string, string> = {
  sponsor:            '#6366F1', exhibitor:          '#0EA5E9',
  partner:            '#10B981', media_partner:      '#F59E0B',
  knowledge_partner:  '#8B5CF6', supporter:          '#EC4899',
  technology_partner: '#14B8A6', other:              '#94A3B8',
}

function confidenceBar(score: number) {
  const color = score >= 0.8 ? '#16A34A' : score >= 0.6 ? '#D97706' : '#DC2626'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ width: '60px', height: '5px', background: '#E8EEF4', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${score * 100}%`, background: color, borderRadius: '3px' }} />
      </div>
      <span style={{ fontSize: '11px', fontWeight: 700, color }}>{Math.round(score * 100)}%</span>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function MarketIntelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)

  const [url,        setUrl]        = useState('')
  const [running,    setRunning]    = useState(false)
  const [phase,      setPhase]      = useState<string | null>(null)
  const [result,     setResult]     = useState<IntelResult | null>(null)
  const [error,      setError]      = useState<string | null>(null)
  const [sortBy,     setSortBy]     = useState<'confidence' | 'type' | 'tier'>('confidence')
  const [filterType, setFilterType] = useState<string>('all')
  const [tab,        setTab]        = useState<'participants' | 'analysis' | 'hypotheses'>('participants')
  const [history,    setHistory]    = useState<{ url: string; name: string; count: number; ts: string }[]>([])

  async function run() {
    if (!url.trim()) return
    setRunning(true)
    setResult(null)
    setError(null)

    // Simulate phase feedback
    setPhase('Reconnaissance — studying website structure…')
    await new Promise(r => setTimeout(r, 1200))
    setPhase('Hypothesis generation — scoring commercial page candidates…')
    await new Promise(r => setTimeout(r, 800))
    setPhase('Adaptive exploration — fetching commercial pages…')

    try {
      const res  = await fetch('/api/market-intel', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()

      if (!res.ok || data.error) {
        setError(data.error ?? 'Extraction failed')
        return
      }

      setPhase('Entity resolution — deduplicating and validating…')
      await new Promise(r => setTimeout(r, 600))
      setPhase('Confidence scoring — building intelligence output…')
      await new Promise(r => setTimeout(r, 400))

      setResult(data)
      setHistory(prev => [
        { url: url.trim(), name: data.event?.name ?? url, count: data.participants?.length ?? 0, ts: new Date().toLocaleTimeString() },
        ...prev.slice(0, 4),
      ])
    } catch (e) {
      setError(String(e))
    } finally {
      setRunning(false)
      setPhase(null)
    }
  }

  const participants = result?.participants ?? []
  const types        = [...new Set(participants.map(p => p.participant_type))]

  const filtered = participants
    .filter(p => filterType === 'all' || p.participant_type === filterType)
    .sort((a, b) => {
      if (sortBy === 'confidence') return b.confidence - a.confidence
      if (sortBy === 'type')       return a.participant_type.localeCompare(b.participant_type)
      if (sortBy === 'tier') {
        const order = ['platinum','diamond','gold','silver','bronze','strategic','associate','general']
        return (order.indexOf(a.tier ?? '') ?? 99) - (order.indexOf(b.tier ?? '') ?? 99)
      }
      return 0
    })

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ background: SURFACE, borderBottom: `1px solid ${BORDER}`, padding: '0 32px' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '60px', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <Link href={`/admin/events/${eventId}/execution`} style={{ fontSize: '13px', color: MUTED, textDecoration: 'none', fontWeight: 600 }}>← Execution Flow</Link>
            <div style={{ width: '1px', height: '20px', background: BORDER }} />
            <div style={{ fontSize: '15px', fontWeight: 800, color: DARK }}>Market Intelligence</div>
            <div style={{ fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '8px', background: '#6366F118', color: '#6366F1' }}>AEIE — Adaptive Event Intelligence</div>
          </div>
          <div style={{ fontSize: '11px', color: MUTED, fontWeight: 600 }}>Phase 2 · Marketing Brief Tool</div>
        </div>
      </div>

      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '28px 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', alignItems: 'start' }}>

          {/* ── Left: Input + History ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* URL input */}
            <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#6366F1', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '6px' }}>Target Event URL</div>
              <div style={{ fontSize: '12px', color: MUTED, marginBottom: '14px', lineHeight: 1.5 }}>
                Enter a competitor or industry event website. The engine will autonomously study its structure, locate commercial participants, and extract sponsor/partner intelligence.
              </div>
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !running && run()}
                placeholder="https://worldaisummit.com"
                style={{ width: '100%', padding: '10px 12px', borderRadius: '9px', border: `1px solid ${BORDER}`, fontSize: '13px', fontFamily: 'inherit', outline: 'none', color: DARK, boxSizing: 'border-box', marginBottom: '10px' }}
              />
              <button onClick={run} disabled={running || !url.trim()}
                style={{ width: '100%', padding: '11px', borderRadius: '10px', background: running ? BORDER : '#6366F1', color: running ? MUTED : '#FFFFFF', fontSize: '13px', fontWeight: 700, border: 'none', cursor: running ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {running ? 'Analysing…' : 'Run Intelligence Scan'}
              </button>
            </div>

            {/* Phase status */}
            {running && phase && (
              <div style={{ background: '#6366F108', border: '1px solid #6366F130', borderRadius: '12px', padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#6366F1', animation: 'pulse 1s infinite' }} />
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#6366F1' }}>{phase}</div>
                </div>
                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {['Reconnaissance', 'Hypothesis Generation', 'Adaptive Exploration', 'AI Extraction', 'Entity Resolution', 'Confidence Scoring'].map((step, i) => {
                    const phases = ['Reconnaissance', 'Hypothesis', 'Adaptive', 'Entity', 'Confidence']
                    const active = phases.some(p => phase.includes(p)) && i <= phases.findIndex(p => phase.includes(p))
                    return (
                      <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: active ? '#6366F1' : '#C0C8D0', fontWeight: active ? 700 : 500 }}>
                        <span>{active ? '✓' : '○'}</span>{step}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* How it works */}
            {!running && !result && (
              <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '16px 18px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: MUTED, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '12px' }}>How It Works</div>
                {[
                  ['Observe', 'Studies homepage structure, menus, navigation, URL patterns'],
                  ['Hypothesize', 'Scores sub-pages by commercial likelihood — sponsor pages, partner directories'],
                  ['Explore', 'Fetches up to 10 high-signal pages adaptively'],
                  ['Extract', 'AI reads all content, identifies every commercial participant'],
                  ['Validate', 'Deduplicates, normalizes, scores confidence per entity'],
                ].map(([title, desc]) => (
                  <div key={title} style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#6366F118', border: '1px solid #6366F130', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 800, color: '#6366F1', flexShrink: 0 }}>{title[0]}</div>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: DARK }}>{title}</div>
                      <div style={{ fontSize: '11px', color: MUTED, lineHeight: 1.4 }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Scan history */}
            {history.length > 0 && (
              <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '16px 18px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: MUTED, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px' }}>Recent Scans</div>
                {history.map((h, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < history.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: DARK }}>{h.name}</div>
                      <div style={{ fontSize: '10px', color: MUTED }}>{h.ts}</div>
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#6366F1' }}>{h.count} found</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Right: Results ── */}
          <div>
            {error && (
              <div style={{ background: '#DC262610', border: '1px solid #DC262630', borderRadius: '12px', padding: '16px 20px', color: '#DC2626', fontSize: '13px', fontWeight: 600 }}>
                {error}
              </div>
            )}

            {!running && !result && !error && (
              <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '60px 40px', textAlign: 'center' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔭</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: DARK, marginBottom: '8px' }}>Adaptive Event Intelligence Engine</div>
                <div style={{ fontSize: '13px', color: MUTED, maxWidth: '380px', margin: '0 auto', lineHeight: 1.6 }}>
                  Enter any competitor or industry event URL. The engine will autonomously study the site, form extraction hypotheses, and surface all sponsors, exhibitors, and partners — with confidence scoring and evidence trails.
                </div>
              </div>
            )}

            {result && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* Event card */}
                <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '20px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 800, color: '#6366F1', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '4px' }}>{result.event.industry}</div>
                      <div style={{ fontSize: '20px', fontWeight: 900, color: DARK, marginBottom: '4px' }}>{result.event.name}</div>
                      <div style={{ fontSize: '13px', color: MUTED }}>{result.event.location}{result.event.edition ? ` · ${result.event.edition}` : ''}{result.event.organizer ? ` · Organised by ${result.event.organizer}` : ''}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
                      <div style={{ textAlign: 'center', background: '#6366F108', border: '1px solid #6366F130', borderRadius: '10px', padding: '10px 16px' }}>
                        <div style={{ fontSize: '24px', fontWeight: 900, color: '#6366F1', lineHeight: 1 }}>{result.participants.length}</div>
                        <div style={{ fontSize: '10px', color: MUTED, marginTop: '2px', fontWeight: 700, textTransform: 'uppercase' }}>Participants</div>
                      </div>
                      <div style={{ textAlign: 'center', background: '#10B98108', border: '1px solid #10B98130', borderRadius: '10px', padding: '10px 16px' }}>
                        <div style={{ fontSize: '24px', fontWeight: 900, color: '#10B981', lineHeight: 1 }}>{result.crawl_summary.sub_pages_fetched + 1}</div>
                        <div style={{ fontSize: '10px', color: MUTED, marginTop: '2px', fontWeight: 700, textTransform: 'uppercase' }}>Pages scanned</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: '14px', padding: '12px 14px', background: '#6366F106', borderRadius: '9px', fontSize: '13px', color: DARK, lineHeight: 1.6, borderLeft: '3px solid #6366F1' }}>
                    <strong style={{ color: '#6366F1', fontWeight: 800 }}>Intelligence Summary:</strong> {result.intelligence_summary}
                  </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  {(['participants', 'analysis', 'hypotheses'] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)}
                      style={{ padding: '8px 16px', borderRadius: '8px', border: `1px solid ${tab === t ? '#6366F1' : BORDER}`, background: tab === t ? '#6366F1' : SURFACE, color: tab === t ? '#FFFFFF' : MUTED, fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                      {t === 'participants' ? `Participants (${result.participants.length})` : t === 'hypotheses' ? `Hypotheses (${result.hypotheses?.length ?? 0})` : 'Site Analysis'}
                    </button>
                  ))}
                </div>

                {/* Participants tab */}
                {tab === 'participants' && (
                  <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '16px', overflow: 'hidden' }}>
                    {/* Filters */}
                    <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '1px', marginRight: '4px' }}>Filter:</div>
                      {['all', ...types].map(t => (
                        <button key={t} onClick={() => setFilterType(t)}
                          style={{ padding: '4px 12px', borderRadius: '12px', border: `1px solid ${filterType === t ? '#6366F1' : BORDER}`, background: filterType === t ? '#6366F118' : 'transparent', color: filterType === t ? '#6366F1' : MUTED, fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                          {t.replace(/_/g, ' ')}
                        </button>
                      ))}
                      <div style={{ flex: 1 }} />
                      <div style={{ fontSize: '11px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '1px' }}>Sort:</div>
                      {(['confidence', 'type', 'tier'] as const).map(s => (
                        <button key={s} onClick={() => setSortBy(s)}
                          style={{ padding: '4px 10px', borderRadius: '8px', border: `1px solid ${sortBy === s ? '#6366F1' : BORDER}`, background: sortBy === s ? '#6366F118' : 'transparent', color: sortBy === s ? '#6366F1' : MUTED, fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                          {s}
                        </button>
                      ))}
                    </div>

                    {/* Table */}
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC' }}>
                          {['Company', 'Type', 'Tier', 'Confidence', 'Evidence'].map(h => (
                            <th key={h} style={{ padding: '10px 16px', fontSize: '10px', fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left', borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((p, i) => {
                          const tc = TYPE_COLOR[p.participant_type] ?? '#94A3B8'
                          const trc = p.tier ? (TIER_COLOR[p.tier] ?? '#E8EEF4') : null
                          return (
                            <tr key={i} style={{ borderBottom: `1px solid ${BORDER}` }}>
                              <td style={{ padding: '12px 16px' }}>
                                <div style={{ fontSize: '13px', fontWeight: 800, color: DARK }}>{p.company_name}</div>
                                {p.official_domain && (
                                  <div style={{ fontSize: '11px', color: '#6366F1', marginTop: '2px' }}>{p.official_domain}</div>
                                )}
                              </td>
                              <td style={{ padding: '12px 16px' }}>
                                <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', background: tc + '18', color: tc, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                                  {p.participant_type.replace(/_/g, ' ')}
                                </span>
                              </td>
                              <td style={{ padding: '12px 16px' }}>
                                {p.tier && trc ? (
                                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', background: trc + '40', color: DARK, textTransform: 'capitalize', whiteSpace: 'nowrap', border: `1px solid ${trc}60` }}>
                                    {p.tier}
                                  </span>
                                ) : <span style={{ color: '#C0C8D0', fontSize: '11px' }}>—</span>}
                              </td>
                              <td style={{ padding: '12px 16px' }}>
                                {confidenceBar(p.confidence)}
                                <div style={{ fontSize: '9px', color: MUTED, marginTop: '3px', textTransform: 'capitalize' }}>
                                  {p.extraction_method?.replace(/_/g, ' ')}
                                </div>
                              </td>
                              <td style={{ padding: '12px 16px', maxWidth: '260px' }}>
                                {p.evidence?.slice(0, 2).map((ev, ei) => (
                                  <div key={ei} style={{ fontSize: '11px', color: MUTED, lineHeight: 1.4 }}>· {ev}</div>
                                ))}
                              </td>
                            </tr>
                          )
                        })}
                        {filtered.length === 0 && (
                          <tr><td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No participants match this filter.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Site analysis tab */}
                {tab === 'analysis' && result.site_analysis && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {[
                      ['Site Type',         result.site_analysis.site_type],
                      ['Rendering Model',   result.site_analysis.rendering_model],
                      ['Info Richness',     result.site_analysis.information_richness],
                      ['Pages Analyzed',    String(result.site_analysis.pages_analyzed)],
                    ].map(([label, value]) => (
                      <div key={label} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '16px 18px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>{label}</div>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: DARK, textTransform: 'capitalize' }}>{value}</div>
                      </div>
                    ))}
                    <div style={{ gridColumn: '1/-1', background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '16px 18px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Commercial Structure</div>
                      <div style={{ fontSize: '13px', color: DARK, lineHeight: 1.6 }}>{result.site_analysis.commercial_structure}</div>
                    </div>
                    {result.site_analysis.terminology_used?.length > 0 && (
                      <div style={{ gridColumn: '1/-1', background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '16px 18px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>Terminology Detected</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {result.site_analysis.terminology_used.map(t => (
                            <span key={t} style={{ fontSize: '12px', fontWeight: 700, padding: '4px 12px', borderRadius: '12px', background: '#6366F110', color: '#6366F1', border: '1px solid #6366F130', textTransform: 'capitalize' }}>{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div style={{ gridColumn: '1/-1', background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '16px 18px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>Crawl Summary</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px' }}>
                        {[
                          ['Links discovered', result.crawl_summary.total_links_discovered],
                          ['Sub-pages fetched', result.crawl_summary.sub_pages_fetched],
                          ['Participants found', result.crawl_summary.total_participants_extracted],
                        ].map(([label, value]) => (
                          <div key={String(label)} style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '22px', fontWeight: 900, color: '#6366F1', lineHeight: 1 }}>{value}</div>
                            <div style={{ fontSize: '10px', color: MUTED, marginTop: '3px', fontWeight: 600 }}>{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Hypotheses tab */}
                {tab === 'hypotheses' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(result.hypotheses ?? []).map((h, i) => (
                      <div key={i} style={{ background: SURFACE, border: `1px solid ${h.validated ? 'rgba(16,185,129,0.25)' : BORDER}`, borderRadius: '12px', padding: '16px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', background: h.validated ? '#10B98118' : '#DC262618', color: h.validated ? '#10B981' : '#DC2626' }}>
                            {h.validated ? 'Validated' : 'Not Found'}
                          </span>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: DARK }}>{h.hypothesis}</div>
                        </div>
                        {h.finding && <div style={{ fontSize: '12px', color: MUTED, lineHeight: 1.5 }}>→ {h.finding}</div>}
                      </div>
                    ))}
                    {result.hypotheses_generated?.length > 0 && (
                      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '16px 18px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: MUTED, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px' }}>Pages Scored by Commercial Signal</div>
                        {result.hypotheses_generated.map((h, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < result.hypotheses_generated.length - 1 ? `1px solid ${BORDER}` : 'none', gap: '12px' }}>
                            <div style={{ fontSize: '12px', color: DARK, fontWeight: 600, wordBreak: 'break-all' }}>{h.url}</div>
                            {confidenceBar(h.confidence)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
