'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'

const C = { bg: '#F6F8FB', surface: '#FFFFFF', border: '#DDE8EE', text: '#0F1923', muted: '#5B7080', green: '#00897B', amber: '#D97706', red: '#8B1A1A', blue: '#1565C0', purple: '#6C54B5', teal: '#00897B' }

type Brief = {
  event_id: string; completion_pct: number;
  elevator_pitch?: string; value_proposition?: string; target_audience?: string;
  industry_focus?: string[]; geography_focus?: string[];
  key_themes?: string[]; key_messages?: string[]; tone_of_voice?: string[];
  tagline?: string; hashtags?: string[];
  revenue_target?: number; sponsor_value_prop?: string; delegate_target?: number;
  delegate_profile?: string; pricing_notes?: string;
  competing_events?: Array<{ name: string; organizer: string; notes: string }>;
  differentiators?: string[]; market_positioning?: string;
  attendance_target?: number; nps_target?: number; media_coverage_goals?: string;
  other_kpis?: Array<{ metric: string; target: string }>;
}

type Event = { id: string; name: string; type: string; city: string; event_date: string }

function getSession() {
  if (typeof document === 'undefined') return null
  const raw = document.cookie.split('; ').find(c => c.startsWith('tcs_session='))?.split('=')[1]
  if (!raw) return null
  try { return JSON.parse(atob(raw)) as { sid: string } } catch { return null }
}

const SECTIONS = [
  { id: 'positioning', label: 'Positioning', color: C.blue },
  { id: 'messaging', label: 'Messaging', color: C.purple },
  { id: 'commercial', label: 'Commercial', color: C.green },
  { id: 'competition', label: 'Competition', color: C.amber },
  { id: 'metrics', label: 'Success Metrics', color: C.teal },
]

