'use client'

import { useState, useEffect, useCallback } from 'react'
import PageHeader from '@/app/components/PageHeader'

// ── Types ──────────────────────────────────────────────────────────────────────
type TaskStep = { step: number; instruction: string; tip: string }
type Question = { question: string; options: string[]; correct_index: number; explanation: string }

type Course = {
  id:                 string
  title:              string
  subtitle:           string | null
  tool_name:          string | null
  tier_level:         'foundation' | 'adoption' | 'advanced'
  dept_tags:          string[]
  is_mandatory:       boolean
  estimated_minutes:  number
  overview:           string
  read_content:       string
  task_steps:         TaskStep[]
  question_bank:      Question[]
  source:             string
  status:             'draft' | 'published'
  created_at:         string
  suggested_by_name:  string | null
  suggested_by_role:  string | null
}

// ── Constants ──────────────────────────────────────────────────────────────────
const ADMIN_CODE = process.env.NEXT_PUBLIC_ADMIN_CODE ?? 'eventpilot2026'

const TIERS = ['foundation', 'adoption', 'advanced'] as const
const TIER_COLOR: Record<string, { color: string; bg: string; label: string }> = {
  foundation: { color: 'var(--info)', bg: 'rgba(21,101,192,0.1)',  label: 'Foundation' },
  adoption:   { color: 'var(--purple)', bg: 'rgba(164,120,255,0.1)', label: 'Adoption'   },
  advanced:   { color: 'var(--teal-mid)', bg: 'rgba(0,137,123,0.1)',   label: 'Advanced'   },
}
const SOURCE_LABEL: Record<string, string> = {
  gemini:     'Learning Lab',
  'dept-seed':'Dept Seeding',
  manual:     'Manual',
  suggested:  'Suggested',
}
const DEPTS = [
  'Events','Sales & Sponsorship','Marketing','Finance','Operations',
  'HR','Content & Design','Data & Intelligence','Leadership',
]

const BLANK_COURSE: Omit<Course, 'id' | 'created_at' | 'source' | 'status'> = {
  title:             '',
  subtitle:          '',
  tool_name:         '',
  tier_level:        'foundation',
  dept_tags:         [],
  is_mandatory:      false,
  estimated_minutes: 20,
  overview:          '',
  read_content:      '',
  task_steps: [
    { step: 1, instruction: '', tip: '' },
    { step: 2, instruction: '', tip: '' },
    { step: 3, instruction: '', tip: '' },
    { step: 4, instruction: '', tip: '' },
  ],
  question_bank: Array.from({ length: 10 }, (_, i) => ({
    question: '', options: ['', '', '', ''], correct_index: 0, explanation: '',
  })),
  suggested_by_name: '',
  suggested_by_role: '',
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function TierBadge({ tier }: { tier: string }) {
  const t = TIER_COLOR[tier] ?? TIER_COLOR.foundation
  return (
    <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: t.color, background: t.bg, padding: '3px 9px', borderRadius: '20px', whiteSpace: 'nowrap' }}>
      {t.label}
    </span>
  )
}

