'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { Button, Card, Textarea, ProcessingOverlay, Toast, type ToastType } from '@/app/components/ui'
import type { CleaningCycleTemplate } from '@/app/lib/announcements/composite'
import { CLEANING_CYCLE_CANVAS_SIZE } from '@/app/lib/media/cleaning-cycle-constants'

/* Platform-level (not event-scoped) Cleaning Cycle standard (2026-08-28) —
   moved here from the per-event Creative Templates admin console's "AI Edit
   Prompts" tab after Madhu spotted the same pattern as the Placeholder
   Defaults globalization a day earlier: the tab's own copy already called
   this "the single standard every speaker's Cleaned Photo is measured
   against," yet it was stored and configured separately per event. Only
   one event had ever actually set it up (confirmed live before writing the
   migration) — see cleaning_cycle_template_global_migration.sql, which
   seeded this table from that event's existing value and stripped the
   stale per-event copy.

   The drag/resize head-marker interaction below is a straight relocation
   of the original panel's own implementation (own containerRef/dragRef,
   not the HeadMarkerEditor component built for Placeholder Defaults'
   photo) — deliberately NOT unified with that component. The two aren't
   interchangeable: this reference photo is shown at its own natural
   aspect ratio (target ratios are relative to the reference photo's own
   frozen dimensions — see PhotoAlignmentMeta's doc comment), while
   HeadMarkerEditor force-crops its photo to a square via objectFit:cover.
   Swapping in HeadMarkerEditor here would silently change what the stored
   ratios mean relative to a non-square reference photo — not worth the
   risk for a purely cosmetic unification. */
const DEFAULT_CLEANING_TEMPLATE: CleaningCycleTemplate = {
  reference_url: null,
  target_head_center_x: 0.5, target_head_center_y: 0.265, target_head_height: 0.29,
  reference_box_width: CLEANING_CYCLE_CANVAS_SIZE, reference_box_height: CLEANING_CYCLE_CANVAS_SIZE,
  shot_type: 'shoulders',
  prompt: '',
}

