'use client'

import { useMemo, useRef, useState } from 'react'
import { FLAG_CODES, flagPath } from '@/app/lib/proposals/countries'

/* A country (nationality) picker you can search by typing — pick from the list, or clear it. Stores the lower-case ISO code the flag set is keyed by. */
const COUNTRIES = (() => { const dn = new Intl.DisplayNames(['en'], { type: 'region' }); return FLAG_CODES.map(c => ({ code: c as string, name: dn.of(c.toUpperCase()) ?? c })).sort((a, b) => a.name.localeCompare(b.name)) })()
export const countryNameOf = (code: string | null | undefined) => COUNTRIES.find(c => c.code === (code ?? '').toLowerCase())?.name ?? ''

export default function CountryPicker({ value, onChange, placeholder = 'Type a country…' }: { value: string | null; onChange: (code: string | null) => void; placeholder?: string }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const matches = useMemo(() => { const t = q.trim().toLowerCase(); return (t ? COUNTRIES.filter(c => c.name.toLowerCase().includes(t) || c.code === t) : COUNTRIES).slice(0, 60) }, [q])
  const selected = value ? COUNTRIES.find(c => c.code === value.toLowerCase()) : null
  const field: React.CSSProperties = { width: '100%', padding: '9px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--ink)', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box' }
  return (
    <div ref={box} style={{ position: 'relative' }} onBlur={e => { if (!box.current?.contains(e.relatedTarget as Node)) setOpen(false) }}>
      {selected && !open ? (
        <div style={{ ...field, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} tabIndex={0} onClick={() => { setQ(''); setOpen(true) }} onFocus={() => { setQ(''); setOpen(true) }}>
          {flagPath(selected.code) /* eslint-disable-next-line @next/next/no-img-element */ && <img src={flagPath(selected.code)!} alt="" style={{ width: '22px', height: '16px', objectFit: 'cover', borderRadius: '2px' }} />}
          <span style={{ flex: 1 }}>{selected.name}</span>
          <button type="button" onClick={e => { e.stopPropagation(); onChange(null) }} aria-label="Clear country" style={{ border: 'none', background: 'none', color: 'var(--ink3)', cursor: 'pointer', fontSize: '15px' }}>✕</button>
        </div>
      ) : (
        <input style={field} value={q} placeholder={placeholder} onChange={e => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} />
      )}
      {open && (
        <div style={{ position: 'absolute', zIndex: 40, left: 0, right: 0, top: 'calc(100% + 4px)', maxHeight: '240px', overflowY: 'auto', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px' }}>
          {matches.length === 0 && <div style={{ padding: '10px 12px', fontSize: '13.5px', color: 'var(--ink3)' }}>No country matches “{q}”.</div>}
          {matches.map(c => (
            <button type="button" key={c.code} onMouseDown={e => e.preventDefault()} onClick={() => { onChange(c.code); setOpen(false); setQ('') }}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '8px 12px', border: 'none', background: c.code === value ? 'var(--surface)' : 'transparent', color: 'var(--ink)', fontSize: '14px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
              {flagPath(c.code) /* eslint-disable-next-line @next/next/no-img-element */ && <img src={flagPath(c.code)!} alt="" style={{ width: '22px', height: '16px', objectFit: 'cover', borderRadius: '2px' }} />}{c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
