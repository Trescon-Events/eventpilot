import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { uploadPublicAsset } from '@/app/lib/events/storage'

const MAX_SIZE_MB = 10

/* POST /api/events/templates/global-placeholder-defaults/photo
   multipart/form-data: file, stakeholder_type ('speaker'|'partner')
   Uploads the dedicated global placeholder photo — expected to already be
   a clean, transparent-background image (same shape as the photo-cleaning
   module's own 1024x1024 output, see photo-cleaning-pipeline.ts), not run
   through any alignment/face-detection derivation itself — unlike a
   per-layer "Upload Reference Layer", this is a flat asset, not something
   a box/crop gets derived from. */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const file = form?.get('file') as File | null
  const stakeholderType = form?.get('stakeholder_type') as string | null
  if (!file || (stakeholderType !== 'speaker' && stakeholderType !== 'partner')) {
    return NextResponse.json({ error: "file and stakeholder_type ('speaker'|'partner') required" }, { status: 400 })
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return NextResponse.json({ error: `File too large — max ${MAX_SIZE_MB}MB` }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/jpeg' ? 'jpg' : 'png'
  const path = `template-placeholder-defaults/${stakeholderType}_${Date.now()}.${ext}`
  const photoUrl = await uploadPublicAsset(path, buffer, file.type || 'image/png')

  const session = getSession(req)
  const { data, error } = await supabaseAdmin
    .from('template_placeholder_defaults')
    .upsert({
      stakeholder_type: stakeholderType,
      photo_url: photoUrl,
      updated_by: session?.sid && session.sid !== 'super-admin' ? session.sid : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'stakeholder_type' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
