// The Cleaning Cycle's fixed standard canvas — square, one number for both
// dimensions. 1024 (2026-08-21, was 1000) to match GPT Image 2's own native
// output size, so an AI-fixed photo needs no extra rescale between
// generation and the final crop, and so branding team's own reference
// templates never mismatch it. Split into its own file (no server-only
// deps, unlike photo-cleaning-pipeline.ts which imports sharp) so client
// components (the AI Edit Prompts admin panel) can import it too without
// pulling sharp into the browser bundle.
export const CLEANING_CYCLE_CANVAS_SIZE = 1024
