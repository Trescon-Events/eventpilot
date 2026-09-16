'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

// Promoted from app/admin/task-manager/ui.tsx (2026-09-15) into this shared
// barrel — it's generically useful beyond task assignment (first reuse:
// the Agenda Builder's speaker-picker). Relocation only, no behavior
// change; task-manager's own usages now import from here.

const CUSTOM_SCROLLBAR_STYLE: CSSProperties = {
  scrollbarWidth: 'thin',
  scrollbarColor: 'var(--border) transparent',
}

export type ComboOption = { id: string; label: string; sublabel?: string }

interface SearchableSelectProps {
  options: ComboOption[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  /** If set, shown as an always-available first row representing "no selection" (id ''). */
  emptyOptionLabel?: string
  /** Smaller trigger height for inline table cells vs. a full modal form field. */
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
            height: compact ? '36px' : '40px',
            padding: compact ? '6px 24px 6px 8px' : '8px 30px 8px 12px',
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
            fontSize: '11px',
            cursor: 'pointer',
            padding: '4px',
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
            width: compact ? '320px' : '100%',
            minWidth: compact ? '260px' : '100%',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            boxShadow: 'var(--shadow-md)',
            overflow: 'hidden',
          }}
        >
          <div style={{ maxHeight: '280px', overflowY: 'auto', ...CUSTOM_SCROLLBAR_STYLE }}>
            {listItems.length === 0 && (
              <div style={{ padding: '14px', fontSize: '13px', color: 'var(--ink4)', textAlign: 'center' }}>No matches</div>
            )}
            {listItems.map((item, i) => (
              <div
                key={item.id || '__empty__'}
                onMouseDown={e => { e.preventDefault(); pick(item) }}
                onMouseEnter={() => setHighlight(i)}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  background: i === highlight ? 'var(--card-hi)' : 'transparent',
                  color: item.id === value ? 'var(--teal)' : 'var(--ink)',
                  fontWeight: item.id === value ? 700 : 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
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
