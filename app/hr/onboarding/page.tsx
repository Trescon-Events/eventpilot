'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const C = {
  bg:      '#F6F8FB',
  surface: '#FFFFFF',
  border:  '#DDE8EE',
  text:    '#0F1923',
  muted:   '#5B7080',
  green:   '#00897B',
  amber:   '#D97706',
  red:     '#8B1A1A',
  purple:  '#6C54B5',
}

type OnboardingRecord = {
  id: string
  staff_id: string
  template_id: string | null
  started_at: string
  target_end: string | null
  status: string
  staff: { id: string; name: string; department: string; job_level: string; joined_at: string } | null
  tasks: Array<{
    id: string; title: string; owner: string; status: string; due_date: string | null
  }>
}

type Template = {
  id: string
  name: string
  department: string | null
  job_level: string | null
  description: string | null
  tasks: Array<{
    id: string; title: string; owner: string; due_day: number | null; description: string | null
  }>
}

function pill(color: string, text: string) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, background: color + '20', color, letterSpacing: '0.4px' }}>
      {text}
    </span>
  )
}

const OWNER_COLOR: Record<string, string> = {
  hr:      C.green,
  it:      C.purple,
  manager: C.amber,
  staff:   C.muted,
  finance: C.red,
}

export default function OnboardingTrackerPage() {
  const [records,    setRecords]    = useState<OnboardingRecord[]>([])
  const [templates,  setTemplates]  = useState<Template[]>([])
  const [loading,    setLoading]    = useState(true)
  const [tab,        setTab]        = useState<'active' | 'templates'>('active')
  const [expanded,   setExpanded]   = useState<string | null>(null)
  const [busy,       setBusy]       = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [active, tmpl] = await Promise.all([
      fetch('/api/hr/onboarding?all=true').then(r => r.json()),
      fetch('/api/hr/onboarding?templates=true').then(r => r.json()),
    ])
    setRecords(Array.isArray(active) ? active : [])
    setTemplates(Array.isArray(tmpl) ? tmpl : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function updateTaskStatus(taskId: string, status: 'completed' | 'skipped' | 'in_progress') {
    setBusy(taskId)
    await fetch('/api/hr/onboarding', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ task_id: taskId, status }),
    })
    setBusy(null)
    load()
  }

  const STATUS_COLOR: Record<string, string> = {
    pending:     C.muted,
    in_progress: C.amber,
    completed:   C.green,
    skipped:     C.muted,
    stalled:     C.red,
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '0 32px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', alignItems: 'center', height: '60px', gap: '16px' }}>
          <Link href="/hr" style={{ fontSize: '13px', color: C.muted, textDecoration: 'none', fontWeight: 600 }}>← HR Portal</Link>
          <div style={{ width: '1px', height: '20px', background: C.border }} />
          <div style={{ fontSize: '15px', fontWeight: 800, color: C.text }}>Onboarding Tracker</div>
        </div>
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: `1px solid ${C.border}` }}>
          {(['active', 'templates'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '10px 20px', background: 'transparent', border: 'none', borderBottom: tab === t ? `2px solid ${C.green}` : '2px solid transparent', color: tab === t ? C.green : C.muted, fontSize: '13px', fontWeight: 700, cursor: 'pointer', marginBottom: '-1px', fontFamily: 'inherit', textTransform: 'capitalize' }}>
              {t === 'active' ? `Active Onboardings (${records.length})` : `Templates (${templates.length})`}
            </button>
          ))}
        </div>

        {loading && <div style={{ textAlign: 'center', padding: '60px', color: C.muted }}>Loading...</div>}

        {/* ── Active Onboardings ── */}
        {!loading && tab === 'active' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {records.length === 0 && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '48px', textAlign: 'center', color: C.muted }}>
                No active onboardings.
              </div>
            )}
            {records.map(ob => {
              const done  = ob.tasks.filter(t => t.status === 'completed' || t.status === 'skipped').length
              const pct   = ob.tasks.length > 0 ? Math.round((done / ob.tasks.length) * 100) : 0
              const open  = expanded === ob.id

              return (
                <div key={ob.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', overflow: 'hidden' }}>
                  {/* Summary row */}
                  <div
                    onClick={() => setExpanded(open ? null : ob.id)}
                    style={{ padding: '20px 24px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <Link
                          href={`/hr/staff/${ob.staff_id}`}
                          onClick={e => e.stopPropagation()}
                          style={{ fontSize: '15px', fontWeight: 800, color: C.text, textDecoration: 'none' }}>
                          {ob.staff?.name ?? ob.staff_id}
                        </Link>
                        {pill(STATUS_COLOR[ob.status] ?? C.muted, ob.status)}
                      </div>
                      <div style={{ fontSize: '13px', color: C.muted }}>
                        {ob.staff?.department} · started {ob.started_at}
                        {ob.target_end && ` · target ${ob.target_end}`}
                      </div>
                      {/* Progress bar */}
                      <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ flex: 1, height: '6px', background: C.border, borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? C.green : C.amber, borderRadius: '3px', transition: 'width 0.3s' }} />
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: C.text, whiteSpace: 'nowrap' }}>{pct}%</div>
                        <div style={{ fontSize: '12px', color: C.muted, whiteSpace: 'nowrap' }}>{done}/{ob.tasks.length} tasks</div>
                      </div>
                    </div>
                    <div style={{ fontSize: '18px', color: C.muted, flexShrink: 0 }}>{open ? '▲' : '▼'}</div>
                  </div>

                  {/* Expanded tasks */}
                  {open && (
                    <div style={{ borderTop: `1px solid ${C.border}`, padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {ob.tasks.map(task => (
                        <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '10px', background: C.bg, border: `1px solid ${C.border}` }}>
                          {/* Status dot */}
                          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: STATUS_COLOR[task.status] ?? C.muted, flexShrink: 0 }} />

                          <div style={{ flex: 1, fontSize: '13px', color: C.text, fontWeight: 600 }}>{task.title}</div>

                          {pill(OWNER_COLOR[task.owner] ?? C.muted, task.owner)}

                          {task.due_date && (
                            <div style={{ fontSize: '12px', color: C.muted, whiteSpace: 'nowrap' }}>{task.due_date}</div>
                          )}

                          {/* Action buttons */}
                          {task.status !== 'completed' && task.status !== 'skipped' && (
                            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                              <button
                                disabled={busy === task.id}
                                onClick={() => updateTaskStatus(task.id, 'completed')}
                                style={{ padding: '5px 12px', borderRadius: '6px', background: C.green, color: '#fff', fontSize: '11px', fontWeight: 700, border: 'none', cursor: 'pointer', opacity: busy === task.id ? 0.5 : 1, fontFamily: 'inherit' }}>
                                Done
                              </button>
                              <button
                                disabled={busy === task.id}
                                onClick={() => updateTaskStatus(task.id, 'skipped')}
                                style={{ padding: '5px 12px', borderRadius: '6px', background: C.bg, color: C.muted, fontSize: '11px', fontWeight: 700, border: `1px solid ${C.border}`, cursor: 'pointer', fontFamily: 'inherit' }}>
                                Skip
                              </button>
                            </div>
                          )}
                          {(task.status === 'completed' || task.status === 'skipped') && (
                            <div style={{ fontSize: '12px', color: STATUS_COLOR[task.status], fontWeight: 700 }}>
                              {task.status === 'completed' ? 'Done' : 'Skipped'}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── Templates ── */}
        {!loading && tab === 'templates' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
            {templates.length === 0 && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '48px', textAlign: 'center', color: C.muted, gridColumn: '1/-1' }}>
                No onboarding templates configured yet.
              </div>
            )}
            {templates.map(tmpl => (
              <div key={tmpl.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '24px' }}>
                <div style={{ fontSize: '15px', fontWeight: 800, color: C.text, marginBottom: '4px' }}>{tmpl.name}</div>
                {tmpl.description && (
                  <div style={{ fontSize: '13px', color: C.muted, marginBottom: '8px' }}>{tmpl.description}</div>
                )}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                  {tmpl.department && pill(C.green, tmpl.department)}
                  {tmpl.job_level  && pill(C.purple, tmpl.job_level)}
                  {pill(C.muted, `${tmpl.tasks.length} tasks`)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {tmpl.tasks.slice(0, 6).map(t => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: C.muted }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: OWNER_COLOR[t.owner] ?? C.muted, flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>{t.title}</span>
                      {t.due_day != null && <span style={{ color: C.amber, fontWeight: 600 }}>day {t.due_day}</span>}
                    </div>
                  ))}
                  {tmpl.tasks.length > 6 && (
                    <div style={{ fontSize: '12px', color: C.muted, paddingLeft: '14px' }}>
                      +{tmpl.tasks.length - 6} more tasks
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
