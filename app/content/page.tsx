'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

type Event = { id: string; name: string; city: string; event_date: string | null; type: string }
type Campaign = {
  id: string; name: string; phase: string; status: string; platforms: string[]
  created_at: string; event_id: string | null
  events: Event | null
  content_posts: { count: number }[] | null
}

const PHASE_CFG: Record<string, { label: string; color: string; bg: string }> = {
  pre_event:  { label: 'Pre-Event',   color: '#A78BFA', bg: 'rgba(167,139,250,0.12)' },
  live_week:  { label: 'Live Week',   color: '#C0F43C', bg: 'rgba(192,244,60,0.12)'  },
  post_event: { label: 'Post-Event',  color: '#00A5A3', bg: 'rgba(0,165,163,0.12)'   },
  always_on:  { label: 'Always On',   color: '#F59E0B', bg: 'rgba(245,158,11,0.12)'  },
}
const STATUS_CFG: Record<string, { color: string; bg: string }> = {
  planning:  { color: '#464D53', bg: '#EEF9F9' },
  active:    { color: '#C0F43C',               bg: 'rgba(192,244,60,0.1)'   },
  paused:    { color: '#F59E0B',               bg: 'rgba(245,158,11,0.1)'   },
  completed: { color: '#00A5A3',               bg: 'rgba(0,165,163,0.1)'    },
}
const PLATFORM_COLOR: Record<string, string> = {
  LinkedIn: '#0A66C2', Instagram: '#E1306C', Facebook: '#1877F2',
  Twitter: '#1D9BF0', YouTube: '#FF0000',
}

