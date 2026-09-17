import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { loadPressReleaseAndAuthorize } from '@/app/lib/content/press-release-access'

/* GET /api/events/press-releases/[id] — the press release plus its full version history (newest first). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await loadPressReleaseAndAuthorize(req, id, 'sae.content_studio.press_release.view')
  if (!auth.ok) return auth.error

  const { data: versions, error } = await supabaseAdmin
    .from('press_release_versions')
    .select('*')
    .eq('press_release_id', id)
    .order('version_number', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ...auth.data.pr, event_name: auth.data.eventName, versions: versions ?? [] })
}
