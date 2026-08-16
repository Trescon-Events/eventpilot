'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import { Card, Badge } from '@/app/components/ui'
import AccessLookupPanel from './AccessLookupPanel'

/* Access & Permissions hub (2026-08-16) — an INDEX, not a new access
   mechanism. EventPilot already has a 3-tier access model, just scattered
   across the app with no single starting point:
     1. Platform tier  — /admin People tab (access_roles, tool_grants)
     2. Tool tier       — each tool's own Settings → Access tab
        (AccessTab.tsx, the module_access table) — a delegated sub-admin
        model, pre-existing, not built this session
     3. Event-workspace tier — the per-event/global RBAC built this
        session (app/admin/events/[id]/access, /admin/access)
   This page links to all three rather than merging their mechanisms —
   see the plan file (Access & Permissions hub section) for the full
   reasoning against a "everything in one page" approach. */

type ToolSummary = {
  moduleKey: string
  label: string
  settingsUrl: string
  legacy: string | null
  userGrants: number
  adminGrants: number
}

export default function AccessCenterPage() {
  const [tools, setTools] = useState<ToolSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/access-center-summary')
      .then(r => r.json())
      .then(data => setTools(Array.isArray(data.tools) ? data.tools : []))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1000px', margin: '0 auto' }}>
      <PageHeader
        eyebrow="Platform"
        title="Access & Permissions"
        description="Where every level of access management in EventPilot lives — platform-wide, per-tool, and per-event."
      />

      <div style={{ display: 'grid', gap: '18px', marginTop: '24px' }}>
        {/* Tier 1 — Platform */}
        <Card padded>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.8px', color: 'var(--teal-mid)', textTransform: 'uppercase', marginBottom: '6px' }}>Tier 1 — Platform</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Platform admins &amp; global roles</div>
              <p style={{ fontSize: '13px', color: 'var(--ink3)', margin: 0, maxWidth: '520px' }}>
                Who has full platform admin, and who holds a broader global role or tool flag
                (access_roles, tool_grants). Managed from the People tab.
              </p>
            </div>
            <Link href="/admin?tab=people"><span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--teal-mid)', whiteSpace: 'nowrap' }}>Open People tab →</span></Link>
          </div>
        </Card>

        {/* Tier 2 — Tool sub-admins */}
        <Card padded>
          <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.8px', color: 'var(--teal-mid)', textTransform: 'uppercase', marginBottom: '6px' }}>Tier 2 — Tool Sub-Admins</div>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Delegated access, per tool</div>
          <p style={{ fontSize: '13px', color: 'var(--ink3)', margin: '0 0 16px', maxWidth: '600px' }}>
            Most tools manage their own admin/user-tier grants from their own Settings → Access tab —
            you don&apos;t need platform admin to hand someone access to just one tool.
          </p>

          {loading ? (
            <div style={{ fontSize: '13px', color: 'var(--ink3)' }}>Loading…</div>
          ) : (
            <div style={{ display: 'grid', gap: '6px' }}>
              {tools.map(t => (
                <Link key={t.moduleKey} href={t.settingsUrl} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '10px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</span>
                    {t.legacy && <Badge color="amber">legacy</Badge>}
                    <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>{t.adminGrants} admin · {t.userGrants} user</span>
                  </div>
                  {t.legacy && (
                    <div style={{ fontSize: '11px', color: 'var(--ink4)', padding: '2px 14px 8px' }}>{t.legacy}</div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Tier 3 — Event workspace */}
        <Card padded>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.8px', color: 'var(--teal-mid)', textTransform: 'uppercase', marginBottom: '6px' }}>Tier 3 — Event Workspace</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>Fine-grained, per-event roles</div>
              <p style={{ fontSize: '13px', color: 'var(--ink3)', margin: 0, maxWidth: '560px' }}>
                Define reusable roles once, then assign staff to a role either across every event
                (board/leadership) or scoped to a single event. Per-event assignments happen from
                each event&apos;s own workspace, under Access — this link covers the org-wide part
                and the shared role catalog.
              </p>
            </div>
            <Link href="/admin/access"><span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--teal-mid)', whiteSpace: 'nowrap' }}>Open Org-Wide Access →</span></Link>
          </div>
        </Card>

        {/* Lookup — "who has what", the reverse of the 3 tiers above */}
        <AccessLookupPanel />
      </div>
    </div>
  )
}
