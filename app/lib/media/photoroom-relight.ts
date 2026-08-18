// PhotoRoom Relight, "compose-first" (2026-08-19) — the only lighting
// option for website photos; unset, the plain composite (composite-on-
// background.ts) is used as-is. See Variant.lighting_prompt's doc comment
// in composite.ts.
//
// This is NOT the same approach the original PhotoRoom pipeline used. That
// approach sent PhotoRoom a bare transparent cutout and asked it to
// relight AND figure out how to integrate a background in one step — that
// ambiguity is exactly what caused it to silently re-zoom/reposition the
// subject, confirmed by direct before/after pixel comparison, and no
// amount of prompt wording fixed it reliably.
//
// This approach instead composites the subject onto the REAL background
// FIRST (deterministically, our own code — see the caller), and only THEN
// sends that already-fully-composed, already-correctly-framed photo to
// PhotoRoom, asking it to relight what's already there. Confirmed
// empirically (2026-08-19, 12 real test runs across 3 prompt phrasings
// against real speaker photos): framing held perfectly consistent in EVERY
// run once PhotoRoom had nothing left to decide compositionally — a
// materially different and much more reliable result than the bare-cutout
// approach ever produced. The geometry-preservation instruction below is
// appended to every call regardless of what the branding team's own prompt
// says, as a belt-and-suspenders safety net on top of the input-structure
// fix — the two together are what actually eliminated the drift, not
// either alone.
//
// The STYLE side is still genuinely inconsistent between calls, and that's
// a real, open limitation, not swept under the rug: which exact words a
// branding-team prompt uses matters a lot (e.g. "edge"/"silhouette"
// language reliably triggered PhotoRoom into outlining the whole person in
// testing; "kicker light" phrasing avoided that). Getting a prompt that
// reliably produces the intended look for a given style is real,
// deliberate iteration work for whoever writes it — this module doesn't
// (and can't) guarantee that part.
export class PhotoRoomRelightError extends Error {
  status: number
  constructor(message: string, status = 502) {
    super(message)
    this.status = status
  }
}

// Appended to every call — see this file's doc comment. Deliberately does
// NOT dictate anything about the requested STYLE (color, direction,
// intensity) — that's 100% the branding team's own prompt. Only enforces
// the "common, must be exact" geometry contract Madhu asked for.
const GEOMETRY_GUARD = 'Do not change the background, do not change the framing, crop, zoom, or position of the subject in any way — the photo composition must stay exactly as given. Only apply the requested lighting change.'

export async function applyPhotoRoomRelight(
  compositedBuffer: Buffer,
  opts: { prompt: string; outputWidth: number; outputHeight: number }
): Promise<Buffer> {
  const photoRoomKey = process.env.PHOTOROOM_API_KEY
  if (!photoRoomKey) throw new PhotoRoomRelightError('PHOTOROOM_API_KEY not configured', 500)

  const form = new FormData()
  form.append('imageFile', new Blob([new Uint8Array(compositedBuffer)], { type: 'image/png' }), 'composited.png')
  form.append('removeBackground', 'false') // already fully composited — nothing to segment
  form.append('editWithAI.prompt', `${opts.prompt} ${GEOMETRY_GUARD}`)
  form.append('editWithAI.mode', 'ai.auto')
  form.append('outputSize', `${opts.outputWidth}x${opts.outputHeight}`)

  const res = await fetch('https://image-api.photoroom.com/v2/edit', {
    method: 'POST',
    headers: { 'x-api-key': photoRoomKey },
    body: form,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new PhotoRoomRelightError(`PhotoRoom edit failed (${res.status}): ${detail.slice(0, 300)}`)
  }
  return Buffer.from(await res.arrayBuffer())
}
