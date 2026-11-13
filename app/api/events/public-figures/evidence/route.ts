import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { canManageRules } from '@/app/lib/content/rule-admin'
import { supabaseAdmin } from '@/app/lib/supabase'
import { putObject, presignGet, deleteObject } from '@/app/lib/docuhub/storage'
import { FigureError, eventOfFigure, setEvidence } from '@/app/lib/content/public-figures'

/* Evidence files for public figures (docs/build_suggestions/public-figures.md, Step 0 outcome). They go to the PRIVATE DocuHub R2 bucket at
   public-figures/<event_id>/<figure_id>/<filename>. Only the path is stored; downloads are short-lived signed links for people with access to the event.
   Never the public SAE bucket. These files are not listed in DocuHub.
   POST (multipart: figure_id, file)   attach     GET ?figure_id=…   signed link     DELETE ?figure_id=…   remove */

export const maxDuration = 60
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BYTES = 20 * 1024 * 1024
const TYPES: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', csv: 'text/csv', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', txt: 'text/plain' }
const safeName = (n: string) => n.replace(/[^A-Za-z0-9._ -]/g, '_').replace(/\s+/g, '_').replace(/^\.+/, '').slice(-120) || 'file'

async function figureEvent(id: string | null) { if (!id || !UUID.test(id)) throw new FigureError('figure_id required.', 400); return eventOfFigure(id) }

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  try {
    const form = await req.formData()
    const figureId = String(form.get('figure_id') ?? '')
    const file = form.get('file')
    const eventId = await figureEvent(figureId)
    if (!(await canManageRules(req, { kind: 'event', id: eventId })).ok) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a file.' }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'The file is larger than 20 MB.' }, { status: 413 })
    const ext = (file.name.split('.').pop() ?? '').toLowerCase()
    if (!TYPES[ext]) return NextResponse.json({ error: 'Upload a PDF, image, spreadsheet (xlsx or csv), Word file or text file.' }, { status: 415 })
    const { data: old } = await supabaseAdmin.from('event_public_figures').select('evidence_file_path').eq('id', figureId).maybeSingle()
    const name = safeName(file.name)
    const key = `public-figures/${eventId}/${figureId}/${name}`
    await putObject(key, Buffer.from(await file.arrayBuffer()), TYPES[ext])
    await setEvidence(figureId, key, file.name.slice(0, 200), session.sid ?? null)
    if (old?.evidence_file_path && old.evidence_file_path !== key) await deleteObject(old.evidence_file_path as string)
    return NextResponse.json({ ok: true, name: file.name })
  } catch (e) {
    if (e instanceof FigureError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Upload failed.' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  try {
    const figureId = req.nextUrl.searchParams.get('figure_id')
    const eventId = await figureEvent(figureId)
    const ok = session.adm || (await hasEventPermission(session.sid, eventId, 'sae.stakeholders.view')) || (await canManageRules(req, { kind: 'event', id: eventId })).ok
    if (!ok) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
    const { data } = await supabaseAdmin.from('event_public_figures').select('evidence_file_path, evidence_file_name').eq('id', figureId!).maybeSingle()
    if (!data?.evidence_file_path) return NextResponse.json({ error: 'No evidence file on this item.' }, { status: 404 })
    return NextResponse.json({ url: await presignGet(data.evidence_file_path as string), name: data.evidence_file_name }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    if (e instanceof FigureError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  try {
    const figureId = req.nextUrl.searchParams.get('figure_id')
    const eventId = await figureEvent(figureId)
    if (!(await canManageRules(req, { kind: 'event', id: eventId })).ok) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
    const { data } = await supabaseAdmin.from('event_public_figures').select('evidence_file_path').eq('id', figureId!).maybeSingle()
    if (data?.evidence_file_path) await deleteObject(data.evidence_file_path as string)
    await setEvidence(figureId!, null, null, session.sid ?? null)
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof FigureError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed.' }, { status: 500 })
  }
}
