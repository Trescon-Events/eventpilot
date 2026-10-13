import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import type { Variant, CreativeTemplateConfig } from '@/app/lib/announcements/composite'

/* Copies one template variant (any category: promo, self promo, website photo, badge — speaker or partner)
   from one event into another event's template editor. Every file the variant owns (layer art, print PDFs,
   badge back, reference and preview images) is re-uploaded under the TARGET event, so the copy is fully
   independent: replacing or deleting the original's artwork never changes the copy. Files that are shared by
   design (brand fonts under branding/) are left pointing where they are. Layer ids are regenerated; links
   between layers (text snapping below a layer) are kept. */

const BUCKET_MARKER = '/event-stakeholder-assets/'
const MAX_FILES = 200
const MAX_BYTES = 50 * 1024 * 1024

export type CopyVariantResult = { variant: Variant; files_copied: number; target_variant_count: number }

export async function copyVariantToEvent(opts: {
  sourceEventId: string
  targetEventId: string
  stakeholderType: 'speaker' | 'partner'
  variant: Variant
  sourceEventName: string
}): Promise<CopyVariantResult> {
  const { targetEventId, stakeholderType, variant, sourceEventName } = opts

  const copiedByUrl = new Map<string, string>()
  async function copyUrl(url: string): Promise<string> {
    const done = copiedByUrl.get(url)
    if (done) return done
    if (copiedByUrl.size >= MAX_FILES) throw new Error(`This template references more than ${MAX_FILES} files — copy stopped.`)
    const path = decodeURIComponent(url.split(BUCKET_MARKER)[1].split('?')[0])
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
    if (!res.ok) throw new Error(`Could not read a template file (${res.status}): ${path}`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > MAX_BYTES) throw new Error(`A template file is larger than 50 MB: ${path}`)
    const ext = (path.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'bin').toLowerCase()
    const dest = `events/${targetEventId}/templates/copied-${Date.now()}-${copiedByUrl.size}.${ext}`
    const newUrl = await uploadPublicAsset(dest, buf, res.headers.get('content-type') ?? 'application/octet-stream')
    copiedByUrl.set(url, newUrl)
    return newUrl
  }

  // Deep-walk: every string that is a file in our asset bucket (and not a shared brand file) is re-hosted.
  async function walk(v: unknown): Promise<unknown> {
    if (typeof v === 'string') {
      if (v.includes(BUCKET_MARKER) && /^https?:\/\//.test(v)) {
        const path = v.split(BUCKET_MARKER)[1] ?? ''
        if (!path.startsWith('branding/')) return copyUrl(v)
      }
      return v
    }
    if (Array.isArray(v)) { const out: unknown[] = []; for (const x of v) out.push(await walk(x)); return out }
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = await walk(x)
      return out
    }
    return v
  }

  const copied = await walk(variant) as Variant
  const idMap = new Map(copied.layers.map(l => [l.id, randomUUID()]))
  const layers = copied.layers.map(l => ({
    ...l,
    id: idMap.get(l.id)!,
    ...(l.type === 'text' && l.snap_below_layer_id ? { snap_below_layer_id: idMap.get(l.snap_below_layer_id) } : {}),
  }))
  const result: Variant = { ...copied, id: randomUUID(), name: `${variant.name || 'Untitled Variant'} (from ${sourceEventName})`, layers }

  // Append to the target's variants without touching anything else on the event.
  const { data: target, error: readErr } = await supabaseAdmin.from('events').select('creative_template_config').eq('id', targetEventId).single()
  if (readErr || !target) throw new Error('Target event not found')
  const current = (target.creative_template_config as CreativeTemplateConfig | null) ?? {}
  const existing = current[stakeholderType]?.variants ?? []
  const updated: CreativeTemplateConfig = { ...current, [stakeholderType]: { variants: [...existing, result] } }
  const { error: writeErr } = await supabaseAdmin.from('events').update({ creative_template_config: updated }).eq('id', targetEventId)
  if (writeErr) throw new Error(writeErr.message)

  return { variant: result, files_copied: copiedByUrl.size, target_variant_count: existing.length + 1 }
}
