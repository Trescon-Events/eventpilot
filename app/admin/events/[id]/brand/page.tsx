'use client'

import { useState, useEffect, use, useCallback } from 'react'
import Link from 'next/link'

type Guidelines = {
  id: string
  event_id: string
  primary_color: string
  secondary_color: string
  accent_color: string
  background_color: string
  text_color: string
  heading_font: string
  body_font: string
  tone: string[]
  key_messages: string[]
  style_keywords: string[]
  logo_notes: string | null
  ai_reasoning: string | null
  updated_at: string
}

type BrandAsset = {
  id: string
  event_id: string
  asset_type: string
  label: string | null
  prompt_used: string | null
  image_url: string
  aspect_ratio: string | null
  created_at: string
}

type Event = {
  id: string
  name: string
  city: string | null
  event_date: string | null
  description: string | null
}

const GOOGLE_FONTS = [
  'Inter', 'Manrope', 'Plus Jakarta Sans', 'DM Sans', 'Sora',
  'Outfit', 'Space Grotesk', 'Raleway', 'Montserrat', 'Playfair Display',
]

const ASSET_TYPES = [
  { id: 'banner',         label: 'Event Banner',    ratio: '16:9', aspect: '16:9' },
  { id: 'social_post',    label: 'Social Post',     ratio: '1:1',  aspect: '1:1'  },
  { id: 'linkedin_banner',label: 'LinkedIn Banner', ratio: '4:1',  aspect: '16:9' },
  { id: 'speaker_card',   label: 'Speaker Card',    ratio: '1:1',  aspect: '1:1'  },
  { id: 'sponsor_card',   label: 'Sponsor Card',    ratio: '4:3',  aspect: '4:3'  },
] as const

const GALLERY_FILTERS = ['All', 'banner', 'social_post', 'speaker_card', 'sponsor_card', 'linkedin_banner'] as const

type Tab = 'brand' | 'assets' | 'gallery'
type GalleryFilter = typeof GALLERY_FILTERS[number]

