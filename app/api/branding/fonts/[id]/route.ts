import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireFontLibraryWriteAccess } from '@/app/lib/branding/fonts-access'

/* DELETE /api/branding/fonts/[id] */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireFontLibraryWriteAccess(req)
  if (denied) return denied

  const { id } = await params
  const { error } = await supabaseAdmin.from('brand_fonts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
