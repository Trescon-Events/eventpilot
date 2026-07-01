/*
  GET /api/leaderboard

  Returns leaderboard data for the current session's dashboard view.
  Serves both the /leaderboard page and (later) the dashboard widget.

  Response:
    {
      week_start:  string            // Monday ISO date of the week rendered
      week_end:    string            // Sunday ISO date
      top10:       Array<{ rank, name, department, office_id, score,
                          completions_count, delta }>
      me: {                          // present when the caller is eligible
        rank, score, completions_count, delta,
        trend: Array<{ week_start, rank, score }>   // up to last 4 weeks
      } | null
      is_admin:    boolean           // client renders differently for admins
    }
*/

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getISTWeekBounds } from '@/app/lib/leaderboard'

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as { sid: string; adm?: boolean; roles?: string[] } } catch { return null }
}

function subtractWeek(weekStartIST: string): string {
  const d = new Date(weekStartIST + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 7)
  return d.toISOString().slice(0, 10)
}

function endOfWeek(weekStartIST: string): string {
  const d = new Date(weekStartIST + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 6)
  return d.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.sid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const weekArg = url.searchParams.get('week') // optional YYYY-MM-DD override

  // Default to the most recent completed week (last Mon–Sun)
  const { weekStartIST } = weekArg
    ? { weekStartIST: weekArg }
    : getISTWeekBounds(new Date(), true)

  const priorWeek = subtractWeek(weekStartIST)
  const weekEnd = endOfWeek(weekStartIST)

  // Pull snapshot for target + prior week (for deltas)
  const [{ data: cur }, { data: prev }] = await Promise.all([
    supabaseAdmin.from('weekly_leaderboard_snapshots')
      .select('staff_id, rank, score, completions_count, attempts_count')
      .eq('week_start', weekStartIST)
      .order('rank', { ascending: true }),
    supabaseAdmin.from('weekly_leaderboard_snapshots')
      .select('staff_id, rank')
      .eq('week_start', priorWeek),
  ])

  const priorRankByStaff = new Map<string, number>((prev ?? []).map(r => [r.staff_id, r.rank]))

  // Fetch staff names for the top 10 and for `me`
  const top10Ids = (cur ?? []).slice(0, 10).map(r => r.staff_id)
  const meNeeded = !session.adm ? [session.sid] : []
  const staffIds = Array.from(new Set([...top10Ids, ...meNeeded]))

  const { data: staff } = staffIds.length
    ? await supabaseAdmin.from('staff_members').select('id, name, department, office_id').in('id', staffIds)
    : { data: [] as { id: string; name: string; department: string | null; office_id: string | null }[] }

  const staffMap = new Map((staff ?? []).map(s => [s.id, s]))

  const top10 = (cur ?? []).slice(0, 10).map(r => {
    const s = staffMap.get(r.staff_id)
    const priorRank = priorRankByStaff.get(r.staff_id) ?? null
    return {
      rank:              r.rank,
      staff_id:          r.staff_id,
      name:              s?.name ?? '—',
      department:        s?.department ?? null,
      office_id:         s?.office_id ?? null,
      score:             r.score,
      completions_count: r.completions_count,
      delta:             priorRank == null ? null : priorRank - r.rank,
    }
  })

  // My rank + trend
  let me: unknown = null
  if (!session.adm) {
    const myRow = (cur ?? []).find(r => r.staff_id === session.sid)
    const priorRank = priorRankByStaff.get(session.sid) ?? null

    const { data: trend } = await supabaseAdmin
      .from('weekly_leaderboard_snapshots')
      .select('week_start, rank, score')
      .eq('staff_id', session.sid)
      .lte('week_start', weekStartIST)
      .order('week_start', { ascending: false })
      .limit(4)

    if (myRow) {
      me = {
        rank:              myRow.rank,
        score:             myRow.score,
        completions_count: myRow.completions_count,
        delta:             priorRank == null ? null : priorRank - myRow.rank,
        trend:             (trend ?? []).reverse(),
      }
    } else {
      me = {
        rank:              null,
        score:             0,
        completions_count: 0,
        delta:             null,
        trend:             (trend ?? []).reverse(),
      }
    }
  }

  return NextResponse.json({
    week_start: weekStartIST,
    week_end:   weekEnd,
    top10,
    me,
    is_admin:   !!session.adm,
    total_ranked: (cur ?? []).length,
  })
}
