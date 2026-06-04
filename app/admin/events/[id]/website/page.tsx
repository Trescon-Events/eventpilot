'use client'

import { useState, useEffect, use, useRef } from 'react'
import Link from 'next/link'
import { type PageStructure, type Section, type SectionDesign, type FooterConfig, type FooterColumn, type FooterLink, defaultStructure, defaultFooter, SECTION_TYPES, SECTION_LAYOUTS } from '@/app/lib/event-page-types'

// ── Color tokens ──────────────────────────────────────────────────────────────
const C = {
  bg:      '#E8EEF4',
  surface: '#FFFFFF',
  border:  '#DDE8EE',
  text:    '#0F1923',
  muted:   '#5B7080',
  sub:     '#2D3E50',
  green:   '#C0F43C',
  teal:    '#00695C',
  purple:  '#A78BFA',
  amber:   '#F59E0B',
  red:     '#FF6B6B',
}

// ── Types ─────────────────────────────────────────────────────────────────────
type WebsiteSettings = {
  id: string; event_id: string; slug: string; status: 'draft' | 'live'
  template: string; hero_headline: string | null; hero_subheadline: string | null
  hero_bg_url: string | null; hero_video_url: string | null
  hero_cta_label: string | null; hero_cta_url: string | null
  about_title: string | null; about_body: string | null
  stat_attendees: string | null; stat_speakers: string | null
  stat_exhibitors: string | null; stat_countries: string | null
  venue_name: string | null; venue_city: string | null
  venue_address: string | null; venue_date_display: string | null
  theme_primary: string; theme_accent: string; theme_teal: string
  media_kit_url: string | null; brand_kit_url: string | null
  brand_doc_url: string | null
  logo_primary_url: string | null; logo_white_url: string | null
  logo_dark_url: string | null; logo_horizontal_url: string | null
  brand_font_heading: string | null; brand_font_body: string | null
  brand_color_1: string | null; brand_color_2: string | null; brand_color_3: string | null
  brand_color_4: string | null; brand_color_5: string | null
  pattern_1_url: string | null; pattern_2_url: string | null; pattern_3_url: string | null
  pattern_4_url: string | null; pattern_5_url: string | null
  bg_about_url: string | null; bg_sponsors_url: string | null; bg_agenda_url: string | null
  page_settings: PageSettings | null
  page_structure_full: PageStructure | null
  draft_structure: PageStructure | null
  published_snapshot: PageStructure | null
  last_published_at: string | null
  custom_domain: string | null
  cf_zone_id: string | null
  konfhub_event_id: string | null; konfhub_api_key: string | null
  konfhub_speaker_ticket: string | null; konfhub_partner_ticket: string | null
}

type Speaker = {
  id: string; name: string; role: string | null; company: string | null; bio: string | null
  photo_url: string | null; linkedin_url: string | null; tier: string; session_title: string | null
  status: string; email: string | null; phone: string | null; dial_code: string | null
  country: string | null; konfhub_booking_id: string | null; active: boolean; order_index: number
}

type AgendaItem = {
  id: string; day: number; time_slot: string | null; title: string; description: string | null
  speaker_name: string | null; type: string; track: string | null; order_index: number; active: boolean
}

type Sponsor = {
  id: string; name: string; tier: string; logo_url: string | null; website_url: string | null
  konfhub_booking_id: string | null; order_index: number; active: boolean
}

type PageSection = { enabled: boolean; layout?: string; show_bio?: boolean; filter_tier?: boolean; show_website?: boolean }
type PageSettings = { sections: Record<string, PageSection>; order: string[] }
type TeamMember  = { id: string; name: string | null; email: string; role: string; status: string; invite_token: string; created_at: string }
type Tab = 'template' | 'brand' | 'build' | 'content' | 'publish'

type TemplateInfo = {
  id: string; label: string; event_name: string; description: string; preview_url: string
  tech: string[]; pages: string[]; color_scheme: { bg: string; accent: string; highlight: string }
  style_tags: string[]
}
type ContentTab = 'details' | 'sections' | 'speakers' | 'agenda' | 'sponsors' | 'team'

// ── Helpers ───────────────────────────────────────────────────────────────────
const TIER_ORDER = ['keynote', 'speaker', 'panelist', 'moderator']
const SPONSOR_TIER_ORDER = ['platinum', 'gold', 'silver', 'bronze', 'media', 'association', 'government', 'startup']
const AGENDA_TYPES = ['keynote', 'panel', 'workshop', 'fireside', 'networking', 'break', 'other']

function StatusDot({ booking }: { booking: string | null }) {
  return (
    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: booking ? '#22C55E' : C.border, marginRight: 6 }} />
  )
}

