-- AI InfraNext | Indonesia 2026 — validation rule seed (2026-09-16).
--
-- Derived from the approved Top-line Messaging document v1.0, section by
-- section. Data only — no schema change, no application code touched.
--
-- Event id 0cbcb583-b023-477d-b4c1-264e85d20e57 = "AI InfraNext Indonesia 2026".
-- Resolved by id rather than name: the first run of this file matched on
-- 'AI InfraNext | Indonesia 2026' (the branded lockup, with the pipe) and
-- inserted zero rows, because the events table stores the name without it.
-- Check the final count before assuming this worked.
--
-- Re-runnable: the DELETE below removes only the rule_keys this file owns,
-- scoped to this event, so running it twice is safe and editing a pattern
-- here then re-running is the correct way to amend one.
--
-- review_status defaults to 'accepted' and is_active defaults on (see
-- reference_documents_suggested_rules_migration.sql), matching the DFFW seed
-- pattern — these are active immediately on insert.
--
-- TWO THINGS DELIBERATELY NOT SEEDED, and why:
--   1. Company names in external copy. The editorial exception (Section 13)
--      permits naming companies in articles but not in page copy or
--      promotional assets. No regex can tell one from the other, so any rule
--      here would fire constantly on legitimate editorial. This stays a
--      human sponsorship-pipeline screen before publication.
--   2. "Keep copy short, direct and specific." Real guidance, not
--      pattern-matchable. A rule set with frequent false positives gets
--      ignored wholesale, which is worse than a smaller accurate one.

BEGIN;

DELETE FROM event_validation_rules
WHERE event_id = '0cbcb583-b023-477d-b4c1-264e85d20e57'
  AND rule_key LIKE 'ain-%';

