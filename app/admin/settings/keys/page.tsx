'use client'

import { useEffect, useMemo, useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import { Card, Button, Badge, Input, Select, Toast } from '@/app/components/ui'
import type { BadgeColor } from '@/app/components/ui'
import { CREDENTIALS, RETIRED_VARS, type RotateMode, type CredentialStore } from '@/app/lib/registry/credentials'

/* Keys & Credentials (2026-10-22) — the checklist for "rotate everything" day.
   Every platform/key the app depends on, with the direct console URL and the
   login that owns it, so nobody hunts through Google/Cloudflare accounts again.
   The list itself is code (app/lib/registry/credentials.ts) and is enforced in CI
   (`npm run check:keys`); this page only adds the "last rotated" log.
   NO secret values are stored or shown here — names, links and dates only. */

const MODE: Record<RotateMode, { label: string; color: BadgeColor; hint: string }> = {
  'old-stays': { label: 'Safe: old key stays', color: 'teal', hint: 'Create the new one first; the old one keeps working until you delete it.' },
  'old-dies': { label: 'Old dies at once', color: 'amber', hint: 'Regenerating kills the old value immediately — have Railway ready.' },
  'must-match': { label: 'Change in 2+ places', color: 'purple', hint: 'Must be updated in more than one system at the same moment.' },
  none: { label: 'No rotation', color: 'grey', hint: 'The platform cannot rotate this — read the note.' },
}

const STORE_LABEL: Record<CredentialStore, string> = {
  railway: 'Railway', 'github-actions': 'GitHub Actions', database: 'Database', external: 'Other system',
}

type Rotation = { at: string; by: string | null; note: string | null }

export default function KeysAndCredentialsPage() {
  const [rotations, setRotations] = useState<Record<string, Rotation>>({})
  const [historyAvailable, setHistoryAvailable] = useState(true)
  const [q, setQ] = useState('')
  const [group, setGroup] = useState('all')
  const [saving, setSaving] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    fetch('/api/admin/credentials')
      .then(r => r.json())
      .then(d => { setRotations(d.rotations ?? {}); setHistoryAvailable(d.historyAvailable !== false) })
      .catch(() => setHistoryAvailable(false))
  }, [])

  const groups = useMemo(() => Array.from(new Set(CREDENTIALS.map(c => c.group))), [])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return CREDENTIALS.filter(c => {
      if (group !== 'all' && c.group !== group) return false
      if (!needle) return true
      return [c.platform, c.what, c.login, ...c.vars].join(' ').toLowerCase().includes(needle)
    })
  }, [q, group])

  async function markRotated(id: string) {
    setSaving(id); setMsg(null)
    try {
      const res = await fetch('/api/admin/credentials', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save.')
      setRotations(r => ({ ...r, [id]: { at: new Date().toISOString(), by: 'You', note: null } }))
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Could not save.', ok: false })
    } finally {
      setSaving(null)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <PageHeader
        eyebrow="Admin Settings"
        title="Keys & Credentials"
        description="Every platform and key EventPilot depends on — where it lives, which login owns it, and the direct link to rotate it. Names and links only; no secret values are stored here."
      />

      <div style={{ padding: '24px 32px', maxWidth: '980px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <Card padded>
          <div style={{ fontSize: '13px', color: 'var(--ink2)', lineHeight: 1.7 }}>
            <strong>Rotation day, in order:</strong> create the new key (never delete the old one first) → put it in Railway
            (and any &quot;also set in&quot; place) → deploy → check the feature works → only then delete the old key → press
            <em> Mark rotated</em>. Anything marked <em>Old dies at once</em> or <em>Change in 2+ places</em> needs Railway open first.
            <br />
            <span style={{ color: 'var(--ink3)' }}>
              Adding a new platform or secret anywhere in the app? Add it to <code>app/lib/registry/credentials.ts</code> in the same
              change — CI (<code>npm run check:keys</code>) fails if a secret env var is missing from the list.
            </span>
          </div>
        </Card>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search platform, variable name or login…" />
          </div>
          <div style={{ flex: '0 1 240px' }}>
            <Select value={group} onChange={e => setGroup(e.target.value)}>
              <option value="all">All groups</option>
              {groups.map(g => <option key={g} value={g}>{g}</option>)}
            </Select>
          </div>
        </div>

        {!historyAvailable && (
          <div style={{ fontSize: '12.5px', color: 'var(--amber)' }}>
            &quot;Last rotated&quot; history isn&apos;t available yet — run supabase/credentials_rotation_migration.sql to enable it. The list below works without it.
          </div>
        )}
        {msg && <Toast message={msg.text} type={msg.ok ? 'success' : 'error'} onClose={() => setMsg(null)} />}

        {rows.map(c => {
          const mode = MODE[c.mode]
          const rot = rotations[c.id]
          return (
            <Card key={c.id} padded>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>{c.platform}</div>
                  <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.6, marginTop: '2px' }}>{c.what}</div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <Badge color="grey">{c.group}</Badge>
                  <span title={mode.hint}><Badge color={mode.color}>{mode.label}</Badge></span>
                </div>
              </div>

              {c.vars.length > 0 && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}>
                  {c.vars.map(v => (
                    <code key={v} style={{ fontSize: '11.5px', padding: '2px 8px', borderRadius: '6px', background: 'var(--card-hi)', border: '1px solid var(--border)', color: 'var(--ink2)' }}>{v}</code>
                  ))}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px 20px', marginTop: '12px', fontSize: '12.5px', lineHeight: 1.6 }}>
                <div><span style={{ color: 'var(--ink4)', fontWeight: 700 }}>Sign in as</span><br /><span style={{ color: 'var(--ink)', fontWeight: 600 }}>{c.login}</span></div>
                <div><span style={{ color: 'var(--ink4)', fontWeight: 700 }}>Kept in</span><br />{c.stores.map(s => STORE_LABEL[s]).join(' · ')}</div>
                <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--ink4)', fontWeight: 700 }}>How to rotate</span><br />{c.rotate}</div>
                {c.alsoSet && (
                  <div style={{ gridColumn: '1 / -1', color: 'var(--amber)' }}><strong>Also set in:</strong> {c.alsoSet}</div>
                )}
                {c.note && (
                  <div style={{ gridColumn: '1 / -1', color: 'var(--ink3)' }}><strong>Note:</strong> {c.note}</div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '14px' }}>
                <Button variant="teal" href={c.consoleUrl} target="_blank" rel="noopener noreferrer">Open console ↗</Button>
                {historyAvailable && (
                  <Button variant="ghost" onClick={() => markRotated(c.id)} disabled={saving === c.id}>
                    {saving === c.id ? 'Saving…' : 'Mark rotated'}
                  </Button>
                )}
                <span style={{ fontSize: '12px', color: 'var(--ink4)' }}>
                  {rot ? `Last rotated ${new Date(rot.at).toLocaleDateString()}${rot.by ? ` by ${rot.by}` : ''}` : 'Never recorded'}
                </span>
              </div>
            </Card>
          )
        })}

        {rows.length === 0 && <div style={{ fontSize: '13px', color: 'var(--ink4)' }}>Nothing matches.</div>}

        <Card padded>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Retired — delete from Railway</div>
          <div style={{ fontSize: '12.5px', color: 'var(--ink3)', lineHeight: 1.6, marginBottom: '10px' }}>
            These variables are no longer read by the app. If they are still in Railway, delete them (after the release that removed their code is live).
          </div>
          {Object.entries(RETIRED_VARS).map(([name, why]) => (
            <div key={name} style={{ display: 'flex', gap: '10px', alignItems: 'baseline', fontSize: '12.5px', padding: '4px 0', flexWrap: 'wrap' }}>
              <code style={{ fontSize: '11.5px', padding: '2px 8px', borderRadius: '6px', background: 'var(--card-hi)', border: '1px solid var(--border)' }}>{name}</code>
              <span style={{ color: 'var(--ink3)' }}>{why}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}
