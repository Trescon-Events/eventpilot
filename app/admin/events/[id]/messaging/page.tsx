'use client'

import { useState, useEffect, useRef, use } from 'react'
import Link from 'next/link'

const C = {
  bg: 'var(--surface)', surface: 'var(--card)', border: 'var(--border)', text: 'var(--ink)',
  muted: 'var(--ink3)', teal: 'var(--teal-mid)', lime: 'var(--lime)', red: 'var(--red)', amber: 'var(--amber)',
}

type SectionKind = 'text' | 'table' | 'facts' | 'rules'

type Section = {
  id: string
  order: number
  title: string
  kind: SectionKind
  content: unknown
  updated_at?: string
  updated_by?: string | null
  change_note?: string | null
}

type MessagingDoc = {
  id: string
  event_id: string
  version: number
  title: string
  status: 'draft' | 'live' | 'superseded'
  structured_json: { sections: Section[]; default_fields?: Record<string, string | null> } | null
  source_url: string | null
  updated_at: string
  created_at: string
}

type Event = { id: string; name: string; city?: string; event_date?: string }

// This page only ever chats against the LIVE doc, so target_type is
// always 'section' in practice here — default_field proposals only exist
// on a still-draft doc, reviewed on the Event Details page instead.
type Proposal = {
  target_type: 'section' | 'default_field'
  target_key: string
  target_label: string
  current_excerpt: string
  proposed_content: unknown
  rationale: string
  conflict: string | null
  status: 'pending' | 'approved' | 'discarded'
}

type ChatMessage = { role: 'user' | 'assistant'; text: string; instruction?: string; proposals?: Proposal[] }

function getSession() {
  if (typeof document === 'undefined') return null
  const raw = document.cookie.split('; ').find(c => c.startsWith('tcs_session='))?.split('=')[1]
  if (!raw) return null
  try { return JSON.parse(atob(raw)) as { sid: string } } catch { return null }
}

function fmtDate(iso?: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} style={{ color: C.text, fontWeight: 700 }}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  )
}

function renderMarkdownLite(text: string) {
  const lines = String(text ?? '').split('\n')
  return lines.map((line, i) => {
    if (!line.trim()) return <div key={i} style={{ height: 6 }} />
    if (line.startsWith('- ') || line.startsWith('• ')) {
      return (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
          <div style={{ width: 4, height: 4, borderRadius: '50%', background: C.teal, marginTop: 9, flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.65 }}>{renderInline(line.replace(/^[-•]\s/, ''))}</span>
        </div>
      )
    }
    return <p key={i} style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.65, margin: '0 0 6px' }}>{renderInline(line)}</p>
  })
}

