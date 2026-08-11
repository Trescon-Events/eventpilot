import sharp from 'sharp'

// Composites a text label onto the right side of a header image (Sharp +
// an SVG text layer) — a single flat PNG, not an HTML/CSS overlay, so it
// renders identically across every email client with zero compatibility
// risk (Outlook desktop's Word engine notoriously mangles modern CSS
// layout tricks; a plain <img> tag never has that problem). Used to give
// each email template a visual identity (e.g. "Speaker Onboarding")
// stamped onto the shared corporate header.

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function compositeHeaderText(baseImageUrl: string, text: string): Promise<Buffer> {
  const res = await fetch(baseImageUrl)
  if (!res.ok) throw new Error(`Could not fetch base header image: ${res.status}`)
  const baseBuffer = Buffer.from(await res.arrayBuffer())

  const meta = await sharp(baseBuffer).metadata()
  const width = meta.width ?? 1200
  const height = meta.height ?? 250
  const fontSize = Math.round(height * 0.16)
  const rightPadding = Math.round(width * 0.035)

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <text x="${width - rightPadding}" y="${height / 2}"
        font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${fontSize}"
        fill="#FFFFFF" text-anchor="end" dominant-baseline="middle" letter-spacing="1">${escapeXml(text)}</text>
</svg>`

  return sharp(baseBuffer)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer()
}
