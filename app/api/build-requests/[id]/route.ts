import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { sendBuildRequestUpdate } from '@/app/lib/email'

const CRON_SECRET = 'trescon-weekly-insights-2026'
const BUCKET = 'build-request-files'
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventpilot.tresconglobal.com'

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as { sid: string; adm?: boolean } }
  catch { return null }
}

function isAdminKey(req: NextRequest) {
  const key = req.headers.get('x-setup-key')
  return key === process.env.CRON_SECRET || key === CRON_SECRET
}

/* GET /api/build-requests/[id] */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session  = getSession(req)
  const adminKey = isAdminKey(req)
  if (!session?.sid && !adminKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data: request, error } = await supabaseAdmin
    .from('build_requests').select('*').eq('id', id).single()
  if (error || !request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!adminKey && !session?.adm && request.submitted_by !== session?.sid)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [{ data: files }, { data: replies }, { data: submitter }] = await Promise.all([
    supabaseAdmin.from('build_request_files').select('*').eq('request_id', id),
    supabaseAdmin.from('build_request_replies').select('*').eq('request_id', id).order('created_at', { ascending: true }),
    supabaseAdmin.from('staff_members').select('id, name, email').eq('id', request.submitted_by).single(),
  ])

  const authorIds = [...new Set((replies ?? []).map(r => r.author_id))]
  const { data: authors } = await supabaseAdmin.from('staff_members').select('id, name').in('id', authorIds)
  const authorMap = Object.fromEntries((authors ?? []).map(a => [a.id, a.name]))

  const filesWithUrls = await Promise.all((files ?? []).map(async f => {
    const { data: signed } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(f.storage_path, 3600)
    return { ...f, signed_url: signed?.signedUrl ?? null }
  }))

  return NextResponse.json({
    request: {
      ...request,
      submitter: submitter ?? null,
      files: filesWithUrls,
      replies: (replies ?? []).map(r => ({ ...r, author_name: authorMap[r.author_id] ?? 'Unknown' })),
    },
  })
}

/* PATCH /api/build-requests/[id]
   Body: { status?, reply? }
   Accessible by admin session OR x-setup-key (Durga's CLI)
*/
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session  = getSession(req)
  const adminKey = isAdminKey(req)
  if (!session?.adm && !adminKey) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { id } = await params
  const { status, reply } = await req.json().catch(() => ({}))

  const VALID_STATUSES = ['submitted', 'in_review', 'needs_clarification', 'completed', 'deferred']
  if (status && !VALID_STATUSES.includes(status))
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

  const { data: existing } = await supabaseAdmin.from('build_requests').select('*').eq('id', id).single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Update request status
  if (status) {
    await supabaseAdmin.from('build_requests')
      .update({ status, updated_at: new Date().toISOString() }).eq('id', id)
  }

  // Add reply if provided
  const authorId = session?.sid ?? 'system'
  if (reply?.trim()) {
    await supabaseAdmin.from('build_request_replies').insert({
      request_id: id, author_id: authorId, is_admin_reply: true, message: reply.trim(),
    })
  }

  // Auto-delete files when completed or deferred
  if (status === 'completed' || status === 'deferred') {
    const { data: files } = await supabaseAdmin.from('build_request_files').select('storage_path').eq('request_id', id)
    if (files?.length) {
      await supabaseAdmin.storage.from(BUCKET).remove(files.map(f => f.storage_path))
      await supabaseAdmin.from('build_request_files').delete().eq('request_id', id)
    }
  }

  // Notify pilot if status changed to something actionable
  if (status && ['needs_clarification', 'completed', 'deferred'].includes(status)) {
    const { data: pilot } = await supabaseAdmin
      .from('staff_members').select('name, email').eq('id', existing.submitted_by).single()
    const { data: project } = await supabaseAdmin
      .from('pilot_projects').select('name').eq('id', existing.project_id).single()
    if (pilot) {
      try {
        await sendBuildRequestUpdate({
          to:          pilot.email,
          name:        pilot.name,
          projectName: project?.name ?? '',
          title:       existing.title,
          status,
          reply:       reply?.trim() ?? '',
          pilotsUrl:   `${SITE}/pilots`,
        })
      } catch { /* non-blocking */ }
    }
  }

  const { data: updated } = await supabaseAdmin.from('build_requests').select('*').eq('id', id).single()
  return NextResponse.json({ request: updated })
}
