import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { getStakeholderHeaderUrl } from '@/app/lib/branding/email-header'

/* GET  /api/admin/email-templates — list all templates
   POST /api/admin/email-templates — create. Body: { slug, name, description?,
   category?, subject, body_html, variable_hints?, sender_name, sender_email,
   sender_staff_id?, header_image_url? }. header_image_url defaults to the
   current corporate default (getStakeholderHeaderUrl()) if not supplied —
   copied at creation time, not a live reference (see email_templates.sql).
   Platform admin only — workspace-level tool, "for now" framing per Madhu. */

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from('email_templates')
    .select('*')
    .order('category')
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session?.adm) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const body = await req.json().catch(() => null) as {
    slug?: string; name?: string; description?: string; category?: string
    subject?: string; body_html?: string; variable_hints?: unknown
    sender_name?: string; sender_email?: string; sender_staff_id?: string
    header_image_url?: string
  } | null

  if (!body?.slug?.trim() || !body.name?.trim() || !body.subject?.trim() || !body.body_html?.trim() || !body.sender_name?.trim() || !body.sender_email?.trim()) {
    return NextResponse.json({ error: 'slug, name, subject, body_html, sender_name, sender_email required' }, { status: 400 })
  }

  const headerImageUrl = body.header_image_url ?? await getStakeholderHeaderUrl()

  const { data, error } = await supabaseAdmin
    .from('email_templates')
    .insert({
      slug: body.slug.trim(),
      name: body.name.trim(),
      description: body.description ?? null,
      category: body.category ?? 'general',
      subject: body.subject,
      body_html: body.body_html,
      variable_hints: body.variable_hints ?? [],
      sender_name: body.sender_name,
      sender_email: body.sender_email,
      sender_staff_id: body.sender_staff_id ?? null,
      header_image_url: headerImageUrl,
      header_base_image_url: headerImageUrl,
      created_by: session.sid,
      updated_by: session.sid,
    })
    .select()
    .single()

  if (error?.code === '23505') return NextResponse.json({ error: `A template with slug "${body.slug}" already exists.` }, { status: 409 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
