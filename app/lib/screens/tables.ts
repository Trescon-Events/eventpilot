/* Table Screens (Phase 1) — the small portrait screens on the tables beside each speaker's seat. Pure helpers: reading the table numbers the stage manager calls out,
   working out which table shows which seat, and naming the files the technician uploads to his app. No database, no drawing. */

import type { TextLayer, Variant } from '@/app/lib/announcements/composite'

export const DEFAULT_TABLE_COUNT = 6
export const MAX_TABLES = 20

export type OrderResult = { order: number[]; errors: string[]; warnings: string[] }

/** The tables in seat order, as typed ("4 2 6 1 3", "4,2,6,1,3", or "42613" when there are 9 tables or fewer). The first number is the moderator's table, then the others left to right
    as seen from the audience. Errors stop a download (a table twice, a table that does not exist); warnings do not (seats still without a table, extra tables). */
export function parseTableOrder(input: string, seats: number, tableCount: number): OrderResult {
  const out: OrderResult = { order: [], errors: [], warnings: [] }
  const text = input.trim()
  if (!text) return out
  const tokens = /^\d+$/.test(text) && tableCount <= 9 ? text.split('') : text.split(/[\s,;/.-]+/).filter(Boolean)
  const bad = tokens.filter(t => !/^\d+$/.test(t))
  if (bad.length) { out.errors.push(`"${bad.join('", "')}" is not a table number.`); return out }
  const nums = tokens.map(Number)
  const outOfRange = [...new Set(nums.filter(n => n < 1 || n > tableCount))]
  if (outOfRange.length) out.errors.push(`Table ${outOfRange.join(', ')} does not exist (tables are 1 to ${tableCount}).`)
  const dup = [...new Set(nums.filter((n, i) => nums.indexOf(n) !== i))]
  if (dup.length) out.errors.push(`Table ${dup.join(', ')} is listed more than once.`)
  if (out.errors.length) return out
  out.order = nums
  if (nums.length < seats) out.warnings.push(`${seats - nums.length === 1 ? `Seat ${seats}` : `Seats ${nums.length + 1} to ${seats}`} ${seats - nums.length === 1 ? 'has' : 'have'} no table yet.`)
  if (nums.length > seats) out.warnings.push(`${nums.length - seats} more table${nums.length - seats === 1 ? '' : 's'} than seats: ${nums.slice(seats).map(n => `Table ${n}`).join(', ')} will show the standby screen.`)
  return out
}

/** A Table Screen template that has no layer "shown for moderators" would draw a moderator exactly like everyone else. For a moderator, add a default MODERATOR tag above the name in the name
    layer's own font and colour (half its size), so the tag never silently goes missing. A template that makes its own moderator layer is left exactly as it is. */
export function withModeratorFallback(variant: Variant, moderator: boolean): Variant {
  if (!moderator || variant.table_standby || variant.layers.some(l => l.show_for === 'moderator')) return variant
  const name = variant.layers.find((l): l is TextLayer => l.type === 'text' && l.field === 'name' && l.show_for !== 'speaker')
  if (!name) return variant
  const size = Math.max(24, Math.round(name.font_size * 0.5)), gap = 28, height = Math.round(size * 1.25)
  const tag: TextLayer = {
    id: 'auto-moderator-tag', type: 'text', field: 'custom', value: 'Moderator', uppercase: true,
    x: name.x, width: name.width, height, y: Math.max(0, name.y - gap - height), max_lines: 1, font_size: size, font_color: name.font_color, font_weight: 600,
    align: name.align, font_family: name.font_family, allow_shrink: true, snap_above_layer_id: name.id, snap_gap: gap,
  }
  return { ...variant, layers: [...variant.layers, tag] }
}

export type Seat = { seat: number; table: number | null; name: string; moderator: boolean }

/** Seat i gets the i-th table of the order (null when the order is shorter). `standby` = every table that is not on a speaker. */
export function seatPlan(people: { name: string; moderator: boolean }[], order: number[], tableCount: number): { seats: Seat[]; standby: number[] } {
  const seats = people.map((p, i) => ({ seat: i + 1, table: order[i] ?? null, name: p.name, moderator: p.moderator }))
  const used = new Set(seats.map(s => s.table).filter((t): t is number => t !== null))
  const standby = Array.from({ length: tableCount }, (_, i) => i + 1).filter(t => !used.has(t))
  return { seats, standby }
}

const slug = (s: string, max = 40) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '') || 'Speaker'

/** e.g. Table4_Seat1_Moderator_Yousef-Gamal-El-Din.png / Table2_Seat2_H-E-Hadi-Badri.png — the table number leads so the six files sort in table order. */
export function tableFileName(s: { table: number; seat: number; moderator: boolean; name: string }): string {
  return `Table${s.table}_Seat${s.seat}_${s.moderator ? 'Moderator_' : ''}${slug(s.name)}.png`
}
export const standbyFileName = (table?: number) => table ? `Table${table}_Standby.png` : 'Standby.png'

/** e.g. Tables_2026-11-02_1030_What-innovation-can-drive-the-next-eco.zip */
export function tablesZipName(s: { date: string; startHM: string; topic: string }): string {
  return `Tables_${s.date}_${s.startHM.replace(':', '')}_${slug(s.topic, 36)}.zip`
}
