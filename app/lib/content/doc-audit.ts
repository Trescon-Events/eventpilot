import type { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'

/* Who did it (2026-10-17). Every messaging-document write records the SIGNED-IN SESSION user taken on the server, never an id the page
   sends (the pages sent none, so most rows were blank). Two parts:
   - actorOf(req): the staff id for the existing per-row columns (uploaded_by, applied_by, answered_by, field-change changed_by).
   - logDocAudit(): one row in messaging_doc_audit per write, including the ones that left no record before (proposed edits, approvals,
     deletes, uploads). Best-effort: a failure to audit never blocks the write, but it is logged. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The signed-in staff id, or null for a missing session or the legacy non-uuid 'super-admin' sentinel. */
export function actorOf(req: NextRequest): string | null {
  const sid = getSession(req)?.sid
  return typeof sid === 'string' && UUID.test(sid) ? sid : null
}

export type DocAuditAction =
  | 'upload' | 'word_upload' | 'patch' | 'delete' | 'propose_edit' | 'apply_edit' | 'approve'
  | 'clarification_answer' | 'suggested_rule_accept' | 'suggested_rule_dismiss'

export async function logDocAudit(
  req: NextRequest,
  entry: { docId: string | null; action: DocAuditAction; owner: { event_id?: string | null; umbrella_id?: string | null; org_scope?: string | null }; detail?: Record<string, unknown> },
): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('messaging_doc_audit').insert({
      doc_id: entry.docId, event_id: entry.owner.event_id ?? null, umbrella_id: entry.owner.umbrella_id ?? null, org_scope: entry.owner.org_scope ?? null,
      action: entry.action, staff_id: actorOf(req), detail: entry.detail ?? null,
    })
    if (error) console.error('[doc-audit] could not record', entry.action, error.message)
  } catch (e) { console.error('[doc-audit] could not record', entry.action, e) }
}

/** For routes that only have the document id. */
export async function logDocAuditById(req: NextRequest, docId: string, action: DocAuditAction, detail?: Record<string, unknown>): Promise<void> {
  const { data } = await supabaseAdmin.from('event_messaging_docs').select('event_id, umbrella_id, org_scope').eq('id', docId).maybeSingle()
  await logDocAudit(req, { docId, action, owner: data ?? {}, detail })
}
