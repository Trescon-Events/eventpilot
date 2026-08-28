'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { Button, Card, Input, Toast, type ToastType } from '@/app/components/ui'
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
   derive-alignment/route.ts).

   Layout (2026-08-29, per Madhu — "use the full page space, show photo on
   one side... just like all other such tools we have") mirrors the
   Creative Templates admin console's own fields-left/PREVIEW-right split
   (app/admin/events/[id]/creative-templates/admin/page.tsx) rather than a
   narrow single column — same "Preview" label style, same head-marker
   circle style (LayerBoxOverlay.tsx's headMarkerRect), just read-only
   here since there's no drag-to-adjust box/layer concept on this page. */

type StakeholderKind = 'speaker' | 'partner'

// Tiny duplicate of face-alignment.ts's classifyShotType (2026-08-29) —
// deliberately not imported here: that module also pulls in the Gemini
// SDK for its server-only detectHeadBox() call, not worth dragging into
// this client bundle for one 4-line pure function. Keep in sync by hand;
// see that file if this ever needs to change.
function classifyShotTypeLocal(heightRatio: number): string {
  if (heightRatio > 0.45) return 'headshot'
  if (heightRatio > 0.25) return 'shoulders'
  if (heightRatio > 0.12) return 'waist'
  return 'full_body'
}

export default function PlaceholderDefaultsPage() {
  const [activeType, setActiveType] = useState<StakeholderKind>('speaker')
  const [defaults, setDefaults] = useState<{ speaker: GlobalPlaceholderDefault | null; partner: GlobalPlaceholderDefault | null }>({ speaker: null, partner: null })
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [msgType, setMsgType] = useState<ToastType>('success')

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
      setMsgType('success'); setMsg('Saved.')
    } else {
      setMsgType('error'); setMsg(data.error || 'Save failed.')
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
      setMsgType('success'); setMsg('Placeholder photo saved.')
    } else {
      setMsgType('error'); setMsg(data.error || 'Photo upload failed.')
    }
  }

  const value = defaults[activeType]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Branding"
        title="Placeholder Defaults"
        description="Sample speaker/partner content shown by default across every event's Creative Templates preview, until that event sets its own override."
      />

      <div style={{ padding: '24px 32px', maxWidth: '1200px' }}>
        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '5px', width: 'fit-content' }}>
          <Link href="/admin/branding/fonts" style={{ padding: '8px 16px', borderRadius: '8px', color: 'var(--ink3)', fontSize: '13px', fontWeight: 800, textDecoration: 'none' }}>Fonts</Link>
          <Link href="/admin/branding/corporate" style={{ padding: '8px 16px', borderRadius: '8px', color: 'var(--ink3)', fontSize: '13px', fontWeight: 800, textDecoration: 'none' }}>Corporate Brand</Link>
          <div style={{ padding: '8px 16px', borderRadius: '8px', background: 'var(--surface)', color: 'var(--lime)', fontSize: '13px', fontWeight: 800 }}>Placeholder Defaults</div>
        </div>

        <Toast message={msg} type={msgType} onClose={() => setMsg(null)} />

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
          <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: '28px', alignItems: 'flex-start' }}>
            <Card padded>
              <FieldsForm key={activeType} activeType={activeType} value={value} onSave={saveText} />
            </Card>

            <div style={{ position: 'sticky', top: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--teal-mid)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '10px' }}>Preview</div>
              <PhotoPanel activeType={activeType} value={value} onUpload={uploadPhoto} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function FieldsForm({ activeType, value, onSave }: {
  activeType: StakeholderKind
  value: GlobalPlaceholderDefault | null
  onSave: (profile: PlaceholderProfile) => Promise<void>
}) {
  const [draft, setDraft] = useState<PlaceholderProfile>({
    name: value?.name ?? undefined, job_title: value?.job_title ?? undefined, company_name: value?.company_name ?? undefined, country: value?.country ?? undefined,
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await onSave(draft)
    setSaving(false)
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
      <div style={{ gridColumn: '1 / -1' }}>
        <Button variant="teal" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </div>
    </div>
  )
}

function PhotoPanel({ activeType, value, onUpload }: {
  activeType: StakeholderKind
  value: GlobalPlaceholderDefault | null
  onUpload: (file: File) => Promise<void>
}) {
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    await onUpload(file)
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border-light)', borderRadius: '10px', padding: '18px' }}>
      {/* Visible head-position check (2026-08-29, per Madhu — "where do I
          check head position?", then "too small... make the photo
          slightly more bigger... marker circle should be of the same
          type which we have elsewhere") — a text confirmation alone isn't
          proof, especially since auto-detection can be wrong. Circle style
          matches LayerBoxOverlay.tsx's headMarkerRect exactly; read-only
          here since there's no drag-to-adjust box/layer concept on this
          page. Square container + objectFit: cover matches the expected
          1024x1024 input exactly, so the ratio math needs no letterboxing
          correction. */}
      {value?.photo_url ? (
        <div style={{ position: 'relative', width: '100%', maxWidth: '480px', aspectRatio: '1 / 1', borderRadius: '10px', overflow: 'hidden', background: 'var(--surface)', margin: '0 auto' }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- remote asset from Supabase storage, not worth next/image config for */}
          <img src={value.photo_url} alt="Placeholder" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          {activeType === 'speaker' && value.photo_head_box && (
            <div style={{
              position: 'absolute', pointerEvents: 'none',
              left: `${(value.photo_head_box.centerXRatio - value.photo_head_box.heightRatio / 2) * 100}%`,
              top: `${(value.photo_head_box.centerYRatio - value.photo_head_box.heightRatio / 2) * 100}%`,
              width: `${value.photo_head_box.heightRatio * 100}%`,
              height: `${value.photo_head_box.heightRatio * 100}%`,
              borderRadius: '50%',
              border: '1.5px dashed var(--teal-mid)',
              background: 'color-mix(in srgb, var(--teal-mid) 8%, transparent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--teal-mid)', opacity: 0.85 }}>Head</span>
            </div>
          )}
        </div>
      ) : (
        <div style={{ width: '100%', maxWidth: '480px', aspectRatio: '1 / 1', borderRadius: '10px', background: 'var(--surface)', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink4)', fontSize: '12.5px' }}>
          No placeholder photo yet
        </div>
      )}

      <div style={{ marginTop: '14px', textAlign: 'center' }}>
        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={handleFileChange} />
        <Button variant="ghost" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading…' : value?.photo_url ? 'Replace Placeholder Photo' : 'Upload Placeholder Photo'}
        </Button>
        <div style={{ fontSize: '10.5px', color: 'var(--ink4)', marginTop: '6px' }}>Clean, transparent-background PNG — same shape as the photo-cleaning module&apos;s output.</div>
        {/* Head detection (2026-08-29, real bug fix) — runs automatically
            on upload for the speaker default (see the photo route's own
            comment), same "detect once, reuse forever" shape as a real
            speaker's photo_head_box or a per-layer reference upload's
            reference_head_box. Without this, Generate Preview's crop had
            no idea where the head sits in this specific photo. */}
        {activeType === 'speaker' && value?.photo_url && (
          value.photo_head_box ? (
            <div style={{ fontSize: '11px', color: 'var(--teal-mid)', fontWeight: 700, marginTop: '8px' }}>
              Face-aligned ✓ (detected shot type: {classifyShotTypeLocal(value.photo_head_box.heightRatio).replace('_', ' ')})
            </div>
          ) : (
            <div style={{ fontSize: '11px', color: 'var(--amber)', fontWeight: 700, marginTop: '8px' }}>
              ⚠ No head detected in this photo — Generate Preview&apos;s crop may be off. Try re-uploading a clearer photo.
            </div>
          )
        )}
      </div>
    </div>
  )
}