export default function CleaningCycleTemplatePage() {
  const [loading, setLoading] = useState(true)
  const [template, setTemplate] = useState<CleaningCycleTemplate>(DEFAULT_CLEANING_TEMPLATE)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [msgType, setMsgType] = useState<ToastType>('success')
  const [imgAspect, setImgAspect] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ mode: 'move' | 'resize'; startClientX: number; startClientY: number; startTemplate: CleaningCycleTemplate; rectWidth: number; rectHeight: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/branding/cleaning-cycle-template')
      .then(r => r.json())
      .then((data: CleaningCycleTemplate | null) => {
        if (cancelled) return
        if (data?.reference_url) setTemplate(data)
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  function update(patch: Partial<CleaningCycleTemplate>) {
    setTemplate(t => ({ ...t, ...patch }))
    setDirty(true)
  }

  async function uploadReference(file: File) {
    setAnalyzing(true)
    setMsg(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/branding/cleaning-cycle-template/derive-alignment', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setMsgType('error'); setMsg(data.error || 'Could not analyze the reference photo.'); return }
      setImgAspect(null)
      update({
        reference_url: data.reference_url,
        target_head_center_x: data.target_head_center_x, target_head_center_y: data.target_head_center_y, target_head_height: data.target_head_height,
        reference_box_width: data.reference_box_width, reference_box_height: data.reference_box_height,
        shot_type: data.shot_type,
      })
    } finally {
      setAnalyzing(false)
    }
  }

  function onImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    setImgAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)
  }

  function startDrag(e: React.PointerEvent, mode: 'move' | 'resize') {
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    const rect = containerRef.current?.getBoundingClientRect()
    dragRef.current = { mode, startClientX: e.clientX, startClientY: e.clientY, startTemplate: template, rectWidth: rect?.width || 1, rectHeight: rect?.height || 1 }
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    const dxRatio = (e.clientX - drag.startClientX) / drag.rectWidth
    const dyRatio = (e.clientY - drag.startClientY) / drag.rectHeight
    if (drag.mode === 'move') {
      update({
        target_head_center_x: Math.max(0, Math.min(1, drag.startTemplate.target_head_center_x + dxRatio)),
        target_head_center_y: Math.max(0, Math.min(1, drag.startTemplate.target_head_center_y + dyRatio)),
      })
    } else {
      update({ target_head_height: Math.max(0.03, drag.startTemplate.target_head_height + dyRatio * 2) })
    }
  }

  function endDrag(e: React.PointerEvent) {
    if (dragRef.current) { try { (e.currentTarget as Element).releasePointerCapture(e.pointerId) } catch { /* already released */ } }
    dragRef.current = null
  }

  async function save() {
    setSaving(true)
    const res = await fetch('/api/branding/cleaning-cycle-template', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(template),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) { setDirty(false); setMsgType('success'); setMsg('Saved.') } else { setMsgType('error'); setMsg(data.error || 'Save failed.') }
    setSaving(false)
  }

  const widthRatio = imgAspect ? template.target_head_height / imgAspect : template.target_head_height

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Branding"
        title="Cleaning Cycle Template"
        description="The single standard every speaker's Cleaned Photo is measured against, across every event."
      />

      <div style={{ padding: '24px 32px', maxWidth: '860px' }}>
        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '5px', width: 'fit-content' }}>
          <Link href="/admin/branding/fonts" style={{ padding: '8px 16px', borderRadius: '8px', color: 'var(--ink3)', fontSize: '13px', fontWeight: 800, textDecoration: 'none' }}>Fonts</Link>
          <Link href="/admin/branding/corporate" style={{ padding: '8px 16px', borderRadius: '8px', color: 'var(--ink3)', fontSize: '13px', fontWeight: 800, textDecoration: 'none' }}>Corporate Brand</Link>
          <Link href="/admin/branding/placeholder-defaults" style={{ padding: '8px 16px', borderRadius: '8px', color: 'var(--ink3)', fontSize: '13px', fontWeight: 800, textDecoration: 'none' }}>Placeholder Defaults</Link>
          <div style={{ padding: '8px 16px', borderRadius: '8px', background: 'var(--surface)', color: 'var(--lime)', fontSize: '13px', fontWeight: 800 }}>Cleaning Cycle Template</div>
        </div>

        <Toast message={msg} type={msgType} onClose={() => setMsg(null)} />

        {loading ? (
          <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>
        ) : (
          <Card padded>
            <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginBottom: '16px' }}>
              Upload a reference photo (any speaker photo already correctly composed works), then drag/resize the circle to mark exactly where the head should sit. The &quot;Clean Photo&quot; action on every speaker, in every event, crops to this one target, calling AI only when a photo doesn&apos;t have enough real content to fill it.
            </div>

            <div style={{ background: 'var(--surface)', borderRadius: '10px', overflow: 'hidden', display: 'flex', justifyContent: 'center', padding: '16px', marginBottom: '14px' }}>
              {template.reference_url ? (
                <div ref={containerRef} onPointerMove={onPointerMove} onPointerUp={endDrag} style={{ position: 'relative', display: 'inline-block', touchAction: 'none' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- needs real onLoad access to naturalWidth/naturalHeight, not next/image */}
                  <img src={template.reference_url} alt="Cleaning Cycle reference" onLoad={onImgLoad} style={{ maxWidth: '100%', maxHeight: '420px', display: 'block' }} />
                  {imgAspect && (
                    <div onPointerDown={e => startDrag(e, 'move')} style={{
                      position: 'absolute',
                      left: `${(template.target_head_center_x - widthRatio / 2) * 100}%`,
                      top: `${(template.target_head_center_y - template.target_head_height / 2) * 100}%`,
                      width: `${widthRatio * 100}%`, height: `${template.target_head_height * 100}%`,
                      borderRadius: '50%', border: '1.5px dashed var(--teal-mid)', background: 'color-mix(in srgb, var(--teal-mid) 10%, transparent)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'move',
                    }}>
                      <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--teal-mid)', opacity: 0.9, pointerEvents: 'none' }}>Head</span>
                      <div onPointerDown={e => startDrag(e, 'resize')} title="Drag to resize the head marker" style={{
                        position: 'absolute', bottom: -5, left: '50%', marginLeft: -5, width: 10, height: 10, borderRadius: '50%',
                        background: 'var(--teal-mid)', border: '1.5px solid var(--card)', cursor: 'ns-resize',
                      }} />
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ color: 'var(--ink3)', fontSize: '13px', textAlign: 'center', padding: '32px 0' }}>No reference photo yet — upload one below.</div>
              )}
            </div>

            <label style={{ display: 'inline-flex', marginBottom: '18px' }}>
              <span style={{ padding: '7px 14px', borderRadius: '10px', border: '1.5px solid var(--border)', color: 'var(--ink2)', fontSize: '13px', fontWeight: 700, cursor: analyzing ? 'default' : 'pointer' }}>
                {analyzing ? 'Analyzing…' : template.reference_url ? 'Replace Reference Photo (auto-position)' : 'Upload Reference Photo (auto-position)'}
              </span>
              <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} disabled={analyzing}
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadReference(f); e.target.value = '' }} />
            </label>

            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: '6px' }}>
              Additional AI fill notes (optional — only used when a photo needs it)
            </label>
            <div style={{ fontSize: '11px', color: 'var(--ink4)', marginBottom: '6px' }}>
              The exact target head position/size above is always sent automatically as precise numbers — this field is extra style guidance only (e.g. lighting, mood), not a full prompt replacement.
            </div>
            <Textarea value={template.prompt} onChange={e => update({ prompt: e.target.value })}
              placeholder="Optional — e.g. 'prefer a slightly warmer, more corporate lighting look'. Leave blank if you have no extra notes."
              style={{ width: '100%', minHeight: '100px', marginBottom: '18px' }} />

            <Button variant="teal" onClick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : dirty ? 'Save Changes' : 'Saved'}</Button>
            <ProcessingOverlay active={analyzing} label="Analyzing reference photo…" estimatedMs={4000} />
          </Card>
        )}
      </div>
    </div>
  )
}
