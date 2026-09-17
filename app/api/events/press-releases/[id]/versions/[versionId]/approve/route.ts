import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { loadPressReleaseAndAuthorize } from '@/app/lib/content/press-release-access'

/* POST /api/events/press-releases/[id]/versions/[versionId]/approve
   Stamps approved_by/approved_at on the version and moves the press
   release's status to 'approved'. Gated separately from .generate so a
   PR Team role can hold research/draft access without approval authority. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  const { id, versionId } = await params
  const auth = await loadPressReleaseAndAuthorize(req, id, 'sae.content_studio.press_release.approve')
  if (!auth.ok) return auth.error
  const { pr, staffId } = auth.data

  const { data: version } = await supabaseAdmin
    .from('press_release_versions')
    .select('id, press_release_id')
    .eq('id', versionId)
    .eq('press_release_id', pr.id)
    .single()
  if (!version) return NextResponse.json({ error: 'Version not found' }, { status: 404 })

  const now = new Date().toISOString()
  const { data: updated, error } = await supabaseAdmin
    .from('press_release_versions')
    .update({ approved_by: staffId, approved_at: now })
    .eq('id', versionId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabaseAdmin.from('press_releases').update({ status: 'approved', updated_at: now }).eq('id', pr.id)

  return NextResponse.json(updated)
}
