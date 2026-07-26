'use client'

import { useState, useEffect, useRef, use } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Button, Card, Badge, Input, Select } from '@/app/components/ui'
import type { Layer, ImageLayer, PhotoSlotLayer, TextLayer, Variant, CreativeTemplateConfig } from '@/app/lib/announcements/composite'

/* Layer-based creative template editor (PRD v1.4 Phase C v3). Each
   stakeholder type (speaker/partner) has its own set of named variants;
   each variant is an ordered stack of layers (image / photo-slot / text)
   composited bottom-to-top by app/lib/announcements/composite.ts. Nothing
   here hits the network except: layer image uploads (immediate, need a URL
   back), the debounced live preview (renders via the real Sharp pipeline,
   nothing persisted), and Save (writes the whole variants array for the
   active stakeholder type in one PUT). */

type StakeholderKind = 'speaker' | 'partner'
type StakeholderOption = { id: string; label: string }

const LAYER_TYPE_LABEL: Record<Layer['type'], string> = { image: 'Image', photo_slot: 'Photo/Logo Slot', text: 'Text' }

function newLayer(type: Layer['type'], activeType: StakeholderKind): Layer {
  const id = crypto.randomUUID()
  if (type === 'image') return { id, type: 'image', asset_url: '', x: 0, y: 0, width: 400, height: 400 }
  if (type === 'photo_slot') return { id, type: 'photo_slot', source: activeType === 'speaker' ? 'speaker_photo' : 'partner_logo', x: 0, y: 0, width: 400, height: 400 }
  // eslint-disable-next-line no-restricted-syntax -- font_color is composited-creative content data, not EventPilot UI theming; the color rule governs var(--token) styling, not this
  return { id, type: 'text', field: activeType === 'speaker' ? 'name' : 'custom', value: activeType === 'partner' ? 'LEAD SPONSOR' : undefined, x: 0, y: 0, font_size: 32, font_color: '#FFFFFF', font_weight: 'normal', align: 'left' }
}

