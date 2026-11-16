-- Reference Documents, Stage 3 — Bengaluru Skill Summit 2026 rule set (2026-09-25).
-- Event: Bengaluru Skill Summit 2026 (27edfe37-ab45-4656-922d-0503012c75a7), managed event, no umbrella.
-- Derived from the BSS 2026 messaging document as corrected by Trescon on
-- 25 Sep 2026 (tracked-changes copy in Working_Files/BSS): its "What must not
-- be written" list and the "Writing standards" subsection added to §11.
--
-- Severity: errors are clear breaches of an explicit rule; warnings need a
-- human look because a regex can't tell the legitimate case apart
-- (ampersands inside official names, emojis, money formats, "Being", times).
--
-- Tested 2026-09-25 in Node (same RegExp engine as validate.ts) against a
-- compliant sample speaker post (zero findings) and a deliberately
-- non-compliant one (every rule fired). Notes:
-- * bss-emoji matches surrogate pairs because validate.ts compiles
--   forbidden_pattern with the 'g' flag only (no 'u'); 📍 and 📅 are
--   excluded by lookahead. Flag emojis (🇮🇳) trip it twice, as intended.
-- * bss-minister-missing-dr uses a lookbehind (supported in Node 10+).
-- * The ampersand warning also fires inside "Karnataka Vocational Training
--   & Skill Development Corporation", an official name. Expected; same
--   behaviour as difc-ampersand.
--
-- Re-runnable: deletes this event's bss-* rules first. Rules accepted from
-- the messaging upload's suggested-rules flow use other keys and are kept.

DELETE FROM event_validation_rules
 WHERE event_id = '27edfe37-ab45-4656-922d-0503012c75a7' AND rule_key LIKE 'bss-%';

