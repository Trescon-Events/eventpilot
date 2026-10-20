import { pronounLabel } from '@/app/lib/events/pronoun-styles'

// Fields a producer can pick for the Speaker Details Excel (2026-10-20). Grouped for the picker; everything is on by default.
// `get` returns plain text; a URL value becomes an "Open link" cell in the sheet.
export type SpeakerExportRecord = {
  full_name: string; public_name: string | null; pronoun_style: string | null; job_title: string; company_name: string
  country: string | null; bio: string | null; linkedin_url: string | null
  email?: string | null; phone?: string | null; dial_code?: string | null; salutation?: string | null
  custom_fields: Record<string, unknown> | null
  announcement_status: string; website_status: string; social_post_status: string; self_promo_status: string
  confirmation_status?: string | null; reference?: string | null; notes: string | null; source: string; created_at: string
  konfhub_speaker_id: string | null; konfhub_booking_id: string | null; konfhub_category_id?: string | null
  photo_url: string | null; photo_processed_url: string | null; website_card_url: string | null; company_logo_url: string | null; photo_original_url?: string | null
}

export type SpeakerExportField = { key: string; label: string; group: string; width: number; get: (s: SpeakerExportRecord, ctx: { categoryLabel: (id: string | null | undefined) => string }) => string }

const yesNo = (v: unknown) => (v ? 'Yes' : 'No')
const date = (v: string) => (v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '')
const STATE: Record<string, string> = { pending: 'Pending', created: 'In Progress', awaiting_approval: 'Pending Approval', approved: 'Approved', scheduled: 'Scheduled', published: 'Published', sent: 'Sent' }
const ANNOUNCEMENT: Record<string, string> = { pending_review: 'Pending Review', approved: 'Approved', assets_missing: 'Assets Missing', ready: 'Ready', archived: 'Archived' }
const state = (v: string) => STATE[v] ?? v

export const SPEAKER_EXPORT_FIELDS: SpeakerExportField[] = [
  { key: 'full_name', label: 'Full Name', group: 'Identity', width: 26, get: s => s.full_name },
  { key: 'public_name', label: 'Public Name', group: 'Identity', width: 26, get: s => s.public_name ?? '' },
  { key: 'salutation', label: 'Salutation', group: 'Identity', width: 12, get: s => s.salutation ?? String(s.custom_fields?.salutation ?? '') },
  { key: 'pronoun', label: 'Pronoun / Honorific', group: 'Identity', width: 18, get: s => pronounLabel(s.pronoun_style) ?? '' },
  { key: 'job_title', label: 'Job Title', group: 'Identity', width: 32, get: s => s.job_title },
  { key: 'company', label: 'Company', group: 'Identity', width: 28, get: s => s.company_name },
  { key: 'country', label: 'Country', group: 'Identity', width: 18, get: s => s.country ?? '' },

  { key: 'email', label: 'Email', group: 'Contact', width: 30, get: s => s.email ?? String(s.custom_fields?.email ?? '') },
  { key: 'phone', label: 'Phone', group: 'Contact', width: 20, get: s => [s.dial_code, s.phone].filter(Boolean).join(' ') },
  { key: 'linkedin', label: 'LinkedIn', group: 'Contact', width: 14, get: s => s.linkedin_url ?? '' },

  { key: 'bio', label: 'Bio', group: 'Profile', width: 70, get: s => s.bio ?? '' },

  { key: 'confirmation', label: 'Confirmation Status', group: 'Producer', width: 20, get: s => s.confirmation_status ?? '' },
  { key: 'reference', label: 'Ref', group: 'Producer', width: 18, get: s => s.reference ?? '' },
  { key: 'notes', label: 'Notes', group: 'Producer', width: 40, get: s => s.notes ?? '' },

  { key: 'announcement', label: 'Announcement Status', group: 'Status', width: 20, get: s => ANNOUNCEMENT[s.announcement_status] ?? s.announcement_status },

  { key: 'konfhub_published', label: 'Published to KonfHub', group: 'KonfHub', width: 18, get: s => yesNo(s.konfhub_speaker_id) },
  { key: 'konfhub_registered', label: 'Registered on KonfHub', group: 'KonfHub', width: 18, get: s => yesNo(s.konfhub_booking_id) },
  { key: 'konfhub_category', label: 'KonfHub Category', group: 'KonfHub', width: 20, get: (s, c) => c.categoryLabel(s.konfhub_category_id) },

  { key: 'photo_original', label: 'Original Photo', group: 'Assets (links)', width: 14, get: s => s.photo_original_url ?? '' },
  { key: 'photo_raw', label: 'Raw Photo', group: 'Assets (links)', width: 14, get: s => s.photo_url ?? '' },
  { key: 'photo_clean', label: 'Cleaned Photo', group: 'Assets (links)', width: 14, get: s => s.photo_processed_url ?? '' },
  { key: 'photo_web', label: 'Website Photo', group: 'Assets (links)', width: 14, get: s => s.website_card_url ?? '' },
  { key: 'logo', label: 'Company Logo', group: 'Assets (links)', width: 14, get: s => s.company_logo_url ?? '' },

  { key: 'source', label: 'Source', group: 'Record', width: 16, get: s => (s.source === 'onboarding_form' ? 'Onboarding form' : 'Added manually') },
  { key: 'created', label: 'Added On', group: 'Record', width: 14, get: s => date(s.created_at) },
]

export const SPEAKER_EXPORT_GROUPS = [...new Set(SPEAKER_EXPORT_FIELDS.map(f => f.group))]

// Status cells get a colour in the sheet (same red/amber/green/teal meaning as the status board).
export function speakerStatusTone(_header: string, value: string): 'green' | 'amber' | 'red' | 'teal' | undefined {
  if (['Published', 'Sent', 'Ready'].includes(value)) return 'green'
  if (['Approved', 'Scheduled'].includes(value)) return 'teal'
  if (['In Progress', 'Pending Approval', 'Pending Review', 'Assets Missing'].includes(value)) return 'amber'
  if (value === 'Pending') return 'red'
  return undefined
}
