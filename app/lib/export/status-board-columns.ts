import type { StatusTone, XlsxColumn } from './formatted-xlsx'
import { MEMENTO_STATE_SHORT, MEMENTO_STATE_TONE, type MementoState } from '@/app/lib/mementos/state-labels'

// The Status Board's columns as Excel columns (2026-10-20) — shared by the Status Board's own download and by the roster's
// "Speaker Details (Excel)" picker, so both say exactly the same thing about a speaker's onboarding progress.
type DocStatus = 'missing' | 'in_progress' | 'reviewed'
export type StatusBoardExportRow = {
  id: string; name: string; job_title: string | null; company_name: string | null
  producer_name: string | null; reference: string | null; confirmation_status: string | null
  email: boolean; assistant_email: boolean; full_bio: boolean; photo: boolean
  passport_status: DocStatus; national_id_status: DocStatus; is_uae_resident: boolean | null; national_id_applicable: boolean
  short_bio_status: 'missing' | 'in_progress' | 'approved'; website_photo: boolean
  website_status: string; social_post_status: string; self_promo_status: string; guest_invite_status: string
  memento_status?: MementoState | null
}
export type StatusColumn = XlsxColumn & { key: string; get: (r: StatusBoardExportRow) => string }

const LABEL: Record<string, string> = {
  pending: 'Pending', created: 'In Progress', awaiting_approval: 'Pending Approval', approved: 'Approved', scheduled: 'Scheduled', published: 'Published',
  sent: 'Sent', guest_missing: 'No Link', guest_ready: 'Link Ready',
}
const doc = (v: DocStatus) => (v === 'reviewed' ? 'Reviewed' : v === 'in_progress' ? 'In Progress' : 'Pending')
const done = (v: boolean) => (v ? 'Done' : 'Pending')

// Collection / Production / Publish, in the board's left-to-right order. Identity (speaker, title, company) is separate.
export function statusColumns(flags: { uaeField: boolean; sensitiveDocs: boolean; mementos?: boolean }): StatusColumn[] {
  return [
    { key: 'sb_producer', header: 'Producer', width: 20, group: 'Onboarding Status', get: r => r.producer_name ?? '' },
    { key: 'sb_email', header: 'Email Received', width: 14, group: 'Collection', get: r => done(r.email) },
    { key: 'sb_assistant', header: 'Assistant Email', width: 14, group: 'Collection', get: r => done(r.assistant_email) },
    { key: 'sb_full_bio', header: 'Full Bio', width: 12, group: 'Collection', get: r => done(r.full_bio) },
    { key: 'sb_photo', header: 'Photo', width: 12, group: 'Collection', get: r => done(r.photo) },
    ...(flags.uaeField ? [{ key: 'sb_uae', header: 'UAE Resident', width: 13, group: 'Collection', get: (r: StatusBoardExportRow) => (r.is_uae_resident === true ? 'Yes' : r.is_uae_resident === false ? 'No' : 'Unknown') }] : []),
    ...(flags.sensitiveDocs ? [
      { key: 'sb_passport', header: 'Passport', width: 13, group: 'Collection', get: (r: StatusBoardExportRow) => doc(r.passport_status) },
      { key: 'sb_national_id', header: 'National ID', width: 15, group: 'Collection', get: (r: StatusBoardExportRow) => (!r.national_id_applicable ? 'Not Applicable' : doc(r.national_id_status)) },
    ] : []),
    { key: 'sb_short_bio', header: 'Short Bio', width: 13, group: 'Production', get: r => (r.short_bio_status === 'approved' ? 'Approved' : r.short_bio_status === 'in_progress' ? 'In Progress' : 'Pending') },
    { key: 'sb_website_photo', header: 'Website Photo', width: 14, group: 'Production', get: r => (r.website_photo ? 'Cleaned' : r.photo ? 'In Progress' : 'Pending') },
    { key: 'sb_website', header: 'Website', width: 16, group: 'Publish', get: r => LABEL[r.website_status] ?? r.website_status },
    { key: 'sb_social', header: 'Social Post', width: 16, group: 'Publish', get: r => LABEL[r.social_post_status] ?? r.social_post_status },
    { key: 'sb_promo', header: 'Self Promo', width: 14, group: 'Publish', get: r => LABEL[r.self_promo_status] ?? r.self_promo_status },
    { key: 'sb_guest', header: 'Guest Link', width: 14, group: 'Publish', get: r => LABEL[r.guest_invite_status] ?? r.guest_invite_status },
    ...(flags.mementos ? [{ key: 'sb_memento', header: 'Memento Photo', width: 16, group: 'Publish', get: (r: StatusBoardExportRow) => MEMENTO_STATE_SHORT[r.memento_status ?? 'not_shared'] }] : []),
  ]
}

const TONES: Record<string, StatusTone> = {
  Done: 'green', ...Object.fromEntries((Object.keys(MEMENTO_STATE_SHORT) as MementoState[]).map(k => [MEMENTO_STATE_SHORT[k], MEMENTO_STATE_TONE[k]])), Reviewed: 'green', Approved: 'teal', Scheduled: 'teal', Published: 'green', Sent: 'green', Cleaned: 'green', Yes: 'green',
  'In Progress': 'amber', 'Pending Approval': 'amber', 'Link Ready': 'amber', Pending: 'red', 'No Link': 'red', No: 'red', Unknown: 'grey', 'Not Applicable': 'grey',
}
export const statusTone = (value: string): StatusTone | undefined => TONES[value]
