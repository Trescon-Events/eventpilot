'use client'

import { useState, use, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { permissionSetSatisfies } from '@/app/lib/access/permission-match'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'

type EditField = 'headline' | 'dateline' | 'body_paragraph' | 'boilerplate'
type EditSuggestion = { field: EditField; paragraph_index?: number; options: string[] }
type ChatMessage = { role: 'user' | 'assistant'; text: string; flagged?: boolean; readyToGenerate?: boolean; editSuggestion?: EditSuggestion | null; editApplied?: string }
type Version = {
  id: string; version_number: number; headline: string | null; dateline: string | null
  body: string; boilerplate: string | null; approved_at: string | null; created_at: string
}
type PressReleaseDetail = { id: string; title: string; status: string; event_name: string | null; versions: Version[] }
type Usage = { used: number; limit: number | null }
type ComplianceField = 'headline' | 'body' | 'boilerplate'
type ComplianceFinding = {
  rule_key: string; severity: 'error' | 'warning'; message: string; source_clause: string | null
  match: string; offset: number; suggested_fix?: string; needs_discussion?: boolean
}
const FIELD_LABEL: Record<ComplianceField, string> = { headline: 'Headline', body: 'Body', boilerplate: 'Boilerplate' }

const SUGGESTED = [
  "Here's the angle — walk me through what you need to know.",
  'This is a speaker announcement for our keynote.',
  'We have a partnership to announce with a new sponsor.',
]

// Soft, informational only — mirrors the backend's own escalate-to-Pro
// threshold (app/lib/content/press-release-access.ts) so the nudge appears
// right around when the model tier actually changes, not at an arbitrary
// different number.
const LONG_THREAD_HINT_AT = 14
const TEXTAREA_MAX_HEIGHT = 160
const CHAT_MIN_WIDTH = 360
const CONTENT_MIN_WIDTH = 380
const DEFAULT_CHAT_WIDTH = 460

const THINKING_PHRASES = [
  'Reading the event’s style guide…',
  'Checking what’s already been approved…',
  'Thinking through the angle…',
  'Drafting a follow-up question…',
]
const GENERATING_PHRASES = [
  'Reviewing the research…',
  'Structuring the release…',
  'Writing the lead paragraph…',
  'Working in the quotes…',
  'Polishing the boilerplate…',
]

function useRotatingPhrase(active: boolean, phrases: string[], intervalMs = 1700): string {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (!active) { setI(0); return }
    const id = setInterval(() => setI(v => (v + 1) % phrases.length), intervalMs)
    return () => clearInterval(id)
  }, [active, phrases, intervalMs])
  return phrases[i]
}

function PulsingDots() {
  return (
    <span style={{ display: 'inline-flex', gap: '3px', verticalAlign: 'middle' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: '5px', height: '5px', borderRadius: '50%', background: 'var(--ink3)',
          animation: `prsPulse 1.1s ease-in-out ${i * 0.15}s infinite`,
        }} />
      ))}
    </span>
  )
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  )
}

// Adds breathing room between numbered list items even when the model
// doesn't insert a blank line of its own.
function renderMessageText(text: string) {
  const lines = text.split('\n')
  return lines.map((line, i) => {
    if (!line.trim()) return <div key={i} style={{ height: '10px' }} />
    const isListItem = /^\d+\.\s/.test(line.trim())
    return (
      <div key={i} style={{ marginTop: isListItem && i > 0 ? '12px' : 0 }}>
        {renderInline(line)}
      </div>
    )
  })
}

