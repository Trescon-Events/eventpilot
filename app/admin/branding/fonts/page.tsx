'use client'

import { useState, useEffect } from 'react'
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

export default function BrandingFontsPage() {
  const [fonts, setFonts] = useState<BrandFont[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)

  const [googleFontName, setGoogleFontName] = useState('')
  const [fetchingGoogleFont, setFetchingGoogleFont] = useState(false)

  const [uploadFamilyName, setUploadFamilyName] = useState('')
  const [uploading, setUploading] = useState(false)

  async function fetchAll() {
    setLoading(true)
    const res = await fetch('/api/branding/fonts')
    setFonts(await res.json().catch(() => []))
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount; matches app/admin/events/[id]/stakeholders/page.tsx's fetchAll effect
  useEffect(() => { fetchAll() }, [])

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

  async function uploadFontFiles(regularFile: File, boldFile: File | null) {
    if (!uploadFamilyName.trim()) { setMsg('Enter a font name before uploading.'); return }
    setUploading(true)
    const form = new FormData()
    form.append('family_name', uploadFamilyName.trim())
    form.append('regular_file', regularFile)
    if (boldFile) form.append('bold_file', boldFile)
    const res = await fetch('/api/branding/fonts', { method: 'POST', body: form })
    const data = await res.json().catch(() => ({}))
    if (res.ok) { setUploadFamilyName(''); fetchAll() } else { setMsg(data.error || 'Font upload failed.') }
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
            <Input value={googleFontName} onChange={e => setGoogleFontName(e.target.value)} placeholder="e.g. Poppins" style={{ width: '100%', marginBottom: '10px' }} />
            <div style={{ fontSize: '11px', color: 'var(--ink3)', marginBottom: '10px', lineHeight: 1.4 }}>
              Type the exact family name from fonts.google.com — fetched automatically, no download/install needed.
            </div>
            <Button variant="lime" onClick={addGoogleFont} disabled={fetchingGoogleFont || !googleFontName.trim()}>
              {fetchingGoogleFont ? 'Fetching…' : 'Fetch & Add'}
            </Button>
          </Card>

          <Card padded>
            <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--teal-mid)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Upload a Custom Font</div>
            <Input value={uploadFamilyName} onChange={e => setUploadFamilyName(e.target.value)} placeholder="Font name, e.g. Brand Sans" style={{ width: '100%', marginBottom: '10px' }} />
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <label style={{ padding: '7px 14px', borderRadius: '8px', border: '1.5px solid var(--border)', color: 'var(--ink2)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                {uploading ? 'Uploading…' : 'Choose Regular + Bold Files'}
                <input type="file" accept=".ttf,.otf,.woff,.woff2" multiple style={{ display: 'none' }} disabled={uploading}
                  onChange={e => {
                    const files = Array.from(e.target.files ?? [])
                    if (files.length > 0) uploadFontFiles(files[0], files[1] ?? null)
                    e.target.value = ''
                  }} />
              </label>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '8px', lineHeight: 1.4 }}>
              TTF/OTF/WOFF/WOFF2 accepted. Select one file for regular weight only, or two (regular first, then bold).
            </div>
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
