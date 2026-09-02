import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { parseFontMetadata } from '@/app/lib/branding/font-metadata'
import { closestAvailableWeight } from '@/app/lib/branding/fonts'
import { requireFontLibraryWriteAccess } from '@/app/lib/branding/fonts-access'

/* POST /api/branding/fonts/bulk-upload — multipart/form-data, one or more
   `files` entries (drag-and-drop or multi-select, any mix of families and
   weights in one batch). No family name is ever typed by hand — each
   file's own OpenType metadata says what it is (see font-metadata.ts).
   Files are grouped by their detected family name, matched against the
   existing library (case-insensitive), and either inserted as a new
   family, used to fill in any weights an existing family is missing, or
   skipped with a reason — one result row per detected family, returned
   for the upload UI to render as a notification list.

   2026-08-04: widened from a hardcoded Regular+Bold pair to arbitrary
   weights (100-900) per family — per Madhu: "for most of our google fonts
   or custom fonts we also use font weight option too instead of just
   using regular/bold." Weight is now read per-file from
   parseFontMetadata()'s OS/2.usWeightClass (with a subfamily-name
   fallback), not a binary isBold flag. */

const FONT_EXTENSIONS = ['ttf', 'otf', 'woff', 'woff2']

type FileResult = { family: string | null; status: 'added' | 'updated' | 'skipped' | 'error'; message: string }

export async function POST(req: NextRequest) {
  const denied = await requireFontLibraryWriteAccess(req)
  if (denied) return denied

  const form = await req.formData()
  const files = form.getAll('files').filter((f): f is File => f instanceof File)
  if (files.length === 0) return NextResponse.json({ error: 'No files provided' }, { status: 400 })

  type Parsed = { file: File; buffer: Buffer; familyName: string; weight: number }
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
      parsed.push({ file, buffer, familyName: meta.familyName, weight: meta.weight })
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
    // One file per weight — if the same weight appears twice in this drop
    // (e.g. a duplicate upload), keep the first and note the rest as ignored.
    const byWeight = new Map<number, Parsed>()
    let duplicateCount = 0
    for (const p of group) {
      if (byWeight.has(p.weight)) duplicateCount += 1
      else byWeight.set(p.weight, p)
    }
    const duplicateNote = duplicateCount > 0 ? ` (${duplicateCount} duplicate weight file${duplicateCount === 1 ? '' : 's'} in this drop ignored)` : ''

    const { data: existing } = await supabaseAdmin
      .from('brand_fonts')
      .select('id, weights, regular_url, bold_url')
      .ilike('family_name', familyName)
      .maybeSingle()

    try {
      if (!existing) {
        const fontId = crypto.randomUUID()
        const weightUrls: Record<number, string> = {}
        for (const [weight, p] of byWeight) {
          weightUrls[weight] = await uploadPublicAsset(`branding/fonts/${fontId}/${weight}.${extOf(p.file)}`, p.buffer, p.file.type || 'font/ttf')
        }

        // regular_url is NOT NULL in the schema — a brand-new family needs
        // SOME file as the base even if 400 wasn't among what was dropped
        // (e.g. someone drops just a Medium + SemiBold pair).
        const regularWeight = weightUrls[400] ? 400 : closestAvailableWeight(weightUrls, 400)!
        const boldWeight = weightUrls[700] ? 700 : (Object.keys(weightUrls).length > 1 ? closestAvailableWeight(weightUrls, 700) : null)

        const { error } = await supabaseAdmin.from('brand_fonts').insert({
          id: fontId, family_name: familyName, source: 'upload',
          regular_url: weightUrls[regularWeight],
          bold_url: boldWeight !== null ? weightUrls[boldWeight] : null,
          weights: weightUrls,
        })
        // 23505 = unique_violation on brand_fonts_family_name_lower_idx — a
        // genuinely concurrent request for the same family won the race;
        // this is a normal "already exists" outcome, not a real error.
        if (error?.code === '23505') {
          results.push({ family: familyName, status: 'skipped', message: `"${familyName}" already exists in the library — skipped.${duplicateNote}` })
          continue
        }
        if (error) throw new Error(error.message)

        const weightList = Object.keys(weightUrls).sort((a, b) => Number(a) - Number(b)).join(', ')
        results.push({ family: familyName, status: 'added', message: `Added "${familyName}" with weight${Object.keys(weightUrls).length === 1 ? '' : 's'} ${weightList}.${duplicateNote}` })
      } else {
        // Merge in only genuinely NEW weights — never overwrite a weight
        // this family already has a file for.
        const existingWeights: Record<number, string> = (existing.weights as Record<number, string> | null) ?? {}
        const newWeights: Record<number, string> = {}
        for (const [weight, p] of byWeight) {
          if (existingWeights[weight]) continue
          newWeights[weight] = await uploadPublicAsset(`branding/fonts/${existing.id}/${weight}.${extOf(p.file)}`, p.buffer, p.file.type || 'font/ttf')
        }

        if (Object.keys(newWeights).length === 0) {
          results.push({ family: familyName, status: 'skipped', message: `"${familyName}" already has every weight in this drop — skipped.${duplicateNote}` })
          continue
        }

        const mergedWeights = { ...existingWeights, ...newWeights }
        const update: Record<string, unknown> = { weights: mergedWeights }
        if (newWeights[400] && !existing.regular_url) update.regular_url = newWeights[400]
        if (newWeights[700] && !existing.bold_url) update.bold_url = newWeights[700]

        const { error } = await supabaseAdmin.from('brand_fonts').update(update).eq('id', existing.id)
        if (error) throw new Error(error.message)

        const addedList = Object.keys(newWeights).sort((a, b) => Number(a) - Number(b)).join(', ')
        results.push({ family: familyName, status: 'updated', message: `"${familyName}" already existed — added weight${Object.keys(newWeights).length === 1 ? '' : 's'} ${addedList}.${duplicateNote}` })
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
