/* Badge batches keep their own copy of the template (so an approved or printed batch never changes under anyone). This is the pure part of
   noticing that the live template has moved on since, and deciding what to do about it: redraw a draft quietly, or only warn when someone
   has already signed the batch off. Unit-tested in template-drift.test.ts. */

type AnyVariant = {
  canvas_width?: number; canvas_height?: number
  print?: { width_mm?: number; height_mm?: number; bleed_mm?: number; back_pdf_url?: string | null } | null
  layers?: Array<Record<string, unknown>>
}

const sortKeys = (v: unknown): unknown => Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined && x !== null).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sortKeys(x)]))
  : v

/** Only what changes how a badge looks or prints. The template record also holds preview links, reference images and names that change whenever someone
 *  generates a preview — comparing those would flag every batch all the time. Reference-only layers are not drawn, so they are left out too. */
export function renderSignature(v: AnyVariant | null | undefined): string {
  if (!v) return ''
  return JSON.stringify(sortKeys({
    w: v.canvas_width, h: v.canvas_height,
    print: v.print ? { w: v.print.width_mm, h: v.print.height_mm, b: v.print.bleed_mm, back: v.print.back_pdf_url } : null,
    layers: (v.layers ?? []).filter(l => !l.reference_only),
  }))
}

export const templateChanged = (snapshot: AnyVariant | null | undefined, current: AnyVariant | null | undefined): boolean =>
  !!snapshot && !!current && renderSignature(snapshot) !== renderSignature(current)

export type BatchFacts = { status: 'draft' | 'review' | 'approved'; approvedBadges: number; approvalRounds: number; printFiles: number; dispatches: number }
/** 'auto': nothing has been signed off, so the batch can take the new design on its own. 'ask': a person must choose, because updating clears approvals. */
export function templatePolicy(f: BatchFacts): 'auto' | 'ask' {
  return f.status !== 'approved' && f.approvedBadges === 0 && f.approvalRounds === 0 && f.printFiles === 0 && f.dispatches === 0 ? 'auto' : 'ask'
}
