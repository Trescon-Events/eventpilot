// Text-style-from-reference-image guessing (SAE, 2026-08-02) — lets a text
// layer's "Upload Reference Layer" derive not just its box (already handled
// generically by face-alignment.ts's alpha-trim) but a starting guess at
// font color/weight/alignment too, so the branding team isn't manually
// re-typing values they can already see in their own Canva mockup. Font
// FAMILY is deliberately NOT guessed here — there's no reliable way to map
// a flat raster image back to one of this event's actual brand fonts, so
// that stays a manual pick regardless (unchanged from before this file
// existed). Font SIZE also isn't asked of Gemini directly — pixel-precise
// size estimation from an image is unreliable, and TextLayer.font_size is
// only ever a ceiling anyway (wrapAndFit() auto-shrinks to fit); the caller
// derives a reasonable ceiling from the already-known box height and the
// line_count reported here instead.
import sharp from 'sharp'
import { GoogleGenerativeAI, SchemaType, type ObjectSchema } from '@google/generative-ai'

let _gemini: GoogleGenerativeAI | null = null
function getGemini() {
  if (!_gemini) _gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  return _gemini
}

export type TextStyleGuess = {
  color: string                        // 6-digit hex, e.g. "#C8FF4D"
  weight: 'normal' | 'bold'
  align: 'left' | 'center' | 'right'
  line_count: number                   // used to back out a font-size ceiling from the box height
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export async function detectTextStyle(trimmedReferenceBuffer: Buffer): Promise<TextStyleGuess | null> {
  const schema: ObjectSchema = {
    type: SchemaType.OBJECT,
    properties: {
      text_detected: { type: SchemaType.BOOLEAN },
      color_hex: { type: SchemaType.STRING, description: 'Dominant color of the text itself, as a 6-digit hex code like #FFFFFF' },
      weight: { type: SchemaType.STRING, format: 'enum', enum: ['normal', 'bold'] },
      align: { type: SchemaType.STRING, format: 'enum', enum: ['left', 'center', 'right'] },
      line_count: { type: SchemaType.NUMBER, description: 'Number of visible lines of text' },
    },
    required: ['text_detected', 'color_hex', 'weight', 'align', 'line_count'],
  }

  const model = getGemini().getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
  })

  const pngBuffer = await sharp(trimmedReferenceBuffer).png().toBuffer()
  const result = await model.generateContent([
    { inlineData: { mimeType: 'image/png', data: pngBuffer.toString('base64') } },
    { text: 'This image shows one block of placeholder/dummy text on a transparent background, standing in for where real text will later render. Report the text\'s own dominant color as a 6-digit hex code (not the background), whether its font weight looks bold or normal/regular, its horizontal text alignment (left/center/right), and how many visible lines of text there are.' },
  ])

  const parsed = JSON.parse(result.response.text()) as {
    text_detected: boolean; color_hex: string; weight: string; align: string; line_count: number
  }
  if (!parsed.text_detected) return null

  return {
    // eslint-disable-next-line no-restricted-syntax -- fallback for detected composited-creative text color data, not EventPilot UI theming; matches page.tsx's identical font_color exemption
    color: HEX_RE.test(parsed.color_hex) ? parsed.color_hex : '#000000',
    weight: parsed.weight === 'bold' ? 'bold' : 'normal',
    align: parsed.align === 'center' || parsed.align === 'right' ? parsed.align : 'left',
    line_count: Math.max(1, Math.round(parsed.line_count) || 1),
  }
}
