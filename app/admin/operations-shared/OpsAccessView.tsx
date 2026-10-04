'use client'

import { useCallback, useEffect, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Button, SearchableSelect } from '@/app/components/ui'
import Toast from '@/app/components/ui/Toast'
import { useBreadcrumbLabel } from '@/app/lib/nav/breadcrumb-labels'
import { useOpsScope } from './scope-context'

/* Operations > Access: who handles which Operations section. Assigning someone gives them access to the section and
   its notifications. For the Operations Lead / Project Manager / Coordinator (ops.access.manage). */

type Section = { key: string; label: string }
type Assignment = { id: string; section: string; staff_id: string; name: string; email: string }
type Candidate = { id: string; name: string; email: string; role: string | null }
type Data = { scope: { kind: 'event' | 'umbrella'; id: string; name: string }; can_manage: boolean; sections: Section[]; assignments: Assignment[]; candidates: Candidate[] }

const BLURB: Record<string, string> = {
  licenses: 'Reviews licence batches and sends them to the licence vendor. Gets the licence notifications.',
  badges: 'Reviews speaker badge print files, sends them to the print vendor and is told when they are printed.',
}

export default function OpsAccessView() {
  const scope = useOpsScope()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pick, setPick] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  useBreadcrumbLabel(scope.id, data?.scope.name ?? null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/events/operations/section-assignments?${scope.query}`)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { setError(body.error ?? 'Could not load assignments.'); return }
    setData(body); setError(null)
  }, [scope.query])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
  useEffect(() => { void load() }, [load])

  async function add(section: string) {
    const staffId = pick[section]
    if (!staffId) return
    setBusy(section)
    const res = await fetch('/api/events/operations/section-assignments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...scope.body, section, staff_id: staffId }) })
    const body = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { setToast({ message: body.error ?? 'Could not assign.', type: 'error' }); return }
    setPick(p => ({ ...p, [section]: '' })); setToast({ message: 'Assigned. They have been notified.', type: 'success' }); await load()
  }
  async function remove(a: Assignment) {
    setBusy(a.id)
    const res = await fetch(`/api/events/operations/section-assignments/${a.id}`, { method: 'DELETE' })
    const body = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { setToast({ message: body.error ?? 'Could not remove.', type: 'error' }); return }
    await load()
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader eyebrow="Operations" title="Access" backHref={scope.basePath} backLabel="Operations"
        description={`Choose who handles each Operations section${data ? ` for ${data.scope.name}` : ''}. Someone assigned to a section can open it and take its actions, and gets all its notifications.${data?.scope.kind === 'umbrella' ? ' Assignments here apply to every event under this umbrella.' : ''}`} />
      <div style={{ padding: '24px 32px', maxWidth: '860px', display: 'grid', gap: '16px' }}>
        {error && <div style={{ color: 'var(--red)', fontSize: '14px' }}>{error}</div>}
        {!data && !error && <div style={{ color: 'var(--ink3)' }}>Loading…</div>}
        {data?.sections.map(sec => {
          const mine = data.assignments.filter(a => a.section === sec.key)
          const available = data.candidates.filter(c => !mine.some(m => m.staff_id === c.id))
          return (
            <div key={sec.key} style={{ padding: '18px', border: '1px solid var(--border-light)', borderRadius: '12px', background: 'var(--card)' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ink)' }}>{sec.label}</div>
              <div style={{ fontSize: '13px', color: 'var(--ink3)', margin: '4px 0 12px', lineHeight: 1.5 }}>{BLURB[sec.key]}</div>
              {mine.length === 0 ? (
                <div style={{ fontSize: '14px', color: 'var(--amber)', marginBottom: '10px' }}>No one is assigned yet{sec.key === 'badges' ? ' — producers can’t send badge files to Ops until someone is.' : '.'}</div>
              ) : (
                <div style={{ display: 'grid', gap: '6px', marginBottom: '12px' }}>
                  {mine.map(a => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: 'var(--ink)' }}>
                      <span style={{ flex: 1, minWidth: 0 }}><strong>{a.name}</strong> <span style={{ color: 'var(--ink3)' }}>{a.email}</span></span>
                      {data.can_manage && <Button variant="ghost" disabled={busy === a.id} onClick={() => void remove(a)}>Remove</Button>}
                    </div>
                  ))}
                </div>
              )}
              {data.can_manage && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                    <SearchableSelect value={pick[sec.key] ?? ''} onChange={id => setPick(p => ({ ...p, [sec.key]: id }))} placeholder="Search for a person to add…"
                      options={available.map(c => ({ id: c.id, label: c.name, sublabel: [c.role, c.email].filter(Boolean).join(' · ') }))} />
                  </div>
                  <Button variant="lime" disabled={!pick[sec.key] || busy === sec.key} onClick={() => void add(sec.key)}>{busy === sec.key ? 'Assigning…' : 'Assign'}</Button>
                </div>
              )}
            </div>
          )
        })}
        {data && !data.can_manage && <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Only the Operations lead, project manager or coordinator can change these assignments.</div>}
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
