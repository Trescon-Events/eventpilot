'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/app/components/ui'
import { STATE_LABEL, type Figure, type ProfileText, type TextState } from '@/app/lib/brand-content/company-profile'

/* Company profile (docs/build_suggestions/brand-and-content-section.md, Part 3; reworked 17 Oct 2026). Three panes: the workspace
   navigation, a section list, and a large, readable editor. SAVE only updates the working copy, for everyone. Only APPROVE (super admin)
   publishes: it checks the Trescon-wide house rules, then sets the approved text that press releases and the Standards API read.
   Everyone signed in can read and copy; editing needs platform.content.manage or super admin. */
type Payload = { missing?: boolean; texts: ProfileText[]; figures: Figure[]; can_edit: boolean; can_approve: boolean }
type Note = { text: string; error: boolean } | null

const CHIP: Record<TextState, { bg: string; fg: string }> = {
  approved: { bg: 'var(--success-light, #e6f6ec)', fg: 'var(--success)' },
  edited_since_approval: { bg: 'var(--amber-light)', fg: 'var(--amber)' },
  needs_review: { bg: 'var(--amber-light)', fg: 'var(--amber)' },
  not_approved: { bg: 'var(--card)', fg: 'var(--ink3)' },
}
const FIGURES = '__figures'
const GROUPS: { title: string; keys: string[] }[] = [
  { title: 'About Trescon', keys: ['about_short', 'about_standard', 'about_long'] },
  { title: 'Event modules', keys: ['module_signature', 'module_managed'] },
  { title: 'Brand voice', keys: ['tagline', 'mission', 'vision'] },
]
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0)

function Section({ t, canEdit, canApprove, onSaved }: { t: ProfileText; canEdit: boolean; canApprove: boolean; onSaved: () => void }) {
  const [draft, setDraft] = useState(t.working_text)
  const [busy, setBusy] = useState<'save' | 'approve' | null>(null)
  const [copied, setCopied] = useState(false)
  const [note, setNote] = useState<Note>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = draft !== t.working_text
  const flash = (text: string, error = false) => { setNote({ text, error }); if (timer.current) clearTimeout(timer.current); if (!error) timer.current = setTimeout(() => setNote(null), 5000) }

  async function save() {
    setBusy('save'); setNote(null)
    try {
      const res = await fetch('/api/brand-content/company-profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'text', key: t.key, working_text: draft }) })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { flash('✓ Saved. This is the working copy; it goes live when a super admin approves it.'); onSaved() } else flash(d.error ?? 'Could not save.', true)
    } finally { setBusy(null) }
  }
  async function approve() {
    setBusy('approve'); setNote(null)
    try {
      const res = await fetch('/api/brand-content/company-profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve_text', key: t.key }) })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { flash(d.warnings?.length ? `✓ Approved and live, with ${d.warnings.length} style warning${d.warnings.length === 1 ? '' : 's'}: ${d.warnings.map((w: { message: string }) => w.message).join(' · ')}` : '✓ Approved. This text is now live.'); onSaved() }
      else flash(`${d.error ?? 'Could not approve.'}${d.errors?.length ? ' ' + d.errors.map((e: { message: string }) => e.message).join(' · ') : ''}`, true)
    } finally { setBusy(null) }
  }

  const chip = CHIP[t.state]
  const textStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: '17px', lineHeight: 1.8, color: 'var(--ink)', letterSpacing: '0.1px' }
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.3px', color: 'var(--ink)', margin: 0 }}>{t.label}</h2>
        <span style={{ fontSize: '11.5px', fontWeight: 800, padding: '3px 10px', borderRadius: '999px', background: chip.bg, color: chip.fg, border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{STATE_LABEL[t.state]}</span>
        {t.approved_at && <span style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>Approved {fmt(t.approved_at)}</span>}
      </div>
      {t.state === 'needs_review' && <div style={{ fontSize: '12.5px', color: 'var(--amber)', marginTop: '6px' }}>A figure this text quotes was changed. Check the wording, then approve it again.</div>}
      {t.figure_keys.length > 0 && <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '6px' }}>Quotes the figures: {t.figure_keys.join(', ')}</div>}

      <div style={{ marginTop: '20px', maxWidth: '820px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '8px' }}>Working copy{canEdit ? ' (edit here)' : ''}</div>
        {canEdit
          ? <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={Math.min(22, Math.max(6, draft.split('\n').length + Math.ceil(draft.length / 85)))}
              style={{ ...textStyle, padding: '22px 24px', borderRadius: '14px', border: '1px solid var(--border)', background: 'var(--card)', resize: 'vertical', outline: 'none' }} />
          : <div style={{ ...textStyle, padding: '22px 24px', borderRadius: '14px', border: '1px solid var(--border)', background: 'var(--card)', whiteSpace: 'pre-wrap' }}>{t.working_text || 'Nothing here yet.'}</div>}

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginTop: '14px' }}>
          {canEdit && <Button variant="teal" onClick={save} disabled={!!busy || !dirty}>{busy === 'save' ? 'Saving…' : 'Save'}</Button>}
          {canApprove && <Button variant="lime" onClick={approve} disabled={!!busy || dirty || t.state === 'approved'}>{busy === 'approve' ? 'Approving…' : 'Approve'}</Button>}
          <Button variant="ghost" onClick={async () => { try { await navigator.clipboard.writeText(canEdit ? draft : t.working_text); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard blocked */ } }}>{copied ? '✓ Copied' : 'Copy'}</Button>
          {canEdit && dirty && !busy && <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--amber)' }}>Unsaved changes</span>}
          {canApprove && dirty && !busy && <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>Save first, then approve.</span>}
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--ink4)' }}>{words(draft)} words · {draft.length} characters</span>
        </div>
        {note && <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '10px', color: note.error ? 'var(--red)' : 'var(--success)' }}>{note.text}</div>}
        {canEdit && !canApprove && <div style={{ fontSize: '12px', color: 'var(--ink4)', marginTop: '10px' }}>Saving updates the working copy only. A super admin approves it to make it live.</div>}

        {t.approved_text && t.approved_text !== t.working_text && (
          <div style={{ marginTop: '26px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '8px' }}>Approved version (live now)</div>
            <div style={{ ...textStyle, fontSize: '15px', lineHeight: 1.7, color: 'var(--ink2)', padding: '16px 20px', borderRadius: '12px', border: '1px dashed var(--border)', background: 'transparent', whiteSpace: 'pre-wrap' }}>{t.approved_text}</div>
          </div>
        )}
      </div>
    </div>
  )
}