export default function CreativeTemplatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)

  const [loading, setLoading] = useState(true)
  const [speakerVariants, setSpeakerVariants] = useState<Variant[]>([])
  const [partnerVariants, setPartnerVariants] = useState<Variant[]>([])
  const [activeType, setActiveType] = useState<StakeholderKind>('speaker')
  const [activeVariantId, setActiveVariantId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [uploadingLayerId, setUploadingLayerId] = useState<string | null>(null)

  const [speakers, setSpeakers] = useState<StakeholderOption[]>([])
  const [partners, setPartners] = useState<StakeholderOption[]>([])
  const [brandFonts, setBrandFonts] = useState<Array<{ id: string; family_name: string; regular_url: string; bold_url: string | null }>>([])
  const [previewFor, setPreviewFor] = useState<string>('')
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const variants = activeType === 'speaker' ? speakerVariants : partnerVariants
  const setVariants = activeType === 'speaker' ? setSpeakerVariants : setPartnerVariants
  const activeVariant = variants.find(v => v.id === activeVariantId) ?? null
  const stakeholderOptions = activeType === 'speaker' ? speakers : partners

  async function fetchAll() {
    setLoading(true)
    const [configRes, spRes, ptRes, fontsRes] = await Promise.all([
      fetch(`/api/events/templates?event_id=${eventId}`),
      fetch(`/api/events/stakeholders/speakers?event_id=${eventId}`),
      fetch(`/api/events/stakeholders/partners?event_id=${eventId}`),
      fetch('/api/branding/fonts'),
    ])
    const config: CreativeTemplateConfig | null = await configRes.json().catch(() => null)
    const loadedSpeakerVariants = config?.speaker?.variants ?? []
    const loadedPartnerVariants = config?.partner?.variants ?? []
    setSpeakerVariants(loadedSpeakerVariants)
    setPartnerVariants(loadedPartnerVariants)
    // Auto-select the first variant for the active tab on initial load — the
    // tab-switch effect below only fires when activeType *changes*, so
    // without this, a variant that already existed before this page load
    // never gets selected until the MM manually switches tabs and back.
    const initialList = activeType === 'speaker' ? loadedSpeakerVariants : loadedPartnerVariants
    setActiveVariantId(prev => prev ?? initialList[0]?.id ?? null)
    const sp: Array<{ id: string; full_name: string }> = await spRes.json().catch(() => [])
    const pt: Array<{ id: string; company_name: string }> = await ptRes.json().catch(() => [])
    setSpeakers(sp.map(s => ({ id: s.id, label: s.full_name })))
    setPartners(pt.map(p => ({ id: p.id, label: p.company_name })))
    setBrandFonts(await fontsRes.json().catch(() => []))
    setDirty(false)
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount; matches app/admin/events/[id]/stakeholders/page.tsx's fetchAll effect
  useEffect(() => { fetchAll() }, [eventId])

  useEffect(() => {
    const list = activeType === 'speaker' ? speakerVariants : partnerVariants
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the selected variant/preview target on tab switch; a derived-state reset, not a fetch side effect, but the same standard pattern
    setActiveVariantId(list[0]?.id ?? null)
    setPreviewFor('')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-select on tab switch, not on every variants edit
  }, [activeType])

  // Debounced server-rendered live preview — re-runs the real Sharp pipeline
  // on every meaningful edit so what's shown here can never drift from what
  // generate/regenerate-creative would actually produce.
  useEffect(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- early-return guard when there's no variant to preview; the real render call's setState is inside a debounced async callback, outside the rule's scope
    if (!activeVariant) { setPreviewDataUrl(null); return }
    previewTimer.current = setTimeout(async () => {
      setPreviewLoading(true)
      const body: Record<string, unknown> = { stakeholder_type: activeType, variant: activeVariant }
      if (previewFor) body[activeType === 'speaker' ? 'speaker_id' : 'partner_id'] = previewFor
      const res = await fetch('/api/events/templates/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      setPreviewDataUrl(res.ok ? data.preview_data_url : null)
      setPreviewLoading(false)
    }, 500)
    return () => { if (previewTimer.current) clearTimeout(previewTimer.current) }
  }, [activeVariant, previewFor, activeType])

  function mutate(fn: (vs: Variant[]) => Variant[]) {
    setVariants(fn)
    setDirty(true)
  }

  function updateActiveVariant(patch: Partial<Variant>) {
    if (!activeVariantId) return
    mutate(vs => vs.map(v => v.id === activeVariantId ? { ...v, ...patch } : v))
  }

  function addVariant() {
    const variant: Variant = { id: crypto.randomUUID(), name: 'Untitled Variant', canvas_width: 1080, canvas_height: 1350, layers: [] }
    mutate(vs => [...vs, variant])
    setActiveVariantId(variant.id)
  }

  function deleteVariant(id: string) {
    mutate(vs => vs.filter(v => v.id !== id))
    if (activeVariantId === id) setActiveVariantId(null)
  }

  function addLayer(type: Layer['type']) {
    if (!activeVariant) return
    updateActiveVariant({ layers: [...activeVariant.layers, newLayer(type, activeType)] })
  }

  function updateLayer(layerId: string, patch: Partial<Layer>) {
    if (!activeVariant) return
    updateActiveVariant({ layers: activeVariant.layers.map(l => l.id === layerId ? ({ ...l, ...patch } as Layer) : l) })
  }

  function deleteLayer(layerId: string) {
    if (!activeVariant) return
    updateActiveVariant({ layers: activeVariant.layers.filter(l => l.id !== layerId) })
  }

  function moveLayer(layerId: string, delta: 1 | -1) {
    if (!activeVariant) return
    const layers = [...activeVariant.layers]
    const idx = layers.findIndex(l => l.id === layerId)
    const swapIdx = idx + delta
    if (idx < 0 || swapIdx < 0 || swapIdx >= layers.length) return
    ;[layers[idx], layers[swapIdx]] = [layers[swapIdx], layers[idx]]
    updateActiveVariant({ layers })
  }

  async function uploadLayerImage(layerId: string, file: File) {
    setUploadingLayerId(layerId)
    const form = new FormData()
    form.append('file', file)
    form.append('event_id', eventId)
    form.append('template_type', activeType)
    const res = await fetch('/api/events/templates/upload', { method: 'POST', body: form })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.url) updateLayer(layerId, { asset_url: data.url } as Partial<ImageLayer>)
    else setMsg(data.error || 'Layer image upload failed.')
    setUploadingLayerId(null)
  }

  async function save() {
    setSaving(true)
    const res = await fetch('/api/events/templates/variants', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, stakeholder_type: activeType, variants }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) { setDirty(false); setMsg('Saved.') } else { setMsg(data.error || 'Save failed.') }
    setSaving(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Event Workspace"
        title="Creative Templates"
        description="Build layer stacks for stakeholder announcement creatives — background art, a speaker photo or partner logo, and text, in whatever stacking order the design needs."
        actions={<Button variant="lime" onClick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : dirty ? 'Save Changes' : 'Saved'}</Button>}
      />

      <div style={{ padding: '24px 32px' }}>
        {msg && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--red-light)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: '12.5px', marginBottom: '16px' }}>
            {msg} <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700, marginLeft: '8px' }}>×</button>
          </div>
        )}

        <div style={{ display: 'flex', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden', width: 'fit-content', marginBottom: '20px' }}>
          {(['speaker', 'partner'] as const).map(t => (
            <button key={t} onClick={() => setActiveType(t)}
              style={{
                padding: '7px 18px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 700,
                background: activeType === t ? 'var(--card)' : 'transparent',
                color: activeType === t ? 'var(--ink)' : 'var(--ink3)',
              }}>
              {t === 'speaker' ? 'Speaker' : 'Partner'}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ color: 'var(--ink3)', fontSize: '13px' }}>Loading…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 340px', gap: '20px', alignItems: 'flex-start' }}>
            {/* Variant list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {variants.map(v => (
                <button key={v.id} onClick={() => setActiveVariantId(v.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                    padding: '9px 12px', borderRadius: '8px', border: 'none', textAlign: 'left', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: '13px', fontWeight: 700,
                    background: activeVariantId === v.id ? 'var(--card)' : 'transparent',
                    color: activeVariantId === v.id ? 'var(--ink)' : 'var(--ink3)',
                  }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name || 'Untitled Variant'}</span>
                  <span style={{ fontSize: '11px', color: 'var(--ink4)', flexShrink: 0 }}>{v.layers.length}</span>
                </button>
              ))}
              <Button variant="ghost" onClick={addVariant}>+ New Variant</Button>
            </div>

            {/* Layer editor */}
            <div>
              {!activeVariant ? (
                <Card padded>
                  <div style={{ color: 'var(--ink3)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
                    {`No ${activeType} variants yet — click "+ New Variant" to start one.`}
                  </div>
                </Card>
              ) : (
                <Card padded>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '10px', alignItems: 'center', marginBottom: '16px' }}>
                    <Input value={activeVariant.name} onChange={e => updateActiveVariant({ name: e.target.value })} placeholder="Variant name" />
                    <label style={{ fontSize: '11px', color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      W <Input type="number" value={activeVariant.canvas_width} onChange={e => updateActiveVariant({ canvas_width: Number(e.target.value) })} style={{ width: '70px' }} />
                    </label>
                    <label style={{ fontSize: '11px', color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      H <Input type="number" value={activeVariant.canvas_height} onChange={e => updateActiveVariant({ canvas_height: Number(e.target.value) })} style={{ width: '70px' }} />
                    </label>
                  </div>

                  <div style={{ fontSize: '11px', color: 'var(--ink3)', marginBottom: '10px' }}>
                    Layers, bottom to top — the last one renders on top of everything above it.
                  </div>

                  <div style={{ display: 'grid', gap: '8px', marginBottom: '14px' }}>
                    {activeVariant.layers.map((layer, i) => (
                      <LayerRow
                        key={layer.id}
                        layer={layer}
                        index={i}
                        total={activeVariant.layers.length}
                        activeType={activeType}
                        uploading={uploadingLayerId === layer.id}
                        brandFonts={brandFonts}
                        onChange={patch => updateLayer(layer.id, patch)}
                        onDelete={() => deleteLayer(layer.id)}
                        onMove={delta => moveLayer(layer.id, delta)}
                        onUploadImage={file => uploadLayerImage(layer.id, file)}
                      />
                    ))}
                    {activeVariant.layers.length === 0 && (
                      <div style={{ color: 'var(--ink3)', fontSize: '12.5px', padding: '10px 0' }}>No layers yet.</div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <Button variant="ghost" onClick={() => addLayer('image')}>+ Image Layer</Button>
                    <Button variant="ghost" onClick={() => addLayer('photo_slot')}>+ Photo/Logo Slot</Button>
                    <Button variant="ghost" onClick={() => addLayer('text')}>+ Text Layer</Button>
                    <Button variant="red" onClick={() => deleteVariant(activeVariant.id)}>Delete Variant</Button>
                  </div>
                </Card>
              )}
            </div>

            {/* Live preview */}
            <div style={{ position: 'sticky', top: '20px' }}>
              <Card padded>
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--teal-mid)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '10px' }}>Live Preview</div>
                <Select value={previewFor} onChange={e => setPreviewFor(e.target.value)} style={{ marginBottom: '10px', width: '100%' }}>
                  <option value="">Placeholder data</option>
                  {stakeholderOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </Select>
                <div style={{ borderRadius: '8px', overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--border-light)', aspectRatio: activeVariant ? `${activeVariant.canvas_width} / ${activeVariant.canvas_height}` : '4 / 5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {previewLoading ? (
                    <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>Rendering…</span>
                  ) : previewDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- data: URL preview, next/image can't handle these
                    <img src={previewDataUrl} alt="Creative preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>{activeVariant ? 'No preview yet' : 'Select a variant'}</span>
                  )}
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function LayerRow({ layer, index, total, activeType, uploading, brandFonts, onChange, onDelete, onMove, onUploadImage }: {
  layer: Layer
  index: number
  total: number
  activeType: StakeholderKind
  uploading: boolean
  brandFonts: Array<{ id: string; family_name: string; regular_url: string; bold_url: string | null }>
  onChange: (patch: Partial<Layer>) => void
  onDelete: () => void
  onMove: (delta: 1 | -1) => void
  onUploadImage: (file: File) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{ border: '1px solid var(--border-light)', borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: 'var(--surface)' }}>
        <Badge color={layer.type === 'image' ? 'purple' : layer.type === 'photo_slot' ? 'amber' : 'teal'}>{LAYER_TYPE_LABEL[layer.type]}</Badge>
        <button onClick={() => setExpanded(x => !x)} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12.5px', color: 'var(--ink)', fontWeight: 700 }}>
          {layerSummary(layer)}
        </button>
        <span style={{ fontSize: '10.5px', color: 'var(--ink4)' }}>{index + 1}/{total}</span>
        <button onClick={() => onMove(1)} disabled={index === total - 1} title="Bring forward" style={{ background: 'none', border: 'none', cursor: index === total - 1 ? 'default' : 'pointer', color: index === total - 1 ? 'var(--ink4)' : 'var(--ink2)', fontSize: '13px' }}>▲</button>
        <button onClick={() => onMove(-1)} disabled={index === 0} title="Send backward" style={{ background: 'none', border: 'none', cursor: index === 0 ? 'default' : 'pointer', color: index === 0 ? 'var(--ink4)' : 'var(--ink2)', fontSize: '13px' }}>▼</button>
        <button onClick={onDelete} title="Delete layer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: '13px' }}>✕</button>
      </div>

      {expanded && (
        <div style={{ padding: '12px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {layer.type === 'image' && <ImageLayerFields layer={layer} uploading={uploading} onChange={onChange} onUploadImage={onUploadImage} />}
          {layer.type === 'photo_slot' && <PhotoSlotLayerFields layer={layer} activeType={activeType} onChange={onChange} />}
          {layer.type === 'text' && <TextLayerFields layer={layer} activeType={activeType} brandFonts={brandFonts} onChange={onChange} />}
        </div>
      )}
    </div>
  )
}

function layerSummary(layer: Layer): string {
  if (layer.type === 'image') return layer.asset_url ? `Image (${layer.width}×${layer.height})` : 'Image (no file uploaded)'
  if (layer.type === 'photo_slot') return `${layer.source.replace(/_/g, ' ')} (${layer.width}×${layer.height})`
  return `Text: ${layer.field}${layer.field === 'custom' || layer.field === 'tier' ? ` "${layer.value ?? ''}"` : ''}`
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label style={{ fontSize: '11px', color: 'var(--ink3)', display: 'block' }}>
      {label}
      <Input type="number" value={value} onChange={e => onChange(Number(e.target.value))} style={{ width: '100%', marginTop: '3px' }} />
    </label>
  )
}

function ImageLayerFields({ layer, uploading, onChange, onUploadImage }: { layer: ImageLayer; uploading: boolean; onChange: (patch: Partial<ImageLayer>) => void; onUploadImage: (file: File) => void }) {
  return (
    <>
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '10px' }}>
        {layer.asset_url && (
          // eslint-disable-next-line @next/next/no-img-element -- small admin-only thumbnail, not worth next/image's remote-loader setup
          <img src={layer.asset_url} alt="Layer asset" style={{ width: '40px', height: '50px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-light)' }} />
        )}
        <label style={{ padding: '6px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--ink2)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
          {uploading ? 'Uploading…' : layer.asset_url ? 'Replace PNG' : 'Upload PNG'}
          <input type="file" accept="image/png" style={{ display: 'none' }} disabled={uploading}
            onChange={e => { const f = e.target.files?.[0]; if (f) onUploadImage(f); e.target.value = '' }} />
        </label>
      </div>
      <NumField label="X" value={layer.x} onChange={x => onChange({ x })} />
      <NumField label="Y" value={layer.y} onChange={y => onChange({ y })} />
      <NumField label="Width" value={layer.width} onChange={width => onChange({ width })} />
      <NumField label="Height" value={layer.height} onChange={height => onChange({ height })} />
    </>
  )
}

function PhotoSlotLayerFields({ layer, activeType, onChange }: { layer: PhotoSlotLayer; activeType: StakeholderKind; onChange: (patch: Partial<PhotoSlotLayer>) => void }) {
  const sourceOptions: PhotoSlotLayer['source'][] = activeType === 'speaker' ? ['speaker_photo', 'speaker_logo'] : ['partner_logo']
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)

  async function analyzeReferenceLayer(file: File) {
    setAnalyzing(true)
    setAnalyzeError(null)
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/events/templates/derive-alignment', { method: 'POST', body: form })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      onChange({
        x: data.box.x, y: data.box.y, width: data.box.width, height: data.box.height,
        alignment: { target_head_center_x: data.target_head_center_x, target_head_center_y: data.target_head_center_y, target_head_height: data.target_head_height, shot_type: data.shot_type },
      })
    } else {
      setAnalyzeError(data.error || 'Could not analyze that reference image.')
    }
    setAnalyzing(false)
  }

  return (
    <>
      <label style={{ gridColumn: '1 / -1', fontSize: '11px', color: 'var(--ink3)', display: 'block' }}>
        Source
        <Select value={layer.source} onChange={e => onChange({ source: e.target.value as PhotoSlotLayer['source'] })} style={{ width: '100%', marginTop: '3px' }}>
          {sourceOptions.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </Select>
      </label>

      {layer.source === 'speaker_photo' && (
        <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ padding: '7px 14px', borderRadius: '8px', border: '1.5px solid var(--border)', color: 'var(--ink2)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', width: 'fit-content' }}>
            {analyzing ? 'Analyzing…' : 'Upload Reference Layer (auto-position)'}
            <input type="file" accept="image/png" style={{ display: 'none' }} disabled={analyzing}
              onChange={e => { const f = e.target.files?.[0]; if (f) analyzeReferenceLayer(f); e.target.value = '' }} />
          </label>
          <div style={{ fontSize: '10.5px', color: 'var(--ink3)', lineHeight: 1.4 }}>
            Upload a transparent PNG showing a dummy photo already correctly positioned — the box and face-alignment target below are derived automatically. Manual fields below still work if you&apos;d rather set them by hand.
          </div>
          {analyzeError && <div style={{ fontSize: '11px', color: 'var(--red)' }}>{analyzeError}</div>}
          {layer.alignment && (
            <div style={{ fontSize: '11px', color: 'var(--teal-mid)', fontWeight: 700 }}>
              Face-aligned ✓ (detected shot type: {layer.alignment.shot_type.replace(/_/g, ' ')})
            </div>
          )}
        </div>
      )}

      <NumField label="X" value={layer.x} onChange={x => onChange({ x })} />
      <NumField label="Y" value={layer.y} onChange={y => onChange({ y })} />
      <NumField label="Width" value={layer.width} onChange={width => onChange({ width })} />
      <NumField label="Height" value={layer.height} onChange={height => onChange({ height })} />
    </>
  )
}

function TextLayerFields({ layer, activeType, brandFonts, onChange }: {
  layer: TextLayer
  activeType: StakeholderKind
  brandFonts: Array<{ id: string; family_name: string; regular_url: string; bold_url: string | null }>
  onChange: (patch: Partial<TextLayer>) => void
}) {
  const fieldOptions: TextLayer['field'][] = activeType === 'speaker' ? ['name', 'title', 'company', 'tier', 'custom'] : ['tier', 'custom']
  return (
    <>
      <label style={{ fontSize: '11px', color: 'var(--ink3)', display: 'block' }}>
        Field
        <Select value={layer.field} onChange={e => onChange({ field: e.target.value as TextLayer['field'] })} style={{ width: '100%', marginTop: '3px' }}>
          {fieldOptions.map(f => <option key={f} value={f}>{f}</option>)}
        </Select>
      </label>
      {(layer.field === 'custom' || layer.field === 'tier') && (
        <label style={{ fontSize: '11px', color: 'var(--ink3)', display: 'block' }}>
          {layer.field === 'tier' ? 'Fallback text' : 'Static text'}
          <Input value={layer.value ?? ''} onChange={e => onChange({ value: e.target.value })} style={{ width: '100%', marginTop: '3px' }} />
        </label>
      )}
      <label style={{ gridColumn: '1 / -1', fontSize: '11px', color: 'var(--ink3)', display: 'block' }}>
        Font Family
        <Select
          value={layer.font_family?.family_name ?? ''}
          onChange={e => {
            const font = brandFonts.find(f => f.family_name === e.target.value)
            onChange({ font_family: font ? { family_name: font.family_name, regular_url: font.regular_url, bold_url: font.bold_url } : undefined })
          }}
          style={{ width: '100%', marginTop: '3px' }}
        >
          <option value="">Default (generic sans-serif)</option>
          {brandFonts.map(f => <option key={f.id} value={f.family_name}>{f.family_name}</option>)}
        </Select>
      </label>
      <NumField label="X" value={layer.x} onChange={x => onChange({ x })} />
      <NumField label="Y" value={layer.y} onChange={y => onChange({ y })} />
      <NumField label="Font size" value={layer.font_size} onChange={font_size => onChange({ font_size })} />
      <label style={{ fontSize: '11px', color: 'var(--ink3)', display: 'block' }}>
        Font color
        <Input type="color" value={layer.font_color} onChange={e => onChange({ font_color: e.target.value })} style={{ width: '100%', marginTop: '3px', height: '34px', padding: '2px' }} />
      </label>
      <label style={{ fontSize: '11px', color: 'var(--ink3)', display: 'block' }}>
        Weight
        <Select value={layer.font_weight ?? 'normal'} onChange={e => onChange({ font_weight: e.target.value as TextLayer['font_weight'] })} style={{ width: '100%', marginTop: '3px' }}>
          <option value="normal">Normal</option>
          <option value="bold">Bold</option>
        </Select>
      </label>
      <label style={{ fontSize: '11px', color: 'var(--ink3)', display: 'block' }}>
        Align
        <Select value={layer.align ?? 'left'} onChange={e => onChange({ align: e.target.value as TextLayer['align'] })} style={{ width: '100%', marginTop: '3px' }}>
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </Select>
      </label>
    </>
  )
}
