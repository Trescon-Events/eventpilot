'use client'

import { useState, useEffect, use, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// ── Types ──────────────────────────────────────────────────────────────────────
type ColorEntry  = { name: string; hex: string; role: string; cmyk?: { c: number; m: number; y: number; k: number } | null; usage_notes?: string | null; print_caution?: string | null }
type TypeLevel   = { level: string; size_px: number; weight: number; line_height: string; usage: string }
type Archetype   = { role: string; name: string; description: string }
type PatternAsset= { name: string; url: string | null; usage_context: string; background_tone: string }
type Breakpoint  = { name: string; min_px: number; max_px: number | null }
type SpacingToken= { name: string; value_px: number }
type ImgTreatment= { name: string; description: string; use_cases: string[] }

type Guidelines = {
  id?: string
  event_id?: string
  // Identity
  brand_name?: string | null
  positioning_statement?: string | null
  brand_category?: string | null
  brand_vision?: string | null
  brand_mission?: string | null
  brand_archetypes?: Archetype[]
  // Logo
  logo_primary_url?: string | null
  logo_white_url?: string | null
  logo_dark_url?: string | null
  logo_horizontal_url?: string | null
  logo_favicon_url?: string | null
  logo_min_size_digital?: string | null
  logo_min_size_print?: string | null
  logo_clear_space?: string | null
  logo_donts?: string[]
  logo_cobranding_rules?: string | null
  logo_concept?: string | null
  logo_notes?: string | null
  // Colors
  primary_color?: string
  secondary_color?: string
  accent_color?: string
  background_color?: string
  text_color?: string
  color_palette?: ColorEntry[]
  color_usage_rules?: string | null
  color_contrast_min?: string | null
  // Typography
  heading_font?: string
  body_font?: string
  type_scale_ratio?: string | null
  type_scale?: TypeLevel[]
  type_rules_dos?: string[]
  type_rules_donts?: string[]
  // Patterns
  pattern_assets?: PatternAsset[]
  // Imagery
  imagery_philosophy?: string[]
  photography_direction?: { subjects?: string[]; dos?: string[]; donts?: string[] }
  overlay_types?: string[]
  imagery_treatments?: ImgTreatment[]
  // Icons
  icon_system?: string | null
  icon_grid_size?: string | null
  icon_rules?: string | null
  // Grid
  grid_base_px?: number
  grid_columns?: number
  breakpoints?: Breakpoint[]
  spacing_tokens?: SpacingToken[]
  // Voice
  tone?: string[]
  key_messages?: string[]
  style_keywords?: string[]
  // Event Standards
  event_standards?: Record<string, unknown> | null
  // Meta
  source_pdf_url?: string | null
  build_mode?: string | null
  extracted_at?: string | null
  ai_reasoning?: string | null
  updated_at?: string
}

type BrandAsset = { id: string; event_id: string; asset_type: string; label: string | null; image_url: string; aspect_ratio: string | null; created_at: string }
type Event = { id: string; name: string; event_date: string | null }

// ── Constants ──────────────────────────────────────────────────────────────────
const GOOGLE_FONTS = ['Inter','Manrope','Plus Jakarta Sans','DM Sans','Sora','Outfit','Space Grotesk','Raleway','Montserrat','Playfair Display','Lato','Poppins','Nunito','Roboto','Open Sans']
const COLOR_ROLES  = ['primary','secondary','accent','neutral-light','neutral-dark','other']
const TABS = [
  { id: 'upload',     label: 'Import PDF' },
  { id: 'identity',   label: 'Identity' },
  { id: 'logo',       label: 'Logo' },
  { id: 'colors',     label: 'Colors' },
  { id: 'typography', label: 'Typography' },
  { id: 'patterns',   label: 'Patterns' },
  { id: 'imagery',    label: 'Imagery' },
  { id: 'grid',       label: 'Grid & Layout' },
  { id: 'voice',      label: 'Voice' },
  { id: 'standards',  label: 'Event Standards' },
  { id: 'assets',     label: 'Asset Generator' },
] as const
type TabId = typeof TABS[number]['id']

const ASSET_TYPES = [
  { id: 'banner',          label: 'Event Banner',    aspect: '16:9' },
  { id: 'social_post',     label: 'Social Post',     aspect: '1:1'  },
  { id: 'linkedin_banner', label: 'LinkedIn Banner', aspect: '16:9' },
  { id: 'speaker_card',    label: 'Speaker Card',    aspect: '1:1'  },
  { id: 'sponsor_card',    label: 'Sponsor Card',    aspect: '4:3'  },
] as const

// ── Shared style tokens ────────────────────────────────────────────────────────
const S = {
  card:    { background: '#FFFFFF', border: '1px solid #C8DFE0', borderRadius: '14px', padding: '24px' } as React.CSSProperties,
  label:   { fontSize: '11px', fontWeight: 800, color: '#5B7080', textTransform: 'uppercase' as const, letterSpacing: '1.5px', marginBottom: '8px', display: 'block' as const },
  input:   { width: '100%', padding: '10px 13px', borderRadius: '8px', border: '1px solid #C8DFE0', fontSize: '14px', fontFamily: 'inherit', color: '#0F1923', background: '#FAFBFC', boxSizing: 'border-box' as const, outline: 'none' },
  textarea:{ width: '100%', padding: '10px 13px', borderRadius: '8px', border: '1px solid #C8DFE0', fontSize: '14px', fontFamily: 'inherit', color: '#0F1923', background: '#FAFBFC', resize: 'vertical' as const, lineHeight: 1.6, boxSizing: 'border-box' as const, outline: 'none' },
  sectionTitle: { fontSize: '13px', fontWeight: 800, color: '#5B7080', textTransform: 'uppercase' as const, letterSpacing: '1.5px', marginBottom: '20px' },
  chip:    { display: 'inline-flex', alignItems: 'center' as const, gap: '6px', padding: '5px 12px', borderRadius: '20px', background: 'rgba(0,165,163,0.1)', border: '1px solid rgba(0,165,163,0.25)', fontSize: '13px', fontWeight: 700, color: '#00695C' },
  addBtn:  { padding: '5px 12px', borderRadius: '20px', border: '1px dashed #C8DFE0', background: 'transparent', fontSize: '13px', color: '#5B7080', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 },
}

// ── Helper components ──────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <span style={S.label}>{label}</span>
      {children}
    </div>
  )
}

function ChipList({ values, onChange }: { values: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)
  function add() {
    const t = draft.trim()
    if (t && !values.includes(t)) onChange([...values, t])
    setDraft(''); setAdding(false)
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
      {values.map(v => (
        <span key={v} style={S.chip}>
          {v}
          <button onClick={() => onChange(values.filter(x => x !== v))}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#00A5A3', padding: 0, fontSize: '14px', fontWeight: 900, lineHeight: 1 }}>×</button>
        </span>
      ))}
      {adding
        ? <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); if (e.key === 'Escape') { setAdding(false); setDraft('') } }}
            onBlur={add} placeholder="Type + Enter"
            style={{ ...S.input, padding: '5px 12px', borderRadius: '20px', minWidth: '140px', width: 'auto' }} />
        : <button onClick={() => setAdding(true)} style={S.addBtn}>+ Add</button>
      }
    </div>
  )
}

