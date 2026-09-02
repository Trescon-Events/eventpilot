import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireApiModuleAccess } from '@/app/lib/registry/api-access'

export async function GET(req: NextRequest) {
  const gate = await requireApiModuleAccess(req, 'insights')
  if (gate.response) return gate.response

  const { data, error } = await supabaseAdmin
    .from('intelligence_reports')
    .select('id, generated_at, total_submissions, trigger_type, report')
    .order('generated_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