INSERT INTO event_validation_rules (event_id, rule_key, rule_type, pattern, severity, message, source_clause)
SELECT e.id, v.rule_key, v.rule_type, v.pattern, v.severity, v.message, v.source_clause
FROM events e
CROSS JOIN (VALUES

-- ---------------------------------------------------------------------------
-- Section 3 — Brand architecture, naming and usage
-- Capitalisation rules MUST be forbidden_pattern, never forbidden_term:
-- forbidden_term matches case-insensitively and would flag the CORRECT
-- spelling "AI InfraNext" on every page.
-- ---------------------------------------------------------------------------
('ain-brand-cap-lower',        'forbidden_pattern', 'AI Infranext',                    'error',   'Wrong capitalisation. Use "AI InfraNext" with an internal capital N.', 'Section 3 / Section 13'),
('ain-brand-lowercase-l',      'forbidden_pattern', '\bAl InfraNext\b',                'error',   '"Al InfraNext" uses a lowercase L. The correct name is "AI InfraNext" — AI as in artificial intelligence.', 'Section 3 / Section 13'),
('ain-brand-cap-two-words',    'forbidden_pattern', 'AI Infra Next',                   'error',   '"AI InfraNext" is a closed-up compound. No space before "Next".', 'Section 3 / Section 13'),
('ain-brand-cap-allcaps',      'forbidden_pattern', 'AI INFRANEXT',                    'error',   'Do not set the event name in all caps. Use "AI InfraNext".', 'Section 3 / Section 13'),
('ain-brand-standalone',       'forbidden_pattern', '(?<!AI )(?<!#AI)InfraNext\b',     'error',   'Never use "InfraNext" alone. Always "AI InfraNext".', 'Section 3 / Section 13'),
('ain-brand-abbreviation',     'forbidden_pattern', '\b(AIIN|AIN)\b',                  'error',   'Do not abbreviate the event name. Write "AI InfraNext" in full.', 'Section 3'),
('ain-brand-article',          'forbidden_pattern', '[Tt]he AI InfraNext',             'error',   'Do not place "the" before AI InfraNext.', 'Section 3 / Section 13'),

-- ---------------------------------------------------------------------------
-- Section 5 — Attendance model
-- ---------------------------------------------------------------------------
('ain-invitation-only',        'forbidden_term',    'by invitation only',              'error',   '"By invitation only" must never be used for this event. The invitation framing always travels with the audience it applies to.', 'Section 5'),

-- ---------------------------------------------------------------------------
-- Section 4 — Approved figures and usage
-- ---------------------------------------------------------------------------
('ain-fig-approx-500',         'forbidden_pattern', '\b(around|approximately|about|nearly|over) 500\b', 'error', 'The delegate figure is "500+" exactly. Do not vary the construction.', 'Section 4'),
('ain-fig-range-500',          'forbidden_pattern', '\b500\s*[-–—]\s*\d{3}\b',         'error',   'The delegate figure is "500+" exactly. Do not express it as a range.', 'Section 4'),
('ain-fig-speakers-flat',      'forbidden_pattern', '\b\d{2}\s+speakers\b',            'error',   'The speaker figure is "40+" exactly. Do not state a flat or alternative number.', 'Section 4'),
('ain-fig-roi-phrase',         'forbidden_term',    'return on investment',            'warning', 'First edition with no post-event data. Return-on-investment claims are not supported.', 'Section 13'),
('ain-fig-roi-abbrev',         'forbidden_pattern', '\bROI\b',                         'warning', 'First edition with no post-event data. Return-on-investment claims are not supported.', 'Section 13'),

-- ---------------------------------------------------------------------------
-- Section 7 — Capacity labelling (mandatory rule)
-- Document-wide check: if any MW figure appears and none of the six status
-- words appears anywhere, every figure is flagged. It cannot verify that each
-- individual figure carries its own label — no regex can — but it catches
-- copy that quotes capacity with no labelling at all.
-- ---------------------------------------------------------------------------
('ain-capacity-status-label',  'required_format',   '{"trigger":"\d{1,3}(,\d{3})?MW","allowed":["operational","secured","contracted","announced","planned","targeted"]}', 'error', 'Every capacity figure must carry a status label: operational, secured, contracted, announced, planned or targeted.', 'Section 7'),

-- ---------------------------------------------------------------------------
-- Section 8 — Scope rules
-- ---------------------------------------------------------------------------
('ain-scope-national-jakarta', 'proximity',         '{"a":"274MW","b":"1,699MW","maxDistance":250}', 'warning', '274MW is national operational capacity; 1,699MW is the Jakarta pipeline only. State both scopes explicitly — never present them as like-for-like.', 'Section 8'),
('ain-scope-savills-komdigi',  'proximity',         '{"a":"274MW","b":"(535\.5MW|683)","maxDistance":300}', 'warning', 'Savills and Komdigi measure capacity on different bases. Never set one against the other or imply either is wrong. State each scope and source.', 'Section 8'),

-- ---------------------------------------------------------------------------
-- Section 13 — World AI Show lineage
-- ---------------------------------------------------------------------------
('ain-lineage-spinoff',        'forbidden_pattern', 'spin-?off',                       'error',   'AI InfraNext is never described as a World AI Show spin-off. It is a separate platform from the same organiser.', 'Section 13'),
('ain-lineage-part-of',        'proximity',         '{"a":"AI InfraNext","b":"part of World AI Show","maxDistance":150}', 'error', 'AI InfraNext is not part of World AI Show. Describe it as organised by Trescon, the team behind World AI Show.', 'Section 13'),
('ain-lineage-track',          'proximity',         '{"a":"AI InfraNext","b":"World AI Show track","maxDistance":150}', 'error', 'AI InfraNext is not a World AI Show track.', 'Section 13'),

-- ---------------------------------------------------------------------------
-- Section 13 — Sovereignty guardrail
-- ---------------------------------------------------------------------------
('ain-sov-self-sufficient',    'forbidden_term',    'self-sufficient',                 'warning', 'Avoid framing that implies Indonesia will become technologically self-sufficient. The correct framing is Indonesia and the global ecosystem building trusted national capability together.', 'Section 13'),
('ain-sov-versus',             'proximity',         '{"a":"Indonesia","b":"versus (global )?hyperscalers","maxDistance":120}', 'error', 'Do not position the summit as Indonesia versus global hyperscalers.', 'Section 13'),

-- ---------------------------------------------------------------------------
-- Section 13 — Language and mechanics
-- ---------------------------------------------------------------------------
('ain-style-em-dash',          'forbidden_pattern', '—',                               'error',   'Use the en dash (–) with spaces, never the em dash.', 'Section 13'),
('ain-style-date-hyphen',      'forbidden_pattern', '\b\d{1,2}-\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b', 'error', 'Date ranges use an en dash: "24–25 November 2026", not a hyphen.', 'Section 13'),
('ain-style-currency-symbol',  'forbidden_pattern', '\$\s?\d',                         'error',   'Write "USD 4.5 billion", not "$4.5bn".', 'Section 13'),
('ain-style-unit-spacing',     'forbidden_pattern', '\d\s+(MW|GW)\b',                  'error',   'Capacity units are written closed up: "274MW", "1.5GW". No space.', 'Section 13'),
('ain-style-us-organize',      'forbidden_term',    'organize',                        'error',   'UK English. Use "organise".', 'Section 13'),
('ain-style-us-organization',  'forbidden_term',    'organization',                    'error',   'UK English. Use "organisation".', 'Section 13'),
('ain-style-us-center',        'forbidden_term',    'center',                          'error',   'UK English. Use "centre".', 'Section 13'),
('ain-style-us-prioritize',    'forbidden_term',    'prioritize',                      'error',   'UK English. Use "prioritise".', 'Section 13'),
('ain-style-us-analyze',       'forbidden_term',    'analyze',                         'error',   'UK English. Use "analyse".', 'Section 13'),
('ain-style-us-program',       'forbidden_term',    'program',                         'warning', 'UK English. Use "programme" — unless referring to computer software.', 'Section 13'),
('ain-style-ampersand',        'forbidden_pattern', '\s&\s',                           'warning', 'Avoid the ampersand in body copy; write "and". Retained only inside official pillar titles.', 'Section 13'),

-- ---------------------------------------------------------------------------
-- Section 13 — Institutional names
-- ---------------------------------------------------------------------------
('ain-inst-kominfo',           'forbidden_term',    'Kominfo',                         'error',   'Use "Ministry of Communication and Digital Affairs (Komdigi)".', 'Section 13'),
('ain-inst-informatics',       'forbidden_term',    'Ministry of Communications and Informatics', 'error', 'Use "Ministry of Communication and Digital Affairs (Komdigi)".', 'Section 13'),
('ain-inst-pres-decree',       'forbidden_term',    'Presidential Decree',             'error',   'Use "Presidential Regulation (Perpres)".', 'Section 13'),
('ain-inst-ai-act',            'forbidden_pattern', '\bAI Act\b',                      'error',   'Indonesia has no AI Act. Use "Presidential Regulation (Perpres)", and label drafts as drafts.', 'Section 13'),
('ain-inst-ai-law',            'forbidden_pattern', '\bAI Law\b',                      'error',   'Indonesia has no AI Law. Use "Presidential Regulation (Perpres)".', 'Section 13'),
('ain-inst-pln-full',          'forbidden_term',    'Perusahaan Listrik Negara',       'error',   'Use "PLN" in English copy.', 'Section 13'),
('ain-inst-roadmap-2030',      'forbidden_term',    'AI Roadmap 2030',                 'error',   'Use "National AI Roadmap (Peta Jalan Kecerdasan Artifisial Nasional)".', 'Section 13'),

-- ---------------------------------------------------------------------------
-- Section 13 — What must not appear
-- The Business Pass price of USD 499 is deliberately ABSENT from these
-- patterns: it is a delegate price and is permitted in public copy.
-- ---------------------------------------------------------------------------
('ain-price-sponsor-tiers',    'forbidden_pattern', 'USD\s*(30,999|22,999|15,999|10,999|6,999|14,999|3,999)', 'error', 'Sponsorship pricing appears only in the rate card, proposals and the sponsor infopack. Never on the website, on social, or in any freely downloadable asset.', 'Section 13'),
('ain-price-brand-visibility', 'forbidden_pattern', 'USD\s*(12,000|10,000|8,000)',     'error',   'Brand visibility partnership pricing appears only in assets issued directly by the commercial team to a named recipient.', 'Section 13'),
('ain-venue-placeholder',      'forbidden_pattern', '[Vv]enue[:\s]+(TBC|TBA|to be confirmed|to be announced)', 'error', 'No venue placeholder line appears in external material. State "Jakarta, Indonesia" only until the venue is confirmed.', 'Section 4 / Section 15'),

-- ---------------------------------------------------------------------------
-- Section 15 — Editorial and articles
-- ---------------------------------------------------------------------------
('ain-editorial-src-link',     'forbidden_pattern', '\[(Komdigi|Cushman|Savills|BMI|EY|CoreWeave|Digital Edge|Research and Markets)[^\]]*\]\(', 'error', 'Cite sources as plain text, never as hyperlinks.', 'Section 13 / Section 15')

) AS v(rule_key, rule_type, pattern, severity, message, source_clause)
WHERE e.id = '0cbcb583-b023-477d-b4c1-264e85d20e57';

COMMIT;

-- Verification. Expect 43. If this returns 0, the event id above is wrong —
-- check it with: SELECT id, name FROM events WHERE name ILIKE '%infranext%';
SELECT count(*) AS rules_seeded
FROM event_validation_rules
WHERE event_id = '0cbcb583-b023-477d-b4c1-264e85d20e57'
  AND rule_key LIKE 'ain-%';
