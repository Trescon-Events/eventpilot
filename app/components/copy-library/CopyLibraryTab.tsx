'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Button, Card } from '@/app/components/ui'
import { notify } from '@/app/lib/ui/notify'
import { CATALOGUE_SECTIONS, variantLabel, type CatalogueEntry } from '@/app/lib/content/copy-catalogue'

/* Event Details → Copy Library (docs/build_suggestions/copy-library.md §8). Approved, reusable Trescon-written copy for every tool. Tools read only the approved
   text; this screen is where it is generated, edited, approved internally, sent to the client as one bundle, and re-reviewed when the messaging document changes. */

type Finding = { rule_key: string; severity: 'error' | 'warning'; message: string; match: string }
type SourceRef = { type?: 'doc_section' | 'public_figure'; section_id?: string; section_title?: string; figure_id?: string }
type Item = {
  id: string; asset_key: string; variant_length: string; variant_phase: string; working_text: string; approved_text: string | null; approved_version: number
  status: string; source: string; source_refs: SourceRef[]; approved_at: string | null; review_reason: string | null; level: 'event' | 'umbrella' | 'org'; inherited: boolean
  findings: Finding[]; usage: Record<string, number>
}
type Payload = {
  catalogue: CatalogueEntry[]; items: Item[]; can_edit: boolean; phase: 'pre' | 'post' | null; requires_client_approval: boolean; requires_override: boolean | null
  suggest_post: boolean; dates: string | null; trescon_about: string | null; needs_review: number
}

const STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'var(--ink3)' }, in_internal_review: { label: 'Approved internally', color: 'var(--amber)' },
  pending_client: { label: 'With the client', color: 'var(--amber)' }, approved: { label: 'Approved', color: 'var(--teal-mid)' },
  needs_review: { label: 'Needs review', color: 'var(--red)' }, edited_since_approval: { label: 'Edited since approval', color: 'var(--amber)' },
}
const USAGE_LABEL: Record<string, string> = { sae_announcement: 'SAE post', press_release: 'press release', email: 'email' }
const vkey = (l: string, p: string) => `${l}|${p}`

