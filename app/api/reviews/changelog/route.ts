import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) } catch { return null }
}

/* GET /api/reviews/changelog
   Returns all resolved reviews with their admin responses.
   Accessible to any authenticated staff member (public fix log).
   Admins also see wont_fix entries.
*/
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.sid) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const statuses = session.adm ? ['resolved', 'wont_fix'] : ['resolved']

  const { data: reviews, error } = await supabaseAdmin
    .from('platform_reviews')
    .select('id, tool, review_type, severity, title, description, status, resolved_at, resolved_by_name, created_at, staff_name')
    .in('status', statuses)
    .order('resolved_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!reviews?.length) return NextResponse.json([])

  // Fetch admin responses for each resolved review
  const ids = reviews.map(r => r.id)
  const { data: comments } = await supabaseAdmin
    .from('review_comments')
    .select('review_id, author_type, author_name, message, created_at')
    .in('review_id', ids)
    .eq('is_status_change', false)
    .eq('author_type', 'admin')
    .order('created_at', { ascending: false })

  // Map: last admin response per review
  const lastResponse: Record<string, { message: string; author_name: string; created_at: string }> = {}
  for (const c of (comments ?? [])) {
    if (!lastResponse[c.review_id] && c.message) {
      lastResponse[c.review_id] = { message: c.message, author_name: c.author_name, created_at: c.created_at }
    }
  }

  const result = reviews.map(r => ({
    ...r,
    fix_response: lastResponse[r.id] ?? null,
  }))

  return NextResponse.json(result)
}
