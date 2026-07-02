/*
  Save & Resume — draft registry API.

  Endpoints:
    GET  /api/drafts    — the current user's Resume Work list. Returns
                          their personal drafts + team-shared drafts for
                          events they can see.
    POST /api/drafts    — upsert one draft. Called by tools' auto-save.

  See docs/roadmap-save-resume.md for the full design.

  Self-heal: matches Madhu's admin/pilots pattern (commit 09adff2) — the
  pooler's tenant lookup fails on both local and Railway, so instead of
  a direct pg client we invoke Postgres via the `run_sql` RPC. Safe to
  call every request; it's idempotent.
*/

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

function getSession(req: NextRequest) {
  const raw = req.cookies.get('tcs_session')?.value
  if (!raw) return null
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as { sid: string; adm?: boolean } }
  catch { return null }
}

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS active_drafts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
    tool_key          TEXT NOT NULL,
    event_id          UUID REFERENCES events(id) ON DELETE CASCADE,
    tool_record_id    TEXT,
    display_label     TEXT NOT NULL,
    status_text       TEXT,
    last_updated      TIMESTAMPTZ NOT NULL DEFAULT now(),
    shared_with_team  BOOLEAN NOT NULL DEFAULT false,
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, tool_key, event_id)
  )
`
const CREATE_INDEX_A = `CREATE INDEX IF NOT EXISTS idx_active_drafts_user_recent ON active_drafts (user_id, last_updated DESC)`
const CREATE_INDEX_B = `CREATE INDEX IF NOT EXISTS idx_active_drafts_shared ON active_drafts (event_id, tool_key, last_updated DESC) WHERE shared_with_team = true`

async function ensureTable() {
  try {
    await supabaseAdmin.rpc('run_sql', { query: CREATE_TABLE_SQL })
    await supabaseAdmin.rpc('run_sql', { query: CREATE_INDEX_A })
    await supabaseAdmin.rpc('run_sql', { query: CREATE_INDEX_B })
  } catch (e) {
    console.error('[drafts] ensureTable failed:', e instanceof Error ? e.message : e)
  }
}

/* ── GET /api/drafts ─────────────────────────────────────────────────
   Returns { drafts: [...] } — combined personal + team-shared. */
export async function GET(req: NextRequest) {
  await ensureTable()

  const session = getSession(req)
  if (!session?.sid || session.sid === 'super-admin') {
    return NextResponse.json({ drafts: [] })
  }

  // Personal drafts for this user
  const { data: personal } = await supabaseAdmin
    .from('active_drafts')
    .select('id, tool_key, event_id, tool_record_id, display_label, status_text, last_updated, shared_with_team, notes, user_id')
    .eq('user_id', session.sid)
    .order('last_updated', { ascending: false })
    .limit(10)

  // Team-shared drafts from OTHER users (owner != current user)
  const { data: shared } = await supabaseAdmin
    .from('active_drafts')
    .select('id, tool_key, event_id, tool_record_id, display_label, status_text, last_updated, shared_with_team, notes, user_id')
    .eq('shared_with_team', true)
    .neq('user_id', session.sid)
    .order('last_updated', { ascending: false })
    .limit(10)

  const all = [...(personal ?? []), ...(shared ?? [])]

  // Resolve event names + owner names in one query each
  const eventIds = Array.from(new Set(all.map(d => d.event_id).filter(Boolean))) as string[]
  const ownerIds = Array.from(new Set(all.map(d => d.user_id).filter(Boolean))) as string[]

  const eventNames: Record<string, string> = {}
  const ownerNames: Record<string, string> = {}

  if (eventIds.length) {
    const { data: evs } = await supabaseAdmin.from('events').select('id, name').in('id', eventIds)
    for (const e of evs ?? []) eventNames[e.id] = e.name
  }
  if (ownerIds.length) {
    const { data: sm } = await supabaseAdmin.from('staff_members').select('id, name').in('id', ownerIds)
    for (const s of sm ?? []) ownerNames[s.id] = s.name
  }

  const drafts = all.map(d => ({
    id:                d.id,
    tool_key:          d.tool_key,
    event_id:          d.event_id,
    event_name:        d.event_id ? (eventNames[d.event_id] ?? null) : null,
    tool_record_id:    d.tool_record_id,
    display_label:     d.display_label,
    status_text:       d.status_text,
    last_updated:      d.last_updated,
    shared_with_team:  d.shared_with_team,
    notes:             d.notes,
    is_mine:           d.user_id === session.sid,
    owner_name:        d.user_id === session.sid ? null : (ownerNames[d.user_id] ?? null),
  }))

  return NextResponse.json({ drafts })
}

/* ── POST /api/drafts ─────────────────────────────────────────────────
   Upsert one draft. Body: { tool_key, event_id?, tool_record_id?,
   display_label, status_text? } — used by every tool's auto-save. */
export async function POST(req: NextRequest) {
  await ensureTable()

  const session = getSession(req)
  if (!session?.sid || session.sid === 'super-admin') {
    return NextResponse.json({ ok: true })
  }

  const body = await req.json().catch(() => ({} as {
    tool_key?: string; event_id?: string | null; tool_record_id?: string | null;
    display_label?: string; status_text?: string | null;
  }))

  if (!body.tool_key || !body.display_label) {
    return NextResponse.json({ error: 'tool_key and display_label are required' }, { status: 400 })
  }

  const row = {
    user_id:        session.sid,
    tool_key:       body.tool_key,
    event_id:       body.event_id       ?? null,
    tool_record_id: body.tool_record_id ?? null,
    display_label:  body.display_label,
    status_text:    body.status_text    ?? null,
    last_updated:   new Date().toISOString(),
  }

  // Upsert on the UNIQUE(user_id, tool_key, event_id) constraint
  const { data, error } = await supabaseAdmin
    .from('active_drafts')
    .upsert(row, { onConflict: 'user_id,tool_key,event_id' })
    .select('id')
    .single()

  if (error) {
    console.error('[drafts] upsert failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id: data.id })
}
