'use client'

import { useState, useEffect, useRef } from 'react'
import PageHeader from '@/app/components/PageHeader'

const C = {
  bg: '#E8EEF4', surface: '#FFFFFF', border: '#DDE8EE', text: '#0F1923', muted: '#5B7080',
  teal: '#00695C', tealAccent: '#00A5A3', green: '#C0F43C', purple: '#7C3AED', red: '#FF6B6B',
}

type Message = { role: 'user' | 'assistant'; text: string; flagged?: boolean }
type Status = { allowed: boolean; unlimited?: boolean; used?: number; limit?: number; remaining?: number }

const SUGGESTED = [
  'What proposals do we have for government clients?',
  'What was the commercial model in our most recent proposal?',
  'Summarise the target audience for a recent event concept.',
  'What themes have come up across our proposals?',
]

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} style={{ color: C.text, fontWeight: 700 }}>{part.slice(2, -2)}</strong>
      : part
  )
}

function renderText(text: string) {
  const lines = text.split('\n')
  return lines.map((line, i) => {
    if (!line.trim()) return <div key={i} style={{ height: '6px' }} />

    if (line.startsWith('## ') || line.startsWith('### ')) {
      return (
        <div key={i} style={{ fontSize: '13px', fontWeight: 800, color: C.text, marginTop: '12px', marginBottom: '4px' }}>
          {line.replace(/^#{2,3}\s/, '')}
        </div>
      )
    }

    if (line.startsWith('- ') || line.startsWith('• ')) {
      const content = line.replace(/^[-•]\s/, '')
      return (
        <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '3px' }}>
          <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: C.tealAccent, marginTop: '9px', flexShrink: 0 }} />
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

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: '16px', alignItems: 'flex-end', gap: '8px' }}>
      {!isUser && (
        <div style={{ width: '30px', height: '30px', borderRadius: '10px', background: C.tealAccent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginBottom: '2px' }}>
          <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        </div>
      )}
      <div style={{
        maxWidth: '72%',
        padding: isUser ? '12px 16px' : '16px 20px',
        borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        background: isUser ? C.tealAccent : C.surface,
        border: isUser ? 'none' : `1px solid ${C.border}`,
      }}>
        {isUser ? (
          <p style={{ fontSize: '13px', color: 'white', margin: 0, lineHeight: 1.65 }}>{msg.text}</p>
        ) : (
          <div>{renderText(msg.text)}</div>
        )}
        {msg.flagged && (
          <div style={{ marginTop: '10px', fontSize: '13px', color: C.red, fontWeight: 600 }}>
            This question was outside my scope.
          </div>
        )}
      </div>
    </div>
  )
}

