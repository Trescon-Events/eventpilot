import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/app/lib/supabase'
import { isKbAdmin } from '@/app/lib/kb/intel-access'

const SOURCE_CATEGORY_TO_DOC_CATEGORY: Record<string, string> = {
  owned_property: 'external_owned',
  partner_govt:   'external_partner',
  press_media:    'external_press',
}

/*
  POST /api/kb/intel/items/[id]/approve
  Body: { admin_staff_id }

  Publishes the item's gemini_summary into documents (live, external_intel),
  sets document_id on the item, marks it approved.
*/
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { admin_staff_id } = await req.json().catch(() => ({}))

  if (!(await isKbAdmin(admin_staff_id))) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const { data: item, error: itemErr } = await supabaseAdmin
    .from('kb_intel_items')
    .select('*, kb_intel_sources(category)')
    .eq('id', id)
    .single()

  if (itemErr || !item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  if (item.status !== 'pending') return NextResponse.json({ error: `Item is already ${item.status}` }, { status: 409 })
  if (!item.gemini_summary) return NextResponse.json({ error: 'No summary available to publish.' }, { status: 422 })

  const docCategory = SOURCE_CATEGORY_TO_DOC_CATEGORY[item.kb_intel_sources?.category] ?? 'external_press'
  const docId = randomUUID()
  const wordCount = item.gemini_summary.split(/\s+/).filter(Boolean).length

  const { data: doc, error: docErr } = await supabaseAdmin
    .from('documents')
    .insert({
      id: docId,
      document_group_id: docId,
      version: 1,
      title: item.title ?? item.url,
      type: 'external_intel',
      extracted_text: item.gemini_summary,
      word_count: wordCount,
      visibility: 'all',
      layer: 'knowledge_base',
      department: 'all',
      min_level: 'all',
      pilot_use: true,
      doc_category: docCategory,
      status: 'live',
      is_active: true,
      source_url: item.url,
      ai_reasoning: `Approved from Press Intelligence review queue (score ${item.gemini_score ?? 'n/a'}).`,
      confidence: item.gemini_score ?? 70,
      reviewed_by: admin_staff_id === 'super-admin' ? null : admin_staff_id,
      flagged: false,
    })
    .select('id, title')
    .single()

  if (docErr) return NextResponse.json({ error: docErr.message }, { status: 500 })

  const { data: updatedItem, error: updateErr } = await supabaseAdmin
    .from('kb_intel_items')
    .update({
      status: 'approved',
      reviewed_by: admin_staff_id === 'super-admin' ? null : admin_staff_id,
      reviewed_at: new Date().toISOString(),
      document_id: doc.id,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
  return NextResponse.json({ success: true, item: updatedItem, document: doc })
}
