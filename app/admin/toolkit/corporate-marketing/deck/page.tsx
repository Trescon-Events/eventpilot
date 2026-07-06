'use client'

/*
  Corporate Deck Management — Phase 1.

  Live tabs:
    - Overview          ✓ chunk 2 — upload PDF + save Canva link
                        ✓ chunk 3 — run Gemini analysis + confirm mappings
    - Dynamic Content   → chunk 4
    - Testimonials      → chunk 4
    - Approved Images   → chunk 4
    - Version History   → chunk 5
    - Settings          → chunk 5
*/

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

const BRAND = '#8B1A1A'

type TabId = 'overview' | 'content' | 'testimonials' | 'images' | 'versions' | 'settings'

type Deck = {
  id:                  string
  title:               string
  pdf_storage_path:    string | null
  pdf_file_name:       string | null
  pdf_bytes:           number | null
  page_count:          number | null
  canva_url:           string | null
  ai_analysis_status:  'pending' | 'running' | 'ready' | 'confirmed' | 'failed'
  uploaded_at:         string
  updated_at:          string
  pdf_signed_url:      string | null
  uploaded_by_name:    string | null
}

const TABS: { id: TabId; label: string; hint: string }[] = [
  { id: 'overview',     label: 'Overview',        hint: 'Upload deck, save Canva link, run AI analysis' },
  { id: 'content',      label: 'Dynamic Content', hint: 'Company overview, vision, mission, stats, events, leadership' },
  { id: 'testimonials', label: 'Testimonials',    hint: 'Approved testimonials used in the deck' },
  { id: 'images',       label: 'Approved Images', hint: 'Corporate image library' },
  { id: 'versions',     label: 'Version History', hint: 'Every published deck version — immutable' },
  { id: 'settings',     label: 'Settings',        hint: 'Deck configuration + access' },
]

