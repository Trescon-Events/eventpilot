'use client'

import { useState, useEffect, useCallback, use } from 'react'
import Link from 'next/link'

type Post = {
  id: string; campaign_id: string; week_number: number; narrative_role: string
  platform: string; scheduled_date: string; scheduled_time: string; title?: string
  status: string; text: string; image_url: string; canva_image_url?: string; revision_note: string | null
}
type Campaign = {
  id: string; name: string; objective: string; phase: string; status: string
  platforms: string[]; start_date: string | null; duration_weeks: number
  brand_notes: string; event_id: string | null
  events: { id: string; name: string; city: string; event_date: string | null } | null
}

const PLATFORM_COLOR: Record<string, string> = {
  LinkedIn: '#0A66C2', Instagram: '#E1306C', Facebook: '#1877F2',
  Twitter: '#1D9BF0', YouTube: '#FF0000',
}
const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  planned:   { label: 'Planned',   color: '#2D3E50', bg: '#FFFFFF' },
  generated: { label: 'Generated', color: '#92400E',               bg: 'rgba(245,158,11,0.12)'  },
  approved:  { label: 'Approved',  color: '#3D6B00',               bg: 'rgba(192,244,60,0.12)'  },
  posted:    { label: 'Posted',    color: '#00695C',               bg: 'rgba(0,165,163,0.12)'   },
}
const NARRATIVE_ROLES = ['Awareness', 'Speaker', 'Sponsor', 'Countdown', 'Live', 'Testimonial', 'Recap', 'CTA']

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [staffId, setStaffId]     = useState<string>('')
  const [campaign, setCampaign]   = useState<Campaign | null>(null)
  const [posts,    setPosts]      = useState<Post[]>([])
  const [loading,  setLoading]    = useState(true)
  const [generating, setGenerating] = useState<Record<string, boolean>>({})
  const [generatingAll, setGeneratingAll] = useState(false)
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [activePost, setActivePost] = useState<Post | null>(null)
  const [viewMode, setViewMode]   = useState<'weeks' | 'calendar' | 'list'>('weeks')
  const [rejectId, setRejectId]   = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [busyId, setBusyId]       = useState<string | null>(null)
  const [tab, setTab]             = useState<'weeks' | 'calendar' | 'list' | 'approvals'>('weeks')
  const [calMonth, setCalMonth]   = useState(new Date().getMonth())
  const [calYear, setCalYear]     = useState(new Date().getFullYear())

  // Week planning
  const [planWeeks, setPlanWeeks] = useState<{ week: number; theme: string; roles: string[] }[]>([])
  const [planReady, setPlanReady] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [cRes, pRes] = await Promise.all([
      fetch(`/api/content/campaigns/${id}`),
      fetch(`/api/content/campaigns/${id}/posts`),
    ])
    if (!cRes.ok) { setLoading(false); return }
    const c: Campaign = await cRes.json()
    const p: Post[]   = pRes.ok ? await pRes.json() : []
    setCampaign(c)
    setPosts(p)

    // Build week plan from posts if none exists
    if (!p.length && c.start_date) {
      const weeks = Array.from({ length: c.duration_weeks }, (_, i) => ({
        week: i + 1,
        theme: weekTheme(c.phase, i + 1, c.duration_weeks),
        roles: defaultRoles(c.phase, i + 1, c.duration_weeks),
      }))
      setPlanWeeks(weeks)
      setPlanReady(true)
    }

    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  // Get staff ID from session cookie
  useEffect(() => {
    try {
      const raw = document.cookie.split('; ').find(c => c.startsWith('tcs_session='))?.split('=')[1]
      if (raw) { const s = JSON.parse(atob(raw)); setStaffId(s.sid || '') }
    } catch { /* ignore */ }
  }, [])

  function weekTheme(phase: string, wk: number, total: number): string {
    if (phase === 'pre_event') {
      if (wk === 1) return 'Building Awareness'
      if (wk === total) return 'Final Push — Register Now'
      if (wk === total - 1) return 'Speaker Spotlight'
      return 'Engagement & Education'
    }
    if (phase === 'live_week') return wk === 1 ? 'Day 1 — Live Coverage' : 'Day 2 — Key Takeaways'
    if (phase === 'post_event') return wk === 1 ? 'Event Highlights Recap' : 'Testimonials & Impact'
    return `Week ${wk}`
  }

  function defaultRoles(phase: string, wk: number, total: number): string[] {
    if (phase === 'pre_event') {
      if (wk === 1) return ['Awareness', 'Speaker', 'CTA']
      if (wk === total) return ['Countdown', 'CTA', 'Sponsor']
      return ['Speaker', 'Awareness', 'Testimonial']
    }
    if (phase === 'live_week') return ['Live', 'Live', 'Speaker', 'Testimonial']
    if (phase === 'post_event') return ['Recap', 'Testimonial', 'CTA']
    return ['Awareness', 'CTA']
  }

  async function scaffoldPosts() {
    if (!campaign?.start_date || !campaign.platforms.length) return
    const rows: Omit<Post, 'id' | 'campaign_id' | 'text' | 'image_url' | 'revision_note'>[] = []

    planWeeks.forEach(wk => {
      const wkStart = addDays(campaign.start_date!, (wk.week - 1) * 7)
      campaign.platforms.forEach((platform, pi) => {
        wk.roles.forEach((role, ri) => {
          rows.push({
            week_number:    wk.week,
            narrative_role: role,
            platform,
            scheduled_date: addDays(wkStart, (ri + pi * 2) % 7),
            scheduled_time: '09:00',
            status:         'planned',
          })
        })
      })
    })

    await fetch(`/api/content/campaigns/${id}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posts: rows }),
    })
    setPlanReady(false)
    await load()
  }

  async function generatePost(post: Post) {
    setGenerating(g => ({ ...g, [post.id]: true }))
    try {
      const res = await fetch('/api/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id:    campaign!.id,
          post_id:        post.id,
          platform:       post.platform,
          narrative_role: post.narrative_role,
          week_theme:     planWeeks.find(w => w.week === post.week_number)?.theme ?? '',
        }),
      })
      if (res.ok) {
        const { text, image_url } = await res.json()
        setPosts(ps => ps.map(p => p.id === post.id ? { ...p, text, image_url, status: 'generated' } : p))
        if (activePost?.id === post.id) setActivePost(prev => prev ? { ...prev, text, image_url, status: 'generated' } : prev)
      }
    } finally {
      setGenerating(g => ({ ...g, [post.id]: false }))
    }
  }

  async function generateWeek(weekNum: number) {
    const weekPosts = posts.filter(p => p.week_number === weekNum && p.status === 'planned')
    for (const p of weekPosts) await generatePost(p)
  }

  async function generateAll() {
    const planned = posts.filter(p => p.status === 'planned')
    if (!planned.length) return
    setGeneratingAll(true)
    for (const p of planned) await generatePost(p)
    setGeneratingAll(false)
  }

  async function publishPost(postId: string) {
    if (!campaign?.event_id) return
    setPublishingId(postId)
    try {
      const res = await fetch('/api/content/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, event_id: campaign.event_id }),
      })
      if (res.ok) {
        setPosts(ps => ps.map(p => p.id === postId ? { ...p, status: 'posted' } : p))
        if (activePost?.id === postId) setActivePost(prev => prev ? { ...prev, status: 'posted' } : prev)
      }
    } finally {
      setPublishingId(null)
    }
  }

  async function approvePost(postId: string) {
    setBusyId(postId)
    await fetch(`/api/content/posts/${postId}/approve`, { method: 'PATCH' })
    setPosts(ps => ps.map(p => p.id === postId ? { ...p, status: 'approved' } : p))
    if (activePost?.id === postId) setActivePost(prev => prev ? { ...prev, status: 'approved' } : prev)
    setBusyId(null)
  }

  async function rejectPost() {
    if (!rejectId || !rejectNote.trim()) return
    setBusyId(rejectId)
    await fetch(`/api/content/posts/${rejectId}/reject`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: rejectNote }),
    })
    setPosts(ps => ps.map(p => p.id === rejectId ? { ...p, status: 'generated', revision_note: rejectNote } : p))
    setRejectId(null); setRejectNote(''); setBusyId(null)
  }

  async function updatePostText(postId: string, text: string) {
    setPosts(ps => ps.map(p => p.id === postId ? { ...p, text } : p))
    await fetch(`/api/content/posts/${postId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#E8EEF4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0F1923', fontSize: '13px' }}>
      Loading campaign…
    </div>
  )

  if (!campaign) return (
    <div style={{ minHeight: '100vh', background: '#E8EEF4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
      <div style={{ color: '#0F1923', fontSize: '13px' }}>Campaign not found.</div>
      <Link href="/content" style={{ color: '#00695C', fontSize: '13px' }}>Back to Content Hub</Link>
    </div>
  )

  const weekNums = [...new Set(posts.map(p => p.week_number))].sort((a, b) => a - b)
  const pendingApproval = posts.filter(p => p.status === 'generated')
  const approvedCount   = posts.filter(p => p.status === 'approved').length
  const postedCount     = posts.filter(p => p.status === 'posted').length

  return (
    <div style={{ minHeight: '100vh', background: '#E8EEF4', color: '#0F1923', fontFamily: 'inherit' }}>
      <style>{`
        .cp-btn { padding: 10px 18px; border-radius: 8px; font-size: 20px; font-weight: 700; cursor: pointer; border: none; font-family: inherit; transition: all 0.15s; }
        .cp-btn-teal { background: #00A5A3; color: white; }
        .cp-btn-teal:hover { background: #00C4C2; }
        .cp-btn-lime { background: rgba(192,244,60,0.15); color: #C0F43C; border: 1px solid rgba(192,244,60,0.3) !important; }
        .cp-btn-red  { background: rgba(255,107,107,0.12); color: #FF6B6B; border: 1px solid rgba(255,107,107,0.25) !important; }
        .cp-btn-ghost { background: transparent; border: 1px solid #C8DFE0 !important; color: #2A3038; }
        .cp-btn-ghost:hover { border-color: rgba(0,165,163,0.3) !important; color: #1E2124; }
        .cp-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .cp-tab { padding: 8px 18px; border-radius: 8px; font-size: 20px; font-weight: 700; cursor: pointer; border: 1px solid transparent; background: transparent; color: #2A3038; font-family: inherit; transition: all 0.15s; }
        .cp-tab.active { background: rgba(0,165,163,0.12); color: #00A5A3; border-color: rgba(0,165,163,0.25); }
        .post-card { background: #FFFFFF; border: 1px solid #C8DFE0; border-radius: 12px; overflow: hidden; transition: border-color 0.15s; cursor: pointer; box-shadow: 0 1px 4px rgba(0,165,163,0.06), 0 1px 2px rgba(0,0,0,0.04); }
        .post-card:hover { border-color: rgba(0,165,163,0.25); }
        .spin { animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .inp { width: 100%; padding: 9px 12px; border-radius: 9px; border: 1px solid #C8DFE0; background: #FFFFFF; color: #1E2124; font-size: 17px; font-family: inherit; box-sizing: border-box; outline: none; }
        .inp:focus { border-color: rgba(0,165,163,0.4); }
        .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 24px; }
        .modal-box { background: #FFFFFF; border: 1px solid #C8DFE0; border-radius: 18px; width: 100%; max-width: 680px; max-height: 90vh; overflow-y: auto; }
      `}</style>

      {/* Top bar */}
      <div style={{ borderBottom: '1px solid #C8DFE0', padding: '20px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', boxShadow: '0 1px 3px rgba(0,165,163,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
          <Link href="/content" style={{ color: '#2D3E50', display: 'flex', flexShrink: 0 }}>
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          </Link>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '2px' }}>
              {campaign.events?.name ?? 'Content Campaign'}
            </div>
            <h1 style={{ fontSize: '36px', fontWeight: 900, color: '#0F1923', margin: 0, letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {campaign.name}
            </h1>
          </div>
        </div>

        {/* Stats + Generate All */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '16px' }}>
            {[
              { label: 'Posts', val: posts.length, color: '#2D3E50' },
              { label: 'Pending', val: pendingApproval.length, color: '#92400E' },
              { label: 'Approved', val: approvedCount, color: '#3D6B00' },
              { label: 'Posted', val: postedCount, color: '#00695C' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '36px', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.val}</div>
                <div style={{ fontSize: '13px', color: '#0F1923', letterSpacing: '0.8px', textTransform: 'uppercase' }}>{s.label}</div>
              </div>
            ))}
          </div>
          {posts.some(p => p.status === 'planned') && (
            <button className="cp-btn cp-btn-teal" disabled={generatingAll}
              onClick={generateAll}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', padding: '10px 20px' }}>
              {generatingAll
                ? <><svg className="spin" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-9-9"/></svg> Generating…</>
                : <><svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Generate All</>
              }
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ padding: '16px 40px', borderBottom: '1px solid #C8DFE0', display: 'flex', gap: '6px' }}>
        {([
          { key: 'weeks',     label: 'Campaign Weeks' },
          { key: 'calendar',  label: 'Calendar' },
          { key: 'list',      label: 'List View' },
          { key: 'approvals', label: `Approvals${pendingApproval.length ? ` (${pendingApproval.length})` : ''}` },
        ] as const).map(t => (
          <button key={t.key} className={`cp-tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding: '32px 40px' }}>

        {/* ── SCAFFOLD POSTS CTA (no posts yet) ─────────────────────────── */}
        {posts.length === 0 && planReady && (
          <div style={{ background: 'rgba(0,165,163,0.05)', border: '1px solid rgba(0,165,163,0.2)', borderRadius: '16px', padding: '28px', marginBottom: '28px' }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#00695C', marginBottom: '8px' }}>Ready to build your post schedule?</div>
            <div style={{ fontSize: '13px', color: '#2D3E50', marginBottom: '20px' }}>
              {campaign.duration_weeks} weeks · {campaign.platforms.join(', ')} · {planWeeks.reduce((acc, w) => acc + w.roles.length * campaign.platforms.length, 0)} posts planned
            </div>
            {planWeeks.map(wk => (
              <div key={wk.week} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,165,163,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 800, color: '#00695C', flexShrink: 0 }}>{wk.week}</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#2D3E50', minWidth: 160 }}>{wk.theme}</div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {wk.roles.map((r, i) => (
                    <span key={i} style={{ fontSize: '13px', padding: '2px 7px', borderRadius: '4px', background: '#FFFFFF', color: '#2D3E50' }}>{r}</span>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button className="cp-btn cp-btn-teal" onClick={scaffoldPosts}>Build Post Schedule</button>
              <button className="cp-btn cp-btn-ghost" onClick={() => setPlanReady(false)}>Customise first</button>
            </div>
          </div>
        )}

        {posts.length === 0 && !planReady && !campaign.start_date && (
          <div style={{ textAlign: 'center', padding: '60px 40px', background: '#FFFFFF', border: '1px dashed #C8DFE0', borderRadius: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#2D3E50', marginBottom: '8px' }}>Set a start date to build the post schedule</div>
            <div style={{ fontSize: '13px', color: '#0F1923' }}>Edit the campaign to add a start date, then return here to scaffold posts.</div>
          </div>
        )}

        {/* ── WEEKS TAB ─────────────────────────────────────────────────── */}
        {tab === 'weeks' && posts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {weekNums.map(wkNum => {
              const wkPosts  = posts.filter(p => p.week_number === wkNum)
              const wkTheme  = planWeeks.find(w => w.week === wkNum)?.theme ?? `Week ${wkNum}`
              const genCount = wkPosts.filter(p => p.status !== 'planned').length
              const anyGen   = wkPosts.some(p => generating[p.id])

              return (
                <div key={wkNum} style={{ background: '#FFFFFF', border: '1px solid #9EC8C8', borderRadius: '14px', overflow: 'hidden' }}>
                  {/* Week header */}
                  <div style={{ padding: '18px 20px', borderBottom: '1px solid #C8DFE0', display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,165,163,0.15)', border: '1.5px solid rgba(0,165,163,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 800, color: '#00695C', flexShrink: 0 }}>{wkNum}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '2px' }}>{wkTheme}</div>
                      <div style={{ fontSize: '13px', color: '#0F1923' }}>
                        {wkPosts.length} posts · {genCount} generated
                      </div>
                    </div>
                    <button
                      className="cp-btn cp-btn-ghost"
                      disabled={anyGen || wkPosts.every(p => p.status !== 'planned')}
                      onClick={() => generateWeek(wkNum)}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
                    >
                      {anyGen ? (
                        <svg className="spin" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-9-9"/></svg>
                      ) : (
                        <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                      )}
                      {anyGen ? 'Generating…' : 'Generate Week'}
                    </button>
                  </div>

                  {/* Posts grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px', padding: '18px 20px' }}>
                    {wkPosts.map(post => {
                      const pc  = PLATFORM_COLOR[post.platform] ?? '#888'
                      const sc  = STATUS_CFG[post.status]       ?? STATUS_CFG.planned
                      const isg = generating[post.id]

                      return (
                        <div key={post.id} className="post-card" onClick={() => setActivePost(post)}>
                          {/* Image */}
                          <div style={{ aspectRatio: '16/9', background: `${pc}18`, position: 'relative', overflow: 'hidden' }}>
                            {post.image_url ? (
                              <>
                                {/* Loading skeleton — shown until image loads */}
                                <div className="img-skeleton" style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, ${pc}10 25%, ${pc}20 50%, ${pc}10 75%)`, backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={post.image_url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'relative' }} onLoad={(e) => { const skel = (e.target as HTMLImageElement).previousElementSibling; if (skel) (skel as HTMLElement).style.display = 'none' }} onError={(e) => { const skel = (e.target as HTMLImageElement).previousElementSibling; if (skel) (skel as HTMLElement).innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#999;font-size:11px">Image unavailable</div>' }} />
                              </>
                            ) : (
                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="24" height="24" fill="none" stroke={`${pc}40`} strokeWidth="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m9 9 6 6m0-6-6 6"/></svg>
                              </div>
                            )}
                            {isg && (
                              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg className="spin" width="20" height="20" fill="none" stroke="#00A5A3" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-9-9"/></svg>
                              </div>
                            )}
                          </div>
                          <div style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                              <span style={{ fontSize: '13px', fontWeight: 700, color: pc }}>{post.platform}</span>
                              <span style={{ fontSize: '13px', fontWeight: 700, padding: '2px 7px', borderRadius: '10px', background: sc.bg, color: sc.color }}>{sc.label}</span>
                            </div>
                            <div style={{ fontSize: '13px', color: '#0F1923', marginBottom: '4px' }}>{post.narrative_role}</div>
                            {post.text ? (
                              <div style={{ fontSize: '13px', color: '#2D3E50', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                {post.text}
                              </div>
                            ) : (
                              <div style={{ fontSize: '13px', color: '#0F1923', fontStyle: 'italic' }}>No copy yet</div>
                            )}
                            <div style={{ marginTop: '8px', display: 'flex', gap: '6px' }} onClick={e => e.stopPropagation()}>
                              {post.status === 'planned' && (
                                <button className="cp-btn cp-btn-ghost" style={{ fontSize: '13px', padding: '5px 10px' }}
                                  disabled={isg} onClick={() => generatePost(post)}>
                                  Generate
                                </button>
                              )}
                              {post.status === 'generated' && (
                                <button className="cp-btn cp-btn-lime" style={{ fontSize: '13px', padding: '5px 10px' }}
                                  disabled={busyId === post.id} onClick={() => approvePost(post.id)}>
                                  Approve
                                </button>
                              )}
                              {post.status === 'approved' && campaign?.event_id && (
                                <button className="cp-btn cp-btn-teal" style={{ fontSize: '13px', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                  disabled={publishingId === post.id} onClick={() => publishPost(post.id)}>
                                  {publishingId === post.id
                                    ? <svg className="spin" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-9-9"/></svg>
                                    : <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
                                  }
                                  {publishingId === post.id ? '…' : 'Publish'}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── LIST TAB ──────────────────────────────────────────────────── */}
        {tab === 'list' && (
          <div style={{ background: '#FFFFFF', border: '1px solid #9EC8C8', borderRadius: '14px', overflow: 'hidden' }}>
            {/* Header row */}
            <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 100px 90px 100px 120px', padding: '10px 16px', borderBottom: '1px solid #C8DFE0', background: 'rgba(0,165,163,0.06)' }}>
              {['Wk', 'Copy', 'Platform', 'Status', 'Role', 'Date'].map(h => (
                <div key={h} style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', letterSpacing: '0.8px', textTransform: 'uppercase' }}>{h}</div>
              ))}
            </div>
            {posts.map(post => {
              const pc = PLATFORM_COLOR[post.platform] ?? '#888'
              const sc = STATUS_CFG[post.status] ?? STATUS_CFG.planned
              return (
                <div key={post.id} onClick={() => setActivePost(post)}
                  style={{ display: 'grid', gridTemplateColumns: '60px 1fr 100px 90px 100px 120px', padding: '12px 16px', borderBottom: '1px solid #C8DFE0', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,165,163,0.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div style={{ fontSize: '13px', color: '#0F1923', fontWeight: 700 }}>W{post.week_number}</div>
                  <div style={{ fontSize: '13px', color: '#2D3E50', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '12px' }}>
                    {post.text || <span style={{ color: '#0F1923', fontStyle: 'italic' }}>No copy yet</span>}
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: pc }}>{post.platform}</div>
                  <span style={{ fontSize: '13px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: sc.bg, color: sc.color, alignSelf: 'center', textAlign: 'center' }}>{sc.label}</span>
                  <div style={{ fontSize: '13px', color: '#2D3E50' }}>{post.narrative_role}</div>
                  <div style={{ fontSize: '13px', color: '#2D3E50' }}>{fmtDate(post.scheduled_date)}</div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── CALENDAR TAB ──────────────────────────────────────────────── */}
        {tab === 'calendar' && (() => {
          if (!posts.length) return (
            <div style={{ textAlign: 'center', padding: '60px', background: '#FFFFFF', border: '1px dashed #C8DFE0', borderRadius: '16px' }}>
              <div style={{ fontSize: '13px', color: '#0F1923' }}>No posts scheduled yet.</div>
            </div>
          )

          const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
          const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

          const firstDay = new Date(calYear, calMonth, 1).getDay()
          const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
          const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
          while (cells.length % 7 !== 0) cells.push(null)

          const byDate: Record<string, Post[]> = {}
          posts.forEach(p => { if (!byDate[p.scheduled_date]) byDate[p.scheduled_date] = []; byDate[p.scheduled_date].push(p) })

          const today = new Date().toISOString().slice(0, 10)

          // Drag state
          function handleDragStart(e: React.DragEvent, postId: string) {
            e.dataTransfer.setData('text/plain', postId)
            e.dataTransfer.effectAllowed = 'move'
          }

          async function handleDrop(e: React.DragEvent, dateKey: string) {
            e.preventDefault()
            const postId = e.dataTransfer.getData('text/plain')
            if (!postId) return
            // Optimistic update
            setPosts(prev => prev.map(p => p.id === postId ? { ...p, scheduled_date: dateKey } : p))
            // Persist
            await fetch(`/api/content/campaigns/${id}/posts`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ updates: [{ id: postId, scheduled_date: dateKey }] }),
            })
          }

          function handleDragOver(e: React.DragEvent) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }

          return (
            <div>
              {/* Month navigation */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <button onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) } else setCalMonth(m => m - 1) }}
                  style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #C8DFE0', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: 700, color: '#0F1923' }}>
                  Prev
                </button>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#0F1923', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  {MONTH_NAMES[calMonth]} {calYear}
                </span>
                <button onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) } else setCalMonth(m => m + 1) }}
                  style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #C8DFE0', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: 700, color: '#0F1923' }}>
                  Next
                </button>
              </div>

              <div style={{ fontSize: '11px', color: '#5B7080', marginBottom: '10px', textAlign: 'center' }}>
                Drag a post to a different day to reschedule it
              </div>

              <div style={{ background: '#FFFFFF', border: '1px solid #9EC8C8', borderRadius: '14px', overflow: 'hidden' }}>
                {/* Day headers */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #C8DFE0' }}>
                  {DAYS.map(d => (
                    <div key={d} style={{ padding: '10px', textAlign: 'center', fontSize: '11px', fontWeight: 800, color: '#5B7080', letterSpacing: '1px', textTransform: 'uppercase', borderRight: '1px solid #C8DFE0' }}>{d}</div>
                  ))}
                </div>

                {/* Calendar grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                  {cells.map((day, ci) => {
                    if (!day) return <div key={`e-${ci}`} style={{ minHeight: 90, borderRight: '1px solid #E8EEF4', borderBottom: '1px solid #E8EEF4', background: '#FAFBFC' }} />
                    const dateKey = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    const dayPosts = byDate[dateKey] ?? []
                    const isToday = dateKey === today

                    return (
                      <div key={dateKey}
                        onDragOver={handleDragOver}
                        onDrop={e => handleDrop(e, dateKey)}
                        style={{
                          minHeight: 90, borderRight: '1px solid #E8EEF4', borderBottom: '1px solid #E8EEF4',
                          padding: '6px', background: isToday ? 'rgba(0,165,163,0.05)' : 'transparent',
                          transition: 'background 0.15s',
                        }}>
                        <div style={{ fontSize: '12px', fontWeight: isToday ? 800 : 600, color: isToday ? '#00A5A3' : '#0F1923', marginBottom: '4px' }}>{day}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          {dayPosts.map(p => {
                            const pc = PLATFORM_COLOR[p.platform] ?? '#888'
                            const sc = STATUS_CFG[p.status] ?? STATUS_CFG.planned
                            return (
                              <div key={p.id}
                                draggable
                                onDragStart={e => handleDragStart(e, p.id)}
                                onClick={() => setActivePost(p)}
                                style={{
                                  fontSize: '10px', padding: '3px 6px', borderRadius: '5px',
                                  background: sc.bg || '#F0F4F8', color: pc, fontWeight: 700,
                                  cursor: 'grab', overflow: 'hidden', textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap', border: `1px solid ${pc}25`,
                                  display: 'flex', alignItems: 'center', gap: '3px',
                                }}
                                title={`${p.platform} — ${p.narrative_role}${p.text ? ': ' + p.text.slice(0, 60) : ''}\nDrag to reschedule`}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: pc, flexShrink: 0 }} />
                                {p.platform.slice(0, 2)} {p.narrative_role.slice(0, 6)}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })()}

        {/* ── APPROVALS TAB ─────────────────────────────────────────────── */}
        {tab === 'approvals' && (() => {
          const approvedPosts = posts.filter(p => p.status === 'approved')
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

              {/* Pending approval section */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#92400E', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '12px' }}>
                  Awaiting Approval{pendingApproval.length ? ` — ${pendingApproval.length}` : ''}
                </div>
                {pendingApproval.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', background: '#FFFFFF', border: '1px dashed #C8DFE0', borderRadius: '16px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#3D6B00', marginBottom: '6px' }}>All clear</div>
                    <div style={{ fontSize: '13px', color: '#0F1923' }}>No posts awaiting approval.</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {pendingApproval.map(post => {
                      const pc = PLATFORM_COLOR[post.platform] ?? '#888'
                      return (
                        <div key={post.id} style={{ background: '#FFFFFF', border: '1px solid #9EC8C8', borderRadius: '14px', overflow: 'hidden', display: 'flex' }}>
                          <div style={{ width: 4, background: pc, flexShrink: 0 }} />
                          <div style={{ padding: '20px', flex: 1, display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                            {post.image_url && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={post.image_url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }} />
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: pc }}>{post.platform}</span>
                                <span style={{ fontSize: '13px', color: '#0F1923' }}>Week {post.week_number} · {post.narrative_role}</span>
                                <span style={{ fontSize: '13px', color: '#0F1923', marginLeft: 'auto' }}>{fmtDate(post.scheduled_date)}</span>
                              </div>
                              <div style={{ fontSize: '15px', color: '#2D3E50', lineHeight: 1.65, marginBottom: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {post.text}
                              </div>
                              {post.revision_note && (
                                <div style={{ background: 'rgba(255,107,107,0.08)', borderLeft: '3px solid #FF6B6B', padding: '8px 12px', borderRadius: '0 6px 6px 0', fontSize: '13px', color: '#FF6B6B', marginBottom: '10px' }}>
                                  Revision note: {post.revision_note}
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
                              <button className="cp-btn cp-btn-lime" style={{ fontSize: '13px' }} disabled={busyId === post.id} onClick={() => approvePost(post.id)}>
                                {busyId === post.id ? '…' : 'Approve'}
                              </button>
                              <button className="cp-btn cp-btn-red" style={{ fontSize: '13px' }} onClick={() => { setRejectId(post.id); setRejectNote('') }}>
                                Revise
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Approved — ready to publish */}
              {approvedPosts.length > 0 && (
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#3D6B00', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '12px' }}>
                    Approved — Ready to Publish ({approvedPosts.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {approvedPosts.map(post => {
                      const pc = PLATFORM_COLOR[post.platform] ?? '#888'
                      return (
                        <div key={post.id} style={{ background: '#FFFFFF', border: '1px solid #9EC8C8', borderRadius: '14px', overflow: 'hidden', display: 'flex' }}>
                          <div style={{ width: 4, background: '#3D6B00', flexShrink: 0 }} />
                          <div style={{ padding: '20px', flex: 1, display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                            {post.image_url && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={post.image_url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }} />
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: pc }}>{post.platform}</span>
                                <span style={{ fontSize: '13px', color: '#0F1923' }}>Week {post.week_number} · {post.narrative_role}</span>
                                <span style={{ fontSize: '13px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(192,244,60,0.12)', color: '#3D6B00', fontWeight: 700 }}>Approved</span>
                                <span style={{ fontSize: '13px', color: '#0F1923', marginLeft: 'auto' }}>{fmtDate(post.scheduled_date)}</span>
                              </div>
                              <div style={{ fontSize: '15px', color: '#2D3E50', lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {post.text}
                              </div>
                            </div>
                            {campaign?.event_id && (
                              <button className="cp-btn cp-btn-teal" style={{ fontSize: '13px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px' }}
                                disabled={publishingId === post.id} onClick={() => publishPost(post.id)}>
                                {publishingId === post.id
                                  ? <><svg className="spin" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-9-9"/></svg> Publishing…</>
                                  : <><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg> Publish</>
                                }
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

            </div>
          )
        })()}
      </div>

      {/* ── POST DETAIL MODAL ─────────────────────────────────────────────── */}
      {activePost && (() => {
        const post = posts.find(p => p.id === activePost.id) ?? activePost
        const pc   = PLATFORM_COLOR[post.platform] ?? '#888'
        const sc   = STATUS_CFG[post.status] ?? STATUS_CFG.planned

        return (
          <div className="modal-bg" onClick={() => setActivePost(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              {/* Modal header */}
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #C8DFE0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: pc }}>{post.platform}</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: sc.bg, color: sc.color }}>{sc.label}</span>
                  <span style={{ fontSize: '13px', color: '#0F1923' }}>Wk {post.week_number} · {post.narrative_role}</span>
                </div>
                <button onClick={() => setActivePost(null)} style={{ background: 'none', border: 'none', color: '#2D3E50', cursor: 'pointer', padding: '4px' }}>
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>

              <div style={{ padding: '24px' }}>
                {/* Image + Canva edit */}
                {post.image_url && (
                  <div style={{ position: 'relative', marginBottom: '16px' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={post.canva_image_url || post.image_url} alt="" style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: '10px' }} />
                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                      <button
                        onClick={async () => {
                          try {
                            // Check if Canva is connected
                            const checkRes = await fetch('/api/canva/design', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'check', staff_id: staffId }),
                            })
                            const checkData = await checkRes.json()
                            if (!checkData.connected) {
                              window.open(`/api/canva?staff_id=${staffId}`, '_blank')
                              return
                            }
                            // Upload image to Canva
                            const upRes = await fetch('/api/canva/design', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'upload', staff_id: staffId, image_url: post.image_url, title: post.title || 'Social Post' }),
                            })
                            const upData = await upRes.json()
                            if (upData.error) { alert(upData.error); return }
                            // Create design
                            const designRes = await fetch('/api/canva/design', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'create', staff_id: staffId, asset_id: upData.job?.asset?.id, title: post.title || 'Social Post' }),
                            })
                            const designData = await designRes.json()
                            if (designData.design?.urls?.edit_url) {
                              window.open(designData.design.urls.edit_url, '_blank')
                            } else {
                              alert('Could not open Canva editor. Try again.')
                            }
                          } catch (e) { alert('Canva error: ' + (e instanceof Error ? e.message : 'Unknown')) }
                        }}
                        style={{ flex: 1, padding: '8px 12px', fontSize: '12px', fontWeight: 700, color: '#00C4CC', background: 'rgba(0,196,204,0.08)', border: '1px solid rgba(0,196,204,0.2)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                        Edit in Canva
                      </button>
                      <button
                        onClick={async () => {
                          const designId = prompt('Paste your Canva Design ID (from the URL after editing):')
                          if (!designId) return
                          try {
                            const expRes = await fetch('/api/canva/design', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'export', staff_id: staffId, design_id: designId }),
                            })
                            const expData = await expRes.json()
                            if (expData.error) { alert(expData.error); return }
                            // Poll for completion
                            const jobId = expData.job?.id
                            if (!jobId) { alert('Export started but no job ID returned'); return }
                            let attempts = 0
                            const poll = setInterval(async () => {
                              attempts++
                              const statusRes = await fetch('/api/canva/design', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'status', staff_id: staffId, job_id: jobId }),
                              })
                              const statusData = await statusRes.json()
                              if (statusData.job?.status === 'success' && statusData.job?.urls?.[0]?.url) {
                                clearInterval(poll)
                                // Save the exported image URL back to the post
                                await fetch('/api/content/campaigns/' + id + '/posts', {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ post_id: post.id, canva_image_url: statusData.job.urls[0].url }),
                                })
                                setPosts(ps => ps.map(p => p.id === post.id ? { ...p, canva_image_url: statusData.job.urls[0].url } : p))
                                if (activePost?.id === post.id) setActivePost(prev => prev ? { ...prev, canva_image_url: statusData.job.urls[0].url } : prev)
                                alert('Image imported from Canva!')
                              } else if (attempts > 20) {
                                clearInterval(poll)
                                alert('Export timed out. Try again.')
                              }
                            }, 3000)
                          } catch (e) { alert('Export error: ' + (e instanceof Error ? e.message : 'Unknown')) }
                        }}
                        style={{ padding: '8px 12px', fontSize: '12px', fontWeight: 700, color: '#00897B', background: 'rgba(0,137,123,0.08)', border: '1px solid rgba(0,137,123,0.2)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Import
                      </button>
                    </div>
                  </div>
                )}

                {/* Copy — editable */}
                <label style={{ fontSize: '13px', fontWeight: 700, color: '#0F1923', letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Copy</label>
                <textarea
                  value={post.text}
                  onChange={e => updatePostText(post.id, e.target.value)}
                  rows={8}
                  placeholder="No copy yet — click Generate below."
                  style={{ width: '100%', padding: '12px', background: '#FFFFFF', border: '1px solid #9EC8C8', borderRadius: '10px', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.65, outline: 'none', boxSizing: 'border-box' }}
                />

                {post.revision_note && (
                  <div style={{ background: 'rgba(255,107,107,0.08)', borderLeft: '3px solid #FF6B6B', padding: '10px 14px', borderRadius: '0 8px 8px 0', fontSize: '13px', color: '#FF6B6B', marginTop: '10px' }}>
                    <strong>Revision requested:</strong> {post.revision_note}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
                  <button className="cp-btn cp-btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    disabled={generating[post.id]} onClick={() => generatePost(post)}>
                    {generating[post.id]
                      ? <svg className="spin" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-9-9"/></svg>
                      : <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                    }
                    {post.status === 'planned' ? 'Generate' : 'Regenerate'}
                  </button>
                  {(post.status === 'generated' || post.status === 'planned') && post.text && (
                    <button className="cp-btn cp-btn-lime" disabled={busyId === post.id} onClick={() => approvePost(post.id)}>
                      {busyId === post.id ? '…' : 'Approve'}
                    </button>
                  )}
                  {post.status === 'generated' && (
                    <button className="cp-btn cp-btn-red" onClick={() => { setActivePost(null); setRejectId(post.id); setRejectNote('') }}>Request Revision</button>
                  )}
                  {post.status === 'approved' && campaign?.event_id && (
                    <button className="cp-btn cp-btn-teal" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                      disabled={publishingId === post.id} onClick={() => publishPost(post.id)}>
                      {publishingId === post.id
                        ? <><svg className="spin" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-9-9"/></svg> Publishing…</>
                        : <><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg> Publish Now</>
                      }
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── REJECT MODAL ──────────────────────────────────────────────────── */}
      {rejectId && (
        <div className="modal-bg" onClick={() => setRejectId(null)}>
          <div className="modal-box" style={{ maxWidth: '460px' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '24px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginBottom: '6px' }}>Request Revision</div>
              <div style={{ fontSize: '13px', color: '#0F1923', marginBottom: '18px' }}>Describe what needs to change. The post goes back to Generated status.</div>
              <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)}
                placeholder="e.g. Too generic. Mention the AI in Banking theme specifically. Add a CTA to register."
                rows={4}
                style={{ width: '100%', padding: '11px 14px', background: '#FFFFFF', border: '1px solid #9EC8C8', borderRadius: '10px', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', resize: 'none', lineHeight: 1.65, outline: 'none', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button onClick={() => setRejectId(null)} className="cp-btn cp-btn-ghost" style={{ flex: 1 }}>Cancel</button>
                <button onClick={rejectPost} disabled={!rejectNote.trim() || busyId === rejectId}
                  style={{ flex: 1, padding: '10px', borderRadius: '9px', background: '#DC2626', border: 'none', color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer', opacity: rejectNote.trim() ? 1 : 0.4 }}>
                  Send for Revision
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
