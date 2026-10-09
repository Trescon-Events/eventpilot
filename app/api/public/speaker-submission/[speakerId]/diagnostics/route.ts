import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* POST /api/public/speaker-submission/[speakerId]/diagnostics?token=X&mode=ping|report
   Public (middleware exempts /api/public), same single-use-link trust boundary as submit. Used only after a failed
   upload on the speaker form:
   - mode=ping: swallows a small multipart body and answers { ok: true } — lets the browser tell "uploads to us are
     blocked outright" from "only these big files fail".
   - mode=report: the browser's own account of the failure, appended (capped) to the request's upload_issues so the
     producer sees it in the Communications tab. Nothing from the files themselves is stored. */
const MAX_ISSUES = 20
const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : null)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export async function POST(req: NextRequest, { params }: { params: Promise<{ speakerId: string }> }) {
  const { speakerId } = await params
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })
  const { data: request } = await supabaseAdmin.from('speaker_communication_requests').select('id, upload_issues').eq('speaker_id', speakerId).eq('token', token).maybeSingle()
  if (!request) return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 })

  const mode = req.nextUrl.searchParams.get('mode')
  if (mode === 'ping') {
    const len = Number(req.headers.get('content-length') ?? 0)
    if (len > 512 * 1024) return NextResponse.json({ error: 'too large' }, { status: 413 })
    await req.arrayBuffer().catch(() => null)
    return NextResponse.json({ ok: true })
  }
  if (mode !== 'report') return NextResponse.json({ error: 'mode required' }, { status: 400 })

  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!b) return NextResponse.json({ error: 'JSON body required' }, { status: 400 })
  const issue = {
    at: new Date().toISOString(),
    kind: str(b.kind, 20), status: num(b.status), content_type: str(b.content_type, 80),
    total_bytes: num(b.total_bytes), ping_ok: typeof b.ping_ok === 'boolean' ? b.ping_ok : null,
    user_agent: str(req.headers.get('user-agent'), 200),
  }
  const prior = Array.isArray(request.upload_issues) ? request.upload_issues : []
  await supabaseAdmin.from('speaker_communication_requests').update({ upload_issues: [...prior, issue].slice(-MAX_ISSUES) }).eq('id', request.id)
  return NextResponse.json({ ok: true })
}
