'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import NavBar, { MOD_EVENTPILOT } from '@/app/components/NavBar'
import PlatformMenu from '@/app/components/PlatformMenu'

const C = {
  bg:      '#E8EEF4',
  surface: '#FFFFFF',
  border:  '#DDE8EE',
  text:    '#0F1923',
  muted:   '#5B7080',
  teal:    '#00695C',
  green:   '#C0F43C',
}

const CATEGORY_META: Record<string, { label: string; color: string; bg: string; desc: string }> = {
  prompt:     { label: 'Prompt',     color: '#0E7490', bg: 'rgba(14,116,144,0.1)',   desc: 'A reusable AI prompt' },
  use_case:   { label: 'Use Case',   color: '#7C3AED', bg: 'rgba(124,58,237,0.1)',  desc: 'A workflow or task you used AI for' },
  automation: { label: 'Automation', color: '#166534', bg: 'rgba(22,101,52,0.1)',   desc: 'A Zapier/Make/script automation' },
  tip:        { label: 'Tip',        color: '#92400E', bg: 'rgba(146,64,14,0.1)',   desc: 'A quick AI tip or shortcut' },
}

const ALL_CATEGORIES = ['all', 'prompt', 'use_case', 'automation', 'tip']

type Post = {
  id: string
  staff_id: string
  staff_name: string
  department: string | null
  category: string
  title: string
  body: string
  tool_name: string | null
  likes: number
  created_at: string
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function CommunityContent() {
  const searchParams = useSearchParams()
  const staffId   = searchParams.get('id')   ?? localStorage.getItem('tai_staff_id') ?? ''
  const staffName = searchParams.get('name') ?? ''
  const staffDept = searchParams.get('dept') ?? ''

  const [posts,      setPosts]      = useState<Post[]>([])
  const [total,      setTotal]      = useState(0)
  const [loading,    setLoading]    = useState(true)
  const [catFilter,  setCatFilter]  = useState('all')
  const [deptFilter, setDeptFilter] = useState('all')
  const [likedIds,   setLikedIds]   = useState<Set<string>>(new Set())
  const [showForm,   setShowForm]   = useState(false)
  const [form,       setForm]       = useState({ category: 'prompt', title: '', body: '', tool_name: '' })
  const [posting,    setPosting]    = useState(false)
  const [postMsg,    setPostMsg]    = useState('')

  useEffect(() => { load() }, [catFilter, deptFilter])

  async function load() {
    setLoading(true)
    const params = new URLSearchParams({ limit: '30' })
    if (catFilter  !== 'all') params.set('category', catFilter)
    if (deptFilter !== 'all') params.set('dept', deptFilter)
    const res  = await fetch(`/api/community?${params}`)
    const data = await res.json()
    setPosts(data.posts ?? [])
    setTotal(data.total ?? 0)
    setLoading(false)
  }

  async function like(postId: string) {
    if (!staffId) return
    const wasLiked = likedIds.has(postId)
    setLikedIds(prev => {
      const next = new Set(prev)
      wasLiked ? next.delete(postId) : next.add(postId)
      return next
    })
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes: p.likes + (wasLiked ? -1 : 1) } : p))
    await fetch('/api/community', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: postId, staff_id: staffId }),
    })
  }

  async function submitPost() {
    if (!form.title.trim() || !form.body.trim()) { setPostMsg('Title and description are required'); return }
    if (!staffId || !staffName) { setPostMsg('Please open this page from your dashboard'); return }
    setPosting(true)
    setPostMsg('')
    const res = await fetch('/api/community', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staff_id: staffId, staff_name: staffName, department: staffDept || null, ...form }),
    })
    setPosting(false)
    if (!res.ok) { const d = await res.json(); setPostMsg(d.error ?? 'Failed to post'); return }
    setForm({ category: 'prompt', title: '', body: '', tool_name: '' })
    setShowForm(false)
    load()
  }

  const depts = Array.from(new Set(posts.map(p => p.department).filter(Boolean))) as string[]

  return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: C.bg, minHeight: '100vh', color: C.text }}>
      <NavBar module={MOD_EVENTPILOT} />
      <PlatformMenu staffId={staffId} />

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: '28px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: C.text, marginBottom: '4px' }}>AI Community</div>
            <div style={{ fontSize: '14px', color: C.muted }}>Share prompts, use cases, and automation ideas with the team — {total} posts so far</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Link href={`/dashboard?id=${staffId}`}
              style={{ fontSize: '13px', fontWeight: 700, color: C.muted, textDecoration: 'none', padding: '9px 16px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px' }}>
              Back to Dashboard
            </Link>
            <button onClick={() => setShowForm(!showForm)}
              style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF', padding: '9px 18px', background: C.teal, border: 'none', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit' }}>
              + Share Something
            </button>
          </div>
        </div>

        {/* Post form */}
        {showForm && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: C.text, marginBottom: '18px' }}>Share with the team</div>
            {/* Category */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: C.muted, display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>What are you sharing?</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {Object.entries(CATEGORY_META).map(([key, m]) => (
                  <button key={key} onClick={() => setForm(s => ({ ...s, category: key }))}
                    style={{ padding: '7px 14px', borderRadius: '8px', border: `2px solid ${form.category === key ? m.color : C.border}`, background: form.category === key ? m.bg : C.surface, fontSize: '12px', fontWeight: 700, color: form.category === key ? m.color : C.muted, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {m.label}
                    <span style={{ fontWeight: 400, fontSize: '11px', color: C.muted, display: 'block' }}>{m.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            {/* Title */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: C.muted, display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Title *</label>
              <input value={form.title} onChange={e => setForm(s => ({ ...s, title: e.target.value }))}
                placeholder={form.category === 'prompt' ? 'e.g. "Meeting recap email generator"' : form.category === 'use_case' ? 'e.g. "Shortlisting CVs with ChatGPT"' : form.category === 'automation' ? 'e.g. "Auto-notify Slack when a form is submitted"' : 'e.g. "Always add your role to prompts"'}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '13px', fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }} />
            </div>
            {/* Body */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: C.muted, display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {form.category === 'prompt' ? 'The prompt (copy-paste ready)' : 'Description'} *
              </label>
              <textarea value={form.body} onChange={e => setForm(s => ({ ...s, body: e.target.value }))} rows={5}
                placeholder={form.category === 'prompt' ? 'Paste your full prompt here. Include [PLACEHOLDERS] for variables others need to fill in.' : 'Describe what you did, what AI tool you used, and what result you got. The more specific, the more useful.'}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '13px', fontFamily: 'inherit', color: C.text, resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
            {/* Tool */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: C.muted, display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>AI tool used (optional)</label>
              <input value={form.tool_name} onChange={e => setForm(s => ({ ...s, tool_name: e.target.value }))}
                placeholder="e.g. ChatGPT, Claude, Perplexity, Zapier, Make..."
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '13px', fontFamily: 'inherit', color: C.text, boxSizing: 'border-box' }} />
            </div>
            {postMsg && <div style={{ fontSize: '12px', color: '#C2410C', marginBottom: '12px' }}>{postMsg}</div>}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={submitPost} disabled={posting}
                style={{ padding: '10px 24px', background: C.teal, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: posting ? 'not-allowed' : 'pointer', opacity: posting ? 0.6 : 1, fontFamily: 'inherit' }}>
                {posting ? 'Posting…' : 'Post to Community'}
              </button>
              <button onClick={() => setShowForm(false)}
                style={{ padding: '10px 20px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', color: C.muted, fontFamily: 'inherit' }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
          {ALL_CATEGORIES.map(cat => {
            const m = cat === 'all' ? null : CATEGORY_META[cat]
            const active = catFilter === cat
            return (
              <button key={cat} onClick={() => setCatFilter(cat)}
                style={{ padding: '6px 14px', borderRadius: '8px', border: `1.5px solid ${active ? (m?.color ?? C.teal) : C.border}`, background: active ? (m?.bg ?? `${C.teal}15`) : C.surface, fontSize: '12px', fontWeight: 700, color: active ? (m?.color ?? C.teal) : C.muted, cursor: 'pointer', fontFamily: 'inherit' }}>
                {cat === 'all' ? 'All' : m!.label}
              </button>
            )
          })}
          {depts.length > 0 && (
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '12px', fontFamily: 'inherit', color: C.muted, background: C.surface, marginLeft: 'auto' }}>
              <option value="all">All departments</option>
              {depts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
        </div>

        {/* Posts */}
        {loading ? (
          <div style={{ fontSize: '13px', color: C.muted, padding: '40px', textAlign: 'center' }}>Loading…</div>
        ) : posts.length === 0 ? (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '48px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>
              <svg width="40" height="40" fill="none" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ margin: '0 auto', display: 'block' }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: C.text, marginBottom: '6px' }}>No posts yet</div>
            <div style={{ fontSize: '13px', color: C.muted, marginBottom: '20px' }}>Be the first to share a prompt or use case with the team</div>
            <button onClick={() => setShowForm(true)}
              style={{ padding: '10px 24px', background: C.teal, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Share Something
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {posts.map(post => {
              const m = CATEGORY_META[post.category] ?? CATEGORY_META.tip
              const isLiked = likedIds.has(post.id)
              return (
                <div key={post.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', padding: '20px 22px' }}>
                  {/* Header row */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                    {/* Avatar initial */}
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: m.bg, border: `2px solid ${m.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '13px', fontWeight: 800, color: m.color }}>
                      {post.staff_name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '2px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: C.text }}>{post.staff_name}</span>
                        {post.department && <span style={{ fontSize: '11px', color: C.muted }}>{post.department}</span>}
                        <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: m.bg, color: m.color, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{m.label}</span>
                      </div>
                      <div style={{ fontSize: '11px', color: C.muted }}>{timeAgo(post.created_at)}</div>
                    </div>
                  </div>
                  {/* Title */}
                  <div style={{ fontSize: '14px', fontWeight: 800, color: C.text, marginBottom: '8px' }}>{post.title}</div>
                  {/* Body */}
                  <div style={{ fontSize: '13px', color: '#2D3E50', lineHeight: 1.65, marginBottom: '12px', whiteSpace: 'pre-wrap' }}>{post.body}</div>
                  {/* Footer */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {post.tool_name && (
                      <span style={{ fontSize: '11px', fontWeight: 700, color: C.teal, background: `${C.teal}10`, border: `1px solid ${C.teal}30`, padding: '3px 9px', borderRadius: '20px' }}>
                        {post.tool_name}
                      </span>
                    )}
                    <button onClick={() => like(post.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 12px', borderRadius: '8px', border: `1.5px solid ${isLiked ? C.teal : C.border}`, background: isLiked ? `${C.teal}10` : 'transparent', fontSize: '12px', fontWeight: 700, color: isLiked ? C.teal : C.muted, cursor: staffId ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                      <svg width="13" height="13" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                      {post.likes > 0 && post.likes}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default function CommunityPage() {
  return (
    <Suspense>
      <CommunityContent />
    </Suspense>
  )
}
