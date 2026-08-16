import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* PATCH /api/events/stakeholders/announcements/[id]
   Body: { post_copy: string }
   Saves a hand-edited post copy (2026-08-15, per Madhu — the Post Copy
   panel became a real WYSIWYG editor with a Save action, not just a
   read-only preview + Regenerate). post_copy stays plain text with '\n\n'
   paragraph breaks (not HTML) — the same format the AI generation path
   already writes and the same format send-for-approval/publish-now/
   schedule already read as pre-wrapped plain text; the editor itself
   handles HTML<->plain-text conversion on load/save so none of those three
   downstream consumers need to change. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null) as { post_copy?: string } | null
  if (!body || typeof body.post_copy !== 'string' || !body.post_copy.trim()) {
    return NextResponse.json({ error: 'post_copy (non-empty string) required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('stakeholder_announcements')
    .update({ post_copy: body.post_copy, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, post_copy')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

/* DELETE /api/events/stakeholders/announcements/[id]
   Hard delete (2026-08-02, SAE creative management) — stakeholder_announcements
   rows are disposable generated artifacts (a composited creative PNG + AI
   post copy), not core business records like a speaker/partner, so unlike
   event_speakers/event_sponsors' soft-delete ('archived' + restore) there is
   no restore path here — the UI's typed-DELETE confirmation is the only
   safety net. announcement_approvals rows cascade automatically
   (ON DELETE CASCADE, supabase/sae_migration.sql) — no explicit child
   cleanup needed. The Storage object at creative_url is intentionally left
   in place, matching regenerate-creative/route.ts's existing behavior of
   never deleting a superseded creative_url's file. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await supabaseAdmin.from('stakeholder_announcements').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
