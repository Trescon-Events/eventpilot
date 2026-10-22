'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { Badge, Button, Card, Input, Select, Toast } from '@/app/components/ui'

/* VIPs (2026-10-19) — people a client (DIFC, KSDC …) sends us only so we can print a badge for them: name, job title, company, country and an
   optional photo. Deliberately laid out like the Speakers registry in page.tsx (same row cards, select-all + bulk bar, Add slide-over, search,
   row opens a details page) so anyone who knows Speakers knows this; VIPs just have fewer fields. Keep the two in step when either grows.
   Badges are made from the Badges page ("New VIP batch"). */

type Vip = {
  id: string; name: string; job_title: string | null; company: string | null; country: string | null
  photo_url?: string | null; photo_processed_url?: string | null; photo_cleaning_cycle_done?: boolean
  badge_status?: 'created' | 'sent' | 'printed' | null
}
type Field = 'ignore' | 'name' | 'job_title' | 'company' | 'country'
const FIELDS: Array<{ key: Field; label: string }> = [
  { key: 'ignore', label: '— Ignore this column —' }, { key: 'name', label: 'Name *' },
  { key: 'job_title', label: 'Job title' }, { key: 'company', label: 'Company' }, { key: 'country', label: 'Country' },
]

function guessField(header: string): Field {
  const h = header.toLowerCase().trim()
  if (/^(name|full[\s_-]*name|vip[\s_-]*name|guest[\s_-]*name)$/.test(h)) return 'name'
  if (/^(title|job[\s_-]*title|position|role|designation)$/.test(h)) return 'job_title'
  if (/^(company|organi[sz]ation|firm|employer|entity|department)$/.test(h)) return 'company'
  if (/^(country|nationality|location)$/.test(h)) return 'country'
  return 'ignore'
}

const BADGE_COPY = { created: { text: 'Created', color: 'var(--ink3)' }, sent: { text: 'Sent to Printer', color: 'var(--purple)' }, printed: { text: 'Printed', color: 'var(--success)' } } as const

// Same small column the Speakers rows use for "Website / Social Post / Self Promo".
function StatusColumn({ label, text, color }: { label: string; text: string; color: string }) {
  return (
    <div style={{ textAlign: 'center', minWidth: '76px' }}>
      <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: '3px' }}>{label}</div>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', fontWeight: 800, color }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, flexShrink: 0 }} />
        {text}
      </span>
    </div>
  )
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink3)', display: 'block', marginBottom: '4px' }}>{label}</label>
      {children}
    </div>
  )
}

