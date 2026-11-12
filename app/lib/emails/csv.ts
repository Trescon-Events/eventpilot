/* A tiny CSV writer for the Emails module's exports (2026-11-12). Values that start with = + - or @ are prefixed so a spreadsheet never runs them as a formula. */
const cell = (v: unknown): string => {
  let s = v === null || v === undefined ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export function toCsv(header: string[], rows: unknown[][]): string {
  return '﻿' + [header, ...rows].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n'
}
export const csvResponse = (name: string, body: string) => new Response(body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name.replace(/[^a-z0-9._-]+/gi, '_')}.csv"`, 'Cache-Control': 'no-store' } })
