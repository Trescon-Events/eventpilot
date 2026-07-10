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
  status?: 'pending' | 'live'
  visibility?: string
  event_id?: string | null
  supersedes_id?: string | null
  version_note?: string | null
  flagged?: boolean
}

/**
 * Inserts a new KB document — status: 'pending' (default, awaiting admin
 * review via PATCH /api/documents/review) or 'live' (General-document path,
 * which publishes immediately like the old /api/documents/upload did).
 * Shared by /api/kb/ingest (both its structured and general branches) and the
 * generator tools (Proposal Creator, PER Creator, Project Brief Generator).
 *
 * When supersedes_id is given, chains this row into that document's existing
 * document_group_id/version sequence and marks the prior row superseded —
 * ported from the retired /api/documents/upload's inline version-chaining logic.
 */
export async function saveDraftDocument(input: SaveDraftDocumentInput) {
  const id = randomUUID()
  const wordCount = input.content.split(/\s+/).filter(Boolean).length

  let documentGroupId: string | null = null
  let version = 1
  if (input.supersedes_id) {
    const { data: prior } = await supabaseAdmin
      .from('documents')
      .select('id, document_group_id, version')
      .eq('id', input.supersedes_id)
      .single()
    if (prior) {
      documentGroupId = prior.document_group_id ?? prior.id
      version = (prior.version ?? 1) + 1
    }
  }

  const { data, error } = await supabaseAdmin
    .from('documents')
    .insert({
      id,
      document_group_id: documentGroupId ?? id,
      version,
      title: input.title,
      type: input.type,
      extracted_text: input.content,
      word_count: wordCount,
      visibility: input.visibility ?? 'all',
      event_id: input.event_id ?? null,
      layer: input.layer,
      department: input.department,
      min_level: input.min_level,
      pilot_use: input.pilot_use,
      doc_category: input.doc_category ?? 'uncategorised',
      status: input.status ?? 'pending',
      is_active: true,
      source_url: input.source_url ?? null,
      workspace_id: input.workspace_id ?? null,
      submitted_by: input.submitted_by ?? null,
      ai_reasoning: input.ai_reasoning,
      confidence: input.confidence ?? 90,
      flagged: input.flagged ?? false,
      version_note: input.supersedes_id ? (input.version_note ?? null) : null,
    })
    .select('id, title, type, layer, department, min_level, pilot_use, doc_category, status, source_url, word_count, version, document_group_id')
    .single()

  if (error) throw error

  if (!documentGroupId) {
    await supabaseAdmin.from('documents').update({ document_group_id: data.id }).eq('id', data.id)
  }
  if (input.supersedes_id) {
    await supabaseAdmin.from('documents').update({ superseded_by: data.id }).eq('id', input.supersedes_id)
  }

  return data
}
