import { layersForRole, planTextLayer, resolveTextLayerYPositions, resolveTextValue, withTextLayerDefaults, type TextLayer, type Variant } from '@/app/lib/announcements/composite'
import { scaleCardVariant } from './geometry'

/* Session thumbnails — checks that need fonts (so they are not in the pure geometry module): does the title fit, and is every name still readable once its card has shrunk. */

/** Does the title fit its layer at or above the layer's own minimum size? (wrapAndFit never drops words; "does not fit" means it overflowed the box at its hard minimum, or fell below min_font_size.) */
export async function titleCheck(layout: Variant, title: string): Promise<{ ok: boolean; fontSize: number | null; shrunk: boolean }> {
  const layer = layout.layers.find((l): l is TextLayer => l.type === 'text' && l.field === 'session_title')
  if (!layer || !title.trim()) return { ok: true, fontSize: null, shrunk: false }
  const t = withTextLayerDefaults(layer, { width: layout.canvas_width, height: layout.canvas_height })
  const plan = await planTextLayer({ ...t, allow_shrink: true }, resolveTextValue(t, { session_title: title }) ?? title)
  return { ok: !plan.didTruncate && plan.fontSize >= (t.min_font_size ?? 0), fontSize: plan.fontSize, shrunk: plan.didShrink }
}

/** The ONE size every name on a thumbnail uses (px, final size): the template's own name size scaled to the card, shrunk only as far as the LONGEST name needs. Names are never shortened and never
 *  block a thumbnail: each name wraps to the template's lines first, then the size comes down until the whole name is inside its box and the card. Null when the card has no name layer. */
export async function nameSizeFor(card: Variant, width: number, people: { moderator: boolean; name: string; company: string }[]): Promise<number | null> {
  const base = scaleCardVariant(card, width)
  const seen = new Set<string>()
  let size: number | null = null
  for (const p of people) {
    const key = `${p.moderator}|${p.name}|${p.company}`
    if (seen.has(key) || !p.name.trim()) continue
    seen.add(key)
    const role = layersForRole(base, p.moderator)
    const layer = role.layers.find((l): l is TextLayer => l.type === 'text' && l.field === 'name')
    if (!layer) continue
    const texts = { name: p.name, company: p.company }
    const fitsAt = async (px: number): Promise<boolean> => {
      const test: Variant = { ...role, layers: role.layers.map(l => (l.id === layer.id ? { ...layer, font_size: px, allow_shrink: false, height: Math.max(layer.height, Math.ceil(px * 1.2 * Math.max(1, layer.max_lines))) } : l)) }
      const t = test.layers.find(l => l.id === layer.id) as TextLayer
      const n = withTextLayerDefaults(t, { width: test.canvas_width, height: test.canvas_height })
      const plan = await planTextLayer(n, resolveTextValue(n, texts) ?? p.name)
      if (plan.didTruncate) return false   // does not fit its lines / box at this size
      const top = (await resolveTextLayerYPositions(test, texts)).get(layer.id) ?? n.y
      return top >= -2 && top + plan.lines.length * plan.lineHeight <= test.canvas_height + 2
    }
    let hi = layer.font_size
    let best = 1
    if (await fitsAt(hi)) best = hi
    else { let lo = 1; hi -= 1; while (lo <= hi) { const mid = Math.floor((lo + hi) / 2); if (await fitsAt(mid)) { best = mid; lo = mid + 1 } else hi = mid - 1 } }
    size = size === null ? best : Math.min(size, best)
  }
  return size
}