function Tag({ children, color = C.muted }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: `${color}18`, color, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder = '', rows }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; rows?: number
}) {
  const base: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '13px', fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }
  return (
    <div>
      <label style={{ fontSize: '11px', fontWeight: 700, color: C.muted, display: 'block', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</label>
      {rows ? <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} placeholder={placeholder} style={{ ...base, resize: 'vertical' }} />
             : <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={base} />}
    </div>
  )
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div>
      <label style={{ fontSize: '11px', fontWeight: 700, color: C.muted, display: 'block', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '13px', fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function ImageUpload({ label, value, eventId, section, onUpload, acceptPdf = false }: {
  label: string; value: string | null; eventId: string; section: string
  onUpload: (url: string) => void; acceptPdf?: boolean
}) {
  const [uploading, setUploading] = useState(false)
  const [dragging,  setDragging]  = useState(false)
  const [errMsg,    setErrMsg]    = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setErrMsg(null)
    setUploading(true)
    try {
      // Step 1: Get a signed upload URL from the server (no file sent here)
      const params = new URLSearchParams({
        event_id:     eventId,
        section,
        filename:     file.name,
        content_type: file.type,
      })
      const r1   = await fetch(`/api/events/website/upload-url?${params}`)
      const d1   = await r1.json()
      if (!r1.ok) { setErrMsg(d1.error ?? 'Could not get upload URL'); setUploading(false); return }

      // Step 2: Upload directly to Supabase Storage (bypasses Vercel 4.5 MB limit)
      const r2 = await fetch(d1.signedUrl, {
        method:  'PUT',
        headers: { 'Content-Type': file.type },
        body:    file,
      })
      if (!r2.ok) { setErrMsg('Upload to storage failed — please try again'); setUploading(false); return }

      onUpload(d1.publicUrl)
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Upload failed')
    }
    setUploading(false)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const isPdf   = value?.toLowerCase().includes('.pdf') || value?.includes('application/pdf')
  const accept  = acceptPdf ? 'image/*,application/pdf' : 'image/*'
  const hint    = acceptPdf ? 'PNG, JPG, SVG or PDF · max 20 MB' : 'PNG, JPG, SVG or WebP · max 20 MB'

  return (
    <div>
      <label style={{ fontSize: '11px', fontWeight: 700, color: C.muted, display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</label>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && ref.current?.click()}
        style={{
          border: `2px dashed ${dragging ? C.teal : C.border}`,
          borderRadius: '10px', padding: '14px 16px',
          background: dragging ? `${C.teal}12` : C.bg,
          cursor: uploading ? 'wait' : 'pointer',
          transition: 'all 0.15s',
          display: 'flex', alignItems: 'center', gap: '12px', minHeight: '68px',
        }}
      >
        {value ? (
          <>
            {isPdf
              ? <div style={{ width: 44, height: 44, borderRadius: 8, background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="20" height="20" fill="none" stroke={C.red} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>
                </div>
              // eslint-disable-next-line @next/next/no-img-element
              : <img src={value} alt="" style={{ width: 56, height: 40, objectFit: 'cover', borderRadius: 6, border: `1px solid ${C.border}`, flexShrink: 0 }} />
            }
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: C.text, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {isPdf ? 'PDF uploaded' : 'File uploaded'}
              </div>
              <div style={{ fontSize: '11px', color: C.muted }}>Drop a new file or click to replace</div>
            </div>
          </>
        ) : (
          <>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: C.border, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {uploading
                ? <svg width="16" height="16" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24" className="spin"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>
                : <svg width="16" height="16" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              }
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: uploading ? C.muted : C.text, marginBottom: 2 }}>
                {uploading ? 'Uploading…' : 'Drop file here or click to browse'}
              </div>
              <div style={{ fontSize: '11px', color: C.muted }}>{hint}</div>
            </div>
          </>
        )}
      </div>

      <input ref={ref} type="file" accept={accept} style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />

      {/* URL fallback + actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <input value={value ?? ''} onChange={e => onUpload(e.target.value)}
          placeholder="…or paste a URL"
          style={{ flex: 1, padding: '6px 10px', borderRadius: '7px', border: `1px solid ${C.border}`, fontSize: '11px', fontFamily: 'inherit', color: C.text, background: C.bg }} />
        {value && (
          <>
            {isPdf && (
              <a href={value} target="_blank" rel="noreferrer"
                style={{ fontSize: '11px', color: C.teal, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3 }}>
                <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                View
              </a>
            )}
            <button onClick={() => { onUpload(''); setErrMsg(null) }}
              style={{ fontSize: '11px', color: C.red, background: 'rgba(255,107,107,0.08)', border: `1px solid rgba(255,107,107,0.3)`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              Remove
            </button>
          </>
        )}
      </div>
      {errMsg && <div style={{ fontSize: '11px', color: C.red, marginTop: 6 }}>{errMsg}</div>}
    </div>
  )
}

// ── Modal shell ───────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,25,35,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ background: C.surface, borderRadius: '18px', border: `1px solid ${C.border}`, width: '100%', maxWidth: '620px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: '15px', fontWeight: 800, color: C.text }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', color: C.muted, cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
        </div>
        <div style={{ padding: '24px' }}>{children}</div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function EventWebsiteAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)

  const [tab,       setTab]       = useState<Tab>('template')
  const [contentTab, setContentTab] = useState<ContentTab>('details')

  // Template gallery + deployment
  const [templates,        setTemplates]        = useState<TemplateInfo[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [deploying,        setDeploying]        = useState(false)
  const [deployResult,     setDeployResult]     = useState<{ repo_url: string; gh_actions_url: string; worker_name: string; site_url: string } | null>(null)
  const [existingSite,     setExistingSite]     = useState<{ repo_url: string; gh_actions_url?: string; site_url?: string; status: string; template_id: string; worker_name?: string } | null>(null)
  const [eventName, setEventName] = useState('')
  const [loading,   setLoading]   = useState(true)
  const [msg,       setMsg]       = useState('')
  const [msgOk,     setMsgOk]     = useState(true)

  // Settings state
  const [settings,       setSettings]       = useState<Partial<WebsiteSettings>>({})
  const [savingSettings, setSavingSettings] = useState(false)
  const [extracting,     setExtracting]     = useState(false)

  // Speakers
  const [speakers,     setSpeakers]     = useState<Speaker[]>([])
  const [spLoading,    setSpLoading]    = useState(false)
  const [spModal,      setSpModal]      = useState(false)
  const [editSpeaker,  setEditSpeaker]  = useState<Partial<Speaker> | null>(null)
  const [savingSp,     setSavingSp]     = useState(false)
  const [syncing,      setSyncing]      = useState(false)

  // Agenda
  const [agenda,       setAgenda]       = useState<AgendaItem[]>([])
  const [agLoading,    setAgLoading]    = useState(false)
  const [agModal,      setAgModal]      = useState(false)
  const [editAgenda,   setEditAgenda]   = useState<Partial<AgendaItem> | null>(null)
  const [savingAg,     setSavingAg]     = useState(false)

  // Sponsors
  const [sponsors,     setSponsors]     = useState<Sponsor[]>([])
  const [spnLoading,   setSpnLoading]   = useState(false)
  const [spnModal,     setSpnModal]     = useState(false)
  const [editSponsor,  setEditSponsor]  = useState<Partial<Sponsor> | null>(null)
  const [savingSpn,    setSavingSpn]    = useState(false)

  // Team
  const [team,        setTeam]        = useState<TeamMember[]>([])
  const [teamLoading, setTeamLoading] = useState(false)
  const [teamModal,   setTeamModal]   = useState(false)
  const [editTeam,    setEditTeam]    = useState<Partial<TeamMember> | null>(null)
  const [savingTeam,  setSavingTeam]  = useState(false)

  // Builder
  const [ps,             setPs]             = useState<PageStructure | null>(null)
  const [selPageId,      setSelPageId]      = useState<string>('home')
  const [openDesignId,   setOpenDesignId]   = useState<string | null>(null)
  const [addSecOpen,     setAddSecOpen]     = useState(false)
  const [savingBuilder,  setSavingBuilder]  = useState(false)
  const [dndOverIdx,     setDndOverIdx]     = useState<number | null>(null)
  const dndSrcIdx = useRef<number | null>(null)
  const [contentSecPageId, setContentSecPageId] = useState<string>('home')
  // Website versioning / guard
  const [showLiveGuard,   setShowLiveGuard]   = useState(false)
  const [builderMode,     setBuilderMode]     = useState<'draft' | 'editing_live' | 'fresh'>('draft')
  const [publishing,      setPublishing]      = useState(false)
  const [rollbacking,     setRollbacking]     = useState(false)

  // Publish tab
  const [previewDevice,   setPreviewDevice]   = useState<'desktop'|'tablet'|'mobile'>('desktop')
  const [cfToken,         setCfToken]         = useState('')
  const [cfZoneId,        setCfZoneId]        = useState('')
  const [cfDomain,        setCfDomain]        = useState('')
  const [cfStatus,        setCfStatus]        = useState<'idle'|'connecting'|'ok'|'error'>('idle')
  const [cfMsg,           setCfMsg]           = useState('')

  // ── Component-scope PS helpers (Builder + Content > Sections both use these) ──
  function updPages(fn: (pages: PageStructure['pages']) => PageStructure['pages']) {
    setPs(p => p ? { ...p, pages: fn([...p.pages]) } : p)
  }
  function updSections(pageId: string, fn: (secs: Section[]) => Section[]) {
    updPages(pgs => pgs.map(pg => pg.id === pageId ? { ...pg, sections: fn([...pg.sections]) } : pg))
  }
  function updSection(pageId: string, secId: string, patch: Partial<Section>) {
    updSections(pageId, secs => secs.map(s => s.id === secId ? { ...s, ...patch } : s))
  }
  function updItems(pageId: string, secId: string, fn: (items: Section['items']) => Section['items']) {
    updSections(pageId, secs => secs.map(s => s.id === secId ? { ...s, items: fn(s.items ?? []) } : s))
  }
  function addItem(pageId: string, secId: string, defaults: Partial<NonNullable<Section['items']>[0]> = {}) {
    const nid = Math.random().toString(36).slice(2, 9)
    updItems(pageId, secId, items => [...(items ?? []), { id: nid, ...defaults }])
  }
  function removeItem(pageId: string, secId: string, itemId: string) {
    updItems(pageId, secId, items => (items ?? []).filter(i => i.id !== itemId))
  }
  function patchItem(pageId: string, secId: string, itemId: string, patch: Partial<NonNullable<Section['items']>[0]>) {
    updItems(pageId, secId, items => (items ?? []).map(i => i.id === itemId ? { ...i, ...patch } : i))
  }

  // Pages
  const DEFAULT_PAGES: PageSettings = {
    sections: {
      hero:     { enabled: true,  layout: 'fullscreen' },
      about:    { enabled: true },
      stats:    { enabled: true },
      speakers: { enabled: true,  layout: 'grid',     show_bio: true,  filter_tier: true },
      agenda:   { enabled: true,  layout: 'tabs' },
      partners: { enabled: true,  layout: 'logo_wall', show_website: true },
      media:    { enabled: true,  layout: 'cards' },
      venue:    { enabled: true },
      register: { enabled: true },
    },
    order: ['hero','about','stats','speakers','agenda','partners','media','venue','register']
  }
  const [pageSettings, setPageSettings] = useState<PageSettings>(DEFAULT_PAGES)

  useEffect(() => {
    async function loadBase() {
      const [evRes, webRes] = await Promise.all([
        fetch(`/api/events?id=${eventId}`),
        fetch(`/api/events/website?event_id=${eventId}`),
      ])
      const ev  = await evRes.json().catch(() => null)
      const web = await webRes.json().catch(() => null)
      const evData = Array.isArray(ev) ? ev[0] : ev
      if (evData) setEventName(evData.name)
      if (web) setSettings(web)
      else setSettings({ event_id: eventId, status: 'draft', template: 'vault', theme_primary: '#080A0C', theme_accent: '#E07B2C', theme_teal: '#00B4B0' })
      setLoading(false)
    }
    loadBase()
  }, [eventId])

  useEffect(() => {
    fetch('/api/templates').then(r => r.json()).then(d => { if (d.templates) setTemplates(d.templates) }).catch(() => {})
    fetch(`/api/sites/deploy?event_id=${eventId}`).then(r => r.json()).then(d => {
      if (d.site) {
        setExistingSite({ ...d.site, gh_actions_url: `${d.site.repo_url}/actions` })
        setSelectedTemplate(d.site.template_id)
      }
    }).catch(() => {})
  }, [eventId])

  useEffect(() => { if (tab === 'content' && contentTab === 'speakers') loadSpeakers() }, [tab, contentTab])
  useEffect(() => { if (tab === 'content' && contentTab === 'agenda')   loadAgenda()   }, [tab, contentTab])
  useEffect(() => { if (tab === 'content' && contentTab === 'sponsors') loadSponsors() }, [tab, contentTab])
  useEffect(() => { if (tab === 'content' && contentTab === 'team')     loadTeam()     }, [tab, contentTab])
  useEffect(() => { if (settings.page_settings) setPageSettings(settings.page_settings) }, [settings.page_settings])
  useEffect(() => { if (settings.cf_zone_id)   setCfZoneId(settings.cf_zone_id)  }, [settings.cf_zone_id])
  useEffect(() => { if (settings.custom_domain) { setCfDomain(settings.custom_domain); setCfStatus('ok') } }, [settings.custom_domain])
  useEffect(() => {
    // Ensure footer exists on any loaded structure (backfill older structures)
    const ensureFooter = (s: PageStructure): PageStructure =>
      s.footer ? s : { ...s, footer: defaultFooter(settings.theme_primary ?? undefined) }

    if (settings.draft_structure && Object.keys(settings.draft_structure).length > 0) {
      // Draft in progress — load it and open builder directly
      setPs(ensureFooter(settings.draft_structure as PageStructure))
      setBuilderMode('draft')
    } else if (settings.status !== 'live' && settings.page_structure_full && Object.keys(settings.page_structure_full).length > 0) {
      // Old-style draft (built before versioning system) — load directly
      setPs(ensureFooter(settings.page_structure_full as PageStructure))
      setBuilderMode('draft')
    } else if (settings.status !== 'live' && !settings.page_structure_full && settings.theme_accent !== undefined) {
      // No structure at all, fresh event — initialise default
      setPs(defaultStructure(settings.theme_accent ?? undefined, settings.theme_primary ?? undefined))
      setBuilderMode('draft')
    }
    // If status === 'live' and no draft → leave ps null; guard handles it
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.draft_structure, settings.page_structure_full, settings.status, settings.theme_accent, settings.theme_primary])

  async function loadSpeakers() {
    setSpLoading(true)
    const res  = await fetch(`/api/events/speakers?event_id=${eventId}&active=false`)
    const data = await res.json().catch(() => [])
    setSpeakers(Array.isArray(data) ? data : [])
    setSpLoading(false)
  }

  async function loadAgenda() {
    setAgLoading(true)
    const res  = await fetch(`/api/events/agenda?event_id=${eventId}&active=false`)
    const data = await res.json().catch(() => [])
    setAgenda(Array.isArray(data) ? data : [])
    setAgLoading(false)
  }

  async function loadSponsors() {
    setSpnLoading(true)
    const res  = await fetch(`/api/events/sponsors?event_id=${eventId}&active=false`)
    const data = await res.json().catch(() => [])
    setSponsors(Array.isArray(data) ? data : [])
    setSpnLoading(false)
  }

  function showMsg(text: string, ok = true) { setMsg(text); setMsgOk(ok); setTimeout(() => setMsg(''), 5000) }

  // ── Save settings ────────────────────────────────────────────────────────────
  async function saveSettings() {
    setSavingSettings(true)
    const payload = { ...settings, event_id: eventId }
    const res  = await fetch('/api/events/website', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await res.json()
    if (res.ok) { setSettings(data); showMsg('Settings saved.') }
    else showMsg(data.error ?? 'Save failed.', false)
    setSavingSettings(false)
  }

  async function togglePublish() {
    if (settings.status === 'live') {
      await unpublish()
    } else {
      await publishDraft()
    }
  }

  // ── Speakers CRUD ────────────────────────────────────────────────────────────
  async function saveSpeaker() {
    if (!editSpeaker?.name) return
    setSavingSp(true)
    const payload = { ...editSpeaker, event_id: eventId }
    const isNew = !editSpeaker.id
    const url   = isNew ? '/api/events/speakers' : `/api/events/speakers?id=${editSpeaker.id}`
    const method = isNew ? 'POST' : 'PATCH'
    const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(isNew ? payload : editSpeaker) })
    const data = await res.json()
    if (res.ok) { setSpModal(false); setEditSpeaker(null); loadSpeakers(); showMsg(isNew ? 'Speaker added.' : 'Speaker updated.') }
    else showMsg(data.error ?? 'Failed.', false)
    setSavingSp(false)
  }

  async function deleteSpeaker(id: string) {
    if (!confirm('Remove this speaker?')) return
    await fetch(`/api/events/speakers?id=${id}`, { method: 'DELETE' })
    loadSpeakers()
  }

  async function bulkKonfhubSync() {
    if (!settings.id) { showMsg('Save settings (with KonfHub credentials) first.', false); return }
    setSyncing(true)
    const res  = await fetch(`/api/events/konfhub?event_id=${eventId}`, { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      showMsg(`KonfHub sync: ${data.synced} registered, ${data.failed} failed.`, data.failed === 0)
      loadSpeakers()
    } else {
      showMsg(data.error ?? 'Sync failed.', false)
    }
    setSyncing(false)
  }

  // ── Agenda CRUD ──────────────────────────────────────────────────────────────
  async function saveAgenda() {
    if (!editAgenda?.title) return
    setSavingAg(true)
    const payload = { ...editAgenda, event_id: eventId }
    const isNew = !editAgenda.id
    const url    = isNew ? '/api/events/agenda' : `/api/events/agenda?id=${editAgenda.id}`
    const method = isNew ? 'POST' : 'PATCH'
    const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(isNew ? payload : editAgenda) })
    const data = await res.json()
    if (res.ok) { setAgModal(false); setEditAgenda(null); loadAgenda(); showMsg(isNew ? 'Session added.' : 'Session updated.') }
    else showMsg(data.error ?? 'Failed.', false)
    setSavingAg(false)
  }

  async function deleteAgenda(id: string) {
    if (!confirm('Remove this session?')) return
    await fetch(`/api/events/agenda?id=${id}`, { method: 'DELETE' })
    loadAgenda()
  }

  // ── Sponsors CRUD ────────────────────────────────────────────────────────────
  async function saveSponsor() {
    if (!editSponsor?.name) return
    setSavingSpn(true)
    const payload = { ...editSponsor, event_id: eventId }
    const isNew = !editSponsor.id
    const url    = isNew ? '/api/events/sponsors' : `/api/events/sponsors?id=${editSponsor.id}`
    const method = isNew ? 'POST' : 'PATCH'
    const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(isNew ? payload : editSponsor) })
    const data = await res.json()
    if (res.ok) { setSpnModal(false); setEditSponsor(null); loadSponsors(); showMsg(isNew ? 'Sponsor added.' : 'Sponsor updated.') }
    else showMsg(data.error ?? 'Failed.', false)
    setSavingSpn(false)
  }

  async function deleteSponsor(id: string) {
    if (!confirm('Remove this sponsor?')) return
    await fetch(`/api/events/sponsors?id=${id}`, { method: 'DELETE' })
    loadSponsors()
  }

  // ── Team CRUD ────────────────────────────────────────────────────────────────
  async function loadTeam() {
    setTeamLoading(true)
    const res  = await fetch(`/api/events/team?event_id=${eventId}`)
    const data = await res.json().catch(() => [])
    setTeam(Array.isArray(data) ? data : [])
    setTeamLoading(false)
  }

  async function saveTeamMember() {
    if (!editTeam?.email) return
    setSavingTeam(true)
    const payload = { ...editTeam, event_id: eventId }
    const isNew   = !editTeam.id
    const url     = isNew ? '/api/events/team' : `/api/events/team?id=${editTeam.id}`
    const res     = await fetch(url, { method: isNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(isNew ? payload : editTeam) })
    const data    = await res.json()
    if (res.ok) { setTeamModal(false); setEditTeam(null); loadTeam(); showMsg(isNew ? 'Member added.' : 'Updated.') }
    else showMsg(data.error ?? 'Failed.', false)
    setSavingTeam(false)
  }

  async function deleteTeamMember(id: string) {
    if (!confirm('Remove this team member?')) return
    await fetch(`/api/events/team?id=${id}`, { method: 'DELETE' })
    loadTeam()
  }

  async function savePageSettings() {
    setSavingSettings(true)
    const payload = { ...settings, event_id: eventId, page_settings: pageSettings }
    const res  = await fetch('/api/events/website', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await res.json()
    if (res.ok) { setSettings(data); showMsg('Page layout saved.') }
    else showMsg(data.error ?? 'Save failed.', false)
    setSavingSettings(false)
  }

  async function saveBuilder() {
    if (!ps) return
    setSavingBuilder(true)
    const payload = { ...settings, event_id: eventId, draft_structure: ps }
    const res  = await fetch('/api/events/website', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await res.json()
    if (res.ok) { setSettings(data); showMsg('Draft saved.') }
    else showMsg(data.error ?? 'Save failed.', false)
    setSavingBuilder(false)
  }

  async function publishDraft() {
    if (!settings.id) { showMsg('Save brand settings first, then publish.', false); return }
    const wasLive = settings.status === 'live'
    const confirmed = confirm(
      wasLive
        ? 'Replace the live website with the current draft? The current live version will be saved as a rollback snapshot.'
        : 'Publish this website live?'
    )
    if (!confirmed) return
    setPublishing(true)
    const res = await fetch('/api/events/website/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: settings.id }),
    })
    const data = await res.json()
    if (res.ok) {
      setSettings(s => ({ ...s, ...data }))
      showMsg(wasLive ? 'Website updated and live.' : 'Website is now live.')
    } else {
      showMsg(data.error ?? 'Publish failed.', false)
    }
    setPublishing(false)
  }

  async function unpublish() {
    if (!settings.id) return
    setSavingSettings(true)
    const res = await fetch('/api/events/website/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: settings.id, action: 'unpublish' }),
    })
    const data = await res.json()
    if (res.ok) { setSettings(s => ({ ...s, status: 'draft' })); showMsg('Website unpublished.') }
    else showMsg(data.error ?? 'Failed.', false)
    setSavingSettings(false)
  }

  async function rollback() {
    if (!settings.id) return
    if (!confirm('Roll back to the previous live version? The current live content will be replaced.')) return
    setRollbacking(true)
    const res = await fetch('/api/events/website/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: settings.id, action: 'rollback' }),
    })
    const data = await res.json()
    if (res.ok) { setSettings(s => ({ ...s, ...data })); showMsg('Rolled back to previous version.') }
    else showMsg(data.error ?? 'Rollback failed.', false)
    setRollbacking(false)
  }

  function exportBrandConfig() {
    const lines = [
      `EVENT: ${eventName}`,
      ``,
      `COLOURS`,
      `  Primary:   ${settings.brand_color_1 ?? settings.theme_primary ?? ''}`,
      `  Accent:    ${settings.brand_color_2 ?? settings.theme_accent  ?? ''}`,
      `  Secondary: ${settings.brand_color_3 ?? settings.theme_teal    ?? ''}`,
      `  Colour 4:  ${settings.brand_color_4 ?? ''}`,
      `  Colour 5:  ${settings.brand_color_5 ?? ''}`,
      ``,
      `FONTS`,
      `  Heading: ${settings.brand_font_heading ?? ''}`,
      `  Body:    ${settings.brand_font_body    ?? ''}`,
      ``,
      `LOGOS`,
      `  Primary:    ${settings.logo_primary_url    ?? ''}`,
      `  White:      ${settings.logo_white_url      ?? ''}`,
      `  Dark:       ${settings.logo_dark_url       ?? ''}`,
      `  Horizontal: ${settings.logo_horizontal_url ?? ''}`,
      ``,
      `MEDIA`,
      `  Media Kit: ${settings.media_kit_url ?? ''}`,
      `  Brand Hub: ${settings.brand_kit_url ?? ''}`,
      ``,
      `EVENT`,
      `  Date:  ${settings.venue_date_display ?? ''}`,
      `  Venue: ${[settings.venue_name, settings.venue_city].filter(Boolean).join(', ')}`,
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `${(eventName || 'event').replace(/\s+/g,'-').toLowerCase()}-brand-config.txt`
    a.click(); URL.revokeObjectURL(url)
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  const spByTier  = TIER_ORDER.reduce<Record<string, Speaker[]>>((a, t) => { a[t] = speakers.filter(s => s.tier === t); return a }, {})
  const agByDay   = agenda.reduce<Record<number, AgendaItem[]>>((a, ag) => { a[ag.day] = [...(a[ag.day] ?? []), ag]; return a }, {})
  const spnByTier = SPONSOR_TIER_ORDER.reduce<Record<string, Sponsor[]>>((a, t) => { a[t] = sponsors.filter(s => s.tier === t); return a }, {})

  const SET = (key: keyof WebsiteSettings) => (val: string) => setSettings(s => ({ ...s, [key]: val }))

  const g2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' } as React.CSSProperties
  const card = { background: '#F8FAFF', border: `1px solid ${C.border}`, borderRadius: '12px', padding: '20px', marginBottom: '12px' } as React.CSSProperties

  if (loading) return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: '13px', color: C.muted }}>Loading…</span>
    </div>
  )

  return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: C.bg, minHeight: '100vh', color: C.text }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } .spin { animation: spin 0.9s linear infinite; }`}</style>

      {/* Nav */}
      <nav style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '0 32px', height: '64px', display: 'flex', alignItems: 'center', gap: '16px', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 1px 3px rgba(0,165,163,0.06)' }}>
        <Link href="/admin/toolkit" style={{ fontSize: '13px', color: C.muted, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Toolkit
        </Link>
        <span style={{ color: C.border }}>/</span>
        <span style={{ fontSize: '13px', color: C.muted, fontWeight: 500 }}>{eventName}</span>
        <span style={{ color: C.border }}>/</span>
        <span style={{ fontSize: '13px', fontWeight: 700 }}>Website</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {settings.status === 'live' && settings.slug && (
            <a href={`/events/${settings.slug}`} target="_blank" rel="noreferrer"
              style={{ fontSize: '12px', color: C.muted, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', border: `1px solid ${C.border}`, borderRadius: '8px' }}>
              <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              View Live
            </a>
          )}
          {settings.slug && (
            <a href={`/api/public/event/${settings.slug}`} target="_blank" rel="noreferrer"
              style={{ fontSize: '12px', color: C.purple, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', border: `1px solid rgba(167,139,250,0.3)`, borderRadius: '8px' }}>
              API
            </a>
          )}
          <div style={{ padding: '4px 10px', borderRadius: '20px', background: settings.status === 'live' ? 'rgba(192,244,60,0.15)' : 'rgba(91,112,128,0.1)', fontSize: '11px', fontWeight: 700, color: settings.status === 'live' ? C.teal : C.muted }}>
            {settings.status === 'live' ? 'LIVE' : 'DRAFT'}
          </div>
          {settings.draft_structure && (
            <div style={{ padding: '4px 10px', borderRadius: '20px', background: 'rgba(245,158,11,0.1)', fontSize: '11px', fontWeight: 700, color: C.amber }}>
              DRAFT PENDING
            </div>
          )}
          <button onClick={togglePublish} disabled={savingSettings || publishing}
            style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: settings.status === 'live' && !settings.draft_structure ? 'rgba(255,107,107,0.12)' : C.green, color: settings.status === 'live' && !settings.draft_structure ? C.red : C.text, fontSize: '12px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', opacity: (savingSettings || publishing) ? 0.6 : 1 }}>
            {settings.status === 'live' && !settings.draft_structure ? 'Unpublish' : settings.status === 'live' && settings.draft_structure ? 'Update Live' : 'Publish Live'}
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: '1140px', margin: '0 auto', padding: '28px 24px' }}>

        {/* Toast */}
        {msg && (
          <div style={{ marginBottom: '16px', padding: '10px 16px', borderRadius: '10px', background: msgOk ? 'rgba(192,244,60,0.08)' : 'rgba(255,107,107,0.08)', border: `1px solid ${msgOk ? 'rgba(192,244,60,0.3)' : 'rgba(255,107,107,0.3)'}`, color: msgOk ? C.teal : C.red, fontSize: '13px' }}>
            {msg}
          </div>
        )}

        {/* ── Phase stepper ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'stretch', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', padding: '6px', marginBottom: '24px', flexWrap: 'wrap', gap: '4px' }}>
          {([
            { id: 'template', step: 0, label: 'Template', hint: 'Choose a site template' },
            { id: 'brand',    step: 1, label: 'Brand',    hint: 'Logos, colours, fonts' },
            { id: 'build',    step: 2, label: 'Build',    hint: 'Pages & sections' },
            { id: 'content',  step: 3, label: 'Content',  hint: 'Speakers, agenda, text' },
            { id: 'publish',  step: 4, label: 'Publish',  hint: 'Preview & go live' },
          ] as { id: Tab; step: number; label: string; hint: string }[]).map((s, i, arr) => {
            const active = tab === s.id
            return (
              <button key={s.id} onClick={() => {
                if (s.id === 'build' && settings.status === 'live' && !settings.draft_structure) {
                  setShowLiveGuard(true)
                }
                setTab(s.id as Tab)
              }}
                style={{ flex: 1, minWidth: '120px', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderRadius: '10px', border: 'none', background: active ? C.text : 'transparent', color: active ? C.green : C.muted, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.15s' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: active ? C.green : C.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 900, color: active ? C.text : C.muted, flexShrink: 0 }}>{s.step}</div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, lineHeight: 1.2 }}>{s.label}</div>
                  <div style={{ fontSize: '10px', fontWeight: 500, opacity: 0.65, lineHeight: 1.2 }}>{s.hint}</div>
                </div>
              </button>
            )
          })}
        </div>

        {/* ── TEMPLATE GALLERY ──────────────────────────────────────────── */}
        {tab === 'template' && (
          <div style={{ display: 'grid', gap: '20px' }}>

            {/* Existing deployment banner */}
            {existingSite && !deployResult && (
              <div style={{ background: `${C.teal}12`, border: `1px solid ${C.teal}40`, borderRadius: '16px', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: C.teal, marginBottom: '4px' }}>
                    {existingSite.status === 'deploying' ? 'Deploying...' : 'Site deployed'}
                  </div>
                  <div style={{ fontSize: '12px', color: C.muted }}>
                    Template: {templates.find(t => t.id === existingSite.template_id)?.label ?? existingSite.template_id}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {existingSite.site_url && (
                    <a href={existingSite.site_url} target="_blank" rel="noreferrer"
                      style={{ padding: '8px 16px', background: C.teal, color: '#fff', borderRadius: '8px', fontSize: '12px', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      Visit Site
                    </a>
                  )}
                  <a href={existingSite.repo_url} target="_blank" rel="noreferrer"
                    style={{ padding: '8px 16px', background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: '8px', fontSize: '12px', fontWeight: 700, textDecoration: 'none' }}>
                    GitHub Repo
                  </a>
                  {existingSite.gh_actions_url && (
                    <a href={existingSite.gh_actions_url} target="_blank" rel="noreferrer"
                      style={{ padding: '8px 16px', background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: '8px', fontSize: '12px', fontWeight: 700, textDecoration: 'none' }}>
                      Build Logs
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Header */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px' }}>
              <div style={{ fontSize: '15px', fontWeight: 800, color: C.text, marginBottom: '6px' }}>
                {existingSite ? 'Redeploy with a different template' : 'Choose a Site Template'}
              </div>
              <div style={{ fontSize: '13px', color: C.muted, lineHeight: 1.6 }}>
                Pick a template. TAOS will create a private GitHub repo under Trescon-Events, inject your event data (brand, logos, speakers, sponsors) and push everything. GitHub Actions then builds and deploys to Cloudflare Workers automatically — no terminal needed.
              </div>
            </div>

            {/* Template cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {templates.length === 0 ? (
                <div style={{ fontSize: '13px', color: C.muted, padding: '20px' }}>Loading templates…</div>
              ) : templates.map(t => {
                const sel = selectedTemplate === t.id
                return (
                  <button key={t.id} onClick={() => setSelectedTemplate(sel ? null : t.id)}
                    style={{ background: C.surface, border: `2px solid ${sel ? C.teal : C.border}`, borderRadius: '14px', padding: '0', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', transition: 'border-color 0.15s', overflow: 'hidden' }}>

                    {/* Color swatch header */}
                    <div style={{ height: '80px', background: t.color_scheme.bg, position: 'relative', display: 'flex', alignItems: 'flex-end', padding: '12px 14px', gap: '6px' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: t.color_scheme.accent, border: '2px solid rgba(255,255,255,0.2)' }} />
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: t.color_scheme.highlight, border: '2px solid rgba(255,255,255,0.2)' }} />
                      {sel && (
                        <div style={{ position: 'absolute', top: '10px', right: '10px', background: C.teal, color: '#fff', fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '20px' }}>SELECTED</div>
                      )}
                      <div style={{ position: 'absolute', top: '10px', left: '14px', background: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.8)', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', backdropFilter: 'blur(4px)' }}>{t.event_name}</div>
                    </div>

                    {/* Info */}
                    <div style={{ padding: '14px 16px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: C.text, marginBottom: '6px' }}>{t.label}</div>
                      <div style={{ fontSize: '12px', color: C.muted, lineHeight: 1.55, marginBottom: '10px' }}>{t.description}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                        {t.style_tags.map(tag => (
                          <span key={tag} style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px', background: `${C.teal}18`, color: C.teal }}>{tag}</span>
                        ))}
                      </div>
                      <div style={{ fontSize: '11px', color: C.muted }}>
                        <span style={{ fontWeight: 700 }}>Pages: </span>{t.pages.slice(0, 5).join(', ')}{t.pages.length > 5 ? ` +${t.pages.length - 5} more` : ''}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Deploy button */}
            {selectedTemplate && !deployResult && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: C.text, marginBottom: '6px' }}>
                  {templates.find(t => t.id === selectedTemplate)?.label}
                </div>
                <div style={{ fontSize: '12px', color: C.muted, marginBottom: '20px', lineHeight: 1.6 }}>
                  TAOS will create a GitHub repo, inject your event data, and trigger an automatic Cloudflare Workers deployment. The site will be live in 5–8 minutes.
                </div>

                {/* Progress steps while deploying */}
                {deploying && (
                  <div style={{ display: 'grid', gap: '10px', marginBottom: '20px' }}>
                    {[
                      'Reading template files from GitHub',
                      'Creating your site repo under Trescon-Events',
                      'Injecting event data (brand, speakers, sponsors)',
                      'Setting up GitHub Actions for auto-deploy',
                      'Pushing to GitHub — build will start in seconds',
                    ].map((step, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: `2px solid ${C.teal}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: C.teal, animation: 'pulse 1s infinite' }} />
                        </div>
                        <div style={{ fontSize: '12px', color: C.muted }}>{step}</div>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  disabled={deploying}
                  onClick={async () => {
                    setDeploying(true)
                    setDeployResult(null)
                    try {
                      const res = await fetch('/api/sites/deploy', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ event_id: eventId, template_id: selectedTemplate }),
                      })
                      const data = await res.json()
                      if (!res.ok) { showMsg(data.error ?? 'Deployment failed'); return }
                      setDeployResult(data)
                      setExistingSite({ repo_url: data.repo_url, gh_actions_url: data.gh_actions_url, site_url: data.site_url, status: 'deploying', template_id: selectedTemplate!, worker_name: data.worker_name })
                    } catch (e) {
                      showMsg(e instanceof Error ? e.message : 'Deployment failed')
                    } finally {
                      setDeploying(false)
                    }
                  }}
                  style={{ padding: '12px 28px', background: deploying ? C.muted : C.teal, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: deploying ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {deploying
                    ? <><svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24" className="spin"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg> Creating site…</>
                    : <><svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></svg> Create &amp; Deploy Site</>
                  }
                </button>
              </div>
            )}

            {/* Deployment result */}
            {deployResult && (
              <div style={{ background: `${C.teal}08`, border: `2px solid ${C.teal}40`, borderRadius: '16px', padding: '24px', display: 'grid', gap: '16px' }}>

                {/* Success header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: `${C.teal}20`, border: `2px solid ${C.teal}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="18" height="18" fill="none" stroke={C.teal} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: C.teal }}>Site created successfully</div>
                    <div style={{ fontSize: '12px', color: C.muted }}>GitHub repo is ready. Build is running now — site will be live in 5–8 minutes.</div>
                  </div>
                </div>

                {/* Links */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
                  <a href={deployResult.repo_url} target="_blank" rel="noreferrer"
                    style={{ padding: '14px 16px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <svg width="20" height="20" fill={C.text} viewBox="0 0 24 24"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: C.text }}>GitHub Repo</div>
                      <div style={{ fontSize: '11px', color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deployResult.repo_url.replace('https://github.com/', '')}</div>
                    </div>
                  </a>

                  <a href={deployResult.gh_actions_url} target="_blank" rel="noreferrer"
                    style={{ padding: '14px 16px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <svg width="20" height="20" fill="none" stroke={C.amber} strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: C.text }}>Build Logs</div>
                      <div style={{ fontSize: '11px', color: C.muted }}>GitHub Actions — live progress</div>
                    </div>
                  </a>

                  <a href={deployResult.site_url} target="_blank" rel="noreferrer"
                    style={{ padding: '14px 16px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <svg width="20" height="20" fill="none" stroke={C.green} strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: C.text }}>Live URL</div>
                      <div style={{ fontSize: '11px', color: C.muted }}>{deployResult.site_url} (active after build)</div>
                    </div>
                  </a>
                </div>

                {/* One-time setup note */}
                <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '14px 16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: C.text, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>First time only — add org secrets in GitHub</div>
                  <div style={{ fontSize: '12px', color: C.muted, lineHeight: 1.6 }}>
                    Go to <strong>github.com/organizations/Trescon-Events/settings/secrets/actions</strong> and add these two secrets (once, applies to all sites):
                  </div>
                  <div style={{ marginTop: '10px', display: 'grid', gap: '6px' }}>
                    <code style={{ fontSize: '11px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '6px 10px', display: 'block', color: C.text }}>CLOUDFLARE_API_TOKEN — your CF API token (Workers:Edit permission)</code>
                    <code style={{ fontSize: '11px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '6px 10px', display: 'block', color: C.text }}>CLOUDFLARE_ACCOUNT_ID — your CF account ID</code>
                  </div>
                  <div style={{ fontSize: '11px', color: C.muted, marginTop: '8px' }}>After adding, every future site deploys fully automatically with zero setup.</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── BRAND ────────────────────────────────────────────────────── */}
        {tab === 'brand' && (
          <div style={{ display: 'grid', gap: '20px' }}>

            {/* Step 1 — Brand Document */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 900, color: '#fff', flexShrink: 0 }}>1</div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: C.text }}>Brand Guidelines Document</div>
              </div>
              <div style={{ fontSize: '12px', color: C.muted, marginBottom: '16px', paddingLeft: '34px' }}>Upload your brand PDF. Once uploaded, manually set the colours and fonts extracted from it below.</div>
              <div style={{ paddingLeft: '34px' }}>
                <ImageUpload label="Brand PDF / Guidelines Doc" value={settings.brand_doc_url ?? null} eventId={eventId} section="brand_doc" acceptPdf onUpload={v => setSettings(s => ({ ...s, brand_doc_url: v }))} />
                {settings.brand_doc_url && (
                  <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {/* Extract button */}
                    <button
                      disabled={extracting}
                      onClick={async () => {
                        setExtracting(true)
                        showMsg('Reading PDF with Gemini AI…')
                        try {
                          const res  = await fetch('/api/events/brand/extract-pdf', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ pdf_url: settings.brand_doc_url }),
                          })
                          const data = await res.json()
                          if (!res.ok) { showMsg(data.error ?? 'Extraction failed', false); return }
                          // Auto-fill colours
                          const colorKeys = ['brand_color_1','brand_color_2','brand_color_3','brand_color_4','brand_color_5'] as const
                          const colorUpdates: Record<string, string> = {}
                          ;(data.colors ?? []).forEach((hex: string, i: number) => {
                            if (colorKeys[i]) colorUpdates[colorKeys[i]] = hex
                          })
                          // Auto-fill fonts
                          setSettings(s => ({
                            ...s,
                            ...colorUpdates,
                            ...(data.heading_font ? { brand_font_heading: data.heading_font } : {}),
                            ...(data.body_font    ? { brand_font_body:    data.body_font    } : {}),
                          }))
                          showMsg(`Extracted ${data.colors?.length ?? 0} colours + fonts from brand book. Review and save.`)
                        } catch (e) {
                          showMsg(e instanceof Error ? e.message : 'Extraction failed', false)
                        } finally {
                          setExtracting(false)
                        }
                      }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                        padding: '8px 16px', borderRadius: 8, border: 'none',
                        background: extracting ? C.border : C.teal,
                        color: extracting ? C.muted : '#fff',
                        fontSize: '12px', fontWeight: 800, cursor: extracting ? 'wait' : 'pointer',
                        fontFamily: 'inherit', transition: 'all 0.15s',
                      }}>
                      {extracting
                        ? <><svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24" className="spin"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg> Reading PDF…</>
                        : <><svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Read PDF &amp; Extract Brand Info</>
                      }
                    </button>
                    <a href={settings.brand_doc_url} target="_blank" rel="noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '12px', color: C.muted, fontWeight: 600, textDecoration: 'none' }}>
                      <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      View PDF
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Step 2 — Logos */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 900, color: '#fff', flexShrink: 0 }}>2</div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: C.text }}>Logo Variants</div>
              </div>
              <div style={{ fontSize: '12px', color: C.muted, marginBottom: '16px', paddingLeft: '34px' }}>Upload all logo versions — used across the website and in the media kit.</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', paddingLeft: '34px' }}>
                <div style={{ background: '#0F1923', borderRadius: '10px', padding: '16px' }}>
                  <ImageUpload label="Primary Logo (colour)" value={settings.logo_primary_url ?? null} eventId={eventId} section="logo_primary" onUpload={v => setSettings(s => ({ ...s, logo_primary_url: v }))} />
                </div>
                <div style={{ background: '#0F1923', borderRadius: '10px', padding: '16px' }}>
                  <ImageUpload label="White / Light Logo" value={settings.logo_white_url ?? null} eventId={eventId} section="logo_white" onUpload={v => setSettings(s => ({ ...s, logo_white_url: v }))} />
                </div>
                <div style={{ background: '#F8FAFF', borderRadius: '10px', padding: '16px', border: `1px solid ${C.border}` }}>
                  <ImageUpload label="Dark Logo (on white)" value={settings.logo_dark_url ?? null} eventId={eventId} section="logo_dark" onUpload={v => setSettings(s => ({ ...s, logo_dark_url: v }))} />
                </div>
                <div style={{ background: '#F8FAFF', borderRadius: '10px', padding: '16px', border: `1px solid ${C.border}` }}>
                  <ImageUpload label="Horizontal / Wide Logo" value={settings.logo_horizontal_url ?? null} eventId={eventId} section="logo_horizontal" onUpload={v => setSettings(s => ({ ...s, logo_horizontal_url: v }))} />
                </div>
              </div>
            </div>

            {/* Step 2b — Patterns & Section Backgrounds */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#6366F1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 900, color: '#fff', flexShrink: 0 }}>2b</div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: C.text }}>Patterns, Textures & Section Backgrounds</div>
              </div>
              <div style={{ fontSize: '12px', color: C.muted, marginBottom: '16px', paddingLeft: '34px' }}>Upload brand patterns and textures. Section backgrounds override the global theme per section.</div>
              <div style={{ paddingLeft: '34px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: C.muted, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px' }}>Brand Patterns / Textures (up to 5)</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '20px' }}>
                  {([1,2,3,4,5] as const).map(n => {
                    const k = `pattern_${n}_url` as keyof WebsiteSettings
                    const v = settings[k] as string | null
                    return (
                      <div key={n} style={{ background: '#F8FAFF', border: `1px solid ${C.border}`, borderRadius: '10px', padding: '10px' }}>
                        {v && <div style={{ width: '100%', height: '56px', borderRadius: '6px', backgroundImage: `url(${v})`, backgroundSize: 'cover', backgroundPosition: 'center', marginBottom: '8px' }} />}
                        <ImageUpload label={`Pattern ${n}`} value={v ?? null} eventId={eventId} section={`pattern_${n}`} onUpload={val => setSettings(s => ({ ...s, [k]: val }))} />
                      </div>
                    )
                  })}
                </div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: C.muted, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px' }}>Section Backgrounds</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                  <ImageUpload label="About Section BG" value={settings.bg_about_url ?? null} eventId={eventId} section="bg_about" onUpload={v => setSettings(s => ({ ...s, bg_about_url: v }))} />
                  <ImageUpload label="Agenda Section BG" value={settings.bg_agenda_url ?? null} eventId={eventId} section="bg_agenda" onUpload={v => setSettings(s => ({ ...s, bg_agenda_url: v }))} />
                  <ImageUpload label="Partners Section BG" value={settings.bg_sponsors_url ?? null} eventId={eventId} section="bg_sponsors" onUpload={v => setSettings(s => ({ ...s, bg_sponsors_url: v }))} />
                </div>
              </div>
            </div>

            {/* Step 3 — Colours */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 900, color: '#fff', flexShrink: 0 }}>3</div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: C.text }}>Brand Colours</div>
              </div>
              <div style={{ fontSize: '12px', color: C.muted, marginBottom: '16px', paddingLeft: '34px' }}>
                Enter all brand hex codes. The first 3 slots map to the website theme — use the arrows to shuffle which colour goes where.
              </div>
              <div style={{ paddingLeft: '34px' }}>
                {/* Role legend */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', marginBottom: '6px' }}>
                  {[
                    { role: 'Background', tag: C.teal },
                    { role: 'Buttons / CTA', tag: C.teal },
                    { role: 'Teal Accents', tag: C.teal },
                    { role: 'No role', tag: C.muted },
                    { role: 'No role', tag: C.muted },
                  ].map(({ role, tag }, i) => (
                    <div key={i} style={{ fontSize: '9px', fontWeight: 700, color: tag, textTransform: 'uppercase', letterSpacing: '0.4px', textAlign: 'center', padding: '2px 4px', borderRadius: 4, background: i < 3 ? `${C.teal}12` : 'transparent' }}>
                      {role}
                    </div>
                  ))}
                </div>

                {/* Colour slots */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', alignItems: 'end', marginBottom: '16px' }}>
                  {(['brand_color_1','brand_color_2','brand_color_3','brand_color_4','brand_color_5'] as (keyof WebsiteSettings)[]).map((key, i) => {
                    const val = (settings[key] as string) ?? '#000000'
                    const colorKeys: (keyof WebsiteSettings)[] = ['brand_color_1','brand_color_2','brand_color_3','brand_color_4','brand_color_5']
                    function swapWith(targetIdx: number) {
                      const tKey = colorKeys[targetIdx]
                      const aVal = (settings[key] as string) ?? '#000000'
                      const bVal = (settings[tKey] as string) ?? '#000000'
                      setSettings(s => ({ ...s, [key]: bVal, [tKey]: aVal }))
                    }
                    return (
                      <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>
                          Slot {i + 1}
                        </div>
                        <div style={{ width: '100%', height: '44px', borderRadius: '8px', background: val, border: `1px solid ${C.border}` }} />
                        <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                          <input type="color" value={val} onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))}
                            style={{ width: '24px', height: '24px', border: 'none', background: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }} />
                          <input value={val} onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))}
                            style={{ flex: 1, padding: '4px 6px', borderRadius: '6px', border: `1px solid ${C.border}`, fontSize: '10px', fontFamily: 'monospace', color: C.text, minWidth: 0 }} />
                        </div>
                        {/* Shuffle arrows */}
                        <div style={{ display: 'flex', gap: '3px', justifyContent: 'center' }}>
                          {i > 0 && (
                            <button onClick={() => swapWith(i - 1)} title="Move left"
                              style={{ padding: '2px 6px', borderRadius: 5, border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontSize: '10px', cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1 }}>
                              ←
                            </button>
                          )}
                          {i < 4 && (
                            <button onClick={() => swapWith(i + 1)} title="Move right"
                              style={{ padding: '2px 6px', borderRadius: 5, border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontSize: '10px', cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1 }}>
                              →
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Apply button + live preview */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => {
                      const c1 = settings.brand_color_1 || settings.theme_primary
                      const c2 = settings.brand_color_2 || settings.theme_accent
                      const c3 = settings.brand_color_3 || settings.theme_teal
                      setSettings(s => ({ ...s, theme_primary: c1 ?? '#080A0C', theme_accent: c2 ?? '#E07B2C', theme_teal: c3 ?? '#00B4B0' }))
                      showMsg('Colours applied to website theme.')
                    }}
                    style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: C.green, color: C.text, fontSize: '12px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Apply Colours to Website Theme
                  </button>
                  {/* Live preview strip */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {[
                      { label: 'BG', color: settings.brand_color_1 ?? '#080A0C' },
                      { label: 'BTN', color: settings.brand_color_2 ?? '#E07B2C' },
                      { label: 'ACC', color: settings.brand_color_3 ?? '#00B4B0' },
                    ].map(({ label, color }) => (
                      <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <div style={{ width: 28, height: 18, borderRadius: 4, background: color, border: `1px solid ${C.border}` }} />
                        <span style={{ fontSize: '9px', color: C.muted, fontWeight: 700 }}>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: C.muted, marginTop: '8px' }}>
                  Slot 1 → Page background · Slot 2 → Buttons &amp; CTAs · Slot 3 → Teal/accent highlights. Slots 4–5 are stored but not auto-applied — use them freely.
                </div>
              </div>
            </div>

            {/* Step 4 — Typography */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 900, color: '#fff', flexShrink: 0 }}>4</div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: C.text }}>Typography</div>
              </div>
              <div style={{ fontSize: '12px', color: C.muted, marginBottom: '16px', paddingLeft: '34px' }}>Font names from your brand document (must be available on Google Fonts).</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', paddingLeft: '34px' }}>
                <Field label="Heading Font" value={settings.brand_font_heading ?? ''} onChange={v => setSettings(s => ({ ...s, brand_font_heading: v }))} placeholder="e.g. Inter, Sora, Manrope" />
                <Field label="Body Font" value={settings.brand_font_body ?? ''} onChange={v => setSettings(s => ({ ...s, brand_font_body: v }))} placeholder="e.g. Inter, DM Sans" />
              </div>
              {(settings.brand_font_heading || settings.brand_font_body) && (
                <div style={{ marginTop: '12px', paddingLeft: '34px' }}>
                  <div style={{ padding: '14px 16px', borderRadius: '8px', background: '#F8FAFF', border: `1px solid ${C.border}` }}>
                    <div style={{ fontFamily: settings.brand_font_heading ?? 'inherit', fontSize: '22px', fontWeight: 900, color: C.text, marginBottom: '6px' }}>Heading Preview — {settings.brand_font_heading || 'system font'}</div>
                    <div style={{ fontFamily: settings.brand_font_body ?? 'inherit', fontSize: '14px', color: C.muted, lineHeight: 1.6 }}>Body text preview — {settings.brand_font_body || 'system font'}. The quick brown fox jumps over the lazy dog.</div>
                  </div>
                </div>
              )}
            </div>

            {/* Step 5 — Additional Assets */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 900, color: '#fff', flexShrink: 0 }}>5</div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: C.text }}>Media Kit & Brand Hub Links</div>
              </div>
              <div style={{ fontSize: '12px', color: C.muted, marginBottom: '16px', paddingLeft: '34px' }}>Links to the full brand hub and media kit — shown on the public event website.</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', paddingLeft: '34px' }}>
                <Field label="Media Kit URL" value={settings.media_kit_url ?? ''} onChange={v => setSettings(s => ({ ...s, media_kit_url: v }))} placeholder="/ai2047-media-kit.html" />
                <Field label="Brand Hub URL" value={settings.brand_kit_url ?? ''} onChange={v => setSettings(s => ({ ...s, brand_kit_url: v }))} placeholder="/ai2047-brand-hub.html" />
              </div>
            </div>

            {/* Save + Export */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={saveSettings} disabled={savingSettings}
                style={{ padding: '12px 28px', borderRadius: '10px', border: 'none', background: C.green, color: C.text, fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', opacity: savingSettings ? 0.6 : 1 }}>
                {savingSettings ? 'Saving…' : 'Save Brand Settings'}
              </button>
              <button onClick={exportBrandConfig}
                style={{ padding: '12px 20px', borderRadius: '10px', border: `1px solid ${C.border}`, background: C.surface, color: C.sub, fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export Brand Config
              </button>
            </div>
          </div>
        )}

        {/* ── LIVE GUARD ────────────────────────────────────────────────── */}
        {tab === 'build' && showLiveGuard && !settings.draft_structure && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(192,244,60,0.15)', border: '1px solid rgba(192,244,60,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="16" height="16" fill="none" stroke={C.teal} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: C.text }}>This website is currently LIVE</div>
                <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>
                  {settings.custom_domain ?? (settings.slug ? `/events/${settings.slug}` : '')}
                  {settings.last_published_at && ` · Last published ${new Date(settings.last_published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <button
                onClick={() => {
                  const base = settings.page_structure_full
                  setPs(base && Object.keys(base).length > 0 ? base as PageStructure : defaultStructure(settings.theme_accent ?? undefined, settings.theme_primary ?? undefined))
                  setBuilderMode('editing_live')
                  setShowLiveGuard(false)
                }}
                style={{ padding: '20px', borderRadius: '12px', border: `2px solid ${C.border}`, background: '#F8FAFF', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: C.text }}>Edit current site</div>
                <div style={{ fontSize: '12px', color: C.muted, lineHeight: 1.5 }}>Make targeted changes to the live design. A draft copy is created — live stays untouched until you publish.</div>
              </button>
              <button
                onClick={() => {
                  setPs(defaultStructure(settings.theme_accent ?? undefined, settings.theme_primary ?? undefined))
                  setBuilderMode('fresh')
                  setShowLiveGuard(false)
                }}
                style={{ padding: '20px', borderRadius: '12px', border: `2px solid ${C.border}`, background: '#F8FAFF', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: C.text }}>Start fresh redesign</div>
                <div style={{ fontSize: '12px', color: C.muted, lineHeight: 1.5 }}>Build a completely new design from scratch. Live site continues to run until you publish the new version.</div>
              </button>
            </div>
          </div>
        )}

        {/* ── BUILDER ──────────────────────────────────────────────────── */}
        {tab === 'build' && ps && !showLiveGuard && (() => {
          const selPage = ps.pages.find(p => p.id === selPageId) ?? ps.pages[0]

          // ── helpers ────────────────────────────────────────────────────
          function updNav(fn: (nav: PageStructure['nav']) => PageStructure['nav']) {
            setPs(p => p ? { ...p, nav: fn([...p.nav]) } : p)
          }
          function updDesign(pageId: string, secId: string, patch: Partial<SectionDesign>) {
            updSections(pageId, secs => secs.map(s => s.id === secId ? { ...s, design: { ...s.design, ...patch } } : s))
          }

          const uid = () => Math.random().toString(36).slice(2, 9)

          function navMove(i: number, d: -1|1) {
            updNav(nav => { const n=[...nav]; const j=i+d; if(j<0||j>=n.length) return n; [n[i],n[j]]=[n[j],n[i]]; return n })
          }
          function navRemove(i: number) { updNav(nav => nav.filter((_,idx) => idx !== i)) }
          function navAdd() { updNav(nav => [...nav, { id: uid(), label: 'Link', href: '', type: 'link' as const }]) }
          function navSet(i: number, patch: Partial<PageStructure['nav'][0]>) {
            updNav(nav => nav.map((item, idx) => idx === i ? { ...item, ...patch } : item))
          }

          function updFooter(patch: Partial<FooterConfig>) {
            setPs(p => p ? { ...p, footer: { ...p.footer, ...patch } } : p)
          }
          function updFooterCol(colId: string, patch: Partial<FooterColumn>) {
            setPs(p => p ? { ...p, footer: { ...p.footer, columns: p.footer.columns.map(c => c.id === colId ? { ...c, ...patch } : c) } } : p)
          }
          function updFooterLink(colId: string, linkId: string, patch: Partial<FooterLink>) {
            setPs(p => p ? { ...p, footer: { ...p.footer, columns: p.footer.columns.map(c => c.id === colId ? { ...c, links: c.links.map(l => l.id === linkId ? { ...l, ...patch } : l) } : c) } } : p)
          }
          function addFooterCol() {
            const id = uid()
            setPs(p => p ? { ...p, footer: { ...p.footer, columns: [...p.footer.columns, { id, heading: 'Column', links: [] }] } } : p)
          }
          function removeFooterCol(colId: string) {
            setPs(p => p ? { ...p, footer: { ...p.footer, columns: p.footer.columns.filter(c => c.id !== colId) } } : p)
          }
          function addFooterLink(colId: string) {
            const id = uid()
            setPs(p => p ? { ...p, footer: { ...p.footer, columns: p.footer.columns.map(c => c.id === colId ? { ...c, links: [...c.links, { id, label: 'Link', href: '' }] } : c) } } : p)
          }
          function removeFooterLink(colId: string, linkId: string) {
            setPs(p => p ? { ...p, footer: { ...p.footer, columns: p.footer.columns.map(c => c.id === colId ? { ...c, links: c.links.filter(l => l.id !== linkId) } : c) } } : p)
          }

          function secMove(pageId: string, i: number, d: -1|1) {
            updSections(pageId, secs => { const s=[...secs]; const j=i+d; if(j<0||j>=s.length) return s; [s[i],s[j]]=[s[j],s[i]]; return s })
          }
          function secRemove(pageId: string, secId: string) {
            updSections(pageId, secs => secs.filter(s => s.id !== secId))
          }

          const CONTENT_TYPES = ['text_block','testimonials','faq','gallery','video_embed','countdown','cta_banner']

          function secAdd(pageId: string, type: Section['type']) {
            const def: SectionDesign = { bg_type: 'colour', bg_value: settings.theme_primary ?? '#0F1923', text_light: true, padding: 'normal', full_width: true }
            const isContent = CONTENT_TYPES.includes(type)
            updSections(pageId, secs => [...secs, { id: uid(), type, enabled: true, dashboard_editable: isContent, design: def }])
            setAddSecOpen(false)
          }
          function pageToggleNav(pageId: string) {
            updPages(pgs => pgs.map(pg => pg.id === pageId ? { ...pg, in_nav: !pg.in_nav } : pg))
          }

          // ── design value input ─────────────────────────────────────────
          const bgInput = (sec: Section) => {
            const d = sec.design
            if (d.bg_type === 'colour' || d.bg_type === 'gradient') return (
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input type="color" value={d.bg_value || '#000000'} onChange={e => updDesign(selPage.id, sec.id, { bg_value: e.target.value })}
                  style={{ width: '32px', height: '32px', border: 'none', padding: 0, cursor: 'pointer', background: 'none', flexShrink: 0 }} />
                <input value={d.bg_value} onChange={e => updDesign(selPage.id, sec.id, { bg_value: e.target.value })}
                  style={{ width: '100px', padding: '5px 8px', borderRadius: '6px', border: `1px solid ${C.border}`, fontSize: '12px', fontFamily: 'monospace', color: C.text }} />
              </div>
            )
            if (d.bg_type === 'image') return (
              <input value={d.bg_value} onChange={e => updDesign(selPage.id, sec.id, { bg_value: e.target.value })}
                placeholder="https://... image URL" style={{ flex: 1, padding: '5px 10px', borderRadius: '6px', border: `1px solid ${C.border}`, fontSize: '12px', fontFamily: 'inherit', color: C.text }} />
            )
            if (d.bg_type === 'pattern') return (
              <div style={{ display: 'flex', gap: '4px' }}>
                {['1','2','3','4','5'].map(n => {
                  const url = (settings as Record<string,unknown>)[`pattern_${n}_url`] as string | null
                  return (
                    <button key={n} onClick={() => updDesign(selPage.id, sec.id, { bg_value: n })}
                      title={`Pattern ${n}`}
                      style={{ width: '28px', height: '28px', borderRadius: '6px', border: `2px solid ${d.bg_value === n ? C.teal : C.border}`, backgroundImage: url ? `url(${url})` : 'none', backgroundSize: 'cover', backgroundColor: '#F8FAFF', cursor: 'pointer', fontSize: '10px', color: C.muted }}>
                      {!url && n}
                    </button>
                  )
                })}
              </div>
            )
            return null
          }

          // ── section row rendering ──────────────────────────────────────
          const secRow = (sec: Section, sIdx: number) => {
            const meta = SECTION_TYPES.find(st => st.type === sec.type)
            const layouts = SECTION_LAYOUTS[sec.type] ?? []
            const d = sec.design
            const isOpen = openDesignId === sec.id
            const isDragOver = dndOverIdx === sIdx && dndSrcIdx.current !== null && dndSrcIdx.current !== sIdx
            return (
              <div key={sec.id}
                draggable
                onDragStart={() => { dndSrcIdx.current = sIdx }}
                onDragOver={e => { e.preventDefault(); setDndOverIdx(sIdx) }}
                onDragLeave={() => setDndOverIdx(null)}
                onDrop={e => {
                  e.preventDefault()
                  const from = dndSrcIdx.current
                  if (from !== null && from !== sIdx) {
                    updPages(prev => prev.map(pg => {
                      if (pg.id !== selPage.id) return pg
                      const secs = [...pg.sections]
                      const [moved] = secs.splice(from, 1)
                      secs.splice(sIdx, 0, moved)
                      return { ...pg, sections: secs }
                    }))
                  }
                  dndSrcIdx.current = null; setDndOverIdx(null)
                }}
                onDragEnd={() => { dndSrcIdx.current = null; setDndOverIdx(null) }}
                style={{ borderRadius: '12px', border: `1px solid ${isDragOver ? C.teal : sec.enabled ? C.teal+'44' : C.border}`, marginBottom: '8px', overflow: 'hidden', opacity: sec.enabled ? 1 : 0.55, transition: 'border-color 0.15s', boxShadow: isDragOver ? `0 0 0 2px ${C.teal}44` : 'none' }}>
                {/* Row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: C.surface }}>
                  {/* drag handle */}
                  <div style={{ cursor: 'grab', flexShrink: 0, color: C.muted, fontSize: '16px', lineHeight: 1, userSelect: 'none', padding: '0 2px' }} title="Drag to reorder">
                    &#9776;
                  </div>
                  {/* enable toggle */}
                  <button onClick={() => updSection(selPage.id, sec.id, { enabled: !sec.enabled })}
                    title={sec.enabled ? 'Visible on site' : 'Hidden on site'}
                    style={{ width: '36px', height: '20px', borderRadius: '10px', border: 'none', background: sec.enabled ? C.teal : '#CBD5E1', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.15s' }}>
                    <span style={{ position: 'absolute', top: '3px', left: sec.enabled?'19px':'3px', width: '14px', height: '14px', borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
                  </button>
                  {/* dashboard toggle */}
                  <button onClick={() => updSection(selPage.id, sec.id, { dashboard_editable: !sec.dashboard_editable })}
                    title={sec.dashboard_editable ? 'Editable in Content tab' : 'Not on dashboard — click to enable'}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '6px', border: `1px solid ${sec.dashboard_editable ? C.purple+'66' : C.border}`, background: sec.dashboard_editable ? C.purple+'14' : 'transparent', color: sec.dashboard_editable ? C.purple : C.muted, fontSize: '10px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, transition: 'all 0.15s' }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>
                    {sec.dashboard_editable ? 'Dashboard' : 'Dashboard'}
                  </button>
                  {/* type label */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>{meta?.label ?? sec.type}</div>
                    {/* layouts */}
                    {layouts.length > 0 && (
                      <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                        {layouts.map(l => (
                          <button key={l.value} onClick={() => updSection(selPage.id, sec.id, { layout: l.value })}
                            style={{ padding: '2px 9px', borderRadius: '5px', border: `1px solid ${sec.layout===l.value?C.teal:C.border}`, background: sec.layout===l.value?C.teal+'18':'transparent', color: sec.layout===l.value?C.teal:C.muted, fontSize: '10px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {l.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* design toggle */}
                  <button onClick={() => setOpenDesignId(isOpen ? null : sec.id)}
                    style={{ padding: '5px 12px', borderRadius: '7px', border: `1px solid ${isOpen?C.teal:C.border}`, background: isOpen?C.teal+'18':'transparent', color: isOpen?C.teal:C.muted, fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                    Design {isOpen?'▲':'▼'}
                  </button>
                  {/* remove */}
                  <button onClick={() => { if(confirm('Remove this section?')) secRemove(selPage.id, sec.id) }}
                    style={{ padding: '4px 8px', borderRadius: '6px', border: `1px solid rgba(255,107,107,0.25)`, background: 'rgba(255,107,107,0.06)', color: C.red, fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>×</button>
                </div>

                {/* Design panel */}
                {isOpen && (
                  <div style={{ borderTop: `1px solid ${C.border}`, background: '#F8FAFF' }}>
                    {/* ── Visual design controls ───────────────────────── */}
                    <div style={{ padding: '14px 16px', display: 'flex', flexWrap: 'wrap', gap: '18px', alignItems: 'flex-start', borderBottom: `1px solid ${C.border}` }}>
                      {/* bg type */}
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Background</div>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {(['colour','gradient','image','pattern','transparent'] as SectionDesign['bg_type'][]).map(bt => (
                            <button key={bt} onClick={() => updDesign(selPage.id, sec.id, { bg_type: bt })}
                              style={{ padding: '3px 9px', borderRadius: '5px', border: `1px solid ${d.bg_type===bt?C.teal:C.border}`, background: d.bg_type===bt?C.teal+'18':'transparent', color: d.bg_type===bt?C.teal:C.muted, fontSize: '10px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                              {bt}
                            </button>
                          ))}
                        </div>
                      </div>
                      {d.bg_type !== 'transparent' && (
                        <div>
                          <div style={{ fontSize: '10px', fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Value</div>
                          {bgInput(sec)}
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Text</div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {([true, false] as boolean[]).map(lt => (
                            <button key={String(lt)} onClick={() => updDesign(selPage.id, sec.id, { text_light: lt })}
                              style={{ padding: '3px 10px', borderRadius: '5px', border: `1px solid ${d.text_light===lt?C.teal:C.border}`, background: d.text_light===lt?C.teal+'18':'transparent', color: d.text_light===lt?C.teal:C.muted, fontSize: '10px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                              {lt ? 'Light' : 'Dark'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Padding</div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {(['compact','normal','spacious'] as SectionDesign['padding'][]).map(p => (
                            <button key={p} onClick={() => updDesign(selPage.id, sec.id, { padding: p })}
                              style={{ padding: '3px 9px', borderRadius: '5px', border: `1px solid ${d.padding===p?C.teal:C.border}`, background: d.padding===p?C.teal+'18':'transparent', color: d.padding===p?C.teal:C.muted, fontSize: '10px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                              {p}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Width</div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {([true, false] as boolean[]).map(fw => (
                            <button key={String(fw)} onClick={() => updDesign(selPage.id, sec.id, { full_width: fw })}
                              style={{ padding: '3px 10px', borderRadius: '5px', border: `1px solid ${d.full_width===fw?C.teal:C.border}`, background: d.full_width===fw?C.teal+'18':'transparent', color: d.full_width===fw?C.teal:C.muted, fontSize: '10px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                              {fw ? 'Full' : 'Contained'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* ── Section-specific controls ─────────────────────── */}
                    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

                      {/* Hero / Page Hero controls */}
                      {(sec.type === 'hero' || sec.type === 'page_hero') && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          <div>
                            <div style={{ fontSize: '10px', fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Logo</div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {(['none','white','primary','horizontal'] as const).map(slot => (
                                <button key={slot} onClick={() => updSection(selPage.id, sec.id, { logo_slot: slot })}
                                  style={{ padding: '3px 8px', borderRadius: '5px', border: `1px solid ${sec.logo_slot===slot?C.teal:C.border}`, background: sec.logo_slot===slot?C.teal+'18':'transparent', color: sec.logo_slot===slot?C.teal:C.muted, fontSize: '10px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                  {slot}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '10px', fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Logo Size</div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {(['sm','md','lg'] as const).map(sz => (
                                <button key={sz} onClick={() => updSection(selPage.id, sec.id, { logo_size: sz })}
                                  style={{ padding: '3px 12px', borderRadius: '5px', border: `1px solid ${sec.logo_size===sz?C.teal:C.border}`, background: sec.logo_size===sz?C.teal+'18':'transparent', color: sec.logo_size===sz?C.teal:C.muted, fontSize: '10px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                  {sz.toUpperCase()}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '10px', fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Text Align</div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {(['center','left'] as const).map(ta => (
                                <button key={ta} onClick={() => updSection(selPage.id, sec.id, { text_align: ta })}
                                  style={{ padding: '3px 12px', borderRadius: '5px', border: `1px solid ${sec.text_align===ta?C.teal:C.border}`, background: sec.text_align===ta?C.teal+'18':'transparent', color: sec.text_align===ta?C.teal:C.muted, fontSize: '10px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                  {ta}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '10px', fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                              Overlay {sec.overlay_opacity ?? 55}%
                            </div>
                            <input type="range" min={0} max={100} value={sec.overlay_opacity ?? 55}
                              onChange={e => updSection(selPage.id, sec.id, { overlay_opacity: Number(e.target.value) })}
                              style={{ width: '100%', accentColor: C.teal }} />
                          </div>
                          <div style={{ gridColumn: '1/-1' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                              <input type="checkbox" checked={sec.show_venue_badge !== false} onChange={e => updSection(selPage.id, sec.id, { show_venue_badge: e.target.checked })} style={{ accentColor: C.teal }} />
                              <span style={{ fontSize: '11px', color: C.muted }}>Show venue date badge (from Settings)</span>
                            </label>
                          </div>
                          {sec.type === 'hero' && (
                            <>
                              <div style={{ gridColumn: '1/-1' }}>
                                <div style={{ fontSize: '10px', fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Primary CTA</div>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <input value={sec.custom_title ?? ''} onChange={e => updSection(selPage.id, sec.id, { custom_title: e.target.value })}
                                    placeholder="Label (defaults to Settings)"
                                    style={{ width: '140px', padding: '5px 8px', borderRadius: '6px', border: `1px solid ${C.border}`, fontSize: '11px', fontFamily: 'inherit', color: C.text }} />
                                  <input value={sec.custom_body ?? ''} onChange={e => updSection(selPage.id, sec.id, { custom_body: e.target.value })}
                                    placeholder="URL (defaults to Settings)"
                                    style={{ flex: 1, padding: '5px 8px', borderRadius: '6px', border: `1px solid ${C.border}`, fontSize: '11px', fontFamily: 'inherit', color: C.text }} />
                                </div>
                              </div>
                              <div style={{ gridColumn: '1/-1' }}>
                                <div style={{ fontSize: '10px', fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Secondary CTA</div>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <input value={sec.cta2_label ?? ''} onChange={e => updSection(selPage.id, sec.id, { cta2_label: e.target.value })}
                                    placeholder="Label e.g. View Agenda"
                                    style={{ width: '140px', padding: '5px 8px', borderRadius: '6px', border: `1px solid ${C.border}`, fontSize: '11px', fontFamily: 'inherit', color: C.text }} />
                                  <input value={sec.cta2_href ?? ''} onChange={e => updSection(selPage.id, sec.id, { cta2_href: e.target.value })}
                                    placeholder="page-slug or URL"
                                    style={{ flex: 1, padding: '5px 8px', borderRadius: '6px', border: `1px solid ${C.border}`, fontSize: '11px', fontFamily: 'inherit', color: C.text }} />
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {/* Register CTA */}
                      {sec.type === 'register' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <div style={{ gridColumn: '1/-1', fontSize: '10px', fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>CTA Buttons</div>
                          <input value={sec.custom_title ?? ''} onChange={e => updSection(selPage.id, sec.id, { custom_title: e.target.value })}
                            placeholder="Primary label" style={{ padding: '5px 8px', borderRadius: '6px', border: `1px solid ${C.border}`, fontSize: '11px', fontFamily: 'inherit', color: C.text }} />
                          <input value={sec.custom_body ?? ''} onChange={e => updSection(selPage.id, sec.id, { custom_body: e.target.value })}
                            placeholder="Primary URL" style={{ padding: '5px 8px', borderRadius: '6px', border: `1px solid ${C.border}`, fontSize: '11px', fontFamily: 'inherit', color: C.text }} />
                          <input value={sec.cta2_label ?? ''} onChange={e => updSection(selPage.id, sec.id, { cta2_label: e.target.value })}
                            placeholder="Secondary label" style={{ padding: '5px 8px', borderRadius: '6px', border: `1px solid ${C.border}`, fontSize: '11px', fontFamily: 'inherit', color: C.text }} />
                          <input value={sec.cta2_href ?? ''} onChange={e => updSection(selPage.id, sec.id, { cta2_href: e.target.value })}
                            placeholder="Secondary URL / slug" style={{ padding: '5px 8px', borderRadius: '6px', border: `1px solid ${C.border}`, fontSize: '11px', fontFamily: 'inherit', color: C.text }} />
                        </div>
                      )}

                      {/* Text block — layout controls only (content edited in Content > Sections) */}
                      {sec.type === 'text_block' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div>
                            <div style={{ fontSize: '10px', fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>Heading Size</div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {(['h2','h3','h4'] as const).map(hl => (
                                <button key={hl} onClick={() => updSection(selPage.id, sec.id, { heading_level: hl })}
                                  style={{ padding: '5px 14px', borderRadius: '6px', border: `1px solid ${(sec.heading_level??'h2')===hl?C.teal:C.border}`, background: (sec.heading_level??'h2')===hl?C.teal+'18':'transparent', color: (sec.heading_level??'h2')===hl?C.teal:C.muted, fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase' }}>
                                  {hl}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '10px', fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>Body Font Size</div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {[{ v: 'sm', label: 'Small (15px)' }, { v: 'md', label: 'Normal (17px)' }, { v: 'lg', label: 'Large (20px)' }].map(({ v, label }) => (
                                <button key={v} onClick={() => updSection(selPage.id, sec.id, { body_size: v as 'sm'|'md'|'lg' })}
                                  style={{ padding: '5px 10px', borderRadius: '6px', border: `1px solid ${(sec.body_size??'md')===v?C.teal:C.border}`, background: (sec.body_size??'md')===v?C.teal+'18':'transparent', color: (sec.body_size??'md')===v?C.teal:C.muted, fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Testimonials — layout controls only */}
                      {sec.type === 'testimonials' && (() => {
                        const layout = sec.layout ?? 'carousel'
                        const countOpts = layout === 'carousel'
                          ? [{ v: 1, label: '1' }, { v: 2, label: '2' }, { v: 3, label: '3' }]
                          : layout === 'grid'
                          ? [{ v: 3, label: '3' }, { v: 4, label: '4' }, { v: 6, label: '6' }]
                          : []
                        return countOpts.length > 0 ? (
                          <div>
                            <div style={{ fontSize: '10px', fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>
                              {layout === 'carousel' ? 'Visible at a time' : 'Columns'}
                            </div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {countOpts.map(({ v, label }) => (
                                <button key={v} onClick={() => updSection(selPage.id, sec.id, { visible_count: v })}
                                  style={{ padding: '5px 14px', borderRadius: '6px', border: `1px solid ${(sec.visible_count??(layout==='carousel'?1:3))===v?C.teal:C.border}`, background: (sec.visible_count??(layout==='carousel'?1:3))===v?C.teal+'18':'transparent', color: (sec.visible_count??(layout==='carousel'?1:3))===v?C.teal:C.muted, fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null
                      })()}

                      {/* Inline-content indicator */}
                      {CONTENT_TYPES.includes(sec.type) && (
                        <div style={{ padding: '8px 12px', borderRadius: '8px', background: sec.dashboard_editable ? C.purple+'0D' : 'rgba(245,158,11,0.06)', border: `1px solid ${sec.dashboard_editable ? C.purple+'33' : 'rgba(245,158,11,0.2)'}`, fontSize: '11px', color: sec.dashboard_editable ? C.purple : C.amber, fontWeight: 600, lineHeight: 1.4 }}>
                          {sec.dashboard_editable
                            ? 'Content editable in Step 3 > Sections'
                            : 'Enable "Dashboard" toggle above to edit content in Step 3'}
                        </div>
                      )}
                      {/* Dynamic indicator */}
                      {['speakers','agenda','partners','schedule','logo_ticker'].includes(sec.type) && (
                        <div style={{ padding: '6px 10px', borderRadius: '6px', background: `${C.teal}08`, border: `1px solid ${C.teal}20`, fontSize: '10px', color: C.teal, fontWeight: 700 }}>
                          Dynamic — pulls live data from {sec.type === 'speakers' ? 'Speakers' : sec.type === 'agenda' || sec.type === 'schedule' ? 'Agenda' : 'Sponsors'} tab
                        </div>
                      )}
                      {['hero','about','stats','venue','page_hero','media'].includes(sec.type) && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
                          <span style={{ fontSize: '10px', color: C.amber, fontWeight: 700 }}>
                            Static — content lives in Content tab &gt; Event Details
                          </span>
                          <button onClick={() => { setTab('content'); setContentTab('details') }}
                            style={{ padding: '3px 10px', borderRadius: '5px', border: `1px solid ${C.amber}44`, background: `${C.amber}14`, color: C.amber, fontSize: '10px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            Edit Content
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          }

          // ── builder mode banner ──────────────────────────────────────
          const modeBanner = settings.status === 'live' ? (
            <div style={{ marginBottom: '16px', padding: '10px 16px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
              background: builderMode === 'fresh' ? 'rgba(167,139,250,0.08)' : 'rgba(245,158,11,0.08)',
              border: `1px solid ${builderMode === 'fresh' ? 'rgba(167,139,250,0.25)' : 'rgba(245,158,11,0.25)'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: builderMode === 'fresh' ? C.purple : C.amber, flexShrink: 0 }} />
                <span style={{ fontSize: '12px', fontWeight: 600, color: builderMode === 'fresh' ? C.purple : C.amber }}>
                  {builderMode === 'fresh'
                    ? 'Fresh redesign in progress — live site continues to run until you publish'
                    : 'Editing a draft copy — live site is unaffected until you publish'}
                </span>
              </div>
              <button onClick={() => { setShowLiveGuard(true); setPs(null) }}
                style={{ padding: '4px 12px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>
                Discard draft
              </button>
            </div>
          ) : settings.draft_structure ? (
            <div style={{ marginBottom: '16px', padding: '10px 16px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(0,105,92,0.06)', border: `1px solid rgba(0,105,92,0.18)` }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: C.teal, flexShrink: 0 }} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: C.teal }}>Draft in progress — save when ready, then publish in Step 4</span>
            </div>
          ) : null

          return (
            <div>
              {modeBanner}
            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>

              {/* ── Left panel ──────────────────────────────────────────── */}
              <div style={{ width: '256px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* Nav editor */}
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', padding: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Navigation</div>
                  {ps.nav.map((item, idx) => (
                    <div key={item.id} style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px' }}>
                      {/* reorder */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <button onClick={() => navMove(idx, -1)} disabled={idx===0} style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:'3px', cursor:idx===0?'default':'pointer', padding:'1px 4px', fontSize:'7px', color:C.muted, opacity:idx===0?0.3:1 }}>▲</button>
                        <button onClick={() => navMove(idx, 1)} disabled={idx===ps.nav.length-1} style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:'3px', cursor:idx===ps.nav.length-1?'default':'pointer', padding:'1px 4px', fontSize:'7px', color:C.muted, opacity:idx===ps.nav.length-1?0.3:1 }}>▼</button>
                      </div>
                      {/* label */}
                      <input value={item.label} onChange={e => navSet(idx, { label: e.target.value })}
                        style={{ flex: 1, padding: '5px 8px', borderRadius: '6px', border: `1px solid ${C.border}`, fontSize: '12px', fontFamily: 'inherit', color: C.text, minWidth: 0 }} />
                      {/* cta toggle */}
                      <button onClick={() => navSet(idx, { type: item.type === 'cta' ? 'link' : 'cta' })}
                        title="Toggle CTA style"
                        style={{ padding: '4px 7px', borderRadius: '5px', border: `1px solid ${item.type==='cta'?C.amber:C.border}`, background: item.type==='cta'?'rgba(245,158,11,0.12)':'transparent', color: item.type==='cta'?C.amber:C.muted, fontSize: '10px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                        CTA
                      </button>
                      {/* remove */}
                      <button onClick={() => navRemove(idx)}
                        style={{ padding: '4px 7px', borderRadius: '5px', border: `1px solid rgba(255,107,107,0.25)`, background: 'rgba(255,107,107,0.06)', color: C.red, fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>×</button>
                    </div>
                  ))}
                  {/* href editor — small below each */}
                  <div style={{ marginBottom: '10px' }}>
                    {ps.nav.map((item, idx) => (
                      <div key={item.id+'h'} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <div style={{ fontSize: '10px', color: C.muted, width: '60px', textAlign: 'right', flexShrink: 0 }}>{item.label.slice(0,10)}</div>
                        <input value={item.href} onChange={e => navSet(idx, { href: e.target.value })}
                          placeholder="page-slug or #anchor"
                          style={{ flex: 1, padding: '3px 7px', borderRadius: '5px', border: `1px solid ${C.border}`, fontSize: '11px', fontFamily: 'inherit', color: C.text }} />
                      </div>
                    ))}
                  </div>
                  <button onClick={navAdd}
                    style={{ width: '100%', padding: '7px', borderRadius: '7px', border: `1px dashed ${C.border}`, background: 'transparent', color: C.muted, fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    + Add Link
                  </button>
                </div>

                {/* Page list */}
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', padding: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>Pages</div>
                  {ps.pages.map((page, pIdx) => (
                    <div key={page.id} style={{ marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button onClick={() => { setSelPageId(page.id); setOpenDesignId(null) }}
                          style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${selPageId===page.id?C.teal:C.border}`, background: selPageId===page.id?C.teal+'12':'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                          <span style={{ fontSize: '7px', color: selPageId===page.id?C.teal:C.border }}>●</span>
                          <span style={{ fontSize: '13px', fontWeight: selPageId===page.id?700:500, color: selPageId===page.id?C.teal:C.text }}>{page.label}</span>
                          <span style={{ fontSize: '10px', color: C.muted, marginLeft: 'auto' }}>{page.sections.length}</span>
                        </button>
                        <button onClick={() => pageToggleNav(page.id)} title="Show in nav"
                          style={{ padding: '5px 8px', borderRadius: '6px', border: `1px solid ${page.in_nav?C.teal:C.border}`, background: page.in_nav?C.teal+'18':'transparent', color: page.in_nav?C.teal:C.muted, fontSize: '9px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                          NAV
                        </button>
                        {/* remove page (not home) */}
                        {page.id !== 'home' && (
                          <button onClick={() => { if(confirm(`Remove page "${page.label}"?`)) updPages(pgs => pgs.filter(pg => pg.id !== page.id)) }}
                            style={{ padding: '4px 7px', borderRadius: '5px', border: `1px solid rgba(255,107,107,0.25)`, background: 'rgba(255,107,107,0.06)', color: C.red, fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>×</button>
                        )}
                      </div>
                      {/* inline label + slug edit when selected */}
                      {selPageId === page.id && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '6px', paddingLeft: '4px' }}>
                          <input value={page.label} onChange={e => updPages(pgs => pgs.map((pg,i) => i===pIdx ? { ...pg, label: e.target.value } : pg))}
                            placeholder="Page label"
                            style={{ padding: '4px 8px', borderRadius: '5px', border: `1px solid ${C.border}`, fontSize: '11px', fontFamily: 'inherit', color: C.text }} />
                          <input value={page.slug} onChange={e => updPages(pgs => pgs.map((pg,i) => i===pIdx ? { ...pg, slug: e.target.value.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'') } : pg))}
                            placeholder="url-slug"
                            style={{ padding: '4px 8px', borderRadius: '5px', border: `1px solid ${C.border}`, fontSize: '11px', fontFamily: 'inherit', color: C.text }} />
                        </div>
                      )}
                    </div>
                  ))}
                  {/* Add page */}
                  <button onClick={() => {
                    const label = prompt('Page name (e.g. Attend, Ecosystem, Collaborate):')
                    if (!label) return
                    const slug = label.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'')
                    const id   = uid()
                    updPages(pgs => [...pgs, { id, slug, label, in_nav: true, sections: [
                      { id: uid(), type: 'page_hero', enabled: true, design: { bg_type: 'colour', bg_value: settings.theme_primary ?? '#08121D', text_light: true, padding: 'normal', full_width: true } },
                    ]}])
                    setSelPageId(id)
                  }}
                    style={{ width: '100%', marginTop: '8px', padding: '7px', borderRadius: '7px', border: `1px dashed ${C.border}`, background: 'transparent', color: C.muted, fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    + Add Page
                  </button>
                </div>

                {/* Footer editor */}
                {ps.footer && (() => {
                  const ft = ps.footer
                  const [footerOpen, setFooterOpen] = [openDesignId === '__footer__', (v: boolean) => setOpenDesignId(v ? '__footer__' : null)]
                  return (
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', overflow: 'hidden' }}>
                      {/* Header */}
                      <button onClick={() => setFooterOpen(!footerOpen)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round"><rect x="2" y="17" width="20" height="5" rx="1"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="6" y1="7" x2="18" y2="7"/></svg>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '1px' }}>Footer</span>
                        </div>
                        <span style={{ fontSize: '10px', color: C.muted }}>{footerOpen ? '▲' : '▼'}</span>
                      </button>

                      {footerOpen && (
                        <div style={{ borderTop: `1px solid ${C.border}`, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

                          {/* Background + Text */}
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input type="color" value={ft.bg_color || '#0F1923'} onChange={e => updFooter({ bg_color: e.target.value })}
                              style={{ width: '32px', height: '32px', border: 'none', padding: 0, cursor: 'pointer', background: 'none', flexShrink: 0 }} />
                            <input value={ft.bg_color} onChange={e => updFooter({ bg_color: e.target.value })}
                              style={{ width: '82px', padding: '5px 8px', borderRadius: '6px', border: `1px solid ${C.border}`, fontSize: '11px', fontFamily: 'monospace', color: C.text }} />
                            {([true, false] as boolean[]).map(lt => (
                              <button key={String(lt)} onClick={() => updFooter({ text_light: lt })}
                                style={{ flex: 1, padding: '5px 4px', borderRadius: '5px', border: `1px solid ${ft.text_light===lt?C.teal:C.border}`, background: ft.text_light===lt?C.teal+'18':'transparent', color: ft.text_light===lt?C.teal:C.muted, fontSize: '10px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                {lt ? 'Light text' : 'Dark text'}
                              </button>
                            ))}
                          </div>

                          {/* Logo */}
                          <div>
                            <div style={{ fontSize: '10px', fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Logo</div>
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              {(['none','white','primary','horizontal'] as const).map(slot => (
                                <button key={slot} onClick={() => updFooter({ logo_slot: slot })}
                                  style={{ padding: '3px 9px', borderRadius: '5px', border: `1px solid ${ft.logo_slot===slot?C.teal:C.border}`, background: ft.logo_slot===slot?C.teal+'18':'transparent', color: ft.logo_slot===slot?C.teal:C.muted, fontSize: '10px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                  {slot}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Tagline */}
                          <div>
                            <div style={{ fontSize: '10px', fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>Tagline</div>
                            <input value={ft.tagline ?? ''} onChange={e => updFooter({ tagline: e.target.value })}
                              placeholder="Short event description…"
                              style={{ width: '100%', padding: '6px 9px', borderRadius: '6px', border: `1px solid ${C.border}`, fontSize: '12px', fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }} />
                          </div>

                          {/* Copyright */}
                          <div>
                            <div style={{ fontSize: '10px', fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>Copyright</div>
                            <input value={ft.copyright ?? ''} onChange={e => updFooter({ copyright: e.target.value })}
                              placeholder="© 2026 Event Name. All rights reserved."
                              style={{ width: '100%', padding: '6px 9px', borderRadius: '6px', border: `1px solid ${C.border}`, fontSize: '12px', fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }} />
                          </div>

                          {/* Social links */}
                          <div>
                            <div style={{ fontSize: '10px', fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Social Links</div>
                            {(['linkedin','twitter','instagram','youtube','facebook'] as const).map(platform => {
                              const social = ft.socials.find(s => s.platform === platform)
                              const icons: Record<string, string> = { linkedin: 'in', twitter: 'X', instagram: 'ig', youtube: 'yt', facebook: 'fb' }
                              return (
                                <div key={platform} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                  <span style={{ width: '22px', height: '22px', borderRadius: '4px', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 900, color: C.muted, flexShrink: 0 }}>{icons[platform]}</span>
                                  <input value={social?.url ?? ''} onChange={e => {
                                    const url = e.target.value
                                    setPs(p => {
                                      if (!p) return p
                                      const existing = p.footer.socials.find(s => s.platform === platform)
                                      const socials = existing
                                        ? p.footer.socials.map(s => s.platform === platform ? { ...s, url } : s)
                                        : [...p.footer.socials, { platform, url }]
                                      return { ...p, footer: { ...p.footer, socials } }
                                    })
                                  }}
                                    placeholder={`https://${platform}.com/...`}
                                    style={{ flex: 1, padding: '5px 8px', borderRadius: '6px', border: `1px solid ${C.border}`, fontSize: '11px', fontFamily: 'inherit', color: C.text }} />
                                </div>
                              )
                            })}
                          </div>

                          {/* Footer columns */}
                          <div>
                            <div style={{ fontSize: '10px', fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Link Columns</div>
                            {ft.columns.map(col => (
                              <div key={col.id} style={{ marginBottom: '12px', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, background: C.bg }}>
                                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', alignItems: 'center' }}>
                                  <input value={col.heading} onChange={e => updFooterCol(col.id, { heading: e.target.value })}
                                    placeholder="Column heading"
                                    style={{ flex: 1, padding: '4px 8px', borderRadius: '5px', border: `1px solid ${C.border}`, fontSize: '12px', fontWeight: 700, fontFamily: 'inherit', color: C.text, background: C.surface }} />
                                  <button onClick={() => removeFooterCol(col.id)}
                                    style={{ padding: '3px 7px', borderRadius: '5px', border: `1px solid rgba(255,107,107,0.25)`, background: 'rgba(255,107,107,0.06)', color: C.red, fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>×</button>
                                </div>
                                {col.links.map(lnk => (
                                  <div key={lnk.id} style={{ display: 'flex', gap: '4px', marginBottom: '5px' }}>
                                    <input value={lnk.label} onChange={e => updFooterLink(col.id, lnk.id, { label: e.target.value })}
                                      placeholder="Label" style={{ width: '80px', padding: '4px 7px', borderRadius: '5px', border: `1px solid ${C.border}`, fontSize: '11px', fontFamily: 'inherit', color: C.text, background: C.surface }} />
                                    <input value={lnk.href} onChange={e => updFooterLink(col.id, lnk.id, { href: e.target.value })}
                                      placeholder="page-slug or URL" style={{ flex: 1, padding: '4px 7px', borderRadius: '5px', border: `1px solid ${C.border}`, fontSize: '11px', fontFamily: 'inherit', color: C.text, background: C.surface }} />
                                    <button onClick={() => removeFooterLink(col.id, lnk.id)}
                                      style={{ padding: '3px 6px', borderRadius: '4px', border: `1px solid rgba(255,107,107,0.2)`, background: 'transparent', color: C.red, fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>×</button>
                                  </div>
                                ))}
                                <button onClick={() => addFooterLink(col.id)}
                                  style={{ width: '100%', marginTop: '4px', padding: '4px', borderRadius: '5px', border: `1px dashed ${C.border}`, background: 'transparent', color: C.muted, fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>
                                  + Add Link
                                </button>
                              </div>
                            ))}
                            <button onClick={addFooterCol}
                              style={{ width: '100%', padding: '6px', borderRadius: '7px', border: `1px dashed ${C.border}`, background: 'transparent', color: C.muted, fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                              + Add Column
                            </button>
                          </div>

                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Save button */}
                <button onClick={saveBuilder} disabled={savingBuilder}
                  style={{ padding: '11px', borderRadius: '10px', border: 'none', background: C.green, color: C.text, fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', opacity: savingBuilder?0.6:1, width: '100%' }}>
                  {savingBuilder ? 'Saving…' : 'Save Structure'}
                </button>
              </div>

              {/* ── Right panel ─────────────────────────────────────────── */}
              <div style={{ flex: 1 }}>
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', padding: '20px' }}>
                  {/* Page header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 800, color: C.text }}>{selPage?.label}</div>
                      <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>
                        {selPage?.slug ? `/events/${settings.slug}/${selPage.slug}` : `/events/${settings.slug ?? '…'}`}
                        {' · '}{selPage?.sections.length} section{selPage?.sections.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <button onClick={() => setAddSecOpen(o => !o)}
                        style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: C.text, color: C.green, fontSize: '12px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                        + Add Section
                      </button>
                      {addSecOpen && (
                        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.14)', zIndex: 50, width: '260px', padding: '8px', maxHeight: '480px', overflowY: 'auto' }}>
                          {([
                            { label: 'Core Sections', tag: 'static', color: C.teal },
                            { label: 'Dynamic Data', tag: 'dynamic', color: C.purple },
                            { label: 'Media & Embeds', tag: 'inline', color: C.amber },
                            { label: 'Auto', tag: 'auto', color: C.muted },
                          ] as { label: string; tag: string; color: string }[]).map(group => {
                            const items = SECTION_TYPES.filter(st => st.tag === group.tag)
                            if (!items.length) return null
                            return (
                              <div key={group.tag}>
                                <div style={{ fontSize: '9px', fontWeight: 900, color: group.color, textTransform: 'uppercase', letterSpacing: '1.2px', padding: '8px 12px 4px', opacity: 0.8 }}>{group.label}</div>
                                {items.map(st => (
                                  <button key={st.type} onClick={() => secAdd(selPage.id, st.type)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '7px 12px', borderRadius: '7px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                                    onMouseEnter={e => (e.currentTarget.style.background = '#F0F4F8')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                    <span style={{ fontSize: '13px', color: group.color, width: '22px', flexShrink: 0 }}>{st.icon}</span>
                                    <div>
                                      <div style={{ fontSize: '12px', color: C.text, fontWeight: 600 }}>{st.label}</div>
                                      <div style={{ fontSize: '10px', color: C.muted, marginTop: '1px' }}>
                                        {st.tag === 'static'  && 'Content set in Content tab'}
                                        {st.tag === 'dynamic' && 'Pulls live data from database'}
                                        {st.tag === 'inline'  && 'Editable directly here'}
                                        {st.tag === 'auto'    && 'Counts down to event date'}
                                      </div>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sections */}
                  {selPage?.sections.length === 0 && (
                    <div style={{ padding: '40px', textAlign: 'center', color: C.muted, fontSize: '13px', border: `2px dashed ${C.border}`, borderRadius: '12px' }}>
                      No sections yet — click &ldquo;+ Add Section&rdquo; to start building this page.
                    </div>
                  )}
                  {selPage?.sections.map((sec, sIdx) => secRow(sec, sIdx))}
                </div>
              </div>
            </div>
            </div>
          )
        })()}


        {/* ── SETTINGS ─────────────────────────────────────────────────── */}
        {tab === 'content' && (
          /* ── Content sub-tab bar ──────────────────────────────────────── */
          <div style={{ display: 'flex', gap: '4px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '5px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {([
              { id: 'details',  label: 'Event Details' },
              { id: 'sections', label: 'Page Sections' },
              { id: 'speakers', label: `Speakers${speakers.length ? ` (${speakers.length})` : ''}` },
              { id: 'agenda',   label: `Agenda${agenda.length   ? ` (${agenda.length})`   : ''}` },
              { id: 'sponsors', label: `Sponsors${sponsors.length ? ` (${sponsors.length})` : ''}` },
              { id: 'team',     label: `Team${team.length ? ` (${team.length})` : ''}` },
            ] as { id: ContentTab; label: string }[]).map(ct => (
              <button key={ct.id} onClick={() => setContentTab(ct.id)}
                style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: contentTab === ct.id ? C.text : 'transparent', color: contentTab === ct.id ? C.green : C.muted, fontSize: '12px', fontWeight: contentTab === ct.id ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                {ct.label}
              </button>
            ))}
          </div>
        )}

        {tab === 'content' && contentTab === 'details' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>

            {/* Hero */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: C.muted, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '18px' }}>Hero</div>
              <div style={{ display: 'grid', gap: '14px' }}>
                <Field label="Headline" value={settings.hero_headline ?? ''} onChange={SET('hero_headline')} placeholder="Vault 2047 — India's Cybersecurity Summit" />
                <Field label="Subheadline" value={settings.hero_subheadline ?? ''} onChange={SET('hero_subheadline')} rows={2} placeholder="500+ CISOs. 100+ Speakers. Mumbai, 2026." />
                <div style={g2}>
                  <Field label="CTA Label" value={settings.hero_cta_label ?? ''} onChange={SET('hero_cta_label')} placeholder="Register Now" />
                  <Field label="CTA URL" value={settings.hero_cta_url ?? ''} onChange={SET('hero_cta_url')} placeholder="https://konfhub.com/..." />
                </div>
                <ImageUpload label="Background Image" value={settings.hero_bg_url ?? null} eventId={eventId} section="hero_bg" onUpload={v => setSettings(s => ({ ...s, hero_bg_url: v }))} />
                <Field label="Background Video URL (mp4, optional)" value={settings.hero_video_url ?? ''} onChange={SET('hero_video_url')} placeholder="https://..." />
              </div>
            </div>

            {/* Stats + Venue */}
            <div style={{ display: 'grid', gap: '20px' }}>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: C.muted, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '18px' }}>Stats Bar</div>
                <div style={g2}>
                  <Field label="Attendees" value={settings.stat_attendees ?? ''} onChange={SET('stat_attendees')} placeholder="2000+" />
                  <Field label="Speakers" value={settings.stat_speakers ?? ''} onChange={SET('stat_speakers')} placeholder="100+" />
                  <Field label="Exhibitors" value={settings.stat_exhibitors ?? ''} onChange={SET('stat_exhibitors')} placeholder="50+" />
                  <Field label="Countries" value={settings.stat_countries ?? ''} onChange={SET('stat_countries')} placeholder="25+" />
                </div>
              </div>

              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: C.muted, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '18px' }}>Venue</div>
                <div style={{ display: 'grid', gap: '12px' }}>
                  <div style={g2}>
                    <Field label="Venue Name" value={settings.venue_name ?? ''} onChange={SET('venue_name')} placeholder="NCPA, Mumbai" />
                    <Field label="City" value={settings.venue_city ?? ''} onChange={SET('venue_city')} placeholder="Mumbai" />
                  </div>
                  <Field label="Address" value={settings.venue_address ?? ''} onChange={SET('venue_address')} placeholder="Marine Lines, Mumbai 400 020" />
                  <Field label="Date Display" value={settings.venue_date_display ?? ''} onChange={SET('venue_date_display')} placeholder="14–15 September 2026, Mumbai" />
                </div>
              </div>
            </div>

            {/* About */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: C.muted, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '18px' }}>About</div>
              <div style={{ display: 'grid', gap: '12px' }}>
                <Field label="Title" value={settings.about_title ?? ''} onChange={SET('about_title')} placeholder="About Vault 2047" />
                <Field label="Body" value={settings.about_body ?? ''} onChange={SET('about_body')} rows={4} placeholder="Vault 2047 is India's premier…" />
              </div>
            </div>

            {/* Theme + Slug */}
            <div style={{ display: 'grid', gap: '20px' }}>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: C.muted, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '18px' }}>Theme</div>
                <div style={{ display: 'grid', gap: '12px' }}>
                  {[['Primary (bg)', 'theme_primary'], ['Accent (orange)', 'theme_accent'], ['Secondary (teal)', 'theme_teal']] .map(([label, key]) => (
                    <div key={key} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input type="color" value={(settings as Record<string, string>)[key] ?? '#080A0C'} onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))}
                        style={{ width: '36px', height: '32px', border: 'none', background: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '11px', color: C.muted, marginBottom: '3px', textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
                        <input value={(settings as Record<string, string>)[key] ?? ''} onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))}
                          style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: `1px solid ${C.border}`, fontSize: '12px', fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: C.muted, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '18px' }}>URL Slug</div>
                <Field label="Slug" value={settings.slug ?? ''} onChange={SET('slug')} placeholder="vault-2047-mumbai-2026" />
                {settings.slug && <div style={{ fontSize: '11px', color: C.muted, marginTop: '6px' }}>/events/{settings.slug}</div>}
              </div>
            </div>

            {/* KonfHub */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px', gridColumn: '1/-1' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: C.muted, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '18px' }}>KonfHub Integration</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '14px' }}>
                <Field label="KonfHub Event ID" value={settings.konfhub_event_id ?? ''} onChange={SET('konfhub_event_id')} placeholder="12345" />
                <Field label="KonfHub API Key" value={settings.konfhub_api_key ?? ''} onChange={SET('konfhub_api_key')} placeholder="kh_live_..." />
                <Field label="Speaker Ticket ID" value={settings.konfhub_speaker_ticket ?? ''} onChange={SET('konfhub_speaker_ticket')} placeholder="100841" />
                <Field label="Partner Ticket ID" value={settings.konfhub_partner_ticket ?? ''} onChange={SET('konfhub_partner_ticket')} placeholder="100842" />
              </div>
              <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(167,139,250,0.06)', border: `1px solid rgba(167,139,250,0.18)`, fontSize: '12px', color: C.muted }}>
                Public API: <code style={{ fontSize: '11px', background: 'rgba(0,0,0,0.06)', padding: '2px 6px', borderRadius: '4px' }}>/api/public/event/{settings.slug || '{slug}'}</code>
                {' '}· Speakers: <code style={{ fontSize: '11px', background: 'rgba(0,0,0,0.06)', padding: '2px 6px', borderRadius: '4px' }}>/api/public/event/{settings.slug || '{slug}'}?section=speakers</code>
              </div>
            </div>

            {/* Save button */}
            <div style={{ gridColumn: '1/-1', display: 'flex', gap: '10px' }}>
              <button onClick={saveSettings} disabled={savingSettings}
                style={{ padding: '12px 28px', borderRadius: '10px', border: 'none', background: C.green, color: C.text, fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', opacity: savingSettings ? 0.6 : 1 }}>
                {savingSettings ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          </div>
        )}

        {/* ── CONTENT > SECTIONS ───────────────────────────────────────── */}
        {tab === 'content' && contentTab === 'sections' && ps && (() => {
          const SECTION_LABELS: Record<string, string> = {
            text_block: 'Text Block', testimonials: 'Testimonials', faq: 'FAQ',
            gallery: 'Gallery', video_embed: 'Video Embed', countdown: 'Countdown', cta_banner: 'CTA Banner',
          }
          const dashPages = ps.pages.filter(pg => pg.sections.some(s => s.dashboard_editable))
          const cspId = contentSecPageId
          const cspPage = dashPages.find(p => p.id === cspId) ?? dashPages[0]
          const dashSections = cspPage?.sections.filter(s => s.dashboard_editable) ?? []

          function secContentEditor(pg: typeof cspPage, sec: (typeof dashSections)[0]) {
            if (!pg || !sec) return null
            const pid = pg.id, sid = sec.id
            const inp = (val: string, ph: string, key: 'custom_title'|'custom_body'|'video_url') => (
              <input value={val} onChange={e => updSection(pid, sid, { [key]: e.target.value })}
                placeholder={ph} style={{ width:'100%', padding:'7px 10px', borderRadius:'6px', border:`1px solid ${C.border}`, fontSize:'13px', fontFamily:'inherit', color:C.text, boxSizing:'border-box' }} />
            )
            return (
              <div key={sec.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', padding: '20px', marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: C.purple, textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: '14px' }}>
                  {SECTION_LABELS[sec.type] ?? sec.type}
                </div>

                {sec.type === 'text_block' && (
                  <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                    {inp(sec.custom_title ?? '', 'Section heading', 'custom_title')}
                    <textarea value={sec.custom_body ?? ''} onChange={e => updSection(pid, sid, { custom_body: e.target.value })}
                      placeholder="Body text..." rows={5} style={{ width:'100%', padding:'7px 10px', borderRadius:'6px', border:`1px solid ${C.border}`, fontSize:'13px', fontFamily:'inherit', color:C.text, resize:'vertical', boxSizing:'border-box' }} />
                  </div>
                )}

                {sec.type === 'video_embed' && (
                  <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                    {inp(sec.custom_title ?? '', 'Section heading (optional)', 'custom_title')}
                    {inp(sec.video_url ?? '', 'YouTube or Vimeo URL', 'video_url')}
                  </div>
                )}

                {sec.type === 'countdown' && (
                  <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                    {inp(sec.custom_title ?? '', 'Heading e.g. Event Starts In', 'custom_title')}
                    <input type="datetime-local" value={sec.custom_body ?? ''} onChange={e => updSection(pid, sid, { custom_body: e.target.value })}
                      style={{ padding:'7px 10px', borderRadius:'6px', border:`1px solid ${C.border}`, fontSize:'13px', fontFamily:'inherit', color:C.text }} />
                    <div style={{ fontSize:'11px', color:C.muted }}>Leave blank to use event date from Event Details</div>
                  </div>
                )}

                {sec.type === 'testimonials' && (() => {
                  const items = sec.items ?? []
                  return (
                    <div>
                      {inp(sec.custom_title ?? '', 'Section heading', 'custom_title')}
                      <div style={{ marginTop:'12px', display:'flex', flexDirection:'column', gap:'8px' }}>
                        {items.map(item => (
                          <div key={item.id} style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:'10px', padding:'14px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                            <textarea value={item.quote??''} onChange={e => patchItem(pid,sid,item.id,{quote:e.target.value})}
                              placeholder="Quote..." rows={2} style={{ gridColumn:'1/-1', padding:'6px 9px', borderRadius:'6px', border:`1px solid ${C.border}`, fontSize:'13px', fontFamily:'inherit', color:C.text, resize:'vertical' }} />
                            <input value={item.author??''} onChange={e => patchItem(pid,sid,item.id,{author:e.target.value})} placeholder="Full Name" style={{ padding:'6px 9px', borderRadius:'6px', border:`1px solid ${C.border}`, fontSize:'13px', fontFamily:'inherit', color:C.text }} />
                            <input value={item.role??''} onChange={e => patchItem(pid,sid,item.id,{role:e.target.value})} placeholder="Title, Company" style={{ padding:'6px 9px', borderRadius:'6px', border:`1px solid ${C.border}`, fontSize:'13px', fontFamily:'inherit', color:C.text }} />
                            <input value={item.photo_url??''} onChange={e => patchItem(pid,sid,item.id,{photo_url:e.target.value})} placeholder="Photo URL (optional)" style={{ padding:'6px 9px', borderRadius:'6px', border:`1px solid ${C.border}`, fontSize:'13px', fontFamily:'inherit', color:C.text }} />
                            <button onClick={() => removeItem(pid,sid,item.id)} style={{ padding:'6px', borderRadius:'6px', border:`1px solid rgba(255,107,107,.25)`, background:'rgba(255,107,107,.06)', color:C.red, fontSize:'12px', cursor:'pointer', fontFamily:'inherit' }}>Remove</button>
                          </div>
                        ))}
                        <button onClick={() => addItem(pid,sid,{quote:'',author:'',role:''})}
                          style={{ padding:'9px', borderRadius:'8px', border:`1px dashed ${C.border}`, background:'transparent', color:C.muted, fontSize:'13px', fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                          + Add Testimonial
                        </button>
                      </div>
                    </div>
                  )
                })()}

                {sec.type === 'faq' && (() => {
                  const items = sec.items ?? []
                  return (
                    <div>
                      {inp(sec.custom_title ?? '', 'Section heading (optional)', 'custom_title')}
                      <div style={{ marginTop:'12px', display:'flex', flexDirection:'column', gap:'8px' }}>
                        {items.map(item => (
                          <div key={item.id} style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:'10px', padding:'14px', display:'flex', flexDirection:'column', gap:'8px' }}>
                            <input value={item.question??''} onChange={e => patchItem(pid,sid,item.id,{question:e.target.value})} placeholder="Question" style={{ padding:'6px 9px', borderRadius:'6px', border:`1px solid ${C.border}`, fontSize:'13px', fontFamily:'inherit', color:C.text }} />
                            <textarea value={item.answer??''} onChange={e => patchItem(pid,sid,item.id,{answer:e.target.value})} placeholder="Answer..." rows={3} style={{ padding:'6px 9px', borderRadius:'6px', border:`1px solid ${C.border}`, fontSize:'13px', fontFamily:'inherit', color:C.text, resize:'vertical' }} />
                            <button onClick={() => removeItem(pid,sid,item.id)} style={{ alignSelf:'flex-end', padding:'5px 12px', borderRadius:'6px', border:`1px solid rgba(255,107,107,.25)`, background:'rgba(255,107,107,.06)', color:C.red, fontSize:'12px', cursor:'pointer', fontFamily:'inherit' }}>Remove</button>
                          </div>
                        ))}
                        <button onClick={() => addItem(pid,sid,{question:'',answer:''})}
                          style={{ padding:'9px', borderRadius:'8px', border:`1px dashed ${C.border}`, background:'transparent', color:C.muted, fontSize:'13px', fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                          + Add FAQ
                        </button>
                      </div>
                    </div>
                  )
                })()}

                {sec.type === 'gallery' && (() => {
                  const items = sec.items ?? []
                  return (
                    <div>
                      {inp(sec.custom_title ?? '', 'Section heading (optional)', 'custom_title')}
                      <div style={{ marginTop:'12px', display:'flex', flexDirection:'column', gap:'6px' }}>
                        {items.map(item => (
                          <div key={item.id} style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                            {item.image_url && <div style={{ width:'44px', height:'36px', borderRadius:'6px', backgroundImage:`url(${item.image_url})`, backgroundSize:'cover', flexShrink:0 }} />}
                            <input value={item.image_url??''} onChange={e => patchItem(pid,sid,item.id,{image_url:e.target.value})} placeholder="Image URL" style={{ flex:1, padding:'6px 9px', borderRadius:'6px', border:`1px solid ${C.border}`, fontSize:'13px', fontFamily:'inherit', color:C.text }} />
                            <input value={item.caption??''} onChange={e => patchItem(pid,sid,item.id,{caption:e.target.value})} placeholder="Caption" style={{ width:'120px', padding:'6px 9px', borderRadius:'6px', border:`1px solid ${C.border}`, fontSize:'13px', fontFamily:'inherit', color:C.text }} />
                            <button onClick={() => removeItem(pid,sid,item.id)} style={{ padding:'5px 8px', borderRadius:'5px', border:`1px solid rgba(255,107,107,.25)`, background:'rgba(255,107,107,.06)', color:C.red, fontSize:'14px', cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>×</button>
                          </div>
                        ))}
                        <button onClick={() => addItem(pid,sid,{image_url:'',caption:''})}
                          style={{ padding:'9px', borderRadius:'8px', border:`1px dashed ${C.border}`, background:'transparent', color:C.muted, fontSize:'13px', fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                          + Add Image
                        </button>
                      </div>
                    </div>
                  )
                })()}

                {sec.type === 'cta_banner' && (() => {
                  const items = sec.items ?? []
                  return (
                    <div>
                      {inp(sec.custom_title ?? '', 'Banner heading text', 'custom_title')}
                      <div style={{ marginTop:'12px', fontSize:'10px', fontWeight:800, color:C.muted, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'6px' }}>Buttons</div>
                      <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                        {items.map((item, i) => (
                          <div key={item.id} style={{ display:'flex', gap:'8px' }}>
                            <input value={item.label??''} onChange={e => patchItem(pid,sid,item.id,{label:e.target.value})} placeholder={i===0?'Primary label':'Secondary label'} style={{ width:'160px', padding:'6px 9px', borderRadius:'6px', border:`1px solid ${C.border}`, fontSize:'13px', fontFamily:'inherit', color:C.text }} />
                            <input value={item.href??''} onChange={e => patchItem(pid,sid,item.id,{href:e.target.value})} placeholder="URL or page-slug" style={{ flex:1, padding:'6px 9px', borderRadius:'6px', border:`1px solid ${C.border}`, fontSize:'13px', fontFamily:'inherit', color:C.text }} />
                            <button onClick={() => removeItem(pid,sid,item.id)} style={{ padding:'5px 8px', borderRadius:'5px', border:`1px solid rgba(255,107,107,.25)`, background:'rgba(255,107,107,.06)', color:C.red, fontSize:'14px', cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>×</button>
                          </div>
                        ))}
                        {items.length < 3 && (
                          <button onClick={() => addItem(pid,sid,{label:'',href:''})}
                            style={{ padding:'9px', borderRadius:'8px', border:`1px dashed ${C.border}`, background:'transparent', color:C.muted, fontSize:'13px', fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                            + Add Button
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })()}
              </div>
            )
          }

          return (
            <div style={{ display:'flex', gap:'20px', alignItems:'flex-start' }}>
              {/* Page picker */}
              <div style={{ width:'200px', flexShrink:0 }}>
                <div style={{ fontSize:'10px', fontWeight:800, color:C.muted, textTransform:'uppercase', letterSpacing:'0.7px', marginBottom:'8px' }}>Pages</div>
                {dashPages.length === 0 ? (
                  <div style={{ fontSize:'12px', color:C.muted, padding:'16px', background:C.surface, borderRadius:'10px', border:`1px solid ${C.border}`, lineHeight:1.5 }}>
                    No sections marked as Dashboard-editable yet. Go to <strong>Step 2 Build</strong>, select a section, and enable the <strong>Dashboard</strong> toggle.
                  </div>
                ) : dashPages.map(pg => (
                  <button key={pg.id} onClick={() => setContentSecPageId(pg.id)}
                    style={{ width:'100%', textAlign:'left', display:'block', padding:'9px 12px', borderRadius:'8px', border:`1px solid ${(cspPage?.id===pg.id)?C.purple:C.border}`, background:(cspPage?.id===pg.id)?C.purple+'0D':'transparent', color:(cspPage?.id===pg.id)?C.purple:C.sub, fontSize:'13px', fontWeight:(cspPage?.id===pg.id)?700:500, cursor:'pointer', fontFamily:'inherit', marginBottom:'4px' }}>
                    {pg.label}
                    <span style={{ fontSize:'10px', color:C.muted, display:'block' }}>{pg.sections.filter(s=>s.dashboard_editable).length} section{pg.sections.filter(s=>s.dashboard_editable).length!==1?'s':''}</span>
                  </button>
                ))}
              </div>
              {/* Editors */}
              <div style={{ flex:1 }}>
                {dashSections.length === 0 ? (
                  <div style={{ padding:'40px', textAlign:'center', color:C.muted, fontSize:'13px', border:`2px dashed ${C.border}`, borderRadius:'12px' }}>
                    No dashboard-editable sections on this page.
                  </div>
                ) : (
                  <>
                    {dashSections.map(sec => secContentEditor(cspPage, sec))}
                    <button onClick={saveBuilder} disabled={savingBuilder}
                      style={{ width:'100%', padding:'12px', borderRadius:'10px', border:'none', background:C.green, color:C.text, fontSize:'14px', fontWeight:800, cursor:'pointer', fontFamily:'inherit', opacity:savingBuilder?0.6:1, marginTop:'8px' }}>
                      {savingBuilder ? 'Saving…' : 'Save All Changes'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })()}

        {/* ── SPEAKERS ─────────────────────────────────────────────────── */}
        {tab === 'content' && contentTab === 'speakers' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 800 }}>Speakers</div>
                <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>{speakers.filter(s => s.active).length} active · {speakers.filter(s => s.konfhub_booking_id).length} on KonfHub</div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={bulkKonfhubSync} disabled={syncing}
                  style={{ padding: '9px 18px', borderRadius: '8px', border: `1px solid rgba(167,139,250,0.35)`, background: 'rgba(167,139,250,0.08)', color: C.purple, fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: syncing ? 0.6 : 1 }}>
                  {syncing ? 'Syncing…' : '⟳ Sync to KonfHub'}
                </button>
                <button onClick={() => { setEditSpeaker({ tier: 'speaker', status: 'approved', active: true, dial_code: '+971', country: 'UAE' }); setSpModal(true) }}
                  style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', background: C.green, color: C.text, fontSize: '12px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                  + Add Speaker
                </button>
              </div>
            </div>

            {spLoading ? <div style={{ textAlign: 'center', padding: '48px', fontSize: '13px', color: C.muted }}>Loading…</div> : (
              TIER_ORDER.map(tier => spByTier[tier]?.length > 0 && (
                <div key={tier} style={{ marginBottom: '28px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: C.muted, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '10px' }}>{tier}</div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', overflow: 'hidden' }}>
                    {spByTier[tier].map((sp, i) => (
                      <div key={sp.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 20px', borderBottom: i < spByTier[tier].length - 1 ? `1px solid ${C.border}` : 'none' }}>
                        {sp.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={sp.photo_url} alt={sp.name} style={{ width: '40px', height: '40px', borderRadius: '20px', objectFit: 'cover', flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: '40px', height: '40px', borderRadius: '20px', background: '#E07B2C22', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 800, color: '#E07B2C' }}>{sp.name.charAt(0)}</div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '14px', color: C.text }}>{sp.name}</div>
                          <div style={{ fontSize: '12px', color: C.muted }}>{[sp.role, sp.company].filter(Boolean).join(' · ')}</div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                          <StatusDot booking={sp.konfhub_booking_id} />
                          <Tag color={sp.status === 'approved' ? C.teal : sp.status === 'rejected' ? C.red : C.amber}>{sp.status}</Tag>
                          {!sp.active && <Tag color={C.muted}>hidden</Tag>}
                          {sp.konfhub_booking_id && <Tag color="#22C55E">KonfHub ✓</Tag>}
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                          <button onClick={() => { setEditSpeaker(sp); setSpModal(true) }}
                            style={{ padding: '5px 12px', borderRadius: '6px', border: `1px solid ${C.border}`, background: '#F8FAFF', color: C.sub, fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
                          <button onClick={() => deleteSpeaker(sp.id)}
                            style={{ padding: '5px 10px', borderRadius: '6px', border: `1px solid rgba(255,107,107,0.3)`, background: 'rgba(255,107,107,0.08)', color: C.red, fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
            {!spLoading && speakers.length === 0 && (
              <div style={{ textAlign: 'center', padding: '64px', color: C.muted, fontSize: '13px', background: C.surface, borderRadius: '14px', border: `1px dashed ${C.border}` }}>
                No speakers yet — click &ldquo;+ Add Speaker&rdquo; to start
              </div>
            )}
          </div>
        )}

        {/* ── AGENDA ───────────────────────────────────────────────────── */}
        {tab === 'content' && contentTab === 'agenda' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 800 }}>Agenda</div>
                <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>{agenda.length} sessions across {Object.keys(agByDay).length} day(s)</div>
              </div>
              <button onClick={() => { setEditAgenda({ day: 1, type: 'session', active: true }); setAgModal(true) }}
                style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', background: C.green, color: C.text, fontSize: '12px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                + Add Session
              </button>
            </div>

            {agLoading ? <div style={{ textAlign: 'center', padding: '48px', fontSize: '13px', color: C.muted }}>Loading…</div> : (
              Object.entries(agByDay).map(([day, items]) => (
                <div key={day} style={{ marginBottom: '28px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: C.muted, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '10px' }}>Day {day}</div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', overflow: 'hidden' }}>
                    {items.map((ag, i) => (
                      <div key={ag.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 20px', borderBottom: i < items.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                        <div style={{ width: '88px', fontSize: '12px', fontWeight: 700, color: C.teal, flexShrink: 0 }}>{ag.time_slot ?? '–'}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '14px' }}>{ag.title}</div>
                          {ag.speaker_name && <div style={{ fontSize: '12px', color: C.muted }}>{ag.speaker_name}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                          <Tag color={C.sub}>{ag.type}</Tag>
                          {ag.track && <Tag color={C.purple}>{ag.track}</Tag>}
                          {!ag.active && <Tag color={C.muted}>hidden</Tag>}
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                          <button onClick={() => { setEditAgenda(ag); setAgModal(true) }}
                            style={{ padding: '5px 12px', borderRadius: '6px', border: `1px solid ${C.border}`, background: '#F8FAFF', color: C.sub, fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
                          <button onClick={() => deleteAgenda(ag.id)}
                            style={{ padding: '5px 10px', borderRadius: '6px', border: `1px solid rgba(255,107,107,0.3)`, background: 'rgba(255,107,107,0.08)', color: C.red, fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
            {!agLoading && agenda.length === 0 && (
              <div style={{ textAlign: 'center', padding: '64px', color: C.muted, fontSize: '13px', background: C.surface, borderRadius: '14px', border: `1px dashed ${C.border}` }}>
                No sessions yet — click &ldquo;+ Add Session&rdquo; to start
              </div>
            )}
          </div>
        )}

        {/* ── SPONSORS ─────────────────────────────────────────────────── */}
        {tab === 'content' && contentTab === 'sponsors' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 800 }}>Sponsors &amp; Partners</div>
                <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>{sponsors.length} total</div>
              </div>
              <button onClick={() => { setEditSponsor({ tier: 'gold', active: true }); setSpnModal(true) }}
                style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', background: C.green, color: C.text, fontSize: '12px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                + Add Sponsor
              </button>
            </div>

            {spnLoading ? <div style={{ textAlign: 'center', padding: '48px', fontSize: '13px', color: C.muted }}>Loading…</div> : (
              SPONSOR_TIER_ORDER.map(tier => spnByTier[tier]?.length > 0 && (
                <div key={tier} style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: C.muted, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '10px' }}>{tier}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: '12px' }}>
                    {spnByTier[tier].map(sp => (
                      <div key={sp.id} style={card}>
                        {sp.logo_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={sp.logo_url} alt={sp.name} style={{ width: '100%', height: '48px', objectFit: 'contain', marginBottom: '10px', objectPosition: 'left' }} />
                        )}
                        <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px' }}>{sp.name}</div>
                        {sp.website_url && <div style={{ fontSize: '11px', color: C.muted, marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sp.website_url}</div>}
                        {!sp.active && <Tag color={C.muted}>hidden</Tag>}
                        <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                          <button onClick={() => { setEditSponsor(sp); setSpnModal(true) }}
                            style={{ flex: 1, padding: '5px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.surface, color: C.sub, fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
                          <button onClick={() => deleteSponsor(sp.id)}
                            style={{ padding: '5px 10px', borderRadius: '6px', border: `1px solid rgba(255,107,107,0.3)`, background: 'rgba(255,107,107,0.08)', color: C.red, fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
            {!spnLoading && sponsors.length === 0 && (
              <div style={{ textAlign: 'center', padding: '64px', color: C.muted, fontSize: '13px', background: C.surface, borderRadius: '14px', border: `1px dashed ${C.border}` }}>
                No sponsors yet — click &ldquo;+ Add Sponsor&rdquo; to start
              </div>
            )}
          </div>
        )}

        {/* ── TEAM ─────────────────────────────────────────────────────── */}
        {tab === 'content' && contentTab === 'team' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 800 }}>Team Dashboard</div>
                <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>Manage who can contribute to this event website.</div>
              </div>
              <button onClick={() => { setEditTeam({ role: 'content', status: 'pending' }); setTeamModal(true) }}
                style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', background: C.green, color: C.text, fontSize: '12px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                + Add Member
              </button>
            </div>

            {/* Role legend */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '24px' }}>
              {[
                { role: 'admin',   color: C.purple, desc: 'Full access — publish, delete, all settings' },
                { role: 'content', color: C.teal,   desc: 'Add/edit speakers and agenda only' },
                { role: 'design',  color: C.amber,  desc: 'Upload logos, patterns, brand assets' },
              ].map(r => (
                <div key={r.role} style={{ padding: '14px 16px', borderRadius: '10px', background: `${r.color}08`, border: `1px solid ${r.color}25` }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: r.color, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{r.role}</div>
                  <div style={{ fontSize: '12px', color: C.muted }}>{r.desc}</div>
                </div>
              ))}
            </div>

            {/* Pending speaker approvals */}
            {speakers.filter(s => s.status === 'pending').length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: C.amber, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px' }}>
                  Pending Approvals ({speakers.filter(s => s.status === 'pending').length})
                </div>
                <div style={{ background: C.surface, border: `1px solid rgba(245,158,11,0.3)`, borderRadius: '14px', overflow: 'hidden' }}>
                  {speakers.filter(s => s.status === 'pending').map((sp, i, arr) => (
                    <div key={sp.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 20px', borderBottom: i < arr.length-1 ? `1px solid ${C.border}` : 'none' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '14px' }}>{sp.name}</div>
                        <div style={{ fontSize: '12px', color: C.muted }}>{[sp.role, sp.company].filter(Boolean).join(' · ')}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={async () => { await fetch(`/api/events/speakers?id=${sp.id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ status: 'approved', active: true }) }); loadSpeakers(); showMsg(`${sp.name} approved.`) }}
                          style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: 'rgba(192,244,60,0.15)', color: C.teal, fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Approve</button>
                        <button onClick={async () => { await fetch(`/api/events/speakers?id=${sp.id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ status: 'rejected' }) }); loadSpeakers(); showMsg(`Rejected.`, false) }}
                          style={{ padding: '6px 14px', borderRadius: '6px', border: `1px solid rgba(255,107,107,0.3)`, background: 'rgba(255,107,107,0.08)', color: C.red, fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Reject</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Team list */}
            {teamLoading ? <div style={{ textAlign: 'center', padding: '48px', fontSize: '13px', color: C.muted }}>Loading…</div>
            : team.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '64px', color: C.muted, fontSize: '13px', background: C.surface, borderRadius: '14px', border: `1px dashed ${C.border}` }}>
                No team members yet
              </div>
            ) : (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', overflow: 'hidden' }}>
                {team.map((m, i) => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 20px', borderBottom: i < team.length-1 ? `1px solid ${C.border}` : 'none' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '18px', background: m.role === 'admin' ? `${C.purple}22` : m.role === 'design' ? `${C.amber}22` : `${C.teal}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 900, color: m.role === 'admin' ? C.purple : m.role === 'design' ? C.amber : C.teal, flexShrink: 0 }}>
                      {(m.name ?? m.email).charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '14px' }}>{m.name ?? m.email}</div>
                      <div style={{ fontSize: '12px', color: C.muted }}>{m.email}</div>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: m.role === 'admin' ? `${C.purple}18` : m.role === 'design' ? `${C.amber}18` : `${C.teal}18`, color: m.role === 'admin' ? C.purple : m.role === 'design' ? C.amber : C.teal }}>{m.role}</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: m.status === 'accepted' ? 'rgba(192,244,60,0.12)' : 'rgba(91,112,128,0.1)', color: m.status === 'accepted' ? C.teal : C.muted }}>{m.status}</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => { setEditTeam(m); setTeamModal(true) }} style={{ padding: '5px 12px', borderRadius: '6px', border: `1px solid ${C.border}`, background: '#F8FAFF', color: C.sub, fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
                      <button onClick={() => deleteTeamMember(m.id)} style={{ padding: '5px 10px', borderRadius: '6px', border: `1px solid rgba(255,107,107,0.3)`, background: 'rgba(255,107,107,0.08)', color: C.red, fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── PUBLISH ──────────────────────────────────────────────────── */}
        {tab === 'publish' && (
          <div style={{ display: 'grid', gap: '20px' }}>

            {/* ── Step 1: Preview ──────────────────────────────────────── */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 900, color: '#fff' }}>1</div>
                  <span style={{ fontSize: '15px', fontWeight: 800, color: C.text }}>Preview & test all links</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {(['desktop','tablet','mobile'] as const).map(d => (
                    <button key={d} onClick={() => setPreviewDevice(d)}
                      style={{ padding: '5px 12px', borderRadius: '7px', border: `1px solid ${previewDevice===d?C.teal:C.border}`, background: previewDevice===d?C.teal+'18':'transparent', color: previewDevice===d?C.teal:C.muted, fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                      {d === 'desktop' ? (
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ display:'block' }}><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                      ) : d === 'tablet' ? (
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ display:'block' }}><rect x="4" y="2" width="16" height="20" rx="2"/><circle cx="12" cy="18" r="1" fill="currentColor"/></svg>
                      ) : (
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ display:'block' }}><rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="18" r="1" fill="currentColor"/></svg>
                      )}
                    </button>
                  ))}
                  {settings.slug && (
                    <a href={`/events/${settings.slug}`} target="_blank" rel="noreferrer"
                      style={{ marginLeft: '6px', padding: '5px 12px', borderRadius: '7px', border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: '11px', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      Open
                    </a>
                  )}
                </div>
              </div>
              {settings.slug ? (
                <div style={{ background: '#0a0a0a', display: 'flex', justifyContent: 'center', padding: previewDevice==='desktop'?'0':'20px 20px 0', minHeight: '600px' }}>
                  <iframe
                    key={previewDevice}
                    src={`/events/${settings.slug}`}
                    style={{
                      width: previewDevice==='desktop' ? '100%' : previewDevice==='tablet' ? '768px' : '390px',
                      height: previewDevice==='mobile' ? '700px' : '600px',
                      border: previewDevice==='desktop' ? 'none' : `1px solid rgba(255,255,255,0.1)`,
                      borderRadius: previewDevice==='desktop' ? 0 : '12px 12px 0 0',
                      display: 'block',
                    }}
                  />
                </div>
              ) : (
                <div style={{ padding: '40px', textAlign: 'center', color: C.muted, fontSize: '13px' }}>
                  Set a URL slug in <strong>Step 3 &gt; Event Details</strong> first.
                </div>
              )}
            </div>

            {/* ── Step 2: Publish ──────────────────────────────────────── */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
                <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#6366F1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 900, color: '#fff' }}>2</div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: C.text }}>Publish to the web</div>
                  <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>
                    {settings.status === 'live'
                      ? `Live${settings.last_published_at ? ` · Published ${new Date(settings.last_published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}`
                      : 'Draft — not yet visible to the public'}
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: '20px', background: settings.status==='live'?'rgba(192,244,60,0.12)':'rgba(91,112,128,0.1)', fontSize: '11px', fontWeight: 700, color: settings.status==='live'?C.teal:C.muted }}>
                  {settings.status === 'live' ? 'LIVE' : 'DRAFT'}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {settings.status !== 'live' && (
                  <button onClick={publishDraft} disabled={publishing}
                    style={{ padding: '10px 22px', borderRadius: '10px', border: 'none', background: C.green, color: C.text, fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', opacity: publishing ? 0.6 : 1 }}>
                    {publishing ? 'Publishing…' : 'Publish Live'}
                  </button>
                )}
                {settings.status === 'live' && settings.draft_structure && (
                  <button onClick={publishDraft} disabled={publishing}
                    style={{ padding: '10px 22px', borderRadius: '10px', border: 'none', background: C.green, color: C.text, fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', opacity: publishing ? 0.6 : 1 }}>
                    {publishing ? 'Publishing…' : 'Replace live with draft'}
                  </button>
                )}
                {settings.status === 'live' && (
                  <button onClick={unpublish} disabled={savingSettings}
                    style={{ padding: '10px 22px', borderRadius: '10px', border: `1px solid rgba(255,107,107,0.3)`, background: 'rgba(255,107,107,0.08)', color: C.red, fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', opacity: savingSettings ? 0.6 : 1 }}>
                    Unpublish
                  </button>
                )}
                {settings.published_snapshot && (
                  <button onClick={rollback} disabled={rollbacking}
                    style={{ padding: '10px 22px', borderRadius: '10px', border: `1px solid ${C.border}`, background: '#F8FAFF', color: C.sub, fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: rollbacking ? 0.6 : 1 }}>
                    {rollbacking ? 'Rolling back…' : 'Rollback to previous'}
                  </button>
                )}
              </div>

              {settings.status === 'live' && !settings.draft_structure && (
                <div style={{ marginTop: '14px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(0,105,92,0.06)', border: `1px solid rgba(0,105,92,0.18)`, fontSize: '12px', color: C.teal }}>
                  Site is live. To make changes, go to Step 2 (Build) and click &ldquo;Edit current site&rdquo; or &ldquo;Start fresh redesign&rdquo;.
                </div>
              )}
            </div>

            {/* ── Step 3: Custom domain via Cloudflare ─────────────────── */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
                <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 900, color: '#fff' }}>3</div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: C.text }}>Connect custom domain</div>
                  <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>Enter your Cloudflare details — we&apos;ll add the DNS record automatically.</div>
                </div>
                {cfStatus === 'ok' && (
                  <div style={{ marginLeft: 'auto', padding: '4px 12px', borderRadius: '20px', background: 'rgba(192,244,60,0.12)', fontSize: '11px', fontWeight: 700, color: C.teal }}>
                    {settings.custom_domain ?? cfDomain}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gap: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>Domain</div>
                    <input value={cfDomain} onChange={e => setCfDomain(e.target.value)}
                      placeholder="vault2047.com or sub.vault2047.com"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '13px', fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>
                      Cloudflare Zone ID
                      <span style={{ fontSize: '10px', fontWeight: 500, marginLeft: '6px', color: C.muted }}>found in CF Dashboard &gt; Overview</span>
                    </div>
                    <input value={cfZoneId} onChange={e => setCfZoneId(e.target.value)}
                      placeholder="abc123def456..."
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '13px', fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>
                    Cloudflare API Token
                    <span style={{ fontSize: '10px', fontWeight: 500, marginLeft: '6px', color: C.muted }}>CF Dashboard &gt; Profile &gt; API Tokens — needs DNS Edit permission. Not stored.</span>
                  </div>
                  <input type="password" value={cfToken} onChange={e => setCfToken(e.target.value)}
                    placeholder="Your Cloudflare API Token"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '13px', fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }} />
                </div>

                {cfStatus === 'error' && (
                  <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.25)', fontSize: '12px', color: C.red }}>
                    {cfMsg}
                  </div>
                )}
                {cfStatus === 'ok' && (
                  <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(192,244,60,0.06)', border: '1px solid rgba(192,244,60,0.2)', fontSize: '12px', color: C.teal }}>
                    {cfMsg || `CNAME record active: ${cfDomain} → taos-discovery.vercel.app`}
                  </div>
                )}

                <button
                  disabled={cfStatus==='connecting' || !cfDomain || !cfZoneId || !cfToken}
                  onClick={async () => {
                    setCfStatus('connecting'); setCfMsg('')
                    try {
                      const r = await fetch('/api/events/cloudflare', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ website_id: settings.id, cf_token: cfToken, cf_zone_id: cfZoneId, domain: cfDomain }),
                      })
                      const j = await r.json()
                      if (!r.ok || j.error) { setCfStatus('error'); setCfMsg(j.error ?? 'Unknown error') }
                      else { setCfStatus('ok'); setCfMsg(j.message); setSettings(s => ({ ...s, custom_domain: cfDomain, cf_zone_id: cfZoneId })) }
                    } catch (e) {
                      setCfStatus('error'); setCfMsg('Network error — please try again')
                    }
                  }}
                  style={{ padding: '11px', borderRadius: '10px', border: 'none', background: cfStatus==='ok'?C.teal+'22':C.green, color: cfStatus==='ok'?C.teal:C.text, fontSize: '13px', fontWeight: 800, cursor: (!cfDomain||!cfZoneId||!cfToken||cfStatus==='connecting')?'default':'pointer', fontFamily: 'inherit', opacity: (!cfDomain||!cfZoneId||!cfToken)?0.5:1, transition: 'all 0.15s' }}>
                  {cfStatus === 'connecting' ? 'Connecting…' : cfStatus === 'ok' ? 'Domain connected — reconnect' : 'Connect Domain Automatically'}
                </button>

                <div style={{ fontSize: '11px', color: C.muted, lineHeight: 1.5, borderTop: `1px solid ${C.border}`, paddingTop: '12px' }}>
                  What happens when you click Connect:
                  <ol style={{ margin: '6px 0 0 16px', padding: 0 }}>
                    <li>A CNAME DNS record is created in your Cloudflare account: <code style={{ background: C.bg, padding: '1px 5px', borderRadius: '3px' }}>{cfDomain || 'yourdomain.com'} → taos-discovery.vercel.app</code></li>
                    <li>Cloudflare proxies and secures the domain (SSL included)</li>
                    <li>Your event website is accessible at <code style={{ background: C.bg, padding: '1px 5px', borderRadius: '3px' }}>https://{cfDomain || 'yourdomain.com'}</code></li>
                  </ol>
                </div>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* ── SPEAKER MODAL ─────────────────────────────────────────────── */}
      {spModal && editSpeaker && (
        <Modal title={editSpeaker.id ? 'Edit Speaker' : 'Add Speaker'} onClose={() => { setSpModal(false); setEditSpeaker(null) }}>
          <div style={{ display: 'grid', gap: '14px' }}>
            <div style={g2}>
              <Field label="Full Name *" value={editSpeaker.name ?? ''} onChange={v => setEditSpeaker(s => ({ ...s, name: v }))} />
              <SelectField label="Tier" value={editSpeaker.tier ?? 'speaker'} onChange={v => setEditSpeaker(s => ({ ...s, tier: v }))}
                options={TIER_ORDER.map(t => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))} />
            </div>
            <div style={g2}>
              <Field label="Title / Role" value={editSpeaker.role ?? ''} onChange={v => setEditSpeaker(s => ({ ...s, role: v }))} placeholder="CISO" />
              <Field label="Company" value={editSpeaker.company ?? ''} onChange={v => setEditSpeaker(s => ({ ...s, company: v }))} placeholder="Acme Corp" />
            </div>
            <Field label="Session Title" value={editSpeaker.session_title ?? ''} onChange={v => setEditSpeaker(s => ({ ...s, session_title: v }))} placeholder="The Future of Zero Trust" />
            <Field label="Bio" value={editSpeaker.bio ?? ''} onChange={v => setEditSpeaker(s => ({ ...s, bio: v }))} rows={3} />
            <Field label="LinkedIn URL" value={editSpeaker.linkedin_url ?? ''} onChange={v => setEditSpeaker(s => ({ ...s, linkedin_url: v }))} placeholder="https://linkedin.com/in/..." />
            <ImageUpload label="Photo" value={editSpeaker.photo_url ?? null} eventId={eventId} section="speaker" onUpload={v => setEditSpeaker(s => ({ ...s, photo_url: v }))} />
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>KonfHub Registration Info</div>
              <div style={g2}>
                <Field label="Email" value={editSpeaker.email ?? ''} onChange={v => setEditSpeaker(s => ({ ...s, email: v }))} type="email" />
                <Field label="Phone" value={editSpeaker.phone ?? ''} onChange={v => setEditSpeaker(s => ({ ...s, phone: v }))} placeholder="9876543210" />
              </div>
              <div style={{ ...g2, marginTop: '10px' }}>
                <Field label="Dial Code" value={editSpeaker.dial_code ?? '+971'} onChange={v => setEditSpeaker(s => ({ ...s, dial_code: v }))} placeholder="+971" />
                <Field label="Country" value={editSpeaker.country ?? ''} onChange={v => setEditSpeaker(s => ({ ...s, country: v }))} placeholder="UAE" />
              </div>
            </div>
            <div style={g2}>
              <SelectField label="Status" value={editSpeaker.status ?? 'approved'} onChange={v => setEditSpeaker(s => ({ ...s, status: v }))}
                options={['pending','approved','rejected'].map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))} />
              <SelectField label="Visible on website" value={editSpeaker.active === false ? 'false' : 'true'} onChange={v => setEditSpeaker(s => ({ ...s, active: v === 'true' }))}
                options={[{ value: 'true', label: 'Yes — visible' }, { value: 'false', label: 'No — hidden' }]} />
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button onClick={saveSpeaker} disabled={savingSp || !editSpeaker.name}
                style={{ flex: 1, padding: '11px', borderRadius: '8px', border: 'none', background: C.green, color: C.text, fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', opacity: savingSp ? 0.6 : 1 }}>
                {savingSp ? 'Saving…' : editSpeaker.id ? 'Save Changes' : 'Add Speaker'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── AGENDA MODAL ──────────────────────────────────────────────── */}
      {agModal && editAgenda && (
        <Modal title={editAgenda.id ? 'Edit Session' : 'Add Session'} onClose={() => { setAgModal(false); setEditAgenda(null) }}>
          <div style={{ display: 'grid', gap: '14px' }}>
            <Field label="Session Title *" value={editAgenda.title ?? ''} onChange={v => setEditAgenda(s => ({ ...s, title: v }))} />
            <div style={g2}>
              <Field label="Day" value={String(editAgenda.day ?? 1)} onChange={v => setEditAgenda(s => ({ ...s, day: Number(v) || 1 }))} type="number" />
              <Field label="Time Slot" value={editAgenda.time_slot ?? ''} onChange={v => setEditAgenda(s => ({ ...s, time_slot: v }))} placeholder="09:00 – 09:45" />
            </div>
            <div style={g2}>
              <SelectField label="Type" value={editAgenda.type ?? 'session'} onChange={v => setEditAgenda(s => ({ ...s, type: v }))}
                options={AGENDA_TYPES.map(t => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))} />
              <Field label="Track (optional)" value={editAgenda.track ?? ''} onChange={v => setEditAgenda(s => ({ ...s, track: v }))} placeholder="AI Security" />
            </div>
            <Field label="Speaker" value={editAgenda.speaker_name ?? ''} onChange={v => setEditAgenda(s => ({ ...s, speaker_name: v }))} placeholder="Jane Doe, CISO at Acme" />
            <Field label="Description" value={editAgenda.description ?? ''} onChange={v => setEditAgenda(s => ({ ...s, description: v }))} rows={3} />
            <SelectField label="Visible" value={editAgenda.active === false ? 'false' : 'true'} onChange={v => setEditAgenda(s => ({ ...s, active: v === 'true' }))}
              options={[{ value: 'true', label: 'Yes — visible' }, { value: 'false', label: 'No — hidden' }]} />
            <button onClick={saveAgenda} disabled={savingAg || !editAgenda.title}
              style={{ padding: '11px', borderRadius: '8px', border: 'none', background: C.green, color: C.text, fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', opacity: savingAg ? 0.6 : 1 }}>
              {savingAg ? 'Saving…' : editAgenda.id ? 'Save Changes' : 'Add Session'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── SPONSOR MODAL ─────────────────────────────────────────────── */}
      {spnModal && editSponsor && (
        <Modal title={editSponsor.id ? 'Edit Sponsor' : 'Add Sponsor'} onClose={() => { setSpnModal(false); setEditSponsor(null) }}>
          <div style={{ display: 'grid', gap: '14px' }}>
            <div style={g2}>
              <Field label="Company Name *" value={editSponsor.name ?? ''} onChange={v => setEditSponsor(s => ({ ...s, name: v }))} />
              <SelectField label="Tier" value={editSponsor.tier ?? 'gold'} onChange={v => setEditSponsor(s => ({ ...s, tier: v }))}
                options={SPONSOR_TIER_ORDER.map(t => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))} />
            </div>
            <Field label="Website URL" value={editSponsor.website_url ?? ''} onChange={v => setEditSponsor(s => ({ ...s, website_url: v }))} placeholder="https://..." />
            <ImageUpload label="Logo" value={editSponsor.logo_url ?? null} eventId={eventId} section="sponsor" onUpload={v => setEditSponsor(s => ({ ...s, logo_url: v }))} />
            <SelectField label="Visible" value={editSponsor.active === false ? 'false' : 'true'} onChange={v => setEditSponsor(s => ({ ...s, active: v === 'true' }))}
              options={[{ value: 'true', label: 'Yes — visible' }, { value: 'false', label: 'No — hidden' }]} />
            <button onClick={saveSponsor} disabled={savingSpn || !editSponsor.name}
              style={{ padding: '11px', borderRadius: '8px', border: 'none', background: C.green, color: C.text, fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', opacity: savingSpn ? 0.6 : 1 }}>
              {savingSpn ? 'Saving…' : editSponsor.id ? 'Save Changes' : 'Add Sponsor'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── TEAM MODAL ────────────────────────────────────────────────── */}
      {teamModal && editTeam && (
        <Modal title={editTeam.id ? 'Edit Team Member' : 'Add Team Member'} onClose={() => { setTeamModal(false); setEditTeam(null) }}>
          <div style={{ display: 'grid', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <Field label="Full Name" value={editTeam.name ?? ''} onChange={v => setEditTeam(s => ({ ...s, name: v }))} placeholder="Jane Smith" />
              <Field label="Email *" value={editTeam.email ?? ''} onChange={v => setEditTeam(s => ({ ...s, email: v }))} type="email" placeholder="jane@company.com" />
            </div>
            <SelectField label="Role" value={editTeam.role ?? 'content'} onChange={v => setEditTeam(s => ({ ...s, role: v }))}
              options={[
                { value: 'content', label: 'Content — add speakers & agenda' },
                { value: 'design',  label: 'Design — upload logos, patterns, images' },
                { value: 'admin',   label: 'Admin — full access' },
              ]} />
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: `${C.teal}08`, border: `1px solid ${C.teal}25`, fontSize: '12px', color: C.muted }}>
              Team members are managed by email. They access their role-specific sections through the event admin panel.
            </div>
            <button onClick={saveTeamMember} disabled={savingTeam || !editTeam.email}
              style={{ padding: '11px', borderRadius: '8px', border: 'none', background: C.green, color: C.text, fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', opacity: savingTeam ? 0.6 : 1 }}>
              {savingTeam ? 'Saving…' : editTeam.id ? 'Save Changes' : 'Add to Team'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
