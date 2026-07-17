/* Single source of truth for offices and departments — used across all pages and API routes */

export const OFFICES = [
  { id: 'dubai',     label: 'Dubai'     },
  { id: 'bangalore', label: 'Bangalore' },
  { id: 'mangalore', label: 'Mangalore' },
  { id: 'manipal',   label: 'Manipal'   },
] as const

export const OFFICE_MAP: Record<string, string> = Object.fromEntries(
  OFFICES.map(o => [o.id, o.label])
)

export const DEPARTMENTS = [
  'Events',
  'Sales & Sponsorship',
  'Marketing',
  'Finance',
  'Operations',
  'IT',
  'HR & Recruitment',
  'Content & Design',
  'Government Relations',
  'DemandifyMedia',
  'Leadership',
  'Other',
] as const

/* Pilot Projects — shared between the create wizard (app/admin/pilots/new/page.tsx),
   the admin management UI (app/admin/pilots/page.tsx), and the member-management API
   routes under app/api/admin/pilots/[id]/. Single source of truth so role presets and
   grantable tool keys stay in sync between create-time and edit-time flows. */

// NOTE: brightened vs. the original light-theme hexes (and matched to the
// equivalent brand token's literal value) so each role color stays readable
// once tinted via tint()/mRole and rendered as text on a dark card — see
// contrast pass, Jul 2026.
export const ROLE_PRESETS = [
  { key: 'pilot',       label: 'Pilot',       color: '#5AA9F2', note: 'You are the Pilot for this project — you own the scope decisions, drive the PRD, and coordinate the build with Durga.' },
  { key: 'co_pilot',    label: 'Co-Pilot',    color: '#F472B6', note: 'You are the Co-Pilot — you support the Pilot on every scope decision and share responsibility for driving the PRD with Durga.' },
  { key: 'consulting',  label: 'Consulting',  color: '#F5B94D', note: 'You are a Consulting member — your domain expertise will shape the requirements. The Pilot will bring you in for your specific inputs.' },
  { key: 'tracking',    label: 'Tracking',    color: '#34D399', note: 'You are the Project Tracker — your job is to maintain visibility across all Pilot Projects, escalate blockers to Durga, and keep things moving.' },
  { key: 'collaborator',label: 'Collaborator',color: '#12C9BD', note: 'You are a Collaborator on this project — you\'ll be looped in on relevant decisions and asked for input as it progresses.' },
  { key: 'builder',     label: 'Builder',     color: '#A78BFA', note: 'You are the Builder for this project — you code it, and Build Requests submitted for this project are routed to you.' },
] as const

export const TOOL_GRANT_OPTIONS = [
  { key: 'website_builder', label: 'Website Builder' },
  { key: 'brand_studio',    label: 'Brand Studio' },
  { key: 'content',         label: 'Content' },
  { key: 'intelligence',    label: 'Intelligence' },
  { key: 'smart_data',      label: 'Smart Data' },
  { key: 'hr_portal',       label: 'HR Portal' },
  { key: 'finance',         label: 'Finance' },
  { key: 'events',          label: 'Events' },
] as const

export const TOOL_GRANT_KEYS = TOOL_GRANT_OPTIONS.map(g => g.key)
