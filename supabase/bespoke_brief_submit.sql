-- Nic build_request d17e10d8 · 2026-08-03
-- Brief tab overhaul: simplify Event Objectives + Submit Brief workflow
--
-- 1. Drop success_criteria + desired_outcome (both were NULL in production
--    data; Nic's spec explicitly removes them from the brief model).
-- 2. Add brief_is_submitted BOOLEAN — replaces the "lock" terminology
--    with an explicit submit/edit lifecycle. When TRUE, downstream
--    Phase 2/3/4 tasks unlock AND the Brief tab renders as a read-only
--    Summary. When FALSE (or after "Edit Brief"), Phase 2/3/4 tasks
--    re-lock and the input fields return.
-- 3. Backfill: any project where brief_is_locked = true is treated as
--    already submitted so the transition is seamless.
--
-- The legacy brief_is_locked column stays for backward compatibility with
-- any consumer we may not have found. New writes set BOTH fields together
-- so they never diverge.

ALTER TABLE bespoke_projects DROP COLUMN IF EXISTS success_criteria;
ALTER TABLE bespoke_projects DROP COLUMN IF EXISTS desired_outcome;

ALTER TABLE bespoke_projects
  ADD COLUMN IF NOT EXISTS brief_is_submitted BOOLEAN DEFAULT FALSE;

UPDATE bespoke_projects
SET    brief_is_submitted = TRUE
WHERE  brief_is_locked = TRUE
  AND  brief_is_submitted = FALSE;
