'use client'

import { useState, useEffect, use } from 'react'
import { FieldSchema, SubmittedValue, FORM_TITLES } from '@/app/lib/forms/types'
import { FormFieldInput } from '@/app/components/forms/FormFieldInput'

type Schema = {
  form_type: string; event_name: string; header_url?: string | null
  hubspot?: boolean; portal_id?: string; hubspot_form_id?: string
  fields?: FieldSchema[]; prefill?: Record<string, string> | null
}

declare global {
  interface Window {
    hbspt?: { forms: { create: (opts: { portalId: string; formId: string; target: string }) => void } }
  }
}

const HUBSPOT_EMBED_SCRIPT_SRC = '//js.hsforms.net/forms/embed/v2.js'
let hubspotScriptPromise: Promise<void> | null = null

function loadHubSpotEmbedScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.hbspt) return Promise.resolve()
  if (hubspotScriptPromise) return hubspotScriptPromise
  hubspotScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = HUBSPOT_EMBED_SCRIPT_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load the HubSpot form script.'))
    document.body.appendChild(script)
  })
  return hubspotScriptPromise
}

export default function PublicOnboardingFormPage({ params }: { params: Promise<{ event_id: string; form_type: string }> }) {
  const { event_id: eventId, form_type: formType } = use(params)

  // Matches the existing announcement-review page's established pattern —
  // avoids useSearchParams() and the Suspense-boundary requirement it forces.
  const [inviteToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location.search).get('invite')
  })

  const [schema, setSchema] = useState<Schema | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, SubmittedValue>>({})
  const [files, setFiles] = useState<Record<string, File | null>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [hubspotEmbedError, setHubspotEmbedError] = useState<string | null>(null)

  useEffect(() => {
    const url = `/api/public/forms/${eventId}/${formType}${inviteToken ? `?invite=${encodeURIComponent(inviteToken)}` : ''}`
    fetch(url)
      .then(res => res.ok ? res.json() : Promise.reject())
      .then((data: Schema) => {
        setSchema(data)
        if (data.prefill) setValues(v => ({ ...data.prefill, ...v }))
      })
      .catch(() => setLoadError('This form could not be loaded. Please check the link and try again.'))
  }, [eventId, formType, inviteToken])

  useEffect(() => {
    if (!schema?.hubspot || !schema.portal_id || !schema.hubspot_form_id) return
    loadHubSpotEmbedScript()
      .then(() => window.hbspt?.forms.create({ portalId: schema.portal_id!, formId: schema.hubspot_form_id!, target: '#hs-form-target' }))
      .catch(e => setHubspotEmbedError((e as Error).message))
  }, [schema])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError(null)

    const form = new FormData()
    for (const [key, value] of Object.entries(values)) {
      if (Array.isArray(value)) value.forEach(v => form.append(key, v))
      else form.append(key, value)
    }
    for (const [key, file] of Object.entries(files)) if (file) form.append(key, file)
    if (inviteToken) form.append('invite_token', inviteToken)

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

  if (schema.hubspot) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--surface)', padding: '48px 20px', fontFamily: 'var(--font-manrope), Manrope, sans-serif' }}>
        <div style={{ maxWidth: '560px', margin: '0 auto' }}>
          {schema.header_url && (
            <img src={schema.header_url} alt="" style={{ width: '100%', borderRadius: '12px', display: 'block', marginBottom: '24px' }} />
          )}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '1px', color: 'var(--teal-mid)', textTransform: 'uppercase', marginBottom: '6px' }}>{schema.event_name}</div>
            <h1 style={{ fontSize: '26px', fontWeight: 900, color: 'var(--ink)', margin: 0 }}>{FORM_TITLES[schema.form_type as keyof typeof FORM_TITLES] ?? 'Onboarding Form'}</h1>
          </div>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px' }}>
            {hubspotEmbedError ? (
              <p style={{ color: 'var(--red)', fontSize: '13px' }}>{hubspotEmbedError}</p>
            ) : (
              <div id="hs-form-target" />
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', padding: '48px 20px', fontFamily: 'var(--font-manrope), Manrope, sans-serif' }}>
      <div style={{ maxWidth: '560px', margin: '0 auto' }}>
        {schema.header_url && (
          <img src={schema.header_url} alt="" style={{ width: '100%', borderRadius: '12px', display: 'block', marginBottom: '24px' }} />
        )}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '1px', color: 'var(--teal-mid)', textTransform: 'uppercase', marginBottom: '6px' }}>{schema.event_name}</div>
          <h1 style={{ fontSize: '26px', fontWeight: 900, color: 'var(--ink)', margin: 0 }}>{FORM_TITLES[schema.form_type as keyof typeof FORM_TITLES] ?? 'Onboarding Form'}</h1>
        </div>

        <form onSubmit={submit} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px', display: 'grid', gap: '16px' }}>
          {/* Honeypot — hidden from real users via CSS, bots that fill every field will trip it */}
          <div style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }} aria-hidden="true">
            <label htmlFor="website_hp">Website</label>
            <input id="website_hp" name="website_hp" tabIndex={-1} autoComplete="off"
              value={typeof values.website_hp === 'string' ? values.website_hp : ''}
              onChange={e => setValues(v => ({ ...v, website_hp: e.target.value }))} />
          </div>

          {(schema.fields ?? []).map(field => (
            <FormFieldInput
              key={field.id}
              field={field}
              value={values[field.key] ?? (field.type === 'multiselect' ? [] : '')}
              onChange={v => setValues(prev => ({ ...prev, [field.key]: v }))}
              file={files[field.key]}
              onFileChange={f => setFiles(prev => ({ ...prev, [field.key]: f }))}
            />
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
