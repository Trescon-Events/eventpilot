'use client'

import { useState, use } from 'react'
import Link from 'next/link'

// ── Design tokens (matches execution flow) ────────────────────────────────────
const BG      = '#E8EEF4'
const SURFACE = '#FFFFFF'
const DARK    = '#0F1923'
const MUTED   = '#5B7080'
const BORDER  = '#DDE8EE'

// ── Types ─────────────────────────────────────────────────────────────────────
type Participant = {
  company_name: string
  official_domain: string | null
  company_website: string | null
  participant_type: string
  tier: string | null
  sponsorship_category: string | null
  confidence: number
  evidence: string[]
  extraction_method: string
  hq_location: string | null
  industry_sector: string | null
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
  scan_id: string | null
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

type ScanJob = {
  url: string
  status: 'pending' | 'running' | 'done' | 'failed'
  result: IntelResult | null
  error: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const TYPE_COLOR: Record<string, string> = {
  sponsor:            '#6366F1', exhibitor:          '#0EA5E9',
  partner:            '#10B981', media_partner:      '#F59E0B',
  knowledge_partner:  '#8B5CF6', supporter:          '#EC4899',
  technology_partner: '#14B8A6', other:              '#94A3B8',
}

const TIER_ORDER = ['platinum','diamond','gold','silver','bronze','strategic','associate','general']

function tierBadge(tier: string | null) {
  if (!tier || tier === 'null') return null
  const colors: Record<string, { bg: string; color: string }> = {
    platinum: { bg: '#E5E4E240', color: '#666' },
    diamond:  { bg: '#B9F2FF40', color: '#0284C7' },
    gold:     { bg: '#FFD70040', color: '#92400E' },
    silver:   { bg: '#C0C0C040', color: '#4B5563' },
    bronze:   { bg: '#CD7F3240', color: '#78350F' },
    strategic:{ bg: '#6366F118', color: '#6366F1' },
    associate:{ bg: '#0EA5E918', color: '#0EA5E9' },
    general:  { bg: '#94A3B818', color: '#64748B' },
  }
  const c = colors[tier] ?? { bg: '#6366F118', color: '#6366F1' }
  return (
    <span style={{ fontSize: '9px', fontWeight: 800, padding: '2px 7px', borderRadius: '5px', background: c.bg, color: c.color, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
      {tier}
    </span>
  )
}

function buildResearchHighlights(jobs: ScanJob[]): {
  totalCompanies: number
  topTypes: { type: string; count: number }[]
  topTiers: { tier: string; count: number }[]
  topIndustries: { sector: string; count: number }[]
  coverageByEvent: { name: string; count: number; url: string }[]
  keyPatterns: string[]
} {
  const allParticipants = jobs.filter(j => j.status === 'done').flatMap(j => j.result?.participants ?? [])
  const countMap = <T extends string>(items: T[]) => {
    const m: Record<string, number> = {}
    for (const x of items) if (x) m[x] = (m[x] ?? 0) + 1
    return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, count: v }))
  }

  const types   = countMap(allParticipants.map(p => p.participant_type))
  const tiers   = countMap(allParticipants.map(p => p.tier ?? '').filter(Boolean))
  const sectors = countMap(allParticipants.map(p => p.industry_sector ?? '').filter(Boolean))

  const coverageByEvent = jobs
    .filter(j => j.status === 'done' && j.result)
    .map(j => ({ name: j.result!.event.name ?? j.url, count: j.result!.participants.length, url: j.url }))

  const keyPatterns: string[] = []
  if (tiers.some(t => t.label === 'platinum' && t.count > 0)) keyPatterns.push('Tiered sponsorship detected (platinum/gold/silver structure)')
  if (types.some(t => t.label === 'media_partner' && t.count >= 3)) keyPatterns.push(`Strong media partner presence (${types.find(t => t.label === 'media_partner')?.count} partners)`)
  if (types.some(t => t.label === 'technology_partner' && t.count >= 3)) keyPatterns.push(`Heavy tech partner ecosystem (${types.find(t => t.label === 'technology_partner')?.count} companies)`)
  if (allParticipants.filter(p => p.confidence >= 0.85).length / allParticipants.length > 0.7) keyPatterns.push('High-confidence extraction — site uses explicit sponsor listings')

  return {
    totalCompanies: allParticipants.length,
    topTypes: types.slice(0, 5).map(t => ({ type: t.label, count: t.count })),
    topTiers: tiers.slice(0, 4).map(t => ({ tier: t.label, count: t.count })),
    topIndustries: sectors.slice(0, 5).map(s => ({ sector: s.label, count: s.count })),
    coverageByEvent,
    keyPatterns,
  }
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function MarketIntelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)

  const [urlsInput,   setUrlsInput]   = useState('')
  const [jobs,        setJobs]        = useState<ScanJob[]>([])
  const [running,     setRunning]     = useState(false)
  const [activeJob,   setActiveJob]   = useState<number | null>(null)
  const [phase,       setPhase]       = useState<string | null>(null)
  const [filterType,  setFilterType]  = useState('all')
  const [sortBy,      setSortBy]      = useState<'confidence' | 'tier' | 'type'>('confidence')
  const [tab,         setTab]         = useState<'companies' | 'highlights' | 'hypotheses'>('companies')

  async function runAll() {
    const urls = urlsInput.split('\n').map(l => l.trim()).filter(l => l.startsWith('http'))
    if (!urls.length) return

    const initialJobs: ScanJob[] = urls.map(url => ({ url, status: 'pending', result: null, error: null }))
    setJobs(initialJobs)
    setRunning(true)
    setTab('companies')

    for (let i = 0; i < initialJobs.length; i++) {
      setActiveJob(i)
      setJobs(prev => prev.map((j, idx) => idx === i ? { ...j, status: 'running' } : j))

      setPhase('Reconnaissance — studying website structure…')
      await new Promise(r => setTimeout(r, 800))
      setPhase('Hypothesis generation — scoring commercial page candidates…')
      await new Promise(r => setTimeout(r, 600))
      setPhase('Adaptive exploration — fetching commercial pages…')

      try {
        const res  = await fetch('/api/market-intel', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ url: initialJobs[i].url, event_id: eventId }),
        })
        const data = await res.json()

        setPhase('AI extraction — building intelligence output…')
        await new Promise(r => setTimeout(r, 400))

        if (!res.ok || data.error) {
          setJobs(prev => prev.map((j, idx) => idx === i ? { ...j, status: 'failed', error: data.error ?? 'Extraction failed' } : j))
        } else {
          setJobs(prev => prev.map((j, idx) => idx === i ? { ...j, status: 'done', result: data } : j))
        }
      } catch (e) {
        setJobs(prev => prev.map((j, idx) => idx === i ? { ...j, status: 'failed', error: String(e) } : j))
      }
    }

    setRunning(false)
    setActiveJob(null)
    setPhase(null)
    setTab('highlights')
  }

  // Collect all participants across all completed jobs
  const allParticipants = jobs
    .filter(j => j.status === 'done')
    .flatMap(j => (j.result?.participants ?? []).map(p => ({ ...p, _eventName: j.result?.event.name ?? j.url })))

  const allTypes = [...new Set(allParticipants.map(p => p.participant_type))]

  const filtered = allParticipants
    .filter(p => filterType === 'all' || p.participant_type === filterType)
    .sort((a, b) => {
      if (sortBy === 'confidence') return b.confidence - a.confidence
      if (sortBy === 'type')       return a.participant_type.localeCompare(b.participant_type)
      if (sortBy === 'tier') {
        return (TIER_ORDER.indexOf(a.tier ?? '') === -1 ? 99 : TIER_ORDER.indexOf(a.tier ?? '')) -
               (TIER_ORDER.indexOf(b.tier ?? '') === -1 ? 99 : TIER_ORDER.indexOf(b.tier ?? ''))
      }
      return 0
    })

  const allHypotheses = jobs.filter(j => j.status === 'done').flatMap(j =>
    (j.result?.hypotheses ?? []).map(h => ({ ...h, _eventName: j.result?.event.name ?? j.url }))
  )

  const doneJobs  = jobs.filter(j => j.status === 'done')
  const highlights = doneJobs.length > 0 ? buildResearchHighlights(jobs) : null

  const hasResults = allParticipants.length > 0

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ background: SURFACE, borderBottom: `1px solid ${BORDER}`, padding: '0 32px' }}>
        <div style={{ maxWidth: '1360px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '60px', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <Link href={`/admin/events/${eventId}/execution`} style={{ fontSize: '13px', color: MUTED, textDecoration: 'none', fontWeight: 600 }}>← Execution Flow</Link>
            <div style={{ width: '1px', height: '20px', background: BORDER }} />
            <div style={{ fontSize: '15px', fontWeight: 800, color: DARK }}>Market Intelligence</div>
            <div style={{ fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '8px', background: '#6366F118', color: '#6366F1' }}>AEIE · Adaptive Event Intelligence Engine</div>
          </div>
          <div style={{ fontSize: '11px', color: MUTED, fontWeight: 600 }}>Phase 2 · Marketing Brief Tool</div>
        </div>
      </div>

      <div style={{ maxWidth: '1360px', margin: '0 auto', padding: '28px 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '24px', alignItems: 'start' }}>

          {/* ── Left: Input + Jobs ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* URL input */}
            <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#6366F1', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '6px' }}>Event URLs — Mass Upload</div>
              <div style={{ fontSize: '12px', color: MUTED, marginBottom: '12px', lineHeight: 1.5 }}>
                Paste one URL per line. The engine will scan each site, extract all sponsors, partners and exhibitors, and save everything to your company database.
              </div>
              <textarea
                value={urlsInput}
                onChange={e => setUrlsInput(e.target.value)}
                placeholder={'https://worldaisummit.com\nhttps://websummit.com\nhttps://techinasia.com'}
                rows={7}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '9px', border: `1px solid ${BORDER}`, fontSize: '12px', fontFamily: 'monospace', outline: 'none', color: DARK, boxSizing: 'border-box', marginBottom: '10px', resize: 'vertical', lineHeight: 1.6 }}
              />
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', color: MUTED }}>
                  {urlsInput.split('\n').filter(l => l.trim().startsWith('http')).length} URL{urlsInput.split('\n').filter(l => l.trim().startsWith('http')).length !== 1 ? 's' : ''} queued
                </div>
              </div>
              <button onClick={runAll} disabled={running || !urlsInput.split('\n').some(l => l.trim().startsWith('http'))}
                style={{ width: '100%', padding: '11px', borderRadius: '10px', background: running ? BORDER : '#6366F1', color: running ? MUTED : '#FFFFFF', fontSize: '13px', fontWeight: 700, border: 'none', cursor: running ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {running ? `Scanning ${activeJob !== null ? activeJob + 1 : ''}/${jobs.length}…` : 'Run Intelligence Scan'}
              </button>
            </div>

            {/* Phase status */}
            {running && phase && (
              <div style={{ background: '#6366F108', border: '1px solid #6366F130', borderRadius: '12px', padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#6366F1' }} />
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#6366F1' }}>{phase}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {['Reconnaissance', 'Hypothesis Generation', 'Adaptive Exploration', 'AI Extraction', 'Entity Resolution'].map((step, i) => {
                    const labels = ['Reconnaissance', 'Hypothesis', 'Adaptive', 'AI extraction', 'Entity']
                    const active = i <= labels.findIndex(l => phase.toLowerCase().includes(l.toLowerCase()))
                    return (
                      <div key={step} style={{ fontSize: '11px', color: active ? '#6366F1' : '#C0C8D0', fontWeight: active ? 700 : 500 }}>
                        {active ? '✓' : '○'} {step}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Job queue */}
            {jobs.length > 0 && (
              <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '16px 18px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: MUTED, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px' }}>Scan Queue</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {jobs.map((job, i) => {
                    const statusColor = job.status === 'done' ? '#10B981' : job.status === 'failed' ? '#DC2626' : job.status === 'running' ? '#6366F1' : MUTED
                    const statusLabel = job.status === 'done' ? `✓ ${job.result?.participants?.length ?? 0} found` : job.status === 'failed' ? '✗ Failed' : job.status === 'running' ? '⟳ Scanning…' : '○ Pending'
                    const domain = (() => { try { return new URL(job.url).hostname.replace('www.', '') } catch { return job.url } })()
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: '8px', background: job.status === 'running' ? '#6366F108' : '#F8FAFC', border: `1px solid ${job.status === 'running' ? '#6366F130' : BORDER}` }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: DARK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{domain}</div>
                          {job.status === 'done' && job.result?.event?.name && (
                            <div style={{ fontSize: '10px', color: MUTED, marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.result.event.name}</div>
                          )}
                          {job.error && <div style={{ fontSize: '10px', color: '#DC2626', marginTop: '1px' }}>{job.error.slice(0, 60)}</div>}
                        </div>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: statusColor, flexShrink: 0, marginLeft: '8px' }}>{statusLabel}</div>
                      </div>
                    )
                  })}
                </div>
                {!running && doneJobs.length > 0 && (
                  <div style={{ marginTop: '12px', padding: '8px 10px', borderRadius: '8px', background: '#10B98108', border: '1px solid #10B98130', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#10B981' }}>All scans complete</span>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#10B981' }}>{allParticipants.length} companies extracted</span>
                  </div>
                )}
              </div>
            )}

            {/* How it works (only before first run) */}
            {jobs.length === 0 && (
              <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '16px 18px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: MUTED, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '12px' }}>How It Works</div>
                {[
                  ['Observe', 'Studies homepage structure, menus, navigation, URL patterns'],
                  ['Hypothesize', 'Scores sub-pages by commercial likelihood — sponsor pages, partner directories'],
                  ['Explore', 'Fetches up to 10 high-signal pages adaptively'],
                  ['Extract', 'AI reads all content, identifies every commercial participant with contact details'],
                  ['Save', 'All companies stored in your database — name, tier, domain, location, sector'],
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
          </div>

          {/* ── Right: Results ── */}
          <div>

            {/* Empty state */}
            {!running && !hasResults && jobs.length === 0 && (
              <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '60px 40px', textAlign: 'center' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔭</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: DARK, marginBottom: '8px' }}>Adaptive Event Intelligence Engine</div>
                <div style={{ fontSize: '13px', color: MUTED, maxWidth: '440px', margin: '0 auto', lineHeight: 1.6 }}>
                  Paste competitor or industry event URLs (one per line). The engine autonomously studies each site, extracts all sponsors, exhibitors and partners — with tiers, contact details and company profiles — and saves everything to your company database.
                </div>
              </div>
            )}

            {/* Running — scanning animation */}
            {running && !hasResults && (
              <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '60px 40px', textAlign: 'center' }}>
                <div style={{ fontSize: '28px', marginBottom: '12px' }}>🔭</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#6366F1', marginBottom: '6px' }}>Scanning in progress…</div>
                <div style={{ fontSize: '12px', color: MUTED }}>{phase}</div>
              </div>
            )}

            {/* Results */}
            {hasResults && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  {(['companies', 'highlights', 'hypotheses'] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)}
                      style={{ padding: '8px 16px', borderRadius: '8px', border: `1px solid ${tab === t ? '#6366F1' : BORDER}`, background: tab === t ? '#6366F1' : SURFACE, color: tab === t ? '#FFFFFF' : MUTED, fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                      {t === 'companies' ? `Companies (${allParticipants.length})` : t === 'highlights' ? 'Research Highlights' : `Hypotheses (${allHypotheses.length})`}
                    </button>
                  ))}
                  {running && (
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#6366F1', fontWeight: 700 }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#6366F1' }} /> Live — scanning {activeJob !== null ? activeJob + 1 : ''}
                    </div>
                  )}
                </div>

                {/* ── Companies tab ── */}
                {tab === 'companies' && (
                  <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '16px', overflow: 'hidden' }}>
                    {/* Filters */}
                    <div style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '1px', marginRight: '4px' }}>Type:</div>
                      {['all', ...allTypes].map(t => (
                        <button key={t} onClick={() => setFilterType(t)}
                          style={{ padding: '3px 11px', borderRadius: '12px', border: `1px solid ${filterType === t ? '#6366F1' : BORDER}`, background: filterType === t ? '#6366F118' : 'transparent', color: filterType === t ? '#6366F1' : MUTED, fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                          {t.replace(/_/g, ' ')}
                        </button>
                      ))}
                      <div style={{ flex: 1 }} />
                      {(['confidence', 'tier', 'type'] as const).map(s => (
                        <button key={s} onClick={() => setSortBy(s)}
                          style={{ padding: '3px 9px', borderRadius: '6px', border: `1px solid ${sortBy === s ? '#6366F1' : BORDER}`, background: sortBy === s ? '#6366F118' : 'transparent', color: sortBy === s ? '#6366F1' : MUTED, fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                          {s}
                        </button>
                      ))}
                    </div>

                    {/* Company cards grid */}
                    <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                      {filtered.map((p, i) => {
                        const tc = TYPE_COLOR[p.participant_type] ?? '#94A3B8'
                        const domain = p.official_domain ?? (p.company_website ? (() => { try { return new URL(p.company_website!).hostname.replace('www.', '') } catch { return p.company_website } })() : null)
                        return (
                          <div key={i} style={{ background: '#F8FAFC', border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '14px 16px', borderLeft: `3px solid ${tc}` }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                              <div style={{ fontWeight: 800, fontSize: '13px', color: DARK, lineHeight: 1.3 }}>{p.company_name}</div>
                              {tierBadge(p.tier)}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '5px', background: tc + '18', color: tc, textTransform: 'capitalize' }}>
                                {p.participant_type.replace(/_/g, ' ')}
                              </span>
                              {p.sponsorship_category && (
                                <span style={{ fontSize: '10px', color: MUTED, fontWeight: 600, textTransform: 'capitalize' }}>{p.sponsorship_category}</span>
                              )}
                            </div>
                            {domain && (
                              <a href={p.company_website ?? `https://${domain}`} target="_blank" rel="noreferrer"
                                style={{ display: 'block', marginTop: '7px', fontSize: '11px', color: '#6366F1', fontWeight: 600, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                ↗ {domain}
                              </a>
                            )}
                            {(p.hq_location || p.industry_sector) && (
                              <div style={{ marginTop: '5px', fontSize: '10px', color: MUTED }}>
                                {[p.industry_sector, p.hq_location].filter(Boolean).join(' · ')}
                              </div>
                            )}
                            <div style={{ marginTop: '5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <div style={{ width: '40px', height: '3px', background: '#E8EEF4', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${p.confidence * 100}%`, background: p.confidence >= 0.8 ? '#10B981' : p.confidence >= 0.6 ? '#D97706' : '#DC2626', borderRadius: '2px' }} />
                              </div>
                              <span style={{ fontSize: '9px', color: MUTED, fontWeight: 700 }}>{Math.round(p.confidence * 100)}%</span>
                              {jobs.length > 1 && (
                                <span style={{ fontSize: '9px', color: MUTED, marginLeft: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>· {p._eventName}</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                      {filtered.length === 0 && (
                        <div style={{ gridColumn: '1/-1', padding: '32px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No companies match this filter.</div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Research Highlights tab ── */}
                {tab === 'highlights' && highlights && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                    {/* Summary stat row */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px' }}>
                      {[
                        { label: 'Companies extracted', value: highlights.totalCompanies, color: '#6366F1' },
                        { label: 'Events scanned',      value: doneJobs.length,           color: '#10B981' },
                        { label: 'Unique types',         value: highlights.topTypes.length, color: '#F59E0B' },
                        { label: 'Tiers found',          value: highlights.topTiers.length, color: '#8B5CF6' },
                      ].map(s => (
                        <div key={s.label} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
                          <div style={{ fontSize: '28px', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
                          <div style={{ fontSize: '10px', color: MUTED, marginTop: '4px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Key patterns */}
                    {highlights.keyPatterns.length > 0 && (
                      <div style={{ background: '#6366F108', border: '1px solid #6366F130', borderRadius: '12px', padding: '16px 20px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: '#6366F1', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px' }}>Key Patterns Detected</div>
                        {highlights.keyPatterns.map((p, i) => (
                          <div key={i} style={{ fontSize: '13px', color: DARK, display: 'flex', gap: '8px', marginBottom: '6px' }}>
                            <span style={{ color: '#6366F1', fontWeight: 800 }}>→</span> {p}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Intelligence summaries per event */}
                    {doneJobs.map((job, i) => job.result && (
                      <div key={i} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '16px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: 800, color: '#6366F1', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px' }}>{job.result.event.industry}</div>
                            <div style={{ fontSize: '14px', fontWeight: 800, color: DARK }}>{job.result.event.name}</div>
                            <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px' }}>{job.result.event.location}{job.result.event.organizer ? ` · ${job.result.event.organizer}` : ''}</div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                            <div style={{ textAlign: 'center', background: '#6366F108', border: '1px solid #6366F130', borderRadius: '8px', padding: '8px 12px' }}>
                              <div style={{ fontSize: '18px', fontWeight: 900, color: '#6366F1', lineHeight: 1 }}>{job.result.participants.length}</div>
                              <div style={{ fontSize: '9px', color: MUTED, fontWeight: 700, textTransform: 'uppercase' }}>Companies</div>
                            </div>
                            <div style={{ textAlign: 'center', background: '#10B98108', border: '1px solid #10B98130', borderRadius: '8px', padding: '8px 12px' }}>
                              <div style={{ fontSize: '18px', fontWeight: 900, color: '#10B981', lineHeight: 1 }}>{job.result.crawl_summary.sub_pages_fetched + 1}</div>
                              <div style={{ fontSize: '9px', color: MUTED, fontWeight: 700, textTransform: 'uppercase' }}>Pages</div>
                            </div>
                          </div>
                        </div>
                        <div style={{ fontSize: '12px', color: DARK, lineHeight: 1.6, padding: '10px 12px', background: '#6366F106', borderRadius: '8px', borderLeft: '3px solid #6366F1' }}>
                          {job.result.intelligence_summary}
                        </div>
                        {/* Mini breakdown */}
                        <div style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {[...new Set(job.result.participants.map(p => p.participant_type))].map(type => {
                            const count = job.result!.participants.filter(p => p.participant_type === type).length
                            const tc = TYPE_COLOR[type] ?? '#94A3B8'
                            return (
                              <span key={type} style={{ fontSize: '10px', fontWeight: 700, padding: '2px 9px', borderRadius: '10px', background: tc + '18', color: tc, textTransform: 'capitalize' }}>
                                {type.replace(/_/g, ' ')} ({count})
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    ))}

                    {/* Coverage by event */}
                    {highlights.coverageByEvent.length > 1 && (
                      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '16px 20px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: MUTED, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '12px' }}>Coverage by Event</div>
                        {highlights.coverageByEvent.map((ev, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                            <div style={{ flex: 1, fontSize: '12px', fontWeight: 700, color: DARK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.name}</div>
                            <div style={{ width: '120px', height: '6px', background: '#E8EEF4', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${Math.min(100, (ev.count / Math.max(...highlights.coverageByEvent.map(e => e.count))) * 100)}%`, background: '#6366F1', borderRadius: '3px' }} />
                            </div>
                            <div style={{ fontSize: '12px', fontWeight: 800, color: '#6366F1', width: '36px', textAlign: 'right' }}>{ev.count}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Top participant types */}
                    {highlights.topTypes.length > 0 && (
                      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '16px 20px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: MUTED, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '12px' }}>Participation Type Breakdown</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {highlights.topTypes.map(({ type, count }) => {
                            const tc = TYPE_COLOR[type] ?? '#94A3B8'
                            const pct = Math.round((count / highlights.totalCompanies) * 100)
                            return (
                              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '100px', fontSize: '11px', fontWeight: 700, color: tc, textTransform: 'capitalize', flexShrink: 0 }}>{type.replace(/_/g, ' ')}</div>
                                <div style={{ flex: 1, height: '6px', background: '#E8EEF4', borderRadius: '3px', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${pct}%`, background: tc, borderRadius: '3px' }} />
                                </div>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: DARK, width: '48px', textAlign: 'right' }}>{count} ({pct}%)</div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Industries */}
                    {highlights.topIndustries.length > 0 && (
                      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '16px 20px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: MUTED, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px' }}>Industries Present</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {highlights.topIndustries.map(({ sector, count }) => (
                            <span key={sector} style={{ fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderRadius: '12px', background: '#6366F110', color: '#6366F1', border: '1px solid #6366F130', textTransform: 'capitalize' }}>
                              {sector} ({count})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Hypotheses tab ── */}
                {tab === 'hypotheses' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {allHypotheses.map((h, i) => (
                      <div key={i} style={{ background: SURFACE, border: `1px solid ${h.validated ? 'rgba(16,185,129,0.25)' : BORDER}`, borderRadius: '12px', padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '5px', background: h.validated ? '#10B98118' : '#DC262618', color: h.validated ? '#10B981' : '#DC2626' }}>
                            {h.validated ? 'Validated' : 'Not Found'}
                          </span>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: DARK }}>{h.hypothesis}</div>
                          {jobs.length > 1 && <span style={{ fontSize: '10px', color: MUTED, marginLeft: 'auto' }}>{h._eventName}</span>}
                        </div>
                        {h.finding && <div style={{ fontSize: '12px', color: MUTED, lineHeight: 1.5 }}>→ {h.finding}</div>}
                      </div>
                    ))}
                    {allHypotheses.length === 0 && (
                      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '32px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No hypotheses generated yet.</div>
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
