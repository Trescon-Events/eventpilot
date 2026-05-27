'use client'

import { useState, use, useEffect, useCallback } from 'react'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import * as scanManager from '@/app/lib/scanManager'
import type { JobBatch, ManagerState, Participant, Speaker } from '@/app/lib/scanManager'

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG      = '#E8EEF4'
const SURFACE = '#FFFFFF'
const DARK    = '#0F1923'
const MUTED   = '#5B7080'
const BORDER  = '#DDE8EE'
const INDIGO  = '#6366F1'

const TYPE_COLOR: Record<string, string> = {
  sponsor: '#6366F1', exhibitor: '#0EA5E9', partner: '#10B981',
  media_partner: '#F59E0B', knowledge_partner: '#8B5CF6',
  supporter: '#EC4899', technology_partner: '#14B8A6', other: '#94A3B8',
}

const TIER_ORDER = ['platinum','diamond','gold','silver','bronze','strategic','associate','general']

function tierBadge(tier: string | null) {
  if (!tier || tier === 'null') return null
  const colors: Record<string, { bg: string; color: string }> = {
    platinum: { bg: '#E5E4E240', color: '#666' }, diamond: { bg: '#B9F2FF40', color: '#0284C7' },
    gold: { bg: '#FFD70040', color: '#92400E' },  silver: { bg: '#C0C0C040', color: '#4B5563' },
    bronze: { bg: '#CD7F3240', color: '#78350F' }, strategic: { bg: '#6366F118', color: INDIGO },
    associate: { bg: '#0EA5E918', color: '#0EA5E9' }, general: { bg: '#94A3B818', color: '#64748B' },
  }
  const c = colors[tier] ?? { bg: '#6366F118', color: INDIGO }
  return (
    <span style={{ fontSize: '9px', fontWeight: 800, padding: '2px 7px', borderRadius: '5px', background: c.bg, color: c.color, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
      {tier}
    </span>
  )
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'done' || status === 'complete' ? '#10B981'
    : status === 'failed' || status === 'cancelled' ? '#DC2626'
    : status === 'running' ? INDIGO
    : status === 'paused' ? '#F59E0B'
    : MUTED
  return <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
}

// ── Completed Jobs types (from DB) ────────────────────────────────────────────
type DbJob = {
  id: string; label: string; status: string; total_urls: number;
  completed_urls: number; failed_urls: number; participants_found: number;
  speakers_found: number; credits_gemini_calls: number; credits_firecrawl_pages: number;
  credits_jina_pages: number; partial_failures: unknown[]; created_at: string; completed_at: string | null;
}
type DbCompany = Record<string, unknown>
type DbSpeaker = Record<string, unknown>
type DbScan   = Record<string, unknown>

type JobDetail = { job: DbJob; scans: DbScan[]; companies: DbCompany[]; speakers: DbSpeaker[] }

// ── Main Component ────────────────────────────────────────────────────────────
export default function MarketIntelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)

  const [managerState, setManagerState] = useState<ManagerState>(() => scanManager.getState())
  const [urlsInput,    setUrlsInput]    = useState('')
  const [tab,          setTab]          = useState<'companies' | 'speakers' | 'highlights' | 'hypotheses' | 'completed'>('companies')
  const [filterType,   setFilterType]   = useState('all')
  const [sortBy,       setSortBy]       = useState<'confidence' | 'tier' | 'type'>('confidence')
  const [downloading,  setDownloading]  = useState(false)

  // Completed jobs state
  const [completedJobs,   setCompletedJobs]   = useState<DbJob[]>([])
  const [loadingCompleted, setLoadingCompleted] = useState(false)
  const [selectedJob,     setSelectedJob]     = useState<JobDetail | null>(null)
  const [loadingJobDetail, setLoadingJobDetail] = useState(false)

  // Duplicate URL modal
  type DupConfirm = { dupes: { url: string; scannedAt: string | null; companiesFound: number | null }[]; fresh: string[] }
  const [dupConfirm, setDupConfirm] = useState<DupConfirm | null>(null)

  // ── Subscribe to scanManager ───────────────────────────────────────────────
  useEffect(() => {
    scanManager.restoreSession()
    setManagerState(scanManager.getState())
    return scanManager.subscribe(setManagerState)
  }, [])

  // ── Load completed jobs when tab opens ────────────────────────────────────
  useEffect(() => {
    if (tab !== 'completed') return
    setLoadingCompleted(true)
    fetch(`/api/market-intel-jobs?event_id=${eventId}`)
      .then(r => r.json())
      .then(d => setCompletedJobs((d.jobs ?? []).filter((j: DbJob) => j.status === 'complete' || j.status === 'failed' || j.status === 'cancelled')))
      .catch(() => {})
      .finally(() => setLoadingCompleted(false))
  }, [tab, eventId])

  // ── Derive display data from active jobs ──────────────────────────────────
  const activeJobs = managerState.activeJobs.filter(j => j.eventId === eventId)

  const allParticipants: (Participant & { _eventName: string; _jobId: string })[] = activeJobs
    .flatMap(j => j.urlJobs
      .filter(u => u.status === 'done' && u.result)
      .flatMap(u => (u.result!.participants ?? []).map(p => ({
        ...p,
        _eventName: u.result!.event.name ?? u.url,
        _jobId: j.jobId,
      })))
    )

  const allSpeakers: (Speaker & { _eventName: string })[] = activeJobs
    .flatMap(j => j.urlJobs
      .filter(u => u.status === 'done' && u.result)
      .flatMap(u => (u.result!.speakers ?? []).map(s => ({
        ...s,
        _eventName: u.result!.event.name ?? u.url,
      })))
    )

  const allHypotheses = activeJobs
    .flatMap(j => j.urlJobs
      .filter(u => u.status === 'done' && u.result)
      .flatMap(u => (u.result!.hypotheses ?? []).map(h => ({ ...h, _eventName: u.result!.event.name ?? u.url })))
    )

  const allTypes = [...new Set(allParticipants.map(p => p.participant_type))]
  const filteredCompanies = allParticipants
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

  const isAnyRunning = activeJobs.some(j => j.status === 'running' || j.status === 'paused')
  const slotsAvailable = scanManager.getActiveJobCount() < 2

  // ── Check duplicates before running ──────────────────────────────────────
  async function checkAndRun() {
    const urls = urlsInput.split('\n').map(l => l.trim()).filter(l => l.startsWith('http'))
    if (!urls.length || !slotsAvailable) return
    const res  = await fetch(`/api/market-intel?event_id=${eventId}`)
    const data = await res.json()
    const scans: { source_url: string; completed_at: string | null; participants_found: number | null }[] = data.scans ?? []
    const scannedMap = new Map(scans.map(s => [s.source_url.toLowerCase().trim(), s]))
    const dupes = urls
      .filter(u => scannedMap.has(u.toLowerCase().trim()))
      .map(u => {
        const s = scannedMap.get(u.toLowerCase().trim())!
        return { url: u, scannedAt: s.completed_at, companiesFound: s.participants_found }
      })
    const fresh = urls.filter(u => !scannedMap.has(u.toLowerCase().trim()))
    if (dupes.length > 0) setDupConfirm({ dupes, fresh })
    else executeRun(urls, false)
  }

  async function executeRun(urls: string[], isFreshRescan: boolean) {
    setDupConfirm(null)
    if (!urls.length) return
    const jobId = await scanManager.startJob(urls, eventId)
    if (!jobId) {
      alert('A scan is already running. Wait for it to finish before starting a new one.')
    } else {
      setTab('companies')
      if (isFreshRescan) {
        // Pass rescan flag via label for now (API handles it per scan)
      }
    }
  }

  // ── Download Excel for all companies/speakers in session ──────────────────
  async function downloadAllExcel() {
    setDownloading(true)
    try {
      const res   = await fetch(`/api/market-intel?event_id=${eventId}`)
      const data  = await res.json()
      const companies: DbCompany[] = data.companies ?? []
      const speakers:  DbSpeaker[] = data.speakers  ?? []
      const scans:     DbScan[]    = data.scans     ?? []
      _writeExcel(companies, speakers, scans, `market-intel-${eventId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.xlsx`)
    } finally {
      setDownloading(false)
    }
  }

  function _writeExcel(companies: DbCompany[], speakers: DbSpeaker[], scans: DbScan[], filename: string) {
    const companyRows = companies.map(c => ({
      'Company Name':         c.company_name, 'Partner Type':         c.participant_type,
      'Tier':                 c.tier,         'Website':              c.company_website,
      'Company LinkedIn':     c.company_linkedin_url,
      'Description':          c.description,  'Domain':               c.official_domain,
      'HQ Location':          c.hq_location,  'HQ Country':           c.hq_country,
      'Industry':             c.industry_sector, 'Size':              c.company_size,
      'Contact Name':         c.contact_name, 'Contact Title':        c.contact_title,
      'Contact Email':        c.contact_email,'Contact LinkedIn':     c.contact_linkedin,
      'Confidence %':         c.confidence != null ? Math.round(Number(c.confidence) * 100) : '',
      'Extraction Method':    c.extraction_method, 'Source URL':      c.source_page_url,
      'Created At':           c.created_at,   'Modified At':          c.modified_at,
    }))
    const speakerRows = speakers.map(s => ({
      'Speaker Name':    s.speaker_name, 'Job Title':          s.job_title,
      'Company':         s.speaker_company, 'Company URL':     s.speaker_company_url,
      'LinkedIn URL':    s.linkedin_url, 'Confidence %':       s.confidence != null ? Math.round(Number(s.confidence) * 100) : '',
      'Source URL':      s.source_page_url,
      'Created At':      s.created_at,   'Modified At':        s.modified_at,
    }))
    const scanRows = scans.map(s => ({
      'Source URL': s.source_url, 'Status': s.status,
      'Companies Found': s.participants_found, 'Speakers Found': s.speakers_found,
      'Pages Scanned': s.pages_scanned, 'Started At': s.created_at, 'Completed At': s.completed_at,
      'Gemini Calls': s.credits_gemini_calls, 'Firecrawl Pages': s.credits_firecrawl_pages,
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(companyRows), 'Companies')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(speakerRows), 'Speakers')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(scanRows),    'Scans')
    XLSX.writeFile(wb, filename)
  }

  // ── Load completed job detail ─────────────────────────────────────────────
  async function loadJobDetail(jobId: string) {
    setLoadingJobDetail(true)
    setSelectedJob(null)
    try {
      const res  = await fetch(`/api/market-intel-jobs?job_id=${jobId}`)
      const data = await res.json()
      setSelectedJob(data)
    } finally {
      setLoadingJobDetail(false)
    }
  }

  const downloadJobExcel = useCallback((detail: JobDetail) => {
    const filename = `job-${detail.job.id.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.xlsx`
    _writeExcel(detail.companies, detail.speakers, detail.scans, filename)
  }, [])

  const sessionCr = managerState.sessionCredits
  const totalSessionCalls = sessionCr.gemini + sessionCr.firecrawl + sessionCr.jina

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Header ── */}
      <div style={{ background: SURFACE, borderBottom: `1px solid ${BORDER}`, padding: '0 32px', position: 'sticky', top: 0, zIndex: 200 }}>
        <div style={{ maxWidth: '1360px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {eventId === '__general__'
              ? <Link href="/admin/toolkit" style={{ fontSize: '13px', color: MUTED, textDecoration: 'none', fontWeight: 600 }}>← Toolkit</Link>
              : <Link href={`/admin/events/${eventId}/execution`} style={{ fontSize: '13px', color: MUTED, textDecoration: 'none', fontWeight: 600 }}>← Execution Flow</Link>
            }
            <div style={{ width: '1px', height: '20px', background: BORDER }} />
            <div style={{ fontSize: '15px', fontWeight: 800, color: DARK }}>
              {eventId === '__general__' ? 'General Research' : 'Market Intelligence'}
            </div>
            <div style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '8px', background: '#6366F118', color: INDIGO }}>AEIE · Adaptive Event Intelligence Engine</div>
          </div>
          <button onClick={downloadAllExcel} disabled={downloading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '8px', background: downloading ? BORDER : '#10B981', color: downloading ? MUTED : '#FFFFFF', fontSize: '12px', fontWeight: 700, border: 'none', cursor: downloading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v7M3.5 5.5l3 3 3-3M2 10h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            {downloading ? 'Preparing…' : 'Download All (Excel)'}
          </button>
        </div>
      </div>

      {/* ── Credit Counter Bar ── */}
      <div style={{ background: '#F8FAFF', borderBottom: `1px solid ${BORDER}`, padding: '0 32px', position: 'sticky', top: '56px', zIndex: 150 }}>
        <div style={{ maxWidth: '1360px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '20px', height: '34px' }}>
          <span style={{ fontSize: '10px', fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: '1px' }}>Session API Usage</span>
          <div style={{ width: '1px', height: '16px', background: BORDER }} />
          {[
            { label: 'Gemini calls',     value: sessionCr.gemini,    color: '#4F46E5' },
            { label: 'Firecrawl pages',  value: sessionCr.firecrawl, color: '#F59E0B' },
            { label: 'Jina pages',       value: sessionCr.jina,      color: '#10B981' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />
              <span style={{ fontSize: '11px', color: MUTED, fontWeight: 500 }}>{label}:</span>
              <span style={{ fontSize: '12px', fontWeight: 800, color: value > 0 ? color : MUTED }}>{value}</span>
            </div>
          ))}
          {totalSessionCalls > 0 && (
            <>
              <div style={{ width: '1px', height: '16px', background: BORDER }} />
              <span style={{ fontSize: '11px', color: MUTED }}>
                Total this session: <strong style={{ color: DARK }}>{totalSessionCalls}</strong>
              </span>
            </>
          )}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: '10px', color: MUTED, fontStyle: 'italic' }}>Session counts only — check provider dashboards for quota limits</span>
        </div>
      </div>

      <div style={{ maxWidth: '1360px', margin: '0 auto', padding: '24px 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '24px', alignItems: 'start' }}>

          {/* ── Left: Input + Running Jobs ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'sticky', top: '100px' }}>

            {/* URL input */}
            <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: INDIGO, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '6px' }}>Event URLs — Mass Upload</div>
              <div style={{ fontSize: '12px', color: MUTED, marginBottom: '12px', lineHeight: 1.5 }}>
                One URL per line. Extracts all sponsors, partners, exhibitors <em>and speakers</em> from each site.
              </div>
              <textarea
                value={urlsInput}
                onChange={e => setUrlsInput(e.target.value)}
                placeholder={'https://worldaisummit.com\nhttps://websummit.com'}
                rows={6}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '9px', border: `1px solid ${BORDER}`, fontSize: '12px', fontFamily: 'monospace', outline: 'none', color: DARK, boxSizing: 'border-box', marginBottom: '10px', resize: 'vertical', lineHeight: 1.6 }}
              />
              <div style={{ fontSize: '11px', color: MUTED, marginBottom: '8px' }}>
                {urlsInput.split('\n').filter(l => l.trim().startsWith('http')).length} URL{urlsInput.split('\n').filter(l => l.trim().startsWith('http')).length !== 1 ? 's' : ''} queued
              </div>
              {!slotsAvailable && (
                <div style={{ padding: '8px 12px', borderRadius: '8px', background: '#FEF9EC', border: '1px solid #F59E0B40', fontSize: '11px', color: '#92400E', marginBottom: '8px' }}>
                  Both job slots occupied. Wait for a job to finish.
                </div>
              )}
              <button onClick={checkAndRun}
                disabled={!slotsAvailable || !urlsInput.split('\n').some(l => l.trim().startsWith('http'))}
                style={{ width: '100%', padding: '11px', borderRadius: '10px', background: !slotsAvailable ? BORDER : INDIGO, color: !slotsAvailable ? MUTED : '#FFFFFF', fontSize: '13px', fontWeight: 700, border: 'none', cursor: !slotsAvailable ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {!slotsAvailable ? 'Job Slots Full' : 'Run Intelligence Scan'}
              </button>
            </div>

            {/* ── Running Jobs Panel ── */}
            {activeJobs.length > 0 && (
              <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '16px 18px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: MUTED, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981', display: 'inline-block', boxShadow: '0 0 0 2px rgba(16,185,129,0.2)' }} />
                  Running Jobs ({activeJobs.filter(j => j.status === 'running' || j.status === 'paused').length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {activeJobs.map(job => {
                    const doneCount   = job.urlJobs.filter(u => u.status === 'done').length
                    const failCount   = job.urlJobs.filter(u => u.status === 'failed').length
                    const totalUrls   = job.urlJobs.length
                    const currentUrl  = job.urlJobs.find(u => u.status === 'running')
                    const isRunning   = job.status === 'running'
                    const isPaused    = job.status === 'paused'
                    const isDone      = job.status === 'complete' || job.status === 'cancelled'

                    return (
                      <div key={job.jobId} style={{ borderRadius: '12px', border: `1px solid ${isRunning ? '#6366F130' : BORDER}`, background: isRunning ? '#6366F106' : '#F8FAFC', padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <StatusDot status={job.status} />
                            <span style={{ fontSize: '12px', fontWeight: 700, color: DARK }}>{job.label}</span>
                          </div>
                          <span style={{ fontSize: '10px', color: MUTED, fontWeight: 600 }}>{doneCount + failCount}/{totalUrls} done</span>
                        </div>

                        {/* Per-URL list */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
                          {job.urlJobs.map((u, i) => {
                            const domain = (() => { try { return new URL(u.url).hostname.replace('www.', '') } catch { return u.url } })()
                            const statusColor = u.status === 'done' ? '#10B981' : u.status === 'failed' ? '#DC2626' : u.status === 'running' ? INDIGO : MUTED
                            return (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <StatusDot status={u.status} />
                                <span style={{ fontSize: '11px', color: DARK, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{domain}</span>
                                {u.attempts > 1 && u.status === 'running' && (
                                  <span style={{ fontSize: '9px', color: '#F59E0B', fontWeight: 700 }}>retry {u.attempts}/3</span>
                                )}
                                {u.status === 'done' && (
                                  <span style={{ fontSize: '9px', color: '#10B981', fontWeight: 700 }}>
                                    {u.result?.participants?.length ?? 0}co +{u.result?.speakers?.length ?? 0}sp
                                  </span>
                                )}
                                {u.status === 'failed' && (
                                  <span style={{ fontSize: '9px', color: '#DC2626', fontWeight: 700, textTransform: 'capitalize' }}>{u.failureReason ?? 'failed'}</span>
                                )}
                              </div>
                            )
                          })}
                        </div>

                        {/* Current phase */}
                        {currentUrl?.phase && (
                          <div style={{ fontSize: '10px', color: INDIGO, fontWeight: 600, marginBottom: '8px', fontStyle: 'italic' }}>{currentUrl.phase}</div>
                        )}

                        {/* Credits for this job */}
                        <div style={{ fontSize: '10px', color: MUTED, marginBottom: '8px' }}>
                          Credits: Gemini {job.credits.gemini} · Firecrawl {job.credits.firecrawl} · Jina {job.credits.jina}
                        </div>

                        {/* Partial failures */}
                        {job.partialFailures.length > 0 && (
                          <div style={{ padding: '6px 9px', borderRadius: '6px', background: '#FEF9EC', border: '1px solid #F59E0B40', fontSize: '10px', color: '#92400E', marginBottom: '8px' }}>
                            {job.partialFailures.length} partial extraction issue{job.partialFailures.length !== 1 ? 's' : ''} — see Completed Jobs for details
                          </div>
                        )}

                        {/* Controls */}
                        {!isDone && (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {isRunning && (
                              <button onClick={() => scanManager.pauseJob(job.jobId)}
                                style={{ flex: 1, padding: '5px 0', borderRadius: '7px', border: '1px solid #F59E0B', background: '#FEF9EC', color: '#92400E', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                Pause
                              </button>
                            )}
                            {isPaused && (
                              <button onClick={() => scanManager.resumeJob(job.jobId)}
                                style={{ flex: 1, padding: '5px 0', borderRadius: '7px', border: '1px solid #10B981', background: '#F0FDF4', color: '#10B981', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                Resume
                              </button>
                            )}
                            <button onClick={() => scanManager.cancelJob(job.jobId)}
                              style={{ flex: 1, padding: '5px 0', borderRadius: '7px', border: '1px solid #DC262640', background: '#FFF1F2', color: '#DC2626', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                              Cancel
                            </button>
                          </div>
                        )}
                        {isDone && (
                          <div style={{ padding: '4px 8px', borderRadius: '6px', background: job.status === 'complete' ? '#F0FDF4' : '#F1F5F9', textAlign: 'center', fontSize: '10px', fontWeight: 700, color: job.status === 'complete' ? '#10B981' : MUTED }}>
                            {job.status === 'complete' ? `Complete — ${job.urlJobs.filter(u => u.status === 'done').reduce((s, u) => s + (u.result?.participants?.length ?? 0), 0)} companies, ${job.urlJobs.filter(u => u.status === 'done').reduce((s, u) => s + (u.result?.speakers?.length ?? 0), 0)} speakers` : 'Cancelled'}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* How it works (before first run) */}
            {activeJobs.length === 0 && (
              <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '16px 18px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: MUTED, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '12px' }}>How It Works</div>
                {[
                  ['Observe', 'Studies site structure, menus, sponsor/partner/speaker pages'],
                  ['Explore', 'Fetches commercial + speaker pages (up to 20 pages per site)'],
                  ['Extract', 'AI identifies all companies with roles, tiers, descriptions AND all named speakers with their profiles'],
                  ['Retry', 'Failed extractions are retried up to 3 times with alternate methods'],
                  ['Save', 'All data stored — run again anytime to update with modified date'],
                ].map(([title, desc]) => (
                  <div key={title} style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#6366F118', border: '1px solid #6366F130', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 800, color: INDIGO, flexShrink: 0 }}>{title[0]}</div>
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
            {activeJobs.length === 0 && allParticipants.length === 0 && (
              <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '60px 40px', textAlign: 'center' }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#6366F110', border: '1px solid #6366F130', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="10" cy="10" r="8" stroke={INDIGO} strokeWidth="1.5"/><path d="M17 17l3 3" stroke={INDIGO} strokeWidth="1.5" strokeLinecap="round"/></svg>
                </div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: DARK, marginBottom: '8px' }}>Adaptive Event Intelligence Engine</div>
                <div style={{ fontSize: '13px', color: MUTED, maxWidth: '440px', margin: '0 auto', lineHeight: 1.6 }}>
                  Paste competitor or industry event URLs. Extracts all sponsors, partners, exhibitors <strong>and speakers</strong> with full profiles, tiers, LinkedIn URLs, and descriptions.
                </div>
                <button onClick={() => setTab('completed')}
                  style={{ marginTop: '20px', padding: '8px 18px', borderRadius: '8px', border: `1px solid ${BORDER}`, background: 'transparent', color: MUTED, fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  View Completed Jobs
                </button>
              </div>
            )}

            {/* Tab bar + results */}
            {(allParticipants.length > 0 || allSpeakers.length > 0 || tab === 'completed') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {([
                    ['companies',  `Companies (${allParticipants.length})`],
                    ['speakers',   `Speakers (${allSpeakers.length})`],
                    ['highlights', 'Research Highlights'],
                    ['hypotheses', `Hypotheses (${allHypotheses.length})`],
                    ['completed',  'Completed Jobs'],
                  ] as [typeof tab, string][]).map(([t, label]) => (
                    <button key={t} onClick={() => setTab(t)}
                      style={{ padding: '8px 16px', borderRadius: '8px', border: `1px solid ${tab === t ? INDIGO : BORDER}`, background: tab === t ? INDIGO : SURFACE, color: tab === t ? '#FFFFFF' : MUTED, fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {label}
                    </button>
                  ))}
                  {isAnyRunning && (
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: INDIGO, fontWeight: 700 }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: INDIGO }} /> Scanning live
                    </div>
                  )}
                </div>

                {/* ── Companies tab ── */}
                {tab === 'companies' && (
                  <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '16px', overflow: 'hidden' }}>
                    <div style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '1px', marginRight: '4px' }}>Type:</div>
                      {['all', ...allTypes].map(t => (
                        <button key={t} onClick={() => setFilterType(t)}
                          style={{ padding: '3px 11px', borderRadius: '12px', border: `1px solid ${filterType === t ? INDIGO : BORDER}`, background: filterType === t ? '#6366F118' : 'transparent', color: filterType === t ? INDIGO : MUTED, fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                          {t.replace(/_/g, ' ')}
                        </button>
                      ))}
                      <div style={{ flex: 1 }} />
                      {(['confidence', 'tier', 'type'] as const).map(s => (
                        <button key={s} onClick={() => setSortBy(s)}
                          style={{ padding: '3px 9px', borderRadius: '6px', border: `1px solid ${sortBy === s ? INDIGO : BORDER}`, background: sortBy === s ? '#6366F118' : 'transparent', color: sortBy === s ? INDIGO : MUTED, fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                          {s}
                        </button>
                      ))}
                    </div>
                    <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '10px' }}>
                      {filteredCompanies.map((p, i) => {
                        const tc = TYPE_COLOR[p.participant_type] ?? '#94A3B8'
                        const domain = p.official_domain ?? (p.company_website ? (() => { try { return new URL(String(p.company_website)).hostname.replace('www.', '') } catch { return p.company_website } })() : null)
                        return (
                          <div key={i} style={{ background: '#F8FAFC', border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '14px 16px', borderLeft: `3px solid ${tc}` }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                              <div style={{ fontWeight: 800, fontSize: '13px', color: DARK, lineHeight: 1.3 }}>{p.company_name}</div>
                              {tierBadge(p.tier)}
                            </div>
                            {p.description && (
                              <div style={{ fontSize: '11px', color: MUTED, fontStyle: 'italic', marginBottom: '6px', lineHeight: 1.4 }}>{String(p.description)}</div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '5px', background: tc + '18', color: tc, textTransform: 'capitalize' }}>
                                {p.participant_type.replace(/_/g, ' ')}
                              </span>
                              {p.sponsorship_category && (
                                <span style={{ fontSize: '10px', color: MUTED, fontWeight: 600, textTransform: 'capitalize' }}>{String(p.sponsorship_category)}</span>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                              {domain && (
                                <a href={String(p.company_website ?? `https://${domain}`)} target="_blank" rel="noreferrer"
                                  style={{ fontSize: '11px', color: INDIGO, fontWeight: 600, textDecoration: 'none' }}>
                                  ↗ {String(domain)}
                                </a>
                              )}
                              {p.company_linkedin_url && (
                                <a href={String(p.company_linkedin_url)} target="_blank" rel="noreferrer"
                                  style={{ fontSize: '10px', color: '#0A66C2', fontWeight: 700, textDecoration: 'none', background: '#E8F0FE', padding: '2px 7px', borderRadius: '4px' }}>
                                  in
                                </a>
                              )}
                            </div>
                            {(p.hq_location || p.industry_sector) && (
                              <div style={{ marginTop: '5px', fontSize: '10px', color: MUTED }}>
                                {[String(p.industry_sector ?? ''), String(p.hq_location ?? '')].filter(Boolean).join(' · ')}
                              </div>
                            )}
                            <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <div style={{ width: '40px', height: '3px', background: '#E8EEF4', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${p.confidence * 100}%`, background: p.confidence >= 0.8 ? '#10B981' : p.confidence >= 0.6 ? '#D97706' : '#DC2626', borderRadius: '2px' }} />
                              </div>
                              <span style={{ fontSize: '9px', color: MUTED, fontWeight: 700 }}>{Math.round(p.confidence * 100)}%</span>
                            </div>
                          </div>
                        )
                      })}
                      {filteredCompanies.length === 0 && (
                        <div style={{ gridColumn: '1/-1', padding: '32px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No companies match this filter.</div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Speakers tab ── */}
                {tab === 'speakers' && (
                  <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '16px', overflow: 'hidden' }}>
                    <div style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: DARK }}>{allSpeakers.length} speaker{allSpeakers.length !== 1 ? 's' : ''} extracted</div>
                    </div>
                    {allSpeakers.length === 0 ? (
                      <div style={{ padding: '40px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>
                        No speakers extracted yet. Speaker data is extracted alongside company data during scans.
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '10px', padding: '16px 20px' }}>
                        {allSpeakers.map((s, i) => (
                          <div key={i} style={{ background: '#F8FAFC', border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '14px 16px', borderLeft: '3px solid #8B5CF6' }}>
                            <div style={{ fontWeight: 800, fontSize: '13px', color: DARK, marginBottom: '3px' }}>{s.speaker_name}</div>
                            {s.job_title && (
                              <div style={{ fontSize: '11px', color: MUTED, marginBottom: '4px' }}>{s.job_title}</div>
                            )}
                            {s.speaker_company && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                {s.speaker_company_url ? (
                                  <a href={s.speaker_company_url} target="_blank" rel="noreferrer"
                                    style={{ fontSize: '11px', color: INDIGO, fontWeight: 600, textDecoration: 'none' }}>
                                    ↗ {s.speaker_company}
                                  </a>
                                ) : (
                                  <span style={{ fontSize: '11px', color: DARK, fontWeight: 600 }}>{s.speaker_company}</span>
                                )}
                              </div>
                            )}
                            {s.linkedin_url && (
                              <a href={s.linkedin_url} target="_blank" rel="noreferrer"
                                style={{ display: 'inline-block', marginTop: '6px', fontSize: '10px', color: '#0A66C2', fontWeight: 700, textDecoration: 'none', background: '#E8F0FE', padding: '2px 7px', borderRadius: '4px' }}>
                                LinkedIn Profile
                              </a>
                            )}
                            <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <div style={{ width: '40px', height: '3px', background: '#E8EEF4', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${(s.confidence ?? 0) * 100}%`, background: '#8B5CF6', borderRadius: '2px' }} />
                              </div>
                              <span style={{ fontSize: '9px', color: MUTED, fontWeight: 700 }}>{Math.round((s.confidence ?? 0) * 100)}%</span>
                              <span style={{ fontSize: '9px', color: MUTED, marginLeft: '4px' }}>· {s._eventName}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Research Highlights tab ── */}
                {tab === 'highlights' && allParticipants.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px' }}>
                      {[
                        { label: 'Companies',   value: allParticipants.length, color: INDIGO },
                        { label: 'Speakers',    value: allSpeakers.length,     color: '#8B5CF6' },
                        { label: 'Events done', value: activeJobs.flatMap(j => j.urlJobs).filter(u => u.status === 'done').length, color: '#10B981' },
                        { label: 'Unique types', value: [...new Set(allParticipants.map(p => p.participant_type))].length, color: '#F59E0B' },
                      ].map(s => (
                        <div key={s.label} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
                          <div style={{ fontSize: '28px', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
                          <div style={{ fontSize: '10px', color: MUTED, marginTop: '4px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                    {activeJobs.flatMap(j => j.urlJobs).filter(u => u.status === 'done').map((u, i) => u.result && (
                      <div key={i} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '16px 20px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: DARK, marginBottom: '4px' }}>{u.result.event.name}</div>
                        <div style={{ fontSize: '11px', color: MUTED, marginBottom: '10px' }}>{u.result.event.location} · {u.result.event.industry}</div>
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                          <div style={{ textAlign: 'center', background: '#6366F108', border: '1px solid #6366F130', borderRadius: '8px', padding: '8px 14px' }}>
                            <div style={{ fontSize: '20px', fontWeight: 900, color: INDIGO }}>{u.result.participants.length}</div>
                            <div style={{ fontSize: '9px', color: MUTED, fontWeight: 700, textTransform: 'uppercase' }}>Companies</div>
                          </div>
                          <div style={{ textAlign: 'center', background: '#8B5CF618', border: '1px solid #8B5CF630', borderRadius: '8px', padding: '8px 14px' }}>
                            <div style={{ fontSize: '20px', fontWeight: 900, color: '#8B5CF6' }}>{u.result.speakers?.length ?? 0}</div>
                            <div style={{ fontSize: '9px', color: MUTED, fontWeight: 700, textTransform: 'uppercase' }}>Speakers</div>
                          </div>
                          <div style={{ textAlign: 'center', background: '#10B98108', border: '1px solid #10B98130', borderRadius: '8px', padding: '8px 14px' }}>
                            <div style={{ fontSize: '20px', fontWeight: 900, color: '#10B981' }}>{u.result.crawl_summary.sub_pages_fetched + 1}</div>
                            <div style={{ fontSize: '9px', color: MUTED, fontWeight: 700, textTransform: 'uppercase' }}>Pages</div>
                          </div>
                        </div>
                        <div style={{ fontSize: '12px', color: DARK, lineHeight: 1.6, padding: '10px 12px', background: '#6366F106', borderRadius: '8px', borderLeft: `3px solid ${INDIGO}` }}>
                          {u.result.intelligence_summary}
                        </div>
                      </div>
                    ))}
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
                          <span style={{ fontSize: '10px', color: MUTED, marginLeft: 'auto' }}>{h._eventName}</span>
                        </div>
                        {h.finding && <div style={{ fontSize: '12px', color: MUTED, lineHeight: 1.5 }}>→ {h.finding}</div>}
                      </div>
                    ))}
                    {allHypotheses.length === 0 && (
                      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '32px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No hypotheses yet.</div>
                    )}
                  </div>
                )}

                {/* ── Completed Jobs tab ── */}
                {tab === 'completed' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {selectedJob ? (
                      /* Job Detail View */
                      <div>
                        <button onClick={() => setSelectedJob(null)}
                          style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '8px', border: `1px solid ${BORDER}`, background: SURFACE, color: MUTED, fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          ← Back to Jobs
                        </button>
                        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '24px' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', gap: '16px' }}>
                            <div>
                              <div style={{ fontSize: '16px', fontWeight: 800, color: DARK, marginBottom: '4px' }}>{selectedJob.job.label}</div>
                              <div style={{ fontSize: '12px', color: MUTED }}>
                                Started {new Date(selectedJob.job.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                {selectedJob.job.completed_at && ` · Completed ${new Date(selectedJob.job.completed_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                              </div>
                            </div>
                            <button onClick={() => downloadJobExcel(selectedJob)}
                              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', background: '#10B981', color: '#FFFFFF', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                              <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v7M3.5 5.5l3 3 3-3M2 10h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              Download CSV
                            </button>
                          </div>

                          {/* Stats grid */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
                            {[
                              { label: 'URLs Scanned',  value: `${selectedJob.job.completed_urls}/${selectedJob.job.total_urls}`, color: INDIGO },
                              { label: 'Companies',     value: selectedJob.job.participants_found, color: '#10B981' },
                              { label: 'Speakers',      value: selectedJob.job.speakers_found,     color: '#8B5CF6' },
                              { label: 'Failed URLs',   value: selectedJob.job.failed_urls,        color: selectedJob.job.failed_urls > 0 ? '#DC2626' : MUTED },
                            ].map(s => (
                              <div key={s.label} style={{ background: '#F8FAFC', border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                                <div style={{ fontSize: '24px', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
                                <div style={{ fontSize: '10px', color: MUTED, marginTop: '4px', fontWeight: 700, textTransform: 'uppercase' }}>{s.label}</div>
                              </div>
                            ))}
                          </div>

                          {/* Credits breakdown */}
                          <div style={{ background: '#F8FAFF', border: '1px solid #E0E7FF', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 800, color: INDIGO, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>API Credits Used in This Job</div>
                            <div style={{ display: 'flex', gap: '20px' }}>
                              {[
                                { label: 'Gemini calls',    value: selectedJob.job.credits_gemini_calls,    color: '#4F46E5' },
                                { label: 'Firecrawl pages', value: selectedJob.job.credits_firecrawl_pages, color: '#F59E0B' },
                                { label: 'Jina pages',      value: selectedJob.job.credits_jina_pages,      color: '#10B981' },
                              ].map(({ label, value, color }) => (
                                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
                                  <span style={{ fontSize: '12px', color: MUTED }}>{label}:</span>
                                  <span style={{ fontSize: '13px', fontWeight: 800, color }}>{value}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Partial failures */}
                          {Array.isArray(selectedJob.job.partial_failures) && selectedJob.job.partial_failures.length > 0 && (
                            <div style={{ background: '#FEF9EC', border: '1px solid #F59E0B40', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
                              <div style={{ fontSize: '11px', fontWeight: 800, color: '#92400E', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>Partial Extraction Issues</div>
                              {(selectedJob.job.partial_failures as { url?: string; type: string; reason: string; potential?: number; extracted?: number }[]).map((f, i) => (
                                <div key={i} style={{ fontSize: '12px', color: '#78350F', marginBottom: '4px', lineHeight: 1.5 }}>
                                  {f.url && <strong>{(() => { try { return new URL(f.url).hostname } catch { return f.url } })()}: </strong>}
                                  {f.reason}
                                  {f.potential != null && f.extracted != null && f.potential !== f.extracted && ` (${f.potential} detected, ${f.extracted} extracted)`}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Per-scan list */}
                          {selectedJob.scans.length > 0 && (
                            <div style={{ marginBottom: '20px' }}>
                              <div style={{ fontSize: '11px', fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>URL Results</div>
                              {selectedJob.scans.map((scan, i) => {
                                const s = scan as Record<string, unknown>
                                const domain = (() => { try { return new URL(String(s.source_url)).hostname.replace('www.', '') } catch { return String(s.source_url) } })()
                                return (
                                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '8px', background: '#F8FAFC', border: `1px solid ${BORDER}`, marginBottom: '4px' }}>
                                    <StatusDot status={String(s.status) === 'complete' ? 'done' : String(s.status)} />
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: DARK, flex: 1 }}>{domain}</span>
                                    <span style={{ fontSize: '11px', color: MUTED }}>{String(s.participants_found ?? 0)} co · {String(s.speakers_found ?? 0)} sp</span>
                                    <span style={{ fontSize: '11px', color: MUTED }}>{String(s.pages_scanned ?? 0)} pages</span>
                                  </div>
                                )
                              })}
                            </div>
                          )}

                          {/* Preview: companies */}
                          {selectedJob.companies.length > 0 && (
                            <div style={{ marginBottom: '20px' }}>
                              <div style={{ fontSize: '11px', fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>
                                Companies Preview (first {Math.min(10, selectedJob.companies.length)} of {selectedJob.companies.length})
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px' }}>
                                {selectedJob.companies.slice(0, 10).map((c, i) => {
                                  const co = c as Record<string, unknown>
                                  const tc = TYPE_COLOR[String(co.participant_type ?? '')] ?? '#94A3B8'
                                  return (
                                    <div key={i} style={{ background: '#F8FAFC', border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '12px 14px', borderLeft: `3px solid ${tc}` }}>
                                      <div style={{ fontWeight: 700, fontSize: '12px', color: DARK }}>{String(co.company_name)}</div>
                                      {co.description != null && <div style={{ fontSize: '10px', color: MUTED, fontStyle: 'italic', marginTop: '2px' }}>{String(co.description)}</div>}
                                      <div style={{ fontSize: '10px', color: tc, fontWeight: 700, textTransform: 'capitalize', marginTop: '4px' }}>{String(co.participant_type ?? '').replace(/_/g, ' ')}</div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}

                          {/* Preview: speakers */}
                          {selectedJob.speakers.length > 0 && (
                            <div>
                              <div style={{ fontSize: '11px', fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>
                                Speakers Preview (first {Math.min(10, selectedJob.speakers.length)} of {selectedJob.speakers.length})
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px' }}>
                                {selectedJob.speakers.slice(0, 10).map((s, i) => {
                                  const sp = s as Record<string, unknown>
                                  return (
                                    <div key={i} style={{ background: '#F8FAFC', border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '12px 14px', borderLeft: '3px solid #8B5CF6' }}>
                                      <div style={{ fontWeight: 700, fontSize: '12px', color: DARK }}>{String(sp.speaker_name)}</div>
                                      {sp.job_title != null && <div style={{ fontSize: '10px', color: MUTED, marginTop: '2px' }}>{String(sp.job_title)}</div>}
                                      {sp.speaker_company != null && <div style={{ fontSize: '10px', color: DARK, fontWeight: 600, marginTop: '2px' }}>{String(sp.speaker_company)}</div>}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Completed Jobs List */
                      <>
                        {loadingCompleted && (
                          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '32px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>Loading completed jobs…</div>
                        )}
                        {!loadingCompleted && completedJobs.length === 0 && (
                          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '40px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>
                            No completed jobs for this event yet.
                          </div>
                        )}
                        {completedJobs.map(job => (
                          <div key={job.id}
                            onClick={() => loadJobDetail(job.id)}
                            style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '16px 20px', cursor: 'pointer', transition: 'border-color 0.15s' }}
                            onMouseOver={e => (e.currentTarget.style.borderColor = INDIGO)}
                            onMouseOut={e  => (e.currentTarget.style.borderColor = BORDER)}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                  <StatusDot status={job.status === 'complete' ? 'done' : job.status} />
                                  <span style={{ fontSize: '14px', fontWeight: 800, color: DARK }}>{job.label}</span>
                                  {job.failed_urls > 0 && (
                                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', background: '#FFF1F2', color: '#DC2626', border: '1px solid #FCA5A5' }}>
                                      {job.failed_urls} failed
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: '11px', color: MUTED }}>
                                  {new Date(job.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                  {' · '}{job.completed_urls}/{job.total_urls} URLs
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: '12px', flexShrink: 0 }}>
                                <div style={{ textAlign: 'center' }}>
                                  <div style={{ fontSize: '18px', fontWeight: 900, color: INDIGO, lineHeight: 1 }}>{job.participants_found}</div>
                                  <div style={{ fontSize: '9px', color: MUTED, fontWeight: 700, textTransform: 'uppercase' }}>Companies</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                  <div style={{ fontSize: '18px', fontWeight: 900, color: '#8B5CF6', lineHeight: 1 }}>{job.speakers_found}</div>
                                  <div style={{ fontSize: '9px', color: MUTED, fontWeight: 700, textTransform: 'uppercase' }}>Speakers</div>
                                </div>
                              </div>
                            </div>
                            {Array.isArray(job.partial_failures) && job.partial_failures.length > 0 && (
                              <div style={{ marginTop: '8px', fontSize: '11px', color: '#92400E', background: '#FEF9EC', border: '1px solid #F59E0B40', borderRadius: '6px', padding: '5px 10px' }}>
                                {job.partial_failures.length} partial extraction issue{job.partial_failures.length !== 1 ? 's' : ''} — click to view details
                              </div>
                            )}
                            <div style={{ marginTop: '8px', fontSize: '10px', color: MUTED }}>
                              Credits: Gemini {job.credits_gemini_calls} · Firecrawl {job.credits_firecrawl_pages} · Jina {job.credits_jina_pages}
                            </div>
                          </div>
                        ))}
                        {loadingJobDetail && (
                          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '32px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>Loading job details…</div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Duplicate URL Confirmation Modal ── */}
      {dupConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,25,35,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ background: SURFACE, borderRadius: '18px', padding: '28px 32px', maxWidth: '540px', width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: '18px', fontWeight: 900, color: DARK, marginBottom: '6px' }}>These URLs were already scanned</div>
            <div style={{ fontSize: '13px', color: MUTED, marginBottom: '20px', lineHeight: 1.5 }}>
              {dupConfirm.dupes.length} URL{dupConfirm.dupes.length !== 1 ? 's' : ''} already scanned. Re-running will update existing records with a modified date.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '22px' }}>
              {dupConfirm.dupes.map((d, i) => {
                const domain = (() => { try { return new URL(d.url).hostname.replace('www.', '') } catch { return d.url } })()
                const when   = d.scannedAt ? new Date(d.scannedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Unknown date'
                return (
                  <div key={i} style={{ padding: '10px 14px', borderRadius: '10px', background: '#FEF9EC', border: '1px solid #F59E0B40' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: DARK }}>{domain}</div>
                    <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px' }}>
                      Last scanned {when}{d.companiesFound != null ? ` · ${d.companiesFound} companies found` : ''}
                    </div>
                  </div>
                )
              })}
            </div>
            {dupConfirm.fresh.length > 0 && (
              <div style={{ padding: '10px 14px', borderRadius: '10px', background: '#F0FDF4', border: '1px solid #10B98140', marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#10B981', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>New URLs (always scan)</div>
                {dupConfirm.fresh.map((u, i) => {
                  const domain = (() => { try { return new URL(u).hostname.replace('www.', '') } catch { return u } })()
                  return <div key={i} style={{ fontSize: '12px', color: DARK, fontWeight: 600 }}>{domain}</div>
                })}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setDupConfirm(null)}
                style={{ flex: 1, padding: '11px', borderRadius: '10px', border: `1px solid ${BORDER}`, background: 'transparent', color: MUTED, fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              {dupConfirm.fresh.length > 0 && (
                <button onClick={() => executeRun(dupConfirm.fresh, false)}
                  style={{ flex: 1, padding: '11px', borderRadius: '10px', border: '1px solid #10B981', background: '#F0FDF4', color: '#10B981', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Scan {dupConfirm.fresh.length} new only
                </button>
              )}
              <button onClick={() => executeRun([...dupConfirm.dupes.map(d => d.url), ...dupConfirm.fresh], true)}
                style={{ flex: 1, padding: '11px', borderRadius: '10px', border: 'none', background: INDIGO, color: '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Re-run all ({dupConfirm.dupes.length + dupConfirm.fresh.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