function fmtBytes(n: number | null): string {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function CorporateDeckPage() {
  const [tab, setTab] = useState<TabId>('overview')

  return (
    <div style={{
      minHeight: '100vh',
      background: '#E8EEF4',
      fontFamily: 'var(--font-manrope), Manrope, sans-serif',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Breadcrumb */}
      <div style={{ background: '#fff', borderBottom: '1px solid #DDE8EE', padding: '0 32px', height: '52px', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <Link href="/admin/toolkit" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#5B7080', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          Toolkit
        </Link>
        <span style={{ color: '#DDE8EE', fontSize: '13px' }}>/</span>
        <span style={{ fontSize: '13px', color: '#5B7080', fontWeight: 600 }}>Corporate Marketing</span>
        <span style={{ color: '#DDE8EE', fontSize: '13px' }}>/</span>
        <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>Deck</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: BRAND, background: `${BRAND}12`, padding: '3px 10px', borderRadius: '14px' }}>Phase 1 · MVP</span>
        </div>
      </div>

      {/* Module header */}
      <div style={{ padding: '28px 40px 20px', background: '#fff', borderBottom: '1px solid #EEF3F7' }}>
        <div style={{ display: 'flex', gap: '18px', alignItems: 'flex-start' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: `${BRAND}12`, color: BRAND, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#0F1923', letterSpacing: '-0.3px' }}>Corporate Deck Management</div>
            <div style={{ fontSize: '14px', color: '#5B7080', marginTop: '6px', maxWidth: '760px', lineHeight: 1.6 }}>
              Manage all dynamic content in Trescon&apos;s corporate deck. Canva stays the master design file — EventPilot becomes the master source for content and every published version.
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: '#fff', borderBottom: '1px solid #EEF3F7', padding: '0 40px', display: 'flex', gap: '2px', overflowX: 'auto' }}>
        {TABS.map(t => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{ border: 'none', background: 'transparent', padding: '14px 18px', fontSize: '13px', fontWeight: active ? 800 : 600, color: active ? BRAND : '#5B7080', borderBottom: `2px solid ${active ? BRAND : 'transparent'}`, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '32px 40px', overflowY: 'auto' }}>
        {tab === 'overview' ? <OverviewTab /> : <PlaceholderTab tabId={tab} />}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────
   Overview tab — live
   ──────────────────────────────────────────────────────────────── */

function OverviewTab() {
  const [deck,     setDeck]     = useState<Deck | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [canvaUrl, setCanvaUrl] = useState('')
  const [savingLink, setSavingLink] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState<string | null>(null)
  const [saveNote, setSaveNote] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    const res = await fetch('/api/corporate-marketing/deck', { cache: 'no-store' })
    if (res.ok) {
      const d = await res.json()
      setDeck(d.deck)
      setCanvaUrl(d.deck?.canva_url ?? '')
    }
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function onUpload(file: File) {
    setUploading(true)
    setUploadErr(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/corporate-marketing/deck/upload', { method: 'POST', body: form })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error ?? `Upload failed (${res.status})`)
      }
      await refresh()
    } catch (e) {
      setUploadErr((e as Error).message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function saveCanva() {
    setSavingLink(true)
    setSaveNote(null)
    try {
      const res = await fetch('/api/corporate-marketing/deck', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canva_url: canvaUrl }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error ?? 'Failed to save')
      }
      const d = await res.json()
      setDeck(d.deck)
      setSaveNote('Saved')
      setTimeout(() => setSaveNote(null), 2000)
    } catch (e) {
      setSaveNote((e as Error).message)
    } finally {
      setSavingLink(false)
    }
  }

  if (loading) return <div style={{ fontSize: '13px', color: '#5B7080' }}>Loading…</div>

  const hasDeck = !!deck?.pdf_storage_path

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px', maxWidth: '900px' }}>

      {/* Deck card */}
      <section style={{ background: '#fff', border: '1px solid #DDE8EE', borderRadius: '20px', padding: '28px', boxShadow: '0 2px 16px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#B8CDD8', letterSpacing: '2px', textTransform: 'uppercase' }}>Master Deck</div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#0F1923', marginTop: '4px' }}>
              {hasDeck ? (deck?.pdf_file_name ?? 'Untitled') : 'No deck uploaded yet'}
            </div>
          </div>
          <StatusBadge status={deck?.ai_analysis_status ?? 'pending'} hasDeck={hasDeck} />
        </div>

        {hasDeck ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '14px', marginBottom: '22px' }}>
            <Stat label="Pages"       value={String(deck?.page_count ?? '—')} />
            <Stat label="Size"        value={fmtBytes(deck?.pdf_bytes ?? null)} />
            <Stat label="Uploaded"    value={fmtDate(deck?.uploaded_at ?? null)} />
            <Stat label="Uploaded by" value={deck?.uploaded_by_name ?? '—'} />
          </div>
        ) : (
          <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.7, marginBottom: '20px' }}>
            Upload Trescon&apos;s current corporate deck as a PDF. The AI analysis step will read it to identify sections that change often (stats, events, leadership, testimonials) so Marketing can maintain them without touching Canva.
          </div>
        )}

        {/* Upload / replace */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f) }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{ background: BRAND, color: '#fff', border: 'none', borderRadius: '10px', padding: '11px 22px', fontSize: '13px', fontWeight: 800, cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.7 : 1, fontFamily: 'inherit' }}
          >
            {uploading ? 'Uploading…' : hasDeck ? 'Replace deck' : 'Upload deck (PDF)'}
          </button>
          {hasDeck && deck?.pdf_signed_url && (
            <a
              href={deck.pdf_signed_url}
              target="_blank"
              rel="noreferrer"
              style={{ background: 'transparent', color: '#0F1923', border: '1px solid #DDE8EE', borderRadius: '10px', padding: '11px 20px', fontSize: '13px', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              View PDF
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
          )}
        </div>

        {uploadErr && (
          <div style={{ marginTop: '14px', padding: '10px 14px', borderRadius: '10px', background: '#FFF4F4', border: '1px solid #FBCACA', color: '#C2410C', fontSize: '12px', fontWeight: 700 }}>
            {uploadErr}
          </div>
        )}
      </section>

      {/* Canva link */}
      <section style={{ background: '#fff', border: '1px solid #DDE8EE', borderRadius: '20px', padding: '28px', boxShadow: '0 2px 16px rgba(0,0,0,0.04)' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: '#B8CDD8', letterSpacing: '2px', textTransform: 'uppercase' }}>Canva Design</div>
        <div style={{ fontSize: '18px', fontWeight: 900, color: '#0F1923', marginTop: '4px', marginBottom: '6px' }}>Master design link</div>
        <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.6, marginBottom: '16px' }}>
          Canva stays the design source of truth. Paste the shared link so anyone opening the deck knows where to edit design changes.
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="url"
            placeholder="https://www.canva.com/design/…"
            value={canvaUrl}
            onChange={e => setCanvaUrl(e.target.value)}
            style={{ flex: 1, minWidth: '260px', padding: '11px 14px', borderRadius: '10px', border: '1px solid #DDE8EE', fontSize: '13px', fontFamily: 'inherit', color: '#0F1923', outline: 'none' }}
          />
          <button
            onClick={saveCanva}
            disabled={savingLink}
            style={{ background: '#0F1923', color: '#fff', border: 'none', borderRadius: '10px', padding: '11px 22px', fontSize: '13px', fontWeight: 800, cursor: savingLink ? 'default' : 'pointer', opacity: savingLink ? 0.7 : 1, fontFamily: 'inherit' }}
          >
            {savingLink ? 'Saving…' : 'Save link'}
          </button>
          {deck?.canva_url && (
            <a href={deck.canva_url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', fontWeight: 700, color: BRAND, textDecoration: 'none' }}>
              Open in Canva ↗
            </a>
          )}
        </div>
        {saveNote && (
          <div style={{ marginTop: '10px', fontSize: '12px', color: saveNote === 'Saved' ? '#00897B' : '#C2410C', fontWeight: 700 }}>
            {saveNote}
          </div>
        )}
      </section>

      {/* AI analysis */}
      <AnalysisPanel deck={deck} onRefresh={refresh} />

      {/* Detected sections — only rendered when analysis is ready */}
      {deck && (deck.ai_analysis_status === 'ready' || deck.ai_analysis_status === 'confirmed') && (
        <DetectedSectionsPanel deckStatus={deck.ai_analysis_status} onRefresh={refresh} />
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────
   AI analysis trigger panel
   ──────────────────────────────────────────────────────────────── */

function AnalysisPanel({ deck, onRefresh }: { deck: Deck | null; onRefresh: () => Promise<void> }) {
  const hasDeck = !!deck?.pdf_storage_path
  const status = deck?.ai_analysis_status ?? 'pending'
  const [running, setRunning] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function runAnalysis() {
    setRunning(true)
    setErr(null)
    try {
      const res = await fetch('/api/corporate-marketing/deck/analyse', { method: 'POST' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error ?? `Analysis failed (${res.status})`)
      }
      await onRefresh()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const buttonLabel = (() => {
    if (running || status === 'running') return 'Analysing…'
    if (status === 'ready')     return 'Re-run analysis'
    if (status === 'confirmed') return 'Re-run analysis'
    if (status === 'failed')    return 'Retry analysis'
    return 'Run AI analysis'
  })()

  const disabled = !hasDeck || running || status === 'running'

  return (
    <section style={{ background: '#fff', border: '1px solid #DDE8EE', borderRadius: '20px', padding: '28px', boxShadow: '0 2px 16px rgba(0,0,0,0.04)' }}>
      <div style={{ fontSize: '11px', fontWeight: 800, color: '#B8CDD8', letterSpacing: '2px', textTransform: 'uppercase' }}>AI Deck Analysis</div>
      <div style={{ fontSize: '18px', fontWeight: 900, color: '#0F1923', marginTop: '4px', marginBottom: '6px' }}>Gemini section detection</div>
      <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.6 }}>
        {!hasDeck && 'Upload a deck first — AI analysis runs on the uploaded PDF.'}
        {hasDeck && status === 'pending'   && 'Gemini reads the PDF and proposes the sections that change month-to-month. You confirm the detected sections before EventPilot creates the editable mappings.'}
        {hasDeck && status === 'running'   && 'Gemini is reading the deck. This takes 30–60 seconds for a typical corporate deck.'}
        {hasDeck && status === 'ready'     && 'Analysis complete. Confirm the detected sections below to unlock the editable workspace.'}
        {hasDeck && status === 'confirmed' && 'Mappings are confirmed. Editable workspace is live in the Dynamic Content tab (coming in chunk 4).'}
        {hasDeck && status === 'failed'    && `Analysis failed. ${deck?.pdf_file_name ? '' : ''}Try again or replace the PDF.`}
      </div>

      <button
        onClick={runAnalysis}
        disabled={disabled}
        style={{
          marginTop: '16px',
          background: disabled ? '#EEF3F7' : BRAND,
          color:      disabled ? '#94A3B8' : '#fff',
          border: 'none', borderRadius: '10px',
          padding: '11px 22px', fontSize: '13px', fontWeight: 800,
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {buttonLabel}
      </button>

      {err && (
        <div style={{ marginTop: '14px', padding: '10px 14px', borderRadius: '10px', background: '#FFF4F4', border: '1px solid #FBCACA', color: '#C2410C', fontSize: '12px', fontWeight: 700 }}>
          {err}
        </div>
      )}
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────
   Detected sections — confirm/exclude/edit mappings
   ──────────────────────────────────────────────────────────────── */

type Mapping = {
  id:              string
  section_key:     string
  section_label:   string
  slide_numbers:   number[]
  confirmed:       boolean
  ai_confidence:   number | null
  sample_content:  string
}

function DetectedSectionsPanel({ deckStatus, onRefresh }: { deckStatus: string; onRefresh: () => Promise<void> }) {
  const [mappings, setMappings] = useState<Mapping[] | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving,  setSaving]    = useState(false)
  const [errText, setErrText]   = useState<string | null>(null)
  // Local per-row edits
  const [drafts, setDrafts] = useState<Record<string, { include: boolean; slidesText: string; label: string }>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/corporate-marketing/deck/mappings', { cache: 'no-store' })
    if (res.ok) {
      const d = await res.json()
      const list: Mapping[] = d.mappings ?? []
      setMappings(list)
      const initial: Record<string, { include: boolean; slidesText: string; label: string }> = {}
      for (const m of list) {
        initial[m.id] = {
          include:    true,
          slidesText: m.slide_numbers.join(', '),
          label:      m.section_label,
        }
      }
      setDrafts(initial)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function toggleInclude(id: string) {
    setDrafts(d => ({ ...d, [id]: { ...d[id], include: !d[id].include } }))
  }
  function editSlides(id: string, text: string) {
    setDrafts(d => ({ ...d, [id]: { ...d[id], slidesText: text } }))
  }
  function editLabel(id: string, text: string) {
    setDrafts(d => ({ ...d, [id]: { ...d[id], label: text } }))
  }

  function parseSlides(text: string): number[] {
    return text.split(/[,\s]+/)
      .map(x => Number(x.trim()))
      .filter(n => Number.isInteger(n) && n > 0)
      .sort((a, b) => a - b)
  }

  async function confirmAll() {
    if (!mappings) return
    setSaving(true)
    setErrText(null)
    try {
      const payload = {
        confirmed: mappings.map(m => {
          const d = drafts[m.id]
          return {
            id:            m.id,
            include:       d?.include ?? true,
            slide_numbers: parseSlides(d?.slidesText ?? ''),
            section_label: d?.label ?? m.section_label,
          }
        }),
      }
      const res = await fetch('/api/corporate-marketing/deck/mappings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error ?? 'Save failed')
      }
      await Promise.all([load(), onRefresh()])
    } catch (e) {
      setErrText((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <section style={{ background: '#fff', border: '1px solid #DDE8EE', borderRadius: '20px', padding: '28px' }}>
        <div style={{ fontSize: '13px', color: '#5B7080' }}>Loading detected sections…</div>
      </section>
    )
  }

  const list = mappings ?? []

  if (list.length === 0) {
    return (
      <section style={{ background: '#fff', border: '1px solid #DDE8EE', borderRadius: '20px', padding: '28px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: '#B8CDD8', letterSpacing: '2px', textTransform: 'uppercase' }}>Detected sections</div>
        <div style={{ fontSize: '18px', fontWeight: 900, color: '#0F1923', marginTop: '4px', marginBottom: '6px' }}>No dynamic sections detected</div>
        <p style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.6, margin: 0 }}>
          Gemini didn&apos;t confidently identify any editable sections in this deck. This can happen with image-heavy Canva exports where text is flattened into images. Try re-running the analysis, or add sections manually from the Dynamic Content tab once chunk 4 lands.
        </p>
      </section>
    )
  }

  const allConfirmed = list.every(m => m.confirmed)

  return (
    <section style={{ background: '#fff', border: '1px solid #DDE8EE', borderRadius: '20px', padding: '28px', boxShadow: '0 2px 16px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: '#B8CDD8', letterSpacing: '2px', textTransform: 'uppercase' }}>Detected sections</div>
        {allConfirmed && deckStatus === 'confirmed' && (
          <span style={{ fontSize: '11px', fontWeight: 800, color: '#00897B', background: '#D1FAE5', padding: '5px 12px', borderRadius: '14px' }}>All confirmed ✓</span>
        )}
      </div>
      <div style={{ fontSize: '18px', fontWeight: 900, color: '#0F1923', marginTop: '4px', marginBottom: '6px' }}>
        {allConfirmed && deckStatus === 'confirmed' ? 'Sections confirmed' : 'Review and confirm'}
      </div>
      <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.6, marginBottom: '20px' }}>
        Gemini found {list.length} candidate section{list.length === 1 ? '' : 's'}. Toggle any you don&apos;t want, correct slide numbers if needed, then confirm.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {list.map(m => {
          const d = drafts[m.id] ?? { include: true, slidesText: m.slide_numbers.join(', '), label: m.section_label }
          const conf = m.ai_confidence ?? 0
          const confBadge = conf >= 0.85 ? { bg: '#D1FAE5', color: '#00897B', label: `${Math.round(conf*100)}%` }
                          : conf >= 0.6  ? { bg: '#FEF3C7', color: '#B45309', label: `${Math.round(conf*100)}%` }
                          :                 { bg: '#FEE2E2', color: '#B91C1C', label: `${Math.round(conf*100)}%` }
          const excluded = !d.include
          return (
            <div key={m.id} style={{
              border: `1px solid ${excluded ? '#EEF3F7' : '#DDE8EE'}`,
              background: excluded ? '#FAFBFC' : '#fff',
              borderRadius: '14px',
              padding: '16px 18px',
              opacity: excluded ? 0.55 : 1,
              transition: 'opacity 0.15s',
            }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={d.include}
                    onChange={() => toggleInclude(m.id)}
                    style={{ width: '16px', height: '16px', accentColor: BRAND, cursor: 'pointer' }}
                  />
                </label>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '6px' }}>
                    <input
                      type="text"
                      value={d.label}
                      onChange={e => editLabel(m.id, e.target.value)}
                      disabled={excluded}
                      style={{ fontSize: '14px', fontWeight: 800, color: '#0F1923', border: 'none', background: 'transparent', outline: 'none', padding: '2px 6px', borderRadius: '6px', minWidth: '180px', fontFamily: 'inherit' }}
                    />
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', background: '#EEF3F7', padding: '3px 8px', borderRadius: '10px', letterSpacing: '0.5px' }}>
                      {m.section_key}
                    </span>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: confBadge.color, background: confBadge.bg, padding: '3px 8px', borderRadius: '10px' }}>
                      {confBadge.label}
                    </span>
                    {m.confirmed && (
                      <span style={{ fontSize: '10px', fontWeight: 800, color: '#00897B', background: '#D1FAE5', padding: '3px 8px', borderRadius: '10px' }}>
                        Mapped
                      </span>
                    )}
                  </div>

                  {m.sample_content && (
                    <div style={{ fontSize: '12px', color: '#5B7080', lineHeight: 1.5, marginBottom: '10px', fontStyle: 'italic' }}>
                      &ldquo;{m.sample_content}&rdquo;
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Slides</span>
                    <input
                      type="text"
                      value={d.slidesText}
                      onChange={e => editSlides(m.id, e.target.value)}
                      disabled={excluded}
                      placeholder="e.g. 4, 18, 29"
                      style={{ fontSize: '12px', color: '#0F1923', border: '1px solid #DDE8EE', background: '#fff', outline: 'none', padding: '5px 10px', borderRadius: '8px', fontFamily: 'inherit', width: '180px' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: '22px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={confirmAll}
          disabled={saving}
          style={{
            background: BRAND, color: '#fff', border: 'none', borderRadius: '10px',
            padding: '12px 26px', fontSize: '13px', fontWeight: 800,
            cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1,
            fontFamily: 'inherit',
          }}
        >
          {saving ? 'Saving…' : allConfirmed ? 'Re-confirm all' : 'Confirm & continue'}
        </button>
        <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 600 }}>
          Confirmed sections become editable in the Dynamic Content tab (chunk 4).
        </span>
      </div>

      {errText && (
        <div style={{ marginTop: '14px', padding: '10px 14px', borderRadius: '10px', background: '#FFF4F4', border: '1px solid #FBCACA', color: '#C2410C', fontSize: '12px', fontWeight: 700 }}>
          {errText}
        </div>
      )}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#FAFBFC', border: '1px solid #EEF3F7', borderRadius: '12px', padding: '12px 14px' }}>
      <div style={{ fontSize: '10px', fontWeight: 800, color: '#B8CDD8', letterSpacing: '1.5px', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F1923', marginTop: '4px' }}>{value}</div>
    </div>
  )
}

function StatusBadge({ status, hasDeck }: { status: Deck['ai_analysis_status']; hasDeck: boolean }) {
  if (!hasDeck) {
    return <Badge color="#94A3B8" bg="#EEF3F7">Empty</Badge>
  }
  const map: Record<Deck['ai_analysis_status'], { label: string; color: string; bg: string }> = {
    pending:   { label: 'Ready to analyse', color: '#B45309', bg: '#FEF3C7' },
    running:   { label: 'Analysing…',        color: '#1D4ED8', bg: '#DBEAFE' },
    ready:     { label: 'Awaiting confirm',  color: '#B45309', bg: '#FEF3C7' },
    confirmed: { label: 'Mapped',            color: '#00897B', bg: '#D1FAE5' },
    failed:    { label: 'Failed',            color: '#B91C1C', bg: '#FEE2E2' },
  }
  const s = map[status]
  return <Badge color={s.color} bg={s.bg}>{s.label}</Badge>
}

function Badge({ color, bg, children }: { color: string; bg: string; children: React.ReactNode }) {
  return (
    <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px', color, background: bg, padding: '5px 12px', borderRadius: '14px' }}>
      {children}
    </span>
  )
}

/* ────────────────────────────────────────────────────────────────
   Placeholder tabs (chunks 4-5)
   ──────────────────────────────────────────────────────────────── */

function PlaceholderTab({ tabId }: { tabId: TabId }) {
  const t = TABS.find(x => x.id === tabId)
  return (
    <div style={{ maxWidth: '840px', background: '#fff', border: '1px solid #DDE8EE', borderRadius: '20px', padding: '40px', boxShadow: '0 2px 16px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'inline-block', fontSize: '10px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: BRAND, background: `${BRAND}10`, padding: '4px 10px', borderRadius: '12px', marginBottom: '14px' }}>
        Coming next
      </div>
      <div style={{ fontSize: '20px', fontWeight: 900, color: '#0F1923', marginBottom: '10px' }}>{t?.label}</div>
      <p style={{ fontSize: '14px', color: '#5B7080', lineHeight: 1.7, margin: 0 }}>{t?.hint}. Lands in the next chunk of the build.</p>
    </div>
  )
}
