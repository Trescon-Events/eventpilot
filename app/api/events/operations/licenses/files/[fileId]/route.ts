import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { downloadLicenseFile } from '@/app/lib/ops/license-storage'
import { scopeOfRow, hasScopePermission, auditOwner } from '@/app/lib/ops/scope'
import { logOpsAccess, clientIp } from '@/app/lib/ops/audit'

/* GET /api/events/operations/licenses/files/[fileId] — a licence copy, streamed to ops.
   Requires ops.licenses.view on the file's scope; the access is audited before any byte is
   returned. There is no storage link: the file is read server-side (Azure or Supabase, see
   license-storage.ts) and sent inline, so nothing can be shared or replayed. */
export const runtime = 'nodejs'

export async function GET(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params
  const { data: f } = await supabaseAdmin.from('ops_license_files').select('id, event_id, umbrella_id, storage_path, file_name, mime_type').eq('id', fileId).maybeSingle()
  if (!f) return NextResponse.json({ error: 'File not available.' }, { status: 404 })

  const scope = await scopeOfRow(f)
  const session = getSession(req)
  if (!scope || !(await hasScopePermission(session, scope, 'ops.licenses.view'))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }
  const audited = await logOpsAccess({ ...auditOwner(scope), actorType: 'staff', actorId: session?.sid ?? null, action: 'license_file_viewed', targetType: 'license_file', targetId: f.id, ip: clientIp(req) })
  if (!audited) return NextResponse.json({ error: 'Could not record access. Please try again.' }, { status: 500 })

  const bytes = await downloadLicenseFile(f.storage_path)
  if (!bytes) return NextResponse.json({ error: 'Could not open the file.' }, { status: 404 })
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': f.mime_type,
      'Content-Disposition': `inline; filename="${f.file_name.replace(/[^\w .()-]/g, '_')}"`,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    },
  })
}
