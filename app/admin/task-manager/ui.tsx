'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, SelectHTMLAttributes } from 'react'

/** Neutral filter dropdown styling — a plain, compact select, distinct from the colored value pills used for status/priority cells. */
export const PILL_FILTER_STYLE: CSSProperties = {
  background: 'var(--surface)',
  color: 'var(--ink2)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  padding: '0 10px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  height: '36px',
  outline: 'none',
  transition: 'all 0.15s ease',
}

export const ACTIVE_PILL_FILTER_STYLE: CSSProperties = {
  background: 'var(--teal-light)',
  color: 'var(--teal)',
  border: '1px solid var(--teal)',
  borderRadius: '8px',
  padding: '0 10px',
  fontSize: '12px',
  fontWeight: 700,
  cursor: 'pointer',
  height: '36px',
  outline: 'none',
  transition: 'all 0.15s ease',
}

export const CUSTOM_SCROLLBAR_STYLE: CSSProperties = {
  scrollbarWidth: 'thin',
  scrollbarColor: 'var(--border) transparent',
}

export function TaskManagerStyles() {
  return (
    <style jsx global>{`
      .tm-scroll {
        scrollbar-width: thin;
        scrollbar-color: var(--border) transparent;
      }
      .tm-scroll::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }
      .tm-scroll::-webkit-scrollbar-track {
        background: transparent;
      }
      .tm-scroll::-webkit-scrollbar-thumb {
        background: var(--border);
        border-radius: 4px;
      }
      .tm-scroll::-webkit-scrollbar-thumb:hover {
        background: var(--teal-mid);
      }
    `}</style>
  )
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
 * A direct typeable dropdown — input allows immediate typing to search/select,
 * and automatically sorts all options in ascending alphabetical order.
 * Keyboard: type to filter, ↑/↓ to navigate, Enter to select, Esc to close.
 */
export function SearchableSelect({ options, value, onChange, placeholder = 'Search…', emptyOptionLabel, compact }: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sort options ascending (A-Z) by label
  const sortedOptions = useMemo(() => {
    return [...options].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
  }, [options])

  const selected = sortedOptions.find(o => o.id === value) ?? null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sortedOptions
    return sortedOptions.filter(o => o.label.toLowerCase().includes(q) || (o.sublabel ?? '').toLowerCase().includes(q))
  }, [sortedOptions, query])

  const listItems: ComboOption[] = useMemo(() => {
    if (!emptyOptionLabel) return filtered
    if (query && !emptyOptionLabel.toLowerCase().includes(query.toLowerCase())) {
      return filtered
    }
    return [{ id: '', label: emptyOptionLabel }, ...filtered]
  }, [emptyOptionLabel, filtered, query])

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

  function pick(option: ComboOption) {
    onChange(option.id)
    setOpen(false)
    setQuery('')
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); setQuery(''); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault(); e.stopPropagation()
      if (!open) setOpen(true)
      setHighlight(h => Math.min(h + 1, Math.max(0, listItems.length - 1)))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation()
      if (!open) setOpen(true)
      setHighlight(h => Math.max(h - 1, 0))
      return
    }
    if (e.key === 'Enter') {
      if (open && listItems[highlight]) {
        e.preventDefault(); e.stopPropagation()
        pick(listItems[highlight])
      }
    }
  }

  const displayValue = open ? query : (selected ? selected.label : '')

  return (
    <div ref={containerRef} style={{ position: 'relative', width: compact ? 'auto' : '100%', minWidth: compact ? '160px' : 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', position: 'relative', width: '100%' }}>
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={e => {
            setQuery(e.target.value)
            if (!open) setOpen(true)
            setHighlight(0)
          }}
          onFocus={() => {
            setOpen(true)
            setQuery('')
            setHighlight(0)
          }}
          onKeyDown={onKeyDown}
          placeholder={selected ? selected.label : (emptyOptionLabel ?? placeholder)}
          style={{
            width: '100%',
            padding: compact ? '6px 24px 6px 8px' : '9px 28px 9px 12px',
            fontSize: compact ? '12px' : '13px',
            fontWeight: 500,
            background: compact ? 'transparent' : 'var(--surface)',
            border: compact ? 'none' : '1px solid var(--border)',
            borderRadius: compact ? '6px' : '8px',
            color: 'var(--ink)',
            outline: 'none',
            cursor: 'text',
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            if (open) {
              setOpen(false)
              setQuery('')
            } else {
              setOpen(true)
              setQuery('')
              inputRef.current?.focus()
            }
          }}
          style={{
            position: 'absolute',
            right: '8px',
            background: 'none',
            border: 'none',
            color: 'var(--ink4)',
            fontSize: '10px',
            cursor: 'pointer',
            padding: '2px',
          }}
        >
          ▾
        </button>
      </div>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 300,
            width: compact ? '240px' : '100%',
            minWidth: '220px',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            boxShadow: 'var(--shadow-md)',
            overflow: 'hidden',
          }}
        >
          <div className="tm-scroll" style={{ maxHeight: '240px', overflowY: 'auto', ...CUSTOM_SCROLLBAR_STYLE }}>
            {listItems.length === 0 && (
              <div style={{ padding: '12px', fontSize: '12px', color: 'var(--ink4)', textAlign: 'center' }}>No matches</div>
            )}
            {listItems.map((item, i) => (
              <div
                key={item.id || '__empty__'}
                onMouseDown={e => { e.preventDefault(); pick(item) }}
                onMouseEnter={() => setHighlight(i)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  background: i === highlight ? 'var(--card-hi)' : 'transparent',
                  color: item.id === value ? 'var(--teal)' : 'var(--ink)',
                  fontWeight: item.id === value ? 700 : 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>{item.label}</span>
                {item.sublabel && <span style={{ color: 'var(--ink4)', fontSize: '11px' }}>{item.sublabel}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
