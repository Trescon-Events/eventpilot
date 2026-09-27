/*
  Single source of truth for "what per-event feature toggles exist in
  EventPilot" (2026-09-27). Sibling to ./modules.tsx, not merged into it —
  modules.tsx is about navigation/access (who can reach a module that
  always exists); this is about whether a module/section/field even
  applies to a given EVENT at all. Keys are reused verbatim where a
  feature already has a modules.tsx key ('market-intel', 'website-builder',
  'press-releases', 'operations') so the two registries read as siblings,
  not parallel vocabularies.

  Backed by events.enabled_features (jsonb) — see
  supabase/event_feature_flags_migration.sql. Resolved via
  isEventFeatureEnabled()/getEventFeatures() in
  app/lib/access/event-access.ts, edited on the Event Details page's
  "Feature Toggles" card.

  Deliberately NO key here for "Client Approval Contacts" — that
  Integrations section is downstream of the existing
  events.requires_client_approval toggle (see
  app/lib/events/client-approval-gate.ts), not a new independent flag.
  Gate that section on resolveRequiresClientApproval() directly.

  Deliberately NO keys yet for Brand Studio or the creative-templates/SAE
  admin routes — not named in the original catalog this registry was built
  from, and already gated by the existing SAE permission system. Add here
  only after an explicit product decision to bring them into this system.
*/

export type FeatureKey =
  | 'uae-resident-field'
  | 'sensitive-documents'
  | 'integration-konfhub'
  | 'integration-agenda-structure'
  | 'integration-hubspot-forms'
  | 'integration-postiz'
  | 'integration-content-guidelines-api'
  | 'site-ops'
  | 'website-builder'
  | 'press-releases'
  | 'market-intel'
  | 'agenda-builder'
  | 'operations'

export type FeatureGroup = 'compliance' | 'integrations' | 'modules'

export type FeatureDef = {
  key: FeatureKey
  label: string
  description: string
  group: FeatureGroup
  /** Only consulted for events created after this system shipped — every
   *  pre-existing event was explicitly backfilled to `true` for every key
   *  by the migration, so this never silently changes an existing event's
   *  behavior. */
  defaultForNewEvent: (event: { country: string | null }) => boolean
}

export const FEATURE_REGISTRY: FeatureDef[] = [
  {
    key: 'uae-resident-field',
    label: 'UAE Resident Question',
    description: 'Asks speakers whether they’re a UAE resident (drives the National ID requirement) on the public submission form, Status Board, and missing-items checks.',
    group: 'compliance',
    defaultForNewEvent: event => event.country === 'UAE',
  },
  {
    key: 'sensitive-documents',
    label: 'Sensitive Documents',
    description: 'Passport / National ID upload tab on a stakeholder record, with private storage, retention, and consent tracking.',
    group: 'compliance',
    defaultForNewEvent: () => true,
  },
  {
    key: 'integration-konfhub',
    label: 'KonfHub',
    description: 'Push confirmed speakers/agenda to a connected KonfHub event page.',
    group: 'integrations',
    defaultForNewEvent: () => false,
  },
  {
    key: 'integration-agenda-structure',
    label: 'Agenda Structure Sync',
    description: 'Pull KonfHub-authoritative track/session structure into Agenda Builder.',
    group: 'integrations',
    defaultForNewEvent: () => false,
  },
  {
    key: 'integration-hubspot-forms',
    label: 'HubSpot Forms',
    description: 'Connect a HubSpot form for speaker/sponsor/media-partner/association-partner onboarding.',
    group: 'integrations',
    defaultForNewEvent: () => true,
  },
  {
    key: 'integration-postiz',
    label: 'Postiz (Social Publishing)',
    description: 'Schedule and publish stakeholder announcements to social channels via Postiz.',
    group: 'integrations',
    defaultForNewEvent: () => false,
  },
  {
    key: 'integration-content-guidelines-api',
    label: 'Content Guidelines API',
    description: 'Public bearer-token endpoint exposing this event’s content rules to external tools (Antigravity, AI InfraNext, etc.).',
    group: 'integrations',
    defaultForNewEvent: () => false,
  },
  {
    key: 'site-ops',
    label: 'Site Operations (GA4, Search Console, Health Checks)',
    description: 'Analytics connections and automated health checks for the event’s public website.',
    group: 'integrations',
    defaultForNewEvent: () => false,
  },
  {
    key: 'website-builder',
    label: 'Website Builder',
    description: 'Build/edit this event’s public marketing site.',
    group: 'modules',
    defaultForNewEvent: () => true,
  },
  {
    key: 'press-releases',
    label: 'Press Release Studio',
    description: 'Research, draft, and approve press releases grounded in this event’s style guide.',
    group: 'modules',
    defaultForNewEvent: () => false,
  },
  {
    key: 'market-intel',
    label: 'Market Intelligence',
    description: 'Competitor/company/speaker research jobs scoped to this event.',
    group: 'modules',
    defaultForNewEvent: () => true,
  },
  {
    key: 'agenda-builder',
    label: 'Agenda Builder',
    description: 'Structured tracks/sessions editor for this event’s agenda.',
    group: 'modules',
    defaultForNewEvent: () => true,
  },
  {
    key: 'operations',
    label: 'Operations (licences, vendors, badges)',
    description: 'Speaker licence batches and the shared vendor directory for this event.',
    group: 'modules',
    defaultForNewEvent: () => true,
  },
]

export function getFeatureDef(key: FeatureKey): FeatureDef | undefined {
  return FEATURE_REGISTRY.find(f => f.key === key)
}
