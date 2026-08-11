import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'
import { extractGoogleFolderId, validateGoogleFolder } from '@/app/lib/gdrive/resolve-folder-link'
import { resolveOneDriveFolder } from '@/app/lib/onedrive/resolve-share-link'
import { getGoogleAccessToken } from '@/app/lib/security/google-drive-auth'
import { getMicrosoftDelegatedToken } from '@/app/lib/security/graph-delegated'

/* GET/PUT /api/events/stakeholders/secure-folder?event_id=X

   Per-event destination for secure documents (passport/national ID)
   collected via a HubSpot form. The SAVING producer's own delegated
   OAuth connection is what authorizes writes into this folder going
   forward (configured_by) — never a shared app-level credential, per
   the explicit product requirement. Gated sae.secure_documents.manage. */

async function canManage(sid: string | undefined, eventId: string, adm: boolean | undefined) {
  if (adm) return true
  return hasEventPermission(sid, eventId, 'sae.secure_documents.manage')
}

function detectProvider(url: string): 'google' | 'microsoft' | null {
  if (url.includes('drive.google.com')) return 'google'
  if (url.includes('sharepoint.com') || url.includes('1drv.ms') || url.includes('onedrive.live.com')) return 'microsoft'
  return null
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const session = getSession(req)
  if (!(await canManage(session?.sid, eventId, session?.adm))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data } = await supabaseAdmin
    .from('event_secure_folders')
    .select('provider, folder_url, configured_by, configured_at')
    .eq('event_id', eventId)
    .maybeSingle()

  return NextResponse.json(data ?? { configured: false })
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null) as { event_id?: string; folder_url?: string } | null
  if (!body?.event_id || !body?.folder_url) return NextResponse.json({ error: 'event_id and folder_url required' }, { status: 400 })

  const session = getSession(req)
  if (!session?.sid) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  if (!(await canManage(session.sid, body.event_id, session.adm))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const provider = detectProvider(body.folder_url)
  if (!provider) return NextResponse.json({ error: "That doesn't look like a Google Drive or Microsoft OneDrive/SharePoint link." }, { status: 400 })

  if (provider === 'google') {
    const token = await getGoogleAccessToken(session.sid)
    if (!token) return NextResponse.json({ error: 'Connect your Google account first (Connected Accounts, in your profile menu).' }, { status: 400 })
    const folderId = extractGoogleFolderId(body.folder_url)
    if (!folderId) return NextResponse.json({ error: 'Could not find a folder ID in that link.' }, { status: 400 })
    const check = await validateGoogleFolder(folderId, token)
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('event_secure_folders')
      .upsert(
        { event_id: body.event_id, provider: 'google', folder_url: body.folder_url, folder_id: folderId, drive_id: null, configured_by: session.sid, updated_at: new Date().toISOString() },
        { onConflict: 'event_id' }
      )
      .select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  const token = await getMicrosoftDelegatedToken(session.sid)
  if (!token) return NextResponse.json({ error: 'Connect your Microsoft account first (Connected Accounts, in your profile menu).' }, { status: 400 })
  const resolved = await resolveOneDriveFolder(body.folder_url, token)
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('event_secure_folders')
    .upsert(
      { event_id: body.event_id, provider: 'microsoft', folder_url: body.folder_url, folder_id: resolved.folderId, drive_id: resolved.driveId, configured_by: session.sid, updated_at: new Date().toISOString() },
      { onConflict: 'event_id' }
    )
    .select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
