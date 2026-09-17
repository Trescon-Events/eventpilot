import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'
import { getSession } from '@/app/lib/access/session'
import { hasEventPermission } from '@/app/lib/access/event-access'

export type PressReleaseAuth = {
  pr: { id: string; event_id: string; title: string; status: string }
  staffId: string | null
  isAdmin: boolean
  eventName: string
}

export type PressReleaseVersion = {
  id: string; version_number: number
  headline: string | null; dateline: string | null; body: string; boilerplate: string | null
  approved_at: string | null
}

/** Loads a press_releases row and checks the caller holds `permissionKey` on its event. Shared by the research/generate/approve routes. */
export async function loadPressReleaseAndAuthorize(
  req: NextRequest,
  pressReleaseId: string,
  permissionKey: string
): Promise<{ ok: true; data: PressReleaseAuth } | { ok: false; error: NextResponse }> {
  const { data: pr } = await supabaseAdmin
    .from('press_releases')
    .select('id, event_id, title, status, events(name)')
    .eq('id', pressReleaseId)
    .single()
  if (!pr) return { ok: false, error: NextResponse.json({ error: 'Press release not found' }, { status: 404 }) }

  const session = getSession(req)
  const isAdmin = !!session?.adm
  const authorized = isAdmin || (await hasEventPermission(session?.sid, pr.event_id, permissionKey))
  if (!authorized) return { ok: false, error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }

  const eventName = (Array.isArray(pr.events) ? pr.events[0]?.name : (pr.events as { name?: string } | null)?.name) ?? pr.title

  return {
    ok: true,
    data: { pr: { id: pr.id, event_id: pr.event_id, title: pr.title, status: pr.status }, staffId: session?.sid ?? null, isAdmin, eventName },
  }
}

/*
  Model tiers (2026-09-17) — Gemini 2.5 family retires 16 Oct 2026, so this
  new tool is built on the 3.x lineup from day one rather than the
  gemini-2.5-flash used everywhere else in the codebase (that broader
  migration is a separate, larger piece of work).

  FLASH does the frequent, low-stakes research turns. PRO is reserved for
  the generate step (the one output that actually goes out under Trescon's
  name) and, within research, auto-escalates once a single conversation
  runs long (RESEARCH_ESCALATE_AFTER messages) — a long thread is a decent
  proxy for "this story is genuinely complex," and the per-message cost
  difference is trivial either way. See the chat with Madhu, 2026-09-17,
  for the cost/model reasoning this is based on. */
export const FLASH_MODEL = 'gemini-3.7-flash'
export const PRO_MODEL = 'gemini-3.1-pro-preview'
export const RESEARCH_ESCALATE_AFTER = 14 // history.length (messages) at which a research call switches to PRO_MODEL

// Daily per-staff caps (soft, cost-backstop only — see the cost math from
// the same conversation: worst case is ~$0.20/release, so these exist to
// bound a runaway loop, not to ration real usage). Platform admins bypass
// both, same convention as bd-chat's DAILY_LIMIT.
export const DAILY_CHAT_LIMIT = 60
export const DAILY_GENERATE_LIMIT = 10

function todayStartUTC(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
}

/** Today's research messages sent BY this staffer, across every press release — the daily chat cap is per-person, not per-session. */
export async function countTodayChatMessages(staffId: string): Promise<number> {
  const { data: sessions } = await supabaseAdmin.from('content_research_sessions').select('id').eq('staff_id', staffId)
  const sessionIds = (sessions ?? []).map(s => s.id)
  if (sessionIds.length === 0) return 0

  const { count } = await supabaseAdmin
    .from('content_research_messages')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'user')
    .in('session_id', sessionIds)
    .gte('created_at', todayStartUTC())
  return count ?? 0
}

/** Today's generate calls BY this staffer, across every press release. */
export async function countTodayGenerations(staffId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from('press_release_versions')
    .select('id', { count: 'exact', head: true })
    .eq('generated_by', staffId)
    .gte('created_at', todayStartUTC())
  return count ?? 0
}

/** Most recent version of a press release, regardless of approval state — used to compute the next version_number. */
export async function getLatestVersion(pressReleaseId: string): Promise<PressReleaseVersion | null> {
  const { data } = await supabaseAdmin
    .from('press_release_versions')
    .select('id, version_number, headline, dateline, body, boilerplate, approved_at')
    .eq('press_release_id', pressReleaseId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ?? null
}

/*
  The "current draft" for refine-mode and edits (2026-09-17): the latest
  version IF it's still unapproved. An approved version is frozen — refine-
  chat and apply-edit both treat "no editable draft" the same as "nothing to
  refine yet," and apply-edit copy-on-writes a new version instead of
  touching an approved row. See the refine-chat + compliance-check plan. */
export async function getCurrentEditableVersion(pressReleaseId: string): Promise<PressReleaseVersion | null> {
  const latest = await getLatestVersion(pressReleaseId)
  return latest && !latest.approved_at ? latest : null
}

/*
  Cross-release continuity (2026-09-17) — per Madhu: a new research chat for
  a different press release on the SAME event should already know what's
  been approved before, so the assistant doesn't contradict or flatly repeat
  an earlier release's angle. Scoped to APPROVED versions only ("finalised")
  and to this event (press releases are inherently event-specific) — not a
  company-wide digest. */
export async function getPriorApprovedReleasesContext(eventId: string, excludePressReleaseId: string): Promise<string> {
  const { data: otherReleases } = await supabaseAdmin
    .from('press_releases')
    .select('id')
    .eq('event_id', eventId)
    .neq('id', excludePressReleaseId)
  const otherIds = (otherReleases ?? []).map(r => r.id)
  if (otherIds.length === 0) return ''

  const { data: rows } = await supabaseAdmin
    .from('press_release_versions')
    .select('headline, dateline, approved_at')
    .in('press_release_id', otherIds)
    .not('approved_at', 'is', null)
    .order('approved_at', { ascending: false })
    .limit(5)

  if (!rows?.length) return ''

  return rows
    .map(r => `- [${r.dateline ?? 'undated'}] ${r.headline ?? '(untitled)'} — approved ${new Date(r.approved_at!).toISOString().slice(0, 10)}`)
    .join('\n')
}
