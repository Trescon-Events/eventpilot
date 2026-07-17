'use client'

import { useState, useRef } from 'react'

/* ── per-card accent colours ──
   NOTE: `.color` values stay literal (brightened) hex, not var() — they're
   concatenated with a runtime alpha suffix (`${accent}10`) in dropZone()
   below, which only works with a real hex string. Values match the
   equivalent CSS var (teal-mid / indigo / amber / purple). */
const ACCENTS = {
  teal:   { color: '#12C9BD', bg: 'rgba(18,201,189,0.08)',  border: 'rgba(18,201,189,0.25)',  stripe: '#12C9BD' },
  indigo: { color: '#818CF8', bg: 'rgba(129,140,248,0.08)', border: 'rgba(129,140,248,0.25)', stripe: '#818CF8' },
  amber:  { color: '#F5B94D', bg: 'rgba(245,185,77,0.08)',  border: 'rgba(245,185,77,0.25)',  stripe: '#F5B94D' },
  purple: { color: '#A78BFA', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.25)', stripe: '#A78BFA' },
}

const card = (accent: keyof typeof ACCENTS): React.CSSProperties => ({
  background: 'var(--card)',
  border: `1px solid ${ACCENTS[accent].border}`,
  borderRadius: '14px',
  borderTop: `3px solid ${ACCENTS[accent].stripe}`,
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
})

const dropZone = (active: boolean, accent: string): React.CSSProperties => ({
  border: `1px dashed ${active ? accent : 'var(--border)'}`,
  background: active ? `${accent}10` : 'var(--border-light)',
  borderRadius: '10px',
  padding: '32px 24px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  textAlign: 'center',
  transition: 'all 0.15s',
})

const btn = (disabled: boolean, accent: string): React.CSSProperties => ({
  padding: '11px 20px',
  borderRadius: '9px',
  background: disabled ? 'var(--border-light)' : accent,
  color: disabled ? 'var(--ink4)' : 'var(--surface)',
  border: 'none',
  cursor: disabled ? 'default' : 'pointer',
  fontSize: '14px',
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  width: '100%',
  marginTop: 'auto',
})

