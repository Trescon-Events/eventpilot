'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import NavBar, { MOD_EVENTPILOT } from '@/app/components/NavBar'

type Event = { id: string; name: string; city: string; event_date: string | null; type: string }
type Campaign = {
  id: string; name: string; phase: string; status: string; platforms: string[]
  created_at: string; event_id: string | null
  events: Event | null
  content_posts: { count: number }[] | null
}

const PHASE_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pre_event:  { label: 'Pre-Event',  color: '#7C3AED', bg: 'rgba(124,58,237,0.08)',  border: 'rgba(124,58,237,0.2)'  },
  live_week:  { label: 'Live Week',  color: '#166534', bg: 'rgba(192,244,60,0.1)',   border: 'rgba(192,244,60,0.3)'  },
  post_event: { label: 'Post-Event', color: '#00695C', bg: 'rgba(0,165,163,0.08)',   border: 'rgba(0,165,163,0.2)'   },
  always_on:  { label: 'Always On',  color: '#92400E', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.2)'  },
}
const STATUS_CFG: Record<string, { color: string; bg: string }> = {
  planning:  { color: '#6B7280', bg: '#F3F4F6' },
  active:    { color: '#166534', bg: 'rgba(192,244,60,0.12)' },
  paused:    { color: '#92400E', bg: 'rgba(245,158,11,0.1)'  },
  completed: { color: '#00695C', bg: 'rgba(0,165,163,0.1)'   },
}
const PLATFORM_COLOR: Record<string, string> = {
  LinkedIn: '#0A66C2', Instagram: '#E1306C', Facebook: '#1877F2',
  Twitter: '#1D9BF0', YouTube: '#FF0000',
}

