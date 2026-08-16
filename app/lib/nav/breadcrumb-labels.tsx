'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

/* Session-lived cache of raw-path-value → human-readable label, e.g.
   "5e2f89f4-49aa-4358-9791-f7654685246d" → "World AI Show Malaysia"
   (2026-08-14, per Madhu). deriveBreadcrumbs() (breadcrumbs.ts) is a pure
   function of the pathname + module registry — it has no way to know an
   event's real name or a stakeholder's real name, so this is the missing
   piece: any page that already knows a human name for a dynamic segment it
   just fetched calls useBreadcrumbLabel(id, name) once, and GlobalShell's
   breadcrumb trail picks it up immediately, for the rest of the session,
   on every page that segment ever appears on again — not just the page
   that registered it. Keyed by the raw VALUE (not position or route), so
   there's no collision risk between different kinds of IDs sharing this
   cache, and no need to clear on unmount: a UUID always means the same
   thing everywhere it shows up.

   Provider is mounted once, alongside GlobalShell, in AuthedShellGate — see
   its own comment for why that's the one place guaranteed to wrap every
   authenticated page without unmounting between navigations. */

type LabelMap = Record<string, string>

const BreadcrumbLabelsContext = createContext<{
  labels: LabelMap
  setLabel: (value: string, label: string) => void
} | null>(null)

export function BreadcrumbLabelsProvider({ children }: { children: React.ReactNode }) {
  const [labels, setLabels] = useState<LabelMap>({})

  const setLabel = useCallback((value: string, label: string) => {
    setLabels(prev => (prev[value] === label ? prev : { ...prev, [value]: label }))
  }, [])

  const ctx = useMemo(() => ({ labels, setLabel }), [labels, setLabel])

  return <BreadcrumbLabelsContext.Provider value={ctx}>{children}</BreadcrumbLabelsContext.Provider>
}

export function useBreadcrumbLabels(): LabelMap {
  const ctx = useContext(BreadcrumbLabelsContext)
  return ctx?.labels ?? {}
}

/** Call from any page once it knows a human-readable name for a dynamic
    path segment it's currently showing (an event's name, a stakeholder's
    name, ...). No-ops until both `value` and `label` are truthy, so it's
    safe to call every render before a fetch has resolved. */
export function useBreadcrumbLabel(value: string | null | undefined, label: string | null | undefined) {
  const ctx = useContext(BreadcrumbLabelsContext)
  useEffect(() => {
    if (!ctx || !value || !label) return
    ctx.setLabel(value, label)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ctx.setLabel is stable (useCallback); only re-run when the actual value/label pair changes
  }, [value, label])
}
