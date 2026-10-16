'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Button, Card } from '@/app/components/ui'
import { STATE_LABEL, type Figure, type ProfileText, type TextState } from '@/app/lib/brand-content/company-profile'

/* Company profile (docs/build_suggestions/brand-and-content-section.md, Part 3). Everyone signed in can read and copy; content editors
   (platform.content.manage) edit; only a super admin approves. Approving a text checks the Trescon-wide house rules first. */
type Payload = { missing?: boolean; texts: ProfileText[]; figures: Figure[]; can_edit: boolean; can_approve: boolean }

const CHIP: Record<TextState, { bg: string; fg: string }> = {
  approved: { bg: 'var(--success-light, #e6f6ec)', fg: 'var(--success)' },
  edited_since_approval: { bg: 'var(--amber-light)', fg: 'var(--amber)' },
  needs_review: { bg: 'var(--amber-light)', fg: 'var(--amber)' },
  not_approved: { bg: 'var(--card)', fg: 'var(--ink3)' },
}
const label = { fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '8px' } as const
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

function Chip({ state }: { state: TextState }) {
  const c = CHIP[state]
  return <span style={{ fontSize: '11px', fontWeight: 800, padding: '3px 9px', borderRadius: '999px', background: c.bg, color: c.fg, border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{STATE_LABEL[state]}</span>
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button variant="ghost" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) } catch { /* clipboard blocked */ } }}>
      {done ? '✓ Copied' : 'Copy'}
    </Button>
  )
}

function TextCard({ t, canEdit, canApprove, onChanged }: { t: ProfileText; canEdit: boolean; canApprove: boolean; onChanged: () => void }) {
  const [draft, setDraft] = useState(t.working_text)
  const [busy, setBusy] = useState<'save' | 'approve' | null>(null)
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flash = (text: string, error = false) => { setNote({ text, error }); if (timer.current) clearTimeout(timer.current); if (!error) timer.current = setTimeout(() => setNote(null), 3500) }
  const dirty = draft !== t.working_text

  async function save() {
    setBusy('save'); setNote(null)
    try {
      const res = await fetch('/api/brand-content/company-profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'text', key: t.key, working_text: draft }) })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { flash('✓ Saved'); onChanged() } else flash(d.error ?? 'Could not save.', true)
    } finally { setBusy(null) }
  }
  async function approve() {
    setBusy('approve'); setNote(null)
    try {
      const res = await fetch('/api/brand-content/company-profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve_text', key: t.key }) })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { flash(d.warnings?.length ? `✓ Approved, with ${d.warnings.length} warning${d.warnings.length === 1 ? '' : 's'}: ${d.warnings.map((w: { message: string }) => w.message).join(' · ')}` : '✓ Approved'); onChanged() }
      else flash(`${d.error ?? 'Could not approve.'}${d.errors?.length ? ' ' + d.errors.map((e: { message: string }) => e.message).join(' · ') : ''}`, true)
    } finally { setBusy(null) }
  }

  return (
    <Card padded>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>{t.label}</div>
        <Chip state={t.state} />
        {t.approved_at && <span style={{ fontSize: '11.5px', color: 'var(--ink3)' }}>Approved {fmt(t.approved_at)}</span>}
        {t.state === 'needs_review' && <span style={{ fontSize: '11.5px', color: 'var(--amber)' }}>A figure it quotes was changed. Check the text, then approve it again.</span>}
      </div>

      {t.approved_text && (
        <div style={{ marginBottom: '14px' }}>
          <div style={label}>Approved version</div>
          <pre style={{ margin: '0 0 8px', whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '13px', color: 'var(--ink)', lineHeight: 1.65 }}>{t.approved_text}</pre>
          <CopyButton text={t.approved_text} />
        </div>
      )}

      <div style={label}>Working version{!canEdit ? '' : ' (edit here)'}</div>
      {canEdit
        ? <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={Math.min(14, Math.max(3, draft.split('\n').length + 1))}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: '13px', lineHeight: 1.65, resize: 'vertical' }} />
        : <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.65 }}>{t.working_text || '(empty)'}</pre>}

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '10px' }}>
        <CopyButton text={canEdit ? draft : t.working_text} />
        {canEdit && <Button variant="teal" onClick={save} disabled={!!busy || !dirty}>{busy === 'save' ? 'Saving…' : 'Save'}</Button>}
        {canEdit && dirty && !busy && <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--amber)' }}>Unsaved changes</span>}
        {canApprove && <Button variant="lime" onClick={approve} disabled={!!busy || dirty || (t.state === 'approved')}>{busy === 'approve' ? 'Approving…' : 'Approve'}</Button>}
        {canApprove && dirty && <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>Save first, then approve.</span>}
        {note && <span style={{ fontSize: '12.5px', fontWeight: 700, color: note.error ? 'var(--red)' : 'var(--success)' }}>{note.text}</span>}
      </div>
      {t.figure_keys.length > 0 && <div style={{ fontSize: '11.5px', color: 'var(--ink4)', marginTop: '10px' }}>Quotes: {t.figure_keys.join(', ')}</div>}
    </Card>
  )
}

