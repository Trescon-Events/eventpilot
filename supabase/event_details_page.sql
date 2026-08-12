-- ============================================================
-- EVENT DETAILS PAGE (2026-08-11) — unifies the "Public-Facing Details"
-- fields added earlier today with the Topline Messaging Doc's own
-- extraction pipeline, per Madhu: "the messaging doc... is the initial
-- doc from which the system derives everything about the event."
--
-- public_page_url is per (event, form_type) — the officially branded page
-- hosting that form's embedded HubSpot form (e.g. worldaishow.com/malaysia/
-- speaker-onboarding), preferred by invite emails over EventPilot's own
-- hosted /public/forms/... page when set.
--
-- event_details_field_changes is a lightweight change log for the
-- "Common/Default" event-detail fields (public_name, public_dates_display,
-- public_venue_display, website_url, registration_url, event_hashtag,
-- social_*, venue_map_url, and event_hubspot_forms.public_page_url) —
-- both AI-extraction writes (on messaging-doc approval) and later manual
-- inline edits log here. Deliberately NOT full snapshot versioning (that's
-- what the Messaging Doc's own version column already does at the whole-
-- doc level) — just enough to answer "who changed this field, and what
-- was it before" for data that's "frequently referred to, and fetched in
-- different places" (Madhu, 2026-08-11), mirroring the spirit of the
-- existing event_messaging_doc_edits audit table but for typed fields.
-- ============================================================

ALTER TABLE event_hubspot_forms ADD COLUMN IF NOT EXISTS public_page_url TEXT;

CREATE TABLE IF NOT EXISTS event_details_field_changes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  field_key     TEXT NOT NULL,       -- e.g. 'public_name', 'social_linkedin', 'hubspot_form:speaker:public_page_url'
  old_value     TEXT,
  new_value     TEXT,
  change_source TEXT NOT NULL CHECK (change_source IN ('manual', 'ai_extraction')),
  changed_by    UUID REFERENCES staff_members(id) ON DELETE SET NULL,  -- who saved it — for ai_extraction this is whoever clicked Approve, not the model
  changed_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_details_field_changes_event ON event_details_field_changes(event_id, changed_at DESC);
