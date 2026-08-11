import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* POST /api/events/stakeholders/messaging/[id]/apply-edit
   Body: { section_id: string, new_content: unknown, instruction: string, applied_by?: string }

   Step 2 of the conversational-edit flow — the only endpoint that writes
   a chat-proposed change. Updates just that one section's content +
   updated_at/updated_by/change_note in structured_json (the whole-document
   `version` is untouched — a new PDF upload is still the only thing that
   creates a new versioned row), and logs the edit to
   event_messaging_doc_edits for traceability. */

function excerpt(content: unknown): string {
  const s = typeof content === 'string' ? content : JSON.stringify(content)
  return s.length > 400 ? s.slice(0, 400) + '…' : s
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  const sectionId   = body?.section_id as string | undefined
  const newContent  = body?.new_content
  const instruction = body?.instruction as string | undefined
  const appliedBy   = (body?.applied_by as string | null) ?? null

  if (!sectionId || newContent === undefined || !instruction?.trim()) {
    return NextResponse.json({ error: 'section_id, new_content and instruction required' }, { status: 400 })
  }

  const { data: doc, error: docErr } = await supabaseAdmin
    .from('event_messaging_docs')
    .select('id, event_id, structured_json')
    .eq('id', id)
    .single()
  if (docErr || !doc) return NextResponse.json({ error: 'Messaging doc not found' }, { status: 404 })

  const sections: Array<Record<string, unknown>> = doc.structured_json?.sections ?? []
  const idx = sections.findIndex(s => s.id === sectionId)
  if (idx === -1) return NextResponse.json({ error: 'Section not found on this document' }, { status: 404 })

  const beforeExcerpt = excerpt(sections[idx].content)
  const now = new Date().toISOString()

  const updatedSections = [...sections]
  updatedSections[idx] = {
    ...updatedSections[idx],
    content: newContent,
    updated_at: now,
    updated_by: appliedBy,
    change_note: instruction.trim(),
  }

  const { data: updatedDoc, error: updateErr } = await supabaseAdmin
    .from('event_messaging_docs')
    .update({ structured_json: { sections: updatedSections }, updated_at: now })
    .eq('id', id)
    .select()
    .single()
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // The section content is already saved above — a failure here shouldn't
  // block the edit from taking effect, but it should be visible, not silent.
  const { error: logErr } = await supabaseAdmin.from('event_messaging_doc_edits').insert({
    event_id:       doc.event_id,
    doc_id:         doc.id,
    section_id:     sectionId,
    instruction:    instruction.trim(),
    before_excerpt: beforeExcerpt,
    after_excerpt:  excerpt(newContent),
    applied_by:     appliedBy,
    applied_at:     now,
  })
  if (logErr) console.error('Failed to log messaging doc edit:', logErr)

  return NextResponse.json(updatedDoc)
}
