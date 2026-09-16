'use client'
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
      input[type="date"] {
        cursor: pointer;
      }
      input[type="date"]::-webkit-calendar-picker-indicator {
        cursor: pointer;
        filter: invert(0.85) brightness(1.2);
        opacity: 0.85;
        font-size: 16px;
        margin-right: 4px;
        transition: opacity 0.15s ease, filter 0.15s ease;
      }
      input[type="date"]::-webkit-calendar-picker-indicator:hover {
        filter: invert(1) brightness(1.5);
        opacity: 1;
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

// SearchableSelect/ComboOption relocated to app/components/ui/SearchableSelect.tsx
// (2026-09-15, promoted for reuse by the Agenda Builder's speaker-picker) —
// re-exported here so every existing import in this module keeps working.
export { SearchableSelect } from '@/app/components/ui/SearchableSelect'
export type { ComboOption } from '@/app/components/ui/SearchableSelect'
