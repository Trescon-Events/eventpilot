// Shared "who resolved this approval round" logic (2026-09-22, per Madhu)
// — External and Client approval both send one "main" recipient (the
// speaker, or the event's Primary client contact) plus zero or more CC'd
// people, each with their OWN independently-tracked review link. Until
// this change, only the main/"primary" row's decision ever gated
// anything; everyone else's was recorded but purely informational.
// Changed because high-profile speakers/clients often have an assistant
// or office who actually reads and acts on these emails first — Madhu's
// call: whichever person (main or any CC) responds FIRST is the decision
// for the whole round, and every other still-pending link for that round
// should immediately show "already handled by X" the moment it's opened.
//
// Both approve/route.ts (the write path, which must also LOCK the round
// the instant any row resolves) and every gating check (Publishing
// readiness, the client-approval prerequisite, the announcements list's
// display status) call resolveApprovalRound() so there is exactly one
// place that decides "what does this round's status actually mean" —
// never a single row read in isolation.
import { supabaseAdmin } from '@/app/lib/supabase'

export type ApprovalRoundStatus = 'none' | 'pending' | 'approved' | 'approved_with_comments' | 'changes_requested'

export type ApprovalRoundResolution = {
  status: ApprovalRoundStatus
  comments: string | null
  actioned_at: string | null
  // Who actually resolved it — null while status is 'none'/'pending', or
  // for a pre-2026-09-22 round that predates per-CC tracking entirely.
  resolved_by_name: string | null
  resolved_by_email: string | null
  // The round's own notified_at (when the MAIN send went out) — kept
  // separate from resolved_by_*, which is about the DECISION, not the send.
  notified_at: string | null
}

type MainRow = {
  status: string; comments: string | null; actioned_at: string | null; notified_at: string | null
  external_name: string | null; external_email: string | null
} | null
type CcRow = { status: string; comments: string | null; actioned_at: string | null; name: string | null; email: string | null }

const UNSENT: ApprovalRoundResolution = { status: 'none', comments: null, actioned_at: null, resolved_by_name: null, resolved_by_email: null, notified_at: null }

// Pure — takes already-fetched rows so the list route (which needs this
// for many announcements at once) can do one batched query and call this
// per item, rather than N round-trips.
export function resolveApprovalRound(main: MainRow, ccRows: CcRow[]): ApprovalRoundResolution {
  if (!main) return UNSENT

  const candidates: { status: string; comments: string | null; actioned_at: string | null; name: string | null; email: string | null }[] = []
  if (main.status !== 'pending') candidates.push({ status: main.status, comments: main.comments, actioned_at: main.actioned_at, name: main.external_name, email: main.external_email })
  for (const cc of ccRows) if (cc.status !== 'pending') candidates.push(cc)

  if (candidates.length === 0) {
    return { status: main.status as ApprovalRoundStatus, comments: main.comments, actioned_at: main.actioned_at, resolved_by_name: null, resolved_by_email: null, notified_at: main.notified_at }
  }

  // Earliest actioned_at is the real decision. Normally there's exactly
  // one candidate here at all — the write path (approve/route.ts) refuses
  // a second decision once the round is resolved — this sort only matters
  // for a genuine race (two people submitting within the same instant).
  candidates.sort((a, b) => new Date(a.actioned_at ?? 0).getTime() - new Date(b.actioned_at ?? 0).getTime())
  const winner = candidates[0]
  return {
    status: winner.status as ApprovalRoundStatus, comments: winner.comments, actioned_at: winner.actioned_at,
    resolved_by_name: winner.name, resolved_by_email: winner.email, notified_at: main.notified_at,
  }
}

function ccTableFor(layer: 'external' | 'client'): 'announcement_external_approval_cc' | 'announcement_client_approval_cc' {
  return layer === 'client' ? 'announcement_client_approval_cc' : 'announcement_external_approval_cc'
}

// Fetch-and-resolve for a single announcement/layer — the shape every
// gating check (checkCanPublish, checkClientApprovalPrerequisite) needs.
// Always looks at the MOST RECENT main row for this layer (a resend
// creates a fresh round), same "latest round only" convention every
// caller of this table already used before this change.
export async function fetchAndResolveApprovalRound(announcementId: string, layer: 'external' | 'client'): Promise<ApprovalRoundResolution> {
  const { data: mainRows } = await supabaseAdmin
    .from('announcement_approvals')
    .select('id, status, comments, actioned_at, notified_at, external_name, external_email')
    .eq('announcement_id', announcementId).eq('layer', layer)
    .order('created_at', { ascending: false }).limit(1)
  const main = mainRows?.[0] ?? null
  if (!main) return UNSENT

  const { data: ccRows } = await supabaseAdmin
    .from(ccTableFor(layer))
    .select('status, comments, actioned_at, name, email')
    .eq('parent_approval_id', main.id)

  return resolveApprovalRound(main, ccRows ?? [])
}

export type LocatedApproval =
  | { kind: 'main'; layer: 'internal' | 'external' | 'client'; id: string; status: string; token_expires_at: string | null }
  | { kind: 'cc'; layer: 'external' | 'client'; id: string; status: string; token_expires_at: string | null; parent_approval_id: string }

// Resolves a public review token to exactly the one row it belongs to —
// the main announcement_approvals row (any layer), or a CC row in either
// per-layer CC table. Shared by review-data/route.ts (read) and
// approve/route.ts (write) so there is one lookup, not two slightly
// different copies.
export async function locateApprovalToken(announcementId: string, token: string): Promise<LocatedApproval | null> {
  const { data: main } = await supabaseAdmin
    .from('announcement_approvals')
    .select('id, layer, status, token_expires_at')
    .eq('announcement_id', announcementId).eq('approval_token', token)
    .maybeSingle()
  if (main) return { kind: 'main', layer: main.layer as 'internal' | 'external' | 'client', id: main.id, status: main.status, token_expires_at: main.token_expires_at }

  for (const layer of ['client', 'external'] as const) {
    const { data: cc } = await supabaseAdmin
      .from(ccTableFor(layer))
      .select('id, status, token_expires_at, parent_approval_id, parent:parent_approval_id(announcement_id)')
      .eq('approval_token', token)
      .maybeSingle()
    const parent = cc ? (Array.isArray(cc.parent) ? cc.parent[0] : cc.parent) : null
    if (cc && parent?.announcement_id === announcementId) {
      return { kind: 'cc', layer, id: cc.id, status: cc.status, token_expires_at: cc.token_expires_at, parent_approval_id: cc.parent_approval_id }
    }
  }
  return null
}

// Round-wide resolution for a LOCATED token (external/client only —
// 'internal' never uses this, it stays its own aggregate-all-approvers
// rule in approve/route.ts). Given a located row's own main-row id (its
// own id if it IS the main row, or parent_approval_id if it's a CC row)
// and layer, finds the round's main row + CC siblings and resolves them
// together — used so a CC'd viewer sees a sibling's resolution (main OR
// another CC) even though their own row was never itself actioned.
export async function resolveRoundForLocated(parentId: string, layer: 'external' | 'client'): Promise<ApprovalRoundResolution> {
  const { data: main } = await supabaseAdmin
    .from('announcement_approvals')
    .select('status, comments, actioned_at, notified_at, external_name, external_email')
    .eq('id', parentId)
    .single()
  const { data: ccRows } = await supabaseAdmin
    .from(ccTableFor(layer))
    .select('status, comments, actioned_at, name, email')
    .eq('parent_approval_id', parentId)
  return resolveApprovalRound(main ?? null, ccRows ?? [])
}
