'use client'

import { useState } from 'react'
import { Button, Input } from '@/app/components/ui'
import { parseExtraCc } from '@/app/lib/email/extra-cc'

/* "Also Cc" box for the bulk-send dialogs. Controlled: the dialog keeps the text and parses it with parseExtraCc to get the list to send and to disable Send while it is invalid. */
export default function ExtraCcField({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const parsed = parseExtraCc(value)
  const [meError, setMeError] = useState<string | null>(null)
  async function addMe() {
    setMeError(null)
    const d = await fetch('/api/events/access/my-email').then(r => r.json()).catch(() => null) as { email?: string | null } | null
    const email = d?.email?.toLowerCase()
    if (!email) { setMeError('Your account has no email address on file — type it in instead.'); return }
    const have = 'emails' in parsed ? parsed.emails : []
    if (!have.includes(email)) onChange([value.trim().replace(/[,;]+$/, ''), email].filter(Boolean).join(', '))
  }
  return (
    <div style={{ margin: '16px 0 4px' }}>
      <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: 'var(--ink3)', marginBottom: '4px' }}>Also Cc (optional)</label>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <div style={{ flex: 1 }}><Input value={value} onChange={e => onChange(e.target.value)} disabled={disabled} placeholder="yourself@tresconglobal.com, colleague@example.com" /></div>
        <Button variant="ghost" disabled={disabled} onClick={() => void addMe()}>Cc me</Button>
      </div>
      {meError && <div style={{ fontSize: '12.5px', color: 'var(--red)', marginTop: '4px' }}>{meError}</div>}
      {'error' in parsed
        ? <div style={{ fontSize: '12.5px', color: 'var(--red)', marginTop: '4px' }}>{parsed.error}</div>
        : <div style={{ fontSize: '12px', color: 'var(--ink4)', marginTop: '4px' }}>Added to the Cc of every email in this send, on top of each speaker’s own contacts. Separate addresses with commas.</div>}
    </div>
  )
}
