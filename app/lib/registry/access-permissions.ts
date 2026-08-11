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
      // Extension points for later phases (email templates / invite workflow)
      // — keys exist now so a Producer role can be pre-provisioned with
      // them; no route enforces them yet.
      { key: 'sae.invites.send',           label: 'Send speaker/stakeholder invite emails',          enforced: true },
      { key: 'sae.forms.manage',           label: 'Customize onboarding form fields',                enforced: true },
      { key: 'sae.secure_documents.manage', label: 'Configure the secure passport/ID destination folder', enforced: true },
      { key: 'sae.messaging.use',          label: 'Use the Messaging module for this event',         enforced: false },
    ],
  },
  {
    key: 'website-builder', label: 'Website Builder',
    items: [
      { key: 'website-builder.view',    label: 'View the site builder',        enforced: false },
      { key: 'website-builder.edit',    label: 'Edit sections & content',      enforced: false },
      { key: 'website-builder.publish', label: 'Publish live / manage domain', enforced: false },
    ],
  },
  {
    key: 'brand-studio', label: 'Brand Studio',
    items: [
      { key: 'brand-studio.view', label: 'View brand assets',                  enforced: false },
      { key: 'brand-studio.edit', label: 'Upload brand doc / generate assets', enforced: false },
    ],
  },
  {
    key: 'market-intel', label: 'Market Intelligence',
    items: [
      { key: 'market-intel.view', label: 'View market intelligence reports', enforced: false },
      { key: 'market-intel.edit', label: 'Generate / edit reports',          enforced: false },
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
]

export function isKnownPermissionKey(key: string): boolean {
  return ACCESS_REGISTRY.some(m => m.items.some(i => i.key === key))
}
