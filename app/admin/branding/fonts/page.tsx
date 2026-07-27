'use client'

import { useState, useEffect, useRef } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Button, Card, Input } from '@/app/components/ui'

/* Platform-level font library (SAE Phase C v4) — not event-scoped. Fonts
   uploaded or fetched here become selectable from any text layer's Font
   Family dropdown in any event's Creative Templates editor. Branding-team
   tool, admin-only for now (see checklist for why a more granular role
   was deferred). */

type BrandFont = {
  id: string
  family_name: string
  source: 'upload' | 'google_fonts'
  google_font_family: string | null
  regular_url: string
  bold_url: string | null
  created_at: string
}

type FontSuggestion = { family: string; category: string }

export default function BrandingFontsPage() {
  const [fonts, setFonts] = useState<BrandFont[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)

  const [googleFontName, setGoogleFontName] = useState('')
  const [fetchingGoogleFont, setFetchingGoogleFont] = useState(false)
  const [suggestions, setSuggestions] = useState<FontSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [uploadResults, setUploadResults] = useState<Array<{ family: string | null; status: 'added' | 'updated' | 'skipped' | 'error'; message: string }>>([])

  async function fetchAll() {
    setLoading(true)
    const res = await fetch('/api/branding/fonts')
    setFonts(await res.json().catch(() => []))
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount; matches app/admin/events/[id]/stakeholders/page.tsx's fetchAll effect
  useEffect(() => { fetchAll() }, [])

  // Live search-as-you-type against Google's font catalog, matching
  // fonts.google.com's own picker — debounced so every keystroke doesn't
  // hit the API. Selecting a suggestion always yields the correct
  // canonical casing Google's css2 API requires (the earlier bug: typing
  // "space grotesk" lowercase 400'd even though the font exists).
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    const q = googleFontName.trim()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- early-return guard when the input is empty; the real search's setState is inside a debounced async callback, outside the rule's scope
    if (!q) { setSuggestions([]); return }
    searchTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/branding/fonts/search?q=${encodeURIComponent(q)}`)
      const data = await res.json().catch(() => [])
      setSuggestions(Array.isArray(data) ? data : [])
    }, 250)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [googleFontName])

  function selectSuggestion(family: string) {
    setGoogleFontName(family)
    setSuggestions([])
    setShowSuggestions(false)
  }

  async function addGoogleFont() {
    if (!googleFontName.trim()) return
    setFetchingGoogleFont(true)
    const res = await fetch('/api/branding/fonts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ google_font_family: googleFontName.trim() }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) { setGoogleFontName(''); fetchAll() } else { setMsg(data.error || 'Could not fetch that Google Font.') }
    setFetchingGoogleFont(false)
  }

  // Font name is never typed by hand here — each file's own OpenType
  // metadata says what it is (family, weight), read server-side. Any mix
  // of families/weights can be dropped in one go: individually, or the
  // whole brand kit at once. The server groups by detected family, checks
  // each against the existing library, and reports one result per family
  // (added / filled in a missing Bold weight / already existed / couldn't
  // be read) rather than a single pass/fail for the whole batch.
  async function bulkUploadFiles(files: File[]) {
    if (files.length === 0) return
    setUploading(true)
    setUploadResults([])
    const form = new FormData()
    files.forEach(f => form.append('files', f))
    const res = await fetch('/api/branding/fonts/bulk-upload', { method: 'POST', body: form })
    const data = await res.json().catch(() => ({}))
    if (res.ok) { setUploadResults(data.results ?? []); fetchAll() } else { setMsg(data.error || 'Font upload failed.') }
    setUploading(false)
  }

  async function deleteFont(id: string) {
    await fetch(`/api/branding/fonts/${id}`, { method: 'DELETE' })
    fetchAll()
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Branding"
        title="Font Library"
        description="Upload brand fonts or fetch any free Google Font by name. Once added, any text layer in any event's Creative Templates editor can use it."
      />

      <div style={{ padding: '24px 32px', maxWidth: '860px' }}>
        {msg && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: '12.5px', marginBottom: '16px' }}>
            {msg} <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700, marginLeft: '8px' }}>×</button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
          <Card padded>
            <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--teal-mid)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Add a Google Font</div>
            <div style={{ position: 'relative', marginBottom: '10px' }}>
              <Input
                value={googleFontName}
                onChange={e => { setGoogleFontName(e.target.value); setShowSuggestions(true) }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Start typing… e.g. Poppins"
                style={{ width: '100%' }}
              />
              {showSuggestions && suggestions.length > 0 && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 10,
                  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px',
                  boxShadow: 'var(--shadow-md)', maxHeight: '260px', overflowY: 'auto',
                }}>
                  {suggestions.map(s => (
                    <div key={s.family} onMouseDown={() => selectSuggestion(s.family)}
                      style={{ padding: '9px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: '10px', borderBottom: '1px solid var(--border-light)' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--card-hi)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{s.family}</span>
                      <span style={{ fontSize: '11px', color: 'var(--ink4)' }}>{s.category}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--ink3)', marginBottom: '10px', lineHeight: 1.4 }}>
              Live search against Google&apos;s ~1,942 free font families — pick one from the dropdown, or type the exact family name and fetch directly.
            </div>
            <Button variant="lime" onClick={addGoogleFont} disabled={fetchingGoogleFont || !googleFontName.trim()}>
              {fetchingGoogleFont ? 'Fetching…' : 'Fetch & Add'}
            </Button>
          </Card>

          <Card padded>
            <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--teal-mid)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Upload Custom Fonts</div>
            <label
              onDragOver={e => { e.preventDefault(); setDragActive(true) }}
              onDragLeave={() => setDragActive(false)}
              onDrop={e => {
                e.preventDefault()
                setDragActive(false)
                bulkUploadFiles(Array.from(e.dataTransfer.files))
              }}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px',
                padding: '28px 14px', borderRadius: '10px', textAlign: 'center', cursor: uploading ? 'default' : 'pointer',
                border: `1.5px dashed ${dragActive ? 'var(--teal-mid)' : 'var(--border)'}`,
                background: dragActive ? 'var(--card-hi)' : 'transparent',
                transition: 'all 0.12s ease',
              }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>
                {uploading ? 'Uploading…' : dragActive ? 'Drop to upload' : 'Drag & drop font files here'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--ink3)' }}>or click to browse — drop one at a time or your whole brand kit at once</div>
              <input type="file" accept=".ttf,.otf,.woff,.woff2" multiple style={{ display: 'none' }} disabled={uploading}
                onChange={e => {
                  const files = Array.from(e.target.files ?? [])
                  if (files.length > 0) bulkUploadFiles(files)
                  e.target.value = ''
                }} />
            </label>
            <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '8px', lineHeight: 1.4 }}>
              TTF/OTF/WOFF/WOFF2 — the family name and weight (Regular/Bold) are read straight from each file, never typed by hand. Already-in-the-library families are detected and skipped automatically.
            </div>
            {uploadResults.length > 0 && (
              <div style={{ marginTop: '10px', display: 'grid', gap: '6px' }}>
                {uploadResults.map((r, i) => (
                  <div key={i} style={{
                    padding: '8px 12px', borderRadius: '8px', fontSize: '11.5px', lineHeight: 1.4,
                    background: r.status === 'error' ? 'var(--red-light)' : r.status === 'skipped' ? 'var(--card-hi)' : 'var(--lime-light)',
                    border: `1px solid ${r.status === 'error' ? 'var(--red-border)' : r.status === 'skipped' ? 'var(--border)' : 'var(--lime-border)'}`,
                    color: r.status === 'error' ? 'var(--red)' : r.status === 'skipped' ? 'var(--ink3)' : 'var(--ink)',
                  }}>
                    {r.message}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink3)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Library</div>
        {loading ? (
          <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>
        ) : fonts.length === 0 ? (
          <div style={{ color: 'var(--ink3)', fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>No fonts added yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: '8px' }}>
            {fonts.map(f => (
              <Card key={f.id} padded>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>{f.family_name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '2px' }}>
                      {f.source === 'google_fonts' ? `Google Fonts: ${f.google_font_family}` : 'Custom upload'} · {f.bold_url ? 'Regular + Bold' : 'Regular only'}
                    </div>
                  </div>
                  <Button variant="ghost" onClick={() => deleteFont(f.id)}>Delete</Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
