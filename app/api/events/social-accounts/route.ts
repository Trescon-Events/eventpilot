import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* GET  /api/events/social-accounts?event_id=X  — list accounts for event
   POST /api/events/social-accounts             — upsert an account
   DELETE /api/events/social-accounts?id=X      — remove an account
*/

export async function GET(req: NextRequest) {
  const event_id = req.nextUrl.searchParams.get('event_id')
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('event_social_accounts')
    .select('id, platform, page_name, page_url, page_id, access_token, updated_at')
    .eq('event_id', event_id)
    .order('platform')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { event_id, platform, page_name, page_url, page_id, access_token } = body

  if (!event_id || !platform) return NextResponse.json({ error: 'event_id and platform required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('event_social_accounts')
    .upsert({
      event_id, platform, page_name, page_url, page_id, access_token,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'event_id,platform' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabaseAdmin.from('event_social_accounts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
