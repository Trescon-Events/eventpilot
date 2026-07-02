/*
  getStaffCount — single source of truth for "how many staff at Trescon".

  Used inside AI prompts (Ask, generateInsights, seed docs) and in
  user-facing copy so the number is always current. Hitting Supabase
  on every read is fine; the query is a single indexed count.

  Cached for 5 minutes to avoid hammering during high-traffic bursts
  (AI insights kick off many parallel prompt renders).
*/

import { supabaseAdmin } from './supabase'

type Snapshot = { total: number; by_office: Record<string, number>; at: number }

let cache: Snapshot | null = null
const TTL_MS = 5 * 60 * 1000  // 5 minutes

async function refresh(): Promise<Snapshot> {
  const { data, error } = await supabaseAdmin
    .from('staff_members')
    .select('office_id')
    .eq('access_enabled', true)

  if (error || !data) {
    // Fall back to last-known value if the query fails — don't return 0
    // to a prompt or user-facing page.
    if (cache) return cache
    return { total: 0, by_office: {}, at: Date.now() }
  }

  const by_office: Record<string, number> = {}
  for (const s of data) {
    const office = s.office_id ?? 'unassigned'
    by_office[office] = (by_office[office] ?? 0) + 1
  }

  cache = { total: data.length, by_office, at: Date.now() }
  return cache
}

/*
  Returns the live count of enabled staff at Trescon. Cached 5min.
*/
export async function getStaffCount(): Promise<number> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.total
  const snap = await refresh()
  return snap.total
}

/*
  Returns the full snapshot — total + per-office breakdown. Cached 5min.
  Use this for prompts that need to mention office distribution.
*/
export async function getStaffSnapshot(): Promise<{
  total: number
  by_office: Record<string, number>
}> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return { total: cache.total, by_office: cache.by_office }
  }
  const snap = await refresh()
  return { total: snap.total, by_office: snap.by_office }
}
