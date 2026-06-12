import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

/* POST — submit test answers and record result
   Body: {
     staff_id, course_id,
     answers: Record<number, number>,      -- key = question index, value = selected option index
     questions_served: Question[],          -- the 5 random questions shown to this person
     task_submission?: string,             -- staff's pasted AI output from Do This step
     time_spent_seconds?: number,          -- seconds from course open to submission
   }
*/
interface Question {
  question:      string
  options:       string[]
  correct_index?: number
  correct?:       number   // legacy field name from seed script
  explanation?:   string
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const { staff_id, course_id, answers, questions_served, task_submission, time_spent_seconds } = body as {
    staff_id:            string
    course_id:           string
    answers:             Record<string, number>
    questions_served:    Question[]
    task_submission?:    string
    time_spent_seconds?: number
  }

  const { question_times } = body as { question_times?: number[] }

  if (!staff_id || !course_id || !answers || !questions_served) {
    return NextResponse.json({ error: 'staff_id, course_id, answers and questions_served are required' }, { status: 400 })
  }

  // Verify the submitting session owns this staff_id — prevents submitting on behalf of others
  const sessionRaw = req.cookies.get('tcs_session')?.value
  if (sessionRaw) {
    try {
      const session = JSON.parse(Buffer.from(sessionRaw, 'base64').toString('utf-8'))
      if (session.sid !== staff_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } catch { /* malformed cookie; middleware already validated session exists */ }
  }

  if (questions_served.length === 0) {
    return NextResponse.json({ error: 'questions_served is empty' }, { status: 422 })
  }

  // Score against the questions that were actually served to this person
  // Handle both `correct_index` and `correct` field names for compatibility
  let correct = 0
  for (let i = 0; i < questions_served.length; i++) {
    const correctIdx = questions_served[i].correct_index ?? questions_served[i].correct
    if (answers[i] !== undefined && answers[i] === correctIdx) {
      correct++
    }
  }
  const score  = Math.round((correct / questions_served.length) * 100)
  const passed = score >= 70

  // Upsert completion record
  const { data: existing } = await supabaseAdmin
    .from('course_completions')
    .select('id, attempt_count, passed')
    .eq('staff_id', staff_id)
    .eq('course_id', course_id)
    .maybeSingle()

  if (existing) {
    await supabaseAdmin
      .from('course_completions')
      .update({
        test_score:    score,
        passed:        passed || existing.passed, // never downgrade a pass
        attempt_count: (existing.attempt_count ?? 1) + 1,
        completed_at:  passed ? new Date().toISOString() : existing.passed ? undefined : new Date().toISOString(),
      })
      .eq('id', existing.id)
  } else {
    await supabaseAdmin.from('course_completions').insert({
      staff_id,
      course_id,
      test_score:    score,
      passed,
      attempt_count: 1,
    })
  }

  // ── Authenticity flag detection ──────────────────────────────
  // Signal: avg time per question under 12 seconds = faster than reading pace
  const avgTimePerQ = question_times?.length
    ? question_times.reduce((a, b) => a + b, 0) / question_times.length
    : (time_spent_seconds ?? 0) / questions_served.length

  const suspiciouslyFast = avgTimePerQ < 12 && score >= 70

  const authenticityFlag = suspiciouslyFast

  // Count previous flagged attempts — gracefully skips if column not yet migrated
  let prevFlagCount = 0
  const { count: flagCount, error: flagCountErr } = await supabaseAdmin
    .from('course_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('staff_id', staff_id)
    .eq('course_id', course_id)
    .eq('authenticity_flag', true)
  if (!flagCountErr) prevFlagCount = flagCount ?? 0

  const offenseNumber = suspiciouslyFast ? prevFlagCount + 1 : 0

  // Record attempt — try with authenticity_flag; fall back without if column missing
  const attemptPayload: Record<string, unknown> = {
    staff_id,
    course_id,
    answers,
    score,
    passed,
    questions_served,
    task_submission:    task_submission   ?? null,
    time_spent_seconds: time_spent_seconds ?? 0,
    authenticity_flag:  authenticityFlag,
  }
  const { error: insertErr } = await supabaseAdmin.from('course_attempts').insert(attemptPayload)
  if (insertErr) {
    // authenticity_flag column may not exist yet — retry without it
    const { authenticity_flag: _omit, ...payloadWithoutFlag } = attemptPayload
    void _omit
    await supabaseAdmin.from('course_attempts').insert(payloadWithoutFlag)
  }

  // Auto-issue certificate on first pass
  if (passed && !existing?.passed) {
    await supabaseAdmin.from('training_certificates').upsert({
      staff_id,
      course_id,
      issued_at:  new Date().toISOString(),
      expires_at: null,
    }, { onConflict: 'staff_id,course_id' })
  }

  // Return result with per-question breakdown
  const breakdown = questions_served.map((q, i) => {
    const correctIdx = q.correct_index ?? q.correct ?? 0
    return {
      question:      q.question,
      options:       q.options,
      selected:      answers[i] ?? null,
      correct_index: correctIdx,
      is_correct:    answers[i] === correctIdx,
      explanation:   q.explanation ?? null,
    }
  })

  return NextResponse.json({
    score, passed, correct, total: questions_served.length, breakdown,
    flagged:        authenticityFlag,
    offense_number: offenseNumber,
  })
}

/* GET — get completion status for a staff member on a course */
export async function GET(req: NextRequest) {
  const staff_id  = req.nextUrl.searchParams.get('staff_id')
  const course_id = req.nextUrl.searchParams.get('course_id')

  if (!staff_id || !course_id) {
    return NextResponse.json({ error: 'staff_id and course_id required' }, { status: 400 })
  }

  const { data } = await supabaseAdmin
    .from('course_completions')
    .select('test_score, passed, attempt_count, completed_at')
    .eq('staff_id', staff_id)
    .eq('course_id', course_id)
    .maybeSingle()

  return NextResponse.json(data ?? { passed: false, test_score: null, attempt_count: 0 })
}