export default function PressReleaseWorkspace({ params }: { params: Promise<{ id: string; prId: string }> }) {
  const { id: eventId, prId } = use(params)

  const [pr, setPr] = useState<PressReleaseDetail | null>(null)
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [perms, setPerms] = useState<string[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [chatUsage, setChatUsage] = useState<Usage | null>(null)
  const [generateUsage, setGenerateUsage] = useState<Usage | null>(null)
  const [question, setQuestion] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [customInstruction, setCustomInstruction] = useState('')
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chatWidth, setChatWidth] = useState(DEFAULT_CHAT_WIDTH)
  const [applyingEdit, setApplyingEdit] = useState(false)
  const [customEditDrafts, setCustomEditDrafts] = useState<Record<number, string>>({})
  const [complianceFindings, setComplianceFindings] = useState<Record<ComplianceField, ComplianceFinding[]>>({ headline: [], body: [], boilerplate: [] })
  const [resolvedFindings, setResolvedFindings] = useState<Set<string>>(new Set())
  const [editableFixText, setEditableFixText] = useState<Record<string, string>>({})
  const [checkingCompliance, setCheckingCompliance] = useState(false)
  const [complianceStatus, setComplianceStatus] = useState<'unchecked' | 'checking' | 'suggesting' | 'checked' | 'all_clear'>('unchecked')
  const [toast, setToast] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const splitRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(message: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(message)
    toastTimerRef.current = setTimeout(() => setToast(null), 2600)
  }

  useBreadcrumbLabel(eventId, pr?.event_name ?? null)
  useBreadcrumbLabel(prId, pr?.title ?? null)

  const loadDetail = useCallback(async () => {
    const res = await fetch(`/api/events/press-releases/${prId}`)
    if (!res.ok) return
    const data = await res.json() as PressReleaseDetail
    setPr(data)
    setSelectedVersionId(prev => (prev && data.versions.some(v => v.id === prev)) ? prev : (data.versions[0]?.id ?? null))
  }, [prId])

  const loadChat = useCallback(async () => {
    const res = await fetch(`/api/events/press-releases/${prId}/research`)
    if (!res.ok) return
    const data = await res.json() as { session_id: string | null; messages: ChatMessage[]; chat_usage: Usage; generate_usage: Usage }
    setSessionId(data.session_id)
    setMessages(data.messages)
    setChatUsage(data.chat_usage)
    setGenerateUsage(data.generate_usage)
  }, [prId])

  useEffect(() => { loadDetail() }, [loadDetail])
  useEffect(() => { loadChat() }, [loadChat])
  useEffect(() => {
    fetch(`/api/events/access/me?event_id=${eventId}`)
      .then(r => r.json()).then(d => setPerms(d.permissions ?? []))
  }, [eventId])

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages])

  // Compliance findings are specific to one version's text — stale once the
  // selection changes (a new generate, an applied edit, or switching in the dropdown).
  useEffect(() => {
    setComplianceFindings({ headline: [], body: [], boilerplate: [] })
    setResolvedFindings(new Set())
    setEditableFixText({})
    setComplianceStatus('unchecked')
  }, [selectedVersionId])

  // ── Drag-to-resize divider ──────────────────────────────────────────────
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!draggingRef.current || !splitRef.current) return
      const rect = splitRef.current.getBoundingClientRect()
      const next = Math.min(Math.max(e.clientX - rect.left, CHAT_MIN_WIDTH), rect.width - CONTENT_MIN_WIDTH)
      setChatWidth(next)
    }
    function onUp() {
      if (!draggingRef.current) return
      draggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  function startDrag() {
    draggingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const canGenerate = permissionSetSatisfies(perms, 'sae.content_studio.press_release.generate')
  const canApprove = permissionSetSatisfies(perms, 'sae.content_studio.press_release.approve')
  const hasDraft = (pr?.versions.length ?? 0) > 0
  const threadIsLong = messages.length >= LONG_THREAD_HINT_AT
  const thinkingPhrase = useRotatingPhrase(chatBusy, THINKING_PHRASES)
  const generatingPhrase = useRotatingPhrase(generating, GENERATING_PHRASES)

  function autoGrowTextarea() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT)}px`
  }

  async function sendQuestion(text?: string) {
    const q = (text ?? question).trim()
    if (!q || chatBusy) return
    setQuestion('')
    setError(null)
    requestAnimationFrame(() => { if (textareaRef.current) textareaRef.current.style.height = 'auto' })
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', text: q }]
    setMessages(nextMessages)
    setChatBusy(true)
    try {
      const res = await fetch(`/api/events/press-releases/${prId}/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history: messages, session_id: sessionId }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Something went wrong.'); setMessages(messages); return }
      setSessionId(data.session_id)
      setMessages([...nextMessages, { role: 'assistant', text: data.answer, flagged: data.flagged, readyToGenerate: data.ready_to_generate, editSuggestion: data.edit_suggestion ?? null }])
      if (data.chat_usage) setChatUsage(data.chat_usage)
    } finally {
      setChatBusy(false)
    }
  }

  async function generateDraft() {
    if (!sessionId) { setError('Have a research conversation first, then generate.'); return }
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/events/press-releases/${prId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, custom_instruction: customInstruction.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Generation failed.'); return }
      if (data.generate_usage) setGenerateUsage(data.generate_usage)
      await loadDetail()
      setSelectedVersionId(data.id)
      setCustomInstruction('')
      showToast('Draft generated')
    } finally {
      setGenerating(false)
    }
  }

  async function approveVersion(versionId: string) {
    setApproving(true)
    setError(null)
    try {
      const res = await fetch(`/api/events/press-releases/${prId}/versions/${versionId}/approve`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Approval failed.'); return }
      await loadDetail()
      showToast('Version approved')
    } finally {
      setApproving(false)
    }
  }

  async function applyEdit(field: EditField, value: string, paragraphIndex?: number): Promise<boolean> {
    if (!selectedVersion || !value.trim() || applyingEdit) return false
    setApplyingEdit(true)
    setError(null)
    try {
      const res = await fetch(`/api/events/press-releases/${prId}/apply-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version_id: selectedVersion.id, field, paragraph_index: paragraphIndex, value: value.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Edit failed.'); return false }
      await loadDetail()
      setSelectedVersionId(data.id)
      invalidateComplianceForField(field)
      showToast('Change applied')
      return true
    } finally {
      setApplyingEdit(false)
    }
  }

  // Locks a chat message's option picker once its suggestion has been
  // applied — otherwise, per Madhu, people keep re-clicking it not
  // realizing it already landed. Mirrors Lovable's "answered questions
  // become a locked read-only row" pattern.
  async function applyEditFromMessage(messageIndex: number, field: EditField, value: string, paragraphIndex?: number) {
    const ok = await applyEdit(field, value, paragraphIndex)
    if (ok) setMessages(prev => prev.map((m, i) => i === messageIndex ? { ...m, editApplied: value.trim() } : m))
  }

  // Any OTHER still-open compliance finding for this same field was
  // computed against the text as it stood BEFORE this edit landed — its
  // offset is now stale and applying it would splice into the wrong spot
  // (confirmed live: accepting one "Sheikh Maktoum" fix while a second,
  // now-stale one was still showing duplicated text into the body).
  // Dropping the field's findings here, rather than trusting them, lets
  // the existing "auto-recheck once the queue is empty" effect give a
  // fresh, correct read instead.
  function invalidateComplianceForField(editField: EditField) {
    const complianceField: ComplianceField | null =
      editField === 'headline' ? 'headline' : editField === 'boilerplate' ? 'boilerplate' : editField === 'body_paragraph' ? 'body' : null
    if (!complianceField) return
    setComplianceFindings(prev => prev[complianceField].length === 0 ? prev : { ...prev, [complianceField]: [] })
  }

  function findingKey(field: ComplianceField, f: ComplianceFinding) {
    return `${field}:${f.rule_key}:${f.offset}`
  }

  // Stage 1: deterministic rule findings (instant). Stage 2: for whichever
  // findings have no mechanical suggested_fix (only required_format rules
  // carry one), one batched AI call proposes a direct replacement — "most
  // changes should get inline alternate text; discuss-in-chat is the
  // exception, not the default" per Madhu.
  async function checkCompliance() {
    if (!selectedVersion) return
    setCheckingCompliance(true)
    setComplianceStatus('checking')
    setError(null)
    try {
      const fields: [ComplianceField, string][] = [
        ['headline', selectedVersion.headline ?? ''],
        ['body', selectedVersion.body ?? ''],
        ['boilerplate', selectedVersion.boilerplate ?? ''],
      ]
      const results = await Promise.all(fields.map(async ([field, text]) => {
        if (!text.trim()) return [field, []] as [ComplianceField, ComplianceFinding[]]
        const res = await fetch('/api/events/stakeholders/content/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_id: eventId, text }),
        })
        if (!res.ok) return [field, []] as [ComplianceField, ComplianceFinding[]]
        const data = await res.json()
        return [field, data.findings ?? []] as [ComplianceField, ComplianceFinding[]]
      }))
      const byField: Record<ComplianceField, ComplianceFinding[]> = {
        headline: results.find(r => r[0] === 'headline')?.[1] ?? [],
        body: results.find(r => r[0] === 'body')?.[1] ?? [],
        boilerplate: results.find(r => r[0] === 'boilerplate')?.[1] ?? [],
      }
      const allFindings = [...byField.headline.map(f => ['headline', f] as const), ...byField.body.map(f => ['body', f] as const), ...byField.boilerplate.map(f => ['boilerplate', f] as const)]

      if (allFindings.length === 0) {
        setComplianceFindings(byField)
        setResolvedFindings(new Set())
        setEditableFixText({})
        setComplianceStatus('all_clear')
        return
      }

      const needsAiFix = allFindings.filter(([, f]) => !f.suggested_fix)
      if (needsAiFix.length > 0) {
        setComplianceStatus('suggesting')
        const res = await fetch(`/api/events/press-releases/${prId}/suggest-fixes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            findings: needsAiFix.map(([field, f]) => ({
              key: findingKey(field, f), field, rule_key: f.rule_key, message: f.message, match: f.match, source_clause: f.source_clause,
            })),
          }),
        })
        const { fixes } = res.ok ? await res.json() : { fixes: {} }
        for (const [field, f] of needsAiFix) {
          const fix = fixes[findingKey(field, f)]
          if (fix?.suggested_text) f.suggested_fix = fix.suggested_text
          if (fix?.needs_discussion) f.needs_discussion = true
        }
      }

      const initialEditable: Record<string, string> = {}
      for (const [field, f] of allFindings) if (f.suggested_fix) initialEditable[findingKey(field, f)] = f.suggested_fix

      setComplianceFindings(byField)
      setResolvedFindings(new Set())
      setEditableFixText(initialEditable)
      setComplianceStatus('checked')
    } finally {
      setCheckingCompliance(false)
    }
  }

  function discussInChat(field: ComplianceField, f: ComplianceFinding) {
    setQuestion(`In the ${field}, "${f.match}" — ${f.message} Can you suggest a fix?`)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  function resolveFinding(key: string) {
    setResolvedFindings(prev => new Set(prev).add(key))
  }

  // Splices the (possibly user-edited) replacement text into the field a
  // finding was found in. For 'body', the finding's offset is into the
  // FULL body text (validateText ran against the whole thing), so this
  // maps that offset onto the right paragraph — same split apply-edit's
  // server side uses — before applying, since apply-edit patches one
  // paragraph at a time, not the whole body.
  function applyFixToField(field: ComplianceField, f: ComplianceFinding, replacementText: string) {
    if (!selectedVersion || !replacementText.trim()) return
    if (field === 'headline' || field === 'boilerplate') {
      const original = (field === 'headline' ? selectedVersion.headline : selectedVersion.boilerplate) ?? ''
      const fixed = original.slice(0, f.offset) + replacementText + original.slice(f.offset + f.match.length)
      applyEdit(field, fixed)
      return
    }
    const body = selectedVersion.body
    const seps = [...body.matchAll(/\n\s*\n/g)]
    const bounds: number[] = [0]
    for (const m of seps) bounds.push(m.index!, m.index! + m[0].length)
    bounds.push(body.length)

    let paragraphIndex = -1, spanStart = 0, spanEnd = 0, pIdx = 0
    for (let i = 0; i < bounds.length; i += 2) {
      const start = bounds[i], end = bounds[i + 1]
      if (!body.slice(start, end).trim()) continue
      if (f.offset >= start && f.offset < end) { paragraphIndex = pIdx; spanStart = start; spanEnd = end; break }
      pIdx++
    }
    if (paragraphIndex === -1) return
    const paragraphRaw = body.slice(spanStart, spanEnd)
    const localOffset = f.offset - spanStart
    const fixedParagraph = (paragraphRaw.slice(0, localOffset) + replacementText + paragraphRaw.slice(localOffset + f.match.length)).trim()
    applyEdit('body_paragraph', fixedParagraph, paragraphIndex)
  }

  const allOpenFindings = (['headline', 'body', 'boilerplate'] as ComplianceField[])
    .flatMap(field => complianceFindings[field].map(f => ({ field, f, key: findingKey(field, f) })))
    .filter(({ key }) => !resolvedFindings.has(key))

  // Once every finding from the last check has been accepted or dismissed,
  // automatically re-check — the text has changed, so the old "clean"
  // findings may not still hold, and this is the moment to tell the user
  // either way rather than leaving them wondering.
  useEffect(() => {
    if (complianceStatus === 'checked' && allOpenFindings.length === 0 && !checkingCompliance) {
      checkCompliance()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOpenFindings.length, complianceStatus, checkingCompliance])

  function renderComplianceSection() {
    if (complianceStatus === 'unchecked') return null
    if (complianceStatus === 'checking' || complianceStatus === 'suggesting') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--ink3)', margin: '0 0 16px' }}>
          <PulsingDots /> {complianceStatus === 'checking' ? 'Checking compliance…' : 'Finding suggested fixes…'}
        </div>
      )
    }
    if (complianceStatus === 'all_clear') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', color: 'var(--lime)', background: 'var(--lime-light)', margin: '0 0 16px' }}>
          ✓ All good — no compliance issues found.
        </div>
      )
    }
    if (allOpenFindings.length === 0) return null
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '0 0 16px' }}>
        {allOpenFindings.map(({ field, f, key }) => {
          const isError = f.severity === 'error'
          const canFixInline = !f.needs_discussion && f.suggested_fix !== undefined
          return (
            <div key={key} style={{
              padding: '10px 12px', borderRadius: '8px', fontSize: '12px',
              background: isError ? 'var(--red-light)' : 'var(--amber-light)',
              border: `1px solid ${isError ? 'var(--red-border)' : 'var(--amber-border)'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '999px', background: 'var(--border-light)', color: 'var(--ink3)', textTransform: 'uppercase' }}>
                  {FIELD_LABEL[field]}
                </span>
              </div>
              <div style={{ color: 'var(--ink)', marginBottom: '6px' }}>
                <strong style={{ color: isError ? 'var(--red)' : 'var(--amber)' }}>“{f.match}”</strong> — {f.message}
              </div>
              {canFixInline ? (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <textarea
                    value={editableFixText[key] ?? ''}
                    onChange={e => setEditableFixText(prev => ({ ...prev, [key]: e.target.value }))}
                    rows={2}
                    style={{ flex: 1, padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', fontSize: '12px', fontFamily: 'inherit', resize: 'vertical' }}
                  />
                  <button
                    onClick={() => { applyFixToField(field, f, editableFixText[key] ?? ''); resolveFinding(key) }}
                    disabled={applyingEdit || !(editableFixText[key] ?? '').trim()}
                    aria-label="Accept fix"
                    style={btnCheckmark}
                  >
                    ✓
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button onClick={() => discussInChat(field, f)} style={btnFixChip}>Discuss in chat</button>
                </div>
              )}
              <div style={{ marginTop: '6px' }}>
                <button onClick={() => resolveFinding(key)} style={btnGhostSmall}>Dismiss</button>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const selectedVersion = pr?.versions.find(v => v.id === selectedVersionId) ?? null

  return (
    // GlobalShell's nav (58px) + breadcrumb strip render in normal document
    // flow above this page (not fixed/sticky), so a bare 100vh here would
    // double-count that space and make the whole document scroll instead
    // of just the inner panels — measured precisely via devtools, not a
    // guess: this page's root starts exactly 55px down the viewport.
    <div style={{ height: 'calc(100vh - 55px)', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
      <style>{`
        @keyframes prsPulse { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }
        @keyframes prsToastIn { from { opacity: 0; transform: translate(-50%, 6px); } to { opacity: 1; transform: translate(-50%, 0); } }
        .pr-divider .pr-divider-line { transition: background 0.15s; }
        .pr-divider .pr-divider-handle { opacity: 0; transition: opacity 0.15s; }
        .pr-divider:hover .pr-divider-line { background: var(--teal); }
        .pr-divider:hover .pr-divider-handle { opacity: 1; }
      `}</style>

      {toast && (
        <div style={{
          position: 'fixed', bottom: '28px', left: '50%', zIndex: 50,
          animation: 'prsToastIn 0.2s ease-out forwards',
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '10px 18px', borderRadius: '999px', fontSize: '13px', fontWeight: 600,
          color: 'var(--lime)', background: 'var(--lime-light)', border: '1px solid var(--lime-border)',
          backdropFilter: 'blur(6px)',
        }}>
          <span style={{ fontSize: '15px' }}>✓</span> {toast}
        </div>
      )}

      {/* ── Compact header ── */}
      <div style={{ flexShrink: 0, padding: '10px 20px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Link href={`/admin/events/${eventId}/press-releases`} style={{ color: 'var(--ink3)', display: 'flex', alignItems: 'center', textDecoration: 'none' }} aria-label="All press releases">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </Link>
        <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>{pr?.title ?? 'Press Release'}</span>
        {hasDraft && (
          <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', color: 'var(--ink3)', background: 'var(--border-light)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            {pr?.status.replace('_', ' ')}
          </span>
        )}
      </div>

      {error && (
        <div style={{ flexShrink: 0, padding: '8px 20px', background: 'var(--red-light)', color: 'var(--red)', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* ── Split pane: research (left) / generated content (right) ── */}
      <div ref={splitRef} style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        {/* Research */}
        <div style={{ width: `${chatWidth}px`, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ flexShrink: 0, padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Research</span>
            {chatUsage && (
              <span style={{ fontSize: '11px', color: 'var(--ink4)' }}>
                {chatUsage.limit === null ? `${chatUsage.used} today` : `${chatUsage.used}/${chatUsage.limit} today`}
              </span>
            )}
          </div>

          {hasDraft && (
            <div style={{ flexShrink: 0, margin: '0 20px 8px', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', color: 'var(--ink3)', background: 'var(--border-light)' }}>
              This workspace already has a draft. Researching a different story? Start a new Press Release instead.
            </div>
          )}
          {threadIsLong && (
            <div style={{ flexShrink: 0, margin: '0 20px 8px', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', color: 'var(--amber)', background: 'var(--amber-light)' }}>
              This thread is getting long — if it’s drifted to a different story, start a new Press Release.
            </div>
          )}

          <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 20px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {messages.length === 0 && (
              <div>
                <div style={{ fontSize: '15px', color: 'var(--ink2)', marginBottom: '14px', lineHeight: 1.6 }}>
                  Tell the assistant what this release is about — it’ll ask what it needs to know before you generate a draft.
                </div>
                {SUGGESTED.map(s => (
                  <button key={s} onClick={() => sendQuestion(s)} style={chipStyle}>{s}</button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: '8px' }}>
                <div style={{
                  maxWidth: '94%', padding: '13px 16px', borderRadius: '12px', fontSize: '15px', lineHeight: 1.65,
                  background: m.role === 'user' ? 'var(--teal)' : 'var(--border-light)',
                  color: m.role === 'user' ? 'var(--teal-light)' : 'var(--ink)',
                }}>
                  {renderMessageText(m.text)}
                </div>
                {m.readyToGenerate && canGenerate && (
                  <button onClick={() => generateDraft()} disabled={generating} style={btnPrimary}>
                    {generating ? 'Generating…' : 'Generate press release →'}
                  </button>
                )}
                {m.editSuggestion && canGenerate && (
                  m.editApplied ? (
                    <div style={lockedAnswerStyle}>
                      <span style={{ color: 'var(--lime)' }}>✓ Applied</span> — “{m.editApplied}”
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '94%', width: '100%' }}>
                      {m.editSuggestion.options.map((opt, oi) => (
                        <button
                          key={oi}
                          onClick={() => applyEditFromMessage(i, m.editSuggestion!.field, opt, m.editSuggestion!.paragraph_index)}
                          disabled={applyingEdit}
                          style={{ ...chipStyle, marginBottom: 0 }}
                        >
                          {opt}
                        </button>
                      ))}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          value={customEditDrafts[i] ?? ''}
                          onChange={e => setCustomEditDrafts(prev => ({ ...prev, [i]: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && customEditDrafts[i]?.trim()) {
                              applyEditFromMessage(i, m.editSuggestion!.field, customEditDrafts[i], m.editSuggestion!.paragraph_index)
                            }
                          }}
                          placeholder="…or type your own"
                          disabled={applyingEdit}
                          style={{ flex: 1, padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', fontSize: '13px' }}
                        />
                        <button
                          onClick={() => applyEditFromMessage(i, m.editSuggestion!.field, customEditDrafts[i] ?? '', m.editSuggestion!.paragraph_index)}
                          disabled={applyingEdit || !customEditDrafts[i]?.trim()}
                          style={btnPrimary}
                        >
                          {applyingEdit ? 'Applying…' : 'Use'}
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            ))}
            {chatBusy && (
              <div style={{ fontSize: '13px', color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <PulsingDots /> {thinkingPhrase}
              </div>
            )}
          </div>

          {!canGenerate ? (
            <div style={{ flexShrink: 0, padding: '12px 20px', fontSize: '13px', color: 'var(--ink3)', borderTop: '1px solid var(--border-light)' }}>
              You don’t have access to research/generate on this event’s Press Release Studio.
            </div>
          ) : (
            <div style={{ flexShrink: 0, padding: '12px 20px', borderTop: '1px solid var(--border-light)', display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
              <textarea
                ref={textareaRef}
                value={question}
                onChange={e => { setQuestion(e.target.value); autoGrowTextarea() }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuestion() } }}
                placeholder="Reply… (Shift+Enter for a new line)"
                disabled={chatBusy}
                rows={1}
                style={{
                  flex: 1, padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)',
                  background: 'var(--card)', color: 'var(--ink)', fontSize: '15px', lineHeight: 1.5,
                  resize: 'none', maxHeight: `${TEXTAREA_MAX_HEIGHT}px`, fontFamily: 'inherit',
                }}
              />
              <button onClick={() => sendQuestion()} disabled={chatBusy || !question.trim()} style={btnPrimary}>Send</button>
            </div>
          )}
        </div>

        {/* Divider */}
        <div
          onMouseDown={startDrag}
          style={{ width: '9px', flexShrink: 0, cursor: 'col-resize', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          className="pr-divider"
        >
          <div className="pr-divider-line" style={{ width: '1px', height: '100%', background: 'var(--border)' }} />
          <div className="pr-divider-handle" style={{
            position: 'absolute', width: '18px', height: '32px', borderRadius: '6px',
            background: 'var(--card-hi)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px',
          }}>
            <div style={{ width: '2px', height: '14px', borderRadius: '1px', background: 'var(--ink4)' }} />
            <div style={{ width: '2px', height: '14px', borderRadius: '1px', background: 'var(--ink4)' }} />
          </div>
        </div>

        {/* Generated content */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ flexShrink: 0, padding: '10px 24px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.4px', marginRight: 'auto' }}>Generated Content</span>
            {pr && pr.versions.length > 0 && (
              <select
                value={selectedVersionId ?? ''} onChange={e => setSelectedVersionId(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px' }}
              >
                {pr.versions.map(v => (
                  <option key={v.id} value={v.id}>
                    Version {v.version_number}{v.approved_at ? ' — Approved' : ''}
                  </option>
                ))}
              </select>
            )}
            {canGenerate && (
              <>
                <input
                  value={customInstruction} onChange={e => setCustomInstruction(e.target.value)}
                  placeholder="Optional instruction for this draft…"
                  style={{ width: '220px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px' }}
                />
                <button onClick={generateDraft} disabled={generating || !sessionId} style={btnPrimary}>
                  {generating ? 'Generating…' : pr && pr.versions.length > 0 ? 'Generate new version' : 'Generate from research'}
                </button>
                {generateUsage && (
                  <span style={{ fontSize: '11px', color: 'var(--ink4)' }}>
                    {generateUsage.limit === null ? `${generateUsage.used} today` : `${generateUsage.used}/${generateUsage.limit} today`}
                  </span>
                )}
              </>
            )}
            {selectedVersion && (
              <button onClick={checkCompliance} disabled={checkingCompliance} style={btnGhost}>
                {checkingCompliance ? 'Checking…' : 'Check Compliance'}
              </button>
            )}
            {canApprove && selectedVersion && !selectedVersion.approved_at && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                <button onClick={() => approveVersion(selectedVersion.id)} disabled={approving} style={btnApprove}>
                  {approving ? 'Approving…' : 'Approve this version'}
                </button>
                {complianceStatus === 'checked' && allOpenFindings.length > 0 && (
                  <span style={{ fontSize: '10px', color: 'var(--amber)' }}>
                    {allOpenFindings.length} compliance issue{allOpenFindings.length === 1 ? '' : 's'} not yet addressed
                  </span>
                )}
              </div>
            )}
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 28px 40px' }}>
            {generating ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '14px', color: 'var(--ink3)', fontSize: '14px' }}>
                <PulsingDots />
                {generatingPhrase}
              </div>
            ) : !selectedVersion ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--ink3)', fontSize: '13px' }}>
                No draft yet. Have a research conversation on the left, then generate one.
              </div>
            ) : (
              <>
                {selectedVersion.approved_at && (
                  <div style={{ display: 'inline-block', marginBottom: '14px', fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px', color: 'var(--lime)', background: 'var(--lime-light)' }}>
                    Approved
                  </div>
                )}
                {renderComplianceSection()}
                {selectedVersion.headline && <h1 style={{ fontSize: '21px', fontWeight: 800, color: 'var(--ink)', margin: '0 0 6px' }}>{selectedVersion.headline}</h1>}
                {selectedVersion.dateline && <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '16px', fontWeight: 700, textTransform: 'uppercase' }}>{selectedVersion.dateline}</div>}
                <div style={{ fontSize: '14px', color: 'var(--ink)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{selectedVersion.body}</div>
                {selectedVersion.boilerplate && (
                  <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-light)', fontSize: '12px', color: 'var(--ink3)', whiteSpace: 'pre-wrap' }}>
                    {selectedVersion.boilerplate}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const chipStyle: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', marginBottom: '8px',
  borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)',
  color: 'var(--ink2)', fontSize: '14px', cursor: 'pointer',
}
const btnPrimary: React.CSSProperties = {
  padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--teal)',
  color: 'var(--teal-light)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
}
const btnApprove: React.CSSProperties = {
  padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--lime)',
  color: 'var(--lime-dark)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
}
const btnGhost: React.CSSProperties = {
  padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent',
  color: 'var(--ink2)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
}
const btnFixChip: React.CSSProperties = {
  padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card)',
  color: 'var(--ink)', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
}
const btnGhostSmall: React.CSSProperties = {
  padding: '6px 10px', borderRadius: '6px', border: 'none', background: 'transparent',
  color: 'var(--ink3)', fontSize: '12px', cursor: 'pointer',
}
const btnCheckmark: React.CSSProperties = {
  flexShrink: 0, width: '32px', height: '32px', borderRadius: '6px', border: 'none', background: 'var(--lime)',
  color: 'var(--lime-dark)', fontSize: '15px', fontWeight: 800, cursor: 'pointer',
}
const lockedAnswerStyle: React.CSSProperties = {
  maxWidth: '94%', width: 'fit-content', padding: '8px 12px', borderRadius: '8px',
  border: '1px solid var(--border-light)', background: 'var(--border-light)',
  color: 'var(--ink3)', fontSize: '13px', cursor: 'default',
}
