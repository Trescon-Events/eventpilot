import sharp from 'sharp'

/* "Make it High-Res" (rebuilt 2026-10-19). The first version (retired 17 Oct) sent the whole photo through gpt-image-2, which re-draws faces. A second
   attempt with fal.ai's Clarity upscaler also changed facial features (eyes, gaze, mouth) and CodeFormer smoothed the face into a different-looking one.
   This one uses Topaz "High Fidelity V2" via fal.ai: a faithful super-resolution model that sharpens and adds texture without redrawing the person.
   Bake-off on a real 167x150 DFWS speaker photo (result shrunk back and compared with the original, higher = closer): High Fidelity V2 35.4 dB,
   Standard V2 33-34, CodeFormer 36.6 but visibly a different face; judged by eye, High Fidelity V2 kept the same eyes, smile and beard.
   One pass is 2x; $0.08 per image, ~16s. The producer sees before/after and decides; nothing is saved until they accept. */

const TOPAZ_URL = 'https://fal.run/fal-ai/topaz/upscale/image'
export const UPSCALE_FACTOR = 2
const MAX_INPUT_SIDE_PX = 1100 // the wizard only offers this for low-res photos; a bigger input is not needed

export async function upscaleHighRes(raw: Buffer): Promise<Buffer> {
  const key = process.env.FAL_API_KEY
  if (!key) throw new Error('FAL_API_KEY is not configured on this server')
  const oriented = await sharp(raw).rotate().resize(MAX_INPUT_SIDE_PX, MAX_INPUT_SIDE_PX, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()
  const res = await fetch(TOPAZ_URL, {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: `data:image/png;base64,${oriented.toString('base64')}`, upscale_factor: UPSCALE_FACTOR, model: 'High Fidelity V2' }),
  })
  if (!res.ok) throw new Error(`Upscaler failed (${res.status}): ${(await res.text().catch(() => '')).slice(0, 300)}`)
  const json = await res.json() as { image?: { url?: string } }
  const url = json.image?.url
  if (!url) throw new Error('Upscaler returned no image')
  const out = await fetch(url)
  if (!out.ok) throw new Error(`Could not download the upscaled photo (${out.status})`)
  return Buffer.from(await out.arrayBuffer())
}
