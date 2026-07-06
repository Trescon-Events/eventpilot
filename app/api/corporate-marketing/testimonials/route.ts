/**
 * Corporate testimonials — CRUD for the approved quote library.
 *
 * GET  /api/corporate-marketing/testimonials
 *   → { testimonials: [...] }
 *
 * POST /api/corporate-marketing/testimonials
 *   body: { quote, author_name, author_title?, author_company?, author_photo_url?,
 *           event_id?, approved?, include_in_deck?, display_order? }
 *   → { ok: true, id }
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireCorporateMarketingAccess } from '@/app/lib/corporate-marketing/auth'

export async function GET(req: NextRequest) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res

  const { data } = await supabaseAdmin
    .from('corporate_testimonials')
    .select('id, quote, author_name, author_title, author_company, author_photo_url, event_id, approved, include_in_deck, display_order, created_at, updated_at')
    .order('display_order', { ascending: true })
    .order('created_at',    { ascending: false })

  return NextResponse.json({ testimonials: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireCorporateMarketingAccess(req)
  if (!auth.ok) return auth.res

  const body = await req.json().catch(() => ({}))
  const quote      = String(body?.quote ?? '').trim()
  const authorName = String(body?.author_name ?? '').trim()
  if (!quote)      return NextResponse.json({ error: 'quote required' }, { status: 400 })
  if (!authorName) return NextResponse.json({ error: 'author_name required' }, { status: 400 })

  const row = {
    quote,
    author_name:       authorName,
    author_title:      body.author_title      ? String(body.author_title).trim()      : null,
    author_company:    body.author_company    ? String(body.author_company).trim()    : null,
    author_photo_url:  body.author_photo_url  ? String(body.author_photo_url).trim()  : null,
    event_id:          body.event_id ?? null,
    approved:          body.approved === true,
    include_in_deck:   body.include_in_deck !== false,
    display_order:     Number.isInteger(body.display_order) ? body.display_order : 0,
    created_by:        auth.session.sid,
  }

  const { data, error } = await supabaseAdmin
    .from('corporate_testimonials')
    .insert(row)
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}
