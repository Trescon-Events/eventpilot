import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { fullBioCheck } from '@/app/lib/content/bio-integrity'

/* POST /api/events/stakeholders/speakers/[id]/check-bio
   Body (optional): { bio } — check the text currently in the field; defaults to the saved bio.

   Short Bio integrity check (2026-09-26, per Madhu) — REPORT-ONLY: truncation, gaps, garbled text,
   and signs of someone else's bio (see app/lib/content/bio-integrity.ts). Deliberately NOT the event's
   content rules: a speaker's bio is their own words. Never writes anything, never blocks a save.
   Any signed-in staff member may call it (same as loading the record itself). */

const SHORT_BIO_MAX_CHARS = 500

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!getSession(req)) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const body = await req.json().catch(() => ({})) as { bio?: string }
  const { data: s } = await supabaseAdmin.from('event_speakers').select('name, public_name, role, company, country, bio, custom_fields, salutation').eq('id', id).single()
  if (!s) return NextResponse.json({ error: 'Speaker not found' }, { status: 404 })
  const salutation = s.salutation || ((s.custom_fields ?? {}) as Record<string, unknown>).salutation
  const text = typeof body.bio === 'string' ? body.bio : (s.bio ?? '')
  const findings = await fullBioCheck(text, { ...s, salutation: typeof salutation === 'string' ? salutation : null }, SHORT_BIO_MAX_CHARS)
  return NextResponse.json({ findings })
}
