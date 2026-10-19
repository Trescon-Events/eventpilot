'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { permissionSetSatisfies } from '@/app/lib/access/permission-match'
import { Badge, Button, Card, Input } from '@/app/components/ui'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'
import { AssetTile } from '../../AssetTile'
import PhotoCleaningWizard from '../../PhotoCleaningWizard'

/* VIP details (2026-10-19) — the VIP counterpart of the speaker details page (../[stakeholderId]): same header, tab bar, Photo section (Raw +
   Cleaned tiles, Upload Raw Photo / Clean Photo / Delete Photo, the same guided cleaning wizard) and auto-saving Details card, with only the
   fields a VIP has (name, job title, company, country). When a VIP gains more data points, add them here the way the speaker page does. */

type HeadBox = { centerXRatio: number; centerYRatio: number; heightRatio: number }
type Vip = {
  id: string; name: string; job_title: string | null; company: string | null; country: string | null
  photo_url: string | null; photo_processed_url: string | null; photo_head_box: HeadBox | null
  photo_low_resolution: boolean; photo_cleaning_cycle_done: boolean
  badge_status: 'created' | 'sent' | 'printed' | null
}
const BADGE_LABEL = { created: 'Badge created', sent: 'Badge sent to printer', printed: 'Badge printed' } as const
const SAVE_DEBOUNCE_MS = 700