function FigureRow({ f, canEdit, canApprove, onChanged }: { f: Figure; canEdit: boolean; canApprove: boolean; onChanged: () => void }) {
  const [draft, setDraft] = useState(f.value)
  const [busy, setBusy] = useState<'save' | 'approve' | null>(null)
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null)
  const dirty = draft.trim() !== f.value
  const flash = (text: string, error = false) => { setNote({ text, error }); if (!error) setTimeout(() => setNote(null), 3000) }
  async function call(kind: 'save' | 'approve') {
    setBusy(kind); setNote(null)
    try {
      const res = kind === 'save'
        ? await fetch('/api/brand-content/company-profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'figure', key: f.key, value: draft }) })
        : await fetch('/api/brand-content/company-profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve_figure', key: f.key }) })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { flash(kind === 'save' ? '✓ Saved' : '✓ Approved'); onChanged() } else flash(d.error ?? 'Failed.', true)
    } finally { setBusy(null) }
  }
  const cell = { padding: '8px 10px', borderTop: '1px solid var(--border-light)', fontSize: '12.5px', color: 'var(--ink2)', verticalAlign: 'top' } as const
  const status = f.status === 'approved' && f.approved_value === f.value ? 'Approved' : f.status === 'approved' ? 'Edited since approval' : 'Pending review'
  return (
    <tr>
      <td style={{ ...cell, fontWeight: 800, color: 'var(--ink)' }}>{f.label}<div style={{ fontWeight: 400, color: 'var(--ink4)', fontSize: '11px' }}>{f.key}</div></td>
      <td style={cell}>
        {canEdit
          ? <input value={draft} onChange={e => setDraft(e.target.value)} style={{ width: '110px', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: '13px' }} />
          : <strong>{f.value}</strong>}
        {f.unit && <span style={{ color: 'var(--ink4)', marginLeft: '6px' }}>{f.unit}</span>}
      </td>
      <td style={cell}>{f.approved_value ?? <span style={{ color: 'var(--ink4)' }}>none</span>}{f.approved_at && <div style={{ fontSize: '11px', color: 'var(--ink4)' }}>{fmt(f.approved_at)}</div>}</td>
      <td style={cell}>{status}</td>
      <td style={{ ...cell, maxWidth: '280px' }}>{f.description}{f.notes && <div style={{ color: 'var(--amber)', marginTop: '4px', fontSize: '11.5px' }}>{f.notes}</div>}<div style={{ color: 'var(--ink4)', fontSize: '11px', marginTop: '2px' }}>{f.source}</div></td>
      <td style={{ ...cell, whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          {canEdit && <Button variant="ghost" onClick={() => call('save')} disabled={!!busy || !dirty}>{busy === 'save' ? 'Saving…' : 'Save'}</Button>}
          {canApprove && <Button variant="lime" onClick={() => call('approve')} disabled={!!busy || dirty || status === 'Approved'}>{busy === 'approve' ? 'Approving…' : 'Approve'}</Button>}
        </div>
        {note && <div style={{ fontSize: '12px', fontWeight: 700, marginTop: '4px', color: note.error ? 'var(--red)' : 'var(--success)' }}>{note.text}</div>}
        {canEdit && dirty && !busy && <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--amber)', marginTop: '4px' }}>Unsaved changes</div>}
      </td>
    </tr>
  )
}

export default function CompanyProfilePage() {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey(k => k + 1), [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/brand-content/company-profile')
      .then(async res => ({ ok: res.ok, d: await res.json().catch(() => ({})) }))
      .then(({ ok, d }) => { if (cancelled) return; if (!ok) setError((d as { error?: string }).error ?? 'Could not load.'); else { setError(null); setData(d as Payload) } })
    return () => { cancelled = true }
  }, [reloadKey])

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px 16px' }}>
      <PageHeader eyebrow="Content" title="Company profile" description="The approved About Trescon texts and the company figures they quote. Press releases for Trescon-owned events use the approved versions." />
      {error && <Card padded><div style={{ fontSize: '13px', color: 'var(--red)' }}>{error}</div></Card>}
      {!error && !data && <Card padded><div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Loading…</div></Card>}
      {data?.missing && <Card padded><div style={{ fontSize: '13px', color: 'var(--amber)' }}>The Company profile tables do not exist yet. Run supabase/company_profile_migration.sql first.</div></Card>}
      {data && !data.missing && (
        <div style={{ display: 'grid', gap: '24px' }}>
          {!data.can_edit && <div style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '12.5px', background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--ink3)' }}>View only. You can read and copy everything here; editing needs permission.</div>}
          <div>
            <div style={label}>About Trescon texts</div>
            <div style={{ display: 'grid', gap: '14px' }}>{data.texts.map(t => <TextCard key={`${t.key}-${t.updated_at}-${t.approved_at}`} t={t} canEdit={data.can_edit} canApprove={data.can_approve} onChanged={reload} />)}</div>
          </div>
          <div>
            <div style={label}>Company figures</div>
            <Card padded>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
                  <thead><tr>{['Figure', 'Value', 'Approved value', 'Status', 'About', ''].map(h => <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: '11px', fontWeight: 800, color: 'var(--ink3)' }}>{h}</th>)}</tr></thead>
                  <tbody>{data.figures.map(f => <FigureRow key={`${f.key}-${f.updated_at}`} f={f} canEdit={data.can_edit} canApprove={data.can_approve} onChanged={reload} />)}</tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
