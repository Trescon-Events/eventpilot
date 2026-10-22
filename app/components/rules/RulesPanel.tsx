'use client'

import { useEffect, useState } from 'react'
import { Button, Card } from '@/app/components/ui'
import { notify } from '@/app/lib/ui/notify'

/* Rules screen (2026-10-15, docs/build_suggestions/rules-screen-and-trescon-layer.md Part 3) — one component, used on the Event Details
   Setup tab, the umbrella Reference Documents page and the Trescon house style page. Shows the EFFECTIVE rules grouped by level
   (Trescon-wide, umbrella, this event); owners with permission can add / edit / switch rules off, and anyone can try text in the test box. */

type Level = 'org' | 'umbrella' | 'event'
type Rule = {
  id: string; rule_key: string; rule_type: string; pattern: string; severity: 'error' | 'warning'; message: string; source_clause: string | null
  origin: 'client' | 'trescon'; is_active: boolean; level: Level; inherited: boolean; disabled_by: Level | null
  override: { id: string; reason: string; level: Level } | null
}
type LevelBlock = { level: Level; label: string; can_edit: boolean; rules: Rule[] }
type Payload = { levels: LevelBlock[]; can_override: boolean; owner_level: Level }
type Finding = { rule_key: string; severity: string; message: string; match: string }
type Draft = { rule_key: string; rule_type: string; pattern: string; severity: 'error' | 'warning'; message: string; source_clause: string; origin: 'client' | 'trescon' }

