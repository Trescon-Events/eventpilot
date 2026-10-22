import { fetchAssetBuffer } from '@/app/lib/announcements/asset-buffer-cache'
import type { CreativeTemplateConfig, PhotoSlotLayer, Variant } from '@/app/lib/announcements/composite'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { alignAndCropPhoto, type HeadBox } from '@/app/lib/media/face-alignment'

// Memento artwork (2026-10-22): the speaker's Cleaned Photo placed on a TRANSPARENT canvas of the variant's own size, head fixed to the
// variant's traced head marker. One layer, no background, no text, no upscaling beyond what the template's head size asks for.

export function listMementoVariants(config: CreativeTemplateConfig | null | undefined): Variant[] {
  return (config?.speaker?.variants ?? []).filter(v => v.category === 'memento')
}

export function mementoPhotoLayer(variant: Variant): PhotoSlotLayer | undefined {
  return variant.layers.find((l): l is PhotoSlotLayer => l.type === 'photo_slot' && l.source === 'speaker_photo')
}

export type MementoRenderResult =
  | { ok: true; buffer: Buffer; padding: { left: number; top: number; right: number; bottom: number } }
  | { ok: false; error: string }

/** Renders one speaker's memento PNG. Needs a confirmed head box (never guessed) and a variant whose photo layer has a traced alignment. */
export async function renderMementoPng(variant: Variant, photoUrl: string, headBox: HeadBox | null): Promise<MementoRenderResult> {
  const layer = mementoPhotoLayer(variant)
  if (!layer) {
    return { ok: false, error: 'The Memento variant has no Photo/Logo Slot layer — in Admin Console → Variants, delete any Image layer and add a "+ Photo/Logo Slot" (source: speaker photo), then upload the reference on that layer.' }
  }
  if (!layer.alignment) {
    return { ok: false, error: 'The Memento variant has no reference layer yet — in Admin Console → Variants, open the Photo/Logo Slot layer and click "Upload Reference Layer (auto-position)".' }
  }
  if (!headBox) return { ok: false, error: 'No confirmed head position for this speaker — use "Fix Head Position" first.' }
  const source = await fetchAssetBuffer(photoUrl)
  if (!source) return { ok: false, error: "Could not fetch this speaker's cleaned photo." }
  const target = { ...layer.alignment, box: { x: 0, y: 0, width: variant.canvas_width, height: variant.canvas_height } }
  try {
    const { buffer, padding } = await alignAndCropPhoto(source, target, headBox)
    return { ok: true, buffer, padding }
  } catch (e) {
    console.error('Memento render failed:', e)
    return { ok: false, error: 'Rendering the memento failed.' }
  }
}

/** Renders and stores one speaker's memento artwork; returns its public URL. */
export async function renderAndStoreMemento(eventId: string, speakerId: string, variant: Variant, photoUrl: string, headBox: HeadBox | null): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const r = await renderMementoPng(variant, photoUrl, headBox)
  if (!r.ok) return r
  const url = await uploadPublicAsset(`events/${eventId}/speakers/${speakerId}/memento/${Date.now()}.png`, r.buffer, 'image/png')
  return { ok: true, url }
}
