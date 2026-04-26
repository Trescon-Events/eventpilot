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
