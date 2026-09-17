import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { loadPressReleaseAndAuthorize, getLatestVersion } from '@/app/lib/content/press-release-access'

type EditField = 'headline' | 'dateline' | 'body_paragraph' | 'boilerplate'

// Same split the research route's refine prompt uses when numbering
// paragraphs for the model — indices must match exactly.
function splitParagraphs(body: string): string[] {
  return body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
}

/* POST /api/events/press-releases/[id]/apply-edit
   Body: { version_id: string, field: EditField, paragraph_index?: number, value: string }

   Applies a chat-suggested (or compliance-suggested) edit to one field of a
   version. If that version is still unapproved, it's updated in place — a
   title tweak doesn't mint a new version number. If it's already approved
   (frozen), this copy-on-writes a new version with the same content except
   the one field patched, so the approved row is never silently mutated. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await loadPressReleaseAndAuthorize(req, id, 'sae.content_studio.press_release.generate')
  if (!auth.ok) return auth.error
  const { pr, staffId } = auth.data

  const body = await req.json().catch(() => null) as { version_id?: string; field?: EditField; paragraph_index?: number; value?: string } | null
  if (!body?.version_id || !body?.field || typeof body.value !== 'string' || !body.value.trim()) {
    return NextResponse.json({ error: 'version_id, field, and a non-empty value are required' }, { status: 400 })
  }
  if (body.field === 'body_paragraph' && typeof body.paragraph_index !== 'number') {
    return NextResponse.json({ error: 'paragraph_index is required when field is body_paragraph' }, { status: 400 })
  }

  const { data: version } = await supabaseAdmin
    .from('press_release_versions')
    .select('*')
    .eq('id', body.version_id)
    .eq('press_release_id', pr.id)
    .single()
  if (!version) return NextResponse.json({ error: 'Version not found' }, { status: 404 })

  function patchedFields(source: { headline: string | null; dateline: string | null; body: string; boilerplate: string | null }) {
    if (body!.field === 'headline') return { headline: body!.value }
    if (body!.field === 'dateline') return { dateline: body!.value }
    if (body!.field === 'boilerplate') return { boilerplate: body!.value }
    // body_paragraph
    const paragraphs = splitParagraphs(source.body)
    const idx = body!.paragraph_index!
    if (idx < 0 || idx >= paragraphs.length) {
      throw new Error(`paragraph_index ${idx} out of range (draft has ${paragraphs.length} paragraphs)`)
    }
    paragraphs[idx] = body!.value!
    return { body: paragraphs.join('\n\n') }
  }

  try {
    if (!version.approved_at) {
      const { data: updated, error } = await supabaseAdmin
        .from('press_release_versions')
        .update(patchedFields(version))
        .eq('id', version.id)
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(updated)
    }

    // Approved — copy-on-write a new version instead of touching the frozen one.
    const latest = await getLatestVersion(pr.id)
    const nextVersion = (latest?.version_number ?? version.version_number) + 1
    const { data: created, error } = await supabaseAdmin
      .from('press_release_versions')
      .insert({
        press_release_id: pr.id,
        version_number: nextVersion,
        headline: version.headline,
        dateline: version.dateline,
        body: version.body,
        boilerplate: version.boilerplate,
        research_summary: version.research_summary,
        custom_instruction: `Edited from version ${version.version_number}`,
        generated_by: staffId,
        ...patchedFields(version),
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(created)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Edit failed' }, { status: 400 })
  }
}
