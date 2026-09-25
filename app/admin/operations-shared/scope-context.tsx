'use client'

import { createContext, useContext, useMemo } from 'react'

/* Operations Hub pages work at EVENT level or UMBRELLA level (e.g. Dubai Future
   Finance Week). This context tells the shared views which one they're in, and
   gives them the request fragments the ops APIs expect (event_id=… or umbrella_id=…),
   so the same components serve /admin/events/[id]/operations and
   /admin/umbrellas/[id]/operations. An event that sits under an umbrella is lifted
   to the umbrella by the API itself. */

export type OpsScopeCtx = {
  kind: 'event' | 'umbrella'
  id: string
  /** 'event_id' | 'umbrella_id' — the key the ops APIs take. */
  key: 'event_id' | 'umbrella_id'
  /** URL query fragment, e.g. "event_id=abc". */
  query: string
  /** JSON / form fields to spread into request bodies. */
  body: Record<string, string>
  /** Where this scope's Operations pages live. */
  basePath: string
}

const Ctx = createContext<OpsScopeCtx | null>(null)

export function OpsScopeProvider({ kind, id, children }: { kind: 'event' | 'umbrella'; id: string; children: React.ReactNode }) {
  const value = useMemo<OpsScopeCtx>(() => {
    const key = kind === 'umbrella' ? 'umbrella_id' : 'event_id'
    return {
      kind, id, key, query: `${key}=${encodeURIComponent(id)}`, body: { [key]: id },
      basePath: kind === 'umbrella' ? `/admin/umbrellas/${id}/operations` : `/admin/events/${id}/operations`,
    }
  }, [kind, id])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useOpsScope(): OpsScopeCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useOpsScope must be used inside <OpsScopeProvider>')
  return v
}