export default function CopyLibraryTab({ ownerType, ownerId }: { ownerType: 'event' | 'umbrella' | 'org'; ownerId: string }) {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [bundleUrl, setBundleUrl] = useState<string | null>(null)

  const [reloadKey, setReloadKey] = useState(0)
  const load = useCallback(async () => { setReloadKey(k => k + 1) }, [])
  useEffect(() => {
    fetch(`/api/events/copy-library?owner_type=${ownerType}&owner_id=${encodeURIComponent(ownerId)}`)
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Could not load the Copy Library.'); setData(j); setError(null) })
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load.'))
  }, [ownerType, ownerId, reloadKey])

  async function act(action: string, extra: Record<string, unknown> = {}, label = action) {
    setBusy(label)
    try {
      const r = await fetch('/api/events/copy-library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, owner_type: ownerType, owner_id: ownerId, ...extra }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { notify(j.error || 'That did not work.', 'error'); return null }
      await load(); return j
    } finally { setBusy(null) }
  }

  if (error) return <Card padded><div style={{ color: 'var(--red)', fontSize: '13px' }}>{error}</div></Card>
  if (!data) return <Card padded><div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Loading…</div></Card>

  const own = data.items.filter(i => !i.inherited)
  const waiting = own.filter(i => i.status === 'in_internal_review').length
  const canEdit = data.can_edit

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <Card padded>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)' }}>Copy Library</div>
            <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '2px' }}>Approved copy that every tool reads. Change it once and every tool knows. Tools only ever use the approved text; a draft or an item in review never goes out.</div>
          </div>
          {data.needs_review > 0 && <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--red)' }}>{data.needs_review} need{data.needs_review === 1 ? 's' : ''} review</span>}
          {canEdit && <Button variant="ghost" disabled={!!busy} onClick={async () => {
            const j = await act('generate', {}, 'generate')
            if (j) notify(j.failed?.length ? `Generated ${j.created.length}; ${j.failed.length} failed: ${j.failed.map((f: { key: string; error: string }) => `${f.key} (${f.error})`).join('; ')}` : `Generated ${j.created.length} item${j.created.length === 1 ? '' : 's'}.`, j.failed?.length ? 'error' : 'success')
          }}>{busy === 'generate' ? 'Generating… (up to a minute)' : 'Generate starter set'}</Button>}
          {canEdit && <Button disabled={!!busy || waiting === 0} onClick={async () => { const j = await act('send_bundle', {}, 'bundle'); if (j?.url) setBundleUrl(j.url) }}>{busy === 'bundle' ? 'Sending…' : `Send for client approval${waiting ? ` (${waiting})` : ''}`}</Button>}
        </div>
        {bundleUrl && (
          <div style={{ marginTop: '10px', fontSize: '12.5px', background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '8px 10px' }}>
            Client approval link (send it to the client; it works without a login): <a href={bundleUrl} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>{bundleUrl}</a>
            <button onClick={() => { navigator.clipboard?.writeText(bundleUrl); notify('Link copied.') }} style={{ marginLeft: '8px', border: 'none', background: 'none', color: 'var(--teal-mid)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Copy</button>
          </div>
        )}
        {ownerType === 'event' && (
          <div style={{ marginTop: '12px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', fontSize: '12.5px' }}>
            <span><strong>Copy phase:</strong>{' '}
              {(['pre', 'post'] as const).map(p => (
                <button key={p} disabled={!canEdit || !!busy} onClick={() => data.phase !== p && act('set_phase', { phase: p }, 'phase')}
                  style={{ marginLeft: '4px', padding: '3px 10px', borderRadius: '999px', border: '1px solid var(--border)', cursor: canEdit ? 'pointer' : 'default', fontFamily: 'inherit', fontSize: '12px', fontWeight: 800,
                    background: data.phase === p ? 'var(--teal-mid)' : 'var(--card)', color: data.phase === p ? 'var(--card)' : 'var(--ink2)' }}>
                  {p === 'pre' ? 'Before the event' : 'After the event'}
                </button>
              ))}
            </span>
            <label style={{ display: 'flex', gap: '6px', alignItems: 'center', color: 'var(--ink2)' }}>
              <input type="checkbox" checked={data.requires_client_approval} disabled={!canEdit || !!busy} onChange={e => act('set_client_approval', { required: e.target.checked }, 'req')} />
              Client approval required{data.requires_override === null ? ' (default for this event type)' : ''}
            </label>
          </div>
        )}
        {data.suggest_post && canEdit && (
          <div style={{ marginTop: '10px', fontSize: '12.5px', color: 'var(--amber)' }}>
            The public dates{data.dates ? ` (“${data.dates}”)` : ''} look like they are in the past. If the event has concluded, switch the copy phase to “After the event”. Nothing changes until you do.
          </div>
        )}
      </Card>

      {CATALOGUE_SECTIONS.map(section => {
        const entries = data.catalogue.filter(e => e.section === section)
        if (!entries.length) return null
        return (
          <div key={section} style={{ display: 'grid', gap: '10px' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)' }}>{section}</div>
            {entries.map(entry => <EntryCard key={entry.key} entry={entry} data={data} act={act} busy={busy} canEdit={canEdit} />)}
          </div>
        )
      })}

      <Card padded>
        <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: '6px' }}>Trescon-wide · About Trescon (read-only)</div>
        {data.trescon_about
          ? <div style={{ fontSize: '12.5px', color: 'var(--ink2)', whiteSpace: 'pre-wrap' }}>{data.trescon_about}</div>
          : <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>No approved About Trescon text yet.</div>}
        <div style={{ marginTop: '6px', fontSize: '12px' }}>Kept in one place: <Link href="/brand-content/content/company-profile" style={{ color: 'var(--teal-mid)', fontWeight: 800 }}>Company profile</Link>. It is not copied into the library.</div>
      </Card>
    </div>
  )
}

