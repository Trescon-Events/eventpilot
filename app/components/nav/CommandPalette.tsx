'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getModuleRegistry } from '@/app/lib/registry/modules'
import { useNavData } from '@/app/lib/nav/NavDataContext'
import { flattenForSearch, type PaletteEntry } from '@/app/lib/nav/paletteIndex'

/*
  Cmd+K / Ctrl+K navigation palette. Mounted once (AppShellRoot, alongside
  AppSidebar) so the shortcut works from anywhere without per-page opt-in.
  Reads the exact same NavDataContext data the sidebar already fetched —
  see paletteIndex.tsx's header comment for why that's the whole point.
*/
export default function CommandPalette() {
  const router = useRouter()
  const { session, sidebarKeys, eventsData } = useNavData()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const entries = useMemo(() => {
    const registry = getModuleRegistry()
    const accessibleKeys = new Set(sidebarKeys ?? [])
    return flattenForSearch(registry, accessibleKeys, eventsData, { staffId: session?.sid })
  }, [sidebarKeys, eventsData, session?.sid])

  const results = useMemo(() => {
    if (!query.trim()) return entries.slice(0, 20)
    const q = query.toLowerCase()
    return entries.filter(e => e.keywords.includes(q)).slice(0, 20)
  }, [entries, query])

  // Reset + focus happen directly at the point state actually changes
  // (here, and in the keydown handler below) rather than via a "when open
  // becomes true" effect — avoids an extra render pass for what's really
  // just part of the same user action.
  function openPalette() {
    setQuery('')
    setActiveIndex(0)
    setOpen(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function onQueryChange(next: string) {
    setQuery(next)
    setActiveIndex(0)
  }

  // Global shortcut — skip while focus is already inside a text input/
  // contenteditable elsewhere on the page, so this doesn't fight a page's
  // own keyboard handling (several pages already use Cmd+other-key
  // shortcuts locally; none currently claim Cmd/Ctrl+K, confirmed by grep).
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        const el = document.activeElement
        const isEditable = el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
        if (isEditable && !open) return
        e.preventDefault()
        if (open) setOpen(false)
        else openPalette()
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  function go(entry: PaletteEntry) {
    setOpen(false)
    router.push(entry.href)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); const entry = results[activeIndex]; if (entry) go(entry) }
  }

  if (!open) return null

  return (
    <div
      onClick={() => setOpen(false)}
      // 1500: above PlatformMenu's own full-screen overlay (zIndex 1000, the
      // highest other "opened from anywhere" surface) — Cmd+K should be
      // reachable on top of virtually everything short of the handful of
      // one-off widget z-indexes above 2000 in this codebase.
      style={{ position: 'fixed', inset: 0, zIndex: 1500, background: 'var(--overlay-scrim)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '14vh' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '560px', maxWidth: 'calc(100vw - 32px)', maxHeight: '60vh', display: 'flex', flexDirection: 'column',
          background: 'var(--card)', border: '1px solid var(--border-light)', borderRadius: '14px', boxShadow: 'var(--shadow-md)',
          fontFamily: 'var(--font-manrope), Manrope, sans-serif', overflow: 'hidden',
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Jump to a tool or an event…"
          style={{
            padding: '16px 18px', border: 'none', borderBottom: '1px solid var(--border-light)', background: 'transparent',
            color: 'var(--ink)', fontSize: '15px', fontFamily: 'inherit', outline: 'none',
          }}
        />
        <div style={{ overflowY: 'auto', padding: '6px' }}>
          {results.length === 0 ? (
            <div style={{ padding: '18px', fontSize: '13px', color: 'var(--ink4)', textAlign: 'center' }}>No matches.</div>
          ) : (
            results.map((entry, i) => (
              <button
                key={entry.id}
                onClick={() => go(entry)}
                onMouseEnter={() => setActiveIndex(i)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                  border: 'none', borderRadius: '9px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  background: i === activeIndex ? `${entry.color}14` : 'transparent',
                }}
              >
                <span style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: entry.color }}>
                  {entry.icon}
                </span>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.label}
                </span>
                {entry.sublabel && (
                  <span style={{ marginLeft: 'auto', fontSize: '11.5px', fontWeight: 600, color: 'var(--ink4)', flexShrink: 0 }}>
                    {entry.sublabel}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
