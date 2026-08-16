'use client'

import { useState } from 'react'
import PageHeader from '@/app/components/PageHeader'
import AssignmentsTab from '@/app/admin/events/[id]/access/AssignmentsTab'
import StaffPortalMappingTab from './StaffPortalMappingTab'

/* Organization-Wide Access (2026-08-16) — Phase 1 & 2 of the Event
   Workspace Access Roles foundation redesign.
   - Assignments tab: assigns a role (the same reusable catalog defined in
     any event's Access → Roles tab) with no event_id, so it applies to
     every event, current and future — for board/leadership who need
     visibility across the whole portfolio without being added
     event-by-event.
   - Staff Portal Mapping tab (Phase 2): maps a Staff Portal role_type to
     one of those same roles, so every HRMS sync auto-grants the matching
     access — see app/lib/hrms/apply-role-access-map.ts.
   Platform-admin only (enforced by middleware.ts's blanket "/admin/*
   requires session.adm" rule, no separate layout.tsx gate needed). */

export default function GlobalAccessPage() {
  const [tab, setTab] = useState<'assignments' | 'hrms-mapping'>('assignments')

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1100px', margin: '0 auto' }}>
      <PageHeader
        eyebrow="Platform"
        title="Organization-Wide Access"
        description="Assign a role across every event at once, and map Staff Portal role types to auto-grant the matching access. Roles themselves are defined from any event's Access → Roles tab."
      />

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border)' }}>
        {([
          ['assignments', 'Org-Wide Assignments'],
          ['hrms-mapping', 'Staff Portal Mapping'],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{
              padding: '10px 16px', fontSize: '13px', fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
              background: 'none', border: 'none', borderBottom: tab === key ? '2px solid var(--teal-mid)' : '2px solid transparent',
              color: tab === key ? 'var(--ink)' : 'var(--ink3)',
            }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'assignments' ? <AssignmentsTab /> : <StaffPortalMappingTab />}
    </div>
  )
}
