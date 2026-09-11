-- Reference Documents spec, Stage 3 — DFFW seed rule set (2026-09-10).
-- Attached at umbrella level (event_id = Dubai Future Finance Week,
-- d4c7c680-2618-4159-bfa6-5bcd0701ca22) so all five DFFW children inherit
-- via resolve-validation-rules.ts's depth-2 walk. Derived from the DIFC
-- tone and style guide + DFS approved reference per the spec's own table.
--
-- HONEST GAP, not glossed over: the two required_format rules below
-- (theme-string, protocol-string) need exact canonical text this build
-- does not have — no real DFFW documents have been uploaded to EventPilot
-- yet (verified before Stage 1). theme-string is seeded with ONLY the
-- one-line form the spec itself gives verbatim ("Connecting Markets,
-- Transforming Economies.") — the "two-line form" it also mentions is
-- deliberately NOT guessed at, since a wrong guess would silently let bad
-- usage through (an under-specified allowed list is strict/safe; an
-- over-specified wrong one is not). protocol-string is seeded ACTIVE with
-- an empty allowed list, so it flags every "Sheikh Maktoum" mention for
-- manual verification rather than fabricating an official title — update
-- both once the real style guide is uploaded and can be checked directly.

INSERT INTO event_validation_rules (event_id, rule_key, rule_type, pattern, severity, message, source_clause) VALUES
-- Banned words (§9)
('d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'difc-banned-word-unlock',         'forbidden_term', 'unlock',         'error', 'Banned word per the DIFC style guide.', 'Style guide §9'),
('d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'difc-banned-word-seamless',       'forbidden_term', 'seamless',       'error', 'Banned word per the DIFC style guide.', 'Style guide §9'),
('d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'difc-banned-word-world-class',    'forbidden_term', 'world-class',    'error', 'Banned word per the DIFC style guide.', 'Style guide §9'),
('d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'difc-banned-word-and-beyond',     'forbidden_term', 'and beyond',     'error', 'Banned phrase per the DIFC style guide.', 'Style guide §9'),
('d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'difc-banned-word-game-changing',  'forbidden_term', 'game-changing',  'error', 'Banned word per the DIFC style guide.', 'Style guide §9'),
('d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'difc-banned-word-revolutionise',  'forbidden_term', 'revolutionise',  'error', 'Banned word per the DIFC style guide.', 'Style guide §9'),
('d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'difc-banned-word-transformative', 'forbidden_term', 'transformative', 'error', 'Banned word per the DIFC style guide.', 'Style guide §9'),
('d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'difc-banned-word-unprecedented',  'forbidden_term', 'unprecedented',  'error', 'Banned word per the DIFC style guide.', 'Style guide §9'),

-- Banned abbreviations (§4) — always use the full event name
('d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'difc-banned-abbr-dffw', 'forbidden_term', 'DFFW', 'error', 'Do not abbreviate — use the full event name.', 'Style guide §4'),
('d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'difc-banned-abbr-fsf',  'forbidden_term', 'FSF',  'error', 'Do not abbreviate — use the full event name.', 'Style guide §4'),
('d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'difc-banned-abbr-fiff', 'forbidden_term', 'FIFF', 'error', 'Do not abbreviate — use the full event name.', 'Style guide §4'),
('d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'difc-banned-abbr-ftf',  'forbidden_term', 'FTF',  'error', 'Do not abbreviate — use the full event name.', 'Style guide §4'),
('d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'difc-banned-abbr-dfws', 'forbidden_term', 'DFWS', 'error', 'Do not abbreviate — use the full event name.', 'Style guide §4'),

-- Punctuation / phrasing (§7)
('d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'difc-em-dash',            'forbidden_pattern', '—',                     'warning', 'Em dash used — check the style guide''s punctuation rules.', 'Style guide §7'),
('d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'difc-the-difc',           'forbidden_pattern', '\bthe DIFC\b',          'error',   '"the DIFC" — DIFC is a proper noun, do not precede it with an article.', 'Style guide §7'),
('d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'difc-lowercase-fintech',  'forbidden_pattern', '\bfintech\b',           'error',   'Lowercase "fintech" — must be written "FinTech".', 'Style guide §7'),
('d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'difc-sentence-being',     'forbidden_pattern', '(^|\.\s)Being\b',       'warning', 'Sentence starts with "Being" — check the style guide''s phrasing rules.', 'Style guide §7'),
('d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'difc-ampersand',          'forbidden_pattern', '&',                     'warning', 'Ampersand used — only allowed inside an official name; spell out "and" otherwise.', 'Style guide §7'),

-- Number/currency/date formatting (§8)
('d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'difc-us-currency-style',    'forbidden_pattern', 'US\$|\d+\s+(billion|million)',                                          'error',   'US-style currency formatting — check the style guide''s currency rules.', 'Style guide §8'),
('d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'difc-abbreviated-month',    'forbidden_pattern', '\d{1,2}\s*-\s*\d{1,2}\s+(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b', 'error',   'Abbreviated month in a date range — spell out the month.', 'Style guide §8'),
('d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'difc-standalone-digit',     'forbidden_pattern', '\b[0-9]\b',                                                              'warning', 'Single digit under 10 written as a numeral — spell it out unless it''s a unit or part of a range. (This rule can''t tell the difference deterministically — check before acting on it.)', 'Style guide §8'),

-- Required exact forms (Reference, style section) — see the file header
-- comment above for what's genuinely missing here.
('d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'difc-theme-string', 'required_format',
  '{"trigger":"Connecting Markets|Transforming Economies","allowed":["Connecting Markets, Transforming Economies."]}',
  'error', 'Theme/tagline mentioned but not in the exact approved form ("Connecting Markets, Transforming Economies."). A two-line form may also be approved — this isn''t configured yet, verify against the source.', 'Reference, style section'),
('d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'difc-protocol-string', 'required_format',
  '{"trigger":"Sheikh Maktoum","allowed":[]}',
  'error', '"Sheikh Maktoum" mentioned — the exact approved protocol title is not yet configured in this system. Verify the full title against the approved reference before using; do not restate it from memory.', 'Reference, style section'),

-- Proximity (Reference, style section) — the most valuable and least
-- obvious rule: "Join 10,000+ business leaders..." has no banned word and
-- reads fine, but breaches the rule against stating a scale figure in a
-- forward-looking/promotional frame.
('d4c7c680-2618-4159-bfa6-5bcd0701ca22', 'difc-scale-figure-future-tense', 'proximity',
  '{"a":"(10,000|1,000|300|200|120)\\+","b":"\\b(join|meet|connect with|be part of|2026)\\b","maxDistance":60}',
  'error', 'A scale figure appears near forward-looking/promotional language — check whether this states an unapproved attendance forecast or claim.', 'Reference, style section');
