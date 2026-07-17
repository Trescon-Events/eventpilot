'use client'

/*
  Settings tab. Deliberately minimal — deck title editing,
  access list (read-only), and a secondary Publish action.
*/

import { useCallback, useEffect, useState } from 'react'
import { BRAND, Card, SectionLabel, H2, PrimaryButton, GhostButton, ErrorBox, inputStyle, initials } from './_shared'
import PublishModal from './PublishModal'

type Member = { id: string; name: string; email: string; department: string | null; kind: 'admin' | 'grant' }

export default function SettingsTab({ onDeckUpdated }: { onDeckUpdated: () => Promise<void> }) {
  const [title, setTitle]     = useState('')
  const [orig, setOrig]       = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [savedNote, setSavedNote] = useState<string | null>(null)
  const [err, setErr]         = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)

  const load = useCallback(async () => {
    const [d1, d2] = await Promise.all([
      fetch('/api/corporate-marketing/deck',   { cache: 'no-store' }).then(r => r.json()).catch(() => ({})),
      fetch('/api/corporate-marketing/access', { cache: 'no-store' }).then(r => r.json()).catch(() => ({})),
    ])
    const t = d1?.deck?.title ?? ''
    setTitle(t); setOrig(t)
    setMembers(d2?.members ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function saveTitle() {
    setSaving(true); setErr(null)
    try {
      const res = await fetch('/api/corporate-marketing/deck', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error ?? 'Save failed')
      }
      setOrig(title.trim())
      setSavedNote('Deck title saved')
      setTimeout(() => setSavedNote(null), 2000)
      await onDeckUpdated()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Card><div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Loading settings…</div></Card>

  const dirty = title.trim() !== orig.trim()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', maxWidth: '820px' }}>
      <Card>
        <SectionLabel>Deck title</SectionLabel>
        <H2 style={{ marginBottom: '6px' }}>Name shown across the workspace</H2>
        <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '14px' }}>
          Only used internally in EventPilot. Doesn&apos;t rename the PDF file itself.
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
            placeholder="Corporate Deck"
          />
          <PrimaryButton onClick={saveTitle} disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save title'}
          </PrimaryButton>
        </div>
        {savedNote && <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--teal-mid)', fontWeight: 700 }}>{savedNote}</div>}
        {err && <ErrorBox>{err}</ErrorBox>}
      </Card>

      <Card>
        <SectionLabel>Publish</SectionLabel>
        <H2 style={{ marginBottom: '6px' }}>Publish a new immutable version</H2>
        <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '14px' }}>
          Same button lives on the Overview tab. Once published, the version is downloadable forever from Version History and cannot be overwritten.
        </div>
        <GhostButton onClick={() => setPublishing(true)}>Open publish dialog →</GhostButton>
      </Card>

      <Card>
        <SectionLabel>Who has access</SectionLabel>
        <H2 style={{ marginBottom: '6px' }}>{members.length} member{members.length === 1 ? '' : 's'} with access</H2>
        <div style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '14px' }}>
          Grants are managed from the admin toolkit access matrix. Anyone here can upload deck versions, edit content, and publish.
        </div>
        {members.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--ink3)', fontStyle: 'italic' }}>No access records found.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {members.map(m => (
              <div key={m.id} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '10px 14px', border: '1px solid var(--border-light)', borderRadius: '12px', background: 'var(--border-light)' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: `${BRAND}12`, color: BRAND, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>
                  {initials(m.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>{m.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '2px' }}>{[m.email, m.department].filter(Boolean).join(' · ')}</div>
                </div>
                <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: m.kind === 'admin' ? 'var(--amber)' : 'var(--teal-mid)', background: m.kind === 'admin' ? 'var(--amber-light)' : 'var(--teal-light)', padding: '4px 10px', borderRadius: '10px' }}>
                  {m.kind === 'admin' ? 'Admin' : 'Grant'}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {publishing && (
        <PublishModal
          onClose={() => setPublishing(false)}
          onPublished={async () => { setPublishing(false); await onDeckUpdated() }}
        />
      )}
    </div>
  )
}
