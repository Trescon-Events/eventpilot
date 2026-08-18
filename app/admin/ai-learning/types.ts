export type LearningCompletion = { id: string; staff_id: string; course_id: string; test_score: number | null; passed: boolean; attempt_count: number; completed_at: string }
export type LearningCourse     = { id: string; title: string; tier_level: string; is_mandatory: boolean; estimated_minutes: number }
export type LearningStaff      = { id: string; name: string; department: string | null; office_id: string; role: string | null }
export type LearningAttempt    = { id: string; staff_id: string; course_id: string; score: number | null; passed: boolean | null; attempted_at: string }
export type NeverStarted       = { id: string; name: string; department: string | null; office_id: string; role: string | null }
export type DeptParticipation  = { dept: string; total: number; active: number }