function SectionBody({ section }: { section: Section }) {
  if (section.kind === 'table') {
    const t = section.content as { columns: string[]; rows: string[][] }
    if (!t?.columns) return null
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr>{t.columns.map((c, i) => (
              <th key={i} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: `1px solid ${C.border}`, color: C.muted, fontWeight: 700, textTransform: 'uppercase', fontSize: 10.5, letterSpacing: '0.4px' }}>{c}</th>
            ))}</tr>
          </thead>
          <tbody>
            {t.rows?.map((row, ri) => (
              <tr key={ri}>{row.map((cell, ci) => (
                <td key={ci} style={{ padding: '6px 10px', borderBottom: `1px solid var(--border-light)`, color: 'var(--ink2)', verticalAlign: 'top' }}>{cell}</td>
              ))}</tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (section.kind === 'facts') {
    const facts = section.content as Array<{ fact: string; detail: string; source?: string }>
    if (!Array.isArray(facts)) return null
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        {facts.map((f, i) => (
          <div key={i} style={{ padding: '8px 12px', background: 'var(--surface-2, rgba(255,255,255,0.02))', border: `1px solid var(--border-light)`, borderRadius: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>{f.fact}</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginTop: 2 }}>{f.detail}</div>
            {f.source && <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>Source: {f.source}</div>}
          </div>
        ))}
      </div>
    )
  }

  // 'text' and 'rules'
  return <div>{renderMarkdownLite(String(section.content ?? ''))}</div>
}

export default function MessagingDocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const [session, setSession] = useState<{ sid: string } | null>(null)
  const [event, setEvent] = useState<Event | null>(null)
  const [doc, setDoc] = useState<MessagingDoc | null>(null)
  const [versions, setVersions] = useState<MessagingDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [showVersions, setShowVersions] = useState(false)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setSession(getSession()) }, [])

  useEffect(() => {
    fetch(`/api/events?id=${eventId}`).then(r => r.json()).then(ev => setEvent(Array.isArray(ev) ? ev[0] : ev)).catch(() => {})
    fetchDoc()
  }, [eventId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, chatLoading])

  async function fetchDoc() {
    setLoading(true)
    const res = await fetch(`/api/events/stakeholders/messaging?event_id=${eventId}`)
    const data = await res.json().catch(() => null)
    setDoc(data ?? null)
    setLoading(false)
  }

  async function fetchVersions() {
    const res = await fetch(`/api/events/stakeholders/messaging?event_id=${eventId}&all=true`)
    const data = await res.json().catch(() => [])
    setVersions(Array.isArray(data) ? data : [])
  }

  async function makeLive(target: MessagingDoc) {
    const currentLive = versions.find(v => v.status === 'live')
    if (currentLive && currentLive.id !== target.id) {
      await fetch(`/api/events/stakeholders/messaging/${currentLive.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'superseded' }),
      })
    }
    await fetch(`/api/events/stakeholders/messaging/${target.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'live' }),
    })
    await fetchDoc()
    await fetchVersions()
  }

  async function send(text: string) {
    if (!text.trim() || chatLoading || !doc) return
    const question = text.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: question }])
    setChatLoading(true)
    try {
      const res = await fetch(`/api/events/stakeholders/messaging/${doc.id}/propose-edit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question, history: messages.slice(-8).map(m => ({ role: m.role, text: m.text })) }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setMessages(prev => [...prev, { role: 'assistant', text: data.error ?? 'Something went wrong. Please try again.' }])
      } else {
        const proposals: Proposal[] = (data.proposals ?? []).map((p: Omit<Proposal, 'status'>) => ({ ...p, status: 'pending' as const }))
        setMessages(prev => [...prev, { role: 'assistant', text: data.reply, instruction: question, proposals }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Connection error. Please check your network and try again.' }])
    } finally {
      setChatLoading(false)
    }
  }

  async function approveProposal(msgIndex: number, propIndex: number) {
    if (!doc) return
    const msg = messages[msgIndex]
    const proposal = msg.proposals?.[propIndex]
    if (!proposal) return

    const res = await fetch(`/api/events/stakeholders/messaging/${doc.id}/apply-edit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_type: proposal.target_type,
        target_key: proposal.target_key,
        new_content: proposal.proposed_content,
        instruction: msg.instruction ?? proposal.rationale,
        applied_by: session?.sid ?? null,
      }),
    })
    if (!res.ok) return
    const updated: MessagingDoc = await res.json()
    setDoc(updated)
    setMessages(prev => prev.map((m, i) => i !== msgIndex ? m : {
      ...m,
      proposals: m.proposals?.map((p, pi) => pi === propIndex ? { ...p, status: 'approved' } : p),
    }))
  }

  function discardProposal(msgIndex: number, propIndex: number) {
    setMessages(prev => prev.map((m, i) => i !== msgIndex ? m : {
      ...m,
      proposals: m.proposals?.map((p, pi) => pi === propIndex ? { ...p, status: 'discarded' } : p),
    }))
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

  const sections = (doc?.structured_json?.sections ?? []).slice().sort((a, b) => a.order - b.order)

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '20px 32px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Link href={`/admin/events/${eventId}`} style={{ color: C.muted, textDecoration: 'none', fontSize: 13 }}>{event?.name ?? 'Event'}</Link>
            <span style={{ color: C.border }}>/</span>
            <span style={{ fontSize: 13, color: C.text, fontWeight: 700 }}>Topline Messaging Doc</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Topline Messaging Doc</h1>
              {doc ? (
                <>
                  <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
                    v{doc.version} · Live · Last updated {fmtDate(doc.updated_at)}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink4, #6b7280)', marginTop: 2 }}>
                    Small update? Use chat below. Whole new doc? Replace with new PDF — it&apos;s version-controlled, so nothing is lost.
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>No messaging doc uploaded yet</div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => { const v = !showVersions; setShowVersions(v); if (v) fetchVersions() }}
                style={{ padding: '9px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: 'var(--ink2)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {showVersions ? 'Hide versions' : 'Version history'}
              </button>
              <Link href={`/admin/events/${eventId}/details`}
                title="Uploading a new PDF now starts on the Event Details page, where you review/chat through the draft and approve it before it goes live."
                style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: C.lime, color: 'var(--lime-dark)', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', display: 'inline-block' }}>
                {doc ? 'Replace with new PDF →' : 'Upload PDF →'}
              </Link>
            </div>
          </div>

          {showVersions && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.border}`, display: 'grid', gap: 6 }}>
              {versions.length === 0 && <div style={{ fontSize: 12.5, color: C.muted }}>No versions yet.</div>}
              {versions.map(v => (
                <div key={v.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: v.status === 'live' ? 'rgba(18,201,189,0.08)' : 'transparent' }}>
                  <div style={{ fontSize: 12.5, color: C.text }}>
                    v{v.version} · {v.title} · {fmtDate(v.created_at)}
                    <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: v.status === 'live' ? C.teal : v.status === 'draft' ? C.amber : C.muted }}>{v.status}</span>
                  </div>
                  {v.status === 'superseded' && (
                    <button onClick={() => makeLive(v)} style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: 'var(--ink2)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Make live
                    </button>
                  )}
                  {v.status === 'draft' && (
                    <Link href={`/admin/events/${eventId}/details`} style={{ fontSize: 11.5, fontWeight: 700, color: C.amber, textDecoration: 'none' }}>
                      Review &amp; approve →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 32px', display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(320px, 1fr)', gap: 24, alignItems: 'start' }}>

        {/* Document sections */}
        <div style={{ display: 'grid', gap: 14 }}>
          {loading && <div style={{ fontSize: 13, color: C.muted, padding: 20 }}>Loading…</div>}
          {!loading && !doc && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 28, fontSize: 13, color: C.muted, textAlign: 'center' }}>
              Upload the event&apos;s topline messaging PDF to get started. It&apos;ll be split into sections here, ready for post-copy generation and conversational updates.
            </div>
          )}
          {sections.map(section => (
            <div key={section.id} style={{
              background: C.surface, border: `1px solid ${section.kind === 'rules' ? 'rgba(241,102,122,0.35)' : C.border}`, borderRadius: 12, padding: '18px 22px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{section.title}</span>
                  {section.kind === 'rules' && (
                    <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: C.red, background: 'rgba(241,102,122,0.12)', padding: '2px 8px', borderRadius: 20 }}>Hard rule</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: C.muted }}>
                  Updated {fmtDate(section.updated_at)}
                  {section.change_note && <span title={section.change_note}> · edited via chat</span>}
                </div>
              </div>
              <SectionBody section={section} />
            </div>
          ))}
        </div>

        {/* Chat panel */}
        <div style={{ position: 'sticky', top: 24, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: C.text }}>Update via chat</div>
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>Describe what changed — a new partner, a stat update, a speaker call-out. I&apos;ll propose which section to update; nothing changes until you approve it.</div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
            {messages.length === 0 && (
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                Example: &ldquo;We&apos;ve signed CyberSecurity Malaysia as an association partner&rdquo;
              </div>
            )}
            {messages.map((m, mi) => (
              <div key={mi} style={{ marginBottom: 14 }}>
                <div style={{
                  maxWidth: '92%', marginLeft: m.role === 'user' ? 'auto' : 0,
                  padding: '10px 14px', borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: m.role === 'user' ? C.teal : 'var(--surface-2, rgba(255,255,255,0.03))',
                  border: m.role === 'user' ? 'none' : `1px solid ${C.border}`,
                }}>
                  <div style={{ fontSize: 12.5, color: m.role === 'user' ? 'var(--teal-light)' : 'var(--ink2)', lineHeight: 1.55 }}>{m.text}</div>
                </div>
                {m.proposals && m.proposals.length > 0 && (
                  <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                    {m.proposals.map((p, pi) => (
                      <div key={pi} style={{
                        border: `1px solid ${p.status === 'approved' ? C.teal : p.status === 'discarded' ? C.border : p.conflict ? C.amber : 'rgba(192,244,60,0.4)'}`,
                        borderRadius: 8, padding: '10px 12px', opacity: p.status === 'discarded' ? 0.5 : 1,
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: C.text, marginBottom: 4 }}>{p.target_label}</div>
                        <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 6 }}>{p.rationale}</div>
                        {p.conflict && (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 8, padding: '6px 10px', borderRadius: 6, background: 'rgba(245,185,77,0.1)', border: `1px solid ${C.amber}40` }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: C.amber, flexShrink: 0 }}>⚠ Rule check</span>
                            <span style={{ fontSize: 11, color: 'var(--ink2)', lineHeight: 1.5 }}>{p.conflict}</span>
                          </div>
                        )}
                        {p.status === 'pending' ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => approveProposal(mi, pi)}
                              style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: C.lime, color: 'var(--lime-dark)', fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                              Approve
                            </button>
                            <button onClick={() => discardProposal(mi, pi)}
                              style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                              Discard
                            </button>
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, fontWeight: 700, color: p.status === 'approved' ? C.teal : C.muted }}>
                            {p.status === 'approved' ? 'Applied ✓' : 'Discarded'}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {chatLoading && <div style={{ fontSize: 12, color: C.muted }}>Thinking…</div>}
            <div ref={bottomRef} />
          </div>

          <div style={{ padding: '12px 14px', borderTop: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                disabled={!doc || chatLoading}
                placeholder={doc ? 'Describe what changed…' : 'Upload a messaging doc first'}
                rows={2}
                style={{ flex: 1, resize: 'none', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12.5, fontFamily: 'inherit' }}
              />
              <button onClick={() => send(input)} disabled={!doc || chatLoading || !input.trim()}
                style={{ padding: '0 16px', borderRadius: 8, border: 'none', background: C.teal, color: 'var(--teal-light)', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', opacity: (!doc || chatLoading || !input.trim()) ? 0.5 : 1 }}>
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
