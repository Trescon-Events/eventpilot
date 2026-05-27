import { supabaseAdmin } from '@/app/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

/* GET  /api/data/tools — list all tools with status + credit info
   PATCH /api/data/tools — toggle tool active/inactive
   Body: { tool_key, is_active, maintenance_message?, disabled_by? }
*/

export async function GET() {
  const [toolsRes, limitsRes] = await Promise.all([
    supabaseAdmin.from('sd_tool_status').select('*').order('display_name'),
    supabaseAdmin.from('sd_lookup_limits').select('*'),
  ])

  // Check which API keys are configured
  const keyStatus: Record<string, boolean> = {
    LUSHA_API_KEY:              !!process.env.LUSHA_API_KEY,
    APOLLO_API_KEY:             !!process.env.APOLLO_API_KEY,
    MILLION_VERIFIER_API_KEY:   !!process.env.MILLION_VERIFIER_API_KEY,
    FIRECRAWL_API_KEY:          !!process.env.FIRECRAWL_API_KEY,
  }

  const tools = (toolsRes.data ?? []).map(t => ({
    ...t,
    api_key_configured: t.requires_api_key ? (keyStatus[t.requires_api_key] ?? false) : true,
  }))

  return NextResponse.json({
    tools,
    limits: limitsRes.data ?? [],
    key_status: keyStatus,
  })
}

export async function PATCH(req: NextRequest) {
  const { tool_key, is_active, maintenance_message, disabled_by } =
    await req.json().catch(() => ({}))

  if (!tool_key) return NextResponse.json({ error: 'tool_key required' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('sd_tool_status')
    .update({
      is_active,
      maintenance_message: maintenance_message ?? null,
      disabled_by:         is_active ? null : (disabled_by ?? null),
      disabled_at:         is_active ? null : new Date().toISOString(),
      updated_at:          new Date().toISOString(),
    })
    .eq('tool_key', tool_key)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
