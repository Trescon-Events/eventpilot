'use client'

import { useState } from 'react'

/*
  Persistent sidebar hover state (2026-08-18 rework) — always rendered as
  an icon-only rail; hovering expands it to full width, and it snaps back
  to the rail the instant the pointer leaves. No manual toggle, no
  persisted preference — deliberately removed after Madhu found the
  earlier manual collapse/expand button unnecessary friction. The only
  state that matters is "is the pointer over it right now."
*/
export function useSidebarCollapse() {
  const [hovering, setHovering] = useState(false)

  return {
    hovering,
    setHovering,
    // The rail renders icon-only whenever the pointer isn't over it.
    collapsedRail: !hovering,
  }
}
