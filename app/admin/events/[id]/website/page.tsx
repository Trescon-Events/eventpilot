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

type Tab = 'settings' | 'speakers' | 'agenda' | 'sponsors'

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

  const [tab,       setTab]       = useState<Tab>('settings')
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
        <Link href={`/admin/events/${eventId}`} style={{ fontSize: '13px', color: C.text, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          {eventName}
        </Link>
        <span style={{ color: C.sub }}>/</span>
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
        <div style={{ display: 'flex', gap: '4px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '6px', marginBottom: '24px', width: 'fit-content' }}>
          {(['settings', 'speakers', 'agenda', 'sponsors'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: tab === t ? C.text : 'transparent', color: tab === t ? C.green : C.muted, fontSize: '13px', fontWeight: tab === t ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
              {t === 'speakers' ? `Speakers (${speakers.length})` : t === 'agenda' ? `Agenda (${agenda.length})` : t === 'sponsors' ? `Sponsors (${sponsors.length})` : 'Settings'}
            </button>
          ))}
        </div>

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
    </div>
  )
}
