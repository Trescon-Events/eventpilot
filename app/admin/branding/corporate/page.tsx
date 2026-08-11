'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

/* Trescon Corporate Brand — admin Branding tab, "Corporate Brand" section
   (2026-08-06, restructured same day into a Canva Brand Kit-style asset
   library). Backed by two tables: corporate_brand_guidelines (versioned
   raw PDF-import record — Import PDF + Version History tabs) and
   corporate_brand_assets (the actual library — one row per individually
   named, independently editable asset: a logo, a color, a font, ...).
   The first cut of this page stored everything as one JSON blob + 5 fixed
   logo columns; the real Trescon Brandbook turned out to define a whole
   logo FAMILY (main mark + Holdings/Events/Bespoke Events/Education &
   Training) and clearly-separable colors/fonts/patterns/voice — a flat
   asset table matches that much better than a rigid schema, and is the
   same one-row-per-item pattern already used by the sibling Corporate
   Marketing module's corporate_assets/corporate_testimonials tables. */

// ── Types ──────────────────────────────────────────────────────────────────────
type AssetCategory = 'logo' | 'color' | 'font' | 'pattern' | 'voice' | 'collateral_reference' | 'template'

type Asset = {
  id: string
  category: AssetCategory
  name: string
  subcategory: string | null
  file_url: string | null
  vector_url: string | null
  format: string | null
  metadata: Record<string, any>
  display_order: number
  source: 'manual' | 'pdf_import'
  created_at: string
  updated_at: string
}

type FontContentTypeSuggestion = { content_type: string; google_font_name: string; weight: number; usage_notes: string }

// Mirrors the JSON schema Gemini fills in app/lib/branding/extract-guidelines.ts —
// every field optional/nullable since older or thinner PDFs may not define
// all of them. This is the FULL extraction; actual usable assets (real
// font files, logo files, color swatches) live in corporate_brand_assets —
// this is the descriptive/reference layer sitting underneath them.
type StructuredGuidelines = {
  brand_name?: string | null
  positioning_statement?: string | null
  brand_category?: string | null
  brand_vision?: string | null
  brand_mission?: string | null
  brand_archetypes?: { role: string; name: string; description: string }[]

  logo_concept?: string | null
  logo_min_size_digital?: string | null
  logo_min_size_print?: string | null
  logo_clear_space?: string | null
  logo_cobranding_rules?: string | null
  logo_donts?: string[]
  logo_notes?: string | null

  color_usage_rules?: string | null
  color_contrast_min?: string | null

  font_content_types?: FontContentTypeSuggestion[]
  type_scale_ratio?: string | null
  type_scale?: { level: string; size_px: number; weight: number; line_height: string; usage: string }[]
  type_rules_dos?: string[]
  type_rules_donts?: string[]

  pattern_assets?: { name: string; usage_context: string; background_tone: string }[]

  imagery_philosophy?: string[]
  photography_direction?: { subjects?: string[]; dos?: string[]; donts?: string[] }
  overlay_types?: string[]
  imagery_treatments?: { name: string; description: string; use_cases: string[] }[]

  icon_system?: string | null
  icon_grid_size?: string | null
  icon_rules?: string | null

  grid_base_px?: number | null
  grid_columns?: number | null
  breakpoints?: { name: string; min_px: number; max_px: number }[]
  spacing_tokens?: { name: string; value_px: number }[]

  tone?: string[]
  style_keywords?: string[]
  key_messages?: string[]
}

type GuidelinesDoc = {
  id: string
  version: number
  title: string
  status: 'draft' | 'live' | 'superseded'
  canva_url: string | null
  structured_json: StructuredGuidelines | null
  created_at: string
  updated_at: string
}

// ── Constants ──────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'guidelines',  label: 'Brand Guidelines' },
  { id: 'logos',       label: 'Logos' },
  { id: 'colors',      label: 'Colors' },
  { id: 'typography',  label: 'Typography' },
  { id: 'patterns',    label: 'Patterns & Voice' },
  { id: 'collateral',  label: 'Collateral Reference' },
  { id: 'templates',   label: 'Templates' },
  { id: 'versions',    label: 'Version History' },
] as const
type TabId = typeof TABS[number]['id']

const LOGO_SUBCATEGORIES = ['primary', 'white', 'dark', 'horizontal', 'icon', 'venture']
const COLOR_SUBCATEGORIES = ['primary', 'secondary', 'accent', 'neutral-light', 'neutral-dark']

