/**
 * Corporate Deck — read + patch the single "current master deck" row.
 *
 * GET  /api/corporate-marketing/deck
 *   → { deck: { ...row, pdf_signed_url, uploaded_by_name } | null }
 *
 * PATCH /api/corporate-marketing/deck
 *   body: { canva_url?: string, title?: string }
 *   → { ok: true, deck }
 *
 * Auth: session cookie required. Gate is enforced upstream by the
 * client-side layout at /admin/toolkit/corporate-marketing/layout.tsx —
 * these APIs additionally require admin OR tool_grants.corporate_marketing.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

const BUCKET = 'corporate-marketing'

type Session = { sid?: string; adm?: boolean }

async function requireAccess(req: NextRequest): Promise<{ ok: true; session: Session } | { ok: false; res: NextResponse }> {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return { ok: false, res: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }

  let session: Session | null = null
  try { session = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) } catch {}
  if (!session?.sid) return { ok: false, res: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }

  if (session.adm) return { ok: true, session }

  const { data } = await supabaseAdmin
    .from('staff_members')
    .select('tool_grants')
    .eq('id', session.sid)
    .single()
  if (!data?.tool_grants?.corporate_marketing) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true, session }
}

async function loadDeck() {
  const { data: deck } = await supabaseAdmin
    .from('corporate_decks')
    .select('*')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!deck) return null

  let pdf_signed_url: string | null = null
  if (deck.pdf_storage_path) {
    const { data: signed } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(deck.pdf_storage_path, 3600)
    pdf_signed_url = signed?.signedUrl ?? null
  }

  let uploaded_by_name: string | null = null
  if (deck.uploaded_by) {
    const { data: staff } = await supabaseAdmin
      .from('staff_members')
      .select('name')
      .eq('id', deck.uploaded_by)
      .single()
    uploaded_by_name = staff?.name ?? null
  }

  return { ...deck, pdf_signed_url, uploaded_by_name }
}

export async function GET(req: NextRequest) {
  const auth = await requireAccess(req)
  if (!auth.ok) return auth.res
  const deck = await loadDeck()
  return NextResponse.json({ deck })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAccess(req)
  if (!auth.ok) return auth.res

  const body = await req.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}
  if (typeof body.canva_url === 'string') updates.canva_url = body.canva_url.trim() || null
  if (typeof body.title === 'string' && body.title.trim()) updates.title = body.title.trim()

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }
  updates.updated_at = new Date().toISOString()

  const { data: existing } = await supabaseAdmin
    .from('corporate_decks')
    .select('id')
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!existing) {
    // Allow saving a Canva link before any PDF is uploaded — creates a stub row.
    const { data: inserted, error } = await supabaseAdmin
      .from('corporate_decks')
      .insert({ ...updates, uploaded_by: auth.session.sid })
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, deck: inserted })
  }

  const { error } = await supabaseAdmin
    .from('corporate_decks')
    .update(updates)
    .eq('id', existing.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const deck = await loadDeck()
  return NextResponse.json({ ok: true, deck })
}
