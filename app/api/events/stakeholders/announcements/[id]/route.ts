import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

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
