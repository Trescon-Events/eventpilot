import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/*
  GET /api/documents/versions?group_id=uuid
  Returns every version of a document (same document_group_id), newest first.
*/
export async function GET(req: NextRequest) {
  const groupId = req.nextUrl.searchParams.get('group_id')
  if (!groupId) return NextResponse.json({ error: 'group_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('documents')
    .select('id, title, version, version_note, source_url, status, superseded_by, created_at, uploaded_by, staff_members:uploaded_by(name)')
    .eq('document_group_id', groupId)
    .order('version', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
