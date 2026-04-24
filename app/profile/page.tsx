'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { submitProfile } from '@/app/actions/profile'
import Link from 'next/link'

const AI_READINESS_LABELS: Record<number, string> = {
  1: 'Never used AI tools',
  2: 'Tried ChatGPT a few times',
  3: 'Use AI regularly for some tasks',
  4: 'Comfortable with multiple AI tools',
  5: 'Power user — build workflows with AI',
}

const FREQUENCY_OPTIONS = ['Daily', 'Few times a week', 'Weekly', 'Monthly', 'Occasionally']
const COMMON_TOOLS = ['Excel', 'PowerPoint', 'Word', 'Google Sheets', 'Salesforce', 'HubSpot', 'Slack', 'Zoom', 'Canva', 'Mailchimp', 'Trello', 'Asana', 'WhatsApp', 'Email', 'SAP', 'QuickBooks', 'Xero', 'LinkedIn', 'Instagram', 'Other']

type Task = {
  task_name: string
  task_description: string
  tools_used: string[]
  other_tool: string
  time_taken_today: string
  frequency: string
  ai_time_estimate: string
  skill_needed: string
  ai_readiness: number
}

const emptyTask = (): Task => ({
  task_name: '',
  task_description: '',
  tools_used: [],
  other_tool: '',
  time_taken_today: '',
  frequency: 'Daily',
  ai_time_estimate: '',
  skill_needed: '',
  ai_readiness: 1,
})