function EntryCard({ entry, data, act, busy, canEdit }: { entry: CatalogueEntry; data: Payload; act: (a: string, x?: Record<string, unknown>, l?: string) => Promise<any>; busy: string | null; canEdit: boolean }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const initial = (() => {
    const pref = entry.variants.find(v => v.phase === (data.phase ?? 'pre') || v.phase === 'any') ?? entry.variants[0]
    return vkey(pref.length, pref.phase)
  })()
  const [sel, setSel] = useState(initial)
  const [length, phase] = sel.split('|')
  const mine = data.items.find(i => !i.inherited && i.asset_key === entry.key && i.variant_length === length && i.variant_phase === phase)
  const inherited = !mine ? data.items.find(i => i.inherited && i.asset_key === entry.key && i.variant_length === length && i.variant_phase === phase) : undefined
  const item = mine ?? inherited
  const anyOwn = data.items.filter(i => !i.inherited && i.asset_key === entry.key)
  const worst = anyOwn.some(i => i.status === 'needs_review') ? 'needs_review' : null

  return (
    <Card padded>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '14px', fontWeight: 800 }}>{entry.label}</div>
        {worst && <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--red)' }}>needs review</span>}
        <div style={{ fontSize: '11.5px', color: 'var(--ink3)' }}>Read by: {entry.consumers.join(', ')}</div>
      </div>
      {entry.variants.length > 1 && (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', margin: '8px 0 4px' }}>
          {entry.variants.map(v => {
            const k = vkey(v.length, v.phase)
            const it = data.items.find(i => i.asset_key === entry.key && i.variant_length === v.length && i.variant_phase === v.phase && !i.inherited) ?? data.items.find(i => i.asset_key === entry.key && i.variant_length === v.length && i.variant_phase === v.phase)
            return (
              <button key={k} onClick={() => setSel(k)} style={{ padding: '3px 10px', borderRadius: '999px', fontFamily: 'inherit', fontSize: '11.5px', fontWeight: 800, cursor: 'pointer',
                border: '1px solid var(--border)', background: sel === k ? 'var(--teal-mid)' : 'var(--card)', color: sel === k ? 'var(--card)' : 'var(--ink2)' }}>
                {variantLabel(v)}{it ? <span style={{ marginLeft: '5px', color: sel === k ? 'var(--card)' : STATUS[it.status]?.color }}>●</span> : null}
              </button>
            )
          })}
        </div>
      )}
      {!item
        ? <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '8px' }}>Not generated yet{canEdit ? '. Use “Generate starter set” above.' : '.'}</div>
        : <ItemEditor key={`${item.id}-${item.status}-${item.approved_version}-${item.working_text.length}`} item={item} act={act} busy={busy} canEdit={canEdit && !item.inherited} />}
    </Card>
  )
}

