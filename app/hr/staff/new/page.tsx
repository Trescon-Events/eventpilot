'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'

const C = {
  bg:      '#F6F8FB',
  surface: '#FFFFFF',
  border:  '#DDE8EE',
  text:    '#0F1923',
  muted:   '#5B7080',
  teal:    '#00897B',
  amber:   '#D97706',
  red:     '#DC2626',
  purple:  '#6C54B5',
}

const OFFICES    = ['Dubai', 'Bangalore', 'Mangalore', 'Manipal']
const LEVELS     = ['staff', 'team_lead', 'dept_head', 'office_head'] as const
const LEVEL_LABEL: Record<string, string> = { staff: 'Staff', team_lead: 'Team Lead', dept_head: 'Dept Head', office_head: 'Office Head' }
const WORK_MODES = ['Onsite', 'Hybrid', 'Remote']
const GENDERS    = ['Male', 'Female', 'Other', 'Prefer not to say']
const SALUTATIONS = ['Mr', 'Ms', 'Mrs', 'Dr', 'Prof']
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

const PLATFORM_TOOLS = [
  { key: 'smart_data',      label: 'Smart Data',      color: '#0E7490' },
  { key: 'hr_portal',       label: 'HR Portal',       color: '#7C3AED' },
  { key: 'events',          label: 'Events',          color: '#DC2626' },
  { key: 'intelligence',    label: 'Intelligence',    color: '#D97706' },
  { key: 'finance',         label: 'Finance',         color: '#059669' },
  { key: 'brand_studio',    label: 'Brand Studio',    color: '#DB2777' },
  { key: 'website_builder', label: 'Website Builder', color: '#2563EB' },
  { key: 'content',         label: 'Content',         color: '#EA580C' },
]

const STEPS = [
  { id: 1, label: 'Personal Info' },
  { id: 2, label: 'Work Details' },
  { id: 3, label: 'Reporting' },
  { id: 4, label: 'Access & Tools' },
  { id: 5, label: 'Review & Create' },
]

type StaffMember = {
  id: string
  name: string
  role: string | null
  department: string | null
  job_level: string
  office_id: string | null
}

// ── Form field components ─────────────────────────────────────────────────────
function Field({ label, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: C.muted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
        {label}{required && <span style={{ color: C.red, marginLeft: '2px' }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: '11px', color: C.muted, marginTop: '4px' }}>{hint}</div>}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: '8px',
  border: `1px solid ${C.border}`, fontSize: '13px',
  fontFamily: 'system-ui, sans-serif', outline: 'none',
  background: C.surface, color: C.text, boxSizing: 'border-box',
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...inputStyle, ...props.style }} />
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return <select {...props} style={{ ...inputStyle, cursor: 'pointer', ...props.style }}>{props.children}</select>
}

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ on, onChange, color = C.teal }: { on: boolean; onChange: (v: boolean) => void; color?: string }) {
  return (
    <button onClick={() => onChange(!on)} style={{
      width: '40px', height: '22px', borderRadius: '11px',
      background: on ? color : C.border, border: 'none', cursor: 'pointer',
      position: 'relative', transition: 'background 0.15s', flexShrink: 0,
    }}>
      <div style={{
        width: '16px', height: '16px', borderRadius: '50%',
        background: '#fff', position: 'absolute', top: '3px',
        left: on ? '21px' : '3px', transition: 'left 0.15s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
      }} />
    </button>
  )
}

