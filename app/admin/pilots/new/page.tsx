'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import NavBar from '@/app/components/NavBar'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

type Staff = { id: string; name: string; email: string }

type ChecklistItemDraft = { title: string; description: string; category: string }

type MemberDraft = {
  staff_id: string
  role: string
  role_label: string
  role_color: string
  role_note: string
  tool_grants: string[]
  checklist: ChecklistItemDraft[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_PRESETS = [
  { key: 'pilot',      label: 'Pilot',      color: '#1d4ed8', note: 'You are the Pilot for this project — you own the scope decisions, drive the PRD, and coordinate the build with Durga.' },
  { key: 'co_pilot',   label: 'Co-Pilot',   color: '#be185d', note: 'You are the Co-Pilot — you support the Pilot on every scope decision and share responsibility for driving the PRD with Durga.' },
  { key: 'consulting', label: 'Consulting', color: '#92400e', note: 'You are a Consulting member — your domain expertise will shape the requirements. The Pilot will bring you in for your specific inputs.' },
  { key: 'tracking',   label: 'Tracking',   color: '#166534', note: 'You are the Project Tracker — your job is to maintain visibility across all Pilot Projects, escalate blockers to Durga, and keep things moving.' },
]

const TOOL_GRANT_OPTIONS = [
  { key: 'website_builder', label: 'Website Builder' },
  { key: 'brand_studio',    label: 'Brand Studio' },
  { key: 'content',         label: 'Content' },
  { key: 'intelligence',    label: 'Intelligence' },
  { key: 'smart_data',      label: 'Smart Data' },
  { key: 'hr_portal',       label: 'HR Portal' },
  { key: 'finance',         label: 'Finance' },
  { key: 'events',          label: 'Events' },
]

const CATEGORY_OPTIONS = [
  { key: 'prerequisite',   label: 'Prerequisite' },
  { key: 'scope_decision', label: 'Scope Decision' },
  { key: 'content_prep',   label: 'Content Prep' },
  { key: 'coordination',   label: 'Coordination' },
]

function emptyMember(): MemberDraft {
  const preset = ROLE_PRESETS[0]
  return { staff_id: '', role: preset.key, role_label: preset.label, role_color: preset.color, role_note: preset.note, tool_grants: [], checklist: [] }
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }

export default function NewPilotProjectPage() {
  const router = useRouter()
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('active')
  const [toolLabel, setToolLabel] = useState('')
  const [toolHref, setToolHref] = useState('')
  const [members, setMembers] = useState<MemberDraft[]>([emptyMember()])
  const [drafting, setDrafting] = useState(false)
  const [draftError, setDraftError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ log: string[]; errors: string[] } | null>(null)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    fetch('/api/staff-list').then(r => r.json()).then(data => setStaffList(Array.isArray(data) ? data : []))
  }, [])

  const updateMember = useCallback((idx: number, patch: Partial<MemberDraft>) => {
    setMembers(prev => prev.map((m, i) => i === idx ? { ...m, ...patch } : m))
  }, [])

  const setRolePreset = (idx: number, key: string) => {
    const preset = ROLE_PRESETS.find(p => p.key === key)
    if (preset) updateMember(idx, { role: preset.key, role_label: preset.label, role_color: preset.color, role_note: preset.note })
    else updateMember(idx, { role: '', role_label: '', role_color: '#374151', role_note: '' })
  }

  const toggleGrant = (idx: number, key: string) => {
    setMembers(prev => prev.map((m, i) => {
      if (i !== idx) return m
      const has = m.tool_grants.includes(key)
      return { ...m, tool_grants: has ? m.tool_grants.filter(k => k !== key) : [...m.tool_grants, key] }
    }))
  }

  const addChecklistItem = (idx: number) => {
    setMembers(prev => prev.map((m, i) => i === idx ? { ...m, checklist: [...m.checklist, { title: '', description: '', category: 'prerequisite' }] } : m))
  }
  const updateChecklistItem = (idx: number, itemIdx: number, patch: Partial<ChecklistItemDraft>) => {
    setMembers(prev => prev.map((m, i) => i === idx
      ? { ...m, checklist: m.checklist.map((it, j) => j === itemIdx ? { ...it, ...patch } : it) }
      : m))
  }
  const removeChecklistItem = (idx: number, itemIdx: number) => {
    setMembers(prev => prev.map((m, i) => i === idx ? { ...m, checklist: m.checklist.filter((_, j) => j !== itemIdx) } : m))
  }

  const draftChecklists = async () => {
    const withStaff = members.filter(m => m.staff_id)
    if (!name.trim() || withStaff.length === 0) { setDraftError('Add a project name and at least one member with a staff member selected first'); return }
    setDrafting(true); setDraftError('')
    const payload = {
      projectName: name.trim(),
      projectDescription: description.trim(),
      members: withStaff.map(m => ({ id: m.staff_id, name: staffList.find(s => s.id === m.staff_id)?.name ?? 'Unknown', roleLabel: m.role_label })),
    }
    const res = await fetch('/api/admin/pilots/draft-checklist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await res.json()
    if (!res.ok) { setDraftError(data.error ?? 'Draft failed'); setDrafting(false); return }
    setMembers(prev => prev.map(m => m.staff_id && data.checklist[m.staff_id] ? { ...m, checklist: data.checklist[m.staff_id] } : m))
    setDrafting(false)
  }

  const addMember = () => setMembers(prev => [...prev, emptyMember()])
  const removeMember = (idx: number) => setMembers(prev => prev.filter((_, i) => i !== idx))

  const handleSubmit = async () => {
    setSubmitError(''); setResult(null)
    if (!name.trim()) { setSubmitError('Project name is required'); return }
    const valid = members.filter(m => m.staff_id && m.role.trim())
    if (!valid.length) { setSubmitError('At least one member with a staff member and role is required'); return }

    setSubmitting(true)
    const res = await fetch('/api/admin/pilots', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(), description: description.trim(), status,
        tool_href: toolHref.trim() || null, tool_label: toolLabel.trim() || null,
        members: valid, send_emails: true,
      }),
    })
    const data = await res.json()
    setSubmitting(false)
    if (!res.ok) { setSubmitError(data.error ?? 'Failed to create project'); return }
    setResult({ log: data.log ?? [], errors: data.errors ?? [] })
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <NavBar />
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '40px 24px 80px' }}>

        <div style={{ marginBottom: 28 }}>
          <Link href="/admin/pilots" style={{ fontSize: 13, color: '#0d9488', textDecoration: 'none', fontWeight: 600 }}>← Back to Pilot Projects</Link>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827', margin: '10px 0 6px' }}>New Pilot Project</h1>
          <p style={{ color: '#6b7280', fontSize: 14, margin: 0 }}>
            Works whether or not the tool exists yet — leave the tool link blank if it hasn&apos;t been built.
          </p>
        </div>

        {result ? (
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 28 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 12px' }}>Project created and members notified</h2>
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#374151', fontFamily: 'monospace', whiteSpace: 'pre-wrap', marginBottom: result.errors.length ? 12 : 0 }}>
              {result.log.join('\n')}
            </div>
            {result.errors.length > 0 && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#991b1b', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                {result.errors.join('\n')}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => router.push('/admin/pilots')} style={{ background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                View Pilot Projects
              </button>
              <button onClick={() => { setResult(null); setName(''); setDescription(''); setToolLabel(''); setToolHref(''); setMembers([emptyMember()]) }}
                style={{ background: '#fff', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 16px', fontSize: 14, cursor: 'pointer' }}>
                Create Another
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Project details */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 24, marginBottom: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: '0 0 16px' }}>Project Details</h3>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>PROJECT NAME *</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Website Builder & Brand Studio Module" style={inputStyle} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>DESCRIPTION</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
                  placeholder="What this project is about, and what's still undecided" style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>STATUS</label>
                  <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle}>
                    <option value="active">Active</option>
                    <option value="building">In Build</option>
                    <option value="testing">Testing</option>
                    <option value="complete">Complete</option>
                    <option value="paused">Paused</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>TOOL LINK LABEL <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span></label>
                  <input value={toolLabel} onChange={e => setToolLabel(e.target.value)} placeholder="e.g. Open Toolkit" style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>TOOL LINK HREF <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span></label>
                  <input value={toolHref} onChange={e => setToolHref(e.target.value)} placeholder="/admin/toolkit — leave blank if not built yet" style={inputStyle} />
                </div>
              </div>
            </div>

            {/* Members */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0 }}>Members</h3>
                <button onClick={draftChecklists} disabled={drafting} style={{
                  background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px',
                  fontSize: 13, fontWeight: 700, cursor: drafting ? 'not-allowed' : 'pointer', opacity: drafting ? 0.6 : 1,
                }}>
                  {drafting ? 'Drafting…' : '✨ AI-draft checklists for all members'}
                </button>
              </div>
              {draftError && <p style={{ color: '#dc2626', fontSize: 13, margin: '0 0 12px' }}>{draftError}</p>}

              {members.map((m, idx) => (
                <div key={idx} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 20, marginBottom: 14 }}>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                    <div style={{ flex: 2 }}>
                      <label style={labelStyle}>STAFF MEMBER *</label>
                      <select value={m.staff_id} onChange={e => updateMember(idx, { staff_id: e.target.value })} style={inputStyle}>
                        <option value="">— Select —</option>
                        {staffList.slice().sort((a, b) => a.name.localeCompare(b.name)).map(s => (
                          <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>ROLE</label>
                      <select value={ROLE_PRESETS.some(p => p.key === m.role) ? m.role : 'custom'} onChange={e => setRolePreset(idx, e.target.value === 'custom' ? '' : e.target.value)} style={inputStyle}>
                        {ROLE_PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                        <option value="custom">Custom…</option>
                      </select>
                    </div>
                    <button onClick={() => removeMember(idx)} title="Remove member" style={{ alignSelf: 'flex-end', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 18, padding: '9px 6px' }}>✕</button>
                  </div>

                  {!ROLE_PRESETS.some(p => p.key === m.role) && (
                    <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>ROLE KEY <span style={{ fontWeight: 400, color: '#9ca3af' }}>(e.g. designer)</span></label>
                        <input value={m.role} onChange={e => updateMember(idx, { role: e.target.value })} style={inputStyle} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>ROLE LABEL <span style={{ fontWeight: 400, color: '#9ca3af' }}>(e.g. Designer)</span></label>
                        <input value={m.role_label} onChange={e => updateMember(idx, { role_label: e.target.value })} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>COLOR</label>
                        <input type="color" value={m.role_color} onChange={e => updateMember(idx, { role_color: e.target.value })} style={{ width: 44, height: 38, padding: 0, border: '1px solid #d1d5db', borderRadius: 8, cursor: 'pointer' }} />
                      </div>
                    </div>
                  )}

                  <div style={{ marginBottom: 12 }}>
                    <label style={labelStyle}>ASSIGNMENT EMAIL NOTE <span style={{ fontWeight: 400, color: '#9ca3af' }}>(shown in the email they receive)</span></label>
                    <textarea value={m.role_note} onChange={e => updateMember(idx, { role_note: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label style={labelStyle}>TOOL ACCESS TO GRANT <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span></label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {TOOL_GRANT_OPTIONS.map(g => (
                        <label key={g.key} style={{
                          display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '5px 10px', borderRadius: 999,
                          border: `1px solid ${m.tool_grants.includes(g.key) ? '#0d9488' : '#e5e7eb'}`,
                          background: m.tool_grants.includes(g.key) ? '#f0fdfa' : '#fff', color: m.tool_grants.includes(g.key) ? '#0d9488' : '#6b7280',
                          cursor: 'pointer', fontWeight: 600,
                        }}>
                          <input type="checkbox" checked={m.tool_grants.includes(g.key)} onChange={() => toggleGrant(idx, g.key)} style={{ margin: 0 }} />
                          {g.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <label style={{ ...labelStyle, marginBottom: 0 }}>CHECKLIST ({m.checklist.length})</label>
                      <button onClick={() => addChecklistItem(idx)} style={{ background: 'none', border: 'none', color: '#0d9488', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Add item</button>
                    </div>
                    {m.checklist.map((item, itemIdx) => (
                      <div key={itemIdx} style={{ background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                          <input value={item.title} onChange={e => updateChecklistItem(idx, itemIdx, { title: e.target.value })} placeholder="Title" style={{ ...inputStyle, flex: 2, fontSize: 13, padding: '7px 10px' }} />
                          <select value={item.category} onChange={e => updateChecklistItem(idx, itemIdx, { category: e.target.value })} style={{ ...inputStyle, flex: 1, fontSize: 13, padding: '7px 10px' }}>
                            {CATEGORY_OPTIONS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                          </select>
                          <button onClick={() => removeChecklistItem(idx, itemIdx)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 14 }}>✕</button>
                        </div>
                        <textarea value={item.description} onChange={e => updateChecklistItem(idx, itemIdx, { description: e.target.value })} placeholder="Description" rows={2} style={{ ...inputStyle, fontSize: 13, padding: '7px 10px', resize: 'vertical' }} />
                      </div>
                    ))}
                    {m.checklist.length === 0 && <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>No checklist items yet — add manually or use AI-draft above.</p>}
                  </div>
                </div>
              ))}

              <button onClick={addMember} style={{ background: '#fff', border: '1px dashed #d1d5db', borderRadius: 10, padding: '12px', width: '100%', color: '#6b7280', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                + Add Member
              </button>
            </div>

            {submitError && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{submitError}</p>}
            <button onClick={handleSubmit} disabled={submitting} style={{
              background: '#0d9488', color: '#fff', border: 'none', borderRadius: 10, padding: '13px 24px',
              fontSize: 15, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1, width: '100%',
            }}>
              {submitting ? 'Creating…' : 'Create Project & Notify Members'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