/* ── Campaign templates ──────────────────────────────────── */
const TEMPLATES = [
  {
    id: 'pre_event',
    label: 'Pre-Event Campaign',
    desc: 'Build awareness, spotlight speakers, drive registrations before the event.',
    phase: 'pre_event',
    duration_weeks: 4,
    icon: (
      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M22 2 11 13M22 2 15 22 11 13 2 9l20-7z"/>
      </svg>
    ),
    color: '#7C3AED',
    bg: 'rgba(124,58,237,0.06)',
    border: 'rgba(124,58,237,0.2)',
    weeks: ['Building Awareness', 'Speaker Spotlight', 'Engagement & Education', 'Final Push — Register Now'],
  },
  {
    id: 'live_week',
    label: 'Live Week Coverage',
    desc: 'Real-time posts during the event — day coverage, speaker quotes, key moments.',
    phase: 'live_week',
    duration_weeks: 1,
    icon: (
      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
      </svg>
    ),
    color: '#166534',
    bg: 'rgba(192,244,60,0.06)',
    border: 'rgba(192,244,60,0.3)',
    weeks: ['Day 1 — Live Coverage', 'Day 2 — Key Takeaways'],
  },
  {
    id: 'post_event',
    label: 'Post-Event Wrap',
    desc: 'Recap highlights, share testimonials, and keep the conversation alive after the event.',
    phase: 'post_event',
    duration_weeks: 2,
    icon: (
      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
    color: '#00695C',
    bg: 'rgba(0,165,163,0.06)',
    border: 'rgba(0,165,163,0.2)',
    weeks: ['Event Highlights Recap', 'Testimonials & Impact'],
  },
  {
    id: 'always_on',
    label: 'Always On',
    desc: 'Ongoing brand content — thought leadership, team stories, company updates.',
    phase: 'always_on',
    duration_weeks: 4,
    icon: (
      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
      </svg>
    ),
    color: '#92400E',
    bg: 'rgba(245,158,11,0.06)',
    border: 'rgba(245,158,11,0.2)',
    weeks: ['Brand Awareness', 'Thought Leadership', 'Team & Culture', 'CTA & Engagement'],
  },
]

/* ── How it works steps ──────────────────────────────────── */
const HOW_IT_WORKS = [
  { step: '01', title: 'Pick a template', desc: 'Pre-Event, Live Week, Post-Event or Always On', color: '#7C3AED' },
  { step: '02', title: 'Choose your event & platforms', desc: 'LinkedIn, Instagram, Facebook — any mix', color: '#00897B' },
  { step: '03', title: 'AI builds the post schedule', desc: 'Week-by-week plan scaffolded automatically', color: '#00695C' },
  { step: '04', title: 'Generate AI copy per post', desc: 'One click per post or generate the entire campaign', color: '#166534' },
  { step: '05', title: 'Approve & publish', desc: 'Review, request changes, then push live', color: '#92400E' },
]

function ContentHubInner() {
  const searchParams  = useSearchParams()
  const presetEventId = searchParams.get('event_id') ?? 'all'

  const [campaigns,    setCampaigns]    = useState<Campaign[]>([])
  const [events,       setEvents]       = useState<Event[]>([])
  const [loading,      setLoading]      = useState(true)
  const [filterEvent,  setFilterEvent]  = useState(presetEventId)
  const [filterPhase,  setFilterPhase]  = useState('all')
  const [showCreate,   setShowCreate]   = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '', objective: '', phase: 'pre_event', event_id: '',
    platforms: [] as string[], duration_weeks: 4, start_date: '', brand_notes: '',
  })
  const [saving,  setSaving]  = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [campRes, evtRes] = await Promise.all([
      fetch('/api/content/campaigns'),
      fetch('/api/events'),
    ])
    if (campRes.ok) setCampaigns(await campRes.json())
    if (evtRes.ok)  setEvents(await evtRes.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function pickTemplate(tid: string) {
    const t = TEMPLATES.find(t => t.id === tid)!
    setSelectedTemplate(tid)
    setForm(f => ({ ...f, phase: t.phase, duration_weeks: t.duration_weeks, name: '' }))
  }

  function togglePlatform(p: string) {
    setForm(f => ({
      ...f,
      platforms: f.platforms.includes(p) ? f.platforms.filter(x => x !== p) : [...f.platforms, p],
    }))
  }

  async function createCampaign() {
    if (!selectedTemplate)      { setSaveMsg('Choose a template first.'); return }
    if (!form.name.trim())      { setSaveMsg('Give this campaign a name.'); return }
    if (!form.platforms.length) { setSaveMsg('Select at least one platform.'); return }
    setSaving(true); setSaveMsg('')
    const res = await fetch('/api/content/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, event_id: form.event_id || null }),
    })
    const data = await res.json()
    if (!res.ok) { setSaveMsg(data.error ?? 'Failed to create.'); setSaving(false); return }
    setShowCreate(false)
    setSelectedTemplate(null)
    setForm({ name: '', objective: '', phase: 'pre_event', event_id: '', platforms: [], duration_weeks: 4, start_date: '', brand_notes: '' })
    await load()
    setSaving(false)
  }

  function closeCreate() {
    setShowCreate(false)
    setSelectedTemplate(null)
    setSaveMsg('')
    setForm({ name: '', objective: '', phase: 'pre_event', event_id: '', platforms: [], duration_weeks: 4, start_date: '', brand_notes: '' })
  }

  const filtered = campaigns.filter(c => {
    if (filterEvent !== 'all' && c.event_id !== filterEvent) return false
    if (filterPhase !== 'all' && c.phase    !== filterPhase) return false
    return true
  })

  const INP: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: '10px',
    border: '1px solid #DDE8EE', background: '#FFFFFF',
    color: '#0F1923', fontSize: '13px', fontFamily: 'inherit',
    boxSizing: 'border-box', outline: 'none',
  }

  const tmpl = TEMPLATES.find(t => t.id === selectedTemplate)

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFB', color: '#0F1923', fontFamily: 'var(--font-manrope), Manrope, sans-serif' }}>
      <NavBar
        module={MOD_EVENTPILOT}
        subtitle="Content Hub"
        homeHref="/admin/toolkit"
        rightSlot={
          <button onClick={() => setShowCreate(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', borderRadius: '10px', border: 'none', background: '#00A5A3', color: '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Campaign
          </button>
        }
      />

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* ── Page header ── */}
        <div style={{ marginBottom: '36px' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '2.5px', color: '#00695C', textTransform: 'uppercase', marginBottom: '8px' }}>Content Hub</div>
          <h1 style={{ fontSize: '32px', fontWeight: 900, color: '#0F1923', margin: '0 0 10px', letterSpacing: '-0.4px' }}>AI Social Media Campaigns</h1>
          <p style={{ fontSize: '15px', color: '#6B7280', margin: 0, lineHeight: 1.6, maxWidth: '600px' }}>
            Pick an event, choose a campaign template, and let AI generate every social post — week by week. Review, approve, and publish in one place.
          </p>
        </div>

        {/* ── How it works ── */}
        {campaigns.length === 0 && !loading && (
          <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '28px', marginBottom: '36px' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: '20px' }}>How it works — 5 simple steps</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0' }}>
              {HOW_IT_WORKS.map((s, i) => (
                <div key={s.step} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', position: 'relative', padding: '0 12px' }}>
                  {/* Connector line */}
                  {i < HOW_IT_WORKS.length - 1 && (
                    <div style={{ position: 'absolute', top: '20px', left: '50%', width: '100%', height: '2px', background: '#DDE8EE', zIndex: 0 }} />
                  )}
                  {/* Step circle */}
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: s.color, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 900, flexShrink: 0, position: 'relative', zIndex: 1, marginBottom: '12px' }}>
                    {s.step}
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '4px', lineHeight: 1.3 }}>{s.title}</div>
                  <div style={{ fontSize: '12px', color: '#9CA3AF', lineHeight: 1.5 }}>{s.desc}</div>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: '28px' }}>
              <button onClick={() => setShowCreate(true)}
                style={{ padding: '12px 32px', borderRadius: '12px', border: 'none', background: '#00A5A3', color: '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Create Your First Campaign
              </button>
            </div>
          </div>
        )}

        {/* ── Templates strip (always visible) ── */}
        {!showCreate && (
          <div style={{ marginBottom: '28px' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: '14px' }}>Campaign Templates</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
              {TEMPLATES.map(t => (
                <button key={t.id} onClick={() => { setSelectedTemplate(t.id); setForm(f => ({ ...f, phase: t.phase, duration_weeks: t.duration_weeks })); setShowCreate(true) }}
                  style={{ textAlign: 'left', padding: '18px', borderRadius: '14px', border: `1px solid ${t.border}`, background: t.bg, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}>
                  <div style={{ color: t.color, marginBottom: '10px' }}>{t.icon}</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '5px', lineHeight: 1.3 }}>{t.label}</div>
                  <div style={{ fontSize: '12px', color: '#6B7280', lineHeight: 1.5 }}>{t.desc}</div>
                  <div style={{ marginTop: '10px', fontSize: '12px', fontWeight: 700, color: t.color }}>{t.duration_weeks === 1 ? '1 week' : `${t.duration_weeks} weeks`} →</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── New Campaign modal/panel ── */}
        {showCreate && (
          <div style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', marginBottom: '32px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(15,25,35,0.08)' }}>
            {/* Panel header */}
            <div style={{ padding: '20px 28px', borderBottom: '1px solid #DDE8EE', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>New Campaign</div>
                <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '2px' }}>Follow the steps below</div>
              </div>
              <button onClick={closeCreate} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: '4px' }}>
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div style={{ padding: '28px' }}>

              {/* Step 1 — Template */}
              <div style={{ marginBottom: '28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: selectedTemplate ? '#00A5A3' : '#0F1923', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 900, flexShrink: 0 }}>
                    {selectedTemplate ? <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> : '1'}
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>Choose a template</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                  {TEMPLATES.map(t => {
                    const sel = selectedTemplate === t.id
                    return (
                      <button key={t.id} onClick={() => pickTemplate(t.id)}
                        style={{ textAlign: 'left', padding: '14px', borderRadius: '12px', border: `2px solid ${sel ? t.color : '#DDE8EE'}`, background: sel ? t.bg : '#FAFBFC', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}>
                        <div style={{ color: sel ? t.color : '#9CA3AF', marginBottom: '8px' }}>{t.icon}</div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: sel ? '#0F1923' : '#6B7280', lineHeight: 1.3 }}>{t.label}</div>
                        <div style={{ fontSize: '11px', color: sel ? t.color : '#9CA3AF', marginTop: '4px', fontWeight: 700 }}>{t.duration_weeks === 1 ? '1 week' : `${t.duration_weeks} weeks`}</div>
                      </button>
                    )
                  })}
                </div>
                {tmpl && (
                  <div style={{ marginTop: '12px', padding: '12px 16px', background: '#F8FAFB', borderRadius: '10px', border: '1px solid #DDE8EE' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#6B7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>Week plan</div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {tmpl.weeks.map((w, i) => (
                        <span key={i} style={{ fontSize: '12px', fontWeight: 600, color: tmpl.color, background: tmpl.bg, border: `1px solid ${tmpl.border}`, padding: '3px 10px', borderRadius: '16px' }}>
                          Wk {i + 1}: {w}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Step 2 — Event + Name */}
              <div style={{ marginBottom: '28px', opacity: selectedTemplate ? 1 : 0.4, pointerEvents: selectedTemplate ? 'auto' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#0F1923', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 900, flexShrink: 0 }}>2</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>Name it & link an event</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: '5px' }}>Campaign name</label>
                    <input style={INP} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder={tmpl ? `e.g. ${tmpl.label} — World AI Show Dubai` : 'Campaign name'} />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: '5px' }}>Event <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(optional)</span></label>
                    <select style={{ ...INP, background: '#FFFFFF' }} value={form.event_id} onChange={e => setForm(f => ({ ...f, event_id: e.target.value }))}>
                      <option value="">— No specific event —</option>
                      {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}{ev.city ? ` · ${ev.city}` : ''}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: '5px' }}>Start date <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(optional)</span></label>
                    <input type="date" style={{ ...INP, background: '#FFFFFF' }} value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: '5px' }}>Objective <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(optional — helps AI write better copy)</span></label>
                    <input style={INP} value={form.objective} onChange={e => setForm(f => ({ ...f, objective: e.target.value }))}
                      placeholder="e.g. Drive registrations for CIOs and CTOs in the Middle East" />
                  </div>
                </div>
              </div>

              {/* Step 3 — Platforms */}
              <div style={{ marginBottom: '28px', opacity: selectedTemplate ? 1 : 0.4, pointerEvents: selectedTemplate ? 'auto' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#0F1923', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 900, flexShrink: 0 }}>3</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923' }}>Pick your platforms</div>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {Object.entries(PLATFORM_COLOR).map(([p, c]) => {
                    const sel = form.platforms.includes(p)
                    return (
                      <button key={p} onClick={() => togglePlatform(p)}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', borderRadius: '10px', border: `2px solid ${sel ? c : '#DDE8EE'}`, background: sel ? c + '12' : '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: sel ? c : '#DDE8EE', flexShrink: 0 }} />
                        <span style={{ fontSize: '13px', fontWeight: 700, color: sel ? c : '#6B7280' }}>{p}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {saveMsg && <div style={{ fontSize: '13px', color: '#DC2626', marginBottom: '14px', padding: '10px 14px', background: '#FEF2F2', borderRadius: '8px' }}>{saveMsg}</div>}

              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={createCampaign} disabled={saving}
                  style={{ padding: '10px 24px', borderRadius: '10px', border: 'none', background: '#00A5A3', color: '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Creating…' : 'Create Campaign'}
                </button>
                <button onClick={closeCreate}
                  style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#6B7280', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Campaigns list ── */}
        {campaigns.length > 0 && (
          <>
            {/* Filters */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={filterEvent}
                onChange={e => setFilterEvent(e.target.value)}
                style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #DDE8EE', background: '#FFFFFF', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', outline: 'none', minWidth: '200px' }}>
                <option value="all">All Events</option>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </select>
              <div style={{ display: 'flex', gap: '6px' }}>
                {(['all', 'pre_event', 'live_week', 'post_event', 'always_on'] as const).map(ph => {
                  const active = filterPhase === ph
                  const cfg    = ph !== 'all' ? PHASE_CFG[ph] : null
                  return (
                    <button key={ph} onClick={() => setFilterPhase(ph)}
                      style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${active && cfg ? cfg.color : active ? '#00A5A3' : '#DDE8EE'}`, background: active && cfg ? cfg.bg : active ? 'rgba(0,165,163,0.08)' : '#FFFFFF', color: active && cfg ? cfg.color : active ? '#00695C' : '#6B7280', transition: 'all 0.12s' }}>
                      {ph === 'all' ? 'All phases' : PHASE_CFG[ph]?.label}
                    </button>
                  )
                })}
              </div>
              <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#9CA3AF' }}>{filtered.length} campaign{filtered.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Campaign cards */}
            {loading ? (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <div style={{ width: '28px', height: '28px', border: '3px solid #DDE8EE', borderTopColor: '#00A5A3', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 10px' }} />
                <div style={{ fontSize: '13px', color: '#9CA3AF' }}>Loading…</div>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px', background: '#FFFFFF', border: '1px dashed #DDE8EE', borderRadius: '16px' }}>
                <div style={{ fontSize: '13px', color: '#6B7280' }}>No campaigns match the current filters.</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                {filtered.map(c => {
                  const ph  = PHASE_CFG[c.phase]  ?? PHASE_CFG.pre_event
                  const st  = STATUS_CFG[c.status] ?? STATUS_CFG.planning
                  const cnt = (c.content_posts as { count: number }[] | null)?.[0]?.count ?? 0
                  const tmplMatch = TEMPLATES.find(t => t.id === c.phase)

                  return (
                    <div key={c.id} style={{ background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(15,25,35,0.05)', transition: 'border-color 0.12s' }}>
                      <div style={{ height: '4px', background: ph.color }} />
                      <div style={{ padding: '20px' }}>
                        {/* Badges */}
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, padding: '3px 9px', borderRadius: '16px', background: ph.bg, color: ph.color, border: `1px solid ${ph.border}` }}>{ph.label}</span>
                          <span style={{ fontSize: '12px', fontWeight: 600, padding: '3px 9px', borderRadius: '16px', background: st.bg, color: st.color, textTransform: 'capitalize' }}>{c.status}</span>
                          {tmplMatch && <span style={{ fontSize: '11px', color: '#9CA3AF' }}>{tmplMatch.label}</span>}
                        </div>

                        {/* Name */}
                        <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F1923', marginBottom: '5px', lineHeight: 1.35 }}>{c.name}</div>

                        {/* Event */}
                        {c.events && (
                          <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '14px' }}>
                            {c.events.name}{c.events.city ? ` · ${c.events.city}` : ''}
                            {c.events.event_date && ` · ${new Date(c.events.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                          </div>
                        )}

                        {/* Platforms + posts */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                          <div style={{ display: 'flex', gap: '5px' }}>
                            {(c.platforms ?? []).map(p => (
                              <span key={p} title={p} style={{ width: 8, height: 8, borderRadius: '50%', background: PLATFORM_COLOR[p] ?? '#9CA3AF', display: 'inline-block' }} />
                            ))}
                          </div>
                          <span style={{ fontSize: '12px', color: '#9CA3AF' }}>{(c.platforms ?? []).join(', ')}</span>
                          <span style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: 700, color: cnt > 0 ? '#00695C' : '#9CA3AF' }}>{cnt} post{cnt !== 1 ? 's' : ''}</span>
                        </div>

                        <Link href={`/content/campaigns/${c.id}`}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderRadius: '10px', background: 'rgba(0,165,163,0.06)', border: '1px solid rgba(0,165,163,0.15)', color: '#00695C', fontSize: '13px', fontWeight: 700, textDecoration: 'none' }}>
                          Open Campaign
                          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default function ContentHubPage() {
  return (
    <Suspense fallback={<div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#F8FAFB', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ color: '#9CA3AF', fontSize: '13px' }}>Loading…</div></div>}>
      <ContentHubInner />
    </Suspense>
  )
}
