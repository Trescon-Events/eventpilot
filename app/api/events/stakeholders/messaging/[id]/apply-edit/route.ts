import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

/* POST /api/events/stakeholders/messaging/[id]/apply-edit
   Body: { target_type: 'section'|'default_field', target_key: string, new_content: unknown, instruction: string, applied_by?: string }

   Step 2 of the conversational-edit flow — the only endpoint that writes
   a chat-proposed change. target_type 'section' updates that section's
   content (unchanged behavior from before this was generalized).
   target_type 'default_field' updates structured_json.default_fields[key]
   instead — only while the doc is still 'draft'; once a doc is live, its
   default fields are plain inline-edited fields on the Event Details page,
   not chat-edited here (see propose-edit/route.ts's doc comment). Either
   way, the whole-document `version` is untouched — a new PDF upload is
   still the only thing that creates a new versioned row — and the edit is
   logged to event_messaging_doc_edits for traceability (default-field
   edits use a synthetic section_id, 'default_field:<key>', since that
   table has no separate column for them). */

function excerpt(content: unknown): string {
  const s = typeof content === 'string' ? content : JSON.stringify(content)
  return s.length > 400 ? s.slice(0, 400) + '…' : s
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  const targetType  = body?.target_type as 'section' | 'default_field' | undefined
  const targetKey   = body?.target_key as string | undefined
  const newContent  = body?.new_content
  const instruction = body?.instruction as string | undefined
  const appliedBy   = (body?.applied_by as string | null) ?? null

  if (!targetType || !targetKey || newContent === undefined || !instruction?.trim()) {
    return NextResponse.json({ error: 'target_type, target_key, new_content and instruction required' }, { status: 400 })
  }

  const { data: doc, error: docErr } = await supabaseAdmin
    .from('event_messaging_docs')
    .select('id, event_id, status, structured_json')
    .eq('id', id)
    .single()
  if (docErr || !doc) return NextResponse.json({ error: 'Messaging doc not found' }, { status: 404 })

  const now = new Date().toISOString()
  let beforeExcerpt: string
  let updatedStructuredJson: Record<string, unknown>
  let logSectionId: string

  if (targetType === 'section') {
    const sections: Array<Record<string, unknown>> = doc.structured_json?.sections ?? []
    const idx = sections.findIndex(s => s.id === targetKey)
    if (idx === -1) return NextResponse.json({ error: 'Section not found on this document' }, { status: 404 })

    beforeExcerpt = excerpt(sections[idx].content)
    const updatedSections = [...sections]
    updatedSections[idx] = {
      ...updatedSections[idx],
      content: newContent,
      updated_at: now,
      updated_by: appliedBy,
      change_note: instruction.trim(),
    }
    updatedStructuredJson = { ...doc.structured_json, sections: updatedSections }
    logSectionId = targetKey
  } else {
    if (doc.status !== 'draft') {
      return NextResponse.json({ error: 'Default fields can only be chat-edited before the document is approved.' }, { status: 400 })
    }
    const defaultFields: Record<string, unknown> = { ...(doc.structured_json?.default_fields ?? {}) }
    beforeExcerpt = excerpt(defaultFields[targetKey] ?? null)
    defaultFields[targetKey] = typeof newContent === 'string' ? newContent : null
    updatedStructuredJson = { ...doc.structured_json, default_fields: defaultFields }
    logSectionId = `default_field:${targetKey}`
  }

  const { data: updatedDoc, error: updateErr } = await supabaseAdmin
    .from('event_messaging_docs')
    .update({ structured_json: updatedStructuredJson, updated_at: now })
    .eq('id', id)
    .select()
    .single()
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // The content is already saved above — a failure here shouldn't block
  // the edit from taking effect, but it should be visible, not silent.
  const { error: logErr } = await supabaseAdmin.from('event_messaging_doc_edits').insert({
    event_id:       doc.event_id,
    doc_id:         doc.id,
    section_id:     logSectionId,
    instruction:    instruction.trim(),
    before_excerpt: beforeExcerpt,
    after_excerpt:  excerpt(newContent),
    applied_by:     appliedBy,
    applied_at:     now,
  })
  if (logErr) console.error('Failed to log messaging doc edit:', logErr)

  return NextResponse.json(updatedDoc)
}
