/* Shared PDF -> Gemini brand-guidelines extraction, lifted out of
   app/api/events/brand/extract-pdf/route.ts (2026-08-06) so the same
   9-section extraction can be reused for the corporate (non-event-scoped)
   brand guidelines section as well as the existing per-event Brand Studio
   PDF import. Pure extraction logic only — callers own persistence. */

export class ExtractionError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const GEMINI_KEY   = process.env.GEMINI_API_KEY!
const UPLOAD_URL   = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_KEY}`
const GENERATE_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`

const PROMPT = `You are a brand identity analyst. Read this entire brand guidelines document carefully, page by page.

Extract ALL brand elements and return ONLY a single valid JSON object — no markdown, no explanation, no code fences.

The JSON must follow this exact structure:

{
  "brand_name": "string — the brand or event name",
  "positioning_statement": "string — one-line brand positioning",
  "brand_category": "string — e.g. Institutional Technology Platform",
  "brand_vision": "string — brand vision statement",
  "brand_mission": "string — brand mission statement",
  "brand_archetypes": [
    { "role": "primary", "name": "The Steward", "description": "Responsible, stabilizing, long-term oriented." }
  ],

  "logo_concept": "string — the design story or foundational concept behind the logo",
  "logo_min_size_digital": "string — e.g. 64px",
  "logo_min_size_print": "string — e.g. 16mm",
  "logo_clear_space": "string — description of the clear space rule",
  "logo_cobranding_rules": "string — rules for co-branding with partners/sponsors",
  "logo_donts": ["string", "string"],

  "color_palette": [
    {
      "name": "string — colour name e.g. Sovereign Blue",
      "hex": "#XXXXXX",
      "role": "primary",
      "cmyk": { "c": 0, "m": 0, "y": 0, "k": 0 },
      "usage_notes": "string — how to use this colour",
      "print_caution": "string or null"
    }
  ],
  "color_usage_rules": "string — hierarchy and combination rules",
  "color_contrast_min": "string — e.g. 4.5:1",

  "heading_font": "string — Google Fonts name",
  "body_font": "string — Google Fonts name",
  "font_content_types": [
    { "content_type": "heading", "google_font_name": "string — Google Fonts name", "weight": 700, "usage_notes": "string — when/why to use this" }
  ],
  "type_scale_ratio": "string — e.g. 1.200",
  "type_scale": [
    { "level": "Display", "size_px": 57, "weight": 700, "line_height": "110%", "usage": "Hero headlines" }
  ],
  "type_rules_dos": ["string"],
  "type_rules_donts": ["string"],

  "pattern_assets": [
    { "name": "string", "url": null, "usage_context": "string", "background_tone": "dark" }
  ],

  "imagery_philosophy": ["string"],
  "photography_direction": {
    "subjects": ["string"],
    "dos": ["string"],
    "donts": ["string"]
  },
  "overlay_types": ["string"],
  "imagery_treatments": [
    { "name": "string", "description": "string", "use_cases": ["string"] }
  ],

  "icon_system": "string — e.g. Material Design / MUI Icons",
  "icon_grid_size": "string — e.g. 24x24",
  "icon_rules": "string",

  "grid_base_px": 4,
  "grid_columns": 12,
  "breakpoints": [
    { "name": "Small", "min_px": 0, "max_px": 599 }
  ],
  "spacing_tokens": [
    { "name": "XS", "value_px": 4 },
    { "name": "SM", "value_px": 8 },
    { "name": "MD", "value_px": 16 },
    { "name": "LG", "value_px": 24 },
    { "name": "XL", "value_px": 32 },
    { "name": "2XL", "value_px": 48 },
    { "name": "3XL", "value_px": 64 }
  ],

  "tone": ["string"],
  "style_keywords": ["string"],
  "key_messages": ["string"],
  "logo_notes": "string — any additional logo usage guidance"
}

Rules:
- hex codes must be in #RRGGBB format only
- heading_font and body_font must be exact Google Fonts names
- For color role use only: "primary", "secondary", "accent", "neutral-light", "neutral-dark"
- For font_content_types[].content_type, prefer one of: "heading", "subheading", "body", "caption", "button", "email", "quote" — use a short custom slug only if none of those genuinely fit. Extract one entry per distinct type role the document actually defines (e.g. a document with only heading/body fonts should produce 2 entries, matching heading_font/body_font above)
- For brand_archetypes role use only: "primary", "secondary", "tertiary"
- If a value cannot be found in the document, use null for strings, [] for arrays, {} for objects
- Extract as much detail as possible — do not skip sections
- For type_scale, extract every level defined in the document
- logo_donts should list every "don't" rule mentioned`

