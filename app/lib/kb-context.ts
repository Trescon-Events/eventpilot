import { supabaseAdmin } from '@/app/lib/supabase'
import { canAccessDocument, LEVEL_RANK } from '@/app/lib/kb/access'

export interface KBContextDoc { id: string; title: string; type: string }
export interface KBContextResult { text: string; documents: KBContextDoc[] }

export interface GetKBContextOptions {
  /** Staff member the context is being built for — access-filtered by their department/job_level. Omit for internal admin tools (unrestricted). */
  staffId?: string
  /** Only include documents of these `type` values, e.g. ['proposal', 'event_report']. Omit for any type. */
  types?: string[]
  /** Only include documents of these `doc_category` values, e.g. ['business_development', 'company_knowledge']. Omit for any category. */
  categories?: string[]
  /** Only include documents flagged pilot_use=true (the default, used by Pilot AI chat). Generator tools loading proposals/reports for drafting should pass false. */
  pilotUseOnly?: boolean
  /** Max number of documents to include. */
  limit?: number
  /** Max characters of extracted_text to include per document, to bound prompt size. */
  maxCharsPerDoc?: number
}

/**
 * Fetches KB documents a staff member (or an unrestricted internal tool, if
 * staffId is omitted) can access, and formats them as a text block ready to
 * inject into a Gemini prompt. Shared by Pilot AI (/api/ask) and the
 * generator tools (Proposal Creator, PER Creator, Project Brief Generator).
 */
export async function getKBContext(opts: GetKBContextOptions = {}): Promise<KBContextResult> {
  const { staffId, types, categories, pilotUseOnly = true, limit = 6, maxCharsPerDoc = 2000 } = opts

  const runQuery = (applyCategories: boolean) => {
    let query = supabaseAdmin
      .from('documents')
      .select('id, title, type, extracted_text, layer, department, min_level, pilot_use')
      .eq('is_active', true)
      .eq('status', 'live')
      .is('superseded_by', null)

    if (pilotUseOnly) query = query.eq('pilot_use', true)
    if (types?.length) query = query.in('type', types)
    if (applyCategories && categories?.length) query = query.in('doc_category', categories)

    return query
  }

  let { data: allDocs } = await runQuery(true)
  // A categories filter that matches nothing (e.g. older docs still tagged
  // 'uncategorised') shouldn't silently starve a generator of reference
  // material — fall back to the unfiltered query rather than returning empty.
  if (categories?.length && !allDocs?.length) {
    ;({ data: allDocs } = await runQuery(false))
  }
  if (!allDocs?.length) return { text: '', documents: [] }

  let staffDept  = ''
  let staffLevel = LEVEL_RANK.super_admin // no staffId → internal tool, unrestricted

  if (staffId) {
    const { data: staff } = await supabaseAdmin
      .from('staff_members')
      .select('department, job_level')
      .eq('id', staffId)
      .single()
    staffDept  = (staff?.department ?? '').toLowerCase()
    staffLevel = LEVEL_RANK[staff?.job_level ?? 'staff'] ?? 0
  }

  const accessible = allDocs
    .filter(doc => canAccessDocument(doc, staffDept, staffLevel))
    .slice(0, limit)

  if (!accessible.length) return { text: '', documents: [] }

  const text = accessible
    .map(d => `=== ${d.title} (${d.type}) ===\n${d.extracted_text.slice(0, maxCharsPerDoc)}`)
    .join('\n\n---\n\n')

  return { text, documents: accessible.map(d => ({ id: d.id, title: d.title, type: d.type })) }
}
