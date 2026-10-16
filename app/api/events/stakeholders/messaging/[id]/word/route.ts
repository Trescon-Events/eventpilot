import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { uploadPublicAsset } from '@/app/lib/events/storage'
import { requireContentEditAccess } from '@/app/lib/content/content-access'

export const maxDuration = 60

/* POST /api/events/stakeholders/messaging/[id]/word   (multipart: file = .docx)
   Attaches a Word copy to a Trescon-wide (org) document version (Brand & Content, Part 3). It is a convenience download only: stored and
   served, never read, never extracted, never in a prompt or a rule check. It belongs to this version, so a new version starts without one.
   Needs platform.content.manage or super admin. Trescon-wide documents only; event and umbrella documents are not touched. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireContentEditAccess(req)
  if (denied) return denied
  const { id } = await params

  const { data: doc } = await supabaseAdmin.from('event_messaging_docs').select('id, version, org_scope').eq('id', id).maybeSingle()
  if (!doc) return NextResponse.json({ error: 'Document not found.' }, { status: 404 })
  if (!doc.org_scope) return NextResponse.json({ error: 'A Word copy can only be attached to a Trescon-wide document.' }, { status: 400 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })
  if (!file.name.toLowerCase().endsWith('.docx')) return NextResponse.json({ error: 'Only a Word (.docx) file is accepted.' }, { status: 400 })
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: 'File too large (max 20 MB).' }, { status: 413 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const url = await uploadPublicAsset(
    `org/trescon/messaging/v${doc.version}-${Date.now()}.docx`,
    buffer,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  )
  const { error } = await supabaseAdmin.from('event_messaging_docs').update({ word_file_url: url, word_file_name: file.name }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message.includes('word_file') ? 'Run supabase/company_profile_migration.sql first (adds the Word columns).' : error.message }, { status: 500 })
  return NextResponse.json({ ok: true, word_file_url: url, word_file_name: file.name })
}