export default function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const [session, setSession] = useState<{ sid: string } | null>(null)
  const [event, setEvent] = useState<Event | null>(null)
  const [brief, setBrief] = useState<Brief>({ event_id: eventId, completion_pct: 0 })
  const [activeSection, setActiveSection] = useState('positioning')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { setSession(getSession()) }, [])

  useEffect(() => {
    Promise.all([
      fetch(`/api/events?id=${eventId}`).then(r => r.json()),
      fetch(`/api/events/brief?event_id=${eventId}`).then(r => r.json()),
    ]).then(([ev, br]) => {
      const e = Array.isArray(ev) ? ev[0] : ev
      if (e) setEvent(e)
      if (br) setBrief(br)
      setLoading(false)
    })
  }, [eventId])

  function updateField(field: string, value: unknown) {
    setBrief(prev => ({ ...prev, [field]: value }))
  }

  function updateArrayField(field: string, value: string) {
    const items = value.split('\n').map(s => s.trim()).filter(Boolean)
    setBrief(prev => ({ ...prev, [field]: items }))
  }

  function getArrayString(arr?: string[]) {
    return (arr ?? []).join('\n')
  }

  async function save() {
    setSaving(true); setMsg(null)
    const res = await fetch('/api/events/brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...brief, event_id: eventId, last_edited_by: session?.sid }),
    })
    const data = await res.json()
    if (res.ok) {
      setBrief(data)
      setMsg({ text: `Saved — ${data.completion_pct}% complete`, ok: true })
    } else {
      setMsg({ text: data.error ?? 'Save failed', ok: false })
    }
    setSaving(false)
  }

  const inputStyle = { display: 'block' as const, width: '100%', marginTop: 4, padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' as const, lineHeight: 1.5 }
  const labelStyle = { display: 'block' as const, fontSize: 12, fontWeight: 700 as const, color: C.muted, marginBottom: 16 }
  const hintStyle = { fontSize: 11, color: C.muted, fontWeight: 400 as const, marginLeft: 6 }

  if (loading) return <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', system-ui, sans-serif" }}><span style={{ fontSize: 14, color: C.muted }}>Loading...</span></div>

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '20px 32px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Link href={`/admin/events/${eventId}`} style={{ color: C.muted, textDecoration: 'none', fontSize: 13 }}>{event?.name ?? 'Event'}</Link>
            <span style={{ color: C.border }}>/</span>
            <span style={{ fontSize: 13, color: C.text, fontWeight: 700 }}>Event Brief</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Event Intelligence Brief</h1>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>{event?.name} — {event?.city} — {event?.event_date}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Completion */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 120, height: 6, borderRadius: 3, background: C.border, overflow: 'hidden' }}>
                  <div style={{ width: `${brief.completion_pct}%`, height: '100%', borderRadius: 3, background: brief.completion_pct >= 80 ? C.green : brief.completion_pct >= 40 ? C.amber : C.red, transition: 'width 0.3s' }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: brief.completion_pct >= 80 ? C.green : brief.completion_pct >= 40 ? C.amber : C.red }}>{brief.completion_pct}%</span>
              </div>
              <button onClick={save} disabled={saving}
                style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: saving ? C.muted : C.teal, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                {saving ? 'Saving...' : 'Save Brief'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 32px' }}>
        {msg && <div style={{ padding: '10px 16px', borderRadius: 8, marginBottom: 16, background: msg.ok ? `${C.green}12` : `${C.red}12`, border: `1px solid ${msg.ok ? C.green : C.red}30`, color: msg.ok ? C.green : C.red, fontSize: 13, fontWeight: 600 }}>{msg.text}</div>}

        {/* Section tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              style={{ padding: '8px 18px', borderRadius: 8, border: activeSection === s.id ? `1.5px solid ${s.color}` : `1px solid ${C.border}`, background: activeSection === s.id ? s.color : C.surface, color: activeSection === s.id ? '#fff' : C.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {s.label}
            </button>
          ))}
        </div>

        <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 28 }}>

          {/* ══════════ POSITIONING ══════════ */}
          {activeSection === 'positioning' && (
            <>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.blue, marginBottom: 20 }}>Positioning</div>
              <label style={labelStyle}>
                Elevator Pitch <span style={hintStyle}>2 lines — what is this event in one breath?</span>
                <textarea value={brief.elevator_pitch ?? ''} onChange={e => updateField('elevator_pitch', e.target.value)} rows={2} placeholder="e.g. The largest gathering of CIOs and CTOs in the Middle East, focused on enterprise AI adoption and digital transformation." style={{ ...inputStyle, resize: 'vertical' }} />
              </label>
              <label style={labelStyle}>
                Value Proposition <span style={hintStyle}>Why should someone attend this event?</span>
                <textarea value={brief.value_proposition ?? ''} onChange={e => updateField('value_proposition', e.target.value)} rows={3} placeholder="What makes this event worth their time? What will they walk away with?" style={{ ...inputStyle, resize: 'vertical' }} />
              </label>
              <label style={labelStyle}>
                Target Audience <span style={hintStyle}>Who is this event for?</span>
                <textarea value={brief.target_audience ?? ''} onChange={e => updateField('target_audience', e.target.value)} rows={2} placeholder="e.g. C-suite executives, VPs of Technology, and Digital Transformation leaders from enterprises with 500+ employees across MENA." style={{ ...inputStyle, resize: 'vertical' }} />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <label style={labelStyle}>
                  Industry Focus <span style={hintStyle}>One per line</span>
                  <textarea value={getArrayString(brief.industry_focus)} onChange={e => updateArrayField('industry_focus', e.target.value)} rows={4} placeholder={'Banking\nFintech\nInsurance\nHealthcare'} style={{ ...inputStyle, resize: 'vertical' }} />
                </label>
                <label style={labelStyle}>
                  Geography Focus <span style={hintStyle}>One per line</span>
                  <textarea value={getArrayString(brief.geography_focus)} onChange={e => updateArrayField('geography_focus', e.target.value)} rows={4} placeholder={'Middle East\nAfrica\nSouth Asia'} style={{ ...inputStyle, resize: 'vertical' }} />
                </label>
              </div>
            </>
          )}

          {/* ══════════ MESSAGING ══════════ */}
          {activeSection === 'messaging' && (
            <>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.purple, marginBottom: 20 }}>Messaging</div>
              <label style={labelStyle}>
                Key Themes <span style={hintStyle}>3-5 content pillars — one per line</span>
                <textarea value={getArrayString(brief.key_themes)} onChange={e => updateArrayField('key_themes', e.target.value)} rows={5} placeholder={'AI-Powered Enterprise Transformation\nCybersecurity in the Age of GenAI\nCloud-Native Infrastructure\nData-Driven Decision Making\nFuture of Work'} style={{ ...inputStyle, resize: 'vertical' }} />
              </label>
              <label style={labelStyle}>
                Key Messages <span style={hintStyle}>What we want people to remember — one per line</span>
                <textarea value={getArrayString(brief.key_messages)} onChange={e => updateArrayField('key_messages', e.target.value)} rows={4} placeholder={'The region\'s most senior technology leadership gathering\n500+ CIOs and CTOs under one roof\nActionable strategies, not just thought leadership'} style={{ ...inputStyle, resize: 'vertical' }} />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <label style={labelStyle}>
                  Tagline
                  <input value={brief.tagline ?? ''} onChange={e => updateField('tagline', e.target.value)} placeholder="e.g. Where Technology Meets Strategy" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  Tone of Voice <span style={hintStyle}>One per line</span>
                  <textarea value={getArrayString(brief.tone_of_voice)} onChange={e => updateArrayField('tone_of_voice', e.target.value)} rows={3} placeholder={'Authoritative\nForward-thinking\nPractical'} style={{ ...inputStyle, resize: 'vertical' }} />
                </label>
              </div>
              <label style={labelStyle}>
                Hashtags <span style={hintStyle}>One per line</span>
                <textarea value={getArrayString(brief.hashtags)} onChange={e => updateArrayField('hashtags', e.target.value)} rows={3} placeholder={'#BigCIOShow\n#TresconEvents\n#EnterpriseAI'} style={{ ...inputStyle, resize: 'vertical' }} />
              </label>
            </>
          )}

          {/* ══════════ COMMERCIAL ══════════ */}
          {activeSection === 'commercial' && (
            <>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.green, marginBottom: 20 }}>Commercial</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <label style={labelStyle}>
                  Revenue Target (USD)
                  <input type="number" min="0" step="1000" value={brief.revenue_target ?? ''} onChange={e => updateField('revenue_target', e.target.value ? Number(e.target.value) : null)} placeholder="e.g. 500000" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  Delegate Target
                  <input type="number" min="0" value={brief.delegate_target ?? ''} onChange={e => updateField('delegate_target', e.target.value ? Number(e.target.value) : null)} placeholder="e.g. 500" style={inputStyle} />
                </label>
              </div>
              <label style={labelStyle}>
                Sponsor Value Proposition <span style={hintStyle}>Why should sponsors participate?</span>
                <textarea value={brief.sponsor_value_prop ?? ''} onChange={e => updateField('sponsor_value_prop', e.target.value)} rows={3} placeholder="What do sponsors get? Access to what audience? What ROI can they expect?" style={{ ...inputStyle, resize: 'vertical' }} />
              </label>
              <label style={labelStyle}>
                Delegate Profile <span style={hintStyle}>Who is the ideal delegate?</span>
                <textarea value={brief.delegate_profile ?? ''} onChange={e => updateField('delegate_profile', e.target.value)} rows={2} placeholder="e.g. CIO, CTO, VP Technology, Head of Digital from enterprises with 500+ employees, based in GCC" style={{ ...inputStyle, resize: 'vertical' }} />
              </label>
              <label style={labelStyle}>
                Pricing Notes
                <textarea value={brief.pricing_notes ?? ''} onChange={e => updateField('pricing_notes', e.target.value)} rows={2} placeholder="Pricing strategy, early bird, group discounts, VIP tier..." style={{ ...inputStyle, resize: 'vertical' }} />
              </label>
            </>
          )}

          {/* ══════════ COMPETITION ══════════ */}
          {activeSection === 'competition' && (
            <>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.amber, marginBottom: 20 }}>Competition</div>
              <label style={labelStyle}>
                Differentiators <span style={hintStyle}>Why us, not them — one per line</span>
                <textarea value={getArrayString(brief.differentiators)} onChange={e => updateArrayField('differentiators', e.target.value)} rows={4} placeholder={'Only event with 100% C-suite audience\nCurated 1:1 meetings with solution providers\n10+ year track record in the region'} style={{ ...inputStyle, resize: 'vertical' }} />
              </label>
              <label style={labelStyle}>
                Market Positioning <span style={hintStyle}>Where does this event sit in the market?</span>
                <textarea value={brief.market_positioning ?? ''} onChange={e => updateField('market_positioning', e.target.value)} rows={3} placeholder="e.g. Premium, invite-only leadership summit — not a mass-market conference. Positioned alongside Gartner IT Symposium and CIO 100 but with a regional MENA focus." style={{ ...inputStyle, resize: 'vertical' }} />
              </label>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 8 }}>Competing Events</div>
                {(brief.competing_events ?? []).map((ce, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, marginBottom: 8 }}>
                    <input value={ce.name} onChange={e => { const arr = [...(brief.competing_events ?? [])]; arr[i] = { ...arr[i], name: e.target.value }; updateField('competing_events', arr) }} placeholder="Event name" style={{ ...inputStyle, marginTop: 0 }} />
                    <input value={ce.organizer} onChange={e => { const arr = [...(brief.competing_events ?? [])]; arr[i] = { ...arr[i], organizer: e.target.value }; updateField('competing_events', arr) }} placeholder="Organizer" style={{ ...inputStyle, marginTop: 0 }} />
                    <input value={ce.notes} onChange={e => { const arr = [...(brief.competing_events ?? [])]; arr[i] = { ...arr[i], notes: e.target.value }; updateField('competing_events', arr) }} placeholder="Notes" style={{ ...inputStyle, marginTop: 0 }} />
                    <button onClick={() => { const arr = (brief.competing_events ?? []).filter((_, j) => j !== i); updateField('competing_events', arr) }} style={{ border: 'none', background: 'transparent', color: C.red, cursor: 'pointer', fontSize: 16, fontFamily: 'inherit', padding: '0 8px' }}>x</button>
                  </div>
                ))}
                <button onClick={() => updateField('competing_events', [...(brief.competing_events ?? []), { name: '', organizer: '', notes: '' }])}
                  style={{ padding: '6px 14px', borderRadius: 6, border: `1px dashed ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ Add Competitor</button>
              </div>
            </>
          )}

          {/* ══════════ SUCCESS METRICS ══════════ */}
          {activeSection === 'metrics' && (
            <>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.teal, marginBottom: 20 }}>Success Metrics</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <label style={labelStyle}>
                  Attendance Target
                  <input type="number" min="0" value={brief.attendance_target ?? ''} onChange={e => updateField('attendance_target', e.target.value ? Number(e.target.value) : null)} placeholder="e.g. 500" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  NPS Target
                  <input type="number" min="0" max="100" step="0.5" value={brief.nps_target ?? ''} onChange={e => updateField('nps_target', e.target.value ? Number(e.target.value) : null)} placeholder="e.g. 75" style={inputStyle} />
                </label>
              </div>
              <label style={labelStyle}>
                Media Coverage Goals
                <textarea value={brief.media_coverage_goals ?? ''} onChange={e => updateField('media_coverage_goals', e.target.value)} rows={2} placeholder="e.g. 50+ media mentions, 5 tier-1 publications, press conference with keynote speaker" style={{ ...inputStyle, resize: 'vertical' }} />
              </label>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 8 }}>Other KPIs</div>
                {(brief.other_kpis ?? []).map((kpi, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 8 }}>
                    <input value={kpi.metric} onChange={e => { const arr = [...(brief.other_kpis ?? [])]; arr[i] = { ...arr[i], metric: e.target.value }; updateField('other_kpis', arr) }} placeholder="Metric name" style={{ ...inputStyle, marginTop: 0 }} />
                    <input value={kpi.target} onChange={e => { const arr = [...(brief.other_kpis ?? [])]; arr[i] = { ...arr[i], target: e.target.value }; updateField('other_kpis', arr) }} placeholder="Target value" style={{ ...inputStyle, marginTop: 0 }} />
                    <button onClick={() => { const arr = (brief.other_kpis ?? []).filter((_, j) => j !== i); updateField('other_kpis', arr) }} style={{ border: 'none', background: 'transparent', color: C.red, cursor: 'pointer', fontSize: 16, fontFamily: 'inherit', padding: '0 8px' }}>x</button>
                  </div>
                ))}
                <button onClick={() => updateField('other_kpis', [...(brief.other_kpis ?? []), { metric: '', target: '' }])}
                  style={{ padding: '6px 14px', borderRadius: 6, border: `1px dashed ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ Add KPI</button>
              </div>
            </>
          )}
        </div>

        {/* AI context info */}
        <div style={{ marginTop: 20, padding: '14px 18px', borderRadius: 10, background: `${C.teal}08`, border: `1px solid ${C.teal}20` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.teal, marginBottom: 4 }}>How this brief is used across the platform</div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
            Content Engine reads your messaging + tone to generate on-brand social posts.
            Website Builder uses positioning + value prop to write website copy.
            Market Intelligence uses competition + industry to focus research.
            Pilot AI can answer staff questions about this event using the brief.
            The more complete the brief, the better every AI tool performs.
          </div>
        </div>
      </div>
    </div>
  )
}