function ContentHubInner() {
  const searchParams = useSearchParams()
  const presetEventId = searchParams.get('event_id') ?? 'all'

  const [campaigns,    setCampaigns]    = useState<Campaign[]>([])
  const [events,       setEvents]       = useState<Event[]>([])
  const [loading,      setLoading]      = useState(true)
  const [filterEvent,  setFilterEvent]  = useState(presetEventId)
  const [filterPhase,  setFilterPhase]  = useState('all')
  const [showCreate,   setShowCreate]   = useState(false)
  const [form, setForm] = useState({
    name: '', objective: '', phase: 'pre_event',
    event_id: presetEventId !== 'all' ? presetEventId : '',
    platforms: [] as string[], duration_weeks: 4, start_date: '', brand_notes: '',
  })
  const [saving, setSaving] = useState(false)
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

  function togglePlatform(p: string) {
    setForm(f => ({
      ...f,
      platforms: f.platforms.includes(p) ? f.platforms.filter(x => x !== p) : [...f.platforms, p],
    }))
  }

  async function createCampaign() {
    if (!form.name.trim()) { setSaveMsg('Campaign name is required.'); return }
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
    setForm({ name: '', objective: '', phase: 'pre_event', event_id: '', platforms: [], duration_weeks: 4, start_date: '', brand_notes: '' })
    await load()
    setSaving(false)
  }

  const filtered = campaigns.filter(c => {
    if (filterEvent !== 'all' && c.event_id !== filterEvent) return false
    if (filterPhase !== 'all' && c.phase  !== filterPhase)  return false
    return true
  })

  return (
    <div style={{ minHeight: '100vh', background: '#F6FFFE', color: '#1E2124', padding: '40px 48px', fontFamily: 'inherit' }}>
      <style>{`
        .cc-btn { padding: 11px 20px; border-radius: 9px; font-size: 14px; font-weight: 700; cursor: pointer; border: none; font-family: inherit; transition: all 0.15s; }
        .cc-btn-teal { background: #00A5A3; color: white; }
        .cc-btn-teal:hover { background: #00C4C2; }
        .cc-btn-ghost { background: transparent; border: 1px solid #E6EFF0 !important; color: #464D53; }
        .cc-btn-ghost:hover { border-color: rgba(0,165,163,0.3) !important; color: #1E2124; }
        .cc-card { background: #FFFFFF; border: 1px solid #E6EFF0; border-radius: 16px; overflow: hidden; transition: border-color 0.2s; box-shadow: 0 1px 4px rgba(0,165,163,0.06), 0 1px 2px rgba(0,0,0,0.04); }
        .cc-card:hover { border-color: rgba(0,165,163,0.3); }
        .filter-btn { padding: 6px 14px; border-radius: 7px; font-size: 13px; font-weight: 700; cursor: pointer; border: 1px solid #E6EFF0; background: #FFFFFF; color: #464D53; font-family: inherit; transition: all 0.15s; }
        .filter-btn.active { background: #00A5A3; color: white; border-color: #00A5A3; }
        .inp { width: 100%; padding: 9px 12px; border-radius: 9px; border: 1px solid #E6EFF0; background: #FFFFFF; color: #1E2124; font-size: 15px; font-family: inherit; box-sizing: border-box; outline: none; }
        .inp:focus { border-color: rgba(0,165,163,0.4); }
        .plat-chip { display: inline-flex; align-items: center; gap: 5px; padding: 5px 12px; border-radius: 20px; font-size: 13px; font-weight: 700; cursor: pointer; border: 1px solid transparent; transition: all 0.15s; user-select: none; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '32px' }}>
        <div>
          <Link href="/admin" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '13px', color: 'rgba(70,77,83,0.55)', textDecoration: 'none', marginBottom: '12px' }}>
            <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
            Admin
          </Link>
          <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#00A5A3', marginBottom: '6px' }}>Content Engine</div>
          <h1 style={{ fontSize: '30px', fontWeight: 900, color: '#1E2124', margin: 0, letterSpacing: '-0.02em' }}>Content Campaigns</h1>
          <p style={{ fontSize: '15px', color: 'rgba(70,77,83,0.55)', marginTop: '6px' }}>
            Create and manage social media campaigns across all events and platforms.
          </p>
        </div>
        <button className="cc-btn cc-btn-teal" onClick={() => setShowCreate(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: '7px', marginTop: '24px' }}>
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Campaign
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{ background: 'rgba(0,165,163,0.04)', border: '1px solid rgba(0,165,163,0.2)', borderRadius: '16px', padding: '28px', marginBottom: '32px' }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#00A5A3', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '20px' }}>New Campaign</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            {/* Name */}
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(70,77,83,0.55)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Campaign Name</label>
              <input className="inp" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="World AI Show Dubai — Pre-Event Awareness" />
            </div>
            {/* Event */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(70,77,83,0.55)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Event (optional)</label>
              <select className="inp" value={form.event_id} onChange={e => setForm(f => ({ ...f, event_id: e.target.value }))} style={{ background: '#EEF9F9' }}>
                <option value="">— No specific event —</option>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </select>
            </div>
            {/* Phase */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(70,77,83,0.55)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Phase</label>
              <select className="inp" value={form.phase} onChange={e => setForm(f => ({ ...f, phase: e.target.value }))} style={{ background: '#EEF9F9' }}>
                <option value="pre_event">Pre-Event</option>
                <option value="live_week">Live Week</option>
                <option value="post_event">Post-Event</option>
                <option value="always_on">Always On</option>
              </select>
            </div>
            {/* Start date */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(70,77,83,0.55)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Start Date</label>
              <input type="date" className="inp" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} style={{ background: '#EEF9F9' }} />
            </div>
            {/* Duration */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(70,77,83,0.55)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Duration (weeks)</label>
              <select className="inp" value={form.duration_weeks} onChange={e => setForm(f => ({ ...f, duration_weeks: +e.target.value }))} style={{ background: '#EEF9F9' }}>
                {[2,3,4,6,8,12].map(w => <option key={w} value={w}>{w} weeks</option>)}
              </select>
            </div>
            {/* Objective */}
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(70,77,83,0.55)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Objective</label>
              <input className="inp" value={form.objective} onChange={e => setForm(f => ({ ...f, objective: e.target.value }))} placeholder="Drive registrations and build speaker awareness for World AI Show Dubai 2026" />
            </div>
          </div>

          {/* Platforms */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(15,23,42,0.38)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Platforms</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {Object.entries(PLATFORM_COLOR).map(([p, c]) => {
                const sel = form.platforms.includes(p)
                return (
                  <button key={p} className="plat-chip" onClick={() => togglePlatform(p)}
                    style={{ background: sel ? `${c}22` : '#EEF9F9', borderColor: sel ? `${c}55` : '#E6EFF0', color: sel ? c : '#464D53' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: sel ? c : '#B8C5C5' }} />
                    {p}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Brand notes */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(70,77,83,0.55)', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Brand Notes <span style={{ color: 'rgba(70,77,83,0.55)', fontWeight: 400, textTransform: 'none' }}>(optional — AI reads your event brief automatically)</span></label>
            <textarea className="inp" value={form.brand_notes} onChange={e => setForm(f => ({ ...f, brand_notes: e.target.value }))}
              placeholder="Key messages: focus on enterprise AI adoption, not consumer AI. Avoid buzzwords like 'revolutionary'. Target audience: CIOs and CTOs in the Middle East…"
              rows={3} style={{ resize: 'vertical' }} />
          </div>

          {saveMsg && <div style={{ fontSize: '14px', color: '#FF6B6B', marginBottom: '12px' }}>{saveMsg}</div>}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="cc-btn cc-btn-teal" onClick={createCampaign} disabled={saving}>
              {saving ? 'Creating…' : 'Create Campaign'}
            </button>
            <button className="cc-btn cc-btn-ghost" onClick={() => { setShowCreate(false); setSaveMsg('') }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Filters */}
      {(events.length > 0 || campaigns.length > 0) && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(70,77,83,0.55)', letterSpacing: '1px', textTransform: 'uppercase' }}>Event</span>
          <button className={`filter-btn${filterEvent === 'all' ? ' active' : ''}`} onClick={() => setFilterEvent('all')}>All</button>
          {events.map(ev => (
            <button key={ev.id} className={`filter-btn${filterEvent === ev.id ? ' active' : ''}`} onClick={() => setFilterEvent(ev.id)}>
              {ev.name.split(' ').slice(0, 3).join(' ')}
            </button>
          ))}
          <div style={{ width: 1, height: 18, background: '#E6EFF0', margin: '0 4px' }} />
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(70,77,83,0.55)', letterSpacing: '1px', textTransform: 'uppercase' }}>Phase</span>
          {['all', 'pre_event', 'live_week', 'post_event', 'always_on'].map(ph => (
            <button key={ph} className={`filter-btn${filterPhase === ph ? ' active' : ''}`} onClick={() => setFilterPhase(ph)}>
              {ph === 'all' ? 'All' : PHASE_CFG[ph]?.label ?? ph}
            </button>
          ))}
        </div>
      )}

      {/* Campaign grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px', color: 'rgba(70,77,83,0.55)', fontSize: '15px' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 40px', background: '#EEF9F9', border: '1px dashed #E6EFF0', borderRadius: '20px' }}>
          <svg width="40" height="40" fill="none" stroke="rgba(0,165,163,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ marginBottom: '16px' }}>
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
          <div style={{ fontSize: '17px', fontWeight: 700, color: '#464D53', marginBottom: '8px' }}>No campaigns yet</div>
          <div style={{ fontSize: '15px', color: 'rgba(70,77,83,0.55)', marginBottom: '20px' }}>Create your first campaign to start generating content for your events.</div>
          <button className="cc-btn cc-btn-teal" onClick={() => setShowCreate(true)}>Create First Campaign</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {filtered.map(c => {
            const ph  = PHASE_CFG[c.phase]  ?? PHASE_CFG.pre_event
            const st  = STATUS_CFG[c.status] ?? STATUS_CFG.planning
            const cnt = (c.content_posts as { count: number }[] | null)?.[0]?.count ?? 0

            return (
              <div key={c.id} className="cc-card">
                <div style={{ height: '3px', background: ph.color, opacity: 0.7 }} />
                <div style={{ padding: '20px' }}>
                  {/* Badges */}
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '20px', background: ph.bg, color: ph.color }}>{ph.label}</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '20px', background: st.bg, color: st.color, textTransform: 'capitalize' }}>{c.status}</span>
                  </div>

                  {/* Name */}
                  <div style={{ fontSize: '17px', fontWeight: 800, color: '#1E2124', marginBottom: '4px', lineHeight: 1.3 }}>{c.name}</div>

                  {/* Event */}
                  {c.events && (
                    <div style={{ fontSize: '13px', color: 'rgba(70,77,83,0.55)', marginBottom: '12px' }}>
                      {c.events.name} · {c.events.city}
                      {c.events.event_date && ` · ${new Date(c.events.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                    </div>
                  )}

                  {/* Platform dots + post count */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {(c.platforms ?? []).map(p => (
                        <span key={p} title={p} style={{ width: 8, height: 8, borderRadius: '50%', background: PLATFORM_COLOR[p] ?? '#888', display: 'inline-block' }} />
                      ))}
                    </div>
                    <span style={{ fontSize: '13px', color: 'rgba(70,77,83,0.55)' }}>{cnt} posts</span>
                  </div>

                  <Link href={`/content/campaigns/${c.id}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '9px', background: '#00A5A3', color: 'white', fontSize: '14px', fontWeight: 700, textDecoration: 'none' }}>
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
                    Open Campaign
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function ContentHubPage() {
  return (
    <Suspense fallback={<div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#F6FFFE', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ color: 'rgba(70,77,83,0.55)', fontSize: '16px' }}>Loading…</div></div>}>
      <ContentHubInner />
    </Suspense>
  )
}
