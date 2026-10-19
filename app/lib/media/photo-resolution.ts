/* Is a speaker photo too small for the Cleaning Cycle? (2026-10-19)
   The old check only looked at the shorter side of the file (< 500px). A 1200px full-body shot passes that, yet its face can be 120px tall, so the
   cleaned photo came out soft above a sharp AI-generated torso. What matters is the FACE: the Cleaning Cycle scales the photo until the head is
   `target head height × canvas` tall, so the question is how much it must be enlarged. Pure, so the wizard and the server use the same rule. */

export const LOW_RES_MIN_SIDE_PX = 500
/** The head may be enlarged this much on the canvas before the result is called soft. */
export const LOW_RES_MAX_ENLARGEMENT = 1.3

export type HeadRatioBox = { heightRatio: number }

export function enlargementNeeded(photoHeightPx: number, headBox: HeadRatioBox | null | undefined, targetHeadHeightRatio: number, canvasPx: number): number | null {
  if (!headBox || !(headBox.heightRatio > 0) || !(photoHeightPx > 0)) return null
  const headPx = headBox.heightRatio * photoHeightPx
  return (targetHeadHeightRatio * canvasPx) / headPx
}

export function isLowResolution(widthPx: number, heightPx: number, headBox: HeadRatioBox | null | undefined, targetHeadHeightRatio: number, canvasPx: number): boolean {
  if (Math.min(widthPx, heightPx) < LOW_RES_MIN_SIDE_PX) return true
  const e = enlargementNeeded(heightPx, headBox, targetHeadHeightRatio, canvasPx)
  return e !== null && e > LOW_RES_MAX_ENLARGEMENT
}
