'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { Button, Card, Input } from '@/app/components/ui'
import type { PlaceholderProfile, GlobalPlaceholderDefault } from '@/app/lib/announcements/composite'

/* Platform-level (not event-scoped) placeholder default (2026-08-29) — one
   row per stakeholder type (speaker/partner), reused by every event's
   Creative Templates preview/ghost whenever that event's own per-event
   Placeholder panel hasn't overridden a field. Lives here, outside any
   event's workspace, alongside the org's other cross-event settings (Font
   Library, Corporate Brand) — moved here the same day it first shipped
   after Madhu caught it live: it had briefly lived inside one specific
   event's Creative Templates admin console, which reads as scoped to that
   event even though the data genuinely isn't.

   Includes a dedicated placeholder photo, uploaded once here — expected
   to already be a clean, transparent-background image (same shape as the
   photo-cleaning module's own 1024x1024 output, see
   app/lib/media/photo-cleaning-pipeline.ts) — deliberately decoupled from
   whatever per-template "reference layer" the branding team uploads
   purely for auto-positioning (which can be anybody's photo; see
   derive-alignment/route.ts). */

type StakeholderKind = 'speaker' | 'partner'

export default function PlaceholderDefaultsPage() {
  const [activeType, setActiveType] = useState<StakeholderKind>('speaker')
  const [defaults, setDefaults] = useState<{ speaker: GlobalPlaceholderDefault | null; partner: GlobalPlaceholderDefault | null }>({ speaker: null, partner: null })
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)

  async function fetchAll() {
    setLoading(true)
    const res = await fetch('/api/branding/placeholder-defaults')
    const data = await res.json().catch(() => ({ speaker: null, partner: null }))
    setDefaults({ speaker: data.speaker ?? null, partner: data.partner ?? null })
    setLoading(false)
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount; matches app/admin/branding/fonts/page.tsx's own fetchAll effect
  useEffect(() => { fetchAll() }, [])

  async function saveText(profile: PlaceholderProfile) {
    const res = await fetch('/api/branding/placeholder-defaults', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stakeholder_type: activeType, ...profile }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setDefaults(d => ({ ...d, [activeType]: data }))
      setMsg('Saved.')
    } else {
      setMsg(data.error || 'Save failed.')
    }
  }

  async function uploadPhoto(file: File) {
    const form = new FormData()
    form.append('file', file)
    form.append('stakeholder_type', activeType)
    const res = await fetch('/api/branding/placeholder-defaults/photo', { method: 'POST', body: form })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setDefaults(d => ({ ...d, [activeType]: data }))
      setMsg('Placeholder photo saved.')
    } else {
      setMsg(data.error || 'Photo upload failed.')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Branding"
        title="Placeholder Defaults"
        description="Sample speaker/partner content shown by default across every event's Creative Templates preview, until that event sets its own override."
      />

      <div style={{ padding: '24px 32px', maxWidth: '640px' }}>
        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '5px', width: 'fit-content' }}>
          <Link href="/admin/branding/fonts" style={{ padding: '8px 16px', borderRadius: '8px', color: 'var(--ink3)', fontSize: '13px', fontWeight: 800, textDecoration: 'none' }}>Fonts</Link>
          <Link href="/admin/branding/corporate" style={{ padding: '8px 16px', borderRadius: '8px', color: 'var(--ink3)', fontSize: '13px', fontWeight: 800, textDecoration: 'none' }}>Corporate Brand</Link>
          <div style={{ padding: '8px 16px', borderRadius: '8px', background: 'var(--surface)', color: 'var(--lime)', fontSize: '13px', fontWeight: 800 }}>Placeholder Defaults</div>
        </div>

        {msg && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: '12.5px', marginBottom: '16px' }}>
            {msg} <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700, marginLeft: '8px' }}>×</button>
          </div>
        )}

        <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
          {(['speaker', 'partner'] as StakeholderKind[]).map(t => (
            <button key={t} onClick={() => setActiveType(t)}
              style={{
                padding: '7px 16px', borderRadius: '8px', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '12.5px', fontWeight: 800, textTransform: 'capitalize',
                background: activeType === t ? 'var(--teal-mid)' : 'var(--surface)', color: activeType === t ? 'white' : 'var(--ink2)',
              }}>
              {t}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>
        ) : (
          <Card padded>
            <DefaultForm key={activeType} activeType={activeType} value={defaults[activeType]} onSaveText={saveText} onUploadPhoto={uploadPhoto} />
          </Card>
        )}
      </div>
    </div>
  )
}

