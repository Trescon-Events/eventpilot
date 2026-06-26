import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { Resend } from 'resend'

export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data, error } = await supabaseAdmin
    .from('content_posts')
    .update({ status: 'approved', revision_note: null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, campaign:campaign_id(name, created_by, events(name))')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send email notification to campaign creator
  try {
    const creatorId = data.campaign?.created_by
    const eventName = data.campaign?.events?.name || 'your campaign'
    if (creatorId) {
      const { data: creator } = await supabaseAdmin.from('staff_members').select('name, email').eq('id', creatorId).single()
      if (creator?.email) {
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: process.env.RESEND_FROM || 'Event Pilot <noreply@eventpilot.tresconglobal.com>',
          to: creator.email,
          subject: `Post approved — ${data.platform} post for ${eventName}`,
          html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
            <h2 style="font-size:18px;color:#0F1923;margin:0 0 12px">Post Approved</h2>
            <p style="font-size:14px;color:#2D3E50;line-height:1.6;margin:0 0 16px">Your ${data.platform} post for <strong>${eventName}</strong> has been approved and is ready to publish.</p>
            <div style="background:#F8FAFB;border:1px solid #D8EAEB;border-radius:8px;padding:14px;margin:0 0 20px">
              <p style="font-size:13px;color:#0F1923;margin:0;white-space:pre-wrap">${(data.text || '').substring(0, 200)}${(data.text || '').length > 200 ? '...' : ''}</p>
            </div>
            <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://eventpilot.tresconglobal.com'}/content" style="display:inline-block;padding:10px 24px;background:#00695C;color:#fff;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none">Open Content Hub</a>
            <p style="font-size:11px;color:#5B7080;margin:20px 0 0">Trescon · Event Pilot</p>
          </div>`,
        })
      }
      // Also create in-app notification
      await supabaseAdmin.from('notifications').insert({
        staff_id: creatorId,
        type: 'content_approved',
        title: `${data.platform} post approved`,
        body: `Your post for ${eventName} has been approved and is ready to publish.`,
      })
    }
  } catch { /* Non-critical */ }

  return NextResponse.json(data)
}
