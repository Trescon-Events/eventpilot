import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadPublicAsset } from '@/app/lib/events/storage'

/* POST /api/events/stakeholders/partners/[id]/upload-asset
   multipart/form-data: file
   Accepts PNG, JPG, SVG, PDF, AI (Canva Autofill can receive PDF/AI
   directly as an asset upload — no conversion needed here). Stores as both
   logo_url and logo_raw_url (PRD keeps these as two fields for a future
   "processed/clean logo" step; until that exists they're identical). */

const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'application/postscript': 'ai', // .ai files are often served as this or octet-stream
  'application/octet-stream': 'ai',
}
const MAX_SIZE = 10 * 1024 * 1024

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: partnerId } = await params
  const form = await req.formData()
  const file = form.get('file') as File | null

  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })
  const ext = ALLOWED_TYPES[file.type] ?? (file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : null)
  if (!ext || !['png', 'jpg', 'jpeg', 'svg', 'pdf', 'ai'].includes(ext)) {
    return NextResponse.json({ error: `Unsupported file type (${file.type || 'unknown'})` }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 413 })
  }

  const { data: partner } = await supabaseAdmin.from('event_sponsors').select('event_id').eq('id', partnerId).single()
  if (!partner) return NextResponse.json({ error: 'Partner not found' }, { status: 404 })

  const buffer  = Buffer.from(await file.arrayBuffer())
  const logoUrl = await uploadPublicAsset(
    `events/${partner.event_id}/partners/${partnerId}/logo-${Date.now()}.${ext}`,
    buffer,
    file.type || 'application/octet-stream'
  )

  const { data, error } = await supabaseAdmin
    .from('event_sponsors')
    .update({ logo_url: logoUrl, logo_raw_url: logoUrl, updated_at: new Date().toISOString() })
    .eq('id', partnerId)
    .select('logo_url, logo_raw_url')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
