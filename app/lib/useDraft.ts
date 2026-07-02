'use client'

/*
  useDraft — the primitive every save-resume-capable tool uses.

  Two responsibilities:

    1. On mount, tell the tool if there's an existing draft for
       (this user, this tool, this event). Tool decides how to prompt
       the user (typically with <DraftReEntryModal>).

    2. Provide a `save({ displayLabel, statusText, toolRecordId })`
       method the tool calls whenever meaningful state changes.
       Upserts into `active_drafts` so the Resume Work sidebar reflects
       it and, if this tool is picked up on a different browser/session,
       we can detect the newer version.

  A `discard()` method removes the draft — used when the tool
  publishes/completes or the user picks "Start New" in the re-entry
  modal.

  Concurrent-user signal:
    `others` is the list of team-shared drafts for the same tool+event
    that belong to OTHER users. Tools can surface this as
    "Prashant is also working on this" without full conflict
    resolution.
*/

import { useCallback, useEffect, useRef, useState } from 'react'

export type DraftInfo = {
  id:                string
  tool_key:          string
  event_id:          string | null
  tool_record_id:    string | null
  display_label:     string
  status_text:       string | null
  last_updated:      string
  shared_with_team:  boolean
  notes:             string | null
  is_mine:           boolean
  owner_name:        string | null
  event_name:        string | null
}

export type SaveArgs = {
  displayLabel:    string
  statusText?:     string | null
  toolRecordId?:   string | null
}

export function useDraft(toolKey: string, eventId?: string | null) {
  const [mine,    setMine]   = useState<DraftInfo | null>(null)
  const [others,  setOthers] = useState<DraftInfo[]>([])
  const [loading, setLoad]   = useState(true)

  // Load once on mount / when tool/event changes
  const load = useCallback(async () => {
    setLoad(true)
    try {
      const res = await fetch('/api/drafts', { cache: 'no-store' })
      const data = await res.json()
      const drafts: DraftInfo[] = Array.isArray(data?.drafts) ? data.drafts : []
      const match  = drafts.find(d => d.tool_key === toolKey && (d.event_id ?? null) === (eventId ?? null))
      const myOne  = match && match.is_mine ? match : null
      const teams  = drafts.filter(d => d.tool_key === toolKey && (d.event_id ?? null) === (eventId ?? null) && !d.is_mine)
      setMine(myOne)
      setOthers(teams)
    } finally {
      setLoad(false)
    }
  }, [toolKey, eventId])

  useEffect(() => { load() }, [load])

  // Throttle saves to at most one per 800ms
  const lastSaveAt = useRef(0)
  const pending    = useRef<SaveArgs | null>(null)
  const timer      = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(async () => {
    const args = pending.current
    if (!args) return
    pending.current = null
    lastSaveAt.current = Date.now()
    await fetch('/api/drafts', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_key:       toolKey,
        event_id:       eventId ?? null,
        display_label:  args.displayLabel,
        status_text:    args.statusText     ?? null,
        tool_record_id: args.toolRecordId   ?? null,
      }),
      keepalive: true,
    }).catch(() => {})
  }, [toolKey, eventId])

  const save = useCallback((args: SaveArgs) => {
    pending.current = args
    const elapsed = Date.now() - lastSaveAt.current
    if (timer.current) clearTimeout(timer.current)
    if (elapsed >= 800) {
      flush()
    } else {
      timer.current = setTimeout(flush, 800 - elapsed)
    }
  }, [flush])

  const discard = useCallback(async () => {
    if (!mine) return
    await fetch(`/api/drafts/${mine.id}`, { method: 'DELETE' }).catch(() => {})
    setMine(null)
  }, [mine])

  const shareWithTeam = useCallback(async (share: boolean) => {
    if (!mine) return
    await fetch(`/api/drafts/${mine.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ shared_with_team: share }),
    }).catch(() => {})
    setMine(m => m ? { ...m, shared_with_team: share } : m)
  }, [mine])

  return { mine, others, loading, save, discard, shareWithTeam, reload: load }
}
