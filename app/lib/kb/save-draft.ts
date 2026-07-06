import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/app/lib/supabase'

export interface SaveDraftDocumentInput {
  title: string
  type: string
  content: string
  layer: string
  department: string
  min_level: string
  pilot_use: boolean
  ai_reasoning: string
  doc_category?: string
  workspace_id?: string | null
  submitted_by?: string | null
  source_url?: string | null
  confidence?: number
}

/**
 * Inserts a new KB document as a draft (status: 'pending') — awaiting admin
 * review via the existing PATCH /api/documents/review endpoint (approve →
 * live, reject → rejected). Shared by /api/kb/ingest and the generator tools
 * (Proposal Creator, PER Creator, Project Brief Generator).
 */
export async function saveDraftDocument(input: SaveDraftDocumentInput) {
  const id = randomUUID()
  const wordCount = input.content.split(/\s+/).filter(Boolean).length

  const { data, error } = await supabaseAdmin
    .from('documents')
    .insert({
      id,
      document_group_id: id,
      version: 1,
      title: input.title,
      type: input.type,
      extracted_text: input.content,
      word_count: wordCount,
      visibility: 'all',
      layer: input.layer,
      department: input.department,
      min_level: input.min_level,
      pilot_use: input.pilot_use,
      doc_category: input.doc_category ?? 'uncategorised',
      status: 'pending',
      is_active: true,
      source_url: input.source_url ?? null,
      workspace_id: input.workspace_id ?? null,
      submitted_by: input.submitted_by ?? null,
      ai_reasoning: input.ai_reasoning,
      confidence: input.confidence ?? 90,
      flagged: false,
    })
    .select('id, title, type, layer, department, min_level, pilot_use, doc_category, status, source_url, word_count')
    .single()

  if (error) throw error
  return data
}
