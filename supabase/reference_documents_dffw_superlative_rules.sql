-- DFFW rule set addition (2026-09-30). Attached at UMBRELLA level so all
-- five DFFW children inherit via resolve-validation-rules.ts's depth-2 walk.
--
-- NOTE ON OWNERSHIP COLUMN: umbrella-owned rules use umbrella_id with
-- event_id NULL (umbrella_events_separation_migration.sql, 2026-09-11).
-- The Stage 3 seed file writes event_id because it predates that migration;
-- do not copy its shape. d4c7c680-... now lives in event_umbrellas and was
-- deleted from events, so an event_id insert fails the FK.
--
-- DELETE-then-INSERT rather than ON CONFLICT: uniqueness is enforced by the
-- partial index event_validation_rules_umbrella_rule_key
-- ON (umbrella_id, rule_key) WHERE umbrella_id IS NOT NULL, and an
-- ON CONFLICT inference against a partial index has to restate its
-- predicate. Delete-then-insert is idempotent without that.
--
-- Origin: the first run of engine-drafted FSF speaker announcements passed
-- the whole existing rule set clean while carrying "unparalleled insights"
-- and "unwavering transparency" — claims about a speaker that Trescon
-- cannot evidence, and the first thing a client reviewer removes.
--
-- SEVERITY IS DELIBERATELY 'warning', NOT 'error'. A regex cannot tell a
-- supported superlative from an unsupported one, and each of these words
-- has a legitimate use ("Premier League", a "definitive agreement"). These
-- flag for a human to judge. Promoting them to error would train producers
-- to dismiss findings, which is worse than not having the rule.

DELETE FROM event_validation_rules
WHERE umbrella_id = 'd4c7c680-2618-4159-bfa6-5bcd0701ca22'
  AND rule_key LIKE 'difc-superlative-%';

INSERT INTO event_validation_rules (umbrella_id, rule_key, rule_type, pattern, severity, message, source_clause) VALUES
('d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'difc-superlative-unparalleled', 'forbidden_term', 'unparalleled', 'warning', 'Unsupported superlative. Remove it, or replace it with the specific fact that justifies it.', 'Style guide §6'),
('d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'difc-superlative-unrivalled',   'forbidden_term', 'unrivalled',   'warning', 'Unsupported superlative. Remove it, or replace it with the specific fact that justifies it.', 'Style guide §6'),
('d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'difc-superlative-unmatched',    'forbidden_term', 'unmatched',    'warning', 'Unsupported superlative. Remove it, or replace it with the specific fact that justifies it.', 'Style guide §6'),
('d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'difc-superlative-unwavering',   'forbidden_term', 'unwavering',   'warning', 'Unsupported intensifier. Say what was actually done instead.', 'Style guide §6'),
('d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'difc-superlative-premier',      'forbidden_term', 'premier',      'warning', 'Ranking claim. Permitted only inside a proper name.', 'Style guide §6'),
('d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'difc-superlative-definitive',   'forbidden_term', 'definitive',   'warning', 'Ranking claim. Permitted only in a legal sense, e.g. a definitive agreement.', 'Style guide §6');

-- Check: expect 6 rows, all with event_id NULL.
SELECT rule_key, severity, event_id, umbrella_id
FROM event_validation_rules
WHERE umbrella_id = 'd4c7c680-2618-4159-bfa6-5bcd0701ca22'
  AND rule_key LIKE 'difc-superlative-%'
ORDER BY rule_key;
