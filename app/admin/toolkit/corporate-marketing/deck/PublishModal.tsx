'use client'

/*
  Publish modal. Marketing writes a short change summary, clicks Publish,
  and a new immutable version snapshot is created.

  Live on: Overview tab primary action + Settings tab secondary action.
*/

import { useState } from 'react'
import { BRAND, PrimaryButton, GhostButton, ErrorBox, textareaStyle } from './_shared'

export default function PublishModal({ onClose, onPublished }: { onClose: () => void; onPublished: (versionNumber: number) => void }) {
  const [summary, setSummary] = useState('')
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState<string | null>(null)

  async function publish() {
    if (!summary.trim()) { setErr('Please summarise what changed in this version.'); return }
    setSaving(true)
    setErr(null)
    try {
      const res = await fetch('/api/corporate-marketing/deck/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ change_summary: summary.trim() }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d?.error ?? 'Publish failed')
      onPublished(d.version_number)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(15,25,35,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '20px',
    }} onClick={saving ? undefined : onClose}>
      <div
        style={{ background: '#fff', borderRadius: '20px', padding: '32px', width: '100%', maxWidth: '520px', boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: '11px', fontWeight: 800, color: BRAND, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>
          Publish new version
        </div>
        <div style={{ fontSize: '20px', fontWeight: 900, color: '#0F1923', marginBottom: '10px', letterSpacing: '-0.3px' }}>
          Create an immutable snapshot
        </div>
        <div style={{ fontSize: '13px', color: '#5B7080', lineHeight: 1.6, marginBottom: '20px' }}>
          A version freezes the current PDF, Canva link, and all approved deck content. It cannot be overwritten. Anyone can download it from Version History.
        </div>

        <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#0F1923', marginBottom: '6px' }}>
          What changed in this version?
        </label>
        <textarea
          autoFocus
          value={summary}
          onChange={e => setSummary(e.target.value)}
          placeholder="e.g. Updated Q3 company stats, added 2 new testimonials from Riyadh conference, refreshed leadership order."
          style={{ ...textareaStyle, minHeight: '110px' }}
          disabled={saving}
        />

        {err && <ErrorBox>{err}</ErrorBox>}

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
          <GhostButton onClick={saving ? undefined : onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={publish} disabled={saving}>
            {saving ? 'Publishing…' : 'Publish version'}
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}