export default function LeadExtractionPage() {
  /* ── File Extractor state ── */
  const [file1, setFile1]         = useState<File | null>(null)
  const [drag1, setDrag1]         = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [fileRes, setFileRes]     = useState<any[]>([])
  const [fileErr, setFileErr]     = useState<string | null>(null)
  const [fileMeta, setFileMeta]   = useState<any>(null)
  const fileRef1                  = useRef<HTMLInputElement>(null)

  /* ── URL Extractor state ── */
  const [urlText, setUrlText]       = useState('')
  const [extracting, setExtracting] = useState(false)
  const [urlRes, setUrlRes]         = useState<any[]>([])
  const [urlSetup, setUrlSetup]     = useState(false)

  /* ── Website Finder — Company Names state ── */
  const [file2, setFile2]         = useState<File | null>(null)
  const [drag2, setDrag2]         = useState(false)
  const [finding, setFinding]     = useState(false)
  const [findRes, setFindRes]     = useState<any[]>([])
  const fileRef2                  = useRef<HTMLInputElement>(null)

  /* ── Website Finder — Directory URLs state ── */
  const [file3, setFile3]           = useState<File | null>(null)
  const [drag3, setDrag3]           = useState(false)
  const [dirParsing, setDirParsing] = useState(false)
  const [dirText, setDirText]       = useState('')
  const [dirExtracting, setDirExtracting] = useState(false)
  const [dirRes, setDirRes]         = useState<any[]>([])
  const [dirSetup, setDirSetup]     = useState(false)
  const fileRef3                    = useRef<HTMLInputElement>(null)

  /* ── handlers ── */
  const analyzeFile = async (
    f: File | null,
    setter: (v: any[]) => void,
    setLoading: (v: boolean) => void,
    setErr?: (v: string | null) => void,
    setMeta?: (v: any) => void,
  ) => {
    if (!f) return
    setLoading(true)
    setErr?.(null)
    setMeta?.(null)
    try {
      const form = new FormData()
      form.append('file', f)
      const res  = await fetch('/api/data/extract/file', { method: 'POST', body: form })
      const data = await res.json()
      if (data.error) {
        setErr?.(data.error)
        setter([])
      } else {
        setter(data.results ?? [])
        if (data.meta) setMeta?.(data.meta)
        if ((data.results ?? []).length === 0) {
          setErr?.(`No records extracted. ${data.warning ?? 'Check that the file has a Company Name or Website column.'}`)
        }
      }
    } catch (e: any) {
      setErr?.(e.message ?? 'Request failed')
    } finally { setLoading(false) }
  }

  const extractUrls = async (text: string, setter: (v: any[]) => void, setLoading: (v: boolean) => void, setSetup: (v: boolean) => void) => {
    const urls = text.split('\n').map(u => u.trim()).filter(Boolean)
    if (!urls.length) return
    setLoading(true)
    setSetup(false)
    try {
      const res  = await fetch('/api/data/extract/url', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      })
      const data = await res.json()
      if (data.setup_required) { setSetup(true); return }
      setter(data.results ?? [])
    } finally { setLoading(false) }
  }

  /* Parse Excel → extract URLs into the dirText textarea */
  const parseDirFile = async (f: File | null) => {
    if (!f) return
    setDirParsing(true)
    try {
      const form = new FormData()
      form.append('file', f)
      const res  = await fetch('/api/data/extract/file', { method: 'POST', body: form })
      const data = await res.json()
      const urls = (data.results ?? [])
        .map((r: any) => r.website || r.raw || '')
        .filter((u: string) => u.startsWith('http'))
        .join('\n')
      setDirText(urls)
    } finally { setDirParsing(false) }
  }

  const allResults = [...fileRes, ...urlRes, ...findRes, ...dirRes]

  // All columns from the richest result set (fileRes has _row with full data)
  const allRawKeys: string[] = fileRes.length > 0 && fileRes[0]?._row
    ? Object.keys(fileRes[0]._row)
    : []
  const useRichTable = allRawKeys.length > 2

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', fontFamily: 'system-ui, sans-serif' }}>

      {/* Page header */}
      <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: '20px 28px' }}>
        <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--ink)', marginBottom: '3px', letterSpacing: '-0.3px' }}>Lead Extraction</div>
        <div style={{ fontSize: '15px', color: 'var(--ink3)' }}>Extract company names and website URLs from multiple sources</div>
      </div>

      {/* 2×2 grid */}
      <div style={{ padding: '24px 28px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', maxWidth: '1100px' }}>

        {/* Card 1 — Company & URL Finder - Files */}
        <div style={card('teal')}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: ACCENTS.teal.bg, border: `1px solid ${ACCENTS.teal.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" fill="none" stroke={ACCENTS.teal.color} strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>Company & URL Finder — Files</div>
              <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '2px' }}>PDF, Image, Excel, Word files</div>
            </div>
          </div>

          <input ref={fileRef1} type="file" accept=".pdf,.xlsx,.xls,.csv,.txt,.docx,.doc,.png,.jpg,.jpeg" style={{ display: 'none' }} onChange={e => setFile1(e.target.files?.[0] ?? null)} />

          <div
            style={dropZone(drag1, ACCENTS.teal.color)}
            onDragOver={e => { e.preventDefault(); setDrag1(true) }}
            onDragLeave={() => setDrag1(false)}
            onDrop={e => { e.preventDefault(); setDrag1(false); setFile1(e.dataTransfer.files[0] ?? null) }}
            onClick={() => fileRef1.current?.click()}
          >
            <svg width="28" height="28" fill="none" stroke="var(--ink4)" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24" style={{ marginBottom: '10px' }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            {file1 ? (
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>{file1.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--ink4)', marginTop: '3px' }}>Click to change</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '14px', color: 'var(--ink)', fontWeight: 500 }}>Drop file here</div>
                <div style={{ fontSize: '13px', color: 'var(--ink4)', marginTop: '3px' }}>or click to browse</div>
              </div>
            )}
          </div>

          <button onClick={() => analyzeFile(file1, setFileRes, setAnalyzing, setFileErr, setFileMeta)} disabled={!file1 || analyzing} style={btn(!file1 || analyzing, ACCENTS.teal.color)}>
            {analyzing ? 'Analyzing…' : 'Analyze File →'}
          </button>
          {fileErr && (
            <div style={{ padding: '10px 12px', background: 'rgba(241,102,122,0.06)', border: '1px solid rgba(241,102,122,0.2)', borderRadius: '8px', fontSize: '13px', color: 'var(--red)' }}>
              {fileErr}
            </div>
          )}
          {fileMeta && (
            <div style={{ padding: '10px 12px', background: 'rgba(18,201,189,0.06)', border: '1px solid rgba(18,201,189,0.2)', borderRadius: '8px', fontSize: '12px', color: 'var(--ink)' }}>
              <div style={{ fontWeight: 700, marginBottom: '4px', color: 'var(--teal-mid)' }}>Column mapping used</div>
              <div>Company col: <strong>{fileMeta.name_col_used}</strong></div>
              <div>Website col: <strong>{fileMeta.website_col_used}</strong></div>
              <div style={{ marginTop: '4px', color: 'var(--ink3)' }}>All headers: {fileMeta.headers_found?.join(', ')}</div>
            </div>
          )}
          {fileRes.length > 0 && <div style={{ fontSize: '13px', color: 'var(--success)', fontWeight: 600 }}>{fileRes.length} records extracted</div>}
        </div>

        {/* Card 2 — URL Extractor */}
        <div style={card('indigo')}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: ACCENTS.indigo.bg, border: `1px solid ${ACCENTS.indigo.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" fill="none" stroke={ACCENTS.indigo.color} strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>URL Extractor</div>
              <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '2px' }}>Extract from web pages</div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '8px' }}>Paste URLs (one per line):</div>
            <textarea
              value={urlText}
              onChange={e => setUrlText(e.target.value)}
              placeholder={'https://event.com/sponsors\nhttps://conference.io/exhibitors'}
              rows={7}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: '10px',
                border: '1px solid var(--border)', fontSize: '13px', color: 'var(--ink)',
                background: 'var(--border-light)', resize: 'vertical', outline: 'none',
                fontFamily: 'system-ui', lineHeight: 1.6, boxSizing: 'border-box',
              }}
            />
          </div>

          {urlSetup && (
            <div style={{ padding: '12px 14px', background: 'rgba(245,185,77,0.06)', border: '1px solid rgba(245,185,77,0.2)', borderRadius: '9px', fontSize: '13px', color: 'var(--amber)' }}>
              Add <code style={{ background: 'rgba(245,185,77,0.1)', padding: '1px 5px', borderRadius: '4px' }}>FIRECRAWL_API_KEY</code> to .env.local to enable URL scraping.
            </div>
          )}

          <button onClick={() => extractUrls(urlText, setUrlRes, setExtracting, setUrlSetup)} disabled={!urlText.trim() || extracting} style={btn(!urlText.trim() || extracting, ACCENTS.indigo.color)}>
            {extracting ? 'Extracting…' : 'Extract Companies →'}
          </button>
          {urlRes.length > 0 && <div style={{ fontSize: '13px', color: 'var(--success)', fontWeight: 600 }}>{urlRes.length} companies extracted</div>}
        </div>

        {/* Card 3 — Website Finder from Company Names */}
        <div style={card('amber')}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: ACCENTS.amber.bg, border: `1px solid ${ACCENTS.amber.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" fill="none" stroke={ACCENTS.amber.color} strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>Website Finder — From Company Names</div>
              <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '2px' }}>Finds Company URLs of submitted company names using online/AI search</div>
            </div>
          </div>

          <input ref={fileRef2} type="file" accept=".xlsx,.xls,.csv,.txt,.docx,.doc" style={{ display: 'none' }} onChange={e => setFile2(e.target.files?.[0] ?? null)} />

          <div
            style={{ ...dropZone(drag2, ACCENTS.amber.color), padding: '24px' }}
            onDragOver={e => { e.preventDefault(); setDrag2(true) }}
            onDragLeave={() => setDrag2(false)}
            onDrop={e => { e.preventDefault(); setDrag2(false); setFile2(e.dataTransfer.files[0] ?? null) }}
            onClick={() => fileRef2.current?.click()}
          >
            <svg width="22" height="22" fill="none" stroke="var(--ink4)" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24" style={{ marginBottom: '8px' }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span style={{ fontSize: '14px', color: 'var(--ink)', fontWeight: 500 }}>
              {file2 ? file2.name : <>Drop file or <span style={{ color: 'var(--teal-mid)', fontWeight: 600 }}>browse</span></>}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--ink4)', marginTop: '4px' }}>Excel, CSV, or Word</span>
          </div>

          <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>Supports company lists with optional Country column for better accuracy</div>

          <button onClick={() => analyzeFile(file2, setFindRes, setFinding, undefined, undefined)} disabled={!file2 || finding} style={btn(!file2 || finding, ACCENTS.amber.color)}>
            {finding ? 'Finding…' : 'Analyze File →'}
          </button>
          {findRes.length > 0 && <div style={{ fontSize: '13px', color: 'var(--success)', fontWeight: 600 }}>{findRes.length} websites found</div>}
        </div>

        {/* Card 4 — Website Finder from Directory URLs */}
        <div style={card('purple')}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: ACCENTS.purple.bg, border: `1px solid ${ACCENTS.purple.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" fill="none" stroke={ACCENTS.purple.color} strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>Website Finder — From Directory URLs</div>
              <div style={{ fontSize: '13px', color: 'var(--ink3)', marginTop: '2px' }}>Finds company URLs from exhibitor / directory detail pages</div>
            </div>
          </div>

          {/* Step 1 — Upload Excel with detail page URLs */}
          <input ref={fileRef3} type="file" accept=".xlsx,.xls,.csv,.txt" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0] ?? null; setFile3(f); parseDirFile(f) }} />

          <div
            style={dropZone(drag3, ACCENTS.purple.color)}
            onDragOver={e => { e.preventDefault(); setDrag3(true) }}
            onDragLeave={() => setDrag3(false)}
            onDrop={e => { e.preventDefault(); setDrag3(false); const f = e.dataTransfer.files[0] ?? null; setFile3(f); parseDirFile(f) }}
            onClick={() => fileRef3.current?.click()}
          >
            <svg width="22" height="22" fill="none" stroke="var(--ink4)" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24" style={{ marginBottom: '8px' }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            {dirParsing ? (
              <span style={{ fontSize: '14px', color: 'var(--ink3)' }}>Parsing Excel…</span>
            ) : file3 ? (
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>{file3.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--ink4)', marginTop: '3px' }}>Click to change</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '14px', color: 'var(--ink)', fontWeight: 500 }}>Upload Excel with URLs</div>
                <div style={{ fontSize: '12px', color: 'var(--ink4)', marginTop: '3px' }}>Company detail page links · or paste below</div>
              </div>
            )}
          </div>

          {/* Step 2 — URLs (auto-filled from Excel or paste manually) */}
          <textarea
            value={dirText}
            onChange={e => setDirText(e.target.value)}
            placeholder={'https://directory.com/exhibitors/company-a\nhttps://directory.com/exhibitors/company-b'}
            rows={4}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: '9px',
              border: '1px solid var(--border)', fontSize: '13px', color: 'var(--ink)',
              background: 'var(--border-light)', resize: 'vertical', outline: 'none',
              fontFamily: 'system-ui', lineHeight: 1.6, boxSizing: 'border-box',
            }}
          />

          {dirSetup && (
            <div style={{ padding: '12px 14px', background: 'rgba(245,185,77,0.06)', border: '1px solid rgba(245,185,77,0.2)', borderRadius: '9px', fontSize: '13px', color: 'var(--amber)' }}>
              Add <code style={{ background: 'rgba(245,185,77,0.1)', padding: '1px 5px', borderRadius: '4px' }}>FIRECRAWL_API_KEY</code> to enable directory scraping.
            </div>
          )}

          <button onClick={() => extractUrls(dirText, setDirRes, setDirExtracting, setDirSetup)} disabled={!dirText.trim() || dirExtracting} style={btn(!dirText.trim() || dirExtracting, ACCENTS.purple.color)}>
            {dirExtracting ? 'Extracting…' : 'Extract from Pages →'}
          </button>
          {dirRes.length > 0 && <div style={{ fontSize: '13px', color: 'var(--success)', fontWeight: 600 }}>{dirRes.length} companies extracted</div>}
        </div>
      </div>

      {/* Combined results */}
      {allResults.length > 0 && (
        <div style={{ padding: '0 28px 32px', maxWidth: useRichTable ? '100%' : '1100px', overflowX: 'auto' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden', minWidth: useRichTable ? '900px' : 'auto' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>Extraction Results</span>
              <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>{allResults.length} records</span>
            </div>

            {useRichTable ? (
              /* Rich table — all columns from Excel */
              <>
                <div style={{ display: 'grid', gridTemplateColumns: allRawKeys.map(() => '1fr').join(' '), padding: '10px 20px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', gap: '12px' }}>
                  {allRawKeys.map(h => (
                    <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '0.8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h}</div>
                  ))}
                </div>
                {allResults.map((r: any, i: number) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: allRawKeys.map(() => '1fr').join(' '), padding: '10px 20px', borderBottom: i < allResults.length - 1 ? '1px solid var(--border-light)' : 'none', gap: '12px', background: i % 2 === 0 ? 'var(--card)' : 'var(--border-light)' }}>
                    {allRawKeys.map(k => (
                      <div key={k} style={{ fontSize: '13px', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r._row?.[k] || '—'}
                      </div>
                    ))}
                  </div>
                ))}
              </>
            ) : (
              /* Simple 2-col table */
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '10px 20px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                  {['Company', 'Website'].map(h => (
                    <div key={h} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</div>
                  ))}
                </div>
                {allResults.map((r: any, i: number) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '11px 20px', borderBottom: i < allResults.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                    <div style={{ fontSize: '14px', color: 'var(--ink)', fontWeight: 500 }}>{r.name || '—'}</div>
                    <div style={{ fontSize: '14px', color: 'var(--teal-mid)' }}>{r.website || '—'}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
