import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* PATCH /api/events/stakeholders/messaging/[id]
   Body: { status?, structured_json? } — update status or structured_json only. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (body.status !== undefined) update.status = body.status
  if (body.structured_json !== undefined) update.structured_json = body.structured_json
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'status or structured_json required' }, { status: 400 })
  }
  update.updated_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('event_messaging_docs')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
