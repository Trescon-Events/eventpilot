import { layersForRole, planTextLayer, resolveTextLayerYPositions, resolveTextValue, withTextLayerDefaults, type TextLayer, type Variant } from '@/app/lib/announcements/composite'
import { MIN_NAME_PX, scaleCardVariant } from './geometry'

/* Session thumbnails — checks that need fonts (so they are not in the pure geometry module): does the title fit, and is every name still readable once its card has shrunk. */

/** Does the title fit its layer at or above the layer's own minimum size? (wrapAndFit never drops words; "does not fit" means it overflowed the box at its hard minimum, or fell below min_font_size.) */
export async function titleCheck(layout: Variant, title: string): Promise<{ ok: boolean; fontSize: number | null; shrunk: boolean }> {
  const layer = layout.layers.find((l): l is TextLayer => l.type === 'text' && l.field === 'session_title')
  if (!layer || !title.trim()) return { ok: true, fontSize: null, shrunk: false }
  const t = withTextLayerDefaults(layer, { width: layout.canvas_width, height: layout.canvas_height })
  const plan = await planTextLayer({ ...t, allow_shrink: true }, resolveTextValue(t, { session_title: title }) ?? title)
  return { ok: !plan.didTruncate && plan.fontSize >= (t.min_font_size ?? 0), fontSize: plan.fontSize, shrunk: plan.didShrink }
}

/** Is the name readable on a card of this width: at least MIN_NAME_PX, and fully inside the card (never clipped). Rendered at final size, so the size reported is the real one. */
export async function nameCheck(card: Variant, width: number, moderator: boolean, name: string, company: string): Promise<{ ok: boolean; fontSize: number | null; reason: string | null }> {
  const scaled = layersForRole(scaleCardVariant(card, width), moderator)
  const layer = scaled.layers.find((l): l is TextLayer => l.type === 'text' && l.field === 'name')
  if (!layer || !name.trim()) return { ok: true, fontSize: null, reason: null }
  const texts = { name, company }
  const t = withTextLayerDefaults(layer, { width: scaled.canvas_width, height: scaled.canvas_height })
  const plan = await planTextLayer(t, resolveTextValue(t, texts) ?? name)
  const ys = await resolveTextLayerYPositions(scaled, texts)
  const top = ys.get(layer.id) ?? t.y
  const bottom = top + plan.lines.length * plan.lineHeight
  if (plan.fontSize < MIN_NAME_PX) return { ok: false, fontSize: plan.fontSize, reason: `${plan.fontSize}px` }
  if (bottom > scaled.canvas_height + 2 || top < -2) return { ok: false, fontSize: plan.fontSize, reason: 'runs off the card' }
  return { ok: true, fontSize: plan.fontSize, reason: null }
}
