import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { parseFontMetadata } from '@/app/lib/branding/font-metadata'

/* POST /api/branding/fonts/bulk-upload — multipart/form-data, one or more
   `files` entries (drag-and-drop or multi-select, any mix of families and
   weights in one batch). No family name is ever typed by hand — each
   file's own OpenType metadata says what it is (see font-metadata.ts).
   Files are grouped by their detected family name, matched against the
   existing library (case-insensitive), and either inserted as a new
   family, used to fill in a missing Bold weight on an existing family, or
   skipped with a reason — one result row per detected family, returned
   for the upload UI to render as a notification list. */

const FONT_EXTENSIONS = ['ttf', 'otf', 'woff', 'woff2']

type FileResult = { family: string | null; status: 'added' | 'updated' | 'skipped' | 'error'; message: string }

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const files = form.getAll('files').filter((f): f is File => f instanceof File)
  if (files.length === 0) return NextResponse.json({ error: 'No files provided' }, { status: 400 })

  type Parsed = { file: File; buffer: Buffer; familyName: string; isBold: boolean }
  const parsed: Parsed[] = []
  const results: FileResult[] = []

  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!FONT_EXTENSIONS.includes(ext)) {
      results.push({ family: null, status: 'error', message: `${file.name}: unsupported file type .${ext} — use ttf/otf/woff/woff2` })
      continue
    }
    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      const meta = parseFontMetadata(buffer)
      parsed.push({ file, buffer, familyName: meta.familyName, isBold: meta.isBold })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not read this font file'
      results.push({ family: null, status: 'error', message: `${file.name}: ${message}` })
    }
  }

  // Group by detected family name (case-sensitive — trust the font's own
  // naming exactly as written; "Poppins" and "poppins" from two different
  // files would be a genuinely inconsistent metadata problem worth seeing,
  // not silently merged).
  const groups = new Map<string, Parsed[]>()
  for (const p of parsed) {
    const group = groups.get(p.familyName) ?? []
    group.push(p)
    groups.set(p.familyName, group)
  }

  for (const [familyName, group] of groups) {
    const boldFiles = group.filter(g => g.isBold)
    const regularFiles = group.filter(g => !g.isBold)

    // A font needs at least one file to exist at all (regular_url is
    // NOT NULL in the schema) — if only a Bold weight was dropped for a
    // brand-new family, use it as the base file rather than discarding it.
    const primary = regularFiles[0] ?? boldFiles[0]
    const secondaryBold = regularFiles.length > 0 ? boldFiles[0] : undefined
    const usedCount = 1 + (secondaryBold ? 1 : 0)
    const extraCount = group.length - usedCount
    const extraNote = extraCount > 0 ? ` (${extraCount} additional file${extraCount === 1 ? '' : 's'} in this drop ignored — only one Regular + one Bold weight per family is supported today)` : ''
    const usedBoldFileAsRegular = regularFiles.length === 0 && !!boldFiles[0]

    const { data: existing } = await supabaseAdmin
      .from('brand_fonts')
      .select('id, bold_url')
      .ilike('family_name', familyName)
      .maybeSingle()

    try {
      if (!existing) {
        const fontId = crypto.randomUUID()
        const regular_url = await uploadPublicAsset(`branding/fonts/${fontId}/regular.${extOf(primary.file)}`, primary.buffer, primary.file.type || 'font/ttf')
        const bold_url = secondaryBold
          ? await uploadPublicAsset(`branding/fonts/${fontId}/bold.${extOf(secondaryBold.file)}`, secondaryBold.buffer, secondaryBold.file.type || 'font/ttf')
          : null

        const { error } = await supabaseAdmin.from('brand_fonts').insert({ id: fontId, family_name: familyName, source: 'upload', regular_url, bold_url })
        // 23505 = unique_violation on brand_fonts_family_name_lower_idx — a
        // genuinely concurrent request for the same family won the race;
        // this is a normal "already exists" outcome, not a real error.
        if (error?.code === '23505') {
          results.push({ family: familyName, status: 'skipped', message: `"${familyName}" already exists in the library — skipped.${extraNote}` })
          continue
        }
        if (error) throw new Error(error.message)

        results.push({
          family: familyName, status: 'added',
          message: usedBoldFileAsRegular
            ? `Added "${familyName}" (only a Bold file was found — stored as the base weight).${extraNote}`
            : `Added "${familyName}"${bold_url ? ' with Regular + Bold' : ' (Regular only)'}.${extraNote}`,
        })
      } else if (secondaryBold && !existing.bold_url) {
        const bold_url = await uploadPublicAsset(`branding/fonts/${existing.id}/bold.${extOf(secondaryBold.file)}`, secondaryBold.buffer, secondaryBold.file.type || 'font/ttf')
        const { error } = await supabaseAdmin.from('brand_fonts').update({ bold_url }).eq('id', existing.id)
        if (error) throw new Error(error.message)
        results.push({ family: familyName, status: 'updated', message: `"${familyName}" already existed — added the missing Bold weight.${extraNote}` })
      } else {
        results.push({ family: familyName, status: 'skipped', message: `"${familyName}" already exists in the library — skipped.${extraNote}` })
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Upload failed'
      results.push({ family: familyName, status: 'error', message: `"${familyName}": ${message}` })
    }
  }

  return NextResponse.json({ results })
}

function extOf(file: File): string {
  return file.name.split('.').pop()?.toLowerCase() ?? 'ttf'
}
