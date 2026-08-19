'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, SelectHTMLAttributes } from 'react'

/** Neutral filter dropdown styling — a plain, compact select, distinct from the colored value pills used for status/priority cells. */
export const PILL_FILTER_STYLE: CSSProperties = {
  background: 'var(--border-light)',
  color: 'var(--ink2)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  padding: '6px 10px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
}

const AVATAR_COLORS = ['var(--teal-mid)', 'var(--indigo)', 'var(--purple)', 'var(--amber)', 'var(--red)', 'var(--lime)']

function hashName(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return h
}

export function Avatar({ name, size = 26 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
  const color = AVATAR_COLORS[hashName(name) % AVATAR_COLORS.length]
  return (
    <span
      title={name}
      style={{
        width: size, height: size, borderRadius: '50%', background: color, color: 'var(--surface)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        fontSize: size * 0.42, fontWeight: 800, letterSpacing: '-0.2px',
      }}
    >
      {initials}
    </span>
  )
}

// fg/chevronHex must match — fg is the CSS var used for the visible text
// (resolves fine, it's real inline style on a real element), chevronHex is
// the same color as a literal hex because it's baked into a data: URI SVG,
// which can't see the page's CSS custom properties.
const PILL_COLORS: Record<string, { bg: string; fg: string; chevronHex: string }> = {
  grey:   { bg: 'var(--border-light)', fg: 'var(--ink3)',   chevronHex: '7E93A1' },
  purple: { bg: 'var(--purple-light)', fg: 'var(--purple)', chevronHex: 'A78BFA' },
  teal:   { bg: 'var(--teal-light)',   fg: 'var(--teal)',   chevronHex: '0EA79D' },
  red:    { bg: 'var(--red-light)',    fg: 'var(--red)',    chevronHex: 'F1667A' },
  amber:  { bg: 'var(--amber-light)',  fg: 'var(--amber)',  chevronHex: 'F5B94D' },
}

type PillSelectProps = SelectHTMLAttributes<HTMLSelectElement> & { pillColor: keyof typeof PILL_COLORS }

/** A native <select> styled to look like a colored pill instead of a boxy dropdown — keeps full accessibility/keyboard behavior of a real <select>, just skins it. */
export function PillSelect({ pillColor, style, ...rest }: PillSelectProps) {
  const c = PILL_COLORS[pillColor]
  return (
    <select
      {...rest}
      style={{
        appearance: 'none',
        background: c.bg,
        color: c.fg,
        border: 'none',
        borderRadius: '999px',
        padding: '4px 22px 4px 10px',
        fontSize: '12px',
        fontWeight: 700,
        cursor: 'pointer',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23${c.chevronHex}' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 8px center',
        ...style,
      }}
    >
      {rest.children}
    </select>
  )
}

export type ComboOption = { id: string; label: string; sublabel?: string }

interface SearchableSelectProps {
  options: ComboOption[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  /** If set, shown as an always-available first row representing "no selection" (id ''). */
  emptyOptionLabel?: string
  /** Smaller trigger height for inline table cells vs. the full modal form field. */
  compact?: boolean
}

/**
 * A text-searchable dropdown — trigger looks like a normal field, clicking it
 * opens a search box + filtered list. Built by hand (no combobox library is
 * installed in this app) to match the existing lightweight component style.
 * Keyboard: type to filter, ↑/↓ to move, Enter to pick, Esc to close.
 */
export function SearchableSelect({ options, value, onChange, placeholder = 'Search…', emptyOptionLabel, compact }: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = options.find(o => o.id === value) ?? null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(o => o.label.toLowerCase().includes(q) || (o.sublabel ?? '').toLowerCase().includes(q))
  }, [options, query])

  const listItems: ComboOption[] = emptyOptionLabel ? [{ id: '', label: emptyOptionLabel }, ...filtered] : filtered

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  function openDropdown() {
    setOpen(true)
    setQuery('')
    setHighlight(0)
    setTimeout(() => searchRef.current?.focus(), 0)
  }

  function pick(option: ComboOption) {
    onChange(option.id)
    setOpen(false)
    setQuery('')
  }

  function onKeyDown(e: React.KeyboardEvent) {
    // Stop propagation on every handled key — this box can be used inside
    // TaskModal, which has its own window-level Escape/Enter listener for
    // closing/saving the whole modal. Without this, Escape here would also
    // close the modal, and Enter here could double-fire the modal's handler.
    if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); setQuery(''); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setHighlight(h => Math.min(h + 1, listItems.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setHighlight(h => Math.max(h - 1, 0)); return }
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (listItems[highlight]) pick(listItems[highlight]); return }
  }

  const triggerLabel = selected ? selected.label : (emptyOptionLabel ?? placeholder)

  return (
    <div ref={containerRef} style={{ position: 'relative', width: compact ? 'auto' : '100%' }}>
      <button
        type="button"
        onClick={() => {
          if (open) { setOpen(false); setQuery('') }
          else openDropdown()
        }}
        className={compact ? undefined : 'tfield'}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px',
          width: '100%', textAlign: 'left', cursor: 'pointer',
          background: compact ? 'transparent' : undefined,
          border: compact ? 'none' : undefined,
          padding: compact ? '2px 4px' : undefined,
          color: selected ? 'var(--ink)' : 'var(--ink3)',
          fontSize: compact ? '13px' : undefined,
          fontWeight: compact ? 600 : undefined,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{triggerLabel}</span>
        <span style={{ color: 'var(--ink4)', fontSize: '10px', flexShrink: 0 }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200,
            width: compact ? '220px' : '100%', minWidth: '200px',
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px',
            boxShadow: 'var(--shadow-md)', overflow: 'hidden',
          }}
        >
          <input
            ref={searchRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setHighlight(0) }}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            style={{
              width: '100%', boxSizing: 'border-box', background: 'var(--border-light)', border: 'none',
              borderBottom: '1px solid var(--border)', outline: 'none', color: 'var(--ink)', fontSize: '13px',
              padding: '10px 12px',
            }}
          />
          <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
            {listItems.length === 0 && (
              <div style={{ padding: '14px 12px', fontSize: '12px', color: 'var(--ink4)', textAlign: 'center' }}>No matches</div>
            )}
            {listItems.map((item, i) => (
              <div
                key={item.id || '__empty__'}
                onMouseDown={e => { e.preventDefault(); pick(item) }}
                onMouseEnter={() => setHighlight(i)}
                style={{
                  padding: '8px 12px', cursor: 'pointer', fontSize: '13px',
                  background: i === highlight ? 'var(--card-hi)' : 'transparent',
                  color: item.id === value ? 'var(--teal)' : 'var(--ink2)',
                  fontWeight: item.id === value ? 700 : 500,
                }}
              >
                {item.label}
                {item.sublabel && <span style={{ color: 'var(--ink4)', fontWeight: 400 }}> · {item.sublabel}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
