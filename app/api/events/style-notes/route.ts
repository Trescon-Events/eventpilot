import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { supabaseAdmin } from '@/app/lib/supabase'
import { ownerColumn, ownerInsertColumns, ownerOfRow } from '@/app/lib/content/owner'
import { canManageRules, parseOwner } from '@/app/lib/content/rule-admin'
import { NOTE_COLS, logNoteChange, ownersFor, type StyleNote } from '@/app/lib/content/style-notes'

/* Style notes API (docs/build_suggestions/copy-library.md §7). Same permissions as rules. Notes are never deleted: switch off keeps the audit trail.
   GET   ?owner_type&owner_id           — notes at each level that applies, with what the caller may edit
   POST  { owner_type, owner_id, note, category?, origin }
   PATCH ?id=…  { note?, category?, origin?, is_active? } */

export async function GET(req: NextRequest) {
  if (!getSession(req)) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const owner = parseOwner(req.nextUrl.searchParams.get('owner_type'), req.nextUrl.searchParams.get('owner_id'))
  if (!owner) return NextResponse.json({ error: 'owner_type and owner_id required.' }, { status: 400 })
  const owners = await ownersFor(owner)
  const labels = { org: 'Trescon-wide', umbrella: 'Umbrella', event: 'This event' } as const
  const levels = await Promise.all(owners.map(async o => {
    const { column, value } = ownerColumn(o.ref)
    const { data } = await supabaseAdmin.from('style_notes').select(NOTE_COLS).eq(column, value).order('created_at')
    return { level: o.level, label: labels[o.level], owner_type: o.ref.kind, owner_id: o.ref.id, can_edit: (await canManageRules(req, o.ref)).ok, inherited: o.level !== owner.kind, notes: (data ?? []) as StyleNote[] }
  }))
  return NextResponse.json({ levels })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 })
  const owner = parseOwner(String(body.owner_type ?? ''), String(body.owner_id ?? ''))
  if (!owner) return NextResponse.json({ error: 'owner_type and owner_id required.' }, { status: 400 })
  const auth = await canManageRules(req, owner)
  if (!auth.ok) return NextResponse.json({ error: 'Not authorized to add style notes here.' }, { status: 403 })
  const note = typeof body.note === 'string' ? body.note.trim() : ''
  if (!note) return NextResponse.json({ error: 'The note cannot be empty.' }, { status: 400 })
  const origin = body.origin === 'client' ? 'client' : 'trescon'
  const category = typeof body.category === 'string' && body.category.trim() ? body.category.trim() : null
  const { data, error } = await supabaseAdmin.from('style_notes').insert({ ...ownerInsertColumns(owner), note, category, origin, is_active: true, created_by: /^[0-9a-f-]{36}$/i.test(auth.sid ?? '') ? auth.sid : null }).select(NOTE_COLS).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  try { await logNoteChange({ note_id: data.id, owner, action: 'create', before: null, after: data, by: auth.sid }) }
  catch (e) { await supabaseAdmin.from('style_notes').delete().eq('id', data.id); return NextResponse.json({ error: e instanceof Error ? e.message : 'Audit failed.' }, { status: 500 }) }
  return NextResponse.json({ note: data }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!id || !body) return NextResponse.json({ error: 'id and body required' }, { status: 400 })
  const { data: before } = await supabaseAdmin.from('style_notes').select(NOTE_COLS).eq('id', id).maybeSingle()
  if (!before) return NextResponse.json({ error: 'Style note not found.' }, { status: 404 })
  const owner = ownerOfRow(before)
  const auth = await canManageRules(req, owner)
  if (!auth.ok) return NextResponse.json({ error: 'Not authorized to change this style note.' }, { status: 403 })
  const patch: Record<string, unknown> = {}
  if (typeof body.note === 'string') { if (!body.note.trim()) return NextResponse.json({ error: 'The note cannot be empty.' }, { status: 400 }); patch.note = body.note.trim() }
  if (typeof body.category === 'string') patch.category = body.category.trim() || null
  if (body.origin === 'client' || body.origin === 'trescon') patch.origin = body.origin
  if (typeof body.is_active === 'boolean') patch.is_active = body.is_active
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  const { data: after, error } = await supabaseAdmin.from('style_notes').update(patch).eq('id', id).select(NOTE_COLS).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const onlyToggle = Object.keys(patch).length === 1 && 'is_active' in patch
  try { await logNoteChange({ note_id: id, owner, action: onlyToggle ? (patch.is_active ? 'enable' : 'disable') : 'update', before, after, by: auth.sid }) }
  catch (e) {
    await supabaseAdmin.from('style_notes').update(Object.fromEntries(Object.keys(patch).map(k => [k, (before as Record<string, unknown>)[k]]))).eq('id', id)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Audit failed.' }, { status: 500 })
  }
  return NextResponse.json({ note: after })
}
