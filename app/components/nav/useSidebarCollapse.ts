'use client'

import { useCallback, useState } from 'react'

/*
  Persistent sidebar collapse state — two independent pieces:
    - `collapsed`: the user's explicit toggle (icon rail vs full width),
      persisted to localStorage so it survives reloads. NOT synced across
      devices/browsers — a DB-backed staff_preferences row would give that,
      but this is zero-migration and the simpler default; revisit only if
      cross-device parity is actually requested.
    - `hovering`: transient, only meaningful while collapsed — the rail
      visually expands on hover without changing the reserved layout width,
      so hovering never causes a reflow of the page content next to it.
*/

const STORAGE_KEY = 'eventpilot.sidebar.collapsed'

// Lazy initializer (not an effect) so there's no extra render pass — SSR
// and the first client render both start from `false` (no `window`),
// then the real client render immediately after reads the stored value.
// A one-tick flash on first paint is an accepted tradeoff for a purely
// visual collapse toggle; not worth an effect-driven second render for.
function readStoredCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeStoredCollapsed(next: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
  } catch {
    // best-effort persistence only
  }
}

export function useSidebarCollapse() {
  const [collapsed, setCollapsedState] = useState(readStoredCollapsed)
  const [hovering, setHovering] = useState(false)

  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next)
    if (next) setHovering(false)
    writeStoredCollapsed(next)
  }, [])

  return {
    collapsed,
    setCollapsed,
    hovering,
    setHovering,
    // The rail should render icon-only right now — collapsed and not
    // currently being hovered over.
    collapsedRail: collapsed && !hovering,
  }
}