const TYPE_HELP: Record<string, string> = {
  forbidden_term: 'A word or phrase that must not appear. Case-insensitive; also catches endings, so "seamless" catches "seamlessly".',
  forbidden_pattern: 'A regular expression that must not match. Case-sensitive as written — use [Ff]intech to allow both cases. No (?i) flags.',
  required_format: 'JSON {"trigger":"regex","allowed":["exact form"]}. If the trigger appears but no allowed form does, it is flagged.',
  proximity: 'JSON {"a":"regex","b":"regex","maxDistance":40}. Flagged when a and b appear within that many characters of each other.',
}
const EMPTY: Draft = { rule_key: '', rule_type: 'forbidden_term', pattern: '', severity: 'error', message: '', source_clause: '', origin: 'client' }
const input = { width: '100%', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12.5px', background: 'var(--card)', color: 'var(--ink)', boxSizing: 'border-box' } as const
const tag = (bg: string, fg: string) => ({ fontSize: '10px', fontWeight: 800, letterSpacing: '0.4px', textTransform: 'uppercase', padding: '1px 6px', borderRadius: '4px', background: bg, color: fg }) as const

export default function RulesPanel({ ownerType, ownerId, title = 'Rules' }: { ownerType: 'event' | 'umbrella' | 'org'; ownerId: string; title?: string }) {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [busy, setBusy] = useState(false)

  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [warnings, setWarnings] = useState<string[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [edit, setEdit] = useState<Partial<Draft>>({})
  const [offFor, setOffFor] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const [testText, setTestText] = useState('')
  const [findings, setFindings] = useState<Finding[] | null>(null)
  const [draftCheck, setDraftCheck] = useState<{ errors: string[]; warnings: string[] } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/events/validation-rules?owner_type=${ownerType}&owner_id=${encodeURIComponent(ownerId)}`)
      .then(async res => ({ ok: res.ok, d: await res.json().catch(() => ({})) }))
      .then(({ ok, d }) => {
        if (cancelled) return
        if (!ok) setError((d as { error?: string }).error ?? 'Could not load rules.')
        else { setError(null); setData(d as Payload) }
      })
    return () => { cancelled = true }
  }, [ownerType, ownerId, reloadKey])
  const reload = () => setReloadKey(k => k + 1)

  async function call(url: string, method: string, body: unknown): Promise<{ ok: boolean; status: number; d: Record<string, unknown> }> {
    setBusy(true)
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    return { ok: res.ok, status: res.status, d }
  }

  async function addRule(acknowledge = false) {
    const r = await call('/api/events/validation-rules', 'POST', { ...draft, owner_type: ownerType, owner_id: ownerId, acknowledge_warnings: acknowledge })
    if (r.status === 409 && r.d.needs_acknowledgement) { setWarnings(r.d.warnings as string[]); return }
    if (!r.ok) { setWarnings([]); notify(String(r.d.error ?? 'Could not add the rule.'), 'error'); return }
    setAdding(false); setDraft(EMPTY); setWarnings([]); setDraftCheck(null); notify('Rule added.', 'success'); reload()
  }
  async function saveEdit(rule: Rule, acknowledge = false) {
    const r = await call(`/api/events/validation-rules?id=${rule.id}`, 'PATCH', { ...edit, acknowledge_warnings: acknowledge })
    if (r.status === 409 && r.d.needs_acknowledgement) { setWarnings(r.d.warnings as string[]); return }
    if (!r.ok) { setWarnings([]); notify(String(r.d.error ?? 'Could not save.'), 'error'); return }
    setEditing(null); setEdit({}); setWarnings([]); notify('Rule updated.', 'success'); reload()
  }
  async function toggleActive(rule: Rule) {
    const r = await call(`/api/events/validation-rules?id=${rule.id}`, 'PATCH', { is_active: !rule.is_active })
    if (r.ok) notify(rule.is_active ? 'Rule disabled.' : 'Rule enabled.', 'success'); else notify(String(r.d.error ?? 'Could not change the rule.'), 'error')
    if (r.ok) reload()
  }
  async function override(rule: Rule, disabled: boolean) {
    const r = await call('/api/events/validation-rules/override', 'POST', { owner_type: ownerType, owner_id: ownerId, rule_key: rule.rule_key, disabled, reason })
    if (!r.ok) { notify(String(r.d.error ?? 'Could not change the override.'), 'error'); return }
    setOffFor(null); setReason(''); notify(disabled ? 'Switched off here. The rule itself is untouched.' : 'Switched back on.', 'success'); reload()
  }
  async function runTest() {
    const useDraft = adding && draft.pattern.trim()
    const r = await call('/api/events/validation-rules/test', 'POST', {
      owner_type: ownerType, owner_id: ownerId, text: testText,
      ...(useDraft ? { draft: { rule_key: draft.rule_key || undefined, rule_type: draft.rule_type, pattern: draft.pattern, severity: draft.severity, message: draft.message } } : {}),
    })
    if (!r.ok) { notify(String(r.d.error ?? 'Test failed.'), 'error'); return }
    setFindings(r.d.findings as Finding[]); setDraftCheck((r.d.draft_check as typeof draftCheck) ?? null)
  }

  const own = data?.levels.find(l => l.level === data.owner_level)
  const total = data?.levels.reduce((n, l) => n + l.rules.length, 0) ?? 0

  return (
    <Card padded>
      <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--teal-mid)', marginBottom: '8px' }}>{title} ({total})</div>
      {error && <div style={{ fontSize: '12.5px', color: 'var(--red)' }}>{error}</div>}
      {!data && !error && <div style={{ fontSize: '12.5px', color: 'var(--ink3)' }}>Loading…</div>}

      {data?.levels.map(block => (
        <div key={block.level} style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink2)', marginBottom: '6px' }}>
            {block.label} <span style={{ fontWeight: 500, color: 'var(--ink3)' }}>· {block.rules.length} rule{block.rules.length === 1 ? '' : 's'}{block.level !== data.owner_level ? ' · inherited' : ''}</span>
          </div>
          {block.rules.length === 0 && <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>None.</div>}
          <div style={{ display: 'grid', gap: '6px' }}>
            {block.rules.map(r => {
              const off = !r.is_active || !!r.disabled_by
              return (
                <div key={r.id} style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-light)', opacity: off ? 0.6 : 1 }}>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <code style={{ fontSize: '12px', fontWeight: 700 }}>{r.rule_key}</code>
                    <span style={tag(r.severity === 'error' ? 'var(--red-light, #fde8e8)' : 'var(--amber-light, #fdf3dc)', r.severity === 'error' ? 'var(--red)' : 'var(--amber)')}>{r.severity}</span>
                    <span style={tag('var(--surface)', 'var(--ink3)')}>{r.rule_type.replace('_', ' ')}</span>
                    <span style={tag(r.origin === 'client' ? 'var(--teal-light)' : 'var(--surface)', r.origin === 'client' ? 'var(--teal-mid)' : 'var(--ink2)')}>{r.origin === 'client' ? 'Client' : 'Trescon'}</span>
                    {r.inherited && <span style={tag('var(--surface)', 'var(--ink3)')}>inherited</span>}
                    {!r.is_active && <span style={tag('var(--surface)', 'var(--ink3)')}>disabled</span>}
                    {r.disabled_by && <span style={tag('var(--surface)', 'var(--amber)')}>off at {r.disabled_by === 'event' ? 'this event' : 'umbrella'}</span>}
                  </div>
                  {editing === r.id ? (
                    <div style={{ display: 'grid', gap: '6px', marginTop: '8px' }}>
                      <select value={edit.severity ?? r.severity} onChange={e => setEdit({ ...edit, severity: e.target.value as Draft['severity'] })} style={input}><option value="error">error</option><option value="warning">warning</option></select>
                      <textarea value={edit.pattern ?? r.pattern} onChange={e => setEdit({ ...edit, pattern: e.target.value })} rows={2} style={{ ...input, fontFamily: 'monospace' }} />
                      <input value={edit.message ?? r.message} onChange={e => setEdit({ ...edit, message: e.target.value })} style={input} placeholder="Message" />
                      <input value={edit.source_clause ?? r.source_clause ?? ''} onChange={e => setEdit({ ...edit, source_clause: e.target.value })} style={input} placeholder="Source clause" />
                      <select value={edit.origin ?? r.origin} onChange={e => setEdit({ ...edit, origin: e.target.value as Draft['origin'] })} style={input}><option value="client">Client rule</option><option value="trescon">Trescon rule</option></select>
                      {warnings.length > 0 && <div style={{ fontSize: '12px', color: 'var(--amber)' }}>{warnings.join(' ')}</div>}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Button variant="lime" onClick={() => saveEdit(r, warnings.length > 0)} disabled={busy}>{warnings.length > 0 ? 'Save anyway' : 'Save'}</Button>
                        <Button variant="ghost" onClick={() => { setEditing(null); setEdit({}); setWarnings([]) }}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '4px', wordBreak: 'break-word' }}><code style={{ background: 'var(--surface)', padding: '1px 5px', borderRadius: '4px' }}>{r.pattern}</code></div>
                      <div style={{ fontSize: '12.5px', color: 'var(--ink2)', marginTop: '3px' }}>{r.message}{r.source_clause ? <span style={{ color: 'var(--ink3)' }}> — {r.source_clause}</span> : null}</div>
                      {r.override && <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '3px' }}>Switched off ({r.override.level === 'event' ? 'this event' : 'umbrella'}): {r.override.reason}</div>}
                      <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                        {!r.inherited && block.can_edit && (<>
                          <Button variant="ghost" onClick={() => { setEditing(r.id); setEdit({}); setWarnings([]) }}>Edit</Button>
                          <Button variant="ghost" onClick={() => toggleActive(r)} disabled={busy}>{r.is_active ? 'Disable' : 'Enable'}</Button>
                        </>)}
                        {r.inherited && data.can_override && !r.disabled_by && r.is_active && offFor !== r.id && (
                          <Button variant="ghost" onClick={() => { setOffFor(r.id); setReason('') }}>Switch off here</Button>
                        )}
                        {r.override && r.override.level === data.owner_level && data.can_override && (
                          <Button variant="ghost" onClick={() => override(r, false)} disabled={busy}>Switch back on</Button>
                        )}
                      </div>
                      {offFor === r.id && (
                        <div style={{ display: 'grid', gap: '6px', marginTop: '8px' }}>
                          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Why? (required — for example: the client document permits this word)" style={input} />
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <Button variant="lime" onClick={() => override(r, true)} disabled={busy || !reason.trim()}>Switch off</Button>
                            <Button variant="ghost" onClick={() => setOffFor(null)}>Cancel</Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {own?.can_edit && !adding && <Button variant="ghost" onClick={() => { setAdding(true); setWarnings([]); setDraftCheck(null) }}>Add rule</Button>}
      {adding && (
        <div style={{ display: 'grid', gap: '8px', padding: '10px', border: '1.5px solid var(--teal-mid)', borderRadius: '8px', marginBottom: '12px' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink2)' }}>New rule {ownerType === 'org' ? '(Trescon-wide)' : ownerType === 'umbrella' ? '(umbrella)' : '(this event)'}</div>
          <select value={draft.rule_type} onChange={e => setDraft({ ...draft, rule_type: e.target.value })} style={input}>
            {Object.keys(TYPE_HELP).map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </select>
          <div style={{ fontSize: '11.5px', color: 'var(--ink3)' }}>{TYPE_HELP[draft.rule_type]}</div>
          <input value={draft.rule_key} onChange={e => setDraft({ ...draft, rule_key: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} placeholder="Rule key, for example no-premier" style={input} />
          <textarea value={draft.pattern} onChange={e => setDraft({ ...draft, pattern: e.target.value })} rows={2} placeholder="Pattern" style={{ ...input, fontFamily: 'monospace' }} />
          <select value={draft.severity} onChange={e => setDraft({ ...draft, severity: e.target.value as Draft['severity'] })} style={input}><option value="error">error — blocks sign-off until fixed</option><option value="warning">warning — flagged for the reviewer</option></select>
          <input value={draft.message} onChange={e => setDraft({ ...draft, message: e.target.value })} placeholder="Message the reviewer sees (required)" style={input} />
          <input value={draft.source_clause} onChange={e => setDraft({ ...draft, source_clause: e.target.value })} placeholder='Source clause (required) — for example "DIFC style guide §9" or "Trescon house rule"' style={input} />
          <select value={draft.origin} onChange={e => setDraft({ ...draft, origin: e.target.value as Draft['origin'] })} style={input}><option value="client">Client rule (from a client-approved document)</option><option value="trescon">Trescon rule (house style)</option></select>
          {warnings.length > 0 && <div style={{ fontSize: '12px', color: 'var(--amber)' }}>{warnings.join(' ')}</div>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="lime" onClick={() => addRule(warnings.length > 0)} disabled={busy}>{warnings.length > 0 ? 'Save anyway' : 'Save rule'}</Button>
            <Button variant="ghost" onClick={() => { setAdding(false); setDraft(EMPTY); setWarnings([]) }}>Cancel</Button>
          </div>
        </div>
      )}

      <div style={{ marginTop: '14px', borderTop: '1px solid var(--border-light)', paddingTop: '12px' }}>
        <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink2)', marginBottom: '6px' }}>Test box</div>
        <div style={{ fontSize: '11.5px', color: 'var(--ink3)', marginBottom: '6px' }}>Paste sample text to see the findings{adding ? ', including the rule you are drafting' : ''}. Nothing is saved.</div>
        <textarea value={testText} onChange={e => setTestText(e.target.value)} rows={3} placeholder="Paste a post…" style={input} />
        <div style={{ marginTop: '6px' }}><Button variant="ghost" onClick={runTest} disabled={busy || !testText.trim()}>Run test</Button></div>
        {draftCheck && (draftCheck.errors.length > 0 || draftCheck.warnings.length > 0) && (
          <div style={{ fontSize: '12px', marginTop: '6px', color: draftCheck.errors.length ? 'var(--red)' : 'var(--amber)' }}>{[...draftCheck.errors, ...draftCheck.warnings].join(' ')}</div>
        )}
        {findings && (
          <div style={{ marginTop: '8px', fontSize: '12.5px', display: 'grid', gap: '4px' }}>
            {findings.length === 0 ? <span style={{ color: 'var(--teal-mid)' }}>No findings.</span> : findings.map((f, i) => (
              <div key={i}><strong style={{ color: f.severity === 'error' ? 'var(--red)' : 'var(--amber)' }}>{f.severity}</strong> · <code>{f.rule_key}</code> · “{f.match}” — {f.message}</div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}
