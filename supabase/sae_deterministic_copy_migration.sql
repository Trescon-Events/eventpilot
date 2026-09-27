-- SAE deterministic fixed lines, validate-and-retry, graceful X copy
-- (docs/build_suggestions/sae-deterministic-copy-spec.md, 2026-09-28)
--
-- Per Madhu's explicit instruction (2026-09-28): this build is gated
-- behind events.sae_copy_mode so no existing event's behaviour changes.
-- Every column here defaults to a value that preserves today's behaviour
-- exactly; only BSS is switched on, at the very end of this file.

-- sae_copy_mode: 'legacy' (default, every existing event) keeps the
-- original, untouched generatePostCopy() code path. 'assembled' opts an
-- event into Stages 1-3/5/6 of the spec.
ALTER TABLE events ADD COLUMN IF NOT EXISTS sae_copy_mode TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_sae_copy_mode_check;
ALTER TABLE events ADD CONSTRAINT events_sae_copy_mode_check CHECK (sae_copy_mode = ANY (ARRAY['legacy', 'assembled']));

-- Stage 1 — per-event announcement line settings, 'assembled' mode only.
-- announcement_cta_label defaults NULL: when unset, 'assembled' mode keeps
-- today's model-written CTA paragraph instead of a fixed line.
ALTER TABLE events ADD COLUMN IF NOT EXISTS announcement_line_emojis BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS announcement_cta_label TEXT;

-- Stage 5 — how many generation attempts (1 or 2) it took to reach the
-- stored copy. Always 1 for a 'legacy' event (no retry there); 1 or 2 for
-- 'assembled'.
ALTER TABLE stakeholder_announcements ADD COLUMN IF NOT EXISTS validation_attempts SMALLINT;

-- Stage 6 — Hon'ble (Indian ministers/officials), shipped globally (purely
-- additive — a speaker not set to this value is unaffected either mode).
-- Carried over from docs/build_suggestions/speaker-own-facts-and-indian-honorifics.md section 2.
ALTER TABLE event_speakers DROP CONSTRAINT IF EXISTS event_speakers_pronoun_style_check;
ALTER TABLE event_speakers ADD CONSTRAINT event_speakers_pronoun_style_check
  CHECK (pronoun_style = ANY (ARRAY['he_him', 'she_her', 'his_excellency', 'her_excellency', 'his_highness', 'her_highness', 'honble']));

-- BSS only (Madhu, 2026-09-28) — nothing else touched by this migration.
UPDATE events
SET sae_copy_mode = 'assembled', announcement_line_emojis = true, announcement_cta_label = 'Register here:'
WHERE id = '27edfe37-ab45-4656-922d-0503012c75a7';
