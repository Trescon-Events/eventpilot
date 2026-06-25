import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { Resend } from 'resend'

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  const { data, error } = await supabaseAdmin
    .from('event_team_members')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { event_id, email, name, role } = body
  if (!event_id || !email) return NextResponse.json({ error: 'event_id and email required' }, { status: 400 })
  const { data, error } = await supabaseAdmin
    .from('event_team_members')
    .insert({ event_id, email, name: name || null, role: role || 'content', status: 'pending' })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send invite email (fire and forget)
  try {
    const { data: event } = await supabaseAdmin.from('events').select('name').eq('id', event_id).single()
    const eventName = event?.name || 'an event'
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventpilot.tresconglobal.com'
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: process.env.RESEND_FROM || 'Event Pilot <noreply@eventpilot.tresconglobal.com>',
      to: email,
      subject: `You've been added to the ${eventName} website team`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
          <h2 style="font-size:20px;color:#0F1923;margin:0 0 16px">You're on the team</h2>
          <p style="font-size:15px;color:#2D3E50;line-height:1.6;margin:0 0 12px">
            Hi${name ? ` ${name}` : ''},
          </p>
          <p style="font-size:15px;color:#2D3E50;line-height:1.6;margin:0 0 20px">
            You've been added as <strong>${role || 'content editor'}</strong> for the <strong>${eventName}</strong> website on Event Pilot.
          </p>
          <a href="${siteUrl}/login" style="display:inline-block;padding:12px 28px;background:#00695C;color:#fff;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none">
            Open Event Pilot
          </a>
          <p style="font-size:12px;color:#5B7080;margin:24px 0 0;line-height:1.5">
            Trescon · Event Pilot
          </p>
        </div>
      `,
    })
  } catch {
    // Non-critical — log but don't fail the add
    console.error('Failed to send team invite email to', email)
  }

  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const body = await req.json()
  const { data, error } = await supabaseAdmin
    .from('event_team_members')
    .update(body)
    .eq('id', id)
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabaseAdmin.from('event_team_members').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
