import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) } catch { return null }
}

// ── PATCH /api/reviews/[id] — admin updates status or notes ─────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { status, admin_notes } = await req.json()

  const validStatuses = ['new', 'acknowledged', 'in_progress', 'resolved', 'wont_fix']
  if (status && !validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
  }

  // Resolve admin name for resolved_by_name
  let adminName = 'Admin'
  if (session.sid && session.sid !== 'super-admin') {
    const { data: staff } = await supabaseAdmin
      .from('staff_members')
      .select('name')
      .eq('id', session.sid)
      .maybeSingle()
    if (staff?.name) adminName = staff.name
  }

  const patch: Record<string, unknown> = {}
  if (status)                          patch.status       = status
  if (admin_notes !== undefined)       patch.admin_notes  = admin_notes
  if (status === 'resolved') {
    patch.resolved_at       = new Date().toISOString()
    patch.resolved_by_name  = adminName
  }

  const { error } = await supabaseAdmin
    .from('platform_reviews')
    .update(patch)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
