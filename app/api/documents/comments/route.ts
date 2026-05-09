import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/*
  GET  /api/documents/comments?document_id=uuid  — fetch all comments for a document
  POST /api/documents/comments                   — add a comment
  PATCH /api/documents/comments?id=uuid          — resolve / unresolve a comment
  DELETE /api/documents/comments?id=uuid         — delete a comment
*/

export async function GET(req: NextRequest) {
  const documentId = req.nextUrl.searchParams.get('document_id')
  if (!documentId) return NextResponse.json({ error: 'document_id required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('document_comments')
    .select(`
      id, comment, resolved, created_at, resolved_at,
      staff:staff_id (id, name, department),
      resolver:resolved_by (id, name)
    `)
    .eq('document_id', documentId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.document_id || !body?.comment?.trim()) {
    return NextResponse.json({ error: 'document_id and comment required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('document_comments')
    .insert({
      document_id: body.document_id,
      staff_id:    body.staff_id ?? null,
      comment:     body.comment.trim(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const id   = req.nextUrl.searchParams.get('id')
  const body = await req.json().catch(() => null)
  if (!id || body == null) return NextResponse.json({ error: 'id and body required' }, { status: 400 })

  const patch: Record<string, unknown> = { resolved: body.resolved }
  if (body.resolved) {
    patch.resolved_by  = body.resolved_by ?? null
    patch.resolved_at  = new Date().toISOString()
  } else {
    patch.resolved_by  = null
    patch.resolved_at  = null
  }

  const { data, error } = await supabaseAdmin
    .from('document_comments')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await supabaseAdmin.from('document_comments').delete().eq('id', id)
  return NextResponse.json({ success: true })
}
