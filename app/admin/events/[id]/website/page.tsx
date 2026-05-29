'use client'

import { useState, useEffect, use, useRef } from 'react'
import Link from 'next/link'

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
type Tab = 'brand' | 'pages' | 'settings' | 'speakers' | 'agenda' | 'sponsors' | 'team'

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

function ImageUpload({ label, value, eventId, section, onUpload }: {
  label: string; value: string | null; eventId: string; section: string
  onUpload: (url: string) => void
}) {
  const [uploading, setUploading] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setUploading(true)
    const form = new FormData()
    form.append('file', file); form.append('event_id', eventId); form.append('section', section)
    const res  = await fetch('/api/events/website/upload', { method: 'POST', body: form })
    const data = await res.json()
    if (res.ok) onUpload(data.url)
    setUploading(false)
  }

  return (
    <div>
      <label style={{ fontSize: '11px', fontWeight: 700, color: C.muted, display: 'block', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</label>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {value && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" style={{ width: '64px', height: '44px', objectFit: 'cover', borderRadius: '6px', border: `1px solid ${C.border}`, flexShrink: 0 }} />
        )}
        <div style={{ flex: 1 }}>
          <input value={value ?? ''} onChange={e => onUpload(e.target.value)} placeholder="https://... or upload →"
            style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '12px', fontFamily: 'inherit', color: C.text, boxSizing: 'border-box', marginBottom: '6px' }} />
          <button onClick={() => ref.current?.click()} disabled={uploading}
            style={{ padding: '5px 12px', borderRadius: '6px', border: `1px solid ${C.border}`, background: '#F8FAFF', color: C.sub, fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: uploading ? 0.6 : 1 }}>
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
          <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        </div>
        {value && <button onClick={() => onUpload('')} style={{ padding: '4px 8px', borderRadius: '6px', border: `1px solid rgba(255,107,107,0.3)`, background: 'rgba(255,107,107,0.08)', color: C.red, fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>×</button>}
      </div>
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

  const [tab,       setTab]       = useState<Tab>('brand')
  const [eventName, setEventName] = useState('')
  const [loading,   setLoading]   = useState(true)
  const [msg,       setMsg]       = useState('')
  const [msgOk,     setMsgOk]     = useState(true)

  // Settings state
  const [settings,     setSettings]     = useState<Partial<WebsiteSettings>>({})
  const [savingSettings, setSavingSettings] = useState(false)

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

  useEffect(() => { if (tab === 'speakers') loadSpeakers() }, [tab])
  useEffect(() => { if (tab === 'agenda')   loadAgenda()   }, [tab])
  useEffect(() => { if (tab === 'sponsors') loadSponsors() }, [tab])
  useEffect(() => { if (tab === 'team')     loadTeam()     }, [tab])
  useEffect(() => { if (settings.page_settings) setPageSettings(settings.page_settings) }, [settings.page_settings])

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
    if (!settings.id) { await saveSettings(); return }
    setSavingSettings(true)
    const newStatus = settings.status === 'live' ? 'draft' : 'live'
    const res = await fetch(`/api/events/website?id=${settings.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) })
    const data = await res.json()
    if (res.ok) { setSettings(s => ({ ...s, status: data.status })); showMsg(data.status === 'live' ? 'Website is now live.' : 'Website set to draft.') }
    else showMsg(data.error ?? 'Failed.', false)
    setSavingSettings(false)
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
          <button onClick={togglePublish} disabled={savingSettings}
            style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: settings.status === 'live' ? 'rgba(255,107,107,0.12)' : C.green, color: settings.status === 'live' ? C.red : C.text, fontSize: '12px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', opacity: savingSettings ? 0.6 : 1 }}>
            {settings.status === 'live' ? 'Unpublish' : 'Publish Live'}
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

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: '4px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '6px', marginBottom: '24px', flexWrap: 'wrap' }}>
          {(['brand','pages','settings','speakers','agenda','sponsors','team'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: tab === t ? C.text : 'transparent', color: tab === t ? C.green : C.muted, fontSize: '13px', fontWeight: tab === t ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit' }}>
              {t === 'speakers' ? `Speakers (${speakers.length})` : t === 'agenda' ? `Agenda (${agenda.length})` : t === 'sponsors' ? `Sponsors (${sponsors.length})` : t === 'team' ? `Team (${team.length})` : t === 'brand' ? 'Brand' : t === 'pages' ? 'Pages' : 'Settings'}
            </button>
          ))}
        </div>

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
                <ImageUpload label="Brand PDF / Guidelines Doc" value={settings.brand_doc_url ?? null} eventId={eventId} section="brand_doc" onUpload={v => setSettings(s => ({ ...s, brand_doc_url: v }))} />
                {settings.brand_doc_url && (
                  <a href={settings.brand_doc_url} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '10px', fontSize: '12px', color: C.teal, fontWeight: 600, textDecoration: 'none' }}>
                    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    View uploaded document
                  </a>
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
              <div style={{ fontSize: '12px', color: C.muted, marginBottom: '16px', paddingLeft: '34px' }}>Enter the exact hex codes from your brand document. The first 3 map directly to the website theme.</div>
              <div style={{ paddingLeft: '34px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '20px' }}>
                  {([
                    { key: 'brand_color_1', label: 'Primary' },
                    { key: 'brand_color_2', label: 'Accent' },
                    { key: 'brand_color_3', label: 'Secondary' },
                    { key: 'brand_color_4', label: 'Colour 4' },
                    { key: 'brand_color_5', label: 'Colour 5' },
                  ] as { key: keyof WebsiteSettings; label: string }[]).map(({ key, label }) => {
                    const val = (settings[key] as string) ?? '#000000'
                    return (
                      <div key={key}>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>{label}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ width: '100%', height: '48px', borderRadius: '8px', background: val, border: `1px solid ${C.border}` }} />
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <input type="color" value={val} onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))}
                              style={{ width: '28px', height: '28px', border: 'none', background: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }} />
                            <input value={val} onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))}
                              style={{ flex: 1, padding: '5px 8px', borderRadius: '6px', border: `1px solid ${C.border}`, fontSize: '11px', fontFamily: 'monospace', color: C.text, minWidth: 0 }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
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
                <div style={{ fontSize: '11px', color: C.muted, marginTop: '8px' }}>Maps Primary → Background, Accent → Buttons/Highlights, Secondary → Teal accents.</div>
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

        {/* ── PAGES ────────────────────────────────────────────────────── */}
        {tab === 'pages' && (() => {
          const SECTION_META: Record<string, { label: string; layouts?: string[]; extras?: { key: string; label: string }[] }> = {
            hero:     { label: 'Hero Banner',         layouts: ['fullscreen','split','minimal'] },
            about:    { label: 'About the Event' },
            stats:    { label: 'Stats Bar' },
            speakers: { label: 'Speakers',            layouts: ['grid','list','featured'], extras: [{ key: 'show_bio', label: 'Show bio' },{ key: 'filter_tier', label: 'Tier filters' }] },
            agenda:   { label: 'Agenda / Programme',  layouts: ['tabs','timeline','table'] },
            partners: { label: 'Sponsors & Partners', layouts: ['logo_wall','card_grid'],  extras: [{ key: 'show_website', label: 'Show website link' }] },
            media:    { label: 'Press & Media',       layouts: ['cards','minimal'] },
            venue:    { label: 'Venue & Location' },
            register: { label: 'Register CTA' },
          }
          const order = pageSettings.order ?? Object.keys(SECTION_META)
          function move(idx: number, dir: -1 | 1) {
            const o = [...order]; const t2 = idx + dir
            if (t2 < 0 || t2 >= o.length) return
            ;[o[idx], o[t2]] = [o[t2], o[idx]]
            setPageSettings(ps => ({ ...ps, order: o }))
          }
          function toggle(key: string, val: boolean) {
            setPageSettings(ps => ({ ...ps, sections: { ...ps.sections, [key]: { ...(ps.sections[key] ?? { enabled: true }), enabled: val } } }))
          }
          function setLayout2(key: string, layout: string) {
            setPageSettings(ps => ({ ...ps, sections: { ...ps.sections, [key]: { ...(ps.sections[key] ?? { enabled: true }), layout } } }))
          }
          function setExtra(key: string, xKey: string, val: boolean) {
            setPageSettings(ps => ({ ...ps, sections: { ...ps.sections, [key]: { ...(ps.sections[key] ?? { enabled: true }), [xKey]: val } } }))
          }
          return (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 800 }}>Page Sections</div>
                  <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>Toggle sections on/off, pick layouts, and set display order with the arrows.</div>
                </div>
                <button onClick={savePageSettings} disabled={savingSettings}
                  style={{ padding: '10px 22px', borderRadius: '8px', border: 'none', background: C.green, color: C.text, fontSize: '12px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', opacity: savingSettings ? 0.6 : 1 }}>
                  {savingSettings ? 'Saving…' : 'Save Page Layout'}
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {order.map((key, idx) => {
                  const meta   = SECTION_META[key]; if (!meta) return null
                  const sec    = pageSettings.sections[key] ?? { enabled: true }
                  const active = sec.enabled !== false
                  return (
                    <div key={key} style={{ background: C.surface, border: `1px solid ${active ? C.teal+'44' : C.border}`, borderRadius: '14px', padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: '14px', opacity: active ? 1 : 0.55, transition: 'all 0.15s' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flexShrink: 0, marginTop: '2px' }}>
                        <button onClick={() => move(idx, -1)} disabled={idx === 0} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: '4px', cursor: idx === 0 ? 'default' : 'pointer', padding: '1px 6px', fontSize: '9px', color: C.muted, opacity: idx === 0 ? 0.3 : 1 }}>▲</button>
                        <button onClick={() => move(idx, 1)} disabled={idx === order.length-1} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: '4px', cursor: idx === order.length-1 ? 'default' : 'pointer', padding: '1px 6px', fontSize: '9px', color: C.muted, opacity: idx === order.length-1 ? 0.3 : 1 }}>▼</button>
                      </div>
                      <button onClick={() => toggle(key, !active)}
                        style={{ width: '38px', height: '22px', borderRadius: '11px', border: 'none', background: active ? C.teal : '#CBD5E1', cursor: 'pointer', position: 'relative', flexShrink: 0, marginTop: '2px', transition: 'background 0.15s' }}>
                        <span style={{ position: 'absolute', top: '3px', left: active ? '19px' : '3px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
                      </button>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: C.text, marginBottom: '8px' }}>{meta.label}</div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                          {meta.layouts && meta.layouts.map(l => (
                            <button key={l} onClick={() => setLayout2(key, l)}
                              style={{ padding: '4px 12px', borderRadius: '6px', border: `1px solid ${sec.layout === l ? C.teal : C.border}`, background: sec.layout === l ? C.teal+'18' : 'transparent', color: sec.layout === l ? C.teal : C.muted, fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                              {l.replace('_',' ')}
                            </button>
                          ))}
                          {meta.extras?.map(ex => (
                            <label key={ex.key} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: C.muted, cursor: 'pointer' }}>
                              <input type="checkbox" checked={(sec as Record<string,unknown>)[ex.key] !== false} onChange={e => setExtra(key, ex.key, e.target.checked)} style={{ accentColor: C.teal }} />
                              {ex.label}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, flexShrink: 0, paddingTop: '2px' }}>{String(idx+1).padStart(2,'0')}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* ── SETTINGS ─────────────────────────────────────────────────── */}
        {tab === 'settings' && (
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

        {/* ── SPEAKERS ─────────────────────────────────────────────────── */}
        {tab === 'speakers' && (
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
        {tab === 'agenda' && (
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
        {tab === 'sponsors' && (
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
        {tab === 'team' && (
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
