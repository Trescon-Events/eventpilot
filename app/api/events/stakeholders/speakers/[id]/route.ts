import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* PATCH  /api/events/stakeholders/speakers/[id] — update any SAE-owned field
   DELETE /api/events/stakeholders/speakers/[id] — soft delete (Hub "Delete")

   Same field-name mapping as ../route.ts (full_name/job_title/company_name
   -> name/role/company). Never writes `status`, `tier`, or `active` — those
   belong to the Website Builder / KonfHub flow — EXCEPT via the two narrow,
   explicit opt-in flags below (also_remove_from_website on DELETE,
   also_restore_to_website on PATCH), which exist so the Hub's Delete/
   Restore confirmation UI can cross that boundary on deliberate user
   request (2026-07-28, Madhu: "let it give an option to user where they
   select 'Also remove from website'... keep a copy in a deleted speakers
   tab to easily restore it back"). Every other caller of these routes
   never sends these flags, so the original "never touch active" contract
   holds for them unchanged. Soft delete itself sets announcement_status to
   a terminal state rather than touching `status` (which would silently
   affect the public site / KonfHub row on its own). */

type SpeakerPatchBody = {
  full_name?: string
  job_title?: string
  company_name?: string
  country?: string
  bio?: string
  linkedin_url?: string
  announcement_status?: string
  notes?: string
  reviewed_by?: string
  also_restore_to_website?: boolean
}

function toRow(body: SpeakerPatchBody) {
  const row: Record<string, unknown> = {}
  if (body.full_name !== undefined) row.name = body.full_name
  if (body.job_title !== undefined) row.role = body.job_title
  if (body.company_name !== undefined) row.company = body.company_name
  if (body.country !== undefined) row.country = body.country || null
  if (body.bio !== undefined) row.bio = body.bio || null
  if (body.linkedin_url !== undefined) row.linkedin_url = body.linkedin_url || null
  if (body.announcement_status !== undefined) row.announcement_status = body.announcement_status
  if (body.notes !== undefined) row.notes = body.notes || null
  if (body.reviewed_by !== undefined) { row.reviewed_by = body.reviewed_by || null; row.reviewed_at = new Date().toISOString() }
  if (body.also_restore_to_website) row.active = true
  return row
}

function fromRow(row: Record<string, unknown>) {
  return { ...row, full_name: row.name, job_title: row.role, company_name: row.company }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null) as SpeakerPatchBody | null
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const row = toRow(body)
  if (Object.keys(row).length === 0) return NextResponse.json({ error: 'no valid fields' }, { status: 400 })
  row.updated_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('event_speakers')
    .update(row)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(fromRow(data))
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({})) as { also_remove_from_website?: boolean }

  // Soft delete only ever touches announcement_status — never `status`
  // (public-site moderation state). `active` (public-site visibility) is
  // only touched when also_remove_from_website is explicitly true.
  const row: Record<string, unknown> = { announcement_status: 'archived', updated_at: new Date().toISOString() }
  if (body.also_remove_from_website) row.active = false

  const { error } = await supabaseAdmin
    .from('event_speakers')
    .update(row)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
