import { NextRequest, NextResponse } from 'next/server'
import { draftPilotChecklist } from '@/app/lib/pilot-checklist-draft'

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as { sid: string; adm?: boolean } }
  catch { return null }
}

/* POST /api/admin/pilots/draft-checklist
   Admin-only. Drafts a checklist per member with Gemini for the "New Pilot Project"
   form's "AI-draft checklist" button. Returns a draft — the admin edits before saving.
*/
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body?.projectName?.trim()) return NextResponse.json({ error: 'projectName is required' }, { status: 400 })
  if (!Array.isArray(body.members) || !body.members.length) return NextResponse.json({ error: 'members is required' }, { status: 400 })

  try {
    const checklist = await draftPilotChecklist({
      projectName:        body.projectName,
      projectDescription: body.projectDescription ?? '',
      members:             body.members,
    })
    return NextResponse.json({ checklist })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Draft failed' }, { status: 500 })
  }
}
