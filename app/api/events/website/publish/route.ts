import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/*
  POST /api/events/website/publish
  Body: { id }
    → Snapshots page_structure_full → published_snapshot
    → Copies draft_structure → page_structure_full
    → Clears draft_structure
    → Sets status = 'live', last_published_at = now()

  Body: { id, action: 'rollback' }
    → Restores published_snapshot → page_structure_full
    → Clears published_snapshot

  Body: { id, action: 'unpublish' }
    → Sets status = 'draft' only — structures untouched
*/

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { id, action } = body ?? {}

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // ── Fetch current record ─────────────────────────────────────────────────────
  const { data: current, error: fetchErr } = await supabaseAdmin
    .from('event_websites')
    .select('status, page_structure_full, draft_structure, published_snapshot')
    .eq('id', id)
    .single()

  if (fetchErr || !current) {
    return NextResponse.json({ error: fetchErr?.message ?? 'Website not found' }, { status: 404 })
  }

  // ── Unpublish ────────────────────────────────────────────────────────────────
  if (action === 'unpublish') {
    const { data, error } = await supabaseAdmin
      .from('event_websites')
      .update({ status: 'draft' })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // ── Rollback ─────────────────────────────────────────────────────────────────
  if (action === 'rollback') {
    if (!current.published_snapshot) {
      return NextResponse.json({ error: 'No snapshot available to roll back to' }, { status: 400 })
    }
    const { data, error } = await supabaseAdmin
      .from('event_websites')
      .update({
        page_structure_full: current.published_snapshot,
        published_snapshot: null,
      })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // ── Publish ──────────────────────────────────────────────────────────────────
  // If draft_structure exists → it becomes the new live. Otherwise ps was saved
  // directly to page_structure_full (backwards compat), so we just set status=live.
  const newLive = current.draft_structure ?? current.page_structure_full

  const updatePayload: Record<string, unknown> = {
    status: 'live',
    last_published_at: new Date().toISOString(),
    // Snapshot old live for rollback
    published_snapshot: current.page_structure_full ?? null,
    // Move draft → live
    page_structure_full: newLive,
    // Clear draft
    draft_structure: null,
  }

  const { data, error } = await supabaseAdmin
    .from('event_websites')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
