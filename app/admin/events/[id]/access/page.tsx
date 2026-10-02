import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader'
import AssignmentsTab from './AssignmentsTab'

/* Per-event Access — assigns staff to a role for THIS event. Platform-admin only (enforced by middleware.ts's blanket
   "/admin/* requires session.adm" rule — this route is deliberately NOT added to the isToolRoute regex, so no separate
   layout.tsx gate is needed here). The roles themselves (names + permission bundles) are global, so they are defined in
   one place — /admin/access > Roles — not per event (moved 2026-10-02; this page used to carry a Roles tab). See
   supabase/access_rbac.sql for the schema. */

export default async function EventAccessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1100px', margin: '0 auto' }}>
      <PageHeader
        eyebrow="Event Workspace"
        title="Access"
        description={<>Assign staff to a role for this event. Roles are defined once, centrally, and apply to every event they&apos;re assigned on. <Link href="/admin/access" style={{ color: 'var(--teal-mid)', fontWeight: 700 }}>Manage roles and permissions →</Link></>}
      />
      <AssignmentsTab eventId={eventId} />
    </div>
  )
}
