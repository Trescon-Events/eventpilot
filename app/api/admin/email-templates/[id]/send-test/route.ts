import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { renderEmailTemplate } from '@/app/lib/email/render-template'
import { sendGraphMail } from '@/app/lib/email/graph-mail'

/* POST /api/admin/email-templates/[id]/send-test
   Body: { to?: string } — defaults to the calling admin's own
   staff_members.email. Fills every declared variable_hints key with a
   placeholder sample value, sends via Microsoft Graph (app-only, see
   app/lib/email/graph-mail.ts), and logs the attempt to
   email_template_sends (send_type='test') regardless of outcome — this is
   this phase's only delivery-proof surface; Phase 3 builds the real
   invite-send workflow. Platform admin only. */

type VariableHint = { key: string; label?: string }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const { id } = await params

  const body = await req.json().catch(() => ({})) as { to?: string }

  const { data: template, error: templateErr } = await supabaseAdmin.from('email_templates').select('*').eq('id', id).single()
  if (templateErr || !template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  let toEmail = body.to
  if (!toEmail) {
    const { data: staff } = await supabaseAdmin.from('staff_members').select('email').eq('id', session.sid).single()
    toEmail = staff?.email
  }
  if (!toEmail) return NextResponse.json({ error: 'No recipient email — pass "to" explicitly' }, { status: 400 })

  const variables: Record<string, string> = {}
  for (const hint of (template.variable_hints ?? []) as VariableHint[]) {
    variables[hint.key] = `[${hint.label ?? hint.key}]`
  }

  const { subject, html } = renderEmailTemplate(template, variables)
  const testSubject = `[TEST] ${subject}`

  try {
    await sendGraphMail({ senderEmail: template.sender_email, senderName: template.sender_name, to: toEmail, subject: testSubject, html })
    await supabaseAdmin.from('email_template_sends').insert({
      template_id: id, send_type: 'test', to_email: toEmail, subject: testSubject, status: 'sent', sent_by: session.sid,
    })
    return NextResponse.json({ success: true, to: toEmail })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await supabaseAdmin.from('email_template_sends').insert({
      template_id: id, send_type: 'test', to_email: toEmail, subject: testSubject, status: 'failed', error_message: message, sent_by: session.sid,
    })
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
