-- Site Operations module, v1.3 addendum — multi-account Google connection.
-- Replaces the Phase 2 singleton google_org_connection with a named,
-- multi-row google_connections table (one row per Google identity), and
-- lets each site_connections row record which one it came from.
-- See docs/EventPilot-SiteOps-Build-Spec-v1.1.md, Changelog v1.2 -> v1.3.

alter table google_org_connection rename to google_connections;

alter table google_connections
  add constraint google_connections_email_unique unique (google_account_email);

alter table site_connections
  add column if not exists google_connection_id uuid references google_connections(id);