export default function ProfilePage() {
  const router  = useRouter()
  const [email, setEmail]   = useState('')
  const [verified, setVerified] = useState(false)
  const [verifyError, setVerifyError] = useState('')
  const [staffName, setStaffName] = useState('')
  const [staffId, setStaffId] = useState('')

  const [tasks, setTasks]   = useState<Task[]>([emptyTask()])
  const [activeTask, setActiveTask] = useState(0)
  const [pending, setPending] = useState(false)
  const [error, setError]   = useState('')
  const [done, setDone]     = useState(false)

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setVerifyError('')
    const res = await fetch('/api/verify-staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    })
    const data = await res.json()
    if (data.error) { setVerifyError(data.error); return }
    setStaffName(data.name)
    setStaffId(data.id)
    setVerified(true)
  }

  function updateTask(idx: number, field: keyof Task, value: string | string[] | number) {
    setTasks(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t))
  }

  function toggleTool(idx: number, tool: string) {
    setTasks(prev => prev.map((t, i) => {
      if (i !== idx) return t
      const has = t.tools_used.includes(tool)
      return { ...t, tools_used: has ? t.tools_used.filter(x => x !== tool) : [...t.tools_used, tool] }
    }))
  }

  function addTask() {
    if (tasks.length >= 5) return
    setTasks(prev => [...prev, emptyTask()])
    setActiveTask(tasks.length)
  }

  function removeTask(idx: number) {
    if (tasks.length === 1) return
    setTasks(prev => prev.filter((_, i) => i !== idx))
    setActiveTask(Math.max(0, idx - 1))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const valid = tasks.filter(t => t.task_name.trim())
    if (!valid.length) { setError('Add at least one task.'); return }
    setPending(true)

    const fd = new FormData()
    fd.set('staff_id', staffId)
    fd.set('tasks', JSON.stringify(valid.map(t => ({
      ...t,
      tools_used: [
        ...t.tools_used.filter(x => x !== 'Other'),
        ...(t.other_tool.trim() ? [t.other_tool.trim()] : []),
      ],
    }))))

    const result = await submitProfile(fd)
    if (result.error) { setError(result.error); setPending(false); return }
    setDone(true)
  }

  // Done screen
  if (done) {
    return (
      <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: 'linear-gradient(155deg, #464D53 0%, #010103 60%)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ maxWidth: '480px', textAlign: 'center' }}>
          <div style={{ width: '72px', height: '72px', borderRadius: '50%', border: '3px solid #C0F43C', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', background: '#C0F43C20' }}>
            <svg width="32" height="32" fill="none" stroke="#C0F43C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h1 style={{ fontSize: '32px', fontWeight: 800, color: 'white', marginBottom: '12px' }}>Work profile mapped,<br /><span style={{ color: '#C0F43C' }}>{staffName.split(' ')[0]}.</span></h1>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, marginBottom: '36px' }}>
            Your input has been recorded. The TAOS team will analyse every submission and surface the biggest opportunities for your work first.
          </p>
          <Link href="/" style={{ background: '#C0F43C', color: '#1E2124', fontSize: '14px', fontWeight: 800, padding: '14px 32px', borderRadius: '50px', textDecoration: 'none', display: 'inline-block' }}>
            See Live Tracker
          </Link>
        </div>
      </div>
    )
  }

  // Email verify screen
  if (!verified) {
    return (
      <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#F2F5F5', minHeight: '100vh' }}>
        <nav style={{ background: '#010103', padding: '0 48px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <div style={{ width: '28px', height: '28px', background: '#00A5A3', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
            <span style={{ fontSize: '14px', fontWeight: 800, color: 'white' }}>TAOS</span>
          </Link>
        </nav>
        <div style={{ maxWidth: '480px', margin: '80px auto', padding: '0 24px', textAlign: 'center' }}>
          <div style={{ width: '56px', height: '56px', background: '#1E2124', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg width="26" height="26" fill="none" stroke="#C0F43C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#1E2124', marginBottom: '10px' }}>Map Your Work</h1>
          <p style={{ fontSize: '15px', color: '#464D53', lineHeight: 1.7, marginBottom: '32px' }}>Enter the email you used when you joined. This links your work profile to your TAOS record.</p>
          <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: '24px', padding: '36px' }}>
            <form onSubmit={handleVerify}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#1E2124', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px', textAlign: 'left' }}>Work Email</label>
              <input
                type="email" required value={email} onChange={e => { setEmail(e.target.value); setVerifyError('') }}
                placeholder="you@tresconglobal.com"
                style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: `1px solid ${verifyError ? '#FECACA' : '#E5E7EB'}`, fontSize: '14px', color: '#1E2124', outline: 'none', fontFamily: 'inherit', background: '#FAFAFA', marginBottom: '12px', boxSizing: 'border-box' }}
              />
              {verifyError && <p style={{ fontSize: '13px', color: '#C0392B', marginBottom: '12px', textAlign: 'left', fontWeight: 600 }}>{verifyError}</p>}
              <button type="submit" style={{ width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: '#C0F43C', color: '#1E2124', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                Continue to Work Profile
              </button>
            </form>
          </div>
          <p style={{ marginTop: '16px', fontSize: '13px', color: '#888' }}>Haven&apos;t joined yet? <Link href="/join" style={{ color: '#00A5A3', fontWeight: 700, textDecoration: 'none' }}>Join first</Link></p>
        </div>
      </div>
    )
  }

  const task = tasks[activeTask]

  return (
    <div style={{ fontFamily: 'var(--font-manrope), Manrope, sans-serif', background: '#F2F5F5', minHeight: '100vh' }}>

      <nav style={{ background: '#010103', padding: '0 48px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
          <div style={{ width: '28px', height: '28px', background: '#00A5A3', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <span style={{ fontSize: '14px', fontWeight: 800, color: 'white' }}>TAOS</span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#C0F43C20', border: '1px solid #C0F43C40', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#C0F43C' }}>{staffName.charAt(0)}</span>
          </div>
          <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>{staffName}</span>
        </div>
      </nav>

      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '48px 24px' }}>

        {/* Header */}
        <div style={{ marginBottom: '36px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#00A5A3', marginBottom: '10px' }}>Step 2 — Work Transformation Map</div>
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#1E2124', marginBottom: '10px', letterSpacing: '-0.5px' }}>
            What does your work look like?
          </h1>
          <p style={{ fontSize: '15px', color: '#464D53', lineHeight: 1.7 }}>
            Map your top tasks. For each one — how long it takes today, and how much time you think AI could save. This is how TAOS learns what to build first.
          </p>
        </div>

        {/* Task tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
          {tasks.map((t, i) => (
            <button
              key={i}
              onClick={() => setActiveTask(i)}
              style={{
                padding: '8px 16px', borderRadius: '10px', border: `2px solid ${activeTask === i ? '#1E2124' : '#E5E7EB'}`,
                background: activeTask === i ? '#1E2124' : 'white',
                color: activeTask === i ? 'white' : '#464D53',
                fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {t.task_name.trim() ? t.task_name.slice(0, 20) : `Task ${i + 1}`}
            </button>
          ))}
          {tasks.length < 5 && (
            <button
              onClick={addTask}
              style={{ padding: '8px 16px', borderRadius: '10px', border: '2px dashed #D1D5DB', background: 'transparent', color: '#9CA3AF', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              + Add task
            </button>
          )}
        </div>

        {/* Task form */}
        <form onSubmit={handleSubmit}>
          <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: '24px', padding: '36px', marginBottom: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>

            {/* Task header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#00A5A3' }}>
                Task {activeTask + 1} of {tasks.length}
              </div>
              {tasks.length > 1 && (
                <button type="button" onClick={() => removeTask(activeTask)} style={{ fontSize: '12px', color: '#C0392B', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>
                  Remove
                </button>
              )}
            </div>

            {/* Task name */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#1E2124', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>Task Name *</label>
              <input
                type="text" required value={task.task_name} onChange={e => updateTask(activeTask, 'task_name', e.target.value)}
                placeholder="e.g. Prepare weekly sales report"
                style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #E5E7EB', fontSize: '14px', color: '#1E2124', outline: 'none', fontFamily: 'inherit', background: '#FAFAFA', boxSizing: 'border-box' }}
              />
            </div>

            {/* Description */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#1E2124', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>Describe what you actually do</label>
              <textarea
                rows={3} value={task.task_description} onChange={e => updateTask(activeTask, 'task_description', e.target.value)}
                placeholder="Walk us through exactly what you do for this task — the steps, the data you gather, who you report to, etc."
                style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #E5E7EB', fontSize: '14px', color: '#1E2124', outline: 'none', fontFamily: 'inherit', background: '#FAFAFA', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>

            {/* Tools */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#1E2124', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px' }}>Tools you use for this task</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {COMMON_TOOLS.map(tool => {
                  const selected = task.tools_used.includes(tool)
                  return (
                    <button
                      key={tool} type="button" onClick={() => toggleTool(activeTask, tool)}
                      style={{
                        padding: '6px 12px', borderRadius: '8px', border: `1px solid ${selected ? '#1E2124' : '#E5E7EB'}`,
                        background: selected ? '#1E2124' : 'white', color: selected ? 'white' : '#464D53',
                        fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      {tool}
                    </button>
                  )
                })}
              </div>
              {task.tools_used.includes('Other') && (
                <input
                  type="text" value={task.other_tool} onChange={e => updateTask(activeTask, 'other_tool', e.target.value)}
                  placeholder="Which other tool?"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #E5E7EB', fontSize: '13px', color: '#1E2124', outline: 'none', fontFamily: 'inherit', background: '#FAFAFA', boxSizing: 'border-box' }}
                />
              )}
            </div>

            {/* Time + Frequency */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#1E2124', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>How long does it take today?</label>
                <input
                  type="text" value={task.time_taken_today} onChange={e => updateTask(activeTask, 'time_taken_today', e.target.value)}
                  placeholder="e.g. 3 hours, half a day"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1px solid #E5E7EB', fontSize: '14px', color: '#1E2124', outline: 'none', fontFamily: 'inherit', background: '#FAFAFA', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#1E2124', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>How often?</label>
                <select
                  value={task.frequency} onChange={e => updateTask(activeTask, 'frequency', e.target.value)}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1px solid #E5E7EB', fontSize: '14px', color: '#1E2124', outline: 'none', fontFamily: 'inherit', background: '#FAFAFA', appearance: 'none', boxSizing: 'border-box' }}
                >
                  {FREQUENCY_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>

            {/* AI estimate */}
            <div style={{ background: '#F0FFF4', border: '1px solid #BBF7D0', borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#166534', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '12px' }}>
                If AI did this — how long would it take?
              </div>
              <input
                type="text" value={task.ai_time_estimate} onChange={e => updateTask(activeTask, 'ai_time_estimate', e.target.value)}
                placeholder="e.g. 10 minutes, 30 seconds, instant"
                style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #BBF7D0', fontSize: '14px', color: '#1E2124', outline: 'none', fontFamily: 'inherit', background: 'white', boxSizing: 'border-box' }}
              />
              <p style={{ fontSize: '12px', color: '#4B7A5B', marginTop: '8px', lineHeight: 1.6 }}>
                Be honest — even if you don&apos;t fully know, give us your gut feeling. This is how we find the 4-days-to-10-minutes moments.
              </p>
            </div>

            {/* Skill needed */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#1E2124', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>What AI skill or tool would you need to learn?</label>
              <input
                type="text" value={task.skill_needed} onChange={e => updateTask(activeTask, 'skill_needed', e.target.value)}
                placeholder="e.g. Prompt writing in ChatGPT, Excel Copilot, Claude for analysis"
                style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #E5E7EB', fontSize: '14px', color: '#1E2124', outline: 'none', fontFamily: 'inherit', background: '#FAFAFA', boxSizing: 'border-box' }}
              />
            </div>

            {/* AI Readiness */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#1E2124', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '12px' }}>
                Your AI readiness — where are you today?
              </label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n} type="button" onClick={() => updateTask(activeTask, 'ai_readiness', n)}
                    style={{
                      flex: 1, padding: '10px', borderRadius: '10px', border: `2px solid ${task.ai_readiness === n ? '#C0F43C' : '#E5E7EB'}`,
                      background: task.ai_readiness === n ? '#C0F43C' : 'white',
                      color: task.ai_readiness === n ? '#1E2124' : '#9CA3AF',
                      fontSize: '16px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: '13px', color: '#464D53', background: '#F8FFF8', border: '1px solid #E0F5E0', borderRadius: '8px', padding: '8px 12px' }}>
                {AI_READINESS_LABELS[task.ai_readiness]}
              </p>
            </div>
          </div>

          {/* Save nav between tasks */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            {activeTask > 0 ? (
              <button type="button" onClick={() => setActiveTask(activeTask - 1)} style={{ fontSize: '13px', color: '#464D53', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>
                Previous task
              </button>
            ) : <div />}
            {activeTask < tasks.length - 1 ? (
              <button type="button" onClick={() => setActiveTask(activeTask + 1)} style={{ background: '#1E2124', color: 'white', fontSize: '13px', fontWeight: 700, padding: '10px 20px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                Next task
              </button>
            ) : <div />}
          </div>

          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: '#C0392B', fontWeight: 600 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            style={{
              width: '100%', padding: '16px', borderRadius: '14px', border: 'none',
              background: pending ? '#E5E7EB' : '#C0F43C',
              color: pending ? '#999' : '#1E2124',
              fontSize: '15px', fontWeight: 800, cursor: pending ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
            }}
          >
            {pending ? 'Submitting...' : `Submit ${tasks.filter(t => t.task_name.trim()).length} task${tasks.filter(t => t.task_name.trim()).length !== 1 ? 's' : ''} to TAOS`}
          </button>

          <p style={{ textAlign: 'center', fontSize: '12px', color: '#888', marginTop: '16px', lineHeight: 1.6 }}>
            Your input is private and only used to build TAOS for the Trescon team.
          </p>
        </form>
      </div>
    </div>
  )
}
