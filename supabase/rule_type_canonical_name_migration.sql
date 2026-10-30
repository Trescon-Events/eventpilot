-- doc-rule-linkage-and-canonical-names.md, Part B — allow the new 'canonical_name' rule type.
-- Additive: nothing uses it until someone creates a rule of that type from the Rules screen; existing rules are untouched.
ALTER TABLE event_validation_rules DROP CONSTRAINT IF EXISTS event_validation_rules_rule_type_check;
ALTER TABLE event_validation_rules ADD CONSTRAINT event_validation_rules_rule_type_check
  CHECK (rule_type IN ('forbidden_term', 'forbidden_pattern', 'required_format', 'proximity', 'canonical_name'));
