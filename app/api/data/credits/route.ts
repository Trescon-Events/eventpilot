import { smartdataAdmin } from '@/app/lib/supabase'
import { NextResponse } from 'next/server'

/* GET /api/data/credits — today's usage + tool limits */

export async function GET() {
  const today = new Date().toISOString().split('T')[0]

  const [usageRes, limitsRes, toolsRes] = await Promise.all([
    smartdataAdmin
      .from('sd_lookup_usage')
      .select('user_id, used_count')
      .eq('lookup_date', today),

    smartdataAdmin
      .from('sd_lookup_limits')
      .select('job_level, daily_limit'),

    smartdataAdmin
      .from('sd_tool_status')
      .select('tool_key, display_name, is_active, credits_per_use, requires_api_key'),
  ])

  const usage      = usageRes.data   ?? []
  const limits     = limitsRes.data  ?? []
  const tools      = toolsRes.data   ?? []

  const total_used = usage.reduce((sum, u) => sum + (u.used_count ?? 0), 0)
  const default_limit = limits.find(l => l.job_level === 'default')?.daily_limit ?? 20

  return NextResponse.json({
    today,
    total_used,
    default_limit,
    limits: Object.fromEntries(limits.map(l => [l.job_level, l.daily_limit])),
    tools:  tools.map(t => ({
      key:             t.tool_key,
      label:           t.display_name,
      active:          t.is_active,
      credits_per_use: t.credits_per_use,
    })),
  })
}
