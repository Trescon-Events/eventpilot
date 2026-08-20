'use client'
import AccessTab from '@/app/components/AccessTab'
import PageHeader from '@/app/components/PageHeader'

/*
  Lets a Task Manager admin console admin (Khalifa, initially) grant or
  revoke that same access for other staff, without needing a platform admin
  (Madhu/Durga) involved every time. Reuses the app-wide delegated-admin
  mechanism (AccessTab + module_access table) already built for Knowledge
  Base/DocuHub — same self-check + grant/revoke UI, parameterized to this
  module's own moduleAccessKey. Nested under console/, so it inherits that
  route's own requireModuleAccess('task-manager-admin') layout gate — no
  separate gate needed here.
*/
export default function TaskManagerAccessPage() {
  return (
    <>
      <PageHeader
        eyebrow="Task Manager"
        title="Manage Admin Console Access"
        description={<>Grant &ldquo;User&rdquo; tier so someone can view this Admin Console, or &ldquo;Admin&rdquo; tier so they can also
          grant/revoke it for others. This is separate from the main Task Manager board, which every staff member can already use.</>}
        backHref="/admin/task-manager/console"
        backLabel="Admin Console"
      />
      <div style={{ padding: '20px 32px 48px', maxWidth: '720px' }}>
        <AccessTab moduleKey="task-manager-admin" moduleLabel="Task Manager Admin Console" />
      </div>
    </>
  )
}