// ── Staff search dropdown ─────────────────────────────────────────────────────
function StaffSearch({ staff, value, onChange, placeholder }: {
  staff: StaffMember[]
  value: string   // id
  onChange: (id: string) => void
  placeholder?: string
}) {
  const [query, setQuery]   = useState('')
  const [open,  setOpen]    = useState(false)

  const selected = staff.find(s => s.id === value)

  const filtered = useMemo(() => {
    if (!query.trim()) return staff.slice(0, 12)
    const q = query.toLowerCase()
    return staff.filter(s => s.name.toLowerCase().includes(q) || (s.role ?? '').toLowerCase().includes(q)).slice(0, 12)
  }, [staff, query])

  return (
    <div style={{ position: 'relative' }}>
      {selected && !open ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px',
          border: `1px solid ${C.teal}`, borderRadius: '8px', background: C.teal + '06', cursor: 'pointer',
        }} onClick={() => { setOpen(true); setQuery('') }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.teal + '20', color: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>
            {selected.name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>{selected.name}</div>
            <div style={{ fontSize: '11px', color: C.muted }}>{selected.role ?? LEVEL_LABEL[selected.job_level] ?? selected.job_level}</div>
          </div>
          <button onClick={e => { e.stopPropagation(); onChange(''); setQuery('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: '14px', padding: '2px', display: 'flex', alignItems: 'center' }}>
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      ) : (
        <input
          autoFocus={open}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          placeholder={placeholder ?? 'Search by name or role…'}
          style={{ ...inputStyle, borderColor: open ? C.teal : C.border }}
        />
      )}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px',
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px',
          boxShadow: '0 6px 20px rgba(0,0,0,0.1)', zIndex: 100,
          maxHeight: '240px', overflowY: 'auto',
        }}>
          {filtered.length === 0 && <div style={{ padding: '14px 16px', fontSize: '12px', color: C.muted }}>No match</div>}
          {filtered.map(s => (
            <div key={s.id} onMouseDown={() => { onChange(s.id); setOpen(false); setQuery('') }}
              style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: `1px solid ${C.border}` }}
              onMouseEnter={e => (e.currentTarget.style.background = '#F0F4F8')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: C.muted + '20', color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800, flexShrink: 0 }}>
                {s.name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: C.text }}>{s.name}</div>
                <div style={{ fontSize: '10px', color: C.muted }}>{s.role ?? ''} {s.department ? `· ${s.department}` : ''}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Multi-select staff for reassigning reports ────────────────────────────────
function ReportMultiSelect({ staff, selected, onChange }: {
  staff: StaffMember[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    if (!query.trim()) return staff.slice(0, 20)
    const q = query.toLowerCase()
    return staff.filter(s => s.name.toLowerCase().includes(q) || (s.department ?? '').toLowerCase().includes(q)).slice(0, 20)
  }, [staff, query])

  function toggle(id: string) {
    selected.includes(id) ? onChange(selected.filter(x => x !== id)) : onChange([...selected, id])
  }

  const selectedStaff = staff.filter(s => selected.includes(s.id))

  return (
    <div>
      {selectedStaff.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
          {selectedStaff.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 8px 3px 6px', background: C.teal + '12', border: `1px solid ${C.teal}30`, borderRadius: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: C.teal }}>{s.name}</span>
              <button onClick={() => toggle(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.teal, padding: 0, display: 'flex', alignItems: 'center' }}>
                <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          ))}
        </div>
      )}
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search staff to assign as reports…"
        style={inputStyle}
      />
      {filtered.length > 0 && (
        <div style={{ marginTop: '6px', border: `1px solid ${C.border}`, borderRadius: '8px', overflow: 'hidden', maxHeight: '200px', overflowY: 'auto' }}>
          {filtered.map(s => {
            const isOn = selected.includes(s.id)
            return (
              <div key={s.id} onClick={() => toggle(s.id)} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '9px 12px', cursor: 'pointer',
                background: isOn ? C.teal + '08' : C.surface,
                borderBottom: `1px solid ${C.border}`,
              }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', border: `2px solid ${isOn ? C.teal : C.border}`, background: isOn ? C.teal : 'transparent', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: C.text }}>{s.name}</div>
                  <div style={{ fontSize: '10px', color: C.muted }}>{s.role ?? ''} {s.department ? `· ${s.department}` : ''}</div>
                </div>
                {s.office_id && <span style={{ fontSize: '10px', color: C.muted }}>{s.office_id}</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function NewStaffPage() {
  const [step,      setStep]      = useState(1)
  const [allStaff,  setAllStaff]  = useState<StaffMember[]>([])
  const [saving,    setSaving]    = useState(false)
  const [result,    setResult]    = useState<{ staff_id: string; name: string; email: string; temp_password: string } | null>(null)
  const [errors,    setErrors]    = useState<Record<string, string>>({})

  // ── Form state ──────────────────────────────────────────────────────────────
  // Step 1: Personal
  const [salutation,   setSalutation]   = useState('')
  const [name,         setName]         = useState('')
  const [email,        setEmail]        = useState('')
  const [phone,        setPhone]        = useState('')
  const [dob,          setDob]          = useState('')
  const [gender,       setGender]       = useState('')
  const [bloodGroup,   setBloodGroup]   = useState('')
  const [emergencyName,  setEmergencyName]  = useState('')
  const [emergencyPhone, setEmergencyPhone] = useState('')

  // Step 2: Work
  const [department,    setDepartment]    = useState('')
  const [role,          setRole]          = useState('')
  const [jobLevel,      setJobLevel]      = useState<typeof LEVELS[number]>('staff')
  const [officeId,      setOfficeId]      = useState('bangalore')
  const [workMode,      setWorkMode]      = useState('Onsite')
  const [employeeCode,  setEmployeeCode]  = useState('')
  const [joinedAt,      setJoinedAt]      = useState(new Date().toISOString().split('T')[0])

  // Step 3: Reporting
  const [managerId,       setManagerId]       = useState('')
  const [reassignReports, setReassignReports] = useState<string[]>([])

  // Step 4: Access
  const [accessEnabled,  setAccessEnabled]  = useState(true)
  const [toolGrants,     setToolGrants]     = useState<Record<string, boolean>>({})
  const [startOnboarding, setStartOnboarding] = useState(true)

  useEffect(() => {
    fetch('/api/staff-list')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setAllStaff(d) })
  }, [])

  // Departments from existing staff
  const departments = useMemo(() =>
    [...new Set(allStaff.map(s => s.department).filter(Boolean))].sort() as string[]
  , [allStaff])

  // Staff available to be reports (no current manager, or we allow reassignment)
  const potentialReports = useMemo(() =>
    allStaff.filter(s => s.id !== managerId)
  , [allStaff, managerId])

  function validate(s: number): Record<string, string> {
    const e: Record<string, string> = {}
    if (s === 1) {
      if (!name.trim())  e.name  = 'Full name is required'
      if (!email.trim()) e.email = 'Email address is required'
      if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email address'
    }
    if (s === 2) {
      if (!department.trim()) e.department = 'Department is required'
      if (!role.trim())       e.role       = 'Job title is required'
    }
    return e
  }

  function next() {
    const e = validate(step)
    if (Object.keys(e).length) { setErrors(e); return }
    setErrors({})
    setStep(s => s + 1)
  }

  function back() { setErrors({}); setStep(s => s - 1) }

  async function createStaff() {
    setSaving(true)
    setErrors({})
    try {
      const res = await fetch('/api/hr/staff', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:                   name.trim(),
          email:                  email.trim().toLowerCase(),
          salutation:             salutation || undefined,
          phone:                  phone || undefined,
          date_of_birth:          dob || undefined,
          gender:                 gender || undefined,
          blood_group:            bloodGroup || undefined,
          emergency_contact_name:  emergencyName || undefined,
          emergency_contact_phone: emergencyPhone || undefined,
          department:             department.trim(),
          role:                   role.trim(),
          job_level:              jobLevel,
          office_id:              officeId,
          work_mode:              workMode,
          employee_code:          employeeCode || undefined,
          joined_at:              joinedAt,
          manager_id:             managerId || undefined,
          reassign_report_ids:    reassignReports.length ? reassignReports : undefined,
          access_enabled:         accessEnabled,
          tool_grants:            toolGrants,
          start_onboarding:       startOnboarding,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setErrors({ submit: data.error ?? 'Something went wrong' })
        return
      }
      setResult(data)
    } finally {
      setSaving(false)
    }
  }

  // ── Success screen ───────────────────────────────────────────────────────────
  if (result) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', padding: '40px 20px' }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '48px', maxWidth: '480px', width: '100%', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.teal + '18', color: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: C.text, marginBottom: '6px' }}>
            {result.name.split(' ')[0]} has been added
          </div>
          <div style={{ fontSize: '13px', color: C.muted, marginBottom: '32px' }}>
            Staff profile created successfully.
          </div>

          {/* Credentials box */}
          <div style={{ background: '#F0F4F8', borderRadius: '12px', padding: '20px', textAlign: 'left', marginBottom: '24px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Login Credentials</div>
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '11px', color: C.muted, marginBottom: '2px' }}>Email</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: C.text, fontFamily: 'monospace' }}>{result.email}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: C.muted, marginBottom: '2px' }}>Temporary Password</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: C.teal, fontFamily: 'monospace', letterSpacing: '1px' }}>{result.temp_password}</div>
            </div>
            <div style={{ marginTop: '12px', fontSize: '11px', color: C.amber }}>
              Share these credentials with the staff member. They will be asked to change their password on first login.
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <Link href={`/hr/staff/${result.staff_id}`} style={{
              flex: 1, padding: '10px', borderRadius: '8px', background: C.teal, color: '#fff',
              textAlign: 'center', textDecoration: 'none', fontSize: '13px', fontWeight: 700,
            }}>
              View Profile
            </Link>
            <button onClick={() => {
              setResult(null); setStep(1)
              setName(''); setEmail(''); setSalutation(''); setPhone(''); setDob(''); setGender(''); setBloodGroup('')
              setEmergencyName(''); setEmergencyPhone('')
              setDepartment(''); setRole(''); setJobLevel('staff'); setOfficeId('bangalore'); setWorkMode('Onsite'); setEmployeeCode(''); setJoinedAt(new Date().toISOString().split('T')[0])
              setManagerId(''); setReassignReports([])
              setAccessEnabled(true); setToolGrants({}); setStartOnboarding(true)
            }} style={{
              flex: 1, padding: '10px', borderRadius: '8px', border: `1px solid ${C.border}`,
              background: C.surface, color: C.text, cursor: 'pointer', fontSize: '13px', fontWeight: 700, fontFamily: 'inherit',
            }}>
              Add Another
            </button>
          </div>
          <Link href="/hr/onboarding" style={{ display: 'block', marginTop: '14px', fontSize: '12px', color: C.muted, textDecoration: 'none' }}>
            Back to Onboarding Tracker
          </Link>
        </div>
      </div>
    )
  }

  const managerObj = allStaff.find(s => s.id === managerId)

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Header ── */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '0 24px', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', height: '56px', gap: '10px' }}>
          <Link href="/hr/onboarding" style={{ fontSize: '12px', color: C.muted, textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
            Onboarding
          </Link>
          <div style={{ width: '1px', height: '18px', background: C.border }} />
          <span style={{ fontSize: '14px', fontWeight: 800, color: C.text }}>Add New Staff Member</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: '12px', color: C.muted }}>Step {step} of {STEPS.length}</span>
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '0 24px' }}>
        <div style={{ display: 'flex', gap: 0 }}>
          {STEPS.map((s, i) => {
            const done    = step > s.id
            const active  = step === s.id
            return (
              <div key={s.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: '12px', paddingTop: '12px', position: 'relative' }}>
                {/* Connector line */}
                {i > 0 && (
                  <div style={{ position: 'absolute', top: '21px', left: 0, right: '50%', height: '2px', background: done || active ? C.teal : C.border, transition: 'background 0.2s' }} />
                )}
                {i < STEPS.length - 1 && (
                  <div style={{ position: 'absolute', top: '21px', left: '50%', right: 0, height: '2px', background: done ? C.teal : C.border, transition: 'background 0.2s' }} />
                )}
                {/* Circle */}
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', zIndex: 1,
                  background: done ? C.teal : active ? C.teal : C.surface,
                  border: `2px solid ${done || active ? C.teal : C.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {done ? (
                    <svg width="9" height="9" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : (
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: active ? '#fff' : 'transparent' }} />
                  )}
                </div>
                <div style={{ fontSize: '10px', fontWeight: active || done ? 700 : 600, color: active || done ? C.text : C.muted, marginTop: '4px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                  {s.label}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Form body ── */}
      <div style={{ maxWidth: '640px', margin: '32px auto', padding: '0 20px 80px' }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', padding: '32px' }}>

          {/* STEP 1: Personal Info */}
          {step === 1 && (
            <div>
              <div style={{ fontSize: '17px', fontWeight: 800, color: C.text, marginBottom: '4px' }}>Personal Information</div>
              <div style={{ fontSize: '13px', color: C.muted, marginBottom: '28px' }}>Basic identity details for the staff member</div>

              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0 12px' }}>
                <Field label="Salutation">
                  <Select value={salutation} onChange={e => setSalutation(e.target.value)}>
                    <option value="">—</option>
                    {SALUTATIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </Field>
                <Field label="Full Name" required>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Priya Sharma" style={errors.name ? { borderColor: C.red } : {}} />
                  {errors.name && <div style={{ fontSize: '11px', color: C.red, marginTop: '3px' }}>{errors.name}</div>}
                </Field>
              </div>

              <Field label="Work Email" required>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g. priya@trescon.com" style={errors.email ? { borderColor: C.red } : {}} />
                {errors.email && <div style={{ fontSize: '11px', color: C.red, marginTop: '3px' }}>{errors.email}</div>}
              </Field>

              <Field label="Phone" hint="Include country code, e.g. +91 98765 43210">
                <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+971 50 123 4567" />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <Field label="Date of Birth">
                  <Input type="date" value={dob} onChange={e => setDob(e.target.value)} />
                </Field>
                <Field label="Gender">
                  <Select value={gender} onChange={e => setGender(e.target.value)}>
                    <option value="">Select…</option>
                    {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                  </Select>
                </Field>
              </div>

              <Field label="Blood Group">
                <Select value={bloodGroup} onChange={e => setBloodGroup(e.target.value)} style={{ width: '140px' }}>
                  <option value="">Unknown</option>
                  {BLOOD_GROUPS.map(b => <option key={b} value={b}>{b}</option>)}
                </Select>
              </Field>

              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: '20px', marginTop: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '14px' }}>Emergency Contact (optional)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                  <Field label="Contact Name">
                    <Input value={emergencyName} onChange={e => setEmergencyName(e.target.value)} placeholder="Full name" />
                  </Field>
                  <Field label="Contact Phone">
                    <Input type="tel" value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)} placeholder="+91 99999 00000" />
                  </Field>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Work Details */}
          {step === 2 && (
            <div>
              <div style={{ fontSize: '17px', fontWeight: 800, color: C.text, marginBottom: '4px' }}>Work Details</div>
              <div style={{ fontSize: '13px', color: C.muted, marginBottom: '28px' }}>Role, department, and office assignment</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <Field label="Department" required>
                  <div style={{ position: 'relative' }}>
                    <Input
                      list="dept-list"
                      value={department}
                      onChange={e => setDepartment(e.target.value)}
                      placeholder="e.g. Marketing"
                      style={errors.department ? { borderColor: C.red } : {}}
                    />
                    <datalist id="dept-list">
                      {departments.map(d => <option key={d} value={d} />)}
                    </datalist>
                  </div>
                  {errors.department && <div style={{ fontSize: '11px', color: C.red, marginTop: '3px' }}>{errors.department}</div>}
                </Field>
                <Field label="Job Title / Role" required>
                  <Input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Senior Marketing Executive" style={errors.role ? { borderColor: C.red } : {}} />
                  {errors.role && <div style={{ fontSize: '11px', color: C.red, marginTop: '3px' }}>{errors.role}</div>}
                </Field>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <Field label="Job Level">
                  <Select value={jobLevel} onChange={e => setJobLevel(e.target.value as typeof LEVELS[number])}>
                    {LEVELS.map(l => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
                  </Select>
                </Field>
                <Field label="Office Location">
                  <Select value={officeId} onChange={e => setOfficeId(e.target.value)}>
                    {OFFICES.map(o => <option key={o.toLowerCase()} value={o.toLowerCase()}>{o}</option>)}
                  </Select>
                </Field>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <Field label="Work Mode">
                  <Select value={workMode} onChange={e => setWorkMode(e.target.value)}>
                    {WORK_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                  </Select>
                </Field>
                <Field label="Joining Date">
                  <Input type="date" value={joinedAt} onChange={e => setJoinedAt(e.target.value)} />
                </Field>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <Field label="Employee Code" hint="Leave blank to assign later">
                  <Input value={employeeCode} onChange={e => setEmployeeCode(e.target.value)} placeholder="e.g. EMP-1042" />
                </Field>
              </div>
            </div>
          )}

          {/* STEP 3: Reporting Structure */}
          {step === 3 && (
            <div>
              <div style={{ fontSize: '17px', fontWeight: 800, color: C.text, marginBottom: '4px' }}>Reporting Structure</div>
              <div style={{ fontSize: '13px', color: C.muted, marginBottom: '28px' }}>Who they report to, and who reports to them</div>

              <Field label="Reports To (Manager)" hint="Start typing a name to search">
                <StaffSearch
                  staff={allStaff.filter(s => s.id !== '')}
                  value={managerId}
                  onChange={setManagerId}
                  placeholder="Search by name or role…"
                />
              </Field>

              {managerObj && (
                <div style={{ padding: '12px 14px', background: '#F0F9F7', border: `1px solid ${C.teal}25`, borderRadius: '8px', marginTop: '-10px', marginBottom: '20px' }}>
                  <div style={{ fontSize: '11px', color: C.muted }}>
                    {name.split(' ')[0] || 'This person'} will report to <strong style={{ color: C.text }}>{managerObj.name}</strong>
                    {managerObj.role ? ` (${managerObj.role})` : ''}
                  </div>
                </div>
              )}

              {(jobLevel === 'team_lead' || jobLevel === 'dept_head' || jobLevel === 'office_head') && (
                <Field
                  label="Assign existing staff as direct reports"
                  hint="Select staff members who will now report to this person. This updates their reporting line immediately."
                >
                  <ReportMultiSelect
                    staff={potentialReports}
                    selected={reassignReports}
                    onChange={setReassignReports}
                  />
                  {reassignReports.length > 0 && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: C.muted }}>
                      {reassignReports.length} {reassignReports.length === 1 ? 'person' : 'people'} will be reassigned
                    </div>
                  )}
                </Field>
              )}

              {(jobLevel === 'staff') && (
                <div style={{ padding: '16px', background: '#F0F4F8', borderRadius: '8px', fontSize: '12px', color: C.muted }}>
                  Staff-level members do not have direct reports. If this person will manage a team, change their job level to Team Lead or above.
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Access & Tools */}
          {step === 4 && (
            <div>
              <div style={{ fontSize: '17px', fontWeight: 800, color: C.text, marginBottom: '4px' }}>Platform Access & Tools</div>
              <div style={{ fontSize: '13px', color: C.muted, marginBottom: '28px' }}>Set what this person can access from day one</div>

              <Field label="Login Access">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: accessEnabled ? C.teal + '06' : '#F0F4F8', border: `1px solid ${accessEnabled ? C.teal + '30' : C.border}`, borderRadius: '8px' }}>
                  <Toggle on={accessEnabled} onChange={setAccessEnabled} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>Enable login immediately</div>
                    <div style={{ fontSize: '11px', color: C.muted }}>
                      {accessEnabled ? 'Staff can log in using the credentials shown at the end.' : 'Login will be disabled. You can enable it later from Admin → People.'}
                    </div>
                  </div>
                </div>
              </Field>

              <Field label="Tool Access" hint="Toggle each tool this person should have access to">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                  {PLATFORM_TOOLS.map(t => {
                    const on = toolGrants[t.key] === true
                    return (
                      <div key={t.key} style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '10px 14px', borderRadius: '8px',
                        background: on ? t.color + '08' : '#FAFBFC',
                        border: `1px solid ${on ? t.color + '30' : C.border}`,
                        transition: 'all 0.12s',
                      }}>
                        <div style={{ width: 9, height: 9, borderRadius: '50%', background: on ? t.color : C.border, flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: on ? C.text : C.muted }}>{t.label}</span>
                        <Toggle on={on} onChange={v => setToolGrants(prev => ({ ...prev, [t.key]: v }))} color={t.color} />
                      </div>
                    )
                  })}
                </div>
              </Field>

              <Field label="Onboarding Checklist">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: startOnboarding ? C.teal + '06' : '#F0F4F8', border: `1px solid ${startOnboarding ? C.teal + '30' : C.border}`, borderRadius: '8px' }}>
                  <Toggle on={startOnboarding} onChange={setStartOnboarding} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>Auto-start onboarding checklist</div>
                    <div style={{ fontSize: '11px', color: C.muted }}>
                      Creates a 30-day task checklist matched to {department || 'their department'} + {LEVEL_LABEL[jobLevel]}. Visible in HR → Onboarding.
                    </div>
                  </div>
                </div>
              </Field>
            </div>
          )}

          {/* STEP 5: Review & Create */}
          {step === 5 && (
            <div>
              <div style={{ fontSize: '17px', fontWeight: 800, color: C.text, marginBottom: '4px' }}>Review & Create</div>
              <div style={{ fontSize: '13px', color: C.muted, marginBottom: '28px' }}>Confirm the details before creating the profile</div>

              {/* Summary cards */}
              {[
                {
                  title: 'Personal',
                  rows: [
                    ['Name',     [salutation, name].filter(Boolean).join(' ')],
                    ['Email',    email],
                    ['Phone',    phone || '—'],
                    ['DOB',      dob || '—'],
                    ['Gender',   gender || '—'],
                    ['Blood',    bloodGroup || '—'],
                    ['Emergency', [emergencyName, emergencyPhone].filter(Boolean).join(' · ') || '—'],
                  ],
                },
                {
                  title: 'Work',
                  rows: [
                    ['Department', department],
                    ['Role',       role],
                    ['Level',      LEVEL_LABEL[jobLevel]],
                    ['Office',     officeId.charAt(0).toUpperCase() + officeId.slice(1)],
                    ['Work Mode',  workMode],
                    ['Joining',    joinedAt],
                    ['Emp Code',   employeeCode || '—'],
                  ],
                },
                {
                  title: 'Reporting',
                  rows: [
                    ['Reports To', managerId ? (allStaff.find(s => s.id === managerId)?.name ?? '—') : 'No manager set'],
                    ['Direct Reports', reassignReports.length ? `${reassignReports.length} people reassigned` : 'None assigned'],
                  ],
                },
                {
                  title: 'Access',
                  rows: [
                    ['Login',       accessEnabled ? 'Enabled immediately' : 'Disabled (enable later)'],
                    ['Tools',       Object.entries(toolGrants).filter(([,v]) => v).map(([k]) => PLATFORM_TOOLS.find(t => t.key === k)?.label ?? k).join(', ') || 'None'],
                    ['Onboarding',  startOnboarding ? 'Auto-start checklist' : 'Skip'],
                  ],
                },
              ].map(section => (
                <div key={section.title} style={{ marginBottom: '16px', border: `1px solid ${C.border}`, borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ padding: '8px 14px', background: '#F0F4F8', fontSize: '11px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {section.title}
                  </div>
                  {section.rows.map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', padding: '8px 14px', borderTop: `1px solid ${C.border}` }}>
                      <span style={{ width: '100px', flexShrink: 0, fontSize: '11px', color: C.muted, fontWeight: 600 }}>{label}</span>
                      <span style={{ fontSize: '12px', color: C.text, fontWeight: 600 }}>{value}</span>
                    </div>
                  ))}
                </div>
              ))}

              {errors.submit && (
                <div style={{ padding: '12px 14px', background: C.red + '10', border: `1px solid ${C.red}30`, borderRadius: '8px', color: C.red, fontSize: '13px', marginBottom: '16px' }}>
                  {errors.submit}
                </div>
              )}
            </div>
          )}

          {/* ── Navigation buttons ── */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '32px', paddingTop: '20px', borderTop: `1px solid ${C.border}` }}>
            {step > 1 && (
              <button onClick={back} style={{ padding: '10px 20px', borderRadius: '8px', border: `1px solid ${C.border}`, background: C.surface, color: C.text, cursor: 'pointer', fontSize: '13px', fontWeight: 700, fontFamily: 'inherit' }}>
                Back
              </button>
            )}
            <div style={{ flex: 1 }} />
            {step < 5 && (
              <button onClick={next} style={{ padding: '10px 28px', borderRadius: '8px', border: 'none', background: C.teal, color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 700, fontFamily: 'inherit' }}>
                Continue
              </button>
            )}
            {step === 5 && (
              <button onClick={createStaff} disabled={saving} style={{
                padding: '10px 32px', borderRadius: '8px', border: 'none',
                background: saving ? C.muted : C.teal, color: '#fff',
                cursor: saving ? 'wait' : 'pointer',
                fontSize: '13px', fontWeight: 800, fontFamily: 'inherit',
              }}>
                {saving ? 'Creating…' : 'Create Staff Member'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
