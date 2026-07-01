import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { sendBuildRequestAlert } from '@/app/lib/email'

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_FILES = 3
const CRON_SECRET = 'trescon-weekly-insights-2026'
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventpilot.tresconglobal.com'
const BUCKET = 'build-request-files'

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

async function signedUrl(path: string) {
  const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

/* GET /api/build-requests?project_id=&status= */
export async function GET(req: NextRequest) {
  const session = getSession(req)
  const adminKey = isAdminKey(req)
  if (!session?.sid && !adminKey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const projectId = searchParams.get('project_id')
  const status    = searchParams.get('status')

  let query = supabaseAdmin
    .from('build_requests')
    .select('id, project_id, submitted_by, title, message, status, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (projectId) query = query.eq('project_id', projectId)
  if (status)    query = query.eq('status', status)
  if (!adminKey && !session?.adm) query = query.eq('submitted_by', session!.sid)

  const { data: rows, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const requestIds = (rows ?? []).map(r => r.id)

  const [{ data: files }, { data: replies }, { data: submitters }] = await Promise.all([
    supabaseAdmin.from('build_request_files').select('*').in('request_id', requestIds),
    supabaseAdmin.from('build_request_replies').select('*').in('request_id', requestIds).order('created_at', { ascending: true }),
    supabaseAdmin.from('staff_members').select('id, name, email')
      .in('id', (rows ?? []).map(r => r.submitted_by)),
  ])

  const authorIds = [...new Set((replies ?? []).map(r => r.author_id))]
  const { data: authors } = await supabaseAdmin.from('staff_members').select('id, name').in('id', authorIds)

  const submitterMap = Object.fromEntries((submitters ?? []).map(s => [s.id, s]))
  const authorMap    = Object.fromEntries((authors ?? []).map(a => [a.id, a.name]))

  const requests = await Promise.all((rows ?? []).map(async r => {
    const rFiles = (files ?? []).filter(f => f.request_id === r.id)
    const filesWithUrls = await Promise.all(rFiles.map(async f => ({
      ...f, signed_url: await signedUrl(f.storage_path),
    })))
    const rReplies = (replies ?? []).filter(rp => rp.request_id === r.id).map(rp => ({
      ...rp, author_name: authorMap[rp.author_id] ?? 'Unknown',
    }))
    return {
      ...r,
      submitter: submitterMap[r.submitted_by] ?? null,
      files: filesWithUrls,
      replies: rReplies,
    }
  }))

  return NextResponse.json({ requests })
}

/* POST /api/build-requests (multipart/form-data) */
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session?.sid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData  = await req.formData()
  const title     = (formData.get('title')      as string)?.trim()
  const message   = (formData.get('message')    as string)?.trim()
  const projectId = (formData.get('project_id') as string)?.trim()
  const files     = formData.getAll('files') as File[]

  if (!title || !message || !projectId)
    return NextResponse.json({ error: 'title, message and project_id are required' }, { status: 400 })

  const badFile = files.find(f => !ALLOWED_TYPES.includes(f.type) || f.size > MAX_FILE_SIZE)
  if (badFile)
    return NextResponse.json({ error: 'Files must be PDF, PNG or JPG and under 10 MB each' }, { status: 400 })
  if (files.length > MAX_FILES)
    return NextResponse.json({ error: `Maximum ${MAX_FILES} files per request` }, { status: 400 })

  const { data: membership } = await supabaseAdmin
    .from('pilot_project_members').select('id')
    .eq('project_id', projectId).eq('staff_id', session.sid).single()
  if (!membership && !session.adm)
    return NextResponse.json({ error: 'Not a member of this project' }, { status: 403 })

  const { data: request, error: reqErr } = await supabaseAdmin
    .from('build_requests')
    .insert({ project_id: projectId, submitted_by: session.sid, title, message })
    .select().single()
  if (reqErr || !request)
    return NextResponse.json({ error: reqErr?.message ?? 'Failed to create request' }, { status: 500 })

  // Ensure bucket exists
  await supabaseAdmin.storage.createBucket(BUCKET, {
    public: false, fileSizeLimit: MAX_FILE_SIZE, allowedMimeTypes: ALLOWED_TYPES,
  }).catch(() => { /* already exists */ })

  // Upload files
  const fileRecords: object[] = []
  for (const file of files) {
    const safeName = file.name.replace(/[^a-z0-9._-]/gi, '_')
    const storagePath = `${request.id}/${Date.now()}-${safeName}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET).upload(storagePath, buffer, { contentType: file.type })
    if (!upErr) {
      fileRecords.push({
        request_id: request.id, file_name: file.name,
        storage_path: storagePath, file_type: file.type, file_size_bytes: file.size,
      })
    }
  }
  if (fileRecords.length)
    await supabaseAdmin.from('build_request_files').insert(fileRecords)

  // Notify Durga
  const [{ data: staff }, { data: project }] = await Promise.all([
    supabaseAdmin.from('staff_members').select('name, email').eq('id', session.sid).single(),
    supabaseAdmin.from('pilot_projects').select('name').eq('id', projectId).single(),
  ])
  try {
    await sendBuildRequestAlert({
      submitterName:  staff?.name  ?? 'A pilot',
      submitterEmail: staff?.email ?? '',
      projectName:    project?.name ?? '',
      title, message,
      fileCount: files.length,
      requestUrl: `${SITE}/admin/pilots`,
    })
  } catch { /* non-blocking */ }

  return NextResponse.json({ request }, { status: 201 })
}
