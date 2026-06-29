import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET  ?event_id=X  — fetch brief for an event
// POST              — create or update brief (upsert)

const FIELDS = [
  'elevator_pitch', 'value_proposition', 'target_audience', 'industry_focus', 'geography_focus',
  'key_themes', 'key_messages', 'tone_of_voice', 'tagline', 'hashtags',
  'revenue_target', 'sponsor_value_prop', 'delegate_target', 'delegate_profile', 'pricing_notes',
  'competing_events', 'differentiators', 'market_positioning',
  'attendance_target', 'nps_target', 'media_coverage_goals', 'other_kpis',
]

// Calculate completion percentage based on filled fields
function calcCompletion(data: Record<string, unknown>): number {
  const checks = [
    !!data.elevator_pitch,
    !!data.value_proposition,
    !!data.target_audience,
    Array.isArray(data.industry_focus) && data.industry_focus.length > 0,
    Array.isArray(data.key_themes) && data.key_themes.length > 0,
    Array.isArray(data.key_messages) && data.key_messages.length > 0,
    Array.isArray(data.tone_of_voice) && data.tone_of_voice.length > 0,
    !!data.tagline,
    !!data.sponsor_value_prop,
    !!data.delegate_profile,
    !!data.revenue_target,
    !!data.delegate_target,
    !!data.attendance_target,
    Array.isArray(data.differentiators) && data.differentiators.length > 0,
    !!data.market_positioning,
  ]
  const filled = checks.filter(Boolean).length
  return Math.round((filled / checks.length) * 100)
}

export async function GET(req: NextRequest) {
  const eventId = new URL(req.url).searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('event_briefs')
    .select('*')
    .eq('event_id', eventId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? { event_id: eventId, completion_pct: 0 })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { event_id, last_edited_by, ...rest } = body

  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const patch: Record<string, unknown> = { event_id, updated_at: new Date().toISOString() }
  for (const f of FIELDS) {
    if (rest[f] !== undefined) patch[f] = rest[f]
  }
  if (last_edited_by) patch.last_edited_by = last_edited_by

  patch.completion_pct = calcCompletion(patch)

  const { data, error } = await supabaseAdmin
    .from('event_briefs')
    .upsert(patch, { onConflict: 'event_id' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
