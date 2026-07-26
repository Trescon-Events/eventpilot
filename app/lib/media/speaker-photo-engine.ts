// Speaker Photo Engine (SAE Phase C v4) — lives outside the Announcement
// Engine deliberately: a processed speaker photo is a reusable asset
// (Website Builder, future consumers), not something specific to one
// creative. Generalizes the PhotoRoom call that used to live inline in the
// upload-asset route, and adds the "enhance" step (brightness/contrast
// normalize + sharpen — confirmed sufficient for v1, no new dependency).
import sharp from 'sharp'

export async function processSpeakerPhoto(rawBuffer: Buffer, filename: string, mimeType: string): Promise<Buffer | null> {
  const photoRoomKey = process.env.PHOTOROOM_API_KEY
  if (!photoRoomKey) return null // no-ops gracefully if unset, matches existing precedent — doesn't error

  try {
    const form = new FormData()
    form.append('image_file', new Blob([new Uint8Array(rawBuffer)], { type: mimeType }), filename || 'photo.jpg')
    form.append('output_type', 'rgba')

    const res = await fetch('https://sdk.photoroom.com/v1/segment', {
      method: 'POST',
      headers: { 'x-api-key': photoRoomKey },
      body: form,
    })
    if (!res.ok) {
      console.error('PhotoRoom request failed:', res.status, await res.text().catch(() => ''))
      return null
    }

    const transparentBuffer = Buffer.from(await res.arrayBuffer())
    return await sharp(transparentBuffer)
      .normalize()  // stretches contrast to use the full tonal range
      .sharpen()    // mild sharpen — corrects for slight softness in compressed uploads
      .png()
      .toBuffer()
  } catch (e) {
    console.error('Speaker photo processing errored:', e)
    return null
  }
}
