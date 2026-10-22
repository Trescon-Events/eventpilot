import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { supabaseAdmin } from '@/app/lib/supabase'
import { CREDENTIALS } from '@/app/lib/registry/credentials'

/* GET  /api/admin/credentials — when each credential was last rotated.
   POST /api/admin/credentials { id, note? } — mark one as rotated now.
   Admin-only (same session.adm gate as every page under /admin/settings).
   Names, dates and notes only — secret values are never stored or returned. */

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from('credential_rotations')
    .select('credential_id, last_rotated_at, rotated_by, note')
  // Table not created yet (migration pending) → show the list without history rather than failing.
  if (error) return NextResponse.json({ rotations: {}, historyAvailable: false })

  const rotations: Record<string, { at: string; by: string | null; note: string | null }> = {}
  for (const r of data ?? []) rotations[r.credential_id] = { at: r.last_rotated_at, by: r.rotated_by, note: r.note }
  return NextResponse.json({ rotations, historyAvailable: true })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const body = await req.json().catch(() => null) as { id?: string; note?: string } | null
  if (!body?.id || !CREDENTIALS.some(c => c.id === body.id)) {
    return NextResponse.json({ error: 'Unknown credential.' }, { status: 400 })
  }

  let by: string | null = null
  if (session.sid && session.sid !== 'super-admin') {
    const { data: staff } = await supabaseAdmin.from('staff_members').select('name').eq('id', session.sid).maybeSingle()
    by = staff?.name ?? null
  } else {
    by = 'Super admin'
  }

  const { error } = await supabaseAdmin.from('credential_rotations').upsert({
    credential_id: body.id,
    last_rotated_at: new Date().toISOString(),
    rotated_by: by,
    note: body.note?.trim().slice(0, 300) || null,
  })
  if (error) return NextResponse.json({ error: 'Could not save — has the credential_rotations migration been run?' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