function StringList({ values, placeholder, onChange }: { values: string[]; placeholder?: string; onChange: (v: string[]) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {values.map((v, i) => (
        <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: '#E8EEF4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800, color: '#5B7080', flexShrink: 0 }}>{i + 1}</div>
          <input value={v} onChange={e => { const a = [...values]; a[i] = e.target.value; onChange(a) }}
            placeholder={placeholder} style={{ ...S.input, flex: 1 }} />
          <button onClick={() => onChange(values.filter((_, j) => j !== i))}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B8CDD8', fontSize: '18px', lineHeight: 1, padding: '4px', flexShrink: 0 }}>×</button>
        </div>
      ))}
      <button onClick={() => onChange([...values, ''])}
        style={{ ...S.addBtn, alignSelf: 'flex-start', marginTop: '4px', borderRadius: '8px' }}>
        + Add
      </button>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function BrandStudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const router = useRouter()

  // Grant guard — redirect non-admins without brand_studio grant
  useEffect(() => {
    fetch('/api/toolkit-access').then(r => r.json()).then(d => {
      const isAdmin = d.grants === null
      const hasGrant = d.grants?.brand_studio === true
      if (!isAdmin && !hasGrant) router.replace('/dashboard')
    }).catch(() => {})
  }, [router])

  const [tab,          setTab]          = useState<TabId>('upload')
  const [event,        setEvent]        = useState<Event | null>(null)
  const [guidelines,   setGuidelines]   = useState<Guidelines | null>(null)
  const [assets,       setAssets]       = useState<BrandAsset[]>([])
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [msg,          setMsg]          = useState<{ text: string; ok: boolean } | null>(null)

  // PDF import
  const [pdfUploading, setPdfUploading] = useState(false)
  const [pdfFileName,  setPdfFileName]  = useState<string | null>(null)
  const [extracting,   setExtracting]   = useState(false)
  const [extractProgress, setExtractProgress] = useState('')

  // Form state — mirrors Guidelines type
  const [brandName,        setBrandName]        = useState('')
  const [positioning,      setPositioning]      = useState('')
  const [brandCategory,    setBrandCategory]    = useState('')
  const [vision,           setVision]           = useState('')
  const [mission,          setMission]          = useState('')
  const [archetypes,       setArchetypes]       = useState<Archetype[]>([])

  const [logoConcept,      setLogoConcept]      = useState('')
  const [logoMinDigital,   setLogoMinDigital]   = useState('')
  const [logoMinPrint,     setLogoMinPrint]     = useState('')
  const [logoClearSpace,   setLogoClearSpace]   = useState('')
  const [logoCobrand,      setLogoCobrand]      = useState('')
  const [logoDonts,        setLogoDonts]        = useState<string[]>([])
  const [logoNotes,        setLogoNotes]        = useState('')

  const [colorPalette,     setColorPalette]     = useState<ColorEntry[]>([])
  const [colorUsageRules,  setColorUsageRules]  = useState('')
  const [colorContrastMin, setColorContrastMin] = useState('4.5:1')

  const [headingFont,      setHeadingFont]      = useState('Inter')
  const [bodyFont,         setBodyFont]         = useState('Inter')
  const [typeScaleRatio,   setTypeScaleRatio]   = useState('1.200')
  const [typeScale,        setTypeScale]        = useState<TypeLevel[]>([])
  const [typeRulesDos,     setTypeRulesDos]     = useState<string[]>([])
  const [typeRulesDonts,   setTypeRulesDonts]   = useState<string[]>([])

  const [patternAssets,    setPatternAssets]    = useState<PatternAsset[]>([])

  const [imageryPhilosophy,    setImageryPhilosophy]    = useState<string[]>([])
  const [photographySubjects,  setPhotographySubjects]  = useState<string[]>([])
  const [photographyDos,       setPhotographyDos]       = useState<string[]>([])
  const [photographyDonts,     setPhotographyDonts]     = useState<string[]>([])
  const [overlayTypes,         setOverlayTypes]         = useState<string[]>([])
  const [imageryTreatments,    setImageryTreatments]    = useState<ImgTreatment[]>([])

  const [iconSystem,       setIconSystem]       = useState('')
  const [iconGridSize,     setIconGridSize]     = useState('')
  const [iconRules,        setIconRules]        = useState('')

  const [gridBasePx,       setGridBasePx]       = useState(4)
  const [gridColumns,      setGridColumns]      = useState(12)
  const [breakpoints,      setBreakpoints]      = useState<Breakpoint[]>([])
  const [spacingTokens,    setSpacingTokens]    = useState<SpacingToken[]>([])

  const [tone,             setTone]             = useState<string[]>([])
  const [keyMessages,      setKeyMessages]      = useState<string[]>([])
  const [styleKeywords,    setStyleKeywords]    = useState<string[]>([])

  // Event Standards
  const [stdDateFormat,     setStdDateFormat]     = useState('15 August 2025')
  const [stdDateCustom,     setStdDateCustom]     = useState('')
  const [stdVenueFormat,    setStdVenueFormat]    = useState('Venue name + City')
  const [stdVenueCustom,    setStdVenueCustom]    = useState('')
  const [stdTaglineCase,    setStdTaglineCase]    = useState('ALL CAPS')
  const [stdTaglineWeight,  setStdTaglineWeight]  = useState('Bold')
  const [stdTaglinePlacement, setStdTaglinePlacement] = useState('')
  const [stdTaglineNotes,   setStdTaglineNotes]   = useState('')
  const [stdPortraitUrl,    setStdPortraitUrl]    = useState('')
  const [stdLandscapeUrl,   setStdLandscapeUrl]   = useState('')
  const [stdSquareUrl,      setStdSquareUrl]      = useState('')
  const [stdNotes,          setStdNotes]          = useState('')

  // Asset generator
  const [selectedAsset,  setSelectedAsset]  = useState<typeof ASSET_TYPES[number]>(ASSET_TYPES[0])
  const [prompt,         setPrompt]         = useState('')
  const [generatingImg,  setGeneratingImg]  = useState(false)
  const [generatedImg,   setGeneratedImg]   = useState<string | null>(null)
  const [imgError,       setImgError]       = useState<string | null>(null)

  // ── Apply loaded guidelines to all form fields ────────────────
  function applyToForm(g: Guidelines) {
    setBrandName(g.brand_name ?? '')
    setPositioning(g.positioning_statement ?? '')
    setBrandCategory(g.brand_category ?? '')
    setVision(g.brand_vision ?? '')
    setMission(g.brand_mission ?? '')
    setArchetypes(g.brand_archetypes ?? [])
    setLogoConcept(g.logo_concept ?? '')
    setLogoMinDigital(g.logo_min_size_digital ?? '')
    setLogoMinPrint(g.logo_min_size_print ?? '')
    setLogoClearSpace(g.logo_clear_space ?? '')
    setLogoCobrand(g.logo_cobranding_rules ?? '')
    setLogoDonts(g.logo_donts ?? [])
    setLogoNotes(g.logo_notes ?? '')
    setColorPalette(g.color_palette ?? [])
    setColorUsageRules(g.color_usage_rules ?? '')
    setColorContrastMin(g.color_contrast_min ?? '4.5:1')
    setHeadingFont(g.heading_font ?? 'Inter')
    setBodyFont(g.body_font ?? 'Inter')
    setTypeScaleRatio(g.type_scale_ratio ?? '1.200')
    setTypeScale(g.type_scale ?? [])
    setTypeRulesDos(g.type_rules_dos ?? [])
    setTypeRulesDonts(g.type_rules_donts ?? [])
    setPatternAssets(g.pattern_assets ?? [])
    setImageryPhilosophy(g.imagery_philosophy ?? [])
    setPhotographySubjects(g.photography_direction?.subjects ?? [])
    setPhotographyDos(g.photography_direction?.dos ?? [])
    setPhotographyDonts(g.photography_direction?.donts ?? [])
    setOverlayTypes(g.overlay_types ?? [])
    setImageryTreatments(g.imagery_treatments ?? [])
    setIconSystem(g.icon_system ?? '')
    setIconGridSize(g.icon_grid_size ?? '')
    setIconRules(g.icon_rules ?? '')
    setGridBasePx(g.grid_base_px ?? 4)
    setGridColumns(g.grid_columns ?? 12)
    setBreakpoints(g.breakpoints ?? [])
    setSpacingTokens(g.spacing_tokens ?? [])
    setTone(g.tone ?? [])
    setKeyMessages(g.key_messages ?? [])
    setStyleKeywords(g.style_keywords ?? [])
    // Event Standards
    const std = (g.event_standards ?? {}) as Record<string, string>
    if (std.date_format)       setStdDateFormat(std.date_format)
    if (std.date_custom)       setStdDateCustom(std.date_custom)
    if (std.venue_format)      setStdVenueFormat(std.venue_format)
    if (std.venue_custom)      setStdVenueCustom(std.venue_custom)
    if (std.tagline_case)      setStdTaglineCase(std.tagline_case)
    if (std.tagline_weight)    setStdTaglineWeight(std.tagline_weight)
    if (std.tagline_placement) setStdTaglinePlacement(std.tagline_placement)
    if (std.tagline_notes)     setStdTaglineNotes(std.tagline_notes)
    if (std.portrait_url)      setStdPortraitUrl(std.portrait_url)
    if (std.landscape_url)     setStdLandscapeUrl(std.landscape_url)
    if (std.square_url)        setStdSquareUrl(std.square_url)
    if (std.notes)             setStdNotes(std.notes)
  }

  // ── Load ──────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch(`/api/events?id=${eventId}`).then(r => r.json()).catch(() => null),
      fetch(`/api/events/brand?event_id=${eventId}`).then(r => r.json()).catch(() => null),
    ]).then(([ev, brand]) => {
      const evData = Array.isArray(ev) ? ev[0] : ev
      if (evData) setEvent(evData)
      if (brand?.guidelines) {
        setGuidelines(brand.guidelines)
        applyToForm(brand.guidelines)
      }
      setAssets(brand?.assets ?? [])
      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  // ── Auto-build asset prompt ───────────────────────────────────
  const buildPrompt = useCallback((a: typeof ASSET_TYPES[number]) => {
    const primary   = colorPalette.find(c => c.role === 'primary')?.hex   ?? '#0F1923'
    const secondary = colorPalette.find(c => c.role === 'secondary')?.hex ?? '#00A5A3'
    const accent    = colorPalette.find(c => c.role === 'accent')?.hex    ?? '#C0F43C'
    const name = event?.name ?? 'Event'
    switch (a.id) {
      case 'banner':
        return `Professional event banner for ${name}. Primary color ${primary}, secondary ${secondary}. Style: ${styleKeywords.join(', ') || 'clean, modern, corporate'}. Clean geometric design, no text.`
      case 'social_post':
        return `Bold square social media post for ${name}. Colors: ${primary} and ${accent}. ${styleKeywords.join(', ') || 'geometric, bold, institutional'}. Abstract shapes, no text.`
      case 'linkedin_banner':
        return `LinkedIn banner for ${name}. Dark background ${primary}, accent ${secondary}. Wide format, corporate conference branding, no text.`
      case 'speaker_card':
        return `Speaker announcement card for ${name}. Dark background, accent ${accent}. Premium conference aesthetic, no faces, no text.`
      case 'sponsor_card':
        return `Sponsor card for ${name}. Colors: ${primary} and ${secondary}. Clean, professional, trust-building design, no text.`
      default:
        return `Professional visual for ${name}. Colors: ${primary}, ${secondary}, ${accent}.`
    }
  }, [event, colorPalette, styleKeywords])

  useEffect(() => { setPrompt(buildPrompt(selectedAsset)) }, [selectedAsset, buildPrompt])

  // ── Save all sections ─────────────────────────────────────────
  async function save() {
    setSaving(true); setMsg(null)
    const payload = {
      event_id: eventId,
      brand_name: brandName || null,
      positioning_statement: positioning || null,
      brand_category: brandCategory || null,
      brand_vision: vision || null,
      brand_mission: mission || null,
      brand_archetypes: archetypes,
      logo_concept: logoConcept || null,
      logo_min_size_digital: logoMinDigital || null,
      logo_min_size_print: logoMinPrint || null,
      logo_clear_space: logoClearSpace || null,
      logo_cobranding_rules: logoCobrand || null,
      logo_donts: logoDonts,
      logo_notes: logoNotes || null,
      color_palette: colorPalette,
      color_usage_rules: colorUsageRules || null,
      color_contrast_min: colorContrastMin,
      // Derive simple fields from palette for backwards compat
      primary_color:   colorPalette.find(c => c.role === 'primary')?.hex   ?? '#0F1923',
      secondary_color: colorPalette.find(c => c.role === 'secondary')?.hex ?? '#00A5A3',
      accent_color:    colorPalette.find(c => c.role === 'accent')?.hex    ?? '#C0F43C',
      background_color:colorPalette.find(c => c.role === 'neutral-light')?.hex ?? '#FFFFFF',
      text_color:      colorPalette.find(c => c.role === 'neutral-dark')?.hex  ?? '#0F1923',
      heading_font: headingFont,
      body_font: bodyFont,
      type_scale_ratio: typeScaleRatio || null,
      type_scale: typeScale,
      type_rules_dos: typeRulesDos,
      type_rules_donts: typeRulesDonts,
      pattern_assets: patternAssets,
      imagery_philosophy: imageryPhilosophy,
      photography_direction: { subjects: photographySubjects, dos: photographyDos, donts: photographyDonts },
      overlay_types: overlayTypes,
      imagery_treatments: imageryTreatments,
      icon_system: iconSystem || null,
      icon_grid_size: iconGridSize || null,
      icon_rules: iconRules || null,
      grid_base_px: gridBasePx,
      grid_columns: gridColumns,
      breakpoints,
      spacing_tokens: spacingTokens,
      tone,
      key_messages: keyMessages,
      style_keywords: styleKeywords,
      event_standards: {
        date_format:       stdDateFormat,
        date_custom:       stdDateCustom || null,
        venue_format:      stdVenueFormat,
        venue_custom:      stdVenueCustom || null,
        tagline_case:      stdTaglineCase,
        tagline_weight:    stdTaglineWeight,
        tagline_placement: stdTaglinePlacement || null,
        tagline_notes:     stdTaglineNotes || null,
        portrait_url:      stdPortraitUrl || null,
        landscape_url:     stdLandscapeUrl || null,
        square_url:        stdSquareUrl || null,
        notes:             stdNotes || null,
      },
      build_mode: guidelines?.build_mode ?? 'manual',
    }
    const res = await fetch('/api/events/brand', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (res.ok) { setGuidelines(data); setMsg({ text: 'Brand guidelines saved.', ok: true }) }
    else { setMsg({ text: data.error ?? 'Save failed.', ok: false }) }
    setSaving(false)
  }

  // ── PDF import ────────────────────────────────────────────────
  async function importFromPDF(file: File) {
    // Pre-check file size (Supabase free plan: 50 MB max)
    if (file.size > 52428800) {
      const sizeMB = Math.round(file.size / 1048576)
      setMsg({ text: `File is ${sizeMB} MB — maximum allowed is 50 MB. Please compress the PDF first.`, ok: false })
      return
    }
    setPdfUploading(true); setPdfFileName(file.name); setMsg(null)
    try {
      setExtractProgress('Uploading PDF…')
      const urlRes = await fetch(`/api/events/brand/upload-url?event_id=${eventId}&filename=${encodeURIComponent(file.name)}`)
      if (!urlRes.ok) { const e = await urlRes.json(); setMsg({ text: `Upload failed: ${e.error}`, ok: false }); setPdfUploading(false); return }
      const { signedUrl, publicUrl } = await urlRes.json()

      setExtractProgress('Storing PDF…')
      const uploadRes = await fetch(signedUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: file })
      if (!uploadRes.ok) { setMsg({ text: `Storage error: ${uploadRes.statusText}`, ok: false }); setPdfUploading(false); return }

      setExtractProgress('Gemini is reading the brand book — this takes 30–60 seconds for large PDFs…')
      setExtracting(true)
      const res  = await fetch('/api/events/brand/extract-pdf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdf_url: publicUrl, event_id: eventId }),
      })
      const data = await res.json()
      setExtracting(false)

      if (!res.ok) { setMsg({ text: data.error ?? 'Extraction failed.', ok: false }); setPdfUploading(false); return }

      // Apply extracted data to all form fields
      applyToForm(data)
      setGuidelines(prev => ({ ...prev, ...data, source_pdf_url: publicUrl, build_mode: 'pdf_extracted' }))

      const summary = [
        data.brand_name                   ? `Brand: ${data.brand_name}`                   : null,
        data.color_palette?.length        ? `${data.color_palette.length} colours`         : null,
        data.heading_font                 ? `Heading: ${data.heading_font}`                : null,
        data.body_font                    ? `Body: ${data.body_font}`                      : null,
        data.type_scale?.length           ? `${data.type_scale.length} type levels`        : null,
        data.breakpoints?.length          ? `${data.breakpoints.length} breakpoints`       : null,
        data.spacing_tokens?.length       ? `${data.spacing_tokens.length} spacing tokens` : null,
        data.logo_donts?.length           ? `${data.logo_donts.length} logo rules`         : null,
        data.imagery_philosophy?.length   ? `Imagery guidelines`                           : null,
      ].filter(Boolean).join(' · ')

      setMsg({ text: `Brand book extracted — ${summary}. Review each section and save.`, ok: true })
      setTab('identity')
    } catch (e) {
      setExtracting(false)
      setMsg({ text: `Error: ${e instanceof Error ? e.message : 'Unknown'}`, ok: false })
    }
    setExtractProgress('')
    setPdfUploading(false)
  }

  // ── Image generation ──────────────────────────────────────────
  async function generateImage() {
    setGeneratingImg(true); setImgError(null); setGeneratedImg(null)
    const res = await fetch('/api/events/brand/image', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, asset_type: selectedAsset.id, prompt, aspect_ratio: selectedAsset.aspect }),
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

  // ── Completion check ──────────────────────────────────────────
  const completedSections = [
    brandName,
    colorPalette.length > 0,
    headingFont !== 'Inter' || bodyFont !== 'Inter',
    logoDonts.length > 0 || logoConcept,
    typeScale.length > 0,
    patternAssets.length > 0,
    imageryPhilosophy.length > 0,
    gridBasePx > 0,
    tone.length > 0,
  ].filter(Boolean).length

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#E8EEF4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-manrope), Manrope, sans-serif' }}>
        <span style={{ fontSize: '15px', color: '#5B7080' }}>Loading Brand Studio…</span>
      </div>
    )
  }

  const primaryHex   = colorPalette.find(c => c.role === 'primary')?.hex   ?? '#0F1923'
  const secondaryHex = colorPalette.find(c => c.role === 'secondary')?.hex ?? '#00A5A3'
  const accentHex    = colorPalette.find(c => c.role === 'accent')?.hex    ?? '#C0F43C'

  return (
    <div style={{ minHeight: '100vh', background: '#E8EEF4', fontFamily: 'var(--font-manrope), Manrope, sans-serif', color: '#0F1923' }}>

      {/* ── Top bar ── */}
      <nav style={{ background: '#0F1923', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0 32px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link href={`/admin/events/${eventId}`}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'rgba(255,255,255,0.55)', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Event
          </Link>
          <span style={{ color: 'rgba(255,255,255,0.2)' }}>/</span>
          <div>
            {event && <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>{event.name}</div>}
            <div style={{ fontSize: '15px', fontWeight: 900, color: '#FFFFFF' }}>Brand Studio</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* Completion indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 14px', borderRadius: '20px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ width: '60px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.round(completedSections / 9 * 100)}%`, height: '100%', background: '#C0F43C', borderRadius: '2px', transition: 'width 0.3s' }} />
            </div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>{completedSections}/9 sections</span>
          </div>
          {guidelines?.build_mode && (
            <div style={{ padding: '5px 12px', borderRadius: '20px', background: guidelines.build_mode === 'pdf_extracted' ? 'rgba(0,165,163,0.2)' : 'rgba(255,255,255,0.08)', fontSize: '11px', fontWeight: 700, color: guidelines.build_mode === 'pdf_extracted' ? '#00A5A3' : 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {guidelines.build_mode === 'pdf_extracted' ? 'PDF Extracted' : guidelines.build_mode === 'ai_generated' ? 'AI Generated' : 'Manual'}
            </div>
          )}
          <button
            onClick={() => window.open(`/api/events/brand/export-pdf?event_id=${eventId}`, '_blank')}
            disabled={!guidelines?.brand_name}
            style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#ffffff', fontSize: '13px', fontWeight: 800, cursor: guidelines?.brand_name ? 'pointer' : 'not-allowed', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '7px', opacity: guidelines?.brand_name ? 1 : 0.4 }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
            Export PDF
          </button>
          <button onClick={save} disabled={saving}
            style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: saving ? '#A0BA30' : '#C0F43C', color: '#0F1923', fontSize: '13px', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '7px' }}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            {saving ? 'Saving…' : 'Save All'}
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 32px 80px' }}>

        {/* Message */}
        {msg && (
          <div style={{ marginBottom: '12px', padding: '12px 18px', borderRadius: '10px', background: msg.ok ? 'rgba(192,244,60,0.08)' : 'rgba(255,107,107,0.08)', border: `1px solid ${msg.ok ? 'rgba(192,244,60,0.3)' : 'rgba(255,107,107,0.3)'}`, color: msg.ok ? '#3D6B00' : '#DC2626', fontSize: '14px', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {msg.text}
            <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '18px', padding: '0 4px' }}>×</button>
          </div>
        )}
        {msg?.ok && msg.text.includes('saved') && (
          <div style={{ marginBottom: '20px', padding: '14px 20px', borderRadius: '12px', background: 'rgba(0,105,92,0.05)', border: '1px solid rgba(0,105,92,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <svg width="16" height="16" fill="none" stroke="#00695C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#00695C' }}>Brand guidelines saved. Next: build the event website using these guidelines.</span>
            </div>
            <Link href={`/admin/events/${eventId}/website`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 18px', borderRadius: '9px', background: '#00695C', color: '#fff', fontSize: '13px', fontWeight: 800, textDecoration: 'none', whiteSpace: 'nowrap' }}>
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              Build Website
            </Link>
          </div>
        )}

        {/* ── Tab navigation ── */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '28px', background: '#FFFFFF', border: '1px solid #C8DFE0', borderRadius: '14px', padding: '5px', overflowX: 'auto', flexWrap: 'nowrap' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: '8px 16px', borderRadius: '9px', border: 'none', background: tab === t.id ? '#0F1923' : 'transparent', color: tab === t.id ? '#C0F43C' : '#5B7080', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all 0.15s', flexShrink: 0 }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════
            TAB: IMPORT PDF
        ════════════════════════════════════════════════════════ */}
        {tab === 'upload' && (
          <div style={{ display: 'grid', gap: '24px' }}>
            <div style={S.card}>
              <div style={{ ...S.sectionTitle, marginBottom: '6px' }}>Import Brand Guidelines PDF</div>
              <p style={{ fontSize: '14px', color: '#5B7080', lineHeight: 1.6, marginBottom: '24px', marginTop: 0 }}>
                Upload a brand guidelines document. Gemini will extract all 9 sections — identity, logo rules, colour palette with hex codes, typography scale, patterns, imagery direction, icon system, grid tokens, and brand voice — and populate every field in Brand Studio automatically.
              </p>

              <label
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', padding: '40px 24px', border: `2px dashed ${pdfUploading ? '#00A5A3' : '#C8DFE0'}`, borderRadius: '14px', background: pdfUploading ? 'rgba(0,165,163,0.04)' : '#FAFBFC', cursor: pdfUploading ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#00A5A3' }}
                onDragLeave={e => { e.currentTarget.style.borderColor = '#C8DFE0' }}
                onDrop={e => {
                  e.preventDefault(); e.currentTarget.style.borderColor = '#C8DFE0'
                  if (pdfUploading) return
                  const file = e.dataTransfer.files?.[0]
                  if (file?.type === 'application/pdf') importFromPDF(file)
                  else setMsg({ text: 'Only PDF files are supported.', ok: false })
                }}>
                <input type="file" accept="application/pdf" style={{ display: 'none' }} disabled={pdfUploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) importFromPDF(f); e.target.value = '' }} />
                {pdfUploading ? (
                  <>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', border: '3px solid rgba(0,165,163,0.2)', borderTopColor: '#00A5A3', animation: 'spin 0.8s linear infinite' }} />
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#00A5A3', marginBottom: '6px' }}>
                        {extracting ? 'Gemini is analysing the brand book…' : extractProgress || 'Processing…'}
                      </div>
                      <div style={{ fontSize: '13px', color: '#5B7080' }}>This can take 30–60 seconds for large PDFs</div>
                    </div>
                    {pdfFileName && <div style={{ fontSize: '12px', color: '#5B7080', fontWeight: 600 }}>{pdfFileName}</div>}
                  </>
                ) : (
                  <>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#A0B4C0" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
                    </svg>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#2D3E50', marginBottom: '5px' }}>Drop brand PDF here or click to browse</div>
                      <div style={{ fontSize: '13px', color: '#5B7080' }}>PDF only · Up to 50 MB · AI extracts all 9 brand sections</div>
                    </div>
                    {pdfFileName && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '20px', background: 'rgba(192,244,60,0.1)', border: '1px solid rgba(192,244,60,0.3)' }}>
                        <svg width="12" height="12" fill="none" stroke="#3D6B00" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#3D6B00' }}>{pdfFileName}</span>
                      </div>
                    )}
                  </>
                )}
              </label>
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>

            {/* What gets extracted */}
            <div style={S.card}>
              <div style={S.sectionTitle}>What Gemini extracts from the PDF</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                {[
                  { section: 'Brand Identity', items: ['Name & positioning', 'Vision & mission', 'Brand archetypes'] },
                  { section: 'Logo Rules', items: ['Minimum sizes', 'Clear space rules', "Do's and don'ts"] },
                  { section: 'Colour Palette', items: ['All hex codes', 'Colour roles & names', 'Usage rules'] },
                  { section: 'Typography', items: ['Heading & body fonts', 'Full type scale', 'Weight & line heights'] },
                  { section: 'Patterns & Textures', items: ['Pattern names', 'Usage contexts', 'Background tones'] },
                  { section: 'Imagery', items: ['Visual philosophy', 'Photography direction', 'Overlay types'] },
                  { section: 'Icon System', items: ['Icon library', 'Grid size', 'Usage rules'] },
                  { section: 'Grid & Layout', items: ['Base grid (px)', 'Column count', 'Spacing tokens'] },
                  { section: 'Brand Voice', items: ['Tone descriptors', 'Style keywords', 'Key messages'] },
                ].map(({ section, items }) => (
                  <div key={section} style={{ padding: '14px 16px', borderRadius: '10px', background: '#F8FAFF', border: '1px solid #E8EEF4' }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F1923', marginBottom: '8px' }}>{section}</div>
                    {items.map(item => (
                      <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <svg width="10" height="10" fill="none" stroke="#00A5A3" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                        <span style={{ fontSize: '12px', color: '#5B7080' }}>{item}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            TAB: IDENTITY
        ════════════════════════════════════════════════════════ */}
        {tab === 'identity' && (
          <div style={S.card}>
            <div style={S.sectionTitle}>Brand Identity</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
              <Field label="Brand Name"><input value={brandName} onChange={e => setBrandName(e.target.value)} style={S.input} placeholder="e.g. AI 2047" /></Field>
              <Field label="Brand Category"><input value={brandCategory} onChange={e => setBrandCategory(e.target.value)} style={S.input} placeholder="e.g. Institutional Technology Platform" /></Field>
            </div>
            <Field label="Positioning Statement"><input value={positioning} onChange={e => setPositioning(e.target.value)} style={S.input} placeholder="One-line brand positioning" /></Field>
            <Field label="Brand Vision"><textarea value={vision} onChange={e => setVision(e.target.value)} rows={3} style={S.textarea} placeholder="Long-term vision statement" /></Field>
            <Field label="Brand Mission"><textarea value={mission} onChange={e => setMission(e.target.value)} rows={3} style={S.textarea} placeholder="Mission statement" /></Field>
            <div>
              <span style={S.label}>Brand Archetypes</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {archetypes.map((a, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr auto', gap: '10px', alignItems: 'center' }}>
                    <select value={a.role} onChange={e => { const arr = [...archetypes]; arr[i] = { ...a, role: e.target.value }; setArchetypes(arr) }}
                      style={{ ...S.input, padding: '8px 10px' }}>
                      {['primary','secondary','tertiary'].map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <input value={a.name} onChange={e => { const arr = [...archetypes]; arr[i] = { ...a, name: e.target.value }; setArchetypes(arr) }}
                      placeholder="e.g. The Steward" style={S.input} />
                    <input value={a.description} onChange={e => { const arr = [...archetypes]; arr[i] = { ...a, description: e.target.value }; setArchetypes(arr) }}
                      placeholder="Short description" style={S.input} />
                    <button onClick={() => setArchetypes(archetypes.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B8CDD8', fontSize: '18px', padding: '4px' }}>×</button>
                  </div>
                ))}
                <button onClick={() => setArchetypes([...archetypes, { role: 'primary', name: '', description: '' }])}
                  style={{ ...S.addBtn, alignSelf: 'flex-start', borderRadius: '8px' }}>+ Add Archetype</button>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            TAB: LOGO
        ════════════════════════════════════════════════════════ */}
        {tab === 'logo' && (
          <div style={{ display: 'grid', gap: '20px' }}>
            <div style={S.card}>
              <div style={S.sectionTitle}>Logo Concept & Rules</div>
              <Field label="Design Concept"><textarea value={logoConcept} onChange={e => setLogoConcept(e.target.value)} rows={3} style={S.textarea} placeholder="The foundational design story and concept behind the logo" /></Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
                <Field label="Minimum Size — Digital"><input value={logoMinDigital} onChange={e => setLogoMinDigital(e.target.value)} style={S.input} placeholder="e.g. 64px" /></Field>
                <Field label="Minimum Size — Print"><input value={logoMinPrint} onChange={e => setLogoMinPrint(e.target.value)} style={S.input} placeholder="e.g. 16mm" /></Field>
              </div>
              <Field label="Clear Space Rule"><input value={logoClearSpace} onChange={e => setLogoClearSpace(e.target.value)} style={S.input} placeholder="e.g. Width of the letter X on all sides" /></Field>
              <Field label="Co-branding Rules"><textarea value={logoCobrand} onChange={e => setLogoCobrand(e.target.value)} rows={3} style={S.textarea} placeholder="Rules for placing the logo alongside partner logos, government bodies, sponsors…" /></Field>
              <Field label="Additional Notes"><textarea value={logoNotes} onChange={e => setLogoNotes(e.target.value)} rows={2} style={S.textarea} placeholder="Any other logo usage guidance" /></Field>
            </div>
            <div style={S.card}>
              <div style={S.sectionTitle}>Logo Don'ts</div>
              <StringList values={logoDonts} placeholder="e.g. Don't rotate the logo" onChange={setLogoDonts} />
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            TAB: COLORS
        ════════════════════════════════════════════════════════ */}
        {tab === 'colors' && (
          <div style={{ display: 'grid', gap: '20px' }}>
            <div style={S.card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div style={S.sectionTitle as React.CSSProperties}>Colour Palette</div>
                <button onClick={() => setColorPalette([...colorPalette, { name: '', hex: '#000000', role: 'other', cmyk: null, usage_notes: '', print_caution: '' }])}
                  style={{ ...S.addBtn, borderRadius: '8px' }}>+ Add Colour</button>
              </div>
              {colorPalette.length === 0 && (
                <div style={{ padding: '32px', textAlign: 'center', color: '#B8CDD8', fontSize: '14px' }}>No colours yet — import a PDF or add manually.</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {colorPalette.map((c, i) => (
                  <div key={i} style={{ padding: '16px', borderRadius: '10px', background: '#F8FAFF', border: '1px solid #E8EEF4' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr 1fr 140px auto', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                      {/* Swatch + picker */}
                      <div style={{ position: 'relative' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: c.hex, border: '2px solid #C8DFE0', cursor: 'pointer' }} />
                        <input type="color" value={c.hex}
                          onChange={e => { const arr = [...colorPalette]; arr[i] = { ...c, hex: e.target.value }; setColorPalette(arr) }}
                          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }} />
                      </div>
                      <div>
                        <label style={{ ...S.label, marginBottom: '4px' }}>Colour Name</label>
                        <input value={c.name} onChange={e => { const arr = [...colorPalette]; arr[i] = { ...c, name: e.target.value }; setColorPalette(arr) }}
                          placeholder="e.g. Sovereign Blue" style={{ ...S.input, fontSize: '13px' }} />
                      </div>
                      <div>
                        <label style={{ ...S.label, marginBottom: '4px' }}>Hex Code</label>
                        <input value={c.hex} onChange={e => { const arr = [...colorPalette]; arr[i] = { ...c, hex: e.target.value }; setColorPalette(arr) }}
                          placeholder="#0069B8" style={{ ...S.input, fontFamily: 'monospace', fontSize: '13px' }} />
                      </div>
                      <div>
                        <label style={{ ...S.label, marginBottom: '4px' }}>Role</label>
                        <select value={c.role} onChange={e => { const arr = [...colorPalette]; arr[i] = { ...c, role: e.target.value }; setColorPalette(arr) }}
                          style={{ ...S.input, fontSize: '13px' }}>
                          {COLOR_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                      <button onClick={() => setColorPalette(colorPalette.filter((_, j) => j !== i))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B8CDD8', fontSize: '18px', padding: '4px', alignSelf: 'center' }}>×</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ ...S.label, marginBottom: '4px' }}>Usage Notes</label>
                        <input value={c.usage_notes ?? ''} onChange={e => { const arr = [...colorPalette]; arr[i] = { ...c, usage_notes: e.target.value }; setColorPalette(arr) }}
                          placeholder="How/where to use this colour" style={{ ...S.input, fontSize: '13px' }} />
                      </div>
                      <div>
                        <label style={{ ...S.label, marginBottom: '4px' }}>Print Caution</label>
                        <input value={c.print_caution ?? ''} onChange={e => { const arr = [...colorPalette]; arr[i] = { ...c, print_caution: e.target.value }; setColorPalette(arr) }}
                          placeholder="Any print calibration notes" style={{ ...S.input, fontSize: '13px' }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Palette preview */}
            {colorPalette.length > 0 && (
              <div style={S.card}>
                <div style={S.sectionTitle}>Palette Preview</div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {colorPalette.filter(c => /^#[0-9A-Fa-f]{6}$/.test(c.hex)).map((c, i) => (
                    <div key={i} style={{ textAlign: 'center' }}>
                      <div style={{ width: '60px', height: '60px', borderRadius: '12px', background: c.hex, border: '1px solid rgba(0,0,0,0.08)', marginBottom: '6px' }} />
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#0F1923', marginBottom: '2px' }}>{c.name || c.role}</div>
                      <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#5B7080' }}>{c.hex.toUpperCase()}</div>
                      <div style={{ fontSize: '10px', color: '#B8CDD8', textTransform: 'capitalize' }}>{c.role}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={S.card}>
              <div style={S.sectionTitle}>Usage Rules</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
                <Field label="Hierarchy & Combination Rules"><textarea value={colorUsageRules} onChange={e => setColorUsageRules(e.target.value)} rows={4} style={S.textarea} placeholder="e.g. Primary dominant, secondary for support/highlight, accent for emphasis only" /></Field>
                <Field label="Minimum Contrast Ratio"><input value={colorContrastMin} onChange={e => setColorContrastMin(e.target.value)} style={S.input} placeholder="e.g. 4.5:1 (WCAG AA)" /></Field>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            TAB: TYPOGRAPHY
        ════════════════════════════════════════════════════════ */}
        {tab === 'typography' && (
          <div style={{ display: 'grid', gap: '20px' }}>
            <div style={S.card}>
              <div style={S.sectionTitle}>Typefaces</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '18px', marginBottom: '24px' }}>
                <Field label="Heading Font">
                  <select value={headingFont} onChange={e => setHeadingFont(e.target.value)} style={S.input}>
                    {GOOGLE_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <div style={{ marginTop: '10px', padding: '12px', borderRadius: '8px', background: '#F8FAFF', border: '1px solid #E8EEF4' }}>
                    <div style={{ fontSize: '20px', fontWeight: 900, fontFamily: headingFont + ', sans-serif' }}>The Future of AI</div>
                    <div style={{ fontSize: '11px', color: '#B8CDD8', marginTop: '4px', fontWeight: 700 }}>{headingFont} — Heading</div>
                  </div>
                </Field>
                <Field label="Body Font">
                  <select value={bodyFont} onChange={e => setBodyFont(e.target.value)} style={S.input}>
                    {GOOGLE_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <div style={{ marginTop: '10px', padding: '12px', borderRadius: '8px', background: '#F8FAFF', border: '1px solid #E8EEF4' }}>
                    <div style={{ fontSize: '14px', fontFamily: bodyFont + ', sans-serif', color: '#2D3E50', lineHeight: 1.6 }}>Connecting global leaders to shape the next decade of technology and innovation.</div>
                    <div style={{ fontSize: '11px', color: '#B8CDD8', marginTop: '4px', fontWeight: 700 }}>{bodyFont} — Body</div>
                  </div>
                </Field>
                <Field label="Modular Scale Ratio">
                  <input value={typeScaleRatio} onChange={e => setTypeScaleRatio(e.target.value)} style={S.input} placeholder="e.g. 1.200" />
                  <div style={{ marginTop: '10px', fontSize: '12px', color: '#5B7080', lineHeight: 1.5 }}>Controls the proportional growth between type levels. 1.200 = Minor Third.</div>
                </Field>
              </div>
            </div>

            <div style={S.card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div style={S.sectionTitle as React.CSSProperties}>Type Scale</div>
                <button onClick={() => setTypeScale([...typeScale, { level: '', size_px: 16, weight: 400, line_height: '150%', usage: '' }])}
                  style={{ ...S.addBtn, borderRadius: '8px' }}>+ Add Level</button>
              </div>
              {typeScale.length === 0 && (
                <div style={{ padding: '24px', textAlign: 'center', color: '#B8CDD8', fontSize: '14px' }}>No type levels yet — import a PDF or add manually.</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {typeScale.map((t, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 100px 1fr auto', gap: '10px', alignItems: 'center', padding: '12px', borderRadius: '10px', background: '#F8FAFF', border: '1px solid #E8EEF4' }}>
                    <input value={t.level} onChange={e => { const a = [...typeScale]; a[i] = { ...t, level: e.target.value }; setTypeScale(a) }} placeholder="Level (e.g. Display)" style={{ ...S.input, fontSize: '13px' }} />
                    <input type="number" value={t.size_px} onChange={e => { const a = [...typeScale]; a[i] = { ...t, size_px: Number(e.target.value) }; setTypeScale(a) }} placeholder="px" style={{ ...S.input, fontSize: '13px' }} />
                    <input type="number" value={t.weight} onChange={e => { const a = [...typeScale]; a[i] = { ...t, weight: Number(e.target.value) }; setTypeScale(a) }} placeholder="Weight" style={{ ...S.input, fontSize: '13px' }} />
                    <input value={t.line_height} onChange={e => { const a = [...typeScale]; a[i] = { ...t, line_height: e.target.value }; setTypeScale(a) }} placeholder="Line height" style={{ ...S.input, fontSize: '13px' }} />
                    <input value={t.usage} onChange={e => { const a = [...typeScale]; a[i] = { ...t, usage: e.target.value }; setTypeScale(a) }} placeholder="Usage context" style={{ ...S.input, fontSize: '13px' }} />
                    <button onClick={() => setTypeScale(typeScale.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B8CDD8', fontSize: '18px', padding: '4px' }}>×</button>
                  </div>
                ))}
                {typeScale.length > 0 && (
                  <div style={{ fontSize: '11px', color: '#B8CDD8', fontWeight: 700 }}>Level · Size (px) · Weight · Line height · Usage</div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div style={S.card}>
                <div style={S.sectionTitle}>Do's</div>
                <StringList values={typeRulesDos} placeholder="e.g. Use Space Grotesk for all headlines" onChange={setTypeRulesDos} />
              </div>
              <div style={S.card}>
                <div style={S.sectionTitle}>Don'ts</div>
                <StringList values={typeRulesDonts} placeholder="e.g. Don't mix unapproved typefaces" onChange={setTypeRulesDonts} />
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            TAB: PATTERNS
        ════════════════════════════════════════════════════════ */}
        {tab === 'patterns' && (
          <div style={S.card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={S.sectionTitle as React.CSSProperties}>Patterns & Textures</div>
              <button onClick={() => setPatternAssets([...patternAssets, { name: '', url: null, usage_context: '', background_tone: 'both' }])}
                style={{ ...S.addBtn, borderRadius: '8px' }}>+ Add Pattern</button>
            </div>
            {patternAssets.length === 0 && (
              <div style={{ padding: '32px', textAlign: 'center', color: '#B8CDD8', fontSize: '14px' }}>No patterns yet — import a PDF to extract pattern info, then upload the pattern files here.</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {patternAssets.map((p, i) => (
                <div key={i} style={{ padding: '16px', borderRadius: '10px', background: '#F8FAFF', border: '1px solid #E8EEF4' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px auto', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                    <input value={p.name} onChange={e => { const a = [...patternAssets]; a[i] = { ...p, name: e.target.value }; setPatternAssets(a) }}
                      placeholder="Pattern name" style={{ ...S.input, fontSize: '13px' }} />
                    <input value={p.usage_context} onChange={e => { const a = [...patternAssets]; a[i] = { ...p, usage_context: e.target.value }; setPatternAssets(a) }}
                      placeholder="Usage context (e.g. Stage backdrops, covers)" style={{ ...S.input, fontSize: '13px' }} />
                    <select value={p.background_tone} onChange={e => { const a = [...patternAssets]; a[i] = { ...p, background_tone: e.target.value }; setPatternAssets(a) }}
                      style={{ ...S.input, fontSize: '13px' }}>
                      {['light','dark','both'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button onClick={() => setPatternAssets(patternAssets.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B8CDD8', fontSize: '18px', padding: '4px' }}>×</button>
                  </div>
                  {p.url && (
                    <div style={{ width: '100%', height: '80px', borderRadius: '8px', backgroundImage: `url(${p.url})`, backgroundSize: 'cover', backgroundPosition: 'center', border: '1px solid #E8EEF4' }} />
                  )}
                  <div style={{ marginTop: '10px', fontSize: '12px', color: '#5B7080' }}>Pattern file URL (upload via website builder patterns section or paste URL):</div>
                  <input value={p.url ?? ''} onChange={e => { const a = [...patternAssets]; a[i] = { ...p, url: e.target.value || null }; setPatternAssets(a) }}
                    placeholder="https://…" style={{ ...S.input, fontSize: '12px', marginTop: '6px', fontFamily: 'monospace' }} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            TAB: IMAGERY
        ════════════════════════════════════════════════════════ */}
        {tab === 'imagery' && (
          <div style={{ display: 'grid', gap: '20px' }}>
            <div style={S.card}>
              <div style={S.sectionTitle}>Visual Philosophy</div>
              <StringList values={imageryPhilosophy} placeholder="e.g. Human intelligence augmented by AI" onChange={setImageryPhilosophy} />
            </div>
            <div style={S.card}>
              <div style={S.sectionTitle}>Photography Direction</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
                <div>
                  <span style={S.label}>Subjects</span>
                  <StringList values={photographySubjects} placeholder="e.g. Policymakers, Researchers" onChange={setPhotographySubjects} />
                </div>
                <div>
                  <span style={S.label}>Do's</span>
                  <StringList values={photographyDos} placeholder="e.g. Authentic, diverse, natural posture" onChange={setPhotographyDos} />
                </div>
                <div>
                  <span style={S.label}>Don'ts</span>
                  <StringList values={photographyDonts} placeholder="e.g. Artificial enthusiasm" onChange={setPhotographyDonts} />
                </div>
              </div>
            </div>
            <div style={S.card}>
              <div style={S.sectionTitle}>Allowed Overlay Types</div>
              <ChipList values={overlayTypes} onChange={setOverlayTypes} />
            </div>
            <div style={S.card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div style={S.sectionTitle as React.CSSProperties}>Imagery Treatments</div>
                <button onClick={() => setImageryTreatments([...imageryTreatments, { name: '', description: '', use_cases: [] }])}
                  style={{ ...S.addBtn, borderRadius: '8px' }}>+ Add Treatment</button>
              </div>
              {imageryTreatments.map((t, i) => (
                <div key={i} style={{ padding: '16px', borderRadius: '10px', background: '#F8FAFF', border: '1px solid #E8EEF4', marginBottom: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', marginBottom: '10px' }}>
                    <input value={t.name} onChange={e => { const a = [...imageryTreatments]; a[i] = { ...t, name: e.target.value }; setImageryTreatments(a) }}
                      placeholder="Treatment name (e.g. Futuristic Augmentation)" style={{ ...S.input, fontWeight: 700 }} />
                    <button onClick={() => setImageryTreatments(imageryTreatments.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B8CDD8', fontSize: '18px', padding: '4px' }}>×</button>
                  </div>
                  <textarea value={t.description} onChange={e => { const a = [...imageryTreatments]; a[i] = { ...t, description: e.target.value }; setImageryTreatments(a) }}
                    rows={2} placeholder="Description of this imagery treatment" style={{ ...S.textarea, marginBottom: '10px' }} />
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#5B7080', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Use Cases</div>
                  <ChipList values={t.use_cases} onChange={v => { const a = [...imageryTreatments]; a[i] = { ...t, use_cases: v }; setImageryTreatments(a) }} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            TAB: GRID & LAYOUT
        ════════════════════════════════════════════════════════ */}
        {tab === 'grid' && (
          <div style={{ display: 'grid', gap: '20px' }}>
            <div style={S.card}>
              <div style={S.sectionTitle}>Grid Foundation</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
                <Field label="Base Grid (px)"><input type="number" value={gridBasePx} onChange={e => setGridBasePx(Number(e.target.value))} style={S.input} placeholder="4" /></Field>
                <Field label="Column Count"><input type="number" value={gridColumns} onChange={e => setGridColumns(Number(e.target.value))} style={S.input} placeholder="12" /></Field>
              </div>
            </div>
            <div style={S.card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div style={S.sectionTitle as React.CSSProperties}>Breakpoints</div>
                <button onClick={() => setBreakpoints([...breakpoints, { name: '', min_px: 0, max_px: null }])}
                  style={{ ...S.addBtn, borderRadius: '8px' }}>+ Add</button>
              </div>
              {breakpoints.map((b, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px auto', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
                  <input value={b.name} onChange={e => { const a = [...breakpoints]; a[i] = { ...b, name: e.target.value }; setBreakpoints(a) }}
                    placeholder="e.g. Small" style={{ ...S.input, fontSize: '13px' }} />
                  <input type="number" value={b.min_px} onChange={e => { const a = [...breakpoints]; a[i] = { ...b, min_px: Number(e.target.value) }; setBreakpoints(a) }}
                    placeholder="Min px" style={{ ...S.input, fontSize: '13px' }} />
                  <input type="number" value={b.max_px ?? ''} onChange={e => { const a = [...breakpoints]; a[i] = { ...b, max_px: e.target.value ? Number(e.target.value) : null }; setBreakpoints(a) }}
                    placeholder="Max px" style={{ ...S.input, fontSize: '13px' }} />
                  <button onClick={() => setBreakpoints(breakpoints.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B8CDD8', fontSize: '18px', padding: '4px' }}>×</button>
                </div>
              ))}
            </div>
            <div style={S.card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div style={S.sectionTitle as React.CSSProperties}>Spacing Tokens</div>
                <button onClick={() => setSpacingTokens([...spacingTokens, { name: '', value_px: 0 }])}
                  style={{ ...S.addBtn, borderRadius: '8px' }}>+ Add</button>
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {spacingTokens.map((t, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '10px', background: '#F8FAFF', border: '1px solid #E8EEF4' }}>
                    <input value={t.name} onChange={e => { const a = [...spacingTokens]; a[i] = { ...t, name: e.target.value }; setSpacingTokens(a) }}
                      placeholder="XS" style={{ width: '50px', padding: '4px 6px', borderRadius: '6px', border: '1px solid #C8DFE0', fontSize: '12px', fontFamily: 'inherit', color: '#0F1923', fontWeight: 700, textAlign: 'center' }} />
                    <input type="number" value={t.value_px} onChange={e => { const a = [...spacingTokens]; a[i] = { ...t, value_px: Number(e.target.value) }; setSpacingTokens(a) }}
                      style={{ width: '50px', padding: '4px 6px', borderRadius: '6px', border: '1px solid #C8DFE0', fontSize: '12px', fontFamily: 'monospace', color: '#5B7080', textAlign: 'center' }} />
                    <span style={{ fontSize: '11px', color: '#B8CDD8' }}>px</span>
                    <button onClick={() => setSpacingTokens(spacingTokens.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B8CDD8', fontSize: '14px', padding: '2px', lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>
            </div>
            <div style={S.card}>
              <div style={S.sectionTitle}>Icon System</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
                <Field label="Icon Library"><input value={iconSystem} onChange={e => setIconSystem(e.target.value)} style={S.input} placeholder="e.g. Material Design / MUI Icons" /></Field>
                <Field label="Grid Size"><input value={iconGridSize} onChange={e => setIconGridSize(e.target.value)} style={S.input} placeholder="e.g. 24×24" /></Field>
              </div>
              <Field label="Usage Rules"><textarea value={iconRules} onChange={e => setIconRules(e.target.value)} rows={3} style={S.textarea} placeholder="Icon usage guidelines…" /></Field>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            TAB: VOICE
        ════════════════════════════════════════════════════════ */}
        {tab === 'voice' && (
          <div style={S.card}>
            <div style={S.sectionTitle}>Brand Voice & Tone</div>
            <div style={{ display: 'grid', gap: '24px' }}>
              <Field label="Tone Descriptors"><ChipList values={tone} onChange={setTone} /></Field>
              <Field label="Style Keywords"><ChipList values={styleKeywords} onChange={setStyleKeywords} /></Field>
              <Field label="Key Messages"><StringList values={keyMessages} placeholder="Enter a key message…" onChange={setKeyMessages} /></Field>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            TAB: EVENT STANDARDS
        ════════════════════════════════════════════════════════ */}
        {tab === 'standards' && (
          <div style={{ display: 'grid', gap: '20px' }}>

            {/* Date format */}
            <div style={S.card}>
              <div style={S.sectionTitle}>Date Format Standard</div>
              <p style={{ fontSize: '13px', color: '#5B7080', marginBottom: '16px', marginTop: '-8px' }}>
                Define how the event date must appear across all creatives — social posts, banners, flyers, and the website.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '16px' }}>
                {['15 August 2025', 'August 15, 2025', 'Aug 15, 2025', '15.08.25', 'Custom'].map(opt => (
                  <button key={opt} onClick={() => setStdDateFormat(opt)}
                    style={{ padding: '12px 16px', borderRadius: '10px', border: `2px solid ${stdDateFormat === opt ? '#00A5A3' : '#C8DFE0'}`, background: stdDateFormat === opt ? 'rgba(0,165,163,0.08)' : '#FAFBFC', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: 700, color: stdDateFormat === opt ? '#00695C' : '#5B7080', textAlign: 'left' as const, transition: 'all 0.15s' }}>
                    {opt === 'Custom' ? 'Custom format…' : opt}
                  </button>
                ))}
              </div>
              {stdDateFormat === 'Custom' && (
                <Field label="Custom Date Format">
                  <input value={stdDateCustom} onChange={e => setStdDateCustom(e.target.value)}
                    placeholder="e.g. 15 Aug '25 | Dubai" style={S.input} />
                </Field>
              )}
              <div style={{ padding: '12px 16px', borderRadius: '10px', background: '#F0F8F8', border: '1px solid #C8DFE0', marginTop: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Preview: </span>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#0F1923' }}>{stdDateFormat === 'Custom' ? stdDateCustom || '—' : stdDateFormat}</span>
              </div>
            </div>

            {/* Venue format */}
            <div style={S.card}>
              <div style={S.sectionTitle}>Venue Format Standard</div>
              <p style={{ fontSize: '13px', color: '#5B7080', marginBottom: '16px', marginTop: '-8px' }}>
                How should the venue appear in creatives — short landmark name or full address?
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '16px' }}>
                {['Venue name only', 'Venue name + City', 'Full address', 'City only', 'Custom'].map(opt => (
                  <button key={opt} onClick={() => setStdVenueFormat(opt)}
                    style={{ padding: '12px 16px', borderRadius: '10px', border: `2px solid ${stdVenueFormat === opt ? '#00A5A3' : '#C8DFE0'}`, background: stdVenueFormat === opt ? 'rgba(0,165,163,0.08)' : '#FAFBFC', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: 700, color: stdVenueFormat === opt ? '#00695C' : '#5B7080', textAlign: 'left' as const, transition: 'all 0.15s' }}>
                    {opt}
                  </button>
                ))}
              </div>
              {stdVenueFormat === 'Custom' && (
                <Field label="Custom Venue Format">
                  <input value={stdVenueCustom} onChange={e => setStdVenueCustom(e.target.value)}
                    placeholder="e.g. Atlantis The Palm, Dubai" style={S.input} />
                </Field>
              )}
            </div>

            {/* Tagline rules */}
            <div style={S.card}>
              <div style={S.sectionTitle}>Tagline Rules</div>
              <p style={{ fontSize: '13px', color: '#5B7080', marginBottom: '20px', marginTop: '-8px' }}>
                Define how the event tagline must be rendered so every creative team member is consistent.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <Field label="Letter Case">
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '8px' }}>
                    {['ALL CAPS', 'Title Case', 'Sentence case'].map(opt => (
                      <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: stdTaglineCase === opt ? '#0F1923' : '#5B7080' }}>
                        <input type="radio" name="tagline_case" checked={stdTaglineCase === opt} onChange={() => setStdTaglineCase(opt)}
                          style={{ accentColor: '#00A5A3', width: 16, height: 16 }} />
                        {opt}
                      </label>
                    ))}
                  </div>
                </Field>
                <Field label="Font Weight">
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '8px' }}>
                    {['Black (900)', 'Bold (700)', 'SemiBold (600)', 'Regular (400)'].map(opt => (
                      <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: stdTaglineWeight === opt ? '#0F1923' : '#5B7080' }}>
                        <input type="radio" name="tagline_weight" checked={stdTaglineWeight === opt} onChange={() => setStdTaglineWeight(opt)}
                          style={{ accentColor: '#00A5A3', width: 16, height: 16 }} />
                        {opt}
                      </label>
                    ))}
                  </div>
                </Field>
              </div>
              <div style={{ marginTop: '20px', display: 'grid', gap: '16px' }}>
                <Field label="Placement Rule">
                  <input value={stdTaglinePlacement} onChange={e => setStdTaglinePlacement(e.target.value)}
                    placeholder="e.g. Always below the event name, centred, min 8px gap" style={S.input} />
                </Field>
                <Field label="Additional Tagline Notes">
                  <textarea value={stdTaglineNotes} onChange={e => setStdTaglineNotes(e.target.value)}
                    rows={3} style={S.textarea} placeholder="Any other tagline usage rules — sizing, colour, contrast…" />
                </Field>
              </div>
            </div>

            {/* Sample layout references */}
            <div style={S.card}>
              <div style={S.sectionTitle}>Sample Layout References</div>
              <p style={{ fontSize: '13px', color: '#5B7080', marginBottom: '20px', marginTop: '-8px' }}>
                Upload reference creatives showing how the date, venue, and tagline are placed in each format.
                These become the visual standard the team refers to when creating any asset.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                {[
                  { label: 'Portrait (9:16)', key: 'portrait', value: stdPortraitUrl, set: setStdPortraitUrl },
                  { label: 'Landscape (16:9)', key: 'landscape', value: stdLandscapeUrl, set: setStdLandscapeUrl },
                  { label: 'Square (1:1)', key: 'square', value: stdSquareUrl, set: setStdSquareUrl },
                ].map(({ label, key, value, set }) => (
                  <div key={key}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#5B7080', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '8px' }}>{label}</div>
                    {value ? (
                      <div style={{ position: 'relative' as const, borderRadius: '10px', overflow: 'hidden', border: '1px solid #C8DFE0' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={value} alt={label} style={{ width: '100%', display: 'block', maxHeight: '160px', objectFit: 'cover', background: '#E8EEF4' }} />
                        <button onClick={() => set('')}
                          style={{ position: 'absolute' as const, top: 6, right: 6, width: 24, height: 24, borderRadius: '50%', background: 'rgba(15,25,35,0.7)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>×</button>
                      </div>
                    ) : (
                      <div>
                        <input value={value} onChange={e => set(e.target.value)}
                          placeholder="Paste image URL or upload via asset generator"
                          style={{ ...S.input, fontSize: '12px' }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* General notes */}
            <div style={S.card}>
              <Field label="General Standards Notes">
                <textarea value={stdNotes} onChange={e => setStdNotes(e.target.value)}
                  rows={4} style={S.textarea}
                  placeholder="Any additional creative standards — e.g. always use white text on dark BGs, never use the logo watermark at less than 30% opacity…" />
              </Field>
            </div>

          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            TAB: ASSET GENERATOR
        ════════════════════════════════════════════════════════ */}
        {tab === 'assets' && (
          <div style={{ display: 'grid', gap: '20px' }}>
            <div style={S.card}>
              <div style={S.sectionTitle}>Generate Visual Asset</div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '24px' }}>
                {ASSET_TYPES.map(a => (
                  <button key={a.id} onClick={() => setSelectedAsset(a)}
                    style={{ padding: '12px 16px', borderRadius: '10px', border: `2px solid ${selectedAsset.id === a.id ? '#00A5A3' : '#C8DFE0'}`, background: selectedAsset.id === a.id ? 'rgba(0,165,163,0.08)' : '#FAFBFC', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: selectedAsset.id === a.id ? '#00A5A3' : '#0F1923', marginBottom: '2px' }}>{a.label}</div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#B8CDD8' }}>{a.aspect}</div>
                  </button>
                ))}
              </div>
              <Field label="Image Prompt">
                <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4} style={S.textarea} />
                <div style={{ fontSize: '12px', color: '#B8CDD8', marginTop: '6px' }}>Imagen 3 · ~10–20 seconds</div>
              </Field>
              <button onClick={generateImage} disabled={generatingImg || !prompt.trim()}
                style={{ padding: '12px 24px', borderRadius: '10px', border: 'none', background: generatingImg ? '#B8CDD8' : '#00A5A3', color: '#fff', fontSize: '14px', fontWeight: 800, cursor: generatingImg ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '9px' }}>
                {generatingImg
                  ? <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Generating…</>
                  : <><svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>Generate</>
                }
              </button>
            </div>
            {imgError && <div style={{ padding: '14px 18px', borderRadius: '10px', background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.3)', color: '#DC2626', fontSize: '14px' }}>{imgError}</div>}
            {generatedImg && (
              <div style={S.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>{selectedAsset.label}</div>
                  <a href={generatedImg} download target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', background: '#E8EEF4', color: '#0F1923', fontSize: '13px', fontWeight: 700, textDecoration: 'none' }}>
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Download
                  </a>
                </div>
                <img src={generatedImg} alt={selectedAsset.label} style={{ width: '100%', display: 'block', maxHeight: '560px', objectFit: 'contain', borderRadius: '8px', background: '#F0F4F7' }} />
              </div>
            )}
            {/* Gallery */}
            {assets.length > 0 && (
              <div style={S.card}>
                <div style={{ ...S.sectionTitle, marginBottom: '16px' }}>Gallery ({assets.length})</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
                  {assets.map(a => (
                    <div key={a.id} style={{ borderRadius: '10px', border: '1px solid #E8EEF4', overflow: 'hidden', background: '#F8FAFF' }}>
                      <img src={a.image_url} alt={a.label ?? a.asset_type} style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block', background: '#E8EEF4' }} />
                      <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F1923', textTransform: 'capitalize' }}>{(a.label ?? a.asset_type).replace(/_/g, ' ')}</div>
                        <a href={a.image_url} download target="_blank" rel="noreferrer"
                          style={{ fontSize: '11px', color: '#5B7080', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          Download
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
