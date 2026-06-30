'use client'

import { useState, useEffect, useRef, Suspense, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import NavBar, { ProfileMenu, NotificationBell, MOD_EVENTPILOT } from '@/app/components/NavBar'

/* ── Types ──────────────────────────────────────────────────────── */
type Conversation = {
  partner_id:   string
  partner_name: string
  last_body:    string
  last_time:    string
  unread:       number
  is_mine:      boolean
}

type Message = {
  id:         string
  from_id:    string
  from_name:  string
  to_id:      string
  to_name:    string
  body:       string
  read:       boolean
  created_at: string
}

type StaffEntry = { id: string; name: string; department: string | null; role: string | null }

/* ── Helpers ─────────────────────────────────────────────────────── */
function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 2)    return 'just now'
  if (m < 60)   return `${m}m ago`
  if (m < 1440) return `${Math.floor(m / 60)}h ago`
  const d = Math.floor(m / 1440)
  if (d < 7)    return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function timeStamp(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) +
    ', ' + new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

const AVATAR_COLORS = [
  '#00695C','#1565C0','#6A1B9A','#AD1457','#37474F',
  '#BF360C','#0277BD','#2E7D32','#4527A0','#00838F',
]
function avatarColor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

/* ── Main component ──────────────────────────────────────────────── */
function MessagesContent() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const withParam    = searchParams.get('with')

  const [sid,          setSid]          = useState<string | null>(null)
  const [myName,       setMyName]       = useState('')
  const [conversations,setConversations]= useState<Conversation[]>([])
  const [messages,     setMessages]     = useState<Message[]>([])
  const [activeId,     setActiveId]     = useState<string | null>(withParam)
  const [activeName,   setActiveName]   = useState('')
  const [body,         setBody]         = useState('')
  const [sending,      setSending]      = useState(false)
  const [loadingInbox, setLoadingInbox] = useState(true)
  const [loadingThread,setLoadingThread]= useState(false)
  const [showCompose,  setShowCompose]  = useState(false)
  const [staffList,    setStaffList]    = useState<StaffEntry[]>([])
  const [staffSearch,  setStaffSearch]  = useState('')
  const threadEndRef = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLTextAreaElement>(null)

  // Resolve session
  useEffect(() => {
    fetch('/api/auth/session')
      .then(r => r.json())
      .then(s => {
        if (s?.sid) {
          setSid(s.sid)
          // Fetch own name
          fetch(`/api/staff-list?id=${s.sid}`)
            .then(r => r.json())
            .then(d => { if (d?.name) setMyName(d.name) })
            .catch(() => {})
        }
      })
      .catch(() => {})
  }, [])

  const loadInbox = useCallback(async () => {
    setLoadingInbox(true)
    const res = await fetch('/api/messages/inbox')
    const data = await res.json()
    const list = Array.isArray(data) ? data : []
    list.sort((a: Conversation, b: Conversation) => new Date(b.last_time).getTime() - new Date(a.last_time).getTime())
    setConversations(list)
    setLoadingInbox(false)
  }, [])

  const loadThread = useCallback(async (partnerId: string, partnerName: string) => {
    setLoadingThread(true)
    setActiveId(partnerId)
    setActiveName(partnerName)
    router.replace(`/messages?with=${partnerId}`, { scroll: false })
    const res = await fetch(`/api/messages?with=${partnerId}`)
    const data = await res.json()
    setMessages(Array.isArray(data) ? data : [])
    setLoadingThread(false)
    // Mark unread in conversation list
    setConversations(prev => prev.map(c => c.partner_id === partnerId ? { ...c, unread: 0 } : c))
  }, [router])

  useEffect(() => { if (sid) loadInbox() }, [sid, loadInbox])

  // Auto-open thread from ?with= param (run once when inbox loads)
  const threadOpenedRef = useRef(false)
  useEffect(() => {
    if (!withParam || !sid || loadingInbox || threadOpenedRef.current) return
    threadOpenedRef.current = true
    const conv = conversations.find(c => c.partner_id === withParam)
    if (conv) {
      loadThread(conv.partner_id, conv.partner_name)
    } else {
      fetch(`/api/staff-list?id=${withParam}`)
        .then(r => r.json())
        .then(d => {
          if (d?.id) loadThread(d.id, d.name)
        }).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withParam, sid, loadingInbox])

  // Scroll to bottom only when message count increases (new message sent/received), not on initial load
  const prevMsgCountRef = useRef(0)
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current && prevMsgCountRef.current > 0) {
      threadEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevMsgCountRef.current = messages.length
  }, [messages])

  // Poll active thread every 8s
  useEffect(() => {
    if (!activeId) return
    const t = setInterval(async () => {
      const res = await fetch(`/api/messages?with=${activeId}`)
      const data = await res.json()
      if (Array.isArray(data)) setMessages(data)
    }, 8000)
    return () => clearInterval(t)
  }, [activeId])

  async function send() {
    if (!body.trim() || !activeId || !sid || sending) return
    setSending(true)
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_id: activeId, body: body.trim() }),
    })
    const data = await res.json()
    setSending(false)
    if (res.ok) {
      setBody('')
      setMessages(prev => [...prev, data])
      setConversations(prev => {
        const exists = prev.find(c => c.partner_id === activeId)
        if (exists) {
          return [{ ...exists, last_body: body.trim(), last_time: data.created_at, is_mine: true }, ...prev.filter(c => c.partner_id !== activeId)]
        }
        return [{ partner_id: activeId, partner_name: activeName, last_body: body.trim(), last_time: data.created_at, unread: 0, is_mine: true }, ...prev]
      })
      inputRef.current?.focus()
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  async function loadStaffList() {
    const res = await fetch('/api/staff-list')
    const d   = await res.json()
    const list = Array.isArray(d) ? d : (d.staff ?? [])
    setStaffList(list.filter((s: StaffEntry) => s.id !== sid))
  }

  function openCompose() {
    setShowCompose(true)
    if (!staffList.length) loadStaffList()
  }

  const filteredStaff = staffList.filter(s =>
    !staffSearch || s.name.toLowerCase().includes(staffSearch.toLowerCase()) ||
    (s.department ?? '').toLowerCase().includes(staffSearch.toLowerCase())
  )

  const C = {
    bg:      '#E8EEF4',
    surface: '#FFFFFF',
    border:  '#DDE8EE',
    text:    '#0F1923',
    muted:   '#5B7080',
    teal:    '#00695C',
  }

  return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: C.bg, minHeight: '100vh', color: C.text, display: 'flex', flexDirection: 'column' }}>
      <NavBar
        module={MOD_EVENTPILOT}
        subtitle="Messages"
        homeHref={sid ? `/dashboard?id=${sid}` : '/dashboard'}
        rightSlot={<>
          <NotificationBell staffId={sid ?? undefined} />
          <ProfileMenu />
        </>}
      />

      <div style={{ flex: 1, display: 'flex', maxWidth: '1100px', width: '100%', margin: '0 auto', padding: '24px', gap: '16px', minHeight: 0, height: 'calc(100vh - 64px)', boxSizing: 'border-box' }}>

        {/* ── Left: Inbox ─────────────────────────────────────────── */}
        <div style={{ width: '300px', flexShrink: 0, display: 'flex', flexDirection: 'column', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', overflow: 'hidden' }}>
          {/* Inbox header */}
          <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: C.text }}>Inbox</div>
              {conversations.reduce((t, c) => t + c.unread, 0) > 0 && (
                <div style={{ fontSize: '11px', color: '#DC2626', fontWeight: 700, marginTop: '2px' }}>
                  {conversations.reduce((t, c) => t + c.unread, 0)} unread
                </div>
              )}
            </div>
            <button onClick={openCompose}
              style={{ width: '30px', height: '30px', borderRadius: '8px', background: C.teal, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              title="New message"
            >
              <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>

          {/* Conversation list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loadingInbox ? (
              <div style={{ padding: '32px', textAlign: 'center', fontSize: '13px', color: C.muted }}>Loading…</div>
            ) : conversations.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                <svg width="32" height="32" fill="none" stroke={C.border} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ display: 'block', margin: '0 auto 12px' }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <div style={{ fontSize: '13px', fontWeight: 700, color: C.muted, marginBottom: '6px' }}>No messages yet</div>
                <button onClick={openCompose} style={{ fontSize: '12px', fontWeight: 700, color: C.teal, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
                  Start a conversation
                </button>
              </div>
            ) : (
              conversations.map(c => {
                const isActive = activeId === c.partner_id
                const color    = avatarColor(c.partner_id)
                return (
                  <button key={c.partner_id}
                    onClick={() => loadThread(c.partner_id, c.partner_name)}
                    style={{ width: '100%', padding: '12px 16px', display: 'flex', gap: '10px', alignItems: 'flex-start', background: isActive ? `${C.teal}10` : 'transparent', borderLeft: isActive ? `3px solid ${C.teal}` : '3px solid transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', borderBottom: `1px solid ${C.border}` }}
                  >
                    {/* Avatar */}
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '13px', fontWeight: 800, color: '#fff' }}>
                      {initials(c.partner_name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                        <span style={{ fontSize: '13px', fontWeight: c.unread > 0 ? 800 : 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>{c.partner_name}</span>
                        <span style={{ fontSize: '10px', color: C.muted, flexShrink: 0 }}>{timeAgo(c.last_time)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '12px', color: c.unread > 0 ? C.text : C.muted, fontWeight: c.unread > 0 ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {c.is_mine ? 'You: ' : ''}{c.last_body}
                        </span>
                        {c.unread > 0 && (
                          <span style={{ minWidth: '18px', height: '18px', borderRadius: '99px', background: '#DC2626', color: '#fff', fontSize: '10px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: '0 4px' }}>
                            {c.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* ── Right: Thread ────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', overflow: 'hidden', minWidth: 0 }}>
          {!activeId ? (
            /* Empty state */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '40px' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: `${C.teal}12`, border: `1.5px solid ${C.teal}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="28" height="28" fill="none" stroke={C.teal} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '15px', fontWeight: 800, color: C.text, marginBottom: '6px' }}>Select a conversation</div>
                <div style={{ fontSize: '13px', color: C.muted, lineHeight: 1.6 }}>Pick someone from the inbox or start a new message</div>
              </div>
              <button onClick={openCompose}
                style={{ padding: '10px 24px', background: C.teal, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                New Message
              </button>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: avatarColor(activeId), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                  {initials(activeName)}
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: C.text }}>{activeName}</div>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {loadingThread ? (
                  <div style={{ textAlign: 'center', color: C.muted, fontSize: '13px', padding: '40px' }}>Loading…</div>
                ) : messages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: C.muted, fontSize: '13px', padding: '40px' }}>No messages yet. Say hello!</div>
                ) : (
                  messages.map((m, i) => {
                    const isMine = m.from_id === sid
                    const showDate = i === 0 || new Date(m.created_at).toDateString() !== new Date(messages[i - 1].created_at).toDateString()
                    const color    = avatarColor(m.from_id)
                    return (
                      <div key={m.id}>
                        {showDate && (
                          <div style={{ textAlign: 'center', fontSize: '11px', color: C.muted, fontWeight: 600, marginBottom: '8px' }}>
                            {new Date(m.created_at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', gap: '8px', alignItems: 'flex-end' }}>
                          {!isMine && (
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                              {initials(m.from_name)}
                            </div>
                          )}
                          <div style={{ maxWidth: '65%' }}>
                            {!isMine && (
                              <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, marginBottom: '4px' }}>{m.from_name}</div>
                            )}
                            <div style={{ padding: '10px 14px', borderRadius: isMine ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: isMine ? C.teal : '#F1F5F9', color: isMine ? '#fff' : C.text, fontSize: '14px', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {m.body}
                            </div>
                            <div style={{ fontSize: '10px', color: C.muted, marginTop: '4px', textAlign: isMine ? 'right' : 'left' }}>
                              {timeStamp(m.created_at)}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={threadEndRef} />
              </div>

              {/* Input */}
              <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                <textarea
                  ref={inputRef}
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder={`Message ${activeName}…`}
                  rows={1}
                  style={{ flex: 1, padding: '10px 14px', borderRadius: '12px', border: `1.5px solid ${C.border}`, fontSize: '14px', fontFamily: 'inherit', color: C.text, resize: 'none', outline: 'none', lineHeight: 1.5, maxHeight: '120px', overflowY: 'auto', boxSizing: 'border-box', background: '#F8FAFC' }}
                  onInput={e => {
                    const t = e.currentTarget
                    t.style.height = 'auto'
                    t.style.height = Math.min(t.scrollHeight, 120) + 'px'
                  }}
                />
                <button onClick={send} disabled={!body.trim() || sending}
                  style={{ width: '40px', height: '40px', borderRadius: '12px', background: body.trim() ? C.teal : '#E8EEF4', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: body.trim() ? 'pointer' : 'default', flexShrink: 0, transition: 'background 0.15s' }}
                >
                  <svg width="16" height="16" fill="none" stroke={body.trim() ? '#fff' : C.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Compose modal ─────────────────────────────────────────── */}
      {showCompose && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,25,35,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
          onClick={e => { if (e.target === e.currentTarget) setShowCompose(false) }}
        >
          <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '440px', boxShadow: '0 24px 64px rgba(15,25,35,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div style={{ fontSize: '14px', fontWeight: 800, color: C.text }}>New Message</div>
              <button onClick={() => setShowCompose(false)} style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#F1F5F9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="11" height="11" fill="none" stroke={C.text} strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <input
              value={staffSearch}
              onChange={e => setStaffSearch(e.target.value)}
              placeholder="Search by name or department…"
              autoFocus
              style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: `1.5px solid ${C.border}`, fontSize: '13px', fontFamily: 'inherit', color: C.text, marginBottom: '12px', boxSizing: 'border-box', outline: 'none' }}
            />
            <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {filteredStaff.length === 0 && (
                <div style={{ padding: '24px', textAlign: 'center', fontSize: '13px', color: C.muted }}>
                  {staffList.length === 0 ? 'Loading staff…' : 'No results'}
                </div>
              )}
              {filteredStaff.map(s => (
                <button key={s.id}
                  onClick={() => {
                    setShowCompose(false)
                    setStaffSearch('')
                    setActiveName(s.name)
                    loadThread(s.id, s.name)
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '10px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%' }}
                  onMouseOver={e => (e.currentTarget.style.background = '#F8FAFC')}
                  onMouseOut={e  => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: avatarColor(s.id), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                    {initials(s.name)}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>{s.name}</div>
                    {(s.department || s.role) && <div style={{ fontSize: '11px', color: C.muted }}>{[s.role, s.department].filter(Boolean).join(' · ')}</div>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function MessagesPage() {
  return (
    <Suspense>
      <MessagesContent />
    </Suspense>
  )
}
