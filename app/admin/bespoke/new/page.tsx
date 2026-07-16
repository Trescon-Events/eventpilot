'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PageHeader from '@/app/components/PageHeader'

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #B8CDD8',
  fontSize: '15px', fontFamily: 'var(--font-manrope)', color: '#0F1923', background: '#FFFFFF',
  outline: 'none', transition: 'border-color 0.2s',
}

const LABEL_STYLE: React.CSSProperties = {
  display: 'block', fontSize: '13px', fontWeight: 700, color: '#2D3E50', marginBottom: '6px',
  fontFamily: 'var(--font-manrope)',
}

const SECTION_STYLE: React.CSSProperties = {
  background: '#FFFFFF', borderRadius: '12px', border: '1px solid #DDE8EE', padding: '28px',
  marginBottom: '20px',
}

const ERROR_TEXT_STYLE: React.CSSProperties = {
  marginTop: '6px', fontSize: '12px', fontWeight: 600, color: '#DC2626',
  fontFamily: 'var(--font-manrope)',
}

function Field({ label, required, children, error }: { label: string; required?: boolean; children: React.ReactNode; error?: string }) {
  return (
    <div>
      <label style={LABEL_STYLE}>
        {label} {required && <span style={{ color: '#DC2626' }}>*</span>}
      </label>
      {children}
      {error && <div style={ERROR_TEXT_STYLE}>{error}</div>}
    </div>
  )
}

/* ── Types ──────────────────────────────────────────────────────── */
type StaffMember = { id: string; name: string; email?: string; department?: string }

type LeadRole = 'commercial' | 'marketing' | 'delegate' | 'operations'

