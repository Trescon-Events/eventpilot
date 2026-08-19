/**
 * Task Manager Timesheets API
 * GET  — list all time logs (joined task + staff), across everyone — this
 *        is the module's own "who logged what, when" feed, not filtered to
 *        the current user (filtering happens client-side, same as tasks).
 * POST — manual/retroactive time entry: computes duration from start/end,
 *        bumps the task's tracked_seconds, and flags manual_entry=true so
 *        the feed can distinguish it from a live-timer session.
 *
 *        start_time/end_time in the request body are full ISO instants,
 *        NOT plain "HH:MM" strings — the client converts the staff
 *        member's typed local date+time into a real UTC instant using
 *        their own browser's timezone (see TimeLogModal.tsx) before
 *        sending it. Staff span multiple offices/timezones (Dubai,
 *        Bangalore, ...), so there's no single "business timezone" the
 *        server could assume; doing the conversion in the browser is what
 *        makes this correct for whichever office someone is in, and keeps
 *        these entries true, directly-comparable UTC instants alongside
 *        live-timer sessions (which are already real `now()` instants) —
 *        no separate timezone handling needed for either kind, on write
 *        or on display.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as { sid: string; adm?: boolean } }
  catch { return null }
}

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('task_manager_time_logs')
    .select(`
      *,
      task:task_id ( id, description ),
      staff:staff_id ( id, name )
    `)
    .order('start_time', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ logs: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.task_id) return NextResponse.json({ error: 'task_id is required' }, { status: 400 })
  if (!body?.log_date || !body?.start_time || !body?.end_time) {
    return NextResponse.json({ error: 'log_date, start_time, and end_time are required' }, { status: 400 })
  }

  const startMs = new Date(body.start_time).getTime()
  const endMs = new Date(body.end_time).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return NextResponse.json({ error: 'start_time and end_time must be valid ISO timestamps' }, { status: 400 })
  }
  const durationSeconds = Math.round((endMs - startMs) / 1000)
  if (durationSeconds <= 0) return NextResponse.json({ error: 'End time must be after start time.' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('task_manager_time_logs')
    .insert({
      task_id: body.task_id,
      staff_id: session.sid,
      category: body.category || null,
      description: body.description?.trim() || null,
      log_date: body.log_date,
      start_time: body.start_time,
      end_time: body.end_time,
      duration_seconds: durationSeconds,
      manual_entry: true,
    })
    .select(`
      *,
      task:task_id ( id, description ),
      staff:staff_id ( id, name )
    `)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: task } = await supabaseAdmin.from('task_manager_tasks').select('tracked_seconds').eq('id', body.task_id).single()
  await supabaseAdmin
    .from('task_manager_tasks')
    .update({ tracked_seconds: (task?.tracked_seconds ?? 0) + durationSeconds })
    .eq('id', body.task_id)

  return NextResponse.json(data, { status: 201 })
}
