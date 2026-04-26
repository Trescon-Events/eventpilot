import { supabaseAdmin } from '@/app/lib/supabase'

export interface CachedCourse {
  id:                 string
  title:              string
  subtitle:           string
  tool_name:          string | null
  tier_level:         'foundation' | 'adoption' | 'advanced'
  dept_tags:          string[]
  is_mandatory:       boolean
  estimated_minutes:  number
  overview:           string
  source:             string
  created_at:         string
  suggested_by_name:  string | null
  suggested_by_role:  string | null
}

let _cache: { data: CachedCourse[]; ts: number } | null = null
const TTL_MS = 5 * 60 * 1000 // 5 minutes

export async function getCachedCourses(): Promise<CachedCourse[]> {
  if (_cache && Date.now() - _cache.ts < TTL_MS) return _cache.data

  const { data } = await supabaseAdmin
    .from('courses')
    .select('id, title, subtitle, tool_name, tier_level, dept_tags, is_mandatory, estimated_minutes, overview, source, created_at, suggested_by_name, suggested_by_role')
    .eq('status', 'published')
    .order('created_at', { ascending: false })

  _cache = { data: data ?? [], ts: Date.now() }
  return _cache.data
}

export function invalidateCourseCache() {
  _cache = null
}
