import type { HeadBox } from '@/app/lib/media/face-alignment'

// Producer adjustments to ONE badge. Text overrides replace the speaker's field for this badge only; the photo nudge
// moves the head target (dx/dy as a fraction of the badge width/height) and zoom scales the head size (1 = unchanged).
export type BadgeOverrides = {
  name?: string
  title?: string
  company?: string
  country?: string
  photo?: { dx?: number; dy?: number; zoom?: number }
}

export type BadgeFlag = { code: 'missing_field' | 'no_photo' | 'low_resolution' | 'text_overflow' | 'text_shrunk' | 'photo_overlaps_logo'; message: string }

export type BadgeItemRow = {
  id: string
  batch_id: string
  speaker_id: string | null
  position: number
  name: string | null
  title: string | null
  company: string | null
  country: string | null
  photo_url: string | null
  photo_head_box: HeadBox | null
  overrides: BadgeOverrides
  flags: BadgeFlag[]
  approved: boolean
  removed: boolean
  preview_url: string | null
  preview_stale: boolean
}

export const CONFIRMED_STATUSES = ['New Confirmed', 'Reconfirmed', 'Confirmed'] as const