INSERT INTO event_validation_rules (event_id, rule_key, rule_type, pattern, severity, message, source_clause) VALUES
('27edfe37-ab45-4656-922d-0503012c75a7', 'bss-em-dash', 'forbidden_pattern', '—', 'error', 'Em dash. Use a comma, brackets, or a spaced en dash ( – ).', 'Writing standards: language and punctuation'),
('27edfe37-ab45-4656-922d-0503012c75a7', 'bss-avoid-unlock', 'forbidden_term', 'unlock', 'error', 'Word to avoid per the messaging doc.', 'Writing standards: words to avoid'),
('27edfe37-ab45-4656-922d-0503012c75a7', 'bss-avoid-seamless', 'forbidden_term', 'seamless', 'error', 'Word to avoid per the messaging doc.', 'Writing standards: words to avoid'),
('27edfe37-ab45-4656-922d-0503012c75a7', 'bss-avoid-world-class', 'forbidden_term', 'world-class', 'error', 'Word to avoid per the messaging doc.', 'Writing standards: words to avoid'),
('27edfe37-ab45-4656-922d-0503012c75a7', 'bss-avoid-and-beyond', 'forbidden_term', 'and beyond', 'error', 'Phrase to avoid per the messaging doc.', 'Writing standards: words to avoid'),
('27edfe37-ab45-4656-922d-0503012c75a7', 'bss-avoid-game-changing', 'forbidden_term', 'game-changing', 'error', 'Word to avoid per the messaging doc.', 'Writing standards: words to avoid'),
('27edfe37-ab45-4656-922d-0503012c75a7', 'bss-avoid-revolutionise', 'forbidden_term', 'revolutionise', 'error', 'Word to avoid per the messaging doc.', 'Writing standards: words to avoid'),
('27edfe37-ab45-4656-922d-0503012c75a7', 'bss-avoid-transformative', 'forbidden_term', 'transformative', 'error', 'Word to avoid per the messaging doc.', 'Writing standards: words to avoid'),
('27edfe37-ab45-4656-922d-0503012c75a7', 'bss-avoid-unprecedented', 'forbidden_term', 'unprecedented', 'error', 'Word to avoid per the messaging doc.', 'Writing standards: words to avoid'),
('27edfe37-ab45-4656-922d-0503012c75a7', 'bss-trescon-global', 'forbidden_term', 'Trescon Global', 'error', 'Refer to the company only as "Trescon".', 'What must not be written'),
('27edfe37-ab45-4656-922d-0503012c75a7', 'bss-event-name', 'forbidden_pattern', 'Bengaluru Skills Summit|Bangalore Skill Summit|\bBSS\b', 'error', 'Informal or incorrect event name. Use "Bengaluru Skill Summit" in full.', 'What must not be written'),
('27edfe37-ab45-4656-922d-0503012c75a7', 'bss-theme-string', 'required_format', '{"trigger":"Workforce 2030:","allowed":["Workforce 2030: Scale, Systems, Synergy"]}', 'error', 'Theme not in its exact approved form.', 'Section 3: event details'),
('27edfe37-ab45-4656-922d-0503012c75a7', 'bss-minister-old-spelling', 'forbidden_pattern', 'Sharanprakash', 'error', 'Old spelling. Use "Dr. Sharanaprakash Rudrappa Patil".', 'Leadership reference'),
('27edfe37-ab45-4656-922d-0503012c75a7', 'bss-minister-dr-shri', 'forbidden_pattern', 'Dr\.?\s*Shri\s+Sharan', 'error', '"Dr. Shri" double honorific. Use "Dr. Sharanaprakash Rudrappa Patil".', 'Leadership reference'),
('27edfe37-ab45-4656-922d-0503012c75a7', 'bss-minister-missing-dr', 'forbidden_pattern', '(?<!Dr\. )Sharanaprakash', 'error', 'The Minister''s name must be preceded by "Dr.".', 'Leadership reference'),
('27edfe37-ab45-4656-922d-0503012c75a7', 'bss-shortlink', 'forbidden_pattern', '\b(lnkd\.in|hubs\.li|bit\.ly)/', 'error', 'Shortened link. Use the full canonical URL.', 'Writing standards: links'),
('27edfe37-ab45-4656-922d-0503012c75a7', 'bss-old-registration-url', 'forbidden_pattern', 'general-enquiry', 'error', 'Old registration link. Use https://bengaluruskillsummit.com/get-involved/', 'Writing standards: calls to action'),
('27edfe37-ab45-4656-922d-0503012c75a7', 'bss-unapproved-hashtag', 'forbidden_pattern', '#(?!(?:BengaluruSkillSummit|Workforce2030|SkillForFuture|FutureOfWork|SkillingIndia|GlobalTalent|WorkforceTransformation)(?![A-Za-z0-9_]))[A-Za-z][A-Za-z0-9_]*', 'error', 'Hashtag not on the approved list.', 'Hashtags'),
('27edfe37-ab45-4656-922d-0503012c75a7', 'bss-old-footfall-figure', 'forbidden_pattern', '\b4,?500\b', 'error', '4,500 is not an approved figure. Footfall is 6,500+.', 'Section 6 figures'),
('27edfe37-ab45-4656-922d-0503012c75a7', 'bss-relabelled-footfall', 'forbidden_pattern', '6,?500\+?\s+(delegates|attendees|participants|leaders|visitors|stakeholders)', 'error', 'Footfall figure relabelled. Use "6,500+ footfall".', 'Writing standards: figures'),
('27edfe37-ab45-4656-922d-0503012c75a7', 'bss-superseded-names', 'forbidden_pattern', 'Innovation Hub|COE Pavilion|Centers of Excellence|Precursor Programs', 'error', 'Superseded name. Use Innovation Stage, CoE Pavilion, Centres of Excellence, Precursor Programmes.', 'Section 8'),
('27edfe37-ab45-4656-922d-0503012c75a7', 'bss-date-ordinal', 'forbidden_pattern', '\b\d{1,2}(st|nd|rd|th)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b', 'error', 'Ordinal date. Write "3 November 2026".', 'Writing standards: dates'),
('27edfe37-ab45-4656-922d-0503012c75a7', 'bss-date-us-order', 'forbidden_pattern', '\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\b', 'error', 'Month before day. Write "3 November 2026".', 'Writing standards: dates'),
('27edfe37-ab45-4656-922d-0503012c75a7', 'bss-date-abbreviated-month', 'forbidden_pattern', '\b\d{1,2}\s+(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\b|\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\.?\s+\d', 'error', 'Abbreviated month. Spell out the month.', 'Writing standards: dates'),
('27edfe37-ab45-4656-922d-0503012c75a7', 'bss-date-range-dash', 'forbidden_pattern', '\b\d{1,2}(\s*-\s*|\s+–\s+)\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b', 'error', 'Date range must use a closed en dash: 3–5 November 2026.', 'Writing standards: dates'),
('27edfe37-ab45-4656-922d-0503012c75a7', 'bss-emoji', 'forbidden_pattern', '(?!\uD83D\uDCCD|\uD83D\uDCC5)[\uD83C-\uD83E][\uDC00-\uDFFF]|[\u2600-\u27BF]', 'warning', 'Emoji other than 📍 (venue) or 📅 (date).', 'Writing standards: emojis'),
('27edfe37-ab45-4656-922d-0503012c75a7', 'bss-ampersand', 'forbidden_pattern', '&', 'warning', 'Ampersand. Only allowed inside an official name; otherwise spell out "and".', 'Writing standards: language and punctuation'),
('27edfe37-ab45-4656-922d-0503012c75a7', 'bss-money-format', 'forbidden_pattern', '\bINR\b|\bRs\.?\s?\d|\b\d+(\.\d+)?\s?(million|billion|mn|bn)\b', 'warning', 'Money not in Government of Karnataka style. Use ₹ with lakh or crore.', 'Writing standards: money'),
('27edfe37-ab45-4656-922d-0503012c75a7', 'bss-sentence-being', 'forbidden_pattern', '(^|[.!?]\s+)Being\b', 'warning', 'Sentence starts with "Being".', 'Writing standards: language and punctuation'),
('27edfe37-ab45-4656-922d-0503012c75a7', 'bss-time-format', 'forbidden_pattern', '\b\d{1,2}([.:]\d{2})?\s?(AM|PM|A\.M\.|P\.M\.|a\.m\.|p\.m\.)|\b\d{1,2}([.:]\d{2})?\s(am|pm)\b', 'warning', 'Time format. Write 10am or 5.30pm.', 'Writing standards: times');
