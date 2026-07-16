'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'

type Message = { role: 'user' | 'assistant'; text: string; flagged?: boolean }

const SUGGESTED = [
  'How is my AI Readiness Score calculated?',
  'Which courses should I start with?',
  'What is the difference between Foundation and Adoption track?',
  'How does the recommendation engine decide what to show me?',
  'What does AI-Aware mean and how do I move to AI-Ready?',
  'How do I use the Team Dashboard as a manager?',
]

const SESSION_LIMIT  = 10
const COOLDOWN_MS    = 3 * 60 * 60 * 1000  // 3 hours
const BLOCK_KEY      = 'pilot_blocked_until'

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0m 0s'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1_000)
  return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'

  function renderText(text: string) {
    const lines = text.split('\n')
    return lines.map((line, i) => {
      if (!line.trim()) return <div key={i} style={{ height: '6px' }} />

      if (line.startsWith('## ') || line.startsWith('### ')) {
        return (
          <div key={i} style={{ fontSize: '13px', fontWeight: 800, color: '#0F1923', marginTop: '12px', marginBottom: '4px' }}>
            {line.replace(/^#{2,3}\s/, '')}
          </div>
        )
      }

      if (line.startsWith('- ') || line.startsWith('• ')) {
        const content = line.replace(/^[-•]\s/, '')
        return (
          <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '3px' }}>
            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#00897B', marginTop: '9px', flexShrink: 0 }} />
            <span style={{ fontSize: '13px', color: '#2D3E50', lineHeight: 1.65 }}>{renderInline(content)}</span>
          </div>
        )
      }

      return (
        <p key={i} style={{ fontSize: '13px', color: '#2D3E50', lineHeight: 1.65, margin: '0 0 4px' }}>
          {renderInline(line)}
        </p>
      )
    })
  }

  function renderInline(text: string) {
    const parts = text.split(/(\*\*[^*]+\*\*)/g)
    return parts.map((part, i) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={i} style={{ color: '#0F1923', fontWeight: 700 }}>{part.slice(2, -2)}</strong>
        : part
    )
  }

  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: '16px', alignItems: 'flex-end', gap: '8px' }}>
      {!isUser && (
        <div style={{ width: '30px', height: '30px', borderRadius: '10px', background: '#00897B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginBottom: '2px' }}>
          <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        </div>
      )}

      <div style={{
        maxWidth: '72%',
        padding: isUser ? '12px 16px' : '16px 20px',
        borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        background: isUser ? '#00897B' : '#FFFFFF',
        border: isUser ? 'none' : '1px solid #DDE8EE',
      }}>
        {isUser ? (
          <p style={{ fontSize: '13px', color: 'white', margin: 0, lineHeight: 1.65 }}>{msg.text}</p>
        ) : (
          <div>{renderText(msg.text)}</div>
        )}
        {msg.flagged && (
          <div style={{ marginTop: '10px', fontSize: '13px', color: '#FF6B6B', fontWeight: 600 }}>
            This question was outside my scope.
          </div>
        )}
      </div>

      {isUser && (
        <div style={{ width: '30px', height: '30px', borderRadius: '10px', background: '#FFFFFF', border: '1px solid #DDE8EE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginBottom: '2px' }}>
          <svg width="13" height="13" fill="none" stroke="#0F1923" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
      )}
    </div>
  )
}

export default function ChatPage() {
  const [messages,      setMessages]      = useState<Message[]>([])
  const [input,         setInput]         = useState('')
  const [loading,       setLoading]       = useState(false)
  const [staffId,       setStaffId]       = useState<string | null>(null)
  const [sessionCount,  setSessionCount]  = useState(0)
  const [blockedUntil,  setBlockedUntil]  = useState<number | null>(null)
  const [timeLeft,      setTimeLeft]      = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  /* ── Load staff id + check existing cooldown block ── */
  useEffect(() => {
    const id = localStorage.getItem('eventpilot_staff_id') ?? localStorage.getItem('tai_staff_id')
    if (id) setStaffId(id)

    const stored = localStorage.getItem(BLOCK_KEY)
    if (stored) {
      const until = parseInt(stored, 10)
      if (until > Date.now()) {
        setBlockedUntil(until)
      } else {
        localStorage.removeItem(BLOCK_KEY)
      }
    }
  }, [])

  /* ── Live countdown timer ── */
  useEffect(() => {
    if (!blockedUntil) return
    const tick = () => {
      const remaining = blockedUntil - Date.now()
      if (remaining <= 0) {
        setBlockedUntil(null)
        localStorage.removeItem(BLOCK_KEY)
        setTimeLeft('')
      } else {
        setTimeLeft(formatCountdown(remaining))
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [blockedUntil])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(text: string) {
    if (!text.trim() || loading || blockedUntil) return
    const question = text.trim()
    setInput('')

    const newCount = sessionCount + 1
    setSessionCount(newCount)

    const userMsg: Message = { role: 'user', text: question }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const res = await fetch('/api/ask', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          question,
          history:  messages.slice(-8),
          staff_id: staffId,
        }),
      })
      const data = await res.json()

      /* ── Daily server-side limit hit ── */
      if (res.status === 429 && data.daily_limit) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: data.error,
        }])
        // Also lock client for the rest of the day (approximate: until midnight)
        const msUntilMidnight = (() => {
          const now = new Date()
          const midnight = new Date(now)
          midnight.setHours(24, 0, 0, 0)
          return midnight.getTime() - now.getTime()
        })()
        const until = Date.now() + msUntilMidnight
        localStorage.setItem(BLOCK_KEY, String(until))
        setBlockedUntil(until)
      } else if (!res.ok || data.error) {
        setMessages(prev => [...prev, { role: 'assistant', text: data.error ?? 'Something went wrong. Please try again.' }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', text: data.answer, flagged: data.flagged }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Connection error. Please check your network and try again.' }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }

    /* ── Apply session limit after sending ── */
    if (newCount >= SESSION_LIMIT && !blockedUntil) {
      const until = Date.now() + COOLDOWN_MS
      localStorage.setItem(BLOCK_KEY, String(until))
      setBlockedUntil(until)
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const isEmpty    = messages.length === 0
  const isBlocked  = !!blockedUntil
  const remaining  = SESSION_LIMIT - sessionCount
  const showQuota  = !isBlocked && sessionCount > 0 && remaining <= 3

  return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#E8EEF4', minHeight: '100vh', display: 'flex', flexDirection: 'column', color: '#0F1923' }}>

      {/* Page header */}
      <PageHeader
        eyebrow="Pilot AI"
        title="AI Learning Assistant"
        description={`${SESSION_LIMIT} questions per day`}
        actions={messages.length > 0 && !isBlocked ? (
          <button className="tbtn tbtn-ghost" onClick={() => { setMessages([]); setSessionCount(0) }}>
            New conversation
          </button>
        ) : undefined}
      />

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '760px', width: '100%', margin: '0 auto', padding: '0 24px' }}>

        {/* Empty state */}
        {isEmpty && !isBlocked && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', textAlign: 'center', padding: '32px 0 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
              <div style={{ width: '52px', height: '52px', background: 'linear-gradient(135deg, #00897B 0%, #00695C 100%)', border: '1px solid #00695C', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="24" height="24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </div>
              <h1 style={{ fontSize: '36px', fontWeight: 900, color: '#0F1923', margin: 0, letterSpacing: '-0.3px' }}>Talk to Pilot</h1>
            </div>
            <p style={{ fontSize: '13px', color: '#2D3E50', margin: '0 0 36px', maxWidth: '380px', lineHeight: 1.65 }}>
              Your AI learning assistant. Ask me anything about your courses, your AI Readiness Score, or how to use Event Pilot.
            </p>

            {/* Suggested questions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', width: '100%', maxWidth: '600px' }}>
              {SUGGESTED.map(q => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  style={{ padding: '12px 16px', background: '#FFFFFF', border: '1px solid #DDE8EE', borderLeft: '3px solid #00897B', borderRadius: '12px', color: '#0F1923', fontSize: '13px', fontWeight: 600, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', lineHeight: 1.45, transition: 'all 0.15s', boxShadow: '0 2px 6px rgba(15,25,35,0.06)' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#00897B'; e.currentTarget.style.background = '#F4FFFE' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#DDE8EE'; e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.borderLeftColor = '#00897B' }}
                >
                  {q}
                </button>
              ))}
            </div>

            {/* Scope note */}
            <div style={{ marginTop: '28px', padding: '12px 20px', background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '10px', fontSize: '13px', color: '#2D3E50', lineHeight: 1.65, maxWidth: '500px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,165,163,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
              Pilot is here to support your learning — ask about your courses, AI Readiness Score, or how to get the most from the platform.
              For HR, IT, or personal matters, please speak to your manager or the relevant team.
              <span style={{ display: 'block', marginTop: '8px', borderTop: '1px solid #D8EAEB', paddingTop: '8px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(192,244,60,0.08)', border: '1px solid rgba(192,244,60,0.2)', borderRadius: '8px', padding: '5px 12px', color: '#3D6B00', fontWeight: 700 }}>
                  <svg width="12" height="12" fill="none" stroke="#007A6E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  You have {SESSION_LIMIT} questions per day — resets at midnight.
                </span>
              </span>
            </div>
          </div>
        )}

        {/* Conversation */}
        {!isEmpty && !isBlocked && (
          <div style={{ flex: 1, paddingTop: '28px', paddingBottom: '16px', overflowY: 'auto' }}>
            {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', marginBottom: '16px' }}>
                <div style={{ width: '30px', height: '30px', borderRadius: '10px', background: '#00897B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                </div>
                <div style={{ padding: '14px 18px', background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '18px 18px 18px 4px', display: 'flex', gap: '5px', alignItems: 'center' }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00897B', animation: `bounce 1.2s ${i * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {/* Cooldown wall — shown when session or daily limit is hit */}
        {isBlocked && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '48px 0' }}>
            <div style={{ width: '64px', height: '64px', background: 'rgba(139,26,26,0.1)', border: '1px solid rgba(139,26,26,0.25)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
              <svg width="28" height="28" fill="none" stroke="#8B1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <h2 style={{ fontSize: '36px', fontWeight: 900, color: '#0F1923', margin: '0 0 10px', letterSpacing: '-0.3px' }}>
              Session limit reached
            </h2>
            <p style={{ fontSize: '13px', color: '#2D3E50', margin: '0 0 28px', maxWidth: '340px', lineHeight: 1.65 }}>
              You have used your {SESSION_LIMIT} questions for this session. Pilot will be available again in:
            </p>
            <div style={{ background: 'rgba(139,26,26,0.08)', border: '1px solid rgba(139,26,26,0.2)', borderRadius: '16px', padding: '20px 40px', marginBottom: '32px' }}>
              <div style={{ fontSize: '36px', fontWeight: 900, color: '#8B1A1A', letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums' }}>
                {timeLeft}
              </div>
              <div style={{ fontSize: '13px', color: '#0F1923', marginTop: '4px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                Remaining
              </div>
            </div>
            <p style={{ fontSize: '13px', color: '#0F1923', maxWidth: '320px', lineHeight: 1.65, margin: 0 }}>
              This keeps Pilot focused and available for everyone. Your learning courses and dashboard remain fully accessible in the meantime.
            </p>
            <Link
              href={staffId ? `/dashboard?id=${staffId}` : '/login'}
              style={{ marginTop: '24px', display: 'inline-block', fontSize: '13px', fontWeight: 700, color: '#0F1923', background: '#FFFFFF', border: '1px solid #DDE8EE', padding: '10px 24px', borderRadius: '10px', textDecoration: 'none' }}
            >
              Back to My Dashboard
            </Link>
          </div>
        )}

        {/* Input area — hidden when blocked */}
        {!isBlocked && (
          <div style={{ paddingBottom: '28px', paddingTop: '12px', flexShrink: 0 }}>
            {/* Quota warning when 3 or fewer messages left */}
            {showQuota && (
              <div style={{ marginBottom: '10px', padding: '8px 14px', background: 'rgba(139,26,26,0.08)', border: '1px solid rgba(139,26,26,0.2)', borderRadius: '10px', fontSize: '13px', color: '#8B1A1A', fontWeight: 600, textAlign: 'center' }}>
                {remaining} question{remaining !== 1 ? 's' : ''} remaining in this session
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '16px', padding: '12px 14px', boxShadow: '0 1px 4px rgba(0,165,163,0.06), 0 1px 2px rgba(0,0,0,0.04)' }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Talk to Pilot anything about your learning journey…"
                rows={1}
                disabled={loading}
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#0F1923', fontSize: '13px', fontFamily: 'inherit', resize: 'none', lineHeight: 1.65, maxHeight: '120px', overflowY: 'auto', padding: 0 }}
                onInput={e => {
                  const el = e.currentTarget
                  el.style.height = 'auto'
                  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
                }}
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || loading}
                style={{ width: '36px', height: '36px', borderRadius: '10px', background: input.trim() && !loading ? '#00897B' : '#E5E7EB', border: 'none', cursor: input.trim() && !loading ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.15s' }}
              >
                <svg width="15" height="15" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
            <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '12px', color: '#5B7080', lineHeight: 1.65 }}>
              Press Enter to send · Shift+Enter for new line
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }
        textarea::placeholder { color: #9CA3AF; }
      `}</style>
    </div>
  )
}
