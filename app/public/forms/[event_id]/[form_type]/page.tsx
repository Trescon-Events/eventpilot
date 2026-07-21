'use client'

import { useState, useEffect, use } from 'react'

type FieldDef = {
  name: string; label: string; type: 'text' | 'url' | 'email' | 'textarea' | 'file'
  required: boolean; help?: string; accept?: string
}
type Schema = { form_type: string; event_name: string; fields: FieldDef[] }

const FORM_TITLES: Record<string, string> = {
  speaker: 'Speaker Registration',
  sponsor: 'Sponsorship Onboarding',
  media_partner: 'Media Partner Onboarding',
  association_partner: 'Association Partner Onboarding',
}

export default function PublicOnboardingFormPage({ params }: { params: Promise<{ event_id: string; form_type: string }> }) {
  const { event_id: eventId, form_type: formType } = use(params)

  const [schema, setSchema] = useState<Schema | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [files, setFiles] = useState<Record<string, File | null>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch(`/api/public/forms/${eventId}/${formType}`)
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(setSchema)
      .catch(() => setLoadError('This form could not be loaded. Please check the link and try again.'))
  }, [eventId, formType])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError(null)

    const form = new FormData()
    for (const [key, value] of Object.entries(values)) form.append(key, value)
    for (const [key, file] of Object.entries(files)) if (file) form.append(key, file)

    const res = await fetch(`/api/public/forms/${eventId}/${formType}`, { method: 'POST', body: form })
    const data = await res.json().catch(() => ({}))
    if (res.ok) setDone(true)
    else setSubmitError(data.error || 'Something went wrong — please try again.')
    setSubmitting(false)
  }

  if (loadError) {
    return <CenteredCard><p style={{ color: 'var(--red)' }}>{loadError}</p></CenteredCard>
  }
  if (!schema) {
    return <CenteredCard><p style={{ color: 'var(--ink3)' }}>Loading…</p></CenteredCard>
  }
  if (done) {
    return (
      <CenteredCard>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>✓</div>
        <h1 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--ink)', margin: '0 0 8px' }}>Thank you</h1>
        <p style={{ color: 'var(--ink3)', fontSize: '14px', lineHeight: 1.6 }}>
          Your details have been received. Our team will be in touch. See you at {schema.event_name}!
        </p>
      </CenteredCard>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', padding: '48px 20px', fontFamily: 'var(--font-manrope), Manrope, sans-serif' }}>
      <div style={{ maxWidth: '560px', margin: '0 auto' }}>
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '1px', color: 'var(--teal-mid)', textTransform: 'uppercase', marginBottom: '6px' }}>{schema.event_name}</div>
          <h1 style={{ fontSize: '26px', fontWeight: 900, color: 'var(--ink)', margin: 0 }}>{FORM_TITLES[schema.form_type] ?? 'Onboarding Form'}</h1>
        </div>

        <form onSubmit={submit} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px', display: 'grid', gap: '16px' }}>
          {/* Honeypot — hidden from real users via CSS, bots that fill every field will trip it */}
          <div style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }} aria-hidden="true">
            <label htmlFor="website_hp">Website</label>
            <input id="website_hp" name="website_hp" tabIndex={-1} autoComplete="off"
              value={values.website_hp ?? ''} onChange={e => setValues(v => ({ ...v, website_hp: e.target.value }))} />
          </div>

          {schema.fields.map(field => (
            <div key={field.name}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '5px' }}>
                {field.label} {field.required && <span style={{ color: 'var(--red)' }}>*</span>}
              </label>
              {field.type === 'textarea' ? (
                <textarea required={field.required} rows={4} value={values[field.name] ?? ''}
                  onChange={e => setValues(v => ({ ...v, [field.name]: e.target.value }))}
                  className="tfield" style={{ resize: 'vertical' }} />
              ) : field.type === 'file' ? (
                <input type="file" required={field.required} accept={field.accept} className="tfield"
                  onChange={e => setFiles(f => ({ ...f, [field.name]: e.target.files?.[0] ?? null }))} />
              ) : (
                <input type={field.type} required={field.required} value={values[field.name] ?? ''}
                  onChange={e => setValues(v => ({ ...v, [field.name]: e.target.value }))}
                  className="tfield" />
              )}
              {field.help && <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '4px' }}>{field.help}</div>}
            </div>
          ))}

          {submitError && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: '12.5px' }}>
              {submitError}
            </div>
          )}

          <button type="submit" disabled={submitting}
            style={{ padding: '12px 20px', borderRadius: '10px', border: 'none', background: 'var(--lime)', color: 'var(--lime-dark)', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', opacity: submitting ? 0.6 : 1 }}>
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </form>
      </div>
    </div>
  )
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'var(--font-manrope), Manrope, sans-serif' }}>
      <div style={{ maxWidth: '440px', textAlign: 'center', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '36px' }}>
        {children}
      </div>
    </div>
  )
}