function Figures({ figures, canEdit, canApprove, onSaved }: { figures: Figure[]; canEdit: boolean; canApprove: boolean; onSaved: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(figures.map(f => [f.key, f.value])))
  const [busy, setBusy] = useState<'save' | 'approve' | null>(null)
  const [note, setNote] = useState<Note>(null)
  const changed = figures.filter(f => (values[f.key] ?? f.value).trim() !== f.value)
  const waiting = figures.filter(f => f.approved_value !== f.value)   // saved but not approved
  const flash = (text: string, error = false) => { setNote({ text, error }); if (!error) setTimeout(() => setNote(null), 5000) }

  async function save() {
    setBusy('save'); setNote(null)
    try {
      const res = await fetch('/api/brand-content/company-profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'figures', items: changed.map(f => ({ key: f.key, value: values[f.key] })) }) })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { flash(`✓ Saved ${d.changed ?? changed.length} figure${(d.changed ?? changed.length) === 1 ? '' : 's'}. These are working values until approved.`); onSaved() } else flash(d.error ?? 'Could not save.', true)
    } finally { setBusy(null) }
  }
  async function approveAll() {
    setBusy('approve'); setNote(null)
    try {
      const res = await fetch('/api/brand-content/company-profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve_figures', keys: waiting.map(f => f.key) }) })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { flash(`✓ Approved ${d.approved ?? waiting.length} figure${(d.approved ?? waiting.length) === 1 ? '' : 's'}. They are now live.`); onSaved() } else flash(d.error ?? 'Could not approve.', true)
    } finally { setBusy(null) }
  }

  const th: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--ink3)' }
  const td: React.CSSProperties = { padding: '12px 14px', borderTop: '1px solid var(--border-light)', fontSize: '14px', color: 'var(--ink2)', verticalAlign: 'middle' }
  const status = (f: Figure) => (f.approved_value === null ? 'Not approved' : f.approved_value === f.value ? 'Approved' : 'Edited since approval')
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.3px', color: 'var(--ink)', margin: 0 }}>Company figures</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {changed.length > 0 && !busy && <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--amber)' }}>{changed.length} unsaved</span>}
          {canEdit && <Button variant="teal" onClick={save} disabled={!!busy || changed.length === 0}>{busy === 'save' ? 'Saving…' : 'Save'}</Button>}
          {canApprove && <Button variant="lime" onClick={approveAll} disabled={!!busy || changed.length > 0 || waiting.length === 0}>{busy === 'approve' ? 'Approving…' : waiting.length > 0 ? `Approve ${waiting.length} change${waiting.length === 1 ? '' : 's'}` : 'Approve'}</Button>}
        </div>
      </div>
      {note && <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '10px', color: note.error ? 'var(--red)' : 'var(--success)' }}>{note.text}</div>}
      <div style={{ fontSize: '13.5px', color: 'var(--ink3)', margin: '8px 0 18px', maxWidth: '720px', lineHeight: 1.6 }}>The numbers the About Trescon texts quote. Change what you need and save once. Saving changes the working value; a super admin approves it to make it live.</div>
      <div style={{ border: '1px solid var(--border)', borderRadius: '14px', background: 'var(--card)', overflow: 'hidden', maxWidth: '1040px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Figure</th><th style={th}>Value</th><th style={th}>Live (approved)</th><th style={th}>Status</th><th style={th}>About</th></tr></thead>
          <tbody>
            {figures.map(f => (
              <tr key={f.key}>
                <td style={{ ...td, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{f.label}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  {canEdit
                    ? <input value={values[f.key] ?? f.value} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                        style={{ width: '130px', padding: '8px 10px', borderRadius: '8px', border: `1px solid ${(values[f.key] ?? f.value).trim() !== f.value ? 'var(--amber)' : 'var(--border)'}`, background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: '15px', fontWeight: 700 }} />
                    : <strong style={{ fontSize: '15px', color: 'var(--ink)' }}>{f.value}</strong>}
                  {f.unit && <span style={{ color: 'var(--ink4)', marginLeft: '8px', fontSize: '12.5px' }}>{f.unit}</span>}
                </td>
                <td style={{ ...td, fontWeight: 700 }}>{f.approved_value ?? <span style={{ color: 'var(--ink4)', fontWeight: 400 }}>none</span>}</td>
                <td style={td}><span style={{ fontSize: '11.5px', fontWeight: 800, padding: '3px 10px', borderRadius: '999px', border: '1px solid var(--border)', color: status(f) === 'Approved' ? 'var(--success)' : status(f) === 'Not approved' ? 'var(--ink3)' : 'var(--amber)', whiteSpace: 'nowrap' }}>{status(f)}</span></td>
                <td style={{ ...td, fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.5 }}>{f.description}{f.notes && <div style={{ color: 'var(--amber)', marginTop: '3px', fontSize: '12px' }}>{f.notes}</div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CompanyProfile() {
  const router = useRouter()
  const params = useSearchParams()
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

  const selected = params.get('s') ?? 'about_short'
  const byKey = useMemo(() => new Map((data?.texts ?? []).map(t => [t.key, t])), [data])
  const select = (k: string) => router.replace(`/brand-content/content/company-profile?s=${k}`, { scroll: false })
  const item = (active: boolean): React.CSSProperties => ({ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13.5px', fontWeight: active ? 800 : 600, background: active ? 'var(--teal-light)' : 'transparent', color: active ? 'var(--teal-mid)' : 'var(--ink2)', borderLeft: `2.5px solid ${active ? 'var(--teal-mid)' : 'transparent'}` })

  if (error) return <div style={{ padding: '24px', fontSize: '13px', color: 'var(--red)' }}>{error}</div>
  if (!data) return <div style={{ padding: '24px', fontSize: '13px', color: 'var(--ink3)' }}>Loading…</div>
  if (data.missing) return <div style={{ padding: '24px', fontSize: '13px', color: 'var(--amber)' }}>The Company profile tables do not exist yet. Run supabase/company_profile_migration.sql first.</div>

  const current = selected === FIGURES ? null : byKey.get(selected) ?? byKey.get('about_short') ?? null
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '28px', padding: '8px 32px 64px 8px' }}>
      <aside style={{ width: '236px', flexShrink: 0, position: 'sticky', top: '20px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--ink4)', padding: '0 0 6px 12px' }}>Content</div>
        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)', padding: '0 0 10px 12px' }}>Company profile</div>
        {GROUPS.map(g => {
          const rows = g.keys.map(k => byKey.get(k)).filter((t): t is ProfileText => !!t)
          if (rows.length === 0) return null
          return (
            <div key={g.title} style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--ink4)', padding: '8px 0 4px 12px' }}>{g.title}</div>
              {rows.map(t => <button key={t.key} onClick={() => select(t.key)} style={item(current?.key === t.key)}>{t.label.replace('About Trescon: ', '')}</button>)}
            </div>
          )
        })}
        <div style={{ borderTop: '1px solid var(--border-light)', margin: '10px 0 8px' }} />
        <button onClick={() => select(FIGURES)} style={item(selected === FIGURES)}>Company figures <span style={{ color: 'var(--ink4)', fontWeight: 600 }}>({data.figures.length})</span></button>
      </aside>

      <main style={{ flex: 1, minWidth: 0 }}>
        {!data.can_edit && <div style={{ padding: '8px 12px', marginBottom: '16px', borderRadius: '8px', fontSize: '12.5px', background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--ink3)', maxWidth: '820px' }}>View only. You can read and copy everything here; editing needs permission.</div>}
        {selected === FIGURES
          ? <Figures key={data.figures.map(f => `${f.updated_at}${f.approved_at}`).join('|')} figures={data.figures} canEdit={data.can_edit} canApprove={data.can_approve} onSaved={reload} />
          : current && <Section key={`${current.key}-${current.updated_at}-${current.approved_at}`} t={current} canEdit={data.can_edit} canApprove={data.can_approve} onSaved={reload} />}
      </main>
    </div>
  )
}

export default function CompanyProfilePage() {
  return <Suspense fallback={<div style={{ padding: '24px', fontSize: '13px', color: 'var(--ink3)' }}>Loading…</div>}><CompanyProfile /></Suspense>
}