export default function KnowledgeAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [status,   setStatus]   = useState<Status | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  function refreshStatus() {
    fetch('/api/kb/bd-chat').then(r => r.json()).then(setStatus).catch(() => setStatus({ allowed: false }))
  }

  useEffect(() => { refreshStatus() }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(text: string) {
    if (!text.trim() || loading) return
    const question = text.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: question }])
    setLoading(true)

    try {
      const res = await fetch('/api/kb/bd-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history: messages.slice(-8) }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setMessages(prev => [...prev, { role: 'assistant', text: data.error ?? 'Something went wrong. Please try again.' }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', text: data.answer, flagged: data.flagged }])
      }
      refreshStatus()
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Connection error. Please check your network and try again.' }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const isEmpty = messages.length === 0
  const capped = status?.allowed && !status.unlimited && (status.remaining ?? 1) <= 0

  if (status && !status.allowed) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'var(--font-manrope), Manrope, sans-serif' }}>
        <PageHeader title="Knowledge Assistant" />
        <div style={{ maxWidth: '480px', margin: '80px auto', textAlign: 'center' }}>
          <div style={{ fontSize: '16px', fontWeight: 800, color: C.text, marginBottom: '8px' }}>Knowledge Assistant access required</div>
          <div style={{ fontSize: '13px', color: C.muted }}>Ask an admin to grant you Knowledge Assistant access from the Toolkit.</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'var(--font-manrope), Manrope, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <PageHeader title="Knowledge Assistant" actions={<>
        {status?.allowed && !status.unlimited && (
          <span style={{ fontSize: '12px', fontWeight: 700, color: capped ? C.red : C.muted }}>
            {status.remaining}/{status.limit} messages left today
          </span>
        )}
        {messages.length > 0 && (
          <button onClick={() => setMessages([])}
            style={{ padding: '8px 16px', borderRadius: '9px', border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            New conversation
          </button>
        )}
      </>} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '760px', width: '100%', margin: '0 auto', padding: '0 24px' }}>
        {isEmpty && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', textAlign: 'center', padding: '48px 0 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
              <div style={{ width: '52px', height: '52px', background: `linear-gradient(135deg, ${C.tealAccent} 0%, ${C.teal} 100%)`, border: `1px solid ${C.teal}`, borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="24" height="24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              </div>
              <h1 style={{ fontSize: '32px', fontWeight: 900, color: C.text, margin: 0, letterSpacing: '-0.3px' }}>Knowledge Assistant</h1>
            </div>
            <p style={{ fontSize: '13px', color: '#2D3E50', margin: '0 0 32px', maxWidth: '420px', lineHeight: 1.65 }}>
              Ask questions using proposals, post-event reports, and company knowledge in the Knowledge Base. Access is restricted the same way as everywhere else — you&apos;ll only see what your department and job level allow. Separate from Pilot AI (the staff learning assistant) for now, with the intention of merging the two later.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', width: '100%', maxWidth: '600px' }}>
              {SUGGESTED.map(q => (
                <button key={q} onClick={() => send(q)} disabled={capped}
                  style={{ padding: '12px 16px', background: C.surface, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.tealAccent}`, borderRadius: '12px', color: C.text, fontSize: '13px', fontWeight: 600, cursor: capped ? 'not-allowed' : 'pointer', textAlign: 'left', fontFamily: 'inherit', lineHeight: 1.45, opacity: capped ? 0.5 : 1 }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {!isEmpty && (
          <div style={{ flex: 1, paddingTop: '28px', paddingBottom: '16px', overflowY: 'auto' }}>
            {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', marginBottom: '16px' }}>
                <div style={{ width: '30px', height: '30px', borderRadius: '10px', background: C.tealAccent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                </div>
                <div style={{ padding: '14px 18px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '18px 18px 18px 4px', display: 'flex', gap: '5px', alignItems: 'center' }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: C.tealAccent, animation: `bdchatBounce 1.2s ${i * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}

        <div style={{ paddingBottom: '28px', paddingTop: '12px', flexShrink: 0 }}>
          {capped ? (
            <div style={{ padding: '14px 18px', background: 'rgba(255,107,107,0.08)', border: `1px solid rgba(255,107,107,0.3)`, borderRadius: '14px', textAlign: 'center', fontSize: '13px', color: C.red, fontWeight: 600 }}>
              You&apos;ve reached today&apos;s limit of {status?.limit} messages. It resets at midnight UTC.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '12px 14px' }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Ask about a proposal, report, or company knowledge…"
                  rows={1}
                  disabled={loading}
                  style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: C.text, fontSize: '13px', fontFamily: 'inherit', resize: 'none', lineHeight: 1.65, maxHeight: '120px', overflowY: 'auto', padding: 0 }}
                  onInput={e => {
                    const el = e.currentTarget
                    el.style.height = 'auto'
                    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
                  }}
                />
                <button
                  onClick={() => send(input)}
                  disabled={!input.trim() || loading}
                  style={{ width: '36px', height: '36px', borderRadius: '10px', background: input.trim() && !loading ? C.tealAccent : '#E5E7EB', border: 'none', cursor: input.trim() && !loading ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >
                  <svg width="15" height="15" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
              <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '12px', color: C.muted, lineHeight: 1.65 }}>
                Press Enter to send · Shift+Enter for new line
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes bdchatBounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }
        textarea::placeholder { color: #9CA3AF; }
      `}</style>
    </div>
  )
}