function ItemEditor({ item, act, busy, canEdit }: { item: Item; act: (a: string, x?: Record<string, unknown>, l?: string) => Promise<any>; busy: string | null; canEdit: boolean }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const [text, setText] = useState(item.working_text)
  const [saved, setSaved] = useState(item.working_text)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notUsed = item.approved_text === ''
  const readOnly = !canEdit || item.source === 'from_doc' || item.status === 'pending_client' || notUsed
  const st = notUsed ? { label: 'Not used for this event', color: 'var(--ink3)' } : (STATUS[item.status] ?? STATUS.draft)
  const errs = item.findings.filter(f => f.severity === 'error')

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  function change(v: string) {
    setText(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const r = await fetch('/api/events/copy-library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'edit', item_id: item.id, text: v }) })
      if (r.ok) setSaved(v); else notify((await r.json().catch(() => ({}))).error || 'Could not save.', 'error')
    }, 900)
  }
  const dirty = text !== saved
  const usage = Object.entries(item.usage).map(([k, n]) => `${n} ${USAGE_LABEL[k] ?? k}${n === 1 ? '' : 's'}`).join(', ')
  const sources = [...new Set(item.source_refs.filter(r => r.type !== 'public_figure').map(r => r.section_title).filter(Boolean))].slice(0, 6).join(', ')
  const figCount = item.source_refs.filter(r => r.type === 'public_figure').length

  return (
    <div style={{ marginTop: '8px', display: 'grid', gap: '8px' }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', fontSize: '12px' }}>
        <span style={{ fontWeight: 800, color: st.color }}>{st.label}</span>
        {item.approved_version > 0 && !notUsed && <span style={{ color: 'var(--ink3)' }}>Approved version {item.approved_version}{item.approved_at ? ` · ${new Date(item.approved_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</span>}
        {item.inherited && <span style={{ color: 'var(--ink3)' }}>Inherited from the {item.level === 'umbrella' ? 'umbrella' : 'Trescon-wide level'} (read-only here). Add your own to override it.</span>}
        {item.source === 'from_doc' && <span style={{ color: 'var(--ink3)' }}>Mirrors the messaging document word for word</span>}
      </div>

      {item.status === 'needs_review' && (
        <div style={{ border: '1px solid var(--red)', borderRadius: '8px', padding: '8px 10px', fontSize: '12.5px', display: 'grid', gap: '6px' }}>
          <div><strong style={{ color: 'var(--red)' }}>The messaging document changed.</strong> {item.review_reason}</div>
          <div style={{ color: 'var(--ink3)' }}>Tools keep using the last approved text{item.approved_text ? '' : ' (there is none yet, so they use today’s source)'} until this is approved again.</div>
          {canEdit && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <Button variant="ghost" disabled={!!busy} onClick={() => act('apply_change', { item_id: item.id })}>Apply this change</Button>
              <Button variant="ghost" disabled={!!busy} onClick={() => act('regenerate', { item_id: item.id }, 'regen')}>{busy === 'regen' ? 'Regenerating…' : 'Regenerate'}</Button>
              <Button variant="ghost" disabled={!!busy} onClick={() => act('dismiss_change', { item_id: item.id })}>It still reads right</Button>
            </div>
          )}
        </div>
      )}

      {notUsed && <div style={{ fontSize: '12.5px', color: 'var(--ink2)', background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '8px 10px' }}>This event does not use this one. Every tool that reads it carries on exactly as it does today.{canEdit && !item.inherited && <> <button type="button" disabled={!!busy} onClick={() => act('use_again', { item_id: item.id })} style={{ border: 'none', background: 'none', color: 'var(--teal-mid)', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Use it again</button></>}</div>}
      {!notUsed && <textarea value={text} readOnly={readOnly} onChange={e => change(e.target.value)} rows={Math.min(14, Math.max(3, Math.ceil(text.length / 90) + 1))}
        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', lineHeight: 1.5, fontFamily: 'inherit', background: readOnly ? 'var(--surface)' : 'var(--card)', color: 'var(--ink)', boxSizing: 'border-box', resize: 'vertical' }} />}

      {item.findings.length > 0 && (
        <div style={{ display: 'grid', gap: '3px', fontSize: '12px' }}>
          {item.findings.map((f, i) => <div key={i}><strong style={{ color: f.severity === 'error' ? 'var(--red)' : 'var(--amber)' }}>{f.severity}</strong> · “{f.match}” — {f.message}</div>)}
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        {canEdit && !notUsed && item.status !== 'approved' && item.status !== 'pending_client' && item.status !== 'in_internal_review' && (
          <Button disabled={!!busy || dirty || !text.trim() || errs.length > 0} title={errs.length ? 'Fix the rule errors first' : undefined} onClick={() => act('approve', { item_id: item.id })}>Approve internally</Button>
        )}
        {canEdit && !notUsed && item.status !== 'pending_client' && <Button variant="ghost" disabled={!!busy} onClick={() => act('mark_not_used', { item_id: item.id }, 'unused')}>{busy === 'unused' ? 'Saving…' : 'Not used for this event'}</Button>}
        {canEdit && !notUsed && item.source !== 'from_doc' && item.status !== 'pending_client' && <Button variant="ghost" disabled={!!busy} onClick={() => act('regenerate', { item_id: item.id }, 'regen')}>{busy === 'regen' ? 'Regenerating…' : 'Regenerate'}</Button>}
        {dirty && <span style={{ fontSize: '11.5px', color: 'var(--ink3)' }}>Saving…</span>}
      </div>
      <div style={{ fontSize: '11.5px', color: 'var(--ink3)' }}>
        {sources && <>Built from: {sources}. </>}{figCount > 0 && <>Built from {figCount} approved public figure{figCount === 1 ? '' : 's'} (Post-event tab). </>}{usage ? `Used by ${usage}.` : 'Not used by any tool yet.'}
      </div>
    </div>
  )
}