// Same click-to-toggle dropdown the Speakers bulk bar uses.
function BulkActionMenu({ label, items }: { label: string; items: { label: string; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <Button variant="ghost" onClick={() => setOpen(o => !o)}>{label} {open ? '▴' : '▾'}</Button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 30, minWidth: '210px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: '0 8px 24px color-mix(in srgb, black 30%, transparent)', overflow: 'hidden' }}>
          {items.map((item, i) => (
            <button key={i} onClick={() => { setOpen(false); item.onClick() }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px', fontWeight: 600, color: item.danger ? 'var(--red)' : 'var(--ink)' }}>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function VipsTab({ eventId, can }: { eventId: string; can: (key: string) => boolean }) {
  const router = useRouter()
  const canManage = can('sae.badges.manage')
  const [vips, setVips] = useState<Vip[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [panelOpen, setPanelOpen] = useState(false)
  const [draft, setDraft] = useState({ name: '', job_title: '', company: '', country: '' })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<Vip[] | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/events/stakeholders/vips?event_id=${eventId}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg(data.error ?? 'Could not load VIPs.'); setVips([]); return }
    setVips(data.vips ?? [])
  }, [eventId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
  useEffect(() => { void load() }, [load])

  const visibleItems = useMemo(() => (vips ?? []).filter(v => !search.trim() || `${v.name} ${v.company ?? ''} ${v.job_title ?? ''} ${v.country ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())), [vips, search])
  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every(v => selectedIds.has(v.id))
  const toggleSelected = (id: string) => setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  async function save() {
    setSaving(true); setMsg(null)
    const res = await fetch('/api/events/stakeholders/vips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, ...draft }) })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setMsg(data.error ?? 'That did not save.'); return }
    setPanelOpen(false)
    // Like Speakers: after saving, go to their details page to add the photo and anything else.
    router.push(`/admin/events/${eventId}/stakeholders/vips/${data.vip.id}`)
  }

  async function performDelete() {
    if (!deleteConfirm) return
    setDeleting(true)
    const res = await fetch('/api/events/stakeholders/vips', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, ids: deleteConfirm.map(v => v.id) }) })
    const data = await res.json().catch(() => ({}))
    setDeleting(false)
    if (!res.ok) { setMsg(data.error ?? 'Could not delete.'); return }
    setDeleteConfirm(null); setSelectedIds(new Set()); void load()
  }

  function downloadExcel() {
    const rows = visibleItems.filter(v => selectedIds.has(v.id)).map(v => ({ Name: v.name, 'Job title': v.job_title ?? '', Company: v.company ?? '', Country: v.country ?? '' }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'VIPs')
    XLSX.writeFile(wb, `vip-details-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const bulkDownloadItems = [{ label: 'VIP Details (Excel)', onClick: downloadExcel }]
  const bulkActionItems = [
    ...(can('sae.badges.view') ? [{ label: 'Make Badges', onClick: () => router.push(`/admin/events/${eventId}/stakeholders/badges`) }] : []),
    ...(canManage ? [{ label: 'Delete', danger: true, onClick: () => setDeleteConfirm(visibleItems.filter(v => selectedIds.has(v.id))) }] : []),
  ]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--ink)' }}>VIPs</div>
          {can('sae.badges.view') && <Link href={`/admin/events/${eventId}/stakeholders/badges`}><Button variant="ghost">Badges</Button></Link>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vips…" style={{ width: '240px' }} />
          {canManage && <Button variant="ghost" onClick={() => setUploading(true)}>Upload list</Button>}
          {canManage && <Button variant="lime" onClick={() => { setDraft({ name: '', job_title: '', company: '', country: '' }); setPanelOpen(true) }}>+ Add VIP</Button>}
        </div>
      </div>

      <Toast message={msg} type="error" onClose={() => setMsg(null)} />
      <Toast message={note} type="success" onClose={() => setNote(null)} />

      {selectedIds.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'var(--red-light)', border: '1px solid var(--red-border)', borderRadius: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--red)' }}>{selectedIds.size} selected</span>
          <BulkActionMenu label="Downloads" items={bulkDownloadItems} />
          {bulkActionItems.length > 0 && <BulkActionMenu label="Actions" items={bulkActionItems} />}
          <button onClick={() => setSelectedIds(new Set())} style={{ background: 'none', border: 'none', color: 'var(--ink3)', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>Clear selection</button>
        </div>
      )}

      {vips === null ? (
        <div style={{ color: 'var(--ink3)', fontSize: '15px' }}>Loading…</div>
      ) : visibleItems.length === 0 ? (
        <div style={{ color: 'var(--ink3)', fontSize: '15px', padding: '30px 0', textAlign: 'center' }}>
          {vips.length === 0 ? `No vips yet.${canManage ? ' Add one, or upload the list the client sent.' : ''}` : 'No vips match your search.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '10px' }}>
          {vips.length > 1 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', fontWeight: 700, color: 'var(--ink3)', cursor: 'pointer', padding: '0 4px' }}>
              <input type="checkbox" checked={allVisibleSelected} onChange={e => setSelectedIds(e.target.checked ? new Set(visibleItems.map(v => v.id)) : new Set())} />
              Select all
            </label>
          )}
          {visibleItems.map(v => {
            const thumbUrl = v.photo_processed_url || v.photo_url
            const photo = v.photo_cleaning_cycle_done ? { text: 'Cleaned', color: 'var(--success)' } : thumbUrl ? { text: 'Uploaded', color: 'var(--amber)' } : { text: 'None', color: 'var(--ink4)' }
            const badge = v.badge_status ? BADGE_COPY[v.badge_status] : { text: 'None', color: 'var(--ink4)' }
            return (
              <Card key={v.id} padded>
                <div onClick={() => router.push(`/admin/events/${eventId}/stakeholders/vips/${v.id}`)} style={{ display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedIds.has(v.id)} onClick={e => e.stopPropagation()} onChange={() => toggleSelected(v.id)} />
                  {thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- small roster thumbnail, not worth a next/image optimization pass
                    <img src={thumbUrl} alt="" style={{ width: '48px', height: '48px', borderRadius: '10px', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border-light)' }} />
                  ) : (
                    <div style={{ width: '48px', height: '48px', borderRadius: '10px', flexShrink: 0, background: 'var(--surface)', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 800, color: 'var(--ink4)' }}>
                      {v.name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink)' }}>{v.name}</div>
                      {v.country && <Badge color="grey">{v.country}</Badge>}
                    </div>
                    <div style={{ fontSize: '15px', color: 'var(--ink3)', marginTop: '3px' }}>{[v.job_title, v.company].filter(Boolean).join(' · ') || '—'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '16px', flexShrink: 0, alignItems: 'center' }}>
                    <StatusColumn label="Photo" text={photo.text} color={photo.color} />
                    <StatusColumn label="Badge" text={badge.text} color={badge.color} />
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {panelOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 50%, transparent)', zIndex: 50, display: 'flex', justifyContent: 'flex-end' }} onClick={() => setPanelOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '440px', maxWidth: '100%', height: '100%', background: 'var(--card)', borderLeft: '1px solid var(--border)', padding: '24px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--ink)' }}>Add VIP</div>
              <button onClick={() => setPanelOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--ink3)', fontSize: '20px', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ fontSize: '13.5px', color: 'var(--ink4)', marginBottom: '14px' }}>
              Just the basics — you&apos;ll add their photo on their Details page after saving.
            </div>
            <div style={{ display: 'grid', gap: '12px' }}>
              <Labelled label="Name *"><Input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} autoFocus /></Labelled>
              <Labelled label="Job title"><Input value={draft.job_title} onChange={e => setDraft({ ...draft, job_title: e.target.value })} /></Labelled>
              <Labelled label="Company"><Input value={draft.company} onChange={e => setDraft({ ...draft, company: e.target.value })} /></Labelled>
              <Labelled label="Country"><Input value={draft.country} onChange={e => setDraft({ ...draft, country: e.target.value })} /></Labelled>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <Button variant="lime" onClick={save} disabled={saving || !draft.name.trim()}>{saving ? 'Saving…' : 'Save'}</Button>
              <Button variant="ghost" onClick={() => setPanelOpen(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && <VipDeleteModal vips={deleteConfirm} deleting={deleting} onConfirm={performDelete} onClose={() => setDeleteConfirm(null)} />}
      {uploading && <UploadModal eventId={eventId} onClose={() => setUploading(false)} onDone={m => { setUploading(false); setNote(m); void load() }} />}
    </div>
  )
}

// Same type-DELETE gate the Speakers delete uses (DeleteConfirmModal), minus the KonfHub/website options VIPs don't have.
function VipDeleteModal({ vips, deleting, onConfirm, onClose }: { vips: Vip[]; deleting: boolean; onConfirm: () => void; onClose: () => void }) {
  const [text, setText] = useState('')
  const subject = vips.length === 1 ? vips[0].name : `${vips.length} VIPs`
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, black 60%, transparent)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '460px', maxWidth: '100%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px' }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '8px' }}>Delete {subject}?</div>
        <div style={{ fontSize: '13.5px', color: 'var(--ink3)', marginBottom: '12px', lineHeight: 1.5 }}>
          This removes {vips.length === 1 ? 'this VIP' : 'these VIPs'} and their photos from the list. Badges already made keep their own copy. Type <strong>DELETE</strong> below to confirm.
        </div>
        <Input value={text} onChange={e => setText(e.target.value)} placeholder="Type DELETE to confirm" autoFocus style={{ marginBottom: '16px' }} />
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="red" onClick={onConfirm} disabled={text !== 'DELETE' || deleting}>{deleting ? 'Deleting…' : 'Delete'}</Button>
        </div>
      </div>
    </div>
  )
}

function UploadModal({ eventId, onClose, onDone }: { eventId: string; onClose: () => void; onDone: (message: string) => void }) {
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [map, setMap] = useState<Record<string, Field>>({})
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function pick(file: File) {
    setErr(null)
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      if (!data.length) { setErr('That file has no rows.'); return }
      const h = Object.keys(data[0])
      setHeaders(h); setRows(data)
      const guessed: Record<string, Field> = {}
      for (const col of h) guessed[col] = guessField(col)
      setMap(guessed)
    } catch { setErr('Could not read that file. Use a .csv or .xlsx.') }
  }

  const hasName = Object.values(map).includes('name')
  async function submit() {
    setSaving(true); setErr(null)
    const mapped = rows.map(r => {
      const o: Record<string, unknown> = {}
      for (const col of headers) { const f = map[col]; if (f && f !== 'ignore' && o[f] === undefined) o[f] = r[col] }
      return o
    })
    const res = await fetch('/api/events/stakeholders/vips/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, rows: mapped }) })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setErr(data.error ?? 'Upload failed.'); return }
    onDone(`${data.imported} added, ${data.updated} updated${data.skipped_no_name ? `, ${data.skipped_no_name} skipped (no name)` : ''}.`)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--overlay-scrim)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: 'var(--card)', borderRadius: '14px', border: '1px solid var(--border)', width: '100%', maxWidth: '640px', maxHeight: '90vh', overflow: 'auto', padding: '22px' }}>
        <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink)', marginBottom: '6px' }}>Upload VIP list</div>
        <div style={{ fontSize: '13.5px', color: 'var(--ink3)', marginBottom: '14px' }}>
          A .csv or .xlsx with one VIP per row. Someone already on the list (same name and company) is updated, not added twice.
        </div>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={e => { const f = e.target.files?.[0]; if (f) void pick(f) }} style={{ fontSize: '14px', marginBottom: '14px' }} />
        {headers.length > 0 && (
          <div style={{ display: 'grid', gap: '8px', marginBottom: '14px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink2)' }}>Match each column ({rows.length} rows)</div>
            {headers.map(h => (
              <div key={h} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', alignItems: 'center' }}>
                <div style={{ fontSize: '14px', color: 'var(--ink)' }}>{h}<div style={{ fontSize: '12px', color: 'var(--ink4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(rows[0][h] ?? '')}</div></div>
                <Select value={map[h] ?? 'ignore'} onChange={e => setMap({ ...map, [h]: e.target.value as Field })}>
                  {FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                </Select>
              </div>
            ))}
          </div>
        )}
        {err && <div style={{ color: 'var(--red)', fontSize: '14px', marginBottom: '10px' }}>{err}</div>}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="lime" disabled={saving || !rows.length || !hasName} onClick={() => void submit()}>{saving ? 'Uploading…' : `Upload ${rows.length || ''} rows`}</Button>
        </div>
        {rows.length > 0 && !hasName && <div style={{ fontSize: '12.5px', color: 'var(--amber)', marginTop: '8px', textAlign: 'right' }}>Match one column to Name.</div>}
      </div>
    </div>
  )
}