function ColorSwatch({
  label, color, onChange,
}: { label: string; color: string; onChange: (c: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(color).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', position: 'relative' }}>
      <div
        onClick={() => setEditing(e => !e)}
        title="Click to edit colour"
        style={{
          width: '44px', height: '44px', borderRadius: '50%',
          background: color,
          border: '2px solid #C8DFE0',
          cursor: 'pointer',
          boxShadow: editing ? '0 0 0 3px #00A5A3' : 'none',
          transition: 'box-shadow 0.15s',
          flexShrink: 0,
        }}
      />
      {editing && (
        <input
          type="color"
          value={color}
          onChange={e => onChange(e.target.value)}
          style={{
            position: 'absolute', top: '50px', left: '50%', transform: 'translateX(-50%)',
            width: '48px', height: '32px', padding: '2px', border: '1px solid #C8DFE0',
            borderRadius: '6px', cursor: 'pointer', zIndex: 10,
          }}
          onBlur={() => setEditing(false)}
          autoFocus
        />
      )}
      <span
        onClick={copy}
        title="Copy hex"
        style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', cursor: 'pointer', letterSpacing: '0.5px', userSelect: 'none' }}
      >
        {copied ? 'Copied!' : color.toUpperCase()}
      </span>
      <span style={{ fontSize: '11px', fontWeight: 800, color: '#B8CDD8', textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</span>
    </div>
  )
}

function ChipInput({
  label, values, onChange,
}: { label: string; values: string[]; onChange: (v: string[]) => void }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  function add() {
    const t = draft.trim()
    if (t && !values.includes(t)) onChange([...values, t])
    setDraft(''); setAdding(false)
  }

  return (
    <div>
      <div style={{ fontSize: '13px', fontWeight: 800, color: '#5B7080', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '10px' }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        {values.map(v => (
          <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '20px', background: 'rgba(0,165,163,0.1)', border: '1px solid rgba(0,165,163,0.25)', fontSize: '13px', fontWeight: 700, color: '#00695C' }}>
            {v}
            <button onClick={() => onChange(values.filter(x => x !== v))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#00A5A3', padding: '0', lineHeight: 1, fontSize: '14px', fontWeight: 900 }}>
              ×
            </button>
          </span>
        ))}
        {adding ? (
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); if (e.key === 'Escape') { setAdding(false); setDraft('') } }}
            onBlur={add}
            placeholder="Type and press Enter"
            style={{ padding: '5px 12px', borderRadius: '20px', border: '1px solid #00A5A3', fontSize: '13px', fontFamily: 'inherit', outline: 'none', minWidth: '140px', color: '#0F1923' }}
          />
        ) : (
          <button onClick={() => setAdding(true)}
            style={{ padding: '5px 12px', borderRadius: '20px', border: '1px dashed #C8DFE0', background: 'transparent', fontSize: '13px', color: '#5B7080', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>
            + Add
          </button>
        )}
      </div>
    </div>
  )
}

export default function BrandStudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)

  const [tab, setTab] = useState<Tab>('brand')
  const [event, setEvent] = useState<Event | null>(null)
  const [guidelines, setGuidelines] = useState<Guidelines | null>(null)
  const [assets, setAssets] = useState<BrandAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // Brand form state
  const [primaryColor,    setPrimaryColor]    = useState('#0F1923')
  const [secondaryColor,  setSecondaryColor]  = useState('#00A5A3')
  const [accentColor,     setAccentColor]     = useState('#C0F43C')
  const [backgroundColor, setBackgroundColor] = useState('#FFFFFF')
  const [textColor,       setTextColor]       = useState('#2D3E50')
  const [headingFont,     setHeadingFont]     = useState('Inter')
  const [bodyFont,        setBodyFont]        = useState('Inter')
  const [tone,            setTone]            = useState<string[]>([])
  const [keyMessages,     setKeyMessages]     = useState<string[]>([])
  const [styleKeywords,   setStyleKeywords]   = useState<string[]>([])
  const [logoNotes,       setLogoNotes]       = useState('')

  // PDF import state
  const [pdfUploading, setPdfUploading]     = useState(false)
  const [pdfFileName,  setPdfFileName]      = useState<string | null>(null)

  // Asset generator state
  const [selectedAsset, setSelectedAsset]   = useState<typeof ASSET_TYPES[number]>(ASSET_TYPES[0])
  const [prompt,         setPrompt]         = useState('')
  const [generatingImg,  setGeneratingImg]  = useState(false)
  const [generatedImg,   setGeneratedImg]   = useState<string | null>(null)
  const [imgError,       setImgError]       = useState<string | null>(null)

  // Gallery
  const [galleryFilter, setGalleryFilter]   = useState<GalleryFilter>('All')

  function applyGuidelines(g: Guidelines) {
    setPrimaryColor(g.primary_color)
    setSecondaryColor(g.secondary_color)
    setAccentColor(g.accent_color)
    setBackgroundColor(g.background_color)
    setTextColor(g.text_color)
    setHeadingFont(g.heading_font)
    setBodyFont(g.body_font)
    setTone(g.tone ?? [])
    setKeyMessages(g.key_messages ?? [])
    setStyleKeywords(g.style_keywords ?? [])
    setLogoNotes(g.logo_notes ?? '')
  }

  const buildPrompt = useCallback((assetType: typeof ASSET_TYPES[number]) => {
    const eventName = event?.name ?? 'Event'
    const city      = event?.city ?? ''
    switch (assetType.id) {
      case 'banner':
        return `Professional event banner for ${eventName}${city ? `, ${city}` : ''}. Colors: ${primaryColor} and ${secondaryColor}. Style: ${styleKeywords.join(', ') || 'clean, modern, corporate'}. Clean, modern, corporate tech conference aesthetic. High contrast typography, no text.`
      case 'social_post':
        return `Bold square social media announcement card for ${eventName}. Primary color ${primaryColor}, accent ${accentColor}. ${styleKeywords.join(', ') || 'geometric, minimal, bold'}. Abstract shapes, no text, premium corporate look.`
      case 'linkedin_banner':
        return `LinkedIn professional banner for ${eventName}. Dark background ${primaryColor}, teal accent ${secondaryColor}. Wide format, horizontal layout, corporate conference branding. Abstract geometric, no text.`
      case 'speaker_card':
        return `Professional speaker announcement card for ${eventName}. Dark background, accent color ${accentColor}. Typography-focused layout with geometric elements. Premium conference aesthetic, portrait orientation, no faces, no text.`
      case 'sponsor_card':
        return `Corporate sponsor partner card for ${eventName}. Colors: ${primaryColor} and ${secondaryColor}. Clean, professional, trust-building design. Geometric patterns, minimal layout, no text, no logos.`
      default:
        return `Professional visual asset for ${eventName}. Colors: ${primaryColor}, ${secondaryColor}, ${accentColor}. Clean, modern, corporate aesthetic.`
    }
  }, [event, primaryColor, secondaryColor, accentColor, styleKeywords])

  useEffect(() => {
    setPrompt(buildPrompt(selectedAsset))
  }, [selectedAsset, buildPrompt])

  useEffect(() => {
    fetch(`/api/events?id=${eventId}`)
      .then(r => r.json())
      .then(d => setEvent(Array.isArray(d) ? d[0] : d))
      .catch(() => {})

    fetch(`/api/events/brand?event_id=${eventId}`)
      .then(r => r.json())
      .then(d => {
        if (d.guidelines) {
          setGuidelines(d.guidelines)
          applyGuidelines(d.guidelines)
        }
        setAssets(Array.isArray(d.assets) ? d.assets : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  async function generateWithAI() {
    setGenerating(true); setMsg(null)
    const res = await fetch('/api/events/brand/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId }),
    })
    const data = await res.json()
    if (res.ok) {
      setGuidelines(data)
      applyGuidelines(data)
      setMsg({ text: 'Brand identity generated by AI.', ok: true })
    } else {
      setMsg({ text: data.error ?? 'Generation failed.', ok: false })
    }
    setGenerating(false)
  }

  async function saveGuidelines() {
    setSaving(true); setMsg(null)
    const res = await fetch('/api/events/brand', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: eventId,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        accent_color: accentColor,
        background_color: backgroundColor,
        text_color: textColor,
        heading_font: headingFont,
        body_font: bodyFont,
        tone,
        key_messages: keyMessages,
        style_keywords: styleKeywords,
        logo_notes: logoNotes,
      }),
    })
    const data = await res.json()
    if (res.ok) { setGuidelines(data); setMsg({ text: 'Brand guidelines saved.', ok: true }) }
    else { setMsg({ text: data.error ?? 'Save failed.', ok: false }) }
    setSaving(false)
  }

  async function generateImage() {
    setGeneratingImg(true); setImgError(null); setGeneratedImg(null)
    const res = await fetch('/api/events/brand/image', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: eventId,
        asset_type: selectedAsset.id,
        prompt,
        aspect_ratio: selectedAsset.aspect,
      }),
    })
    const data = await res.json()
    if (res.ok && data.image_url) {
      setGeneratedImg(data.image_url)
      if (data.asset) setAssets(prev => [data.asset, ...prev])
    } else {
      setImgError(data.error ?? 'Image generation failed.')
    }
    setGeneratingImg(false)
  }

  async function importFromPDF(file: File) {
    setPdfUploading(true)
    setPdfFileName(file.name)
    setMsg(null)

    try {
      // Step 1: Get a signed upload URL from the server (uses service role — avoids RLS + Vercel 4.5MB limit)
      const urlRes = await fetch(`/api/events/brand/upload-url?event_id=${eventId}&filename=${encodeURIComponent(file.name)}`)
      if (!urlRes.ok) {
        const e = await urlRes.json()
        setMsg({ text: `Upload setup failed: ${e.error}`, ok: false })
        setPdfUploading(false)
        return
      }
      const { signedUrl, publicUrl } = await urlRes.json()

      // Step 2: Upload directly to Supabase Storage via the signed URL
      const uploadRes = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        body: file,
      })
      if (!uploadRes.ok) {
        setMsg({ text: `Upload failed (storage): ${uploadRes.statusText}`, ok: false })
        setPdfUploading(false)
        return
      }

      // Step 3: Call extract-pdf with the storage URL
      const res  = await fetch('/api/events/brand/extract-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdf_url: publicUrl }),
      })
      const data = await res.json()

      if (!res.ok) {
        setMsg({ text: data.error ?? 'PDF extraction failed.', ok: false })
        setPdfUploading(false)
        return
      }

      const { colors, heading_font, body_font, brand_name } = data

      if (colors?.[0]) setPrimaryColor(colors[0])
      if (colors?.[1]) setSecondaryColor(colors[1])
      if (colors?.[2]) setAccentColor(colors[2])
      if (heading_font) setHeadingFont(heading_font)
      if (body_font)    setBodyFont(body_font)

      const extracted = [
        colors?.length ? `${colors.length} colour${colors.length > 1 ? 's' : ''} extracted` : null,
        heading_font ? `heading: ${heading_font}` : null,
        body_font    ? `body: ${body_font}`        : null,
      ].filter(Boolean).join(' · ')

      setMsg({ text: `Brand book imported${brand_name ? ` for ${brand_name}` : ''} — ${extracted}. Review and save.`, ok: true })
    } catch (e) {
      setMsg({ text: `Error: ${e instanceof Error ? e.message : 'Unknown error'}`, ok: false })
    }

    setPdfUploading(false)
  }

  const filteredAssets = galleryFilter === 'All'
    ? assets
    : assets.filter(a => a.asset_type === galleryFilter)

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#E8EEF4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-manrope), Manrope, sans-serif' }}>
        <div style={{ fontSize: '15px', color: '#5B7080' }}>Loading Brand Studio…</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#E8EEF4', fontFamily: 'var(--font-manrope), Manrope, sans-serif', color: '#0F1923' }}>

      {/* Top bar */}
      <nav style={{ background: '#0F1923', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0 32px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link href="/admin/toolkit" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'rgba(255,255,255,0.55)', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#FFFFFF')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.55)')}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Toolkit
          </Link>
          <span style={{ color: 'rgba(255,255,255,0.2)' }}>/</span>
          <div>
            {event && <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1.5px', lineHeight: 1.2 }}>{event.name}</div>}
            <div style={{ fontSize: '15px', fontWeight: 900, color: '#FFFFFF', letterSpacing: '-0.3px' }}>Brand Studio</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={generateWithAI}
            disabled={generating}
            style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: generating ? '#1E2D3D' : '#00A5A3', color: '#FFFFFF', fontSize: '13px', fontWeight: 800, cursor: generating ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px', transition: 'opacity 0.15s' }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            {generating ? 'Generating…' : 'Generate with AI'}
          </button>
          <button
            onClick={saveGuidelines}
            disabled={saving}
            style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: saving ? '#A0BA30' : '#C0F43C', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 32px 64px' }}>

        {/* Message */}
        {msg && (
          <div style={{ marginBottom: '12px', padding: '12px 18px', borderRadius: '10px', background: msg.ok ? 'rgba(192,244,60,0.08)' : 'rgba(255,107,107,0.08)', border: `1px solid ${msg.ok ? 'rgba(192,244,60,0.3)' : 'rgba(255,107,107,0.3)'}`, color: msg.ok ? '#3D6B00' : '#DC2626', fontSize: '14px', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {msg.text}
            <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '18px', lineHeight: 1, padding: '0 4px' }}>×</button>
          </div>
        )}

        {/* Next step CTA — shown after a successful save */}
        {msg?.ok && msg.text.includes('saved') && (
          <div style={{ marginBottom: '20px', padding: '14px 20px', borderRadius: '12px', background: 'rgba(0,105,92,0.05)', border: '1px solid rgba(0,105,92,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <svg width="16" height="16" fill="none" stroke="#00695C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#00695C' }}>Brand guidelines saved. Next: build the event website using these guidelines.</span>
            </div>
            <Link
              href={`/admin/events/${eventId}/website`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 18px', borderRadius: '9px', background: '#00695C', color: '#fff', fontSize: '13px', fontWeight: 800, textDecoration: 'none', whiteSpace: 'nowrap' }}
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              Build Website
            </Link>
          </div>
        )}

        {/* AI Reasoning */}
        {guidelines?.ai_reasoning && (
          <div style={{ marginBottom: '24px', padding: '16px 20px', borderRadius: '12px', background: 'rgba(0,165,163,0.06)', border: '1px solid rgba(0,165,163,0.2)' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#00A5A3', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '6px' }}>AI Reasoning</div>
            <p style={{ fontSize: '15px', color: '#2D3E50', margin: 0, lineHeight: 1.65 }}>{guidelines.ai_reasoning}</p>
          </div>
        )}

        {/* Tab nav */}
        <div style={{ display: 'flex', gap: '0', marginBottom: '28px', background: '#FFFFFF', border: '1px solid #C8DFE0', borderRadius: '12px', padding: '4px', width: 'fit-content' }}>
          {([
            { id: 'brand',  label: 'Brand Identity' },
            { id: 'assets', label: 'Asset Generator' },
            { id: 'gallery',label: `Gallery (${assets.length})` },
          ] as { id: Tab; label: string }[]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: '9px 22px', borderRadius: '9px', border: 'none', background: tab === t.id ? '#0F1923' : 'transparent', color: tab === t.id ? '#C0F43C' : '#5B7080', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ─────────────── BRAND IDENTITY TAB ─────────────── */}
        {tab === 'brand' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* ── Brand Book PDF Upload ── */}
            <div style={{ background: '#FFFFFF', border: '1px solid #C8DFE0', borderRadius: '16px', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#5B7080', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>Import Brand Book</div>
                  <div style={{ fontSize: '14px', color: '#2D3E50', lineHeight: 1.5 }}>Upload a PDF brand guidelines document — colours and fonts will be extracted automatically via AI.</div>
                </div>
                {pdfFileName && !pdfUploading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', background: 'rgba(192,244,60,0.08)', border: '1px solid rgba(192,244,60,0.3)', whiteSpace: 'nowrap' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3D6B00" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#3D6B00', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pdfFileName}</span>
                  </div>
                )}
              </div>
              <label
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: '12px', padding: '28px 24px',
                  border: `2px dashed ${pdfUploading ? '#00A5A3' : '#C8DFE0'}`,
                  borderRadius: '12px',
                  background: pdfUploading ? 'rgba(0,165,163,0.04)' : 'rgba(248,251,252,0.8)',
                  cursor: pdfUploading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                }}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#00A5A3'; e.currentTarget.style.background = 'rgba(0,165,163,0.04)' }}
                onDragLeave={e => { e.currentTarget.style.borderColor = '#C8DFE0'; e.currentTarget.style.background = 'rgba(248,251,252,0.8)' }}
                onDrop={e => {
                  e.preventDefault()
                  e.currentTarget.style.borderColor = '#C8DFE0'
                  e.currentTarget.style.background = 'rgba(248,251,252,0.8)'
                  if (pdfUploading) return
                  const file = e.dataTransfer.files?.[0]
                  if (file?.type === 'application/pdf') importFromPDF(file)
                  else setMsg({ text: 'Only PDF files are supported.', ok: false })
                }}
              >
                <input
                  type="file"
                  accept="application/pdf"
                  style={{ display: 'none' }}
                  disabled={pdfUploading}
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) importFromPDF(file)
                    e.target.value = ''
                  }}
                />
                {pdfUploading ? (
                  <>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: '3px solid rgba(0,165,163,0.2)', borderTopColor: '#00A5A3', animation: 'spin 0.8s linear infinite' }} />
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#00A5A3' }}>Analysing brand book with AI…</span>
                    <span style={{ fontSize: '13px', color: '#5B7080' }}>This may take up to 30 seconds for large PDFs</span>
                  </>
                ) : (
                  <>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#A0B4C0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="12" y1="18" x2="12" y2="12"/>
                      <line x1="9" y1="15" x2="15" y2="15"/>
                    </svg>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#2D3E50', marginBottom: '4px' }}>Drop brand PDF here or click to browse</div>
                      <div style={{ fontSize: '13px', color: '#5B7080' }}>PDF only · Max 30 MB · Gemini will extract colours and fonts</div>
                    </div>
                  </>
                )}
              </label>
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>

            {/* Colors + Typography */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

              {/* Colour Palette */}
              <div style={{ background: '#FFFFFF', border: '1px solid #C8DFE0', borderRadius: '14px', padding: '28px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#5B7080', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '24px' }}>Colour Palette</div>
                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', justifyContent: 'space-around' }}>
                  <ColorSwatch label="Primary"    color={primaryColor}    onChange={setPrimaryColor}    />
                  <ColorSwatch label="Secondary"  color={secondaryColor}  onChange={setSecondaryColor}  />
                  <ColorSwatch label="Accent"     color={accentColor}     onChange={setAccentColor}     />
                  <ColorSwatch label="Background" color={backgroundColor} onChange={setBackgroundColor} />
                  <ColorSwatch label="Text"       color={textColor}       onChange={setTextColor}       />
                </div>

                {/* Preview bar */}
                <div style={{ marginTop: '24px', borderRadius: '10px', overflow: 'hidden', border: '1px solid #E8EEF4' }}>
                  <div style={{ background: primaryColor, padding: '14px 18px' }}>
                    <div style={{ color: backgroundColor, fontSize: '15px', fontWeight: 900, fontFamily: headingFont + ', sans-serif' }}>Event Brand Preview</div>
                    <div style={{ color: backgroundColor, fontSize: '13px', opacity: 0.75, marginTop: '3px', fontFamily: bodyFont + ', sans-serif' }}>Secondary text uses body font</div>
                  </div>
                  <div style={{ background: backgroundColor, padding: '14px 18px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ padding: '6px 14px', borderRadius: '8px', background: accentColor, color: primaryColor, fontSize: '13px', fontWeight: 800 }}>CTA Button</div>
                    <div style={{ padding: '6px 14px', borderRadius: '8px', background: secondaryColor, color: '#FFFFFF', fontSize: '13px', fontWeight: 700 }}>Secondary</div>
                    <span style={{ color: textColor, fontSize: '13px', fontFamily: bodyFont + ', sans-serif' }}>Body text</span>
                  </div>
                </div>
              </div>

              {/* Typography */}
              <div style={{ background: '#FFFFFF', border: '1px solid #C8DFE0', borderRadius: '14px', padding: '28px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#5B7080', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '24px' }}>Typography</div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div>
                    <label style={{ fontSize: '13px', fontWeight: 800, color: '#5B7080', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '8px' }}>Heading Font</label>
                    <select value={headingFont} onChange={e => setHeadingFont(e.target.value)}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #C8DFE0', fontSize: '14px', fontFamily: 'inherit', color: '#0F1923', background: '#FAFBFC' }}>
                      {GOOGLE_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <div style={{ marginTop: '10px', padding: '12px 16px', borderRadius: '8px', background: '#F8FAFF', border: '1px solid #E8EEF4' }}>
                      <div style={{ fontSize: '22px', fontWeight: 900, color: '#0F1923', fontFamily: headingFont + ', sans-serif', lineHeight: 1.2 }}>
                        The Future of Business
                      </div>
                      <div style={{ fontSize: '11px', color: '#B8CDD8', marginTop: '4px', fontWeight: 700 }}>{headingFont} — Heading</div>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '13px', fontWeight: 800, color: '#5B7080', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '8px' }}>Body Font</label>
                    <select value={bodyFont} onChange={e => setBodyFont(e.target.value)}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #C8DFE0', fontSize: '14px', fontFamily: 'inherit', color: '#0F1923', background: '#FAFBFC' }}>
                      {GOOGLE_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <div style={{ marginTop: '10px', padding: '12px 16px', borderRadius: '8px', background: '#F8FAFF', border: '1px solid #E8EEF4' }}>
                      <div style={{ fontSize: '15px', color: '#2D3E50', fontFamily: bodyFont + ', sans-serif', lineHeight: 1.65 }}>
                        Connecting global leaders to shape the next decade of industry transformation and innovation.
                      </div>
                      <div style={{ fontSize: '11px', color: '#B8CDD8', marginTop: '4px', fontWeight: 700 }}>{bodyFont} — Body</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Brand Voice */}
            <div style={{ background: '#FFFFFF', border: '1px solid #C8DFE0', borderRadius: '14px', padding: '28px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#5B7080', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '24px' }}>Brand Voice &amp; Tone</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <ChipInput label="Tone" values={tone} onChange={setTone} />
                <ChipInput label="Style Keywords" values={styleKeywords} onChange={setStyleKeywords} />

                {/* Key Messages */}
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#5B7080', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '10px' }}>Key Messages</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {keyMessages.map((msg, i) => (
                      <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: '#E8EEF4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800, color: '#5B7080', flexShrink: 0 }}>{i + 1}</div>
                        <input
                          value={msg}
                          onChange={e => { const arr = [...keyMessages]; arr[i] = e.target.value; setKeyMessages(arr) }}
                          style={{ flex: 1, padding: '9px 13px', borderRadius: '8px', border: '1px solid #C8DFE0', fontSize: '15px', fontFamily: 'inherit', color: '#0F1923', outline: 'none' }}
                          placeholder="Enter a key message…"
                        />
                        <button onClick={() => setKeyMessages(keyMessages.filter((_, j) => j !== i))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B8CDD8', fontSize: '18px', lineHeight: 1, padding: '4px', flexShrink: 0 }}>
                          ×
                        </button>
                      </div>
                    ))}
                    <button onClick={() => setKeyMessages([...keyMessages, ''])}
                      style={{ alignSelf: 'flex-start', padding: '8px 16px', borderRadius: '8px', border: '1px dashed #C8DFE0', background: 'transparent', fontSize: '13px', color: '#5B7080', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, marginTop: '4px' }}>
                      + Add message
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Logo Notes */}
            <div style={{ background: '#FFFFFF', border: '1px solid #C8DFE0', borderRadius: '14px', padding: '28px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#5B7080', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '14px' }}>Logo Usage Notes</div>
              <textarea
                value={logoNotes}
                onChange={e => setLogoNotes(e.target.value)}
                rows={4}
                placeholder="How should the Trescon logo be used in event materials? E.g. placement, clear space, co-branding rules, colour treatment…"
                style={{ width: '100%', padding: '12px 16px', borderRadius: '10px', border: '1px solid #C8DFE0', fontSize: '15px', fontFamily: 'inherit', color: '#0F1923', resize: 'vertical', outline: 'none', lineHeight: 1.6, boxSizing: 'border-box' }}
              />
            </div>
          </div>
        )}

        {/* ─────────────── ASSET GENERATOR TAB ─────────────── */}
        {tab === 'assets' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ background: '#FFFFFF', border: '1px solid #C8DFE0', borderRadius: '14px', padding: '28px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#5B7080', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '20px' }}>Generate Visual Asset</div>

              {/* Asset type selector */}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '24px' }}>
                {ASSET_TYPES.map(a => (
                  <button key={a.id} onClick={() => setSelectedAsset(a)}
                    style={{
                      padding: '12px 16px', borderRadius: '10px',
                      border: `2px solid ${selectedAsset.id === a.id ? '#00A5A3' : '#C8DFE0'}`,
                      background: selectedAsset.id === a.id ? 'rgba(0,165,163,0.08)' : '#FAFBFC',
                      cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.15s',
                    }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: selectedAsset.id === a.id ? '#00A5A3' : '#0F1923', marginBottom: '2px' }}>{a.label}</div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#B8CDD8', letterSpacing: '0.5px' }}>{a.ratio}</div>
                  </button>
                ))}
              </div>

              {/* Prompt */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '13px', fontWeight: 800, color: '#5B7080', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '8px' }}>Image Prompt</label>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  rows={4}
                  style={{ width: '100%', padding: '12px 16px', borderRadius: '10px', border: '1px solid #C8DFE0', fontSize: '15px', fontFamily: 'inherit', color: '#0F1923', resize: 'vertical', outline: 'none', lineHeight: 1.6, boxSizing: 'border-box' }}
                />
                <div style={{ fontSize: '12px', color: '#B8CDD8', marginTop: '6px' }}>
                  Imagen 3 is used to generate the image. Generation takes approximately 10–20 seconds.
                </div>
              </div>

              <button
                onClick={generateImage}
                disabled={generatingImg || !prompt.trim()}
                style={{ padding: '13px 28px', borderRadius: '10px', border: 'none', background: generatingImg ? '#B8CDD8' : '#00A5A3', color: '#FFFFFF', fontSize: '14px', fontWeight: 800, cursor: generatingImg ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '10px', transition: 'opacity 0.15s' }}>
                {generatingImg ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    Generating image…
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                    </svg>
                    Generate Image
                  </>
                )}
              </button>
            </div>

            {/* Image error */}
            {imgError && (
              <div style={{ padding: '14px 18px', borderRadius: '10px', background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.3)', color: '#DC2626', fontSize: '14px' }}>
                {imgError}
              </div>
            )}

            {/* Generated image */}
            {generatedImg && (
              <div style={{ background: '#FFFFFF', border: '1px solid #C8DFE0', borderRadius: '14px', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #E8EEF4', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>Generated: {selectedAsset.label}</div>
                  <a href={generatedImg} download={`${selectedAsset.id}-${Date.now()}.png`} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', background: '#E8EEF4', color: '#0F1923', fontSize: '13px', fontWeight: 700, textDecoration: 'none' }}>
                    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Download
                  </a>
                </div>
                <img src={generatedImg} alt={selectedAsset.label} style={{ width: '100%', display: 'block', maxHeight: '600px', objectFit: 'contain', background: '#F0F4F7' }} />
              </div>
            )}
          </div>
        )}

        {/* ─────────────── GALLERY TAB ─────────────── */}
        {tab === 'gallery' && (
          <div>
            {/* Filter row */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px' }}>
              {GALLERY_FILTERS.map(f => (
                <button key={f} onClick={() => setGalleryFilter(f)}
                  style={{ padding: '7px 16px', borderRadius: '20px', border: `1.5px solid ${galleryFilter === f ? '#00A5A3' : '#C8DFE0'}`, background: galleryFilter === f ? 'rgba(0,165,163,0.1)' : '#FFFFFF', color: galleryFilter === f ? '#00A5A3' : '#5B7080', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', textTransform: f === 'All' ? 'none' : 'capitalize' }}>
                  {f === 'All' ? 'All' : f.replace(/_/g, ' ')}
                </button>
              ))}
            </div>

            {filteredAssets.length === 0 ? (
              <div style={{ background: '#FFFFFF', border: '1px solid #C8DFE0', borderRadius: '14px', padding: '60px 32px', textAlign: 'center' }}>
                <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: '#E8EEF4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#B8CDD8' }}>
                  <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F1923', marginBottom: '8px' }}>No assets yet</div>
                <div style={{ fontSize: '15px', color: '#5B7080', marginBottom: '20px' }}>Generate visual assets from the Asset Generator tab.</div>
                <button onClick={() => setTab('assets')}
                  style={{ padding: '11px 24px', borderRadius: '10px', border: 'none', background: '#00A5A3', color: '#FFFFFF', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Go to Asset Generator
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                {filteredAssets.map(asset => (
                  <div key={asset.id} style={{ background: '#FFFFFF', border: '1px solid #C8DFE0', borderRadius: '14px', overflow: 'hidden' }}>
                    <img
                      src={asset.image_url}
                      alt={asset.label ?? asset.asset_type}
                      style={{ width: '100%', display: 'block', aspectRatio: '16/9', objectFit: 'cover', background: '#E8EEF4' }}
                    />
                    <div style={{ padding: '14px 16px' }}>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F1923', marginBottom: '4px', textTransform: 'capitalize' }}>
                        {asset.label ?? asset.asset_type.replace(/_/g, ' ')}
                      </div>
                      <div style={{ fontSize: '12px', color: '#B8CDD8', marginBottom: '12px' }}>
                        {new Date(asset.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {asset.aspect_ratio && <span style={{ marginLeft: '8px' }}>{asset.aspect_ratio}</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <a href={asset.image_url} download target="_blank" rel="noreferrer"
                          style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', borderRadius: '8px', background: '#E8EEF4', color: '#0F1923', fontSize: '12px', fontWeight: 700, textDecoration: 'none' }}>
                          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          Download
                        </a>
                        <button
                          onClick={() => { navigator.clipboard.writeText(asset.image_url) }}
                          style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', borderRadius: '8px', border: '1px solid #C8DFE0', background: 'transparent', color: '#5B7080', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                          Copy URL
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
