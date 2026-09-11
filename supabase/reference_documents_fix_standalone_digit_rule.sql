-- Reference Documents spec follow-up (2026-09-11) — difc-standalone-digit
-- was firing on every correctly formatted date range (e.g. the "2" and "3"
-- in "2 - 3 November 2026"), training people to ignore the warning. Adds a
-- negative lookahead so the rule no longer flags a standalone digit that is
-- immediately followed by a full month name, either directly ("5 September")
-- or across a "- <digit>" range ("2 - 3 November"). Every other standalone-
-- digit case (counts, ages, anything not adjacent to a month name) is
-- unaffected — verified against representative cases before writing this.
--
-- This rule is attached at umbrella level (umbrella_id = Dubai Future
-- Finance Week, d4c7c680-2618-4159-bfa6-5bcd0701ca22), not event_id — the
-- umbrella/event separation migration (2026-09-11) moved it there.

UPDATE event_validation_rules
SET pattern = '\b[0-9]\b(?!\s*(?:[-–—,]\s*[0-9]{1,2}\s*)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\b)'
WHERE umbrella_id = 'd4c7c680-2618-4159-bfa6-5bcd0701ca22' AND rule_key = 'difc-standalone-digit';
