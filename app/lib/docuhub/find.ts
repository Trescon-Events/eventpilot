import { SchemaType, type FunctionDeclaration } from '@google/generative-ai'
import { supabaseAdmin } from '@/app/lib/supabase'
import { docuhubDomain } from '@/app/lib/docuhub/domain'

export interface DocuHubFindResult {
  title: string
  docTypeLabel: string
  eventLabel: string | null
  eventStartDate: string | null
  eventEndDate: string | null
  series: string | null
  link: string
}

/**
 * Metadata-only lookup for "find/locate a document" style questions —
 * deliberately does NOT touch extracted_text or call Gemini itself. Distinct
 * in kind from getKBContext(), which injects full document content for deep
 * analysis. Used as a Gemini function-calling tool from /api/ask so Pilot AI
 * can point someone at a document without that document ever having gone
 * through KB's separate ingestion pipeline.
 */
export async function findDocuHubDocuments(opts: {
  query?: string
  docTypeKey?: string
  eventId?: string
  staffId?: string | null
  limit?: number
}): Promise<DocuHubFindResult[]> {
  const { query, docTypeKey, eventId, staffId, limit = 5 } = opts

  // !inner makes the doc_types.key filter below a real join filter — plain
  // embedded-resource filters in PostgREST return every row regardless of
  // match and just null out non-matching embeds, which would silently shrink
  // (or empty) the result set once .limit() truncates before the null rows
  // could be filtered out below.
  let q = supabaseAdmin
    .from('docuhub_documents')
    .select('title, slug, event_label, event_start_date, event_end_date, series, link_expires_at, visibility, doc_types!inner(key, label, slug_prefix)')
    .eq('is_active', true)
    .or(`link_expires_at.is.null,link_expires_at.gt.${new Date().toISOString()}`)
    .limit(limit)

  if (!staffId) q = q.eq('visibility', 'public')
  if (docTypeKey) q = q.eq('doc_types.key', docTypeKey)
  if (eventId) q = q.eq('event_id', eventId)
  if (query?.trim()) q = q.or(`title.ilike.%${query}%,event_label.ilike.%${query}%`)

  const { data, error } = await q
  if (error || !data) return []

  return data
    .filter((d): d is typeof d & { doc_types: { key: string; label: string; slug_prefix: string } } => !!d.doc_types && !Array.isArray(d.doc_types))
    .map(d => ({
      title: d.title,
      docTypeLabel: d.doc_types.label,
      eventLabel: d.event_label,
      eventStartDate: d.event_start_date,
      eventEndDate: d.event_end_date,
      series: d.series,
      link: `https://${docuhubDomain(d.visibility)}/${d.doc_types.slug_prefix}/${d.slug}`,
    }))
}

export const findDocuHubDocumentsDeclaration: FunctionDeclaration = {
  name: 'find_docuhub_document',
  description: 'Look up a specific document, report, or policy by name, type, or associated event when the user is asking to find, locate, or get a link to something (e.g. "where is the HR policy on X", "find the post-event report for Dubai FinTech Summit"). Do NOT use this for questions asking to analyse, summarise, or explain document content — that is handled separately.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      query: { type: SchemaType.STRING, description: 'Search text — document title or event name to search for' },
      doc_type_key: { type: SchemaType.STRING, description: "Optional document type key, e.g. 'post_event_report', 'bd_proposal', 'hr_policy'" },
    },
    required: [],
  },
}
