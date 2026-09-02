import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { requireApiModuleAccess } from '@/app/lib/registry/api-access'

/*
  GET /api/kb/gaps?document_id=X
  Returns the most recent gap session for a document — used by the admin UI
  to check whether a just-ingested (or previously ingested) document still
  has unresolved gaps.

  GET /api/kb/gaps?pending=1
  Returns every unresolved session (resolved = false) with its document's
  title/type — feeds the "Pending Gaps" sub-tab.
*/
export async function GET(req: NextRequest) {
  const gate = await requireApiModuleAccess(req, 'kb')
  if (gate.response) return gate.response

  const documentId = req.nextUrl.searchParams.get('document_id')
  const pending    = req.nextUrl.searchParams.get('pending')

  if (documentId) {
    const { data, error } = await supabaseAdmin
      .from('kb_gap_sessions')
      .select('*')
      .eq('document_id', documentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ session: data ?? null })
  }

  if (pending) {
    const { data, error } = await supabaseAdmin
      .from('kb_gap_sessions')
      .select('*, documents(title, type)')
      .eq('resolved', false)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ sessions: data ?? [] })
  }

  return NextResponse.json({ error: 'document_id or pending is required' }, { status: 400 })
}