// ── Shared style tokens ────────────────────────────────────────────────────────
const S = {
  card:    { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' } as React.CSSProperties,
  label:   { fontSize: '11px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase' as const, letterSpacing: '1.5px', marginBottom: '6px', display: 'block' as const },
  input:   { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ink)', background: 'var(--border-light)', boxSizing: 'border-box' as const, outline: 'none' },
  textarea:{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ink)', background: 'var(--border-light)', resize: 'vertical' as const, lineHeight: 1.6, boxSizing: 'border-box' as const, outline: 'none' },
  sectionTitle: { fontSize: '13px', fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase' as const, letterSpacing: '1.5px', marginBottom: '16px' },
  btnGhost: { padding: '6px 12px', borderRadius: '7px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink2)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  btnDanger: { padding: '6px 12px', borderRadius: '7px', border: '1px solid rgba(241,102,122,0.35)', background: 'rgba(241,102,122,0.08)', color: 'var(--red)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  addBtn:  { padding: '8px 16px', borderRadius: '8px', border: '1px dashed var(--border)', background: 'transparent', fontSize: '13px', color: 'var(--ink3)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 },
}

function fmtDate(iso?: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`/api/branding/corporate${path}`, opts)
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error ?? 'Request failed')
  return data
}

// Derives a human-readable asset name from a filename — "10-years-trescon-logo_W.png" -> "10 Years Trescon Logo W"
function nameFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '')
  return base
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// Shared multi-file drop zone for Logos/Patterns/Collateral Reference —
// one asset row is created per file, name auto-derived from its filename
// (editable afterward), all sharing the same category/subcategory picked
// once for the whole batch. Turns "download every single Canva asset"
// from N one-by-one uploads into a single drag.
function BatchUpload({ category, subcategory, onAdd, accept = 'image/png,image/jpeg,image/webp,image/svg+xml' }: {
  category: AssetCategory
  subcategory?: string
  onAdd: (fd: FormData) => Promise<void>
  accept?: string
}) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    const list = Array.from(files)
    setProgress({ done: 0, total: list.length })
    for (let i = 0; i < list.length; i++) {
      const fd = new FormData()
      fd.append('category', category)
      fd.append('name', nameFromFilename(list[i].name))
      if (subcategory) fd.append('subcategory', subcategory)
      fd.append('file', list[i])
      await onAdd(fd)
      setProgress({ done: i + 1, total: list.length })
    }
    setUploading(false)
    setProgress(null)
  }

  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '14px 18px', border: `1.5px dashed ${uploading ? 'var(--teal-mid)' : 'var(--border)'}`, borderRadius: '10px', background: uploading ? 'rgba(18,201,189,0.04)' : 'var(--border-light)', cursor: uploading ? 'wait' : 'pointer', marginBottom: '18px' }}>
      <input type="file" multiple accept={accept} style={{ display: 'none' }} disabled={uploading}
        onChange={e => { handleFiles(e.target.files); e.target.value = '' }} />
      <span style={{ fontSize: '13px', fontWeight: 700, color: uploading ? 'var(--teal-mid)' : 'var(--ink3)' }}>
        {uploading ? `Uploading ${progress?.done ?? 0}/${progress?.total ?? 0}…` : 'Batch upload — select multiple files at once'}
      </span>
    </label>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function CorporateBrandPage() {
  const [tab, setTab] = useState<TabId>('guidelines')
  const [doc, setDoc] = useState<GuidelinesDoc | null>(null)
  const [versions, setVersions] = useState<GuidelinesDoc[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [canvaUrlDraft, setCanvaUrlDraft] = useState('')

  const [pdfUploading, setPdfUploading] = useState(false)
  const [showUploadPanel, setShowUploadPanel] = useState(false)
  const [pdfFileName, setPdfFileName] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [docData, assetsData] = await Promise.all([
      fetch('/api/branding/corporate').then(r => r.json()).catch(() => null),
      fetch('/api/branding/corporate/assets').then(r => r.json()).catch(() => []),
    ])
    if (docData) { setDoc(docData); setCanvaUrlDraft(docData.canva_url ?? '') }
    setAssets(Array.isArray(assetsData) ? assetsData : [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function fetchVersions() {
    const data = await fetch('/api/branding/corporate?all=true').then(r => r.json()).catch(() => [])
    setVersions(Array.isArray(data) ? data : [])
  }

  async function makeLive(target: GuidelinesDoc) {
    const currentLive = versions.find(v => v.status === 'live')
    if (currentLive && currentLive.id !== target.id) {
      await fetch(`/api/branding/corporate/${currentLive.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'superseded' }) })
    }
    await fetch(`/api/branding/corporate/${target.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'live' }) })
    await fetchAll()
    await fetchVersions()
  }

  async function saveCanvaUrl() {
    if (!doc) return
    try {
      const updated = await api(`/${doc.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ canva_url: canvaUrlDraft || null }) })
      setDoc(updated)
      setMsg({ text: 'Canva link saved.', ok: true })
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Save failed', ok: false })
    }
  }

  async function importFromPDF(file: File) {
    if (file.size > 50 * 1024 * 1024) {
      setMsg({ text: `File is too large — maximum 50 MB (the storage plan's current hard ceiling). Please compress the PDF first.`, ok: false })
      return
    }
    setPdfUploading(true); setPdfFileName(file.name); setMsg(null)
    try {
      const form = new FormData()
      form.append('file', file)
      if (canvaUrlDraft) form.append('canva_url', canvaUrlDraft)
      const data = await api('', { method: 'POST', body: form })
      setDoc(data)
      setMsg({ text: `v${data.version} extracted — review everything below, and check Colors/Typography tabs to add anything new to the library.`, ok: true })
      setShowUploadPanel(false)
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Extraction failed', ok: false })
    }
    setPdfUploading(false)
  }

  // ── Asset actions ──────────────────────────────────────────────
  async function addAsset(fd: FormData) {
    try {
      const created = await fetch('/api/branding/corporate/assets', { method: 'POST', body: fd }).then(async r => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error ?? 'Failed to add asset')
        return data as Asset
      })
      setAssets(prev => [...prev, created])
      setMsg({ text: `${created.name} added.`, ok: true })
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Failed to add asset', ok: false })
    }
  }

  async function patchAsset(id: string, patch: Record<string, unknown>) {
    setBusyId(id)
    try {
      const updated = await fetch(`/api/branding/corporate/assets/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
        .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); return data as Asset })
      setAssets(prev => prev.map(a => a.id === id ? updated : a))
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Update failed', ok: false })
    }
    setBusyId(null)
  }

  async function replaceAssetFile(id: string, file: File, field: 'file_url' | 'vector_url' = 'file_url') {
    setBusyId(id)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('field', field)
      const updated = await fetch(`/api/branding/corporate/assets/${id}/upload`, { method: 'POST', body: form })
        .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); return data as Asset })
      setAssets(prev => prev.map(a => a.id === id ? updated : a))
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Upload failed', ok: false })
    }
    setBusyId(null)
  }

  async function deleteAsset(id: string) {
    setBusyId(id)
    try {
      await fetch(`/api/branding/corporate/assets/${id}`, { method: 'DELETE' })
      setAssets(prev => prev.filter(a => a.id !== id))
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Delete failed', ok: false })
    }
    setBusyId(null)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-manrope), Manrope, sans-serif' }}>
        <span style={{ fontSize: '15px', color: 'var(--ink3)' }}>Loading Corporate Brand…</span>
      </div>
    )
  }

  const logos = assets.filter(a => a.category === 'logo')
  const colors = assets.filter(a => a.category === 'color')
  const fonts = assets.filter(a => a.category === 'font')
  const patterns = assets.filter(a => a.category === 'pattern')
  const voices = assets.filter(a => a.category === 'voice')
  const collateral = assets.filter(a => a.category === 'collateral_reference')
  const templates = assets.filter(a => a.category === 'template')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', fontFamily: 'var(--font-manrope), Manrope, sans-serif', color: 'var(--ink)' }}>

      <nav style={{ background: 'var(--card)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0 32px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Branding</div>
          <div style={{ fontSize: '15px', fontWeight: 900, color: 'var(--ink)' }}>Trescon Corporate Brand</div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {doc && (
            <div style={{ padding: '5px 12px', borderRadius: '20px', background: 'rgba(18,201,189,0.15)', fontSize: '11px', fontWeight: 700, color: 'var(--teal-mid)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              v{doc.version} · Live · {fmtDate(doc.updated_at)}
            </div>
          )}
          {doc?.canva_url && (
            <a href={doc.canva_url} target="_blank" rel="noreferrer"
              style={{ padding: '9px 16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: 'var(--ink2)', fontSize: '13px', fontWeight: 800, textDecoration: 'none' }}>
              Open in Canva ↗
            </a>
          )}
        </div>
      </nav>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 32px 80px' }}>

        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '5px', width: 'fit-content' }}>
          <Link href="/admin/branding/fonts" style={{ padding: '8px 16px', borderRadius: '8px', color: 'var(--ink3)', fontSize: '13px', fontWeight: 800, textDecoration: 'none' }}>Fonts</Link>
          <div style={{ padding: '8px 16px', borderRadius: '8px', background: 'var(--surface)', color: 'var(--lime)', fontSize: '13px', fontWeight: 800 }}>Corporate Brand</div>
        </div>

        {msg && (
          <div style={{ marginBottom: '20px', padding: '12px 18px', borderRadius: '10px', background: msg.ok ? 'rgba(192,244,60,0.08)' : 'rgba(241,102,122,0.08)', border: `1px solid ${msg.ok ? 'rgba(192,244,60,0.3)' : 'rgba(241,102,122,0.3)'}`, color: msg.ok ? 'var(--lime)' : 'var(--red)', fontSize: '14px', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {msg.text}
            <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '18px', padding: '0 4px' }}>×</button>
          </div>
        )}

        <div style={{ display: 'flex', gap: '4px', marginBottom: '28px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '5px', overflowX: 'auto', flexWrap: 'nowrap' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); if (t.id === 'versions') fetchVersions() }}
              style={{ padding: '8px 16px', borderRadius: '9px', border: 'none', background: tab === t.id ? 'var(--surface)' : 'transparent', color: tab === t.id ? 'var(--lime)' : 'var(--ink3)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ══════════ BRAND GUIDELINES ══════════ */}
        {tab === 'guidelines' && (
          <div style={{ display: 'grid', gap: '24px' }}>
            <div style={S.card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: (showUploadPanel || !doc) ? '6px' : 0 }}>
                <div>
                  <div style={{ ...S.sectionTitle, marginBottom: '2px' }}>{doc ? doc.title : 'Corporate Brand Guidelines'}</div>
                  {doc && <div style={{ fontSize: '12px', color: 'var(--ink4)' }}>v{doc.version} · imported {fmtDate(doc.created_at)} · everything below is what the system has on file — the source the Colors/Typography/Logos tabs and other tools draw from</div>}
                </div>
                {doc && (
                  <button onClick={() => setShowUploadPanel(v => !v)} style={S.btnGhost}>{showUploadPanel ? 'Cancel' : 'Re-upload / Update'}</button>
                )}
              </div>

              {(showUploadPanel || !doc) && (
                <div style={{ marginTop: '16px' }}>
                  {!doc && (
                    <p style={{ fontSize: '14px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '20px', marginTop: 0 }}>
                      Upload the Trescon corporate brand guidelines PDF. Gemini reads identity, colours, typography and rules into a versioned record here — review the Colors/Typography tabs afterward and add anything new to the library. Logo files aren&apos;t extractable from a PDF automatically — add those directly in the Logos tab.
                    </p>
                  )}
                  <div style={{ marginBottom: '18px' }}>
                    <span style={S.label}>Canva design link (optional)</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input value={canvaUrlDraft} onChange={e => setCanvaUrlDraft(e.target.value)} style={S.input} placeholder="https://canva.com/design/…" />
                      <button onClick={saveCanvaUrl} disabled={!doc} style={{ ...S.btnGhost, opacity: doc ? 1 : 0.5 }}>Save</button>
                    </div>
                    <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--ink4)' }}>Convenience link only — never read programmatically.</div>
                  </div>
                  <label
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', padding: '40px 24px', border: `2px dashed ${pdfUploading ? 'var(--teal-mid)' : 'var(--border)'}`, borderRadius: '14px', background: pdfUploading ? 'rgba(18,201,189,0.04)' : 'var(--border-light)', cursor: pdfUploading ? 'not-allowed' : 'pointer' }}>
                    <input type="file" accept="application/pdf" style={{ display: 'none' }} disabled={pdfUploading}
                      onChange={e => { const f = e.target.files?.[0]; if (f) importFromPDF(f); e.target.value = '' }} />
                    {pdfUploading ? (
                      <>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', border: '3px solid rgba(18,201,189,0.2)', borderTopColor: 'var(--teal-mid)', animation: 'spin 0.8s linear infinite' }} />
                        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--teal-mid)' }}>Gemini is analysing the brand book — 30–90 seconds for large PDFs…</div>
                        {pdfFileName && <div style={{ fontSize: '12px', color: 'var(--ink3)', fontWeight: 600 }}>{pdfFileName}</div>}
                      </>
                    ) : (
                      <>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--ink3)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                          <line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
                        </svg>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink2)' }}>Drop brand PDF here or click to browse</div>
                        <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>PDF only · Up to 50 MB</div>
                      </>
                    )}
                  </label>
                  <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                </div>
              )}
            </div>

            {doc && <SuggestedFontsPanel doc={doc} existingFonts={fonts} onAdd={addAsset} />}
            {doc && <GuidelinesDetail doc={doc} />}
          </div>
        )}

        {/* ══════════ LOGOS ══════════ */}
        {tab === 'logos' && (
          <LogoTab logos={logos} busyId={busyId} onAdd={addAsset} onPatch={patchAsset} onReplaceFile={replaceAssetFile} onDelete={deleteAsset} />
        )}

        {/* ══════════ COLORS ══════════ */}
        {tab === 'colors' && (
          <ColorTab colors={colors} busyId={busyId} onAdd={addAsset} onPatch={patchAsset} onDelete={deleteAsset} />
        )}

        {/* ══════════ TYPOGRAPHY ══════════ */}
        {tab === 'typography' && (
          <FontTab fonts={fonts} busyId={busyId} onAdd={addAsset} onPatch={patchAsset} onDelete={deleteAsset} />
        )}

        {/* ══════════ PATTERNS & VOICE ══════════ */}
        {tab === 'patterns' && (
          <PatternVoiceTab patterns={patterns} voices={voices} busyId={busyId} onAdd={addAsset} onPatch={patchAsset} onReplaceFile={replaceAssetFile} onDelete={deleteAsset} />
        )}

        {/* ══════════ COLLATERAL REFERENCE ══════════ */}
        {tab === 'collateral' && (
          <CollateralTab items={collateral} busyId={busyId} onAdd={addAsset} onDelete={deleteAsset} />
        )}

        {/* ══════════ TEMPLATES ══════════ */}
        {tab === 'templates' && (
          <TemplateTab templates={templates} busyId={busyId} onAdd={addAsset} onReplaceFile={replaceAssetFile} onDelete={deleteAsset} />
        )}

        {/* ══════════ VERSION HISTORY ══════════ */}
        {tab === 'versions' && (
          <div style={S.card}>
            <div style={S.sectionTitle}>Version History</div>
            {versions.length === 0 && <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>No versions yet.</div>}
            <div style={{ display: 'grid', gap: '6px' }}>
              {versions.map(v => (
                <div key={v.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', background: v.status === 'live' ? 'rgba(18,201,189,0.08)' : 'transparent' }}>
                  <div style={{ fontSize: '13px', color: 'var(--ink)' }}>
                    v{v.version} · {v.title} · {fmtDate(v.created_at)}
                    <span style={{ marginLeft: '10px', fontSize: '10.5px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: v.status === 'live' ? 'var(--teal-mid)' : v.status === 'draft' ? 'var(--amber)' : 'var(--ink4)' }}>{v.status}</span>
                  </div>
                  {v.status !== 'live' && (
                    <button onClick={() => makeLive(v)} style={S.btnGhost}>Make live</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Logos tab ───────────────────────────────────────────────────────────────────
function LogoTab({ logos, busyId, onAdd, onPatch, onReplaceFile, onDelete }: {
  logos: Asset[]; busyId: string | null
  onAdd: (fd: FormData) => Promise<void>
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<void>
  onReplaceFile: (id: string, file: File, field?: 'file_url' | 'vector_url') => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [subcategory, setSubcategory] = useState('primary')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [batchSubcategory, setBatchSubcategory] = useState('primary')

  async function submit() {
    if (!name.trim()) return
    setSubmitting(true)
    const fd = new FormData()
    fd.append('category', 'logo')
    fd.append('name', name.trim())
    fd.append('subcategory', subcategory)
    if (file) fd.append('file', file)
    await onAdd(fd)
    setSubmitting(false); setAdding(false); setName(''); setFile(null)
  }

  return (
    <div style={S.card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={S.sectionTitle as React.CSSProperties}>Logos</div>
        <button onClick={() => setAdding(v => !v)} style={S.addBtn}>{adding ? 'Cancel' : '+ Add Logo'}</button>
      </div>

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '4px' }}>
        <select value={batchSubcategory} onChange={e => setBatchSubcategory(e.target.value)} style={{ ...S.input, width: '160px' }}>
          {LOGO_SUBCATEGORIES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{ flex: 1 }}>
          <BatchUpload category="logo" subcategory={batchSubcategory} onAdd={onAdd} accept="image/png,image/jpeg,image/webp,image/svg+xml,application/pdf" />
        </div>
      </div>

      {adding && (
        <div style={{ padding: '16px', borderRadius: '10px', background: 'var(--card-hi)', border: '1px solid var(--surface)', marginBottom: '18px', display: 'grid', gridTemplateColumns: '1fr 160px 1fr auto', gap: '10px', alignItems: 'center' }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Trescon Holdings" style={S.input} />
          <select value={subcategory} onChange={e => setSubcategory(e.target.value)} style={S.input}>
            {LOGO_SUBCATEGORIES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} style={{ fontSize: '12px' }} />
          <button onClick={submit} disabled={submitting || !name.trim()} style={{ ...S.btnGhost, opacity: submitting || !name.trim() ? 0.5 : 1 }}>{submitting ? 'Adding…' : 'Add'}</button>
        </div>
      )}

      {logos.length === 0 && <div style={{ padding: '32px', textAlign: 'center', color: 'var(--ink3)', fontSize: '14px' }}>No logo assets yet.</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px' }}>
        {logos.map(l => (
          <div key={l.id} style={{ borderRadius: '10px', border: '1px solid var(--surface)', overflow: 'hidden' }}>
            <div style={{ height: '110px', background: l.subcategory === 'white' || l.subcategory === 'dark' ? '#1a1a1a' : 'var(--card-hi)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {l.file_url ? <img src={l.file_url} alt={l.name} style={{ maxWidth: '85%', maxHeight: '85%', objectFit: 'contain' }} /> : <span style={{ fontSize: '11px', color: 'var(--ink4)' }}>No file</span>}
            </div>
            <div style={{ padding: '10px 12px' }}>
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink)' }}>{l.name}</div>
              <div style={{ fontSize: '10.5px', color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                {l.subcategory} · {l.format ?? '—'}{l.vector_url ? ' · +SVG' : ''}
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <label style={{ ...S.btnGhost, cursor: busyId === l.id ? 'wait' : 'pointer' }}>
                  {busyId === l.id ? '…' : 'Replace'}
                  <input type="file" style={{ display: 'none' }} disabled={busyId === l.id}
                    onChange={e => { const f = e.target.files?.[0]; if (f) onReplaceFile(l.id, f); e.target.value = '' }} />
                </label>
                {!l.vector_url && (
                  <label style={{ ...S.btnGhost, cursor: busyId === l.id ? 'wait' : 'pointer' }}>
                    +SVG
                    <input type="file" accept="image/svg+xml" style={{ display: 'none' }} disabled={busyId === l.id}
                      onChange={e => { const f = e.target.files?.[0]; if (f) onReplaceFile(l.id, f, 'vector_url'); e.target.value = '' }} />
                  </label>
                )}
                <button onClick={() => onDelete(l.id)} disabled={busyId === l.id} style={S.btnDanger}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Colors tab ──────────────────────────────────────────────────────────────────
function ColorTab({ colors, busyId, onAdd, onPatch, onDelete }: {
  colors: Asset[]; busyId: string | null
  onAdd: (fd: FormData) => Promise<void>
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [subcategory, setSubcategory] = useState('primary')
  const [hex, setHex] = useState('#00A5A3')
  const [submitting, setSubmitting] = useState(false)

  function hexToRgb(h: string) {
    const m = h.replace('#', '')
    const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16)
    return { r, g, b }
  }

  async function submit() {
    if (!name.trim()) return
    setSubmitting(true)
    const fd = new FormData()
    fd.append('category', 'color')
    fd.append('name', name.trim())
    fd.append('subcategory', subcategory)
    fd.append('metadata', JSON.stringify({ hex, rgb: hexToRgb(hex) }))
    await onAdd(fd)
    setSubmitting(false); setAdding(false); setName('')
  }

  const grouped = COLOR_SUBCATEGORIES.map(sub => ({ sub, items: colors.filter(c => c.subcategory === sub) }))
  const other = colors.filter(c => !COLOR_SUBCATEGORIES.includes(c.subcategory ?? ''))

  return (
    <div style={S.card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={S.sectionTitle as React.CSSProperties}>Colors</div>
        <button onClick={() => setAdding(v => !v)} style={S.addBtn}>{adding ? 'Cancel' : '+ Add Colour'}</button>
      </div>

      {adding && (
        <div style={{ padding: '16px', borderRadius: '10px', background: 'var(--card-hi)', border: '1px solid var(--surface)', marginBottom: '18px', display: 'grid', gridTemplateColumns: '52px 1fr 160px 1fr auto', gap: '10px', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: hex, border: '2px solid var(--border)' }} />
            <input type="color" value={hex} onChange={e => setHex(e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }} />
          </div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sovereign Teal" style={S.input} />
          <select value={subcategory} onChange={e => setSubcategory(e.target.value)} style={S.input}>
            {COLOR_SUBCATEGORIES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input value={hex} onChange={e => setHex(e.target.value)} style={{ ...S.input, fontFamily: 'monospace' }} />
          <button onClick={submit} disabled={submitting || !name.trim()} style={{ ...S.btnGhost, opacity: submitting || !name.trim() ? 0.5 : 1 }}>{submitting ? 'Adding…' : 'Add'}</button>
        </div>
      )}

      {colors.length === 0 && <div style={{ padding: '32px', textAlign: 'center', color: 'var(--ink3)', fontSize: '14px' }}>No colour assets yet.</div>}

      {[...grouped, { sub: 'other', items: other }].filter(g => g.items.length > 0).map(g => (
        <div key={g.sub} style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>{g.sub}</div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {g.items.map(c => (
              <div key={c.id} style={{ width: '130px' }}>
                <div style={{ width: '100%', height: '70px', borderRadius: '10px', background: c.metadata?.hex ?? '#333', border: '1px solid var(--surface)', marginBottom: '6px' }} />
                <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--ink)' }}>{c.name}</div>
                <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--ink3)', marginBottom: '6px' }}>{(c.metadata?.hex ?? '').toUpperCase()}</div>
                <button onClick={() => onDelete(c.id)} disabled={busyId === c.id} style={{ ...S.btnDanger, fontSize: '10.5px', padding: '4px 8px' }}>Delete</button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Typography tab ──────────────────────────────────────────────────────────────
// Deliberately does NOT store a font-family name as free text. Every entry
// here references a real row in the platform Font Library (brand_fonts,
// already populated separately at /admin/branding/fonts) by id, so the
// preview always reflects the actual uploaded font file — and if that file
// is ever replaced in the library, every guideline entry that points at it
// updates automatically instead of silently drifting out of sync.
type BrandFontOption = { id: string; family_name: string; regular_url: string; bold_url: string | null; weights?: Record<number, string> | null }

const WEIGHT_OPTIONS = [
  { value: 100, label: 'Thin' }, { value: 200, label: 'Extra Light' }, { value: 300, label: 'Light' },
  { value: 400, label: 'Regular' }, { value: 500, label: 'Medium' }, { value: 600, label: 'Semibold' },
  { value: 700, label: 'Bold' }, { value: 800, label: 'Extra Bold' }, { value: 900, label: 'Black' },
]

// Mirrors app/admin/events/[id]/creative-templates/admin/page.tsx's
// availableWeightsFor() exactly — same font data shape, same fallback rule.
function availableWeightsFor(font: BrandFontOption | undefined): number[] {
  if (!font) return [400, 700]
  if (font.weights && Object.keys(font.weights).length > 0) return Object.keys(font.weights).map(Number)
  return [400, ...(font.bold_url ? [700] : [])]
}

// Mirrors LayerBoxOverlay.tsx's FontFaceStyles — one @font-face rule per
// distinct (family, weight) pair actually in use, injected as a plain
// <style> tag. No FontFace()/document.fonts.add() JS API needed; the
// browser handles fetching/parsing once the stylesheet is in the DOM.
function FontFaceStyles({ fonts }: { fonts: BrandFontOption[] }) {
  const rules: string[] = []
  for (const font of fonts) {
    const safeName = font.family_name.replace(/"/g, '')
    const urlsByWeight: Record<number, string> = font.weights ? { ...font.weights } : {}
    if (!urlsByWeight[400] && font.regular_url) urlsByWeight[400] = font.regular_url
    if (!urlsByWeight[700] && font.bold_url) urlsByWeight[700] = font.bold_url
    for (const [weight, url] of Object.entries(urlsByWeight)) {
      rules.push(`@font-face{font-family:"${safeName}";font-weight:${weight};src:url("${url}");}`)
    }
  }
  if (rules.length === 0) return null
  return <style>{rules.join('\n')}</style>
}

// Well-known slugs resolveFontForContentType() (app/lib/branding/brand-rules.ts)
// knows how to match and fall back between — deliberately not a DB enum,
// see corporate_brand_assets.sql's metadata comment. "Custom…" escapes to
// a free-text slug for anything that doesn't fit; the resolver just won't
// have a fallback bucket for it beyond "no default."
const CONTENT_TYPE_OPTIONS = [
  { value: 'heading', label: 'Heading' },
  { value: 'subheading', label: 'Subheading' },
  { value: 'body', label: 'Body copy' },
  { value: 'caption', label: 'Caption' },
  { value: 'button', label: 'Button / CTA' },
  { value: 'email', label: 'Email / Newsletter' },
  { value: 'quote', label: 'Quote / Testimonial' },
]

const DEFAULT_SAMPLE_HEADING = 'Your Partner for Accelerating Your Business'
const DEFAULT_SAMPLE_BODY = 'Trescon is a business events firm that hosts major conferences and summits focused on emerging technologies.'

function FontPreview({ font, weight, sampleHeading, sampleBody }: {
  font: BrandFontOption | undefined; weight: number; sampleHeading: string; sampleBody: string
}) {
  if (!font) return <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>Select a font from the library to preview it.</div>
  const family = `"${font.family_name.replace(/"/g, '')}"`
  return (
    <div>
      <div style={{ fontFamily: family, fontWeight: weight, fontSize: '26px', color: 'var(--ink)', lineHeight: 1.25, marginBottom: '8px' }}>{sampleHeading}</div>
      <div style={{ fontFamily: family, fontWeight: weight, fontSize: '14px', color: 'var(--ink2)', lineHeight: 1.6 }}>{sampleBody}</div>
    </div>
  )
}

function FontTab({ fonts, busyId, onAdd, onPatch, onDelete }: {
  fonts: Asset[]; busyId: string | null
  onAdd: (fd: FormData) => Promise<void>
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [library, setLibrary] = useState<BrandFontOption[]>([])
  const [loadingLibrary, setLoadingLibrary] = useState(true)

  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [contentType, setContentType] = useState('heading')
  const [customContentType, setCustomContentType] = useState('')
  const [brandFontId, setBrandFontId] = useState('')
  const [weight, setWeight] = useState(400)
  const [usageNotes, setUsageNotes] = useState('')
  const [sampleHeading, setSampleHeading] = useState(DEFAULT_SAMPLE_HEADING)
  const [sampleBody, setSampleBody] = useState(DEFAULT_SAMPLE_BODY)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch('/api/branding/fonts').then(r => r.json()).then(data => setLibrary(Array.isArray(data) ? data : [])).finally(() => setLoadingLibrary(false))
  }, [])

  const composingFont = library.find(f => f.id === brandFontId)

  async function submit() {
    if (!name.trim() || !brandFontId) return
    const resolvedContentType = contentType === 'custom' ? customContentType.trim() : contentType
    setSubmitting(true)
    const fd = new FormData()
    fd.append('category', 'font')
    fd.append('name', name.trim())
    fd.append('metadata', JSON.stringify({
      content_type: resolvedContentType || undefined,
      brand_font_id: brandFontId,
      family_name: composingFont?.family_name, // display fallback only — live lookups always prefer the id
      weight,
      usage_notes: usageNotes,
      sample_heading: sampleHeading,
      sample_body: sampleBody,
    }))
    await onAdd(fd)
    setSubmitting(false); setAdding(false); setName(''); setContentType('heading'); setCustomContentType(''); setBrandFontId(''); setUsageNotes('')
    setSampleHeading(DEFAULT_SAMPLE_HEADING); setSampleBody(DEFAULT_SAMPLE_BODY)
  }

  // Every font actually referenced by a saved entry, plus whichever one is
  // currently being composed in the add form — so both the saved cards and
  // the live add-form preview render correctly from one shared stylesheet.
  const referencedIds = new Set(fonts.map(f => f.metadata?.brand_font_id).filter(Boolean))
  if (brandFontId) referencedIds.add(brandFontId)
  const referencedFonts = library.filter(f => referencedIds.has(f.id))

  return (
    <div style={S.card}>
      <FontFaceStyles fonts={referencedFonts} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={S.sectionTitle as React.CSSProperties}>Typography</div>
        <button onClick={() => setAdding(v => !v)} style={S.addBtn}>{adding ? 'Cancel' : '+ Add Guideline'}</button>
      </div>
      <p style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: 0, marginBottom: '18px' }}>
        Each entry picks a real font from the <Link href="/admin/branding/fonts" style={{ color: 'var(--teal-mid)' }}>Font Library</Link> and documents which content it's for — matching how the brand guidelines document itself pairs each typeface with an &quot;about&quot; and an &quot;in use&quot; sample.
      </p>

      {loadingLibrary && <div style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '18px' }}>Loading font library…</div>}
      {!loadingLibrary && library.length === 0 && (
        <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'rgba(245,185,77,0.08)', border: '1px solid rgba(245,185,77,0.3)', color: 'var(--amber)', fontSize: '13px', marginBottom: '18px' }}>
          No fonts in the <Link href="/admin/branding/fonts" style={{ color: 'inherit', fontWeight: 700 }}>Font Library</Link> yet — upload the actual font files there first, then come back here to document how each one should be used.
        </div>
      )}

      {adding && (
        <div style={{ padding: '16px', borderRadius: '10px', background: 'var(--card-hi)', border: '1px solid var(--surface)', marginBottom: '18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <span style={S.label}>Content type</span>
              <select value={contentType} onChange={e => { setContentType(e.target.value); const opt = CONTENT_TYPE_OPTIONS.find(o => o.value === e.target.value); if (opt && !name.trim()) setName(opt.label) }} style={S.input}>
                {CONTENT_TYPE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                <option value="custom">Custom…</option>
              </select>
              {contentType === 'custom' && (
                <input value={customContentType} onChange={e => setCustomContentType(e.target.value)} placeholder="e.g. eyebrow_label" style={{ ...S.input, marginTop: '6px' }} />
              )}
            </div>
            <div>
              <span style={S.label}>Display name</span>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Headings, Body copy, Email/Newsletter" style={S.input} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: '10px', marginBottom: '10px' }}>
            <div>
              <span style={S.label}>Font (from library)</span>
              <select value={brandFontId} onChange={e => { setBrandFontId(e.target.value); const avail = availableWeightsFor(library.find(f => f.id === e.target.value)); if (!avail.includes(weight)) setWeight(avail[0] ?? 400) }} style={S.input}>
                <option value="">Select a font…</option>
                {library.map(f => <option key={f.id} value={f.id}>{f.family_name}</option>)}
              </select>
            </div>
            <div>
              <span style={S.label}>Weight</span>
              <select value={weight} onChange={e => setWeight(Number(e.target.value))} style={S.input}>
                {WEIGHT_OPTIONS.map(opt => {
                  const available = availableWeightsFor(composingFont).includes(opt.value)
                  return <option key={opt.value} value={opt.value} disabled={!available}>{opt.label}{available ? '' : ' — unavailable'}</option>
                })}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: '10px' }}>
            <span style={S.label}>Usage guidance</span>
            <textarea value={usageNotes} onChange={e => setUsageNotes(e.target.value)} rows={2} placeholder="Why this font, and when to use it — e.g. bold expressive style for capturing attention in headlines." style={S.textarea} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
            <div>
              <span style={S.label}>Sample heading</span>
              <input value={sampleHeading} onChange={e => setSampleHeading(e.target.value)} style={S.input} />
            </div>
            <div>
              <span style={S.label}>Sample body text</span>
              <input value={sampleBody} onChange={e => setSampleBody(e.target.value)} style={S.input} />
            </div>
          </div>

          <div style={{ padding: '16px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)', marginBottom: '14px' }}>
            <div style={{ ...S.label, marginBottom: '10px' }}>Preview</div>
            <FontPreview font={composingFont} weight={weight} sampleHeading={sampleHeading} sampleBody={sampleBody} />
          </div>

          <button onClick={submit} disabled={submitting || !name.trim() || !brandFontId} style={{ ...S.btnGhost, opacity: submitting || !name.trim() || !brandFontId ? 0.5 : 1 }}>{submitting ? 'Adding…' : 'Add'}</button>
        </div>
      )}

      {fonts.length === 0 && <div style={{ padding: '32px', textAlign: 'center', color: 'var(--ink3)', fontSize: '14px' }}>No typography guidelines yet.</div>}

      <div style={{ display: 'grid', gap: '14px' }}>
        {fonts.map(f => {
          const font = library.find(lf => lf.id === f.metadata?.brand_font_id)
          const fWeight = f.metadata?.weight ?? 400
          const weightLabel = WEIGHT_OPTIONS.find(w => w.value === fWeight)?.label ?? fWeight
          return (
            <div key={f.id} style={{ padding: '18px 20px', borderRadius: '10px', background: 'var(--card-hi)', border: '1px solid var(--surface)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--teal-mid)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{f.name}</div>
                    {f.metadata?.content_type && (
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink4)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '999px', padding: '2px 8px' }}>{f.metadata.content_type}</span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '2px' }}>
                    {font?.family_name ?? f.metadata?.family_name ?? 'Font not found in library'} · {weightLabel}
                    {!font && <span style={{ color: 'var(--red)' }}> — check it still exists in the Font Library</span>}
                  </div>
                </div>
                <button onClick={() => onDelete(f.id)} disabled={busyId === f.id} style={S.btnDanger}>Delete</button>
              </div>
              {f.metadata?.usage_notes && <div style={{ fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.6, marginBottom: '14px' }}>{f.metadata.usage_notes}</div>}
              <div style={{ padding: '14px 16px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <FontPreview font={font} weight={fWeight} sampleHeading={f.metadata?.sample_heading ?? DEFAULT_SAMPLE_HEADING} sampleBody={f.metadata?.sample_body ?? DEFAULT_SAMPLE_BODY} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Shown in the Import PDF tab right after an import — proposes the
// draft's font_content_types[] (app/lib/branding/extract-guidelines.ts) as
// "Add to library" cards. Never auto-adds anything: a human still has to
// pick the real brand_font_id (no reliable way to auto-match a Gemini-
// guessed Google Font name to an already-uploaded Font Library row) and
// click Add per suggestion — same manual gesture as FontTab's blank-form
// flow, just pre-filled. Reuses the existing addAsset() POST, no new API.
function SuggestedFontsPanel({ doc, existingFonts, onAdd }: {
  doc: GuidelinesDoc
  existingFonts: Asset[]
  onAdd: (fd: FormData) => Promise<void>
}) {
  const [library, setLibrary] = useState<BrandFontOption[]>([])
  const [picks, setPicks] = useState<Record<string, string>>({}) // content_type -> brand_font_id
  const [addedTypes, setAddedTypes] = useState<Set<string>>(new Set())
  const [submittingType, setSubmittingType] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/branding/fonts').then(r => r.json()).then(data => setLibrary(Array.isArray(data) ? data : []))
  }, [])

  const suggestions = doc.structured_json?.font_content_types ?? []
  const existingTypes = new Set(existingFonts.map(f => f.metadata?.content_type).filter(Boolean))
  const pending = suggestions.filter(s => !existingTypes.has(s.content_type) && !addedTypes.has(s.content_type))

  if (pending.length === 0) return null

  async function addSuggestion(s: FontContentTypeSuggestion) {
    const brandFontId = picks[s.content_type]
    if (!brandFontId) return
    const font = library.find(f => f.id === brandFontId)
    setSubmittingType(s.content_type)
    const fd = new FormData()
    fd.append('category', 'font')
    fd.append('name', s.content_type.charAt(0).toUpperCase() + s.content_type.slice(1))
    fd.append('source', 'pdf_import')
    fd.append('source_guidelines_id', doc.id)
    fd.append('metadata', JSON.stringify({
      content_type: s.content_type,
      brand_font_id: brandFontId,
      family_name: font?.family_name,
      weight: s.weight,
      usage_notes: s.usage_notes,
    }))
    await onAdd(fd)
    setAddedTypes(prev => new Set(prev).add(s.content_type))
    setSubmittingType(null)
  }

  return (
    <div style={S.card}>
      <div style={{ ...S.sectionTitle, marginBottom: '6px' }}>Suggested From Your Brand Book</div>
      <p style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6, marginTop: 0, marginBottom: '18px' }}>
        Gemini found these font roles in the PDF. Pick the matching font from your <Link href="/admin/branding/fonts" style={{ color: 'var(--teal-mid)' }}>Font Library</Link> (Gemini's guess is a starting point, not auto-matched) and add the ones you want to the Typography guidelines.
      </p>
      <div style={{ display: 'grid', gap: '10px' }}>
        {pending.map(s => (
          <div key={s.content_type} style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: '10px', alignItems: 'center', padding: '12px 14px', borderRadius: '10px', background: 'var(--card-hi)', border: '1px solid var(--surface)' }}>
            <div>
              <div style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--ink)', textTransform: 'capitalize' }}>{s.content_type}</div>
              <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>Gemini guess: {s.google_font_name || '—'}</div>
            </div>
            <select value={picks[s.content_type] ?? ''} onChange={e => setPicks(prev => ({ ...prev, [s.content_type]: e.target.value }))} style={S.input}>
              <option value="">Select a font…</option>
              {library.map(f => <option key={f.id} value={f.id}>{f.family_name}</option>)}
            </select>
            <button onClick={() => addSuggestion(s)} disabled={!picks[s.content_type] || submittingType === s.content_type} style={{ ...S.btnGhost, opacity: !picks[s.content_type] || submittingType === s.content_type ? 0.5 : 1 }}>
              {submittingType === s.content_type ? 'Adding…' : 'Add to library'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Brand Guidelines detail (full extraction, read-only) ────────────────────────
// Shows everything Gemini pulled from the PDF that ISN'T already a browsable
// asset elsewhere (Colors/Typography/Logos/Patterns/Voice tabs each hold the
// actual usable data) — the descriptive layer underneath: brand identity,
// logo rules, type scale, imagery direction, grid/spacing tokens, voice
// keywords. Purely informational; nothing here is editable in place — a
// correction means re-uploading a revised PDF (new version).
function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={S.card}>
      <div style={{ ...S.sectionTitle, marginBottom: '14px' }}>{title}</div>
      <div style={{ display: 'grid', gap: '14px' }}>{children}</div>
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div>
      <span style={S.label}>{label}</span>
      <div style={{ fontSize: '13.5px', color: 'var(--ink2)', lineHeight: 1.6 }}>{value}</div>
    </div>
  )
}

function BulletList({ label, items }: { label: string; items?: string[] }) {
  if (!items || items.length === 0) return null
  return (
    <div>
      <span style={S.label}>{label}</span>
      <ul style={{ margin: 0, paddingLeft: '18px', display: 'grid', gap: '4px' }}>
        {items.map((item, i) => <li key={i} style={{ fontSize: '13.5px', color: 'var(--ink2)', lineHeight: 1.5 }}>{item}</li>)}
      </ul>
    </div>
  )
}

function GuidelinesDetail({ doc }: { doc: GuidelinesDoc }) {
  const g = doc.structured_json
  if (!g) return null

  const hasIdentity = g.brand_name || g.positioning_statement || g.brand_category || g.brand_vision || g.brand_mission || (g.brand_archetypes?.length ?? 0) > 0
  const hasLogo = g.logo_concept || g.logo_min_size_digital || g.logo_min_size_print || g.logo_clear_space || g.logo_cobranding_rules || (g.logo_donts?.length ?? 0) > 0 || g.logo_notes
  const hasColor = g.color_usage_rules || g.color_contrast_min
  const hasType = g.type_scale_ratio || (g.type_scale?.length ?? 0) > 0 || (g.type_rules_dos?.length ?? 0) > 0 || (g.type_rules_donts?.length ?? 0) > 0
  const hasPattern = (g.pattern_assets?.length ?? 0) > 0
  const hasImagery = (g.imagery_philosophy?.length ?? 0) > 0 || g.photography_direction?.subjects?.length || g.photography_direction?.dos?.length || g.photography_direction?.donts?.length || (g.overlay_types?.length ?? 0) > 0 || (g.imagery_treatments?.length ?? 0) > 0
  const hasIcon = g.icon_system || g.icon_grid_size || g.icon_rules
  const hasGrid = g.grid_base_px || g.grid_columns || (g.breakpoints?.length ?? 0) > 0 || (g.spacing_tokens?.length ?? 0) > 0
  const hasVoice = (g.tone?.length ?? 0) > 0 || (g.style_keywords?.length ?? 0) > 0 || (g.key_messages?.length ?? 0) > 0

  return (
    <>
      {hasIdentity && (
        <DetailSection title="Brand Identity">
          <Field label="Brand Name" value={g.brand_name} />
          <Field label="Positioning Statement" value={g.positioning_statement} />
          <Field label="Category" value={g.brand_category} />
          <Field label="Vision" value={g.brand_vision} />
          <Field label="Mission" value={g.brand_mission} />
          {(g.brand_archetypes?.length ?? 0) > 0 && (
            <div>
              <span style={S.label}>Brand Archetypes</span>
              <div style={{ display: 'grid', gap: '8px' }}>
                {g.brand_archetypes!.map((a, i) => (
                  <div key={i} style={{ fontSize: '13.5px', color: 'var(--ink2)', lineHeight: 1.5 }}>
                    <span style={{ fontWeight: 800, color: 'var(--ink)' }}>{a.name}</span>
                    <span style={{ color: 'var(--ink4)', textTransform: 'uppercase', fontSize: '10.5px', fontWeight: 700, marginLeft: '8px' }}>{a.role}</span>
                    {a.description && <div>{a.description}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </DetailSection>
      )}

      {hasLogo && (
        <DetailSection title="Logo Guidelines">
          <p style={{ fontSize: '12px', color: 'var(--ink4)', margin: 0 }}>Actual logo files live in the Logos tab — this is the usage guidance around them.</p>
          <Field label="Concept" value={g.logo_concept} />
          <Field label="Minimum Size — Digital" value={g.logo_min_size_digital} />
          <Field label="Minimum Size — Print" value={g.logo_min_size_print} />
          <Field label="Clear Space" value={g.logo_clear_space} />
          <Field label="Co-Branding Rules" value={g.logo_cobranding_rules} />
          <BulletList label="Don'ts" items={g.logo_donts} />
          <Field label="Additional Notes" value={g.logo_notes} />
        </DetailSection>
      )}

      {hasColor && (
        <DetailSection title="Color Guidelines">
          <p style={{ fontSize: '12px', color: 'var(--ink4)', margin: 0 }}>Actual swatches live in the Colors tab — this is the usage guidance around them.</p>
          <Field label="Usage Rules" value={g.color_usage_rules} />
          <Field label="Minimum Contrast Ratio" value={g.color_contrast_min} />
        </DetailSection>
      )}

      {hasType && (
        <DetailSection title="Typography Guidelines">
          <p style={{ fontSize: '12px', color: 'var(--ink4)', margin: 0 }}>Actual fonts live in the Typography tab — this is the type scale and rules around them.</p>
          <Field label="Type Scale Ratio" value={g.type_scale_ratio} />
          {(g.type_scale?.length ?? 0) > 0 && (
            <div>
              <span style={S.label}>Type Scale</span>
              <div style={{ display: 'grid', gap: '4px' }}>
                {g.type_scale!.map((t, i) => (
                  <div key={i} style={{ fontSize: '13px', color: 'var(--ink2)', display: 'flex', gap: '10px' }}>
                    <span style={{ fontWeight: 800, color: 'var(--ink)', minWidth: '90px' }}>{t.level}</span>
                    <span>{t.size_px}px · weight {t.weight} · {t.line_height} line-height</span>
                    {t.usage && <span style={{ color: 'var(--ink4)' }}>— {t.usage}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <BulletList label="Do's" items={g.type_rules_dos} />
          <BulletList label="Don'ts" items={g.type_rules_donts} />
        </DetailSection>
      )}

      {hasPattern && (
        <DetailSection title="Pattern Guidelines">
          <p style={{ fontSize: '12px', color: 'var(--ink4)', margin: 0 }}>Actual pattern files live in the Patterns & Voice tab — this is where/how to use them.</p>
          <div style={{ display: 'grid', gap: '8px' }}>
            {g.pattern_assets!.map((p, i) => (
              <div key={i} style={{ fontSize: '13.5px', color: 'var(--ink2)', lineHeight: 1.5 }}>
                <span style={{ fontWeight: 800, color: 'var(--ink)' }}>{p.name}</span>
                {p.background_tone && <span style={{ color: 'var(--ink4)', fontSize: '11px', marginLeft: '8px' }}>({p.background_tone} backgrounds)</span>}
                {p.usage_context && <div>{p.usage_context}</div>}
              </div>
            ))}
          </div>
        </DetailSection>
      )}

      {hasImagery && (
        <DetailSection title="Imagery & Photography">
          <BulletList label="Imagery Philosophy" items={g.imagery_philosophy} />
          <BulletList label="Photography Subjects" items={g.photography_direction?.subjects} />
          <BulletList label="Photography Do's" items={g.photography_direction?.dos} />
          <BulletList label="Photography Don'ts" items={g.photography_direction?.donts} />
          <BulletList label="Overlay Types" items={g.overlay_types} />
          {(g.imagery_treatments?.length ?? 0) > 0 && (
            <div>
              <span style={S.label}>Imagery Treatments</span>
              <div style={{ display: 'grid', gap: '8px' }}>
                {g.imagery_treatments!.map((t, i) => (
                  <div key={i} style={{ fontSize: '13.5px', color: 'var(--ink2)', lineHeight: 1.5 }}>
                    <span style={{ fontWeight: 800, color: 'var(--ink)' }}>{t.name}</span>
                    {t.description && <div>{t.description}</div>}
                    {t.use_cases?.length > 0 && <div style={{ color: 'var(--ink4)', fontSize: '12px' }}>Use cases: {t.use_cases.join(', ')}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </DetailSection>
      )}

      {hasIcon && (
        <DetailSection title="Iconography">
          <Field label="Icon System" value={g.icon_system} />
          <Field label="Grid Size" value={g.icon_grid_size} />
          <Field label="Rules" value={g.icon_rules} />
        </DetailSection>
      )}

      {hasGrid && (
        <DetailSection title="Grid & Spacing">
          <Field label="Base Unit" value={g.grid_base_px ? `${g.grid_base_px}px` : null} />
          <Field label="Grid Columns" value={g.grid_columns} />
          {(g.breakpoints?.length ?? 0) > 0 && (
            <div>
              <span style={S.label}>Breakpoints</span>
              <div style={{ display: 'grid', gap: '2px' }}>
                {g.breakpoints!.map((b, i) => <div key={i} style={{ fontSize: '13px', color: 'var(--ink2)' }}>{b.name}: {b.min_px}–{b.max_px}px</div>)}
              </div>
            </div>
          )}
          {(g.spacing_tokens?.length ?? 0) > 0 && (
            <div>
              <span style={S.label}>Spacing Tokens</span>
              <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                {g.spacing_tokens!.map((s, i) => <div key={i} style={{ fontSize: '13px', color: 'var(--ink2)' }}>{s.name}: {s.value_px}px</div>)}
              </div>
            </div>
          )}
        </DetailSection>
      )}

      {hasVoice && (
        <DetailSection title="Voice & Messaging">
          <p style={{ fontSize: '12px', color: 'var(--ink4)', margin: 0 }}>Tagline and boilerplate copy live in the Patterns & Voice tab — this is the broader tone guidance.</p>
          <BulletList label="Tone" items={g.tone} />
          <BulletList label="Style Keywords" items={g.style_keywords} />
          <BulletList label="Key Messages" items={g.key_messages} />
        </DetailSection>
      )}
    </>
  )
}

// ── Patterns & Voice tab ─────────────────────────────────────────────────────────
function PatternVoiceTab({ patterns, voices, busyId, onAdd, onPatch, onReplaceFile, onDelete }: {
  patterns: Asset[]; voices: Asset[]; busyId: string | null
  onAdd: (fd: FormData) => Promise<void>
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<void>
  onReplaceFile: (id: string, file: File) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [addingVoice, setAddingVoice] = useState(false)
  const [voiceName, setVoiceName] = useState('')
  const [voiceText, setVoiceText] = useState('')
  const [addingPattern, setAddingPattern] = useState(false)
  const [patternName, setPatternName] = useState('')
  const [patternDesc, setPatternDesc] = useState('')
  const [patternFile, setPatternFile] = useState<File | null>(null)

  async function submitVoice() {
    if (!voiceName.trim()) return
    const fd = new FormData()
    fd.append('category', 'voice')
    fd.append('name', voiceName.trim())
    fd.append('metadata', JSON.stringify({ text: voiceText }))
    await onAdd(fd)
    setAddingVoice(false); setVoiceName(''); setVoiceText('')
  }

  async function submitPattern() {
    if (!patternName.trim()) return
    const fd = new FormData()
    fd.append('category', 'pattern')
    fd.append('name', patternName.trim())
    fd.append('metadata', JSON.stringify({ description: patternDesc }))
    if (patternFile) fd.append('file', patternFile)
    await onAdd(fd)
    setAddingPattern(false); setPatternName(''); setPatternDesc(''); setPatternFile(null)
  }

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={S.sectionTitle as React.CSSProperties}>Voice & Tagline</div>
          <button onClick={() => setAddingVoice(v => !v)} style={S.addBtn}>{addingVoice ? 'Cancel' : '+ Add'}</button>
        </div>
        {addingVoice && (
          <div style={{ padding: '16px', borderRadius: '10px', background: 'var(--card-hi)', border: '1px solid var(--surface)', marginBottom: '18px' }}>
            <input value={voiceName} onChange={e => setVoiceName(e.target.value)} placeholder="e.g. Tagline" style={{ ...S.input, marginBottom: '10px' }} />
            <textarea value={voiceText} onChange={e => setVoiceText(e.target.value)} placeholder="Text" rows={3} style={{ ...S.textarea, marginBottom: '10px' }} />
            <button onClick={submitVoice} disabled={!voiceName.trim()} style={S.btnGhost}>Add</button>
          </div>
        )}
        {voices.length === 0 && <div style={{ padding: '20px', textAlign: 'center', color: 'var(--ink3)', fontSize: '14px' }}>No voice assets yet.</div>}
        <div style={{ display: 'grid', gap: '10px' }}>
          {voices.map(v => (
            <div key={v.id} style={{ padding: '14px 16px', borderRadius: '10px', background: 'var(--card-hi)', border: '1px solid var(--surface)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink)' }}>{v.name}</div>
                <button onClick={() => onDelete(v.id)} disabled={busyId === v.id} style={{ ...S.btnDanger, fontSize: '10.5px', padding: '4px 8px' }}>Delete</button>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.6 }}>{v.metadata?.text}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={S.sectionTitle as React.CSSProperties}>Patterns</div>
          <button onClick={() => setAddingPattern(v => !v)} style={S.addBtn}>{addingPattern ? 'Cancel' : '+ Add'}</button>
        </div>
        <BatchUpload category="pattern" onAdd={onAdd} accept="image/*" />
        {addingPattern && (
          <div style={{ padding: '16px', borderRadius: '10px', background: 'var(--card-hi)', border: '1px solid var(--surface)', marginBottom: '18px' }}>
            <input value={patternName} onChange={e => setPatternName(e.target.value)} placeholder="Pattern name" style={{ ...S.input, marginBottom: '10px' }} />
            <textarea value={patternDesc} onChange={e => setPatternDesc(e.target.value)} placeholder="Description / usage" rows={2} style={{ ...S.textarea, marginBottom: '10px' }} />
            <input type="file" accept="image/*" onChange={e => setPatternFile(e.target.files?.[0] ?? null)} style={{ marginBottom: '10px' }} />
            <div><button onClick={submitPattern} disabled={!patternName.trim()} style={S.btnGhost}>Add</button></div>
          </div>
        )}
        {patterns.length === 0 && <div style={{ padding: '20px', textAlign: 'center', color: 'var(--ink3)', fontSize: '14px' }}>No pattern assets yet.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '14px' }}>
          {patterns.map(p => (
            <div key={p.id} style={{ borderRadius: '10px', border: '1px solid var(--surface)', overflow: 'hidden' }}>
              <div style={{ height: '100px', background: 'var(--card-hi)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {p.file_url ? <img src={p.file_url} alt={p.name} style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }} /> : <span style={{ fontSize: '11px', color: 'var(--ink4)' }}>No file</span>}
              </div>
              <div style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink)', marginBottom: '4px' }}>{p.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--ink3)', marginBottom: '8px' }}>{p.metadata?.description}</div>
                <button onClick={() => onDelete(p.id)} disabled={busyId === p.id} style={{ ...S.btnDanger, fontSize: '10.5px', padding: '4px 8px' }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Collateral Reference tab ─────────────────────────────────────────────────────
function CollateralTab({ items, busyId, onAdd, onDelete }: {
  items: Asset[]; busyId: string | null
  onAdd: (fd: FormData) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (!name.trim() || !file) return
    setSubmitting(true)
    const fd = new FormData()
    fd.append('category', 'collateral_reference')
    fd.append('name', name.trim())
    fd.append('file', file)
    await onAdd(fd)
    setSubmitting(false); setAdding(false); setName(''); setFile(null)
  }

  return (
    <div style={S.card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={S.sectionTitle as React.CSSProperties}>Collateral Reference</div>
        <button onClick={() => setAdding(v => !v)} style={S.addBtn}>{adding ? 'Cancel' : '+ Add Reference'}</button>
      </div>
      <p style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: 0, marginBottom: '18px' }}>
        Visual reference only — business cards, letterhead, social covers, and other applied examples from the brand guidelines. Not used programmatically anywhere.
      </p>

      <BatchUpload category="collateral_reference" onAdd={onAdd} accept="image/*" />

      {adding && (
        <div style={{ padding: '16px', borderRadius: '10px', background: 'var(--card-hi)', border: '1px solid var(--surface)', marginBottom: '18px', display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '10px', alignItems: 'center' }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Business Card" style={S.input} />
          <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} style={{ fontSize: '12px' }} />
          <button onClick={submit} disabled={submitting || !name.trim() || !file} style={{ ...S.btnGhost, opacity: submitting ? 0.5 : 1 }}>{submitting ? 'Adding…' : 'Add'}</button>
        </div>
      )}

      {items.length === 0 && <div style={{ padding: '32px', textAlign: 'center', color: 'var(--ink3)', fontSize: '14px' }}>No reference images yet.</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px' }}>
        {items.map(c => (
          <div key={c.id} style={{ borderRadius: '10px', border: '1px solid var(--surface)', overflow: 'hidden' }}>
            <div style={{ height: '130px', background: 'var(--card-hi)' }}>
              {c.file_url && <img src={c.file_url} alt={c.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <div style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)' }}>{c.name}</div>
              <button onClick={() => onDelete(c.id)} disabled={busyId === c.id} style={{ ...S.btnDanger, fontSize: '10.5px', padding: '4px 8px' }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Templates tab ─────────────────────────────────────────────────────────────
// Unlike every other category on this page, these are actually CONSUMED by
// app code — see app/lib/branding/email-header.ts. Each slot is defined
// here (not user-created) since the app needs to know the exact
// subcategory key to look up; more slots get added here as more template
// types are wired into the app, same pattern as LOGO_SUBCATEGORIES.
const TEMPLATE_SLOTS: { slot: string; label: string; description: string; aspect: string }[] = [
  {
    slot: 'email_header',
    label: 'Email Header',
    description: 'Shown at the top of every notification email sent to event stakeholders — form-submission confirmations and announcement approval requests — plus SAE\'s internal submission/approval alerts, and as the header on the public stakeholder form page. The default for any landing page or form unless that page defines its own header.',
    aspect: '1200 × 250px recommended (displays full-width, so keep text/logo away from the very edges)',
  },
  {
    slot: 'favicon',
    label: 'Favicon',
    description: 'The default browser-tab icon for any public-facing page (event microsites, landing pages) that doesn\'t define its own.',
    aspect: '32 × 32px PNG',
  },
  {
    slot: 'social_share_image',
    label: 'Social Share Image',
    description: 'The default image shown in link previews (Slack, WhatsApp, LinkedIn, etc.) for event pages and any shared document link (e.g. post-event reports) that doesn\'t define its own.',
    aspect: '1200 × 630px (standard OG image size)',
  },
]

function TemplateTab({ templates, busyId, onAdd, onReplaceFile, onDelete }: {
  templates: Asset[]; busyId: string | null
  onAdd: (fd: FormData) => Promise<void>
  onReplaceFile: (id: string, file: File) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null)

  async function uploadToSlot(slotDef: typeof TEMPLATE_SLOTS[number], file: File) {
    setUploadingSlot(slotDef.slot)
    const existing = templates.find(t => t.subcategory === slotDef.slot)
    if (existing) {
      await onReplaceFile(existing.id, file)
    } else {
      const fd = new FormData()
      fd.append('category', 'template')
      fd.append('name', slotDef.label)
      fd.append('subcategory', slotDef.slot)
      fd.append('file', file)
      await onAdd(fd)
    }
    setUploadingSlot(null)
  }

  return (
    <div style={S.card}>
      <div style={S.sectionTitle}>Templates</div>
      <p style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: 0, marginBottom: '20px' }}>
        Unlike everything else on this page, these are actually used by the app — not just reference. Uploading a new file replaces the current one immediately, everywhere it&apos;s used.
      </p>
      <div style={{ display: 'grid', gap: '16px' }}>
        {TEMPLATE_SLOTS.map(slotDef => {
          const current = templates.find(t => t.subcategory === slotDef.slot)
          const busy = busyId === current?.id || uploadingSlot === slotDef.slot
          return (
            <div key={slotDef.slot} style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '16px', padding: '16px', borderRadius: '10px', background: 'var(--card-hi)', border: '1px solid var(--surface)' }}>
              <div style={{ height: '90px', borderRadius: '8px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {current?.file_url ? <img src={current.file_url} alt={slotDef.label} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: '11px', color: '#999' }}>Not set</span>}
              </div>
              <div>
                <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>{slotDef.label}</div>
                <div style={{ fontSize: '12px', color: 'var(--ink3)', lineHeight: 1.55, marginBottom: '6px' }}>{slotDef.description}</div>
                <div style={{ fontSize: '11px', color: 'var(--ink4)', marginBottom: '10px' }}>{slotDef.aspect}</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <label style={{ ...S.btnGhost, cursor: busy ? 'wait' : 'pointer' }}>
                    {busy ? 'Uploading…' : current ? 'Replace' : 'Upload'}
                    <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} disabled={busy}
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadToSlot(slotDef, f); e.target.value = '' }} />
                  </label>
                  {current && (
                    <button onClick={() => onDelete(current.id)} disabled={busy} style={S.btnDanger}>Remove</button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
