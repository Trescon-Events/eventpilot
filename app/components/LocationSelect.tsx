'use client'

import { useState, useRef, useEffect } from 'react'

/*
  Small searchable combobox for city/country fields — no dropdown/autocomplete
  package is installed anywhere in this app, so this is a plain text input +
  filtered suggestion list, matching the native-<select>/inline-style
  convention used elsewhere. Always accepts free-text: the suggestion list is
  just a shortcut, not a hard-enforced enum, since no seed list can cover
  every city/country DocuHub will ever need.
*/
export default function LocationSelect({
  value, onChange, options, placeholder,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const filtered = value.trim()
    ? options.filter(o => o.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 8)
    : options.slice(0, 8)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }}
      />
      {open && filtered.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', marginTop: '4px', maxHeight: '180px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
          {filtered.map(o => (
            <div key={o}
              onMouseDown={() => { onChange(o); setOpen(false) }}
              style={{ padding: '8px 10px', fontSize: '13px', cursor: 'pointer', color: 'var(--ink)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--card-hi)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {o}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
