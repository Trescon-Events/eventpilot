import sharp from 'sharp'
import { supabaseAdmin } from '@/app/lib/supabase'
import { CLEANING_CYCLE_CANVAS_SIZE } from './photo-cleaning-pipeline'
import { isLowResolution, type HeadRatioBox } from './photo-resolution'

/** Low-resolution verdict for a freshly stored photo, using the global Cleaning Cycle template's head target (0.3 if none is set yet). */
export async function computeLowResolution(image: Buffer, headBox: HeadRatioBox | null | undefined): Promise<boolean> {
  const m = await sharp(image).rotate().metadata()
  const rotated = (m.orientation ?? 1) >= 5 // EXIF 5-8 swap width and height
  const w = (rotated ? m.height : m.width) ?? 0, h = (rotated ? m.width : m.height) ?? 0
  const { data } = await supabaseAdmin.from('cleaning_cycle_template_global').select('target_head_height').eq('id', 1).maybeSingle()
  return isLowResolution(w, h, headBox, Number(data?.target_head_height) || 0.3, CLEANING_CYCLE_CANVAS_SIZE)
}
