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
  correct_index: number
  explanation:   string
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

  if (!staff_id || !course_id || !answers || !questions_served) {
    return NextResponse.json({ error: 'staff_id, course_id, answers and questions_served are required' }, { status: 400 })
  }

  if (questions_served.length === 0) {
    return NextResponse.json({ error: 'questions_served is empty' }, { status: 422 })
  }

  // Score against the questions that were actually served to this person
  let correct = 0
  for (let i = 0; i < questions_served.length; i++) {
    if (answers[i] !== undefined && answers[i] === questions_served[i].correct_index) {
      correct++
    }
  }
  const score  = Math.round((correct / questions_served.length) * 100)
  const passed = score >= 70

  // Record attempt with full audit trail
  await supabaseAdmin.from('course_attempts').insert({
    staff_id,
    course_id,
    answers,
    score,
    passed,
    questions_served,
    task_submission:    task_submission   ?? null,
    time_spent_seconds: time_spent_seconds ?? 0,
  })

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

  // Return result with per-question breakdown
  const breakdown = questions_served.map((q, i) => ({
    question:      q.question,
    options:       q.options,
    selected:      answers[i] ?? null,
    correct_index: q.correct_index,
    is_correct:    answers[i] === q.correct_index,
    explanation:   q.explanation,
  }))

  return NextResponse.json({ score, passed, correct, total: questions_served.length, breakdown })
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
