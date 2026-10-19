import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { knownStaffId, requireBadgePermission } from '@/app/lib/badges/service'

/* POST { event_id, rows: [{ name, job_title?, company?, country? }] } — bulk add from an uploaded sheet (the page parses the file and maps columns).
   A row matching an existing VIP on name + company (case-insensitive) updates that VIP instead of adding a duplicate, so re-uploading a
   corrected client list is safe. Rows without a name are skipped. */

const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '') || null
const key = (name: string, company: string | null) => `${name.toLowerCase().replace(/\s+/g, ' ')}|${(company ?? '').toLowerCase().replace(/\s+/g, ' ')}`

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; rows?: Array<Record<string, unknown>> } | null
  if (!body?.event_id || !Array.isArray(body.rows)) return NextResponse.json({ error: 'event_id and rows are required.' }, { status: 400 })
  if (body.rows.length > 2000) return NextResponse.json({ error: 'Upload at most 2000 rows at a time.' }, { status: 400 })
  const auth = await requireBadgePermission(req, body.event_id, 'sae.badges.manage')
  if ('error' in auth) return auth.error

  const { data: existing, error: exErr } = await supabaseAdmin.from('event_vips').select('id, name, company').eq('event_id', body.event_id)
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 })
  const byKey = new Map((existing ?? []).map(v => [key(v.name as string, v.company as string | null), v.id as string]))
  const createdBy = await knownStaffId(auth.session.sid)

  let skippedNoName = 0
  const inserts: Array<Record<string, unknown>> = []
  const updates: Array<{ id: string; fields: Record<string, unknown> }> = []
  const seen = new Set<string>()
  for (const r of body.rows) {
    const name = clean(r.name)
    if (!name) { skippedNoName++; continue }
    const fields = { name, job_title: clean(r.job_title), company: clean(r.company), country: clean(r.country) }
    const k = key(name, fields.company)
    if (seen.has(k)) continue // the same person twice in one sheet: first row wins
    seen.add(k)
    const id = byKey.get(k)
    if (id) updates.push({ id, fields: { ...fields, updated_at: new Date().toISOString() } })
    else inserts.push({ ...fields, event_id: body.event_id, created_by: createdBy })
  }

  if (inserts.length) {
    const { error } = await supabaseAdmin.from('event_vips').insert(inserts)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  for (const u of updates) {
    const { error } = await supabaseAdmin.from('event_vips').update(u.fields).eq('id', u.id).eq('event_id', body.event_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ imported: inserts.length, updated: updates.length, skipped_no_name: skippedNoName })
}
