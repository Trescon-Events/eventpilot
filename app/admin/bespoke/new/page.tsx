'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

/* ── Back Arrow SVG ────────────────────────────────────────────── */
function BackArrow() {
  return (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M19 12H5" /><polyline points="12 19 5 12 12 5" />
    </svg>
  )
}

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

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={LABEL_STYLE}>
        {label} {required && <span style={{ color: '#DC2626' }}>*</span>}
      </label>
      {children}
    </div>
  )
}

export default function NewBespokeProjectPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  /* ── Form state ───────────────────────────────────────────────── */
  const [clientCompany, setClientCompany] = useState('')
  const [clientContactName, setClientContactName] = useState('')
  const [clientContactEmail, setClientContactEmail] = useState('')
  const [clientContactPhone, setClientContactPhone] = useState('')
  const [contractValue, setContractValue] = useState('')
  const [contractSignedDate, setContractSignedDate] = useState('')

  const [title, setTitle] = useState('')
  const [format, setFormat] = useState('physical')
  const [eventDate, setEventDate] = useState('')
  const [eventTime, setEventTime] = useState('')
  const [city, setCity] = useState('')
  const [venue, setVenue] = useState('')
  const [targetDelegateCount, setTargetDelegateCount] = useState('25')
  const [targetDelegateProfile, setTargetDelegateProfile] = useState('')

  const [commercialLead, setCommercialLead] = useState('')
  const [marketingLead, setMarketingLead] = useState('')
  const [delegateLead, setDelegateLead] = useState('')
  const [operationsLead, setOperationsLead] = useState('')
  const [designLead, setDesignLead] = useState('')
  const [productionAdvisor, setProductionAdvisor] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!clientCompany.trim() || !title.trim() || !eventDate) {
      setError('Client company, event title, and event date are required.')
      return
    }
    setSaving(true)
    setError('')

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
          title: title.trim(),
          format,
          event_date: eventDate,
          event_time: eventTime || null,
          city: city.trim() || null,
          venue: venue.trim() || null,
          target_delegate_count: Number(targetDelegateCount) || 25,
          target_delegate_profile: targetDelegateProfile.trim() || null,
          // Team leads as text names — will wire up UUID picker in v2
          commercial_lead_name: commercialLead.trim() || null,
          marketing_lead_name: marketingLead.trim() || null,
          delegate_lead_name: delegateLead.trim() || null,
          operations_lead_name: operationsLead.trim() || null,
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

  return (
    <div style={{ minHeight: '100vh', background: '#E8EEF4', fontFamily: 'var(--font-manrope)' }}>
      {/* ── Dark Header Bar ─────────────────────────────────────── */}
      <div style={{ background: '#0F1923', padding: '20px 32px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <Link href="/admin/bespoke" style={{ color: '#5B7080', display: 'flex', alignItems: 'center' }}>
          <BackArrow />
        </Link>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#FFFFFF' }}>New Bespoke Project</h1>
      </div>

      {/* ── Form ────────────────────────────────────────────────── */}
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '28px 32px 64px' }}>
        <form onSubmit={handleSubmit}>
          {/* ── Section 1: Client Information ───────────────────── */}
          <div style={SECTION_STYLE}>
            <h2 style={{ margin: '0 0 20px', fontSize: '17px', fontWeight: 800, color: '#B45309' }}>Client Information</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Client Company" required>
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
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Contract Signed Date">
                  <input style={{ ...INPUT_STYLE, maxWidth: '280px' }} type="date" value={contractSignedDate} onChange={e => setContractSignedDate(e.target.value)} />
                </Field>
              </div>
            </div>
          </div>

          {/* ── Section 2: Event Basics ─────────────────────────── */}
          <div style={SECTION_STYLE}>
            <h2 style={{ margin: '0 0 20px', fontSize: '17px', fontWeight: 800, color: '#B45309' }}>Event Basics</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Event Title" required>
                  <input style={INPUT_STYLE} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Oracle Cloud Summit Dubai" />
                </Field>
              </div>
              <Field label="Format" required>
                <select style={INPUT_STYLE} value={format} onChange={e => setFormat(e.target.value)}>
                  <option value="physical">Physical</option>
                  <option value="virtual">Virtual</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </Field>
              <Field label="Event Date" required>
                <input style={INPUT_STYLE} type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} />
              </Field>
              <Field label="Event Time">
                <input style={INPUT_STYLE} type="time" value={eventTime} onChange={e => setEventTime(e.target.value)} />
              </Field>
              <Field label="City">
                <input style={INPUT_STYLE} value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Dubai" />
              </Field>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Venue">
                  <input style={INPUT_STYLE} value={venue} onChange={e => setVenue(e.target.value)} placeholder="e.g. Atlantis The Royal" />
                </Field>
              </div>
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

          {/* ── Section 3: Team Assignment ──────────────────────── */}
          <div style={SECTION_STYLE}>
            <h2 style={{ margin: '0 0 4px', fontSize: '17px', fontWeight: 800, color: '#B45309' }}>Team Assignment</h2>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#5B7080' }}>Enter team lead names. Staff picker will be added in a future update.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <Field label="Commercial Lead">
                <input style={INPUT_STYLE} value={commercialLead} onChange={e => setCommercialLead(e.target.value)} placeholder="Name" />
              </Field>
              <Field label="Marketing Lead">
                <input style={INPUT_STYLE} value={marketingLead} onChange={e => setMarketingLead(e.target.value)} placeholder="Name" />
              </Field>
              <Field label="Delegate Acquisition Lead">
                <input style={INPUT_STYLE} value={delegateLead} onChange={e => setDelegateLead(e.target.value)} placeholder="Name" />
              </Field>
              <Field label="Operations Lead">
                <input style={INPUT_STYLE} value={operationsLead} onChange={e => setOperationsLead(e.target.value)} placeholder="Name" />
              </Field>
              <Field label="Design Lead">
                <input style={INPUT_STYLE} value={designLead} onChange={e => setDesignLead(e.target.value)} placeholder="Name" />
              </Field>
              <Field label="Production Advisor">
                <input style={INPUT_STYLE} value={productionAdvisor} onChange={e => setProductionAdvisor(e.target.value)} placeholder="Name" />
              </Field>
            </div>
          </div>

          {/* ── Error ───────────────────────────────────────────── */}
          {error && (
            <div style={{ padding: '12px 16px', borderRadius: '8px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>
              {error}
            </div>
          )}

          {/* ── Submit ──────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button type="submit" disabled={saving} style={{
              padding: '12px 32px', borderRadius: '8px', border: 'none', fontSize: '15px', fontWeight: 700,
              background: saving ? '#B8CDD8' : '#B45309', color: '#FFFFFF', cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-manrope)', transition: 'background 0.2s',
            }}
              onMouseEnter={e => { if (!saving) e.currentTarget.style.background = '#92400E' }}
              onMouseLeave={e => { if (!saving) e.currentTarget.style.background = '#B45309' }}
            >
              {saving ? 'Creating...' : 'Create Project'}
            </button>
            <Link href="/admin/bespoke" style={{ fontSize: '14px', fontWeight: 600, color: '#5B7080', textDecoration: 'none' }}>
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
