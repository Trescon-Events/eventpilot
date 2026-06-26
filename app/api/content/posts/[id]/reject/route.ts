import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { Resend } from 'resend'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { note } = await req.json().catch(() => ({ note: '' }))

  const { data, error } = await supabaseAdmin
    .from('content_posts')
    .update({ status: 'generated', revision_note: note ?? '', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, campaign:campaign_id(name, created_by, events(name))')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send email + notification to campaign creator
  try {
    const creatorId = data.campaign?.created_by
    if (creatorId) {
      const { data: creator } = await supabaseAdmin.from('staff_members').select('name, email').eq('id', creatorId).single()
      if (creator?.email) {
        const resend = new Resend(process.env.RESEND_API_KEY)
        const eventName = data.campaign?.events?.name || 'your campaign'
        await resend.emails.send({
          from: process.env.RESEND_FROM || 'Event Pilot <noreply@eventpilot.tresconglobal.com>',
          to: creator.email,
          subject: `Revision needed — ${data.platform} post for ${eventName}`,
          html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
            <h2 style="font-size:18px;color:#0F1923;margin:0 0 12px">Revision Requested</h2>
            <p style="font-size:14px;color:#2D3E50;line-height:1.6;margin:0 0 16px">Your ${data.platform} post for <strong>${eventName}</strong> needs changes before it can be published.</p>
            ${note ? `<div style="background:#FFF3E0;border:1px solid #FFB74D;border-radius:8px;padding:14px;margin:0 0 16px">
              <p style="font-size:12px;font-weight:700;color:#E65100;margin:0 0 6px">Feedback:</p>
              <p style="font-size:13px;color:#0F1923;margin:0">${note}</p>
            </div>` : ''}
            <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://eventpilot.tresconglobal.com'}/content" style="display:inline-block;padding:10px 24px;background:#00695C;color:#fff;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none">Open Content Hub</a>
            <p style="font-size:11px;color:#5B7080;margin:20px 0 0">Trescon · Event Pilot</p>
          </div>`,
        })
      }
      await supabaseAdmin.from('notifications').insert({
        staff_id: creatorId,
        type: 'content_rejected',
        title: `${data.platform} post needs revision`,
        body: note ? `Feedback: ${note}` : 'Your post was sent back for revision.',
      })
    }
  } catch { /* Non-critical */ }

  return NextResponse.json(data)
}