export async function extractBrandGuidelinesFromPdfUrl(pdfUrl: string): Promise<Record<string, unknown>> {
  // ── Step 1: Fetch PDF ──────────────────────────────────────
  const pdfRes = await fetch(pdfUrl)
  if (!pdfRes.ok) throw new ExtractionError('Could not fetch PDF from storage', 400)

  const pdfBuffer  = await pdfRes.arrayBuffer()
  const byteLength = pdfBuffer.byteLength

  // ── Step 2: Upload to Gemini Files API ────────────────────
  const uploadRes = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: {
      'Content-Type':                        'application/pdf',
      'Content-Length':                       String(byteLength),
      'X-Goog-Upload-Protocol':              'raw',
      'X-Goog-Upload-Command':               'upload, finalize',
      'X-Goog-Upload-Header-Content-Type':   'application/pdf',
      'X-Goog-Upload-Header-Content-Length': String(byteLength),
    },
    body: pdfBuffer,
  })

  const uploadData = await uploadRes.json()
  if (!uploadData?.file?.uri) {
    console.error('Gemini upload error:', JSON.stringify(uploadData))
    throw new ExtractionError('Failed to upload PDF to Gemini: ' + (uploadData?.error?.message ?? 'unknown'), 500)
  }

  const fileUri = uploadData.file.uri

  // ── Step 3: Extract brand data with Gemini ────────────────
  const gemRes = await fetch(GENERATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: PROMPT },
          { file_data: { mime_type: 'application/pdf', file_uri: fileUri } },
        ],
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 32768,
      },
    }),
  })

  if (!gemRes.ok) {
    const errText = await gemRes.text()
    console.error('Gemini generation failed:', gemRes.status, errText.slice(0, 500))
    throw new ExtractionError(`Gemini extraction failed (${gemRes.status}). Please try again or use a smaller PDF.`, 502)
  }

  const gemData = await gemRes.json()

  // Check for Gemini-level errors (quota, safety, etc.)
  if (gemData?.error) {
    console.error('Gemini API error:', JSON.stringify(gemData.error))
    throw new ExtractionError(`Gemini error: ${gemData.error.message ?? 'unknown'}`, 502)
  }

  // Handle thinking model response — text may be in a later part
  const parts = gemData?.candidates?.[0]?.content?.parts ?? []
  const textPart = parts.find((p: Record<string, unknown>) => typeof p.text === 'string' && p.text.trim().length > 0)
  const raw = textPart?.text ?? ''

  const finishReason = gemData?.candidates?.[0]?.finishReason
  if (finishReason === 'MAX_TOKENS') {
    console.error('Gemini output truncated (MAX_TOKENS) — PDF may be too complex')
  }

  // ── Step 4: Parse JSON response ───────────────────────────
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.error('Gemini raw response (no JSON found):', raw.slice(0, 1000))
    throw new ExtractionError('Could not parse brand data from PDF. The AI response did not contain valid JSON. Please try again.', 500)
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch (parseErr) {
    console.error('JSON parse error:', parseErr, '\nRaw (first 1000):', raw.slice(0, 1000))
    throw new ExtractionError('The AI returned malformed JSON. This often happens with very large PDFs. Please try again.', 500)
  }

  // ── Step 5: Normalise ─────────────────────────────────────
  if (Array.isArray(parsed.color_palette)) {
    parsed.color_palette = parsed.color_palette.filter(
      (c: any) => c?.hex && /^#[0-9A-Fa-f]{6}$/.test(c.hex)
    )
  }

  const palette = (Array.isArray(parsed.color_palette) ? parsed.color_palette : []) as Array<{ hex?: string; role?: string }>
  const primary   = palette.find(c => c.role === 'primary')
  const secondary = palette.find(c => c.role === 'secondary')
  const accent    = palette.find(c => c.role === 'accent')
  const bgLight   = palette.find(c => c.role === 'neutral-light')
  const bgDark    = palette.find(c => c.role === 'neutral-dark')

  return {
    brand_name:            parsed.brand_name            ?? null,
    positioning_statement: parsed.positioning_statement ?? null,
    brand_category:        parsed.brand_category        ?? null,
    brand_vision:          parsed.brand_vision          ?? null,
    brand_mission:         parsed.brand_mission         ?? null,
    brand_archetypes:      parsed.brand_archetypes      ?? [],
    logo_concept:          parsed.logo_concept          ?? null,
    logo_min_size_digital: parsed.logo_min_size_digital ?? null,
    logo_min_size_print:   parsed.logo_min_size_print   ?? null,
    logo_clear_space:      parsed.logo_clear_space      ?? null,
    logo_cobranding_rules: parsed.logo_cobranding_rules ?? null,
    logo_donts:            parsed.logo_donts            ?? [],
    logo_notes:            parsed.logo_notes            ?? null,
    color_palette:         palette,
    color_usage_rules:     parsed.color_usage_rules     ?? null,
    color_contrast_min:    parsed.color_contrast_min    ?? '4.5:1',
    heading_font:          parsed.heading_font          ?? null,
    body_font:             parsed.body_font             ?? null,
    font_content_types:    parsed.font_content_types    ?? [],
    type_scale_ratio:      parsed.type_scale_ratio      ?? null,
    type_scale:            parsed.type_scale            ?? [],
    type_rules_dos:        parsed.type_rules_dos        ?? [],
    type_rules_donts:      parsed.type_rules_donts      ?? [],
    pattern_assets:        parsed.pattern_assets        ?? [],
    imagery_philosophy:    parsed.imagery_philosophy    ?? [],
    photography_direction: parsed.photography_direction ?? {},
    overlay_types:         parsed.overlay_types         ?? [],
    imagery_treatments:    parsed.imagery_treatments    ?? [],
    icon_system:           parsed.icon_system           ?? null,
    icon_grid_size:        parsed.icon_grid_size        ?? null,
    icon_rules:            parsed.icon_rules            ?? null,
    grid_base_px:          parsed.grid_base_px          ?? 4,
    grid_columns:          parsed.grid_columns          ?? 12,
    breakpoints:           parsed.breakpoints           ?? [],
    spacing_tokens:        parsed.spacing_tokens        ?? [],
    tone:                  parsed.tone                  ?? [],
    style_keywords:        parsed.style_keywords        ?? [],
    key_messages:          parsed.key_messages          ?? [],
    primary_color:    primary?.hex   ?? parsed.primary_color   ?? null,
    secondary_color:  secondary?.hex ?? parsed.secondary_color ?? null,
    accent_color:     accent?.hex    ?? parsed.accent_color    ?? null,
    background_color: bgLight?.hex  ?? '#FFFFFF',
    text_color:       bgDark?.hex   ?? '#0F1923',
    source_pdf_url:   pdfUrl,
    build_mode:       'pdf_extracted',
    extracted_at:     new Date().toISOString(),
  }
}