// ── Editor panel ───────────────────────────────────────────────────────────────
function CourseEditor({
  course, onClose, onSave, onPublish, onDelete,
}: {
  course:    Course | null
  onClose:   () => void
  onSave:    (c: Partial<Course>) => Promise<void>
  onPublish: (id: string) => Promise<void>
  onDelete:  (id: string) => Promise<void>
}) {
  type EditorTab = 'details' | 'content' | 'tasks' | 'questions'
  const [tab,     setTab]     = useState<EditorTab>('details')
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState<{ text: string; ok: boolean } | null>(null)

  // Local editable state
  const [title,        setTitle]        = useState('')
  const [subtitle,     setSubtitle]     = useState('')
  const [toolName,     setToolName]     = useState('')
  const [tier,         setTier]         = useState<'foundation'|'adoption'|'advanced'>('foundation')
  const [depts,        setDepts]        = useState<string[]>([])
  const [mandatory,    setMandatory]    = useState(false)
  const [minutes,      setMinutes]      = useState(20)
  const [sugName,      setSugName]      = useState('')
  const [sugRole,      setSugRole]      = useState('')
  const [overview,     setOverview]     = useState('')
  const [readContent,  setReadContent]  = useState('')
  const [taskSteps,    setTaskSteps]    = useState<TaskStep[]>(BLANK_COURSE.task_steps)
  const [questions,    setQuestions]    = useState<Question[]>(BLANK_COURSE.question_bank)
  const [expandedQ,    setExpandedQ]    = useState<number | null>(null)

  // Load course into local state when it changes
  useEffect(() => {
    if (!course) return
    setTitle(course.title ?? '')
    setSubtitle(course.subtitle ?? '')
    setToolName(course.tool_name ?? '')
    setTier(course.tier_level ?? 'foundation')
    setDepts(course.dept_tags ?? [])
    setMandatory(course.is_mandatory ?? false)
    setMinutes(course.estimated_minutes ?? 20)
    setSugName(course.suggested_by_name ?? '')
    setSugRole(course.suggested_by_role ?? '')
    setOverview(course.overview ?? '')
    setReadContent(course.read_content ?? '')
    setTaskSteps(course.task_steps?.length ? course.task_steps : BLANK_COURSE.task_steps)
    setQuestions(course.question_bank?.length ? course.question_bank : BLANK_COURSE.question_bank)
    setTab('details')
    setMsg(null)
  }, [course?.id])

  if (!course) return null

  const isDraft = course.status === 'draft'

  async function save() {
    setSaving(true); setMsg(null)
    try {
      await onSave({
        id: course!.id,
        title, subtitle, tool_name: toolName, tier_level: tier, dept_tags: depts,
        is_mandatory: mandatory, estimated_minutes: minutes,
        suggested_by_name: sugName, suggested_by_role: sugRole,
        overview, read_content: readContent, task_steps: taskSteps, question_bank: questions,
      })
      setMsg({ text: 'Saved.', ok: true })
    } catch { setMsg({ text: 'Save failed.', ok: false }) }
    setSaving(false)
  }

  const S = {
    input:    { width: '100%', padding: '10px 13px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '15px', fontFamily: 'inherit', color: 'var(--ink)', background: 'var(--border-light)', boxSizing: 'border-box' as const, outline: 'none' },
    textarea: { width: '100%', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '15px', fontFamily: 'inherit', color: 'var(--ink)', background: 'var(--border-light)', resize: 'vertical' as const, lineHeight: 1.65, boxSizing: 'border-box' as const, outline: 'none' },
    label:    { display: 'block' as const, fontSize: '12px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase' as const, color: 'var(--ink3)', marginBottom: '7px' },
    field:    { marginBottom: '20px' },
  }

  const EDITOR_TABS: { id: EditorTab; label: string }[] = [
    { id: 'details',   label: 'Details'    },
    { id: 'content',   label: 'Content'    },
    { id: 'tasks',     label: 'Tasks'      },
    { id: 'questions', label: 'Questions'  },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex' }} onClick={onClose}>
      {/* Backdrop */}
      <div style={{ flex: 1, background: 'rgba(8,10,11,0.55)' }} />

      {/* Panel */}
      <div style={{ width: '540px', background: 'var(--card)', display: 'flex', flexDirection: 'column', height: '100vh', boxShadow: '-8px 0 40px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>

        {/* Panel header */}
        <div style={{ padding: '20px 24px 0', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                <TierBadge tier={tier} />
                <span style={{ fontSize: '11px', fontWeight: 700, color: isDraft ? '#F5B94D' : 'var(--lime)', background: isDraft ? 'rgba(217,119,6,0.1)' : 'rgba(61,107,0,0.08)', padding: '2px 8px', borderRadius: '20px' }}>
                  {isDraft ? 'Draft' : 'Published'}
                </span>
              </div>
              <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ink)', lineHeight: 1.3, maxWidth: '380px' }}>{title || 'Untitled Course'}</div>
            </div>
            <button onClick={onClose} style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--border-light)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" fill="none" stroke="var(--ink3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          {/* Editor tabs */}
          <div style={{ display: 'flex', gap: '2px' }}>
            {EDITOR_TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ padding: '8px 16px', borderRadius: '8px 8px 0 0', border: 'none', background: tab === t.id ? 'var(--card)' : 'transparent', color: tab === t.id ? 'var(--teal-mid)' : 'var(--ink3)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', borderBottom: tab === t.id ? '2px solid var(--teal-mid)' : '2px solid transparent' }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

          {/* ── Details ── */}
          {tab === 'details' && (
            <div>
              <div style={S.field}>
                <label style={S.label}>Title</label>
                <input value={title} onChange={e => setTitle(e.target.value)} style={S.input} placeholder="Course title" />
              </div>
              <div style={S.field}>
                <label style={S.label}>Subtitle</label>
                <input value={subtitle} onChange={e => setSubtitle(e.target.value)} style={S.input} placeholder="What they will be able to do after this course" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
                <div>
                  <label style={S.label}>Tier Level</label>
                  <select value={tier} onChange={e => setTier(e.target.value as typeof tier)}
                    style={{ ...S.input, cursor: 'pointer' }}>
                    {TIERS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.label}>Est. Minutes</label>
                  <input type="number" value={minutes} onChange={e => setMinutes(Number(e.target.value))} style={S.input} min={5} max={120} />
                </div>
              </div>
              <div style={S.field}>
                <label style={S.label}>Primary Tool</label>
                <input value={toolName} onChange={e => setToolName(e.target.value)} style={S.input} placeholder="e.g. ChatGPT, Gemini, Midjourney (or leave blank)" />
              </div>
              <div style={S.field}>
                <label style={S.label}>Departments</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {DEPTS.map(d => {
                    const on = depts.includes(d)
                    return (
                      <button key={d} onClick={() => setDepts(on ? depts.filter(x => x !== d) : [...depts, d])}
                        style={{ padding: '5px 12px', borderRadius: '20px', border: `1px solid ${on ? 'var(--teal-mid)' : 'var(--border)'}`, background: on ? 'rgba(0,165,163,0.1)' : 'var(--border-light)', color: on ? 'var(--teal)' : 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {d}
                      </button>
                    )
                  })}
                </div>
                {depts.length === 0 && <div style={{ fontSize: '13px', color: 'var(--ink4)', marginTop: '8px' }}>No tags = visible to all departments</div>}
              </div>
              <div style={{ ...S.field, display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button onClick={() => setMandatory(!mandatory)}
                  style={{ width: '40px', height: '22px', borderRadius: '11px', border: 'none', background: mandatory ? 'var(--teal-mid)' : 'var(--border)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                  <span style={{ position: 'absolute', top: '3px', left: mandatory ? '21px' : '3px', width: '16px', height: '16px', borderRadius: '50%', background: 'var(--card)', transition: 'left 0.2s' }} />
                </button>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>Mandatory</div>
                  <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Appears at top of every staff member's library</div>
                </div>
              </div>
              <div style={{ borderTop: '1px solid var(--surface)', paddingTop: '20px', marginTop: '4px' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '14px' }}>Course Credit</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={S.label}>Suggested by</label>
                    <input value={sugName} onChange={e => setSugName(e.target.value)} style={S.input} placeholder="Full name" />
                  </div>
                  <div>
                    <label style={S.label}>Role</label>
                    <input value={sugRole} onChange={e => setSugRole(e.target.value)} style={S.input} placeholder="Role / Department" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Content ── */}
          {tab === 'content' && (
            <div>
              <div style={S.field}>
                <label style={S.label}>Overview</label>
                <textarea value={overview} onChange={e => setOverview(e.target.value)} rows={5} style={S.textarea} placeholder="2–3 paragraphs on why this course matters for the team" />
              </div>
              <div style={S.field}>
                <label style={S.label}>Reading Content <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--ink4)' }}>(Markdown supported)</span></label>
                <textarea value={readContent} onChange={e => setReadContent(e.target.value)} rows={20} style={{ ...S.textarea, fontFamily: 'monospace', fontSize: '13px' }} placeholder="Full reading material. Minimum 500 words. Use ## headings, **bold**, bullet points." />
                <div style={{ fontSize: '12px', color: 'var(--ink4)', marginTop: '6px' }}>{readContent.trim().split(/\s+/).filter(Boolean).length} words</div>
              </div>
            </div>
          )}

          {/* ── Tasks ── */}
          {tab === 'tasks' && (
            <div>
              <p style={{ fontSize: '15px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '20px' }}>4 hands-on steps the staff member completes using AI tools. Use <code style={{ background: 'var(--surface)', padding: '1px 5px', borderRadius: '4px', fontSize: '13px' }}>{'{{department}}'}</code> and <code style={{ background: 'var(--surface)', padding: '1px 5px', borderRadius: '4px', fontSize: '13px' }}>{'{{role}}'}</code> as placeholders.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {taskSteps.map((ts, i) => (
                  <div key={i} style={{ background: 'var(--border-light)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '10px' }}>Step {i + 1}</div>
                    <div style={{ marginBottom: '10px' }}>
                      <label style={{ ...S.label, marginBottom: '5px' }}>Instruction</label>
                      <textarea value={ts.instruction} onChange={e => { const s = [...taskSteps]; s[i] = { ...s[i], instruction: e.target.value }; setTaskSteps(s) }} rows={3} style={S.textarea} placeholder="What the staff member should do in this step" />
                    </div>
                    <div>
                      <label style={{ ...S.label, marginBottom: '5px' }}>Tip</label>
                      <input value={ts.tip} onChange={e => { const s = [...taskSteps]; s[i] = { ...s[i], tip: e.target.value }; setTaskSteps(s) }} style={S.input} placeholder="Helpful hint for this step" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Questions ── */}
          {tab === 'questions' && (
            <div>
              <p style={{ fontSize: '15px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '20px' }}>10 questions in the bank — 5 are served randomly per attempt. Mark one option as correct per question.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {questions.map((q, qi) => {
                  const open = expandedQ === qi
                  const complete = q.question.trim() && q.options.every(o => o.trim())
                  return (
                    <div key={qi} style={{ border: `1px solid ${complete ? 'var(--border)' : 'rgba(217,119,6,0.3)'}`, borderRadius: '12px', overflow: 'hidden' }}>
                      <button onClick={() => setExpandedQ(open ? null : qi)}
                        style={{ width: '100%', padding: '13px 16px', background: open ? 'var(--card-hi)' : 'var(--border-light)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', fontFamily: 'inherit', textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                          <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: complete ? 'rgba(0,165,163,0.12)' : 'rgba(217,119,6,0.12)', color: complete ? 'var(--teal)' : '#F5B94D', fontSize: '11px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>Q{qi + 1}</span>
                          <span style={{ fontSize: '13px', color: q.question.trim() ? 'var(--ink)' : 'var(--ink4)', fontWeight: q.question.trim() ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.question.trim() || 'No question text yet'}</span>
                        </div>
                        <svg width="14" height="14" fill="none" stroke="var(--ink3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="6 9 12 15 18 9"/></svg>
                      </button>
                      {open && (
                        <div style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
                          <div style={{ marginBottom: '14px' }}>
                            <label style={S.label}>Question</label>
                            <textarea value={q.question} onChange={e => { const qs = [...questions]; qs[qi] = { ...qs[qi], question: e.target.value }; setQuestions(qs) }} rows={2} style={S.textarea} placeholder="Write the question" />
                          </div>
                          <div style={{ marginBottom: '14px' }}>
                            <label style={S.label}>Options — click the dot to mark correct</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {q.options.map((opt, oi) => (
                                <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <button onClick={() => { const qs = [...questions]; qs[qi] = { ...qs[qi], correct_index: oi }; setQuestions(qs) }}
                                    style={{ width: '20px', height: '20px', borderRadius: '50%', border: `2px solid ${q.correct_index === oi ? 'var(--teal-mid)' : 'var(--border)'}`, background: q.correct_index === oi ? 'var(--teal-mid)' : 'transparent', cursor: 'pointer', flexShrink: 0 }} />
                                  <input value={opt} onChange={e => { const qs = [...questions]; const opts = [...qs[qi].options]; opts[oi] = e.target.value; qs[qi] = { ...qs[qi], options: opts }; setQuestions(qs) }}
                                    style={{ ...S.input, fontSize: '13px', borderColor: q.correct_index === oi ? 'rgba(0,165,163,0.4)' : 'var(--border)', background: q.correct_index === oi ? 'rgba(0,165,163,0.04)' : 'var(--border-light)' }}
                                    placeholder={`Option ${oi + 1}`} />
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label style={S.label}>Explanation (shown after answer)</label>
                            <textarea value={q.explanation} onChange={e => { const qs = [...questions]; qs[qi] = { ...qs[qi], explanation: e.target.value }; setQuestions(qs) }} rows={2} style={S.textarea} placeholder="Why the correct answer is correct" />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', background: 'var(--border-light)', flexShrink: 0 }}>
          {msg && (
            <div style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', background: msg.ok ? 'rgba(192,244,60,0.1)' : 'rgba(255,107,107,0.1)', border: `1px solid ${msg.ok ? 'rgba(192,244,60,0.3)' : 'rgba(255,107,107,0.3)'}`, fontSize: '13px', fontWeight: 700, color: msg.ok ? 'var(--lime)' : 'var(--red)' }}>
              {msg.text}
            </div>
          )}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button onClick={save} disabled={saving}
              style={{ padding: '11px 22px', borderRadius: '10px', border: 'none', background: saving ? 'var(--border)' : 'var(--teal-mid)', color: saving ? 'var(--ink3)' : 'var(--card)', fontSize: '13px', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            {isDraft && (
              <button onClick={async () => { await save(); await onPublish(course!.id) }}
                style={{ padding: '11px 22px', borderRadius: '10px', border: 'none', background: 'var(--lime)', color: 'var(--lime-dark)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                Save & Publish
              </button>
            )}
            {isDraft && (
              <button onClick={() => onDelete(course!.id)}
                style={{ marginLeft: 'auto', padding: '11px 16px', borderRadius: '10px', border: '1px solid rgba(185,28,28,0.2)', background: 'rgba(185,28,28,0.05)', color: 'var(--red)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Delete Draft
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function CoursesPage() {
  type PageTab = 'queue' | 'all' | 'new'
  const [tab,        setTab]        = useState<PageTab>('queue')
  const [drafts,     setDrafts]     = useState<Course[]>([])
  const [published,  setPublished]  = useState<Course[]>([])
  const [loading,    setLoading]    = useState(true)
  const [selected,   setSelected]   = useState<Course | null>(null)
  const [search,     setSearch]     = useState('')
  const [filterTier, setFilterTier] = useState('all')
  const [filterDept, setFilterDept] = useState('all')

  // New course form state
  const [newTitle,       setNewTitle]       = useState('')
  const [newSubtitle,    setNewSubtitle]    = useState('')
  const [newTier,        setNewTier]        = useState<'foundation'|'adoption'|'advanced'>('foundation')
  const [newDepts,       setNewDepts]       = useState<string[]>([])
  const [newMinutes,     setNewMinutes]     = useState(20)
  const [newMandatory,   setNewMandatory]   = useState(false)
  const [newOverview,    setNewOverview]    = useState('')
  const [newCreating,    setNewCreating]    = useState(false)
  const [newMsg,         setNewMsg]         = useState<{ text: string; ok: boolean } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [dRes, pRes] = await Promise.all([
      fetch('/api/courses?status=draft').then(r => r.json()),
      fetch('/api/courses').then(r => r.json()),
    ])
    setDrafts(Array.isArray(dRes) ? dRes : [])
    setPublished(Array.isArray(pRes) ? pRes : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Load full course details for editor
  async function openCourse(c: Course) {
    const res  = await fetch(`/api/course-detail?id=${c.id}&admin=1`)
    const full = await res.json()
    setSelected({ ...c, ...full })
  }

  async function handleSave(fields: Partial<Course>) {
    const res = await fetch('/api/courses', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_code: ADMIN_CODE, course_id: fields.id, ...fields }),
    })
    if (!res.ok) throw new Error('Save failed')
    // Update local list
    setPublished(prev => prev.map(c => c.id === fields.id ? { ...c, ...fields } as Course : c))
    setDrafts(prev => prev.map(c => c.id === fields.id ? { ...c, ...fields } as Course : c))
    if (selected?.id === fields.id) setSelected(prev => prev ? { ...prev, ...fields } as Course : prev)
  }

  async function handlePublish(id: string) {
    await fetch('/api/courses', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_code: ADMIN_CODE, course_id: id }),
    })
    setSelected(null)
    await load()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this draft permanently?')) return
    await fetch('/api/courses', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_code: ADMIN_CODE, course_id: id }),
    })
    setSelected(null)
    await load()
  }

  async function createDraft() {
    if (!newTitle.trim()) { setNewMsg({ text: 'Title is required.', ok: false }); return }
    setNewCreating(true); setNewMsg(null)
    const res = await fetch('/api/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        admin_code: ADMIN_CODE,
        course: {
          title: newTitle, subtitle: newSubtitle, tier_level: newTier,
          dept_tags: newDepts, is_mandatory: newMandatory, estimated_minutes: newMinutes,
          overview: newOverview, source: 'manual',
          read_content: '', task_steps: BLANK_COURSE.task_steps, question_bank: BLANK_COURSE.question_bank,
        },
      }),
    })
    const data = await res.json()
    if (!res.ok) { setNewMsg({ text: data.error ?? 'Failed to create.', ok: false }); setNewCreating(false); return }
    setNewMsg({ text: 'Draft created — opening editor…', ok: true })
    setNewCreating(false)
    await load()
    // Open the new draft in editor
    setTimeout(() => {
      setTab('queue')
      setNewTitle(''); setNewSubtitle(''); setNewOverview('')
      setNewDepts([]); setNewMsg(null)
    }, 800)
  }

  // Filtered published list
  const filtered = published.filter(c => {
    const matchSearch = !search || c.title.toLowerCase().includes(search.toLowerCase())
    const matchTier   = filterTier === 'all' || c.tier_level === filterTier
    const matchDept   = filterDept === 'all' || c.dept_tags.includes(filterDept) || c.dept_tags.length === 0
    return matchSearch && matchTier && matchDept
  })

  // Stats
  const byTier = { foundation: 0, adoption: 0, advanced: 0 }
  published.forEach(c => { if (c.tier_level in byTier) byTier[c.tier_level as keyof typeof byTier]++ })
  const mandatoryCount = published.filter(c => c.is_mandatory).length

  const S = {
    input:    { padding: '10px 13px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '15px', fontFamily: 'inherit', color: 'var(--ink)', background: 'var(--card)', outline: 'none', boxSizing: 'border-box' as const },
    label:    { display: 'block' as const, fontSize: '12px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase' as const, color: 'var(--ink3)', marginBottom: '7px' },
    textarea: { width: '100%', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '15px', fontFamily: 'inherit', color: 'var(--ink)', background: 'var(--card)', resize: 'vertical' as const, lineHeight: 1.65, boxSizing: 'border-box' as const, outline: 'none' },
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>

      {/* Page header */}
      <PageHeader
        title="Course Builder"
        actions={drafts.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '20px', background: 'rgba(217,119,6,0.12)', border: '1px solid rgba(217,119,6,0.3)' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#F5B94D' }} />
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--amber)' }}>{drafts.length} draft{drafts.length > 1 ? 's' : ''} pending</span>
          </div>
        ) : undefined}
      />

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 32px 80px' }}>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '28px' }}>
          {[
            { label: 'Total Published', value: published.length, color: 'var(--teal-mid)' },
            { label: 'Foundation',      value: byTier.foundation, color: 'var(--info)' },
            { label: 'Adoption',        value: byTier.adoption,   color: 'var(--purple)' },
            { label: 'Advanced',        value: byTier.advanced,   color: 'var(--teal-mid)' },
            { label: 'Mandatory',       value: mandatoryCount,    color: '#F5B94D' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 18px' }}>
              <div style={{ fontSize: '24px', fontWeight: 900, color: s.color, lineHeight: 1 }}>{loading ? '—' : s.value}</div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink3)', marginTop: '4px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '5px' }}>
          {([
            { id: 'queue', label: `Review Queue${drafts.length > 0 ? ` · ${drafts.length}` : ''}` },
            { id: 'all',   label: `All Courses · ${published.length}` },
            { id: 'new',   label: '+ New Course' },
          ] as { id: PageTab; label: string }[]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ flex: 1, padding: '10px 16px', borderRadius: '8px', border: 'none', background: tab === t.id ? (t.id === 'new' ? 'var(--lime)' : 'var(--card-hi)') : 'transparent', color: tab === t.id ? (t.id === 'new' ? 'var(--lime-dark)' : 'var(--ink)') : 'var(--ink3)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Review Queue ── */}
        {tab === 'queue' && (
          <div>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '60px', color: 'var(--ink3)', fontSize: '15px' }}>Loading drafts…</div>
            ) : drafts.length === 0 ? (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '60px', textAlign: 'center' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(192,244,60,0.12)', border: '1px solid rgba(192,244,60,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <svg width="22" height="22" fill="none" stroke="var(--lime)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ink)', marginBottom: '6px' }}>Queue is clear</div>
                <div style={{ fontSize: '15px', color: 'var(--ink3)' }}>No draft courses waiting for review. Use Learning Lab or Dept Seeding to generate new ones.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {drafts.map(c => (
                  <div key={c.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <TierBadge tier={c.tier_level} />
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', background: 'var(--surface)', padding: '2px 8px', borderRadius: '20px' }}>
                          {SOURCE_LABEL[c.source] ?? c.source}
                        </span>
                        {c.suggested_by_name && (
                          <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>by {c.suggested_by_name}</span>
                        )}
                      </div>
                      <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
                      {c.subtitle && <div style={{ fontSize: '14px', color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.subtitle}</div>}
                      <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                        {c.dept_tags?.map(d => (
                          <span key={d} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--teal)', background: 'rgba(0,165,163,0.08)', padding: '2px 8px', borderRadius: '20px' }}>{d}</span>
                        ))}
                        <span style={{ fontSize: '12px', color: 'var(--ink4)' }}>{c.estimated_minutes} min · {fmtDate(c.created_at)}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      <button onClick={() => openCourse(c)}
                        style={{ padding: '9px 16px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--border-light)', color: 'var(--ink)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Review
                      </button>
                      <button onClick={() => handlePublish(c.id)}
                        style={{ padding: '9px 18px', borderRadius: '9px', border: 'none', background: 'var(--lime)', color: 'var(--lime-dark)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Publish
                      </button>
                      <button onClick={() => handleDelete(c.id)}
                        style={{ padding: '9px 12px', borderRadius: '9px', border: '1px solid rgba(185,28,28,0.2)', background: 'rgba(185,28,28,0.05)', color: 'var(--red)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── All Courses ── */}
        {tab === 'all' && (
          <div>
            {/* Filters */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search courses…"
                style={{ ...S.input, width: '260px' }} />
              <select value={filterTier} onChange={e => setFilterTier(e.target.value)}
                style={{ ...S.input, cursor: 'pointer' }}>
                <option value="all">All tiers</option>
                {TIERS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
              <select value={filterDept} onChange={e => setFilterDept(e.target.value)}
                style={{ ...S.input, cursor: 'pointer' }}>
                <option value="all">All departments</option>
                {DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              {(search || filterTier !== 'all' || filterDept !== 'all') && (
                <button onClick={() => { setSearch(''); setFilterTier('all'); setFilterDept('all') }}
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Clear
                </button>
              )}
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '60px', color: 'var(--ink3)', fontSize: '15px' }}>Loading courses…</div>
            ) : filtered.length === 0 ? (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '48px', textAlign: 'center', color: 'var(--ink3)', fontSize: '15px' }}>No courses match your filters.</div>
            ) : (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
                {/* Table header */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 180px 80px 80px 80px', gap: '0', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--border-light)' }}>
                  {['Course', 'Tier', 'Departments', 'Min', 'Mandatory', ''].map(h => (
                    <div key={h} style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>{h}</div>
                  ))}
                </div>
                {filtered.map((c, i) => (
                  <div key={c.id} onClick={() => openCourse(c)}
                    style={{ display: 'grid', gridTemplateColumns: '1fr 120px 180px 80px 80px 80px', gap: '0', padding: '14px 20px', borderBottom: i < filtered.length - 1 ? '1px solid var(--surface)' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--card-hi)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <div style={{ paddingRight: '16px' }}>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
                      {c.subtitle && <div style={{ fontSize: '13px', color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.subtitle}</div>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center' }}><TierBadge tier={c.tier_level} /></div>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                      {c.dept_tags?.length ? c.dept_tags.slice(0, 2).map(d => (
                        <span key={d} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--teal)', background: 'rgba(0,165,163,0.08)', padding: '2px 7px', borderRadius: '20px' }}>{d}</span>
                      )) : <span style={{ fontSize: '12px', color: 'var(--ink4)' }}>All depts</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', fontSize: '15px', color: 'var(--ink3)', fontWeight: 600 }}>{c.estimated_minutes}</div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {c.is_mandatory
                        ? <span style={{ fontSize: '11px', fontWeight: 800, color: '#F5B94D', background: 'rgba(217,119,6,0.1)', padding: '3px 8px', borderRadius: '20px' }}>Yes</span>
                        : <span style={{ fontSize: '12px', color: 'var(--ink4)' }}>—</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                      <span style={{ fontSize: '12px', color: 'var(--teal-mid)', fontWeight: 700 }}>Edit →</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── New Course ── */}
        {tab === 'new' && (
          <div style={{ maxWidth: '680px' }}>
            <div style={{ marginBottom: '28px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '6px' }}>Manual Build</div>
              <h2 style={{ fontSize: '28px', fontWeight: 900, color: 'var(--ink)', margin: '0 0 8px' }}>Create a New Course</h2>
              <p style={{ fontSize: '15px', color: 'var(--ink3)', margin: 0, lineHeight: 1.6 }}>Start with the basics. A draft is created immediately — then you can open it in the editor to add full content, tasks, and questions.</p>
            </div>

            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px' }}>
              <div style={{ marginBottom: '20px' }}>
                <label style={S.label}>Course Title *</label>
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)} style={{ ...S.input, width: '100%' }} placeholder="e.g. AI-Powered Run-of-Show for Events Teams" />
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={S.label}>Subtitle</label>
                <input value={newSubtitle} onChange={e => setNewSubtitle(e.target.value)} style={{ ...S.input, width: '100%' }} placeholder="What will they be able to do after this course?" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
                <div>
                  <label style={S.label}>Tier Level</label>
                  <select value={newTier} onChange={e => setNewTier(e.target.value as typeof newTier)}
                    style={{ ...S.input, width: '100%', cursor: 'pointer' }}>
                    {TIERS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.label}>Est. Minutes</label>
                  <input type="number" value={newMinutes} onChange={e => setNewMinutes(Number(e.target.value))} style={{ ...S.input, width: '100%' }} min={5} max={120} />
                </div>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={S.label}>Departments</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {DEPTS.map(d => {
                    const on = newDepts.includes(d)
                    return (
                      <button key={d} onClick={() => setNewDepts(on ? newDepts.filter(x => x !== d) : [...newDepts, d])}
                        style={{ padding: '5px 12px', borderRadius: '20px', border: `1px solid ${on ? 'var(--teal-mid)' : 'var(--border)'}`, background: on ? 'rgba(0,165,163,0.1)' : 'var(--border-light)', color: on ? 'var(--teal)' : 'var(--ink3)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {d}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={S.label}>Overview</label>
                <textarea value={newOverview} onChange={e => setNewOverview(e.target.value)} rows={4} style={S.textarea} placeholder="Brief description of what this course covers and why it matters" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={() => setNewMandatory(!newMandatory)}
                  style={{ width: '40px', height: '22px', borderRadius: '11px', border: 'none', background: newMandatory ? 'var(--teal-mid)' : 'var(--border)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                  <span style={{ position: 'absolute', top: '3px', left: newMandatory ? '21px' : '3px', width: '16px', height: '16px', borderRadius: '50%', background: 'var(--card)', transition: 'left 0.2s' }} />
                </button>
                <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>Mark as Mandatory</span>
              </div>

              {newMsg && (
                <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '8px', background: newMsg.ok ? 'rgba(192,244,60,0.1)' : 'rgba(255,107,107,0.1)', border: `1px solid ${newMsg.ok ? 'rgba(192,244,60,0.3)' : 'rgba(255,107,107,0.3)'}`, fontSize: '13px', fontWeight: 700, color: newMsg.ok ? 'var(--lime)' : 'var(--red)' }}>
                  {newMsg.text}
                </div>
              )}

              <button onClick={createDraft} disabled={!newTitle.trim() || newCreating}
                style={{ padding: '13px 28px', borderRadius: '12px', border: 'none', background: newTitle.trim() && !newCreating ? 'var(--teal-mid)' : 'var(--border)', color: newTitle.trim() && !newCreating ? 'var(--card)' : 'var(--ink3)', fontSize: '15px', fontWeight: 800, cursor: newTitle.trim() && !newCreating ? 'pointer' : 'not-allowed', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                {newCreating ? 'Creating…' : 'Create Draft'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Course editor panel */}
      {selected && (
        <CourseEditor
          course={selected}
          onClose={() => setSelected(null)}
          onSave={handleSave}
          onPublish={handlePublish}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
