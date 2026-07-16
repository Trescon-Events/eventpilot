/*
  Knowledge Assistant access gate.

  Middleware lets any authenticated user reach /admin/toolkit/* (treated as a
  "tool route", same pattern as /admin/bespoke). This layout enforces the
  actual access rule server-side via the module registry:

    - Super admins (session.adm === true) → allowed
    - Staff with staff_members.tool_grants.knowledge_assistant === true → allowed
    - Everyone else → redirected to /no-access before any page HTML renders

  Knowledge Assistant was previously gated by Pilot Project membership
  ('Knowledge Base Module' / 'DocuHub Module') via app/api/kb/bd-chat/route.ts's
  resolveAccess() — a one-off mechanism unrelated to how every other tool in
  the app is granted. Moved to its own separate tool_grant on 15 Jul 2026 per
  Madhu's request — see app/lib/registry/modules.tsx's 'knowledge-assistant'
  entry, and resolveAccess() itself (now reads hasToolGrant() instead of
  pilot_project_members). This layout is a second, redundant guard on the
  page route; the real enforcement for the chat API is inside bd-chat/route.ts.
*/

import { requireModuleAccess } from '@/app/lib/registry/access'

export default async function KnowledgeAssistantLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess('knowledge-assistant')
  return <>{children}</>
}