function DefaultForm({ activeType, value, onSaveText, onUploadPhoto }: {
  activeType: StakeholderKind
  value: GlobalPlaceholderDefault | null
  onSaveText: (profile: PlaceholderProfile) => Promise<void>
  onUploadPhoto: (file: File) => Promise<void>
}) {
  const [draft, setDraft] = useState<PlaceholderProfile>({
    name: value?.name ?? undefined, job_title: value?.job_title ?? undefined, company_name: value?.company_name ?? undefined, country: value?.country ?? undefined,
  })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleSave() {
    setSaving(true)
    await onSaveText(draft)
    setSaving(false)
  }
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    await onUploadPhoto(file)
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const fieldStyle: React.CSSProperties = { fontSize: '11px', color: 'var(--ink3)', display: 'block' }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
      {activeType === 'speaker' ? (
        <>
          <label style={fieldStyle}>Name<Input value={draft.name ?? ''} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} style={{ width: '100%', marginTop: '4px' }} /></label>
          <label style={fieldStyle}>Job Title<Input value={draft.job_title ?? ''} onChange={e => setDraft(d => ({ ...d, job_title: e.target.value }))} style={{ width: '100%', marginTop: '4px' }} /></label>
          <label style={fieldStyle}>Company<Input value={draft.company_name ?? ''} onChange={e => setDraft(d => ({ ...d, company_name: e.target.value }))} style={{ width: '100%', marginTop: '4px' }} /></label>
          <label style={fieldStyle}>Country<Input value={draft.country ?? ''} onChange={e => setDraft(d => ({ ...d, country: e.target.value }))} style={{ width: '100%', marginTop: '4px' }} /></label>
        </>
      ) : (
        <>
          <label style={{ ...fieldStyle, gridColumn: '1 / -1' }}>Company Name<Input value={draft.company_name ?? ''} onChange={e => setDraft(d => ({ ...d, company_name: e.target.value }))} style={{ width: '100%', marginTop: '4px' }} /></label>
          <label style={{ ...fieldStyle, gridColumn: '1 / -1' }}>Country<Input value={draft.country ?? ''} onChange={e => setDraft(d => ({ ...d, country: e.target.value }))} style={{ width: '100%', marginTop: '4px' }} /></label>
        </>
      )}

      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '14px', paddingTop: '4px', borderTop: '1px solid var(--border-light)' }}>
        {value?.photo_url && (
          // eslint-disable-next-line @next/next/no-img-element -- small remote thumbnail from Supabase storage, not worth next/image config for
          <img src={value.photo_url} alt="Placeholder" style={{ width: '64px', height: '64px', borderRadius: '10px', objectFit: 'cover', border: '1px solid var(--border)' }} />
        )}
        <div>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={handleFileChange} />
          <Button variant="ghost" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading…' : value?.photo_url ? 'Replace Placeholder Photo' : 'Upload Placeholder Photo'}
          </Button>
          <div style={{ fontSize: '10.5px', color: 'var(--ink4)', marginTop: '4px' }}>Clean, transparent-background PNG — same shape as the photo-cleaning module&apos;s output.</div>
        </div>
      </div>

      <div style={{ gridColumn: '1 / -1' }}>
        <Button variant="teal" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </div>
    </div>
  )
}
