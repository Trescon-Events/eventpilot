import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { licenseSignedUrl } from '@/app/lib/ops/license-storage'
import { logOpsAccess, clientIp } from '@/app/lib/ops/audit'

/* GET /api/events/operations/licenses/files/[fileId] — a short-lived (5 min)
   link to a licence copy, for ops. Requires ops.licenses.view on the file's
   event; the access is audited before the link is returned. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params
  const { data: f } = await supabaseAdmin.from('ops_license_files').select('id, event_id, storage_path, file_name, mime_type').eq('id', fileId).maybeSingle()
  if (!f) return NextResponse.json({ error: 'File not available.' }, { status: 404 })

  const session = getSession(req)
  if (!session?.adm && !(await hasEventPermission(session?.sid, f.event_id, 'ops.licenses.view'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }
  const audited = await logOpsAccess({ eventId: f.event_id, actorType: 'staff', actorId: session?.sid ?? null, action: 'license_file_viewed', targetType: 'license_file', targetId: f.id, ip: clientIp(req) })
  if (!audited) return NextResponse.json({ error: 'Could not record access. Please try again.' }, { status: 500 })

  const url = await licenseSignedUrl(f.storage_path)
  if (!url) return NextResponse.json({ error: 'Could not open the file.' }, { status: 500 })
  return NextResponse.json({ url, file_name: f.file_name, mime_type: f.mime_type }, { headers: { 'Cache-Control': 'no-store' } })
}
