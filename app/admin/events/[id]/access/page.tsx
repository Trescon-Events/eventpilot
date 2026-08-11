'use client'

import { useState, use } from 'react'
import PageHeader from '@/app/components/PageHeader'
import RolesTab from './RolesTab'
import AssignmentsTab from './AssignmentsTab'

/* Per-event Access — Phase 1 of the SAE producer-workflow initiative.
   Platform-admin only in v1 (enforced by middleware.ts's blanket
   "/admin/* requires session.adm" rule — this route is deliberately NOT
   added to the isToolRoute regex, so no separate layout.tsx gate is
   needed here). Two tabs: Roles (the global, reusable permission-bundle
   catalog — app/lib/registry/access-permissions.ts) and Assignments
   (which staff hold which role on THIS event). See
   supabase/access_rbac.sql for the schema. */

export default function EventAccessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params)
  const [tab, setTab] = useState<'roles' | 'assignments'>('assignments')

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1100px', margin: '0 auto' }}>
      <PageHeader
        eyebrow="Event Workspace"
        title="Access"
        description="Define reusable roles once, then assign staff to a role for this event. Roles apply across every event they're assigned on."
      />

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border)' }}>
        {(['assignments', 'roles'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: '10px 16px', fontSize: '13px', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
              background: 'none', border: 'none', borderBottom: tab === t ? '2px solid var(--teal-mid)' : '2px solid transparent',
              color: tab === t ? 'var(--ink)' : 'var(--ink3)', textTransform: 'capitalize',
            }}>
            {t === 'assignments' ? 'Assign People' : 'Roles'}
          </button>
        ))}
      </div>

      {tab === 'roles' ? <RolesTab /> : <AssignmentsTab eventId={eventId} />}
    </div>
  )
}
