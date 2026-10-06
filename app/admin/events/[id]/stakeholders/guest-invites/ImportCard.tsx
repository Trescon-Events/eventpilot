'use client'
import { useState } from 'react'
import { Button, Textarea, Badge } from '@/app/components/ui'

/* Bulk-load the speakers' registration links. Paste rows (Name, Email, Link in any
   order; tab- or comma-separated; a header row is fine — a row needs a link). The
   first step only PREVIEWS how each row matches a speaker; nothing is saved until
   "Save N matched links". */

type Result = {
  index: number; input: { name?: string | null; email?: string | null; link?: string | null }
  status: 'matched' | 'ambiguous' | 'unmatched' | 'invalid_link' | 'duplicate_in_file' | 'code_taken'
  how?: 'email' | 'name' | 'code'; speaker?: { id: string; name: string }; candidates?: { id: string; name: string }[]
  code?: string; message?: string; replaces?: boolean
}

function parseRows(text: string) {
  const rows: { name?: string; email?: string; link?: string }[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue
    const cells = (line.includes('\t') ? line.split('\t') : line.split(/,(?=\s*(?:https?:|[^,]*@|[^,]*$))/)).map(c => c.trim().replace(/^"|"$/g, '')).filter(Boolean)
    const link = cells.find(c => /^https?:\/\//i.test(c))
    if (!link) continue // header or junk
    const email = cells.find(c => c !== link && /@/.test(c))
    const name = cells.find(c => c !== link && c !== email)
    rows.push({ name, email, link })
  }
  return rows
}

const LABEL: Record<Result['status'], { text: string; color: 'teal' | 'amber' | 'red' | 'grey' }> = {
  matched: { text: 'Matched', color: 'teal' }, ambiguous: { text: 'Pick one', color: 'amber' }, unmatched: { text: 'No match', color: 'red' },
  invalid_link: { text: 'Bad link', color: 'red' }, duplicate_in_file: { text: 'Duplicate', color: 'amber' }, code_taken: { text: 'Code in use', color: 'red' },
}

export default function ImportCard({ eventId, onSaved, say }: { eventId: string; onSaved: () => void; say: (t: string, ty?: 'success' | 'error') => void }) {
  const [text, setText] = useState('')
  const [results, setResults] = useState<Result[] | null>(null)
  const [busy, setBusy] = useState(false)
  const rows = parseRows(text)

  async function run(apply: boolean) {
    setBusy(true)
    const res = await fetch('/api/events/guest-invites/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, rows, apply }) })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { say(d.error ?? 'Could not read the rows.', 'error'); return }
    setResults(d.results)
    if (apply) { say(`Saved ${d.saved} link${d.saved === 1 ? '' : 's'}${d.failed?.length ? `, ${d.failed.length} failed` : ''}.`, d.failed?.length ? 'error' : 'success'); onSaved(); if (!d.failed?.length) { setText(''); setResults(null) } }
  }

  const matched = results?.filter(r => r.status === 'matched').length ?? 0
  return (
    <div style={{ display: 'grid', gap: '10px' }}>
      <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.6 }}>
        Paste one speaker per line — name, email and the KonfHub link (any order, tab or comma separated). A speaker is matched by email, then name, then the name in the code (e.g. <code>NURYMGUEST</code> → Nurym).
      </div>
      <Textarea rows={6} value={text} onChange={e => { setText(e.target.value); setResults(null) }} placeholder={'Nurym Ayazbayev\tnurym@example.com\thttps://konfhub.com/checkout/dubai-future-finance-week-2026?ticketId=77824%7C1%3B&selectedCode=NURYMGUEST'} style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '12px' }} />
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <Button variant="ghost" onClick={() => run(false)} disabled={busy || rows.length === 0}>{busy && !results ? 'Checking…' : `Preview ${rows.length} row${rows.length === 1 ? '' : 's'}`}</Button>
        {results && <Button variant="teal" onClick={() => run(true)} disabled={busy || matched === 0}>{busy ? 'Saving…' : `Save ${matched} matched link${matched === 1 ? '' : 's'}`}</Button>}
        {results && results.length - matched > 0 && <span style={{ fontSize: '12.5px', color: 'var(--amber)' }}>{results.length - matched} row{results.length - matched === 1 ? '' : 's'} need attention and won’t be saved.</span>}
      </div>
      {results && (
        <div style={{ display: 'grid', gap: '6px' }}>
          {results.map(r => (
            <div key={r.index} style={{ display: 'grid', gridTemplateColumns: '90px minmax(0,1fr) minmax(0,1.3fr)', gap: '10px', alignItems: 'center', padding: '7px 10px', borderRadius: '8px', background: 'var(--card-hi)', fontSize: '12.5px' }}>
              <Badge color={LABEL[r.status].color}>{LABEL[r.status].text}</Badge>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink2)' }}>{r.input.name || r.input.email || r.code || '(no name)'}{r.code && <span style={{ color: 'var(--ink4)' }}> · {r.code}</span>}</div>
              <div style={{ color: r.status === 'matched' ? 'var(--ink)' : 'var(--ink3)' }}>
                {r.status === 'matched' ? <>→ <strong>{r.speaker!.name}</strong> <span style={{ color: 'var(--ink4)' }}>(by {r.how}{r.replaces ? ', replaces their current link' : ''})</span></> : (r.message ?? '')}
                {r.status === 'ambiguous' && r.candidates && <span style={{ color: 'var(--ink4)' }}> {r.candidates.map(c => c.name).join(' / ')}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