/* ── Staff combo-box ────────────────────────────────────────────── */
function StaffComboBox({
  label,
  staff,
  selectedId,
  manualValue,
  onSelect,
  onManualChange,
}: {
  label: string
  staff: StaffMember[]
  selectedId: string | null
  manualValue: string
  onSelect: (id: string | null, name: string) => void
  onManualChange: (name: string) => void
}) {
  // Query text mirrors either the selected staff name or the manual free-text value.
  const [query, setQuery] = useState<string>(() => {
    if (selectedId) return staff.find(s => s.id === selectedId)?.name ?? ''
    return manualValue ?? ''
  })
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Keep query synced when the selected staff resolves after data load.
  useEffect(() => {
    if (selectedId) {
      const match = staff.find(s => s.id === selectedId)
      if (match && match.name !== query) setQuery(match.name)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, staff])

  // Close dropdown when clicking outside.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return staff.slice(0, 20)
    return staff
      .filter(s => s.name.toLowerCase().includes(q))
      .slice(0, 20)
  }, [query, staff])

  const commit = () => {
    const q = query.trim()
    if (!q) {
      onSelect(null, '')
      onManualChange('')
      return
    }
    // Exact case-insensitive match wins.
    const exact = staff.find(s => s.name.toLowerCase() === q.toLowerCase())
    if (exact) {
      onSelect(exact.id, exact.name)
      onManualChange('')
    } else {
      onSelect(null, '')
      onManualChange(q)
    }
  }

  return (
    <Field label={label}>
      <div ref={containerRef} style={{ position: 'relative' }}>
        <input
          style={INPUT_STYLE}
          value={query}
          placeholder="Start typing a name..."
          onFocus={() => setOpen(true)}
          onChange={e => {
            setQuery(e.target.value)
            setOpen(true)
            // While typing, clear any selection until we commit.
            if (selectedId) onSelect(null, '')
          }}
          onBlur={() => {
            // Delay to allow click on suggestion to register first.
            setTimeout(() => {
              commit()
              setOpen(false)
            }, 120)
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
              setOpen(false)
            }
          }}
        />
        {open && suggestions.length > 0 && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 40,
            background: '#FFFFFF', border: '1px solid #DDE8EE', borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)', maxHeight: '220px', overflowY: 'auto',
          }}>
            {suggestions.map(s => (
              <div
                key={s.id}
                onMouseDown={e => {
                  // Use mousedown so it fires before the input's blur.
                  e.preventDefault()
                  setQuery(s.name)
                  onSelect(s.id, s.name)
                  onManualChange('')
                  setOpen(false)
                }}
                style={{
                  padding: '10px 14px', cursor: 'pointer', fontSize: '14px',
                  fontFamily: 'var(--font-manrope)', color: '#0F1923',
                  borderBottom: '1px solid #F1F5F9',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#F8FAFC' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#FFFFFF' }}
              >
                <div style={{ fontWeight: 600 }}>{s.name}</div>
                {(s.department || s.email) && (
                  <div style={{ fontSize: '12px', color: '#5B7080', marginTop: '2px' }}>
                    {[s.department, s.email].filter(Boolean).join(' • ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ marginTop: '6px', fontSize: '12px', color: '#5B7080', fontFamily: 'var(--font-manrope)' }}>
        Type a name — pick from suggestions, or type a new name if the person isn&apos;t in the system.
      </div>
    </Field>
  )
}

export default function NewBespokeProjectPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({})

  /* ── Form state ───────────────────────────────────────────────── */
  // Client
  const [clientCompany, setClientCompany] = useState('')
  const [clientContactName, setClientContactName] = useState('')
  const [clientContactEmail, setClientContactEmail] = useState('')
  const [clientContactPhone, setClientContactPhone] = useState('')
  const [contractValue, setContractValue] = useState('')
  const [contractSignedDate, setContractSignedDate] = useState('')
  const [clientAssetsUrl, setClientAssetsUrl] = useState('')

  // Event
  const [title, setTitle] = useState('')
  const [format, setFormat] = useState<'physical' | 'virtual'>('physical')
  const [eventDate, setEventDate] = useState('')
  const [eventTime, setEventTime] = useState('')
  const [city, setCity] = useState('')
  const [venue, setVenue] = useState('')
  const [webinarPlatform, setWebinarPlatform] = useState('')
  const [webinarLink, setWebinarLink] = useState('')
  const [targetDelegateCount, setTargetDelegateCount] = useState('25')
  const [targetDelegateProfile, setTargetDelegateProfile] = useState('')

  // Team
  const [commercialLeadId, setCommercialLeadId] = useState<string | null>(null)
  const [commercialLeadManual, setCommercialLeadManual] = useState('')
  const [marketingLeadId, setMarketingLeadId] = useState<string | null>(null)
  const [marketingLeadManual, setMarketingLeadManual] = useState('')
  const [delegateLeadId, setDelegateLeadId] = useState<string | null>(null)
  const [delegateLeadManual, setDelegateLeadManual] = useState('')
  const [operationsLeadId, setOperationsLeadId] = useState<string | null>(null)
  const [operationsLeadManual, setOperationsLeadManual] = useState('')
  const [designLead, setDesignLead] = useState('')
  const [productionAdvisor, setProductionAdvisor] = useState('')

  // Staff directory (fetched when reaching step 3).
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [staffLoaded, setStaffLoaded] = useState(false)

  useEffect(() => {
    if (step !== 3 || staffLoaded || staffLoading) return
    setStaffLoading(true)
    fetch('/api/staff-list')
      .then(r => r.ok ? r.json() : [])
      .then((rows: StaffMember[]) => {
        setStaff(Array.isArray(rows) ? rows : [])
        setStaffLoaded(true)
      })
      .catch(() => setStaffLoaded(true))
      .finally(() => setStaffLoading(false))
  }, [step, staffLoaded, staffLoading])

  /* ── Runway calc ──────────────────────────────────────────────── */
  const runwayDays = useMemo(() => {
    if (!contractSignedDate || !eventDate) return null
    const signed = new Date(contractSignedDate)
    const evt = new Date(eventDate)
    const ms = evt.getTime() - signed.getTime()
    return Math.round(ms / (1000 * 60 * 60 * 24))
  }, [contractSignedDate, eventDate])

  /* ── URL validation for client assets ─────────────────────────── */
  const clientAssetsUrlError = useMemo(() => {
    if (!clientAssetsUrl.trim()) return ''
    if (!/^https?:\/\//i.test(clientAssetsUrl.trim())) return 'URL should start with http:// or https://'
    return ''
  }, [clientAssetsUrl])

  /* ── Step validation ──────────────────────────────────────────── */
  const validateStep = (s: 1 | 2 | 3): boolean => {
    const errs: Record<string, string> = {}
    if (s === 1) {
      if (!title.trim()) errs.title = 'Event title is required.'
      if (!eventDate) errs.eventDate = 'Event date is required.'
      if (format === 'virtual') {
        // Webinar platform is not marked required per spec, keep both optional.
      }
    } else if (s === 2) {
      if (!clientCompany.trim()) errs.clientCompany = 'Client company is required.'
    }
    setStepErrors(errs)
    return Object.keys(errs).length === 0
  }

  const goNext = () => {
    if (validateStep(step)) {
      setStepErrors({})
      setStep((step + 1) as 1 | 2 | 3)
    }
  }

  const goBack = () => {
    setStepErrors({})
    setStep((step - 1) as 1 | 2 | 3)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Final gate: run through all step validations before hitting the API.
    if (!validateStep(1)) { setStep(1); return }
    if (!validateStep(2)) { setStep(2); return }

    setSaving(true)
    setError('')

    // Clear venue/city if webinar so we don't persist stale physical data.
    const isWebinar = format === 'virtual'

    try {
      const res = await fetch('/api/bespoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_company: clientCompany.trim(),
          client_contact_name: clientContactName.trim() || null,
          client_contact_email: clientContactEmail.trim() || null,
          client_contact_phone: clientContactPhone.trim() || null,
          contract_value: contractValue ? Number(contractValue) : 0,
          contract_signed_date: contractSignedDate || null,
          client_assets_url: clientAssetsUrl.trim() || null,
          title: title.trim(),
          format,
          event_date: eventDate,
          event_time: eventTime || null,
          city: isWebinar ? null : (city.trim() || null),
          venue: isWebinar ? null : (venue.trim() || null),
          webinar_platform: isWebinar ? (webinarPlatform || null) : null,
          webinar_link: isWebinar ? (webinarLink.trim() || null) : null,
          target_delegate_count: Number(targetDelegateCount) || 25,
          target_delegate_profile: targetDelegateProfile.trim() || null,
          // Team leads — UUID FK if picked, manual text fallback otherwise.
          commercial_lead_id: commercialLeadId || null,
          commercial_lead_manual: commercialLeadId ? null : (commercialLeadManual.trim() || null),
          marketing_lead_id: marketingLeadId || null,
          marketing_lead_manual: marketingLeadId ? null : (marketingLeadManual.trim() || null),
          delegate_lead_id: delegateLeadId || null,
          delegate_lead_manual: delegateLeadId ? null : (delegateLeadManual.trim() || null),
          operations_lead_id: operationsLeadId || null,
          operations_lead_manual: operationsLeadId ? null : (operationsLeadManual.trim() || null),
          // Optional additional roles remain free-text for now.
          design_lead_name: designLead.trim() || null,
          production_advisor_name: productionAdvisor.trim() || null,
        }),
      })

      if (!res.ok) {
        const d = await res.json()
        setError(d.error || 'Failed to create project')
        setSaving(false)
        return
      }

      const data = await res.json()
      router.push(`/admin/bespoke/${data.id}`)
    } catch {
      setError('Network error. Please try again.')
      setSaving(false)
    }
  }

  const stepLabel = step === 1 ? 'Event Basics' : step === 2 ? 'Client Information' : 'Team Assignments'
  const progressPct = Math.round((step / 3) * 100)

  /* ── Segmented format toggle button ───────────────────────────── */
  const formatButton = (value: 'physical' | 'virtual', label: string) => {
    const active = format === value
    return (
      <button
        type="button"
        onClick={() => setFormat(value)}
        style={{
          flex: 1, padding: '10px 14px', borderRadius: '8px',
          border: active ? '1px solid #B45309' : '1px solid #B8CDD8',
          background: active ? '#B45309' : '#FFFFFF',
          color: active ? '#FFFFFF' : '#0F1923',
          fontSize: '15px', fontWeight: 700, fontFamily: 'var(--font-manrope)',
          cursor: 'pointer', transition: 'all 0.15s',
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#E8EEF4', fontFamily: 'var(--font-manrope)' }}>
      <PageHeader
        title="New Bespoke Project"
        description={`Step ${step} of 3 — ${stepLabel}`}
      />

      {/* ── Progress Bar ────────────────────────────────────────── */}
      <div style={{ height: '4px', background: '#DDE8EE', width: '100%' }}>
        <div style={{ height: '100%', background: '#B45309', width: `${progressPct}%`, transition: 'width 0.25s' }} />
      </div>

      {/* ── Form ────────────────────────────────────────────────── */}
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '28px 32px 64px' }}>
        <form onSubmit={handleSubmit}>
          {/* ── Step 1: Event Basics ─────────────────────────────── */}
          {step === 1 && (
            <div style={SECTION_STYLE}>
              <h2 style={{ margin: '0 0 20px', fontSize: '17px', fontWeight: 800, color: '#B45309' }}>Event Basics</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Event Title" required error={stepErrors.title}>
                    <input style={INPUT_STYLE} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Oracle Cloud Summit Dubai" />
                  </Field>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Format" required>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      {formatButton('physical', 'Physical')}
                      {formatButton('virtual', 'Webinar')}
                    </div>
                  </Field>
                </div>
                <Field label="Event Date" required error={stepErrors.eventDate}>
                  <input style={INPUT_STYLE} type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} />
                </Field>
                <Field label="Event Time">
                  <input style={INPUT_STYLE} type="time" value={eventTime} onChange={e => setEventTime(e.target.value)} />
                </Field>

                {format === 'physical' && (
                  <>
                    <Field label="City">
                      <input style={INPUT_STYLE} value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Dubai" />
                    </Field>
                    <Field label="Venue">
                      <input style={INPUT_STYLE} value={venue} onChange={e => setVenue(e.target.value)} placeholder='e.g. Atlantis The Royal (or "TBD")' />
                    </Field>
                  </>
                )}

                {format === 'virtual' && (
                  <>
                    <Field label="Webinar Platform">
                      <select style={INPUT_STYLE} value={webinarPlatform} onChange={e => setWebinarPlatform(e.target.value)}>
                        <option value="">Select platform...</option>
                        <option value="Zoom">Zoom</option>
                        <option value="MS Teams">MS Teams</option>
                        <option value="GoToWebinar">GoToWebinar</option>
                        <option value="Webex">Webex</option>
                        <option value="Other">Other</option>
                      </select>
                    </Field>
                    <Field label="Webinar Link / Access ID">
                      <input style={INPUT_STYLE} value={webinarLink} onChange={e => setWebinarLink(e.target.value)} placeholder="Meeting URL or access ID (optional)" />
                    </Field>
                  </>
                )}

                <Field label="Target Delegate Count">
                  <input style={INPUT_STYLE} type="number" value={targetDelegateCount} onChange={e => setTargetDelegateCount(e.target.value)} min="1" />
                </Field>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Target Delegate Profile">
                    <textarea style={{ ...INPUT_STYLE, minHeight: '80px', resize: 'vertical' }} value={targetDelegateProfile} onChange={e => setTargetDelegateProfile(e.target.value)} placeholder="Describe the ideal delegate: titles, industries, seniority, geography..." />
                  </Field>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Client Information + Runway ──────────────── */}
          {step === 2 && (
            <div style={SECTION_STYLE}>
              <h2 style={{ margin: '0 0 20px', fontSize: '17px', fontWeight: 800, color: '#B45309' }}>Client Information</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Client Company" required error={stepErrors.clientCompany}>
                    <input style={INPUT_STYLE} value={clientCompany} onChange={e => setClientCompany(e.target.value)} placeholder="e.g. Oracle Corporation" />
                  </Field>
                </div>
                <Field label="Contact Name">
                  <input style={INPUT_STYLE} value={clientContactName} onChange={e => setClientContactName(e.target.value)} placeholder="Full name" />
                </Field>
                <Field label="Contact Email">
                  <input style={INPUT_STYLE} type="email" value={clientContactEmail} onChange={e => setClientContactEmail(e.target.value)} placeholder="email@company.com" />
                </Field>
                <Field label="Contact Phone">
                  <input style={INPUT_STYLE} value={clientContactPhone} onChange={e => setClientContactPhone(e.target.value)} placeholder="+971 50 000 0000" />
                </Field>
                <Field label="Contract Value ($)">
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '15px', color: '#5B7080', fontWeight: 700 }}>$</span>
                    <input style={{ ...INPUT_STYLE, paddingLeft: '28px' }} type="number" value={contractValue} onChange={e => setContractValue(e.target.value)} placeholder="0" />
                  </div>
                </Field>
                <Field label="Contract Signed Date">
                  <input style={INPUT_STYLE} type="date" value={contractSignedDate} onChange={e => setContractSignedDate(e.target.value)} />
                </Field>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Client Brand Assets Folder Link" error={clientAssetsUrlError || undefined}>
                    <input
                      style={INPUT_STYLE}
                      type="url"
                      value={clientAssetsUrl}
                      onChange={e => setClientAssetsUrl(e.target.value)}
                      placeholder="https://drive.google.com/... or https://... (optional)"
                    />
                  </Field>
                </div>

                {/* ── Outreach Runway Calculator ──────────────── */}
                {runwayDays !== null && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{
                      background: '#EFF6FF',
                      border: '1px solid #BFDBFE',
                      padding: '12px 16px',
                      borderRadius: '8px',
                    }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#5B7080', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Outreach Runway
                      </div>
                      {runwayDays > 0 ? (
                        <div style={{ marginTop: '4px', fontSize: '22px', fontWeight: 800, color: '#1E3A8A' }}>
                          {runwayDays} days
                        </div>
                      ) : (
                        <div style={{ marginTop: '4px', fontSize: '14px', fontWeight: 700, color: '#B45309' }}>
                          Event date must be after contract signed date
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 3: Team Assignments ─────────────────────────── */}
          {step === 3 && (
            <div style={SECTION_STYLE}>
              <h2 style={{ margin: '0 0 4px', fontSize: '17px', fontWeight: 800, color: '#B45309' }}>Team Assignments</h2>
              <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#5B7080' }}>
                {staffLoading ? 'Loading staff directory...' : 'Pick a team member from suggestions, or type a new name if they aren’t in the system.'}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <StaffComboBox
                  label="Commercial Owner"
                  staff={staff}
                  selectedId={commercialLeadId}
                  manualValue={commercialLeadManual}
                  onSelect={(id) => setCommercialLeadId(id)}
                  onManualChange={setCommercialLeadManual}
                />
                <StaffComboBox
                  label="Marketing Owner"
                  staff={staff}
                  selectedId={marketingLeadId}
                  manualValue={marketingLeadManual}
                  onSelect={(id) => setMarketingLeadId(id)}
                  onManualChange={setMarketingLeadManual}
                />
                <StaffComboBox
                  label="Delegacy Owner"
                  staff={staff}
                  selectedId={delegateLeadId}
                  manualValue={delegateLeadManual}
                  onSelect={(id) => setDelegateLeadId(id)}
                  onManualChange={setDelegateLeadManual}
                />
                <StaffComboBox
                  label="Operations Owner"
                  staff={staff}
                  selectedId={operationsLeadId}
                  manualValue={operationsLeadManual}
                  onSelect={(id) => setOperationsLeadId(id)}
                  onManualChange={setOperationsLeadManual}
                />
              </div>

              {/* ── Additional (optional) ─────────────────────── */}
              <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid #DDE8EE' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 800, color: '#5B7080', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Additional (optional)
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <Field label="Design Lead">
                    <input style={INPUT_STYLE} value={designLead} onChange={e => setDesignLead(e.target.value)} placeholder="Name" />
                  </Field>
                  <Field label="Production Advisor">
                    <input style={INPUT_STYLE} value={productionAdvisor} onChange={e => setProductionAdvisor(e.target.value)} placeholder="Name" />
                  </Field>
                </div>
              </div>
            </div>
          )}

          {/* ── Error ───────────────────────────────────────────── */}
          {error && (
            <div style={{ padding: '12px 16px', borderRadius: '8px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>
              {error}
            </div>
          )}

          {/* ── Bottom Action Bar ───────────────────────────────── */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={goBack}
              disabled={step === 1}
              style={{
                padding: '12px 24px', borderRadius: '8px', border: '1px solid #B8CDD8',
                background: step === 1 ? '#F1F5F9' : '#FFFFFF',
                color: step === 1 ? '#B8CDD8' : '#5B7080',
                fontSize: '15px', fontWeight: 700, fontFamily: 'var(--font-manrope)',
                cursor: step === 1 ? 'not-allowed' : 'pointer', transition: 'background 0.2s',
              }}
            >
              Back
            </button>

            {step < 3 && (
              <button
                type="button"
                onClick={goNext}
                style={{
                  padding: '12px 32px', borderRadius: '8px', border: 'none',
                  fontSize: '15px', fontWeight: 700, background: '#B45309', color: '#FFFFFF',
                  cursor: 'pointer', fontFamily: 'var(--font-manrope)', transition: 'background 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#92400E' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#B45309' }}
              >
                Next
              </button>
            )}

            {step === 3 && (
              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: '12px 32px', borderRadius: '8px', border: 'none', fontSize: '15px', fontWeight: 700,
                  background: saving ? '#B8CDD8' : '#B45309', color: '#FFFFFF',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-manrope)', transition: 'background 0.2s',
                }}
                onMouseEnter={e => { if (!saving) e.currentTarget.style.background = '#92400E' }}
                onMouseLeave={e => { if (!saving) e.currentTarget.style.background = '#B45309' }}
              >
                {saving ? 'Creating...' : 'Create Project'}
              </button>
            )}

            <Link href="/admin/bespoke" style={{ fontSize: '14px', fontWeight: 600, color: '#5B7080', textDecoration: 'none', marginLeft: 'auto' }}>
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