export default function VipDetailsPage({ params }: { params: Promise<{ id: string; vipId: string }> }) {
  const { id: eventId, vipId } = use(params)
  const [vip, setVip] = useState<Vip | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<Set<string>>(new Set())
  const [eventName, setEventName] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [company, setCompany] = useState('')
  const [country, setCountry] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null)
  const [wizardEntry, setWizardEntry] = useState<{ kind: 'upload'; file: File } | { kind: 'existing'; url: string; headBox: HeadBox | null } | null>(null)
  const [lightbox, setLightbox] = useState<{ url: string; label: string } | null>(null)
  const [photoDelete, setPhotoDelete] = useState<{ text: string; deleting: boolean } | null>(null)
  const rawPhotoInputRef = useRef<HTMLInputElement | null>(null)
  const dirtyRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef({ name: '', jobTitle: '', company: '', country: '' })
  const can = (key: string) => permissionSetSatisfies(permissions, key)
  const canEdit = can('sae.badges.manage')
  useBreadcrumbLabel(eventId, eventName)
  useBreadcrumbLabel(vipId, vip?.name || null)

  const load = useCallback(async (initial = false) => {
    const res = await fetch(`/api/events/stakeholders/vips?event_id=${eventId}&id=${vipId}`)
    const data = await res.json().catch(() => ({}))
    const v = (data.vips ?? [])[0] as Vip | undefined
    if (!res.ok || !v) { setError(data.error ?? 'VIP not found.'); return }
    setVip(v)
    if (initial) { setName(v.name); setJobTitle(v.job_title ?? ''); setCompany(v.company ?? ''); setCountry(v.country ?? '') }
  }, [eventId, vipId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void load(true)
    void (async () => {
      const [permRes, eventRes] = await Promise.all([fetch(`/api/events/access/me?event_id=${eventId}`), fetch(`/api/events?id=${eventId}`)])
      setPermissions(new Set((await permRes.json().catch(() => ({ permissions: [] }))).permissions ?? []))
      setEventName((await eventRes.json().catch(() => null))?.name ?? null)
    })()
  }, [load, eventId])

  async function flushSave() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    if (!dirtyRef.current) return
    const f = latest.current
    if (!f.name.trim()) { setSaveState('error'); setSaveErrorMsg('A VIP needs a name'); return }
    dirtyRef.current = false
    setSaveState('saving')
    const res = await fetch('/api/events/stakeholders/vips', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, id: vipId, name: f.name, job_title: f.jobTitle, company: f.company, country: f.country }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { dirtyRef.current = true; setSaveState('error'); setSaveErrorMsg(data.error ?? null); return }
    setSaveErrorMsg(null); setSaveState('saved')
    setVip(prev => prev ? { ...prev, name: data.vip.name } : prev)
  }
  function scheduleSave(next: Partial<typeof latest.current>) {
    latest.current = { ...latest.current, ...next }
    dirtyRef.current = true
    setSaveState('idle')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { void flushSave() }, SAVE_DEBOUNCE_MS)
  }
  useEffect(() => { latest.current = { name, jobTitle, company, country } }, [name, jobTitle, company, country])

  async function deletePhoto() {
    setPhotoDelete(p => p && { ...p, deleting: true })
    const res = await fetch('/api/events/stakeholders/vips', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, id: vipId, clear_photo: true }) })
    if (res.ok) { setPhotoDelete(null); await load() } else { setPhotoDelete(null); setError('Could not delete the photo.') }
  }

  if (!vip) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
        <PageHeader eyebrow="Stakeholder Hub" title={error ? 'VIP' : 'Loading…'} backHref={`/admin/events/${eventId}/stakeholders`} backLabel="Back to Stakeholder Hub" />
        {error && <div style={{ padding: '24px 32px', color: 'var(--red)', fontSize: '14.5px' }}>{error}</div>}
      </div>
    )
  }

  const cleanPhoto = vip.photo_processed_url || vip.photo_url
  const labelStyle = { fontSize: '16px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '7px' } as const
  const safeName = (vip.name || 'vip').replace(/[^a-z0-9]+/gi, '-').toLowerCase()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)', overflowAnchor: 'none' }}>
      <PageHeader
        eyebrow="Stakeholder Hub"
        title={vip.name || 'New VIP'}
        description={<Badge color={vip.badge_status === 'printed' ? 'teal' : 'grey'}>{vip.badge_status ? BADGE_LABEL[vip.badge_status] : 'No badge yet'}</Badge>}
        backHref={`/admin/events/${eventId}/stakeholders`}
        backLabel="Back to Stakeholder Hub"
      />

      <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '20px 32px 0' }}>
        <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid var(--border-light)' }}>
          <button style={{ padding: '10px 18px', border: 'none', borderBottom: '2px solid var(--teal-mid)', background: 'transparent', fontFamily: 'inherit', fontSize: '13px', fontWeight: 700, color: 'var(--ink)', marginBottom: '-1px' }}>Overview</button>
        </div>
      </div>

      <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '24px 32px', display: 'grid', gap: '20px' }}>
        {error && <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: '14.5px' }}>{error}</div>}

        <Card padded>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--ink3)', marginBottom: '14px' }}>Photo</div>
          <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '14px' }}>Optional — a VIP badge works without one. Upload a photo and clean it just like a speaker&apos;s; the cleaned photo is what goes on the badge.</div>
          <div style={{ display: 'flex', gap: '40px', flexWrap: 'wrap' }}>
            <AssetTile label="Raw Photo" url={vip.photo_url} filename={`${safeName}-photo-raw.jpg`} size={176} onOpen={(url, label) => setLightbox({ url, label })} />
            <div>
              <AssetTile
                label="Cleaned Photo" url={vip.photo_processed_url || null} filename={`${safeName}-photo-clean.png`} size={176}
                onOpen={(url, label) => setLightbox({ url, label })}
                badges={[
                  ...(vip.photo_low_resolution ? [{ text: 'Low Resolution', tone: 'amber' as const }] : []),
                  ...(cleanPhoto ? [vip.photo_cleaning_cycle_done ? { text: 'Cleaned', tone: 'success' as const } : { text: 'Not Cleaned Yet', tone: 'amber' as const }] : []),
                ]}
              />
              {canEdit && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                  <Button variant="ghost" onClick={() => rawPhotoInputRef.current?.click()}>Upload Raw Photo</Button>
                  {cleanPhoto && <Button variant="ghost" onClick={() => setPhotoDelete({ text: '', deleting: false })}>Delete Photo</Button>}
                  <input ref={rawPhotoInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) setWizardEntry({ kind: 'upload', file: f }); e.target.value = '' }} />
                  {cleanPhoto && (
                    <Button variant={vip.photo_cleaning_cycle_done ? 'ghost' : 'lime'} onClick={() => setWizardEntry({ kind: 'existing', url: cleanPhoto, headBox: vip.photo_head_box })}>
                      {vip.photo_cleaning_cycle_done ? '✓ Clean Photo' : 'Clean Photo'}
                    </Button>
                  )}
                </div>
              )}
              {vip.photo_low_resolution && (
                <div style={{ fontSize: '11.5px', color: 'var(--amber)', marginTop: '10px', maxWidth: '260px' }}>⚠ Lower resolution than ideal — the badge photo may look soft. Ask for a higher-resolution original.</div>
              )}
            </div>
          </div>
        </Card>

        <Card padded>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', gap: '10px' }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>Details</div>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: saveState === 'error' ? 'var(--red)' : 'var(--ink3)' }}>
              {saveState === 'saving' && 'Saving…'}
              {saveState === 'saved' && 'Saved ✓'}
              {saveState === 'error' && (
                <>{saveErrorMsg ?? 'Save failed'} — <button onClick={() => void flushSave()} style={{ background: 'none', border: 'none', color: 'var(--red)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>retry</button></>
              )}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
            <div>
              <label style={labelStyle}>Name *</label>
              <Input className="tfield-lg" value={name} disabled={!canEdit} onBlur={() => void flushSave()} onChange={e => { setName(e.target.value); scheduleSave({ name: e.target.value }) }} />
            </div>
            <div>
              <label style={labelStyle}>Job Title</label>
              <Input className="tfield-lg" value={jobTitle} disabled={!canEdit} onBlur={() => void flushSave()} onChange={e => { setJobTitle(e.target.value); scheduleSave({ jobTitle: e.target.value }) }} />
            </div>
            <div>
              <label style={labelStyle}>Company</label>
              <Input className="tfield-lg" value={company} disabled={!canEdit} onBlur={() => void flushSave()} onChange={e => { setCompany(e.target.value); scheduleSave({ company: e.target.value }) }} />
            </div>
            <div>
              <label style={labelStyle}>Country</label>
              <Input className="tfield-lg" value={country} disabled={!canEdit} onBlur={() => void flushSave()} onChange={e => { setCountry(e.target.value); scheduleSave({ country: e.target.value }) }} />
            </div>
          </div>
        </Card>
      </div>

      {wizardEntry && (
        <PhotoCleaningWizard eventId={eventId} speakerId={vipId} kind="vip" entry={wizardEntry} onSaved={() => load()} onClose={() => setWizardEntry(null)} />
      )}

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 75%, transparent)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', cursor: 'zoom-out' }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- lightbox preview of a storage image */}
          <img src={lightbox.url} alt={lightbox.label} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', background: 'var(--card)', borderRadius: '10px' }} />
        </div>
      )}

      {photoDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setPhotoDelete(null)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '440px', maxWidth: '100%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px' }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>Delete this photo?</div>
            <div style={{ fontSize: '13.5px', color: 'var(--ink3)', marginBottom: '12px', lineHeight: 1.5 }}>Removes the raw and cleaned photo. The VIP stays on the list. Type <strong>DELETE</strong> below to confirm.</div>
            <Input value={photoDelete.text} onChange={e => setPhotoDelete({ ...photoDelete, text: e.target.value })} placeholder="Type DELETE to confirm" autoFocus style={{ marginBottom: '16px' }} />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setPhotoDelete(null)}>Cancel</Button>
              <Button variant="red" onClick={() => void deletePhoto()} disabled={photoDelete.text !== 'DELETE' || photoDelete.deleting}>{photoDelete.deleting ? 'Deleting…' : 'Delete'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
