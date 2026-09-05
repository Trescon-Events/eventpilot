// Single source of truth for "what per-event, gate-able items exist" —
// read by the Access UI (app/admin/events/[id]/access/RolesTab.tsx) to
// render module/item checkboxes when authoring a role, and used to
// validate access_role_permissions.permission_key at write time. A plain
// TypeScript constant, not a DB table — permission_key isn't FK'd, deliberately,
// same "single source of truth in code" pattern already used by ./modules.tsx
// for module keys. Must stay importable from client components (no
// supabaseAdmin/server-only imports here), same constraint as modules.tsx.
//
// Module keys reuse the exact strings modules.tsx already uses as
// moduleAccessKey ('sae', 'website-builder', 'market-intel', 'brand-studio',
// 'commercial') rather than inventing a parallel naming scheme.

export type AccessItem = {
  key: string          // dot-namespaced: '<module>.<area>.<action>'
  label: string
  description?: string
  // Whether a real enforcement check exists for this key yet. Unenforced
  // items still render in the Roles editor (so a role's full intended shape
  // can be defined today) but are inert — the UI shows a "not yet enforced"
  // hint rather than implying a guarantee nothing backs yet.
  enforced: boolean
}
export type AccessModule = { key: string; label: string; items: AccessItem[] }

export const ACCESS_REGISTRY: AccessModule[] = [
  {
    key: 'sae', label: 'Stakeholder Hub / Announcement Engine',
    items: [
      { key: 'sae.stakeholders.view',      label: 'View speakers, sponsors & partners',              enforced: true },
      { key: 'sae.stakeholders.edit',      label: 'Add / edit speaker & partner records',            enforced: true },
      { key: 'sae.stakeholders.delete',    label: 'Delete / archive records',                        enforced: true },
      { key: 'sae.submissions.view',       label: 'View the Submissions Inbox',                      enforced: true },
      { key: 'sae.submissions.process',    label: 'Process a submission into a stakeholder record',  enforced: true },
      { key: 'sae.submissions.reject',     label: 'Reject a submission',                             enforced: true },
      { key: 'sae.approvals.approve',      label: 'Approve a record for announcement',               enforced: true },
      { key: 'sae.announcements.generate', label: 'Generate announcement creatives',                 enforced: false },
      // Deliberately distinct from sae.approvals.approve above — that one
      // gates approving a STAKEHOLDER RECORD's data as ready for SAE to
      // generate from; these two gate approving/publishing the generated
      // ANNOUNCEMENT (creative + post copy) itself, a later, separate step
      // in the pipeline (2026-08-16, publishing/scheduling UI build-out).
      { key: 'sae.announcements.approve',  label: 'Approve an announcement for scheduling/publishing', enforced: true },
      { key: 'sae.announcements.publish',  label: 'Schedule or post announcements directly, without requiring approval', enforced: true },
      // Extension points for later phases (email templates / invite workflow)
      // — keys exist now so a Producer role can be pre-provisioned with
      // them; no route enforces them yet.
      { key: 'sae.invites.send',           label: 'Send speaker/stakeholder invite emails',          enforced: true },
      { key: 'sae.forms.manage',           label: 'Customize onboarding form fields',                enforced: true },
      { key: 'sae.secure_documents.manage', label: 'Configure the secure passport/ID destination folder', enforced: true },
      // Sensitive Documents (2026-09-04) — Passport/National ID, stored
      // natively (see app/lib/events/sensitive-storage.ts), the replacement
      // for the "producer's own Drive" model sae.secure_documents.manage
      // above configured. Deliberately kept to individual staff assignment
      // only, per Madhu — this is not meant to be granted department/team-
      // wide the way some other roles are; whoever assigns it picks named
      // people one at a time via this same Assignments tab (it has no
      // bulk/department-grant option to begin with, so this is enforced by
      // the tool's own shape, not a special-cased rule here).
      { key: 'sae.sensitive_documents.view',   label: 'View Passport / National ID documents',                       enforced: true },
      { key: 'sae.sensitive_documents.manage', label: 'Upload, replace or delete Passport / National ID documents',  enforced: true },
      { key: 'sae.messaging.use',          label: 'Use the Messaging module for this event',         enforced: false },
      // Integrations (2026-09-05) — the new consolidated per-event page for
      // KonfHub/HubSpot/Postiz/Client Approval Contact config, replacing
      // the scattered inline-edit panels and the Website Builder's own
      // "KonfHub Integration" card. Delegatable the same way Producer and
      // Sensitive Documents are — admins today, a named person tomorrow.
      { key: 'sae.integrations.manage',    label: 'Manage KonfHub/HubSpot/Postiz integration settings for this event', enforced: true },
      // Unifies the Creative Templates Admin Console (layer/variant editor,
      // deliberately narrow — branding team) into this same per-event
      // permission-key system (2026-08-16) — previously gated separately
      // through the older, global 2-tier module_access table's 'admin'
      // tier (app/lib/access/module-access.ts). See
      // app/admin/events/[id]/creative-templates/admin/layout.tsx.
      { key: 'sae.admin.access',           label: 'Open the Creative Templates Admin Console (layer/variant editing)', enforced: true },
    ],
  },
  {
    key: 'website-builder', label: 'Website Builder',
    items: [
      // 2026-08-16 (Phase 3): flipped enforced true — layout now checks
      // hasEventPermission instead of the global tool_grants.website_builder
      // flag. See app/admin/events/[id]/website/layout.tsx.
      { key: 'website-builder.view',    label: 'View the site builder',        enforced: true },
      { key: 'website-builder.edit',    label: 'Edit sections & content',      enforced: true },
      { key: 'website-builder.publish', label: 'Publish live / manage domain', enforced: true },
    ],
  },
  {
    key: 'brand-studio', label: 'Brand Studio',
    items: [
      // 2026-08-16 (Phase 3): see app/admin/events/[id]/brand/layout.tsx.
      { key: 'brand-studio.view', label: 'View brand assets',                  enforced: true },
      { key: 'brand-studio.edit', label: 'Upload brand doc / generate assets', enforced: true },
    ],
  },
  {
    key: 'market-intel', label: 'Market Intelligence',
    items: [
      // 2026-08-16 (Phase 3): see app/admin/events/[id]/market-intel/layout.tsx.
      { key: 'market-intel.view', label: 'View market intelligence reports', enforced: true },
      { key: 'market-intel.edit', label: 'Generate / edit reports',          enforced: true },
    ],
  },
  {
    key: 'commercial', label: 'Commercial P&L',
    items: [
      { key: 'commercial.view',    label: 'View budget, deals & expenses', enforced: false },
      { key: 'commercial.edit',    label: 'Add / edit deals & expenses',   enforced: false },
      { key: 'commercial.approve', label: 'Approve budget allocations',    enforced: false },
    ],
  },
  {
    key: 'overview', label: 'Event Overview & Team',
    items: [
      { key: 'overview.view', label: 'View event overview & checklist', enforced: false },
      { key: 'overview.edit', label: 'Edit event details & team roster', enforced: false },
    ],
  },
  // Platform-wide items — genuinely not event-scoped (no event context at
  // all), unlike every module above. Checked via hasPlatformPermission()
  // (app/lib/access/event-access.ts), not hasEventPermission() — it looks
  // across ALL of a staffer's role assignments regardless of event_id
  // (event-scoped or global), since a platform tool like this doesn't
  // vary by which event happened to trigger the grant. This lets the
  // same HRMS role_type → access-role auto-mapping (Phase 2) reach a
  // genuinely platform-wide permission even though every auto-grant it
  // writes is tied to a real event_id (whichever event the person is
  // allocated to in Staff Portal) — see app/admin/branding/fonts/
  // layout.tsx, 2026-08-16.
  {
    key: 'platform', label: 'Platform Administration',
    items: [
      { key: 'platform.branding.manage', label: 'Manage brand fonts (Font Library)', enforced: true },
    ],
  },
]

// Also accepts wildcard keys ('<module>.*', or a future deeper
// '<module>.<area>.*' once a module grows that structure) — see
// app/lib/access/permission-match.ts for how these are matched at
// permission-check time. A wildcard validates if its prefix names a real
// module, or is an ancestor of at least one real item key.
export function isKnownPermissionKey(key: string): boolean {
  if (key.endsWith('.*')) {
    const prefix = key.slice(0, -2)
    return ACCESS_REGISTRY.some(m => m.key === prefix || m.items.some(i => i.key.startsWith(`${prefix}.`)))
  }
  return ACCESS_REGISTRY.some(m => m.items.some(i => i.key === key))
}
